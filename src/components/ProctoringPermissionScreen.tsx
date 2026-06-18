/**
 * ProctoringPermissionScreen.tsx — Shown BEFORE a proctored ZenAssess test.
 *
 * Requests the three things the proctoring engine needs:
 *   1. AI detection model (loads in the background, ~5MB, cached after first use)
 *   2. Camera access (denial is allowed — the test still proceeds, flagged)
 *   3. Fullscreen mode (must be entered from this user gesture)
 *
 * Constructs the ProctoringEngine here and hands it back to the host page via
 * onAllGranted so monitoring state is shared. Styling mirrors the existing
 * ZenAssess dark-card look (no new colors / fonts introduced).
 */
import { useEffect, useRef, useState } from 'react';
import { useDark, mkTheme } from '../lib/themeContext';
import { ProctoringEngine, type ProctoringFlag } from '../lib/proctoringEngine';

interface Props {
  skillName: string;
  level: string;
  sessionId: string;
  employeeId: string;
  onFlag: (flag: ProctoringFlag) => void;
  onViolation: (type: string) => void;
  onAllGranted: (cameraGranted: boolean, engine: ProctoringEngine) => void;
  onCancel: () => void;
}

type CameraStatus = 'pending' | 'granted' | 'denied';
type FullscreenStatus = 'pending' | 'granted';

