/**
 * videoEnhancement.ts — Real-time AI video enhancement + quality analysis for the
 * ZenAssess proctoring pipeline.
 *
 *   Camera → Frame capture → [THIS MODULE: analyze quality + enhance] → detectors
 *
 * The problem this solves: low-end laptops produce dark, noisy, soft 240p/360p/480p
 * webcam frames. Feeding those raw to face-api / COCO-SSD / MediaPipe wrecks
 * detection accuracy. Before this module existed, ZenAssess only applied a COSMETIC
 * CSS `filter` to the *displayed* PIP — the detectors still ran on the raw frame.
 *
 * This module runs a genuine per-frame pixel pipeline on an offscreen canvas and
 * returns that enhanced canvas as the detector input. The displayed <video> is left
 * untouched, so the candidate still sees a smooth native feed (spec: "enhanced video
 * used for inference while the displayed video remains smooth").
 *
 * Everything is adaptive and CPU-budgeted: quality is measured on a tiny 192×144
 * analysis canvas (~a few thousand px), the enhancement runs on a width-capped work
 * canvas (default 640px), and expensive passes are SKIPPED when the frame is already
 * clean. On an already-good 720p feed the pipeline degenerates to a single LUT pass.
 *
 * Pipeline stages implemented (all real, no placeholders):
 *   1. Quality analysis  — brightness, contrast, Laplacian-variance blur, Immerkær
 *                          noise sigma, backlight, low-light, histogram percentiles.
 *   2. Gray-world white balance (per-channel gain).
 *   3. Auto exposure / brightness + auto gamma (tone LUT).
 *   4. Robust contrast stretch (percentile-based, folded into the LUT).
 *   5. Edge-preserving denoise + local-contrast (CLAHE-style) + unsharp mask,
 *      combined into one blur-buffer pass; skipped when not needed.
 *   6. Optional face-ROI priority boost (extra detail + lift inside the face box).
 */

// ─── Public types ────────────────────────────────────────────────────────────

export type BrightnessLabel = 'too_dark' | 'dark' | 'good' | 'bright' | 'too_bright'
export type BlurLabel = 'none' | 'low' | 'medium' | 'high'
export type NoiseLabel = 'low' | 'medium' | 'high'
export type ContrastLabel = 'low' | 'good' | 'high'
export type EnhanceMode = 'off' | 'normal' | 'low-light' | 'sharpen' | 'denoise' | 'boost'

export interface QualityMetrics {
  brightness: number        // 0-255 mean luma
  contrast: number          // luma standard deviation
  blurVariance: number      // Laplacian variance — HIGHER = sharper
  noiseSigma: number        // estimated sensor noise (Immerkær)
  brightnessLabel: BrightnessLabel
  blurLabel: BlurLabel
  noiseLabel: NoiseLabel
  contrastLabel: ContrastLabel
  lowLight: boolean
  backlight: boolean
  score: number             // 0-100 overall camera quality
  fps: number               // detection FPS (filled in by the engine)
  width: number             // native capture width
  height: number            // native capture height
}

export interface EnhanceState {
  active: boolean           // did any real enhancement run this frame?
  mode: EnhanceMode
  gamma: number
  brightnessGain: number
  wbGain: { r: number; g: number; b: number }
  sharpen: number
  denoise: number
  localContrast: number
  faceBoost: boolean
}

/** Face ROI, expressed in ENHANCED work-canvas pixels (same space detection runs in). */
export interface FocusBox { x: number; y: number; width: number; height: number }

export interface ProcessResult {
  canvas: HTMLCanvasElement // enhanced frame — feed THIS to the detectors
  metrics: QualityMetrics
  state: EnhanceState
}

export interface VideoEnhancerOptions {
  maxWidth?: number         // cap the work/inference canvas width (default 640)
  analyzeIntervalMs?: number// how often to re-measure quality (default 250ms)
  enabled?: boolean
}

// ─── Defaults / tuning constants (calibrated for consumer webcams) ─────────────

const A_W = 192, A_H = 144            // analysis canvas — small & cheap
const BRIGHT_TARGET = 125             // auto-exposure target mean luma
const DEFAULT_MAX_WIDTH = 640

