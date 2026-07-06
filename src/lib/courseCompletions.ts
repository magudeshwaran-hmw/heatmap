/**
 * courseCompletions.ts — Excel-driven course-completion flags for the Skill Groups tab.
 *
 * The admin uploads a completion LOG (many rows — one per person per course):
 *   ID / Name, Course/Skill name, Status.
 * A row only counts when its Status is a "completed" value (Completed / Yes / TS / …).
 * The Course/Skill name is keyword-matched to one of three flags:
 *     aiForQe · qeForAi · testAutomation
 *
 * Result: a per-person set of YES flags. No upload → everyone is NO. The upload is
 * removable (→ back to all NO) and each person can be reset individually. Persisted
 * in the database (skill_group_completions) with a localStorage mirror for instant
 * paint / offline. The raw rows are NOT retained — only the computed YES flags.
 */

export type CompletionFlag = 'aiForQe' | 'qeForAi' | 'testAutomation';

export interface CompletionFlags {
  aiForQe: boolean;
  qeForAi: boolean;
  testAutomation: boolean;
}

/** One resolved person → their Yes flags. Maps 1:1 to a DB row. */
export interface CompletionRecord {
  empKey: string;   // stable key: id (preferred) or name, lowercased
  empId: string;
  empName: string;
  aiForQe: boolean;
  qeForAi: boolean;
  testAutomation: boolean;
}

/** What we persist — no raw rows, just the computed per-person records. */
export interface StoredCompletions {
  fileName: string;
  uploadedAt: string;   // ISO
  records: CompletionRecord[];
}

const STORE_KEY = 'qe_course_completions';
const EMPTY_FLAGS: CompletionFlags = { aiForQe: false, qeForAi: false, testAutomation: false };

// ─── Course/skill name → flag keyword rules ──────────────────────────────────
// Checked independently; a course may map to more than one flag. Phrases are
// matched as substrings against the lowercased, space-collapsed course name.
const FLAG_KEYWORDS: Record<CompletionFlag, string[]> = {
  // QE for AI (AssureAI) — testing OF AI/ML & Gen-AI systems.
  qeForAi: [
    'qe for ai', 'assureai', 'assure ai', 'testing ai', 'testing of ai', 'ai testing',
    'ai/ml testing', 'ml testing', 'machine learning testing', 'model testing',
    'llm testing', 'rag validation', 'prompt validation', 'hallucination',
    'ai safety', 'bias testing', 'fairness testing', 'explainability',
    'responsible ai', 'gen ai testing', 'genai testing', 'defect prediction',
  ],
  // AI for QE (Zense.AI QI) — using AI/Gen-AI to DO quality engineering.
  aiForQe: [
    'ai for qe', 'zense', 'zense.ai', 'gen ai', 'genai', 'generative ai',
    'large language model', 'llm', 'agentic', 'rag engineering', 'prompt engineering',
    'vector database', 'ai test generation', 'ai test optimization', 'ai driven',
    'ai-driven', 'ai augmented', 'ai-augmented', 'copilot', 'ai adoption',
    'autonomous test', 'self healing', 'self-healing',
  ],
  // Test Automation (SDET) — automation frameworks & tooling.
  testAutomation: [
    'automation', 'selenium', 'playwright', 'cypress', 'appium', 'webdriver',
    'wdio', 'sdet', 'rest assured', 'restassured', 'karate', 'testng', 'cucumber',
    'bdd', 'tdd', 'api automation', 'ui automation', 'mobile automation',
    'framework', 'tosca', 'uft', 'accelq',
  ],
};

// Direct per-person Yes/No columns (preferred format). Header text is normalized
// (lowercased, non-alphanumerics stripped) before matching.
const FLAG_COLUMNS: Record<CompletionFlag, string[]> = {
  aiForQe: ['testaiforqezenseaiqi', 'testaiforqe', 'aiforqe', 'zenseaiqi', 'zenseai'],
  qeForAi: ['testqeforaiassureai', 'testqeforai', 'qeforai', 'assureai'],
  testAutomation: ['testautomation', 'automation'],
};

/** Map a course/skill name to the flags it grants (may be several, or none). */
export function courseToFlags(name: string): CompletionFlag[] {
  const t = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out: CompletionFlag[] = [];
  (Object.keys(FLAG_KEYWORDS) as CompletionFlag[]).forEach(flag => {
    if (FLAG_KEYWORDS[flag].some(kw => t.includes(kw))) out.push(flag);
  });
  return out;
}

