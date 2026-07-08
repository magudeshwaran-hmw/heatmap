import { API_BASE } from '@/lib/api';
/**
 * localDB.ts — localStorage-based DB + Excel (XLSX) export
 */
import * as XLSX from 'xlsx';
import { Employee, SkillRating, GrowthPlan, ProficiencyLevel } from './types';
import { SKILLS, MOCK_EMPLOYEES, MOCK_GROWTH_PLANS } from './mockData';

const KEYS = {
  EMPLOYEES:    'skill_nav_employees',
  GROWTH_PLANS: 'skill_nav_growth_plans',
  CURRENT_USER: 'skill_nav_current_user',
};

// ─── Seed on first load ──────────────────────────────────────────────────────
function seedIfNeeded() {
  if (!localStorage.getItem(KEYS.EMPLOYEES))
    localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(MOCK_EMPLOYEES));
  if (!localStorage.getItem(KEYS.GROWTH_PLANS))
    localStorage.setItem(KEYS.GROWTH_PLANS, JSON.stringify(MOCK_GROWTH_PLANS));
}
seedIfNeeded();

// ─── Raw helpers ─────────────────────────────────────────────────────────────
function readEmployees(): Employee[] {
  return JSON.parse(localStorage.getItem(KEYS.EMPLOYEES) || '[]');
}
function writeEmployees(data: Employee[]) {
  localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(data));
}
function readGrowthPlans(): GrowthPlan[] {
  return JSON.parse(localStorage.getItem(KEYS.GROWTH_PLANS) || '[]');
}
function writeGrowthPlans(data: GrowthPlan[]) {
  localStorage.setItem(KEYS.GROWTH_PLANS, JSON.stringify(data));
}

// ─── Employee CRUD ────────────────────────────────────────────────────────────
export async function getAllEmployees(): Promise<{ employees: any[], skills: any[] }> {
  try {
    const res = await fetch(`${API_BASE}/employees`);
    return await res.json();
  } catch (err) {
    console.error('Fetch error:', err);
    return { employees: [], skills: [] };
  }
}

export async function getCurrentUser(): Promise<any> {
  const { employees } = await getAllEmployees();
  const userId = localStorage.getItem('skill_nav_session_id');
  return employees.find((e: any) => e.ID === userId || e.id === userId) || null;
}

export async function saveEmployee(employeeData: any) {
  const res = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType: 'EMPLOYEE_REGISTERED', ...employeeData })
  });
  return res.json();
}

export async function saveSkillRatings(employeeId: string, employeeName: string, ratings: any) {
  const res = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'SKILLS_UPDATED',
      employeeId,
      employeeName,
      skillCount: 32,
      ...ratings
    })
  });
  return res.json();
}

export async function getSkillsByEmployee(
  employeeId: string,
  employeeName?: string
): Promise<any> {
  try {
    const { skills } = await getAllEmployees();
    if (!skills || !Array.isArray(skills)) return null;

    const found = skills.find((s: any) => {
      // Try every possible field name variant Power Automate may use
      const idMatch = (
        s.employeeId    === employeeId ||
        s['Employee ID'] === employeeId ||
        s['EmployeeID'] === employeeId ||
        s.employee_id   === employeeId ||
        s.ID            === employeeId ||
        s.id            === employeeId
      );
      const nameMatch = employeeName && (
        s.employeeName       === employeeName ||
        s['Employee Name']   === employeeName ||
        s.Name               === employeeName
      );
      return idMatch || nameMatch;
    });

    return found || null;
  } catch (err) {
    console.error('[localDB] getSkillsByEmployee failed:', err);
    return null;
  }
}


export function getEmployee(id: string): Employee | undefined {
  return readEmployees().find(e => e.id === id);
}

export function upsertEmployee(emp: Employee): void {
  const all = readEmployees();
  const idx = all.findIndex(e => e.id === emp.id);
  if (idx >= 0) all[idx] = emp; else all.push(emp);
  writeEmployees(all);
}

