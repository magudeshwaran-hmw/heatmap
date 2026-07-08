/**
 * AdminDashboard.tsx
 * Elite Terminal Aesthetic with Global Capability Analytics.
 * Features: Personnel Intelligence Audit, Reversible Encryption, and Live Session Sync.
 */
import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';

import { SKILLS, MOCK_EMPLOYEES } from '@/lib/mockData';
import { useNavigate } from 'react-router-dom';
import {
  Users, TrendingUp, AlertTriangle, Award, Download, Edit2, Plus,
  BarChart3, CheckCircle2, Search, Eye, FileSpreadsheet, RefreshCw, Grid, X, Settings, Shield, Lock, Mail, Phone, Calendar, Briefcase, Filter, Upload, Sparkles, FileUp, Trash2, GraduationCap, Info, Brain, Layers, RotateCcw
} from 'lucide-react';

import { toast } from '@/lib/ToastContext';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { computeCompletion, exportAllToExcel } from '@/lib/localDB';
import { apiGetAllEmployees, API_BASE, apiGetCompletions, apiSaveCompletions, apiClearCompletions, apiResetCompletionFlag } from '@/lib/api';
import { AppContext, useApp } from '@/lib/AppContext';
import { loadAppData, AppData } from '@/lib/appStore';
import EmployeeDashboard from './EmployeeDashboard';
import SkillMatrixPage from './SkillMatrixPage';
import QislZenMatrixPage from './QislZenMatrixPage';
import CertificationsPage from './CertificationsPage';
import ProjectsPage from './ProjectsPage';
import EducationPage from './EducationPage';
import AchievementsPage from './AchievementsPage';
import AIIntelligencePage from './AIIntelligencePage';
import AdminResumeUploadPage from './AdminResumeUploadPage';
import ResumeBuilderPage from './ResumeBuilderPage';
import GitHubIntelligencePage from './GitHubIntelligencePage';
import Modal from '@/components/Modal';
import { callResumeLLM } from '@/lib/llm';
import { extractTextFromFile, accurateExtractFromResume, extractZensarIdFromText } from '@/lib/resumeExtraction';
import {
  resolveQEAssignment, setQEOverride, clearQEOverride,
  QE_FAMILIES, groupsForFamily, essentialSkillsFor,
  QE_DOMAINS, QE_DOMAIN_LABEL, normalizeDomain, deriveDomain,
} from '@/lib/qeSkillTaxonomy';
import {
  StoredCompletions, loadCompletions, saveCompletions, clearCompletions,
  parseCompletionRows, completionFlagsFor,
} from '@/lib/courseCompletions';
import * as XLSX from 'xlsx';

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  BarController, LineController, DoughnutController, Tooltip, Legend, Title
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  BarController, LineController, DoughnutController, Tooltip, Legend, Title
);

// ─── Internationalization Helper ──────────────────────────────────────────────
const t = (text: string): string => text;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { setGlobalLoading } = useApp();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [activeTab, setActiveTab] = useState<'Overview' | 'Manage Employees' | 'Skill Heatmap' | 'QI SL Heatmap' | 'Skill Groups' | 'Certifications' | 'Achievements' | 'Education' | 'Projects' | 'Expert Reviews' | 'Re-assessment' | 'Workforce Intelligence'>('Overview');
  // QISL Heatmap explorer: selected family + group (step-by-step drill-down).
  const [qislFam, setQislFam] = useState<string>('');
  const [qislGroup, setQislGroup] = useState<string>('');
  // bumped whenever a QE Skill-Group override is saved, to force a re-derive/re-render
  const [qeTick, setQeTick] = useState(0);
  // filters for the "Skill Groups" tab
  const [sgFilter, setSgFilter] = useState<{ domain: string[]; group: string[]; skill: string[]; experience: string[]; aiForQe: string[]; qeForAi: string[]; testAutomation: string[] }>({ domain: [], group: [], skill: [], experience: [], aiForQe: [], qeForAi: [], testAutomation: [] });
  const [sgOpenFilter, setSgOpenFilter] = useState<string>('');
  // Excel-uploaded ID → { name, domain, skillGroup, ... } mapping (frontend-only, persisted)
  const SG_EXCEL_KEY = 'qe_skillgroup_excel';
  const [sgExcel, setSgExcel] = useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem(SG_EXCEL_KEY) || '{}'); } catch { return {}; }
  });
  const sgFileRef = useRef<HTMLInputElement>(null);
  // Course-completion log (drives the AI-for-QE / QE-for-AI / Automation flags).
  // Raw rows are NOT retained — only computed per-person YES flags. Removable.
  const [completions, setCompletions] = useState<StoredCompletions | null>(() => loadCompletions());
  const compFileRef = useRef<HTMLInputElement>(null);
  // Reset-flags checklist dropdown (pick which flag columns to reset for everyone).
  const [resetOpen, setResetOpen] = useState(false);
  const [resetSel, setResetSel] = useState<Array<'aiForQe' | 'qeForAi' | 'testAutomation'>>([]);
  // which rows have their certification / trainings list expanded
  const [sgCertOpen, setSgCertOpen] = useState<Record<string, boolean>>({});
  const [sgTrainOpen, setSgTrainOpen] = useState<Record<string, boolean>>({});
  // Skill Heatmap drill-down: selected family → group
  const [heatFamily, setHeatFamily] = useState<string>('');
  const [heatGroup, setHeatGroup] = useState<string>('');

  const handleSkillGroupExcel = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const norm = (k: string) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
      const map: Record<string, any> = {};
      let mapped = 0;
      raw.forEach(r => {
        const get = (...names: string[]) => {
          for (const key of Object.keys(r)) {
            if (names.includes(norm(key))) { const v = String(r[key]).trim(); if (v) return v; }
          }
          return '';
        };
        const id = get('id', 'empid', 'employeeid', 'zensarid');
        if (!id) return;
        map[id.toLowerCase()] = {
          name: get('name', 'employeename'),
          domain: get('domain'),
          skillGroup: get('skillgroup', 'newskillgroup', 'group'),
          relatedTrainings: get('relatedtrainings', 'trainings', 'training'),
          experience: get('experience', 'exp', 'years', 'yearsofexperience'),
        };
        mapped++;
      });
      setSgExcel(map);
      localStorage.setItem(SG_EXCEL_KEY, JSON.stringify(map));
      toast.success(`Mapped ${mapped} row${mapped !== 1 ? 's' : ''} from ${file.name}`);
    } catch (e: any) {
      toast.error('Could not read Excel: ' + (e?.message || 'invalid file'));
    }
    if (sgFileRef.current) sgFileRef.current.value = '';
  };

  const sgLookup = (emp: any) =>
    sgExcel[String(emp.zensar_id || '').toLowerCase()] || sgExcel[String(emp.id || '').toLowerCase()] || null;

  // Load completion flags from the DB on mount (localStorage is only a mirror).
  useEffect(() => {
    (async () => {
      try {
        const res = await apiGetCompletions();
        if (res.records && res.records.length) {
          const data: StoredCompletions = { fileName: res.fileName || '', uploadedAt: res.uploadedAt || new Date().toISOString(), records: res.records };
          setCompletions(data);
          saveCompletions(data);
        } else {
          setCompletions(null);
          clearCompletions();
        }
      } catch {
        // Backend unreachable — keep whatever the localStorage mirror gave us.
      }
    })();
  }, []);

  // Parse an uploaded completion Excel → per-person flags, then persist to DB.
  const handleCompletionExcel = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const data = parseCompletionRows(raw, file.name);
      await apiSaveCompletions(data.fileName, data.records);  // store & update in DB
      saveCompletions(data);
      setCompletions(data);
      toast.success(`Saved ${data.records.length} record${data.records.length !== 1 ? 's' : ''} from ${file.name} to database`);
    } catch (e: any) {
      toast.error('Could not save completions: ' + (e?.message || 'invalid file'));
    }
    if (compFileRef.current) compFileRef.current.value = '';
  };

  const clearCompletionUpload = async () => {
    try {
      await apiClearCompletions();
      clearCompletions();
      setCompletions(null);
      toast.success('Removed completion data — all flags reset to No');
    } catch (e: any) {
      toast.error('Could not clear completions: ' + (e?.message || 'server error'));
    }
  };

  // Reset the SELECTED flag columns to No for everyone (checklist-driven).
  const FLAG_LABELS: Record<'aiForQe' | 'qeForAi' | 'testAutomation', string> = {
    aiForQe: 'Test AI for QE', qeForAi: 'Test QE for AI', testAutomation: 'Test Automation',
  };
  const resetCompletionFlags = async (flags: Array<'aiForQe' | 'qeForAi' | 'testAutomation'>) => {
    if (!flags.length) return;
    try {
      for (const f of flags) await apiResetCompletionFlag(f);   // reset each in the DB
      setCompletions(prev => {
        if (!prev) return prev;
        // Turn the chosen flags off on every record, then drop now-empty records.
        const records = prev.records
          .map(r => { const nr = { ...r }; flags.forEach(f => { nr[f] = false; }); return nr; })
          .filter(r => r.aiForQe || r.qeForAi || r.testAutomation);
        const next = { ...prev, records };
        saveCompletions(next);
        return next;
      });
      toast.success(`Reset ${flags.map(f => FLAG_LABELS[f]).join(', ')} → No for everyone`);
    } catch (e: any) {
      toast.error('Could not reset: ' + (e?.message || 'server error'));
    }
    setResetOpen(false);
    setResetSel([]);
  };

  // Shared colour legend + grade-explanation strip for the heatmap pages.
  const HeatKey = ({ items, formula }: { items: { c: string; label: string; range: string }[]; formula?: ReactNode }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', padding: '12px 16px', background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Color Key</span>
        {items.map(it => (
          <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: T.text }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: it.c, flexShrink: 0 }} />
            {it.label} <span style={{ color: T.sub, fontWeight: 600 }}>{it.range}</span>
          </span>
        ))}
      </div>
    </div>
  );
  // The four heat colours + a helper that grades a 0–5 value at given thresholds.
  const HEAT = { green: '#10B981', blue: '#3B82F6', orange: '#F59E0B', grey: T.bdr };
  const gradeColor = (v: number, hi: number, mid: number) => v >= hi ? HEAT.green : v >= mid ? HEAT.blue : v > 0 ? HEAT.orange : HEAT.grey;
  // Everything is graded as a percentage on the 0–3 proficiency scale:
  //   Strong (60–100%) · Moderate (30–60%) · Limited (0–30%).
  const pctColor = (v: number) => v >= 60 ? HEAT.green : v >= 30 ? HEAT.blue : v > 0 ? HEAT.orange : HEAT.grey;
  const PCT_LEGEND = [
    { c: HEAT.green, label: 'Strong', range: '60–100%' },
    { c: HEAT.blue, label: 'Moderate', range: '30–60%' },
    { c: HEAT.orange, label: 'Limited', range: '0–30%' },
  ];

  const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Newest' | 'Oldest'>('A-Z');
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '', email: '', designation: '', employeeId: '',
    location: '', phone: '', department: '',
    yearsIT: '', yearsZensar: '', password: '', confirmPassword: ''
  });
  const [resumeScanLoading, setResumeScanLoading] = useState(false);
  const [resumeScanned, setResumeScanned] = useState(false);
  const [emailWarningConfirmed, setEmailWarningConfirmed] = useState(false);
  const [showEmployeeDetails, setShowEmployeeDetails] = useState(false);
  const [showResumeUploadPage, setShowResumeUploadPage] = useState(false);
  const [createdEmployeeId, setCreatedEmployeeId] = useState<string>('');
  const [extractedDetails, setExtractedDetails] = useState({
    skills: [] as { name: string; rating: number }[],
    projects: [] as { name: string; description: string; technologies: string[]; duration: string }[],
    certificates: [] as { name: string; issuer: string; date: string }[],
    education: [] as { degree: string; institution: string; year: string }[]
  });
  const [rawExtractedData, setRawExtractedData] = useState<any>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  // ── Expert Reviews Queue State & Handlers ──────────────────────────────────
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedReview, setSelectedReview] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [escalatedTo, setEscalatedTo] = useState('admin');
  const [showReviewActionModal, setShowReviewActionModal] = useState<'approve' | 'reject' | 'escalate' | null>(null);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // One-time re-assessment grant from within the review modal (cooldown bypass).
  const [reviewGrantBusy, setReviewGrantBusy] = useState(false);
  const [reviewGranted, setReviewGranted] = useState(false);

  // Re-assessment tab: per-employee grant-all state.
  const [raBusyId, setRaBusyId] = useState<string | null>(null);
  const [raGranted, setRaGranted] = useState<Set<string>>(new Set());
  const [raSearch, setRaSearch] = useState('');

  // ZenAssess V6 Expert Review score adjustment states
  const [adjustedScenarioScore, setAdjustedScenarioScore] = useState<number>(80);
  const [adjustedEvidenceScore, setAdjustedEvidenceScore] = useState<number>(80);
  const [adjustedMentoringScore, setAdjustedMentoringScore] = useState<number>(80);
  const [adjustedExperienceScore, setAdjustedExperienceScore] = useState<number>(75);

  useEffect(() => {
    setReviewGranted(false); // reset the per-review grant button when a new review opens
    if (selectedReview) {
      const breakdown = typeof selectedReview.explain_score_breakdown === 'string'
        ? JSON.parse(selectedReview.explain_score_breakdown)
        : (selectedReview.explain_score_breakdown || {});
      const details = breakdown.expertDetails || {};
      
      setAdjustedScenarioScore(details.scenarioScore !== undefined ? Number(details.scenarioScore) : Number(selectedReview.mcq_score) || 80);
      setAdjustedEvidenceScore(details.evidenceScore !== undefined ? Number(details.evidenceScore) : Number(selectedReview.evidence_score) || 80);
      setAdjustedMentoringScore(details.mentoringScore !== undefined ? Number(details.mentoringScore) : Number(selectedReview.contribution_score) || 80);
      setAdjustedExperienceScore(details.experienceScore !== undefined ? Number(details.experienceScore) : 75);
    }
  }, [selectedReview]);

  const fetchReviews = async () => {
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`${API_BASE}/admin/reviews`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}` }
      });
      const data = await res.json();
      if (res.ok && data.reviews) {
        setReviews(data.reviews);
      }
    } catch (err) {
      toast.error('Failed to load review queue');
    } finally {
      setIsLoadingReviews(false);
    }
  };

  // ── AI Proctoring: Assessment Integrity Monitor ───────────────────────────
  const [integrityReports, setIntegrityReports] = useState<any[]>([]);
  const [isLoadingIntegrity, setIsLoadingIntegrity] = useState(false);
  const [selectedIntegrity, setSelectedIntegrity] = useState<any | null>(null);

  const fetchIntegrityReports = async () => {
    setIsLoadingIntegrity(true);
    try {
      const res = await fetch(`${API_BASE}/admin/integrity-reports`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setIntegrityReports(data);
      }
    } catch (err) {
      /* silent — non-critical panel */
    } finally {
      setIsLoadingIntegrity(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Expert Reviews') {
      fetchReviews();
      fetchIntegrityReports();
    }
  }, [activeTab]);

  // ── Workforce Intelligence State & Handlers ───────────────────────────────
  const [wfIntel, setWfIntel] = useState<any | null>(null);
  const [isLoadingWfIntel, setIsLoadingWfIntel] = useState(false);
  const [approvingSkill, setApprovingSkill] = useState<string | null>(null);

  const fetchWfIntel = async () => {
    setIsLoadingWfIntel(true);
    try {
      const res = await fetch(`${API_BASE}/workforce-intelligence`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}` }
      });
      const data = await res.json();
      if (res.ok) {
        setWfIntel(data);
      } else {
        toast.error(data.error || 'Failed to load workforce intelligence');
      }
    } catch (err) {
      toast.error('Failed to load workforce intelligence');
    } finally {
      setIsLoadingWfIntel(false);
    }
  };

  const handleApproveHiddenSkill = async (employeeId: string, skillName: string) => {
    setApprovingSkill(`${employeeId}-${skillName}`);
    try {
      const res = await fetch(`${API_BASE}/skills/approve-hidden`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}`
        },
        body: JSON.stringify({ employeeId, skillName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Skill approved successfully');
        await fetchWfIntel();
      } else {
        toast.error(data.error || 'Failed to approve skill');
      }
    } catch (err) {
      toast.error('Failed to approve skill');
    } finally {
      setApprovingSkill(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'Workforce Intelligence') {
      fetchWfIntel();
    }
  }, [activeTab]);

  const handleClaimReview = async (review: any) => {
    try {
      const res = await fetch(`${API_BASE}/admin/reviews/claim`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}`
        },
        body: JSON.stringify({ sessionId: review.session_id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Review claimed successfully');
        fetchReviews();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to claim review');
    }
  };

  // Grant a one-time re-assessment for THIS review's employee + skill, bypassing
  // the 7-day cooldown. Consumed on their next attempt for that skill.
  const handleGrantReviewRetake = async () => {
    if (!selectedReview) return;
    const employeeId = selectedReview.employee_id || selectedReview.zensar_id;
    const skill = selectedReview.skill_name;
    if (!employeeId || !skill) { toast.error('This review is missing an employee or skill.'); return; }
    setReviewGrantBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/zenassess/grant-retake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}` },
        body: JSON.stringify({ employeeId, skills: [skill] }),
      });
      const txt = await res.text();
      let data: any = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch { throw new Error('Endpoint not found — the backend may be out of date. Restart it (npm run server).'); }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReviewGranted(true);
      toast.success(`Re-assessment granted for ${skill}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant re-assessment.');
    } finally {
      setReviewGrantBusy(false);
    }
  };

  // Derive an employee's primary / secondary / tertiary skill names — prefer the
  // declared primary skill, then fill from the highest-rated (or verified) skills.
  const getTop3Skills = (emp: any): string[] => {
    const out: string[] = [];
    const push = (n?: string) => {
      const v = (n || '').trim();
      if (v && !out.some(x => x.toLowerCase() === v.toLowerCase())) out.push(v);
    };
    push(emp.primary_skill || emp.primarySkill);
    push(emp.secondary_skill || emp.secondarySkill);
    push(emp.tertiary_skill || emp.tertiarySkill);
    const rated = (emp.skills || [])
      .filter((s: any) => (s.selfRating || 0) > 0 || s.verifiedBadgeLevel)
      .sort((a: any, b: any) => (b.selfRating || 0) - (a.selfRating || 0));
    rated.forEach((s: any) => push(s.skillName));
    return out.slice(0, 3);
  };

  // Grant a one-time re-assessment for a SINGLE skill of an employee. State is
  // keyed per employee+skill so each skill has its own independent Approve button.
  const raKey = (empId: string, skill: string) => `${empId}::${skill.toLowerCase()}`;
  const handleGrantSkill = async (emp: any, skill: string) => {
    const key = raKey(String(emp.id), skill);
    setRaBusyId(key);
    try {
      const res = await fetch(`${API_BASE}/admin/zenassess/grant-retake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}` },
        body: JSON.stringify({ employeeId: emp.id, skills: [skill] }),
      });
      const txt = await res.text();
      let data: any = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch { throw new Error('Endpoint not found — the backend may be out of date. Restart it (npm run server).'); }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRaGranted(prev => new Set(prev).add(key));
      toast.success(`Re-assessment granted to ${emp.name} for ${skill}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant re-assessment.');
    } finally {
      setRaBusyId(null);
    }
  };

  const handleReviewAction = async (action: 'approve' | 'reject' | 'escalate') => {
    if (!selectedReview) return;
    try {
      let body: any = { sessionId: selectedReview.session_id };
      if (action === 'escalate') {
        body.escalationReason = escalationReason;
        body.escalatedTo = escalatedTo;
      } else {
        body.reviewNotes = reviewNotes;
        
        // Recalculate V6 final score: Scenario 25%, Evidence 40%, Mentoring 20%, Experience 15%
        const finalScore = Math.round(
          (adjustedScenarioScore * 0.25) +
          (adjustedEvidenceScore * 0.40) +
          (adjustedMentoringScore * 0.20) +
          (adjustedExperienceScore * 0.15)
        );
        const allocationConfidence = Math.round(
          (adjustedScenarioScore * 0.3) +
          (adjustedEvidenceScore * 0.4) +
          (adjustedMentoringScore * 0.15) +
          (adjustedExperienceScore * 0.15)
        );
        body.adjustedScores = {
          scenarioScore: adjustedScenarioScore,
          evidenceScore: adjustedEvidenceScore,
          mentoringScore: adjustedMentoringScore,
          experienceScore: adjustedExperienceScore,
          finalScore,
          allocationConfidence
        };
      }

      const res = await fetch(`${API_BASE}/admin/reviews/${action}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}`
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Review ${action}d successfully`);
        setShowReviewActionModal(null);
        setSelectedReview(null);
        setReviewNotes('');
        setEscalationReason('');
        fetchReviews();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} review`);
    }
  };

  // ── Extract text from PDF (with proper visual line detection) ──
  const extractPDFText = async (file: File): Promise<string> => {
    try {
      const nm = (file.name || '').toLowerCase();
      if (nm.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return await extractTextFromFile(file); // Word → mammoth
      }
      const pdfjsLib = (window as any).pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          // Group text items by Y-position to reconstruct visual lines
          let lastY: number | null = null;
          let line = '';
          for (const item of content.items as any[]) {
            const y = item.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > 3) {
              // Y position changed → new visual line
              if (line.trim()) fullText += line.trim() + '\n';
              line = '';
            }
            line += (item.str || '') + ' ';
            lastY = y;
          }
          if (line.trim()) fullText += line.trim() + '\n';
          fullText += '\n'; // page separator
        }
        return fullText;
      }
      // Non-PDF files (txt, doc)
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        return '';
      }
      return await file.text();
    } catch (e) {
      console.error('[PDF Extract]', e);
      return '';
    }
  };


  // ── Scan resume and auto-fill form ──
  const handleResumeScan = async (file: File) => {
    setResumeScanLoading(true);
    setResumeScanned(false);
    try {
      // Step 1: Extract text
      const text = await extractPDFText(file);
      const resumeText = text.trim();
      if (!resumeText || resumeText.startsWith('%PDF') || resumeText.includes('\x00')) {
        toast.error('PDF reader not ready. Please refresh the page and try again.');
        setResumeScanLoading(false);
        return;
      }
      console.log('[Resume Scan] Text length:', resumeText.length, '| First 120:', resumeText.slice(0, 120));

      // ── Regex helpers (always reliable) ──
      const rGet = (re: RegExp) => (resumeText.match(re)?.[1] ?? resumeText.match(re)?.[0] ?? '').trim();

      // Extract email & phone via regex (very reliable)
      const rxEmail = rGet(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
      const rxPhone = rGet(/(\+?[\d][\d\s\-(). ]{7,15}[\d])/);

      // Extract name: labeled field first, then heuristic scan
      const rxName = (() => {
        // First try labeled: "Name: Kishore S" or "Candidate Name: ..."
        const labeled = rGet(/(?:^|\n)(?:candidate\s*)?name\s*[:\-–]\s*([A-Za-z][A-Za-z .'-]+)/im);
        if (labeled && labeled.length > 2) return labeled.trim();
        // Scan first 20 lines for a name-like line (allow single-char initials)
        const lines = resumeText.split('\n').slice(0, 20).map(l => l.trim()).filter(l => l.length > 1 && l.length < 55);
        for (const l of lines) {
          if (/[@\d|\\/#<>{}\[\]]/.test(l)) continue;
          if (/^(resume|cv|curriculum|vitae|profile|summary|contact|email|phone|mobile|address|www|http|dear|to|from|date|ref)/i.test(l)) continue;
          // Title Case: "Kishore S" or "Rahul Kumar Sharma" — allow 1-char words (initials)
          if (/^[A-Z][a-zA-Z'-]*(?:\s[A-Z][a-zA-Z'-]*){1,3}$/.test(l)) return l;
          // ALL CAPS: "KISHORE S" or "RAHUL KUMAR"
          if (/^[A-Z]+(?:\s[A-Z]+){1,3}$/.test(l) && !/^(QA|IT|UI|UX|HR|DB|AI|ML|DL|CI|CD)$/.test(l)) {
            return l.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          }
          // all lowercase: "kishore s"
          if (/^[a-z][a-z'-]*(?:\s[a-z][a-z'-]*){1,3}$/.test(l) && l.split(' ').length >= 2) {
            return l.replace(/\b\w/g, c => c.toUpperCase());
          }
        }
        // Last fallback: first 2-word short line with no special chars
        return lines.find(l => !/@|\d/.test(l) && l.split(' ').length === 2 && l.length < 35) || '';
      })();

      // Designation - check for labeled field or second prominent line
      const rxDesig = rGet(/(?:designation|title|position|current\s*role|profile|objective)\s*[:\-–]\s*([A-Za-z][A-Za-z .\/]+)/im)
        || rGet(/^(?:software|senior|junior|lead|associate|principal|staff|qa|quality|devops|full.?stack|front.?end|back.?end|data|mobile|android|ios|test)\s+\w+/im);

      // Location — labeled field or Indian city names
      const rxLocation = (
        rGet(/(?:location|city|address|residing|place|based(?:\s*(?:at|in|out))?|current\s*loc(?:ation)?|living\s*in)\s*[:\-–]\s*([A-Za-z][A-Za-z ,]+?)(?:\n|,\s*\d|\s{3,}|$)/im)
        || (() => {
          // Scan for Indian city names directly
          const m = resumeText.match(/((?:[A-Za-z]+[,\s]+)?(?:Chennai|Pune|Bangalore|Bengaluru|Hyderabad|Mumbai|Delhi|Noida|Gurgaon|Gurugram|Kolkata|Ahmedabad|Surat|Jaipur|Coimbatore|Madurai|Kochi|Trivandrum|Nagpur|Indore|Bhopal|Chandigarh|Lucknow|Patna|Mysore|Mysuru|Vizag|Visakhapatnam|Vadodara|Rajkot|Thane|Navi Mumbai|Greater Noida|Faridabad|Ghaziabad)(?:[,\s]+[A-Za-z]+)?)/i);
          return m?.[1]?.trim() || '';
        })()
      );

      // Department  
      const rxDept = rGet(/(?:department|division|team|vertical|practice|domain)\s*[:\-–]\s*([A-Za-z][A-Za-z ]+?)(?:\n|$)/im);

      // Years IT - comprehensive patterns
      const rxYearsIT = (() => {
        const pats = [
          /(\d+)(?:\.\d+)?\s*\+?\s*(?:years?|yrs?).*?(?:IT|software|technolog|develop|testing|engineer|industry|work)/i,
          /(?:experience|exp(?:erience)?)\s*(?:of\s*)?[:\-–]?\s*(\d+)(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)/i,
          /(\d+)(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:total\s+)?(?:professional\s+)?experience/i,
          /total\s+(?:work\s+)?(?:exp|experience)[:\s]*(\d+)/i,
          /(?:having|with)\s+(\d+)(?:\.\d+)?\s*\+?\s*(?:year|yr)/i,
          /(\d+)\s*\+?\s*(?:year|yr)s?\s+(?:as|in)\s+(?:a\s+)?(?:QA|developer|engineer|analyst)/i,
        ];
        for (const p of pats) { const m = resumeText.match(p); if (m) return parseInt(m[1]) || 0; }
        return 0;
      })();

      // Step 2: Try High-Fidelity LLM Extraction
      let llm: any = {};
      try {
        const prompt = `Extract employee info from this resume. Return ONLY a JSON object, no markdown, no explanation.
Format: {"name":"","email":"","phone":"","designation":"","location":"","department":"","yearsIT":0,"yearsZensar":0}
Resume: ${resumeText.slice(0, 3000)}
JSON:`;

        const result = await callResumeLLM(prompt);
        if (result.data) {
          llm = result.data;
          console.log('[Resume Scan] High-Fidelity LLM Success:', llm);
        }
      } catch (e) { console.warn('[Resume Scan] LLM failed:', e); }

      // Step 2b: Extract Skills, Projects, Certificates, Education, Achievements (COMPREHENSIVE)
      let detailsExtraction: any = {};
      try {
        const detailsPrompt = `🚨 CRITICAL EXTRACTION TASK - READ CAREFULLY 🚨

You are extracting data from a PROFESSIONAL RESUME. Extract ALL skills, projects, achievements, certifications, and education.

STEP 1: EXTRACT SKILLS FROM PREDEFINED LIST ONLY (CRITICAL)
⚠️ ONLY extract skills that EXACTLY MATCH these 32 predefined skills:

TOOLS: Selenium, Appium, JMeter, Postman, JIRA, TestRail
TECHNOLOGIES: Python, Java, JavaScript, TypeScript, C#, SQL
APPLICATIONS: API Testing, Mobile Testing, Performance Testing, Security Testing, Database Testing
DOMAINS: Banking, Healthcare, E-Commerce, Insurance, Telecom
TESTING TYPES: Functional Testing, Automation Testing, Regression Testing, UAT
DEVOPS: Git, Jenkins, Docker, Azure DevOps
AI: ChatGPT/Prompt Engineering, AI Test Automation

EXTRACTION RULES:
- Look in "Core competencies/skills", "Tools", "Databases", "Domains", "Expertise" sections
- ONLY extract skills that EXACTLY match the 32 names above (case-sensitive)
- DO NOT extract: AWS, GCP, Oracle, DB2, Postgres, Test Management, Scrum Master, HP ALM, ACCELQ, or any other skills not in the list
- Rate each skill 1-5 based on prominence (Primary skills = 4-5, Secondary = 2-3, Mentioned = 1-2)
- Extract AT LEAST 5-10 matching skills from the resume

CRITICAL: If you extract less than 5 skills, YOU HAVE FAILED.

STEP 2: EXTRACT ALL PROJECTS
- Look for "PROFESSIONAL EXPERIENCE" section
- Each line starting with "Project -" is a SEPARATE project
- Extract: name, client, role, startDate, endDate, description, technologies, duration

