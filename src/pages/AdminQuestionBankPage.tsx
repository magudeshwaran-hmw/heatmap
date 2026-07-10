import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDark, mkTheme } from '@/lib/themeContext';
import { toast } from '@/lib/ToastContext';
import { QE_ALL_SKILLS } from '@/lib/qeSkillTaxonomy';
import { QUESTION_BANK } from '@/data/questionBank/index';
import {
  apiQBCoverage, apiQBItems, apiQBValidate, apiQBUpload, apiQBToggle, apiQBDelete, apiQBSeed,
  apiGetBlueprint, apiSaveBlueprint, type QBItem, type QBUploadResult,
} from '@/lib/api';
import { ArrowLeft, Upload, CheckCircle2, X, FileJson, Trash2, Eye, ChevronRight } from 'lucide-react';

type Level = 'beginner' | 'intermediate' | 'expert';
type View = 'hub' | Level;

// Per-type "how it works" — shown on each level page so authoring is self-explanatory.
interface TypeInfo { key: string; label: string; target: number; how: string; author: string }
const LEVEL_META: Record<Level, { color: string; blurb: string; types: TypeInfo[] }> = {
  beginner: {
    color: '#10B981',
    blurb: 'Fundamentals — auto-graded. Pass mark 60%.',
    types: [
      { key: 'mcq', label: 'MCQ', target: 20, how: '4-option multiple choice. Auto-graded by correct option, with negative marking (+1 right, −0.5 wrong).', author: 'question, options[], correct (A–D or 1-based)' },
      { key: 'toolId', label: 'Tool ID', target: 5, how: 'Candidate types the tool name from a description. Correct if the answer contains at least half the keywords.', author: 'description, correctAnswer, keywords[]' },
      { key: 'practical', label: 'Practical', target: 2, how: 'Short written task. Scored on the fraction of expected keywords found + minimum length.', author: 'task, expectedKeywords[], minLength' },
    ],
  },
  intermediate: {
    color: '#3B82F6',
    blurb: 'Applied skill — code + reasoning. Pass mark 65%.',
    types: [
      { key: 'mcq', label: 'MCQ', target: 15, how: '4-option multiple choice, same grading as Beginner.', author: 'question, options[], correct' },
      { key: 'coding', label: 'Coding', target: 2, how: 'Real code run by Judge0 against test cases (input → expectedOutput; hidden cases count too). Score = 50% visible + 50% hidden.', author: 'title, description, testCases[{input,expectedOutput,hidden}] (+ starterCode, timeLimit)' },
      { key: 'scenarios', label: 'Scenarios', target: 2, how: 'Open written answer. Scored on word-count + domain keywords.', author: 'question, minWords, scoringKeywords[]' },
      { key: 'framework', label: 'Framework', target: 1, how: 'Design/architecture answer. Scored on architecture terms + keywords + length.', author: 'question, minWords' },
    ],
  },
  expert: {
    color: '#8B5CF6',
    blurb: 'Engine-generated from a blueprint — you don’t upload questions here. Pass mark 70%.',
    types: [],
  },
};

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

  const [view, setView] = useState<View>('hub');
  // coverage[level][skill][qtype] = count
  const [coverage, setCoverage] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [previewSkill, setPreviewSkill] = useState<string | null>(null);
  const [previewLevel, setPreviewLevel] = useState<Level>('beginner');
  const [previewItems, setPreviewItems] = useState<QBItem[]>([]);

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
    try {
      const { rows } = await apiQBCoverage(lvl);
      const map: Record<string, Record<string, number>> = {};
      for (const r of rows) { (map[r.skill_name] ||= {})[r.qtype] = r.n; }
      setCoverage(c => ({ ...c, [lvl]: map }));
    } catch { /* silent — hub still renders */ }
  }, []);

  useEffect(() => { loadCoverage('beginner'); loadCoverage('intermediate'); }, [loadCoverage]);

  // Count skills that have ANY question for a level.
  const startedSkills = (lvl: Level) => Object.values(coverage[lvl] || {}).filter(m => Object.values(m).some(n => n > 0)).length;

  const openPreview = async (skill: string, lvl: Level) => {
    setPreviewSkill(skill); setPreviewLevel(lvl); setPreviewItems([]);
    try { const { items } = await apiQBItems(skill, lvl); setPreviewItems(items); }
    catch (e: any) { toast.error(e?.message || 'Could not load questions'); }
  };
  const toggleItem = async (id: number) => {
    try { const r = await apiQBToggle(id); setPreviewItems(p => p.map(i => i.id === id ? { ...i, active: r.active } : i)); }
    catch (e: any) { toast.error(e?.message || 'Toggle failed'); }
  };
  const deleteItem = async (id: number) => {
    try { await apiQBDelete(id); setPreviewItems(p => p.filter(i => i.id !== id)); loadCoverage(previewLevel); }
    catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  // One-click migrate the built-in static question bank (Python, SQL, Selenium, API
  // Testing, …) into the DB so it shows here and becomes the source of truth. De-duped.
  const [importing, setImporting] = useState(false);
  const importExisting = async () => {
    setImporting(true);
    try {
      const batches: any[] = [];
      for (const [skill, bank] of Object.entries(QUESTION_BANK as any)) {
        const b: any = bank;
        if (b?.beginner) batches.push({ skill, level: 'Beginner', mcq: b.beginner.mcq || [], toolId: b.beginner.toolId || [], practical: b.beginner.practical || [] });
        if (b?.intermediate) batches.push({ skill, level: 'Intermediate', mcq: b.intermediate.mcq || [], coding: b.intermediate.coding || [], scenarios: b.intermediate.scenarios || [], framework: b.intermediate.framework || [] });
      }
      const r = await apiQBSeed(batches);
      toast.success(`Imported ${r.inserted} existing questions${r.skipped ? ` · ${r.skipped} already present` : ''} ✓`);
      loadCoverage('beginner'); loadCoverage('intermediate');
    } catch (e: any) { toast.error(e?.message || 'Import failed'); }
    finally { setImporting(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '30px 6vw 90px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {view === 'hub' ? (
          <Hub T={T} navigate={navigate} startedSkills={startedSkills} onOpen={setView} onImport={importExisting} importing={importing} />
        ) : view === 'expert' ? (
          <ExpertPage T={T} onBack={() => setView('hub')} />
        ) : (
          <LevelPage
            T={T} dark={dark} level={view} families={families}
            coverage={coverage[view] || {}}
            onBack={() => setView('hub')}
            onUploaded={() => loadCoverage(view)}
            onPreview={(skill) => openPreview(skill, view)}
          />
        )}

        {/* Preview drawer (shared) */}
        {previewSkill && (
          <div onClick={() => setPreviewSkill(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', height: '100%', background: T.cardSolid, borderLeft: `1px solid ${T.bdr}`, overflowY: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div><div style={{ fontSize: 18, fontWeight: 900 }}>{previewSkill}</div><div style={{ fontSize: 12.5, color: T.sub, textTransform: 'capitalize' }}>{previewLevel} · {previewItems.length} questions</div></div>
                <button onClick={() => setPreviewSkill(null)} style={{ background: 'transparent', border: 'none', color: T.sub, cursor: 'pointer' }}><X size={22} /></button>
              </div>
              {previewItems.length === 0 && <p style={{ color: T.sub, fontSize: 13.5 }}>No questions yet for this skill / level.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {previewItems.map(it => (
                  <div key={it.id} style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16, opacity: it.active ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#3B82F6', background: 'rgba(59,130,246,0.12)', padding: '3px 9px', borderRadius: 999 }}>{it.qtype}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => toggleItem(it.id)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: 'transparent', color: it.active ? '#10B981' : T.muted, cursor: 'pointer' }}>{it.active ? 'Active' : 'Inactive'}</button>
                        <button onClick={() => deleteItem(it.id)} style={{ padding: '3px 8px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: 'transparent', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 9 }}>{it.question_text}</div>
                    {Array.isArray(it.options) && it.options.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {it.options.map((o: string, i: number) => (
                          <div key={i} style={{ fontSize: 12.5, padding: '6px 11px', borderRadius: 7, background: i === it.correct_option ? 'rgba(16,185,129,0.14)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'), color: i === it.correct_option ? '#10B981' : T.sub, fontWeight: i === it.correct_option ? 800 : 500, display: 'flex', gap: 8 }}>
                            <span>{String.fromCharCode(65 + i)}.</span><span>{o}</span>{i === it.correct_option && <CheckCircle2 size={14} style={{ marginLeft: 'auto' }} />}
                          </div>
                        ))}
                      </div>
                    )}
                    {it.qtype === 'coding' && it.payload?.testCases && <div style={{ fontSize: 12, color: T.sub, marginTop: 7 }}>{it.payload.testCases.length} test case(s) · evaluated by Judge0</div>}
                    {it.qtype === 'toolId' && it.payload?.correctAnswer && <div style={{ fontSize: 12.5, color: '#10B981', marginTop: 7, fontWeight: 700 }}>Answer: {it.payload.correctAnswer}</div>}
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

// ── HUB: pick a level ─────────────────────────────────────────────────────────
function Hub({ T, navigate, startedSkills, onOpen, onImport, importing }: any) {
  const total = QE_ALL_SKILLS.length;
  const card = (level: Level) => {
    const m = LEVEL_META[level];
    const started = level === 'expert' ? null : startedSkills(level);
    return (
      <button key={level} onClick={() => onOpen(level)}
        style={{ textAlign: 'left', background: T.card, border: `1px solid ${T.bdr}`, borderTop: `4px solid ${m.color}`, borderRadius: 16, padding: 24, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: m.color, textTransform: 'capitalize' }}>{level}</span>
          <ChevronRight size={20} color={T.muted} />
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: T.sub, minHeight: 40 }}>{m.blurb}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {level === 'expert'
            ? <span style={{ fontSize: 11.5, fontWeight: 700, color: m.color, background: `${m.color}1a`, padding: '4px 10px', borderRadius: 999 }}>Blueprint editor</span>
            : m.types.map(t => <span key={t.key} style={{ fontSize: 11.5, fontWeight: 700, color: T.sub, background: T.input, border: `1px solid ${T.bdr}`, padding: '4px 10px', borderRadius: 999 }}>{t.label} ×{t.target}</span>)}
        </div>
        {started !== null && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}><b style={{ color: T.text }}>{started}</b> / {total} skills started</div>}
      </button>
    );
  };
  return (
    <>
      <button onClick={() => navigate('/admin')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}><ArrowLeft size={16} /> Back to Admin</button>
      <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>📚 Question Bank</h1>
      <p style={{ margin: '0 0 18px', color: T.sub, fontSize: 15, maxWidth: 640 }}>Build the ZenAssess questions for all {total} skills. Pick a level to work on — each opens its own focused page.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 28, padding: 14, borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}` }}>
        <span style={{ fontSize: 13, color: T.sub, flex: 1, minWidth: 220 }}>Already have built-in questions (Python, SQL, Selenium, API Testing…)? Import them into the database so they show &amp; save here.</span>
        <button onClick={onImport} disabled={importing} style={{ padding: '9px 18px', borderRadius: 10, background: importing ? T.input : '#3B82F6', color: importing ? T.sub : '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer', flexShrink: 0 }}>{importing ? 'Importing…' : 'Import existing questions → DB'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {(['beginner', 'intermediate', 'expert'] as Level[]).map(card)}
      </div>
    </>
  );
}

// ── LEVEL PAGE: beginner / intermediate ───────────────────────────────────────
function LevelPage({ T, dark, level, families, coverage, onBack, onUploaded, onPreview }: any) {
  const meta = LEVEL_META[level as Level];
  const types: TypeInfo[] = meta.types;
  // Surface any skills that have questions in the DB but aren't in the 166 taxonomy
  // (the imported built-in bank: Python, SQL, Selenium, API Testing, …).
  const knownNames = useMemo(() => new Set(QE_ALL_SKILLS.map(s => s.name)), []);
  const extraSkills = Object.keys(coverage || {}).filter((s: string) => !knownNames.has(s)).sort();
  const allFamilies: [string, string[]][] = extraSkills.length ? [...families, ['Core skills (existing bank)', extraSkills]] : families;
  const [uploadText, setUploadText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QBUploadResult | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<{ skill: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const parse = (): any | null => { try { return JSON.parse(uploadText); } catch { toast.error('That is not valid JSON.'); return null; } };
  const onValidate = async () => { const b = parse(); if (!b) return; setBusy(true); try { setResult(await apiQBValidate(b)); } catch (e: any) { toast.error(e?.message || 'Validate failed'); } finally { setBusy(false); } };
  const onUpload = async () => { const b = parse(); if (!b) return; setBusy(true); try { const r = await apiQBUpload(b); setResult(r); toast.success(`Uploaded: ${r.inserted} added${r.skipped ? ` · ${r.skipped} skipped` : ''}`); onUploaded(); } catch (e: any) { toast.error(e?.message || 'Upload failed'); } finally { setBusy(false); } };
  const downloadTemplate = () => { const blob = new Blob([JSON.stringify(TEMPLATES[level as Exclude<Level, 'expert'>], null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${level}_template.json`; a.click(); URL.revokeObjectURL(a.href); };
  const onFile = (f: File | null) => { if (!f) return; const r = new FileReader(); r.onload = () => setUploadText(String(r.result || '')); r.readAsText(f); };

  const cellStyle = (count: number, target: number) => { const c = count >= target ? '#10B981' : count > 0 ? '#F59E0B' : '#EF4444'; return { color: c, background: `${c}1f`, display: 'inline-flex', minWidth: 46, justifyContent: 'center', padding: '4px 9px', borderRadius: 7, fontWeight: 800, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' as const }; };

  return (
    <>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}><ArrowLeft size={16} /> All levels</button>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 900, textTransform: 'capitalize', color: meta.color }}>{level} questions</h1>
      <p style={{ margin: '0 0 26px', color: T.sub, fontSize: 14.5 }}>{meta.blurb}</p>

      {/* How these work */}
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
        <button onClick={() => setShowHow(s => !s)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: T.text, padding: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>How {level} questions work</span>
          <span style={{ color: T.muted, fontSize: 13 }}>{showHow ? 'Hide' : 'Show'}</span>
        </button>
        {showHow && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 18 }}>
            {types.map(t => (
              <div key={t.key} style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: meta.color }}>{t.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'ui-monospace, monospace', color: T.muted }}>×{t.target}</span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: T.sub, lineHeight: 1.55 }}>{t.how}</p>
                <div style={{ fontSize: 11, color: T.muted }}><b style={{ color: T.text }}>Author:</b> {t.author}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add questions — two easy ways */}
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Add questions</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: T.sub }}>Two easy ways — no code or JSON needed.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: meta.color }}>① One at a time</div>
            <p style={{ margin: 0, fontSize: 12.5, color: T.sub, flex: 1 }}>Pick a skill in the list below and click <b style={{ color: T.text }}>+ Add</b>. A guided form walks you through every field — including coding test cases.</p>
            <div style={{ fontSize: 12, color: T.muted }}>↓ scroll to the skills table</div>
          </div>
          <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: meta.color }}>② Bulk from a spreadsheet</div>
            <p style={{ margin: 0, fontSize: 12.5, color: T.sub, flex: 1 }}>Have lots of MCQs in Excel? Paste the rows and import them all at once — de-duped automatically.</p>
            <button onClick={() => setBulkOpen(true)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9, background: meta.color, border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><Upload size={15} /> Paste from Excel / CSV</button>
          </div>
        </div>

        {/* Advanced: whole-skill JSON / file (power users) */}
        <button onClick={() => setShowAdvanced(s => !s)} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{showAdvanced ? '▾' : '▸'} Advanced — whole-skill JSON / file upload</button>
        {showAdvanced && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: T.sub }}>One JSON file per skill (skill auto-detected). Sections: {types.map(t => t.key).join(', ')}. Partial files are fine.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><FileJson size={15} /> Template</button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <Upload size={15} /> Choose file<input type="file" accept=".json" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
            <textarea value={uploadText} onChange={e => setUploadText(e.target.value)} placeholder="Paste JSON here, or use “Template” then “Choose file”."
              style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: 14, borderRadius: 10, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={onValidate} disabled={busy || !uploadText.trim()} style={{ padding: '10px 20px', borderRadius: 9, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 800, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>Validate</button>
              <button onClick={onUpload} disabled={busy || !uploadText.trim()} style={{ padding: '10px 20px', borderRadius: 9, background: '#10B981', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Working…' : 'Upload'}</button>
            </div>
            {result && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, fontSize: 13 }}>
                <div style={{ fontWeight: 800, color: result.errors.length ? '#F59E0B' : '#10B981', marginBottom: 6 }}>{result.skill} · {result.level} — {'inserted' in result && result.inserted != null ? `${result.inserted} added` : `${result.willInsert} ready`}{result.errors.length ? ` · ${result.errors.length} problem(s)` : ' ✓'}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: T.sub, fontSize: 12 }}>{Object.entries(result.summary || {}).map(([k, v]) => <span key={k}><b style={{ color: T.text }}>{k}</b>: {v.valid}/{v.total}</span>)}</div>
                {result.errors.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#EF4444', fontSize: 12, maxHeight: 150, overflowY: 'auto' }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coverage — pick a family → then a skill, add questions manually */}
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{openFamily ? openFamily : 'Add questions — pick a family'}</h3>
      {!openFamily ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {allFamilies.map(([family, skills]: [string, string[]]) => {
            const started = skills.filter(s => types.some((t: TypeInfo) => (coverage[s]?.[t.key] || 0) > 0)).length;
            const ready = skills.filter(s => types.every((t: TypeInfo) => (coverage[s]?.[t.key] || 0) >= t.target)).length;
            return (
              <button key={family} onClick={() => setOpenFamily(family)}
                style={{ textAlign: 'left', background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{family}</span>
                  <ChevronRight size={18} color={T.muted} />
                </div>
                <div style={{ fontSize: 12.5, color: T.sub }}>{skills.length} skills · <b style={{ color: '#10B981' }}>{ready} ready</b> · {started} started</div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <button onClick={() => setOpenFamily(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.sub, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}><ArrowLeft size={14} /> All families</button>
          <div style={{ background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                    <th style={{ padding: '11px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: T.sub, fontWeight: 800 }}>Skill</th>
                    {types.map((t: TypeInfo) => <th key={t.key} style={{ padding: '11px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: T.sub, fontWeight: 800, whiteSpace: 'nowrap' }}>{t.label} / {t.target}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(allFamilies.find(([f]: any) => f === openFamily)?.[1] || []).map((skill: string) => (
                    <tr key={skill} style={{ borderTop: `1px solid ${T.bdr}` }}>
                      <td style={{ padding: '10px 16px', color: T.text, fontWeight: 600 }}>{skill}</td>
                      {types.map((t: TypeInfo) => { const n = coverage[skill]?.[t.key] || 0; return <td key={t.key} style={{ padding: '10px 16px' }}><span style={cellStyle(n, t.target)}>{n}</span></td>; })}
                      <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setAddFor({ skill })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8, background: `${meta.color}1a`, border: 'none', color: meta.color, fontWeight: 800, fontSize: 11.5, cursor: 'pointer', marginRight: 6 }}>+ Add</button>
                        <button onClick={() => onPreview(skill)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3B82F6', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}><Eye size={13} /> View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {addFor && (
        <AddQuestionModal T={T} dark={dark} level={level} skill={addFor.skill} types={types}
          onClose={() => setAddFor(null)}
          onSaved={() => { setAddFor(null); onUploaded(); }} />
      )}

      {bulkOpen && (
        <BulkPasteModal T={T} dark={dark} level={level}
          onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); onUploaded(); }} />
      )}
    </>
  );
}

// ── Manual add-a-single-question popup (per skill × type) ─────────────────────
function AddQuestionModal({ T, dark, level, skill, types, onClose, onSaved }: any) {
  const [qtype, setQtype] = useState<string>(types[0]?.key || 'mcq');
  const [saving, setSaving] = useState(false);
  // shared/typed fields
  const [f, setF] = useState<any>({ question: '', options: ['', '', '', ''], correct: 'A', explanation: '', difficulty: 'MEDIUM', description: '', correctAnswer: '', keywords: '', task: '', expectedKeywords: '', minLength: 30, title: '', testCases: [{ input: '', expectedOutput: '', hidden: false }], timeLimit: 30, minWords: 60, scoringKeywords: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const csv = (s: string) => s.split(',').map((x: string) => x.trim()).filter(Boolean);

  // Test-case rows for coding questions — form-driven, no JSON to type.
  const setTC = (i: number, k: string, v: any) => setF((p: any) => { const tc = p.testCases.map((r: any, j: number) => j === i ? { ...r, [k]: v } : r); return { ...p, testCases: tc }; });
  const addTC = () => setF((p: any) => ({ ...p, testCases: [...p.testCases, { input: '', expectedOutput: '', hidden: false }] }));
  const removeTC = (i: number) => setF((p: any) => ({ ...p, testCases: p.testCases.length > 1 ? p.testCases.filter((_: any, j: number) => j !== i) : p.testCases }));

  const buildItem = (): any | string => {
    if (qtype === 'mcq') {
      const opts = f.options.map((o: string) => o.trim()).filter(Boolean);
      if (!f.question.trim()) return 'Enter the question.';
      if (opts.length < 2) return 'Enter at least 2 options.';
      return { question: f.question, options: opts, correct: f.correct, explanation: f.explanation, difficulty: f.difficulty };
    }
    if (qtype === 'toolId') {
      if (!f.description.trim() || !f.correctAnswer.trim()) return 'Enter a description and the correct tool name.';
      return { description: f.description, correctAnswer: f.correctAnswer, keywords: csv(f.keywords || f.correctAnswer) };
    }
    if (qtype === 'practical') {
      if (!f.task.trim()) return 'Enter the task.';
      return { task: f.task, expectedKeywords: csv(f.expectedKeywords), minLength: Number(f.minLength) || 30 };
    }
    if (qtype === 'coding') {
      if (!f.title.trim() && !f.description.trim()) return 'Enter a title/description.';
      const tc = (f.testCases as any[])
        .map((t: any) => ({ input: String(t.input ?? ''), expectedOutput: String(t.expectedOutput ?? ''), hidden: !!t.hidden }))
        .filter((t: any) => t.input.trim() !== '' || t.expectedOutput.trim() !== '');
      if (tc.length < 1) return 'Add at least one test case (input + expected output).';
      return { title: f.title, description: f.description, testCases: tc, timeLimit: Number(f.timeLimit) || 30 };
    }
    // scenarios / framework
    if (!f.question.trim()) return 'Enter the question.';
    return { question: f.question, minWords: Number(f.minWords) || 0, scoringKeywords: csv(f.scoringKeywords) };
  };

  const save = async () => {
    const item = buildItem();
    if (typeof item === 'string') { toast.error(item); return; }
    setSaving(true);
    try {
      await apiQBUpload({ skill, level, mode: 'append', [qtype]: [item] });
      toast.success(`Added a ${qtype} question to ${skill} ✓`);
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontSize: 13.5, boxSizing: 'border-box' as const };
  const lbl = { fontSize: 12, fontWeight: 800, color: T.sub, display: 'block', marginBottom: 5, marginTop: 12 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(600px, 100%)', background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Add a question</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.sub, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, color: T.sub }}><b style={{ color: T.text }}>{skill}</b> · <span style={{ textTransform: 'capitalize' }}>{level}</span></p>

        <label style={lbl}>Question type</label>
        <select value={qtype} onChange={e => setQtype(e.target.value)} style={inp}>
          {types.map((t: TypeInfo) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>

        {qtype === 'mcq' && (<>
          <label style={lbl}>Question</label><textarea value={f.question} onChange={e => set('question', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
          {['A', 'B', 'C', 'D'].map((L, i) => (
            <div key={L}><label style={lbl}>Option {L}</label><input value={f.options[i]} onChange={e => setF((p: any) => { const o = [...p.options]; o[i] = e.target.value; return { ...p, options: o }; })} style={inp} /></div>
          ))}
          <label style={lbl}>Correct option</label>
          <select value={f.correct} onChange={e => set('correct', e.target.value)} style={inp}>{['A', 'B', 'C', 'D'].map(L => <option key={L} value={L}>{L}</option>)}</select>
          <label style={lbl}>Explanation (optional)</label><input value={f.explanation} onChange={e => set('explanation', e.target.value)} style={inp} />
        </>)}

        {qtype === 'toolId' && (<>
          <label style={lbl}>Description (what the tool does)</label><textarea value={f.description} onChange={e => set('description', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
          <label style={lbl}>Correct tool name</label><input value={f.correctAnswer} onChange={e => set('correctAnswer', e.target.value)} style={inp} />
          <label style={lbl}>Accepted keywords (comma-separated)</label><input value={f.keywords} onChange={e => set('keywords', e.target.value)} placeholder="e.g. tensorboard, tensor board" style={inp} />
        </>)}

        {qtype === 'practical' && (<>
          <label style={lbl}>Task</label><textarea value={f.task} onChange={e => set('task', e.target.value)} style={{ ...inp, minHeight: 70, resize: 'vertical' }} />
          <label style={lbl}>Expected keywords (comma-separated)</label><input value={f.expectedKeywords} onChange={e => set('expectedKeywords', e.target.value)} style={inp} />
          <label style={lbl}>Minimum length (chars)</label><input type="number" value={f.minLength} onChange={e => set('minLength', e.target.value)} style={inp} />
        </>)}

        {qtype === 'coding' && (<>
          <label style={lbl}>Title</label><input value={f.title} onChange={e => set('title', e.target.value)} style={inp} />
          <label style={lbl}>Description</label><textarea value={f.description} onChange={e => set('description', e.target.value)} style={{ ...inp, minHeight: 70, resize: 'vertical' }} />
          <label style={lbl}>Test cases <span style={{ fontWeight: 500, color: T.muted }}>— input → expected output. Tick “Hidden” to keep a case secret from the candidate.</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(f.testCases as any[]).map((tc: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
                <input value={tc.input} onChange={e => setTC(i, 'input', e.target.value)} placeholder={`Input ${i + 1}`} style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
                <input value={tc.expectedOutput} onChange={e => setTC(i, 'expectedOutput', e.target.value)} placeholder="Expected output" style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.sub, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!tc.hidden} onChange={e => setTC(i, 'hidden', e.target.checked)} /> Hidden
                </label>
                <button type="button" onClick={() => removeTC(i)} title="Remove test case" style={{ padding: '7px 9px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: 'transparent', color: '#EF4444', cursor: 'pointer', opacity: (f.testCases as any[]).length > 1 ? 1 : 0.35 }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addTC} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>+ Add test case</button>
          <label style={lbl}>Time limit (seconds)</label><input type="number" value={f.timeLimit} onChange={e => set('timeLimit', e.target.value)} style={inp} />
        </>)}

        {(qtype === 'scenarios' || qtype === 'framework') && (<>
          <label style={lbl}>Question / prompt</label><textarea value={f.question} onChange={e => set('question', e.target.value)} style={{ ...inp, minHeight: 70, resize: 'vertical' }} />
          <label style={lbl}>Minimum words</label><input type="number" value={f.minWords} onChange={e => set('minWords', e.target.value)} style={inp} />
          <label style={lbl}>Scoring keywords (comma-separated)</label><input value={f.scoringKeywords} onChange={e => set('scoringKeywords', e.target.value)} style={inp} />
        </>)}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={save} disabled={saving} style={{ padding: '11px 22px', borderRadius: 9, background: '#10B981', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Add question'}</button>
          <button onClick={onClose} disabled={saving} style={{ padding: '11px 22px', borderRadius: 9, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk MCQ import — paste straight from Excel / Google Sheets / CSV, no JSON ──
function BulkPasteModal({ T, dark, level, onClose, onSaved }: any) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Split a CSV/TSV line honouring double-quoted fields (Excel paste = tab-separated).
  const splitLine = (line: string, d: string) => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else { if (c === '"') q = true; else if (c === d) { out.push(cur); cur = ''; } else cur += c; }
    }
    out.push(cur); return out.map(s => s.trim());
  };
  // Resolve the "correct" cell (A–D, 1–4, or the option's own text) to a letter A–D.
  const toLetter = (raw: string, opts: string[]): string | null => {
    const v = String(raw || '').trim();
    if (/^[A-Da-d]$/.test(v)) return v.toUpperCase();
    if (/^[1-4]$/.test(v)) return 'ABCD'[Number(v) - 1];
    const i = opts.findIndex(o => o.trim() !== '' && norm(o) === norm(v));
    return i >= 0 ? 'ABCD'[i] : null;
  };

  const parse = () => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) { toast.error('Paste a header row plus at least one question row.'); return; }
    const d = lines[0].includes('\t') ? '\t' : ',';
    const H = splitLine(lines[0], d).map(norm);
    const find = (names: string[]) => H.findIndex(h => names.includes(h));
    const iSkill = find(['skill', 'skillname']);
    const iQ = find(['question', 'q', 'questiontext']);
    const iA = find(['a', 'optiona', 'option1', 'opt1', 'opta']);
    const iB = find(['b', 'optionb', 'option2', 'opt2', 'optb']);
    const iC = find(['c', 'optionc', 'option3', 'opt3', 'optc']);
    const iD = find(['d', 'optiond', 'option4', 'opt4', 'optd']);
    const iCorr = find(['correct', 'answer', 'correctoption', 'correctanswer', 'key']);
    const iExp = find(['explanation', 'reason', 'explain']);
    if (iSkill < 0 || iQ < 0 || iCorr < 0) { toast.error('Header must include at least: skill, question, A, B, C, D, correct.'); return; }
    const parsed = lines.slice(1).map((line, n) => {
      const raw = splitLine(line, d);
      const skill = (raw[iSkill] || '').trim();
      const question = (raw[iQ] || '').trim();
      const rawOpts = [iA, iB, iC, iD].map(ix => ix >= 0 ? (raw[ix] || '').trim() : '');
      const filled = rawOpts.map((o, i) => ({ o, i })).filter(x => x.o !== '');
      const correctLetter = toLetter(raw[iCorr] || '', rawOpts);
      const correctIdxOrig = correctLetter ? 'ABCD'.indexOf(correctLetter) : -1;
      const pos = filled.findIndex(x => x.i === correctIdxOrig);
      const options = filled.map(x => x.o);
      let error = '';
      if (!skill) error = 'missing skill';
      else if (!question) error = 'missing question';
      else if (options.length < 2) error = 'need at least 2 options';
      else if (pos < 0) error = 'correct answer must be A–D and point to a filled option';
      return { rowNum: n + 2, skill, question, options, correct: pos >= 0 ? 'ABCD'[pos] : '', explanation: iExp >= 0 ? (raw[iExp] || '').trim() : '', error };
    });
    setRows(parsed);
  };

  const valid = (rows || []).filter(r => !r.error);
  const invalid = (rows || []).filter(r => r.error);

  const doImport = async () => {
    if (valid.length === 0) { toast.error('No valid rows to import.'); return; }
    setBusy(true);
    try {
      const bySkill: Record<string, any[]> = {};
      valid.forEach(r => { (bySkill[r.skill] ||= []).push({ question: r.question, options: r.options, correct: r.correct, explanation: r.explanation || '' }); });
      const batches = Object.entries(bySkill).map(([skill, mcq]) => ({ skill, level, mcq }));
      const res = await apiQBSeed(batches);
      toast.success(`Imported ${res.inserted} question(s)${res.skipped ? ` · ${res.skipped} skipped/duplicate` : ''} ✓`);
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Import failed'); }
    finally { setBusy(false); }
  };

  const loadExample = () => setText(
    'skill\tquestion\tA\tB\tC\tD\tcorrect\texplanation\n' +
    'Java\tWhich keyword makes a variable a constant in Java?\tfinal\tconst\tstatic\tlet\tA\tfinal makes a value unmodifiable.\n' +
    'Java\tWhat does JVM stand for?\tJava Virtual Machine\tJava Variable Method\tJoint Virtual Memory\tJava Verified Module\tA\t'
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100%)', background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Bulk import MCQs — paste from a spreadsheet</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.sub, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.sub, textTransform: 'capitalize' }}>{level} · multiple-choice questions</p>

        <div style={{ padding: 12, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 700, marginBottom: 4 }}>How to use</div>
          <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6 }}>
            In Excel/Sheets make columns: <b style={{ color: T.text }}>skill · question · A · B · C · D · correct</b> (optionally <b style={{ color: T.text }}>explanation</b>). Put the answer in <b style={{ color: T.text }}>correct</b> as a letter (A–D), a number (1–4), or the exact option text. Copy the rows including the header and paste below.
          </div>
          <button onClick={loadExample} style={{ marginTop: 8, padding: '5px 11px', borderRadius: 7, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>Load an example</button>
        </div>

        <textarea value={text} onChange={e => { setText(e.target.value); setRows(null); }} placeholder="Paste your spreadsheet rows here (with the header row)…"
          style={{ width: '100%', minHeight: 130, resize: 'vertical', padding: 12, borderRadius: 10, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <button onClick={parse} disabled={!text.trim()} style={{ padding: '10px 20px', borderRadius: 9, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 800, fontSize: 13, cursor: text.trim() ? 'pointer' : 'not-allowed' }}>Preview</button>
          {rows && <button onClick={doImport} disabled={busy || valid.length === 0} style={{ padding: '10px 20px', borderRadius: 9, background: '#10B981', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy || valid.length === 0 ? 'not-allowed' : 'pointer', opacity: busy || valid.length === 0 ? 0.6 : 1 }}>{busy ? 'Importing…' : `Import ${valid.length} question${valid.length === 1 ? '' : 's'}`}</button>}
          {rows && <span style={{ fontSize: 12.5, color: T.sub }}><b style={{ color: '#10B981' }}>{valid.length} ready</b>{invalid.length ? <> · <b style={{ color: '#EF4444' }}>{invalid.length} to fix</b></> : null}</span>}
        </div>

        {rows && (
          <div style={{ marginTop: 14, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', textAlign: 'left', position: 'sticky', top: 0 }}>
                <th style={{ padding: '8px 12px', color: T.sub, fontWeight: 800 }}>#</th>
                <th style={{ padding: '8px 12px', color: T.sub, fontWeight: 800 }}>Skill</th>
                <th style={{ padding: '8px 12px', color: T.sub, fontWeight: 800 }}>Question</th>
                <th style={{ padding: '8px 12px', color: T.sub, fontWeight: 800 }}>Ans</th>
                <th style={{ padding: '8px 12px', color: T.sub, fontWeight: 800 }}>Status</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.bdr}`, background: r.error ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                    <td style={{ padding: '7px 12px', color: T.muted }}>{r.rowNum}</td>
                    <td style={{ padding: '7px 12px', color: T.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.skill || '—'}</td>
                    <td style={{ padding: '7px 12px', color: T.sub, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.question || '—'}</td>
                    <td style={{ padding: '7px 12px', color: T.text, fontWeight: 800 }}>{r.correct || '—'}</td>
                    <td style={{ padding: '7px 12px' }}>{r.error ? <span style={{ color: '#EF4444', fontWeight: 700 }}>{r.error}</span> : <span style={{ color: '#10B981', fontWeight: 700 }}>✓ ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EXPERT PAGE: blueprint editor ─────────────────────────────────────────────
function ExpertPage({ T, onBack }: any) {
  const [skill, setSkill] = useState(QE_ALL_SKILLS[0]?.name || '');
  const [bp, setBp] = useState<any>({ noun: '', unit: '', role: '', qualities: '', failureModes: '', stakeholders: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!skill) return;
    apiGetBlueprint(skill).then(({ blueprint }) => {
      if (blueprint) setBp({ noun: blueprint.noun || '', unit: blueprint.unit || '', role: blueprint.role || '', qualities: (blueprint.qualities || []).join(', '), failureModes: (blueprint.failure_modes || []).join(', '), stakeholders: (blueprint.stakeholders || []).join(', ') });
      else setBp({ noun: '', unit: '', role: '', qualities: '', failureModes: '', stakeholders: '' });
    }).catch(() => {});
  }, [skill]);

  const save = async () => { setSaving(true); try { await apiSaveBlueprint(skill, bp); toast.success(`Blueprint saved for ${skill} ✓`); } catch (e: any) { toast.error(e?.message || 'Save failed'); } finally { setSaving(false); } };
  const field = (label: string, key: string, hint: string) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12.5, fontWeight: 800, color: T.sub, display: 'block', marginBottom: 6 }}>{label} <span style={{ fontWeight: 500, color: T.muted }}>— {hint}</span></label>
      <input value={bp[key]} onChange={e => setBp((p: any) => ({ ...p, [key]: e.target.value }))} style={{ width: '100%', padding: '11px 13px', borderRadius: 9, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontSize: 13.5, boxSizing: 'border-box' }} />
    </div>
  );

  return (
    <>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}><ArrowLeft size={16} /> All levels</button>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 900, color: '#8B5CF6' }}>Expert — blueprint</h1>
      <p style={{ margin: '0 0 24px', color: T.sub, fontSize: 14.5 }}>Expert isn’t uploaded as questions.</p>
      <div style={{ padding: 16, borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', marginBottom: 22, fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>
        ZenAssess <b>generates</b> the Expert test from this compact blueprint — scenario groups made of auto-graded primitives (single · multi · ordering · match · matrix). Edit the 6 fields per skill to steer what it generates. The capstone is issued after the test and evaluated from the candidate’s GitHub repo.
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24, maxWidth: 640 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12.5, fontWeight: 800, color: T.sub, display: 'block', marginBottom: 6 }}>Skill</label>
          <select value={skill} onChange={e => setSkill(e.target.value)} style={{ width: '100%', padding: '11px 13px', borderRadius: 9, border: `1px solid ${T.inputBdr}`, background: T.input, color: T.text, fontSize: 13.5 }}>
            {QE_ALL_SKILLS.map(s => <option key={s.id} value={s.name}>{s.name} — {s.family}</option>)}
          </select>
        </div>
        {field('Noun', 'noun', 'what the role owns, e.g. "data platform"')}
        {field('Unit', 'unit', 'throughput unit, e.g. "queries", "requests/sec"')}
        {field('Role', 'role', 'persona, e.g. "Principal Data Architect"')}
        {field('Qualities', 'qualities', 'comma-separated, e.g. "integrity, latency, consistency"')}
        {field('Failure modes', 'failureModes', 'comma-separated, e.g. "replication lag, data corruption"')}
        {field('Stakeholders', 'stakeholders', 'comma-separated, e.g. "the CTO, Data Governance"')}
        <button onClick={save} disabled={saving} style={{ padding: '11px 22px', borderRadius: 9, background: '#8B5CF6', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save blueprint'}</button>
      </div>
    </>
  );
}