const NEUTRAL_METRICS: QualityMetrics = {
  brightness: 125, contrast: 55, blurVariance: 200, noiseSigma: 2,
  brightnessLabel: 'good', blurLabel: 'none', noiseLabel: 'low', contrastLabel: 'good',
  lowLight: false, backlight: false, score: 100, fps: 0, width: 0, height: 0,
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ─── The enhancer ──────────────────────────────────────────────────────────────

export class VideoEnhancer {
  private maxWidth: number
  private analyzeIntervalMs: number
  enabled: boolean

  // Analysis canvas (tiny) — quality metrics only.
  private aCanvas: HTMLCanvasElement | null = null
  private aCtx: CanvasRenderingContext2D | null = null
  // Work canvas — the enhanced frame handed to the detectors.
  private wCanvas: HTMLCanvasElement | null = null
  private wCtx: CanvasRenderingContext2D | null = null

  private metrics: QualityMetrics = { ...NEUTRAL_METRICS }
  private state: EnhanceState = {
    active: false, mode: 'off', gamma: 1, brightnessGain: 1,
    wbGain: { r: 1, g: 1, b: 1 }, sharpen: 0, denoise: 0, localContrast: 1, faceBoost: false,
  }
  private lastAnalyze = 0

  // Reusable per-channel tone LUTs (avoid per-frame allocation).
  private lutR = new Uint8ClampedArray(256)
  private lutG = new Uint8ClampedArray(256)
  private lutB = new Uint8ClampedArray(256)
  private lutDirty = true

  // Reusable blur scratch buffers (sized lazily to the work canvas).
  private blurBuf: Float32Array | null = null
  private tmpBuf: Float32Array | null = null
  private bufLen = 0

  constructor(opts: VideoEnhancerOptions = {}) {
    this.maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH
    this.analyzeIntervalMs = opts.analyzeIntervalMs ?? 250
    this.enabled = opts.enabled ?? true
  }

  getMetrics(): QualityMetrics { return this.metrics }
  getState(): EnhanceState { return this.state }
  setEnabled(on: boolean) { this.enabled = on }
  setFps(fps: number) { this.metrics.fps = fps }

  private ensureCanvases() {
    if (!this.aCanvas) {
      this.aCanvas = document.createElement('canvas')
      this.aCanvas.width = A_W; this.aCanvas.height = A_H
      this.aCtx = this.aCanvas.getContext('2d', { willReadFrequently: true })
    }
    if (!this.wCanvas) {
      this.wCanvas = document.createElement('canvas')
      this.wCtx = this.wCanvas.getContext('2d', { willReadFrequently: true })
    }
  }

  // ─── Main entry — called once per detection frame ────────────────────────────
  // Returns the enhanced canvas + latest quality. Analysis is throttled internally;
  // enhancement runs every call (cheaply). On any failure it returns the raw frame.
  process(video: HTMLVideoElement, focusBox?: FocusBox | null): ProcessResult {
    this.ensureCanvases()
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480

    // Size the work canvas to the capped width, preserving aspect ratio. Detection
    // coordinates then live in THIS space; the caller sizes the overlay to match.
    const scale = vw > this.maxWidth ? this.maxWidth / vw : 1
    const ww = Math.max(2, Math.round(vw * scale))
    const wh = Math.max(2, Math.round(vh * scale))
    const wc = this.wCanvas!, wctx = this.wCtx!
    if (wc.width !== ww || wc.height !== wh) { wc.width = ww; wc.height = wh }

    if (!this.enabled || video.readyState < 2) {
      try { wctx.drawImage(video, 0, 0, ww, wh) } catch { /* ignore */ }
      this.state.active = false; this.state.mode = 'off'
      return { canvas: wc, metrics: this.metrics, state: this.state }
    }

    try {
      // 1) Re-measure quality on the tiny analysis canvas (throttled).
      const now = performance.now()
      if (now - this.lastAnalyze >= this.analyzeIntervalMs) {
        this.lastAnalyze = now
        this.analyze(video, vw, vh)
        this.computeParams()
        this.buildTuneLuts()
      }

      // 2) Draw the current frame and run the pixel pipeline.
      wctx.drawImage(video, 0, 0, ww, wh)
      const img = wctx.getImageData(0, 0, ww, wh)
      this.applyTuneLut(img.data)                    // WB + exposure + gamma + stretch
      if (this.needsDetailPass()) this.applyDetailPass(img, focusBox)
      wctx.putImageData(img, 0, 0)
      return { canvas: wc, metrics: this.metrics, state: this.state }
    } catch {
      // Never let enhancement take down detection — fall back to the raw frame.
      try { wctx.drawImage(video, 0, 0, ww, wh) } catch { /* ignore */ }
      this.state.active = false; this.state.mode = 'off'
      return { canvas: wc, metrics: this.metrics, state: this.state }
    }
  }

  // ─── Stage 1: quality analysis ───────────────────────────────────────────────

  private hist = new Uint32Array(256)

  private analyze(video: HTMLVideoElement, vw: number, vh: number) {
    const ctx = this.aCtx!
    ctx.drawImage(video, 0, 0, A_W, A_H)
    const data = ctx.getImageData(0, 0, A_W, A_H).data
    const n = A_W * A_H

    // Luma, per-channel means, histogram, centre-vs-edge brightness (backlight).
    const luma = new Float32Array(n)
    this.hist.fill(0)
    let sum = 0, sumR = 0, sumG = 0, sumB = 0
    let centreSum = 0, centreCnt = 0, edgeSum = 0, edgeCnt = 0
    const cx0 = A_W * 0.3, cx1 = A_W * 0.7, cy0 = A_H * 0.3, cy1 = A_H * 0.7
    for (let y = 0; y < A_H; y++) {
      for (let x = 0; x < A_W; x++) {
        const i = (y * A_W + x) * 4
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const l = 0.299 * r + 0.587 * g + 0.114 * b
        const idx = y * A_W + x
        luma[idx] = l
        this.hist[l | 0]++
        sum += l; sumR += r; sumG += g; sumB += b
        if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) { centreSum += l; centreCnt++ }
        else if (x < 8 || x >= A_W - 8 || y < 8 || y >= A_H - 8) { edgeSum += l; edgeCnt++ }
      }
    }
    const mean = sum / n

    // Standard deviation (contrast).
    let varSum = 0
    for (let i = 0; i < n; i++) { const d = luma[i] - mean; varSum += d * d }
    const std = Math.sqrt(varSum / n)

    // Laplacian variance (blur) + Immerkær noise sigma — one interior convolution.
    // Blur kernel  [0 1 0; 1 -4 1; 0 1 0].  Noise kernel [1 -2 1; -2 4 -2; 1 -2 1].
    let lapSum = 0, lapSqSum = 0, lapCnt = 0, noiseAbs = 0
    for (let y = 1; y < A_H - 1; y++) {
      for (let x = 1; x < A_W - 1; x++) {
        const c = luma[y * A_W + x]
        const up = luma[(y - 1) * A_W + x], dn = luma[(y + 1) * A_W + x]
        const lf = luma[y * A_W + (x - 1)], rt = luma[y * A_W + (x + 1)]
        const ul = luma[(y - 1) * A_W + (x - 1)], ur = luma[(y - 1) * A_W + (x + 1)]
        const dl = luma[(y + 1) * A_W + (x - 1)], dr = luma[(y + 1) * A_W + (x + 1)]
        const lap = up + dn + lf + rt - 4 * c
        lapSum += lap; lapSqSum += lap * lap; lapCnt++
        noiseAbs += Math.abs(4 * c - 2 * (up + dn + lf + rt) + (ul + ur + dl + dr))
      }
    }
    const lapMean = lapSum / lapCnt
    const blurVar = lapSqSum / lapCnt - lapMean * lapMean
    const noiseSigma = (Math.sqrt(Math.PI / 2) * noiseAbs) / (6 * lapCnt)

    // Robust contrast-stretch percentiles (1% / 99%).
    let lowP = 0, highP = 255, acc = 0
    const p1 = n * 0.01, p99 = n * 0.99
    for (let v = 0; v < 256; v++) { acc += this.hist[v]; if (acc >= p1) { lowP = v; break } }
    acc = 0
    for (let v = 255; v >= 0; v--) { acc += this.hist[v]; if (acc >= n - p99) { highP = v; break } }
    if (highP - lowP < 8) { lowP = 0; highP = 255 } // degenerate → identity

    const centreMean = centreCnt ? centreSum / centreCnt : mean
    const edgeMean = edgeCnt ? edgeSum / edgeCnt : mean
    const backlight = edgeMean - centreMean > 45 && centreMean < 110
    const lowLight = mean < 80

    this.metrics = {
      brightness: mean, contrast: std, blurVariance: blurVar, noiseSigma,
      brightnessLabel: labelBrightness(mean),
      blurLabel: labelBlur(blurVar),
      noiseLabel: labelNoise(noiseSigma),
      contrastLabel: labelContrast(std),
      lowLight, backlight,
      score: qualityScore(mean, std, blurVar, noiseSigma, backlight),
      fps: this.metrics.fps, width: vw, height: vh,
    }
    this._lowP = lowP; this._highP = highP
    this._chMean = { r: sumR / n, g: sumG / n, b: sumB / n, l: mean }
  }

  private _lowP = 0
  private _highP = 255
  private _chMean = { r: 128, g: 128, b: 128, l: 128 }

  // ─── Stage 2-5: derive enhancement parameters from the metrics ───────────────

  private computeParams() {
    const m = this.metrics
    const { r, g, b, l } = this._chMean

    // Gray-world white balance — pull each channel mean toward the luma mean.
    const wbStrength = 0.6
    const gain = (cm: number) => clamp(lerp(1, cm > 1 ? l / cm : 1, wbStrength), 0.75, 1.4)
    const wbGain = { r: gain(r), g: gain(g), b: gain(b) }

    // Auto gamma toward the exposure target (brightens midtones without clipping).
    const meanNorm = clamp(l / 255, 0.02, 0.98)
    const targetNorm = BRIGHT_TARGET / 255
    let gamma = Math.log(targetNorm) / Math.log(meanNorm)
    gamma = clamp(gamma, 0.45, 1.6)
    // A gentle linear lift for extreme low light on top of gamma.
    const brightnessGain = m.lowLight ? clamp(BRIGHT_TARGET / Math.max(l, 20), 1, 2.2) : 1

    // How hard to stretch contrast, by how flat the frame is.
    const contrastStrength = m.contrastLabel === 'low' ? 0.75 : m.contrastLabel === 'high' ? 0.1 : 0.3

    // Detail pass: denoise strength (from noise), sharpen (from blur), local contrast.
    const denoise = m.noiseLabel === 'high' ? 0.5 : m.noiseLabel === 'medium' ? 0.28 : 0
    const sharpen = m.blurLabel === 'high' ? 1.0 : m.blurLabel === 'medium' ? 0.6 : m.blurLabel === 'low' ? 0.3 : 0.08
    const localContrast = 1 + (m.lowLight ? 0.32 : 0.16)

    let mode: EnhanceMode = 'normal'
    if (m.lowLight) mode = 'low-light'
    else if (m.noiseLabel === 'high') mode = 'denoise'
    else if (m.blurLabel === 'high' || m.blurLabel === 'medium') mode = 'sharpen'
    else if (m.backlight) mode = 'boost'

    this.state = {
      active: true, mode, gamma, brightnessGain, wbGain, sharpen, denoise, localContrast,
      faceBoost: false,
    }
    this._contrastStrength = contrastStrength
    this.lutDirty = true
  }

  private _contrastStrength = 0.3

  // Build per-channel LUTs folding WB gain → exposure/brightness → gamma → stretch.
  private buildTuneLuts() {
    if (!this.lutDirty) return
    const { gamma, brightnessGain, wbGain } = this.state
    const lowP = this._lowP, highP = this._highP, cs = this._contrastStrength
    const span = Math.max(1, highP - lowP)
    const tone = (v: number) => {
      let t = 255 * Math.pow(clamp(v / 255, 0, 1), gamma)   // gamma
      t *= brightnessGain                                    // linear lift
      const stretched = ((t - lowP) / span) * 255            // percentile stretch
      t = lerp(t, stretched, cs)
      return clamp(t, 0, 255)
    }
    for (let v = 0; v < 256; v++) {
      this.lutR[v] = tone(clamp(v * wbGain.r, 0, 255))
      this.lutG[v] = tone(clamp(v * wbGain.g, 0, 255))
      this.lutB[v] = tone(clamp(v * wbGain.b, 0, 255))
    }
    this.lutDirty = false
  }

  private applyTuneLut(d: Uint8ClampedArray) {
    const lR = this.lutR, lG = this.lutG, lB = this.lutB
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lR[d[i]]; d[i + 1] = lG[d[i + 1]]; d[i + 2] = lB[d[i + 2]]
    }
  }

  // ─── Stage 5-6: edge-preserving denoise + local contrast + unsharp + ROI boost ─

  private needsDetailPass(): boolean {
    const s = this.state
    return s.active && (s.sharpen >= 0.15 || s.denoise >= 0.05 || this.metrics.lowLight || this.metrics.backlight)
  }

  private ensureBufs(len: number) {
    if (this.bufLen !== len || !this.blurBuf) {
      this.blurBuf = new Float32Array(len)
      this.tmpBuf = new Float32Array(len)
      this.bufLen = len
    }
  }

  // One blur buffer drives denoise, CLAHE-style local contrast, and unsharp together:
  //   base   = lerp(orig, blur, denoise)          (pull toward blur = smooth noise)
  //   out    = blur + (base - blur) * k           (k>1 re-amplifies real detail)
  // With denoise=0 this is a textbook unsharp mask; with k=1 it is a pure blur.
  private applyDetailPass(img: ImageData, focusBox: FocusBox | null | undefined) {
    const { data, width: w, height: h } = img
    const len = w * h
    this.ensureBufs(len)
    const blur = this.blurBuf!, tmp = this.tmpBuf!
    const s = this.state
    const kBase = s.localContrast + s.sharpen   // detail amplification
    const denoise = s.denoise

    // Face ROI — focusBox is already in enhanced work-canvas pixels.
    let fx0 = -1, fy0 = -1, fx1 = -1, fy1 = -1
    if (focusBox && focusBox.width > 4 && focusBox.height > 4) {
      const pad = 0.15
      fx0 = focusBox.x - focusBox.width * pad
      fy0 = focusBox.y - focusBox.height * pad
      fx1 = focusBox.x + focusBox.width * (1 + pad)
      fy1 = focusBox.y + focusBox.height * (1 + pad)
      s.faceBoost = true
    } else { s.faceBoost = false }
    const faceK = kBase + 0.35            // stronger detail inside the face
    const faceLift = this.metrics.lowLight ? 14 : 6

    // Separable 3-tap [1 2 1]/4 gaussian, per channel, over the LUT-tuned frame.
    for (let ch = 0; ch < 3; ch++) {
      // horizontal
      for (let y = 0; y < h; y++) {
        const row = y * w
        for (let x = 0; x < w; x++) {
          const i = row + x
          const c = data[(i << 2) + ch]
          const l = x > 0 ? data[((i - 1) << 2) + ch] : c
          const r = x < w - 1 ? data[((i + 1) << 2) + ch] : c
          tmp[i] = (l + 2 * c + r) * 0.25
        }
      }
      // vertical → blur buffer
      for (let y = 0; y < h; y++) {
        const row = y * w
        for (let x = 0; x < w; x++) {
          const i = row + x
          const c = tmp[i]
          const u = y > 0 ? tmp[i - w] : c
          const d = y < h - 1 ? tmp[i + w] : c
          blur[i] = (u + 2 * c + d) * 0.25
        }
      }
      // combine
      for (let y = 0; y < h; y++) {
        const row = y * w
        const inFaceRow = fy0 >= 0 && y >= fy0 && y <= fy1
        for (let x = 0; x < w; x++) {
          const i = row + x
          const o = data[(i << 2) + ch]
          const bl = blur[i]
          const base = denoise > 0 ? o + (bl - o) * denoise : o
          const inFace = inFaceRow && x >= fx0 && x <= fx1
          const k = inFace ? faceK : kBase
          let out = bl + (base - bl) * k
          if (inFace && faceLift) out += faceLift
          data[(i << 2) + ch] = out < 0 ? 0 : out > 255 ? 255 : out
        }
      }
    }
  }

  dispose() {
    this.aCanvas = null; this.aCtx = null
    this.wCanvas = null; this.wCtx = null
    this.blurBuf = null; this.tmpBuf = null; this.bufLen = 0
  }
}