STEP 3: EXTRACT ALL ACHIEVEMENTS
⚠️ STRICT RULE - Only extract REAL awards/recognitions. DO NOT extract project metrics or outcomes.

✅ VALID achievements (extract these):
- Named awards: Pegasus, Gold Award, Silver Award, Bronze Medal, Best Team Award, Star Award
- External recognitions: Kaggle medals, hackathon wins, competition rankings
- Client appreciation: "Appreciated by client for quality and timely delivery"

❌ INVALID - DO NOT extract these as achievements:
- Project metrics: "Reduced false positive rate by 20%", "Improved accuracy to 82%"
- Project outcomes: "Data Quality Improvement", "Page Load Speed Improvement"
- Technical improvements: "Reduced manual review time", "Experiment time reduction"
- Anything that is a project result/KPI/metric

WHERE TO LOOK:
- "Awards" section: extract named awards (Pegasus, Gold, Silver, etc.)
- "Major achievements" in each project: ONLY if it is a NAMED AWARD, not a metric
- "Any client appreciation" in each project: extract client appreciation text

IF NO AWARDS EXIST IN THE RESUME → return empty achievements array []

STEP 4: EXTRACT ALL CERTIFICATIONS
- Look in "Certifications" section
- Extract each bullet point as separate certification

STEP 5: EXTRACT EDUCATION
- Look in "Education" section

RESUME TEXT (${resumeText.length} characters):
${resumeText.slice(0, 50000)}

OUTPUT FORMAT (STRICT JSON):
{
  "skills": [
    {"name": "JIRA", "rating": 4},
    {"name": "Azure DevOps", "rating": 4},
    {"name": "GCP", "rating": 3},
    {"name": "AWS", "rating": 3},
    {"name": "HP ALM", "rating": 3},
    {"name": "Test Management", "rating": 5},
    {"name": "Scrum Master", "rating": 5},
    {"name": "Project Management", "rating": 4},
    {"name": "Banking", "rating": 4},
    {"name": "Insurance", "rating": 3},
    {"name": "Healthcare", "rating": 2},
    {"name": "Oracle", "rating": 3},
    {"name": "DB2", "rating": 3},
    {"name": "Postgres SQL", "rating": 3}
  ],
  "projects": [
    {
      "name": "Tesco Bank - IT Infrastructure Testing",
      "client": "Tesco Bank",
      "role": "Test Manager",
      "description": "IT Infrastructure testing for banking systems...",
      "duration": "Sep 2025 to Feb 2026",
      "technologies": ["AWS", "Azure", "Google Cloud"]
    }
  ],
  "certifications": [
    {"name": "Google Cloud Digital Leader", "issuer": "Google", "date": ""}
  ],
  "education": [
    {"degree": "B. Tech in Information Technology", "institution": "", "year": "2003-2007"}
  ],
  "achievements": [
    {"title": "Pegasus Award", "type": "Pegasus", "description": "", "project": ""}
  ]
}

CRITICAL REQUIREMENTS:
- Extract ONLY skills from the 32 predefined skills list (JIRA, Python, Banking, etc.)
- Extract AT LEAST 5-10 matching skills from the predefined list
- Extract AT LEAST 5 projects if resume has work experience
- Extract ALL certifications and achievements
- Rate skills 1-5: Primary skills = 4-5, Secondary skills = 2-3, Mentioned = 1-2
- YOU FAIL if you extract less than 5 skills OR if you extract skills not in the predefined list

