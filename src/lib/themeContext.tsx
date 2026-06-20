/**
 * themeContext.tsx — Global dark/light theme persisted in localStorage.
 * Default: DARK mode (since the app is a professional dark-themed tool).
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface ThemeCtx { dark: boolean; toggleDark: () => void; }
const ThemeContext = createContext<ThemeCtx>({ dark: true, toggleDark: () => {} });

function applyBodyTheme(dark: boolean) {
  document.body.style.background = dark ? '#050B18' : '#EEF4FF';
  document.body.style.color      = dark ? '#ffffff'  : '#0F172A';
  document.body.style.transition = 'background 0.35s, color 0.35s';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sk_theme');
      // Default to DARK if no preference saved
      return saved === 'light' ? false : true;
    } catch { return true; }
  });

  // Apply on mount and whenever dark changes
  useEffect(() => { applyBodyTheme(dark); }, [dark]);

  const toggleDark = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      try { localStorage.setItem('sk_theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ dark, toggleDark }}>{children}</ThemeContext.Provider>;
};

export const useDark = () => useContext(ThemeContext);

/** Creates a full set of theme-aware CSS values */
export function mkTheme(dark: boolean) {
  return {
    bg:       dark ? '#050B18'                      : '#EEF4FF',
    bgSec:    dark ? '#0A1628'                      : '#DDE8FF',
    text:     dark ? '#FFFFFF'                      : '#0F172A',
    sub:      dark ? 'rgba(255,255,255,0.58)'       : 'rgba(15,23,42,0.65)',
    muted:    dark ? 'rgba(255,255,255,0.32)'       : 'rgba(15,23,42,0.40)',
    card:     dark ? 'rgba(255,255,255,0.06)'       : 'rgba(255,255,255,0.85)',
    cardHov:  dark ? 'rgba(255,255,255,0.10)'       : 'rgba(255,255,255,0.96)',
    // Fully OPAQUE surface for modal/popup panels & dropdowns — never let page
    // content bleed through. Matches the solid surface used by fixed modals.
    cardSolid: dark ? '#0F172A'                     : '#FFFFFF',
    bdr:      dark ? 'rgba(255,255,255,0.10)'       : 'rgba(99,102,241,0.20)',
    input:    dark ? 'rgba(255,255,255,0.07)'       : 'rgba(255,255,255,0.90)',
    inputBdr: dark ? 'rgba(255,255,255,0.15)'       : 'rgba(99,102,241,0.30)',
  };
}
