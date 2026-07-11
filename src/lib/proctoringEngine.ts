/**
 * proctoringEngine.ts — Browser-only AI proctoring core for ZenAssess.
 *
 * FOUR parallel detection layers (all client-side, zero server cost):
 *   Layer 1 — Face + eye + head-pose (face-api.js, ~10fps)
 *   Layer 2 — Brightness/bright-rectangle scan (custom pixel math, ~3fps) → finds
 *             phone screens even in dark rooms
 *   Layer 3 — Frame-difference motion (~15fps) → catches a fast phone grab and
 *             triggers an immediate COCO-SSD scan
 *   Layer 4 — COCO-SSD object detection (~0.7fps) → phone / second-screen
 *
 * Model weights are served locally from /public/models (GitHub-CDN fallback).
 * The host page attaches the displayed PIP <video> + overlay <canvas> via
 * attachVideo()/attachCanvas() and calls startDetection().
 */
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as faceapi from 'face-api.js'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import { VideoEnhancer, type QualityMetrics, type EnhanceState } from './videoEnhancement'

export interface ProctoringFlag {
  type: 'tab_switch' | 'copy_paste' |
        'right_click' | 'devtools' |
        'fullscreen_exit' | 'phone_detected' |
        'multiple_persons' | 'keyboard_shortcut' |
        'screenshot_attempt' | 'second_screen' |
        'face_not_visible' | 'rapid_answers'
  severity: 'low' | 'medium' | 'high' | 'severe'
  timestamp: number
  details: string
  questionNumber?: number
}

export interface IntegrityReport {
  sessionId: string
  employeeId: string
  skillName: string
  flags: ProctoringFlag[]
  integrityScore: number
  cameraEnabled: boolean
  aiDetectionEnabled: boolean
  startTime: number
  endTime: number
  tabSwitchCount: number
  copyAttempts: number
  devToolsAttempts: number
  phoneDetections: number
  multiplePersonDetections: number
  verdict: 'clean' | 'suspicious' |
           'high_risk' | 'compromised'
}

export type AttentionLevel = 'focused' | 'distracted' | 'away' | 'multiple_faces' | 'unknown'
export type GazeDirection = 'center' | 'left' | 'right' | 'up' | 'down' | 'away'
export interface Box { x: number; y: number; width: number; height: number }
export interface AttentionState {
  level: AttentionLevel
  score: number
  color: 'green' | 'orange' | 'red' | 'gray'
  message: string
  gazeDirection: GazeDirection
  faceCount: number
  faceBox: Box | null
  leftEyeBox: Box | null
  rightEyeBox: Box | null
}

type FaceResult = faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>

const LOCAL_MODEL_URL = '/models'
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights'
const LOCAL_IRIS_PATH = '/mediapipe/face_mesh'
const CDN_IRIS_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619'

interface IrisPoint { x: number; y: number; z?: number }

export class ProctoringEngine {
  private flags: ProctoringFlag[] = []
  private model: cocoSsd.ObjectDetection | null = null // COCO-SSD (phone/screen)
  private stream: MediaStream | null = null
  private videoElement: HTMLVideoElement | null = null

  // Overlay canvas (attached by the PIP) the engine draws boxes onto.
  private detectionCanvas: HTMLCanvasElement | null = null
  private detectionCtx: CanvasRenderingContext2D | null = null
  // Offscreen canvases for pixel analysis.
  private offscreenCanvas: HTMLCanvasElement | null = null
  private offscreenCtx: CanvasRenderingContext2D | null = null
  private motionCanvas: HTMLCanvasElement | null = null
  private motionCtx: CanvasRenderingContext2D | null = null
  private prevFrameData: ImageData | null = null

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null
  private visibilityHandler: (() => void) | null = null
  private contextMenuHandler: ((e: MouseEvent) => void) | null = null
  private copyHandler: ((e: ClipboardEvent) => void) | null = null
  private fullscreenHandler: (() => void) | null = null
  private devToolsInterval: ReturnType<typeof setInterval> | null = null

  private sessionId: string = ''
  private employeeId: string = ''
  private skillName: string = ''
  private startTime: number = 0
  private questionStartTime: number = 0
  private currentQuestion: number = 0
  private onFlagCallback: ((flag: ProctoringFlag) => void) | null = null
  private onViolationCallback: ((type: string) => void) | null = null
  private tabSwitchCount: number = 0
  private copyAttempts: number = 0
  private devToolsAttempts: number = 0
  private phoneDetections: number = 0
  private multiplePersons: number = 0
  private modelLoaded: boolean = false
  private cameraEnabled: boolean = false

  // ─── Deterrent mode ──────────────────────
  // Product strategy: the camera + live AI overlay exist to DETER cheating (a
  // candidate who believes they're being watched behaves honestly). We deliberately
  // do NOT accuse honest users with "phone detected" / "devtools detected" popups,
  // deduct their score, or record violations — false positives just confuse people.
  // When true (the default): every hard-violation flag, violation toast, score
  // deduction and recording is suppressed. Face/eye/iris tracking, the on-video
  // overlay and the live "monitoring" status all keep running for the deterrent
  // effect. Set false to restore full enforcement/recording.
  private deterrentMode: boolean = true

  // ─── Detection state ─────────────────────
  private stopped: boolean = false
  private isRunningFace: boolean = false
  private isRunningObject: boolean = false
  private lastMotionFlag: number = 0
  private lastScreenFlag: number = 0
  private lastDarkFlag: number = 0
  // Central shared cooldown gates — one flag/toast per window across ALL layers.
  private phoneLastFlagTime: number = 0
  private readonly PHONE_FLAG_COOLDOWN = 30000        // phone: 30s
  private multiplePersonsLastFlagTime: number = 0
  private readonly MULTIPLE_PERSONS_COOLDOWN = 20000  // multiple persons: 20s
  private faceAwayLastFlagTime: number = 0
  private readonly FACE_AWAY_COOLDOWN = 15000         // face not visible: 15s
  private consecutiveNoFace: number = 0
  private faceEverDetected: boolean = false
  private eyeGazeHistory: GazeDirection[] = []
  private motionLevel: number = 0
  private wasAway: boolean = false

  // ─── Layer 5: MediaPipe iris tracking ────
  private irisModel: faceLandmarksDetection.FaceLandmarksDetector | null = null
  private irisModelLoaded: boolean = false
  private isRunningIris: boolean = false
  private lastIrisFlag: number = 0
  private readonly IRIS_FLAG_COOLDOWN = 20000         // eyes off screen: 20s
  private irisHistory: Array<{ leftX: number; leftY: number; rightX: number; rightY: number; timestamp: number }> = []
  private lastLeftIris: IrisPoint | null = null
  private lastRightIris: IrisPoint | null = null
  private lastIrisTs: number = 0
  private irisCalibration = { leftCenterX: 0.50, rightCenterX: 0.50, threshold: 0.20, calibrated: false }
  private attentionState: AttentionState = {
    level: 'unknown', score: 100, color: 'gray', message: 'Starting…',
    gazeDirection: 'center', faceCount: 0, faceBox: null, leftEyeBox: null, rightEyeBox: null
  }

  // ─── Video enhancement pipeline ──────────
  // Raw webcam frames (dark/noisy/soft on low-end laptops) are preprocessed into an
  // offscreen canvas BEFORE detection; the detectors run on the enhanced frame while
  // the displayed PIP keeps its smooth native feed. See videoEnhancement.ts.
  private enhancer: VideoEnhancer = new VideoEnhancer({ maxWidth: 640 })
  private enhancedCanvas: HTMLCanvasElement | null = null
  private quality: QualityMetrics | null = null
  private enhanceState: EnhanceState | null = null
  private lastFaceBox: Box | null = null
  // Detection-FPS measurement (rolling, from the face-loop cadence).
  private lastFaceTs = 0
  private detectFps = 0

