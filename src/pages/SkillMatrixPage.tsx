import { API_BASE } from '@/lib/api';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SKILLS } from '@/lib/mockData';
import { SkillCategory, ProficiencyLevel, PROFICIENCY_DESCRIPTIONS, SkillRating } from '@/lib/types';
import { toast } from 'sonner';
import { Save, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft, Send } from 'lucide-react';
import { saveSkillRatings, submitSkillMatrix, computeCompletion, getIncompleteSkills, getEmployee, exportEmployeeToExcel, upsertEmployee } from '@/lib/localDB';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { apiSaveSkills, apiSubmit, apiGetSkills, isServerAvailable } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import ZensarLoader from '@/components/ZensarLoader';

// All 32 skill names in canonical order (matches server)
const SKILL_NAMES = [
  'Selenium','Appium','JMeter','Postman','JIRA','TestRail',
  'Python','Java','JavaScript','TypeScript','C#','SQL',
  'API Testing','Mobile Testing','Performance Testing',
  'Security Testing','Database Testing','Banking',
  'Healthcare','E-Commerce','Insurance','Telecom',
  'Functional Testing','Automation Testing','Regression Testing',
  'UAT','Git','Jenkins','Docker','Azure DevOps',
  'ChatGPT/Prompt Engineering','AI Test Automation'
];

const CATEGORIES: SkillCategory[] = ['Tool', 'Technology', 'Application', 'Domain', 'TestingType', 'DevOps', 'AI'];

const CAT_COLOR: Record<SkillCategory, string> = {
  Tool: '#3B82F6', Technology: '#8B5CF6', Application: '#10B981',
  Domain: '#F59E0B', TestingType: '#EF4444', DevOps: '#06B6D4', AI: '#EC4899',
};
const CAT_EMOJI: Record<SkillCategory, string> = {
  Tool: '🔧', Technology: '💻', Application: '📱',
  Domain: '🏦', TestingType: '🧪', DevOps: '⚙️', AI: '🤖',
};
const LVL_LABEL: Record<ProficiencyLevel, string> = { 0: 'N/A', 1: 'Beginner', 2: 'Intermediate', 3: 'Expert' };

