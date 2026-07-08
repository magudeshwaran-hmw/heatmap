/**
 * api.ts — frontend client for the Skill Navigator backend
 * Always uses relative /api when running through the single-port gateway or tunnel.
 */

import { shouldUseGatewayProxies } from './tunnelHosts';

/** Ensure API base always ends with /api (VITE_API_URL may be set with or without it). */
function resolveApiBase(): string {
  // Single gateway mode OR tunnel: always use relative /api (same host:port as frontend)
  // This is the correct behaviour for forwarded/tunnel URLs — never hardcode a port.
  if (shouldUseGatewayProxies()) return '/api';

  const raw = import.meta.env.VITE_API_URL?.trim();
  if (raw) {
    const trimmed = raw.replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  // Fallback: relative /api works in all cases since Vite proxies /api → backend
  return '/api';
}

export const API_BASE = resolveApiBase();

// Token storage helpers
export const tokenStore = {
  getAccess: () => localStorage.getItem('zn_access_token'),
  getRefresh: () => localStorage.getItem('zn_refresh_token'),
  set: (access: string, refresh: string) => {
    localStorage.setItem('zn_access_token', access);
    localStorage.setItem('zn_refresh_token', refresh);
  },
  clear: () => {
    localStorage.removeItem('zn_access_token');
    localStorage.removeItem('zn_refresh_token');
  },
};

export async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401 TOKEN_EXPIRED
  if (res.status === 401) {
    const errData = await res.json().catch(() => ({}));
    if (errData.code === 'TOKEN_EXPIRED') {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${tokenStore.getAccess()}`;
        const retry = await fetch(`${API_BASE}${path}`, {
          method, headers, body: body ? JSON.stringify(body) : undefined,
        });
        const retryData = await retry.json();
        if (!retry.ok) throw new Error(retryData.error || `HTTP ${retry.status}`);
        return retryData as T;
      }
    }
    throw new Error(errData.error || `HTTP ${res.status}`);
  }

  const raw = await res.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    // The server returned non-JSON (usually the SPA index.html when a route is
    // missing) — give a clear, actionable message instead of "Unexpected token '<'".
    throw new Error(
      res.ok
        ? 'Server returned a non-JSON response. The backend may be out of date — restart it (npm run server).'
        : `Endpoint not found (HTTP ${res.status}). The backend may be out of date — restart it (npm run server).`
    );
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// Public wrapper so long-running batches (e.g. bulk import of 100 resumes, which can
// outlast the 15-minute access token) can proactively refresh before/inside the loop.
// Returns true if a token is available afterwards. No-op-safe when already fresh.
export async function apiRefreshToken(): Promise<boolean> {
  if (!tokenStore.getRefresh()) return !!tokenStore.getAccess();
  return tryRefreshToken();
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) { tokenStore.clear(); return false; }
    const data = await res.json();
    localStorage.setItem('zn_access_token', data.accessToken);
    return true;
  } catch { tokenStore.clear(); return false; }
}

// ─── Health check ─────────────────────────────────────────────────────────────
export async function isServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/employees`, { method: 'GET' });
    return res.ok;
  } catch { return false; }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface RegisterPayload {
  name: string; email: string; phone: string;
  designation: string; department: string; location: string;
  yearsIT: number; yearsZensar: number;
  password: string; resumeUploaded: boolean; zensarId: string;
}

export interface EmployeeRecord {
  id: string; name: string; email: string; phone: string;
  designation: string; department: string; location: string;
  yearsIT: number; yearsZensar: number;
  primarySkill: string; primaryDomain: string;
  overallCapability: number;
  submitted: string; submittedAt: string;
  resumeUploaded: string; createdAt: string;
  zensarId?: string; ZensarID?: string; ID?: string; Name?: string;
  Email?: string; Phone?: string; Designation?: string; Department?: string;
  Location?: string; YearsIT?: number; YearsZensar?: number; Submitted?: string;
}

export async function apiRegister(payload: RegisterPayload): Promise<EmployeeRecord> {
  const res = await req<{ success: boolean; employee: EmployeeRecord }>('POST', '/register', payload);
  return res.employee;
}

export async function apiLogin(login: string, password: string): Promise<EmployeeRecord> {
  const res = await req<{ success: boolean; employee: EmployeeRecord; accessToken: string; refreshToken: string }>(
    'POST', '/login', { login, password }
  );
  if (res.accessToken && res.refreshToken) {
    tokenStore.set(res.accessToken, res.refreshToken);
  }
  return res.employee;
}

export async function apiLogout(): Promise<void> {
  const refresh = tokenStore.getRefresh();
  try { await req('POST', '/auth/logout', { refreshToken: refresh }); } catch { /* ignore */ }
  tokenStore.clear();
}

// ─── Employees ────────────────────────────────────────────────────────────────
export async function apiGetAllEmployees(): Promise<{ employees: EmployeeRecord[]; skills: any[] }> {
  return req<{ employees: EmployeeRecord[]; skills: any[] }>('GET', '/employees');
}

export async function apiGetEmployee(id: string): Promise<EmployeeRecord> {
  return req<EmployeeRecord>('GET', `/employees/${id}`);
}

export async function apiUpdateEmployee(id: string, data: Partial<EmployeeRecord>): Promise<EmployeeRecord> {
  const res = await req<{ success: boolean; employee: EmployeeRecord }>('PUT', `/employees/${id}`, data);
  return res.employee;
}

// ─── Skills ───────────────────────────────────────────────────────────────────
export interface ApiSkillRating {
  skillId: string; selfRating: number; managerRating: number | null; validated: boolean;
  skillName?: string; verifiedBadgeLevel?: string | null; selfClaimedLevel?: string | null;
}

export async function apiGetSkills(employeeId: string): Promise<ApiSkillRating[]> {
  return req<ApiSkillRating[]>('GET', `/employees/${employeeId}/skills`);
}

// BUG 1 FIX: send flat skill columns (not a JSON blob array)
// flatSkills format: { "Selenium": 2, "Python": 3, ... }
export async function apiSaveSkills(
  employeeId: string,
  employeeName: string,
  flatSkills: Record<string, number>
): Promise<void> {
  await req('PUT', `/employees/${employeeId}/skills`, { employeeName, ...flatSkills });
}

export async function apiSubmit(employeeId: string): Promise<void> {
  await req('POST', `/employees/${employeeId}/submit`, {});
}

// ─── Skill-group completion flags (admin Excel-driven Yes/No) ─────────────────
export interface ApiCompletionRecord {
  empKey: string; empId: string; empName: string;
  aiForQe: boolean; qeForAi: boolean; testAutomation: boolean;
}

export async function apiGetCompletions(): Promise<{ records: ApiCompletionRecord[]; fileName: string; uploadedAt: string | null }> {
  return req('GET', '/skill-completions');
}

export async function apiSaveCompletions(fileName: string, records: ApiCompletionRecord[]): Promise<{ success: boolean; count: number }> {
  return req('POST', '/skill-completions', { fileName, records });
}

export async function apiClearCompletions(): Promise<void> {
  await req('DELETE', '/skill-completions');
}

export async function apiResetCompletionFlag(flag: 'aiForQe' | 'qeForAi' | 'testAutomation'): Promise<void> {
  await req('POST', '/skill-completions/reset-flag', { flag });
}

// ─── QISL ZenMatrix — employee self-ratings for QE-taxonomy skills ────────────
export interface QislSkillDetail {
  skillName: string;
  level: number;
  taxonomyId: number | null;   // null = a custom "Others" skill (not one of the 166)
  family: string | null;
  group: string | null;
  priority: 'primary' | 'secondary' | 'tertiary' | null;
  source: 'ai' | 'self';
}

/** Per-skill metadata sent alongside the ratings map so custom skills keep their family. */
export interface QislSkillMeta {
  taxonomyId?: number | null;
  family?: string | null;
  group?: string | null;
  priority?: 'primary' | 'secondary' | 'tertiary' | null;
}

export async function apiGetQislSkills(
  employeeId: string
): Promise<{ ratings: Record<string, number>; details?: QislSkillDetail[] }> {
  return req('GET', `/qisl-skills/${encodeURIComponent(employeeId)}`);
}

/** Bulk QISL ratings for the admin QI SL Heatmap: { byEmployee: { [id]: QislSkillDetail[] } }. */
export async function apiGetAllQislSkills(): Promise<{ byEmployee: Record<string, QislSkillDetail[]> }> {
  return req('GET', `/qisl-skills`);
}

export async function apiSaveQislSkills(
  employeeId: string,
  ratings: Record<string, number>,
  meta?: Record<string, QislSkillMeta>
): Promise<void> {
  await req('POST', `/qisl-skills/${encodeURIComponent(employeeId)}`, { ratings, meta });
}

// ─── Chain-lock: persist resume-extracted QE-taxonomy skills ──────────────────
// One call fans out to qisl_skill_ratings (with family/group/priority/provenance)
// and refreshes the employee's primary/secondary/tertiary skill, without clobbering
// any skill the employee already self-rated. Used by the resume-upload flow.
export interface TaxonomySkillPayload {
  id?: number;
  name: string;
  family?: string;
  group?: string;
  proficiency: number;                                   // 0-3
  priority?: 'primary' | 'secondary' | 'tertiary' | null;
}

export async function apiSaveTaxonomySkills(
  employeeId: string,
  payload: {
    source?: 'ai' | 'self';
    primarySkill?: string;
    secondarySkill?: string;
    tertiarySkill?: string;
    skills: TaxonomySkillPayload[];
  }
): Promise<{ success: boolean; written: number }> {
  return req('POST', `/employees/${encodeURIComponent(employeeId)}/taxonomy-skills`, payload);
}
