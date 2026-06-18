import { API_BASE } from '@/lib/api';
/**
 * ProjectsPage.tsx — /employee/projects
 * Employee view to add/edit/delete projects.
 */
import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Plus, Trash2, Edit2, Calendar, MapPin, Users, Target, ChevronLeft } from 'lucide-react';
import { toast } from '@/lib/ToastContext';


const DOMAINS = ['Banking','Healthcare','E-Commerce','Insurance','Telecom','Other'];
const SKILLS = [ // simplified for multi-select
  'Selenium','Appium','JMeter','Postman','JIRA','TestRail',
  'Python','Java','JavaScript','TypeScript','C#','SQL',
  'API Testing','Mobile Testing','Performance Testing',
  'Security Testing','Database Testing','Git','Jenkins','Docker','Azure DevOps',
  'ChatGPT/Prompt Engineering','AI Test Automation',
];

export default function ProjectsPage({ 
  isPopup: propIsPopup, 
  onTabChange: propOnTabChange 
}: { 
  isPopup?: boolean; 
  onTabChange?: (path: string) => void; 
}) {
  const { dark } = useDark();
  const T = mkTheme(dark);
  const { data, reload, isPopup: ctxIsPopup, isLoading, setGlobalLoading } = useApp();
  
  // Use props if provided, otherwise fall back to context
  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;
  const onTabChange = propOnTabChange || (() => {});
  
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const activeEmpId = isPopup ? (data?.user?.id || data?.user?.ZensarID || employeeId) : employeeId;
  const [showModal, setShowModal] = useState(false);
  const [editingProj, setEditingProj] = useState<any>(null);

  const [form, setForm] = useState({
    ProjectName: '', Client: '', Domain: '', Role: '', StartDate: '', EndDate: '',
    IsOngoing: false, Description: '', TeamSize: 0, Outcome: '', SkillsUsed: [] as string[], Technologies: [] as string[], techInput: ''
  });

  const projects = data?.projects || [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ProjectName.trim() || !form.Role.trim()) return alert('Name and Role are required');

    setGlobalLoading('Saving project...');
    try {
      // Fix date format: YYYY-MM -> YYYY-MM-DD for PostgreSQL
      const fixDate = (d: string) => {
        if (!d) return null;
        if (d.length === 7) return `${d}-01`; // YYYY-MM -> YYYY-MM-DD
        if (d.length === 10) return d; // Already YYYY-MM-DD
        return d;
      };
      
      const fixedStartDate = fixDate(form.StartDate);
      const fixedEndDate = fixDate(form.EndDate);
      
      console.log('Saving project with dates:', { 
        originalStart: form.StartDate, 
        fixedStart: fixedStartDate,
        originalEnd: form.EndDate,
        fixedEnd: fixedEndDate 
      });
      
      const resp = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProj?.ID || editingProj?.id,
          EmployeeID: activeEmpId,
          employeeId: activeEmpId,
          ProjectName: form.ProjectName,
          Client: form.Client,
          Domain: form.Domain || 'Other',
          Role: form.Role,
          StartDate: fixedStartDate,
          EndDate: fixedEndDate,
          IsOngoing: form.IsOngoing,
          Description: form.Description,
          TeamSize: form.TeamSize,
          Outcome: form.Outcome,
          SkillsUsed: form.SkillsUsed,
          Technologies: form.Technologies,
        })
      });
      const res = await resp.json();
      if (res.success) {
        setShowModal(false);
        toast.success(editingProj ? 'Project updated successfully' : 'New project added to portfolio');
        await reload();
      } else {
        toast.error(res.error || 'Failed to sync project');
      }
    } catch (err) { 
      toast.error('Network error during project sync'); 
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDelete = async (project: any) => {
    if (!project.ID && !project.id) return;
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    setGlobalLoading('Deleting project...');
    try {
      const pid = project.ID || project.id;
      const resp = await fetch(`${API_BASE}/projects/${pid}`, { 
        method: 'DELETE'
      });
      const res = await resp.json();
      if (res.success) {
        toast.success('Project removed from portfolio');
        await reload();
      } else {
        toast.error(res.error || 'Failed to delete');
      }
    } catch (err) { 
      toast.error('Network failure during delete');
    } finally {
      setGlobalLoading(false);
    }
  };

  const openEdit = (p: any) => {
    setEditingProj(p);
    setForm({
      ProjectName: p.ProjectName || p.project_name || '', 
      Client: p.Client || p.client || '', 
      Domain: p.Domain || p.domain || DOMAINS[0], 
      Role: p.Role || p.role || '',
      StartDate: p.StartDate || p.start_date || '', 
      EndDate: p.EndDate || p.end_date || '', 
      IsOngoing: p.IsOngoing || p.is_ongoing || false,
      Description: p.Description || p.description || '', 
      TeamSize: p.TeamSize || p.team_size || 0, 
      Outcome: p.Outcome || p.outcome || '',
      SkillsUsed: Array.isArray(p.SkillsUsed) ? p.SkillsUsed : Array.isArray(p.skills_used) ? p.skills_used : [],
      Technologies: Array.isArray(p.Technologies) ? p.Technologies : Array.isArray(p.technologies) ? p.technologies : [],
      techInput: ''
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditingProj(null);
    setForm({
      ProjectName: '', Client: '', Domain: DOMAINS[0], Role: '', StartDate: '', EndDate: '',
      IsOngoing: false, Description: '', TeamSize: 0, Outcome: '', SkillsUsed: [], Technologies: [], techInput: ''
    });
    setShowModal(true);
  };

  const toggleSkill = (s: string) => {
    setForm(prev => ({
      ...prev, SkillsUsed: prev.SkillsUsed.includes(s) ? prev.SkillsUsed.filter(x => x !== s) : [...prev.SkillsUsed, s]
    }));
  };

  const pg = { minHeight: '100vh', background: T.bg, color: T.text, padding: '24px 24px 80px', fontFamily: "'Inter', sans-serif" };
  const cardStyle = { background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24, position: 'relative' as const };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, background: dark? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 12, color: T.sub, marginBottom: 6, display: 'block', fontWeight: 600 };

  if (isLoading) return <div style={pg}>Loading projects...</div>;

  return (
    <>
      
      <div style={pg}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isPopup && (
                <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <ChevronLeft size={16} /> Back
                </button>
              )}
              <div>
                <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, margin: '0 0 4px' }}>My Projects</h1>
                <div style={{ color: T.sub, fontSize: 13 }}>Your QI project portfolio</div>
              </div>
            </div>
            <button onClick={openNew} style={{ background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', border: 'none', padding: '10px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 4px 15px rgba(139,92,246,0.3)' }}>
              <Plus size={16} /> Add Project
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: T.muted }}>No projects added yet.</div>
            ) : projects.map((p, i) => (
              <div key={((p as any).ProjectName || (p as any).project_name || i) + i} style={{ ...cardStyle }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Briefcase size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, margin: '0 0 4px', fontWeight: 700 }}>{(p as any).ProjectName || (p as any).project_name || 'Untitled Project'}</h3>
                      <div style={{ fontSize: 13, color: T.sub, fontWeight: 500 }}>
                        {(p as any).Role || (p as any).role} <span style={{ opacity: 0.5 }}>·</span> {(p as any).Domain || (p as any).domain} {(p as any).Client || (p as any).client ? `· ${(p as any).Client || (p as any).client}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(p)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '6px', borderRadius: 6, color: T.sub, cursor: 'pointer' }}><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(p)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', padding: '6px', borderRadius: 6, color: '#EF4444', cursor: 'pointer' }}><Trash2 size={16}/></button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 24, fontSize: 13, color: T.sub, marginBottom: 20 }}>
                  {(() => {
                    const fmt = (d: string) => {
                      if (!d) return '';
                      // Handle ISO date: 2026-03-31T18:30:00.000Z -> 2026-03
                      if (d.includes('T')) return d.slice(0, 7);
                      // Handle YYYY-MM-DD: 2026-03-31 -> 2026-03
                      if (d.length === 10) return d.slice(0, 7);
                      return d;
                    };
                    const start = fmt((p as any).StartDate || (p as any).start_date);
                    const end = (p as any).IsOngoing || (p as any).is_ongoing ? 'Present' : fmt((p as any).EndDate || (p as any).end_date);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={14} color={T.muted} /> {start} — {end}
                      </div>
                    );
                  })()}
                  {((p as any).TeamSize || (p as any).team_size) > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} color={T.muted} /> {(p as any).TeamSize || (p as any).team_size} members</div>}
                </div>

                {((p as any).Description || (p as any).description) && (
                  <p style={{ fontSize: 14, color: T.text, lineHeight: 1.6, marginBottom: 20 }}>
                    {(p as any).Description || (p as any).description}
                  </p>
                )}

                {((p as any).Outcome || (p as any).outcome) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, background: 'rgba(16,185,129,0.05)', borderLeft: '3px solid #10B981', borderRadius: '0 8px 8px 0', marginBottom: 20, fontSize: 13 }}>
                    <Target size={16} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: T.text }}>{(p as any).Outcome || (p as any).outcome}</span>
                  </div>
                )}

                {(((p as any).SkillsUsed?.length > 0 || (p as any).skills_used?.length > 0) || ((p as any).Technologies?.length > 0 || (p as any).technologies?.length > 0)) && (
                  <div>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: T.muted, letterSpacing: 1, marginBottom: 8 }}>Skills & Tech Stack</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {((p as any).SkillsUsed || (p as any).skills_used || [])?.map((s: string) => <span key={s} style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{s}</span>)}
                      {((p as any).Technologies || (p as any).technologies || [])?.map((t: string) => <span key={t} style={{ background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, padding: '4px 10px', borderRadius: 20, fontSize: 12 }}>{t}</span>)}
                    </div>
                  </div>
                )}
                
                {((p as any).IsAIExtracted || (p as any).is_ai_extracted) && (
                  <div style={{ marginTop: 16, fontSize: 11, color: '#c084fc', display: 'flex', justifyContent: 'flex-end' }}>
                    🤖 AI Extracted
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: dark ? '#0f0f1a' : '#f5f5f5' }}>
          <div onClick={() => setShowModal(false)} style={{ position: 'absolute', inset: 0 }} />
          <form onSubmit={handleSave} style={{ position: 'relative', background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 20, width: '100%', maxWidth: 700, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', fontFamily: "'Inter', sans-serif", maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: '0 0 20px' }}>{editingProj ? 'Edit Project' : 'Add Project'}</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Project Name</label>
                  <input required style={inputStyle} value={form.ProjectName} onChange={e => setForm({...form, ProjectName: e.target.value})} placeholder="e.g. Banking App Automation" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Your Role</label>
                  <input required style={inputStyle} value={form.Role} onChange={e => setForm({...form, Role: e.target.value})} placeholder="e.g. Senior QA Engineer" />
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Client / Employer</label>
                  <input style={inputStyle} value={form.Client} onChange={e => setForm({...form, Client: e.target.value})} placeholder="e.g. HDFC Bank" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Domain</label>
                  <select style={inputStyle} value={form.Domain} onChange={e => setForm({...form, Domain: e.target.value})}>
                    {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Start Date</label>
                  <input type="month" style={inputStyle} value={form.StartDate} onChange={e => setForm({...form, StartDate: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>End Date</label>
                  <input type="month" disabled={form.IsOngoing} style={{...inputStyle, opacity: form.IsOngoing ? 0.3 : 1}} value={form.EndDate} onChange={e => setForm({...form, EndDate: e.target.value})} />
                </div>
                <div style={{ paddingTop: 30 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.sub, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.IsOngoing} onChange={e => setForm({...form, IsOngoing: e.target.checked})} />
                    Ongoing
                  </label>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea style={{...inputStyle, minHeight: 80, resize: 'vertical'}} value={form.Description} onChange={e => setForm({...form, Description: e.target.value})} placeholder="What was the project about?" />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>Outcome / Achievement</label>
                  <input style={inputStyle} value={form.Outcome} onChange={e => setForm({...form, Outcome: e.target.value})} placeholder="e.g. Reduced regression time by 60%" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Team Size</label>
                  <input type="number" min="0" style={inputStyle} value={form.TeamSize} onChange={e => setForm({...form, TeamSize: parseInt(e.target.value)||0})} />
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${T.bdr}`, paddingTop: 16, marginTop: 8 }}>
                <label style={labelStyle}>Skills Used (Select from Matrix)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {SKILLS.map(s => (
                    <button key={s} type="button" onClick={() => toggleSkill(s)} style={{ background: form.SkillsUsed.includes(s) ? 'rgba(59,130,246,0.1)' : 'transparent', border: `1px solid ${form.SkillsUsed.includes(s) ? '#3B82F6' : T.bdr}`, color: form.SkillsUsed.includes(s) ? '#3B82F6' : T.sub, borderRadius: 20, padding: '4px 10px', fontSize: 12, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {s}
                    </button>
                  ))}
                </div>
                <label style={labelStyle}>Other Technologies (Press Enter)</label>
                <input style={inputStyle} value={form.techInput} onChange={e => setForm({...form, techInput: e.target.value})} onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (form.techInput.trim() && !form.Technologies.includes(form.techInput.trim())) {
                      setForm(prev => ({ ...prev, Technologies: [...prev.Technologies, prev.techInput.trim()], techInput: '' }));
                    }
                  }
                }} placeholder="e.g. React, MongoDB" />
                {form.Technologies.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {form.Technologies.map(t => (
                      <span key={t} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.bdr}`, color: T.sub, padding: '2px 8px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {t} <Trash2 size={12} style={{cursor:'pointer'}} onClick={() => setForm(prev => ({...prev, Technologies: prev.Technologies.filter(x=>x!==t)}))} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.text, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button type="submit" style={{ flex: 1, padding: 12, background: 'linear-gradient(135deg, #10B981, #3B82F6)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 600, boxShadow: '0 8px 16px rgba(16,185,129,0.2)' }}>Save Project</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