// ─── Labels + score ─────────────────────────────────────────────────────────────

function labelBrightness(m: number): BrightnessLabel {
  if (m < 45) return 'too_dark'
  if (m < 85) return 'dark'
  if (m <= 175) return 'good'
  if (m <= 215) return 'bright'
  return 'too_bright'
}
function labelBlur(v: number): BlurLabel {
  if (v >= 150) return 'none'
  if (v >= 70) return 'low'
  if (v >= 30) return 'medium'
  return 'high'
}
function labelNoise(sigma: number): NoiseLabel {
  if (sigma < 3.2) return 'low'
  if (sigma < 7) return 'medium'
  return 'high'
}
function labelContrast(std: number): ContrastLabel {
  if (std < 32) return 'low'
  if (std <= 78) return 'good'
  return 'high'
}

// Weighted 0-100 quality — brightness band, sharpness, noise, contrast, backlight.
function qualityScore(mean: number, std: number, blurVar: number, noise: number, backlight: boolean): number {
  // Brightness: full marks inside [95,165], falling off toward the extremes.
  const bPen = mean >= 95 && mean <= 165 ? 0
    : mean < 95 ? Math.min(35, (95 - mean) * 0.55)
    : Math.min(35, (mean - 165) * 0.5)
  // Sharpness: blurVar 200+ ≈ perfect, 30 ≈ bad.
  const sPen = blurVar >= 180 ? 0 : Math.min(30, (180 - blurVar) * 0.18)
  // Noise: sigma 2 ≈ clean, 12 ≈ bad.
  const nPen = noise <= 3 ? 0 : Math.min(20, (noise - 3) * 2.2)
  // Contrast: only low contrast is penalised.
  const cPen = std >= 32 ? 0 : Math.min(15, (32 - std) * 0.6)
  const blPen = backlight ? 8 : 0
  return Math.round(clamp(100 - bPen - sPen - nPen - cPen - blPen, 0, 100))
}
