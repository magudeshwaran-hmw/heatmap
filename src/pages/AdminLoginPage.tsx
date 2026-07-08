import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/authContext';
import { apiLogin } from '@/lib/api';
import { toast } from '@/lib/ToastContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { dark } = useDark();
  const T = mkTheme(dark);

  // Authenticate against the backend so the admin receives a real JWT (role=admin).
  // Without this, admin write actions (bulk import, create/delete, skill saves) are
  // unauthenticated and now correctly rejected by the server's auth/ownership checks.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!adminId.trim() || !password) { toast.error('Enter your admin ID and password'); return; }
    setBusy(true);
    try {
      const emp: any = await apiLogin(adminId.trim(), password);   // stores the JWT
      if (emp?.role !== 'admin') {
        toast.error('These credentials are not an admin account');
        return;
      }
      login(emp);   // role=admin session
      toast.success('Admin authorized');
      navigate('/admin');
    } catch (err: any) {
      toast.error(err?.message || 'Invalid credentials');
    } finally {
      setBusy(false);
    }
  };

  const bg = dark 
    ? 'radial-gradient(ellipse at 50% 30%, rgba(30,60,140,0.3) 0%, #050B18 70%)' 
    : 'radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.12) 0%, #F1F5F9 100%)';

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:bg, transition:'0.35s', fontFamily:"'Inter',sans-serif" }}>
      <div style={{ width:'100%', maxWidth:400, padding:20 }}>
        <div style={{ background:T.card, border:`1px solid ${T.bdr}`, borderRadius:24, padding:40, backdropFilter:'blur(20px)', boxShadow:'0 20px 50px rgba(0,0,0,0.12)', textAlign:'center' }}>
          <div style={{ width:60, height:60, borderRadius:18, background:'linear-gradient(135deg,#3B82F6,#8B5CF6)', margin:'0 auto 20px', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 30px rgba(59,130,246,0.3)' }}>
            <ShieldCheck size={30} color="#fff" />
          </div>
          <h2 style={{ fontSize:24, fontWeight:800, color:T.text, marginBottom:8, fontFamily:"'Space Grotesk',sans-serif" }}>Admin Portal</h2>
          <p style={{ color:T.sub, fontSize:14, marginBottom:32 }}>Access global team capability metrics</p>

          <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:18, textAlign:'left' }}>
            <div>
              <label style={{ fontSize:11, fontWeight:800, color:T.muted, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, display:'block' }}>Credentials</label>
              <div style={{ position:'relative', marginBottom:12 }}>
                <User size={16} color={T.muted} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)' }} />
                <input type="text" value={adminId} onChange={e => setAdminId(e.target.value)} placeholder="Admin ID" style={{ width:'100%', boxSizing:'border-box', padding:'14px 16px 14px 44px', borderRadius:13, background:T.input, border:`1px solid ${T.inputBdr}`, color:T.text, outline:'none', fontSize:14 }} />
              </div>
              <div style={{ position:'relative' }}>
                <Lock size={16} color={T.muted} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)' }} />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={{ width:'100%', boxSizing:'border-box', padding:'14px 16px 14px 44px', borderRadius:13, background:T.input, border:`1px solid ${T.inputBdr}`, color:T.text, outline:'none', fontSize:14 }} />
              </div>
            </div>

            <button type="submit" disabled={busy} style={{ width:'100%', padding:'16px', borderRadius:13, marginTop:10, background:'linear-gradient(135deg,#3B82F6,#8B5CF6)', border:'none', color:'#fff', fontWeight:800, fontSize:15, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:'0 10px 25px rgba(59,130,246,0.35)', transition:'all 0.2s' }}>
              {busy ? 'Authenticating…' : 'Authenticate'} <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
