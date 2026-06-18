/**
 * AIIntelligencePage.tsx — /employee/ai
 * Overhauled for extreme clarity, detailed insights, and elite aesthetics.
 * Enhanced for both Light and Dark modes.
 * Features: Phased AI Generated Roadmap and AI Career Coach.
 */
import { Map, TrendingUp, Search, MessageSquare, Send, Bot, RefreshCw, X, Award, Briefcase, Zap, ShieldCheck, Brain, Star, ChevronRight, ChevronLeft, Target, Info, Sparkles, ExternalLink, Globe, UserCheck, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/AppContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { callLLM, checkLLMStatus } from '@/lib/llm';
import { useAuth } from '@/lib/authContext';
import { API_BASE } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  BarController, Tooltip, Legend, PointElement, LineElement, Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { toast } from 'sonner';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip, Legend, PointElement, LineElement, Filler);

// ─────────────────────────────────────────────────
// TAB 1 — CAREER COACH
// ─────────────────────────────────────────────────
function CareerCoachTab({ data, T }: { data: any, T: any }) {
  const { employeeId } = useAuth();
  const [fullProfile, setFullProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'bot'; text: string }>>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const botRef = useRef<HTMLDivElement>(null);

  // ── Fetch the COMPLETE profile so the coach answers from real data ──
  useEffect(() => {
    if (!employeeId) { setProfileLoading(false); return; }
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      const j = (r: Response) => (r.ok ? r.json() : null);
      try {
        const [emp, skills, projects, certs, achievements, education] = await Promise.all([
          fetch(`${API_BASE}/employees/${employeeId}`).then(j).catch(() => null),
          fetch(`${API_BASE}/employees/${employeeId}/skills`).then(j).catch(() => null),
          fetch(`${API_BASE}/projects/${employeeId}`).then(j).catch(() => null),
          fetch(`${API_BASE}/certifications/${employeeId}`).then(j).catch(() => null),
          fetch(`${API_BASE}/achievements/${employeeId}`).then(j).catch(() => null),
          fetch(`${API_BASE}/education/${employeeId}`).then(j).catch(() => null),
        ]);
        if (cancelled) return;
        setFullProfile({
          employee: emp || data?.user || {},
          skills: Array.isArray(skills) ? skills : (skills?.skills || []),
          projects: projects?.projects || [],
          certifications: certs?.certifications || [],
          achievements: achievements?.achievements || [],
          education: education?.education || [],
        });
      } catch {
        if (!cancelled) setFullProfile({ employee: data?.user || {}, skills: [], projects: [], certifications: [], achievements: [], education: [] });
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const pick = (o: any, ...keys: string[]) => { for (const k of keys) { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; } return ''; };

  const buildSystemPrompt = (profile: any) => {
    if (!profile) return 'You are ZenAICoach, a career coach.';
    const { employee = {}, skills = [], projects = [], certifications = [], achievements = [], education = [] } = profile;
    const sName = (s: any) => pick(s, 'skill_name', 'skillName', 'name');
    const sRating = (s: any) => pick(s, 'self_rating', 'selfRating') || 0;
    const sVerified = (s: any) => pick(s, 'verified_badge_level', 'verifiedBadgeLevel');
    const verifiedSkills = skills.filter((s: any) => sVerified(s));
    const topSkills = [...skills].filter((s: any) => Number(sRating(s)) > 0).sort((a: any, b: any) => Number(sRating(b)) - Number(sRating(a))).slice(0, 10);
    return `You are ZenAICoach, an expert career coach for ${pick(employee, 'name', 'Name') || 'this employee'}.

EMPLOYEE PROFILE (use this for ALL answers):
Name: ${pick(employee, 'name', 'Name') || 'N/A'}
Role: ${pick(employee, 'designation', 'Designation') || 'N/A'}
Grade: ${pick(employee, 'grade', 'Grade') || 'N/A'}
Department: ${pick(employee, 'department', 'Department') || 'N/A'}
IT Experience: ${pick(employee, 'years_it', 'yearsIT', 'YearsIT') || 0} years
Location: ${pick(employee, 'location', 'Location') || 'N/A'}

SKILLS (${skills.length} total):
${topSkills.length ? topSkills.map((s: any) => `- ${sName(s)}: Level ${sRating(s)}/3 ${sVerified(s) ? '(Verified: ' + sVerified(s) + ')' : '(Not yet verified)'}`).join('\n') : 'No skills rated yet'}

VERIFIED BADGES (${verifiedSkills.length}):
${verifiedSkills.length ? verifiedSkills.map((s: any) => `- ${sName(s)}: ${sVerified(s)}`).join('\n') : 'No verified badges yet'}

PROJECTS (${projects.length}):
${projects.length ? projects.map((p: any) => `- ${pick(p, 'ProjectName', 'project_name', 'name', 'title') || 'Untitled'} | Client: ${pick(p, 'Client', 'client') || 'N/A'} | Domain: ${pick(p, 'Domain', 'domain') || 'N/A'} | Role: ${pick(p, 'Role', 'role') || 'N/A'} | ${pick(p, 'StartDate', 'start_date') || ''} to ${pick(p, 'EndDate', 'end_date') || (pick(p, 'IsOngoing', 'is_ongoing') ? 'Present' : '')}`).join('\n') : 'No projects recorded yet'}

CERTIFICATIONS (${certifications.length}):
${certifications.length ? certifications.map((c: any) => `- ${pick(c, 'CertName', 'cert_name', 'name')} | ${pick(c, 'Provider', 'issuer', 'issuingOrganization') || ''} ${pick(c, 'IssueDate', 'issue_date', 'year') || ''}`).join('\n') : 'No certifications recorded yet'}

ACHIEVEMENTS (${achievements.length}):
${achievements.length ? achievements.map((a: any) => `- ${pick(a, 'Title', 'title', 'name')}: ${pick(a, 'Description', 'description') || ''} ${pick(a, 'DateReceived', 'date_received', 'date') || ''}`).join('\n') : 'No achievements recorded yet'}

EDUCATION (${education.length}):
${education.length ? education.map((e: any) => `- ${pick(e, 'degree', 'Degree')} in ${pick(e, 'field', 'fieldOfStudy', 'field_of_study') || ''} | ${pick(e, 'institution', 'Institution') || ''} ${pick(e, 'year', 'endDate', 'end_date') || ''}`).join('\n') : 'No education recorded yet'}

CRITICAL INSTRUCTIONS:
1. ONLY answer based on the profile data above. Do NOT invent skills, projects, certifications, or achievements not listed.
2. When asked about projects/certifications/skills/achievements, use the matching section above.
3. If something is not in the profile, say: "I don't see [X] in your profile yet — you can add it in the relevant section."
4. Be specific and use the employee's actual data in every response.
5. If a section is empty, say so plainly and offer to suggest relevant next steps.`;
  };

  // ── Greeting reflects the real, loaded profile ──
  useEffect(() => {
    if (profileLoading) return;
    const fp = fullProfile;
    const firstName = (pick(fp?.employee || {}, 'name', 'Name') || data.user?.Name || 'there').split(' ')[0];
    const ratedCount = (fp?.skills || []).filter((s: any) => Number(pick(s, 'self_rating', 'selfRating') || 0) > 0).length;
    const greeting = fp
      ? `Hello ${firstName}! 👋 I'm your ZenAICoach. I can see your profile: ${ratedCount} rated skills, ${fp.projects?.length || 0} projects, ${fp.certifications?.length || 0} certifications, ${fp.achievements?.length || 0} achievements. What would you like to work on today?`
      : `Hello! 👋 I'm your ZenAICoach. What would you like to work on today?`;
    setMessages([{ role: 'bot', text: greeting }]);
  }, [profileLoading]);

  useEffect(() => { botRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, typing]);

  const send = async (text: string) => {
    if (!text.trim() || profileLoading) return;
    const m = [...messages, { role:'user' as const, text }];
    setMessages(m); setInput(''); setTyping(true);
    try {
      const systemPrompt = buildSystemPrompt(fullProfile);
      const history = m.slice(-10).map(x => `${x.role === 'user' ? 'User' : 'Coach'}: ${x.text}`).join('\n');
      const prompt = `${systemPrompt}\n\nConversation so far:\n${history}\n\nUser: ${text}\n\nReply as the coach using ONLY the profile data above. Your response MUST be valid JSON: {"response": "your message here"}`;
      const res = await callLLM(prompt);
      if (res?.data?.response) {
        setMessages([...m, { role: 'bot', text: String(res.data.response) }]);
      } else if (res?.data && typeof res.data === 'string') {
        setMessages([...m, { role: 'bot', text: res.data }]);
      } else throw new Error();
    } catch {
      setMessages([...m, { role: 'bot', text: '⚠️ Career Coach is temporarily offline. Please ensure Ollama is running locally.' }]);
    }
    setTyping(false);
  };

  const renderMessage = (text: string) => {
     const parts = text.split(/(\*\*.*?\*\*)/g);
     return parts.map((part, i) => {
       if (part.startsWith('**') && part.endsWith('**')) {
         return <strong key={i}>{part.slice(2, -2)}</strong>;
       }
       return <span key={i} style={{ whiteSpace: 'pre-line' }}>{part}</span>;
     });
  };

  return (
    <div style={{ animation: 'fadeUp 0.4s' }}>
      <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: 500, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 8 }}>
          {profileLoading && <div style={{ color: T.sub, fontSize: 13, marginLeft: 8 }}>Loading your profile data…</div>}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ 
                maxWidth: '85%', padding: '14px 20px', borderRadius: 20, 
                background: m.role==='user' ? '#3B82F6' : (T.bg === '#050B18' ? 'rgba(255,255,255,0.05)' : '#f8fafc'), 
                color: m.role==='user' ? '#fff' : T.text, fontSize: 13.5, 
                border: m.role === 'bot' ? `1px solid ${T.bdr}` : 'none', lineHeight: 1.6 
              }}>
                {renderMessage(m.text)}
              </div>
            </div>
          ))}
          {typing && <div style={{ color: '#3B82F6', fontSize: 12, fontWeight: 700, marginLeft: 8 }}>ZenAICoach is thinking...</div>}
          <div ref={botRef} />
        </div>
        <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
          <input value={input} disabled={profileLoading} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && send(input)} placeholder={profileLoading ? 'Loading your profile…' : 'Ask about growth, certs, or career path...'} style={{ flex:1, padding:'14px 18px', borderRadius:14, background:T.bg, border:`1px solid ${T.bdr}`, color:T.text, outline:'none', fontSize: 14, opacity: profileLoading ? 0.6 : 1 }} />
          <button onClick={()=>send(input)} disabled={profileLoading} style={{ width: 44, height: 44, borderRadius: 12, background:'#3B82F6', border:'none', color:'#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: profileLoading ? 'not-allowed' : 'pointer', opacity: profileLoading ? 0.6 : 1 }}><Send size={18}/></button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// TAB 2 — LEARNING ROADMAP
// ─────────────────────────────────────────────────
function RoadmapTab({ data, T }: { data: any, T: any }) {
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    generateRoadmap();
  }, []);

  const generateRoadmap = async () => {
    setLoading(true);
    setError(false);
    try {
      const expertSkills = (data.expertSkills || []).join(', ');
      const gapSkills = (data.gapSkills || []).map((g: any) => g.skill).join(', ');
      const education = (data.education || []).map((e: any) => e.Degree || e.degree).join(', ');
      const designation = data.user?.Designation || 'Quality Engineer';

      const prompt = `Conduct a deeply analytical capability gap analysis and generate a 3-Phase technical learning roadmap for ${data.user?.Name}, a ${designation} at Zensar.
Context:
- Educational Background: ${education}
- Strong Capabilities: ${expertSkills}
- Identified Skill Gaps to Bridge: ${gapSkills}

STRATEGY INSTRUCTION:
Perform a deep gap analysis by correlating their current capabilities against the expected trajectory for a senior engineer. Base the roadmap not just on the gaps, but on building foundational prerequisites before advancing. Incorporate Zensar's focus on enterprise scale, robust QA strategies, AI test automation, and measurable metrics. Ensure Phase 1 bridges fundamental gaps rapidly, Phase 2 scales their capabilities to enterprise level, and Phase 3 positions them as a thought leader or architect in their domain.

Format: Return a JSON object ONLY with a "steps" array containing 3 objects:
[{
  "title": "Phase title mapping to the strategy (e.g., Foundational Synthesis)",
  "phase": "Phase 0X: [Name]",
  "text": "Detailed deep analysis and reasoning for this specific capability bridge.",
  "items": [{"skill": "Skill Name to target"}],
  "time": "Est. duration (e.g., 4-6 Weeks)",
  "color": "#HEX_COLOR (Orange/Blue/Green sequence)"
}]`;

      const res = await callLLM(prompt);
      if (res?.data?.steps) {
        setSteps(res.data.steps);
      } else {
         throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      setError(true);
      // Fallback data if AI unavailable
      setSteps([
        { title: 'Foundation Stabilization', phase: 'Phase 01: Stabilization', icon: <Zap color="#F59E0B" />, text: 'Focus on elevating immediate gaps to professional proficiency.', items: (data.gapSkills || []).slice(0, 3), color: '#F59E0B', time: '3-4 Weeks' },
        { title: 'Advanced Mastery', phase: 'Phase 02: Mastery', icon: <Target color="#3B82F6" />, text: 'Bridging complex technical hurdles in modern QI architecture.', items: (data.gapSkills || []).slice(3, 6), color: '#3B82F6', time: '6-8 Weeks' },
        { title: 'Leadership & Innovation', phase: 'Phase 03: Elite QI', icon: <Award color="#10B981" />, text: 'Shifting towards strategic role leadership and certification elite status.', items: [{skill:'SDET Lead Mastery'}], color: '#10B981', time: '12+ Weeks' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ animation: 'fadeUp 0.4s' }}>
       {loading && (
         <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: 48, textAlign: 'center' }}>
            <Loader2 className="animate-spin" size={32} color="#3B82F6" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontWeight: 800, fontSize: 16 }}>Synthesises skill map with the help of AI...</div>
            <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>Analyzing {data.gapSkills?.length || 0} skill gaps against Zensar QI standards.</div>
         </div>
       )}

       {!loading && (
         <>
           {error && <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>⚠️ AI Service unavailable. Showing fallback generalized roadmap.</div>}
           
           <div style={{ display: 'flex', flexDirection: 'column', gap:0, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, overflow: 'hidden' }}>
              {steps.map((s, idx) => (
                 <div key={idx} style={{ padding: '24px', borderBottom: idx === steps.length - 1 ? 'none' : `1px solid ${T.bdr}`, display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
                       <div style={{ width: 44, height: 44, borderRadius: 14, background: `${s.color || '#3B82F6'}15`, border: `1.5px solid ${s.color || '#3B82F6'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {idx === 0 ? <Zap color={s.color} /> : idx === 1 ? <Target color={s.color} /> : <Award color={s.color} />}
                       </div>
                       {idx < steps.length - 1 && <div style={{ width: 2, flex: 1, background: `linear-gradient(to bottom, ${s.color || '#3B82F6'}, transparent)`, margin: '8px 0' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: s.color || '#3B82F6', letterSpacing: 1.5, textTransform: 'uppercase' }}>{s.phase} · {s.time}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>Path: QI Specialist</div>
                       </div>
                       <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>{s.title}</h3>
                       <p style={{ fontSize: 13, color: T.sub, margin: '4px 0 16px', lineHeight: 1.5 }}>{s.text}</p>
                       
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                          {(s.items || []).map((item: any, i:number) => (
                             <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 12, background: T.bg, border: `1px solid ${T.bdr}`, fontWeight: 700, fontSize: 13 }}>
                                {item.skill} <ChevronRight size={12} color={s.color || '#3B82F6'} /> <span style={{ color: s.color || '#3B82F6' }}>Target Lev. 3</span>
                             </div>
                          ))}
                       </div>

                       <div style={{ display: 'flex', gap: 12 }}>
                          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3B82F6', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                             <Globe size={13} /> Learning Hub
                          </button>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
         </>
       )}

       <div style={{ marginTop: 20, padding: 24, background: 'linear-gradient(135deg, #10B981, #3B82F6)', borderRadius: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#fff' }}>
             <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={18} /> Re-Calculate AI Roadmap
             </h4>
             <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 13 }}>Update your Skill Matrix to generate a fresh career development plan.</p>
          </div>
          <button onClick={generateRoadmap} style={{ padding: '10px 20px', borderRadius: 10, background: '#fff', border: 'none', color: '#3B82F6', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>Regenerate Plan</button>
       </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// TAB 3 — RESUME DATA GAP ANALYSIS (data-driven, no AI needed)
// Shows exactly which fields are missing in extracted resume data
// ─────────────────────────────────────────────────
function DeepGapAnalysisTab({ data, T }: { data: any, T: any }) {
  const { dark } = (window as any).__zenDark || { dark: false };
  // Get dark from T background color as fallback
  const isDark = T.bg === '#050B18' || T.bg?.includes('0,0,0') || T.card?.includes('30,41');

  // ── Build gap list from actual extracted data ──────────────────────────────
  const gaps: Array<{
    section: string;
    item: string;
    missing: string[];
    severity: 'high' | 'medium' | 'low';
  }> = [];

  // ── Check PROJECTS ──────────────────────────────────────────────────────────
  const projects = data.projects || [];
  if (projects.length === 0) {
    gaps.push({ section: 'Projects', item: 'No projects found', missing: ['Upload resume with work experience to extract projects'], severity: 'high' });
  } else {
    projects.forEach((p: any) => {
      const name = p.ProjectName || p.projectName || p.name || 'Unnamed Project';
      const missing: string[] = [];
      if (!p.StartDate && !p.startDate && !p.start_date)   missing.push('Start Date');
      if (!p.EndDate   && !p.endDate   && !p.end_date && !p.IsOngoing && !p.is_ongoing) missing.push('End Date');
      if (!p.Client    && !p.client)                        missing.push('Client Name');
      if (!p.Role      && !p.role)                          missing.push('Role / Designation');
      if (!p.Description && !p.description)                 missing.push('Project Description');
      if ((!p.Technologies || (Array.isArray(p.Technologies) && p.Technologies.length === 0)) &&
          (!p.technologies  || (Array.isArray(p.technologies)  && p.technologies.length  === 0))) {
        missing.push('Technologies Used');
      }
      if (missing.length > 0) {
        gaps.push({ section: 'Project', item: name, missing, severity: missing.length >= 3 ? 'high' : missing.length >= 2 ? 'medium' : 'low' });
      }
    });
  }

  // ── Check CERTIFICATIONS ────────────────────────────────────────────────────
  const certs = data.certifications || [];
  if (certs.length === 0) {
    gaps.push({ section: 'Certifications', item: 'No certifications found', missing: ['Add certifications to your resume or upload a resume with certifications'], severity: 'medium' });
  } else {
    certs.forEach((c: any) => {
      const name = c.CertName || c.certName || c.name || 'Unnamed Certification';
      const missing: string[] = [];
      if (!c.Provider && !c.issuingOrganization && !c.issuer) missing.push('Issuing Organization');
      if (!c.IssueDate && !c.issueDate && !c.issue_date)      missing.push('Issue Date');
      if (!c.CredentialID && !c.credentialId && !c.credential_id) missing.push('Credential ID');
      if (missing.length > 0) {
        gaps.push({ section: 'Certification', item: name, missing, severity: 'low' });
      }
    });
  }

  // ── Check EDUCATION ─────────────────────────────────────────────────────────
  const education = data.education || [];
  if (education.length === 0) {
    gaps.push({ section: 'Education', item: 'No education found', missing: ['Add education details to your resume'], severity: 'medium' });
  } else {
    education.forEach((e: any) => {
      const name = e.Degree || e.degree || 'Unnamed Degree';
      const missing: string[] = [];
      if (!e.Institution && !e.institution) missing.push('Institution Name');
      if (!e.FieldOfStudy && !e.fieldOfStudy && !e.field_of_study && !e.field) missing.push('Field of Study');
      if (!e.EndDate && !e.endDate && !e.end_date && !e.year) missing.push('Year / Duration');
      if (missing.length > 0) {
        gaps.push({ section: 'Education', item: name, missing, severity: 'low' });
      }
    });
  }

  // ── Check ACHIEVEMENTS ──────────────────────────────────────────────────────
  const achievements = data.achievements || [];
  achievements.forEach((a: any) => {
    const name = a.Title || a.title || 'Unnamed Achievement';
    const missing: string[] = [];
    if (!a.DateReceived && !a.dateReceived && !a.date_received) missing.push('Date Received');
    if (!a.Issuer && !a.issuer)                                  missing.push('Issuer / Organization');
    if (!a.Description && !a.description)                        missing.push('Description');
    if (missing.length > 0) {
      gaps.push({ section: 'Achievement', item: name, missing, severity: 'low' });
    }
  });

  // ── Check PROFILE ───────────────────────────────────────────────────────────
  const user = data.user || {};
  const profileMissing: string[] = [];
  if (!user.Phone && !user.phone)                                     profileMissing.push('Phone Number');
  if (!user.Location && !user.location)                               profileMissing.push('Location');
  if (!user.Designation && !user.designation)                         profileMissing.push('Designation / Job Title');
  if ((!user.YearsIT && !user.yearsIT) || (user.YearsIT === 0 && user.yearsIT === 0)) profileMissing.push('Years of Experience');
  if (profileMissing.length > 0) {
    gaps.push({ section: 'Profile', item: 'Your Profile', missing: profileMissing, severity: profileMissing.length >= 3 ? 'high' : 'medium' });
  }

  // ── Summary counts ──────────────────────────────────────────────────────────
  const highCount   = gaps.filter(g => g.severity === 'high').length;
  const mediumCount = gaps.filter(g => g.severity === 'medium').length;
  const lowCount    = gaps.filter(g => g.severity === 'low').length;
  const totalMissing = gaps.reduce((n, g) => n + g.missing.length, 0);

  const severityColor = (s: string) => s === 'high' ? '#EF4444' : s === 'medium' ? '#F59E0B' : '#3B82F6';
  const severityBg    = (s: string) => s === 'high' ? 'rgba(239,68,68,0.08)' : s === 'medium' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)';
  const severityBdr   = (s: string) => s === 'high' ? 'rgba(239,68,68,0.2)' : s === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)';
  const sectionIcon   = (s: string) => s === 'Project' ? '📁' : s === 'Certification' ? '🏆' : s === 'Education' ? '🎓' : s === 'Achievement' ? '⭐' : s === 'Profile' ? '👤' : s === 'Projects' ? '📁' : s === 'Certifications' ? '🏆' : '📋';

  return (
    <div style={{ animation: 'fadeUp 0.4s', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'Critical', count: highCount,   color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   bdr: 'rgba(239,68,68,0.2)'   },
          { label: 'Important', count: mediumCount, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', bdr: 'rgba(245,158,11,0.2)' },
          { label: 'Optional',  count: lowCount,    color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', bdr: 'rgba(59,130,246,0.2)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 18px', background: s.bg, border: `1px solid ${s.bdr}`, borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.count}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* No gaps message */}
      {gaps.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#10B981' }}>Resume is Complete!</div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>All extracted data has the required fields filled in.</div>
        </div>
      )}

      {/* Gap items */}
      {gaps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: T.sub, fontWeight: 700, padding: '6px 12px', background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', borderRadius: 8 }}>
            📋 {totalMissing} missing fields found across {gaps.length} items — fix these in your resume and re-upload
          </div>

          {/* Sort: high first, then medium, then low */}
          {[...gaps].sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.severity] - order[b.severity];
          }).map((gap, i) => (
            <div key={i} style={{ background: severityBg(gap.severity), border: `1px solid ${severityBdr(gap.severity)}`, borderRadius: 14, padding: '14px 18px', borderLeft: `4px solid ${severityColor(gap.severity)}` }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{sectionIcon(gap.section)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 6, background: severityColor(gap.severity) + '22', color: severityColor(gap.severity), textTransform: 'uppercase', letterSpacing: 1 }}>
                      {gap.section}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: T.text }}>{gap.item}</span>
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 900, color: severityColor(gap.severity), flexShrink: 0 }}>
                  {gap.missing.length} missing
                </span>
              </div>
              {/* Missing fields */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {gap.missing.map((field, fi) => (
                  <span key={fi} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: isDark ? 'rgba(0,0,0,0.3)' : '#fff', border: `1px solid ${severityBdr(gap.severity)}`, borderRadius: 8, fontSize: 11, fontWeight: 700, color: T.text }}>
                    <span style={{ color: severityColor(gap.severity) }}>✗</span> {field}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer note */}
      <div style={{ padding: '12px 16px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `1px solid ${T.bdr}`, borderRadius: 12, fontSize: 12, color: T.sub, lineHeight: 1.6 }}>
        💡 <strong style={{ color: T.text }}>How to fix:</strong> Update your resume with the missing details above, then re-upload via <strong style={{ color: T.text }}>ZenScan</strong> to refresh your profile data.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────
export default function AIIntelligencePage({ 
  isPopup: propIsPopup, 
  onTabChange: propOnTabChange 
}: { 
  isPopup?: boolean; 
  onTabChange?: (path: string) => void; 
}) {
  const { data, isLoading, isPopup: ctxIsPopup } = useApp();
  
  // Use props if provided, otherwise fall back to context
  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;
  const onTabChange = propOnTabChange || (() => {});
  
  const { dark } = useDark();
  const T = mkTheme(dark);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('coach');

  if (isLoading) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.sub }}>Syncing Intelligence Profile...</div>;
  if (!data?.user) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.sub }}>Authentication Required</div>;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '24px 24px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Back Button */}
        <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
        
        {/* Elite Profile Dashboard Header */}
        <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 24, padding: '24px 32px', marginBottom: 24 }}>
           <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 99, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', width: 'fit-content' }}>
                 <Sparkles size={12} color="#3B82F6" />
                 <span style={{ fontSize: 10, fontWeight: 800, color: '#3B82F6' }}>SECURE AI ANALYSIS</span>
              </div>
           </div>
           
           <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #6B2D8B, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{(data?.user?.Name || data?.user?.name || 'U')[0]}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                 <h1 style={{ margin: 0, fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, lineHeight: 1.2 }}>{data?.user?.Name || data?.user?.name}</h1>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                   <p style={{ margin: 0, fontSize: 13, color: T.sub, fontWeight: 500 }}>Zensar ID: {data?.user?.ZensarID || data?.user?.zensar_id || data?.user?.id || 'N/A'}</p>
                   <p style={{ margin: 0, fontSize: 13, color: T.sub, fontWeight: 500 }}>Email: {data?.user?.Email || data?.user?.email || 'N/A'}</p>
                 </div>
                 
                 <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                    <div>
                       <div style={{ fontSize: 20, fontWeight: 900 }}>{data?.overallScore || 0}%</div>
                       <div style={{ fontSize: 9, fontWeight: 700, color: T.muted }}>CAPABILITY</div>
                    </div>
                    <div>
                       <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981' }}>{data?.expertCount || 0}</div>
                       <div style={{ fontSize: 9, fontWeight: 700, color: T.muted }}>EXPERTS</div>
                    </div>
                    <div>
                       <div style={{ fontSize: 20, fontWeight: 800, color: '#8B5CF6' }}>{(data.certifications || []).length}</div>
                       <div style={{ fontSize: 9, fontWeight: 700, color: T.muted }}>CERTS</div>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Dynamic Nav Tabs — ZenAICoach, ZenPath (ZenGap and Resume Gaps removed) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 24, padding: 4, background: T.card, borderRadius: 16, width: '100%', border: `1px solid ${T.bdr}` }}>
          {[
            { id: 'coach', label: 'ZenAICoach', icon: Bot },
            { id: 'map',   label: 'ZenPath',    icon: Map },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 12, border: 'none',
                background: activeTab === t.id ? '#3B82F6' : 'transparent',
                color: activeTab === t.id ? '#fff' : T.sub,
                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: '0.2s'
              }}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'coach' && <CareerCoachTab data={data} T={T} />}
        {activeTab === 'map'   && <RoadmapTab data={data} T={T} />}

      </div>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
