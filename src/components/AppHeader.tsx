import { useAuth } from '@/lib/authContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Menu, X, Sun, Moon, LayoutDashboard, User, Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { checkLLMStatus } from '@/lib/llm';
import { ZensarLogo } from '@/components/ZensarLogo';
import { useApp } from '@/lib/AppContext';
import { useDark, mkTheme } from '@/lib/themeContext';

export default function AppHeader() {
  const { isLoggedIn, role, name, logout } = useAuth();
  const { data: appData } = useApp();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [llmStatus, setLlmStatus]   = useState<{ online: boolean; mode: string } | null>(null);
  const [testingMode, setTestingMode] = useState(() => localStorage.getItem('testing_mode') === 'true');

  const { dark, toggleDark } = useDark();
  const T = mkTheme(dark);

  useEffect(() => {
    checkLLMStatus().then(s => setLlmStatus(s));
    const iv = setInterval(() => checkLLMStatus().then(s => setLlmStatus(s)), 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const handleTestingChange = () => {
      setTestingMode(localStorage.getItem('testing_mode') === 'true');
    };
    window.addEventListener('testing_mode_changed', handleTestingChange);
    return () => window.removeEventListener('testing_mode_changed', handleTestingChange);
  }, []);

  const displayName  = appData?.user?.Name || name || '…';
  const active       = (p: string) => location.pathname === p;

  const empNavItems = [
    { label: 'ZenRadar',      path: '/employee/dashboard' },
    { label: 'ZenMatrix',     path: '/employee/skills' },
    { label: 'ZenAssess',     path: '/employee/zenassess' },
    { label: 'ZenAICoach',    path: '/employee/ai' },
    { label: 'My Projects',   path: '/employee/projects' },
    { label: 'My Education',  path: '/employee/education' },
    { label: 'My Certification', path: '/employee/certifications' },
    { label: 'My Awards',     path: '/employee/achievements' },
  ];

  const adminNavItems = [
    { label: 'ZenRadar', path: '/admin', icon: LayoutDashboard },
    { label: 'ZenTalenHub', path: '/admin/bfsi', icon: Landmark },
  ];

  const navItems = role === 'admin' ? adminNavItems : empNavItems;

  const headerStyle = {
    position: 'sticky' as const, top: 0, zIndex: 100,
    height: 60,
    background: dark ? 'rgba(10,10,15,0.92)' : '#ffffff',
    borderBottom: `1px solid ${T.bdr}`,
    boxShadow: dark ? 'none' : '0 1px 10px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  const innerStyle = {
    maxWidth: '100%', margin: '0', height: '100%',
    padding: '0 20px', display: 'flex', position: 'relative' as const,
    alignItems: 'center', justifyContent: 'space-between', gap: 8,
  };

  const navBtn = (isActive: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: isActive ? (dark ? 'rgba(59,130,246,0.15)' : '#EFF6FF') : 'transparent',
    color: isActive ? '#3B82F6' : T.sub,
    fontSize: 12, fontWeight: isActive ? 700 : 500, transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  });

  return (
    <header style={headerStyle}>
      <div style={innerStyle}>
        {/* Left — Logo pinned to far left */}
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0, marginRight: 8 }}>
          <ZensarLogo size="sm" />
        </div>

        {/* Nav — centered absolutely between logo and right controls */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'absolute', left: '50%', transform: 'translateX(-50%)', overflowX: 'auto', scrollbarWidth: 'none' }} className="sk-hide-mobile">
          {isLoggedIn ? (
            navItems.map(item => (
              <button key={item.path}
                style={navBtn(active(item.path))}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </button>
            ))
          ) : (
            <>
              <button onClick={() => { if(location.pathname!=='/') navigate('/'); setTimeout(()=>document.getElementById('about-tool')?.scrollIntoView({behavior:'smooth'}), 100); }} style={navBtn(false)}>About</button>
              <button onClick={() => { if(location.pathname!=='/') navigate('/'); setTimeout(()=>document.getElementById('key-benefits')?.scrollIntoView({behavior:'smooth'}), 100); }} style={navBtn(false)}>Features</button>
              <button onClick={() => { if(location.pathname!=='/') navigate('/'); setTimeout(()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'}), 100); }} style={navBtn(false)}>Process</button>
            </>
          )}
        </nav>

        {/* Right — Active Session Details */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          
          {/* Testing Mode */}
          <button 
            onClick={() => {
              const current = localStorage.getItem('testing_mode') === 'true';
              localStorage.setItem('testing_mode', !current ? 'true' : 'false');
              window.dispatchEvent(new Event('testing_mode_changed'));
              setTestingMode(!current);
            }} 
            style={{
              border: 'none', 
              color: testingMode ? '#EF4444' : T.sub, 
              cursor: 'pointer',
              padding: '6px 10px', 
              borderRadius: 12, 
              transition: 'all 0.2s',
              background: testingMode ? 'rgba(239,68,68,0.15)' : (dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title="Toggle Testing Mode"
          >
            🧪 <span className="sk-hide-mobile">{testingMode ? 'Testing ON' : 'Testing OFF'}</span>
          </button>

          {/* Theme */}
          <button onClick={toggleDark} style={{
            border: 'none', color: T.sub, cursor: 'pointer',
            padding: 8, borderRadius: 12, transition: 'background 0.2s',
            background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
          }}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {isLoggedIn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 10, height: 10, borderRadius: '50%', 
                    background: llmStatus?.online ? '#10B981' : '#EF4444', 
                    boxShadow: llmStatus?.online ? '0 0 10px #10B981' : '0 0 10px #EF4444',
                    transition: '0.3s'
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>{displayName.split(' ')[0]}</div>
               </div>
               <button 
                 onClick={() => { logout(); navigate('/login'); }}
                 style={{ 
                   display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 12, 
                   background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.1)', 
                   color: '#EF4444', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: '0.2s'
                 }}
                 title="Logout"
               >
                 <LogOut size={16} />
                 <span className="sk-hide-mobile">Exit</span>
               </button>
            </div>
          )}

          {!isLoggedIn && (
            <button onClick={() => navigate('/login')} style={{
              padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: '#3B82F6', color: '#fff', fontWeight: 800, fontSize: 13,
              boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
            }}>Login</button>
          )}

          {isLoggedIn && (
            <button className="sk-show-mobile" onClick={() => setMobileOpen(v => !v)}
              style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', padding: 4 }}>
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && isLoggedIn && (
        <>
          {/* Backdrop overlay */}
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9998 }}
          />
          {/* Side drawer */}
          <div style={{ background: dark ? 'rgba(10,10,15,0.98)' : T.card, borderRight: `1px solid ${T.bdr}`, padding: '12px 16px', position: 'fixed', top: 0, left: 0, height: '100vh', width: 280, zIndex: 9999, overflowY: 'auto', boxShadow: '4px 0 24px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, marginBottom: 8, borderBottom: `1px solid ${T.bdr}` }}>
              <ZensarLogo size="sm" />
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>
            {navItems.map(item => (
              <button key={item.path}
                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
                  borderRadius: 10, marginBottom: 6,
                  background: active(item.path) ? '#3B82F6' : 'transparent',
                  color: active(item.path) ? '#fff' : T.sub,
                  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700
                }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media(max-width:900px){.sk-hide-mobile{display:none!important}}
        @media(min-width:901px){.sk-show-mobile{display:none!important}}
        nav::-webkit-scrollbar { display: none; }
        nav { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </header>
  );
}