// ─── Completion-status detection ─────────────────────────────────────────────
const DONE_EXACT = new Set([
  'completed', 'complete', 'yes', 'y', 'ts', 'pass', 'passed', 'done',
  'finished', 'certified', 'achieved', 'success', 'true', '1', '100', '100%',
]);

/** True when a Status cell means "completed". */
export function isCompleted(status: string): boolean {
  const s = String(status || '').toLowerCase().replace(/\s+/g, '');
  if (!s) return false;
  if (DONE_EXACT.has(s)) return true;
  return /complet|passed?|finish|certif|achiev|success/.test(s);
}

/** True when a Yes/No flag cell means "Yes". Blank or "No" → false. */
function isYes(v: string): boolean {
  const s = String(v || '').toLowerCase().replace(/\s+/g, '');
  if (!s || s === 'no' || s === 'n' || s === 'false' || s === '0') return false;
  return DONE_EXACT.has(s) || /^y|complet|passed?|✓|✔/.test(s);
}

// ─── Parse an uploaded sheet (array of row objects) ──────────────────────────
const norm = (k: string) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse an uploaded sheet → one CompletionRecord per person (merged). */
export function parseCompletionRows(raw: any[], fileName: string): StoredCompletions {
  // Keyed by a stable person key so multiple rows for the same person merge.
  const byKey = new Map<string, CompletionRecord>();
  const allFlagCols = ([] as string[]).concat(...Object.values(FLAG_COLUMNS));

  const upsert = (id: string, name: string, flags: CompletionFlag[]) => {
    const key = (id || name).toLowerCase().trim();
    if (!key) return;
    const rec = byKey.get(key) || { empKey: key, empId: id, empName: name, aiForQe: false, qeForAi: false, testAutomation: false };
    if (id && !rec.empId) rec.empId = id;
    if (name && !rec.empName) rec.empName = name;
    flags.forEach(f => { rec[f] = true; });
    byKey.set(key, rec);
  };

  (raw || []).forEach(r => {
    const get = (...names: string[]): string => {
      for (const key of Object.keys(r)) {
        if (names.includes(norm(key))) { const v = String(r[key]).trim(); if (v) return v; }
      }
      return '';
    };
    const id = get('id', 'empid', 'employeeid', 'zensarid', 'associateid', 'associateno');
    const name = get('name', 'employeename', 'associatename', 'fullname', 'learnername');

    // Preferred format: one row per person with direct Yes/No flag columns.
    const keysNorm = Object.keys(r).map(norm);
    const hasFlagCols = allFlagCols.some(c => keysNorm.includes(c));

    let flags: CompletionFlag[];
    if (hasFlagCols) {
      flags = (Object.keys(FLAG_COLUMNS) as CompletionFlag[]).filter(flag => isYes(get(...FLAG_COLUMNS[flag])));
    } else {
      // Fallback: completion log — course/skill name + status.
      const course = get('coursename', 'course', 'skillname', 'skill', 'training', 'trainingname', 'module', 'program', 'learningpath');
      const status = get('status', 'completion', 'completionstatus', 'result', 'progress', 'ts', 'trainingstatus', 'coursestatus');
      if (!course || !isCompleted(status)) return;
      flags = courseToFlags(course);
    }

    if (flags.length === 0) return;
    upsert(id, name, flags);
  });

  return { fileName, uploadedAt: new Date().toISOString(), records: Array.from(byKey.values()) };
}

// ─── Persistence (localStorage mirror — DB is the source of truth) ───────────
export function loadCompletions(): StoredCompletions | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Ignore any stale pre-records-model cache.
    return Array.isArray(data?.records) ? (data as StoredCompletions) : null;
  } catch { return null; }
}

export function saveCompletions(data: StoredCompletions): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* ignore quota */ }
}

export function clearCompletions(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

// ─── Per-employee lookup (match by ID first, then Name) ───────────────────────
export function completionFlagsFor(emp: any, data: StoredCompletions | null): CompletionFlags {
  if (!data?.records?.length) return { ...EMPTY_FLAGS };

  const idKeys = [emp?.zensar_id, emp?.id, emp?.ID]
    .map(x => String(x ?? '').toLowerCase().trim())
    .filter(Boolean);
  const name = String(emp?.name ?? '').toLowerCase().trim();

  let rec = idKeys.length
    ? data.records.find(r => idKeys.includes(String(r.empId || '').toLowerCase().trim()) || idKeys.includes(r.empKey))
    : undefined;
  if (!rec && name) rec = data.records.find(r => String(r.empName || '').toLowerCase().trim() === name);
  if (!rec) return { ...EMPTY_FLAGS };

  return { aiForQe: rec.aiForQe, qeForAi: rec.qeForAi, testAutomation: rec.testAutomation };
}
