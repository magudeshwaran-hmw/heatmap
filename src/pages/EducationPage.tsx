import { API_BASE } from '@/lib/api';
/**
 * EducationPage.tsx
 * Professional Academic Portfolio for Employees.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useNavigate } from 'react-router-dom';
import { useDark, mkTheme } from '@/lib/themeContext';
import { GraduationCap, MapPin, Calendar, Plus, Trash2, Edit2, Layout, BookOpen, Clock, ChevronLeft } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { toast } from '@/lib/ToastContext';

export default function EducationPage({ 
  isPopup: propIsPopup, 
  onTabChange: propOnTabChange 
}: { 
  isPopup?: boolean; 
  onTabChange?: (path: string) => void; 
}) {
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const { dark } = useDark();
  const T = mkTheme(dark);
  const { data, isPopup: ctxIsPopup, isLoading, setGlobalLoading } = useApp();
  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;
  const activeEmpId = isPopup ? (data?.user?.id || data?.user?.zensar_id || data?.user?.ZensarID || employeeId) : employeeId;

  const [eduList, setEduList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    degree: '',
    institution: '',
    fieldOfStudy: '',
    startDate: '',
    endDate: '',
    description: ''
  });

  useEffect(() => {
    loadEducation();
  }, [activeEmpId]);

  const loadEducation = async () => {
    if (!activeEmpId) return;
    try {
      const res = await fetch(`${API_BASE}/education/${activeEmpId}`);
      const data = await res.json();
      setEduList(data.education || []);
    } catch (err) {
      toast.error('Network Error: Failed to sync academic records');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.degree || !formData.institution) {
      toast.error('Verification Error: Degree and Institution are mandatory');
      return;
    }

    try {
      // Fix date format: YYYY-MM -> YYYY-MM-DD for PostgreSQL
      const fixDate = (d: string) => d && d.length === 7 ? `${d}-01` : d;
      
      const res = await fetch(`${API_BASE}/education`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id: editingId || undefined,
          startDate: fixDate(formData.startDate),
          endDate: fixDate(formData.endDate),
          employeeId: activeEmpId
        })
      });

      if (res.ok) {
        toast.success(editingId ? 'Academic Record Updated' : 'Academic Portfolio Updated');
        setIsAdding(false);
        setEditingId(null);
        setFormData({ degree: '', institution: '', fieldOfStudy: '', startDate: '', endDate: '', description: '' });
        loadEducation();
      }
    } catch (err) {
      toast.error('Sync Error: Failed to persist record');
    }
  };

  const handleDelete = async (id: any) => {
    if (!id) {
      toast.error('Error: Education ID is missing');
      return;
    }
    if (!window.confirm('Are you sure you want to remove this academic credential?')) return;
    try {
      const res = await fetch(`${API_BASE}/education/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        toast.success('Credential Removed');
        loadEducation();
      } else {
        const errorText = await res.text().catch(() => 'Unknown error');
        toast.error(`Delete failed: ${res.status} ${errorText}`);
      }
    } catch (err: any) {
      toast.error('Delete Error: ' + (err.message || 'Network error'));
    }
  };

  const openEdit = (edu: any) => {
    setEditingId(edu.id || edu.ID);
    setFormData({
      degree: edu.degree || edu.Degree || '',
      institution: edu.institution || edu.Institution || '',
      fieldOfStudy: edu.fieldOfStudy || edu.FieldOfStudy || '',
      startDate: edu.startDate || edu.StartDate || '',
      endDate: edu.endDate || edu.EndDate || '',
      description: edu.description || edu.Description || ''
    });
    setIsAdding(true);
  };

  const toggleAdd = () => {
    if (isAdding) {
      setIsAdding(false);
      setEditingId(null);
      return;
    }
    setEditingId(null);
    setFormData({ degree: '', institution: '', fieldOfStudy: '', startDate: '', endDate: '', description: '' });
    setIsAdding(true);
  };

  if (loading) return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text }}>
       <Clock className="animate-spin" size={32} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '40px 7vw 100px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        
        <div style={{ display: 'flex', flexDirection: window.innerWidth < 768 ? 'column' : 'row', justifyContent: 'space-between', alignItems: window.innerWidth < 768 ? 'flex-start' : 'center', marginBottom: 32, gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: window.innerWidth < 480 ? 'column' : 'row', alignItems: window.innerWidth < 480 ? 'flex-start' : 'center', gap: 16 }}>
            {!isPopup && (
              <button 
                onClick={() => navigate('/employee/dashboard')} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, 
                  background: 'transparent', border: `1.5px solid ${T.bdr}`, color: T.sub, 
                  cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: '0.2s'
                }}
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <div>
              <h1 style={{
                fontSize: 'clamp(22px,3vw,28px)',
                fontWeight: 800,
                color: T.text,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: window.innerWidth < 480 ? 10 : 16,
                flexWrap: 'wrap'
              }}>
                <GraduationCap size={28} color="#3B82F6" /> 
                <span>My <span style={{ color: '#3B82F6' }}>Education</span></span>
              </h1>
              <p style={{ margin: '4px 0 0', color: T.sub, fontSize: 13, fontWeight: 500 }}>Manage your professional qualifications and academic journey.</p>
            </div>
          </div>
          <button
            onClick={toggleAdd}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 14, 
              background: isAdding ? T.card : '#3B82F6', border: isAdding ? `1px solid ${T.bdr}` : 'none', 
              color: isAdding ? T.text : '#fff', fontWeight: 800, cursor: 'pointer', transition: '0.2s',
              width: 'auto', justifyContent: 'center',
              boxShadow: isAdding ? 'none' : '0 10px 20px -5px rgba(59,130,246,0.3)'
            }}
          >
            {isAdding ? 'Cancel Entry' : <><Plus size={20} /> Add Credential</>}
          </button>
        </div>

        {isAdding && (
          <div style={{ background: T.card, borderRadius: 24, padding: 32, border: `1px solid ${T.bdr}`, marginBottom: 32, animation: 'slideDown 0.3s' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 800 }}>{editingId ? 'Edit Entry' : 'Record New Entry'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Degree / Certification Name</label>
                <input 
                  value={formData.degree} onChange={e => setFormData({...formData, degree: e.target.value})}
                  placeholder="e.g. Master of Computer Applications"
                  style={{ width: '100%', padding: '14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Institution</label>
                <input 
                  value={formData.institution} onChange={e => setFormData({...formData, institution: e.target.value})}
                  placeholder="e.g. Stanford University"
                  style={{ width: '100%', padding: '14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Field of Study</label>
                <input 
                  value={formData.fieldOfStudy} onChange={e => setFormData({...formData, fieldOfStudy: e.target.value})}
                  placeholder="e.g. Software Engineering"
                  style={{ width: '100%', padding: '14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Graduation Year / Date</label>
                <input 
                  value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})}
                  placeholder="e.g. May 2024"
                  style={{ width: '100%', padding: '14px', borderRadius: 12, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button 
                  onClick={handleSave}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#3B82F6', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(59,130,246,0.3)' }}
                >
                  Verify & Persist Record
                </button>
              </div>
            </div>
          </div>
        )}

        {eduList.length === 0 && !isAdding && (
          <div style={{ textAlign: 'center', padding: window.innerWidth < 480 ? '40px 20px' : '80px 40px', background: T.card, borderRadius: 32, border: `3px dashed ${T.bdr}`, margin: '0 10px' }}>
             <Layout size={window.innerWidth < 480 ? 48 : 64} color={T.muted} style={{ margin: '0 auto 24px' }} />
             <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Education Vault Empty</h2>
             <p style={{ color: T.sub, maxWidth: 400, margin: '0 auto', fontSize: window.innerWidth < 480 ? 13 : 14 }}>Sync your education records to complete your professional digital twin profiling.</p>
          </div>
        )}

          {eduList.map((edu, idx) => (
            <div key={edu.id || idx} style={{ background: T.card, borderRadius: 28, padding: window.innerWidth < 480 ? '20px' : '24px', border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: window.innerWidth < 640 ? 'column' : 'row', gap: window.innerWidth < 640 ? 12 : 20, position: 'relative', overflow: 'hidden', animation: 'fadeInUp 0.4s ease-out', marginBottom: 20 }}>
              <div style={{ width: window.innerWidth < 480 ? 48 : 56, height: window.innerWidth < 480 ? 48 : 56, borderRadius: 16, background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BookOpen size={window.innerWidth < 480 ? 24 : 28} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: window.innerWidth < 480 ? 16 : 18, fontWeight: 900, color: T.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{edu.degree}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', marginTop: 10, fontSize: 13, color: '#3B82F6', fontWeight: 700 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><MapPin size={14} /> {edu.institution}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {edu.endDate}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => openEdit(edu)} style={{ padding: 10, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: 'none', color: T.sub, cursor: 'pointer' }}><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(edu.id)} style={{ padding: 10, borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                  </div>
                </div>
                <div style={{ marginTop: 16, padding: '14px', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderRadius: 14, fontSize: 13, lineHeight: 1.5, color: T.sub }}>
                   Major in <span style={{ color: T.text, fontWeight: 700 }}>{edu.fieldOfStudy}</span>. 
                   <span style={{ display: window.innerWidth < 600 ? 'none' : 'inline' }}> Verified through Zensar Academic logs.</span>
                </div>
              </div>
            </div>
          ))}
      </div>
      
      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
