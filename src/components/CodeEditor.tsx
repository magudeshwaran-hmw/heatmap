import { useState, useRef } from 'react';
import { Play, Send, CheckCircle, XCircle, Clock, Cpu, Lock } from 'lucide-react';
import { API_BASE } from '../lib/api';

export interface TestCase {
  input: string;
  expectedOutput: string;
  hidden: boolean;
}

export interface CodingProblem {
  id: string;
  title: string;
  description: string;
  examples?: { input: string; output: string; explanation?: string }[];
  testCases: TestCase[];
  starterCode?: Record<string, string>;
  timeLimit?: number;
  memoryLimit?: number;
}

export interface TestResult {
  testIdx: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  time: string;
  memory: number;
  expected: string;
  status: string;
}

export interface CodeEditorProps {
  problem: CodingProblem;
  defaultLanguage?: string;
  /** When set, the compiler is locked to this language (skill-specific) — the selector is hidden. */
  lockLanguage?: string;
  onResults?: (results: TestResult[], visiblePassed: number, totalVisible: number, hiddenPassed: number, totalHidden: number) => void;
  dark?: boolean;
}

const LANGUAGE_OPTIONS = [
  { label: 'Python 3', value: 'python', langId: 71 },
  { label: 'Java', value: 'java', langId: 62 },
  { label: 'JavaScript', value: 'javascript', langId: 63 },
  { label: 'TypeScript', value: 'typescript', langId: 74 },
  { label: 'C#', value: 'csharp', langId: 51 },
  { label: 'SQL', value: 'sql', langId: 82 },
];

/**
 * Map a skill name to the compiler it should lock to. Language-named skills lock
 * to their own compiler (Java → Java, Python → Python, …); non-language skills
 * return undefined, leaving the candidate free to pick (defaults to Python).
 * Order matters — check the more specific names before the substrings.
 */