export function createNewEmployee(name: string, email: string, designation: string): Employee {
  const id = `emp_${Date.now()}`;
  const emp: Employee = {
    id, name, email, designation,
    department: 'Quality Engineering',
    yearsIT: 0, yearsZensar: 0,
    primarySkill: '', primaryDomain: '',
    skills: SKILLS.map(s => ({ skillId: s.id, selfRating: 0 as ProficiencyLevel, managerRating: null, validated: false })),
    resumeUploaded: false,
    overallCapability: 0,
    submitted: false,
  };
  upsertEmployee(emp);
  return emp;
}

// ─── Skill ratings ────────────────────────────────────────────────────────────
export function submitSkillMatrix(employeeId: string): void {
  const all = readEmployees();
  const idx = all.findIndex(e => e.id === employeeId);
  if (idx < 0) return;
  all[idx].submitted = true;
  writeEmployees(all);
}

/** % of skills rated ≥ 1 out of 32 */
export function computeCompletion(ratings: SkillRating[]): number {
  const rated = ratings.filter(r => r.selfRating > 0).length;
  return Math.round((rated / SKILLS.length) * 100);
}

export function getIncompleteSkills(ratings: SkillRating[]) {
  return SKILLS.filter(s => {
    const r = ratings.find(r => r.skillId === s.id);
    return !r || r.selfRating === 0;
  });
}

// ─── Growth Plans ─────────────────────────────────────────────────────────────
export function getGrowthPlans(employeeId: string): GrowthPlan[] {
  return readGrowthPlans().filter(gp => gp.employeeId === employeeId);
}
export function saveGrowthPlan(plan: GrowthPlan): void {
  const all = readGrowthPlans();
  const idx = all.findIndex(g => g.id === plan.id);
  if (idx >= 0) all[idx] = plan; else all.push(plan);
  writeGrowthPlans(all);
}

// ─── Session ──────────────────────────────────────────────────────────────────
export interface SessionUser { employeeId: string; role: 'employee' | 'admin'; name: string; }

