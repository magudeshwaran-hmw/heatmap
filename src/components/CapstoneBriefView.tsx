import React from 'react';
import type { CapstoneBrief, ComponentSubmission } from '../lib/capstoneEngine';

/**
 * CapstoneBriefView — renders a generated CapstoneBrief: the business brief, the
 * 5 deliverable components (with requirements, tables, repo trees, sample
 * findings), the marking rubric and the 70-vs-90 differentiators. When not
 * read-only it also exposes the per-component submission surface (link + notes).
 *
 * Layout/presentation only — scoring/persistence live in capstoneEngine.ts and
 * are driven by the parent through `submissions` + `onChange`.
 */

const SUBMIT_LABEL: Record<string, string> = {
  repo: 'Git repository',
  evidence: 'Evidence / report link',
  document: 'Document',
  written: 'Written answer',
};

export interface CapstoneBriefViewProps {
  brief: CapstoneBrief;
  submissions: Record<string, ComponentSubmission>;
  onChange?: (componentId: string, patch: ComponentSubmission) => void;
  readOnly?: boolean;
  theme: any;     // mkTheme() result
  dark: boolean;
}

const CapstoneBriefView: React.FC<CapstoneBriefViewProps> = ({ brief, submissions, onChange, readOnly, theme: T, dark }) => {
  const label = (txt: string) => (
    <strong style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{txt}</strong>
  );
  const cardStyle: React.CSSProperties = { padding: 16, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` };

  const renderTable = (tbl: NonNullable<CapstoneBrief['components'][number]['table']>) => (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      {tbl.title && <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 }}>{tbl.title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>{tbl.headers.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${T.bdr}`, color: T.sub, fontWeight: 800, whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {tbl.rows.map((r, ri) => (
            <tr key={ri}>{r.map((cVal, ci) => <td key={ci} style={{ padding: '6px 8px', borderBottom: `1px solid ${T.bdr}`, color: T.text, verticalAlign: 'top' }}>{cVal}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* The brief */}
      <div style={{ ...cardStyle, background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)' }}>
        {label('The brief')}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {brief.brief.map((p, i) => <p key={i} style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.65 }}>{p}</p>)}
        </div>
      </div>

      {/* Components */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {label(`What to submit — ${brief.components.length} components`)}
        {brief.components.map((c, idx) => {
          const sub = submissions[c.id] || {};
          const wantsLink = c.submit === 'repo' || c.submit === 'evidence';
          return (
            <div key={c.id} style={{ border: `1px solid ${T.bdr}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, color: T.text }}>Component {idx + 1} — {c.name}</strong>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#3B82F6', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: 6 }}>{SUBMIT_LABEL[c.submit]}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: T.sub, lineHeight: 1.55 }}>{c.summary}</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.requirements.map((r, ri) => <li key={ri} style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{r}</li>)}
              </ul>
              {c.table && renderTable(c.table)}
              {c.codeTree && (
                <pre style={{ margin: '4px 0 0', padding: 12, borderRadius: 8, background: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)', border: `1px solid ${T.bdr}`, fontFamily: "'JetBrains Mono','Courier New',monospace", fontSize: 11.5, color: '#10B981', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{c.codeTree}</pre>
              )}
              {c.sampleFinding && (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: 'italic', lineHeight: 1.5, padding: '6px 10px', borderLeft: '3px solid rgba(245,158,11,0.6)', background: 'rgba(245,158,11,0.06)', borderRadius: 4 }}>Assessor looks for — {c.sampleFinding}</div>
              )}
              {/* Submission surface */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, borderTop: `1px dashed ${T.bdr}`, paddingTop: 10 }}>
                {wantsLink && (
                  <input
                    value={sub.link || ''} disabled={readOnly}
                    onChange={e => onChange?.(c.id, { link: e.target.value })}
                    placeholder={c.submit === 'repo' ? 'https://github.com/you/your-repo' : 'Link to your report / dashboard / evidence'}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 12.5, boxSizing: 'border-box', opacity: readOnly ? 0.7 : 1 }}
                  />
                )}
                <textarea
                  value={sub.notes || ''} disabled={readOnly}
                  onChange={e => onChange?.(c.id, { notes: e.target.value })}
                  placeholder={wantsLink ? 'Summarise what you built and how it meets the requirements above…' : 'Write your answer / summary here…'}
                  style={{ width: '100%', height: 96, padding: 12, borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box', opacity: readOnly ? 0.7 : 1 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Marking rubric */}
      <div style={cardStyle}>
        {label(`Marking rubric — total 100, pass ≥ ${brief.passMark}`)}
        {renderTable({ headers: ['Criteria', 'Max', 'What the assessor looks for'], rows: brief.rubric.map(r => [r.criteria, String(r.max), r.lookFor]) })}
      </div>

      {/* 70 vs 90 differentiators */}
      <div style={cardStyle}>
        {label('What separates a 90% submission from a 70%')}
        {renderTable({ headers: ['Dimension', '70% — Passes', '90% — Excels'], rows: brief.differentiators.map(d => [d.dimension, d.pass, d.excel]) })}
      </div>
    </div>
  );
};

export default CapstoneBriefView;
