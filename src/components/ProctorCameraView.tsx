/**
 * ProctorCameraView.tsx — Non-intrusive camera PIP shown during a proctored
 * ZenAssess test. Fixed bottom-right. It owns the displayed <video> and the
 * overlay <canvas>, hands both to the ProctoringEngine, and starts detection.
 *
 * The engine (face-api.js) draws the face box (pink=focused / orange=distracted
 * / red=away), cyan eye boxes, nose point and gaze arrow onto the canvas, and
 * reports the attention score that drives the traffic-light meter below the feed.
 *
 * The feed is intentionally NOT mirrored so face-api coordinates map 1:1 onto
 * the overlay canvas (both use object-fit: cover, so they stay aligned).
 */
import { useEffect, useRef, useState } from 'react';
import type { ProctoringFlag, ProctoringEngine } from '../lib/proctoringEngine';

interface Props {
  stream: MediaStream | null;
  flags: ProctoringFlag[];
  integrityScore: number;
  isDetecting: boolean;
  attentionScore: number;
  isPersonPresent: boolean;
  lastViolation: string | null;
  engine: ProctoringEngine | null;
}

export default function ProctorCameraView({
  stream, flags, integrityScore, isDetecting, attentionScore, isPersonPresent, lastViolation, engine,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Bind the stream, hand the video + overlay canvas to the engine, and start
  // detection once everything is in place.
  useEffect(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v) return;
    if (stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
    if (engine && stream && v && c && !startedRef.current) {
      engine.attachVideo(v);
      engine.attachCanvas(c);
      engine.startDetection();
      startedRef.current = true;
    }
  }, [stream, engine]);

  // Live attention snapshot from the engine (message/color); re-read each render
  // (the parent re-renders ~10fps as the score updates).
  const liveState = engine?.getAttentionState?.();
  const safeScore = Number.isFinite(attentionScore) ? attentionScore : 100;

  // Live camera-quality snapshot from the enhancement pipeline (may be null before
  // the first analysis pass or if the engine build predates enhancement).
  const quality = engine?.getQuality?.() ?? null;
  const enh = engine?.getEnhanceState?.() ?? null;
  const qScore = quality?.score ?? null;
  const qColor = qScore == null ? '#64748b' : qScore >= 80 ? '#22c55e' : qScore >= 55 ? '#f59e0b' : '#ef4444';

  // Map quality labels → short display text + traffic-light colour.
  const GOOD = '#22c55e', WARN = '#f59e0b', BAD = '#ef4444';
  const lightingCell = () => {
    switch (quality?.brightnessLabel) {
      case 'good': return { t: 'Good', c: GOOD };
      case 'dark': case 'bright': return { t: quality.brightnessLabel === 'dark' ? 'Dim' : 'Bright', c: WARN };
      case 'too_dark': return { t: 'Too dark', c: BAD };
      case 'too_bright': return { t: 'Harsh', c: BAD };
      default: return { t: '—', c: '#64748b' };
    }
  };
  const sharpCell = () => {
    switch (quality?.blurLabel) {
      case 'none': return { t: 'High', c: GOOD };
      case 'low': return { t: 'Good', c: GOOD };
      case 'medium': return { t: 'Fair', c: WARN };
      case 'high': return { t: 'Low', c: BAD };
      default: return { t: '—', c: '#64748b' };
    }
  };
  const noiseCell = () => {
    switch (quality?.noiseLabel) {
      case 'low': return { t: 'Low', c: GOOD };
      case 'medium': return { t: 'Med', c: WARN };
      case 'high': return { t: 'High', c: BAD };
      default: return { t: '—', c: '#64748b' };
    }
  };
  const enhLabel = (() => {
    switch (enh?.mode) {
      case 'low-light': return 'Low-light boost';
      case 'sharpen': return 'Sharpening';
      case 'denoise': return 'Denoising';
      case 'boost': return 'Backlight fix';
      case 'normal': return 'Active';
      default: return 'Idle';
    }
  })();
  const enhActive = !!enh && enh.mode !== 'off';
  // COCO-SSD (phone/object) layer status — false means the model failed to load and
  // phone/second-screen detection is silently unavailable.
  const objModelLoaded = engine?.isObjectModelLoaded?.();

  // Attention traffic-light mapping.
  const getAttentionColor = (score: number) => {
    if (score >= 75) return { color: '#22c55e', label: 'FOCUSED', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)' };
    if (score >= 45) return { color: '#f59e0b', label: 'DISTRACTED', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' };
    return { color: '#ef4444', label: 'AWAY', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' };
  };

  const attention = getAttentionColor(safeScore);
  const statusLabel = liveState?.message || attention.label;
  const displayScore = Number.isFinite(integrityScore) ? integrityScore : 100;
  const integrityColor = displayScore >= 85 ? '#22c55e' : displayScore >= 65 ? '#f59e0b' : '#ef4444';
  const feedHeight = isExpanded ? '180px' : '130px';
  const feedStyle = { width: '100%', height: feedHeight, objectFit: 'cover' as const, display: 'block' };

  return (
    <div className="sk-proctor-pip" style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>

      {/* VIOLATION TOAST — appears briefly */}
      {lastViolation && (
        <div style={{ background: 'rgba(239,68,68,0.9)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, animation: 'fadeInOut 3s ease', maxWidth: '200px', textAlign: 'center' }}>
          ⚠️ {lastViolation}
        </div>
      )}

      {/* CAMERA PANEL — solid background, never transparent */}
      <div style={{ width: isExpanded ? '280px' : '200px', background: '#0a0a0f', border: `1.5px solid ${isPersonPresent ? attention.border : 'rgba(239,68,68,0.6)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'all 0.3s ease', boxShadow: `0 0 20px ${attention.color}22` }}>

        {/* Camera feed + overlay canvas */}
        <div style={{ position: 'relative', background: '#0a0a0f' }}>
          {stream ? (
            <>
              <video
                ref={videoRef}
                style={{ ...feedStyle, filter: 'brightness(1.3) contrast(1.2) saturate(1.1)', WebkitFilter: 'brightness(1.3) contrast(1.2) saturate(1.1)' }}
                autoPlay
                muted
                playsInline
              />
              {/* Overlay canvas — object-fit:cover keeps it aligned with the video */}
              <canvas
                ref={canvasRef}
                style={{ position: 'absolute', top: 0, left: 0, ...feedStyle, pointerEvents: 'none' }}
              />
            </>
          ) : (
            <div style={{ width: '100%', height: feedHeight, background: '#1a1f2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>📷</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Camera not active</span>
            </div>
          )}

          {/* LIVE badge top-left */}
          <div style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.7)', padding: '3px 7px', borderRadius: '20px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', animation: isDetecting ? 'pulse 1.5s infinite' : 'none' }} />
            <span style={{ fontSize: '10px', color: '#fff', fontWeight: 600, letterSpacing: '0.05em' }}>LIVE</span>
          </div>

          {/* Expand toggle top-right */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '10px', padding: '2px 6px', cursor: 'pointer' }}
          >
            {isExpanded ? '▼' : '▲'}
          </button>

          {/* Person absent overlay */}
          {!isPersonPresent && stream && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
              <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600, background: 'rgba(239,68,68,0.8)', padding: '4px 10px', borderRadius: '20px' }}>
                👤 FACE NOT DETECTED
              </span>
            </div>
          )}
        </div>

        {/* STATUS BAR */}
        <div style={{ padding: '8px 10px', background: attention.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* ATTENTION LIGHT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: (liveState?.color === 'green' || safeScore >= 75) ? '#22c55e' : 'rgba(34,197,94,0.2)', transition: 'all 0.3s ease', boxShadow: (liveState?.color === 'green' || safeScore >= 75) ? '0 0 6px #22c55e' : 'none' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: (liveState?.color === 'orange' || (safeScore >= 45 && safeScore < 75)) ? '#f59e0b' : 'rgba(245,158,11,0.2)', transition: 'all 0.3s ease', boxShadow: (liveState?.color === 'orange' || (safeScore >= 45 && safeScore < 75)) ? '0 0 6px #f59e0b' : 'none' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: (liveState?.color === 'red' || safeScore < 45) ? '#ef4444' : 'rgba(239,68,68,0.2)', transition: 'all 0.3s ease', animation: (liveState?.color === 'red' || safeScore < 45) ? 'pulse 1s infinite' : 'none', boxShadow: (liveState?.color === 'red' || safeScore < 45) ? '0 0 6px #ef4444' : 'none' }} />
            </div>
            <span style={{ fontSize: '10px', fontWeight: 600, color: attention.color, letterSpacing: '0.05em', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusLabel}</span>
          </div>

          {/* Integrity score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: integrityColor, lineHeight: 1 }}>{displayScore}</span>
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>INTEGRITY</span>
          </div>
        </div>

        {/* CAMERA QUALITY STRIP — always visible when the pipeline is running */}
        {stream && quality && (
          <div style={{ padding: '6px 10px', background: '#07070c', borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: qColor, boxShadow: `0 0 6px ${qColor}`, flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>Camera</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: qColor }}>{qScore ?? '—'}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {enhActive && (
                <span style={{ fontSize: '9px', fontWeight: 600, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', border: '0.5px solid rgba(56,189,248,0.35)', padding: '1px 5px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                  ✦ {enhLabel}
                </span>
              )}
              {enh?.faceBoost && (
                <span style={{ fontSize: '9px', fontWeight: 600, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '0.5px solid rgba(167,139,250,0.35)', padding: '1px 5px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                  ◎ Face
                </span>
              )}
            </div>
          </div>
        )}

        {/* EXPANDED DETAILS */}
        {isExpanded && (
          <div style={{ padding: '10px', borderTop: '0.5px solid rgba(255,255,255,0.06)', background: '#0a0a0f' }}>

            {/* CAMERA QUALITY METRICS */}
            {quality && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Camera Quality</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  {[
                    { k: 'Lighting', ...lightingCell() },
                    { k: 'Sharpness', ...sharpCell() },
                    { k: 'Noise', ...noiseCell() },
                    { k: 'Resolution', t: quality.height ? `${quality.height}p` : '—', c: 'rgba(255,255,255,0.85)' },
                    { k: 'FPS', t: quality.fps ? String(quality.fps) : '—', c: quality.fps >= 20 ? GOOD : quality.fps >= 12 ? WARN : BAD },
                    { k: 'Enhance', t: enhActive ? 'On' : 'Off', c: enhActive ? '#38bdf8' : 'rgba(255,255,255,0.4)' },
                  ].map(cell => (
                    <div key={cell.k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '5px 6px' }}>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.03em', marginBottom: '2px' }}>{cell.k}</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: cell.c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.t}</div>
                    </div>
                  ))}
                </div>
                {quality.backlight && (
                  <div style={{ marginTop: '6px', fontSize: '9px', color: WARN, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ⚠ Backlight detected — enhancing face region
                  </div>
                )}
              </div>
            )}

            {/* OBJECT / PHONE AI STATUS — makes a silent COCO-SSD load failure visible */}
            {objModelLoaded !== undefined && (
              <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: objModelLoaded ? GOOD : BAD, boxShadow: `0 0 5px ${objModelLoaded ? GOOD : BAD}` }} />
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {objModelLoaded ? 'Phone / object AI active' : 'Phone AI unavailable (model not loaded)'}
                </span>
              </div>
            )}

            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Attention</span>
                <span style={{ fontSize: '10px', color: attention.color }}>{Math.round(safeScore)}%</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${safeScore}%`, background: attention.color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {flags.length === 0 ? (
                <span style={{ fontSize: '10px', color: '#22c55e' }}>✓ No violations</span>
              ) : (
                flags.slice(-3).map((f, i) => (
                  <span key={i} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                    {f.type === 'phone_detected' ? '📱'
                      : f.type === 'tab_switch' ? '🔄'
                      : f.type === 'copy_paste' ? '📋'
                      : f.type === 'multiple_persons' ? '👥'
                      : '⚠️'} {f.type.replace(/_/g, ' ')}
                  </span>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
