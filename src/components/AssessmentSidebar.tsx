import React, { useState } from 'react';

/**
 * AssessmentSidebar — reusable, sticky right-hand navigator for the continuous
 * assessment experience. Renders the timer, submit button, per-section question
 * palette (numbers wrap automatically, 5 per row) and a status legend.
 *
 * Layout/navigation only — it owns no answer/scoring/timer logic; the parent
 * passes derived state in and handles navigation + submit via callbacks.
 */

export type QuestionStatus = 'current' | 'answered' | 'marked' | 'visited' | 'unvisited';

export interface SidebarItem {
  num: number;          // 1-based number shown inside the section
  globalIdx: number;    // flat index used for navigation
  status: QuestionStatus;
}

export interface SidebarSection {
  key: string;
  label: string;
  items: SidebarItem[];
}

export interface AssessmentSidebarProps {
  timerText: string;
  timerColor: string;
  sections: SidebarSection[];
  onNavigate: (globalIdx: number) => void;
  onSubmit: () => void;
  submitLabel?: string;
  theme: any;           // mkTheme() result (T)
  dark: boolean;
}

const STATUS_STYLE = (status: QuestionStatus, T: any, dark: boolean): React.CSSProperties => {
  const base: React.CSSProperties = {
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 12,
    cursor: 'pointer',
    border: `1px solid ${T.bdr}`,
    background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    color: T.sub,
    transition: 'transform 0.12s',
  };
  switch (status) {
    case 'current':
      return { ...base, border: '2px solid #3B82F6', background: 'rgba(59,130,246,0.12)', color: '#3B82F6' };
    case 'answered':
      return { ...base, background: 'rgba(16,185,129,0.14)', color: '#10B981', border: '1px solid rgba(16,185,129,0.4)' };
    case 'marked':
      return { ...base, background: 'rgba(245,158,11,0.16)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.45)' };
    case 'visited':
      return { ...base, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', color: T.text };
    default:
      return base;
  }
};

const LEGEND: { status: QuestionStatus; label: string }[] = [
  { status: 'current', label: 'Current' },
  { status: 'answered', label: 'Answered' },
  { status: 'marked', label: 'Marked for Review' },
  { status: 'visited', label: 'Visited' },
  { status: 'unvisited', label: 'Not Visited' },
];

// Accessible, high-contrast legend swatch colors (fill + 2px border).
const LEGEND_COLORS: Record<QuestionStatus, { fill: string; border: string }> = {
  current:   { fill: '#2563EB', border: '#1D4ED8' },
  answered:  { fill: '#10B981', border: '#059669' },
  marked:    { fill: '#F59E0B', border: '#D97706' },
  visited:   { fill: '#6B7280', border: '#4B5563' },
  unvisited: { fill: '#D1D5DB', border: '#9CA3AF' },
};

const AssessmentSidebar: React.FC<AssessmentSidebarProps> = ({
  timerText, timerColor, sections, onNavigate, onSubmit, submitLabel = 'Submit Test', theme: T, dark,
}) => {
  const [open, setOpen] = useState(false); // drawer state (tablet / mobile)

  const panel = (
    <div className="assess-sidebar-panel" style={{
      background: T.card,
      border: `1px solid ${T.bdr}`,
      borderRadius: 20,
      padding: 18,
      // Reserve room at the bottom so the legend/last palette can scroll clear of
      // the fixed bottom-right webcam/proctoring PiP and is never covered by it.
      paddingBottom: 168,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Timer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${T.bdr}` }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Left</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>{timerText}</span>
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
      >
        {submitLabel}
      </button>

      {/* Section palettes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        {sections.map(section => (
          <div key={section.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 11, textTransform: 'uppercase', color: T.sub, letterSpacing: '0.04em' }}>{section.label}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {section.items.map(item => (
                <div
                  key={item.globalIdx}
                  onClick={() => { onNavigate(item.globalIdx); setOpen(false); }}
                  style={STATUS_STYLE(item.status, T, dark)}
                >
                  {item.num}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend — high-contrast, accessible in both light & dark themes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${T.bdr}`, paddingTop: 12 }}>
        <strong style={{ fontSize: 11, textTransform: 'uppercase', color: dark ? '#E5E7EB' : '#374151', letterSpacing: '0.04em' }}>Legend</strong>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEGEND.map(l => (
            <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 14,
                height: 14,
                flexShrink: 0,
                borderRadius: '50%',
                background: LEGEND_COLORS[l.status].fill,
                border: `2px solid ${LEGEND_COLORS[l.status].border}`,
                boxSizing: 'border-box',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: dark ? '#E5E7EB' : '#374151' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Single source of truth: the panel is rendered EXACTLY ONCE below. On
  // desktop/laptop it is a sticky right column; at ≤1024px the same element
  // becomes a slide-in drawer. No second copy is ever rendered.
  return (
    <>
      <style>{`
        .assess-sidebar-wrap { width: 300px; flex-shrink: 0; }
        .assess-sidebar { position: sticky; top: 16px; align-self: flex-start; max-height: calc(100vh - 24px); overflow-y: auto; }
        .assess-sidebar-toggle { display: none; }
        .assess-sidebar-backdrop { display: none; }
        @media (max-width: 1024px) {
          .assess-sidebar-wrap { width: 0; flex-basis: 0; }
          .assess-sidebar { position: fixed; top: 0; right: 0; height: 100vh; max-height: 100vh; width: 320px; max-width: 88vw; z-index: 1100; transform: translateX(105%); transition: transform 0.25s ease; }
          .assess-sidebar.open { transform: translateX(0); box-shadow: -8px 0 30px rgba(0,0,0,0.3); }
          .assess-sidebar-toggle { display: inline-flex; }
          .assess-sidebar-backdrop.open { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1090; }
        }
      `}</style>

      <div className="assess-sidebar-wrap">
        <div className={`assess-sidebar${open ? ' open' : ''}`}>{panel}</div>
      </div>

      {/* Drawer toggle — bottom-LEFT so it never collides with the bottom-right webcam PiP */}
      <button
        className="assess-sidebar-toggle"
        onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: 18, left: 18, zIndex: 1101, padding: '12px 16px', borderRadius: 999, border: 'none', background: '#3B82F6', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}
      >
        ☰ Navigator
      </button>
      <div className={`assess-sidebar-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
    </>
  );
};

export default AssessmentSidebar;