export default function SkillMatrixPage({ 
  isPopup: propIsPopup, 
  onTabChange: propOnTabChange 
}: { 
  isPopup?: boolean; 
  onTabChange?: (path: string) => void; 
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeId } = useAuth();
  const { dark } = useDark();
  const { data, reload, isPopup: ctxIsPopup, onTabChange: ctxOnTabChange } = useApp();
  
  // Use props if provided, otherwise fall back to context
  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;
  const onTabChange = propOnTabChange || ctxOnTabChange;
  
  const T = mkTheme(dark);
  
  const activeEmpId = isPopup ? (data?.user?.id || data?.user?.ZensarID || employeeId) : employeeId;
  
  // Dynamic color that fixes dark mode visibility for Level 0
  const LVL_COLOR: Record<number, string> = { 0: dark ? '#D1D5DB' : '#4B5563', 1: '#D97706', 2: '#2563EB', 3: '#059669' };

  // Check if we came from Resume Upload with AI pre-filled ratings
  const aiRatingsFromResume: SkillRating[] | undefined = (location.state as any)?.aiRatings;
  const fromResume: boolean = (location.state as any)?.fromResume ?? false;

  const [ratings, setRatings] = useState<SkillRating[]>(() => {
    // Prefer AI ratings from resume upload if available
    if (aiRatingsFromResume && aiRatingsFromResume.length > 0) return aiRatingsFromResume;
    const appRatings = data?.ratings;
    const emp = activeEmpId && activeEmpId !== 'new' ? getEmployee(activeEmpId) : null;
    return SKILLS.map(s => {
      const dbRating = appRatings?.[s.name];
      const localRating = emp?.skills?.find(sk => sk.skillId === s.id)?.selfRating;
      return { skillId: s.id, selfRating: (dbRating ?? localRating ?? 0) as ProficiencyLevel, managerRating: null, validated: false };
    });
  });
  const [activeIdx, setActiveIdx] = useState(0);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [sessionRatedIds, setSessionRatedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAIBanner, setShowAIBanner] = useState(fromResume);
  
  const [alreadySubmitted, setAlreadySubmitted] = useState<boolean>(() => {
    const empRecord = activeEmpId && activeEmpId !== 'new' ? getEmployee(activeEmpId) : null;
    return empRecord?.submitted === true || data?.user?.Submitted === 'Yes';
  });

  // ── Verified badges (ZenAssess) — always read fresh from DB, never from cache ──
  // Badge display must come from verified_badge_level only (never self_rating).
  const [verifiedBadges, setVerifiedBadges] = useState<Record<string, string>>({});

  // Refetch on mount, on employee change, AND on every navigation to this page
  // (location.key changes) — so a badge earned in ZenAssess shows immediately
  // when the employee returns to ZenMatrix, with no manual refresh.
  useEffect(() => {
    if (!activeEmpId || activeEmpId === 'new') return;
    (async () => {
      try {
        const skills = await apiGetSkills(activeEmpId);
        const badges: Record<string, string> = {};
        (skills || []).forEach((s: any) => {
          const name = s.skillName || s.skill_name;
          const verified = s.verifiedBadgeLevel || s.verified_badge_level;
          if (name && verified) badges[name] = verified;
        });
        setVerifiedBadges(badges);
      } catch { /* verified badges remain empty — safe default */ }
    })();
  }, [activeEmpId, location.key, (location.state as any)?.forceRefresh]);

  useEffect(() => {
    if (!employeeId || employeeId === 'new' || alreadySubmitted) return;
    const sessionId = localStorage.getItem('skill_nav_session_id');
    if (!sessionId) return;
    
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/employees`);
        if (!res.ok) return;
        const { employees, skills } = await res.json();
        const employee = (employees || []).find((e: any) => e.ID === sessionId || e.ZensarID === sessionId || e.id === sessionId);
        
        if (employee?.Submitted === 'Yes') {
          setAlreadySubmitted(true);
          const local = getEmployee(employeeId);
          if (local) upsertEmployee({ ...local, submitted: true });
        }

        const userSkills = (skills || []).find((s: any) => s.employeeId === sessionId || s.EmployeeID === sessionId || s['Employee ID'] === sessionId);
        if (userSkills) {
          const hasCloudRating = SKILLS.some(sk => {
            const query = sk.name.toLowerCase();
            return Object.keys(userSkills).some(k => {
              if (k.toLowerCase() === query || 
                  k.toLowerCase() === sk.name.replace(/#/g, '_x0023_').toLowerCase() ||
                  k.toLowerCase().replace(/_x0020_/g, ' ') === query ||
                  k.toLowerCase().replace(/_/g, ' ') === query) {
                return parseInt(String(userSkills[k] || 0)) > 0;
              }
              return false;
            });
          });
          
          if (hasCloudRating) {
            // Only update if cloud has something meaningful
            const cloudRatings: SkillRating[] = SKILLS.map(sk => {
              let raw = userSkills[sk.name];
              if (raw === undefined) {
                const query = sk.name.toLowerCase();
                const key = Object.keys(userSkills).find(k => 
                  k.toLowerCase() === query ||
                  k.toLowerCase() === sk.name.replace(/#/g, '_x0023_').toLowerCase() ||
                  k.toLowerCase().replace(/_x0020_/g, ' ') === query ||
                  k.toLowerCase().replace(/_/g, ' ') === query ||
                  k.toLowerCase() === sk.name.replace(/\//g, '_x002f_').toLowerCase() ||
                  k.toLowerCase() === sk.name.replace(/\//g, '_').toLowerCase()
                );
                if (key) raw = userSkills[key];
              }
              return {
                skillId: sk.id, 
                selfRating: (parseInt(String(raw || 0)) || 0) as ProficiencyLevel,
                managerRating: null, validated: false,
              };
            });
            setRatings(cloudRatings);
            const local = getEmployee(employeeId);
            if (local) upsertEmployee({ ...local, skills: cloudRatings });
          }
        }
      } catch { }
    })();
  }, [employeeId]);

  const activeCategory = CATEGORIES[activeIdx];
  const completion = useMemo(() => computeCompletion(ratings), [ratings]);
  const incomplete = useMemo(() => getIncompleteSkills(ratings), [ratings]);

  const catDone = (cat: SkillCategory) =>
    SKILLS.filter(s => s.category === cat && (ratings.find(r => r.skillId === s.id)?.selfRating ?? 0) > 0).length;
  const catTotal = (cat: SkillCategory) => SKILLS.filter(s => s.category === cat).length;

  const displaySkills = useMemo(() => {
    if (showIncomplete) {
      const incompleteIds = incomplete.map(s => s.id);
      return SKILLS.filter(s => incompleteIds.includes(s.id) || sessionRatedIds.includes(s.id));
    }
    // Within a category: verified skills first, then self-claimed, then unrated.
    // Stable sort preserves the original order inside each group.
    const rank = (s: typeof SKILLS[number]) => {
      if (verifiedBadges[s.name]) return 0;
      const selfRating = ratings.find(r => r.skillId === s.id)?.selfRating ?? 0;
      return selfRating > 0 ? 1 : 2;
    };
    return SKILLS.filter(s => s.category === activeCategory).sort((a, b) => rank(a) - rank(b));
  }, [showIncomplete, incomplete, sessionRatedIds, activeCategory, verifiedBadges, ratings]);

  const updateRating = (skillId: string, level: ProficiencyLevel) => {
    setRatings(prev => prev.map(r => r.skillId === skillId ? { ...r, selfRating: level } : r));
    if (showIncomplete && !sessionRatedIds.includes(skillId)) {
      setSessionRatedIds(prev => [...prev, skillId]);
    }
  };

  const buildSkillsPayload = (): Record<string, number> => {
    const flat: Record<string, number> = {};
    SKILLS.forEach(sk => {
      const r = ratings.find(rt => rt.skillId === sk.id);
      flat[sk.name] = r?.selfRating ?? 0;
    });
    return flat;
  };

  const handleSave = async () => {
    if (!activeEmpId || activeEmpId === 'new') { toast.success('✅ Progress saved!'); return; }
    setSaving(true);
    const empName = getEmployee(activeEmpId)?.name || data?.user?.Name || '';
    saveSkillRatings(activeEmpId, empName, ratings);
    try {
      const serverUp = await isServerAvailable();
      if (serverUp) {
        await apiSaveSkills(activeEmpId, empName, buildSkillsPayload());
        toast.success('Skill Matrix updated directly to cloud!');
      } else {
        toast.success('Skill Matrix saved locally.');
      }
      if (reload) await reload();
    } catch (err) {
      toast.warning('Draft saved locally (Cloud sync failed).');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeEmpId || activeEmpId === 'new') return;
    setSubmitting(true);
    const empName = getEmployee(activeEmpId)?.name || data?.user?.Name || '';
    saveSkillRatings(activeEmpId, empName, ratings);
    submitSkillMatrix(activeEmpId);
    try {
      const serverUp = await isServerAvailable();
      if (serverUp) {
        await apiSaveSkills(activeEmpId, empName, buildSkillsPayload());
        toast.success('🎉 Skill Matrix correctly updated in database!');
      } else {
        toast.success('🎉 Skill Matrix submitted locally!');
      }
      if (reload) await reload();
    } catch (err) {
      toast.warning('✅ Saved locally! (Backend error)');
    }
    setTimeout(() => {
      if (isPopup && onTabChange) {
        onTabChange('/employee/dashboard');
      } else {
        navigate('/employee/dashboard');
        window.location.reload();
      }
    }, 900);
  };

  const handleExport = () => {
    if (activeEmpId && activeEmpId !== 'new') {
      const empName = getEmployee(activeEmpId)?.name || data?.user?.Name || '';
      saveSkillRatings(employeeId, empName, ratings);
      exportEmployeeToExcel(employeeId);
      toast.success('📊 Report downloaded!');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'Inter', sans-serif", transition: 'background 0.35s, color 0.35s' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '36px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isPopup && (
              <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: '9px', background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <div>
              <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, color: T.text, fontFamily: "'Space Grotesk',sans-serif", marginBottom: '4px' }}>ZenMatrix</h1>
              <p style={{ color: T.sub, fontSize: '13px' }}>Rate your proficiency across multiple skills</p>
            </div>
          </div>
          {!alreadySubmitted && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={handleSubmit} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 22px', borderRadius: '9px', background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 0 20px rgba(59,130,246,0.35)', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? <ZensarLoader size={16} dark={dark} /> : <Send size={15} />}
                {submitting ? 'Submitting...' : 'Submit Final'}
              </button>
            </div>
          )}
        </div>

        {/* 🤖 AI Pre-fill Banner */}
        {showAIBanner && (
          <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '14px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🤖</span>
              <div>
                <div style={{ fontWeight: 700, color: '#A78BFA', fontSize: 14 }}>Skills pre-filled from your Resume by AI</div>
                <div style={{ color: T.muted, fontSize: 12 }}>Review and adjust each skill level below, then click Submit Final.</div>
              </div>
            </div>
            <button onClick={() => setShowAIBanner(false)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Completion Card */}
        <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: '18px', padding: '24px', marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: T.sub }}>Overall Completion</div>
              <div style={{ fontSize: '12px', color: T.muted, marginTop: 2 }}>{ratings.filter(r => r.selfRating > 0).length} of {SKILLS.length} skills rated</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '38px', fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", backgroundImage: completion >= 75 ? 'linear-gradient(135deg,#10B981,#3B82F6)' : completion >= 50 ? 'linear-gradient(135deg,#3B82F6,#8B5CF6)' : 'linear-gradient(135deg,#F59E0B,#EF4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{completion}%</span>
              {incomplete.length > 0
                ? <button onClick={() => { setShowIncomplete(v => !v); setSessionRatedIds([]); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', background: showIncomplete ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.08)', border: `1px solid ${showIncomplete ? '#3B82F680' : 'rgba(239,68,68,0.35)'}`, color: showIncomplete ? '#60A5FA' : '#FCA5A5', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    <AlertCircle size={13} /> {showIncomplete ? 'Back to Categories' : `${incomplete.length} Not Rated`}
                  </button>
                : <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#34D399', fontSize: '13px', fontWeight: 600 }}><CheckCircle2 size={16} /> All Done!</div>
              }
            </div>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${completion}%`, borderRadius: 999, transition: 'width 0.8s ease', boxShadow: '0 0 10px rgba(59,130,246,0.5)', background: completion >= 75 ? 'linear-gradient(90deg,#10B981,#3B82F6)' : completion >= 50 ? 'linear-gradient(90deg,#3B82F6,#8B5CF6)' : 'linear-gradient(90deg,#F59E0B,#EF4444)' }} />
          </div>
        </div>

        {/* Categories */}
        {!showIncomplete && (() => {
          const N = CATEGORIES.length;
          const edgeOffset = `calc(100% / ${N * 2})`;
          const fillPct = `${(activeIdx / N) * 100}%`;
          return (
            <div style={{ marginBottom: '32px', overflowX: 'auto', paddingBottom: '8px' }}>
              <div style={{ position: 'relative', display: 'flex', minWidth: '600px', alignItems: 'flex-start' }}>
                <div style={{ position: 'absolute', top: 33, height: 3, zIndex: 0, left: edgeOffset, right: edgeOffset, background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)', borderRadius: 2 }} />
                <div style={{ position: 'absolute', top: 33, height: 3, zIndex: 1, left: edgeOffset, width: fillPct, background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)', borderRadius: 2, transition: 'width 0.4s cubic-bezier(.4,0,.2,1)', boxShadow: '0 0 8px rgba(139,92,246,0.5)' }} />
                {CATEGORIES.map((cat, i) => {
                  const done = catDone(cat);
                  const total = catTotal(cat);
                  const isActive = i === activeIdx;
                  const color = CAT_COLOR[cat];
                  return (
                    <div key={cat} onClick={() => { setActiveIdx(i); setShowIncomplete(false); }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', position: 'relative', zIndex: 2, userSelect: 'none' }}>
                      <div style={{ position: 'relative', width: 66, height: 66, marginBottom: 8, flexShrink: 0 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: T.bg, zIndex: 0 }} />
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isActive ? `radial-gradient(circle at center, ${color}35, ${color}12)` : done === total ? 'rgba(16,185,129,0.12)' : dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: `2px solid ${isActive ? color : done === total ? '#10B981' : dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: isActive ? `0 0 20px ${color}55, 0 0 0 4px ${color}18` : 'none', zIndex: 1 }}>
                          {done === total && total > 0 ? <CheckCircle2 size={24} color="#10B981" /> : <><span style={{ fontSize: '18px' }}>{CAT_EMOJI[cat]}</span><span style={{ fontSize: '10px', fontWeight: 700, color: isActive ? (dark ? '#fff' : '#111') : T.muted }}>{done}/{total}</span></>}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: isActive ? 800 : 600, color: isActive ? color : T.muted, textAlign: 'center' }}>{cat}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Skills List */}
        <div style={{ display: 'grid', gap: '10px' }}>
          {displaySkills.map(skill => {
            const r = ratings.find(rt => rt.skillId === skill.id)!;
            const rated = r.selfRating > 0;
            const color = CAT_COLOR[skill.category];
            return (
              <div key={skill.id} style={{ background: rated ? `${LVL_COLOR[r.selfRating]}08` : T.card, border: `1px solid ${rated ? `${LVL_COLOR[r.selfRating]}28` : T.bdr}`, borderRadius: '13px', padding: '18px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
                <div style={{ flex: '1', minWidth: '160px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{skill.name}</span>
                    <span style={{ padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: `${color}18`, color }}>{skill.category}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '90px' }}>
                  <div style={{ fontSize: '10px', color: T.muted }}>MY LEVEL</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: rated ? LVL_COLOR[r.selfRating] : T.muted }}>{LVL_LABEL[r.selfRating]}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '110px' }}>
                  <div style={{ fontSize: '10px', color: T.muted }}>VERIFIED</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: verifiedBadges[skill.name] ? '#10B981' : T.muted }}>
                    {verifiedBadges[skill.name] ? `✓ ${verifiedBadges[skill.name]}` : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([0, 1, 2, 3] as ProficiencyLevel[]).map(l => (
                    <button key={l} onClick={() => updateRating(skill.id, l)} style={{ width: 42, height: 42, borderRadius: '9px', fontWeight: 800, border: `2px solid ${r.selfRating === l ? LVL_COLOR[l] : T.bdr}`, background: r.selfRating === l ? `${LVL_COLOR[l]}28` : T.card, color: r.selfRating === l ? LVL_COLOR[l] : T.muted, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px' }}>
          {!showIncomplete ? (
            <>
              <button onClick={() => setActiveIdx(i => Math.max(0, i - 1))} disabled={activeIdx === 0} style={{ padding: '11px 22px', borderRadius: '9px', background: T.card, border: `1px solid ${T.bdr}`, color: T.text, cursor: activeIdx === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 }}>Previous</button>
              {activeIdx < CATEGORIES.length - 1 ? (
                <button onClick={() => setActiveIdx(i => Math.min(CATEGORIES.length - 1, i + 1))} style={{ padding: '11px 22px', borderRadius: '9px', background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Next Category</button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 28px', borderRadius: '10px', background: 'linear-gradient(135deg,#10B981,#3B82F6)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{submitting ? 'Submitting...' : 'Submit Final'}</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setShowIncomplete(false); setSessionRatedIds([]); }} style={{ padding: '11px 22px', borderRadius: '9px', background: T.card, border: `1px solid ${T.bdr}`, color: T.text, cursor: 'pointer', fontWeight: 600 }}>Back to Categories</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 28px', borderRadius: '10px', background: 'linear-gradient(135deg,#10B981,#3B82F6)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{submitting ? 'Submitting...' : 'Submit Final'}</button>
            </>
          )}
        </div>
        
      </div>
      <style>{`
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