export function saveSession(user: SessionUser) {
  localStorage.setItem('skill_nav_session_id', user.employeeId);
  localStorage.setItem('skill_nav_session_role', user.role);
  localStorage.setItem('skill_nav_session_name', user.name);
  window.dispatchEvent(new Event('skill_nav_session_changed'));
}
export function loadSession(): SessionUser | null {
  const id = localStorage.getItem('skill_nav_session_id');
  const role = localStorage.getItem('skill_nav_session_role');
  const name = localStorage.getItem('skill_nav_session_name');
  // Admin sessions store only the role (no employee id), so restore them here — else
  // a full page load / direct URL to an /admin/* route loses the session and bounces
  // to the login page even though the admin is signed in.
  if (!id) {
    if (role === 'admin') return { employeeId: 'admin', role: 'admin', name: name || 'Admin User' };
    return null;
  }
  return { employeeId: id, role: (role as any) || 'employee', name: name || 'User' };
}
export function clearSession() { 
  localStorage.removeItem('skill_nav_session_id'); 
  localStorage.removeItem('skill_nav_session_role'); 
  localStorage.removeItem('skill_nav_session_name'); 
  window.dispatchEvent(new Event('skill_nav_session_changed'));
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
const LEVEL_LABEL: Record<number, string> = { 0: 'Not Rated', 1: 'Beginner', 2: 'Intermediate', 3: 'Expert' };

/** Export provided employee skill data as a multi-sheet Excel file and trigger download */
export function exportAllToExcel(customEmployees?: any[]): void {
  const employees = customEmployees || [];
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const summaryRows = employees.map(e => ({
    'Employee ID':        e.zensar_id || e.id,
    'Name':               e.name || e.Name,
    'Email':              e.email || e.Email,
    'Designation':        e.designation || e.Designation,
    'Department':         e.department || e.Department || 'Quality Intelligence',
    'Completion %':       e.completion || 0,
    'Submitted':          (e.submitted === true || e.Submitted === 'Yes') ? 'Yes' : 'No',
    'Date Exported':      new Date().toLocaleString()
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Skill Ratings ──────────────────────────────────────────────────
  const skillRows = employees.map(e => {
    const row: Record<string, string | number> = { Name: e.name || e.Name, ID: e.zensar_id || e.id };
    SKILLS.forEach(s => {
      const r = (e.skills || []).find((rt: any) => rt.skillId === s.id);
      row[s.name] = LEVEL_LABEL[r?.selfRating ?? 0];
    });
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skillRows), 'Skills');

  // ── Sheet 3: Certifications ──────────────────────────────────────────────────
  const certRows: any[] = [];
  employees.forEach(e => {
    (e.certifications || []).forEach((c: any) => {
      certRows.push({
        'Employee': e.name || e.Name,
        'ID': e.zensar_id || e.id,
        'Cert Name': c.CertName || c.cert_name,
        'Provider': c.Provider || c.provider,
        'Status': c.status || 'Active'
      });
    });
  });
  if (certRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(certRows), 'Certifications');

  // ── Sheet 4: Projects ────────────────────────────────────────────────────────
  const projRows: any[] = [];
  employees.forEach(e => {
    (e.projects || []).forEach((p: any) => {
      projRows.push({
        'Employee': e.name || e.Name,
        'ID': e.zensar_id || e.id,
        'Project': p.ProjectName || p.project_name,
        'Role': p.Role || p.role,
        'Domain': p.Domain || p.domain,
        'Technologies': Array.isArray(p.Technologies) ? p.Technologies.join(', ') : p.Technologies
      });
    });
  });
  if (projRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projRows), 'Projects');

  // ── Sheet 5: Education ────────────────────────────────────────────────────────
  const eduRows: any[] = [];
  employees.forEach(e => {
    (e.education || []).forEach((ed: any) => {
      eduRows.push({
        'Employee': e.name || e.Name,
        'ID': e.zensar_id || e.id,
        'Degree': ed.Degree || ed.degree,
        'Institution': ed.Institution || ed.institution,
        'Field': ed.FieldOfStudy || ed.field_of_study,
        'Year': ed.EndDate || ed.end_date
      });
    });
  });
  if (eduRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eduRows), 'Education');

  // ── Trigger download ─────────────────────────────────────────────────────────
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `QI_SkillMatrix_Export_${date}.xlsx`);
}

/** Export a single employee's data to Excel */
export function exportEmployeeToExcel(employeeId: string, aiPlanData?: any[]): void {
  const emp = getEmployee(employeeId);
  if (!emp) return;

  const wb = XLSX.utils.book_new();

  // Profile sheet
  const profile = [{
    'Name': emp.name, 'Email': emp.email, 'Designation': emp.designation,
    'Department': emp.department, 'Years in IT': emp.yearsIT, 'Years at Zensar': emp.yearsZensar,
    'Primary Skill': emp.primarySkill, 'Primary Domain': emp.primaryDomain,
    'Completion %': computeCompletion(emp.skills), 'Submitted': emp.submitted ? 'Yes' : 'No',
  }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profile), 'Profile');

  // Skills sheet
  const skillRows = emp.skills.map(r => {
    const s = SKILLS.find(sk => sk.id === r.skillId);
    return {
      'Skill': s?.name || r.skillId,
      'Category': s?.category || '',
      'Self Rating': LEVEL_LABEL[r.selfRating],
      'Manager Rating': r.managerRating != null ? LEVEL_LABEL[r.managerRating] : '-',
      'Validated': r.validated ? 'Yes' : 'No',
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skillRows), 'Skills');

  // AI Insights / 90-Day Plan sheet
  if (aiPlanData && aiPlanData.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aiPlanData), 'AI 90-Day Plan');
  }

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${emp.name.replace(/\s+/g, '_')}_SkillMatrix_${date}.xlsx`);
}