export function languageForSkill(skill?: string | null): string | undefined {
  const s = (skill || '').toLowerCase();
  if (/(c#|c sharp|csharp|\.net|asp\.net)/.test(s)) return 'csharp';
  if (/\btypescript\b/.test(s)) return 'typescript';
  if (/(javascript|node\.?js|react|angular)/.test(s)) return 'javascript';
  if (/\bjava\b/.test(s)) return 'java';
  if (/\bpython\b/.test(s)) return 'python';
  if (/(sql|database testing|pl\/sql|plsql|oracle db)/.test(s)) return 'sql';
  return undefined;
}

export default function CodeEditor({ problem, defaultLanguage = 'python', lockLanguage, onResults, dark = true }: CodeEditorProps) {
  const initialLang = (lockLanguage && LANGUAGE_OPTIONS.some(l => l.value === lockLanguage)) ? lockLanguage : defaultLanguage;
  const [language, setLanguage] = useState(initialLang);
  const [code, setCode] = useState(problem.starterCode?.[initialLang] || '');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResults, setRunResults] = useState<TestResult[]>([]);
  const [submitResults, setSubmitResults] = useState<TestResult[]>([]);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const visibleTests = problem.testCases.filter(t => !t.hidden);
  const hiddenTests = problem.testCases.filter(t => t.hidden);

  function handleLanguageChange(lang: string) {
    setLanguage(lang);
    setCode(problem.starterCode?.[lang] || '');
    setRunResults([]);
    setSubmitResults([]);
  }

  async function executeTests(testCases: TestCase[], isSubmit: boolean) {
    const langObj = LANGUAGE_OPTIONS.find(l => l.value === language);
    if (!langObj) { setError('Unsupported language'); return []; }

    const results: TestResult[] = [];
    const isSql = language === 'sql';
    const endpoint = isSql ? `${API_BASE}/judge0/run-sql` : `${API_BASE}/judge0/run`;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceCode: code,
            languageId: langObj.langId,
            stdin: tc.input,
            expectedOutput: tc.expectedOutput,
          }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        results.push({
          testIdx: i,
          passed: data.passed === true,
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          time: data.time || '—',
          memory: data.memory || 0,
          expected: tc.expectedOutput,
          status: data.status || 'Unknown',
        });
      } catch (e: any) {
        results.push({
          testIdx: i,
          passed: false,
          stdout: '',
          stderr: e.message,
          time: '—',
          memory: 0,
          expected: tc.expectedOutput,
          status: 'Error',
        });
      }
    }
    return results;
  }

  async function handleRun() {
    setRunning(true);
    setError('');
    setRunResults([]);
    try {
      const results = await executeTests(visibleTests, false);
      setRunResults(results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    setSubmitResults([]);
    try {
      const allResults = await executeTests(problem.testCases, true);
      setSubmitResults(allResults);
      if (onResults) {
        const visRes = allResults.filter((_, i) => i < visibleTests.length);
        const hidRes = allResults.filter((_, i) => i >= visibleTests.length);
        const vPass = visRes.filter(r => r.passed).length;
        const hPass = hidRes.filter(r => r.passed).length;
        onResults(allResults, vPass, visRes.length, hPass, hidRes.length);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Tab key inside textarea for indentation
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const spaces = '    ';
      const newCode = code.substring(0, start) + spaces + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + spaces.length;
      });
    }
  }

  const bg = dark ? '#0f1117' : '#f8fafc';
  const cardBg = dark ? 'rgba(255,255,255,0.05)' : '#fff';
  const borderCol = dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
  const textCol = dark ? '#e2e8f0' : '#1e293b';
  const mutedCol = dark ? '#94a3b8' : '#64748b';
  const editorBg = dark ? '#1e1e2e' : '#f1f5f9';

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: textCol }}>
      {/* Problem statement */}
      <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{problem.title}</h3>
        <p style={{ margin: '0 0 16px', color: mutedCol, lineHeight: 1.6 }}>{problem.description}</p>
        {problem.examples && problem.examples.map((ex, i) => (
          <div key={i} style={{ background: editorBg, borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontFamily: 'monospace', fontSize: 13 }}>
            <div><strong>Input:</strong> {ex.input}</div>
            <div><strong>Output:</strong> {ex.output}</div>
            {ex.explanation && <div style={{ color: mutedCol }}><strong>Explanation:</strong> {ex.explanation}</div>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: mutedCol, marginTop: 8 }}>
          {problem.timeLimit && <span><Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{problem.timeLimit}ms</span>}
          {problem.memoryLimit && <span><Cpu size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{problem.memoryLimit}MB</span>}
        </div>
      </div>

      {/* Language selector + editor */}
      <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${borderCol}`, background: dark ? 'rgba(0,0,0,0.3)' : '#f8fafc' }}>
          {lockLanguage && LANGUAGE_OPTIONS.some(l => l.value === lockLanguage) ? (
            <div title="This skill is assessed in a fixed language" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: editorBg, color: textCol, border: `1px solid ${borderCol}`, borderRadius: 6, padding: '5px 10px', fontSize: 13, fontWeight: 600 }}>
              <Lock size={12} />
              {LANGUAGE_OPTIONS.find(l => l.value === lockLanguage)?.label}
              <span style={{ color: mutedCol, fontWeight: 400, fontSize: 11 }}>· fixed for this skill</span>
            </div>
          ) : (
            <select
              value={language}
              onChange={e => handleLanguageChange(e.target.value)}
              style={{ background: editorBg, color: textCol, border: `1px solid ${borderCol}`, borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}
            >
              {LANGUAGE_OPTIONS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRun}
              disabled={running || submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, background: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1 }}
            >
              <Play size={14} />{running ? 'Running…' : 'Run Code'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={running || submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, background: '#10B981', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              <Send size={14} />{submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          rows={18}
          style={{ width: '100%', boxSizing: 'border-box', background: editorBg, color: textCol, border: 'none', padding: '16px 20px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace", fontSize: 14, lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Run results (visible test cases only) */}
      {runResults.length > 0 && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Run Results</h4>
          {runResults.map((r, i) => (
            <TestResultRow key={i} result={r} idx={i} dark={dark} isHidden={false} />
          ))}
        </div>
      )}

      {/* Submit results */}
      {submitResults.length > 0 && (
        <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 12, padding: '16px 20px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Submission Results</h4>
          {submitResults.map((r, i) => (
            <TestResultRow key={i} result={r} idx={i} dark={dark} isHidden={i >= visibleTests.length} />
          ))}
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: dark ? 'rgba(255,255,255,0.05)' : '#f8fafc', fontSize: 13, color: mutedCol }}>
            Visible: {submitResults.slice(0, visibleTests.length).filter(r => r.passed).length}/{visibleTests.length} passed &nbsp;|&nbsp;
            Hidden: {submitResults.slice(visibleTests.length).filter(r => r.passed).length}/{hiddenTests.length} passed
          </div>
        </div>
      )}
    </div>
  );
}

function TestResultRow({ result, idx, dark, isHidden }: { result: TestResult; idx: number; dark: boolean; isHidden: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const mutedCol = dark ? '#94a3b8' : '#64748b';

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', borderRadius: 8, marginBottom: 6, background: result.passed ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${result.passed ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {result.passed
          ? <CheckCircle size={16} color="#10B981" />
          : <XCircle size={16} color="#EF4444" />}
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {isHidden ? `Hidden Test ${idx + 1}` : `Test ${idx + 1}`}
        </span>
        <span style={{ fontSize: 12, color: mutedCol, marginLeft: 'auto' }}>
          {result.time !== '—' && `${result.time}s`}
          {result.memory > 0 && ` · ${Math.round(result.memory / 1024)}KB`}
        </span>
      </div>
      {expanded && !result.passed && (
        <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'monospace' }}>
          {result.stdout && <div><span style={{ color: mutedCol }}>Got: </span>{result.stdout.trim()}</div>}
          <div><span style={{ color: mutedCol }}>Expected: </span>{result.expected}</div>
          {result.stderr && <div style={{ color: '#f87171' }}>{result.stderr.trim()}</div>}
        </div>
      )}
    </div>
  );
}
