/**
 * GitHubIntelligencePage.tsx — /employee/github-intelligence  ("ZenCode")
 * GitHub Intelligence Engine: connect a public GitHub account, analyse public
 * repositories and surface skill evidence, repo health and workforce readiness.
 *
 * Reuses existing platform patterns (card / pill / progress-bar / modal styling)
 * from ZenScan, ZenMatrix and EmployeeDashboard. No existing UI is changed.
 */
import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Github, ChevronLeft, Star, GitFork, Shield, Download, RefreshCw,
  AlertTriangle, CheckCircle2, ExternalLink, ChevronDown, X,
  MapPin, Link as LinkIcon, Users, Calendar, CircleDot, Search, Plus,
} from 'lucide-react';
import { API_BASE, apiGetSkills, apiSaveSkills } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { useApp } from '@/lib/AppContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import ZensarLoader from '@/components/ZensarLoader';

// Canonical 32-skill list (matches server SKILL_NAMES) — used to merge a
// GitHub-suggested skill into ZenMatrix without wiping existing ratings.
const SKILL_NAMES = [
  'Selenium', 'Appium', 'JMeter', 'Postman', 'JIRA', 'TestRail',
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C#', 'SQL',
  'API Testing', 'Mobile Testing', 'Performance Testing',
  'Security Testing', 'Database Testing', 'Banking',
  'Healthcare', 'E-Commerce', 'Insurance', 'Telecom',
  'Functional Testing', 'Automation Testing', 'Regression Testing',
  'UAT', 'Git', 'Jenkins', 'Docker', 'Azure DevOps',
  'ChatGPT/Prompt Engineering', 'AI Test Automation',
];

const LEVEL_TO_RATING: Record<string, number> = { Beginner: 1, Intermediate: 2, Advanced: 3, Expert: 3 };

// Example public profiles for the quick-try pills (Part 2).
const EXAMPLE_USERS = ['octocat', 'torvalds', 'gaearon', 'sindresorhus'];

// GitHub's standard language colour convention (subset of common languages).
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178C6', JavaScript: '#F1E05A', Python: '#3572A5', HTML: '#E34C26',
  CSS: '#563D7C', Java: '#B07219', 'C#': '#178600', C: '#555555', 'C++': '#F34B7D',
  Go: '#00ADD8', Rust: '#DEA584', Ruby: '#701516', PHP: '#4F5D95', Shell: '#89E051',
  Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Vue: '#41B883',
  'Jupyter Notebook': '#DA5B0B', Dockerfile: '#384D54', SCSS: '#C6538C',
};
const langColor = (l?: string | null) => (l && LANG_COLORS[l]) || '#8B5CF6';

// Badge-level colours — reuse the platform palette (green/blue/amber/grey), no new colours.
const levelColor = (level?: string): string => {
  switch (level) {
    case 'Expert': return '#10B981';
    case 'Advanced': return '#3B82F6';
    case 'Intermediate': return '#F59E0B';
    default: return '#94A3B8'; // Beginner / unknown
  }
};

// Relative time formatter, e.g. "about 1 month ago", "4 months ago".
function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return 'just now';
  const units: [string, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, s] of units) {
    const v = Math.floor(sec / s);
    if (v >= 1) return v === 1 ? `about 1 ${unit} ago` : `${v} ${unit}s ago`;
  }
  return 'just now';
}

interface GhProfile {
  github_username: string; name?: string; bio?: string; company?: string;
  location?: string; blog?: string; twitter?: string; public_repos?: number;
  followers?: number; following?: number; developer_score?: number;
  analysis_status?: string; error_message?: string; last_analyzed_at?: string;
}
interface GhRepo {
  repo_name: string; repo_full_name: string; description?: string; is_fork?: boolean;
  stars?: number; forks?: number; open_issues?: number; health_score?: number;
  documentation_score?: number; project_category?: string; languages?: Record<string, number>;
  frameworks_detected?: string[]; fork_credit_eligible?: boolean; contribution_percentage?: number;
  homepage_url?: string; updated_at_github?: string; watchers?: number; license?: string;
}
interface GhSkill {
  skill_name: string; evidence_count?: number; confidence_score?: number;
  freshness_score?: number; source_repos?: string[]; evidence_level?: string;
  last_evidence_date?: string;
}
interface Readiness { role: string; matchPercentage: number; }