  // Loop timing.
  private readonly FACE_INTERVAL = 100      // 10fps
  private readonly MOTION_INTERVAL = 67     // 15fps
  private readonly BRIGHTNESS_INTERVAL = 300 // 3fps
  private readonly OBJECT_INTERVAL = 1500   // ~0.7fps

  // Optional callbacks wired from the host page after construction.
  public onAttentionUpdate: ((score: number) => void) | null = null
  public onPersonReturned: (() => void) | null = null

  constructor(
    sessionId: string,
    employeeId: string,
    skillName: string,
    onFlag: (flag: ProctoringFlag) => void,
    onViolation: (type: string) => void
  ) {
    this.sessionId = sessionId
    this.employeeId = employeeId
    this.skillName = skillName
    this.onFlagCallback = onFlag
    this.onViolationCallback = onViolation
    this.startTime = Date.now()
  }

  // ─── LOAD MODELS ─────────────────────────

  async loadModel(): Promise<boolean> {
    const loadFace = (url: string) => Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
    ])

    try {
      await tf.setBackend('webgl')
      await tf.ready()

      let faceOk = false
      try { await loadFace(LOCAL_MODEL_URL); faceOk = true }
      catch (e) {
        console.warn('face-api local load failed, trying CDN:', e)
        try { await loadFace(CDN_MODEL_URL); faceOk = true }
        catch (cdnErr) { console.error('face-api CDN load failed:', cdnErr) }
      }

      try { this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' }) }
      catch (e) { console.error('COCO-SSD load failed (object layer off):', e); this.model = null }

      // Layer 5 — MediaPipe iris (non-critical; eyelid method already covers gaze).
      await this.loadIrisModel()

      this.initAnalysisCanvases()
      this.modelLoaded = faceOk
      if (faceOk) console.log('✅ Proctoring models loaded')
      return faceOk
    } catch (err) {
      console.error('Model load failed, retrying on CPU backend:', err)
      try {
        await tf.setBackend('cpu')
        await tf.ready()
        try { await loadFace(LOCAL_MODEL_URL) } catch { await loadFace(CDN_MODEL_URL) }
        try { this.model = await cocoSsd.load() } catch { this.model = null }
        this.initAnalysisCanvases()
        this.modelLoaded = true
        return true
      } catch {
        this.modelLoaded = false
        return false
      }
    }
  }

  private initAnalysisCanvases() {
    this.offscreenCanvas = document.createElement('canvas')
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })
    this.motionCanvas = document.createElement('canvas')
    this.motionCtx = this.motionCanvas.getContext('2d', { willReadFrequently: true })
  }

  // MediaPipe FaceMesh with refineLandmarks → adds the 10 iris keypoints needed
  // for true pupil-position gaze. Local assets first, CDN fallback.
  private async loadIrisModel() {
    const make = (solutionPath: string) => faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      { runtime: 'mediapipe', solutionPath, refineLandmarks: true, maxFaces: 2 }
    )
    try {
      this.irisModel = await make(LOCAL_IRIS_PATH)
      this.irisModelLoaded = true
      console.log('✅ Iris tracking loaded')
    } catch (e) {
      console.warn('Iris local load failed, trying CDN:', e)
      try {
        this.irisModel = await make(CDN_IRIS_PATH)
        this.irisModelLoaded = true
        console.log('✅ Iris tracking loaded (CDN)')
      } catch (cdnErr) {
        console.warn('Iris model failed to load (eyelid method still active):', cdnErr)
        this.irisModelLoaded = false
      }
    }
  }

  isIrisLoaded(): boolean { return this.irisModelLoaded }
  isModelLoaded(): boolean { return this.modelLoaded }
  // COCO-SSD (phone/object layer) load status — null model = layer silently off.
  isObjectModelLoaded(): boolean { return this.model !== null }
  isCameraEnabled(): boolean { return this.cameraEnabled }
  getStream(): MediaStream | null { return this.stream }
  getAttentionState(): AttentionState { return this.attentionState }
  getMotionLevel(): number { return this.motionLevel }

  // ─── Enhancement / quality accessors (for the live quality panel) ──
  getQuality(): QualityMetrics | null {
    if (this.quality) this.quality.fps = Math.round(this.detectFps)
    return this.quality
  }
  getEnhanceState(): EnhanceState | null { return this.enhanceState }
  getDetectFps(): number { return Math.round(this.detectFps) }
  setEnhancementEnabled(on: boolean) { this.enhancer.setEnabled(on) }

  // Preprocess the current frame; the detectors run on the returned canvas. The
  // enhanced canvas is shared with the iris/object loops for the same frame. Falls
  // back to the raw <video> if enhancement is disabled or errors out.
  private refreshEnhancedFrame(v: HTMLVideoElement): HTMLVideoElement | HTMLCanvasElement {
    try {
      const { canvas, metrics, state } = this.enhancer.process(v, this.lastFaceBox)
      this.enhancedCanvas = canvas
      this.quality = metrics
      this.enhanceState = state
      return canvas
    } catch {
      this.enhancedCanvas = null
      return v
    }
  }

  // Size of the frame the detectors actually see (enhanced canvas, else raw video).
  private inferenceSize(): { w: number; h: number } {
    if (this.enhancedCanvas) return { w: this.enhancedCanvas.width, h: this.enhancedCanvas.height }
    return { w: this.videoElement?.videoWidth || 640, h: this.videoElement?.videoHeight || 480 }
  }

  attachVideo(videoEl: HTMLVideoElement) { this.videoElement = videoEl }
  attachCanvas(canvasEl: HTMLCanvasElement) {
    this.detectionCanvas = canvasEl
    this.detectionCtx = canvasEl.getContext('2d')
  }

  // ─── CAMERA SETUP (HD → medium → basic; low-light hints) ──

  async setupCamera(videoEl: HTMLVideoElement): Promise<boolean> {
    // Low-light enhancement hints — experimental, silently ignored if unsupported.
    const advanced = [{
      brightness: 150, contrast: 128, saturation: 128, sharpness: 128,
      exposureMode: 'continuous', exposureCompensation: 1.5, whiteBalanceMode: 'continuous',
    }] as unknown as MediaTrackConstraintSet[]

    const constraints: MediaStreamConstraints[] = [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user', advanced }, audio: false },
      { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 }, facingMode: 'user' }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
    ]

    for (const constraint of constraints) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraint)
        this.videoElement = videoEl
        videoEl.srcObject = this.stream
        videoEl.setAttribute('playsinline', 'true')
        videoEl.muted = true

        await new Promise<void>((resolve, reject) => {
          videoEl.onloadedmetadata = () => resolve()
          videoEl.onerror = () => reject(new Error('video error'))
          setTimeout(() => reject(new Error('metadata timeout')), 5000)
        })
        await videoEl.play().catch(() => {})

        this.cameraEnabled = true
        console.log('Camera started:', `${videoEl.videoWidth}x${videoEl.videoHeight}`)
        return true
      } catch (err) {
        console.warn('Camera constraint failed, trying fallback:', err)
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }
      }
    }

    this.cameraEnabled = false
    return false
  }

  // ─── START ALL FOUR DETECTION LAYERS ─────

  startDetection() {
    if (!this.videoElement) return
    this.stopped = false
    this.runFaceLoop()       // Layer 1
    this.runBrightnessLoop() // Layer 2
    this.runMotionLoop()     // Layer 3
    this.runObjectLoop()     // Layer 4
    if (this.irisModelLoaded) this.runIrisLoop() // Layer 5 — most accurate eye gaze
    else console.warn('Iris model not loaded — using eyelid gaze method only')
  }

  // ─── LAYER 1 — FACE + EYE + HEAD POSE ────

  private async runFaceLoop() {
    if (this.stopped) return
    const v = this.videoElement
    if (this.isRunningFace || !v || v.readyState < 4) {
      if (!this.stopped) setTimeout(() => this.runFaceLoop(), this.FACE_INTERVAL)
      return
    }

    this.isRunningFace = true
    try {
      // Rolling detection-FPS from the actual face-loop cadence.
      const nowTs = performance.now()
      if (this.lastFaceTs) {
        const inst = 1000 / Math.max(1, nowTs - this.lastFaceTs)
        this.detectFps = this.detectFps ? this.detectFps * 0.8 + inst * 0.2 : inst
      }
      this.lastFaceTs = nowTs

      // Enhance the current frame (WB/exposure/gamma/denoise/sharpen + face-ROI
      // boost using last frame's box) and detect on THAT, not the raw video.
      const input = this.refreshEnhancedFrame(v)

      const detections = await faceapi
        .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.2 }))
        .withFaceLandmarks(true)
      this.lastFaceBox = detections?.[0]?.detection?.box
        ? { x: detections[0].detection.box.x, y: detections[0].detection.box.y, width: detections[0].detection.box.width, height: detections[0].detection.box.height }
        : null
      this.processFaceDetection(detections)
      if (this.detectionCanvas) this.drawOverlay(detections)
    } catch { /* silent */ }
    this.isRunningFace = false

    if (!this.stopped) setTimeout(() => this.runFaceLoop(), this.FACE_INTERVAL)
  }

  private processFaceDetection(detections: FaceResult[]) {
    const count = detections?.length || 0

    // ── No face ──
    if (count === 0) {
      // Before the first-ever detection the model may still be warming up —
      // show a neutral "Detecting…" state, never AWAY.
      if (!this.faceEverDetected) {
        this.updateAttention({
          ...this.attentionState,
          level: 'unknown', score: 100, color: 'gray',
          message: 'Detecting…', gazeDirection: 'center',
          faceCount: 0, faceBox: null, leftEyeBox: null, rightEyeBox: null,
        })
        return
      }
      this.consecutiveNoFace++
      if (this.consecutiveNoFace >= 8) { // ~800ms
        this.updateAttention({
          ...this.attentionState,
          level: 'away',
          score: Math.max(5, 100 - this.consecutiveNoFace * 5),
          color: 'red',
          message: 'Face not visible',
          gazeDirection: 'away',
          faceCount: 0, faceBox: null, leftEyeBox: null, rightEyeBox: null,
        })
        if (this.consecutiveNoFace === 8) {
          // Flip the UI overlay fast; hard score flag waits for 3s.
          this.wasAway = true
          this.fireViolation('face_away')
        }
        if (this.consecutiveNoFace === 30) { // 3s
          const nowAbsent = Date.now()
          if (nowAbsent - this.faceAwayLastFlagTime >= this.FACE_AWAY_COOLDOWN) {
            this.faceAwayLastFlagTime = nowAbsent
            this.addFlag({
              type: 'face_not_visible', severity: 'high', timestamp: nowAbsent,
              details: 'Face absent for 3 seconds', questionNumber: this.currentQuestion,
            })
          }
        }
      }
      return
    }

    // Face present — clear the away state if we had flagged it.
    this.faceEverDetected = true
    this.consecutiveNoFace = 0
    if (this.wasAway) { this.onPersonReturned?.(); this.wasAway = false }

    if (count > 1) { this.handleMultipleFaces(count, detections); return }

    // ── Single face ──
    const detection = detections[0]
    const box = detection.detection.box
    const landmarks = detection.landmarks
    if (!landmarks) return

    const leftEye = landmarks.getLeftEye()
    const rightEye = landmarks.getRightEye()
    const nose = landmarks.getNose()
    const jaw = landmarks.getJawOutline()

    // Eyes (sideways glance) + head pose. Eye gaze takes priority.
    const eyeGaze = this.analyzeEyeGaze(leftEye, rightEye)
    const headPose = this.analyzeHeadPose(leftEye, rightEye, nose, jaw, box)
    const finalGaze: GazeDirection =
      eyeGaze === 'center' && headPose === 'center' ? 'center'
        : eyeGaze !== 'center' ? eyeGaze
          : headPose

    const score = this.calculateAttentionScore(finalGaze)
    const leftEyeBox = this.getEyeBoundingBox(leftEye)
    const rightEyeBox = this.getEyeBoundingBox(rightEye)

    this.updateAttention({
      level: score >= 75 ? 'focused' : score >= 45 ? 'distracted' : 'away',
      score,
      color: score >= 75 ? 'green' : score >= 45 ? 'orange' : 'red',
      message: this.getAttentionMessage(finalGaze, eyeGaze, headPose),
      gazeDirection: finalGaze,
      faceCount: 1,
      faceBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      leftEyeBox, rightEyeBox,
    })

    // Sustained off-screen gaze pattern.
    this.eyeGazeHistory.push(finalGaze)
    if (this.eyeGazeHistory.length > 40) this.eyeGazeHistory.shift()
    const awayFrames = this.eyeGazeHistory.filter(g => g !== 'center').length
    const now = Date.now()
    if (awayFrames > 30 && now - this.faceAwayLastFlagTime >= this.FACE_AWAY_COOLDOWN) {
      this.faceAwayLastFlagTime = now
      this.addFlag({
        type: 'face_not_visible', severity: 'high', timestamp: now,
        details: `Eyes consistently off-screen (${awayFrames}/40 frames) — looking at external materials`,
        questionNumber: this.currentQuestion,
      })
      this.eyeGazeHistory = []
    }
  }

  // ── Eye gaze from 6-point eye landmarks (no iris model → heuristic) ──
  private analyzeEyeGaze(leftEye: faceapi.Point[], rightEye: faceapi.Point[]): GazeDirection {
    if (!leftEye || !rightEye || leftEye.length < 6 || rightEye.length < 6) return 'center'

    const leftWidth = Math.abs(leftEye[3].x - leftEye[0].x)
    const rightWidth = Math.abs(rightEye[3].x - rightEye[0].x)
    if (leftWidth < 2 || rightWidth < 2) return 'center'

    // Upper-lid midpoint position within the eye correlates with gaze shift.
    const leftRatio = ((leftEye[1].x + leftEye[2].x) / 2 - leftEye[0].x) / leftWidth
    const rightRatio = ((rightEye[1].x + rightEye[2].x) / 2 - rightEye[0].x) / rightWidth
    const avgRatio = (leftRatio + rightRatio) / 2

    // Eye openness (looking down ⇒ lids closer together).
    const leftHeight = Math.abs(leftEye[1].y - leftEye[5].y)
    const openRatio = leftHeight / leftWidth

    // Lenient — natural straight-ahead gaze varies ~0.35-0.65; only flag clear shifts.
    if (avgRatio < 0.20) return 'left'
    if (avgRatio > 0.80) return 'right'
    if (openRatio < 0.12) return 'down'
    return 'center'
  }

  // ── Head pose from nose deviation relative to the eye line ──
  private analyzeHeadPose(
    leftEye: faceapi.Point[], rightEye: faceapi.Point[], nose: faceapi.Point[],
    _jaw: faceapi.Point[], _box: faceapi.Box
  ): GazeDirection {
    if (!leftEye || !rightEye || !nose) return 'center'

    const leftCenter = {
      x: leftEye.reduce((s, p) => s + p.x, 0) / leftEye.length,
      y: leftEye.reduce((s, p) => s + p.y, 0) / leftEye.length,
    }
    const rightCenter = {
      x: rightEye.reduce((s, p) => s + p.x, 0) / rightEye.length,
      y: rightEye.reduce((s, p) => s + p.y, 0) / rightEye.length,
    }
    const noseTip = nose[6] || nose[3]
    if (!noseTip) return 'center'

    const eyeMidX = (leftCenter.x + rightCenter.x) / 2
    const eyeMidY = (leftCenter.y + rightCenter.y) / 2
    const eyeDist = Math.sqrt((rightCenter.x - leftCenter.x) ** 2 + (rightCenter.y - leftCenter.y) ** 2)
    if (eyeDist < 5) return 'center'

    const normX = (noseTip.x - eyeMidX) / eyeDist
    const normY = (noseTip.y - eyeMidY) / eyeDist
    // Lenient — only flag significant head turns, not small natural movement.
    if (normX > 0.55) return 'right'
    if (normX < -0.55) return 'left'
    if (normY < 0.10) return 'up'
    if (normY > 0.95) return 'down'
    return 'center'
  }

  private getAttentionMessage(combined: GazeDirection, eyeGaze: GazeDirection, headPose: GazeDirection): string {
    if (combined === 'center') return 'Focused ✓'
    if (eyeGaze !== 'center' && headPose === 'center') return `⚠ Eyes looking ${eyeGaze} (head still)`
    if (eyeGaze !== 'center' && headPose !== 'center') return `Eyes + head looking ${combined}`
    if (headPose !== 'center') return `Head turned ${headPose}`
    return `Looking ${combined}`
  }

  private handleMultipleFaces(count: number, detections: FaceResult[]) {
    const box = detections[0].detection.box
    this.updateAttention({
      level: 'multiple_faces', score: 0, color: 'red',
      message: `🔴 ${count} people detected!`, gazeDirection: 'center',
      faceCount: count,
      faceBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      leftEyeBox: null, rightEyeBox: null,
    })
    const now = Date.now()
    if (now - this.multiplePersonsLastFlagTime >= this.MULTIPLE_PERSONS_COOLDOWN) {
      this.multiplePersonsLastFlagTime = now
      this.multiplePersons++
      this.addFlag({
        type: 'multiple_persons', severity: 'severe', timestamp: now,
        details: `${count} faces in frame`, questionNumber: this.currentQuestion,
      })
      this.fireViolation('multiple_persons')
    }
  }

  private getEyeBoundingBox(points: faceapi.Point[]): Box {
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const pad = 5
    return {
      x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    }
  }

  private calculateAttentionScore(gaze: GazeDirection): number {
    switch (gaze) {
      case 'center': return 100
      case 'down': return 75
      case 'up': return 60
      case 'left':
      case 'right': return 50
      case 'away': return 15
      default: return 100
    }
  }

  private updateAttention(state: AttentionState) {
    this.attentionState = state
    this.onAttentionUpdate?.(state.score)
  }

  // ─── LAYER 2 — BRIGHTNESS / BRIGHT-RECTANGLE (works in the dark) ──

  private async runBrightnessLoop() {
    if (this.stopped) return
    try { this.detectBrightObjects() } catch { /* silent */ }
    if (!this.stopped) setTimeout(() => this.runBrightnessLoop(), this.BRIGHTNESS_INTERVAL)
  }

  private detectBrightObjects() {
    const video = this.videoElement
    const canvas = this.offscreenCanvas
    const ctx = this.offscreenCtx
    if (!video || !canvas || !ctx || video.readyState < 4) return

    canvas.width = 160
    canvas.height = 120
    ctx.drawImage(video, 0, 0, 160, 120)
    const pixels = ctx.getImageData(0, 0, 160, 120).data

    let totalBrightness = 0
    let brightPixels = 0
    const brightRegions: Array<{ x: number; y: number; count: number }> = []
    const gridSize = 8

    for (let gy = 0; gy < 120; gy += gridSize) {
      for (let gx = 0; gx < 160; gx += gridSize) {
        let regionBright = 0
        for (let py = 0; py < gridSize; py++) {
          for (let px = 0; px < gridSize; px++) {
            const i = ((gy + py) * 160 + (gx + px)) * 4
            const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
            totalBrightness += lum
            if (lum > 180) { brightPixels++; regionBright++ }
          }
        }
        if (regionBright > 40) brightRegions.push({ x: gx, y: gy, count: regionBright })
      }
    }

    const totalPixels = 160 * 120
    const avgBrightness = totalBrightness / totalPixels

    // Isolated bright rectangle ⇒ possible glowing screen. This heuristic is only
    // trustworthy in a DIM room (a phone screen stands out); in normal lighting a
    // bright rectangle is usually a window/lamp/paper and would false-fire, burning
    // the shared 30s phone cooldown and masking real COCO-SSD detections.
    if (avgBrightness < 60) {
      const rects = this.findBrightRectangles(brightRegions)
      for (const rect of rects) {
        const isPhoneShaped =
          (rect.height / rect.width > 1.2 || rect.width / rect.height > 1.2) &&
          rect.area > 200 && rect.area < totalPixels * 0.4
        if (isPhoneShaped) {
          this.flagPhoneDetected('BRIGHTNESS', 'N/A', `Bright screen in a dark room — possible phone/device. Brightness: ${rect.brightness.toFixed(0)}%`)
        }
      }
    }

    // Very dark environment (possible attempt to hide).
    if (avgBrightness < 20 && this.cameraEnabled) {
      const now = Date.now()
      if (now - this.lastDarkFlag > 20000) {
        this.lastDarkFlag = now
        this.addFlag({
          type: 'face_not_visible', severity: 'medium', timestamp: now,
          details: 'Very dark environment detected — please improve lighting',
          questionNumber: this.currentQuestion,
        })
      }
    }
  }

  private findBrightRectangles(
    regions: Array<{ x: number; y: number; count: number }>
  ): Array<{ x: number; y: number; width: number; height: number; area: number; brightness: number }> {
    if (regions.length === 0) return []
    const rects: Array<{ x: number; y: number; width: number; height: number; area: number; brightness: number }> = []
    const used = new Set<number>()

    regions.forEach((r, i) => {
      if (used.has(i)) return
      let minX = r.x, maxX = r.x + 8, minY = r.y, maxY = r.y + 8, totalCount = r.count
      regions.forEach((r2, j) => {
        if (i === j || used.has(j)) return
        const dist = Math.sqrt((r.x - r2.x) ** 2 + (r.y - r2.y) ** 2)
        if (dist < 30) {
          used.add(j)
          minX = Math.min(minX, r2.x); maxX = Math.max(maxX, r2.x + 8)
          minY = Math.min(minY, r2.y); maxY = Math.max(maxY, r2.y + 8)
          totalCount += r2.count
        }
      })
      used.add(i)
      const width = maxX - minX
      const height = maxY - minY
      const area = width * height
      rects.push({ x: minX, y: minY, width, height, area, brightness: (totalCount / area) * 100 })
    })

    return rects.filter(r => r.area > 150)
  }

  // ─── LAYER 3 — MOTION (catches a fast phone grab) ──

  private async runMotionLoop() {
    if (this.stopped) return
    try { await this.detectMotion() } catch { /* silent */ }
    if (!this.stopped) setTimeout(() => this.runMotionLoop(), this.MOTION_INTERVAL)
  }

  private async detectMotion() {
    const video = this.videoElement
    const canvas = this.motionCanvas
    const ctx = this.motionCtx
    if (!video || !canvas || !ctx || video.readyState < 4) return

    canvas.width = 80
    canvas.height = 60
    ctx.drawImage(video, 0, 0, 80, 60)
    const currentFrame = ctx.getImageData(0, 0, 80, 60)

    if (!this.prevFrameData) { this.prevFrameData = currentFrame; return }

    const curr = currentFrame.data
    const prev = this.prevFrameData.data
    let changedPixels = 0
    const totalPx = 80 * 60
    for (let i = 0; i < curr.length; i += 4) {
      const diff = (Math.abs(curr[i] - prev[i]) + Math.abs(curr[i + 1] - prev[i + 1]) + Math.abs(curr[i + 2] - prev[i + 2])) / 3
      if (diff > 30) changedPixels++
    }
    this.prevFrameData = currentFrame

    const motionScore = changedPixels / totalPx
    this.motionLevel = motionScore * 100

    // A large sudden change ⇒ run an immediate object scan (don't wait 1.5s).
    if (motionScore > 0.15) {
      const now = Date.now()
      if (now - this.lastMotionFlag > 1000) {
        this.lastMotionFlag = now
        this.triggerImmediateObjectScan()
      }
    }
  }

  private async triggerImmediateObjectScan() {
    const v = this.videoElement
    if (!this.model || !v || v.readyState < 4 || this.isRunningObject) return
    this.isRunningObject = true
    try {
      const predictions = await this.model.detect(v)

      const phone = predictions.find(p => p.class === 'cell phone' && p.score > 0.35)
      if (phone) {
        this.flagPhoneDetected('MOTION+COCO', `${(phone.score * 100).toFixed(0)}%`, 'Phone detected after motion trigger')
      }

      const persons = predictions.filter(p => p.class === 'person' && p.score > 0.5)
      if (persons.length > 1) {
        const now = Date.now()
        if (now - this.multiplePersonsLastFlagTime >= this.MULTIPLE_PERSONS_COOLDOWN) {
          this.multiplePersonsLastFlagTime = now
          this.multiplePersons++
          this.addFlag({
            type: 'multiple_persons', severity: 'severe', timestamp: now,
            details: 'Additional person detected after movement', questionNumber: this.currentQuestion,
          })
          this.fireViolation('multiple_persons')
        }
      }
    } catch { /* silent */ }
    this.isRunningObject = false
  }

  // ─── LAYER 4 — COCO-SSD OBJECT DETECTION ──

  private async runObjectLoop() {
    if (this.stopped) return
    const v = this.videoElement
    if (this.model && v && v.readyState === 4 && !this.isRunningObject) {
      this.isRunningObject = true
      try {
        // COCO-SSD runs on the RAW video, NOT the enhanced canvas: the enhancement
        // is tuned for faces (heavy unsharp + face-ROI lift + 640px downscale) and
        // actively hurts small-object detection like a distant phone. Face/iris keep
        // the enhanced input; the object layer wants the untouched native frame.
        const predictions = await this.model.detect(v)
        this.analyzeDetections(predictions)
      } catch { /* silent */ }
      this.isRunningObject = false
    }
    if (!this.stopped) setTimeout(() => this.runObjectLoop(), this.OBJECT_INTERVAL)
  }

  private analyzeDetections(predictions: cocoSsd.DetectedObject[]) {
    const detected = predictions.map(p => ({ class: p.class, score: p.score, bbox: p.bbox }))

    const phones = detected.filter(d => d.class === 'cell phone' && d.score > 0.4)
    if (phones.length > 0) {
      this.flagPhoneDetected('COCO-SSD', `${Math.round(phones[0].score * 100)}%`, `Mobile phone detected by object detection — position: ${this.getBboxPosition(phones[0].bbox)}`)
    }

    const screens = detected.filter(d => ['laptop', 'tv', 'monitor', 'book'].includes(d.class) && d.score > 0.6)
    if (screens.length > 0) {
      const now = Date.now()
      if (!this.lastScreenFlag || now - this.lastScreenFlag > 30000) {
        this.lastScreenFlag = now
        this.addFlag({
          type: 'second_screen', severity: 'high', timestamp: now,
          details: `Secondary device detected: ${screens[0].class} (${Math.round(screens[0].score * 100)}%)`,
          questionNumber: this.currentQuestion,
        })
      }
    }
  }

  private getBboxPosition(bbox: number[]): string {
    // Object detection runs on the RAW video → bbox coords are in native space.
    const fw = this.videoElement?.videoWidth || 640
    const fh = this.videoElement?.videoHeight || 480
    const cx = (bbox[0] + bbox[2] / 2) / fw
    const cy = (bbox[1] + bbox[3] / 2) / fh
    const hPos = cx < 0.33 ? 'left' : cx > 0.66 ? 'right' : 'center'
    const vPos = cy < 0.33 ? 'top' : cy > 0.66 ? 'bottom' : 'middle'
    return `${vPos}-${hPos} of frame`
  }

  // Central phone-flag gate — EVERY layer routes phone detections through here,
  // so the user gets ONE flag/toast then silence for PHONE_FLAG_COOLDOWN (30s).
  private flagPhoneDetected(source: string, confidence: string, details: string) {
    const now = Date.now()
    if (now - this.phoneLastFlagTime < this.PHONE_FLAG_COOLDOWN) return // cooldown — skip silently
    this.phoneLastFlagTime = now
    this.phoneDetections++
    const conf = confidence && confidence !== 'N/A' ? ` (confidence: ${confidence})` : ''
    this.addFlag({
      type: 'phone_detected', severity: 'severe', timestamp: now,
      details: `[${source}] ${details}${conf}`,
      questionNumber: this.currentQuestion,
    })
    this.fireViolation('phone_detected')
  }

  // ─── LAYER 5 — MEDIAPIPE IRIS (true pupil-position gaze) ──

  private async runIrisLoop() {
    if (this.stopped) return
    const v = this.videoElement
    if (!this.irisModelLoaded || !this.irisModel || this.isRunningIris || !v || v.readyState < 4) {
      if (!this.stopped) setTimeout(() => this.runIrisLoop(), 150)
      return
    }
    this.isRunningIris = true
    try {
      const faces = await this.irisModel.estimateFaces(this.enhancedCanvas || v)
      if (faces && faces.length > 0) this.processIrisData(faces[0])
    } catch { /* silent */ }
    this.isRunningIris = false
    if (!this.stopped) setTimeout(() => this.runIrisLoop(), 100) // ~10fps
  }

  private processIrisData(face: faceLandmarksDetection.Face) {
    // refineLandmarks adds iris keypoints: 468 = left iris centre, 473 = right.
    const keypoints = (face.keypoints || []) as IrisPoint[]
    if (keypoints.length < 478) return // iris landmarks unavailable

    const leftIrisCenter = keypoints[468]
    const rightIrisCenter = keypoints[473]
    if (!leftIrisCenter || !rightIrisCenter) return

    // Eye corners for horizontal normalisation.
    const leftEyeLeft = keypoints[33]
    const leftEyeRight = keypoints[133]
    const rightEyeLeft = keypoints[362]
    const rightEyeRight = keypoints[263]
    if (!leftEyeLeft || !leftEyeRight || !rightEyeLeft || !rightEyeRight) return

    const leftEyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x)
    const rightEyeWidth = Math.abs(rightEyeRight.x - rightEyeLeft.x)
    if (leftEyeWidth < 1 || rightEyeWidth < 1) return

    const leftIrisX = (leftIrisCenter.x - leftEyeLeft.x) / leftEyeWidth
    const rightIrisX = (rightIrisCenter.x - rightEyeLeft.x) / rightEyeWidth

    // Vertical normalisation from upper/lower lid landmarks.
    const leftEyeTop = keypoints[159]
    const leftEyeBottom = keypoints[145]
    const rightEyeTop = keypoints[386]
    const rightEyeBottom = keypoints[374]
    const leftEyeHeight = leftEyeTop && leftEyeBottom ? Math.abs(leftEyeBottom.y - leftEyeTop.y) : 0
    const rightEyeHeight = rightEyeTop && rightEyeBottom ? Math.abs(rightEyeBottom.y - rightEyeTop.y) : 0
    const leftIrisY = leftEyeHeight > 0 ? (leftIrisCenter.y - leftEyeTop.y) / leftEyeHeight : 0.5
    const rightIrisY = rightEyeHeight > 0 ? (rightIrisCenter.y - rightEyeTop.y) / rightEyeHeight : 0.5

    const avgIrisX = (leftIrisX + rightIrisX) / 2
    const avgIrisY = (leftIrisY + rightIrisY) / 2

    this.irisHistory.push({ leftX: leftIrisX, leftY: leftIrisY, rightX: rightIrisX, rightY: rightIrisY, timestamp: Date.now() })
    if (this.irisHistory.length > 20) this.irisHistory.shift()

    // Store iris centres for the overlay (drawn by the face loop to avoid flicker).
    this.lastLeftIris = { x: leftIrisCenter.x, y: leftIrisCenter.y }
    this.lastRightIris = { x: rightIrisCenter.x, y: rightIrisCenter.y }
    this.lastIrisTs = Date.now()

    this.analyzeIrisPosition(avgIrisX, avgIrisY, leftIrisX, rightIrisX)
  }

  private analyzeIrisPosition(avgX: number, avgY: number, leftX: number, rightX: number) {
    // If the two eyes strongly disagree it's almost always a tracking artifact —
    // skip entirely rather than risk a false "looking away".
    if (Math.abs(leftX - rightX) > 0.25) return

    const { leftCenterX, rightCenterX } = this.irisCalibration
    // Wider tolerance band so natural iris drift around centre isn't flagged.
    const threshold = Math.max(this.irisCalibration.threshold, 0.22)
    let gazeDir: GazeDirection = 'center'
    let severity = 0
    let message = 'Focused ✓'

    const avgOff = ((leftX - leftCenterX) + (rightX - rightCenterX)) / 2

    if (leftX < leftCenterX - threshold && rightX < rightCenterX - threshold) {
      gazeDir = 'left'
      severity = Math.abs(avgOff) * 200
      message = severity > 30 ? '🔴 Eyes hard left — checking notes?' : '🟡 Eyes slightly left'
    } else if (leftX > leftCenterX + threshold && rightX > rightCenterX + threshold) {
      gazeDir = 'right'
      severity = Math.abs(avgOff) * 200
      message = severity > 30 ? '🔴 Eyes hard right — second screen?' : '🟡 Eyes slightly right'
    } else if (avgY < 0.20) {
      gazeDir = 'up'; severity = (0.20 - avgY) * 200; message = '🟡 Eyes looking up'
    } else if (avgY > 0.80) {
      gazeDir = 'down'; severity = (avgY - 0.80) * 200; message = '🟡 Eyes looking down — notes?'
    }

    // Both eyes must agree → guards against single-eye calibration noise.
    const eyesAgree = Math.abs(leftX - rightX) < 0.2
    if (gazeDir !== 'center' && eyesAgree) {
      const attentionScore = severity > 30 ? 20 : 50
      this.updateAttention({
        ...this.attentionState,
        score: Math.min(this.attentionState.score, attentionScore),
        color: attentionScore > 60 ? 'orange' : 'red',
        message,
        gazeDirection: gazeDir,
      })
    }

    // Sustained off-centre pattern ⇒ flag.
    if (this.irisHistory.length >= 15) {
      const recent = this.irisHistory.slice(-15)
      const recentAway = recent.filter(h =>
        h.leftX < leftCenterX - threshold || h.rightX < rightCenterX - threshold ||
        h.leftX > leftCenterX + threshold || h.rightX > rightCenterX + threshold
      ).length
      const now = Date.now()
      if (recentAway >= 10 && now - this.lastIrisFlag >= this.IRIS_FLAG_COOLDOWN) {
        this.lastIrisFlag = now
        const avgPos = recent.reduce((s, h) => s + (h.leftX + h.rightX) / 2, 0) / recent.length
        const center = ((leftCenterX + rightCenterX) / 2).toFixed(2)
        this.addFlag({
          type: 'face_not_visible',
          severity: recentAway >= 13 ? 'severe' : 'high',
          timestamp: now,
          details: `IRIS TRACKING: eyes off-centre for ${recentAway}/15 frames (avg X=${avgPos.toFixed(2)}, centre≈${center}). Possible cheating detected.`,
          questionNumber: this.currentQuestion,
        })
        this.fireViolation('eyes_off_screen')
        this.irisHistory = []
      }
    }
  }

  // Personal gaze calibration — collects iris positions while the user looks at
  // the screen centre, then sets per-user "centre" thresholds.
  async calibrateIris(durationMs: number = 5000): Promise<boolean> {
    if (!this.irisModelLoaded || !this.irisModel || !this.videoElement) return false

    const samples: Array<{ leftX: number; rightX: number }> = []
    const endTime = Date.now() + durationMs

    while (Date.now() < endTime) {
      try {
        const faces = await this.irisModel.estimateFaces(this.videoElement)
        const kp = (faces?.[0]?.keypoints || []) as IrisPoint[]
        if (kp.length >= 478) {
          const lIris = kp[468], rIris = kp[473], lLeft = kp[33], lRight = kp[133], rLeft = kp[362], rRight = kp[263]
          if (lIris && rIris && lLeft && lRight && rLeft && rRight) {
            const lw = Math.abs(lRight.x - lLeft.x)
            const rw = Math.abs(rRight.x - rLeft.x)
            if (lw > 1 && rw > 1) {
              samples.push({ leftX: (lIris.x - lLeft.x) / lw, rightX: (rIris.x - rLeft.x) / rw })
            }
          }
        }
      } catch { /* silent */ }
      await new Promise(r => setTimeout(r, 100))
    }

    if (samples.length < 10) {
      console.warn('Not enough iris calibration samples:', samples.length)
      return false
    }

    this.irisCalibration = {
      leftCenterX: samples.reduce((s, c) => s + c.leftX, 0) / samples.length,
      rightCenterX: samples.reduce((s, c) => s + c.rightX, 0) / samples.length,
      threshold: 0.20,
      calibrated: true,
    }
    console.log('✅ Iris calibrated:', this.irisCalibration)
    return true
  }

  // ─── OVERLAY (non-mirrored: feed shown un-mirrored, coords map 1:1) ──

  private drawOverlay(detections: FaceResult[]) {
    if (!this.detectionCanvas || !this.detectionCtx || !this.videoElement) return
    const ctx = this.detectionCtx
    const canvas = this.detectionCanvas

    // Match the overlay to the frame the detectors saw (enhanced canvas, else video)
    // so face/eye/iris boxes land on the right pixels. Aspect ratio is preserved and
    // both the <video> and overlay use object-fit:cover, so they stay aligned.
    const { w: inW, h: inH } = this.inferenceSize()
    canvas.width = inW
    canvas.height = inH
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!detections || detections.length === 0) {
      ctx.fillStyle = 'rgba(239,68,68,0.9)'
      ctx.font = 'bold 14px monospace'
      ctx.textAlign = 'center'
      ctx.shadowColor = '#ef4444'
      ctx.shadowBlur = 10
      ctx.fillText('NO FACE DETECTED', canvas.width / 2, canvas.height / 2)
      ctx.shadowBlur = 0
      return
    }

    const state = this.attentionState

    detections.forEach((det, idx) => {
      const box = det.detection.box
      const landmarks = det.landmarks
      const isMain = idx === 0
      const boxColor = !isMain ? '#ef4444'
        : state.color === 'green' ? '#ff00ff'
          : state.color === 'orange' ? '#f97316' : '#ef4444'

      const sx = box.x, sy = box.y, sw = box.width, sh = box.height

      ctx.shadowColor = boxColor
      ctx.shadowBlur = 12
      ctx.strokeStyle = boxColor
      ctx.lineWidth = 2
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.shadowBlur = 0

      // Corner brackets
      const c = 18
      ctx.lineWidth = 3
      ctx.shadowColor = boxColor
      ctx.shadowBlur = 8
      ctx.beginPath(); ctx.moveTo(sx, sy + c); ctx.lineTo(sx, sy); ctx.lineTo(sx + c, sy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx + sw - c, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy + c); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx, sy + sh - c); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx + c, sy + sh); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx + sw - c, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw, sy + sh - c); ctx.stroke()
      ctx.shadowBlur = 0

      ctx.fillStyle = boxColor
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        isMain ? `FACE ${(det.detection.score * 100).toFixed(0)}% | ${state.gazeDirection.toUpperCase()}` : `⚠ EXTRA PERSON ${idx + 1}`,
        sx + sw / 2, sy - 6
      )

      if (landmarks && isMain) {
        const leftEye = landmarks.getLeftEye()
        const rightEye = landmarks.getRightEye()
        const drawEye = (eye: faceapi.Point[]) => {
          if (!eye?.length) return
          const xs = eye.map(p => p.x)
          const ys = eye.map(p => p.y)
          const pad = 4
          const ex = Math.min(...xs) - pad
          const ey = Math.min(...ys) - pad
          const ew = Math.max(...xs) - Math.min(...xs) + pad * 2
          const eh = Math.max(...ys) - Math.min(...ys) + pad * 2
          ctx.strokeStyle = '#00ffff'
          ctx.lineWidth = 1.5
          ctx.shadowColor = '#00ffff'
          ctx.shadowBlur = 5
          ctx.strokeRect(ex, ey, ew, eh)
          ctx.shadowBlur = 0
          ctx.fillStyle = '#00ffff'
          ctx.beginPath(); ctx.arc(ex + ew / 2, ey + eh / 2, 2, 0, Math.PI * 2); ctx.fill()
        }
        drawEye(leftEye)
        drawEye(rightEye)

        const nose = landmarks.getNose()
        if (nose?.[6]) {
          ctx.fillStyle = '#ffff00'
          ctx.shadowColor = '#ffff00'
          ctx.shadowBlur = 6
          ctx.beginPath(); ctx.arc(nose[6].x, nose[6].y, 3, 0, Math.PI * 2); ctx.fill()
          ctx.shadowBlur = 0
        }

        const eyeGaze = this.analyzeEyeGaze(leftEye, rightEye)
        if (eyeGaze !== 'center') {
          ctx.fillStyle = 'rgba(239,68,68,0.15)'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#ef4444'
          ctx.font = 'bold 13px monospace'
          ctx.textAlign = 'center'
          ctx.shadowColor = '#ef4444'
          ctx.shadowBlur = 8
          ctx.fillText(`👁 EYES ${eyeGaze.toUpperCase()}`, canvas.width / 2, sy + sh + 20)
          ctx.shadowBlur = 0
        }
      }

      if (!isMain) {
        ctx.fillStyle = 'rgba(239,68,68,0.7)'
        ctx.fillRect(sx, sy, sw, 18)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 9px Arial'
        ctx.textAlign = 'center'
        ctx.fillText('⚠ UNAUTHORIZED', sx + sw / 2, sy + 12)
      }
    })

    // Iris centres from MediaPipe (Layer 5) — green dot + ring, if fresh.
    if (this.lastLeftIris && this.lastRightIris && Date.now() - this.lastIrisTs < 400) {
      const drawIris = (p: IrisPoint) => {
        ctx.fillStyle = '#00ff88'
        ctx.shadowColor = '#00ff88'
        ctx.shadowBlur = 10
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke()
        ctx.shadowBlur = 0
      }
      drawIris(this.lastLeftIris)
      drawIris(this.lastRightIris)
    }

    // Bottom attention bar
    const bh = 3
    const by = canvas.height - bh
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, by, canvas.width, bh)
    ctx.fillStyle = state.color === 'green' ? '#22c55e' : state.color === 'orange' ? '#f97316' : '#ef4444'
    ctx.fillRect(0, by, (state.score / 100) * canvas.width, bh)
  }

  // ─── FULLSCREEN ──────────────────────────

  async requestFullscreen(): Promise<boolean> {
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>
        mozRequestFullScreen?: () => Promise<void>
      }
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      else if (el.mozRequestFullScreen) await el.mozRequestFullScreen()
      return true
    } catch { return false }
  }

  setupFullscreenMonitor() {
    this.fullscreenHandler = () => {
      if (!document.fullscreenElement) {
        this.addFlag({
          type: 'fullscreen_exit', severity: 'high', timestamp: Date.now(),
          details: 'Exited fullscreen mode during assessment', questionNumber: this.currentQuestion
        })
        this.fireViolation('fullscreen_exit')
        setTimeout(() => { this.requestFullscreen() }, 2000)
      }
    }
    document.addEventListener('fullscreenchange', this.fullscreenHandler)
  }

  // ─── TAB SWITCH MONITORING ───────────────

  setupVisibilityMonitor() {
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.tabSwitchCount++
        this.addFlag({
          type: 'tab_switch',
          severity: this.tabSwitchCount > 2 ? 'high' : 'medium',
          timestamp: Date.now(),
          details: `Tab/window switch detected (#${this.tabSwitchCount})`,
          questionNumber: this.currentQuestion
        })
        this.fireViolation('tab_switch')
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  // ─── KEYBOARD BLOCKING ───────────────────

  setupKeyboardBlocking() {
    this.keydownHandler = (e: KeyboardEvent) => {
      const blocked = [
        { ctrl: true, key: 'c' }, { ctrl: true, key: 'x' }, { ctrl: true, key: 'v' },
        { ctrl: true, key: 'a' }, { ctrl: true, key: 'u' }, { ctrl: true, key: 's' },
        { ctrl: true, key: 'p' },
        { ctrl: true, shift: true, key: 'i' }, { ctrl: true, shift: true, key: 'j' },
        { ctrl: true, shift: true, key: 'c' }, { ctrl: true, shift: true, key: 'k' },
        { ctrl: true, key: 'f' }, { ctrl: true, key: 't' }, { ctrl: true, key: 'n' },
        { ctrl: true, key: 'w' },
      ]
      const isBlocked = blocked.some(combo => {
        const ctrlMatch = !combo.ctrl || (e.ctrlKey || e.metaKey)
        const shiftMatch = !combo.shift || e.shiftKey
        const keyMatch = e.key.toLowerCase() === combo.key.toLowerCase()
        return ctrlMatch && shiftMatch && keyMatch
      })
      const fKeyBlocked = ['F12', 'F11', 'F5', 'F1'].includes(e.key)
      const printScreen = e.key === 'PrintScreen'

      if (isBlocked || fKeyBlocked || printScreen) {
        e.preventDefault()
        e.stopPropagation()
        if (e.ctrlKey && e.key === 'c') {
          this.copyAttempts++
          this.addFlag({ type: 'copy_paste', severity: 'medium', timestamp: Date.now(), details: `Copy attempt #${this.copyAttempts}`, questionNumber: this.currentQuestion })
        }
        if (e.key === 'PrintScreen') {
          this.addFlag({ type: 'screenshot_attempt', severity: 'high', timestamp: Date.now(), details: 'Screenshot key pressed', questionNumber: this.currentQuestion })
          this.fireViolation('screenshot_attempt')
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'k'].includes(e.key.toLowerCase())) {
          this.devToolsAttempts++
          this.addFlag({ type: 'devtools', severity: 'severe', timestamp: Date.now(), details: 'DevTools shortcut detected', questionNumber: this.currentQuestion })
          this.fireViolation('devtools')
        }
      }
    }
    document.addEventListener('keydown', this.keydownHandler, { capture: true })
  }

  // ─── RIGHT CLICK BLOCKING ────────────────

  setupContextMenuBlocking() {
    this.contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      this.addFlag({ type: 'right_click', severity: 'low', timestamp: Date.now(), details: 'Right-click attempted', questionNumber: this.currentQuestion })
    }
    document.addEventListener('contextmenu', this.contextMenuHandler, { capture: true })
  }

  // ─── COPY/PASTE BLOCKING ─────────────────

  setupClipboardBlocking() {
    this.copyHandler = (e: ClipboardEvent) => {
      e.preventDefault()
      this.copyAttempts++
      this.addFlag({ type: 'copy_paste', severity: 'medium', timestamp: Date.now(), details: `Clipboard operation blocked (#${this.copyAttempts})`, questionNumber: this.currentQuestion })
    }
    document.addEventListener('copy', this.copyHandler)
    document.addEventListener('cut', this.copyHandler)
    document.addEventListener('paste', this.copyHandler)
  }

  // ─── DEVTOOLS DETECTION ──────────────────

  // Geometry-based DevTools detection.
  //
  // The old version flagged whenever `outer - inner > 160`. That is a FALSE-POSITIVE
  // magnet: normal browser chrome (tab strip + omnibox + bookmarks bar ≈ 120-160px),
  // a downloads bar, zoom ≠ 100%, or a fullscreen transition all trip it with no
  // devtools open — and because it ran every 3s with an additive −25 integrity hit
  // and no dedup, a benign layout collapsed the score to 0 in ~12s.
  //
  // New approach: only trust the geometry while the assessment is in FULLSCREEN
  // (chrome hidden → any large outer/inner gap really is a docked panel). Capture a
  // per-session baseline once fullscreen is stable, flag only on a LARGE SUDDEN
  // increase over that baseline, require two consecutive positive samples, and raise
  // at most one flag per open (reset when it closes). Keyboard-chord detection in
  // setupKeyboardBlocking() remains the primary, always-on signal.
  private dtBaseW = 0
  private dtBaseH = 0
  private dtBaselineSet = false
  private dtConsecutive = 0
  private dtFlagged = false
  setupDevToolsDetection() {
    const DELTA_MARGIN = 220   // a docked devtools pane is far wider than any toolbar
    this.devToolsInterval = setInterval(() => {
      // Outside fullscreen the browser chrome is visible and the geometry is
      // meaningless — skip entirely and re-baseline on the next fullscreen tick.
      if (!document.fullscreenElement) { this.dtBaselineSet = false; this.dtConsecutive = 0; return }

      const widthDiff = window.outerWidth - window.innerWidth
      const heightDiff = window.outerHeight - window.innerHeight

      if (!this.dtBaselineSet) {
        // First stable fullscreen sample = this machine's normal outer/inner gap.
        this.dtBaseW = widthDiff; this.dtBaseH = heightDiff; this.dtBaselineSet = true
        return
      }

      const opened = (widthDiff - this.dtBaseW > DELTA_MARGIN) || (heightDiff - this.dtBaseH > DELTA_MARGIN)
      if (opened) {
        this.dtConsecutive++
        if (this.dtConsecutive >= 2 && !this.dtFlagged) {
          this.dtFlagged = true
          this.devToolsAttempts++
          this.addFlag({ type: 'devtools', severity: 'severe', timestamp: Date.now(), details: 'DevTools panel detected (viewport shrunk by a docked pane)', questionNumber: this.currentQuestion })
          this.fireViolation('devtools')
        }
      } else {
        // Panel closed / transient blip — reset so a later genuine open can re-flag,
        // but a single benign sample can never raise a flag.
        this.dtConsecutive = 0
        this.dtFlagged = false
      }
    }, 3000)
  }

  // ─── RAPID ANSWER DETECTION ──────────────

  startQuestionTimer(questionNum: number) {
    this.currentQuestion = questionNum
    this.questionStartTime = Date.now()
  }

  checkAnswerSpeed() {
    const elapsed = Date.now() - this.questionStartTime
    if (elapsed < 3000) {
      this.addFlag({ type: 'rapid_answers', severity: 'medium', timestamp: Date.now(), details: `Question answered in ${elapsed}ms — suspiciously fast`, questionNumber: this.currentQuestion })
    }
  }

  // ─── FLAG MANAGEMENT ─────────────────────

  addFlag(flag: ProctoringFlag) {
    // Deterrent mode: never record a violation or surface its toast/flag-list entry.
    // With no flags stored, the integrity score stays 100 and the report is clean.
    if (this.deterrentMode) return
    this.flags.push(flag)
    this.onFlagCallback?.(flag)
  }

  // Central gate for the red "violation" toasts. Suppressed in deterrent mode so the
  // candidate is never accused; full proctoring still fires them when disabled.
  private fireViolation(type: string) {
    if (this.deterrentMode) return
    this.onViolationCallback?.(type)
  }

  // Toggle enforcement. true = deterrent-only (default); false = full recording.
  setDeterrentMode(on: boolean) { this.deterrentMode = on }
  isDeterrentMode(): boolean { return this.deterrentMode }

  getFlags(): ProctoringFlag[] { return this.flags }

  // ─── INTEGRITY SCORE ─────────────────────

  calculateIntegrityScore(): number {
    let score = 100
    const deductions: Record<string, number> = {
      'tab_switch': 8, 'copy_paste': 10, 'right_click': 2, 'devtools': 25,
      'fullscreen_exit': 15, 'phone_detected': 30, 'multiple_persons': 25,
      'keyboard_shortcut': 5, 'screenshot_attempt': 20, 'second_screen': 15,
      'face_not_visible': 10, 'rapid_answers': 8
    }
    this.flags.forEach(flag => { score -= (deductions[flag.type] || 5) })
    return Math.max(0, Math.min(100, score))
  }

  getVerdict(score: number): 'clean' | 'suspicious' | 'high_risk' | 'compromised' {
    if (score >= 85) return 'clean'
    if (score >= 65) return 'suspicious'
    if (score >= 40) return 'high_risk'
    return 'compromised'
  }

  // ─── GENERATE REPORT ─────────────────────

  generateReport(): IntegrityReport {
    const score = this.calculateIntegrityScore()
    return {
      sessionId: this.sessionId,
      employeeId: this.employeeId,
      skillName: this.skillName,
      flags: this.flags,
      integrityScore: score,
      cameraEnabled: this.cameraEnabled,
      aiDetectionEnabled: this.modelLoaded,
      startTime: this.startTime,
      endTime: Date.now(),
      tabSwitchCount: this.tabSwitchCount,
      copyAttempts: this.copyAttempts,
      devToolsAttempts: this.devToolsAttempts,
      phoneDetections: this.phoneDetections,
      multiplePersonDetections: this.multiplePersons,
      verdict: this.getVerdict(score)
    }
  }

  // ─── CLEANUP ─────────────────────────────

  async cleanup() {
    this.stopped = true // stops all four loops

    if (this.keydownHandler) document.removeEventListener('keydown', this.keydownHandler, { capture: true })
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler)
    if (this.contextMenuHandler) document.removeEventListener('contextmenu', this.contextMenuHandler, { capture: true })
    if (this.copyHandler) {
      document.removeEventListener('copy', this.copyHandler)
      document.removeEventListener('cut', this.copyHandler)
      document.removeEventListener('paste', this.copyHandler)
    }
    if (this.fullscreenHandler) document.removeEventListener('fullscreenchange', this.fullscreenHandler)
    if (this.devToolsInterval) clearInterval(this.devToolsInterval)

    if (this.stream) this.stream.getTracks().forEach(track => track.stop())
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    if (this.model) this.model.dispose()

    // Dispose the iris model.
    if (this.irisModel) { try { this.irisModel.dispose() } catch { /* ignore */ } this.irisModel = null }
    this.irisModelLoaded = false
    this.irisHistory = []
    this.lastLeftIris = null
    this.lastRightIris = null

    try { this.enhancer.dispose() } catch { /* ignore */ }
    this.enhancedCanvas = null
    this.quality = null
    this.enhanceState = null

    this.detectionCanvas = null
    this.detectionCtx = null
    this.offscreenCanvas = null
    this.offscreenCtx = null
    this.motionCanvas = null
    this.motionCtx = null
    this.prevFrameData = null
  }
}
