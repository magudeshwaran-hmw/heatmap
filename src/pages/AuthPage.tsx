import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/ToastContext';
import { Eye, EyeOff, User, Lock, Phone, Mail, Briefcase, MapPin, Clock, Hash, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { apiRegister, apiLogin, apiGetSkills, isServerAvailable, API_BASE } from '@/lib/api';
import { createNewEmployee, upsertEmployee, getAllEmployees, saveSkillRatings } from '@/lib/localDB';
import { SKILLS } from '@/lib/mockData';
import type { ProficiencyLevel } from '@/lib/types';

type Mode = 'login' | 'signup';

const BG = '/office_bg.png';

function InputRow({
  label, placeholder, value, onChange, type = 'text',
  icon: Icon, suffix, dark, T,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string;
  icon: React.ElementType; suffix?: React.ReactNode;
  dark: boolean; T: Record<string, string>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <Icon size={15} color={focused ? '#60A5FA' : (dark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.38)')} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }} />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: suffix ? '11px 44px 11px 40px' : '11px 14px 11px 40px',
            borderRadius: '10px', fontSize: '14px',
            background: focused ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(59,130,246,0.08)') : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'),
            border: `1.5px solid ${focused ? 'rgba(96,165,250,0.70)' : 'rgba(255,255,255,0.18)'}`,
            color: dark ? '#fff' : '#0f172a', outline: 'none',
            transition: 'border-color 0.2s, background 0.2s',
          }}
        />
        {suffix && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }}>
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectRow({ label, value, onChange, options, icon: Icon, dark = false }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; icon: React.ElementType; dark?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(100,116,139,0.9)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <Icon size={15} color="rgba(100,116,139,0.7)" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <select value={value} onChange={e => onChange(e.target.value)} style={{
          width: '100%', boxSizing: 'border-box' as const,
          padding: '11px 14px 11px 40px', borderRadius: '10px', fontSize: '14px',
          background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', border: dark ? '1.5px solid rgba(255,255,255,0.18)' : '1.5px solid rgba(59,130,246,0.25)',
          color: dark ? '#fff' : '#0f172a', outline: 'none', appearance: 'none' as const,
        }}>
          {options.map(o => <option key={o} value={o} style={{ background: '#1e293b' }}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [mode, setMode]       = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [showCPw, setShowCPw] = useState(false);

  // ── Login fields ──────────────────────────────────────────────────────────
  const [lZensarId, setLZensarId] = useState('');
  const [lPassword, setLPassword] = useState('');

  // ── Sign-up fields ────────────────────────────────────────────────────────
  const [sZensarId,    setSZensarId]    = useState('');
  const [sName,        setSName]        = useState('');
  const [sMobile,      setSMobile]      = useState('');
  const [sEmail,       setSEmail]       = useState('');
  const [sLocation,    setSLocation]    = useState('Pune, Maharashtra');
  const [sDept,        setSDept]        = useState('Quality Intelligence');
  const [sYearsIT,     setSYearsIT]     = useState('');
  const [sYearsZensar, setSYearsZensar] = useState('');
  const [sPassword,    setSPassword]    = useState('');
  const [sCPassword,   setSCPassword]   = useState('');

  // ── MS Login Simulation ───────────────────────────────────────────────────
  const [showMsModal, setShowMsModal] = useState(false);
  const [customMsName, setCustomMsName] = useState('');
  const [customMsId, setCustomMsId] = useState('');
  const [customMsGrade, setCustomMsGrade] = useState('E2');
  const [customMsDesig, setCustomMsDesig] = useState('Software Engineer');
  const [customMsRole, setCustomMsRole] = useState<'employee' | 'admin'>('employee');

  const handleMsLogin = async (zid: string, name: string, designation: string, grade: string, userRole: 'employee' | 'admin') => {
    setLoading(true);
    try {
      const email = `${name.toLowerCase().replace(/\s+/g, '.')}@zensar.com`;
      const phone = '+91 99999 88888';
      const password = 'microsoft_sso_bypass_2026';
      
      let emp;
      try {
        emp = await apiRegister({
          name,
          email,
          phone,
          designation,
          department: designation.includes('Practice') || designation.includes('Director') ? 'Delivery' : 'Quality Intelligence',
          location: 'Pune, Maharashtra',
          yearsIT: grade === 'F1' ? 1 : grade === 'E1' ? 7 : grade === 'E2' ? 10 : grade === 'D' ? 13 : 16,
          yearsZensar: grade === 'F1' ? 1 : grade === 'E1' ? 4 : grade === 'E2' ? 5 : grade === 'D' ? 8 : 10,
          password,
          resumeUploaded: false,
          zensarId: zid,
          grade
        } as any);
      } catch (err: any) {
        if (err.message.includes('exists') || err.message.toLowerCase().includes('already registered') || err.message.toLowerCase().includes('already exists')) {
          emp = await apiLogin(zid, password);
          await fetch(`${API_BASE}/admin/employees/update`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('zn_access_token')}`
            },
            body: JSON.stringify({ 
              id: zid, 
              name,
              designation,
              grade 
            })
          }).catch(() => {});
        } else {
          throw err;
        }
      }

      upsertEmployee({
        id: emp.id,
        name: emp.name || name,
        email: emp.email || email,
        phone: emp.phone || phone,
        designation: emp.designation || designation,
        department: emp.department || 'Quality Intelligence',
        location: emp.location || 'Pune, Maharashtra',
        yearsIT: Number(emp.yearsIT ?? 5),
        yearsZensar: Number(emp.yearsZensar ?? 2),
        primarySkill: emp.primarySkill || '',
        primaryDomain: emp.primaryDomain || '',
        overallCapability: Number(emp.overallCapability ?? 0),
        submitted: false,
        resumeUploaded: false,
        grade: grade,
        skills: SKILLS.map(s => ({ skillId: s.id, selfRating: 0 as ProficiencyLevel, managerRating: null, validated: false })),
      } as any);

      localStorage.setItem('skill_nav_session_id', zid);
      login(userRole, emp.id, emp.name || name);
      
      toast.success(`Microsoft Authentication Successful! Welcome, ${name} [Grade: ${grade}] 📄`);
      setShowMsModal(false);
      navigate('/employee/resume-upload');
    } catch (err: any) {
      toast.error('Microsoft SSO Simulation Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lZensarId.trim()) { toast.error('Enter your Zensar ID, email, or phone'); return; }
    const isZensarId = /^\d{5,6}$/.test(lZensarId.trim());
    const isEmail = lZensarId.includes('@');
    const isPhone = /^[+\d][\d\s-]{6,}$/.test(lZensarId.trim());
    if (!isZensarId && !isEmail && !isPhone) { toast.error('Enter a valid 5 or 6-digit Zensar ID, email, or phone number'); return; }
    if (!lPassword)  { toast.error('Enter your password'); return; }

    setLoading(true);
    try {
      const emp = await apiLogin(lZensarId.trim(), lPassword);

      // Build a complete Employee for localStorage so SkillMatrixPage works
      const allData = await getAllEmployees();
      const existingLocal = (allData.employees || []).find((e: any) => e.ID === emp.id || e.id === emp.id);

      // ✅ Preserve submitted=true from localStorage even if server hasn't saved it yet
      // (e.g. Excel was open during submit — local is source of truth in that case)
      const serverSubmitted = (emp.submitted as string) === 'Yes';
      const localSubmitted  = existingLocal?.submitted === true;
      const isSubmitted     = serverSubmitted || localSubmitted;

      upsertEmployee({
        id:                emp.id,
        name:              emp.name || '',
        email:             emp.email || '',
        phone:             emp.phone || '',
        designation:       emp.designation || existingLocal?.designation || '',
        department:        emp.department || 'Quality Intelligence',
        location:          emp.location   || '',
        yearsIT:           Number(emp.yearsIT ?? 0),
        yearsZensar:       Number(emp.yearsZensar ?? 0),
        primarySkill:      emp.primarySkill  || '',
        primaryDomain:     emp.primaryDomain || '',
        overallCapability: Number(emp.overallCapability ?? 0),
        submitted:         isSubmitted,   // combined: server OR local
        resumeUploaded:    (emp.resumeUploaded as string) === 'Yes',
        // Keep existing skills from localStorage if already rated, else create fresh
        skills: existingLocal?.skills?.length
          ? existingLocal.skills
          : SKILLS.map(s => ({ skillId: s.id, selfRating: 0 as ProficiencyLevel, managerRating: null, validated: false })),
      });


      // Set session ID for cloud sync
      localStorage.setItem('skill_nav_session_id', emp.zensarId || emp.ZensarID || emp.id);

      login('employee', emp.id, emp.name || '');
      window.dispatchEvent(new Event('skill_nav_session_changed'));
      toast.success(`Welcome back, ${(emp.name || '').split(' ')[0]}! ✅`);
      // Go to dashboard for returning users
      navigate('/employee/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network Error: Cannot reach server');
    }
    setLoading(false);
  };

  // ── Sign up ───────────────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sZensarId.trim() || !/^\d{5,6}$/.test(sZensarId.trim())) { toast.error('Zensar ID must be 5 or 6 digits'); return; }
    if (!sName.trim())    { toast.error('Enter your full name'); return; }
    if (!sMobile.trim())  { toast.error('Enter your mobile number'); return; }
    if (!sEmail.trim())   { toast.error('Enter your Zensar email'); return; }
    if (!sPassword)       { toast.error('Create a password'); return; }
    if (sPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (sPassword !== sCPassword) { toast.error('Passwords do not match'); return; }

    setLoading(true);
    try {
      const emp = await apiRegister({
        name: sName.trim(),
        email: sEmail.trim(),
        phone: sMobile.trim(),
        designation: sEmail.trim().split('@')[0] || 'Employee',
        department: sDept,
        location: sLocation,
        yearsIT: parseFloat(sYearsIT) || 0,
        yearsZensar: parseFloat(sYearsZensar) || 0,
        password: sPassword,
        resumeUploaded: false,
        zensarId: sZensarId.trim(),
      } as Parameters<typeof apiRegister>[0] & { zensarId: string });

      // ✅ Mirror to localStorage so login works even if server has a blip later
      upsertEmployee({
        id:                emp.id,
        name:              sName.trim(),
        email:             sEmail.trim(),
        phone:             sMobile.trim(),
        designation:       `Zensar-${sZensarId.trim()}`, // store ZensarID so fallback login finds it
        department:        sDept,
        location:          sLocation,
        yearsIT:           parseFloat(sYearsIT) || 0,
        yearsZensar:       parseFloat(sYearsZensar) || 0,
        primarySkill:      '',
        primaryDomain:     '',
        overallCapability: 0,
        submitted:         false,
        resumeUploaded:    false,
        skills:            SKILLS.map(s => ({ skillId: s.id, selfRating: 0 as ProficiencyLevel, managerRating: null, validated: false })),
      });

      // Set session ID for cloud sync
      localStorage.setItem('skill_nav_session_id', sZensarId.trim());

      login('employee', emp.id, sName.trim());
      toast.success('Account created! Now upload your resume 📄');
      navigate('/employee/resume-upload');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network Error: Cannot reach server');
    }
    setLoading(false);
  };

  const eyeBtn = (show: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
      {show ? <EyeOff size={16} color="rgba(255,255,255,0.5)" /> : <Eye size={16} color="rgba(255,255,255,0.5)" />}
    </button>
  );

  const DEPTS = ['Quality Intelligence', 'Development', 'DevOps', 'Data & AI', 'Cloud', 'Delivery', 'Management'];
  const LOCS  = ['Pune, Maharashtra', 'Bangalore, Karnataka', 'Hyderabad, Telangana', 'Chennai, Tamil Nadu', 'Mumbai, Maharashtra', 'Noida, UP'];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', fontFamily: "'Inter',sans-serif",
    }}>
      {/* Background image */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }} />
      {/* Overlay — darker in dark mode, lighter in light mode */}
      <div style={{ position: 'absolute', inset: 0, background: dark ? 'linear-gradient(140deg,rgba(4,9,28,0.88),rgba(10,20,60,0.82))' : 'linear-gradient(140deg,rgba(240,245,255,0.82),rgba(220,235,255,0.78))', zIndex: 1 }} />
      {/* Glow accents */}
      <div style={{ position: 'absolute', top: '10%', left: '5%', width: '38%', height: '55%', background: 'radial-gradient(circle,rgba(59,130,246,0.22) 0%,transparent 65%)', zIndex: 1, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '5%', right: '5%', width: '34%', height: '45%', background: 'radial-gradient(circle,rgba(139,92,246,0.20) 0%,transparent 65%)', zIndex: 1, pointerEvents: 'none' }} />

      {/* Auth Card */}
      <div style={{
        position: 'relative', zIndex: 2, width: '100%', maxWidth: mode === 'signup' ? '640px' : '440px',
        margin: '0 auto', padding: '24px 16px', boxSizing: 'border-box'
      }}>
        <div style={{
          background: dark ? 'rgba(10,15,40,0.75)' : 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
          border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(59,130,246,0.2)',
          borderRadius: '24px', padding: '40px 36px',
          boxShadow: dark ? '0 30px 80px rgba(0,0,0,0.6)' : '0 30px 80px rgba(59,130,246,0.15)',
          boxSizing: 'border-box'
        }}>
          {/* Tab switcher removed — use inline links below instead */}

          {/* ── LOGIN FORM ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: dark ? '#fff' : '#0f172a', fontFamily: "'Space Grotesk',sans-serif" }}>Welcome Back</div>
                <div style={{ fontSize: '13px', color: dark ? 'rgba(255,255,255,0.50)' : 'rgba(15,23,42,0.50)', marginTop: '4px' }}>Login with Zensar ID, email, or phone</div>
              </div>

              <InputRow label="Zensar ID / Email / Phone" placeholder="123456 or name@zensar.com or mobile" value={lZensarId}
                onChange={setLZensarId} icon={Hash} dark={dark} T={{}} />

              <InputRow label="Password" placeholder="Your password" value={lPassword}
                onChange={setLPassword} type={showPw ? 'text' : 'password'} icon={Lock} dark={dark} T={{}}
                suffix={eyeBtn(showPw, () => setShowPw(p => !p))} />

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px', borderRadius: '12px', marginTop: '4px',
                background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', border: 'none',
                color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 0 24px rgba(59,130,246,0.4)', transition: 'opacity 0.2s',
                opacity: loading ? 0.7 : 1,
              }}>
                {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><ArrowRight size={16} /> Login</>}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', gap: 10 }}>
                <div style={{ flex: 1, height: '1px', background: T.bdr }} />
                <span style={{ fontSize: 11, color: T.sub, fontWeight: 700, textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: T.bdr }} />
              </div>

              <button 
                type="button"
                onClick={() => setShowMsModal(true)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '12px',
                  background: dark ? 'rgba(255,255,255,0.06)' : '#ffffff', 
                  border: `1.5px solid ${T.bdr}`,
                  color: dark ? '#fff' : '#0f172a', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.12)' : '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : '#ffffff'}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px', width: 14, height: 14 }}>
                  <div style={{ background: '#F25022', width: 6, height: 6 }} />
                  <div style={{ background: '#7FBA00', width: 6, height: 6 }} />
                  <div style={{ background: '#00A4EF', width: 6, height: 6 }} />
                  <div style={{ background: '#FFB900', width: 6, height: 6 }} />
                </div>
                Sign in with Microsoft
              </button>

              <div style={{ textAlign: 'center', fontSize: '13px', color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)', marginTop: '4px' }}>
                New here?{' '}
                <span onClick={() => setMode('signup')} style={{ color: '#60A5FA', cursor: 'pointer', fontWeight: 600 }}>
                  Create an account →
                </span>
              </div>
            </form>
          )}

          {/* ── SIGN UP FORM ── */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: dark ? '#fff' : '#0f172a', fontFamily: "'Space Grotesk',sans-serif" }}>Create Account</div>
                <div style={{ fontSize: '13px', color: dark ? 'rgba(255,255,255,0.50)' : 'rgba(15,23,42,0.50)', marginTop: '4px' }}>Register with your Zensar details</div>
              </div>

              {/* Row 1: Zensar ID + Name */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <InputRow label="Zensar ID *" placeholder="6-digit number" value={sZensarId}
                  onChange={v => { if (/^\d{0,6}$/.test(v)) setSZensarId(v); }}
                  icon={Hash} dark={dark} T={{}} />
                <InputRow label="Full Name *" placeholder="Rahul Sharma" value={sName}
                  onChange={setSName} icon={User} dark={dark} T={{}} />
              </div>

              {/* Row 2: Mobile + Email */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <InputRow label="Mobile Number *" placeholder="+91 98765 43210" value={sMobile}
                  onChange={setSMobile} type="tel" icon={Phone} dark={dark} T={{}} />
                <InputRow label="Zensar Email *" placeholder="rahul@zensar.com" value={sEmail}
                  onChange={setSEmail} type="email" icon={Mail} dark={dark} T={{}} />
              </div>

              {/* Row 3: Location + Department */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <SelectRow label="Location" value={sLocation} onChange={setSLocation} options={LOCS} icon={MapPin} dark={dark} />
                <SelectRow label="Department" value={sDept} onChange={setSDept} options={DEPTS} icon={Briefcase} dark={dark} />
              </div>

              {/* Row 4: Years IT + Years Zensar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <InputRow label="Years in IT" placeholder="e.g. 5" value={sYearsIT}
                  onChange={setSYearsIT} type="number" icon={Clock} dark={dark} T={{}} />
                <InputRow label="Years at Zensar" placeholder="e.g. 2" value={sYearsZensar}
                  onChange={setSYearsZensar} type="number" icon={Clock} dark={dark} T={{}} />
              </div>

              {/* Row 5: Password + Confirm */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <InputRow label="Password *" placeholder="Min 6 chars" value={sPassword}
                  onChange={setSPassword} type={showPw ? 'text' : 'password'} icon={Lock} dark={dark} T={{}}
                  suffix={eyeBtn(showPw,  () => setShowPw(p => !p))} />
                <InputRow label="Confirm Password *" placeholder="Repeat password" value={sCPassword}
                  onChange={setSCPassword} type={showCPw ? 'text' : 'password'} icon={Lock} dark={dark} T={{}}
                  suffix={eyeBtn(showCPw, () => setShowCPw(p => !p))} />
              </div>

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px', borderRadius: '12px',
                background: 'linear-gradient(135deg,#10B981,#3B82F6)', border: 'none',
                color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 0 22px rgba(16,185,129,0.35)', opacity: loading ? 0.7 : 1,
              }}>
                {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <>Create Account & Continue <ArrowRight size={16} /></>}
              </button>

              <div style={{ textAlign: 'center', fontSize: '13px', color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)', marginTop: '14px' }}>
                Already registered?{' '}
                <span onClick={() => setMode('login')} style={{ color: '#60A5FA', cursor: 'pointer', fontWeight: 600 }}>
                  Login →
                </span>
              </div>
            </form>
          )}
        </div>
      </div>

      {showMsModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(4,9,28,0.8)',
          backdropFilter: 'blur(10px)', zIndex: 999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 16
        }} className="fadeIn">
          <div style={{
            background: dark ? 'rgba(15,23,42,0.95)' : '#ffffff',
            border: `1px solid ${T.bdr}`,
            borderRadius: 20, width: '100%', maxWidth: 540,
            padding: 30, color: dark ? '#fff' : '#0f172a',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px', width: 14, height: 14 }}>
                  <div style={{ background: '#F25022', width: 6, height: 6 }} />
                  <div style={{ background: '#7FBA00', width: 6, height: 6 }} />
                  <div style={{ background: '#00A4EF', width: 6, height: 6 }} />
                  <div style={{ background: '#FFB900', width: 6, height: 6 }} />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Microsoft Single Sign-On</h3>
              </div>
              <button 
                onClick={() => setShowMsModal(false)}
                style={{ background: 'none', border: 'none', color: T.sub, fontSize: 20, cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: T.sub, marginBottom: 20 }}>
              Simulating Microsoft Azure AD enterprise login. Select an employee profile below to sign in automatically and fetch their grade.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { name: 'Sneha Reddy', zid: '64311', desig: 'Trainee SDET', grade: 'F1', role: 'employee' as const },
                { name: 'Amit Patel', zid: '64312', desig: 'Associate QA Engineer', grade: 'F1', role: 'employee' as const },
                { name: 'Priya Nair', zid: '64313', desig: 'Senior QA Engineer', grade: 'E1', role: 'employee' as const },
                { name: 'Rahul Sharma', zid: '64314', desig: 'Technical Lead', grade: 'E2', role: 'employee' as const },
                { name: 'John Doe', zid: '64315', desig: 'Practice Lead', grade: 'D', role: 'employee' as const },
                { name: 'Jane Smith', zid: '64316', desig: 'QA Director (Admin)', grade: 'C', role: 'admin' as const },
              ].map(profile => (
                <button
                  type="button"
                  key={profile.zid}
                  onClick={() => handleMsLogin(profile.zid, profile.name, profile.desig, profile.grade, profile.role)}
                  style={{
                    padding: 14, borderRadius: 12, border: `1.5px solid ${T.bdr}`,
                    background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                    color: dark ? '#fff' : '#0f172a', textAlign: 'left', cursor: 'pointer',
                    transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 4
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#3B82F6';
                    e.currentTarget.style.background = dark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.05)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = T.bdr;
                    e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.02)' : '#f8fafc';
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{profile.name}</strong>
                  <span style={{ fontSize: 11, color: T.sub }}>{profile.desig}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 4 }}>
                    <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      Grade: {profile.grade}
                    </span>
                    <span style={{ fontSize: 10, color: T.muted }}>ID: {profile.zid}</span>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${T.bdr}`, paddingTop: 20 }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800 }}>Or Sign in with Custom AD Profile</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Full Name</label>
                  <input
                    type="text"
                    value={customMsName}
                    onChange={e => setCustomMsName(e.target.value)}
                    placeholder="e.g. Robert Vance"
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${T.bdr}`, color: dark ? '#fff' : '#0f172a', fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Zensar ID</label>
                  <input
                    type="text"
                    value={customMsId}
                    onChange={e => { if (/^\d*$/.test(e.target.value)) setCustomMsId(e.target.value); }}
                    placeholder="e.g. 64320"
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${T.bdr}`, color: dark ? '#fff' : '#0f172a', fontSize: 13
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Grade</label>
                  <select
                    value={customMsGrade}
                    onChange={e => setCustomMsGrade(e.target.value)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: dark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${T.bdr}`, color: dark ? '#fff' : '#0f172a', fontSize: 13
                    }}
                  >
                    {['F1', 'E1', 'E2', 'D', 'C'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Designation</label>
                  <input
                    type="text"
                    value={customMsDesig}
                    onChange={e => setCustomMsDesig(e.target.value)}
                    placeholder="Software Engineer"
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${T.bdr}`, color: dark ? '#fff' : '#0f172a', fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Role</label>
                  <select
                    value={customMsRole}
                    onChange={e => setCustomMsRole(e.target.value as any)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: dark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${T.bdr}`, color: dark ? '#fff' : '#0f172a', fontSize: 13
                    }}
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!customMsName.trim() || !customMsId.trim() || customMsId.length < 5) {
                    toast.error('Please enter a valid Name and 5-6 digit Zensar ID');
                    return;
                  }
                  handleMsLogin(customMsId, customMsName, customMsDesig, customMsGrade, customMsRole);
                }}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #00A4EF, #3B82F6)',
                  color: '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer'
                }}
              >
                Sign In with Custom Profile
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`

        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        input::placeholder { color: rgba(255,255,255,0.30) !important; }
        select option { background: #1e293b; color: #fff; }
      `}</style>
    </div>
  );
}
