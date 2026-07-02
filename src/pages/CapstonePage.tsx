import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Clock, ArrowLeft } from 'lucide-react';
import { useDark, mkTheme } from '@/lib/themeContext';
import { useAuth } from '../lib/authContext';
import AppHeader from '../components/AppHeader';
import CapstoneBriefView from '../components/CapstoneBriefView';
import {
  getCapstoneBrief, getActiveCapstone, capstoneTimeLeft,
  saveCapstoneProgress, completeCapstone, clearCapstone,
  type CapstoneState, type ComponentSubmission,
} from '../lib/capstoneEngine';

/**
 * CapstonePage — the standalone, deadline-gated Expert capstone.
 *
 * Reached from the assessment Result page (or resumed later while the 2-week
 * window is open). It resolves the candidate's active capstone, renders the full
 * brief, captures per-component deliverables and certifies Expert at 100% on
 * submission. If the window has lapsed, it forces a full Expert re-take.
 */
const CapstonePage: React.FC = () => {
  const { dark } = useDark();
  const T = mkTheme(dark);
  const navigate = useNavigate();
  const { employeeId } = useAuth();

  // Resolve the active capstone once per mount (localStorage-backed).
  const initial = useMemo<CapstoneState | null>(() => getActiveCapstone(employeeId || ''), [employeeId]);
  const [state, setState] = useState<CapstoneState | null>(initial);
  const [submissions, setSubmissions] = useState<Record<string, ComponentSubmission>>(initial?.submissions || {});

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text }}>
      <AppHeader />
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <button onClick={() => navigate('/employee/zenassess')} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.card, color: T.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Back to ZenAssess
        </button>
        {children}
      </div>
    </div>
  );

  // No capstone issued for this user.
  if (!state) {
    return wrap(
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Award size={32} color={T.muted} style={{ margin: '0 auto' }} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>No capstone pending</h2>
        <p style={{ margin: 0, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>A capstone is issued after you clear an Expert-level skill test. Complete an Expert assessment first, then return here to submit your capstone deliverable.</p>
        <button onClick={() => navigate('/employee/zenassess')} style={{ alignSelf: 'center', padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', color: '#fff', fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer', marginTop: 6 }}>Go to ZenAssess</button>
      </div>
    );
  }

  const brief = getCapstoneBrief(state.skill);
  const left = capstoneTimeLeft(state);
  const deadlineStr = new Date(state.deadline).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const onChange = (cid: string, patch: ComponentSubmission) => {
    setSubmissions(prev => {
      const next = { ...prev, [cid]: { ...prev[cid], ...patch } };
      saveCapstoneProgress(employeeId || '', state.skill, next); // best-effort autosave
      return next;
    });
  };

  // ── COMPLETED ──────────────────────────────────────────────────────────────
  if (state.status === 'completed') {
    return wrap(
      <>
        <div style={{ background: T.card, border: '1px solid rgba(16,185,129,0.45)', borderRadius: 24, padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Award size={36} color="#10B981" style={{ margin: '0 auto' }} />
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Expert level 100% complete</h2>
          <p style={{ margin: 0, fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
            Your {state.skill} capstone has been submitted and scored <strong style={{ color: '#10B981' }}>{state.score}%</strong>. Your Expert certification for {state.skill} is now fully complete.
          </p>
          <button onClick={() => navigate('/employee/dashboard')} style={{ alignSelf: 'center', padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer', marginTop: 6 }}>Go to Dashboard</button>
        </div>
        <CapstoneBriefView brief={brief} submissions={submissions} readOnly theme={T} dark={dark} />
      </>
    );
  }

  // ── EXPIRED → force full Expert re-take ──────────────────────────────────────
  if (state.status === 'expired') {
    return wrap(
      <div style={{ background: T.card, border: '1px solid rgba(239,68,68,0.45)', borderRadius: 24, padding: 36, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Clock size={34} color="#EF4444" style={{ margin: '0 auto' }} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Capstone window expired</h2>
        <p style={{ margin: 0, fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
          The 2-week window for your {state.skill} capstone has passed, so the Expert certification is incomplete. You’ll need to <strong>retake the Expert assessment from the start</strong> to earn a new capstone window.
        </p>
        <button
          onClick={() => { clearCapstone(employeeId || '', state.skill); navigate('/employee/zenassess'); }}
          style={{ alignSelf: 'center', padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#EF4444,#B91C1C)', color: '#fff', fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer', marginTop: 6 }}
        >
          Retake Expert Assessment →
        </button>
      </div>
    );
  }

  // ── PENDING (in progress) ────────────────────────────────────────────────────
  const submittedCount = brief.components.filter(c => {
    const s = submissions[c.id] || {};
    return (s.link && s.link.trim()) || (s.notes && s.notes.trim());
  }).length;
  const allSubmitted = submittedCount === brief.components.length;
  const timerColor = left.days >= 3 ? '#10B981' : left.days >= 1 ? '#F59E0B' : '#EF4444';

  const onSubmit = () => {
    if (!allSubmitted && !window.confirm(`Only ${submittedCount} of ${brief.components.length} components have an entry. Submit anyway? Unsubmitted components score 0.`)) return;
    if (!window.confirm('Submit your capstone? This certifies your Expert level and cannot be edited afterwards.')) return;
    const updated = completeCapstone(employeeId || '', state.skill, submissions);
    if (updated) { setState(updated); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  return wrap(
    <>
      {/* Header / deadline */}
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} color="#F59E0B" />
            <strong style={{ fontSize: 12, color: '#F59E0B', textTransform: 'uppercase' }}>Capstone — {brief.skill}</strong>
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900 }}>{brief.title}</h1>
          <span style={{ fontSize: 12.5, color: T.muted }}>Role: {brief.role} · Pass mark ≥ {brief.passMark}% · {brief.deliverable}</span>
        </div>
        <div style={{ textAlign: 'right', minWidth: 160 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: timerColor, fontWeight: 900, fontSize: 16 }}>
            <Clock size={16} /> {left.days}d {left.hours}h left
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Deadline: {deadlineStr}</div>
        </div>
      </div>

      <CapstoneBriefView brief={brief} submissions={submissions} onChange={onChange} theme={T} dark={dark} />

      {/* Submit bar */}
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', position: 'sticky', bottom: 16 }}>
        <span style={{ fontSize: 12.5, color: T.sub }}>{submittedCount} / {brief.components.length} components have an entry · progress autosaves</span>
        <button onClick={onSubmit} style={{ padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer' }}>Submit Capstone</button>
      </div>
    </>
  );
};

export default CapstonePage;