Return ONLY valid JSON. NO markdown. NO explanations.`;

        const detailsResult = await callResumeLLM(detailsPrompt);
        if (detailsResult.data) {
          detailsExtraction = detailsResult.data;
          console.log('[Resume Scan] Comprehensive Details Extraction Success:', detailsExtraction);
        }
      } catch (e) { console.warn('[Resume Scan] Details extraction failed:', e); }

      // Step 3: Merge — LLM fills where regex couldn't, regex wins for email/phone
      const final = {
        name:        (llm.name?.trim()        || rxName        || ''),
        email:       (rxEmail                 || llm.email?.trim()        || ''),
        phone:       (rxPhone                 || llm.phone?.trim()        || ''),
        designation: (llm.designation?.trim() || rxDesig       || ''),
        location:    (llm.location?.trim()    || rxLocation    || ''),
        department:  (llm.department?.trim()  || rxDept        || ''),
        yearsIT:     (parseInt(llm.yearsIT || '0') || rxYearsIT || 0),
        yearsZensar: parseInt(llm.yearsZensar || '0') || 0,
      };
      console.log('[Resume Scan] Final:', final);

      // Step 4: Apply basic info
      const filled: string[] = [];
      const updates: Record<string, string> = {};
      if (final.name)        { updates.name        = final.name.slice(0, 60);         filled.push('Name'); }
      if (final.email)       { updates.email       = final.email;                     filled.push('Email'); }
      if (final.phone)       { updates.phone       = final.phone.replace(/\s+/g, ' ');filled.push('Phone'); }
      if (final.designation) { updates.designation = final.designation.slice(0, 60);  filled.push('Designation'); }
      if (final.location)    { updates.location    = final.location.slice(0, 50);     filled.push('Location'); }
      if (final.department)  { updates.department  = final.department.slice(0, 50);   filled.push('Department'); }
      if (final.yearsIT)     { updates.yearsIT     = String(final.yearsIT);           filled.push('Years IT'); }
      if (final.yearsZensar) { updates.yearsZensar = String(final.yearsZensar); }

      // Apply extracted details - FILTER TO ONLY PREDEFINED 32 SKILLS
      const PREDEFINED_SKILLS = [
        'Selenium', 'Appium', 'JMeter', 'Postman', 'JIRA', 'TestRail',
        'Python', 'Java', 'JavaScript', 'TypeScript', 'C#', 'SQL',
        'API Testing', 'Mobile Testing', 'Performance Testing', 'Security Testing', 'Database Testing',
        'Banking', 'Healthcare', 'E-Commerce', 'Insurance', 'Telecom',
        'Functional Testing', 'Automation Testing', 'Regression Testing', 'UAT',
        'Git', 'Jenkins', 'Docker', 'Azure DevOps',
        'ChatGPT/Prompt Engineering', 'AI Test Automation'
      ];
      
      const extractedSkills = Array.isArray(detailsExtraction.skills) 
        ? detailsExtraction.skills
            .map((s: any) => {
              if (typeof s === 'string') return { name: s, rating: 3 };
              if (typeof s === 'object' && s !== null) return { name: s.name || s.skill || '', rating: s.rating || s.level || 3 };
              return { name: String(s), rating: 3 };
            })
            .filter((s: any) => PREDEFINED_SKILLS.includes(s.name)) // ONLY KEEP PREDEFINED SKILLS
        : [];
      const extractedProjects = Array.isArray(detailsExtraction.projects) ? detailsExtraction.projects.map((p: any) => ({ name: p.name || '', description: p.description || '', technologies: p.technologies || [], duration: p.duration || '' })) : [];
      // Handle both 'certifications' and 'certificates' field names from LLM
      const certsList = detailsExtraction.certifications || detailsExtraction.certificates || [];
      const extractedCertificates = Array.isArray(certsList) ? certsList.map((c: any) => ({ name: c.name || '', issuer: c.issuer || '', date: c.date || '' })) : [];
      const extractedEducation = Array.isArray(detailsExtraction.education) ? detailsExtraction.education.map((e: any) => ({ degree: e.degree || '', institution: e.institution || '', year: e.year || '' })) : [];

      setExtractedDetails({
        skills: extractedSkills,
        projects: extractedProjects,
        certificates: extractedCertificates,
        education: extractedEducation
      });

      // Save raw extracted data for comparison page (COMPREHENSIVE FORMAT)
      // Determine primary and secondary skills from extracted skills (highest rated)
      const sortedSkills = [...extractedSkills].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      const primarySkill = sortedSkills[0]?.name || '';
      const secondarySkill = sortedSkills[1]?.name || '';
      
      setRawExtractedData({
        skills: detailsExtraction.skills || [],
        projects: detailsExtraction.projects || [],
        certifications: detailsExtraction.certifications || detailsExtraction.certificates || [],
        education: detailsExtraction.education || [],
        achievements: detailsExtraction.achievements || [],
        profile: {
          name: final.name,
          email: final.email,
          phone: final.phone,
          designation: final.designation,
          location: final.location,
          yearsIT: final.yearsIT,
          yearsZensar: final.yearsZensar,
          primarySkill: primarySkill,
          secondarySkill: secondarySkill
        }
      });

      if (filled.length > 0 || extractedSkills.length > 0 || extractedProjects.length > 0) {
        setNewEmployee(prev => ({ ...prev, ...updates }));
        setResumeScanned(true);
        const allFilled = [...filled];
        if (extractedSkills.length > 0) allFilled.push(`${extractedSkills.length} Skills`);
        if (extractedProjects.length > 0) allFilled.push(`${extractedProjects.length} Projects`);
        if (extractedCertificates.length > 0) allFilled.push(`${extractedCertificates.length} Certificates`);
        if (extractedEducation.length > 0) allFilled.push(`${extractedEducation.length} Education`);
        const achievementsCount = Array.isArray(detailsExtraction.achievements) ? detailsExtraction.achievements.length : 0;
        if (achievementsCount > 0) allFilled.push(`${achievementsCount} Achievements`);
        toast.success(`✅ Auto-filled: ${allFilled.join(' · ')}`);
      } else {
        toast.error('Could not extract details. Please fill the form manually.');
      }
    } catch (e) {
      console.error('[Resume Scan Error]', e);
      toast.error('Scan failed. Please fill the form manually.');
    } finally {
      setResumeScanLoading(false);
    }
  };


  const [employees, setEmployees] = useState<any[]>([]);
  const [skillDemand, setSkillDemand] = useState<Record<string, number>>({});

  // Demand signal: how many open BFSI roles reference each canonical skill (best-effort)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/bfsi/roles`);
        if (!res.ok) return;
        const json = await res.json();
        const roles = json.roles || json || [];
        if (!Array.isArray(roles) || roles.length === 0) return;
        const demand: Record<string, number> = {};
        SKILLS.forEach(sk => {
          const n = sk.name.toLowerCase();
          if (n.length < 3) return;
          demand[sk.name] = roles.filter((r: any) => JSON.stringify(r || {}).toLowerCase().includes(n)).length;
        });
        setSkillDemand(demand);
      } catch { /* demand unavailable — Supply/Demand card degrades gracefully */ }
    })();
  }, []);

  // ── Bulk resume import (client-side: reuses ZenScan extraction + create-employee) ──
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: number; skills: number } | null>(null);
  // Login password applied to every profile created in a bulk import batch. Editable
  // per batch; defaults to 1234567890. If a resume already carries its own credentials
  // those are kept (handled below), otherwise this password is used.
  const [bulkPassword, setBulkPassword] = useState('1234567890');
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const handleBulkResumeImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter(f => /\.(pdf|docx)$/i.test(f.name)).slice(0, 100);
    if (list.length === 0) { toast.error('Please select PDF or Word (.docx) resume files'); return; }
    const batchPassword = (bulkPassword || '').trim() || '1234567890';
    setBulkImporting(true);
    setBulkResult(null);
    setBulkProgress({ current: 0, total: list.length });
    let created = 0, failed = 0, skillsTotal = 0;
    for (let i = 0; i < list.length; i++) {
      setBulkProgress({ current: i + 1, total: list.length });
      try {
        let text = '';
        try { text = await extractTextFromFile(list[i]); } catch { failed++; continue; }
        if (!text || !text.trim()) { failed++; continue; }
        let data: any;
        try { data = await accurateExtractFromResume(text); } catch { failed++; continue; }
        const p = data.profile || {};
        const skillsArr = Object.entries(data.skills || {})
          .filter(([, v]) => (v as number) > 0)
          .map(([name, rating]) => ({ name, rating: rating as number }));
        const projects = (data.projects || []).map((pr: any) => ({
          name: pr.ProjectName || pr.name || '',
          description: pr.Description || pr.description || '',
          technologies: pr.Technologies || pr.technologies || [],
          duration: [pr.StartDate, pr.EndDate].filter(Boolean).join(' - '),
        }));
        const certificates = (data.certifications || [])
          .map((c: any) => ({ name: c.CertName || c.certName || c.name || (typeof c === 'string' ? c : ''), issuer: c.Provider || c.issuer || '' }))
          .filter((c: any) => c.name);
        const education = (data.education || []).map((e: any) => ({ degree: e.degree || '', institution: e.institution || '', field: e.field || '', year: e.year || '' }));
        // Use the Zensar ID mentioned on the resume (or in the file name) when present.
        // If none is found, leave employeeId blank — the backend auto-assigns the next
        // sequential ID (100001, 100002, …) and flags it so an admin can fill it in later.
        const detectedZid = extractZensarIdFromText(text, list[i].name) || (data.profile?.zensarId ? String(data.profile.zensarId) : '') || '';
        // A stable, unique-ish email only used when the resume has no email of its own.
        const emailSeed = detectedZid || `imp${Date.now().toString(36)}${i}`;
        const email = (p.email && String(p.email).includes('@')) ? p.email : `${emailSeed.toLowerCase()}@imported.zensar`;
        const token = localStorage.getItem('zn_access_token');
        const res = await fetch(`${API_BASE}/admin/create-employee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            name: p.name || list[i].name.replace(/\.(pdf|docx)$/i, ''),
            email, employeeId: detectedZid, phone: p.phone || '',
            designation: p.designation || '', location: p.location || '',
            yearsIT: p.yearsIT || 0, yearsZensar: 0, password: (p.password && String(p.password).trim()) ? String(p.password).trim() : batchPassword,
            primarySkill: p.primarySkill || '', secondarySkill: p.secondarySkill || '', tertiarySkill: p.tertiarySkill || '',
            skills: skillsArr, projects, certificates, education,
          }),
        });
        if (res.ok) { created++; skillsTotal += skillsArr.length; } else { failed++; }
      } catch { failed++; }
    }
    setBulkResult({ created, failed, skills: skillsTotal });
    setBulkImporting(false);
    if (bulkInputRef.current) bulkInputRef.current.value = '';
    await loadAllData();
    toast.success(`Bulk import complete: ${created} created · ${failed} failed`);
  };

  // ── Set the real Zensar ID for an auto-assigned (imported) employee ──
  const [zidModalEmp, setZidModalEmp] = useState<any | null>(null);
  const [zidInput, setZidInput] = useState('');
  const [zidSaving, setZidSaving] = useState(false);
  const openSetZensarId = (emp: any) => { setZidModalEmp(emp); setZidInput(''); };
  const handleSetZensarId = async () => {
    if (!zidModalEmp) return;
    const clean = (zidInput || '').replace(/[^0-9]/g, '');
    if (clean.length !== 5 && clean.length !== 6) { toast.error('Zensar ID must be exactly 5 or 6 digits'); return; }
    setZidSaving(true);
    try {
      const token = localStorage.getItem('zn_access_token');
      const res = await fetch(`${API_BASE}/admin/employees/set-zensar-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: String(zidModalEmp.id), zensarId: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not set Zensar ID'); return; }
      toast.success(`Zensar ID set to ${clean}`);
      setZidModalEmp(null);
      setZidInput('');
      await loadAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Could not set Zensar ID');
    } finally {
      setZidSaving(false);
    }
  };

  // Bench risk from project history (days since last project ended)
  const benchRiskOf = (e: any): { label: string; color: string; days: number } => {
    const projs = e.projects || [];
    if (projs.some((p: any) => p.IsOngoing || p.is_ongoing)) return { label: 'Low', color: '#10B981', days: 0 };
    const ends = projs
      .map((p: any) => p.EndDate || p.end_date)
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime())
      .filter((t: number) => !isNaN(t));
    if (ends.length === 0) return { label: 'Unknown', color: '#6B7280', days: -1 };
    const days = Math.round((Date.now() - Math.max(...ends)) / (24 * 3600 * 1000));
    if (days < 14) return { label: 'Low', color: '#10B981', days };
    if (days < 30) return { label: 'Medium', color: '#F59E0B', days };
    if (days < 60) return { label: 'High', color: '#F97316', days };
    return { label: 'Critical', color: '#EF4444', days };
  };
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Advanced Filters
  const [filters, setFilters] = useState({
    role: '',
    minExperience: '',
    maxExperience: '',
    minProjects: '',
    minCertifications: '',
    skillLevel: '', // 'Beginner', 'Intermediate', 'Expert', 'All'
    completionRange: '', // '0-25', '25-50', '50-75', '75-100', 'All'
    hasProjects: false,
    hasCertifications: false,
    isValidated: false,
    selectedSkills: [] as string[], // Array of skill IDs
  });
  const [showFilters, setShowFilters] = useState(false);

  // AI Search state for Manage Employees
  const [aiSearch, setAiSearch] = useState('');
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<any[]>([]);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);

  // AI Search state for Certifications / Achievements / Education / Projects tabs
  const [certSearch, setCertSearch] = useState('');
  const [achSearch, setAchSearch] = useState('');
  const [eduSearch, setEduSearch] = useState('');
  const [projSearch, setProjSearch] = useState('');
  // Expanded cards state (empId → boolean)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const runAiSearch = (query: string, empList: any[]) => {
    if (!query.trim()) { setAiSearchActive(false); setAiSearchResults([]); return; }
    setAiSearchLoading(true);
    setAiSearchActive(true);
    const q = query.trim().toLowerCase();
    const qWords = q.split(/\s+/).filter(w => w.length > 1);
    const matches = (text: string) => {
      const t = (text || '').toLowerCase();
      return t.includes(q) || qWords.some(w => t.includes(w));
    };
    const scored = empList.map(e => {
      let score = 0;
      if (matches(e.name)) score += 30;
      if (matches(e.zensar_id || e.id)) score += 25;
      if (matches(e.designation)) score += 20;
      if (matches(e.department)) score += 15;
      if (matches(e.location)) score += 15;
      if (matches(e.email)) score += 10;
      (e.skills || []).forEach((s: any) => { if (s.selfRating > 0 && matches(s.skillName)) score += 18; });
      (e.certifications || []).forEach((c: any) => { if (matches(c.cert_name || c.name || '')) score += 22; });
      (e.projects || []).forEach((p: any) => { if (matches(p.project_name || p.name || '') || matches(p.client || '')) score += 16; });
      return { ...e, _aiScore: score };
    }).filter(e => e._aiScore > 0).sort((a, b) => b._aiScore - a._aiScore);
    setAiSearchResults(scored);
    setAiSearchLoading(false);
  };

  // Popup Preview State
  const [previewUser, setPreviewUser] = useState<any | null>(null);
  const [previewData, setPreviewData] = useState<AppData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [popupActiveTab, setPopupActiveTab] = useState<'ZenRadar' | 'Skill Group' | 'ZenScan' | 'ZenMatrix' | 'QI SL ZenMatrix' | 'ZenCode' | 'My Education' | 'My Projects' | 'My Certification' | 'My Achievements' | 'ZenProfile'>('ZenRadar');
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── Multi-select delete (Manage Employees) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const token = localStorage.getItem('zn_access_token');
      const res = await fetch(`${API_BASE}/admin/employees/bulk`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ employeeIds: ids }),
      });
      const result = await res.json().catch(() => ({}));
      // Only treat as success if the SERVER confirms it actually deleted rows.
      if (!res.ok || !result.success) {
        throw new Error(result.error || `Delete failed (HTTP ${res.status})`);
      }
      const deleted = Number(result.deleted ?? 0);
      if (deleted === 0) {
        throw new Error('No employees were deleted (no matching IDs on the server).');
      }
      toast.success(`${deleted} employee${deleted > 1 ? 's' : ''} deleted successfully`);
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      await loadAllData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete selected employees');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Visible (filtered + sorted) employees in the Manage Employees tab.
  // Used by the grid AND select-all so both always agree on the same rows.
  const computeVisibleEmployees = (): any[] => {
    return (aiSearchActive ? aiSearchResults : employees)
      .filter((e: any) => {
        if (aiSearchActive) return true;
        const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
        const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
        const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) &&
                           (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
        const matchesSkills = !(filters.selectedSkills || []).length || (filters.selectedSkills || []).every((skillId: string) =>
          (e.skills || []).some((s: any) => s.skillId === skillId && s.selfRating > 0));
        const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
        const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
        const matchesCompletion = !filters.completionRange || (() => {
          const [min, max] = filters.completionRange.split('-').map(Number);
          return e.completion >= min && e.completion <= max;
        })();
        const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
        const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
        const matchesValidated = !filters.isValidated || e.submitted;
        return matchesSearch && matchesRole && matchesExp && matchesSkills && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
      })
      .sort((a: any, b: any) => {
        if (aiSearchActive) return 0;
        if (sortOrder === 'A-Z') return a.name?.localeCompare(b.name);
        if (sortOrder === 'Z-A') return b.name?.localeCompare(a.name);
        if (sortOrder === 'Newest') return (b.id || '').localeCompare(a.id || '');
        if (sortOrder === 'Oldest') return (a.id || '').localeCompare(b.id || '');
        return 0;
      });
  };

  // ── DELETE employee ──
  const handleDeleteEmployee = async (empId: string, empName: string) => {
    setGlobalLoading(`Purging ${empName} from records...`);
    try {
      const res = await fetch(`${API_BASE}/employees/${empId}`, { method: 'DELETE' });
      const d = await res.json();
      if (res.ok && d.success) {
        toast.success(`🗑️ Account for "${empName}" permanently removed.`);
        setPreviewUser(null);
        setPreviewData(null);
        setDeleteConfirming(false);
        loadAllData();
      } else {
        toast.error(d.error || 'Failed to remove employee');
      }
    } catch (e) {
      toast.error('Network failure during sync purge');
    } finally {
      setGlobalLoading(null);
    }
  };

  // Edit State for Personal Details
  const [editForm, setEditForm] = useState({
    name: '',
    zensar_id: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
    location: '',
    years_it: 0,
    years_zensar: 0,
    password: '',
    primary_skill: '',
    primary_domain: ''
  });

  const handleOpenPreview = async (emp: any, targetTab?: typeof popupActiveTab) => {
    setIsPreviewLoading(true);
    setGlobalLoading('Accessing Employee Portfolio...');
    setPreviewUser(emp);
    setPopupActiveTab(targetTab || 'ZenRadar');
    setEditForm({
      name: emp.name || emp.Name || '',
      zensar_id: emp.zensar_id || emp.ZensarID || emp.id || '',
      email: emp.email || emp.Email || '',
      phone: emp.phone || emp.Phone || '',
      designation: emp.designation || emp.Designation || '',
      department: emp.department || emp.Department || '',
      location: emp.location || emp.Location || '',
      years_it: emp.years_it || emp.YearsIT || 0,
      years_zensar: emp.years_zensar || emp.YearsZensar || 0,
      password: emp.password || '',
      primary_skill: emp.primary_skill || emp.PrimarySkill || '',
      primary_domain: emp.primary_domain || emp.PrimaryDomain || ''
    });

    try {
      const data = await loadAppData(emp.id);
      setPreviewData(data);
    } catch (err) {
      toast.error('Failed to load employee preview');
    } finally {
      setGlobalLoading(null);
      setIsPreviewLoading(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setGlobalLoading('Synchronizing Global Cloud...');
    try {
      // ── Employees + Skills (essential) ──
      const res = await fetch(`${API_BASE}/employees`);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status} — is the backend running on port 5001?`);
      }
      const d = await res.json();
      const _emps = d.employees || [];
      const _skills = d.skills || [];

      // ── Certifications (non-blocking) ──
      let certifications: any[] = [];
      try {
        const cRes = await fetch(`${API_BASE}/certifications/ALL`);
        if (cRes.ok) ({ certifications } = await cRes.json());
      } catch { /* ignore — show employees without cert data */ }

      // ── Projects (non-blocking) ──
      let projects: any[] = [];
      try {
        const pRes = await fetch(`${API_BASE}/projects/ALL`);
        if (pRes.ok) ({ projects } = await pRes.json());
      } catch { /* ignore — show employees without project data */ }

      // ── Achievements (non-blocking) ──
      let achievements: any[] = [];
      try {
        const aRes = await fetch(`${API_BASE}/achievements/ALL`);
        if (aRes.ok) { const aData = await aRes.json(); achievements = aData.achievements || aData || []; }
      } catch { /* ignore */ }

      // ── Education (non-blocking) ──
      let education: any[] = [];
      try {
        const eRes = await fetch(`${API_BASE}/education/ALL`);
        if (eRes.ok) { const eData = await eRes.json(); education = eData.education || eData || []; }
      } catch { /* ignore */ }

      const formatted = _emps.map((e: any) => {
        const eid = String(e.id || '').toLowerCase();
        const zid = String(e.zensar_id || '').toLowerCase();
        const primaryId = e.zensar_id || e.id;

        const eSkillsRaw = _skills.filter((s: any) => {
          const sid = String(s.employee_id || s.employeeId || '').toLowerCase();
          return sid === eid || (zid && sid === zid);
        });

        // Map predefined skills
        const predefinedRatings = SKILLS.map(sk => {
          const raw = eSkillsRaw.find((s: any) =>
            String(s.skill_name || '').toLowerCase() === sk.name.toLowerCase()
          );
          return {
            skillId: sk.id,
            skillName: sk.name,
            selfRating: (raw?.self_rating || 0) as any,
            managerRating: raw?.manager_rating || null,
            validated: raw?.validated || false,
            verifiedBadgeLevel: raw?.verified_badge_level || null,
            lastValidationDate: raw?.last_validated_date || null,
            isCustom: false
          };
        });

        // Find custom skills (not in predefined list) with ratings > 0
        const predefinedSkillNames = new Set(SKILLS.map(sk => sk.name.toLowerCase()));
        const customSkills = eSkillsRaw
          .filter((s: any) => {
            const skillName = String(s.skill_name || '').toLowerCase();
            return !predefinedSkillNames.has(skillName) && (s.self_rating > 0 || s.manager_rating > 0);
          })
          .map((s: any, idx: number) => ({
            skillId: `custom_${idx}_${String(s.skill_name).replace(/\s+/g, '_')}`,
            skillName: s.skill_name,
            selfRating: s.self_rating || 0,
            managerRating: s.manager_rating || null,
            validated: s.validated || false,
            isCustom: true
          }));

        const ratingsArray = [...predefinedRatings, ...customSkills];

        const eCerts = certifications.filter((c: any) => {
          const cid = String(c.EmployeeID || c.employee_id || '').toLowerCase();
          return cid === eid || (zid && cid === zid);
        });

        const eProjs = projects.filter((p: any) => {
          const pid = String(p.EmployeeID || p.employee_id || '').toLowerCase();
          return pid === eid || (zid && pid === zid);
        });

        const eAchs = achievements.filter((a: any) => {
          const aid = String(a.EmployeeID || a.employee_id || '').toLowerCase();
          return aid === eid || (zid && aid === zid);
        });

        const eEdu = education.filter((ed: any) => {
          const edid = String(ed.EmployeeID || ed.employee_id || '').toLowerCase();
          return edid === eid || (zid && edid === zid);
        });

        return {
          ...e,
          id: primaryId,
          name: e.name || e.Name || 'Unknown',
          skills: ratingsArray,
          certifications: eCerts,
          projects: eProjs,
          achievements: eAchs,
          education: eEdu,
          completion: computeCompletion(ratingsArray),
          submitted: e.submitted || e.Submitted === 'Yes'
        };
      });

      setEmployees(formatted);
    } catch (err: any) {
      console.error('loadAllData error:', err);
      toast.error('Failed to load employee data. Check server connection.');
    } finally {
      setGlobalLoading(null);
      setLoading(false);
    }
  };

  useEffect(() => { loadAllData(); }, []);

  const handleUpdateDetails = async () => {
    setGlobalLoading('Updating Personnel Records...');
    
    try {
      const resp = await fetch(`${API_BASE}/admin/employees/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: previewUser.id,
          ...editForm
        })
      });
      const res = await resp.json();
      if (res.success) {
        toast.success('Personnel record updated and encrypted.');
        await loadAllData();
        // Update local preview state
        setPreviewUser({ ...previewUser, ...editForm });
      } else {
        toast.error(res.error || 'Update failed');
      }
    } catch (e) {
      toast.error('Network failure during sync');
    } finally {
      setGlobalLoading(null);
    }
  };

  const handleAddEmployee = async (openDetails = false, skipEmailCheck = false) => {
    // Validation
    if (!newEmployee.employeeId || !newEmployee.name || !newEmployee.email || !newEmployee.password) {
      toast.error('Zensar ID, Full Name, Email and Password are required');
      return;
    }
    if (!/^\d{5,6}$/.test(newEmployee.employeeId.trim())) {
      toast.error('Zensar ID must be 5 or 6 digits');
      return;
    }
    // Check password match
    if (newEmployee.password !== newEmployee.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    // If email is not @zensar.com and warning not yet confirmed, show warning
    if (!newEmployee.email.includes('@zensar.com') && !skipEmailCheck && !emailWarningConfirmed) {
      setEmailWarningConfirmed(true);
      return;
    }
    // Create employee account with extracted resume data
    // Determine primary skill and domain from extracted skills
    const sortedSkills = [...extractedDetails.skills].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const primarySkill = sortedSkills[0]?.name || '';
    const domainSkills = ['Banking', 'Insurance', 'Healthcare', 'E-Commerce', 'Telecom', 'Retail', 'Energy & Utilities'];
    const primaryDomain = extractedDetails.skills.find(s => domainSkills.includes(s.name))?.name || '';
    
    const payload = {
      name: newEmployee.name,
      email: newEmployee.email,
      employeeId: newEmployee.employeeId,
      phone: newEmployee.phone,
      designation: newEmployee.designation,
      department: newEmployee.department,
      location: newEmployee.location,
      yearsIT: parseFloat(newEmployee.yearsIT) || 0,
      yearsZensar: parseFloat(newEmployee.yearsZensar) || 0,
      password: newEmployee.password,
      primarySkill: primarySkill,
      primaryDomain: primaryDomain,
      // Include extracted resume data
      skills: extractedDetails.skills,
      projects: extractedDetails.projects,
      certificates: extractedDetails.certificates,
      education: extractedDetails.education
    };
    
    const res = await fetch(`${API_BASE}/admin/create-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorMsg = err.error || err.message || 'Failed to create employee';
      console.error('[Admin Create Employee] Error:', errorMsg);
      toast.error(errorMsg);
      setEmailWarningConfirmed(false);
      return;
    }
    
    const result = await res.json();
    const savedCounts = {
      skills: payload.skills?.length || 0,
      projects: payload.projects?.length || 0,
      certificates: payload.certificates?.length || 0,
      education: payload.education?.length || 0
    };
    
    toast.success(`✅ "${newEmployee.name}" created — ${savedCounts.skills} skills, ${savedCounts.projects} projects, ${savedCounts.certificates} certs!`);

    if (openDetails && rawExtractedData) {
      // Employee now exists in DB — open comparison page with correct ID
      setCreatedEmployeeId(newEmployee.employeeId);
      setShowAddEmployeeModal(false);
      setEmailWarningConfirmed(false);
      setShowResumeUploadPage(true);
    } else {
      setShowAddEmployeeModal(false);
      setResumeScanned(false);
      setEmailWarningConfirmed(false);
      setShowEmployeeDetails(false);
      setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' });
      setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] });
      setRawExtractedData(null);
      setActiveTab('Manage Employees');
      loadAllData();
    }
  };
  const stats = {
    teamSize: employees.length,
    submitted: employees.filter(e => e.submitted).length,
    avgComp: employees.length ? Math.round(employees.reduce((acc, e) => acc + e.completion, 0) / employees.length) : 0,
    beginnerCount: employees.reduce((acc, e) => acc + e.skills.filter((s:any)=>s.selfRating===1).length, 0)
  };

  const StatCard = ({ label, value, sub, icon: Icon, color }: any) => (
    <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 16, flex: 1, minWidth: 160 }}>
       <div style={{ padding: 8, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: color, width: 'fit-content', marginBottom: 12 }}>
          <Icon size={16} />
       </div>
       <div style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 2, letterSpacing: -0.5 }}>{value}</div>
       <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{label}</div>
       <div style={{ fontSize: 11, color: T.sub }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '24px 7vw 40px', fontFamily: "'Inter', sans-serif" }}>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        
        {/* Title & Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 30 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>ZenRadar</h1>
            <p style={{ margin: '4px 0 0', color: T.sub, fontSize: 14, fontWeight: 500 }}>Strategic visibility into team capabilities, performance metrics, and skill distribution for informed decision-making.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <button onClick={loadAllData} style={{ padding: '10px 22px', borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
               <RefreshCw size={16} className={loading?'animate-spin':''} /> Sync
            </button>
            <button onClick={() => exportAllToExcel(employees)} style={{ padding: '10px 28px', borderRadius: 12, background: '#22c55e', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
               <Download size={18} /> Export
            </button>
          </div>
        </div>

        {/* Hero Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard label="Team Size" value={stats.teamSize} sub="Total employees" icon={Users} color="#3B82F6" />
          <StatCard label="Submitted" value={stats.submitted} sub={`${stats.submitted}/${stats.teamSize} total`} icon={CheckCircle2} color="#10B981" />
          <StatCard label="Avg Readiness" value={`${stats.avgComp}%`} sub="Team benchmark" icon={TrendingUp} color="#8B5CF6" />
          <StatCard label="Skill Gaps" value={stats.beginnerCount} sub="Development needs" icon={AlertTriangle} color="#F59E0B" />
        </div>

        {/* Main Viewport */}
        <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: '24px 7vw', maxWidth: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 12, width: 'fit-content', maxWidth: '100%', marginBottom: 24, border: `1px solid ${T.bdr}` }}>
            {[
              { id: 'Overview',          icon: BarChart3,      color: '#3B82F6' },
              { id: 'Manage Employees',  icon: Users,          color: '#3B82F6' },
              // { id: 'Skill Heatmap',  icon: Grid,           color: '#3B82F6' }, // temporarily hidden
              { id: 'QI SL Heatmap',      icon: Brain,          color: '#EC4899' },
              { id: 'Skill Groups',      icon: Layers,         color: '#06B6D4' },
              { id: 'Certifications',    icon: Award,          color: '#10B981' },
              { id: 'Achievements',      icon: Sparkles,       color: '#F59E0B' },
              { id: 'Education',         icon: GraduationCap,  color: '#8B5CF6' },
              { id: 'Projects',          icon: Briefcase,      color: '#F97316' },
              { id: 'Expert Reviews',    icon: Shield,         color: '#8B5CF6' },
              { id: 'Re-assessment',     icon: Lock,           color: '#F59E0B' },
              { id: 'Workforce Intelligence', icon: Brain,     color: '#EC4899' },
            ].map((t: any) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: activeTab === t.id ? t.color : 'transparent',
                  color: activeTab === t.id ? '#fff' : T.sub,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s', flexShrink: 0
                }}
              >
                <t.icon size={14} /> {t.id}
              </button>
            ))}
          </div>

          {activeTab === 'Overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 30, animation: 'fadeIn 0.4s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 30 }}>
              <div>
                <h3 style={{ margin: '0 0 32px', fontSize: 18, fontWeight: 800, display:'flex', alignItems:'center', gap:12 }}><BarChart3 size={20} color="#3B82F6" /> Distribution</h3>
                <div style={{ height: 350 }}>
                  <Bar
                    data={{
                      labels: ['Tool', 'Tech', 'App', 'Dom', 'Test', 'Devs', 'AI'],
                      datasets: [{ label: 'Readiness', data: [2.1, 2.4, 1.8, 2.8, 2.3, 1.5, 2.0], backgroundColor: '#3B82F6', borderRadius: 6, barThickness: 24 }]
                    }}
                    options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: T.sub, font: { size: 10, weight: 600 } }, beginAtZero: true, max: 3 }, x: { grid: { display: false }, ticks: { color: T.sub, font: { size: 10, weight: 600 } } } } }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', alignContent: 'start', gap: 20 }}>
                 {[{l:'Senior (>75%)', c:employees.filter(e=>e.completion>=75).length, col: '#10B981'}, {l:'Mid (50-74%)', c:employees.filter(e=>e.completion>=50 && e.completion<75).length, col: '#3B82F6'}, {l:'Junior (<50%)', c:employees.filter(e=>e.completion<50).length, col: '#EF4444'}].map(t=>(
                    <div key={t.l} style={{ background: T.bg, padding: 24, borderRadius: 20, border: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div>
                         <div style={{ fontSize: 11, fontWeight: 900, color: T.sub, marginBottom: 6, letterSpacing: 0.5 }}>{t.l}</div>
                         <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{t.c} <span style={{ fontSize: 14, color: T.sub, fontWeight: 500 }}>People</span></div>
                       </div>
                       <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.col, boxShadow: `0 0 15px ${t.col}` }} />
                    </div>
                 ))}
              </div>
            </div>

            {(() => {
              // Evidence score per employee (resume signals + verified + manager + projects)
              const scoreOf = (e: any) => {
                let s = 0;
                if (e.submitted) s += 15;
                const skills = e.skills || [];
                const verified = skills.filter((k: any) => k.verifiedBadgeLevel).length;
                const validated = skills.filter((k: any) => k.validated || (k.managerRating || 0) > 0).length;
                s += Math.min(verified * 10, 40);
                s += Math.min(validated * 4, 12);
                s += (e.certifications?.length ? 10 : 0);
                s += Math.min((e.projects?.length || 0) * 4, 12);
                if (skills.some((k: any) => (k.selfRating || 0) > 0)) s += 15;
                return Math.min(100, s);
              };
              const scored = employees.map(e => ({ e, score: scoreOf(e) }));
              const total = scored.length || 1;
              const buckets = [
                { label: 'Elite Profile (80-100)', test: (n: number) => n >= 80, color: '#10B981' },
                { label: 'Validated (60-79)', test: (n: number) => n >= 60 && n < 80, color: '#3B82F6' },
                { label: 'Enriched (40-59)', test: (n: number) => n >= 40 && n < 60, color: '#F59E0B' },
                { label: 'Resume Only (< 40)', test: (n: number) => n < 40, color: '#EF4444' },
              ].map(b => { const c = scored.filter(x => b.test(x.score)).length; return { ...b, count: c, pct: Math.round((c / total) * 100) }; });
              const needAttention = buckets[3].count;

              // Hidden talent: 3+ projects but no verified badge / no assessment
              const hidden = employees.filter(e =>
                (e.projects?.length || 0) >= 3 &&
                !(e.skills || []).some((k: any) => k.verifiedBadgeLevel)
              ).slice(0, 5);

              // Supply vs demand
              const supplyOf = (skillName: string) => employees.filter(e =>
                (e.skills || []).some((k: any) => k.skillName === skillName && (k.verifiedBadgeLevel || k.validated))
              ).length;
              const demandRows = Object.keys(skillDemand).length
                ? SKILLS.map(sk => ({ skill: sk.name, supply: supplyOf(sk.name), demand: skillDemand[sk.name] || 0 }))
                    .map(r => ({ ...r, gap: r.demand - r.supply }))
                    .filter(r => r.demand > 0)
                    .sort((a, b) => a.gap - b.gap)
                    .slice(0, 6)
                : [];
              const criticalGaps = demandRows.filter(r => r.gap <= -4).length;
              const gapColor = (g: number) => g >= 0 ? '#10B981' : g >= -3 ? '#F59E0B' : '#EF4444';
              const gapIcon = (g: number) => g >= 0 ? '✓' : g <= -4 ? '🔴' : '⚠';

              return (
                <>
                  {/* FEATURE 2 — Workforce Visibility Health */}
                  <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: 24 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Workforce Visibility Health</h3>
                    <div style={{ fontSize: 12, color: T.sub, marginBottom: 18 }}>Total Employees: {employees.length}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {buckets.map(b => (
                        <div key={b.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: T.text, fontWeight: 700 }}>{b.label}</span>
                            <span style={{ color: b.color, fontWeight: 800 }}>{b.count} ({b.pct}%)</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${b.pct}%`, background: b.color, borderRadius: 999 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {needAttention > 0 && (
                      <div style={{ marginTop: 16, fontSize: 13, color: T.sub }}>
                        {needAttention} employee{needAttention !== 1 ? 's' : ''} need assessment to become searchable for projects.
                        <button onClick={() => setActiveTab('Manage Employees')} style={{ marginLeft: 10, background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3B82F6', fontWeight: 800, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>View Employees</button>
                      </div>
                    )}
                  </div>

                  {/* FEATURE 7 — Hidden Talent Discovery */}
                  {hidden.length > 0 && (
                    <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: 24 }}>
                      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>🔍 Hidden Talent Discovery</h3>
                      <div style={{ fontSize: 12, color: T.sub, marginBottom: 16 }}>Strong project history but no assessment yet — they may be underrepresented in staffing searches.</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {hidden.map(e => (
                          <div key={e.id} style={{ fontSize: 13, color: T.text }}>
                            • <strong>{e.name}</strong> — {e.projects?.length || 0} projects, no verified assessment
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setActiveTab('Manage Employees')} style={{ marginTop: 14, background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3B82F6', fontWeight: 800, fontSize: 12, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Review Candidates</button>
                    </div>
                  )}

                  {/* FEATURE 8 — Skill Supply vs Demand */}
                  {demandRows.length > 0 && (
                    <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: 24 }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Skill Supply vs Demand</h3>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ color: T.sub, textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px', fontWeight: 700 }}>Skill</th>
                            <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>Supply</th>
                            <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>Demand</th>
                            <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>Gap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {demandRows.map(r => (
                            <tr key={r.skill} style={{ borderTop: `1px solid ${T.bdr}` }}>
                              <td style={{ padding: '8px', color: T.text, fontWeight: 600 }}>{r.skill}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: T.sub }}>{r.supply}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: T.sub }}>{r.demand}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: gapColor(r.gap) }}>{r.gap > 0 ? `+${r.gap}` : r.gap} {gapIcon(r.gap)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {criticalGaps > 0 && (
                        <div style={{ marginTop: 14, fontSize: 13, color: T.sub }}>
                          {criticalGaps} critical gap{criticalGaps !== 1 ? 's' : ''} need immediate action.
                          <button onClick={() => navigate('/admin/bfsi')} style={{ marginLeft: 10, background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3B82F6', fontWeight: 800, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>View Reskilling</button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
            </div>
          )}

          {activeTab === 'Manage Employees' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* Bulk Resume Import */}
              <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Bulk Employee Import</h3>
                    <div style={{ fontSize: 12, color: T.sub }}>Import employees from resumes (PDF or Word .docx, up to 100). Skills, projects, certifications & experience are extracted automatically.</div>
                  </div>
                  <input ref={bulkInputRef} type="file" accept=".pdf,.docx" multiple style={{ display: 'none' }} onChange={e => handleBulkResumeImport(e.target.files)} />
                  <button disabled={bulkImporting} onClick={() => bulkInputRef.current?.click()} style={{ padding: '10px 18px', borderRadius: 10, background: bulkImporting ? T.card : '#3B82F6', color: bulkImporting ? T.sub : '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: bulkImporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <Upload size={16} /> {bulkImporting ? `Processing ${bulkProgress.current} of ${bulkProgress.total}...` : 'Upload Multiple Resumes'}
                  </button>
                </div>
                {/* Customizable login password for this import batch */}
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>Login password for imported employees</label>
                  <input
                    type="text"
                    value={bulkPassword}
                    disabled={bulkImporting}
                    onChange={e => setBulkPassword(e.target.value)}
                    placeholder="1234567890"
                    style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.text, fontSize: 13, fontWeight: 600, minWidth: 180 }}
                  />
                  <span style={{ fontSize: 11, color: T.muted }}>Applied to every profile in this batch (default 1234567890). Zensar IDs are read from each resume; missing ones are auto-numbered from 100001.</span>
                </div>
                {bulkImporting && (
                  <div style={{ marginTop: 14, height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${bulkProgress.total ? Math.round(bulkProgress.current / bulkProgress.total * 100) : 0}%`, background: 'linear-gradient(90deg,#3B82F6,#8B5CF6)', transition: 'width 0.3s ease' }} />
                  </div>
                )}
                {bulkResult && !bulkImporting && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, fontSize: 13 }}>
                    <div style={{ color: '#10B981', fontWeight: 800, marginBottom: bulkResult.failed > 0 ? 6 : 0 }}>✓ {bulkResult.created} profiles created · {bulkResult.skills} skills extracted</div>
                    {bulkResult.failed > 0 && <div style={{ color: '#EF4444' }}>✗ {bulkResult.failed} resume{bulkResult.failed !== 1 ? 's' : ''} could not be parsed</div>}
                  </div>
                )}
              </div>

              {/* Search & Filter Bar */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                  <Search size={16} color={T.muted} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    placeholder="Search people by name or ID..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 500, outline: 'none' }}
                  />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  style={{ 
                    padding: '10px 16px', 
                    borderRadius: 10, 
                    background: showFilters ? '#3B82F6' : T.input, 
                    border: `1px solid ${T.inputBdr}`, 
                    color: showFilters ? '#fff' : T.text, 
                    fontSize: 13, 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Filter size={14} /> Filters {(filters.role || filters.minExperience || filters.minProjects || filters.minCertifications || filters.completionRange || filters.hasProjects || filters.hasCertifications || filters.isValidated || (filters.selectedSkills || []).length > 0) ? '●' : ''}
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    onClick={() => {
                      const filtered = employees.filter(e => {
                        const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                        const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                        const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                           (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                        const matchesSkills = !(filters.selectedSkills || []).length || (filters.selectedSkills || []).every((skillId: string) => 
                          (e.skills || []).some((s: any) => s.skillId === skillId && s.selfRating > 0)
                        );
                        const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                        const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                        const matchesCompletion = !filters.completionRange || (() => {
                          const [min, max] = filters.completionRange.split('-').map(Number);
                          return e.completion >= min && e.completion <= max;
                        })();
                        const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                        const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                        const matchesValidated = !filters.isValidated || e.submitted;
                        return matchesSearch && matchesRole && matchesExp && matchesSkills && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                      });
                      exportAllToExcel(filtered);
                      toast.success(`Exported ${filtered.length} filtered people to Excel`);
                    }}
                    style={{ 
                      padding: '10px 14px', 
                      borderRadius: 10, 
                      background: '#10B981', 
                      border: 'none',
                      color: '#fff', 
                      fontSize: 12, 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Download size={14} /> Export
                  </button>
                  <button
                    onClick={() => setShowAddEmployeeModal(true)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      background: '#10B981',
                      border: 'none',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Plus size={16} /> Add Employee
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['A-Z', 'Z-A', 'Newest', 'Oldest'] as const).map((sort) => (
                    <button
                      key={sort}
                      onClick={() => setSortOrder(sort)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: sortOrder === sort ? '#3B82F6' : T.input,
                        border: `1px solid ${T.inputBdr}`,
                        color: sortOrder === sort ? '#fff' : T.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        minWidth: 50
                      }}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Filters Panel for People Tab */}
              {showFilters && (
                <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Filter People</h3>
                    <button 
                      onClick={() => {
                        setFilters({
                          role: '', minExperience: '', maxExperience: '', minProjects: '', minCertifications: '',
                          skillLevel: '', completionRange: '', hasProjects: false, hasCertifications: false, isValidated: false,
                          selectedSkills: []
                        });
                        setSearch('');
                      }}
                      style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Reset All
                    </button>
                  </div>
                  
                  {/* Role Filter */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 6, display: 'block' }}>
                      👔 Role
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['All', 'QA', 'Senior QA', 'Lead', 'Manager', 'Dev', 'DevOps'].map(role => (
                        <button
                          key={role}
                          onClick={() => setFilters({...filters, role: role === 'All' ? '' : role})}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 12,
                            background: (filters.role === role || (role === 'All' && !filters.role)) ? '#3B82F6' : T.input,
                            border: `1px solid ${T.inputBdr}`,
                            color: (filters.role === role || (role === 'All' && !filters.role)) ? '#fff' : T.text,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Experience Filter */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 6, display: 'block' }}>
                      📅 Experience
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['All', '0-2', '2-5', '5-8', '8+'].map(exp => (
                        <button
                          key={exp}
                          onClick={() => {
                            if (exp === 'All') {
                              setFilters({...filters, minExperience: '', maxExperience: ''});
                            } else if (exp === '8+') {
                              setFilters({...filters, minExperience: '8', maxExperience: ''});
                            } else {
                              const [min, max] = exp.split('-');
                              setFilters({...filters, minExperience: min, maxExperience: max});
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 12,
                            background: (exp === 'All' && !filters.minExperience) || 
                                       (exp === '8+' && filters.minExperience === '8') ||
                                       (exp !== 'All' && exp !== '8+' && filters.minExperience === exp.split('-')[0]) 
                                       ? '#3B82F6' : T.input,
                            border: `1px solid ${T.inputBdr}`,
                            color: (exp === 'All' && !filters.minExperience) || 
                                   (exp === '8+' && filters.minExperience === '8') ||
                                   (exp !== 'All' && exp !== '8+' && filters.minExperience === exp.split('-')[0]) 
                                   ? '#fff' : T.text,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {exp === 'All' ? 'Any' : exp + 'y'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Skills Filter - Checkbox List */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 6, display: 'block' }}>
                      🛠️ Skills
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 4, maxHeight: 160, overflowY: 'auto', padding: 8, background: T.input, borderRadius: 8 }}>
                      {SKILLS.map(skill => (
                        <label key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: T.text, padding: '4px 6px', borderRadius: 4, background: (filters.selectedSkills || []).includes(skill.id) ? 'rgba(59,130,246,0.2)' : 'transparent' }}>
                          <input 
                            type="checkbox" 
                            checked={(filters.selectedSkills || []).includes(skill.id)}
                            onChange={(e) => {
                              const current = filters.selectedSkills || [];
                              if (e.target.checked) {
                                setFilters({...filters, selectedSkills: [...current, skill.id]});
                              } else {
                                setFilters({...filters, selectedSkills: current.filter((id: string) => id !== skill.id)});
                              }
                            }}
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: (filters.selectedSkills || []).includes(skill.id) ? 600 : 400 }}>{skill.name}</span>
                        </label>
                      ))}
                    </div>
                    {(filters.selectedSkills || []).length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#3B82F6' }}>
                        {(filters.selectedSkills || []).length} selected
                      </div>
                    )}
                  </div>

                  {/* Additional Filters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                    {/* Completion Range */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 4, display: 'block' }}>Completion %</label>
                      <select 
                        value={filters.completionRange}
                        onChange={e => setFilters({...filters, completionRange: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 12, cursor: 'pointer' }}
                      >
                        <option value="">All</option>
                        <option value="0-25">0-25%</option>
                        <option value="25-50">25-50%</option>
                        <option value="50-75">50-75%</option>
                        <option value="75-100">75-100%</option>
                      </select>
                    </div>

                    {/* Min Projects */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 4, display: 'block' }}>Min Projects</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 2"
                        value={filters.minProjects}
                        onChange={e => setFilters({...filters, minProjects: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 12 }}
                      />
                    </div>

                    {/* Min Certifications */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 4, display: 'block' }}>Min Certs</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 1"
                        value={filters.minCertifications}
                        onChange={e => setFilters({...filters, minCertifications: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 12 }}
                      />
                    </div>
                  </div>

                  {/* Toggle Filters */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.text }}>
                      <input 
                        type="checkbox" 
                        checked={filters.hasProjects}
                        onChange={e => setFilters({...filters, hasProjects: e.target.checked})}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      📁 Has Projects
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.text }}>
                      <input 
                        type="checkbox" 
                        checked={filters.hasCertifications}
                        onChange={e => setFilters({...filters, hasCertifications: e.target.checked})}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      🏆 Has Certs
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.text }}>
                      <input 
                        type="checkbox" 
                        checked={filters.isValidated}
                        onChange={e => setFilters({...filters, isValidated: e.target.checked})}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      ✅ Validated
                    </label>
                  </div>
                </div>
              )}

              {/* Results Count */}
              <div style={{ marginBottom: 16, fontSize: 13, color: T.sub }}>
                {(() => {
                  const filtered = employees.filter(e => {
                    const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                    const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                    const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                       (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                    const matchesSkills = !(filters.selectedSkills || []).length || (filters.selectedSkills || []).every((skillId: string) => 
                      (e.skills || []).some((s: any) => s.skillId === skillId && s.selfRating > 0)
                    );
                    const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                    const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                    const matchesCompletion = !filters.completionRange || (() => {
                      const [min, max] = filters.completionRange.split('-').map(Number);
                      return e.completion >= min && e.completion <= max;
                    })();
                    const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                    const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                    const matchesValidated = !filters.isValidated || e.submitted;
                    return matchesSearch && matchesRole && matchesExp && matchesSkills && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                  });
                  return `Showing ${filtered.length} of ${employees.length} people`;
                })()}
              </div>
              
              {/* Bench Status Overview */}
              {(() => {
                const risks = employees.map(benchRiskOf);
                const allocated = risks.filter(r => r.label === 'Low').length;
                const atRisk = risks.filter(r => r.label === 'High' || (r.days >= 30 && r.days < 60)).length;
                const critical = risks.filter(r => r.label === 'Critical').length;
                return (
                  <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: '16px 20px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bench Status</div>
                    <div style={{ fontSize: 13, color: T.text }}><strong style={{ color: '#10B981' }}>{allocated}</strong> allocated / recent</div>
                    <div style={{ fontSize: 13, color: T.text }}><strong style={{ color: '#F97316' }}>{atRisk}</strong> at risk (30+ days) ⚠</div>
                    <div style={{ fontSize: 13, color: T.text }}><strong style={{ color: '#EF4444' }}>{critical}</strong> critical (60+ days) 🔴</div>
                  </div>
                );
              })()}

              {/* Select-all + bulk delete toolbar */}
              {(() => {
                const vis = computeVisibleEmployees();
                const visIds = vis.map((e: any) => String(e.id));
                const allSelected = visIds.length > 0 && visIds.every((id: string) => selectedIds.has(id));
                const someSelected = visIds.some((id: string) => selectedIds.has(id));
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: T.sub, fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                        onChange={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (allSelected) { visIds.forEach((id: string) => next.delete(id)); }
                            else { visIds.forEach((id: string) => next.add(id)); }
                            return next;
                          });
                        }}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      Select all
                    </label>
                    {selectedIds.size > 0 && (
                      <button
                        onClick={() => setShowBulkDeleteModal(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: '#EF4444', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                      >
                        <Trash2 size={14} /> Delete Selected ({selectedIds.size})
                      </button>
                    )}
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                {computeVisibleEmployees()
                  .map((e: any) => (
                    <div key={e.id} onClick={() => handleOpenPreview(e)} style={{ background: T.bg, border: `1px solid ${selectedIds.has(String(e.id)) ? '#EF4444' : aiSearchActive && e._aiScore ? '#8B5CF6' : T.bdr}`, borderRadius: 20, padding: 24, cursor: 'pointer', transition: '0.2s', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }} className="hover:scale-105">
                       <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(String(e.id))}
                            onClick={ev => ev.stopPropagation()}
                            onChange={() => toggleSelectId(String(e.id))}
                            style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, marginTop: 4 }}
                          />
                          <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff' }}>
                            {e.name?.substring(0,2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                             <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.name}>{e.name}</div>
                             <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                             {e.zensar_id_auto && (
                               <button
                                 onClick={ev => { ev.stopPropagation(); openSetZensarId(e); }}
                                 title="This ID was auto-generated. Click to set the real Zensar ID."
                                 style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                               >
                                 <Edit2 size={11} /> Set Zensar ID
                               </button>
                             )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                             {aiSearchActive && e._aiScore ? (
                               <div style={{ fontSize: 13, fontWeight: 900, color: '#8B5CF6', lineHeight: 1, padding: '3px 8px', background: 'rgba(139,92,246,0.1)', borderRadius: 6 }}>{e._aiScore} pts</div>
                             ) : (
                               <>
                                 <div style={{ fontSize: 18, fontWeight: 900, color: e.completion >= 75 ? '#10B981' : '#3B82F6', lineHeight: 1 }}>{e.completion}%</div>
                                 <div style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>Complete</div>
                               </>
                             )}
                          </div>
                       </div>
                       
                       <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                          <span style={{ padding: '3px 8px', borderRadius: 4, background: e.submitted ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)', color: e.submitted ? '#10B981' : '#3B82F6', fontSize: 9, fontWeight: 800 }}>{e.submitted ? 'VALIDATED' : 'SENSING'}</span>
                          <span style={{ padding: '3px 8px', borderRadius: 4, background: T.card, color: T.sub, fontSize: 9, fontWeight: 600 }}>{e.designation?.substring(0, 20) || 'Employee'}</span>
                          {e.yearsExperience > 0 && (
                            <span style={{ padding: '3px 8px', borderRadius: 4, background: T.card, color: T.sub, fontSize: 9, fontWeight: 600 }}>{e.yearsExperience} yrs exp</span>
                          )}
                          {(() => {
                            const r = benchRiskOf(e);
                            return (
                              <span title={r.days >= 0 ? `${r.days} days since last project ended` : 'No project history'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, background: `${r.color}1A`, color: r.color, fontSize: 9, fontWeight: 800 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.color }} /> {r.label} BENCH
                              </span>
                            );
                          })()}
                       </div>

                       {/* Skills Preview */}
                       {e.skills && e.skills.filter((s: any) => s.selfRating > 0).length > 0 && (
                         <div style={{ marginBottom: 16 }}>
                           <div style={{ fontSize: 9, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Top Skills</div>
                           <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                             {e.skills.filter((s: any) => s.selfRating > 0).slice(0, 4).map((s: any) => (
                               <span key={s.skillId} style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 9, fontWeight: 600 }}>
                                 {SKILLS.find(sk => sk.id === s.skillId)?.name}: {s.selfRating}
                               </span>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.muted }}>
                            {e.projects?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>📁 {e.projects.length}</span>}
                            {e.certifications?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>🏆 {e.certifications.length}</span>}
                          </div>
                          <Eye size={16} color={T.muted} />
                       </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'Skill Heatmap' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
               <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Organizational Heatmap</h3>
               <div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>Displays skill coverage across each skill family based on the uploaded profiles.</div>
               {(() => {
                 const PIE = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];
                 const assignments = employees.map((e: any) => ({ e, qe: resolveQEAssignment(e) }));
                 const totalEmp = employees.length;

                 // Families by headcount
                 const familyData = QE_FAMILIES.map((fam, i) => ({
                   family: fam,
                   count: assignments.filter(a => a.qe.family === fam).length,
                   color: PIE[i % PIE.length],
                 }));
                 const activeFamilies = familyData.filter(f => f.count > 0);

                 // Weighted average index per skill group (essential-skill coverage → %)
                 const groupData: { family: string; group: string; count: number; index: number; total: number }[] = [];
                 QE_FAMILIES.forEach(fam => groupsForFamily(fam).forEach(grp => {
                   const members = assignments.filter(a => a.qe.family === fam && a.qe.group === grp);
                   const total = essentialSkillsFor(fam, grp).length || 1;
                   const index = members.length
                     ? Math.round(members.reduce((s, a) => s + Math.min(a.qe.matchedSkills.length, total) / total, 0) / members.length * 100)
                     : 0;
                   groupData.push({ family: fam, group: grp, count: members.length, index, total });
                 }));
                 const activeGroups = groupData.filter(g => g.count > 0).sort((a, b) => b.count - a.count);
                 const avgIndex = activeGroups.length ? Math.round(activeGroups.reduce((s, g) => s + g.index, 0) / activeGroups.length) : 0;
                 const idxColor = pctColor;

                 // Drill-down selections (fall back to the top family / group)
                 const selFam = (heatFamily && activeFamilies.some(f => f.family === heatFamily)) ? heatFamily : (activeFamilies[0]?.family || '');
                 const famGroups = activeGroups.filter(g => g.family === selFam);
                 const selGrp = (heatGroup && famGroups.some(g => g.group === heatGroup)) ? heatGroup : (famGroups[0]?.group || '');
                 const skillCounts = (selFam && selGrp)
                   ? essentialSkillsFor(selFam, selGrp).map(sk => ({
                       skill: sk,
                       count: assignments.filter(a => a.qe.family === selFam && a.qe.group === selGrp && a.qe.matchedSkills.includes(sk)).length,
                     })).sort((a, b) => b.count - a.count)
                   : [];

                 // Donut geometry
                 const pieTotal = activeFamilies.reduce((s, f) => s + f.count, 0) || 1;
                 const CX = 130, CY = 130, R = 112, RI = 60;
                 const polar = (r: number, ang: number, ox = 0, oy = 0) => [CX + ox + r * Math.cos(ang), CY + oy + r * Math.sin(ang)];
                 const buildArc = (start: number, end: number, ox = 0, oy = 0) => {
                   const large = end - start > Math.PI ? 1 : 0;
                   const [x1, y1] = polar(R, start, ox, oy), [x2, y2] = polar(R, end, ox, oy);
                   const [x3, y3] = polar(RI, end, ox, oy), [x4, y4] = polar(RI, start, ox, oy);
                   return `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${RI},${RI} 0 ${large} 0 ${x4},${y4} Z`;
                 };
                 let cursor = -Math.PI / 2;
                 const slices = activeFamilies.map((f, i) => {
                   // Give a single 100% family a hair less than a full turn so the arc renders.
                   const frac = f.count / pieTotal;
                   const sweep = Math.min(frac, 0.9999) * Math.PI * 2;
                   const start = cursor;
                   const end = cursor + sweep;
                   const mid = (start + end) / 2;
                   cursor = end;
                   return { ...f, i, start, end, mid, frac };
                 });
                 const selSlice = slices.find(s => s.family === selFam);

                 const card = { background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 18 } as const;
                 const colTitle = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: T.muted, marginBottom: 12 };

                 return (
                   <>
                     {/* ── Weighted average index by skill group ── */}
                     <div style={{ marginBottom: 24 }}>
                       {activeGroups.length === 0 ? (
                         <div style={{ ...card, textAlign: 'center', color: T.sub }}>No employees mapped to any skill group yet.</div>
                       ) : (
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                           {activeGroups.map(g => (
                             <div key={g.family + g.group} style={card}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                                 <div style={{ minWidth: 0 }}>
                                   <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{g.group}</div>
                                   <div style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{g.family}</div>
                                 </div>
                                 <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>{g.count} 👤</span>
                               </div>
                               <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                 <div style={{ flex: 1, height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                   <div style={{ width: `${g.index}%`, height: '100%', background: idxColor(g.index), borderRadius: 999 }} />
                                 </div>
                                 <span style={{ fontSize: 15, fontWeight: 900, color: idxColor(g.index), minWidth: 42, textAlign: 'right' }}>{g.index}%</span>
                               </div>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>

                     {/* ── Drill-down: Family → Group → Skill (side by side) ── */}
                     <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 4 }}>Skill Explorer</div>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'stretch' }}>
                       {/* Column 1 — Family pie */}
                       <div style={card}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                           <span style={{ fontWeight: 900, fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '3px 8px', borderRadius: 5 }}>L3</span>
                           <span style={{ ...colTitle, marginBottom: 0 }}>FAMILIES · BY HEADCOUNT</span>
                         </div>
                         {activeFamilies.length === 0 ? (
                           <div style={{ color: T.sub, fontSize: 13 }}>No data.</div>
                         ) : (
                           <>
                             <svg viewBox="0 0 260 260" style={{ width: '100%', maxWidth: 240, margin: '0 auto', display: 'block', overflow: 'visible' }}>
                               <defs>
                                 {slices.map(s => (
                                   <linearGradient key={s.family} id={`pieGrad-${s.i}`} x1="0" y1="0" x2="1" y2="1">
                                     <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                                     <stop offset="100%" stopColor={s.color} stopOpacity={0.62} />
                                   </linearGradient>
                                 ))}
                                 <filter id="pieShadow" x="-30%" y="-30%" width="160%" height="160%">
                                   <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.28" />
                                 </filter>
                               </defs>
                               {/* track ring */}
                               <circle cx={CX} cy={CY} r={(R + RI) / 2} fill="none" stroke={dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'} strokeWidth={R - RI} />
                               {slices.map(s => {
                                 const on = selFam === s.family;
                                 const off = on ? 8 : 0;
                                 const ox = Math.cos(s.mid) * off, oy = Math.sin(s.mid) * off;
                                 return (
                                   <path
                                     key={s.family} d={buildArc(s.start, s.end, ox, oy)} fill={`url(#pieGrad-${s.i})`}
                                     stroke={T.bg} strokeWidth={3} strokeLinejoin="round"
                                     opacity={selFam && !on ? 0.4 : 1}
                                     filter={on ? 'url(#pieShadow)' : undefined}
                                     style={{ cursor: 'pointer', transition: 'opacity 0.25s, d 0.25s' }}
                                     onClick={() => { setHeatFamily(s.family); setHeatGroup(''); }}
                                   >
                                     <title>{`${s.family}: ${s.count} (${Math.round(s.frac * 100)}%)`}</title>
                                   </path>
                                 );
                               })}
                               {/* center label */}
                               <text x={CX} y={CY - 4} textAnchor="middle" style={{ fontSize: 30, fontWeight: 900, fill: selSlice ? selSlice.color : T.text }}>{selSlice ? selSlice.count : totalEmp}</text>
                               <text x={CX} y={CY + 16} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: T.sub }}>{selSlice ? `of ${totalEmp} · ${Math.round(selSlice.frac * 100)}%` : 'employees'}</text>
                             </svg>
                             {selFam && <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: T.text, marginTop: 8 }}>{selFam}</div>}
                             <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
                               {slices.map(s => {
                                 const on = selFam === s.family;
                                 return (
                                   <button key={s.family} onClick={() => { setHeatFamily(s.family); setHeatGroup(''); }}
                                     style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: '0.15s',
                                       background: on ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                                       border: `1px solid ${on ? s.color : 'transparent'}` }}>
                                     <span style={{ width: 10, height: 24, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                                     <span style={{ flex: 1, fontSize: 12, fontWeight: on ? 800 : 600, color: T.text }}>{s.family}</span>
                                     <span style={{ fontSize: 12, fontWeight: 800, color: on ? s.color : T.sub }}>{s.count} · {Math.round(s.frac * 100)}%</span>
                                   </button>
                                 );
                               })}
                             </div>
                           </>
                         )}
                       </div>

                       {/* Column 2 — Groups within family */}
                       <div style={card}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                           <span style={{ fontWeight: 900, fontSize: 10, background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', padding: '3px 8px', borderRadius: 5 }}>L4</span>
                           <span style={{ ...colTitle, marginBottom: 0 }}>GROUPS{selFam ? ` · ${selFam.toUpperCase()}` : ''}</span>
                         </div>
                         {famGroups.length === 0 ? (
                           <div style={{ color: T.sub, fontSize: 13 }}>Select a family to see its groups.</div>
                         ) : (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                             {famGroups.map(g => (
                               <button key={g.group} onClick={() => setHeatGroup(g.group)}
                                 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                                   background: selGrp === g.group ? 'rgba(59,130,246,0.12)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                                   border: `1px solid ${selGrp === g.group ? 'rgba(59,130,246,0.45)' : T.bdr}` }}>
                                 <span style={{ fontSize: 12.5, fontWeight: 800, color: T.text }}>{g.group}</span>
                                 <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                   <span style={{ fontSize: 11, fontWeight: 800, color: idxColor(g.index) }}>{g.index}%</span>
                                   <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>{g.count}</span>
                                 </span>
                               </button>
                             ))}
                           </div>
                         )}
                       </div>

                       {/* Column 3 — Skills within group */}
                       <div style={card}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                           <span style={{ fontWeight: 900, fontSize: 10, background: 'rgba(6,182,212,0.15)', color: '#06B6D4', padding: '3px 8px', borderRadius: 5 }}>L5</span>
                           <span style={{ ...colTitle, marginBottom: 0 }}>SKILLS{selGrp ? ` · ${selGrp.toUpperCase()}` : ''}</span>
                         </div>
                         {skillCounts.length === 0 ? (
                           <div style={{ color: T.sub, fontSize: 13 }}>Select a group to see its skills.</div>
                         ) : (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                             {skillCounts.map(s => {
                               const pct = totalEmp ? (s.count / totalEmp) * 100 : 0;
                               return (
                                 <div key={s.skill}>
                                   <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                     <span style={{ fontSize: 12, fontWeight: 700, color: s.count ? T.text : T.muted }}>{s.skill}</span>
                                     <span style={{ fontSize: 12, fontWeight: 800, color: s.count ? '#06B6D4' : T.muted }}>{s.count}</span>
                                   </div>
                                   <div style={{ height: 6, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                     <div style={{ width: `${pct}%`, height: '100%', background: '#06B6D4', borderRadius: 999 }} />
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         )}
                       </div>
                     </div>

                     {/* ── Individual skill averages — grouped by skill category ── */}
                     <div style={{ fontSize: 13, fontWeight: 800, color: T.text, margin: '28px 0 4px' }}>Skill Coverage Percentage</div>
                     <HeatKey items={PCT_LEGEND} formula={null} />
                     {(() => {
                       const CATEGORY_LABELS: Record<string, string> = {
                         Tool: 'Tools', Technology: 'Technologies', Application: 'Application Testing',
                         Domain: 'Domains', TestingType: 'Testing Types', DevOps: 'DevOps & CI/CD', AI: 'AI & Gen AI',
                       };
                       // Preserve the order categories first appear in SKILLS.
                       const categories = Array.from(new Set(SKILLS.map(sk => sk.category)));
                       const renderCard = (sk: typeof SKILLS[number]) => {
                         const rated = employees.filter((e: any) => (e.skills.find((s: any) => s.skillId === sk.id)?.selfRating || 0) > 0).length;
                         const avg = employees.length ? employees.reduce((sum, e) => (sum + (e.skills.find((s: any) => s.skillId === sk.id)?.selfRating || 0)), 0) / employees.length : 0;
                         const pct = Math.min(100, Math.round(avg / 3 * 100));   // 0–3 self-rating → %
                         return (
                           <div key={sk.id} title={`${rated} of ${employees.length} employees rated this skill`} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                             <div style={{ fontSize: 10, fontWeight: 800, color: T.sub, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sk.name}</div>
                             <div style={{ fontSize: 20, fontWeight: 900, color: pct ? pctColor(pct) : T.text, marginBottom: 2 }}>{pct}<span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>%</span></div>
                             <div style={{ fontSize: 10, fontWeight: 700, color: T.sub, marginBottom: 6 }}>{rated}/{employees.length} rated</div>
                             <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 4, background: pctColor(pct) }} />
                           </div>
                         );
                       };
                       return categories.map(cat => {
                         const catSkills = SKILLS.filter(sk => sk.category === cat);
                         return (
                           <div key={cat} style={{ marginBottom: 22 }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                               <span style={{ width: 8, height: 8, borderRadius: 999, background: '#3B82F6', flexShrink: 0 }} />
                               <span style={{ fontSize: 12.5, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>{CATEGORY_LABELS[cat] || cat}</span>
                               <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{catSkills.length} skill{catSkills.length === 1 ? '' : 's'}</span>
                               <div style={{ flex: 1, height: 1, background: T.bdr }} />
                             </div>
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                               {catSkills.map(renderCard)}
                             </div>
                           </div>
                         );
                       });
                     })()}
                   </>
                 );
               })()}
            </div>
          )}

          {/* ── QISL HEATMAP TAB ── */}
          {activeTab === 'QI SL Heatmap' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>QI SL Heatmap</h3>
              <div style={{ fontSize: 12, color: T.sub, marginBottom: 18 }}>Displays skill coverage across each skill family based on the uploaded profiles.</div>
              {(() => {
                const PIE = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];
                const assignments = employees.map((e: any) => ({ e, qe: resolveQEAssignment(e) }));
                const totalEmp = employees.length;

                // Families by headcount
                const familyData = QE_FAMILIES.map((fam, i) => ({
                  family: fam,
                  count: assignments.filter(a => a.qe.family === fam).length,
                  color: PIE[i % PIE.length],
                }));
                const activeFamilies = familyData.filter(f => f.count > 0);

                // Coverage % per group = avg over its skills of (members with skill ÷ family members)
                const groupData: { family: string; group: string; count: number; pct: number }[] = [];
                QE_FAMILIES.forEach(fam => {
                  const famCnt = assignments.filter(a => a.qe.family === fam).length || 1;
                  groupsForFamily(fam).forEach(grp => {
                    const members = assignments.filter(a => a.qe.family === fam && a.qe.group === grp);
                    const skills = essentialSkillsFor(fam, grp);
                    const pct = skills.length
                      ? Math.round(skills.reduce((s, sk) => s + assignments.filter(a => a.qe.family === fam && a.qe.group === grp && a.qe.matchedSkills.includes(sk)).length / famCnt, 0) / skills.length * 100)
                      : 0;
                    groupData.push({ family: fam, group: grp, count: members.length, pct });
                  });
                });
                const activeGroups = groupData.filter(g => g.count > 0);
                const avgPct = activeGroups.length ? Math.round(activeGroups.reduce((s, g) => s + g.pct, 0) / activeGroups.length) : 0;

                // Drill-down selections (fall back to the top family / group).
                // Show ALL of the family's groups — including any with 0 members —
                // so a family with two groups always shows both.
                const selFam = (qislFam && activeFamilies.some(f => f.family === qislFam)) ? qislFam : (activeFamilies[0]?.family || '');
                const famGroups = groupData.filter(g => g.family === selFam);
                const selGrp = (qislGroup && famGroups.some(g => g.group === qislGroup)) ? qislGroup : (famGroups.find(g => g.count > 0)?.group || famGroups[0]?.group || '');
                const famCount = assignments.filter(a => a.qe.family === selFam).length || 1;
                const skillPct = (selFam && selGrp)
                  ? essentialSkillsFor(selFam, selGrp).map(sk => {
                      const cnt = assignments.filter(a => a.qe.family === selFam && a.qe.group === selGrp && a.qe.matchedSkills.includes(sk)).length;
                      return { skill: sk, cnt, pct: Math.round(cnt / famCount * 100) };
                    }).sort((a, b) => b.pct - a.pct)
                  : [];

                // Donut geometry (same beautiful pie as the Skill Heatmap)
                const pieTotal = activeFamilies.reduce((s, f) => s + f.count, 0) || 1;
                const CX = 130, CY = 130, R = 112, RI = 60;
                const polar = (r: number, ang: number, ox = 0, oy = 0) => [CX + ox + r * Math.cos(ang), CY + oy + r * Math.sin(ang)];
                const buildArc = (start: number, end: number, ox = 0, oy = 0) => {
                  const large = end - start > Math.PI ? 1 : 0;
                  const [x1, y1] = polar(R, start, ox, oy), [x2, y2] = polar(R, end, ox, oy);
                  const [x3, y3] = polar(RI, end, ox, oy), [x4, y4] = polar(RI, start, ox, oy);
                  return `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${RI},${RI} 0 ${large} 0 ${x4},${y4} Z`;
                };
                let cursor = -Math.PI / 2;
                const slices = activeFamilies.map((f, i) => {
                  const frac = f.count / pieTotal;
                  const sweep = Math.min(frac, 0.9999) * Math.PI * 2;
                  const start = cursor, end = cursor + sweep, mid = (start + end) / 2;
                  cursor = end;
                  return { ...f, i, start, end, mid, frac };
                });
                const selSlice = slices.find(s => s.family === selFam);

                const card = { background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 18 } as const;
                const colTitle = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: T.muted, marginBottom: 12 };

                if (totalEmp === 0) return <div style={{ ...card, textAlign: 'center', color: T.sub }}>No employees yet.</div>;

                return (
                  <>
                    {/* ── 3 summary cards (no Avg Coverage) ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 }}>
                      {[
                        { l: 'Members',       v: totalEmp,             c: '#3B82F6' },
                        { l: 'Skill Families', v: activeFamilies.length, c: '#8B5CF6' },
                        { l: 'Skill Groups',  v: activeGroups.length,  c: '#06B6D4' },
                      ].map(s => (
                        <div key={s.l} style={{ ...card, textAlign: 'center' }}>
                          <div style={{ fontSize: 30, fontWeight: 900, color: s.c }}>{s.v}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>

                    {/* Explorer: Family → Group → Skills (step by step, left → right) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'stretch' }}>
                      {/* Column 1 — Family pie */}
                      <div style={card}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontWeight: 900, fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '3px 8px', borderRadius: 5 }}>L3</span>
                          <span style={{ ...colTitle, marginBottom: 0 }}>FAMILIES · BY HEADCOUNT</span>
                        </div>
                        {activeFamilies.length === 0 ? (
                          <div style={{ color: T.sub, fontSize: 13 }}>No data.</div>
                        ) : (
                          <>
                            <svg viewBox="0 0 260 260" style={{ width: '100%', maxWidth: 240, margin: '0 auto', display: 'block', overflow: 'visible' }}>
                              <defs>
                                {slices.map(s => (
                                  <linearGradient key={s.family} id={`qislGrad-${s.i}`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                                    <stop offset="100%" stopColor={s.color} stopOpacity={0.62} />
                                  </linearGradient>
                                ))}
                                <filter id="qislShadow" x="-30%" y="-30%" width="160%" height="160%">
                                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.28" />
                                </filter>
                              </defs>
                              <circle cx={CX} cy={CY} r={(R + RI) / 2} fill="none" stroke={dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'} strokeWidth={R - RI} />
                              {slices.map(s => {
                                const on = selFam === s.family;
                                const off = on ? 8 : 0;
                                const ox = Math.cos(s.mid) * off, oy = Math.sin(s.mid) * off;
                                return (
                                  <path key={s.family} d={buildArc(s.start, s.end, ox, oy)} fill={`url(#qislGrad-${s.i})`}
                                    stroke={T.bg} strokeWidth={3} strokeLinejoin="round"
                                    opacity={selFam && !on ? 0.4 : 1} filter={on ? 'url(#qislShadow)' : undefined}
                                    style={{ cursor: 'pointer', transition: 'opacity 0.25s, d 0.25s' }}
                                    onClick={() => { setQislFam(s.family); setQislGroup(''); }}>
                                    <title>{`${s.family}: ${s.count} (${Math.round(s.frac * 100)}%)`}</title>
                                  </path>
                                );
                              })}
                              <text x={CX} y={CY - 4} textAnchor="middle" style={{ fontSize: 30, fontWeight: 900, fill: selSlice ? selSlice.color : T.text }}>{selSlice ? selSlice.count : totalEmp}</text>
                              <text x={CX} y={CY + 16} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: T.sub }}>{selSlice ? `of ${totalEmp} members` : 'members'}</text>
                            </svg>
                            {selFam && <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: T.text, marginTop: 8 }}>{selFam}</div>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
                              {slices.map(s => {
                                const on = selFam === s.family;
                                return (
                                  <button key={s.family} onClick={() => { setQislFam(s.family); setQislGroup(''); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: '0.15s',
                                      background: on ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                                      border: `1px solid ${on ? s.color : 'transparent'}` }}>
                                    <span style={{ width: 10, height: 24, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: 12, fontWeight: on ? 800 : 600, color: T.text }}>{s.family}</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: on ? s.color : T.sub }}>{s.count} · {Math.round(s.frac * 100)}%</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Column 2 — Groups within family */}
                      <div style={card}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontWeight: 900, fontSize: 10, background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', padding: '3px 8px', borderRadius: 5 }}>L4</span>
                          <span style={{ ...colTitle, marginBottom: 0 }}>GROUPS{selFam ? ` · ${selFam.toUpperCase()}` : ''}</span>
                        </div>
                        {famGroups.length === 0 ? (
                          <div style={{ color: T.sub, fontSize: 13 }}>Select a family to see its groups.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {famGroups.map(g => (
                              <button key={g.group} onClick={() => setQislGroup(g.group)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                                  background: selGrp === g.group ? 'rgba(59,130,246,0.12)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                                  border: `1px solid ${selGrp === g.group ? 'rgba(59,130,246,0.45)' : T.bdr}` }}>
                                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.text }}>{g.group}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: pctColor(g.pct) }}>{g.pct}%</span>
                                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>{g.count}👤</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Column 3 — Skills within group (as % coverage bars) */}
                      <div style={{ ...card, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontWeight: 900, fontSize: 10, background: 'rgba(6,182,212,0.15)', color: '#06B6D4', padding: '3px 8px', borderRadius: 5 }}>L5</span>
                          <span style={{ ...colTitle, marginBottom: 0 }}>SKILLS{selGrp ? ` · ${selGrp.toUpperCase()}` : ''}</span>
                        </div>
                        {skillPct.length === 0 ? (
                          <div style={{ color: T.sub, fontSize: 13 }}>Select a group to see its skills.</div>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, color: T.sub, marginTop: -6, marginBottom: 14 }}>
                              Showing {skillPct.length} skills · {famCount} member{famCount === 1 ? '' : 's'} in <b>{selFam}</b>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {skillPct.map(s => (
                                <div key={s.skill} title={`${s.cnt} of ${famCount} members have ${s.skill}`}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: s.pct ? T.text : T.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.skill}</span>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: s.pct ? pctColor(s.pct) : T.muted, flexShrink: 0 }}>
                                      {s.cnt}<span style={{ fontSize: 11, fontWeight: 600, color: T.muted }}>/{famCount}</span>
                                    </span>
                                  </div>
                                  <div style={{ width: '100%', height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                    <div style={{ width: `${s.pct}%`, height: '100%', background: pctColor(s.pct), borderRadius: 999, transition: 'width .3s' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ── Individual Skill Averages — every QISL skill by family & group ── */}
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, margin: '28px 0 4px' }}>Skill Coverage Percentage</div>
                    <div style={{ fontSize: 12, color: T.sub, marginBottom: 14 }}>Coverage % reflects the percentage of associates in a skill family who possess the skill. = (No of associates with the skill / Total in the Skill family) * 100</div>
                    <HeatKey items={PCT_LEGEND} formula={null} />
                    {QE_FAMILIES.map((fam, fi) => {
                      const famCnt = assignments.filter(a => a.qe.family === fam).length;
                      const groups = groupsForFamily(fam).map(grp => {
                        const gCnt = assignments.filter(a => a.qe.family === fam && a.qe.group === grp).length;
                        const skills = essentialSkillsFor(fam, grp).map(sk => {
                          const cnt = assignments.filter(a => a.qe.family === fam && a.qe.group === grp && a.qe.matchedSkills.includes(sk)).length;
                          return { skill: sk, cnt, pct: famCnt ? Math.round(cnt / famCnt * 100) : 0 };
                        });
                        return { group: grp, gCnt, skills };
                      });
                      return (
                        <div key={fam} style={{ marginBottom: 22 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', flexWrap: 'wrap' }}>
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: PIE[fi % PIE.length], flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{fam}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{famCnt} member{famCnt === 1 ? '' : 's'}</span>
                            <div style={{ flex: 1, minWidth: 40, height: 1, background: T.bdr }} />
                          </div>
                          {groups.map(g => (
                            <div key={g.group} style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8, marginLeft: 20 }}>{g.group} <span style={{ color: T.muted, fontWeight: 700 }}>· {g.skills.length} skills · {g.gCnt} members</span></div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                                {g.skills.map(sk => {
                                  return (
                                    <div key={sk.skill}
                                      onMouseEnter={e => {
                                        const el = e.currentTarget;
                                        el.style.overflow = 'visible';
                                        el.style.zIndex = '10';
                                        el.style.boxShadow = `0 8px 24px rgba(0,0,0,0.35)`;
                                        el.style.border = `1px solid ${pctColor(sk.pct)}`;
                                        const nameEl = el.querySelector('.skill-name') as HTMLElement;
                                        if (nameEl) {
                                          nameEl.style.webkitLineClamp = 'unset';
                                          nameEl.style.webkitBoxOrient = 'unset';
                                          nameEl.style.display = 'block';
                                          nameEl.style.overflow = 'visible';
                                          nameEl.style.maxHeight = 'none';
                                          nameEl.textContent = sk.skill;
                                        }
                                      }}
                                      onMouseLeave={e => {
                                        const el = e.currentTarget;
                                        el.style.overflow = 'hidden';
                                        el.style.zIndex = '1';
                                        el.style.boxShadow = 'none';
                                        el.style.border = `1px solid ${T.bdr}`;
                                        const nameEl = el.querySelector('.skill-name') as HTMLElement;
                                        if (nameEl) {
                                          nameEl.style.display = '-webkit-box';
                                          nameEl.style.webkitLineClamp = '2';
                                          nameEl.style.webkitBoxOrient = 'vertical';
                                          nameEl.style.overflow = 'hidden';
                                          nameEl.style.maxHeight = '2.8em';
                                          nameEl.textContent = sk.skill;
                                        }
                                      }}
                                      style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: 14, textAlign: 'center', position: 'relative', overflow: 'hidden', zIndex: 1, transition: 'box-shadow 0.2s, border 0.2s', cursor: 'default' }}>
                                      <div
                                        className="skill-name"
                                        style={{
                                          fontSize: 10, fontWeight: 800, color: T.sub, marginBottom: 10,
                                          minHeight: '2.8em', display: '-webkit-box',
                                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden', maxHeight: '2.8em',
                                          textTransform: 'uppercase', letterSpacing: 0.3,
                                          lineHeight: 1.4,
                                        }}>
                                        {sk.skill}
                                      </div>
                                      <div style={{ fontSize: 20, fontWeight: 900, color: sk.pct ? pctColor(sk.pct) : T.text }}>{sk.pct}<span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>%</span></div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: T.sub, marginBottom: 6 }}>{sk.cnt}/{famCnt} members</div>
                                      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 4, background: pctColor(sk.pct) }} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── CERTIFICATIONS TAB ── */}
          {activeTab === 'Certifications' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Award size={20} color="#10B981" /> Certifications
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 12, fontWeight: 700, color: '#10B981' }}>
                    {employees.reduce((s, e) => s + (e.certifications?.length || 0), 0)} Total Certs
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.certifications?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, certification, issuer..." value={certSearch} onChange={e => setCertSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.certifications?.length || 0) > 0).filter(e => {
                  if (!certSearch.trim()) return true;
                  const q = certSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.certifications || []).some((c: any) => (c.cert_name || c.name || '').toLowerCase().includes(q) || (c.issuing_organization || c.issuer || '').toLowerCase().includes(q));
                }).sort((a, b) => (b.certifications?.length || 0) - (a.certifications?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`cert_${e.id}`];
                  const items = expanded ? e.certifications : e.certifications.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(16,185,129,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #10B981' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Certification')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.certifications.length} 🏅</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((c: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(16,185,129,0.06)' : '#f0fdf4', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>🏅</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.cert_name || c.name || 'Certificate'}</div>
                              {(c.issuing_organization || c.issuer) && <div style={{ fontSize: 10, color: T.sub }}>{c.issuing_organization || c.issuer}</div>}
                            </div>
                          </div>
                        ))}
                        {e.certifications.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`cert_${e.id}`]: !prev[`cert_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#10B981', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.certifications.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.certifications?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <Award size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No certifications uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ACHIEVEMENTS TAB ── */}
          {activeTab === 'Achievements' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={20} color="#F59E0B" /> Achievements & Awards
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>
                    {employees.reduce((s, e) => s + (e.achievements?.length || 0), 0)} Total Awards
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.achievements?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, award title, type..." value={achSearch} onChange={e => setAchSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.achievements?.length || 0) > 0).filter(e => {
                  if (!achSearch.trim()) return true;
                  const q = achSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.achievements || []).some((a: any) => (a.title || a.award_title || '').toLowerCase().includes(q) || (a.award_type || a.category || '').toLowerCase().includes(q));
                }).sort((a, b) => (b.achievements?.length || 0) - (a.achievements?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`ach_${e.id}`];
                  const items = expanded ? e.achievements : e.achievements.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(245,158,11,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #F59E0B' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Achievements')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#F59E0B,#D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.achievements.length} 🏆</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((a: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(245,158,11,0.06)' : '#fffbeb', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>🏆</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.title || a.award_title || 'Achievement'}</div>
                              {(a.award_type || a.category) && <div style={{ fontSize: 10, color: T.sub }}>{a.award_type || a.category}</div>}
                            </div>
                          </div>
                        ))}
                        {e.achievements.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`ach_${e.id}`]: !prev[`ach_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#F59E0B', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.achievements.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.achievements?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <Sparkles size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No achievements uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── EDUCATION TAB ── */}
          {activeTab === 'Education' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <GraduationCap size={20} color="#8B5CF6" /> Education
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', fontSize: 12, fontWeight: 700, color: '#8B5CF6' }}>
                    {employees.reduce((s, e) => s + (e.education?.length || 0), 0)} Total Records
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.education?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, degree, institution..." value={eduSearch} onChange={e => setEduSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.education?.length || 0) > 0).filter(e => {
                  if (!eduSearch.trim()) return true;
                  const q = eduSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.education || []).some((ed: any) => (ed.degree || ed.qualification || '').toLowerCase().includes(q) || (ed.institution || ed.university || '').toLowerCase().includes(q));
                }).sort((a, b) => (b.education?.length || 0) - (a.education?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`edu_${e.id}`];
                  const items = expanded ? e.education : e.education.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(139,92,246,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #8B5CF6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Education')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.education.length} 🎓</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((ed: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(139,92,246,0.06)' : '#faf5ff', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>🎓</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{ed.degree || ed.qualification || 'Degree'}</div>
                              {(ed.institution || ed.university) && <div style={{ fontSize: 10, color: T.sub }}>{ed.institution || ed.university}{ed.year ? ` · ${ed.year}` : ''}</div>}
                            </div>
                          </div>
                        ))}
                        {e.education.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`edu_${e.id}`]: !prev[`edu_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#8B5CF6', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.education.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.education?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <GraduationCap size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No education records uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PROJECTS TAB ── */}
          {activeTab === 'Projects' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Briefcase size={20} color="#F97316" /> Projects
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', fontSize: 12, fontWeight: 700, color: '#F97316' }}>
                    {employees.reduce((s, e) => s + (e.projects?.length || 0), 0)} Total Projects
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.projects?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, project title, client, domain..." value={projSearch} onChange={e => setProjSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.projects?.length || 0) > 0).filter(e => {
                  if (!projSearch.trim()) return true;
                  const q = projSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.projects || []).some((p: any) =>
                    (p.ProjectName || p.project_name || p.name || '').toLowerCase().includes(q) ||
                    (p.Client || p.client || '').toLowerCase().includes(q) ||
                    (p.Domain || p.domain || '').toLowerCase().includes(q)
                  );
                }).sort((a, b) => (b.projects?.length || 0) - (a.projects?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`proj_${e.id}`];
                  const items = expanded ? e.projects : e.projects.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(249,115,22,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #F97316' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Projects')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#F97316,#EA580C)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(249,115,22,0.15)', color: '#F97316', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.projects.length} 📁</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((p: any, i: number) => {
                          const title = p.ProjectName || p.project_name || p.name || '';
                          const sub = [p.Client || p.client, p.Domain || p.domain].filter(Boolean).join(' · ');
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(249,115,22,0.06)' : '#fff7ed', borderRadius: 8 }}>
                              <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || 'Untitled Project'}</div>
                                {sub && <div style={{ fontSize: 10, color: T.sub }}>{sub}</div>}
                              </div>
                            </div>
                          );
                        })}
                        {e.projects.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`proj_${e.id}`]: !prev[`proj_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#F97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.projects.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.projects?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <Briefcase size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No projects uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── EXPERT REVIEWS TAB ── */}
          {activeTab === 'Expert Reviews' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* ─── AI Proctoring: Assessment Integrity Monitor ─── */}
              <div style={{ marginBottom: 28, background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                    🔍 Assessment Integrity Monitor
                  </h3>
                  <button onClick={fetchIntegrityReports} style={{ padding: '6px 14px', borderRadius: 10, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={13} className={isLoadingIntegrity ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>

                {isLoadingIntegrity ? (
                  <p style={{ color: T.sub, fontSize: 13, margin: 0 }}>Loading integrity reports...</p>
                ) : integrityReports.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: T.sub, fontSize: 13 }}>No proctored assessments recorded yet.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: T.sub, textAlign: 'left', borderBottom: `1px solid ${T.bdr}` }}>
                          <th style={{ padding: '10px 12px' }}>Employee</th>
                          <th style={{ padding: '10px 12px' }}>Skill</th>
                          <th style={{ padding: '10px 12px' }}>Score</th>
                          <th style={{ padding: '10px 12px' }}>Verdict</th>
                          <th style={{ padding: '10px 12px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {integrityReports.map((ir) => {
                          const verdictMeta: Record<string, { label: string; color: string }> = {
                            clean: { label: '✅ Clean', color: '#10B981' },
                            suspicious: { label: '🟡 Suspicious', color: '#F59E0B' },
                            high_risk: { label: '🔴 High Risk', color: '#EF4444' },
                            compromised: { label: '🔴 Compromised', color: '#EF4444' },
                          };
                          const vm = verdictMeta[ir.verdict] || { label: ir.verdict || '—', color: T.sub };
                          const flagCount = Array.isArray(ir.flags) ? ir.flags.length : 0;
                          return (
                            <tr key={ir.id} style={{ borderBottom: `1px solid ${T.bdr}` }}>
                              <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 700, color: T.text }}>{ir.employee_name || ir.employee_id}</div>
                                {ir.designation && <div style={{ fontSize: 11, color: T.sub }}>{ir.designation}</div>}
                              </td>
                              <td style={{ padding: '12px', fontWeight: 600 }}>{ir.skill_name}</td>
                              <td style={{ padding: '12px' }}>
                                <span style={{ fontWeight: 800, color: ir.integrity_score >= 85 ? '#10B981' : ir.integrity_score >= 65 ? '#F59E0B' : '#EF4444' }}>
                                  {ir.integrity_score}
                                </span>
                              </td>
                              <td style={{ padding: '12px' }}>
                                <span style={{ fontWeight: 700, color: vm.color }}>{vm.label}</span>
                              </td>
                              <td style={{ padding: '12px' }}>
                                {flagCount > 0 ? (
                                  <button onClick={() => setSelectedIntegrity(selectedIntegrity?.id === ir.id ? null : ir)} style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${vm.color}`, background: 'transparent', color: vm.color, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                    {selectedIntegrity?.id === ir.id ? 'Hide' : (ir.verdict === 'clean' || ir.verdict === 'suspicious' ? 'View' : 'Review')}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: T.sub }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Expanded detail for the selected report */}
                    {selectedIntegrity && (
                      <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={15} color="#F59E0B" /> {selectedIntegrity.skill_name} — {selectedIntegrity.employee_name || selectedIntegrity.employee_id}
                          </div>
                          <div style={{ fontSize: 12, color: T.sub }}>
                            📷 {selectedIntegrity.camera_enabled ? 'Camera Active' : 'No camera'} · 🤖 {selectedIntegrity.ai_enabled ? 'AI Active' : 'AI off'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {(Array.isArray(selectedIntegrity.flags) ? selectedIntegrity.flags : []).map((f: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: T.bg, borderRadius: 8, fontSize: 12 }}>
                              <span style={{ color: T.text, textTransform: 'capitalize' }}>{String(f.type || '').replace(/_/g, ' ')} — <span style={{ color: T.sub }}>{f.details}</span></span>
                              <span style={{ color: T.sub, fontSize: 11 }}>{f.timestamp ? new Date(f.timestamp).toLocaleTimeString() : ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Shield size={20} color="#8B5CF6" /> Expert Validation Queue
                </h3>
                <button onClick={fetchReviews} style={{ padding: '6px 14px', borderRadius: 10, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={13} className={isLoadingReviews ? 'animate-spin' : ''} /> Refresh Queue
                </button>
              </div>

              {isLoadingReviews ? (
                <p style={{ color: T.sub, fontSize: 13 }}>Loading review queue...</p>
              ) : reviews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16 }}>
                  <Shield size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontWeight: 700, color: T.sub }}>No expert validation requests pending</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ background: T.card, borderBottom: `1px solid ${T.bdr}`, color: T.sub, textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px' }}>Employee</th>
                        <th style={{ padding: '12px 16px' }}>Skill</th>
                        <th style={{ padding: '12px 16px' }}>SLA Deadline</th>
                        <th style={{ padding: '12px 16px' }}>Integrity</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                        <th style={{ padding: '12px 16px' }}>Reviewer</th>
                        <th style={{ padding: '12px 16px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviews.map((r) => {
                        const isOverdue = r.sla_deadline && new Date(r.sla_deadline) < new Date() && r.review_status !== 'approved' && r.review_status !== 'rejected';
                        return (
                          <tr key={r.session_id} style={{ borderBottom: `1px solid ${T.bdr}` }}>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ fontWeight: 700, color: T.text }}>{r.employee_name}</div>
                              <div style={{ fontSize: 11, color: T.sub }}>{r.zensar_id}</div>
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 600 }}>{r.skill_name || 'Performance Testing'}</td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ color: isOverdue ? '#EF4444' : T.text, fontWeight: isOverdue ? 700 : 500 }}>
                                {new Date(r.sla_deadline).toLocaleDateString()} {isOverdue && '⚠️ OVERDUE'}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ 
                                  fontWeight: 700, 
                                  color: (r.integrity_score !== undefined && r.integrity_score < 75) ? '#EF4444' : '#10B981'
                                }}>
                                  Score: {r.integrity_score ?? 100}%
                                </span>
                                {(r.tab_switch_count > 0 || r.copy_paste_count > 0) && (
                                  <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>
                                    ⚠️ {r.tab_switch_count > 0 ? `Tab switches: ${r.tab_switch_count} ` : ''}
                                    {r.copy_paste_count > 0 ? `Copy/Paste: ${r.copy_paste_count}` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: r.review_status === 'approved' ? 'rgba(16,185,129,0.1)' 
                                          : r.review_status === 'rejected' ? 'rgba(239,68,68,0.1)'
                                          : r.review_status === 'in_review' ? 'rgba(59,130,246,0.1)'
                                          : r.review_status === 'escalated' ? 'rgba(245,158,11,0.1)'
                                          : 'rgba(156,163,175,0.1)',
                                color: r.review_status === 'approved' ? '#10B981'
                                     : r.review_status === 'rejected' ? '#EF4444'
                                     : r.review_status === 'in_review' ? '#3B82F6'
                                     : r.review_status === 'escalated' ? '#F59E0B'
                                     : T.sub
                              }}>
                                {r.review_status.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', color: T.sub }}>{r.reviewer_id || 'Unassigned'}</td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {r.review_status === 'pending' && (
                                  <button onClick={() => handleClaimReview(r)} style={{ padding: '4px 10px', borderRadius: 6, background: '#3B82F6', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                    Claim
                                  </button>
                                )}
                                {r.review_status === 'in_review' && (
                                  <>
                                    <button onClick={() => { setSelectedReview(r); setShowReviewActionModal('approve'); }} style={{ padding: '4px 10px', borderRadius: 6, background: '#10B981', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                      Approve
                                    </button>
                                    <button onClick={() => { setSelectedReview(r); setShowReviewActionModal('reject'); }} style={{ padding: '4px 10px', borderRadius: 6, background: '#EF4444', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                      Reject
                                    </button>
                                    <button onClick={() => { setSelectedReview(r); setShowReviewActionModal('escalate'); }} style={{ padding: '4px 10px', borderRadius: 6, background: '#F59E0B', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                      Escalate
                                    </button>
                                  </>
                                )}
                                {(r.review_status === 'approved' || r.review_status === 'rejected') && (
                                  <span style={{ fontSize: 12, color: T.muted }}>
                                    Decision: <strong>{r.final_decision}</strong>
                                    {r.review_notes && <div style={{ fontSize: 10, fontStyle: 'italic', marginTop: 2 }}>Notes: {r.review_notes}</div>}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action Modals */}
              {showReviewActionModal && selectedReview && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(5px)' }}>
                  <div style={{ background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 20, width: '100%', maxWidth: 1000, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                    
                    {/* Modal Header */}
                    <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, textTransform: 'capitalize', color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Shield size={20} color="#8B5CF6" /> {showReviewActionModal} Validation Request
                        </h3>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>
                          Employee: <strong>{selectedReview.employee_name}</strong> · Zensar ID: <strong>{selectedReview.zensar_id || '—'}</strong> · Skill: <strong>{selectedReview.skill_name || 'Performance Testing'}</strong>
                        </div>
                      </div>
                      <button onClick={() => { setShowReviewActionModal(null); setSelectedReview(null); }} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', fontSize: 20 }}>✕</button>
                    </div>

                    {/* Modal Content - Dual Grid Layout */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '400px 1fr' }}>
                      
                      {/* Left Column: Decision & Action Form */}
                      <div style={{ padding: 24, borderRight: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 20, background: dark ? 'rgba(0,0,0,0.05)' : 'transparent' }}>
                        <div style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}` }}>
                          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: T.sub }}>Decision Overview</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span style={{ color: T.sub }}>Assessment Result:</span>
                              <span style={{ fontWeight: 800, color: selectedReview.explain_score_breakdown?.finalScore >= selectedReview.explain_score_breakdown?.passThreshold ? '#10B981' : '#EF4444' }}>
                                {selectedReview.explain_score_breakdown?.finalScore ?? selectedReview.score ?? 0}%
                                {selectedReview.explain_score_breakdown?.finalScore >= selectedReview.explain_score_breakdown?.passThreshold ? ' (PASS)' : ' (FAIL)'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span style={{ color: T.sub }}>Allocation Readiness:</span>
                              <span style={{ fontWeight: 800, color: '#3B82F6' }}>
                                {selectedReview.allocation_readiness_score ?? 0}%
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span style={{ color: T.sub }}>Allocation Risk:</span>
                              <span style={{ fontWeight: 800, color: selectedReview.allocation_risk === 'High' ? '#EF4444' : selectedReview.allocation_risk === 'Medium' ? '#F59E0B' : '#10B981' }}>
                                {selectedReview.allocation_risk ?? 'Low'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span style={{ color: T.sub }}>Status:</span>
                              <span style={{ fontWeight: 800, color: selectedReview.ready_for_allocation ? '#10B981' : '#EF4444' }}>
                                {selectedReview.ready_for_allocation ? 'Ready for Allocation' : 'Blocked'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {showReviewActionModal === 'escalate' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: T.text }}>Escalate To</label>
                                <select value={escalatedTo} onChange={e => setEscalatedTo(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, background: T.bg, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13 }}>
                                  <option value="admin">Senior Administrator</option>
                                  <option value="rmg">RMG Lead</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: T.text }}>Reason for Escalation</label>
                                <textarea value={escalationReason} onChange={e => setEscalationReason(e.target.value)} rows={4} placeholder="Provide a reason for escalation..." style={{ width: '100%', padding: 10, borderRadius: 8, background: T.bg, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13, resize: 'none' }} />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: T.text }}>Reviewer Notes / Feedback</label>
                              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={6} placeholder="Enter your detailed validation review notes..." style={{ width: '100%', padding: 10, borderRadius: 8, background: T.bg, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13, resize: 'none' }} />
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                          <button onClick={() => { setShowReviewActionModal(null); setSelectedReview(null); }} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: 'none', border: `1px solid ${T.bdr}`, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button onClick={() => handleReviewAction(showReviewActionModal)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: showReviewActionModal === 'approve' ? '#10B981' : showReviewActionModal === 'reject' ? '#EF4444' : '#F59E0B', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Confirm
                          </button>
                        </div>

                        {/* Grant a one-time re-assessment (bypass the 7-day cooldown) */}
                        <button
                          onClick={handleGrantReviewRetake}
                          disabled={reviewGrantBusy || reviewGranted}
                          title={`Let ${selectedReview.employee_name || 'this employee'} re-assess ${selectedReview.skill_name || 'this skill'} immediately`}
                          style={{ width: '100%', padding: '10px 16px', borderRadius: 8, background: reviewGranted ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${reviewGranted ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.45)'}`, color: reviewGranted ? '#10B981' : '#F59E0B', fontSize: 12, fontWeight: 800, cursor: reviewGrantBusy || reviewGranted ? 'default' : 'pointer', opacity: reviewGrantBusy ? 0.7 : 1 }}
                        >
                          {reviewGranted ? '✓ Re-assessment granted' : reviewGrantBusy ? 'Granting…' : '🔓 Grant re-assessment (skip cooldown)'}
                        </button>
                      </div>

                      {/* Right Column: Score Verification Details */}
                      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', maxHeight: 'calc(90vh - 80px)' }}>
                        
                        {/* 1. Score Explanation & Breakdown */}
                        {(() => {
                          const isExpertReview = !!selectedReview.expert_profile;

                          const expertProfile = typeof selectedReview.expert_profile === 'string'
                            ? JSON.parse(selectedReview.expert_profile)
                            : (selectedReview.expert_profile || null);

                          const extractedEvidence = typeof selectedReview.extracted_evidence === 'string'
                            ? JSON.parse(selectedReview.extracted_evidence)
                            : (selectedReview.extracted_evidence || null);

                          const evidenceEval = typeof selectedReview.evidence_evaluation === 'string'
                            ? JSON.parse(selectedReview.evidence_evaluation)
                            : (selectedReview.evidence_evaluation || null);

                          const techDiscussion = typeof selectedReview.technical_discussion === 'string'
                            ? JSON.parse(selectedReview.technical_discussion)
                            : (selectedReview.technical_discussion || null);

                          const leadDiscussion = typeof selectedReview.leadership_discussion === 'string'
                            ? JSON.parse(selectedReview.leadership_discussion)
                            : (selectedReview.leadership_discussion || null);

                          const consistencyAnalysis = typeof selectedReview.consistency_analysis === 'string'
                            ? JSON.parse(selectedReview.consistency_analysis)
                            : (selectedReview.consistency_analysis || null);

                          const riskAnalysis = typeof selectedReview.risk_analysis === 'string'
                            ? JSON.parse(selectedReview.risk_analysis)
                            : (selectedReview.risk_analysis || null);

                          const aiRec = typeof selectedReview.ai_recommendation === 'string'
                            ? JSON.parse(selectedReview.ai_recommendation)
                            : (selectedReview.ai_recommendation || null);

                          const authenticityAnalysis = typeof selectedReview.authenticity_analysis === 'string'
                            ? JSON.parse(selectedReview.authenticity_analysis)
                            : (selectedReview.authenticity_analysis || null);

                          // Standard MCQ/Contribution variables
                          const sb = typeof selectedReview.explain_score_breakdown === 'string'
                            ? JSON.parse(selectedReview.explain_score_breakdown)
                            : (selectedReview.explain_score_breakdown || {});

                          const cb = typeof selectedReview.contribution_breakdown === 'string'
                            ? JSON.parse(selectedReview.contribution_breakdown)
                            : (selectedReview.contribution_breakdown || {});

                          const gitMeta = typeof selectedReview.github_metadata === 'string'
                            ? JSON.parse(selectedReview.github_metadata)
                            : (selectedReview.github_metadata || {});

                          if (isExpertReview) {
                            const allQuestionsList: any[] = [
                              ...(Array.isArray(techDiscussion?.questions) ? techDiscussion.questions : []),
                              ...(Array.isArray(leadDiscussion?.questions) ? leadDiscussion.questions : [])
                            ];
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                
                                {/* AI Recommendation */}
                                {aiRec && (
                                  <div style={{ padding: 18, borderRadius: 14, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8B5CF6', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                      <Brain size={16} /> AI Capability Recommendation
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Suggested Decision: <span style={{ color: aiRec.decision === 'Expert' ? '#10B981' : '#F59E0B' }}>{aiRec.decision}</span></div>
                                    <p style={{ margin: 0, fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                                      {aiRec.reasoning}
                                    </p>
                                  </div>
                                )}

                                {/* Weighted Score Breakdown Card */}
                                 {(() => {
                                   const finalScorePreview = Math.round(
                                     (adjustedEvidenceScore * 0.40) +
                                     (adjustedScenarioScore * 0.25) +
                                     (adjustedMentoringScore * 0.20) +
                                     (adjustedExperienceScore * 0.15)
                                   );
                                   const allocationConfidencePreview = Math.round(
                                     (adjustedEvidenceScore * 0.40) +
                                     (adjustedScenarioScore * 0.30) +
                                     (adjustedMentoringScore * 0.15) +
                                     (adjustedExperienceScore * 0.15)
                                   );
                                   const isPassedPreview = finalScorePreview >= 70;

                                   return (
                                     <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                         <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Interactive V6 Score Validation & Adjuster</h4>
                                         <span style={{ 
                                           padding: '4px 10px', 
                                           borderRadius: 20, 
                                           fontSize: 10, 
                                           fontWeight: 800, 
                                           background: isPassedPreview ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                           color: isPassedPreview ? '#10B981' : '#F59E0B',
                                           border: `1px solid ${isPassedPreview ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                         }}>
                                           {isPassedPreview ? 'RECOMMENDED LEVEL: EXPERT' : 'RECOMMENDED LEVEL: ADVANCED'}
                                         </span>
                                       </div>

                                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: T.bg, padding: 14, borderRadius: 10, border: `1px solid ${T.bdr}` }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                           <div style={{ width: 48, height: 48, borderRadius: '50%', background: isPassedPreview ? 'linear-gradient(135deg,#10B981,#3B82F6)' : 'linear-gradient(135deg,#F59E0B,#EF4444)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                             <span style={{ fontSize: 15, fontWeight: 900 }}>{finalScorePreview}%</span>
                                           </div>
                                           <div>
                                             <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Overall Score</div>
                                             <div style={{ fontSize: 9, color: T.muted }}>Weighted average of V6 components</div>
                                           </div>
                                         </div>

                                         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                           <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#8B5CF6,#60A5FA)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                             <span style={{ fontSize: 15, fontWeight: 900 }}>{allocationConfidencePreview}%</span>
                                           </div>
                                           <div>
                                             <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Workforce Confidence</div>
                                             <div style={{ fontSize: 9, color: T.muted }}>Staffing allocation validation vector</div>
                                           </div>
                                         </div>
                                       </div>

                                       {/* Sliders Grid */}
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                         {[
                                           { 
                                             label: 'Evidence Package (40% Weight)', 
                                             val: adjustedEvidenceScore, 
                                             setVal: setAdjustedEvidenceScore, 
                                             pts: (adjustedEvidenceScore * 0.40).toFixed(1),
                                             color: '#3B82F6'
                                           },
                                           { 
                                             label: 'AI Scenario Discussion (25% Weight)', 
                                             val: adjustedScenarioScore, 
                                             setVal: setAdjustedScenarioScore, 
                                             pts: (adjustedScenarioScore * 0.25).toFixed(1),
                                             color: '#8B5CF6'
                                           },
                                           { 
                                             label: 'Mentoring Validation (20% Weight)', 
                                             val: adjustedMentoringScore, 
                                             setVal: setAdjustedMentoringScore, 
                                             pts: (adjustedMentoringScore * 0.20).toFixed(1),
                                             color: '#10B981'
                                           },
                                           { 
                                             label: 'Experience Depth (15% Weight)', 
                                             val: adjustedExperienceScore, 
                                             setVal: setAdjustedExperienceScore, 
                                             pts: (adjustedExperienceScore * 0.15).toFixed(1),
                                             color: '#F59E0B'
                                           }
                                         ].map((slider, i) => (
                                           <div key={i} style={{ padding: 10, borderRadius: 8, background: T.bg, border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                                               <span style={{ color: T.sub }}>{slider.label}</span>
                                               <span style={{ color: slider.color }}>{slider.val}% ({slider.pts} pts)</span>
                                             </div>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                               <input 
                                                 type="range" 
                                                 min="0" 
                                                 max="100" 
                                                 value={slider.val}
                                                 onChange={(e) => slider.setVal(Number(e.target.value))}
                                                 style={{ flex: 1, accentColor: slider.color, cursor: 'pointer', height: 6, borderRadius: 3 }}
                                               />
                                               <input 
                                                 type="number" 
                                                 min="0" 
                                                 max="100" 
                                                 value={slider.val} 
                                                 onChange={(e) => slider.setVal(Math.max(0, Math.min(100, Number(e.target.value))))}
                                                 style={{ width: 50, padding: '2px 4px', borderRadius: 4, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 11, fontWeight: 700, textAlign: 'center' }}
                                               />
                                             </div>
                                           </div>
                                         ))}
                                       </div>
                                     </div>
                                   );
                                  })()}

                                {/* Candidate Profile Summary */}
                                {expertProfile && (
                                  <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                    <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Candidate Resume Summary</h4>
                                    <p style={{ margin: '0 0 10px', fontSize: 12, color: T.text, lineHeight: 1.5 }}>{expertProfile.summary}</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: T.sub }}>
                                      <div>IT Experience: <strong>{expertProfile.yearsIT} Years</strong></div>
                                      <div>Domains: <strong>{expertProfile.domains?.join(', ')}</strong></div>
                                      <div>Roles: <strong>{expertProfile.roles?.join(', ')}</strong></div>
                                      <div>Technologies: <strong>{expertProfile.technologies?.slice(0, 5).join(', ')}</strong></div>
                                    </div>
                                  </div>
                                )}

                                {/* AI Evidence Analysis */}
                                {evidenceEval && (
                                  <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>AI Evidence Evaluation</h4>
                                      <span style={{ fontSize: 14, fontWeight: 900, color: '#8B5CF6' }}>Score: {evidenceEval.evidenceScore} / 100</span>
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: 12, color: T.sub, lineHeight: 1.4 }}>{evidenceEval.summary}</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                      {Object.entries(evidenceEval.criteria || {}).map(([key, data]: [string, any]) => (
                                        <div key={key} style={{ padding: 8, background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 8, fontSize: 11 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontWeight: 700 }}>
                                            <span style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                                            <span>{data.score}/{data.max}</span>
                                          </div>
                                          <div style={{ color: T.muted, fontSize: 10, lineHeight: 1.3 }}>{data.feedback}</div>
                                        </div>
                                      ))}
                                    </div>
                                    {evidenceEval.strengths && evidenceEval.strengths.length > 0 && (
                                      <div style={{ fontSize: 11, color: '#10B981', marginBottom: 6 }}>
                                        <strong>Strengths:</strong> {evidenceEval.strengths.join(', ')}
                                      </div>
                                    )}
                                    {evidenceEval.weaknesses && evidenceEval.weaknesses.length > 0 && (
                                      <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 6 }}>
                                        <strong>Weaknesses:</strong> {evidenceEval.weaknesses.join(', ')}
                                      </div>
                                    )}
                                    {evidenceEval.missingInformation && evidenceEval.missingInformation.length > 0 && (
                                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
                                        <strong>Missing Info:</strong> {evidenceEval.missingInformation.join(', ')}
                                      </div>
                                    )}
                                    {evidenceEval.improvementSuggestions && evidenceEval.improvementSuggestions.length > 0 && (
                                      <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 12 }}>
                                        <strong>Improvement Suggestions:</strong>
                                        <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                                          {evidenceEval.improvementSuggestions.map((s: string, idx: number) => <li key={idx}>{s}</li>)}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}


                                {/* Universal Evidence Intelligence */}
                                {extractedEvidence && (
                                  <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Universal Evidence Intelligence</h4>

                                    {/* Aggregated signals grid */}
                                    {extractedEvidence.aggregated && (
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                        {[
                                          { label: 'Skills', items: extractedEvidence.aggregated.detectedSkills, color: '#10B981' },
                                          { label: 'Technologies', items: extractedEvidence.aggregated.technologies, color: '#3B82F6' },
                                          { label: 'Leadership', items: extractedEvidence.aggregated.leadershipIndicators, color: '#EC4899' },
                                          { label: 'Architecture', items: extractedEvidence.aggregated.architectureIndicators, color: '#8B5CF6' },
                                          { label: 'Ownership', items: extractedEvidence.aggregated.ownershipIndicators, color: '#F59E0B' },
                                          { label: 'Certifications', items: extractedEvidence.aggregated.certifications, color: '#10B981' },
                                        ].map(({ label, items, color }) => (
                                          <div key={label} style={{ padding: 10, background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase' }}>{label} ({items?.length || 0})</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                              {(items || []).slice(0, 5).map((item: string, i: number) => (
                                                <span key={i} style={{ padding: '2px 7px', borderRadius: 3, background: `${color}15`, color, fontSize: 9, fontWeight: 700, border: `1px solid ${color}25` }}>{item}</span>
                                              ))}
                                              {(items || []).length > 5 && <span style={{ fontSize: 9, color: T.muted }}>+{(items || []).length - 5}</span>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Business Impact */}
                                    {extractedEvidence.aggregated?.businessImpactSummary && (
                                      <div style={{ padding: 10, borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>BUSINESS IMPACT</div>
                                        <p style={{ margin: 0, fontSize: 11, color: T.text, lineHeight: 1.4 }}>{extractedEvidence.aggregated.businessImpactSummary}</p>
                                      </div>
                                    )}

                                    {/* Projects */}
                                    {extractedEvidence.aggregated?.projectNames?.length > 0 && (
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 4 }}>PROJECTS DETECTED ({extractedEvidence.aggregated.projectNames.length})</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                          {extractedEvidence.aggregated.projectNames.map((p: string, i: number) => (
                                            <span key={i} style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 10, fontWeight: 600, border: '1px solid rgba(59,130,246,0.2)' }}>{p}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Per-document summaries list */}
                                    {extractedEvidence.documents?.length > 0 && (
                                      <div style={{ marginTop: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 6 }}>DOCUMENT CLASSIFICATION & SUMMARIES ({extractedEvidence.documents.length} files)</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                          {extractedEvidence.documents.map((doc: any, i: number) => (
                                            <div key={i} style={{ padding: 10, background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: T.text, wordBreak: 'break-all' }}>{doc.filename}</span>
                                                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{doc.documentTypeLabel} (Conf: {doc.confidence}%)</span>
                                              </div>
                                              {doc.evidenceSummary && <p style={{ margin: '4px 0 0', fontSize: 11, color: T.sub, fontStyle: 'italic', lineHeight: 1.3 }}>{doc.evidenceSummary}</p>}
                                              {(doc.detectedSkills || []).length > 0 && (
                                                <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>
                                                  Skills: {(doc.detectedSkills || []).join(', ')}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Fallback: old certifications/projects (backwards compat) */}
                                    {!extractedEvidence.aggregated && extractedEvidence.certifications?.length > 0 && (
                                      <div style={{ marginTop: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 4 }}>CERTIFICATIONS</div>
                                        <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: T.sub }}>
                                          {extractedEvidence.certifications.map((c: any, i: number) => (
                                            <li key={i}><strong>{c.name}</strong> ({c.provider}) {c.credentialNumber && `ID: ${c.credentialNumber}`}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {!extractedEvidence.aggregated && extractedEvidence.projects?.length > 0 && (
                                      <div style={{ marginTop: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 4 }}>PROJECTS</div>
                                        <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: T.sub }}>
                                          {extractedEvidence.projects.map((p: any, i: number) => (
                                            <li key={i}><strong>{p.name}</strong> · {p.role} ({p.duration}) · Team: {p.teamSize}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}

                                

                                {/* Adaptive Expert Discussion Audits (4 Questions) */}
                                {allQuestionsList.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {allQuestionsList.map((q: any, idx: number) => {
                                      const evalData = q.evaluation || {};
                                      return (
                                        <div key={idx} style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>
                                              {t('Adaptive Discussion Q')}{idx + 1}{t(': ')}{q.type || t('Technical')}
                                            </h4>
                                            <span style={{ fontSize: 14, fontWeight: 900, color: '#8B5CF6' }}>
                                              {t('Score: ')}{evalData.questionScore || 0}%
                                            </span>
                                          </div>

                                          <div style={{ background: T.bg, padding: 10, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 11 }}>
                                            <div style={{ color: T.muted, fontWeight: 700, marginBottom: 4 }}>{t('QUESTION:')}</div>
                                            <div style={{ color: T.text, fontWeight: 600, lineHeight: 1.4 }}>{q.question}</div>
                                          </div>

                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                                            <div style={{ padding: 8, background: T.bg, borderRadius: 8, borderLeft: '3px solid #8B5CF6' }}>
                                              <div style={{ fontWeight: 700, color: T.muted, marginBottom: 2 }}>
                                                {t('Employee Response')}{q.isVoiceUsed ? t(' (Voice Flow)') : ''}{t(':')}
                                              </div>
                                              <div style={{ color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{q.response}</div>
                                            </div>
                                            {q.isVoiceUsed && q.rawTranscript && q.rawTranscript !== q.response && (
                                              <div style={{ padding: 8, background: T.bg, borderRadius: 8, borderLeft: '3px solid #3B82F6' }}>
                                                <div style={{ fontWeight: 700, color: T.muted, marginBottom: 2 }}>{t('Raw Audio Transcript:')}</div>
                                                <div style={{ color: T.sub, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{q.rawTranscript}</div>
                                              </div>
                                            )}
                                          </div>

                                          {/* Detail Metrics Breakdown */}
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: T.card, padding: 10, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 10 }}>
                                            {[
                                              { label: t('Question Score'), val: evalData.questionScore },
                                              { label: t('Reasoning Score'), val: evalData.reasoningScore },
                                              { label: t('Technical Depth'), val: evalData.technicalDepth },
                                              { label: t('Leadership Signals'), val: evalData.leadershipSignals },
                                              { label: t('Ownership Signals'), val: evalData.ownershipSignals },
                                              { label: t('Authenticity Score'), val: evalData.authenticityScore },
                                              { label: t('Human Content %'), val: evalData.humanContentPct },
                                              { label: t('AI Assisted %'), val: evalData.aiAssistedPct },
                                              { label: t('Confidence Score'), val: evalData.confidenceScore },
                                            ].map((m, sidx) => (
                                              <div key={sidx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <span style={{ color: T.muted, fontSize: 8 }}>{m.label}</span>
                                                <strong style={{ color: (m.val ?? 0) >= 75 ? '#10B981' : (m.val ?? 0) >= 50 ? '#F59E0B' : '#EF4444' }}>{m.val ?? 0}%</strong>
                                              </div>
                                            ))}
                                          </div>

                                          <div style={{ padding: 10, background: T.bg, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 11 }}>
                                            <div style={{ fontWeight: 700, color: T.sub, marginBottom: 6 }}>{t('AI Critique & Bullet Points:')}</div>
                                            
                                            {evalData.strengths?.length > 0 && (
                                              <div style={{ marginBottom: 6 }}>
                                                <div style={{ color: '#10B981', fontWeight: 700, marginBottom: 2 }}>{t('Strengths:')}</div>
                                                <ul style={{ margin: 0, paddingLeft: 14, color: T.text }}>
                                                  {evalData.strengths.map((str: string, i: number) => <li key={i}>{str}</li>)}
                                                </ul>
                                              </div>
                                            )}
                                            
                                            {evalData.gaps?.length > 0 && (
                                              <div style={{ marginBottom: 6 }}>
                                                <div style={{ color: '#EF4444', fontWeight: 700, marginBottom: 2 }}>{t('Gaps:')}</div>
                                                <ul style={{ margin: 0, paddingLeft: 14, color: T.text }}>
                                                  {evalData.gaps.map((gap: string, i: number) => <li key={i}>{gap}</li>)}
                                                </ul>
                                              </div>
                                            )}

                                            {evalData.improvementSuggestions?.length > 0 && (
                                              <div>
                                                <div style={{ color: '#3B82F6', fontWeight: 700, marginBottom: 2 }}>{t('Suggestions:')}</div>
                                                <ul style={{ margin: 0, paddingLeft: 14, color: T.sub }}>
                                                  {evalData.improvementSuggestions.map((sug: string, i: number) => <li key={i}>{sug}</li>)}
                                                </ul>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <>
                                    {/* Technical Discussion Transcript & Evaluation */}
                                    {techDiscussion && (
                                      <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Technical Discussion Audit</h4>
                                          <span style={{ fontSize: 14, fontWeight: 900, color: '#8B5CF6' }}>Score: {techDiscussion.evaluation?.technicalScore}%</span>
                                        </div>
                                        
                                        <div style={{ background: T.bg, padding: 10, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 11, marginBottom: 12 }}>
                                          <div style={{ color: T.muted, fontWeight: 700, marginBottom: 4 }}>SCENARIO:</div>
                                          <div style={{ color: T.text, lineHeight: 1.4, marginBottom: 6 }}>{techDiscussion.scenario?.scenario}</div>
                                          <div style={{ color: T.muted, fontWeight: 700, marginBottom: 2 }}>QUESTION:</div>
                                          <div style={{ color: T.text, fontWeight: 600 }}>{techDiscussion.scenario?.question}</div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, marginBottom: 12 }}>
                                          <div style={{ padding: 8, background: T.bg, borderRadius: 8, borderLeft: '3px solid #8B5CF6' }}>
                                            <div style={{ fontWeight: 700, color: T.muted, marginBottom: 2 }}>Candidate Strategy:</div>
                                            <div style={{ color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{techDiscussion.answers?.mainAnswer}</div>
                                          </div>
                                          {techDiscussion.scenario?.followUps?.map((q: string, idx: number) => (
                                            <div key={idx} style={{ padding: 8, background: T.bg, borderRadius: 8, borderLeft: '3px solid #3B82F6' }}>
                                              <div style={{ fontWeight: 700, color: T.muted, marginBottom: 2 }}>Follow-Up {idx+1}: {q}</div>
                                              <div style={{ color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{techDiscussion.answers?.followUpAnswers?.[idx]}</div>
                                            </div>
                                          ))}
                                        </div>

                                        <div style={{ padding: 10, background: T.bg, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 11 }}>
                                          <div style={{ fontWeight: 700, color: T.sub, marginBottom: 4 }}>AI Critique & Gaps:</div>
                                          <div style={{ color: T.text, lineHeight: 1.4, marginBottom: 6 }}>{techDiscussion.evaluation?.feedback}</div>
                                          {techDiscussion.evaluation?.strengths?.length > 0 && (
                                            <div style={{ color: '#10B981', marginBottom: 2 }}><strong>Strengths:</strong> {techDiscussion.evaluation.strengths.join(', ')}</div>
                                          )}
                                          {techDiscussion.evaluation?.gaps?.length > 0 && (
                                            <div style={{ color: '#EF4444' }}><strong>Gaps:</strong> {techDiscussion.evaluation.gaps.join(', ')}</div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Leadership Discussion Transcript & Evaluation */}
                                    {leadDiscussion && (
                                      <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Leadership Discussion Audit</h4>
                                          <span style={{ fontSize: 14, fontWeight: 900, color: '#8B5CF6' }}>Score: {leadDiscussion.evaluation?.leadershipScore}%</span>
                                        </div>

                                        <div style={{ background: T.bg, padding: 10, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 11, marginBottom: 12 }}>
                                          <div style={{ color: T.muted, fontWeight: 700, marginBottom: 4 }}>SCENARIO:</div>
                                          <div style={{ color: T.text, lineHeight: 1.4, marginBottom: 6 }}>{leadDiscussion.scenario?.scenario || leadDiscussion.scenario || 'Deadline reduced from 12 weeks to 6 weeks. Team size: 2 Seniors, 5 Mids, 4 Juniors. How to handle?'}</div>
                                          {leadDiscussion.scenario?.question && (
                                            <>
                                              <div style={{ color: T.muted, fontWeight: 700, marginBottom: 2 }}>QUESTION:</div>
                                              <div style={{ color: T.text, fontWeight: 600 }}>{leadDiscussion.scenario.question}</div>
                                            </>
                                          )}
                                        </div>

                                        <div style={{ padding: 8, background: T.bg, borderRadius: 8, borderLeft: '3px solid #8B5CF6', fontSize: 11, marginBottom: 12 }}>
                                          <div style={{ fontWeight: 700, color: T.muted, marginBottom: 2 }}>Candidate Strategy:</div>
                                          <div style={{ color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{leadDiscussion.answer}</div>
                                        </div>

                                        <div style={{ padding: 10, background: T.bg, borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 11 }}>
                                          <div style={{ fontWeight: 700, color: T.sub, marginBottom: 4 }}>AI Critique & Dimension Ratings:</div>
                                          <div style={{ color: T.text, lineHeight: 1.4, marginBottom: 6 }}>{leadDiscussion.evaluation?.feedback}</div>
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, textAlign: 'center', marginTop: 6 }}>
                                            {Object.entries(leadDiscussion.evaluation?.dimensions || {}).map(([dim, d]: [string, any]) => (
                                              <div key={dim} style={{ background: T.card, padding: 4, borderRadius: 4, border: `1px solid ${T.bdr}` }}>
                                                <div style={{ color: T.muted, fontSize: 8, textTransform: 'uppercase' }}>{dim.slice(0, 5)}</div>
                                                <strong>{d.score}/20</strong>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Consistency Analysis */}
                                {consistencyAnalysis && (
                                  <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Consistency Check</h4>
                                      <span style={{ fontSize: 14, fontWeight: 900, color: '#8B5CF6' }}>Score: {consistencyAnalysis.consistencyScore}%</span>
                                    </div>
                                    <p style={{ margin: '0 0 8px', fontSize: 12, color: T.text, lineHeight: 1.4 }}>{consistencyAnalysis.explanation}</p>
                                    {consistencyAnalysis.flaggedInconsistencies?.length > 0 ? (
                                      <div style={{ border: '1px solid rgba(239,68,68,0.2)', padding: 10, background: 'rgba(239,68,68,0.04)', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, fontStyle: 'italic', color: '#EF4444', marginBottom: 4 }}>Flagged Discrepancies:</div>
                                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#EF4444' }}>
                                          {consistencyAnalysis.flaggedInconsistencies.map((inc: string, i: number) => (
                                            <li key={i}>{inc}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : (
                                      <div style={{ color: '#10B981', fontSize: 11, fontWeight: 600 }}>✓ Zero discrepancies between resume claims and assessment reasoning.</div>
                                    )}
                                  </div>
                                )}

                                {/* Authenticity Analysis Card */}
                                {authenticityAnalysis && (
                                  <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Authenticity Analysis</h4>
                                      <span style={{ fontSize: 14, fontWeight: 900, color: authenticityAnalysis.riskLevel === 'High' ? '#EF4444' : authenticityAnalysis.riskLevel === 'Medium' ? '#F59E0B' : '#10B981' }}>
                                        Risk: {authenticityAnalysis.riskLevel} (Score: {authenticityAnalysis.authenticityScore}%)
                                      </span>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10, background: T.bg, borderRadius: 10, border: `1px solid ${T.bdr}`, textAlign: 'center', marginBottom: 12, fontSize: 11 }}>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Human Written %</div>
                                        <strong style={{ color: '#10B981' }}>{authenticityAnalysis.humanWrittenPct}%</strong>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>AI Assisted %</div>
                                        <strong style={{ color: authenticityAnalysis.aiAssistedPct > 50 ? '#EF4444' : '#F59E0B' }}>{authenticityAnalysis.aiAssistedPct}%</strong>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Copy/Paste/Large</div>
                                        <strong>{authenticityAnalysis.copyCount || 0} / {authenticityAnalysis.pasteCount || 0} / {authenticityAnalysis.largePasteEvents || 0}</strong>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Duplicate Risk</div>
                                        <strong style={{ color: authenticityAnalysis.duplicateContentRisk > 40 ? '#EF4444' : T.text }}>{authenticityAnalysis.duplicateContentRisk}%</strong>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.4 }}>
                                      <strong>Authenticity Evaluation:</strong> {authenticityAnalysis.reason}
                                    </div>
                                  </div>
                                )}

                                {/* Proctoring & Risk Analysis */}
                                {riskAnalysis && (
                                  <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${T.bdr}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.sub }}>Risk & Proctoring Assessment</h4>
                                      <span style={{ fontSize: 14, fontWeight: 900, color: riskAnalysis.riskLevel === 'High' ? '#EF4444' : riskAnalysis.riskLevel === 'Medium' ? '#F59E0B' : '#10B981' }}>
                                        Risk Level: {riskAnalysis.riskLevel} (Confidence: {riskAnalysis.confidenceScore}%)
                                      </span>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10, background: T.bg, borderRadius: 10, border: `1px solid ${T.bdr}`, textAlign: 'center', marginBottom: 12, fontSize: 11 }}>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Tab Switches</div>
                                        <strong>{selectedReview.tab_switch_count ?? 0}</strong>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Browser Blurs</div>
                                        <strong>{selectedReview.browser_blur_count ?? 0}</strong>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Fullscreen Exits</div>
                                        <strong>{selectedReview.fullscreen_exit_count ?? 0}</strong>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>DevTools Opened</div>
                                        <strong>{selectedReview.devtools_detected ? 'Yes' : 'No'}</strong>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Evidence Risk:</span>
                                        <strong style={{ color: riskAnalysis.evidenceRisk?.level === 'High' ? '#EF4444' : '#10B981' }}>{riskAnalysis.evidenceRisk?.level}</strong>
                                      </div>
                                      <div style={{ color: T.muted, fontSize: 10, paddingLeft: 8, marginBottom: 4 }}>{riskAnalysis.evidenceRisk?.feedback}</div>
                                      
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Consistency Risk:</span>
                                        <strong style={{ color: riskAnalysis.consistencyRisk?.level === 'High' ? '#EF4444' : '#10B981' }}>{riskAnalysis.consistencyRisk?.level}</strong>
                                      </div>
                                      <div style={{ color: T.muted, fontSize: 10, paddingLeft: 8, marginBottom: 4 }}>{riskAnalysis.consistencyRisk?.feedback}</div>

                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Validation Risk:</span>
                                        <strong style={{ color: riskAnalysis.validationRisk?.level === 'High' ? '#EF4444' : '#10B981' }}>{riskAnalysis.validationRisk?.level}</strong>
                                      </div>
                                      <div style={{ color: T.muted, fontSize: 10, paddingLeft: 8 }}>{riskAnalysis.validationRisk?.feedback}</div>
                                    </div>
                                  </div>
                                )}

                              </div>
                            );
                          }

                          return (
                            <>
                              <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: T.sub, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Info size={14} /> Explain My Score Breakdown
                                </h4>
                                <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                    <thead>
                                      <tr style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${T.bdr}`, color: T.sub }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Component</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Raw Score</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Weight</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Weighted Score</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr style={{ borderBottom: `1px solid ${T.bdr}` }}>
                                        <td style={{ padding: '8px 12px', color: T.text, fontWeight: 600 }}>Assessment (MCQ)</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', color: T.text }}>{sb.assessmentScore ?? selectedReview.score ?? 0}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', color: T.sub }}>{sb.assessmentWeight ?? 100}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', color: T.text, fontWeight: 600 }}>{sb.assessmentWeightedScore ?? selectedReview.score ?? 0}</td>
                                      </tr>
                                      <tr style={{ borderBottom: `1px solid ${T.bdr}` }}>
                                        <td style={{ padding: '8px 12px', color: T.text, fontWeight: 600 }}>Contribution Score</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', color: T.text }}>{sb.contributionScore ?? 0}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', color: T.sub }}>{sb.contributionWeight ?? 0}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', color: T.text, fontWeight: 600 }}>{sb.contributionWeightedScore ?? 0}</td>
                                      </tr>
                                      <tr style={{ background: dark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)' }}>
                                        <td style={{ padding: '10px 12px', color: T.text, fontWeight: 800 }}>Final Score / Threshold</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: T.text, fontWeight: 800 }}>{sb.finalScore ?? selectedReview.score ?? 0}%</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: T.sub }}>Threshold: {sb.passThreshold ?? 60}%</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: (sb.gapRemaining ?? 0) > 0 ? '#EF4444' : '#10B981', fontWeight: 800 }}>
                                          {(sb.gapRemaining ?? 0) > 0 ? `Gap: -${sb.gapRemaining}%` : 'Passed ✓'}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* 2. Contribution Breakdown */}
                              {cb && Object.keys(cb).length > 0 && (
                                <div>
                                  <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: T.sub, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Sparkles size={14} /> Contribution Score Breakdown ({cb.total ?? 0}/100)
                                  </h4>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    {[
                                      { label: 'GitHub Score', score: cb.githubScore, max: cb.githubMax || 20, reason: cb.githubDeductionReason },
                                      { label: 'Project Score', score: cb.projectScore, max: cb.projectMax || 20, reason: cb.projectDeductionReason },
                                      { label: 'Documentation Score', score: cb.documentationScore, max: cb.documentationMax || 20, reason: cb.documentationDeductionReason },
                                      { label: 'Certification Score', score: cb.certificationScore, max: cb.certificationMax || 20, reason: cb.certificationDeductionReason },
                                      { label: 'Evidence Score', score: cb.evidenceScore, max: cb.evidenceMax || 20, reason: cb.evidenceDeductionReason }
                                    ].map((c, i) => (
                                      <div key={i} style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '10px 12px', fontSize: 11 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 4, color: T.text }}>
                                          <span>{c.label}</span>
                                          <span style={{ color: c.score === c.max ? '#10B981' : '#F59E0B' }}>{c.score ?? 0}/{c.max}</span>
                                        </div>
                                        {c.reason ? (
                                          <div style={{ color: '#EF4444', fontStyle: 'italic', fontSize: 10, marginTop: 2 }}>{c.reason}</div>
                                        ) : (
                                          <div style={{ color: '#10B981', fontSize: 10, marginTop: 2 }}>✓ Max points awarded</div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 3. Session Integrity */}
                              <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: T.sub, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <AlertTriangle size={14} /> Session Integrity Details ({selectedReview.integrity_score ?? 100}%)
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, padding: 12, border: `1px solid ${T.bdr}`, borderRadius: 12, background: 'rgba(239,68,68,0.02)' }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: T.sub, fontSize: 9 }}>Tab Switch</div>
                                    <div style={{ fontWeight: 800, color: (selectedReview.tab_switch_count || 0) > 0 ? '#F59E0B' : T.text, fontSize: 13 }}>{selectedReview.tab_switch_count ?? 0}</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: T.sub, fontSize: 9 }}>Fullscreen Exit</div>
                                    <div style={{ fontWeight: 800, color: (selectedReview.fullscreen_exit_count || 0) > 0 ? '#F59E0B' : T.text, fontSize: 13 }}>{selectedReview.fullscreen_exit_count ?? 0}</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: T.sub, fontSize: 9 }}>Browser Blur</div>
                                    <div style={{ fontWeight: 800, color: (selectedReview.browser_blur_count || 0) > 0 ? '#F59E0B' : T.text, fontSize: 13 }}>{selectedReview.browser_blur_count ?? 0}</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: T.sub, fontSize: 9 }}>DevTools Opened</div>
                                    <div style={{ fontWeight: 800, color: selectedReview.devtools_detected ? '#EF4444' : T.text, fontSize: 13 }}>{selectedReview.devtools_detected ? 'Yes' : 'No'}</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: T.sub, fontSize: 9 }}>Copy Attempts</div>
                                    <div style={{ fontWeight: 800, color: (selectedReview.copy_paste_count || 0) > 0 ? '#EF4444' : T.text, fontSize: 13 }}>{selectedReview.copy_paste_count ?? 0}</div>
                                  </div>
                                </div>
                                {selectedReview.integrity_flags && Array.isArray(selectedReview.integrity_flags) && selectedReview.integrity_flags.length > 0 ? (
                                  <div style={{ marginTop: 8, padding: 8, border: `1px solid rgba(239,68,68,0.2)`, borderRadius: 8, background: 'rgba(239,68,68,0.05)', fontSize: 11 }}>
                                    <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>System Proctor Flags:</div>
                                    <ul style={{ margin: 0, paddingLeft: 16, color: '#EF4444' }}>
                                      {selectedReview.integrity_flags.map((flag: string, idx: number) => (
                                        <li key={idx}>{flag}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <div style={{ color: '#10B981', fontSize: 11, fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    ✓ No proctor violations flagged.
                                  </div>
                                )}
                              </div>

                              {/* 4. GitHub Validation Evidence */}
                              {gitMeta && Object.keys(gitMeta).length > 0 && gitMeta.repository && (
                                <div>
                                  <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: T.sub, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Briefcase size={14} /> GitHub Repository Ownership Evidence
                                  </h4>
                                  <div style={{ padding: 12, border: `1px solid ${T.bdr}`, borderRadius: 12, background: dark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.01)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: T.sub }}>Repository:</span>
                                      <a href={`https://github.com/${gitMeta.repository}`} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', fontWeight: 600, textDecoration: 'underline' }}>{gitMeta.repository}</a>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: T.sub }}>Verified Owner:</span>
                                      <span style={{ color: T.text, fontWeight: 600 }}>{gitMeta.owner}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, borderTop: `1px solid ${T.bdr}`, paddingTop: 8, marginTop: 4, textAlign: 'center' }}>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Commits</div>
                                        <div style={{ fontWeight: 800, color: T.text }}>{gitMeta.commits ?? 0}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>PRs</div>
                                        <div style={{ fontWeight: 800, color: T.text }}>{gitMeta.pulls ?? 0}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: T.sub, fontSize: 9 }}>Issues</div>
                                        <div style={{ fontWeight: 800, color: T.text }}>{gitMeta.issues ?? 0}</div>
                                      </div>
                                    </div>
                                    {gitMeta.lastActivity && (
                                      <div style={{ borderTop: `1px solid ${T.bdr}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.sub }}>
                                        <span>Last Activity:</span>
                                        <span>{new Date(gitMeta.lastActivity).toLocaleString()}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}

                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RE-ASSESSMENT TAB ── one card per employee: name + Zensar ID +
               primary/secondary/tertiary skills + a single Approve (grant-all) ── */}
          {activeTab === 'Re-assessment' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <Lock size={20} color="#F59E0B" />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Re-assessment Access</h3>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{employees.length} employees</span>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: T.sub, lineHeight: 1.55 }}>
                Approve a one-time re-assessment so an employee can retake immediately — bypassing the 7-day cooldown (🔴 “Re-assessment available on …”). Approve each skill individually; each pass is consumed on the employee’s next attempt for that skill.
              </p>

              <div style={{ position: 'relative', marginBottom: 18, maxWidth: 360 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }} />
                <input value={raSearch} onChange={e => setRaSearch(e.target.value)} placeholder="Search name or Zensar ID…" style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {employees
                  .filter(e => {
                    const q = raSearch.trim().toLowerCase();
                    if (!q) return true;
                    return String(e.name || '').toLowerCase().includes(q) || String(e.zensar_id || e.id || '').toLowerCase().includes(q);
                  })
                  .map(e => {
                    const skills = getTop3Skills(e);
                    const labels = ['Primary', 'Secondary', 'Tertiary'];
                    return (
                      <div key={e.id} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                            {String(e.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                            <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                          </div>
                        </div>

                        {/* One row per skill — each with its own Approve button */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {skills.length ? skills.map((s, i) => {
                            const key = raKey(String(e.id), s);
                            const granted = raGranted.has(key);
                            const busy = raBusyId === key;
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: `1px solid ${granted ? 'rgba(16,185,129,0.4)' : T.bdr}`, background: granted ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: T.muted }}>{labels[i]}</div>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</div>
                                </div>
                                <button
                                  onClick={() => handleGrantSkill(e, s)}
                                  disabled={busy || granted}
                                  style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 8, border: 'none', background: granted ? 'rgba(16,185,129,0.14)' : 'linear-gradient(135deg,#10B981,#059669)', color: granted ? '#10B981' : '#fff', fontSize: 11.5, fontWeight: 800, cursor: busy || granted ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
                                >
                                  {granted ? '✓ Approved' : busy ? '…' : '✓ Approve'}
                                </button>
                              </div>
                            );
                          }) : <span style={{ fontSize: 12, color: T.muted }}>No skills on record</span>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── WORKFORCE INTELLIGENCE TAB ── */}
          {activeTab === 'Workforce Intelligence' && (
            <div style={{ animation: 'fadeIn 0.4s ease', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Brain size={20} color="#EC4899" /> Workforce Capability & Intelligence
                </h3>
                <button onClick={fetchWfIntel} style={{ padding: '6px 14px', borderRadius: 10, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={13} className={isLoadingWfIntel ? 'animate-spin' : ''} /> Refresh Intelligence
                </button>
              </div>

              {isLoadingWfIntel || !wfIntel ? (
                <p style={{ color: T.sub, fontSize: 13 }}>Loading workforce intelligence data...</p>
              ) : (
                <>
                  {/* 1. Readiness Capability Distribution */}
                  <div style={{ background: T.bg, padding: 24, borderRadius: 16, border: `1px solid ${T.bdr}` }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: T.text }}>Readiness Capability Distribution</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                      <div style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#EC4899' }}>{wfIntel.readiness.averageReadiness}%</div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>Avg Workforce Readiness</div>
                      </div>
                      <div style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>{wfIntel.readiness.capabilityLevels.expert}</div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>Expert Tier (&gt;=80%)</div>
                      </div>
                      <div style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#3B82F6' }}>{wfIntel.readiness.capabilityLevels.advanced}</div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>Advanced Tier (60-79%)</div>
                      </div>
                      <div style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#F59E0B' }}>{wfIntel.readiness.capabilityLevels.intermediate}</div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>Intermediate Tier (30-59%)</div>
                      </div>
                      <div style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#EF4444' }}>{wfIntel.readiness.capabilityLevels.beginner}</div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>Beginner Tier (&lt;30%)</div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Hidden Skills Discovery */}
                  <div style={{ background: T.bg, padding: 24, borderRadius: 16, border: `1px solid ${T.bdr}` }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>Discovered Hidden Skills</span>
                      <span style={{ background: 'rgba(236,72,153,0.1)', color: '#EC4899', fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>
                        {wfIntel.hiddenSkills.length} Pending Approval
                      </span>
                    </h4>
                    {wfIntel.hiddenSkills.length === 0 ? (
                      <p style={{ color: T.sub, fontSize: 13, margin: 0 }}>No new hidden skills discovered from projects or certifications.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ color: T.sub, borderBottom: `1px solid ${T.bdr}` }}>
                              <th style={{ padding: '8px 12px' }}>Employee</th>
                              <th style={{ padding: '8px 12px' }}>Skill Name</th>
                              <th style={{ padding: '8px 12px' }}>Discovery Source</th>
                              <th style={{ padding: '8px 12px' }}>Discovered On</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wfIntel.hiddenSkills.map((sk: any) => (
                              <tr key={sk.id} style={{ borderBottom: `1px solid ${T.bdr}` }}>
                                <td style={{ padding: '12px 12px' }}>
                                  <div style={{ fontWeight: 700 }}>{sk.employee_name}</div>
                                  <div style={{ fontSize: 11, color: T.sub }}>{sk.zensar_id}</div>
                                </td>
                                <td style={{ padding: '12px 12px', fontWeight: 600 }}>{sk.skill_name}</td>
                                <td style={{ padding: '12px 12px' }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                    background: sk.discovery_source === 'project' ? 'rgba(249,115,22,0.1)' : 'rgba(16,185,129,0.1)',
                                    color: sk.discovery_source === 'project' ? '#F97316' : '#10B981'
                                  }}>
                                    {sk.discovery_source}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 12px', color: T.sub }}>
                                  {new Date(sk.created_at).toLocaleDateString()}
                                </td>
                                <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleApproveHiddenSkill(sk.employee_id, sk.skill_name)}
                                    disabled={approvingSkill === `${sk.employee_id}-${sk.skill_name}`}
                                    style={{
                                      padding: '6px 12px', borderRadius: 8, background: '#EC4899', border: 'none',
                                      color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: '0.2s'
                                    }}
                                  >
                                    {approvingSkill === `${sk.employee_id}-${sk.skill_name}` ? 'Approving...' : 'Approve & Add'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 2.5. Top Talent Leaderboard */}
                  <div style={{ background: T.bg, padding: 24, borderRadius: 16, border: `1px solid ${T.bdr}` }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>Top Talent Leaderboard</span>
                      <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>
                        Ranked by Capability & Assessment
                      </span>
                    </h4>
                    {!wfIntel.topTalentLeaderboard || wfIntel.topTalentLeaderboard.length === 0 ? (
                      <p style={{ color: T.sub, fontSize: 13, margin: 0 }}>No validated skill metrics to display on the leaderboard yet.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ color: T.sub, borderBottom: `1px solid ${T.bdr}` }}>
                              <th style={{ padding: '8px 12px' }}>Skill Name</th>
                              <th style={{ padding: '8px 12px' }}>Validated Count</th>
                              <th style={{ padding: '8px 12px' }}>Average Capability Score</th>
                              <th style={{ padding: '8px 12px' }}>Rank #1 Talent</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Top Capability Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wfIntel.topTalentLeaderboard.map((item: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: `1px solid ${T.bdr}` }}>
                                <td style={{ padding: '12px 12px', fontWeight: 700, color: T.text }}>{item.skillName}</td>
                                <td style={{ padding: '12px 12px' }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                                    background: 'rgba(16,185,129,0.1)', color: '#10B981'
                                  }}>
                                    {item.validatedCount} Validated
                                  </span>
                                </td>
                                <td style={{ padding: '12px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <strong style={{ minWidth: 32 }}>{item.averageCapability}%</strong>
                                    <div style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', width: 80, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                                      <div style={{ background: 'linear-gradient(90deg,#10B981,#3B82F6)', height: '100%', width: `${item.averageCapability}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 16 }}>🥇</span>
                                    <span style={{ fontWeight: 700, color: T.text }}>{item.topEmployeeName}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 900, color: '#ec4899', fontSize: 14 }}>
                                  {item.topCapabilityScore}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 3. Emerging Skills & Skill Clusters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
                    <div style={{ background: T.bg, padding: 24, borderRadius: 16, border: `1px solid ${T.bdr}` }}>
                      <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: T.text }}>Emerging Skills Demand (Current Profiles)</h4>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {wfIntel.emergingSkills.map((sk: any) => (
                          <div key={sk.skill_name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.card, padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.bdr}` }}>
                            <span style={{ fontWeight: 600 }}>{sk.skill_name}</span>
                            <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 12, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                              {sk.count} Employees
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ background: T.bg, padding: 24, borderRadius: 16, border: `1px solid ${T.bdr}` }}>
                      <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: T.text }}>Custom Skill Clusters</h4>
                      <div style={{ display: 'grid', gap: 16 }}>
                        {wfIntel.skillClustering.map((c: any) => (
                          <div key={c.name} style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}` }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: T.sub, margin: '4px 0 12px' }}>{c.description}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {c.skills.map((sk: string) => (
                                <span key={sk} style={{ fontSize: 11, background: T.bg, border: `1px solid ${T.bdr}`, padding: '2px 8px', borderRadius: 6, color: T.text }}>
                                  {sk}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 4. Reskilling Recommendations */}
                  <div style={{ background: T.bg, padding: 24, borderRadius: 16, border: `1px solid ${T.bdr}` }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: T.text }}>Reskilling & Upskilling Paths</h4>
                    {wfIntel.reskillingRecommendations.length === 0 ? (
                      <p style={{ color: T.sub, fontSize: 13, margin: 0 }}>No automated learning path suggestions found based on open role demand.</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        {wfIntel.reskillingRecommendations.map((rec: any, idx: number) => (
                          <div key={idx} style={{ background: T.card, padding: 16, borderRadius: 12, border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontWeight: 700 }}>{rec.employeeName}</div>
                                <div style={{ fontSize: 11, color: T.sub }}>{rec.zensarId}</div>
                              </div>
                              <span style={{ fontSize: 11, background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                {rec.targetRole}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bg, padding: 8, borderRadius: 8, fontSize: 12 }}>
                              <span style={{ fontWeight: 600, color: '#10B981' }}>{rec.currentSkill}</span>
                              <span style={{ color: T.sub }}>➡️</span>
                              <span style={{ fontWeight: 600, color: '#EC4899' }}>{rec.recommendedSkill}</span>
                            </div>
                            <div style={{ fontSize: 12, color: T.sub, fontStyle: 'italic' }}>
                              "{rec.reason}"
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'Skill Groups' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: T.text }}>Skill Group Dashboard</h3>
                  <div style={{ fontSize: 12, color: T.sub }}>Upload an Excel of <b>ID, Name, Domain, Skill Group</b> — matched to people by ID. The <b>AI for QE / QE for AI / Automation</b> flags are <b>No</b> for everyone until you upload a <b>Completions</b> Excel (ID, Name + a <b>Yes/No</b> column for each flag) — <b>Yes</b> flips that flag on.</div>
                  <div style={{ fontSize: 11.5, color: T.sub, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Download size={13} color="#3B82F6" />
                    <span style={{ fontWeight: 700 }}>Sample format:</span>
                    <a href="/samples/skill-group-mapping-template.xlsx" download style={{ color: '#3B82F6', fontWeight: 700, textDecoration: 'none' }}>Mapping template</a>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <a href="/samples/course-completions-template.xlsx" download style={{ color: '#10B981', fontWeight: 700, textDecoration: 'none' }}>Completions template</a>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'stretch' }}>
                  {/* Group 1 — ID→Skill Group mapping */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12, border: `1px solid ${T.bdr}`, background: T.bg }}>
                    <input ref={sgFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => handleSkillGroupExcel(e.target.files)} />
                    <button onClick={() => sgFileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderRadius: 8, background: '#06B6D4', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                      <Upload size={16} /> Upload Mapping
                    </button>
                    {Object.keys(sgExcel).length > 0 && (
                      <button onClick={() => { setSgExcel({}); localStorage.removeItem(SG_EXCEL_KEY); toast.success('Cleared uploaded mapping'); }} title="Clear mapping" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <Trash2 size={14} /> {Object.keys(sgExcel).length}
                      </button>
                    )}
                  </div>

                  {/* Group 2 — Completions (drives the Yes/No flags; raw rows hidden) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12, border: `1px solid ${completions ? 'rgba(16,185,129,0.4)' : T.bdr}`, background: completions ? 'rgba(16,185,129,0.06)' : T.bg }}>
                    <input ref={compFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => handleCompletionExcel(e.target.files)} />
                    <button onClick={() => compFileRef.current?.click()} title="Excel of ID/Name + a Yes/No column per flag — saved to the database" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderRadius: 8, background: '#10B981', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                      <Upload size={16} /> Upload Completions
                    </button>
                    {completions && (
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setResetOpen(o => !o)} title="Reset selected flags to No for everyone"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', borderRadius: 8, border: `1px solid rgba(239,68,68,0.35)`, background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                          <RotateCcw size={15} /> Reset <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
                        </button>
                        {resetOpen && (
                          <>
                            <div onClick={() => setResetOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 31, width: 260, background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px 8px' }}>Which flags to reset?</div>
                              {([
                                { key: 'aiForQe' as const, label: 'Test AI for QE' },
                                { key: 'qeForAi' as const, label: 'Test QE for AI' },
                                { key: 'testAutomation' as const, label: 'Test Automation' },
                              ]).map(f => {
                                const cnt = completions.records.filter(r => r[f.key]).length;
                                const on = resetSel.includes(f.key);
                                return (
                                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 8, cursor: cnt ? 'pointer' : 'not-allowed', opacity: cnt ? 1 : 0.5, fontSize: 13, fontWeight: 600, color: T.text }}>
                                    <input type="checkbox" checked={on} disabled={!cnt}
                                      onChange={() => setResetSel(s => s.includes(f.key) ? s.filter(x => x !== f.key) : [...s, f.key])}
                                      style={{ width: 16, height: 16, accentColor: '#EF4444', cursor: 'pointer' }} />
                                    <span style={{ flex: 1 }}>{f.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: cnt ? '#10B981' : T.muted }}>{cnt} Yes</span>
                                  </label>
                                );
                              })}
                              <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.bdr}` }}>
                                <button onClick={() => setResetSel(['aiForQe', 'qeForAi', 'testAutomation'])} style={{ flex: 1, height: 34, borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Select all</button>
                                <button onClick={() => resetCompletionFlags(resetSel)} disabled={resetSel.length === 0}
                                  style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: resetSel.length ? '#EF4444' : T.bdr, color: '#fff', fontSize: 12, fontWeight: 800, cursor: resetSel.length ? 'pointer' : 'not-allowed', opacity: resetSel.length ? 1 : 0.6 }}>
                                  Reset{resetSel.length ? ` (${resetSel.length})` : ''}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(() => {
                const q = search.trim().toLowerCase();

                // Merge every employee with their uploaded Excel row (matched by ID).
                const merged = employees.map((emp: any) => {
                  const qe = resolveQEAssignment(emp);
                  const ex = sgLookup(emp);
                  const domain = normalizeDomain(ex?.domain) || deriveDomain(emp);
                  const skillGroup = (ex?.skillGroup || '').trim() || qe.group;
                  const experience = String(ex?.experience || emp.years_it || emp.yearsIT || emp.yearsExperience || emp.years_zensar || '').trim();
                  const primarySkill = qe.primarySkill;
                  const secondarySkill = qe.secondarySkill;
                  // Options offered when an admin edits the primary/secondary skill.
                  const ratedSkillNames = (emp.skills || [])
                    .map((sk: any) => sk?.skillName || sk?.skill_name || sk?.name)
                    .filter(Boolean);
                  const skillOptions = Array.from(new Set([
                    primarySkill, secondarySkill,
                    ...essentialSkillsFor(qe.family, qe.group),
                    ...qe.matchedSkills,
                    ...ratedSkillNames,
                  ].filter(Boolean))).sort();
                  // Related trainings: explicit Excel column if present, else derive from
                  // the resume-extracted skills/tools (matched essential skills).
                  const exTrainings = (ex?.relatedTrainings || '').trim();
                  const trainingList: string[] = exTrainings
                    ? exTrainings.split(/[,;|]/).map((t: string) => t.trim()).filter(Boolean)
                    : qe.matchedSkills;
                  const certNames = (emp.certifications || [])
                    .map((c: any) => c.cert_name || c.CertName || c.certName || c.name || c.Name || c.title || c.Title || c.certification_name || c.certificationName || (typeof c === 'string' ? c : ''))
                    .filter(Boolean);
                  // AI-for-QE / QE-for-AI / Automation flags come ONLY from the
                  // uploaded completion log — everyone defaults to NO.
                  const flags = completionFlagsFor(emp, completions);
                  return { emp, qe, domain, skillGroup, experience, primarySkill, secondarySkill, skillOptions, trainingList, certNames, flags };
                });

                const groupOptions = Array.from(new Set(merged.map(m => m.skillGroup).filter(Boolean))).sort();
                const skillOptionsAll = Array.from(new Set(merged.flatMap(m => [m.primarySkill, m.secondarySkill]).filter(Boolean))).sort();
                const expOptions = Array.from(new Set(merged.map(m => m.experience).filter(Boolean))).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));

                const yn = (b: boolean) => (b ? 'yes' : 'no');
                const rows = merged.filter(m => {
                  if (q && !((m.emp.name || '').toLowerCase().includes(q) || String(m.emp.zensar_id || m.emp.id).toLowerCase().includes(q))) return false;
                  if (sgFilter.domain.length && !sgFilter.domain.includes(m.domain)) return false;
                  if (sgFilter.group.length && !sgFilter.group.includes(m.skillGroup)) return false;
                  if (sgFilter.skill.length && !sgFilter.skill.includes(m.primarySkill) && !sgFilter.skill.includes(m.secondarySkill)) return false;
                  if (sgFilter.experience.length && !sgFilter.experience.includes(m.experience)) return false;
                  if (sgFilter.aiForQe.length && !sgFilter.aiForQe.includes(yn(m.flags.aiForQe))) return false;
                  if (sgFilter.qeForAi.length && !sgFilter.qeForAi.includes(yn(m.flags.qeForAi))) return false;
                  if (sgFilter.testAutomation.length && !sgFilter.testAutomation.includes(yn(m.flags.testAutomation))) return false;
                  return true;
                });

                const anyFilter = Object.values(sgFilter).some(v => v.length > 0);

                const exportSkillGroups = () => {
                  if (rows.length === 0) { toast.warning('No rows to export.'); return; }
                  const data = rows.map(m => ({
                    ID: m.emp.zensar_id || m.emp.id,
                    Name: m.emp.name || '',
                    Domain: m.domain || '',
                    'Skill Group': m.skillGroup || '',
                    Experience: m.experience || '',
                    'Primary Skill': m.primarySkill || '',
                    'Secondary Skill': m.secondarySkill || '',
                    'Related Trainings': m.trainingList.join(', '),
                    Certifications: m.certNames.join(', '),
                    'Test AI for QE (Zense.AI QI)': m.flags.aiForQe ? 'Yes' : 'No',
                    'Test QE for AI (AssureAI)': m.flags.qeForAi ? 'Yes' : 'No',
                    'Test Automation': m.flags.testAutomation ? 'Yes' : 'No',
                  }));
                  const ws = XLSX.utils.json_to_sheet(data);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Skill Groups');
                  XLSX.writeFile(wb, `skill-groups-${new Date().toISOString().slice(0, 10)}.xlsx`);
                  toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
                };

                const cell = { padding: '12px 14px', fontSize: 12.5, color: T.text, verticalAlign: 'top' as const };
                const thStyle = (center = false) => ({ textAlign: (center ? 'center' : 'left') as 'center' | 'left', padding: '12px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 0.4, color: T.muted, whiteSpace: 'nowrap' as const });

                // Multi-select checklist filter dropdown.
                const checklistFilter = (key: keyof typeof sgFilter, label: string, options: { value: string; label: string }[]) => {
                  const selected = sgFilter[key];
                  const open = sgOpenFilter === key;
                  const toggle = (val: string) => setSgFilter(f => {
                    const cur = f[key];
                    return { ...f, [key]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
                  });
                  return (
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setSgOpenFilter(open ? '' : key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, background: selected.length ? 'rgba(59,130,246,0.12)' : T.input, border: `1px solid ${selected.length ? 'rgba(59,130,246,0.5)' : T.inputBdr}`, color: selected.length ? '#3B82F6' : T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <span>{label}{selected.length ? ` · ${selected.length}` : ''}</span>
                        <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
                      </button>
                      {open && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 200, maxWidth: 300, maxHeight: 300, overflowY: 'auto', background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 6 }}>
                          {options.length === 0 ? (
                            <div style={{ padding: 10, fontSize: 12, color: T.sub }}>No options</div>
                          ) : options.map(opt => {
                            const on = selected.includes(opt.value);
                            return (
                              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.text, background: on ? (dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent' }}
                                onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)')}
                                onMouseLeave={e => (e.currentTarget.style.background = on ? (dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent')}>
                                <input type="checkbox" checked={on} onChange={() => toggle(opt.value)} style={{ width: 16, height: 16, accentColor: '#3B82F6', cursor: 'pointer' }} />
                                <span style={{ flex: 1 }}>{opt.label}</span>
                              </label>
                            );
                          })}
                          {selected.length > 0 && (
                            <button onClick={() => setSgFilter(f => ({ ...f, [key]: [] }))} style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#EF4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>Clear {label}</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                };
                const ynOpts = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

                return (
                  <>
                    {/* Backdrop closes any open checklist dropdown */}
                    {sgOpenFilter && <div onClick={() => setSgOpenFilter('')} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />}

                    {/* Search + Filters */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', position: 'relative', zIndex: 16 }}>
                      <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                        <Search size={16} color={T.muted} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                        <input placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 500, outline: 'none' }} />
                      </div>
                      {checklistFilter('domain', 'Domains', QE_DOMAINS.map(d => ({ value: d, label: d })))}
                      {checklistFilter('group', 'Skill Groups', groupOptions.map(g => ({ value: g, label: g })))}
                      {checklistFilter('skill', 'Skills', skillOptionsAll.map(sk => ({ value: sk, label: sk })))}
                      {checklistFilter('experience', 'Experience', expOptions.map(x => ({ value: x, label: `${x} yrs` })))}
                      {checklistFilter('aiForQe', 'Test AI for QE', ynOpts)}
                      {checklistFilter('qeForAi', 'Test QE for AI', ynOpts)}
                      {checklistFilter('testAutomation', 'Test Automation', ynOpts)}
                      {anyFilter && (
                        <button onClick={() => setSgFilter({ domain: [], group: [], skill: [], experience: [], aiForQe: [], qeForAi: [], testAutomation: [] })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          <X size={14} /> Clear all
                        </button>
                      )}
                      <button onClick={exportSkillGroups} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderRadius: 10, border: 'none', background: '#10B981', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginLeft: 'auto' }}>
                        <Download size={15} /> Export ({rows.length})
                      </button>
                    </div>

                    {rows.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: T.sub, fontSize: 14 }}>No employees found.</div>
                    ) : (
                      <div style={{ overflowX: 'auto', border: `1px solid ${T.bdr}`, borderRadius: 16 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1320, tableLayout: 'auto' }}>
                          <thead>
                            <tr style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
                              <th style={thStyle()}>ID</th>
                              <th style={thStyle()}>Name</th>
                              <th style={thStyle()}>Domain</th>
                              <th style={thStyle()}>Skill Group</th>
                              <th style={thStyle(true)}>Exp</th>
                              <th style={{ ...thStyle(), paddingLeft: 64 }}>Skills</th>
                              <th style={thStyle()}>Related Trainings</th>
                              <th style={thStyle()}>Certification</th>
                              <th style={thStyle(true)}>Test AI for QE<div style={{ fontSize: 9, fontWeight: 700, opacity: 0.7 }}>(Zense.AI QI)</div></th>
                              <th style={thStyle(true)}>Test QE for AI<div style={{ fontSize: 9, fontWeight: 700, opacity: 0.7 }}>(AssureAI)</div></th>
                              <th style={thStyle(true)}>Test Automation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(m => {
                              const emp = m.emp;
                              const rowKey = String(emp.id);
                              const certOpen = !!sgCertOpen[rowKey];
                              const shownCerts = certOpen ? m.certNames : m.certNames.slice(0, 2);
                              const trainOpen = !!sgTrainOpen[rowKey];
                              const shownTrain = trainOpen ? m.trainingList : m.trainingList.slice(0, 2);
                              return (
                                <tr
                                  key={rowKey}
                                  onClick={() => handleOpenPreview(emp, 'Skill Group')}
                                  style={{ borderTop: `1px solid ${T.bdr}`, cursor: 'pointer' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <td style={{ ...cell, fontWeight: 700, color: T.sub, whiteSpace: 'nowrap' }}>{emp.zensar_id || emp.id}</td>
                                  <td style={{ ...cell, fontWeight: 800, whiteSpace: 'nowrap' }}>{emp.name}</td>
                                  <td style={cell}>
                                    {m.domain
                                      ? <span title={QE_DOMAIN_LABEL[m.domain]} style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>{m.domain}</span>
                                      : <span style={{ color: T.muted }}>—</span>}
                                  </td>
                                  <td style={{ ...cell, fontWeight: 700, minWidth: 150 }}>{m.skillGroup || '—'}</td>
                                  <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{m.experience || '—'}</td>
                                  <td style={{ ...cell, minWidth: 200 }} onClick={e => e.stopPropagation()}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {([
                                        { key: 'primarySkill' as const, val: m.primarySkill, ph: '— Primary skill —', dot: '#06B6D4' },
                                        { key: 'secondarySkill' as const, val: m.secondarySkill, ph: '— Secondary skill —', dot: '#8B5CF6' },
                                      ]).map(f => (
                                        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ width: 7, height: 7, borderRadius: 999, background: f.dot, flexShrink: 0 }} />
                                          <select
                                            value={m.skillOptions.includes(f.val) ? f.val : ''}
                                            onChange={e => { setQEOverride(skillKey, { [f.key]: e.target.value }); setQeTick(t => t + 1); }}
                                            style={{ flex: 1, padding: '6px 8px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: f.val ? T.text : T.muted, fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                                          >
                                            <option value="">{f.ph}</option>
                                            {f.val && !m.skillOptions.includes(f.val) && <option value={f.val}>{f.val}</option>}
                                            {m.skillOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
                                          </select>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                  <td style={{ ...cell, minWidth: 150 }}>
                                    {m.trainingList.length === 0 ? <span style={{ color: T.muted }}>—</span> : (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                        {shownTrain.map((tname: string, i: number) => (
                                          <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}>{tname}</span>
                                        ))}
                                        {m.trainingList.length > 2 && (
                                          <button onClick={e => { e.stopPropagation(); setSgTrainOpen(s => ({ ...s, [rowKey]: !trainOpen })); }} style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                                            {trainOpen ? 'Show less' : `+${m.trainingList.length - 2} more`}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ ...cell, minWidth: 150 }}>
                                    {m.certNames.length === 0 ? <span style={{ color: T.muted }}>—</span> : (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                        {shownCerts.map((c: string, i: number) => (
                                          <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>{c}</span>
                                        ))}
                                        {m.certNames.length > 2 && (
                                          <button onClick={e => { e.stopPropagation(); setSgCertOpen(s => ({ ...s, [rowKey]: !certOpen })); }} style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                                            {certOpen ? 'Show less' : `+${m.certNames.length - 2} more`}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  {([
                                    { key: 'aiForQe' as const, on: m.flags.aiForQe },
                                    { key: 'qeForAi' as const, on: m.flags.qeForAi },
                                    { key: 'testAutomation' as const, on: m.flags.testAutomation },
                                  ]).map(f => (
                                    <td key={f.key} style={{ ...cell, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                      <span
                                        title={completions ? (f.on ? 'Course completed (from uploaded log)' : 'No matching completed course') : 'Upload a completion Excel to set this'}
                                        style={{ display: 'inline-block', fontSize: 11, fontWeight: 900, padding: '4px 12px', borderRadius: 999, background: f.on ? 'rgba(16,185,129,0.14)' : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'), color: f.on ? '#10B981' : T.muted }}
                                      >{f.on ? 'YES' : 'NO'}</span>
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </div>
      </div>

      {/* Modal Popup for Intelligence Audit */}
      {previewUser && (
        <div style={{ position: 'fixed', inset: 0, background: dark ? 'rgba(10,10,18,0.9)' : 'rgba(229,229,229,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2vh 2vw' }}>
          <div style={{ background: T.bg, borderRadius: '24px', width: '100%', maxWidth: 1300, height: '96vh', overflow: 'hidden', border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
            
            {/* Modal Top Bar */}
            <div style={{ padding: '16px 4vw', borderBottom: `1px solid ${T.bdr}`, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', background: T.card }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewUser.name}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.sub, textTransform: 'uppercase', opacity: 0.6 }}>{previewUser.zensar_id || previewUser.id}</span>
               </div>
               
               <div style={{ display: 'flex', gap: 6, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 12, overflowX: 'auto', flex: 1, minWidth: 200, WebkitOverflowScrolling: 'touch' }}>
                {(['ZenRadar', 'Skill Group', 'ZenScan', 'ZenMatrix', 'QI SL ZenMatrix', 'ZenCode', 'My Education', 'My Projects', 'My Certification', 'My Achievements', 'ZenProfile'] as const).map(tab => (
                   <button 
                     key={tab} 
                     onClick={() => setPopupActiveTab(tab)}
                     style={{
                        padding: '8px 14px', borderRadius: 10, border: 'none', 
                        background: popupActiveTab === tab ? '#3B82F6' : 'transparent',
                        color: popupActiveTab === tab ? '#fff' : T.sub,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.2s',
                        whiteSpace: 'nowrap'
                     }}
                   >
                     {tab}
                   </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                 <button 
                  onClick={() => setDeleteConfirming(!deleteConfirming)}
                  style={{ 
                    width: 40, height: 40, borderRadius: 14, 
                    background: deleteConfirming ? '#EF4444' : (dark ? 'rgba(239,68,68,0.1)' : '#FEF2F2'), 
                    border: `1px solid ${deleteConfirming ? '#EF4444' : 'rgba(239,68,68,0.2)'}`, 
                    color: deleteConfirming ? '#fff' : '#EF4444', 
                    cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                    transition: '0.2s'
                  }}
                  title="Delete Employee"
                 >
                   <Trash2 size={20}/>
                 </button>

                 <button onClick={() => { setPreviewUser(null); setPreviewData(null); setDeleteConfirming(false); }} style={{ width: 40, height: 40, borderRadius: 14, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                   <X size={24}/>
                 </button>
               </div>
             </div>

             {/* ── Inline Delete Confirmation ── */}
             {deleteConfirming && (
               <div style={{ 
                 margin: '0 40px 24px', padding: '16px 24px', 
                 background: 'rgba(239,68,68,0.08)', borderRadius: 20, 
                 border: '1px solid rgba(239,68,68,0.2)',
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                 animation: 'fadeIn 0.3s ease'
               }}>
                 <div>
                   <div style={{ fontSize: 13, fontWeight: 800, color: '#EF4444' }}>Terminate Record?</div>
                   <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>Warning: This will permanently delete <b>{previewUser.name}</b> and all associated skill records.</div>
                 </div>
                 <div style={{ display: 'flex', gap: 10 }}>
                   <button 
                     onClick={() => setDeleteConfirming(false)} 
                     style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                   >
                     Cancel
                   </button>
                   <button 
                     onClick={() => handleDeleteEmployee(previewUser.id, previewUser.name)} 
                     style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}
                   >
                     Yes, Purge Record
                   </button>
                 </div>
               </div>
             )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isPreviewLoading ? (
                 <div style={{ height: '100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 20 }}>
                    <RefreshCw size={40} color="#3B82F6" className="animate-spin" />
                    <div style={{ fontSize: 14, color: T.sub }}>Syncing Profile Data...</div>
                 </div>
              ) : (
                <AppContext.Provider value={{ 
                  data: previewData, 
                  isLoading: false, 
                  isPopup: true,
                    onTabChange: (path: any) => {
                      const tabMap: Record<string, 'ZenRadar' | 'ZenScan' | 'ZenMatrix' | 'ZenCode' | 'My Education' | 'My Projects' | 'My Certification' | 'My Achievements' | 'ZenProfile'> = {
                        '/employee/skills': 'ZenMatrix',
                        '/employee/github-intelligence': 'ZenCode',
                        '/employee/certifications': 'My Certification',
                        '/employee/projects': 'My Projects',
                        '/employee/education': 'My Education',
                        '/employee/resume-upload': 'ZenScan',
                        '/employee/achievements': 'My Achievements',
                        '/employee/personal-details': 'ZenProfile'
                      };
                      const p = typeof path === 'string' ? path : path?.path;
                      const tab = tabMap[p];
                      if (tab) setPopupActiveTab(tab);
                    },
                  setGlobalLoading: () => {}, 
                  reload: async () => {
                    try {
                      const d = await loadAppData(previewUser.id);
                      if (d) {
                        setPreviewData(d);
                        loadAllData();
                      } else {
                        toast.error('Failed to reload employee data');
                      }
                    } catch (err) {
                      toast.error('Failed to reload employee data');
                    }
                  }
                }}>
                  <div style={{ animation: 'fadeIn 0.4s' }}>
                    {popupActiveTab === 'Skill Group' && (() => {
                      const qe = resolveQEAssignment(previewUser);
                      const empId = previewUser.id ?? previewUser.zensar_id;
                      const groupSkills = essentialSkillsFor(qe.family, qe.group);
                      const matchedSet = new Set(qe.matchedSkills);
                      // Skill options offered when editing primary / secondary skill.
                      const ratedSkillNames = (previewUser.skills || [])
                        .map((sk: any) => sk?.skillName || sk?.skill_name || sk?.name)
                        .filter(Boolean);
                      const skillOptions = Array.from(new Set([
                        qe.primarySkill, qe.secondarySkill, ...groupSkills, ...qe.matchedSkills, ...ratedSkillNames,
                      ].filter(Boolean))).sort();
                      const certNames = (previewUser.certifications || [])
                        .map((c: any) => c.CertName || c.cert_name || c.certName || c.name || c.Name || c.title || c.Title || c.certification_name || (typeof c === 'string' ? c : ''))
                        .filter(Boolean);
                      const projectNames = (previewUser.projects || [])
                        .map((p: any) => p.ProjectName || p.project_name || p.name || p.Name || '')
                        .filter(Boolean);
                      const Flag = ({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) => (
                        <button onClick={onToggle} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '14px 18px', borderRadius: 14, cursor: 'pointer', minWidth: 200, flex: 1,
                          background: on ? 'rgba(16,185,129,0.12)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                          border: `1px solid ${on ? 'rgba(16,185,129,0.4)' : T.bdr}`,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{label}</span>
                          <span style={{
                            fontSize: 12, fontWeight: 900, padding: '4px 12px', borderRadius: 999,
                            background: on ? '#10B981' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                            color: on ? '#fff' : T.sub,
                          }}>{on ? 'YES' : 'NO'}</span>
                        </button>
                      );
                      return (
                        <div style={{ padding: '20px 4vw 40px' }}>
                          <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.bdr}`, padding: 'min(28px, 5vw)' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#06B6D4,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                  <Layers size={22} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: T.text }}>Skill Group Classification</div>
                                  <div style={{ fontSize: 12, color: T.sub }}>QE skill-family classification {qe.isOverridden ? '· admin override active' : '· auto-derived'}</div>
                                </div>
                              </div>
                              {qe.isOverridden && (
                                <button onClick={() => { clearQEOverride(empId); setQeTick(t => t + 1); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                  <RotateCcw size={14} /> Reset to auto
                                </button>
                              )}
                            </div>

                            {/* Identity */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
                              {[
                                { label: 'Name', value: previewUser.name || '—' },
                                { label: 'ID', value: empId || '—' },
                              ].map(f => (
                                <div key={f.label} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '12px 16px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted }}>{f.label}</div>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginTop: 4 }}>{f.value}</div>
                                </div>
                              ))}
                            </div>

                            {/* Family + Skill Group (editable) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 6 }}>Skill Family</div>
                                <select
                                  value={qe.family}
                                  onChange={e => { const fam = e.target.value; setQEOverride(empId, { family: fam, group: groupsForFamily(fam)[0] }); setQeTick(t => t + 1); }}
                                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 700, outline: 'none' }}
                                >
                                  {!QE_FAMILIES.includes(qe.family) && <option value={qe.family}>{qe.family}</option>}
                                  {QE_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 6 }}>Skill Group</div>
                                <select
                                  value={qe.group}
                                  onChange={e => { setQEOverride(empId, { group: e.target.value }); setQeTick(t => t + 1); }}
                                  disabled={!QE_FAMILIES.includes(qe.family)}
                                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 700, outline: 'none' }}
                                >
                                  {!groupsForFamily(qe.family).includes(qe.group) && <option value={qe.group}>{qe.group}</option>}
                                  {groupsForFamily(qe.family).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                            </div>

                            {/* Primary + Secondary skill (editable) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
                              {([
                                { key: 'primarySkill' as const, label: 'Primary Skill', val: qe.primarySkill },
                                { key: 'secondarySkill' as const, label: 'Secondary Skill', val: qe.secondarySkill },
                              ]).map(f => (
                                <div key={f.key}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 6 }}>{f.label}</div>
                                  <select
                                    value={skillOptions.includes(f.val) ? f.val : ''}
                                    onChange={e => { setQEOverride(empId, { [f.key]: e.target.value }); setQeTick(t => t + 1); }}
                                    style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: f.val ? T.text : T.muted, fontSize: 13, fontWeight: 700, outline: 'none' }}
                                  >
                                    <option value="">— Select {f.label.toLowerCase()} —</option>
                                    {f.val && !skillOptions.includes(f.val) && <option value={f.val}>{f.val}</option>}
                                    {skillOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              ))}
                            </div>

                            {/* Flags */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
                              <Flag on={qe.aiForQe} label="Test AI for QE · Zense.AI QI" onToggle={() => { setQEOverride(empId, { aiForQe: !qe.aiForQe }); setQeTick(t => t + 1); }} />
                              <Flag on={qe.qeForAi} label="Test QE for AI · AssureAI" onToggle={() => { setQEOverride(empId, { qeForAi: !qe.qeForAi }); setQeTick(t => t + 1); }} />
                              <Flag on={qe.testAutomation} label="Test Automation" onToggle={() => { setQEOverride(empId, { testAutomation: !qe.testAutomation }); setQeTick(t => t + 1); }} />
                            </div>

                            {/* Group skills */}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 10 }}>
                                Essential Skills · {qe.group}{groupSkills.length ? ` (${matchedSet.size}/${groupSkills.length} matched)` : ''}
                              </div>
                              {groupSkills.length === 0 ? (
                                <div style={{ fontSize: 13, color: T.sub }}>No essential skills mapped for this group.</div>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {groupSkills.map(sk => {
                                    const hit = matchedSet.has(sk);
                                    return (
                                      <span key={sk} style={{
                                        fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999,
                                        background: hit ? 'rgba(6,182,212,0.12)' : T.bg,
                                        border: `1px solid ${hit ? 'rgba(6,182,212,0.4)' : T.bdr}`,
                                        color: hit ? '#06B6D4' : T.sub,
                                      }}>{hit ? '✓ ' : ''}{sk}</span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* ── Person details (full profile) ── */}
                            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.bdr}` }}>
                              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 12 }}>Person Details</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                {[
                                  { label: '📧 Email', value: previewUser.email },
                                  { label: '📱 Phone', value: previewUser.phone },
                                  { label: '📍 Location', value: previewUser.location },
                                  { label: '💼 Designation', value: previewUser.designation || previewUser.Designation },
                                  { label: '🏢 Department', value: previewUser.department },
                                  { label: '🎯 Domain', value: previewUser.primary_domain || previewData?.user?.primaryDomain },
                                  { label: '💼 Years in IT', value: previewUser.years_it ? `${previewUser.years_it} yrs` : '' },
                                  { label: '🏷️ Years@Zensar', value: previewUser.years_zensar ? `${previewUser.years_zensar} yrs` : '' },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '10px 14px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4, wordBreak: 'break-word' }}>{value || '—'}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Rated skills */}
                              {ratedSkillNames.length > 0 && (
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 8 }}>🧩 Skills ({ratedSkillNames.length})</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {ratedSkillNames.map((s: string, i: number) => (
                                      <span key={i} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Certifications */}
                              {certNames.length > 0 && (
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 8 }}>🏅 Certifications ({certNames.length})</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {certNames.map((c: string, i: number) => (
                                      <span key={i} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>{c}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Projects */}
                              {projectNames.length > 0 && (
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 8 }}>🚀 Projects ({projectNames.length})</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {projectNames.map((p: string, i: number) => (
                                      <span key={i} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>{p}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Education */}
                              {previewData?.education && previewData.education.length > 0 && (
                                <div style={{ marginTop: 18 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted, marginBottom: 8 }}>🎓 Education</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {previewData.education.map((ed: any, i: number) => (
                                      <div key={i} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
                                        <div style={{ fontWeight: 800, color: T.text }}>{ed.degree || ed.Degree || ed.course || '—'}</div>
                                        <div style={{ color: T.sub, marginTop: 2 }}>{ed.institution || ed.college || ed.College || '—'}{ed.year || ed.Year ? ` · ${ed.year || ed.Year}` : ''}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {popupActiveTab === 'ZenRadar' && (
                      <div>
                        {/* ── Full Profile Summary Card ── */}
                        <div style={{ padding: '20px 4vw 0' }}>
                          <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.bdr}`, padding: 'min(24px, 5vw)', marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
                              {/* Left: Identity */}
                              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                                <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                                  {(previewUser.name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{previewUser.name || '—'}</div>
                                  <div style={{ fontSize: 13, color: '#3B82F6', fontWeight: 700, marginTop: 2 }}>{previewUser.designation || previewUser.Designation || '—'}</div>
                                  <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>ID: <b style={{color:T.text}}>{previewUser.zensar_id || previewUser.id}</b> &nbsp;|&nbsp; {previewUser.department || '—'}</div>
                                </div>
                              </div>
                              {/* Right: Stats */}
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                {[
                                  { l: 'Completion', v: `${previewUser.completion ?? 0}%`, c: '#10B981' },
                                  { l: 'Skills', v: (previewUser.skills?.filter((s:any)=>s.selfRating>0).length ?? 0), c: '#3B82F6' },
                                  { l: 'Certs', v: previewUser.certifications?.length ?? 0, c: '#8B5CF6' },
                                  { l: 'Projects', v: previewUser.projects?.length ?? 0, c: '#F59E0B' },
                                ].map(s => (
                                  <div key={s.l} style={{ textAlign: 'center', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '10px 12px', flex: '1 1 100px', maxWidth: 140 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.sub, textTransform: 'uppercase', marginTop: 2 }}>{s.l}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.bdr}` }}>
                              {[
                                { label: '📧 Email',         value: previewUser.email },
                                { label: '📱 Phone',         value: previewUser.phone },
                                { label: '📍 Location',      value: previewUser.location },
                                { label: '🏢 Department',    value: previewUser.department },
                                { label: '💼 Years in IT',   value: previewUser.years_it ? `${previewUser.years_it} yrs` : '—' },
                                { label: '🏷️ Years@Zensar',  value: previewUser.years_zensar ? `${previewUser.years_zensar} yrs` : '—' },
                                { label: '⭐ Primary Skill', value: previewUser.primary_skill || previewData?.user?.primarySkill || '—' },
                                { label: '🎯 Domain',        value: previewUser.primary_domain || previewData?.user?.primaryDomain || '—' },
                                { label: '📚 Education',     value: `${previewData?.education?.length ?? 0} record(s)` },
                                { label: '✅ Validated',     value: previewUser.submitted ? 'Yes' : 'No' },
                                { label: '🗓️ Joined',        value: previewUser.created_at ? new Date(previewUser.created_at).toLocaleDateString('en-IN') : '—' },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 10, padding: '10px 14px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4, wordBreak: 'break-all' }}>{value || '—'}</div>
                                </div>
                              ))}
                            </div>

                            {/* Education records if any */}
                            {previewData?.education && previewData.education.length > 0 && (
                              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 10 }}>🎓 Education</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  {previewData.education.map((ed: any, i: number) => (
                                    <div key={i} style={{ background: dark ? 'rgba(59,130,246,0.08)' : '#eff6ff', borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
                                      <div style={{ fontWeight: 800, color: T.text }}>{ed.degree || ed.Degree || ed.course || '—'}</div>
                                      <div style={{ color: T.sub, marginTop: 2 }}>{ed.institution || ed.college || ed.College || '—'} {ed.year || ed.Year ? `· ${ed.year || ed.Year}` : ''}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Certifications preview */}
                            {previewUser.certifications?.length > 0 && (
                              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 10 }}>🏅 Certifications ({previewUser.certifications.length})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {previewUser.certifications.slice(0, 6).map((c: any, i: number) => (
                                    <span key={i} style={{ background: dark ? 'rgba(139,92,246,0.12)' : '#f5f3ff', color: '#8B5CF6', borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700 }}>
                                      {c.CertName || c.cert_name || c.name || '—'}
                                    </span>
                                  ))}
                                  {previewUser.certifications.length > 6 && <span style={{ fontSize: 11, color: T.sub, padding: '4px 8px' }}>+{previewUser.certifications.length - 6} more</span>}
                                </div>
                              </div>
                            )}

                            {/* Projects preview */}
                            {previewUser.projects?.length > 0 && (
                              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 10 }}>🚀 Projects ({previewUser.projects.length})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {previewUser.projects.slice(0, 5).map((p: any, i: number) => (
                                    <span key={i} style={{ background: dark ? 'rgba(245,158,11,0.1)' : '#fffbeb', color: '#F59E0B', borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700 }}>
                                      {p.ProjectName || p.project_name || p.name || '—'}
                                    </span>
                                  ))}
                                  {previewUser.projects.length > 5 && <span style={{ fontSize: 11, color: T.sub, padding: '4px 8px' }}>+{previewUser.projects.length - 5} more</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <EmployeeDashboard key="dashboard" isPopup={true} overrideData={previewData!} onTabChange={(path: any) => {
                           const tabMap: Record<string, 'ZenRadar' | 'ZenScan' | 'ZenMatrix' | 'ZenCode' | 'My Education' | 'My Projects' | 'My Certification' | 'My Achievements' | 'ZenProfile'> = {
                            '/employee/skills': 'ZenMatrix',
                            '/employee/github-intelligence': 'ZenCode',
                            '/employee/certifications': 'My Certification',
                            '/employee/projects': 'My Projects',
                            '/employee/education': 'My Education',
                            '/employee/resume-upload': 'ZenScan',
                            '/employee/achievements': 'My Achievements',
                            '/employee/personal-details': 'ZenProfile'
                          };
                          const tab = tabMap[typeof path === 'string' ? path : path?.path];
                          if (tab) setPopupActiveTab(tab);
                        }} />
                      </div>
                    )}

                    {popupActiveTab === 'ZenMatrix' && <SkillMatrixPage key="skills" isPopup={true} />}
                    {popupActiveTab === 'QI SL ZenMatrix' && <QislZenMatrixPage key="qisl-skills" isPopup={true} employeeId={previewUser.id} />}
                    {popupActiveTab === 'ZenCode' && <GitHubIntelligencePage key="zencode" isPopup={true} readOnly={true} employeeId={previewUser.id} />}
                    {popupActiveTab === 'My Certification' && <CertificationsPage key="certs" isPopup={true} />}
                    {popupActiveTab === 'My Projects' && <ProjectsPage key="projects" isPopup={true} />}
                    {popupActiveTab === 'My Education' && <EducationPage key="education" isPopup={true} />}
                    {popupActiveTab === 'My Achievements' && <AchievementsPage key="achievements" isPopup={true} />}
                                        {popupActiveTab === 'ZenScan' && (
                      <AdminResumeUploadPage 
                        key="resume" 
                        employeeId={previewUser.id} 
                        employeeName={previewUser.name} 
                        existingData={{
                          skills: previewData
                            ? Object.entries(previewData.ratings || {})
                                .filter(([, rating]) => (rating as number) > 0)
                                .map(([name, rating]) => ({
                                  skillId: name,
                                  selfRating: rating as any,
                                  managerRating: null,
                                  validated: false
                                }))
                            : (previewUser?.skills || []).filter((s: any) => s.selfRating > 0),
                          projects: previewData?.projects || previewUser?.projects || [],
                          certifications: previewData?.certifications || previewUser?.certifications || [],
                          education: previewData?.education || [],
                          profile: previewData?.user || previewUser
                        }}
                        onClose={() => setPopupActiveTab('ZenRadar')}
                        onSuccess={() => {
                          loadAppData(previewUser.id)
                            .then(data => {
                              if (data) {
                                setPreviewData(data);
                              } else {
                                toast.warning('Data saved but preview refresh failed. Please reopen the preview.');
                              }
                            })
                            .catch(() => {
                              toast.warning('Data saved but could not refresh preview. Please reopen the preview.');
                            });
                          setPopupActiveTab('ZenRadar');
                        }}
                      />
                    )}
                    
                    {popupActiveTab === 'ZenProfile' && (
                      <div style={{ padding: window.innerWidth < 600 ? 16 : 40, maxWidth: 800, margin: '0 auto' }}>
                         <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: window.innerWidth < 600 ? 20 : 32 }}>
                            <Shield size={24} color="#3B82F6" />
                            <h2 style={{ fontSize: window.innerWidth < 600 ? 18 : 22, fontWeight: 700, margin: 0, color: T.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Personal Details</h2>
                         </div>

                         <div style={{ display:'grid', gridTemplateColumns: window.innerWidth < 600 ? '1fr' : '1fr 1fr', gap: 16 }}>
                            <div style={{ gridColumn: window.innerWidth < 600 ? '1' : 'span 2' }}>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Full Name</label>
                               <input value={editForm.name} onChange={e=>setEditForm({...editForm, name:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14, boxSizing:'border-box' as const }} />
                            </div>
                            
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Zensar ID</label>
                               <input value={editForm.zensar_id} onChange={e=>setEditForm({...editForm, zensar_id:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Designation</label>
                               <input value={editForm.designation} onChange={e=>setEditForm({...editForm, designation:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Department</label>
                               <input value={editForm.department} onChange={e=>setEditForm({...editForm, department:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Location</label>
                               <input value={editForm.location} onChange={e=>setEditForm({...editForm, location:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Email</label>
                               <input value={editForm.email} onChange={e=>setEditForm({...editForm, email:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Phone</label>
                               <input value={editForm.phone} onChange={e=>setEditForm({...editForm, phone:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Years IT Exp</label>
                               <input type="number" value={editForm.years_it} onChange={e=>setEditForm({...editForm, years_it: parseInt(e.target.value)||0})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Years Zensar Exp</label>
                               <input type="number" value={editForm.years_zensar} onChange={e=>setEditForm({...editForm, years_zensar: parseInt(e.target.value)||0})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Primary Skill</label>
                               <input value={editForm.primary_skill} onChange={e=>setEditForm({...editForm, primary_skill:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Primary Domain</label>
                               <input value={editForm.primary_domain} onChange={e=>setEditForm({...editForm, primary_domain:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div style={{ gridColumn: window.innerWidth < 600 ? '1' : 'span 2' }}>
                               <label style={{ fontSize: 11, fontWeight: 800, color: '#EF4444', textTransform:'uppercase' }}>Password</label>
                               <div style={{ position:'relative', marginTop:6 }}>
                                  <Lock size={16} style={{ position:'absolute', left:14, top:16, color:'#EF4444' }} />
                                  <input type="text" value={editForm.password} onChange={e=>setEditForm({...editForm, password:e.target.value})} style={{ width:'100%', background: dark ? 'rgba(239,68,68,0.05)' : '#FEF2F2', border:'1px solid rgba(239,68,68,0.2)', padding:'14px 14px 14px 42px', borderRadius:10, color:T.text, fontSize:14, boxSizing:'border-box' as const }} />
                               </div>
                            </div>

                            <div style={{ gridColumn: window.innerWidth < 600 ? '1' : 'span 2', marginTop: 20 }}>
                               <button onClick={handleUpdateDetails} style={{ width:'100%', padding:'16px', borderRadius:12, background:'#3B82F6', border:'none', color:'#fff', fontWeight:800, fontSize:15, cursor:'pointer' }}>Update Personal Details</button>
                            </div>
                         </div>
                      </div>
                    )}
                  </div>
                </AppContext.Provider>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Employee Modal */}
      {/* Bulk delete confirmation modal */}
      {showBulkDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: dark ? 'rgba(15,15,26,0.9)' : 'rgba(245,245,245,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2100, padding: 20
        }}>
          <div style={{
            background: dark ? '#1a1b2e' : '#ffffff', borderRadius: 24, width: '100%', maxWidth: 480,
            border: `1px solid ${T.bdr}`, boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
            maxHeight: '90vh', overflowY: 'auto', padding: 28
          }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: T.text }}>Delete Employees</h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: T.sub }}>
              You are about to delete {selectedIds.size} employee{selectedIds.size > 1 ? 's' : ''}:
            </p>
            <div style={{ maxHeight: 220, overflowY: 'auto', background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>
              {employees.filter((e: any) => selectedIds.has(String(e.id))).map((e: any) => (
                <div key={e.id} style={{ fontSize: 13, color: T.text, padding: '4px 0' }}>
                  • {e.name} <span style={{ color: T.muted }}>({e.zensar_id || e.id})</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#EF4444', fontWeight: 600 }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={bulkDeleting}
                style={{ padding: '10px 20px', borderRadius: 10, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13, fontWeight: 700, cursor: bulkDeleting ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: '#EF4444', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: bulkDeleting ? 'not-allowed' : 'pointer', opacity: bulkDeleting ? 0.7 : 1 }}
              >
                <Trash2 size={14} /> {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Employee${selectedIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Zensar ID modal (for auto-imported employees without a real ID) */}
      <Modal open={!!zidModalEmp} onClose={() => { if (!zidSaving) { setZidModalEmp(null); setZidInput(''); } }} maxWidth={440} label="Set Zensar ID">
        <div style={{ padding: 28 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: T.text }}>Set Zensar ID</h2>
          <p style={{ margin: '0 0 4px', fontSize: 14, color: T.sub }}>
            {zidModalEmp?.name} currently has an auto-generated ID <strong style={{ color: T.text }}>{zidModalEmp?.zensar_id || zidModalEmp?.id}</strong>.
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: T.muted }}>Enter the employee's real Zensar ID (5 or 6 digits). This button disappears once it is set.</p>
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            value={zidInput}
            disabled={zidSaving}
            onChange={e => setZidInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter') handleSetZensarId(); }}
            placeholder="e.g. 654321"
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 15, fontWeight: 700, letterSpacing: 1, marginBottom: 20 }}
          />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setZidModalEmp(null); setZidInput(''); }}
              disabled={zidSaving}
              style={{ padding: '10px 20px', borderRadius: 10, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13, fontWeight: 700, cursor: zidSaving ? 'not-allowed' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSetZensarId}
              disabled={zidSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: '#3B82F6', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: zidSaving ? 'not-allowed' : 'pointer', opacity: zidSaving ? 0.7 : 1 }}
            >
              <CheckCircle2 size={14} /> {zidSaving ? 'Saving...' : 'Save Zensar ID'}
            </button>
          </div>
        </div>
      </Modal>

      {showAddEmployeeModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: dark ? 'rgba(15,15,26,0.9)' : 'rgba(245,245,245,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, padding: 20
        }}>
          <div style={{
            background: dark ? '#1a1b2e' : '#ffffff', borderRadius: 24, width: '100%', maxWidth: 560,
            border: `1px solid ${T.bdr}`,
            boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '24px 28px 20px',
              borderBottom: `1px solid ${T.bdr}`
            }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: 0 }}>Add New Employee</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: T.sub }}>Fill in the details to create a Zensar employee account</p>
              </div>
              <button onClick={() => { setShowAddEmployeeModal(false); setResumeScanned(false); setEmailWarningConfirmed(false); setShowEmployeeDetails(false); setShowResumeUploadPage(false); setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' }); setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] }); setRawExtractedData(null); }} style={{ background: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', border: 'none', color: T.text, cursor: 'pointer', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px 28px 28px' }}>

              {/* ── RESUME UPLOAD SCANNER ── */}
              <div
                onClick={() => !resumeScanLoading && resumeFileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleResumeScan(f);
                }}
                style={{
                  border: `2px dashed ${resumeScanned ? '#10B981' : '#3B82F6'}`,
                  borderRadius: 16,
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: resumeScanLoading ? 'wait' : 'pointer',
                  background: resumeScanned
                    ? (dark ? 'rgba(16,185,129,0.08)' : '#f0fdf4')
                    : (dark ? 'rgba(59,130,246,0.06)' : '#eff6ff'),
                  marginBottom: 20,
                  transition: 'all 0.2s'
                }}
              >
                <input
                  ref={resumeFileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeScan(f); }}
                />
                {resumeScanLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <RefreshCw size={28} className="animate-spin" style={{ color: '#3B82F6' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#3B82F6' }}>AI Scanning Resume...</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Extracting name, phone, skills & more</div>
                  </div>
                ) : resumeScanned ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={28} style={{ color: '#10B981' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>Resume Scanned Successfully!</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Form auto-filled ↓ — review & complete missing fields</div>
                    <button onClick={e => { e.stopPropagation(); resumeFileRef.current?.click(); }} style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 2 }}>Upload different resume</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileUp size={24} style={{ color: '#3B82F6' }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6' }}>Upload Resume to Auto-Fill</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Drag & drop or click — PDF, DOC, TXT supported</div>
                    <div style={{ fontSize: 10, color: T.sub, background: dark ? 'rgba(59,130,246,0.08)' : '#dbeafe', padding: '3px 10px', borderRadius: 99, marginTop: 2 }}>
                      <Sparkles size={10} style={{ display: 'inline', marginRight: 4 }} />
                      AI extracts: Name · Phone · Email · Designation · Location · Experience
                    </div>
                  </div>
                )}
              </div>

              {(() => {
                const inp = (label: string, key: keyof typeof newEmployee, opts: any = {}) => (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: opts.required ? T.text : T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                      {label}{opts.required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
                    </label>
                    <input
                      type={opts.type || 'text'}
                      value={newEmployee[key]}
                      onChange={e => setNewEmployee({ ...newEmployee, [key]: e.target.value })}
                      placeholder={opts.placeholder || ''}
                      maxLength={opts.maxLength}
                      style={{
                        width: '100%', padding: '13px 16px', borderRadius: 12,
                        border: `1.5px solid ${T.bdr}`,
                        background: T.input, color: T.text, fontSize: 14,
                        outline: 'none', boxSizing: 'border-box' as const,
                        fontFamily: 'inherit'
                      }}
                    />
                    {opts.hint && <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{opts.hint}</div>}
                  </div>
                );
                return (
                  <>
                    {/* ROW 1: Zensar ID */}
                    {inp('Zensar ID', 'employeeId', { required: true, placeholder: '5 or 6 digit ID e.g. 64316', maxLength: 6, hint: '5 or 6 digit Zensar ID' })}

                    {/* ROW 2: Full Name */}
                    {inp('Full Name', 'name', { required: true, placeholder: 'e.g. Rahul Sharma' })}

                    {/* ROW 3: Mobile */}
                    {inp('Mobile Number', 'phone', { required: false, placeholder: '+91 98765 43210', type: 'tel' })}

                    {/* ROW 4: Email */}
                    {inp('Email', 'email', { required: true, placeholder: 'rahul@zensar.com or rahul@gmail.com', type: 'email', hint: 'Any valid email accepted (zensar.com, gmail.com, etc.)' })}

                    {/* ROW 5: Designation + Department (2-col) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Designation</label>
                        <input value={newEmployee.designation} onChange={e => setNewEmployee({ ...newEmployee, designation: e.target.value })} placeholder="QA Engineer" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Department</label>
                        <input value={newEmployee.department} onChange={e => setNewEmployee({ ...newEmployee, department: e.target.value })} placeholder="Quality Intelligence" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    </div>

                    {/* ROW 6: Location */}
                    {inp('Location', 'location', { placeholder: 'Pune, Maharashtra' })}

                    {/* ROW 7: Years IT + Years Zensar (2-col) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Years in IT</label>
                        <input type="number" min="0" max="40" value={newEmployee.yearsIT} onChange={e => setNewEmployee({ ...newEmployee, yearsIT: e.target.value })} placeholder="e.g. 5" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Years at Zensar</label>
                        <input type="number" min="0" max="40" value={newEmployee.yearsZensar} onChange={e => setNewEmployee({ ...newEmployee, yearsZensar: e.target.value })} placeholder="e.g. 2" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: `1px solid ${T.bdr}`, margin: '8px 0 20px', position: 'relative' }}>
                      <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: dark ? '#1a1b2e' : '#ffffff', padding: '0 10px', fontSize: 11, color: T.sub, fontWeight: 600 }}>Security</span>
                    </div>

                    {/* ROW 8: Password */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Password<span style={{ color: '#EF4444', marginLeft: 3 }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
                        <input type="password" value={newEmployee.password} onChange={e => setNewEmployee({ ...newEmployee, password: e.target.value })} placeholder="Min 6 characters" style={{ width: '100%', padding: '13px 16px 13px 40px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    </div>

                    {/* ROW 9: Confirm Password */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Confirm Password<span style={{ color: '#EF4444', marginLeft: 3 }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <Shield size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: newEmployee.confirmPassword && newEmployee.confirmPassword === newEmployee.password ? '#10B981' : '#6B7280' }} />
                        <input type="password" value={newEmployee.confirmPassword} onChange={e => setNewEmployee({ ...newEmployee, confirmPassword: e.target.value })} placeholder="Repeat password" style={{ width: '100%', padding: '13px 16px 13px 40px', borderRadius: 12, border: `1.5px solid ${newEmployee.confirmPassword ? (newEmployee.confirmPassword === newEmployee.password ? '#10B981' : '#EF4444') : T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      {newEmployee.confirmPassword && newEmployee.confirmPassword !== newEmployee.password && (
                        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>⚠ Passwords do not match</div>
                      )}
                      {newEmployee.confirmPassword && newEmployee.confirmPassword === newEmployee.password && (
                        <div style={{ fontSize: 11, color: '#10B981', marginTop: 4 }}>✅ Passwords match</div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* ── Inline Email Warning Banner ── */}
              {emailWarningConfirmed && (
                <div style={{
                  marginTop: 16, padding: '14px 16px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 12,
                  display: 'flex', alignItems: 'flex-start', gap: 12
                }}>
                  <Info size={20} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6' }}>External Email Detected</div>
                      <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>
                        <b style={{ color: T.text }}>{newEmployee.email}</b> is an external email.<br />
                        You can still proceed with creating this account.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setEmailWarningConfirmed(false)}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'none', color: '#F59E0B', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                    >
                      ✏️ Change Email
                    </button>
                    <button
                      onClick={() => handleAddEmployee(false, true)}
                      style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}
                    >
                      ✅ Yes, Create Anyway
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', pointerEvents: 'auto' }}>
                <button
                  onClick={() => { setShowAddEmployeeModal(false); setResumeScanned(false); setEmailWarningConfirmed(false); setShowEmployeeDetails(false); setShowResumeUploadPage(false); setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' }); setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] }); setRawExtractedData(null); }}
                  style={{ flex: 1, padding: '14px', borderRadius: 12, border: `1px solid ${T.bdr}`, background: 'none', color: T.text, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancel
                </button>

                {resumeScanned && rawExtractedData && (
                  <button
                    onClick={() => {
                      setCreatedEmployeeId(newEmployee.employeeId);
                      setShowAddEmployeeModal(false);
                      setShowResumeUploadPage(true);
                    }}
                    disabled={!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || !(newEmployee.employeeId.length === 5 || newEmployee.employeeId.length === 6)}
                    style={{
                      flex: 2, padding: '14px', borderRadius: 12, border: `2px solid #3B82F6`,
                      background: dark ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: '#3B82F6', fontWeight: 800,
                      cursor: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || !(newEmployee.employeeId.length === 5 || newEmployee.employeeId.length === 6)) ? 'not-allowed' : 'pointer',
                      opacity: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || !(newEmployee.employeeId.length === 5 || newEmployee.employeeId.length === 6)) ? 0.5 : 1,
                      fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                  >
                    <Eye size={18} /> Show Details
                  </button>
                )}

                <button
                  onClick={() => handleAddEmployee(false)}
                  disabled={!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || !(newEmployee.employeeId.length === 5 || newEmployee.employeeId.length === 6)}
                  style={{
                    flex: 2, padding: '14px', borderRadius: 12, border: 'none',
                    background: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || !(newEmployee.employeeId.length === 5 || newEmployee.employeeId.length === 6)) ? '#9CA3AF' : 'linear-gradient(135deg, #10B981, #059669)',
                    color: '#fff', fontWeight: 800, cursor: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || !(newEmployee.employeeId.length === 5 || newEmployee.employeeId.length === 6)) ? 'not-allowed' : 'pointer', fontSize: 14,
                    boxShadow: '0 8px 24px rgba(16,185,129,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}
                >
                  <Plus size={18} /> Create Account
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Admin Resume Upload Page - Shows when clicking Show Details */}
      {showResumeUploadPage && (
        <AdminResumeUploadPage
          employeeId={createdEmployeeId}
          employeeName={newEmployee.name}
          existingData={{
            skills: [],
            projects: [],
            certifications: [],
            education: [],
            profile: {
              name: newEmployee.name,
              email: newEmployee.email,
              designation: newEmployee.designation,
              yearsIT: newEmployee.yearsIT,
              location: newEmployee.location,
              phone: newEmployee.phone
            }
          }}
          preExtractedData={rawExtractedData}
          onClose={() => {
            // Go back to the add employee form with all data intact
            setShowResumeUploadPage(false);
            setShowAddEmployeeModal(true);
          }}
          onSuccess={() => {
            // Employee was created and data saved inside AdminResumeUploadPage — just clean up
            setShowResumeUploadPage(false);
            setShowAddEmployeeModal(false);
            setResumeScanned(false);
            setEmailWarningConfirmed(false);
            setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' });
            setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] });
            setRawExtractedData(null);
            setActiveTab('Manage Employees');
            loadAllData();
            toast.success('Employee created and resume data saved!');
          }}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}; }
      `}</style>
    </div>
  );
}
