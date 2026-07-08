import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEmployee, computeCompletion, saveSkillRatings } from '@/lib/localDB';
import { useDark, mkTheme } from '@/lib/themeContext';
import { apiGetSkills, apiGetEmployee, isServerAvailable, API_BASE, req } from '@/lib/api';
import type { Employee } from '@/lib/types';
import type { ProficiencyLevel } from '@/lib/types';
import { ArrowLeft, Download, CheckCircle2, Clock, User, Mail, Phone,
  Briefcase, MapPin, TrendingUp, Loader2, Bot, Brain, Zap, Award, ExternalLink,
  GraduationCap,
} from 'lucide-react';
import { toast } from '@/lib/ToastContext';
import { exportEmployeeToExcel } from '@/lib/localDB';
import { computeSkillPriorities, generateCareerInsight, recommendCertifications } from '@/lib/aiIntelligence';
import { formatZensarId, extractZensarId, formatEmployeeDisplay } from '@/lib/zensarIdUtils';

const CAT_COLOR: Record<string, string> = {
  Tool: '#3B82F6', Technology: '#8B5CF6', Application: '#10B981',
  Domain: '#F59E0B', TestingType: '#EF4444', DevOps: '#06B6D4', AI: '#EC4899',
};
const LVL_COLOR: Record<number, string> = { 0: '#4B5563', 1: '#D97706', 2: '#2563EB', 3: '#059669' };
const LVL_LABEL: Record<number, string> = { 0: 'Not Rated', 1: 'Beginner', 2: 'Intermediate', 3: 'Expert' };

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [emp, setEmp] = useState<Employee | null | undefined>(undefined); // undefined = loading
  const [certs, setCerts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [education, setEducation] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillMatrixModal, setSkillMatrixModal] = useState<{ employee: any; skills: any[] } | null>(null);

  // ── Re-assessment access (admin one-time cooldown bypass) ──────────────────
  const [grantedSkills, setGrantedSkills] = useState<string[]>([]);   // active (unused) grants
  const [selectedGrant, setSelectedGrant] = useState<Set<string>>(new Set());
  const [grantBusy, setGrantBusy] = useState(false);

  const loadGrants = async (empId: string) => {
    try {
      const r = await req<{ grants: { skill_name: string }[] }>('GET', `/zenassess/retake-grants/${empId}`);
      setGrantedSkills((r.grants || []).map(g => g.skill_name));
    } catch { setGrantedSkills([]); }
  };
  useEffect(() => { if (id) loadGrants(id); }, [id]);

  const toggleGrantSel = (skill: string) =>
    setSelectedGrant(prev => { const n = new Set(prev); n.has(skill) ? n.delete(skill) : n.add(skill); return n; });

  const handleGrantRetake = async () => {
    const skills = Array.from(selectedGrant);
    if (skills.length === 0 || !id) return;
    setGrantBusy(true);
    try {
      await req('POST', '/admin/zenassess/grant-retake', { employeeId: id, skills });
      toast.success(`Re-assessment granted for ${skills.length} skill${skills.length > 1 ? 's' : ''}.`);
      setSelectedGrant(new Set());
      await loadGrants(id);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to grant re-assessment.');
    } finally { setGrantBusy(false); }
  };

  const handleRevokeRetake = async (skill: string) => {
    if (!id) return;
    setGrantBusy(true);
    try {
      await req('POST', '/admin/zenassess/revoke-retake', { employeeId: id, skills: [skill] });
      toast.success(`Re-assessment access revoked for ${skill}.`);
      await loadGrants(id);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to revoke.');
    } finally { setGrantBusy(false); }
  };

  useEffect(() => {
    if (!id) { setEmp(null); setLoading(false); return; }

    async function load() {
      setLoading(true);

      let employeeData: Employee | null = null;

      // Try to fetch data from backend
      try {
        const serverUp = await isServerAvailable();
        if (serverUp) {
          // Try fetching from main employee API
          const serverEmp = await apiGetEmployee(id!);
          
          if (serverEmp) {
            // Employee found in main API
            employeeData = {
              id:                serverEmp.ZensarID || serverEmp.id || serverEmp.ID,
              name:              serverEmp.Name || serverEmp.name || '',
              email:             serverEmp.Email || serverEmp.email || '',
              phone:             (serverEmp as any).Phone || (serverEmp as any).phone || '',
              designation:       (serverEmp as any).Designation || (serverEmp as any).designation || '',
              department:        (serverEmp as any).Department || (serverEmp as any).department || '',
              location:          (serverEmp as any).Location || (serverEmp as any).location || '',
              yearsIT:           Number(serverEmp.YearsIT ?? serverEmp.yearsIT ?? 0),
              yearsZensar:       Number(serverEmp.YearsZensar ?? serverEmp.yearsZensar ?? 0),
              primarySkill:      serverEmp.primarySkill || '',
              primaryDomain:     serverEmp.primaryDomain || '',
              overallCapability: Number(serverEmp.overallCapability ?? 0),
              submitted:         String(serverEmp.Submitted || serverEmp.submitted) === 'Yes',
              resumeUploaded:    String(serverEmp.resumeUploaded) === 'Yes',
              skills: [], // Will be populated from backend APIs
            };
          } else {
            // Not in main API, try BFSI workforce data
            console.log(`❌ Employee ${id} not found in main API, checking BFSI workforce...`);
            try {
              const bfsiRes = await fetch(`${API_BASE}/bfsi/workforce`);
              if (bfsiRes.ok) {
                const bfsiData = await bfsiRes.json();
                const bfsiEmployee = (bfsiData.workforce || []).find((w: any) => 
                  String(w.employee_id) === String(id)
                );
                
                if (bfsiEmployee) {
                  console.log(`✅ Found employee in BFSI workforce data`);
                  // Create employee from BFSI data
                  employeeData = {
                    id: String(bfsiEmployee.employee_id),
                    name: bfsiEmployee.employee_name || 'Unknown',
                    email: bfsiEmployee.email || '',
                    phone: '',
                    designation: bfsiEmployee.designation || '',
                    department: 'BFSI',
                    location: bfsiEmployee.location || '',
                    yearsIT: 0,
                    yearsZensar: 0,
                    primarySkill: bfsiEmployee.primary_skill || '',
                    primaryDomain: '',
                    overallCapability: 0,
                    submitted: false,
                    resumeUploaded: false,
                    skills: [],
                  };
                }
              }
            } catch (error) {
              console.log(`❌ Error checking BFSI workforce:`, error);
            }
          }

          if (employeeData) {
            // Fetch and merge skills from Skill Matrix
            const apiSkills = await apiGetSkills(id!);
            console.log(`🎯 Skill Matrix API Response:`, {
              skillsCount: apiSkills.length,
              skills: apiSkills,
              employeeId: id
            });
            
            if (apiSkills.length > 0) {
              console.log(`✅ Processing ${apiSkills.length} Skill Matrix skills`);
              employeeData.skills = apiSkills.map(s => ({
                skillId:       s.skillId,
                selfRating:    s.selfRating as ProficiencyLevel,
                managerRating: s.managerRating as ProficiencyLevel | null,
                validated:     s.validated,
                skillName:     s.skillName || s.skill_name, // Add skill name for display
                source:        'Skill Matrix'
              }));
              console.log(`✅ Merged skills:`, employeeData.skills);
            } else {
              console.log(`❌ No Skill Matrix skills found for employee ${id}`);
              // Try direct API call to double-check
              try {
                const directSkillsRes = await fetch(`${API_BASE}/employees/${id}/skills`);
                if (directSkillsRes.ok) {
                  const directSkills = await directSkillsRes.json();
                  console.log(`🔍 Direct API call result:`, {
                    status: directSkillsRes.status,
                    skillsCount: directSkills.length,
                    skills: directSkills
                  });
                  
                  if (directSkills.length > 0) {
                    console.log(`✅ Found skills via direct API call - updating merged data`);
                    employeeData.skills = directSkills.map((s: any, index: number) => ({
                      skillId:       s.skillId || `skill_${index}`,
                      selfRating:    (s.selfRating || s.self_rating || 0) as ProficiencyLevel,
                      managerRating: (s.managerRating || s.manager_rating || null) as ProficiencyLevel | null,
                      validated:     s.validated || false,
                      skillName:     s.skillName || s.skill_name || 'Unknown Skill',
                      source:        'Skill Matrix'
                    }));
                    console.log(`✅ Updated merged skills from direct API:`, employeeData.skills);
                  }
                } else {
                  console.log(`❌ Direct API call failed: ${directSkillsRes.status}`);
                }
              } catch (directError) {
                console.log(`❌ Direct API call error:`, directError);
              }
            }

            // Also try to fetch BFSI workforce skills (Excel L1-L4 data)
            try {
              console.log(`🔍 Fetching BFSI workforce data for employee ID: ${id}`);
              const bfsiRes = await fetch(`${API_BASE}/bfsi/workforce`);
              if (bfsiRes.ok) {
                const bfsiData = await bfsiRes.json();
                console.log(`📊 BFSI API Response:`, {
                  totalWorkforce: bfsiData.workforce?.length || 0,
                  searchingForId: id
                });
                
                const bfsiEmployee = (bfsiData.workforce || []).find((w: any) => {
                  const match = String(w.employee_id) === String(id) || String(w.employee_id) === String(employeeData!.id);
                  if (match) {
                    console.log(`✅ Found BFSI employee match:`, {
                      employee_id: w.employee_id,
                      employee_name: w.employee_name,
                      primary_skill: w.primary_skill,
                      current_skills: w.current_skills,
                      current_skills_type: typeof w.current_skills,
                      current_skills_length: w.current_skills?.length || 0,
                      status: w.status
                    });
                  }
                  return match;
                });
                
                if (bfsiEmployee) {
                  console.log(`🎯 BFSI Employee found:`, bfsiEmployee.employee_name);
                  
                  // Handle current_skills - could be array or string
                  let currentSkills = [];
                  if (bfsiEmployee.current_skills) {
                    if (Array.isArray(bfsiEmployee.current_skills)) {
                      currentSkills = bfsiEmployee.current_skills.filter(skill => skill && skill.trim() !== '');
                    } else if (typeof bfsiEmployee.current_skills === 'string') {
                      // Handle case where it might be a string representation
                      try {
                        const parsed = JSON.parse(bfsiEmployee.current_skills);
                        if (Array.isArray(parsed)) {
                          currentSkills = parsed.filter(skill => skill && skill.trim() !== '');
                        }
                      } catch {
                        // If not JSON, treat as comma-separated string
                        currentSkills = bfsiEmployee.current_skills.split(',').map(s => s.trim()).filter(s => s);
                      }
                    }
                  }
                  
                  console.log(`🎯 Processed current_skills:`, {
                    original: bfsiEmployee.current_skills,
                    processed: currentSkills,
                    count: currentSkills.length
                  });
                  
                  // If no Skill Matrix skills, create skills from Excel data
                  if (apiSkills.length === 0 && currentSkills.length > 0) {
                    employeeData!.skills = currentSkills.map((skillName: string, index: number) => ({
                      skillId: `excel_${index}`,
                      skillName: skillName,
                      selfRating: 2 as ProficiencyLevel, // Default to Intermediate for Excel skills
                      managerRating: null,
                      validated: false,
                      source: 'Excel L1-L4'
                    }));
                    console.log(`✅ Created ${employeeData!.skills.length} skills from Excel data`);
                  }
                  
                  // Store BFSI data for display (always store, even if empty)
                  (employeeData as any).bfsiData = {
                    primary_skill: bfsiEmployee.primary_skill,
                    current_skills: currentSkills,
                    location: bfsiEmployee.location,
                    status: bfsiEmployee.status
                  };
                  
                  console.log(`✅ BFSI data stored:`, (employeeData as any).bfsiData);
                } else {
                  console.log(`❌ No BFSI workforce data found for employee ${id}`);
                  console.log(`🔍 Available employee IDs:`, (bfsiData.workforce || []).slice(0, 10).map((w: any) => ({
                    id: w.employee_id,
                    name: w.employee_name
                  })));
                }
              } else {
                console.log(`❌ BFSI workforce API failed: ${bfsiRes.status} ${bfsiRes.statusText}`);
              }
            } catch (error) {
              console.log(`❌ Error fetching BFSI workforce data:`, error);
            }
          }

          // Fetch additional data (Certifications, Projects, Education, Achievements)
          if (employeeData) {
            // Fetch Certifications
            const certRes = await fetch(`${API_BASE}/certifications/${id}`);
            if (certRes.ok) {
              const cData = await certRes.json();
              setCerts(cData.certifications || []);
              console.log(`✅ Certifications loaded: ${cData.certifications?.length || 0}`);
            } else {
              console.log(`❌ Certifications API failed: ${certRes.status}`);
            }

            // Fetch Projects
            const projRes = await fetch(`${API_BASE}/projects/${id}`);
            if (projRes.ok) {
              const pData = await projRes.json();
              setProjects(pData.projects || []);
              console.log(`✅ Projects loaded: ${pData.projects?.length || 0}`);
            } else {
              console.log(`❌ Projects API failed: ${projRes.status}`);
            }

            // Fetch Education
            const eduRes = await fetch(`${API_BASE}/education/${id}`);
            if (eduRes.ok) {
              const eData = await eduRes.json();
              setEducation(eData.education || []);
              console.log(`✅ Education loaded: ${eData.education?.length || 0}`);
            } else {
              console.log(`❌ Education API failed: ${eduRes.status}`);
            }

            // Fetch Achievements
            const achRes = await fetch(`${API_BASE}/achievements/${id}`);
            if (achRes.ok) {
              const aData = await achRes.json();
              setAchievements(aData.achievements || []);
              console.log(`✅ Achievements loaded: ${aData.achievements?.length || 0}`);
            } else {
              console.log(`❌ Achievements API failed: ${achRes.status}`);
            }
          }
        }
      } catch (error) { 
        console.log(`❌ Error loading employee data:`, error);
      }

      setEmp(employeeData);
      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: dark ? '#050B18' : '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={40} color="#3B82F6" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!emp) {
    return (
      <div style={{ minHeight: '100vh', background: dark ? '#050B18' : '#F0F4FF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: dark ? '#9CA3AF' : '#6B7280', fontFamily: "'Inter',sans-serif" }}>
        <User size={48} />
        <div style={{ fontSize: 20, fontWeight: 700 }}>Employee not found</div>
        <div style={{ fontSize: 13 }}>This employee doesn't exist or hasn't been synced yet.</div>
        <button onClick={() => navigate(-1)} style={{ marginTop: 8, padding: '10px 22px', borderRadius: 10, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          ← Go Back
        </button>
      </div>
    );
  }

  const ratedCompletion = computeCompletion(emp.skills);
  const completion = Math.max(ratedCompletion, emp.overallCapability);
  
  // Get skills from Skill Matrix (with skillName property)
  const skillMatrixSkills = emp.skills.filter(s => 
    (s as any).source === 'Skill Matrix' || 
    (s.selfRating && s.selfRating > 0 && (s as any).skillName)
  );
  
  // REMOVED: Don't use SKILLS constant (mock data)
  // const ratedSkills = SKILLS.filter(s => (emp.skills.find(r => r.skillId === s.id)?.selfRating ?? 0) > 0);
  
  console.log(`📊 Skills breakdown:`, {
    skillMatrixSkills: skillMatrixSkills.length,
    excelSkills: (emp as any).bfsiData?.current_skills?.length || 0,
    primarySkill: (emp as any).bfsiData?.primary_skill ? 1 : 0
  });
  
  // Define categories without using SKILLS constant
  const categories = ['Tool', 'Technology', 'Application', 'Domain', 'TestingType', 'DevOps', 'AI'];

  const card: React.CSSProperties = {
    background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: '20px 24px',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'Inter',sans-serif", transition: 'background 0.35s' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* Back */}
        <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24, padding: '8px 16px', borderRadius: 9, background: T.card, border: `1px solid ${T.bdr}`, color: T.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={15} /> Back
        </button>

        {/* ── Profile Header ── */}
        <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: "'Space Grotesk',sans-serif", margin: 0 }}>{emp.name}</h1>
              {emp.submitted
                ? <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}>✓ Submitted</span>
                : <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }}>⏳ Pending</span>
              }
            </div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 10 }}>
              ID: {formatZensarId(emp.id)} · {emp.designation} · {emp.department}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {emp.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.muted }}><Mail size={12}/>{emp.email}</span>}
              {emp.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.muted }}><Phone size={12}/>{emp.phone}</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.muted }}><MapPin size={12}/>{emp.location || 'Remote'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.muted }}><Briefcase size={12}/>{emp.yearsIT}y IT · {emp.yearsZensar}y Zensar</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 70, height: 70, margin: '0 auto 4px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.915" fill="none" stroke={dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'} strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke={completion >= 70 ? '#10B981' : completion >= 40 ? '#F59E0B' : '#EF4444'} strokeWidth="3.5"
                  strokeDasharray={`${completion} ${100 - completion}`} strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{completion}%</div>
            </div>
            <div style={{ fontSize: 10, color: T.muted }}>Readiness</div>
          </div>
        </div>

        {/* ── Re-assessment Access (admin one-time cooldown bypass) ── */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Clock size={18} color="#F59E0B" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Re-assessment Access</h3>
            <span style={{ fontSize: 12, color: T.muted, marginLeft: 'auto' }}>One-time cooldown bypass</span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: T.sub, lineHeight: 1.55 }}>
            Employees must wait 7 days between attempts (🔴 “Re-assessment available on …”). Grant a one-time pass so this employee can re-assess a skill immediately — the pass is consumed on their next attempt, then the normal cooldown resumes.
          </p>
          {(() => {
            const names: string[] = Array.from(new Set(
              skillMatrixSkills.map((s: any) => ((s.skillName || '') as string).trim()).filter(Boolean)
            ));
            if (names.length === 0) {
              return <div style={{ fontSize: 12, color: T.muted }}>No skills available for this employee yet.</div>;
            }
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
                  {names.map(name => {
                    const active = grantedSkills.some(g => g.toLowerCase() === name.toLowerCase());
                    const sel = selectedGrant.has(name);
                    return (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${active ? 'rgba(16,185,129,0.4)' : sel ? '#3B82F6' : T.bdr}`, background: active ? 'rgba(16,185,129,0.06)' : sel ? 'rgba(59,130,246,0.06)' : T.card }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: active ? 'default' : 'pointer', flex: 1, minWidth: 0 }}>
                          {!active && <input type="checkbox" checked={sel} onChange={() => toggleGrantSel(name)} style={{ accentColor: '#3B82F6' }} />}
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        </label>
                        {active && (
                          <button onClick={() => handleRevokeRetake(name)} disabled={grantBusy} title="Revoke this grant" style={{ fontSize: 10, fontWeight: 800, color: '#10B981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>GRANTED ✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={handleGrantRetake} disabled={grantBusy || selectedGrant.size === 0} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: selectedGrant.size === 0 ? T.bdr : 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: selectedGrant.size === 0 ? 'not-allowed' : 'pointer', opacity: grantBusy ? 0.7 : 1 }}>
                    {grantBusy ? 'Working…' : `Grant re-assessment${selectedGrant.size ? ` (${selectedGrant.size})` : ''}`}
                  </button>
                  {grantedSkills.length > 0 && <span style={{ fontSize: 12, color: T.sub }}>{grantedSkills.length} active grant{grantedSkills.length > 1 ? 's' : ''}</span>}
                </div>
              </>
            );
          })()}
        </div>

        {/* ── Technical Proficiency Matrix ── temporarily hidden */}
        {false && <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <TrendingUp size={18} color="#3B82F6" />
            <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Technical Proficiency Matrix</h3>
            <span style={{ fontSize: 12, color: T.muted, marginLeft: 'auto' }}>
              {skillMatrixSkills.length} Skills from Zen Matrix
            </span>
            {/* Zen Matrix Button */}
            <button
              onClick={async () => {
                console.log(`🎯 Opening Zen Matrix for employee: ${emp.name} (${emp.id})`);
                try {
                  const skills = await fetch(`${API_BASE}/employees/${emp.id}/skills`).then(r => r.ok ? r.json() : []).catch(() => []);
                  console.log(`📊 Zen Matrix skills fetched:`, skills);
                  setSkillMatrixModal({ employee: emp, skills });
                } catch (error) {
                  console.error('❌ Error fetching Zen Matrix skills:', error);
                  toast.error('Failed to load Zen Matrix data');
                }
              }}
              style={{ 
                padding: '8px 16px', 
                background: 'linear-gradient(135deg,#10b981,#059669)', 
                color: '#fff', 
                borderRadius: 10, 
                fontSize: 12, 
                fontWeight: 900, 
                border: 'none', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                transition: '0.3s',
                boxShadow: '0 2px 8px rgba(16,185,129,0.25)'
              }}
            >
              <GraduationCap size={16} />
              Zen Matrix
            </button>
          </div>
          
          {/* Debug Information */}
          {process.env.NODE_ENV === 'development' && (
            <div style={{ marginBottom: 16, padding: 12, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 8, fontSize: 11, color: T.sub }}>
              <strong>Debug Info:</strong> Zen Matrix Skills Only: {skillMatrixSkills.length}
            </div>
          )}
          
          {/* Show Skill Matrix skills if available */}
          {skillMatrixSkills.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🔵 Zen Matrix (Resume Upload) - {skillMatrixSkills.length} skills
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {skillMatrixSkills.map((skill, index) => {
                  const skillName = (skill as any).skillName || `Skill ${index + 1}`;
                  const lvl = skill.selfRating ?? 0;
                  return (
                    <div key={index} style={{ padding: '12px', borderRadius: 10, background: `${LVL_COLOR[lvl]}08`, border: `1px solid ${LVL_COLOR[lvl]}25`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>{skillName}</span>
                      <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:20, background:`${LVL_COLOR[lvl]}15`, color:LVL_COLOR[lvl] }}>{LVL_LABEL[lvl]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🔵 Zen Matrix (Resume Upload) - No data
              </div>
              <div style={{ padding: '16px 20px', background: dark ? 'rgba(107,114,128,0.1)' : 'rgba(107,114,128,0.05)', borderRadius: 12, border: '1px solid rgba(107,114,128,0.2)' }}>
                <div style={{ fontSize: 13, color: T.sub, marginBottom: 8 }}>
                  <strong>No Zen Matrix data found</strong>
                </div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
                  This employee hasn't uploaded their resume or completed skill assessments in the Zen Matrix system. 
                  Click the "Zen Matrix" button above to check for any available data or to understand why it's missing.
                </div>
              </div>
            </div>
          )}
          
          {/* Show Excel L1-L4 skills if available */}
          {(emp as any).bfsiData?.current_skills && Array.isArray((emp as any).bfsiData.current_skills) && (emp as any).bfsiData.current_skills.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🟡 Excel L1-L4 Skills (Workforce Data) - {(emp as any).bfsiData.current_skills.length} skills
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {(emp as any).bfsiData.current_skills.map((skillName: string, index: number) => (
                  <div key={index} style={{ padding: '12px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{skillName}</span>
                    <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:20, background:'rgba(245,158,11,0.15)', color:'#F59E0B' }}>Excel Data</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Show primary skill if available */}
          {(emp as any).bfsiData?.primary_skill && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8B5CF6', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🟣 Primary Skill (BFSI Data)
              </div>
              <div style={{ padding: '12px', borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize:14, fontWeight:700 }}>{(emp as any).bfsiData.primary_skill}</span>
                <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:20, background:'rgba(139,92,246,0.15)', color:'#8B5CF6' }}>Primary</span>
              </div>
            </div>
          )}
          
          {/* Show message if no skills found */}
          {skillMatrixSkills.length === 0 && !(emp as any).bfsiData?.current_skills?.length && !(emp as any).bfsiData?.primary_skill && (
            <div style={{ textAlign: 'center', padding: '40px', color: T.muted }}>
              <TrendingUp size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Skills Data Found</div>
              <div style={{ fontSize: 13 }}>This employee hasn't uploaded their resume or skills to the system yet.</div>
              <div style={{ fontSize: 11, marginTop: 8, color: T.sub }}>
                Employee ID: {id} • Check console for debugging information
              </div>
            </div>
          )}
        </div>}

        {/* REMOVED: Skill Category Breakdown section */}

        {/* ── AI Intelligence Panel ── */}
        {/* REMOVED: AI Intelligence Panel - showing only real data from database */}

        {/* ── Certifications & Projects ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 32 }}>
           <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                 <Award size={20} color="#F59E0B" />
                 <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Certified Professional Qualifications</h3>
              </div>
              <div style={{ display:'grid', gap:10 }}>
                 {certs.length === 0 ? <div style={{color:T.muted, fontSize:13}}>No valid certifications found.</div> : certs.map((c, i) => (
                   <div key={i} style={{ padding:14, borderRadius:12, background:dark?'rgba(255,255,255,0.03)':'#fafafa', border:`1px solid ${T.bdr}` }}>
                      <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{c.CertName}</div>
                      <div style={{ fontSize:12, color:T.sub }}>{c.Provider} · Issued: {c.IssueDate}</div>
                      {c.CredentialURL && <a href={c.CredentialURL} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#3B82F6', marginTop:4, display:'inline-block' }}>View Credential →</a>}
                   </div>
                 ))}
              </div>
           </div>
           <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                 <Briefcase size={20} color="#3B82F6" />
                 <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Project Portfolio</h3>
              </div>
              <div style={{ display:'grid', gap:10 }}>
                 {projects.length === 0 ? <div style={{color:T.muted, fontSize:13}}>No projects found.</div> : projects.map((p, i) => (
                   <div key={i} style={{ padding:14, borderRadius:12, background:dark?'rgba(255,255,255,0.03)':'#fafafa', border:`1px solid ${T.bdr}` }}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{p.ProjectName}</div>
                      <div style={{ fontSize:12, color:T.sub }}>{p.Role} · {p.StartDate} - {p.EndDate || 'Present'}</div>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* ── Education & Achievements ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 32 }}>
           <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                 <GraduationCap size={20} color="#8B5CF6" />
                 <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Educational Background</h3>
              </div>
              <div style={{ display:'grid', gap:10 }}>
                 {education.length === 0 ? <div style={{color:T.muted, fontSize:13}}>No education records found.</div> : education.map((e, i) => (
                   <div key={i} style={{ padding:14, borderRadius:12, background:dark?'rgba(255,255,255,0.03)':'#fafafa', border:`1px solid ${T.bdr}` }}>
                      <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{e.Degree}</div>
                      <div style={{ fontSize:12, color:T.sub, marginBottom:4 }}>{e.Institution}</div>
                      {e.FieldOfStudy && <div style={{ fontSize:11, color:T.muted }}>Field: {e.FieldOfStudy}</div>}
                      {e.StartDate && <div style={{ fontSize:11, color:T.muted }}>{e.StartDate} - {e.EndDate || 'Present'}</div>}
                      {e.Grade && <div style={{ fontSize:11, color:'#10B981', fontWeight:600 }}>Grade: {e.Grade}</div>}
                   </div>
                 ))}
              </div>
           </div>
           <div style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                 <Award size={20} color="#10B981" />
                 <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Awards & Achievements</h3>
              </div>
              <div style={{ display:'grid', gap:10 }}>
                 {achievements.length === 0 ? <div style={{color:T.muted, fontSize:13}}>No achievements found.</div> : achievements.map((a, i) => (
                   <div key={i} style={{ padding:14, borderRadius:12, background:dark?'rgba(255,255,255,0.03)':'#fafafa', border:`1px solid ${T.bdr}` }}>
                      <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{a.AwardTitle}</div>
                      <div style={{ fontSize:12, color:T.sub, marginBottom:4 }}>{a.AwardingOrganization}</div>
                      {a.DateReceived && <div style={{ fontSize:11, color:T.muted }}>Received: {a.DateReceived}</div>}
                      {a.ProjectContext && <div style={{ fontSize:11, color:'#3B82F6', marginTop:4 }}>Project: {a.ProjectContext}</div>}
                      {a.Description && <div style={{ fontSize:11, color:T.muted, marginTop:4, lineHeight:1.4 }}>{a.Description}</div>}
                   </div>
                 ))}
              </div>
           </div>
        </div>

      </div>

      {/* ── Skill Matrix Modal ── */}
      {skillMatrixModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(10px)' }} onClick={() => setSkillMatrixModal(null)}>
          <div style={{ background: T.cardSolid, borderRadius: 24, border: `1px solid ${T.bdr}`, maxWidth: 600, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Zen Matrix - Skill Matrix</div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>
                  {skillMatrixModal.employee.name} ({formatZensarId(skillMatrixModal.employee.id)})
                </h3>
              </div>
              <button onClick={() => setSkillMatrixModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 32, overflowY: 'auto', flex: 1 }}>
              {skillMatrixModal.skills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: T.sub }}>
                  <GraduationCap size={48} color={T.bdr} style={{ margin: '0 auto 16px' }} />
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No Skills Found in Zen Matrix</div>
                  <div style={{ fontSize: 13, marginBottom: 16 }}>This employee hasn't uploaded their resume or skills to the Skill Matrix system yet.</div>
                  <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                    <strong>What is Zen Matrix?</strong><br/>
                    Zen Matrix is the skill assessment system where employees upload their resumes and rate their technical skills. 
                    This provides the most current and accurate skill data compared to older Excel workforce data.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: T.sub, fontWeight: 700, marginBottom: 8 }}>
                    {skillMatrixModal.skills.length} skills from resume upload
                  </div>
                  {skillMatrixModal.skills.map((skill: any, idx: number) => {
                    const rating = skill.selfRating || skill.self_rating || 0;
                    const skillName = skill.skillName || skill.skill_name || 'Unknown Skill';
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: dark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 12, border: `1px solid ${T.bdr}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                            {idx + 1}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{skillName}</div>
                            <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>Self-rated proficiency</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: rating === 3 ? '#10B981' : rating === 2 ? '#F59E0B' : '#3B82F6' }}>
                            L{rating}
                          </div>
                          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700 }}>
                            {rating === 3 ? 'Expert' : rating === 2 ? 'Intermediate' : rating === 1 ? 'Beginner' : 'Not Rated'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
