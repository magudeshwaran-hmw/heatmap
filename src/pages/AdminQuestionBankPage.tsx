import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDark, mkTheme } from '@/lib/themeContext';
import { toast } from '@/lib/ToastContext';
import { QE_ALL_SKILLS } from '@/lib/qeSkillTaxonomy';
import {
  apiQBCoverage, apiQBItems, apiQBValidate, apiQBUpload, apiQBToggle, apiQBDelete,
  apiGetBlueprint, apiSaveBlueprint, type QBItem, type QBUploadResult,
} from '@/lib/api';
import { ArrowLeft, Upload, CheckCircle2, X, FileJson, Trash2, Eye } from 'lucide-react';

type Level = 'beginner' | 'intermediate' | 'expert';

// Question types + target counts per level (mirrors ZenAssess LEVEL_FORMAT).
const LEVEL_TYPES: Record<Exclude<Level, 'expert'>, { key: string; label: string; target: number }[]> = {
  beginner: [
    { key: 'mcq', label: 'MCQ', target: 20 },
    { key: 'toolId', label: 'Tool ID', target: 5 },
    { key: 'practical', label: 'Practical', target: 2 },
  ],
  intermediate: [
    { key: 'mcq', label: 'MCQ', target: 15 },
    { key: 'coding', label: 'Coding', target: 2 },
    { key: 'scenarios', label: 'Scenarios', target: 2 },
    { key: 'framework', label: 'Framework', target: 1 },
  ],
};

// A downloadable starter template per level (one filled example per type).
const TEMPLATES: Record<Exclude<Level, 'expert'>, any> = {
  beginner: {
    skill: 'Deep Learning', level: 'Beginner',
    mcq: [{ question: 'Which layer is core to a CNN?', options: ['Convolutional', 'Recurrent', 'Dropout', 'Embedding'], correct: 'A', explanation: 'CNNs are built on convolutional layers.', difficulty: 'EASY' }],
    toolId: [{ description: 'Shows live training loss curves at localhost:6006', correctAnswer: 'TensorBoard', keywords: ['tensorboard'] }],
    practical: [{ task: 'Write a function that normalises an image tensor to 0-1.', expectedKeywords: ['/255', 'return'], minLength: 30 }],
  },
  intermediate: {
    skill: 'Deep Learning', level: 'Intermediate',
    mcq: [{ question: 'What does dropout prevent?', options: ['Overfitting', 'Underfitting', 'Vanishing gradient', 'Data leakage'], correct: 'A' }],
    coding: [{ title: 'Two Sum', description: 'Return indices of the two numbers adding to target.', examples: [{ input: '2 7 11 15\\n9', output: '0 1' }], testCases: [{ input: '2 7 11 15\\n9', expectedOutput: '0 1', hidden: false }, { input: '3 3\\n6', expectedOutput: '0 1', hidden: true }], starterCode: { python: 'def two_sum(nums, target):\\n    pass' }, timeLimit: 30 }],
    scenarios: [{ question: 'A model overfits in production. Walk through your diagnosis.', minWords: 60, scoringKeywords: ['regularization', 'validation', 'data'] }],
    framework: [{ question: 'Design a retraining pipeline for a drifting model.', minWords: 80 }],
  },
};