export default function GitHubIntelligencePage({
  isPopup: propIsPopup,
  onTabChange: propOnTabChange,
  readOnly = false,
  employeeId: propEmployeeId,
}: {
  isPopup?: boolean;
  onTabChange?: (path: string) => void;
  readOnly?: boolean;
  employeeId?: string;
}) {
  const navigate = useNavigate();
  const { employeeId: authEmpId } = useAuth();
  const { dark } = useDark();
  const T = mkTheme(dark);
  const { data, isPopup: ctxIsPopup } = useApp();

  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;

  const activeEmpId = propEmployeeId
    || (isPopup ? (data?.user?.id || data?.user?.ZensarID || authEmpId) : authEmpId);

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<GhProfile | null>(null);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [skills, setSkills] = useState<GhSkill[]>([]);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [addingSkill, setAddingSkill] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'repos' | 'skills' | 'readiness'>('repos');
  const [repoFilter, setRepoFilter] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [repoSort, setRepoSort] = useState<'stars' | 'recent' | 'forks' | 'name'>('stars');
  const [selectedRepo, setSelectedRepo] = useState<GhRepo | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = profile?.analysis_status;
  const analyzing = connected && (status === 'analyzing' || status === 'pending');
  const busy = connecting || analyzing;

  // After a few seconds of waiting, surface the "this can take a minute" hint (Part 7).
  useEffect(() => {
    if (!busy) { setLongWait(false); return; }
    const t = setTimeout(() => setLongWait(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  const cardStyle = {
    background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24,
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  } as const;

  const loadData = useCallback(async () => {
    if (!activeEmpId || activeEmpId === 'new') { setLoading(false); return; }
    try {
      const res = await fetch(`${API_BASE}/github/${activeEmpId}`);
      const json = await res.json();
      if (json.connected) {
        setConnected(true);
        setProfile(json.profile);
        setRepos(json.repositories || []);
        setSkills(json.skills || []);
        // Pre-fill the search input with the previously-saved username (Part 2),
        // without clobbering anything the user is currently typing.
        if (json.profile?.github_username) {
          setUsernameInput(prev => prev || json.profile.github_username);
        }
        if (json.profile?.analysis_status === 'complete') {
          try {
            const rRes = await fetch(`${API_BASE}/github/${activeEmpId}/readiness`);
            if (rRes.ok) setReadiness(await rRes.json());
          } catch { /* readiness optional */ }
        }
      } else {
        setConnected(false);
      }
    } catch {
      // Network issue — retry handled by backend githubFetch; UI shows reconnect state
    } finally {
      setLoading(false);
    }
  }, [activeEmpId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Poll while analysis is running (in-progress server background job)
  useEffect(() => {
    if (analyzing) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(loadData, 4000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [analyzing, loadData]);

  // Accepts a raw username, a "@username", or a full profile URL like
  // https://github.com/octocat — extracts the bare username.
  const normalizeUsername = (raw: string): string => {
    let u = raw.trim();
    const urlMatch = u.match(/github\.com\/([^/?#\s]+)/i);
    if (urlMatch) u = urlMatch[1];
    return u.replace(/^@/, '').trim();
  };

  const handleConnect = async (override?: string) => {
    const username = normalizeUsername(override ?? usernameInput);
    if (!username) { toast.error('Please enter a GitHub username'); return; }
    setUsernameInput(username);
    setConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: activeEmpId, githubUsername: username }),
      });
      const json = await res.json();
      if (res.status === 404) { toast.error('GitHub username not found. Please check and try again.'); return; }
      if (res.status === 429) { toast.warning('GitHub analysis paused — rate limit reached. Will resume automatically.'); return; }
      if (!res.ok) { toast.error(json.error || 'Failed to connect GitHub account'); return; }
      toast.success('Connected! Analyzing your repositories…');
      setConnected(true);
      setProfile({ github_username: username, analysis_status: 'pending', ...(json.profile || {}) });
      await loadData();
    } catch {
      toast.error('Connection issue — please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleAddToMatrix = async (skill: GhSkill) => {
    if (readOnly) return;
    const rating = LEVEL_TO_RATING[skill.evidence_level || ''] || 2;
    if (!window.confirm(`Add "${skill.skill_name}" to ZenMatrix at level "${skill.evidence_level}"?\nThis will not overwrite any verified badge.`)) return;
    setAddingSkill(skill.skill_name);
    try {
      // Merge with existing self-ratings so other skills are preserved.
      const existing = await apiGetSkills(activeEmpId);
      const flat: Record<string, number> = {};
      (existing || []).forEach((s: any) => {
        const name = s.skillName || s.skill_name;
        const self = s.selfRating ?? s.self_rating ?? 0;
        if (name && self > 0) flat[name] = self;
      });
      flat[skill.skill_name] = Math.max(flat[skill.skill_name] || 0, rating);
      const empName = data?.user?.Name || '';
      await apiSaveSkills(activeEmpId, empName, flat);
      toast.success(`${skill.skill_name} added to ZenMatrix`);
    } catch {
      toast.error('Could not update ZenMatrix. Please try again.');
    } finally {
      setAddingSkill(null);
    }
  };

  const handleRetry = async () => {
    if (!profile?.github_username) return;
    setUsernameInput(profile.github_username);
    setConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: activeEmpId, githubUsername: profile.github_username }),
      });
      if (res.status === 429) { toast.warning('GitHub analysis paused — rate limit reached. Will resume automatically.'); return; }
      if (!res.ok) { toast.error('Retry failed. Please try again later.'); return; }
      toast.success('Re-analyzing your repositories…');
      await loadData();
    } catch {
      toast.error('Connection issue — retrying automatically.');
    } finally {
      setConnecting(false);
    }
  };

  const handleExportJSON = () => {
    setExportOpen(false);
    const payload = { profile, repositories: repos, skills, readiness, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zencode-${profile?.github_username || 'report'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON report downloaded');
  };

  const handleExportPDF = () => {
    setExportOpen(false);
    const w = window.open('', '_blank');
    if (!w) { toast.error('Pop-up blocked. Please allow pop-ups to export.'); return; }
    const skillRows = skills.map(s =>
      `<tr><td>${s.skill_name}</td><td>${s.evidence_level || ''}</td><td>${s.confidence_score ?? 0}%</td><td>${s.evidence_count ?? 0}</td></tr>`).join('');
    const repoRows = repos.map(r =>
      `<tr><td>${r.repo_name}</td><td>${r.project_category || ''}</td><td>${r.health_score ?? 0}</td><td>${r.stars ?? 0}</td></tr>`).join('');
    const readyRows = readiness.map(r =>
      `<tr><td>${r.role}</td><td>${r.matchPercentage}%</td></tr>`).join('');
    w.document.write(`
      <html><head><title>ZenCode Report — ${profile?.github_username || ''}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{color:#3B82F6}h2{margin-top:28px;border-bottom:2px solid #eee;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #ddd;padding:8px;font-size:13px;text-align:left}th{background:#f5f5f5}</style>
      </head><body>
      <h1>ZenCode — GitHub Intelligence Report</h1>
      <p><strong>${profile?.name || ''}</strong> (@${profile?.github_username || ''})${profile?.bio ? ` — ${profile.bio}` : ''}</p>
      <p>Developer Score: <strong>${profile?.developer_score ?? 0}/100</strong> · Public Repos: ${profile?.public_repos ?? 0} · Followers: ${profile?.followers ?? 0}</p>
      <h2>Skill Evidence</h2><table><tr><th>Skill</th><th>Level</th><th>Confidence</th><th>Evidence</th></tr>${skillRows}</table>
      <h2>Repositories</h2><table><tr><th>Repo</th><th>Category</th><th>Health</th><th>Stars</th></tr>${repoRows}</table>
      <h2>Workforce Readiness</h2><table><tr><th>Role</th><th>Match</th></tr>${readyRows}</table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const scoreColor = (n: number) =>
    n >= 75 ? '#10B981' : n >= 50 ? '#3B82F6' : n >= 30 ? '#F59E0B' : '#EF4444';

  const pg = { minHeight: '100vh', background: T.bg, color: T.text, padding: '24px 24px 80px', fontFamily: "'Inter', sans-serif" } as const;

  if (loading) {
    return <ZensarLoader fullScreen label="Loading GitHub Intelligence…" />;
  }

  // ── Header (shared) ──
  const Header = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {!isPopup && (
          <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(59,130,246,0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Github size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, margin: '0 0 2px', fontFamily: "'Space Grotesk',sans-serif" }}>ZenCode</h1>
            <p style={{ color: T.sub, fontSize: 13, margin: 0 }}>GitHub Intelligence — discover & verify skills from your code</p>
          </div>
        </div>
      </div>
      {connected && status === 'complete' && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setExportOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Download size={15} /> Export Report <ChevronDown size={14} />
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', zIndex: 20, overflow: 'hidden', minWidth: 170 }}>
              <button onClick={handleExportJSON} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: T.text, fontSize: 13, cursor: 'pointer' }}>JSON (raw data)</button>
              <button onClick={handleExportPDF} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', color: T.text, fontSize: 13, cursor: 'pointer', borderTop: `1px solid ${T.bdr}` }}>PDF Summary</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Derived repo views (filter / language / sort) ──
  const allLangs = Array.from(
    new Set(repos.map(r => (r.languages ? Object.keys(r.languages)[0] : null)).filter(Boolean) as string[])
  ).sort();

  const displayedRepos = repos
    .filter(r => {
      if (langFilter !== 'all') {
        const top = r.languages ? Object.keys(r.languages)[0] : null;
        if (top !== langFilter) return false;
      }
      const q = repoFilter.trim().toLowerCase();
      if (!q) return true;
      return (r.repo_name || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (repoSort === 'stars') return (b.stars ?? 0) - (a.stars ?? 0);
      if (repoSort === 'forks') return (b.forks ?? 0) - (a.forks ?? 0);
      if (repoSort === 'name') return (a.repo_name || '').localeCompare(b.repo_name || '');
      return new Date(b.updated_at_github || 0).getTime() - new Date(a.updated_at_github || 0).getTime();
    });

  const noEvidence = repos.length === 0 && skills.length === 0;

  const selectStyle: CSSProperties = {
    padding: '8px 12px', borderRadius: 9, background: dark ? 'rgba(255,255,255,0.06)' : '#fff',
    border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', cursor: 'pointer',
  };

  // ── Reusable progress bar (matches Skill Trust Engine / readiness bars) ──
  const Bar = ({ pct, color }: { pct: number; color?: string }) => (
    <div style={{ height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 999, background: color || 'linear-gradient(90deg,#3B82F6,#8B5CF6)', transition: 'width 0.6s ease' }} />
    </div>
  );

  // ── Tab strip ──
  const tabs: { key: 'repos' | 'skills' | 'readiness'; label: string; count: number }[] = [
    { key: 'repos', label: 'Repositories', count: repos.length },
    { key: 'skills', label: 'Skill Evidence', count: skills.length },
    { key: 'readiness', label: 'Workforce Readiness', count: readiness.length },
  ];

  return (
    <div style={pg}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Header />

        {/* ── Part 2 — Search hero (leads the page; no blocking consent screen) ── */}
        {!readOnly && (
          <div style={cardStyle}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              <Github size={15} /> GitHub Repo Analyzer
            </div>
            <h2 style={{ fontSize: 'clamp(20px,2.6vw,26px)', fontWeight: 800, margin: '0 0 8px', fontFamily: "'Space Grotesk',sans-serif" }}>Inspect any public GitHub profile</h2>
            <p style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, margin: '0 0 16px', maxWidth: 640 }}>
              Drop in a username or profile URL to explore repos, languages, open issues, and an inferred
              tech stack — all from the public GitHub API. No sign-in, no keys, fully free.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
              <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 0 }}>
                <Github size={16} color={T.muted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !busy) handleConnect(); }}
                  placeholder="Enter GitHub username or paste profile URL"
                  style={{ width: '100%', padding: '11px 38px 11px 36px', borderRadius: 9, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
                {usernameInput && (
                  <button onClick={() => setUsernameInput('')} aria-label="Clear" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', display: 'inline-flex', padding: 4 }}>
                    <X size={15} />
                  </button>
                )}
              </div>
              <button onClick={() => handleConnect()} disabled={busy} style={{ padding: '11px 22px', borderRadius: 10, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0 }}>
                <Search size={15} /> {busy ? 'Analyzing…' : 'Analyze profile'}
              </button>
            </div>

            {/* Example username pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <span style={{ fontSize: 12, color: T.muted }}>Try:</span>
              {EXAMPLE_USERS.map(u => (
                <button key={u} onClick={() => { if (!busy) handleConnect(u); }} disabled={busy} style={{ padding: '4px 11px', borderRadius: 999, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${T.bdr}`, color: T.sub, fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                  {u}
                </button>
              ))}
            </div>

            {/* Privacy note — collapsible, replaces the old blocking consent card */}
            <button onClick={() => setShowPrivacy(p => !p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 14, background: 'transparent', border: 'none', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              <Shield size={13} /> What we read &amp; never touch <ChevronDown size={13} style={{ transform: showPrivacy ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {showPrivacy && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#10B981', textTransform: 'uppercase', marginBottom: 8 }}>We will read</div>
                  {['Public profile information', 'Public repository metadata', 'Languages and frameworks used', 'README documentation'].map(t => (
                    <div key={t} style={{ fontSize: 12, color: T.text, marginBottom: 5, display: 'flex', gap: 6 }}><CheckCircle2 size={14} color="#10B981" style={{ flexShrink: 0, marginTop: 1 }} /> {t}</div>
                  ))}
                </div>
                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', marginBottom: 8 }}>We will NEVER</div>
                  {['Access private repositories', 'Modify your GitHub account', 'Share your data outside the platform'].map(t => (
                    <div key={t} style={{ fontSize: 12, color: T.text, marginBottom: 5, display: 'flex', gap: 6 }}><span style={{ color: '#EF4444', fontWeight: 900, flexShrink: 0 }}>×</span> {t}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* readOnly admin view, no connected account */}
        {readOnly && !connected && (
          <div style={{ ...cardStyle, textAlign: 'center', color: T.sub }}>
            <Github size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>No GitHub account connected</div>
            <div style={{ fontSize: 13 }}>This employee has not connected a GitHub account yet.</div>
          </div>
        )}

        {/* ── Part 7 — Loading state (reuses the shared ZensarLoader animation) ── */}
        {busy && (
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '44px 24px' }}>
            <ZensarLoader size={64} dark={dark} />
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 18 }}>Analyzing public repositories…</div>
            {longWait && (
              <div style={{ fontSize: 13, color: T.sub, marginTop: 6 }}>This can take a minute for accounts with many repositories</div>
            )}
          </div>
        )}

        {/* ── Part 8 — Error state ── */}
        {!busy && connected && status === 'error' && (
          <div style={{ ...cardStyle, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', textAlign: 'center' }}>
            <AlertTriangle size={36} color="#EF4444" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Analysis could not complete</div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 18, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
              {profile?.error_message || 'Something went wrong while analyzing this GitHub account.'}
            </div>
            {!readOnly && (
              <button onClick={handleRetry} disabled={connecting} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, background: '#3B82F6', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <RefreshCw size={15} /> Retry
              </button>
            )}
          </div>
        )}

        {/* ── Results (profile + tabs) ── */}
        {!busy && connected && status === 'complete' && profile && (
          <>
            {/* Part 8 — partial analysis notice (informational, not an error) */}
            {profile.error_message && (
              <div style={{ ...cardStyle, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>ℹ️</span>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Partial Analysis Complete</div>
                  <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>{profile.error_message}</div>
                </div>
                {!readOnly && (
                  <button onClick={handleRetry} disabled={connecting} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, background: '#3B82F6', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? 0.7 : 1, flexShrink: 0 }}>
                    <RefreshCw size={15} /> Reconnect for Full Analysis
                  </button>
                )}
              </div>
            )}

            {/* ── Part 3 — Profile card ── */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <img
                  src={`https://github.com/${profile.github_username}.png?size=120`}
                  alt={profile.github_username}
                  width={72}
                  height={72}
                  style={{ width: 72, height: 72, borderRadius: '50%', flexShrink: 0, border: `1px solid ${T.bdr}`, objectFit: 'cover' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{profile.name || profile.github_username}</span>
                    <a href={`https://github.com/${profile.github_username}`} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Github size={14} /> @{profile.github_username}
                    </a>
                    <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: `${scoreColor(profile.developer_score ?? 0)}1a`, color: scoreColor(profile.developer_score ?? 0) }} title="Developer score">
                      Dev Score {profile.developer_score ?? 0}/100
                    </span>
                  </div>
                  {profile.bio && (
                    <p style={{ fontSize: 13, color: T.sub, margin: '0 0 10px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{profile.bio}</p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: T.sub }}>
                    {profile.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} /> {profile.location}</span>}
                    {profile.blog && (
                      <a href={profile.blog.startsWith('http') ? profile.blog : `https://${profile.blog}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#3B82F6' }}>
                        <LinkIcon size={13} /> {profile.blog.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Users size={13} /> {profile.followers ?? 0} followers · {profile.following ?? 0} following
                    </span>
                  </div>
                </div>
                {/* 3 stat boxes */}
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  {[
                    { n: profile.public_repos ?? repos.length, label: 'Repos' },
                    { n: profile.followers ?? 0, label: 'Followers' },
                    { n: profile.following ?? 0, label: 'Following' },
                  ].map(b => (
                    <div key={b.label} style={{ minWidth: 64, textAlign: 'center', border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '12px 14px', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1 }}>{b.n}</div>
                      <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{b.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {noEvidence ? (
              <div style={{ ...cardStyle, textAlign: 'center', color: T.sub }}>
                <Github size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>No public repositories found</div>
                <div style={{ fontSize: 13 }}>Skills cannot be extracted from GitHub. Continue using ZenAssess and ZenScan instead.</div>
              </div>
            ) : (
              <>
                {/* Tab strip */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${T.bdr}`, paddingBottom: 2 }}>
                  {tabs.map(t => {
                    const on = activeTab === t.key;
                    return (
                      <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: '9px 16px', borderRadius: '9px 9px 0 0', background: on ? (dark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)') : 'transparent', border: 'none', borderBottom: on ? '2px solid #3B82F6' : '2px solid transparent', color: on ? '#3B82F6' : T.sub, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        {t.label} <span style={{ color: T.muted, fontWeight: 600 }}>({t.count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* ── Part 4 — Repositories tab ── */}
                {activeTab === 'repos' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>
                        Repositories <span style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>({displayedRepos.length} of {repos.length})</span>
                      </h3>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input value={repoFilter} onChange={e => setRepoFilter(e.target.value)} placeholder="Filter repos…" style={{ ...selectStyle, cursor: 'text', minWidth: 140 }} />
                        <select value={langFilter} onChange={e => setLangFilter(e.target.value)} style={selectStyle}>
                          <option value="all">All languages</option>
                          {allLangs.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select value={repoSort} onChange={e => setRepoSort(e.target.value as typeof repoSort)} style={selectStyle}>
                          <option value="stars">Most stars</option>
                          <option value="recent">Most recent</option>
                          <option value="forks">Most forks</option>
                          <option value="name">Name A-Z</option>
                        </select>
                      </div>
                    </div>

                    {displayedRepos.length === 0 ? (
                      <div style={{ ...cardStyle, textAlign: 'center', color: T.sub, fontSize: 13 }}>No repositories match your filters.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                        {displayedRepos.map(r => {
                          const topLang = r.languages ? Object.keys(r.languages)[0] : null;
                          const hasDesc = !!(r.description && r.description.trim());
                          return (
                            <div
                              key={r.repo_full_name}
                              onClick={() => setSelectedRepo(r)}
                              style={{ ...cardStyle, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3B82F6'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.bdr; }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 14, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repo_name}</div>
                              <p style={{ fontSize: 12, color: T.sub, margin: 0, lineHeight: 1.5, fontStyle: hasDesc ? 'normal' : 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>
                                {hasDesc ? r.description : 'No description provided.'}
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: T.muted, marginTop: 'auto' }}>
                                {topLang && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: langColor(topLang), display: 'inline-block' }} /> {topLang}
                                  </span>
                                )}
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={13} /> {r.stars ?? 0}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><GitFork size={13} /> {r.forks ?? 0}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><CircleDot size={13} /> {r.open_issues ?? 0}</span>
                              </div>
                              {r.updated_at_github && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.muted }}>
                                  <Calendar size={12} /> updated {timeAgo(r.updated_at_github)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Part 5 — Skill Evidence tab ── */}
                {activeTab === 'skills' && (
                  <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Skill Evidence</h3>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Skills discovered and verified from your code.</div>
                    {skills.length === 0 ? (
                      <div style={{ textAlign: 'center', color: T.sub, padding: '24px 0' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>No verifiable skill evidence yet</div>
                        <div style={{ fontSize: 13 }}>Analysis may still be running, or no recognized skills were found in these repositories.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {skills.map(s => {
                          const conf = s.confidence_score ?? 0;
                          const lc = levelColor(s.evidence_level);
                          const repoCount = (s.source_repos || []).length;
                          return (
                            <div key={s.skill_name} style={{ border: `1px solid ${T.bdr}`, borderRadius: 13, padding: '16px 18px', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>{s.skill_name}</span>
                                  {!readOnly && (
                                    <button onClick={() => handleAddToMatrix(s)} disabled={addingSkill === s.skill_name || !SKILL_NAMES.includes(s.skill_name)} title={SKILL_NAMES.includes(s.skill_name) ? 'Add to ZenMatrix' : 'Not part of the ZenMatrix skill set'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontSize: 11, fontWeight: 700, cursor: SKILL_NAMES.includes(s.skill_name) ? 'pointer' : 'not-allowed', opacity: (addingSkill === s.skill_name || !SKILL_NAMES.includes(s.skill_name)) ? 0.55 : 1 }}>
                                      <Plus size={12} /> {addingSkill === s.skill_name ? 'Adding…' : 'Add to ZenMatrix'}
                                    </button>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${lc}22`, color: lc }}>{s.evidence_level}</span>
                                  <span style={{ fontWeight: 800, fontSize: 13, color: scoreColor(conf) }}>{conf}%</span>
                                </div>
                              </div>
                              <Bar pct={conf} />
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>
                                {repoCount} repo{repoCount === 1 ? '' : 's'}{s.last_evidence_date ? ` · last used ${timeAgo(s.last_evidence_date)}` : ''}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Part 6 — Workforce Readiness tab ── */}
                {activeTab === 'readiness' && (
                  <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Workforce Readiness</h3>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>How your GitHub activity maps to enterprise role requirements.</div>
                    {readiness.length === 0 ? (
                      <div style={{ textAlign: 'center', color: T.sub, padding: '24px 0' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>No readiness data yet</div>
                        <div style={{ fontSize: 13 }}>Role matches appear once skill evidence has been gathered.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {readiness.map(r => (
                          <div key={r.role}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                              <span style={{ color: T.text, fontWeight: 600 }}>{r.role}</span>
                              <span style={{ fontWeight: 800, color: scoreColor(r.matchPercentage) }}>{r.matchPercentage}%</span>
                            </div>
                            <Bar pct={r.matchPercentage} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Part 4 — Repo detail modal ── */}
      {selectedRepo && (
        <div onClick={() => setSelectedRepo(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, background: T.cardSolid, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <a href={`https://github.com/${selectedRepo.repo_full_name}`} target="_blank" rel="noreferrer" style={{ fontWeight: 800, fontSize: 18, color: T.text, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {selectedRepo.repo_name} <ExternalLink size={14} color={T.muted} />
                </a>
                {selectedRepo.project_category && (
                  <span style={{ display: 'inline-block', marginLeft: 8, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>{selectedRepo.project_category}</span>
                )}
              </div>
              <button onClick={() => setSelectedRepo(null)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, margin: '0 0 16px', fontStyle: selectedRepo.description ? 'normal' : 'italic' }}>
              {selectedRepo.description || 'No description provided.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Health Score', value: `${selectedRepo.health_score ?? 0}/100`, color: scoreColor(selectedRepo.health_score ?? 0) },
                { label: 'Documentation', value: `${selectedRepo.documentation_score ?? 0}/100`, color: scoreColor(selectedRepo.documentation_score ?? 0) },
                { label: 'Stars', value: `${selectedRepo.stars ?? 0}` },
                { label: 'Forks', value: `${selectedRepo.forks ?? 0}` },
                { label: 'Open Issues', value: `${selectedRepo.open_issues ?? 0}` },
                { label: 'Updated', value: timeAgo(selectedRepo.updated_at_github) || '—' },
              ].map(b => (
                <div key={b.label} style={{ border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: b.color || T.text, lineHeight: 1.1 }}>{b.value}</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 3 }}>{b.label}</div>
                </div>
              ))}
            </div>

            {selectedRepo.languages && Object.keys(selectedRepo.languages).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 8 }}>Languages</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.keys(selectedRepo.languages).map(l => (
                    <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.sub, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${T.bdr}`, borderRadius: 6, padding: '2px 8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: langColor(l) }} /> {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(selectedRepo.frameworks_detected || []).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 8 }}>Frameworks &amp; Tools</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(selectedRepo.frameworks_detected || []).map(f => (
                    <span key={f} style={{ fontSize: 11, color: '#3B82F6', background: 'rgba(59,130,246,0.1)', borderRadius: 5, padding: '2px 8px' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedRepo.is_fork && !selectedRepo.fork_credit_eligible && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#F59E0B', background: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: '8px 10px' }}>
                <Shield size={14} /> Limited original contribution detected — lower skill credit applied for this fork.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
