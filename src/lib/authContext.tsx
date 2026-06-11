import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { UserRole } from './types';
import { saveSession, loadSession } from './localDB';
import { apiLogout } from './api';

interface AuthState {
  isLoggedIn: boolean;
  role: UserRole | null;
  employeeId: string | null;
  name: string | null;
}

interface AuthContextType extends AuthState {
  login: (...args: any[]) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(() => {
    const session = loadSession();
    if (session) {
      return {
        isLoggedIn: true,
        role: session.role as UserRole,
        employeeId: session.employeeId,
        name: session.name,
      };
    }
    return { isLoggedIn: false, role: null, employeeId: null, name: null };
  });

  const login = useCallback((...args: any[]) => {
    let role: UserRole;
    let employeeId: string | null = null;
    let name: string | null = null;

    // Handle Object-based login (e.g. login(employeeObj))
    if (typeof args[0] === 'object' && args[0] !== null) {
      const obj = args[0];
      role = obj.role || 'employee';
      employeeId = String(obj.zensar_id || obj.id || obj.ID || obj.ZensarID || obj.employeeId || '');
      name = obj.name || obj.Name || (role === 'admin' ? 'Admin User' : 'Employee');
    } 
    // Handle Positional login (e.g. login('admin', 'id', 'name'))
    else {
      role = args[0];
      employeeId = String(args[1] || '');
      name = args[2] || (role === 'admin' ? 'Admin User' : 'Employee');
    }

    if (!role) role = 'employee';
    if (!employeeId) employeeId = 'emp1';

    const newAuth: AuthState = {
      isLoggedIn: true,
      role,
      employeeId: employeeId,
      name: name,
    };

    // 1. Update State
    setAuth(newAuth);
    
    // 2. Persist to LocalStorage (This updates skill_nav_session_id)
    // Only set employee session for actual employees, not admins
    if (role === 'employee') {
      saveSession({ employeeId: employeeId, role, name: name });
    } else {
      // For admins, clear any existing employee session to avoid conflicts
      localStorage.removeItem('skill_nav_session_id');
      localStorage.setItem('skill_nav_session_role', role);
      localStorage.setItem('skill_nav_session_name', name);
    }
    
    // 3. Force Global Refresh
    const event = new CustomEvent('skill_nav_session_changed', { detail: newAuth });
    window.dispatchEvent(event);
    
    // Compatibility with standard Event for older listeners
    window.dispatchEvent(new Event('skill_nav_session_changed'));
  }, []);

  const logout = useCallback(() => {
    apiLogout().catch(() => {});
    setAuth({ isLoggedIn: false, role: null, employeeId: null, name: null });
    // Wipe all browser-stored state so nothing from this session (tokens,
    // cached profiles, skill data) can bleed into the next employee's session.
    localStorage.clear();
    sessionStorage.clear();
    window.dispatchEvent(new Event('skill_nav_session_changed'));
  }, []);

  return <AuthContext.Provider value={{ ...auth, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
