/**
 * EmployeeDashboard.tsx — /employee/dashboard
 * First page employee sees after logging in or onboarding.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/lib/AppContext';
import { apiGetSkills } from '@/lib/api';
import { useDark, mkTheme } from '@/lib/themeContext';
import { Bot, Map, PenTool, LayoutDashboard, Award, Briefcase, FileText, GraduationCap, AlertTriangle, RefreshCw, Upload, ClipboardCheck } from 'lucide-react';

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
  const [verifiedSkillBadges, setVerifiedSkillBadges] = useState<{ skill: string; level: string }[]>([]);
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      try {
        const skills = await apiGetSkills(employeeId);
        const verified = (skills || [])
          .map((s: any) => ({ skill: s.skillName || s.skill_name, level: s.verifiedBadgeLevel || s.verified_badge_level }))
          .filter((s: any) => s.skill && s.level);
        setVerifiedSkillBadges(verified);
      } catch { /* no verified badges available — section stays empty */ }
    })();
  }, [employeeId]);

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
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: T.text }}>{overallScore}</span>
                <span style={{ fontSize: 11, color: T.muted }}>/100</span>
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



          {/* MIDDLE SECTION — Personnel Hub Command Deck */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
             {[
               { label: 'ZenScan',              path: '/employee/resume-upload', icon: <Upload size={20}/>,        color: '#3B82F6', desc: 'AI reads your resume and maps every skill, cert and project — instantly.' },
               { label: 'ZenMatrix',             path: '/employee/skills',         icon: <PenTool size={20}/>,       color: '#8B5CF6', desc: 'Rate yourself. Let your manager confirm. Own your skill profile.' },
               { label: 'ZenAssess',             path: '/employee/zenassess',      icon: <ClipboardCheck size={20}/>, color: '#10B981', desc: 'Validate your skills. Earn verified badges.' },
               { label: 'ZenAlign',              path: '/employee/resume-builder', icon: <FileText size={20}/>,      color: '#ec4899', desc: 'Convert your resume to Zensar standard instantly.', hideInPopup: true },
               { label: 'ZenAICoach',            path: '/employee/ai',             icon: <Bot size={20}/>,           color: '#c084fc', desc: 'Career intelligence', hideInPopup: true },
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