export default function ProctoringPermissionScreen({
  skillName, level, sessionId, employeeId, onFlag, onViolation, onAllGranted, onCancel,
}: Props) {
  const { dark } = useDark();
  const T = mkTheme(dark);

  const engineRef = useRef<ProctoringEngine | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('pending');
  const [fullscreenStatus, setFullscreenStatus] = useState<FullscreenStatus>('pending');
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);

  // Build the engine once and load the AI model in the background.
  useEffect(() => {
    const engine = new ProctoringEngine(sessionId, employeeId, skillName, onFlag, onViolation);
    engineRef.current = engine;
    setModelLoading(true);
    engine.loadModel().then(() => {
      setModelReady(true);
      setModelLoading(false);
    });
    // No cleanup-dispose here: on success the engine is handed to the parent,
    // which owns its lifecycle. On cancel we dispose explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCamera = async () => {
    const engine = engineRef.current;
    if (!engine || !previewRef.current) return;
    const ok = await engine.setupCamera(previewRef.current);
    setCameraStatus(ok ? 'granted' : 'denied');
  };

  const handleFullscreen = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.requestFullscreen();
    setFullscreenStatus('granted');
  };

  const canStart = modelReady && fullscreenStatus === 'granted' && cameraStatus !== 'pending';

  const handleStart = async () => {
    const engine = engineRef.current;
    if (!engine || !canStart) return;
    setStarting(true);

    // Gaze calibration — only when the camera is on and iris tracking loaded.
    if (cameraStatus === 'granted' && engine.isIrisLoaded()) {
      setCalibrating(true);
      setCalibrationProgress(0);
      const interval = setInterval(() => {
        setCalibrationProgress(p => (p >= 100 ? 100 : p + 2)); // 50 ticks × 100ms = 5s
      }, 100);
      await engine.calibrateIris(5000).catch(() => false);
      clearInterval(interval);
      setCalibrationProgress(100);
      setCalibrating(false);
    }

    onAllGranted(cameraStatus === 'granted', engine);
  };

  const handleCancel = async () => {
    const engine = engineRef.current;
    engineRef.current = null;
    await engine?.cleanup().catch(() => {});
    onCancel();
  };

  const statusPill = (label: string, color: string) => (
    <span style={{ fontSize: 12, fontWeight: 800, color }}>{label}</span>
  );

  const rowBtn = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 8, border: 'none',
        background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', color: '#fff',
        fontWeight: 700, fontSize: 12, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const divider = <div style={{ height: 1, background: T.bdr, margin: '4px 0' }} />;

  // ── Gaze calibration overlay (shown for ~5s after Start, before assessment) ──
  if (calibrating) {
    const secondsLeft = Math.max(0, Math.ceil((100 - calibrationProgress) / 20));
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9600,
          background: dark ? 'rgba(5,11,24,0.95)' : 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 460, background: T.card, border: `1px solid ${T.bdr}`,
            borderRadius: 20, padding: 32, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
          className="fadeIn"
        >
          <div style={{ fontSize: 36 }}>👁</div>
          <h3 style={{ margin: '10px 0 6px', fontSize: 18, fontWeight: 900, color: T.text }}>Gaze Calibration</h3>
          <p style={{ fontSize: 13, color: T.sub, margin: '0 0 18px', lineHeight: 1.6 }}>
            Please look directly at the <b style={{ color: T.text }}>center</b> of your screen.
          </p>
          <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${calibrationProgress}%`, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', borderRadius: 3, transition: 'width 0.1s linear' }} />
          </div>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>
            {secondsLeft}s remaining — calibrating eye tracking for your camera setup.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: dark ? 'rgba(5,11,24,0.92)' : 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 520, background: T.card, border: `1px solid ${T.bdr}`,
          borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        className="fadeIn"
      >
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>🔒 Secure Assessment</h2>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#3B82F6', marginTop: 4 }}>
          {skillName} — {level} Assessment
        </div>
        <p style={{ fontSize: 13, color: T.sub, marginTop: 12, lineHeight: 1.6 }}>
          This assessment is AI-monitored to ensure fair evaluation for all. Everything runs in your browser — nothing is uploaded.
        </p>

        {divider}

        <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 10px' }}>
          Required Permissions
        </div>

        {/* Camera */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>📷 Camera Access</div>
            <div style={{ fontSize: 12, color: T.muted }}>Monitors for unauthorized materials</div>
          </div>
          {cameraStatus === 'pending' && rowBtn('Grant Camera', handleCamera)}
          {cameraStatus === 'granted' && statusPill('✅ Granted', '#10B981')}
          {cameraStatus === 'denied' && statusPill('⚠️ Denied (test continues)', '#F59E0B')}
        </div>

        {/* Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>🖥️ Fullscreen Mode</div>
            <div style={{ fontSize: 12, color: T.muted }}>Prevents external assistance</div>
          </div>
          {fullscreenStatus === 'pending'
            ? rowBtn('Enter Fullscreen', handleFullscreen)
            : statusPill('✅ Active', '#10B981')}
        </div>

        {/* AI model */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>🤖 AI Monitoring</div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {modelReady ? 'Detection model ready' : 'Loading detection model…'}
            </div>
          </div>
          {modelReady ? statusPill('✅ Ready', '#10B981') : statusPill(modelLoading ? '⏳ Loading' : '⏳ Waiting', T.sub)}
        </div>

        {/* Hidden preview element so the camera grant can attach a stream */}
        <video ref={previewRef} autoPlay muted playsInline style={{ display: 'none' }} />

        {divider}

        <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 8px' }}>
          Assessment Rules
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: T.sub, fontSize: 12.5, lineHeight: 1.8 }}>
          <li>Copy / paste is disabled</li>
          <li>Tab switching is monitored</li>
          <li>Right-click is disabled</li>
          <li>All activity is recorded</li>
          <li>Results reviewed if violations are found</li>
        </ul>

        {divider}

        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${T.bdr}`,
              background: 'transparent', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            style={{
              flex: 1.6, padding: '12px', borderRadius: 10, border: 'none',
              background: canStart ? 'linear-gradient(135deg,#3B82F6,#8B5CF6)' : T.bdr,
              color: canStart ? '#fff' : T.muted, fontWeight: 900, fontSize: 13,
              cursor: canStart ? 'pointer' : 'not-allowed',
            }}
          >
            {starting ? 'Starting…' : 'Start Assessment →'}
          </button>
        </div>
      </div>
    </div>
  );
}
