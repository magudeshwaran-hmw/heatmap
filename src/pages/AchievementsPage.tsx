import { API_BASE } from '@/lib/api';
/**
 * AchievementsPage.tsx — /employee/achievements
 * Employee view to add/edit/delete achievements and awards (Silver/Gold)
 */
import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { useNavigate } from 'react-router-dom';
import { Award, Plus, Trash2, Edit2, Calendar, Medal, Trophy, ChevronLeft, Star } from 'lucide-react';
import { toast } from '@/lib/ToastContext';

const AWARD_TYPES = ['Gold', 'Silver', 'Bronze', 'Certificate', 'Recognition', 'Other'];
const CATEGORIES = ['Technical Excellence', 'Leadership', 'Innovation', 'Client Appreciation', 'Teamwork', 'Delivery', 'Other'];

export default function AchievementsPage({
  isPopup: propIsPopup,
  onTabChange: propOnTabChange
}: {
  isPopup?: boolean;
  onTabChange?: (path: string) => void;
}) {
  const { dark } = useDark();
  const T = mkTheme(dark);
  const { data, reload, isPopup: ctxIsPopup, setGlobalLoading } = useApp();

  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;
  const onTabChange = propOnTabChange || (() => {});

  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const activeEmpId = isPopup ? (data?.user?.id || data?.user?.ZensarID || employeeId) : employeeId;
  const [showModal, setShowModal] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<any>(null);

  const [form, setForm] = useState({
    Title: '',
    AwardType: 'Gold',
    Category: 'Technical Excellence',
    DateReceived: '',
    Description: '',
    Issuer: '',
    ProjectContext: ''
  });

  const achievements = data?.achievements || [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Title.trim()) return toast.error('Achievement title is required');

    setGlobalLoading('Saving achievement...');
    try {
      const resp = await fetch(`${API_BASE}/achievements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAchievement?.ID || editingAchievement?.id,
          employee_id: activeEmpId,
          Title: form.Title,
          AwardType: form.AwardType,
          Category: form.Category,
          DateReceived: form.DateReceived,
          Description: form.Description,
          Issuer: form.Issuer,
          ProjectContext: form.ProjectContext
        })
      });
      if (!resp.ok) throw new Error('Failed to save achievement');
      toast.success(editingAchievement ? 'Achievement updated' : 'Achievement added');
      await reload();
      setShowModal(false);
      setEditingAchievement(null);
      setForm({
        Title: '',
        AwardType: 'Gold',
        Category: 'Technical Excellence',
        DateReceived: '',
        Description: '',
        Issuer: '',
        ProjectContext: ''
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this achievement?')) return;
    setGlobalLoading('Deleting...');
    try {
      const resp = await fetch(`${API_BASE}/achievements/${id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete');
      toast.success('Achievement deleted');
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGlobalLoading(false);
    }
  };

  const openEdit = (a: any) => {
    setEditingAchievement(a);
    setForm({
      Title: a.Title || '',
      AwardType: a.AwardType || 'Gold',
      Category: a.Category || 'Technical Excellence',
      DateReceived: a.DateReceived || '',
      Description: a.Description || '',
      Issuer: a.Issuer || '',
      ProjectContext: a.ProjectContext || ''
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingAchievement(null);
    setForm({
      Title: '',
      AwardType: 'Gold',
      Category: 'Technical Excellence',
      DateReceived: '',
      Description: '',
      Issuer: '',
      ProjectContext: ''
    });
    setShowModal(true);
  };

  const getAwardIcon = (type: string) => {
    switch (type) {
      case 'Gold': return <Trophy size={20} color="#F59E0B" />;
      case 'Silver': return <Medal size={20} color="#9CA3AF" />;
      case 'Bronze': return <Medal size={20} color="#B45309" />;
      default: return <Award size={20} color="#3B82F6" />;
    }
  };

  const getAwardColor = (type: string) => {
    switch (type) {
      case 'Gold': return '#F59E0B';
      case 'Silver': return '#9CA3AF';
      case 'Bronze': return '#B45309';
      default: return '#3B82F6';
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0a0a0f' : '#f8fafc', color: T.text, padding: '24px 24px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isPopup && (
              <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: '9px', background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Award size={26} color="#F59E0B" />
              My Achievements
            </h1>
          </div>
          <button onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: '9px', background: 'linear-gradient(135deg, #F59E0B, #F97316)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <Plus size={16} /> Add Achievement
          </button>
        </div>

        {/* Awards Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, marginBottom: 32 }}>
          {['Gold', 'Silver', 'Bronze'].map(type => {
            const count = achievements.filter((a: any) => a.AwardType === type).length;
            return (
              <div key={type} style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  {type === 'Gold' && <Trophy size={24} color="#F59E0B" />}
                  {type === 'Silver' && <Medal size={24} color="#9CA3AF" />}
                  {type === 'Bronze' && <Medal size={24} color="#B45309" />}
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: getAwardColor(type) }}>{count}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{type} Awards</div>
              </div>
            );
          })}
          <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Star size={24} color="#3B82F6" />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#3B82F6' }}>{achievements.length}</div>
            <div style={{ fontSize: 12, color: T.sub, textTransform: 'uppercase', fontWeight: 600 }}>Total</div>
          </div>
        </div>

        {/* Achievements List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {achievements.length === 0 ? (
            <div style={{ background: T.card, border: `1px dashed ${T.bdr}`, borderRadius: 16, padding: 48, textAlign: 'center', color: T.sub }}>
              <Award size={48} color={T.muted} style={{ marginBottom: 16, opacity: 0.5 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No achievements yet</div>
              <div style={{ fontSize: 13 }}>Add your Silver/Gold awards and other recognitions</div>
            </div>
          ) : (
            achievements.map((a: any) => (
              <div key={a.ID || a.id} style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 20, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${getAwardColor(a.AwardType)}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getAwardIcon(a.AwardType)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{a.Title}</span>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: `${getAwardColor(a.AwardType)}15`, color: getAwardColor(a.AwardType) }}>
                          {a.AwardType}
                        </span>
                        {a.Category && (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: T.bg, color: T.sub }}>
                            {a.Category}
                          </span>
                        )}
                      </div>
                      {a.Issuer && (
                        <div style={{ fontSize: 13, color: T.sub, marginBottom: 4 }}>Issued by: {a.Issuer}</div>
                      )}
                      {a.Description && (
                        <div style={{ fontSize: 13, color: T.text, marginTop: 8, lineHeight: 1.5 }}>{a.Description}</div>
                      )}
                      {a.ProjectContext && (
                        <div style={{ fontSize: 12, color: T.muted, marginTop: 8, fontStyle: 'italic' }}>Project: {a.ProjectContext}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: T.muted }}>
                        <Calendar size={14} />
                        {a.DateReceived ? new Date(a.DateReceived).toLocaleDateString() : 'Date not specified'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => openEdit(a)} style={{ padding: '8px', borderRadius: 8, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer' }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(a.ID || a.id)} style={{ padding: '8px', borderRadius: 8, background: 'transparent', border: `1px solid ${T.bdr}`, color: '#EF4444', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: dark ? '#0f0f1a' : '#f5f5f5', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '24px 28px', borderBottom: `1px solid ${T.bdr}` }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{editingAchievement ? 'Edit Achievement' : 'Add Achievement'}</h2>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Achievement Title *</label>
                  <input required value={form.Title} onChange={e => setForm({ ...form, Title: e.target.value })} placeholder="e.g., Excellence in Automation Delivery" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14 }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Award Type</label>
                    <select value={form.AwardType} onChange={e => setForm({ ...form, AwardType: e.target.value })} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14 }}>
                      {AWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Category</label>
                    <select value={form.Category} onChange={e => setForm({ ...form, Category: e.target.value })} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14 }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Date Received</label>
                  <input type="date" value={form.DateReceived} onChange={e => setForm({ ...form, DateReceived: e.target.value })} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14 }} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Issued By</label>
                  <input value={form.Issuer} onChange={e => setForm({ ...form, Issuer: e.target.value })} placeholder="e.g., Zensar Leadership, Client Name" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14 }} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Project Context</label>
                  <input value={form.ProjectContext} onChange={e => setForm({ ...form, ProjectContext: e.target.value })} placeholder="e.g., Banking App QA (optional)" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14 }} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6, display: 'block' }}>Description</label>
                  <textarea value={form.Description} onChange={e => setForm({ ...form, Description: e.target.value })} placeholder="Brief description of the achievement..." rows={3} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.bg, color: T.text, fontSize: 14, resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #F59E0B, #F97316)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {editingAchievement ? 'Update' : 'Save'} Achievement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
