import { useAuth } from '@/lib/authContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut, Menu, X, Sun, Moon, ChevronDown,
  LayoutDashboard, Landmark, Radar, Grid3x3, ClipboardCheck,
  Bot, Code2, FolderKanban, GraduationCap, BadgeCheck, Trophy,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { checkLLMStatus } from '@/lib/llm';
import { ZensarLogo } from '@/components/ZensarLogo';
import { useApp } from '@/lib/AppContext';
import { useDark, mkTheme } from '@/lib/themeContext';

type NavItem = { label: string; path: string; icon: React.ComponentType<{ size?: number }> };

export default function AppHeader() {
  const { isLoggedIn, role, name, logout } = useAuth();
  const { data: appData } = useApp();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen]     = useState(false);
  const [llmStatus, setLlmStatus]   = useState<{ online: boolean; mode: string } | null>(null);

  const { dark, toggleDark } = useDark();
  const T = mkTheme(dark);

  const desktopMoreRef = useRef<HTMLDivElement>(null);
  const tabletMenuRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkLLMStatus().then(s => setLlmStatus(s));
    const iv = setInterval(() => checkLLMStatus().then(s => setLlmStatus(s)), 15000);
    return () => clearInterval(iv);
  }, []);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (desktopMoreRef.current?.contains(t)) return;
      if (tabletMenuRef.current?.contains(t)) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [moreOpen]);

  // Close menus on route change
  useEffect(() => { setMoreOpen(false); setMobileOpen(false); }, [location.pathname]);

  const displayName  = appData?.user?.Name || name || '…';
  const active       = (p: string) => location.pathname === p;

  // PRIMARY items (direct top-level links on desktop)
  const empPrimary: NavItem[] = [
    { label: 'ZenRadar',  path: '/employee/dashboard', icon: Radar },
    { label: 'ZenMatrix', path: '/employee/skills',    icon: Grid3x3 },
    { label: 'ZenAssess', path: '/employee/zenassess', icon: ClipboardCheck },
  ];
  // MORE items (inside the "More ▾" dropdown on desktop)
  const empMore: NavItem[] = [
    { label: 'ZenAICoach',       path: '/employee/ai',                  icon: Bot },
    { label: 'ZenCode',          path: '/employee/github-intelligence', icon: Code2 },
    { label: 'My Projects',      path: '/employee/projects',            icon: FolderKanban },
    { label: 'My Education',     path: '/employee/education',           icon: GraduationCap },
    { label: 'My Certification', path: '/employee/certifications',      icon: BadgeCheck },
    { label: 'My Awards',        path: '/employee/achievements',        icon: Trophy },
  ];

  const adminPrimary: NavItem[] = [
    { label: 'ZenRadar',     path: '/admin',      icon: LayoutDashboard },
    { label: 'ZenTalentHub', path: '/admin/bfsi', icon: Landmark },
  ];
  const adminMore: NavItem[] = [];

  const primaryItems = role === 'admin' ? adminPrimary : empPrimary;
  const moreItems    = role === 'admin' ? adminMore    : empMore;
  const allItems     = [...primaryItems, ...moreItems];

  const moreActive = moreItems.some(i => active(i.path));
  const anyActive  = allItems.some(i => active(i.path));

  const headerStyle: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 100,
    height: 60,
    background: dark ? 'rgba(10,10,15,0.92)' : '#ffffff',
    borderBottom: `1px solid ${T.bdr}`,
    boxShadow: dark ? 'none' : '0 1px 10px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  const innerStyle: React.CSSProperties = {
    maxWidth: '100%', margin: '0', height: '100%',
    padding: '0 20px', display: 'flex', position: 'relative',
    alignItems: 'center', justifyContent: 'space-between', gap: 8,
  };

  // Top-level inline nav link (primary items + "More" trigger) — unchanged styling
  const navBtn = (isActive: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: isActive ? (dark ? 'rgba(59,130,246,0.15)' : '#EFF6FF') : 'transparent',
    color: isActive ? '#3B82F6' : T.sub,
    fontSize: 12, fontWeight: isActive ? 700 : 500, transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    flexShrink: 0,
  });

  // Dropdown panel item (icon + label) — solid opaque panel rows
  const dropItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    textAlign: 'left', whiteSpace: 'nowrap', fontSize: 13,
    fontWeight: isActive ? 700 : 600, transition: 'all 0.15s',
    background: isActive ? (dark ? 'rgba(59,130,246,0.15)' : '#EFF6FF') : 'transparent',
    color: isActive ? '#3B82F6' : T.sub,
  });

  const panelStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    minWidth: 210,
    background: T.cardSolid,                // SOLID opaque — Task 3 compliant
    border: `1px solid ${T.bdr}`,
    borderRadius: 12,
    boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
    padding: 6, zIndex: 1001,
    display: 'flex', flexDirection: 'column', gap: 2,
  };

  const renderDropdownItems = (items: NavItem[]) => items.map(item => {
    const Icon = item.icon; const a = active(item.path);
    return (
      <button key={item.path}
        style={dropItemStyle(a)}
        onClick={() => { navigate(item.path); setMoreOpen(false); }}
        onMouseEnter={e => { if (!a) e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; }}
        onMouseLeave={e => { if (!a) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={16} /> {item.label}
      </button>
    );
  });

  return (
    <header style={headerStyle}>
      <div style={innerStyle}>
        {/* Left — Logo pinned to far left */}
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0, marginRight: 8 }}>
          <ZensarLogo size="sm" />
        </div>

        {/* DESKTOP nav (≥1024px) — primary links + "More ▾" dropdown, centered */}
        {isLoggedIn ? (
          <nav className="sk-nav-d" style={{ alignItems: 'center', gap: 2, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            {primaryItems.map(item => (
              <button key={item.path} style={navBtn(active(item.path))} onClick={() => navigate(item.path)}>
                {item.label}
              </button>
            ))}
            {moreItems.length > 0 && (
              <div ref={desktopMoreRef} style={{ position: 'relative' }}>
                <button
                  style={navBtn(moreActive)}
                  onClick={() => setMoreOpen(o => !o)}
                  aria-haspopup="menu" aria-expanded={moreOpen}
                >
                  More <ChevronDown size={14} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {moreOpen && (
                  <div role="menu" style={panelStyle}>
                    {renderDropdownItems(moreItems)}
                  </div>
                )}
              </div>
            )}
          </nav>
        ) : (
          <nav className="sk-nav-dt" style={{ alignItems: 'center', gap: 2, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <button onClick={() => { if(location.pathname!=='/') navigate('/'); setTimeout(()=>document.getElementById('about-tool')?.scrollIntoView({behavior:'smooth'}), 100); }} style={navBtn(false)}>About</button>
            <button onClick={() => { if(location.pathname!=='/') navigate('/'); setTimeout(()=>document.getElementById('key-benefits')?.scrollIntoView({behavior:'smooth'}), 100); }} style={navBtn(false)}>Features</button>
            <button onClick={() => { if(location.pathname!=='/') navigate('/'); setTimeout(()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'}), 100); }} style={navBtn(false)}>Process</button>
          </nav>
        )}

        {/* Right — Active Session Details */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

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
                  <div className="sk-hide-mobile" style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>{displayName.split(' ')[0]}</div>
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

          {/* TABLET menu trigger (768–1023px) — collapses ALL nav into one dropdown */}
          {isLoggedIn && (
            <div ref={tabletMenuRef} className="sk-nav-t" style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen(o => !o)}
                aria-haspopup="menu" aria-expanded={moreOpen}
                style={navBtn(anyActive)}
                title="Menu"
              >
                <Menu size={18} /> <ChevronDown size={14} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {moreOpen && (
                <div role="menu" style={panelStyle}>
                  {renderDropdownItems(allItems)}
                </div>
              )}
            </div>
          )}

          {/* MOBILE hamburger (<768px) — opens slide drawer */}
          {isLoggedIn && (
            <button className="sk-nav-m" onClick={() => setMobileOpen(v => !v)}
              style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', padding: 4 }}>
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>
      </div>

      {/* MOBILE drawer (<768px) — all nav items as one flat list */}
      {mobileOpen && isLoggedIn && (
        <>
          {/* Backdrop overlay — fully opaque per modal standard */}
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 1000 }}
          />
          {/* Side drawer */}
          <div style={{ background: T.cardSolid, borderRight: `1px solid ${T.bdr}`, padding: '12px 16px', position: 'fixed', top: 0, left: 0, height: '100vh', width: 280, maxWidth: '85vw', zIndex: 1001, overflowY: 'auto', boxShadow: '4px 0 24px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, marginBottom: 8, borderBottom: `1px solid ${T.bdr}` }}>
              <ZensarLogo size="sm" />
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>

            <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, padding: '8px 14px 4px' }}>Main</div>
            {primaryItems.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.path}
                  onClick={() => { navigate(item.path); setMobileOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px',
                    borderRadius: 10, marginBottom: 4,
                    background: active(item.path) ? '#3B82F6' : 'transparent',
                    color: active(item.path) ? '#fff' : T.sub,
                    border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700
                  }}>
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}

            {moreItems.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, padding: '12px 14px 4px' }}>Tools</div>
            )}
            {moreItems.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.path}
                  onClick={() => { navigate(item.path); setMobileOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px',
                    borderRadius: 10, marginBottom: 4,
                    background: active(item.path) ? '#3B82F6' : 'transparent',
                    color: active(item.path) ? '#fff' : T.sub,
                    border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700
                  }}>
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      <style>{`
        /* 3-tier nav: desktop (≥1024) · tablet (768–1023) · mobile (<768) */
        .sk-nav-d  { display: flex; }
        .sk-nav-dt { display: flex; }
        .sk-nav-t  { display: none; }
        .sk-nav-m  { display: none; }
        @media (max-width: 1023px) {
          .sk-nav-d { display: none !important; }
          .sk-nav-t { display: flex !important; }
        }
        @media (max-width: 767px) {
          .sk-nav-dt { display: none !important; }
          .sk-nav-t  { display: none !important; }
          .sk-nav-m  { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
