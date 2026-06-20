import { API_BASE } from '@/lib/api';
/**
 * CertificationsPage.tsx — /employee/certifications
 * Employee view to add/edit/delete certifications.
 */
import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { Award, Plus, Trash2, Edit2, CheckCircle2, AlertCircle, X, ExternalLink, ChevronLeft } from 'lucide-react';
import { toast } from '@/lib/ToastContext';
import { useNavigate } from 'react-router-dom';


export default function CertificationsPage({ 
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
  const [editingCert, setEditingCert] = useState<any>(null);

  const [form, setForm] = useState({
    CertName: '', Provider: '', IssueDate: '', ExpiryDate: '', NoExpiry: false, RenewalDate: '', CredentialID: '', CredentialURL: ''
  });

  const certs = data?.certifications || [];
  const activeCount = certs.filter(c => c.status === 'Active').length;
  const expiringCount = certs.filter(c => c.status === 'Expiring Soon').length;
  const expiredCount = certs.filter(c => c.status === 'Expired').length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.CertName.trim() || !form.Provider.trim()) return toast.error('Name and Provider are required');

    setGlobalLoading('Saving certification...');
    try {
      const resp = await fetch(`${API_BASE}/certifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCert?.ID || editingCert?.id,
          EmployeeID: activeEmpId,
          employeeId: activeEmpId,
          CertName: form.CertName,
          Provider: form.Provider,
          IssueDate: form.IssueDate,
          ExpiryDate: form.ExpiryDate,
          NoExpiry: form.NoExpiry,
          CredentialID: form.CredentialID,
          CredentialURL: form.CredentialURL
        })
      });
      const res = await resp.json();
      if (res.success) {
        setShowModal(false);
        toast.success(editingCert ? 'Credential updated' : 'Certification added');
        await reload();
      } else {
        toast.error(res.error || 'Failed to sync');
      }
    } catch (err) { 
      toast.error('Network failure'); 
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDelete = async (cert: any) => {
    const cid = cert.ID || cert.id;
    if (!cid) return;
    if (!confirm('Are you sure you want to delete this certification?')) return;
    
    setGlobalLoading('Deleting certification...');
    try {
      const resp = await fetch(`${API_BASE}/certifications/${cid}`, { method: 'DELETE' });
      if (resp.ok) {
        toast.success('Certification removed');
        await reload();
      } else {
        toast.error('Failed to remove');
      }
    } catch (err) { 
      toast.error('Connection error'); 
    } finally {
      setGlobalLoading(false);
    }
  };

  const openEdit = (c: any) => {
    setEditingCert(c);
    setForm({
      CertName: c.CertName, Provider: c.Provider, IssueDate: c.IssueDate || '',
      ExpiryDate: c.ExpiryDate || '', NoExpiry: c.NoExpiry, RenewalDate: c.RenewalDate || '',
      CredentialID: c.CredentialID || '', CredentialURL: c.CredentialURL || ''
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditingCert(null);
    setForm({ CertName: '', Provider: '', IssueDate: '', ExpiryDate: '', NoExpiry: false, RenewalDate: '', CredentialID: '', CredentialURL: '' });
    setShowModal(true);
  };

  const pg = { minHeight: '100vh', background: T.bg, color: T.text, padding: '32px 7vw', fontFamily: "'Inter', sans-serif" };
  const cardStyle = { background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 24, position: 'relative' as const };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, background: dark? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${T.bdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 12, color: T.sub, marginBottom: 6, display: 'block', fontWeight: 600 };

  if (isLoading) return <div style={pg}>Loading certifications...</div>;

  return (
    <>
      
      <div style={pg}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isPopup && (
                <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <ChevronLeft size={16} /> Back
                </button>
              )}
              <div>
                <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, margin: '0 0 4px' }}>My Certifications</h1>
                <div style={{ color: T.sub, fontSize: 13 }}>Track your professional qualifications</div>
              </div>
            </div>
            <button onClick={openNew} style={{ background: 'linear-gradient(135deg, #10B981, #3B82F6)', border: 'none', padding: '10px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 4px 15px rgba(16,185,129,0.3)' }}>
              <Plus size={16} /> Add Certification
            </button>
          </div>

          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 32 }}>
            <div style={{ ...cardStyle, padding: 20 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, marginBottom: 8 }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{certs.length}</div>
            </div>
            <div style={{ ...cardStyle, padding: 20, borderLeft: '3px solid #10B981' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, marginBottom: 8 }}>Active</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>{activeCount}</div>
            </div>
            <div style={{ ...cardStyle, padding: 20, borderLeft: '3px solid #F59E0B' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, marginBottom: 8 }}>Expiring Soon</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#F59E0B' }}>{expiringCount}</div>
            </div>
            <div style={{ ...cardStyle, padding: 20, borderLeft: '3px solid #EF4444' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, marginBottom: 8 }}>Expired</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#EF4444' }}>{expiredCount}</div>
            </div>
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {certs.map((c, i) => (
              <div key={c.CertName + i} style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(107,45,139,0.1)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Award size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, margin: '0 0 4px', fontWeight: 700, lineHeight: 1.3 }}>{c.CertName}</h3>
                    <div style={{ fontSize: 13, color: T.sub }}>{c.Provider}</div>
                  </div>
                </div>
                
                {(() => {
                  const fmt = (d: string) => {
                    if (!d) return 'Unknown';
                    if (d.includes('T')) return d.slice(0, 10); // ISO: 2026-03-31T18:30:00.000Z -> 2026-03-31
                    return d;
                  };
                  return (
                    <>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>
                        <span style={{ color: T.sub }}>Issued:</span> {fmt(c.IssueDate)}
                      </div>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
                        <span style={{ color: T.sub }}>Expires:</span> {c.NoExpiry ? 'No Expiry' : fmt(c.ExpiryDate)}
                      </div>
                    </>
                  );
                })()}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: T.sub }}>Status:</span>
                  {c.status === 'Active' && <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14}/> Active</span>}
                  {c.status === 'Expiring Soon' && <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={14}/> Expiring Soon</span>}
                  {c.status === 'Expired' && <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: 4 }}><X size={14}/> Expired</span>}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {c.IsAIExtracted ? <span style={{ fontSize: 11, color: '#c084fc', background: 'rgba(107,45,139,0.1)', padding: '2px 8px', borderRadius: 10 }}>🤖 AI Extracted</span> : <div/>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {c.CredentialURL && <a href={c.CredentialURL} target="_blank" rel="noreferrer" style={{ background: 'rgba(59,130,246,0.1)', border: 'none', padding: '6px', borderRadius: 6, color: '#3B82F6', cursor: 'pointer', display: 'flex' }}><ExternalLink size={14}/></a>}
                    <button onClick={() => openEdit(c)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '6px', borderRadius: 6, color: T.sub, cursor: 'pointer', display: 'flex' }}><Edit2 size={14}/></button>
                    <button onClick={() => handleDelete(c)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', padding: '6px', borderRadius: 6, color: '#EF4444', cursor: 'pointer', display: 'flex' }}><Trash2 size={14}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: dark ? '#0f0f1a' : '#f5f5f5' }}>
          <div onClick={() => setShowModal(false)} style={{ position: 'absolute', inset: 0 }} />
          <form onSubmit={handleSave} style={{ position: 'relative', background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 20, width: '100%', maxWidth: 540, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', fontFamily: "'Inter', sans-serif" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: '0 0 20px' }}>{editingCert ? 'Edit Certification' : 'Add Certification'}</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Certification Name</label>
                <input required style={inputStyle} value={form.CertName} onChange={e => setForm({...form, CertName: e.target.value})} placeholder="e.g. ISTQB Advanced Level" />
              </div>
              <div>
                <label style={labelStyle}>Provider / Organization</label>
                <input required style={inputStyle} value={form.Provider} onChange={e => setForm({...form, Provider: e.target.value})} placeholder="e.g. ISTQB, AWS, Microsoft" />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Issue Date</label>
                  <input type="date" style={inputStyle} value={form.IssueDate} onChange={e => setForm({...form, IssueDate: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Expiry Date</label>
                  <input type="date" disabled={form.NoExpiry} style={{...inputStyle, opacity: form.NoExpiry ? 0.3 : 1}} value={form.ExpiryDate} onChange={e => setForm({...form, ExpiryDate: e.target.value})} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.sub, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.NoExpiry} onChange={e => setForm({...form, NoExpiry: e.target.checked})} />
                This credential does not expire
              </label>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Credential ID (Optional)</label>
                  <input style={inputStyle} value={form.CredentialID} onChange={e => setForm({...form, CredentialID: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Credential URL (Optional)</label>
                  <input style={inputStyle} value={form.CredentialURL} onChange={e => setForm({...form, CredentialURL: e.target.value})} placeholder="https://" />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.text, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button type="submit" style={{ flex: 1, padding: 12, background: 'linear-gradient(135deg, #10B981, #3B82F6)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 600, boxShadow: '0 8px 16px rgba(16,185,129,0.2)' }}>Save Certification</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

