import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/ToastContext';
import { Eye, EyeOff, User, Lock, Phone, Mail, Briefcase, MapPin, Clock, Hash, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { apiRegister, apiLogin, apiGetSkills, isServerAvailable } from '@/lib/api';
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

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lZensarId.trim()) { toast.error('Enter your Zensar ID, email, or phone'); return; }
    const isZensarId = /^\d{6}$/.test(lZensarId.trim());
    const isEmail = lZensarId.includes('@');
    const isPhone = /^[+\d][\d\s-]{6,}$/.test(lZensarId.trim());
    if (!isZensarId && !isEmail && !isPhone) { toast.error('Enter a valid 6-digit Zensar ID, email, or phone number'); return; }
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

      <style>{`

        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        input::placeholder { color: rgba(255,255,255,0.30) !important; }
        select option { background: #1e293b; color: #fff; }
      `}</style>
    </div>
  );
}