export default function AdminQuestionBankPage() {
  const navigate = useNavigate();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [level, setLevel] = useState<Level>('beginner');
  const [coverage, setCoverage] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QBUploadResult | null>(null);
  const [previewSkill, setPreviewSkill] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<QBItem[]>([]);

  // Skills grouped by family, in taxonomy order.
  const families = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of QE_ALL_SKILLS) {
      if (!m.has(s.family)) m.set(s.family, []);
      const arr = m.get(s.family)!;
      if (!arr.includes(s.name)) arr.push(s.name);
    }
    return Array.from(m.entries());
  }, []);

  const loadCoverage = useCallback(async (lvl: Level) => {
    if (lvl === 'expert') return;
    setLoading(true);
    try {
      const { rows } = await apiQBCoverage(lvl);
      const map: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        if (!map[r.skill_name]) map[r.skill_name] = {};
        map[r.skill_name][r.qtype] = r.n;
      }
      setCoverage(map);
    } catch (e: any) { toast.error('Could not load coverage: ' + (e?.message || 'error')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCoverage(level); }, [level, loadCoverage]);

  const parseUpload = (): any | null => {
    try { return JSON.parse(uploadText); }
    catch { toast.error('That is not valid JSON — check the file.'); return null; }
  };

  const onValidate = async () => {
    const body = parseUpload(); if (!body) return;
    setBusy(true);
    try { setResult(await apiQBValidate(body)); }
    catch (e: any) { toast.error(e?.message || 'Validation failed'); }
    finally { setBusy(false); }
  };

  const onUpload = async () => {
    const body = parseUpload(); if (!body) return;
    setBusy(true);
    try {
      const r = await apiQBUpload(body);
      setResult(r);
      toast.success(`Uploaded: ${r.inserted} added${r.skipped ? ` · ${r.skipped} skipped` : ''}`);
      await loadCoverage(level);
    } catch (e: any) { toast.error(e?.message || 'Upload failed'); }
    finally { setBusy(false); }
  };

  const openPreview = async (skill: string) => {
    setPreviewSkill(skill); setPreviewItems([]);
    try { const { items } = await apiQBItems(skill, level); setPreviewItems(items); }
    catch (e: any) { toast.error(e?.message || 'Could not load questions'); }
  };

  const toggleItem = async (id: number) => {
    try { const r = await apiQBToggle(id); setPreviewItems(p => p.map(i => i.id === id ? { ...i, active: r.active } : i)); }
    catch (e: any) { toast.error(e?.message || 'Toggle failed'); }
  };
  const deleteItem = async (id: number) => {
    try { await apiQBDelete(id); setPreviewItems(p => p.filter(i => i.id !== id)); loadCoverage(level); }
    catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  const downloadTemplate = () => {
    if (level === 'expert') return;
    const blob = new Blob([JSON.stringify(TEMPLATES[level], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${level}_template.json`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setUploadText(String(r.result || ''));
    r.readAsText(f);
  };

  const types = level !== 'expert' ? LEVEL_TYPES[level] : [];
  const cellStyle = (count: number, target: number) => {
    const state = count >= target ? 'ok' : count > 0 ? 'thin' : 'empty';
    const colors = { ok: '#10B981', thin: '#F59E0B', empty: '#EF4444' };
    const c = colors[state];
    return { color: c, background: `${c}1f`, display: 'inline-flex', minWidth: 46, justifyContent: 'center', padding: '3px 8px', borderRadius: 7, fontWeight: 800, fontSize: 12, fontVariantNumeric: 'tabular-nums' as const };
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '28px 5vw 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <button onClick={() => navigate('/admin')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>
          <ArrowLeft size={16} /> Back to Admin
        </button>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>📚 Question Bank</h1>
        <p style={{ margin: '0 0 20px', color: T.sub, fontSize: 14 }}>Build &amp; manage the ZenAssess questions — {QE_ALL_SKILLS.length} skills × Beginner / Intermediate / Expert. Upload one level at a time; the skill is read from the file.</p>

        {/* Level tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['beginner', 'intermediate', 'expert'] as Level[]).map(l => (
            <button key={l} onClick={() => { setLevel(l); setResult(null); }}
              style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${level === l ? 'transparent' : T.bdr}`, background: level === l ? '#3B82F6' : T.card, color: level === l ? '#fff' : T.text, fontWeight: 800, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' }}>{l}</button>
          ))}
        </div>

        {level === 'expert' ? (
          <ExpertBlueprintEditor T={T} />
        ) : (
          <>
            {/* Upload panel */}
            <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, textTransform: 'capitalize' }}>Upload {level} questions</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}><FileJson size={15} /> Template</button>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    <Upload size={15} /> Choose file
                    <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
              <textarea value={uploadText} onChange={e => setUploadText(e.target.value)} placeholder={`Paste JSON for a ${level} skill here, or use "Choose file". Types: ${types.map(t => t.key).join(', ')}.`}
                style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: 12, borderRadius: 10, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={onValidate} disabled={busy || !uploadText.trim()} style={{ padding: '9px 18px', borderRadius: 9, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 800, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>Validate</button>
                <button onClick={onUpload} disabled={busy || !uploadText.trim()} style={{ padding: '9px 18px', borderRadius: 9, background: '#10B981', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Working…' : 'Upload'}</button>
              </div>
              {result && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, fontSize: 13 }}>
                  <div style={{ fontWeight: 800, color: result.errors.length ? '#F59E0B' : '#10B981', marginBottom: 6 }}>
                    {result.skill} · {result.level} — {'inserted' in result && result.inserted != null ? `${result.inserted} added` : `${result.willInsert} ready`}{result.errors.length ? ` · ${result.errors.length} problem(s)` : ' ✓'}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: T.sub, fontSize: 12 }}>
                    {Object.entries(result.summary || {}).map(([k, v]) => <span key={k}><b style={{ color: T.text }}>{k}</b>: {v.valid}/{v.total}</span>)}
                  </div>
                  {result.errors.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#EF4444', fontSize: 12, maxHeight: 140, overflowY: 'auto' }}>
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Coverage matrix */}
            <div style={{ background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: T.sub, fontWeight: 800 }}>Skill</th>
                      {types.map(t => <th key={t.key} style={{ padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: T.sub, fontWeight: 800, whiteSpace: 'nowrap' }}>{t.label} / {t.target}</th>)}
                      <th style={{ padding: '10px 14px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={types.length + 2} style={{ padding: 24, textAlign: 'center', color: T.sub }}>Loading…</td></tr>
                    ) : families.map(([family, skills]) => (
                      <Fragment key={family}>
                        <tr><td colSpan={types.length + 2} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: '#8B5CF6', background: dark ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.04)' }}>{family}</td></tr>
                        {skills.map(skill => (
                          <tr key={family + skill} style={{ borderTop: `1px solid ${T.bdr}` }}>
                            <td style={{ padding: '8px 14px', color: T.text, fontWeight: 600 }}>{skill}</td>
                            {types.map(t => {
                              const n = coverage[skill]?.[t.key] || 0;
                              return <td key={t.key} style={{ padding: '8px 14px' }}><span style={cellStyle(n, t.target)}>{n}</span></td>;
                            })}
                            <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                              <button onClick={() => openPreview(skill)} title="Preview questions" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3B82F6', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}><Eye size={13} /> View</button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Preview drawer */}
        {previewSkill && (
          <div onClick={() => setPreviewSkill(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', height: '100%', background: T.cardSolid, borderLeft: `1px solid ${T.bdr}`, overflowY: 'auto', padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div><div style={{ fontSize: 17, fontWeight: 900 }}>{previewSkill}</div><div style={{ fontSize: 12, color: T.sub, textTransform: 'capitalize' }}>{level} · {previewItems.length} questions</div></div>
                <button onClick={() => setPreviewSkill(null)} style={{ background: 'transparent', border: 'none', color: T.sub, cursor: 'pointer' }}><X size={22} /></button>
              </div>
              {previewItems.length === 0 && <p style={{ color: T.sub, fontSize: 13 }}>No questions yet for this skill / level.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {previewItems.map(it => (
                  <div key={it.id} style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 14, opacity: it.active ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#3B82F6', background: 'rgba(59,130,246,0.12)', padding: '2px 8px', borderRadius: 999 }}>{it.qtype}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => toggleItem(it.id)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: 'transparent', color: it.active ? '#10B981' : T.muted, cursor: 'pointer' }}>{it.active ? 'Active' : 'Inactive'}</button>
                        <button onClick={() => deleteItem(it.id)} style={{ padding: '3px 8px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: 'transparent', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 8 }}>{it.question_text}</div>
                    {Array.isArray(it.options) && it.options.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {it.options.map((o: string, i: number) => (
                          <div key={i} style={{ fontSize: 12.5, padding: '5px 10px', borderRadius: 7, background: i === it.correct_option ? 'rgba(16,185,129,0.14)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'), color: i === it.correct_option ? '#10B981' : T.sub, fontWeight: i === it.correct_option ? 800 : 500, display: 'flex', gap: 8 }}>
                            <span>{String.fromCharCode(65 + i)}.</span><span>{o}</span>{i === it.correct_option && <CheckCircle2 size={14} style={{ marginLeft: 'auto' }} />}
                          </div>
                        ))}
                      </div>
                    )}
                    {it.qtype === 'coding' && it.payload?.testCases && (
                      <div style={{ fontSize: 11.5, color: T.sub, marginTop: 6 }}>{it.payload.testCases.length} test case(s) · evaluated by Judge0</div>
                    )}
                    {(it.qtype === 'toolId') && it.payload?.correctAnswer && (
                      <div style={{ fontSize: 12, color: '#10B981', marginTop: 6, fontWeight: 700 }}>Answer: {it.payload.correctAnswer}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Expert: blueprint editor (Expert is engine-generated, not uploaded as MCQ) ──
function ExpertBlueprintEditor({ T }: { T: any }) {
  const [skill, setSkill] = useState(QE_ALL_SKILLS[0]?.name || '');
  const [bp, setBp] = useState<any>({ noun: '', unit: '', role: '', qualities: '', failureModes: '', stakeholders: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!skill) return;
    apiGetBlueprint(skill).then(({ blueprint }) => {
      if (blueprint) setBp({
        noun: blueprint.noun || '', unit: blueprint.unit || '', role: blueprint.role || '',
        qualities: (blueprint.qualities || []).join(', '),
        failureModes: (blueprint.failure_modes || []).join(', '),
        stakeholders: (blueprint.stakeholders || []).join(', '),
      });
      else setBp({ noun: '', unit: '', role: '', qualities: '', failureModes: '', stakeholders: '' });
    }).catch(() => {});
  }, [skill]);

  const save = async () => {
    setSaving(true);
    try {
      await apiSaveBlueprint(skill, {
        noun: bp.noun, unit: bp.unit, role: bp.role,
        qualities: bp.qualities, failureModes: bp.failureModes, stakeholders: bp.stakeholders,
      });
      toast.success(`Blueprint saved for ${skill} ✓`);
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const field = (label: string, key: string, hint: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 800, color: T.sub, display: 'block', marginBottom: 5 }}>{label} <span style={{ fontWeight: 500, color: T.muted }}>— {hint}</span></label>
      <input value={bp[key]} onChange={e => setBp((p: any) => ({ ...p, [key]: e.target.value }))}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
    </div>
  );

  return (
    <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 22 }}>
      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', marginBottom: 18, fontSize: 13, color: T.text }}>
        <b>Expert is engine-generated.</b> ZenAssess builds Expert scenario groups (single / multi / ordering / match / matrix — all auto-graded) from this compact <b>blueprint</b>, not uploaded MCQs. Edit these 6 fields per skill to steer the generated scenarios.
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 800, color: T.sub, display: 'block', marginBottom: 5 }}>Skill</label>
        <select value={skill} onChange={e => setSkill(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontSize: 13 }}>
          {QE_ALL_SKILLS.map(s => <option key={s.id} value={s.name}>{s.name} — {s.family}</option>)}
        </select>
      </div>
      {field('Noun', 'noun', 'what the role owns, e.g. "data platform"')}
      {field('Unit', 'unit', 'the throughput unit, e.g. "queries", "requests/sec"')}
      {field('Role', 'role', 'the persona, e.g. "Principal Data Architect"')}
      {field('Qualities', 'qualities', 'comma-separated, e.g. "integrity, latency, consistency"')}
      {field('Failure modes', 'failureModes', 'comma-separated, e.g. "replication lag, data corruption"')}
      {field('Stakeholders', 'stakeholders', 'comma-separated, e.g. "the CTO, Data Governance"')}
      <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: 9, background: '#8B5CF6', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save blueprint'}</button>
    </div>
  );
}
