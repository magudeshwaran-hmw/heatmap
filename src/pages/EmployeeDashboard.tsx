/**
 * EmployeeDashboard.tsx — /employee/dashboard
 * First page employee sees after logging in or onboarding.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/lib/AppContext';
import { apiGetSkills, API_BASE } from '@/lib/api';
import { useDark, mkTheme } from '@/lib/themeContext';
import { Bot, Map, PenTool, LayoutDashboard, Award, Briefcase, FileText, GraduationCap, AlertTriangle, RefreshCw, Upload, ClipboardCheck, Github } from 'lucide-react';

import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS, RadialLinearScale, PointElement,
  LineElement, Filler, Tooltip, Legend, RadarController
} from 'chart.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, RadarController);

import { AppData, Certification, Project } from '@/lib/appStore';
import ZensarLoader from '@/components/ZensarLoader';

import { useAuth } from '@/lib/authContext';

export default function EmployeeDashboard({ 
  overrideData, 
  isPopup: propIsPopup, 
  onTabChange: propOnTabChange 
}: { 
  overrideData?: AppData; 
  isPopup?: boolean; 
  onTabChange?: (tab: any) => void; 
}) {
  const { role, employeeId } = useAuth();
  const navigate = useNavigate();

  // ── Verified ZenAssess badges — always fetched fresh from the DB on mount ──
  // (verified_badge_level only; never derived from self_rating or cache)
  const [verifiedSkillBadges, setVerifiedSkillBadges] = useState<{ skill: string; level: string; date?: string }[]>([]);
  const [openRoleMatches, setOpenRoleMatches] = useState<number | null>(null);
  const [benchmark, setBenchmark] = useState<number | null>(null);

  // Industry benchmark = average capability across all employees (best-effort)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/employees`);
        if (!res.ok) return;
        const json = await res.json();
        const emps = json.employees || [];
        const scores = emps
          .map((e: any) => Number(e.overall_capability ?? e.overallCapability ?? 0))
          .filter((n: number) => n > 0);
        if (scores.length >= 1) setBenchmark(Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length));
      } catch { /* benchmark unavailable — line hidden */ }
    })();
  }, []);
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      try {
        const skills = await apiGetSkills(employeeId);
        const verified = (skills || [])
          .map((s: any) => ({ skill: s.skillName || s.skill_name, level: s.verifiedBadgeLevel || s.verified_badge_level, date: s.lastValidationDate || s.last_validated_date }))
          .filter((s: any) => s.skill && s.level);
        setVerifiedSkillBadges(verified);
      } catch { /* no verified badges available — section stays empty */ }
    })();
  }, [employeeId]);

  // ── Open BFSI roles that match the employee's verified skills (best-effort) ──
  useEffect(() => {
    if (verifiedSkillBadges.length === 0) { setOpenRoleMatches(null); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/bfsi/roles`);
        if (!res.ok) return;
        const json = await res.json();
        const roles = json.roles || json || [];
        if (!Array.isArray(roles) || roles.length === 0) return;
        const names = verifiedSkillBadges.map(b => String(b.skill).toLowerCase()).filter(n => n.length >= 3);
        const matches = roles.filter((r: any) => {
          const blob = JSON.stringify(r || {}).toLowerCase();
          return names.some(n => blob.includes(n));
        }).length;
        setOpenRoleMatches(matches);
      } catch { /* ignore — section degrades gracefully */ }
    })();
  }, [verifiedSkillBadges]);

  const { dark } = useDark();
  const T = mkTheme(dark);
  const appContext = useApp();
  
  const data = overrideData || appContext.data;
  const isLoading = !overrideData && appContext.isLoading;
  const isPopup = propIsPopup !== undefined ? propIsPopup : appContext.isPopup;
  const onTabChange = propOnTabChange || appContext.onTabChange;

  if (isLoading) {
    return <ZensarLoader fullScreen label="Synchronizing Zensar IQ Cloud..." />;
  }
  
  // Handle admin users without employee data
  if (!data?.user && role === 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <LayoutDashboard size={40} />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: T.text, margin: 0 }}>Admin Dashboard Access</h2>
        <p style={{ color: T.sub, fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>
          You are logged in as an administrator. Employee dashboards require an employee session.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <button 
            onClick={() => navigate('/admin')}
            style={{ padding: '12px 24px', borderRadius: 12, background: '#3B82F6', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <LayoutDashboard size={18} /> Go to Admin Dashboard
          </button>
          <button 
            onClick={() => navigate('/login')}
            style={{ padding: '12px 24px', borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={18} /> Login as Employee
          </button>
        </div>
      </div>
    );
  }
  
  if (!data?.user) {
    // If inside popup, show simpler error with option to close popup
    if (isPopup) {
      return (
        <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <AlertTriangle size={40} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: 0 }}>Preview Data Unavailable</h2>
          <p style={{ color: T.sub, fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>Unable to load employee data. Please close this popup and try reopening the employee preview.</p>
          <button 
            onClick={() => {
              if (onTabChange) {
                onTabChange('/admin');
              }
            }}
            style={{ padding: '12px 24px', borderRadius: 12, background: '#3B82F6', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}
          >
            <RefreshCw size={18} /> Go Back
          </button>
        </div>
      );
    }
    // Main app error
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <AlertTriangle size={40} />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: T.text, margin: 0 }}>Profile Synchronization Required</h2>
        <p style={{ color: T.sub, fontSize: 14, maxWidth: 400, lineHeight: 1.6, textAlign: 'left' as const, display: 'inline-block' }}>
          We were unable to retrieve the latest workforce profile information.<br /><br />
          <strong>Possible Reasons:</strong><br />
          • Session expired<br />
          • Network interruption<br />
          • Synchronization service unavailable<br /><br />
          Please retry synchronization.
        </p>
        <button 
          onClick={() => {
            localStorage.removeItem('skill_nav_session_id');
            navigate('/login');
          }}
          style={{ padding: '12px 24px', borderRadius: 12, background: '#3B82F6', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}
        >
          <RefreshCw size={18} /> Retry Synchronization
        </button>
      </div>
    );
  }

  const { user, overallScore, completion, expertCount, expertSkills, gapCount, gapSkills, certifications, projects } = data;
  const categoryAverages = data.categoryAverages || {};
  const safeExpertSkills = expertSkills || [];
  const safeGapSkills = gapSkills || [];
  const safeCerts = certifications || [];
  const safeProjects = projects || [];

  const initials = (user.Name || 'Emp').substring(0,2).toUpperCase();

  // Derived identity fields for the compact profile card
  const zid = user.zensar_id || user.ZensarID || user.EmployeeID || user.id || 'N/A';
  const grade = user.grade || user.Grade || '—';
  const gradePath = (() => {
    const g = String(grade).toUpperCase();
    if (g.startsWith('F')) return 'Beginner';
    if (g.startsWith('E')) return 'Intermediate';
    if (g.startsWith('D') || g.startsWith('C')) return 'Expert';
    return '';
  })();

  const scoreLabel = 
    overallScore < 31 ? 'Building Foundation' :
    overallScore < 51 ? 'Developing' :
    overallScore < 71 ? 'Proficient' :
    overallScore < 86 ? 'Advanced' :
    overallScore < 96 ? 'Senior Ready' : 'Expert';

  const cardStyle = {
    background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  };

  const actionCard = {
    ...cardStyle, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
    padding: '30px 20px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' as const, gap: 10
  };

  const radarData = {
    labels: Object.keys(categoryAverages).map(c => c.substring(0,3)),
    datasets: [{
      label: 'Level',
      data: Object.values(categoryAverages),
      backgroundColor: 'rgba(59,130,246,0.2)',
      borderColor: '#3B82F6',
      borderWidth: 2,
    }]
  };
  const radarOptions = {
    scales: { r: { min: 0, max: 3, ticks: { display: false }, grid: { color: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }, pointLabels: { color: T.sub, font: { size: 10 } } } },
    plugins: { legend: { display: false } }, maintainAspectRatio: false
  };

  return (
    <>
      
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: 'clamp(12px,3vw,24px) clamp(12px,3vw,24px) 80px', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* TOP SECTION — Compact Profile Card */}
          <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(107,45,139,0.1), rgba(59,130,246,0.1))', border: `1px solid ${dark ? 'rgba(107,45,139,0.2)' : '#e5e7eb'}`, padding: '16px 20px' }}>
            {/* ROW 1 — thin identity bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6B2D8B, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.Name}
                  <span style={{ color: T.muted, fontWeight: 600 }}> · {user.designation || user.Designation || 'Quality Engineer'} · {zid}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', color: T.muted, fontWeight: 700, letterSpacing: '0.05em' }}>Score</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: T.text }}>{overallScore}</span>
                    <span style={{ fontSize: 11, color: T.muted }}>/100</span>
                  </div>
                </div>
                {(() => {
                  const evidenceSources = verifiedSkillBadges.length + safeCerts.length + safeProjects.length;
                  const trust = evidenceSources >= 6 ? { label: 'High', color: '#10B981' } : evidenceSources >= 3 ? { label: 'Medium', color: '#F59E0B' } : { label: 'Low', color: '#EF4444' };
                  return (
                    <div style={{ textAlign: 'right' }} title="Trust increases when you complete ZenAssess, verify certifications, and get manager validation.">
                      <div style={{ fontSize: 9, textTransform: 'uppercase', color: T.muted, fontWeight: 700, letterSpacing: '0.05em' }}>Trust</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: trust.color }}>{trust.label}</span>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: trust.color, boxShadow: `0 0 8px ${trust.color}` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ROW 2 — Department | Location | Grade+Path */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 16px', marginBottom: 10 }}>
              {[
                { label: 'Department', value: user.department || user.Department || 'Quality Engineering' },
                { label: 'Location',   value: user.location || user.Location || 'Remote / India' },
                { label: 'Grade · Path', value: gradePath ? `${grade} · ${gradePath}` : grade },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.muted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2 }}>{f.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, wordBreak: 'break-word' }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* ROW 3 — IT Experience | Zensar Tenure | Zensar ID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 16px', marginBottom: 14 }}>
              {[
                { label: 'IT Experience', value: `${user.years_it ?? user.yearsIT ?? user.YearsIT ?? '0'} Years` },
                { label: 'Zensar Tenure', value: `${user.years_zensar ?? user.yearsZensar ?? user.YearsZensar ?? '0'} Years` },
                { label: 'Zensar ID',     value: zid },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', color: T.muted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2 }}>{f.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, wordBreak: 'break-word' }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* ROW 4 — stat mini-cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.bdr}` }}>
              {[
                { label: 'Badges Earned', value: verifiedSkillBadges.length },
                { label: 'Completion',    value: `${completion}%` },
                { label: 'Certs',         value: safeCerts.length },
                { label: 'Projects',      value: safeProjects.length },
              ].map(s => (
                <div key={s.label} style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{s.value}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', color: T.muted, fontWeight: 700, letterSpacing: '0.05em', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>



          {/* SKILL DECAY WARNING — badge older than 12 months */}
          {(() => {
            const now = Date.now();
            const YEAR = 365 * 24 * 3600 * 1000;
            const old = verifiedSkillBadges
              .filter(b => b.date && (now - new Date(b.date).getTime()) > YEAR)
              .map(b => ({ ...b, months: Math.round((now - new Date(b.date!).getTime()) / (30 * 24 * 3600 * 1000)) }));
            if (old.length === 0) return null;
            const first = old[0];
            return (
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.text }}>
                  <AlertTriangle size={18} color="#F59E0B" />
                  <span>Your <strong>{first.skill}</strong> badge was earned {first.months} months ago{old.length > 1 ? ` (and ${old.length - 1} other${old.length > 2 ? 's' : ''} are ageing)` : ''}. Re-assess to keep your profile current.</span>
                </div>
                <button onClick={() => navigate('/employee/zenassess')} style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B', fontWeight: 800, fontSize: 12, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', flexShrink: 0 }}>Re-assess</button>
              </div>
            );
          })()}

          {/* MIDDLE SECTION — Personnel Hub Command Deck */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
             {[
               { label: 'ZenScan',              path: '/employee/resume-upload', icon: <Upload size={20}/>,        color: '#3B82F6', desc: 'AI reads your resume and maps every skill, cert and project — instantly.' },
               { label: 'ZenMatrix',             path: '/employee/skills',         icon: <PenTool size={20}/>,       color: '#8B5CF6', desc: 'Rate yourself. Let your manager confirm. Own your skill profile.' },
               { label: 'ZenAssess',             path: '/employee/zenassess',      icon: <ClipboardCheck size={20}/>, color: '#10B981', desc: 'Validate your skills. Earn verified badges.' },
               { label: 'ZenAlign',              path: '/employee/resume-builder', icon: <FileText size={20}/>,      color: '#ec4899', desc: 'Convert your resume to Zensar standard instantly.', hideInPopup: true },
               { label: 'ZenAICoach',            path: '/employee/ai',             icon: <Bot size={20}/>,           color: '#c084fc', desc: 'Career intelligence', hideInPopup: true },
               { label: 'ZenCode — GitHub Analysis', path: '/employee/github-intelligence', icon: <Github size={20}/>, color: '#3B82F6', desc: 'Discover & verify skills from your public GitHub repositories.' },
               { label: 'My Education',          path: '/employee/education',      icon: <GraduationCap size={20}/>, color: '#06B6D4', desc: 'Know your skills. Plan your growth.' },
               { label: 'My Projects',           path: '/employee/projects',       icon: <Briefcase size={20}/>,     color: '#F59E0B', desc: 'Match the right skill to the right project. · ' + safeProjects.length + ' entries' },
               { label: 'My Certification',      path: '/employee/certifications', icon: <Award size={20}/>,         color: '#10B981', desc: 'Track all your certifications, dates and renewals in one place. · ' + safeCerts.length + ' entries' },
               { label: 'My Awards & Achievements', path: '/employee/achievements', icon: <Award size={20}/>, color: '#F97316', desc: 'Silver/Gold awards' },
             ].filter(item => !isPopup || !item.hideInPopup).map(item => (
                <div key={item.label} style={{ ...actionCard, padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }} onClick={() => isPopup && onTabChange ? onTabChange(item.path) : navigate(item.path)} className="hover:scale-105">
                   <div style={{ width: 44, height: 44, borderRadius: 12, background: `${item.color}15`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                     {item.icon}
                   </div>
                   <div style={{ fontWeight: 800, fontSize: 13 }}>{item.label}</div>
                   <div style={{ fontSize: 10, color: T.muted }}>{item.desc}</div>
                </div>
             ))}
          </div>

          {/* HOW YOUR SCORE IS CALCULATED */}
          {(() => {
            const signals = [
              { label: 'Resume signals', pts: (safeProjects.length > 0 || safeCerts.length > 0 || expertCount > 0) ? 15 : 0, action: 'Upload your resume via ZenScan', path: '/employee/resume-upload' },
              { label: 'Skills assessed', pts: verifiedSkillBadges.length > 0 ? 20 : 0, action: 'Complete ZenAssess', path: '/employee/zenassess' },
              { label: 'Certifications', pts: safeCerts.length > 0 ? 10 : 0, action: 'Add a certification', path: '/employee/certifications' },
              { label: 'Manager validation', pts: 0, action: 'Pending manager review', path: '/employee/skills' },
              { label: 'Project history', pts: safeProjects.length > 0 ? 12 : 0, action: 'Add a project', path: '/employee/projects' },
            ];
            const total = Math.min(100, signals.reduce((n, s) => n + s.pts, 0));
            const topAction = signals.find(s => s.pts === 0 && s.label !== 'Manager validation') || signals.find(s => s.pts === 0);
            return (
              <div style={{ ...cardStyle }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>How Your Score Is Calculated</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {signals.map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: T.sub }}>{s.label}</span>
                      <span style={{ fontWeight: 800, color: s.pts > 0 ? '#10B981' : T.muted }}>
                        {s.pts > 0 ? `+${s.pts} pts` : `+0 pts`} {s.pts === 0 && s.label !== 'Manager validation' ? <span style={{ fontWeight: 500, color: T.muted }}>({s.action.toLowerCase()})</span> : s.label === 'Manager validation' && s.pts === 0 ? <span style={{ fontWeight: 500, color: T.muted }}>(pending)</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${T.bdr}`, marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Profile evidence total</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: T.text }}>{total}/100</span>
                </div>
                {benchmark !== null && benchmark > 0 && (
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 8 }}>
                    Team benchmark: <strong style={{ color: T.text }}>{benchmark}/100</strong> — you are {total >= benchmark ? <span style={{ color: '#10B981', fontWeight: 700 }}>at or above average</span> : <span style={{ color: '#F59E0B', fontWeight: 700 }}>below average</span>}.
                  </div>
                )}
                {topAction && (
                  <div onClick={() => navigate(topAction.path)} style={{ marginTop: 12, fontSize: 13, color: '#3B82F6', fontWeight: 700, cursor: 'pointer' }}>
                    Top action: {topAction.action} →
                  </div>
                )}
              </div>
            );
          })()}

          {/* ALLOCATION READINESS + CAREER MOMENTUM */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {/* Allocation Readiness */}
            <div style={{ ...cardStyle, flex: '1 1 320px', minWidth: 0 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Your Allocation Readiness</h3>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>You currently appear in searches for:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {verifiedSkillBadges.length > 0 ? verifiedSkillBadges.slice(0, 5).map(b => (
                  <div key={b.skill} style={{ fontSize: 13, color: T.text }}>
                    <span style={{ color: '#10B981', fontWeight: 800 }}>✓</span> {b.skill} <span style={{ color: T.muted }}>({b.level})</span>
                  </div>
                )) : (
                  <div style={{ fontSize: 13, color: T.sub }}>Complete an assessment to appear in verified staffing searches.</div>
                )}
                {safeExpertSkills.filter(s => !verifiedSkillBadges.some(b => b.skill === s)).slice(0, 3).map(s => (
                  <div key={s} style={{ fontSize: 13, color: T.sub }}>
                    <span style={{ color: T.muted, fontWeight: 800 }}>○</span> {s} <span style={{ color: T.muted }}>(not yet verified)</span>
                  </div>
                ))}
              </div>
              {openRoleMatches !== null && openRoleMatches > 0 && (
                <div style={{ fontSize: 13, color: T.text, marginBottom: 14 }}>
                  <strong>{openRoleMatches}</strong> open project{openRoleMatches !== 1 ? 's' : ''} match your verified skills.
                </div>
              )}
              <button onClick={() => navigate('/employee/zenassess')} style={{ padding: '10px 18px', borderRadius: 10, background: '#3B82F6', color: '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Start Assessment</button>
            </div>

            {/* Career Momentum */}
            {(() => {
              const nextGradeMap: Record<string, string> = { F1: 'E1', E1: 'E2', E2: 'D', D: 'C', C: '' };
              const gradeReq: Record<string, number> = { F1: 1, E1: 4, E2: 7, D: 13, C: 18 };
              const g = String(grade).toUpperCase().replace(/[^A-Z0-9]/g, '');
              const nextG = nextGradeMap[g] ?? '';
              const years = Number(user.years_it ?? user.yearsIT ?? (user as any).YearsIT ?? 0);
              const verifiedCount = verifiedSkillBadges.length;
              const domains = Array.from(new Set(safeProjects.map((p: any) => p.Domain || p.domain).filter(Boolean)));
              const nextReq = gradeReq[nextG] || gradeReq[g] || 4;
              const readiness = Math.round(
                Math.min(years / nextReq, 1) * 25 +
                Math.min(verifiedCount / 3, 1) * 25 +
                (overallScore / 100) * 25 +
                (domains.length > 0 ? 15 : 0)
              );
              const monthsBase = Math.max(3, Math.round((100 - readiness) / 100 * 24));
              const have: string[] = [];
              if (years >= nextReq * 0.7) have.push(`${years}+ years experience`);
              if (verifiedCount >= 2) have.push(`${verifiedCount} verified skills`);
              if (domains.length > 0) have.push(`${domains[0]} domain experience`);
              const need: string[] = [];
              if (verifiedCount < 3) need.push(`${3 - verifiedCount} more verified skill${3 - verifiedCount !== 1 ? 's' : ''}`);
              need.push('Lead project evidence');
              need.push('Manager recommendation');
              return (
                <div style={{ ...cardStyle, flex: '1 1 320px', minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Your Career Momentum</h3>
                  <div style={{ fontSize: 12, color: T.sub }}>Current Level: <strong style={{ color: T.text }}>{user.designation || user.Designation || 'QA Engineer'} ({grade})</strong></div>
                  {nextG ? (
                    <>
                      <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>Next Level: <strong style={{ color: T.text }}>{nextG}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 4 }}><span>Readiness</span><span style={{ fontWeight: 800, color: '#3B82F6' }}>{readiness}%</span></div>
                      <div style={{ height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 14 }}>
                        <div style={{ height: '100%', width: `${readiness}%`, borderRadius: 999, background: 'linear-gradient(90deg,#3B82F6,#8B5CF6)', transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.muted, fontWeight: 700, marginBottom: 6 }}>What you have</div>
                          {have.length ? have.map(h => <div key={h} style={{ fontSize: 12, color: T.text, marginBottom: 4 }}><span style={{ color: '#10B981' }}>✓</span> {h}</div>) : <div style={{ fontSize: 12, color: T.muted }}>Building foundation</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: T.muted, fontWeight: 700, marginBottom: 6 }}>What you need</div>
                          {need.map(n => <div key={n} style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}><span style={{ color: T.muted }}>○</span> {n}</div>)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: T.muted }}>At current pace: <strong style={{ color: T.text }}>~{monthsBase} months</strong> · With actions: <strong style={{ color: '#10B981' }}>~{Math.max(2, Math.round(monthsBase / 2))} months</strong> <span style={{ opacity: 0.7 }}>(estimate)</span></div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: T.sub, marginTop: 8 }}>You are at the top grade band — focus on leadership and mentoring impact.</div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* WHAT IMPROVES YOUR SCORE */}
          {(() => {
            const actions = [
              verifiedSkillBadges.length === 0
                ? { label: 'Take a skill assessment', pts: '+20 pts', path: '/employee/zenassess' }
                : { label: 'Verify another skill in ZenAssess', pts: '+20 pts', path: '/employee/zenassess' },
              safeCerts.length === 0
                ? { label: 'Add & verify a certification', pts: '+10 pts', path: '/employee/certifications' }
                : { label: 'Keep certifications current', pts: '+10 pts', path: '/employee/certifications' },
              { label: 'Get manager validation on a skill', pts: '+12 pts', path: '/employee/skills' },
            ].slice(0, 3);
            return (
              <div style={{ ...cardStyle }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>🎯 Improve Your Profile Score</h3>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Completing these puts you in the top 30% of staffing searches.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {actions.map((a, i) => (
                    <div key={a.path + i} onClick={() => navigate(a.path)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6' }}>{['①','②','③'][i]}</span>
                        <span style={{ fontSize: 13, color: T.text }}>{a.label}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#10B981', flexShrink: 0 }}>{a.pts}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* BOTTOM SECTION */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {/* Left Col */}
            <div style={{ ...cardStyle, flex: '1 1 300px', minWidth: 0 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Skill Profile Overview</h3>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                  <Radar data={radarData} options={radarOptions} />
                </div>
                <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {verifiedSkillBadges.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: T.muted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Verified Skills</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {verifiedSkillBadges.map(b => (
                          <span key={b.skill} style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {b.skill} <span style={{ fontWeight: 900 }}>✓</span> {b.level}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 12, color: T.muted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Top Strengths</div>
                    {safeExpertSkills.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {safeExpertSkills.slice(0,4).map(s => (
                          <span key={s} style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{s}</span>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 13, color: T.sub }}>No expert skills rated yet.</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Learning Focus (Gaps)</div>
                    {safeGapSkills.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {safeGapSkills.slice(0,4).map(g => (
                          <span key={g.skill} style={{ border: `1px solid ${T.bdr}`, padding: '4px 10px', borderRadius: 6, fontSize: 12, color: T.sub }}>{g.skill}</span>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 13, color: T.sub }}>Complete matrix to see gaps.</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col */}
            <div style={{ ...cardStyle, flex: '1 1 240px', minWidth: 0, background: 'linear-gradient(135deg, rgba(59,130,246,0.05), transparent)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={18} color="#3B82F6" /> AI Highlights
              </h3>
              
              <div style={{ padding: 16, background: 'rgba(59,130,246,0.1)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.2)', marginBottom: 16, fontSize: 13, color: T.text, lineHeight: 1.5 }}>
                {expertCount >= 3 && safeCerts.length > 0 
                  ? "Your strong automation foundation paired with external certs places you highly for Senior QI roles. Focus on AI testing to advance further."
                  : "Welcome to ZenMatrix."}
              </div>

              {safeCerts.some(c => c.status === 'Expiring Soon') && (
                <div style={{ padding: 12, background: 'rgba(245,158,11,0.1)', borderLeft: '3px solid #F59E0B', borderRadius: '0 8px 8px 0', marginBottom: 12, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#F59E0B' }}>Action Needed:</span> You have a certification expiring within 90 days.
                </div>
              )}

              {safeProjects.length > 0 && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: T.muted }}>Recent Project:</span>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{projects[safeProjects.length-1].ProjectName}</div>
                  <div style={{ color: T.sub, fontSize: 12 }}>{projects[safeProjects.length-1].Role} · {projects[safeProjects.length-1].Domain}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

