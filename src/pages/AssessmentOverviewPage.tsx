/**
 * AssessmentOverviewPage.tsx
 * Clean single-page profile view before ZenAssess.
 * Shows: Grade · Job Family · Top 3 Skills · Assessment format · Start button.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Award } from 'lucide-react';
import { useDark, mkTheme } from '@/lib/themeContext';
import { useAuth } from '@/lib/authContext';
import { toast } from '@/lib/ToastContext';
import { computeSkillTaxonomy, getSkillTier, formatExperience, getGradePath, type TaxonomyResult } from '@/lib/zenTaxonomy';
import ZensarLoader from '@/components/ZensarLoader';
import { API_BASE, apiGetEmployee, apiUpdateEmployee } from '@/lib/api';

interface CandidateProfile {
  name?: string;
  yearsIT?: number;
  designation?: string;
  primarySkill: string;
  secondarySkill: string;
  tertiarySkill: string;
  experienceYears: number;
  path: 'Beginner' | 'Intermediate' | 'Expert';
  projects: any[];
  certifications: any[];
  skills: any;
  domains: string[];
  primaryScore: number;
  secondaryScore: number;
  tertiaryScore: number;
  primaryConfidence: number;
  secondaryConfidence: number;
  tertiaryConfidence: number;
  grade?: string;
  jobFamily?: string;
  overrideEnabled?: boolean;
  overridePath?: string;
}

const PATH_COLOR = { Beginner: '#10B981', Intermediate: '#3B82F6', Expert: '#8B5CF6' };
const GRADE_COLOR: Record<string, string> = {
  F1: '#10B981', E1: '#3B82F6', E2: '#3B82F6', D: '#8B5CF6', C: '#F59E0B',
};

export default function AssessmentOverviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeId, role } = useAuth();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [loading, setLoading] = useState(false);
  const [noData, setNoData] = useState(false);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [gradeMapping] = useState<Record<string, string>>(() => {
    try {
      const s = localStorage.getItem('grade_mapping');
      return s ? JSON.parse(s) : { F1:'Beginner', E1:'Intermediate', E2:'Intermediate', D:'Expert', C:'Expert' };
    } catch { return { F1:'Beginner', E1:'Intermediate', E2:'Intermediate', D:'Expert', C:'Expert' }; }
  });

  useEffect(() => { generateCandidateProfile(); }, [employeeId]);

  const getGradeFromExperience = (yrs: number): string => {
    if (yrs >= 13) return 'D';
    if (yrs >= 4) return 'E1';
    return 'F1';
  };

  const generateCandidateProfile = async () => {
    setLoading(true);
    setNoData(false);
    try {
      let extractedData = location.state?.extractedData;
      if (!extractedData) {
        const raw = localStorage.getItem('zenscan_raw_extraction');
        if (raw) try { extractedData = JSON.parse(raw); } catch {}
      }

      if (!extractedData) {
        const saved = localStorage.getItem('candidateProfile');
        if (saved) {
          try {
            const parsed: CandidateProfile = JSON.parse(saved);
            const txInput = {
              yearsIT: parsed.yearsIT || 0,
              skills: Array.isArray(parsed.skills)
                ? parsed.skills
                : Object.entries(parsed.skills || {}).map(([skillName, selfRating]) => ({ skillName, selfRating: selfRating as number })),
              projects: (parsed.projects || []).map((p: any) => ({
                name: p.ProjectName || p.name || '', technologies: p.Technologies || p.technologies || [],
                skills: [], domain: p.Domain || p.domain || '', description: p.Description || p.description || '', role: p.Role || p.role || '',
              })),
              certifications: (parsed.certifications || []).map((c: any) => c.CertName || c.certName || c || ''),
              designation: parsed.designation, department: '',
            };
            setTaxonomy(computeSkillTaxonomy(txInput));
            setCandidateProfile(parsed);
            return;
          } catch {}
        }
        setNoData(true);
        return;
      }

      const profile = extractedData.profile || {};
      const skills = extractedData.skills || {};
      const projects = extractedData.projects || [];
      const certifications = extractedData.certifications || [];
      const experienceYears = profile.yearsIT || 0;
      const domains = Array.from(new Set(projects.map((p: any) => p.Domain || p.domain).filter(Boolean))) as string[];

      const txInput = {
        yearsIT: experienceYears,
        skills: Object.entries(skills).map(([skillName, selfRating]) => ({ skillName, selfRating: selfRating as number })),
        projects: projects.map((p: any) => ({
          name: p.ProjectName || p.name || '', technologies: p.Technologies || p.technologies || [],
          skills: [], domain: p.Domain || p.domain || '', description: p.Description || p.description || '', role: p.Role || p.role || '',
        })),
        certifications: certifications.map((c: any) => c.CertName || c.certName || c || ''),
        designation: profile.designation, department: '',
      };
      const txResult = computeSkillTaxonomy(txInput);
      setTaxonomy(txResult);

      let grade = profile.grade || '';
      if (!grade) {
        try { const emp = await apiGetEmployee(employeeId || ''); grade = (emp as any).grade || (emp as any).Grade || ''; } catch {}
      }
      if (!grade) {
        grade = getGradeFromExperience(experienceYears);
        // Persist the derived grade back so future loads read it directly
        if (employeeId) {
          try { await apiUpdateEmployee(employeeId, { grade } as any); } catch {}
        }
      }

      let jobFamily = profile.jobFamily || '';
      if (!jobFamily) {
        const d = (profile.designation || '').toLowerCase();
        if (d.includes('performance') || d.includes('jmeter') || d.includes('load')) jobFamily = 'Performance Testing';
        else if (d.includes('automat') || d.includes('selenium') || d.includes('playwright')) jobFamily = 'Automation Testing';
        else if (d.includes('api') || d.includes('postman')) jobFamily = 'API Testing';
        else if (d.includes('security') || d.includes('vapt')) jobFamily = 'Security Testing';
        else if (d.includes('mobile') || d.includes('appium')) jobFamily = 'Mobile Testing';
        else if (d.includes('devops') || d.includes('sre')) jobFamily = 'DevOps QE';
        else if (d.includes('banking') || d.includes('bfsi') || d.includes('domain')) jobFamily = 'Domain Specialist';
        else jobFamily = 'QA & Functional Testing';
      }

      const savedMapping = localStorage.getItem('grade_mapping');
      const mapping = savedMapping ? JSON.parse(savedMapping) : gradeMapping;
      const overrideEnabled = localStorage.getItem(`override_enabled_${employeeId}`) === 'true';
      const overridePath = localStorage.getItem(`override_path_${employeeId}`) || 'Intermediate';
      const assignedPath = overrideEnabled
        ? (overridePath as 'Beginner' | 'Intermediate' | 'Expert')
        : getGradePath(grade);

      const candidate: CandidateProfile = {
        name: profile.name || 'Unknown',
        yearsIT: experienceYears,
        designation: profile.designation || 'Software Engineer',
        primarySkill: txResult.primary.skill,
        secondarySkill: txResult.secondary.skill,
        tertiarySkill: txResult.tertiary.skill,
        experienceYears,
        path: assignedPath,
        projects, certifications,
        skills: Object.entries(skills).map(([skillName, selfRating]) => ({ skillName, selfRating: selfRating as number })),
        domains,
        primaryScore: txResult.primary.score,
        secondaryScore: txResult.secondary.score,
        tertiaryScore: txResult.tertiary.score,
        primaryConfidence: txResult.primary.confidence,
        secondaryConfidence: txResult.secondary.confidence,
        tertiaryConfidence: txResult.tertiary.confidence,
        grade, jobFamily, overrideEnabled, overridePath
      };

      setCandidateProfile(candidate);
      localStorage.setItem('candidateProfile', JSON.stringify(candidate));
    } catch (err: any) {
      toast.error('Could not generate profile: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!candidateProfile) return;
    try {
      const res = await fetch(`${API_BASE}/zenassess/can-retake/${employeeId}?path=${candidateProfile.path}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.canRetake) {
          const nextDate = new Date(data.nextEligibleDate).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
          toast.error(`Retake available on ${nextDate} (${data.daysRemaining} days remaining)`, 6000);
          return;
        }
        if (data.reason === 'already_passed') {
          toast.info(`You previously passed with ${data.lastScore}%. Retaking will replace your score.`, 4000);
        }
      }
    } catch {}

    try {
      const token = localStorage.getItem('zn_access_token');
      fetch(`${API_BASE}/employees/${employeeId}/candidate-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          primarySkill: candidateProfile.primarySkill, secondarySkill: candidateProfile.secondarySkill,
          tertiarySkill: candidateProfile.tertiarySkill, name: candidateProfile.name,
          designation: candidateProfile.designation, yearsIT: candidateProfile.yearsIT,
          grade: candidateProfile.grade, path: candidateProfile.path,
          primaryScore: candidateProfile.primaryScore, secondaryScore: candidateProfile.secondaryScore,
          tertiaryScore: candidateProfile.tertiaryScore, domains: candidateProfile.domains,
        }),
      }).catch(() => {});
    } catch {}

    navigate('/employee/zenassess', { state: { candidateProfile, fromOverview: true } });
  };

  if (loading) return <ZensarLoader fullScreen label="Analyzing your resume..." />;

  if (noData) return (
    <div style={{ minHeight:'100vh', background: T.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background: T.card, border:`1px solid ${T.bdr}`, borderRadius: 20, padding:'48px 56px', textAlign:'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h2 style={{ margin:'0 0 8px', fontSize: 20, fontWeight: 900, color: T.text }}>No Resume Found</h2>
        <p style={{ fontSize: 13, color: T.sub, marginBottom: 24 }}>Upload your resume so we can analyse your skills.</p>
        <button onClick={() => navigate('/employee/resume-upload')} style={{
          padding:'12px 28px', borderRadius: 10, border:'none',
          background:'linear-gradient(135deg, #6B2D8B, #3B82F6)', color:'#fff', fontSize: 14, fontWeight: 700, cursor:'pointer',
        }}>Upload Resume</button>
      </div>
    </div>
  );

  if (!candidateProfile || !taxonomy) return <ZensarLoader fullScreen label="Loading profile..." />;

  const pathColor = PATH_COLOR[candidateProfile.path] || '#3B82F6';
  const gColor = GRADE_COLOR[candidateProfile.grade || ''] || '#6B7280';

  const skills3 = [
    { label: 'Primary', skill: candidateProfile.primarySkill, score: candidateProfile.primaryScore, yrs: taxonomy.primary.estimatedYears, color: '#10B981', border: '2px solid #10B981', bg: 'rgba(16,185,129,0.08)' },
    { label: 'Secondary', skill: candidateProfile.secondarySkill, score: candidateProfile.secondaryScore, yrs: taxonomy.secondary.estimatedYears, color: '#3B82F6', border: '1px solid rgba(59,130,246,0.35)', bg: 'rgba(59,130,246,0.06)' },
    { label: 'Tertiary', skill: candidateProfile.tertiarySkill, score: candidateProfile.tertiaryScore, yrs: taxonomy.tertiary.estimatedYears, color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.25)', bg: 'rgba(139,92,246,0.05)' },
  ];

  const pathFormats: Record<string, { rounds: string; duration: string; pass: string; roundCount: number; weights: string }> = {
    Beginner:     { rounds: '20 MCQ → 5 Tool ID → 2 Practical', duration: '30 min', pass: '60%', roundCount: 3, weights: 'MCQ 50% · Tool ID 20% · Practical 30%' },
    Intermediate: { rounds: '15 MCQ → 1 Coding → 2 Scenarios → 1 Framework', duration: '60 min', pass: '65%', roundCount: 4, weights: 'MCQ 20% · Coding 35% · Scenarios 30% · Framework 15%' },
    Expert:       { rounds: '5 Scenarios → 1 Capstone → 3 Mentoring → 6 Questionnaire', duration: '60 min', pass: '70%', roundCount: 4, weights: 'Scenarios 25% · Capstone 40% · Mentoring 20% · Questionnaire 15%' },
  };
  const fmt = pathFormats[candidateProfile.path];

  // ── Skill Trust Engine: evidence-based confidence per skill (pre-assessment) ──
  const computeSkillTrust = (skillName: string) => {
    const sources: { label: string; pts: number }[] = [];
    const sk = String(skillName || '').toLowerCase();
    if (!sk) return { score: 0, sources };

    // Resume claim (the skill was extracted from the resume)
    sources.push({ label: 'Resume claim', pts: 10 });

    // Project usage
    const projHits = (candidateProfile.projects || []).filter((p: any) => {
      const blob = [p.ProjectName, p.name, p.Description, p.description, p.Role, p.role,
        ...(p.Technologies || p.technologies || [])].join(' ').toLowerCase();
      return blob.includes(sk);
    }).length;
    if (projHits >= 2) sources.push({ label: `Used in ${projHits} projects`, pts: 15 });
    else if (projHits === 1) sources.push({ label: 'Used in 1 project', pts: 8 });

    // Self-claimed level
    const selfRated = (candidateProfile.skills || []).some((s: any) =>
      String(s.skillName || '').toLowerCase() === sk && (s.selfRating || 0) > 0);
    if (selfRated) sources.push({ label: 'Self-rated', pts: 5 });

    // Certification detected
    const certHit = (candidateProfile.certifications || []).some((c: any) =>
      String(typeof c === 'string' ? c : (c.CertName || c.certName || c.name || '')).toLowerCase().includes(sk));
    if (certHit) sources.push({ label: 'Certification detected', pts: 10 });

    const score = Math.min(100, sources.reduce((n, s) => n + s.pts, 0));
    return { score, sources };
  };

  return (
    <div style={{ minHeight:'100vh', background: T.bg, color: T.text, padding:'28px 5vw' }}>
      <div style={{ maxWidth: 900, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, background:'linear-gradient(135deg, #6B2D8B, #3B82F6)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            ZenAssess — Your Profile
          </h1>
          <p style={{ fontSize: 13, color: T.sub, margin:'4px 0 0' }}>
            AI has analysed your resume. Review your top skills and start your validation.
          </p>
        </div>

        {/* Identity row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label:'Grade', value: candidateProfile.grade || 'Not Assigned', color: gColor },
            { label:'Job Family', value: candidateProfile.jobFamily || 'QA & Testing', color:'#3B82F6' },
            { label:'Experience', value:`${candidateProfile.experienceYears} yrs`, color: pathColor },
            { label:'Validation Path', value: candidateProfile.path, color: pathColor },
          ].map(item => (
            <div key={item.label} style={{ background: T.card, border:`1px solid ${T.bdr}`, borderRadius: 10, padding:'14px 16px', borderTop:`3px solid ${item.color}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.sub, textTransform:'uppercase', letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1.8fr 1fr', gap: 20 }}>

          {/* Left — Top 3 Skills */}
          <div>
            <div style={{ background: T.card, border:`1px solid ${T.bdr}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, display:'flex', alignItems:'center', gap: 6 }}>
                <Award size={16} color="#F59E0B" /> Your Top 3 Skills
                <span style={{ marginLeft:'auto', fontSize: 11, color: T.sub, fontWeight: 400 }}>AI-ranked from resume</span>
              </div>

              {skills3.map(s => (
                <div key={s.label} style={{ padding: 14, background: s.bg, border: s.border, borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform:'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>{s.skill}</div>
                      <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{formatExperience(s.yrs)}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Assessment: {fmt.duration} · {fmt.roundCount} rounds</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.score}</div>
                      <div style={{ fontSize: 10, color: s.color, fontWeight: 700 }}>{getSkillTier(s.score)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Skill Trust Profile — evidence-based confidence */}
            <div style={{ background: T.card, border:`1px solid ${T.bdr}`, borderRadius: 14, padding: 20, marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Your Skill Trust Profile</div>
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 16 }}>How your skills are verified before assessment:</div>
              {skills3.map(s => {
                const trust = computeSkillTrust(s.skill);
                return (
                  <div key={s.label} style={{ marginBottom: 16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{s.skill}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: s.color }}>{trust.score}/100</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${trust.score}%`, borderRadius: 999, background: s.color, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                      Sources: {trust.sources.map(src => `${src.label} (+${src.pts})`).join(' · ')}
                      <span style={{ color: s.color, fontWeight: 700 }}> → Take assessment to reach 70+</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — Assessment card */}
          <div>
            <div style={{ background: T.card, border:`2px solid ${pathColor}`, borderRadius: 14, padding: 20, position:'sticky', top: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: pathColor, marginBottom: 12, textTransform:'uppercase', letterSpacing: 1 }}>
                {candidateProfile.path} Assessment
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}><strong>Format:</strong> {fmt.rounds}</div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}><strong>Scoring:</strong> {fmt.weights}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
                  <div style={{ padding: 10, background:'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft:`3px solid ${pathColor}` }}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>Duration</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: pathColor }}>{fmt.duration}</div>
                  </div>
                  <div style={{ padding: 10, background:'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft:`3px solid ${pathColor}` }}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>Pass Mark</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: pathColor }}>{fmt.pass}</div>
                  </div>
                </div>
              </div>

              {!confirmed ? (
                <button
                  onClick={() => { setConfirmed(true); toast.success('Skills confirmed! You can now start.'); }}
                  style={{ width:'100%', padding: 13, borderRadius: 10, border:'none', background:'#10B981', color:'#fff', fontSize: 13, fontWeight: 800, cursor:'pointer', marginBottom: 8 }}
                >
                  ✓ Confirm Skills & Continue
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  style={{ width:'100%', padding: 14, borderRadius: 10, border:'none', background:`linear-gradient(135deg, ${pathColor}, ${pathColor}CC)`, color:'#fff', fontSize: 14, fontWeight: 800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap: 8, marginBottom: 8 }}
                >
                  Start Assessment <ArrowRight size={16} />
                </button>
              )}

              <div style={{ padding: 10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 11, color:'#F59E0B', lineHeight: 1.5 }}>
                Complete in one session with stable internet.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
