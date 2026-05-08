/**
 * BFSIDashboard.tsx
 * Banking, Financial Services & Insurance Workforce Management Dashboard
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '@/lib/api';
import { useDark, mkTheme } from '@/lib/themeContext';
import { toast } from 'sonner';
import { formatZensarId, extractZensarId, formatEmployeeDisplay, isValidZensarId, validateAndFormatZensarId } from '@/lib/zensarIdUtils';
import {
  Building2, Users, Target, TrendingUp, AlertTriangle, Award,
  Upload, FileText, Download, Search, Filter, ChevronRight,
  Briefcase, GraduationCap, Clock, CheckCircle, XCircle,
  BarChart3, PieChart, Calendar, ArrowRight, Sparkles,
  Shield, CreditCard, Landmark, FileSpreadsheet, Plus, Trash2
} from 'lucide-react';

// Types
interface BFSIRole {
  id: number;
  role_id: string;
  role_title: string;
  client_name: string;
  required_skills: string[];
  days_open: number;
  status: string;
  fill_priority: string;
  assigned_spoc: string;
  hire_type?: string;
  job_description?: string;
  srf_no?: string;
  aging_bucket?: string;
  type?: string;
  candidate_count?: number;
  location?: string;
}

interface BFSIEmployee {
  employee_id: string;
  employee_name: string;
  email: string;
  current_skills: string[];
  certifications: string[];
  experience_years: number;
  status: string;
  primary_skill: string;
  secondary_skill?: string;
  reskilling_program?: string;
  graduation_date?: string;
  band?: string;
  billing_status?: string;
  project_name?: string;
  customer?: string;
  pm_name?: string;
  location?: string;
  rbu?: string;
  vbu?: string;
  vertical?: string;
  aging_days?: number;
  practice_name?: string;
  service_line?: string;
  matchScore?: number;
  readiness?: string;
  gaps?: string[];
  deallocation_date?: string;
  grade?: string;
  rmg_status?: string;
  pool_status?: string;
}

interface DashboardKPI {
  totalRoles: number;
  reactiveRoles: number;
  proactiveRoles: number;
  filledRoles: number;
  fillRate: number;
  totalWorkforce: number;
  billableEmployees: number;
  poolEmployees: number;
  deallocatingCount: number;
  readyEmployees: number;
  inCertification: number;
  avgDays: number;
  agingRoles: number;
  totalDemand: number;
  totalSupply: number;
  totalGap: number;
  skillGaps: Array<{ 
    skill: string; 
    demand: number; 
    supply: number; 
    gap: number;
    reactive: number;
    proactive: number;
    pool: number;
    deallocation: number;
  }>;
  criticalGap: string;
}

const COLORS = {
  danger: '#ef4444',
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  info: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f97316',
  chart: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899']
};

const ALL_BFSI_SKILLS = [
  'Automation Testing',
  'Automation Testing SDET',
  'AI/ML AI, ML, DEEP LEARNING',
  'Data / ETL',
  'Functional Testing Mobile',
  'Functional Testing',
  'Security Testing',
  'Performance Testing',
  'Application testing',
  'Accessibility Testing',
  'Digital Testing'
];

export default function BFSIDashboard() {
  const { dark } = useDark();
  const T = mkTheme(dark);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'supply' | 'demand' | 'match' | 'zenfinder'>('supply');
  const [supplySubTab, setSupplySubTab] = useState<'pool' | 'deallocation'>('pool');
  const [demandSubTab, setDemandSubTab] = useState<'reactive' | 'proactive'>('reactive');
  const [kpiData, setKpiData] = useState<DashboardKPI | null>(null);
  const [roles, setRoles] = useState<BFSIRole[]>([]);
  const [workforce, setWorkforce] = useState<BFSIEmployee[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState(0);
  const [uploadStepLabel, setUploadStepLabel] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<{ tab: string; metric: string; data: any[]; filterReasons?: Record<string, number> } | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalLocationFilter, setModalLocationFilter] = useState('All');
  const [modalGradeFilter, setModalGradeFilter] = useState('All');
  const [weeklyReport, setWeeklyReport] = useState<any | null>(null);
  const [jdModal, setJdModal] = useState<{ title: string; jd: string } | null>(null);
  const [skillMatrixModal, setSkillMatrixModal] = useState<{ employee: BFSIEmployee; skills: any[] } | null>(null);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [showTopRank, setShowTopRank] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'excel' | 'matrix' | 'both'>('all');
  const [selectedSRF, setSelectedSRF] = useState<BFSIRole | null>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  // ── ZenFinder state ──
  const [zfQuery, setZfQuery]           = useState('');
  const [zfResults, setZfResults]       = useState<any[]>([]);
  const [zfLoading, setZfLoading]       = useState(false);
  const [zfSuggestions, setZfSuggestions] = useState<string[]>([]);
  const [zfShowSugg, setZfShowSugg]     = useState(false);
  const [zfSearched, setZfSearched]     = useState(false);
  const [zfScorePopup, setZfScorePopup] = useState<any | null>(null);

  // ── ZenFinder: detect search intent from query ──
  const detectZenFinderIntent = (q: string): 'certification' | 'achievement' | 'skill' | 'project' | 'general' => {
    const lower = q.toLowerCase();
    const certKeywords = ['certif', 'certified', 'certificate', 'certification', 'credential', 'aws certified', 'pmp', 'istqb', 'cisa', 'cissp', 'azure certified', 'gcp certified', 'scrum master', 'csm', 'prince2'];
    const achKeywords = ['award', 'achievement', 'recognition', 'trophy', 'winner', 'best employee', 'star performer', 'accolade', 'honour', 'honor'];
    const projKeywords = ['project', 'client', 'domain', 'worked on', 'experience in', 'banking project', 'finance project'];
    const skillKeywords = ['skill', 'proficiency', 'expert', 'knowledge', 'automation', 'testing', 'java', 'python', 'react', 'angular', 'devops', 'kubernetes', 'docker', 'selenium', 'performance', 'security', 'sdet', 'etl', 'sql', 'machine learning', 'ai', 'ml'];

    if (certKeywords.some(k => lower.includes(k))) return 'certification';
    if (achKeywords.some(k => lower.includes(k))) return 'achievement';
    if (projKeywords.some(k => lower.includes(k))) return 'project';
    if (skillKeywords.some(k => lower.includes(k))) return 'skill';
    return 'general';
  };

  // ── ZenFinder: parse query into skill terms and location terms ──
  const LOCATION_WORDS = ['pune', 'hyderabad', 'bangalore', 'bengaluru', 'chennai', 'mumbai', 'noida', 'delhi', 'gurgaon', 'gurugram', 'india', 'offshore', 'onshore', 'uk', 'usa', 'remote'];
  const STOP_WORDS = ['in', 'at', 'with', 'and', 'or', 'for', 'the', 'a', 'an', 'developer', 'engineer', 'tester', 'who', 'has', 'have', 'from', 'based'];

  const parseQuery = (q: string) => {
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const locationTerms = words.filter(w => LOCATION_WORDS.some(l => w.includes(l)));
    const skillTerms = words.filter(w => !LOCATION_WORDS.some(l => w.includes(l)) && !STOP_WORDS.includes(w) && w.length > 2);
    return { skillTerms, locationTerms, allWords: words };
  };

  // ── ZenFinder: shared search function ──
  const runZenFinderSearch = async (rawQuery: string, currentWorkforce: BFSIEmployee[]) => {
    if (!rawQuery.trim()) return;
    setZfLoading(true);
    setZfSearched(true);
    const q = rawQuery.trim().toLowerCase();
    const intent = detectZenFinderIntent(q);
    const { skillTerms, locationTerms } = parseQuery(q);
    const results: any[] = [];

    // Match text against skill terms only (not location words)
    // Uses PHRASE matching first, then individual terms only if 3+ chars and specific enough
    const matchesSkill = (text: string) => {
      if (!text || skillTerms.length === 0) return false;
      // Normalize: lowercase + replace dashes/slashes with space so
      // "Automation Testing - SDET" becomes "automation testing  sdet"
      const t = text.toLowerCase().replace(/[-\/]/g, ' ').replace(/\s+/g, ' ');
      const skillPhrase = skillTerms.join(' ');
      // 1. Full phrase match
      if (t.includes(skillPhrase)) return true;
      // 2. All skill terms must appear (AND logic)
      if (skillTerms.length > 1 && skillTerms.every(w => t.includes(w))) return true;
      // 3. Single specific term (4+ chars, not generic)
      const GENERIC = ['test', 'work', 'data', 'base', 'soft', 'hard', 'good', 'best', 'high', 'lead'];
      if (skillTerms.length === 1) {
        const term = skillTerms[0];
        if (term.length >= 4 && !GENERIC.includes(term) && t.includes(term)) return true;
      }
      return false;
    };

    // Match text against full query or any word
    const matchesAny = (text: string) => {
      if (!text) return false;
      const t = text.toLowerCase();
      return t.includes(q) || skillTerms.some(w => t.includes(w)) || locationTerms.some(w => t.includes(w));
    };

    // Match location
    const LOCATION_ALIASES: Record<string, string[]> = {
      'bangalore': ['bangalore', 'bengaluru', 'bengaluru-electronic', 'electronic city'],
      'bengaluru': ['bangalore', 'bengaluru', 'bengaluru-electronic', 'electronic city'],
      'pune':      ['pune', 'pune campus', 'pune client', 'pune stpi', 'm3bi - pune'],
      'hyderabad': ['hyderabad', 'hyd', 'dlf sez'],
      'chennai':   ['chennai'],
      'mumbai':    ['mumbai', 'navi mumbai'],
      'noida':     ['noida'],
      'delhi':     ['delhi', 'gurgaon', 'gurugram'],
    };

    const matchesLocation = (text: string) => {
      if (!text || locationTerms.length === 0) return false;
      const t = text.toLowerCase();
      return locationTerms.some(w => {
        // Direct match
        if (t.includes(w)) return true;
        // Alias match — e.g. "bangalore" matches "bengaluru-electronic city"
        const aliases = LOCATION_ALIASES[w] || [];
        return aliases.some(alias => t.includes(alias));
      });
    };

    for (const emp of currentWorkforce.filter(e => e.status !== 'In-project')) {
      let score = 0;
      const reasons: { icon: string; verified: boolean; source: string; field: string; value: string; context: string; pts: number }[] = [];
      let hasSkillMatch = false; // must have at least one skill/cert/project match

      const addReason = (
        icon: string, verified: boolean,
        source: string, field: string, value: string,
        context: string, pts: number
      ) => {
        score += pts;
        if (!reasons.some(r => r.source === source && r.field === field && r.value === value)) {
          reasons.push({ icon, verified, source, field, value, context, pts });
        }
      };

      // ── Location match (bonus points, only added if skill also matches) ──
      const locMatch = locationTerms.length > 0 && matchesLocation(emp.location || '');
      // Location bonus added AFTER skill match confirmed (see gate below)

      // ── BFSI: Primary Skill ──
      if (intent === 'general' || intent === 'skill' || intent === 'project') {
        if (emp.primary_skill && matchesSkill(emp.primary_skill)) {
          hasSkillMatch = true;
          addReason('📊', true, 'BFSI Data', 'Primary Skill', emp.primary_skill,
            `Main declared skill in BFSI data.`, 20);
        }

        // ── BFSI: L1-L4 Current Skills ──
        if (intent !== 'project') {
          (emp.current_skills || []).forEach((s, i) => {
            if (!s) return;
            const subSkills = s.split(',').map(x => x.trim()).filter(Boolean);
            const toCheck = subSkills.length > 1 ? subSkills : [s];
            toCheck.forEach(sub => {
              if (matchesSkill(sub)) {
                hasSkillMatch = true;
                const display = sub.length > 60 ? sub.substring(0, 60) + '…' : sub;
                addReason('📊', true, 'BFSI Data', `L${i + 1} Skill`, display,
                  `Listed as an L${i + 1} skill in BFSI data.`, 12);
              }
            });
          });
        }

        // ── BFSI: Project / Customer ──
        if (emp.project_name && matchesSkill(emp.project_name)) {
          hasSkillMatch = true;
          addReason('🏗️', true, 'BFSI Data', 'Current Project', emp.project_name,
            `Employee is currently assigned to this project.`, 10);
        }
        if (emp.customer && matchesSkill(emp.customer)) {
          hasSkillMatch = true;
          addReason('🏢', true, 'BFSI Data', 'Customer', emp.customer,
            `Employee is working for this customer.`, 8);
        }
      }

      // ── Zen Matrix: fetch only relevant data based on intent ──
      try {
        const empId = emp.employee_id;

        // ── CERTIFICATIONS ──
        if (intent === 'certification' || intent === 'general') {
          const certRes = await fetch(`${API_BASE}/certifications/${empId}`);
          if (certRes.ok) {
            const certData = await certRes.json();
            const certs = certData.certifications || certData || [];
            (certs as any[]).forEach((c: any) => {
              const name = c.cert_name || c.name || '';
              const org = c.issuing_organization || c.issuer || '';
              if ((name && matchesSkill(name)) || (org && matchesSkill(org))) {
                hasSkillMatch = true;
                addReason('🏅', true, 'Zen Matrix → Certifications', 'Certificate',
                  `${name}${org ? ` by ${org}` : ''}`,
                  `Verified certification from Zen Matrix resume.`, 25);
              }
            });
          }
        }

        // ── ACHIEVEMENTS ──
        if (intent === 'achievement' || intent === 'general') {
          const achRes = await fetch(`${API_BASE}/achievements/${empId}`);
          if (achRes.ok) {
            const achData = await achRes.json();
            const achs = achData.achievements || achData || [];
            (achs as any[]).forEach((a: any) => {
              const title = a.title || '';
              const type = a.award_type || a.category || '';
              if (matchesSkill(title) || matchesSkill(type)) {
                hasSkillMatch = true;
                addReason('🏆', true, 'Zen Matrix → Awards', 'Achievement',
                  `${title}${type ? ` (${type})` : ''}`,
                  `Award/achievement from Zen Matrix resume.`, 22);
              }
            });
          }
        }

        // ── SKILLS ──
        if (intent === 'skill' || intent === 'general') {
          const skillsRes = await fetch(`${API_BASE}/employees/${empId}/skills`);
          if (skillsRes.ok) {
            const skills = await skillsRes.json();
            (skills as any[]).forEach((sk: any) => {
              const name = sk.skill_name || sk.skillName || '';
              if (name && matchesSkill(name)) {
                hasSkillMatch = true;
                const level = sk.self_rating || sk.selfRating || 0;
                addReason('🎓', true, 'Zen Matrix → Skills', 'Skill',
                  `${name} (L${level})`,
                  `Self-rated skill. L${level} = ${level === 3 ? 'Advanced' : level === 2 ? 'Intermediate' : level === 1 ? 'Beginner' : 'Not rated'}.`,
                  20);
              }
            });
          }
        }

        // ── PROJECTS ──
        if (intent === 'project' || intent === 'general') {
          const projRes = await fetch(`${API_BASE}/projects/${empId}`);
          if (projRes.ok) {
            const projData = await projRes.json();
            const projs = projData.projects || projData || [];
            (projs as any[]).forEach((p: any) => {
              const name = p.project_name || p.name || '';
              const client = p.client || '';
              const domain = p.domain || '';
              const techs = (p.technologies || []).join(' ');
              const skillsUsed = (p.skills_used || []).join(' ');
              const combined = [name, client, domain, techs, skillsUsed].join(' ');
              if (matchesSkill(combined)) {
                hasSkillMatch = true;
                const matchedPart = [name, client, domain].filter(x => x && matchesSkill(x)).join(' · ') || name;
                addReason('🏗️', true, 'Zen Matrix → Projects', 'Project',
                  matchedPart.substring(0, 60),
                  `Found in project data from Zen Matrix resume.`, 18);
              }
            });
          }
        }
      } catch {}

      // ── Only include if there's a real skill/cert/project match ──
      // If location was specified in query, employee MUST be in that location
      if (score > 0 && hasSkillMatch) {
        // If query has location terms, location match is REQUIRED not optional
        if (locationTerms.length > 0 && !locMatch) {
          // Location specified but employee not in that location — skip
        } else {
          // Add location bonus when skill matched
          if (locMatch) {
            addReason('📍', true, 'BFSI Data', 'Location', emp.location || '',
              `Employee is based at this location.`, 10);
            score += 10;
          }
          results.push({
            ...emp,
            zfScore: score,
            zfReasons: reasons.slice(0, 6),
            zfAllReasons: reasons,
            zfIntent: intent,
          });
        }
      }
    }

    results.sort((a, b) => b.zfScore - a.zfScore);
    setZfResults(results.slice(0, 50));
    setZfLoading(false);
  };

  // ── Demand filters ──
  const [dSkill, setDSkill]       = useState('All');
  const [dCustomer, setDCustomer] = useState('All');
  const [dCountry, setDCountry]   = useState('All');
  const [dShore, setDShore]       = useState('All');
  const [dGrade, setDGrade]       = useState('All');
  const [dPriority, setDPriority] = useState('All');
  const [dMonth, setDMonth]       = useState('All');
  const [dAgeing, setDAgeing]     = useState('All');
  const [dSearch, setDSearch]     = useState('');

  // ── Pool filters ──
  const [pSkill, setPSkill]       = useState('All');
  const [pGrade, setPGrade]       = useState('All');
  const [pLocation, setPLocation] = useState('All');
  const [pRmg, setPRmg]           = useState('All');
  const [pDeploy, setPDeploy]     = useState('All');
  const [pSearch, setPSearch]     = useState('');

  // ── Deallocation filters ──
  const [dlSkill, setDlSkill]     = useState('All');
  const [dlBand, setDlBand]       = useState('All');
  const [dlLoc, setDlLoc]         = useState('All');
  const [dlRmg, setDlRmg]         = useState('All');
  const [dlReason, setDlReason]   = useState('All');
  const [dlSearch, setDlSearch]   = useState('');

  // ── Parse META from job_description ──
  const parseMeta = (role: BFSIRole): Record<string, any> => {
    try {
      const jd = role.job_description || '';
      if (jd.startsWith('META:')) {
        const end = jd.indexOf('\n\nJD:');
        const metaStr = end > 0 ? jd.slice(5, end) : jd.slice(5);
        return JSON.parse(metaStr);
      }
    } catch {}
    return {};
  };

  const getJD = (role: BFSIRole): string => {
    const jd = role.job_description || '';
    const idx = jd.indexOf('\n\nJD:\n');
    return idx >= 0 ? jd.slice(idx + 6).trim() : jd;
  };

  const uniq = (arr: (string | undefined | null)[]) =>
    [...new Set(arr.filter(Boolean) as string[])].sort();

  const filterSelect = (label: string, val: string, set: (v: string) => void, opts: string[], color = COLORS.info) => (
    <select value={val} onChange={e => set(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: 10, background: val !== 'All' ? `${color}18` : (dark ? '#1e293b' : '#fff'), border: `1px solid ${val !== 'All' ? color : T.bdr}`, color: val !== 'All' ? color : T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
      <option value="All">{label}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  // ── Filtered roles ──
  const filteredRoles = useMemo(() => {
    const type = demandSubTab === 'reactive' ? 'Reactive' : 'Proactive';
    return roles.filter(r => {
      if (r.type !== type) return false;
      const meta = parseMeta(r);
      const s = dSearch.toLowerCase();
      if (s && !r.role_title?.toLowerCase().includes(s) && !r.srf_no?.toLowerCase().includes(s) && !r.client_name?.toLowerCase().includes(s) && !(r.required_skills || []).join(' ').toLowerCase().includes(s)) return false;
      if (dSkill !== 'All' && !(r.required_skills || []).some(sk => sk.toLowerCase().includes(dSkill.toLowerCase()))) return false;
      if (dCustomer !== 'All' && r.client_name !== dCustomer) return false;
      if (dCountry !== 'All' && !r.location?.includes(dCountry)) return false;
      if (dShore !== 'All' && !r.location?.includes(dShore)) return false;
      if (dGrade !== 'All' && meta.grade !== dGrade) return false;
      if (dPriority !== 'All' && r.fill_priority !== dPriority) return false;
      if (dMonth !== 'All' && meta.month !== dMonth) return false;
      if (dAgeing !== 'All' && meta.ageingBucket !== dAgeing) return false;
      return true;
    });
  }, [roles, demandSubTab, dSearch, dSkill, dCustomer, dCountry, dShore, dGrade, dPriority, dMonth, dAgeing]);

  // ── Filtered pool ──
  const filteredPool = useMemo(() => {
    return workforce.filter(w => {
      if (w.status !== 'Available-Pool') return false;
      const s = pSearch.toLowerCase();
      if (s && !w.employee_name?.toLowerCase().includes(s) && !w.employee_id?.toLowerCase().includes(s)) return false;
      if (pSkill !== 'All' && !(w.current_skills || []).some(sk => sk.toLowerCase().includes(pSkill.toLowerCase())) && w.primary_skill?.toLowerCase() !== pSkill.toLowerCase()) return false;
      if (pGrade !== 'All' && (w as any).grade !== pGrade) return false;
      if (pLocation !== 'All' && w.location !== pLocation) return false;
      if (pRmg !== 'All' && w.rmg_status !== pRmg) return false;
      if (pDeploy !== 'All') {
        const isD = (w as any).deployable_flag === true || String((w as any).deployable_flag).toLowerCase() === 'deployable';
        if (pDeploy === 'Deployable' && !isD) return false;
        if (pDeploy === 'Not Deployable' && isD) return false;
      }
      return true;
    });
  }, [workforce, pSearch, pSkill, pGrade, pLocation, pRmg, pDeploy]);

  // ── Test Zen Matrix functionality ──
  const testZenMatrix = async (employeeId: string) => {
    console.log(`🧪 Testing Zen Matrix for Employee ID: ${employeeId}`);
    try {
      const response = await fetch(`${API_BASE}/employees/${employeeId}/skills`);
      console.log(`📡 API Response Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const skills = await response.json();
        console.log(`✅ Skills found for ${employeeId}:`, skills);
        console.log(`📊 Total skills: ${skills.length}`);
        if (skills.length > 0) {
          console.log(`🎯 Sample skills:`, skills.slice(0, 3).map((s: any) => ({
            name: s.skillName || s.skill_name,
            rating: s.selfRating
          })));
        }
        return skills;
      } else {
        const errorText = await response.text();
        console.log(`❌ API Error: ${response.status} - ${errorText}`);
        return [];
      }
    } catch (error) {
      console.log(`❌ Network Error:`, error);
      return [];
    }
  };

  // ── Test if employee exists in main employees table ──
  const checkEmployeeExists = async (employeeId: string) => {
    console.log(`🔍 Checking if employee ${employeeId} exists in main employees table...`);
    try {
      const response = await fetch(`${API_BASE}/employees/${employeeId}`);
      console.log(`📡 Employee API Response: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const employee = await response.json();
        console.log(`✅ Employee found:`, {
          id: employee.id || employee.ID,
          name: employee.name || employee.Name,
          email: employee.email || employee.Email
        });
        return employee;
      } else {
        const errorText = await response.text();
        console.log(`❌ Employee not found: ${response.status} - ${errorText}`);
        return null;
      }
    } catch (error) {
      console.log(`❌ Error checking employee:`, error);
      return null;
    }
  };

  // ── Test specific employee ID ──
  const findEmployeesWithSkills = async () => {
    console.log('🔍 Searching for employees with Skill Matrix data...');
    try {
      const response = await fetch(`${API_BASE}/employees`);
      if (response.ok) {
        const data = await response.json();
        const employees = data.employees || [];
        console.log(`👥 Total employees in database: ${employees.length}`);
        
        // Test first 10 employees to find ones with skills
        const employeesWithSkills = [];
        for (let i = 0; i < Math.min(10, employees.length); i++) {
          const emp = employees[i];
          const skills = await testZenMatrix(emp.id || emp.zensar_id || emp.ID);
          if (skills.length > 0) {
            employeesWithSkills.push({
              id: emp.id || emp.zensar_id || emp.ID,
              name: emp.name || emp.Name,
              skillCount: skills.length
            });
          }
        }
        
        console.log('✅ Employees with Skill Matrix data:', employeesWithSkills);
        return employeesWithSkills;
      }
    } catch (error) {
      console.log('❌ Error finding employees with skills:', error);
    }
    return [];
  };
  useEffect(() => {
    // Test with the provided Zensar ID
    if (activeTab === 'match') {
      testZenMatrix('64316');
    }
  }, [activeTab]);

  // ── Filtered deallocation ──
  const filteredDealloc = useMemo(() => {
    return workforce.filter(w => {
      if (w.status !== 'Deallocating') return false;
      const s = dlSearch.toLowerCase();
      if (s && !w.employee_name?.toLowerCase().includes(s) && !w.employee_id?.toLowerCase().includes(s)) return false;
      if (dlSkill !== 'All' && w.primary_skill?.toLowerCase() !== dlSkill.toLowerCase()) return false;
      if (dlBand !== 'All' && (w as any).band !== dlBand) return false;
      if (dlLoc !== 'All' && w.location !== dlLoc) return false;
      if (dlRmg !== 'All' && w.rmg_status !== dlRmg) return false;
      if (dlReason !== 'All' && (w as any).release_reason !== dlReason) return false;
      return true;
    }).sort((a, b) => {
      // Sort soonest deallocation first; null dates go to end
      const dA = a.deallocation_date ? new Date(a.deallocation_date).getTime() : Infinity;
      const dB = b.deallocation_date ? new Date(b.deallocation_date).getTime() : Infinity;
      return dA - dB;
    });
  }, [workforce, dlSearch, dlSkill, dlBand, dlLoc, dlRmg, dlReason]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const kpiRes = await fetch(`${API_BASE}/bfsi/dashboard`);
      if (kpiRes.ok) setKpiData(await kpiRes.json());

      const rolesRes = await fetch(`${API_BASE}/bfsi/roles`);
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData.roles || []);
      }

      const workforceRes = await fetch(`${API_BASE}/bfsi/workforce`);
      if (workforceRes.ok) {
        const workforceData = await workforceRes.json();
        setWorkforce(workforceData.workforce || []);
      }
    } catch (error) {
      console.error('Error fetching BFSI data:', error);
      toast.error('Failed to load ZenTalenHub data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStep(0);
    setUploadStepLabel('Reading Excel file...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('uploadedBy', 'admin');

    // Animate steps while uploading
    const steps = [
      { pct: 10, label: 'Reading Excel file...' },
      { pct: 25, label: 'Processing LOB sheet (employees)...' },
      { pct: 40, label: 'Processing Reactive SRFs...' },
      { pct: 55, label: 'Processing Proactive SRFs...' },
      { pct: 68, label: 'Processing Pool resources...' },
      { pct: 80, label: 'Processing Deallocation data...' },
      { pct: 90, label: 'Saving to database...' },
      { pct: 95, label: 'Finalizing & syncing...' },
    ];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        setUploadStep(steps[stepIdx].pct);
        setUploadStepLabel(steps[stepIdx].label);
        stepIdx++;
      }
    }, 800);

    try {
      const res = await fetch(`${API_BASE}/bfsi/upload`, {
        method: 'POST',
        body: formData
      });

      clearInterval(stepTimer);
      setUploadStep(100);
      setUploadStepLabel('Upload complete!');

      if (res.ok) {
        const result = await res.json();
        setTimeout(() => {
          setUploading(false);
          setUploadStep(0);
          toast.success(`Upload successful! ${result.summary?.roles || 0} roles, ${result.summary?.employees || 0} employees`);
          fetchDashboardData();
        }, 600);
      } else {
        const error = await res.json();
        setUploading(false);
        setUploadStep(0);
        toast.error(error.error || 'Upload failed');
      }
    } catch (error) {
      clearInterval(stepTimer);
      setUploading(false);
      setUploadStep(0);
      toast.error('Upload error: ' + (error as Error).message);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you ABSOLUTELY sure you want to delete all BFSI data? This cannot be undone.')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bfsi/reset`, { method: 'POST' });
      if (res.ok) {
        toast.success('System reset successful');
        fetchDashboardData();
      } else {
        toast.error('Reset failed');
      }
    } catch (error) {
      toast.error('Reset error: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: T.sub }}>Loading ZenTalenHub...</p>
        </div>
      </div>
    );
  }

  const totalDemandValue = kpiData?.totalDemand || 0;
  const totalSupplyValue = kpiData?.totalSupply || 0;

  return (
    <div style={{ minHeight: '100vh', background: dark ? '#020617' : '#f1f5f9', color: T.text }}>
      <div style={{ maxWidth: '1700px', margin: '0 auto', padding: '20px 24px' }}>
        
        {/* Header Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px -8px rgba(59, 130, 246, 0.4)' }}>
              <Landmark size={26} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-1px' }}>ZenTalentHub</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.success }} />
                <p style={{ margin: 0, fontSize: 12, color: T.sub, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>Supply & Demand Matrix</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
             <button 
              onClick={handleReset}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'transparent', color: COLORS.error, border: `1px solid ${COLORS.error}`, borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 900 }}
            >
              <Trash2 size={16} />
              RESET
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: COLORS.info, color: '#fff', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 900, boxShadow: '0 6px 14px rgba(59, 130, 246, 0.2)' }}>
              <Upload size={16} />
              SYNC DATA
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
            <button 
              onClick={async () => {
                const res = await fetch(`${API_BASE}/bfsi/report/weekly`);
                if (res.ok) setWeeklyReport(await res.json());
                else toast.error('Failed to generate report');
              }} 
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: dark ? '#1e293b' : '#fff', color: T.text, border: `1px solid ${T.bdr}`, borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 900 }}
            >
              <FileText size={16} />
              WEEKLY REPORT
            </button>
          </div>
        </div>

        {/* Primary Tabs */}
        <div style={{ background: dark ? 'rgba(30,30,45,0.4)' : 'rgba(255,255,255,0.4)', backdropFilter: 'blur(20px)', borderRadius: '20px 20px 0 0', border: `1px solid ${T.bdr}`, borderBottom: 'none', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: 32 }}>
            <button 
              onClick={() => setActiveTab('supply')} 
              style={{ padding: '18px 0', color: activeTab === 'supply' ? COLORS.info : T.sub, borderBottom: `3px solid ${activeTab === 'supply' ? COLORS.info : 'transparent'}`, background: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}
            >
              <Users size={16} />
              Supply Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('demand')} 
              style={{ padding: '18px 0', color: activeTab === 'demand' ? COLORS.info : T.sub, borderBottom: `3px solid ${activeTab === 'demand' ? COLORS.info : 'transparent'}`, background: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}
            >
              <Briefcase size={16} />
              Demand Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('match')} 
              style={{ padding: '18px 0', color: activeTab === 'match' ? COLORS.success : T.sub, borderBottom: `3px solid ${activeTab === 'match' ? COLORS.success : 'transparent'}`, background: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}
            >
              <Sparkles size={16} />
              Find a Match
            </button>
            <button 
              onClick={() => setActiveTab('zenfinder')} 
              style={{ padding: '18px 0', color: activeTab === 'zenfinder' ? COLORS.purple : T.sub, borderBottom: `3px solid ${activeTab === 'zenfinder' ? COLORS.purple : 'transparent'}`, background: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}
            >
              <Search size={16} />
              ZenFinder
            </button>
          </div>
        </div>

        {/* Content Section */}
        <div style={{ background: T.card, padding: '28px', borderRadius: '0 0 20px 20px', border: `1px solid ${T.bdr}`, boxShadow: '0 20px 60px -20px rgba(0,0,0,0.12)', minHeight: '700px' }}>
          
          {activeTab === 'supply' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              
              {/* Supply Control Panel */}
              <div style={{ background: dark ? '#0f172a' : '#f8fafc', borderRadius: 20, border: `1px solid ${T.bdr}`, padding: 32 }}>

                {/* ── Total banners — ABOVE the heading ── */}
                {(() => {
                  const totalPool = kpiData?.skillGaps?.reduce((s, sg) => s + (Number(sg.pool) || 0), 0) ?? 0;
                  // All deallocating employees from Excel
                  const deallocEmployees = workforce.filter(w => 
                    w.status === 'Deallocating' || 
                    (w.status === 'In-project' && !!(w as any).deallocation_date)
                  );
                  const totalDealloc = deallocEmployees.length;
                  return (
                    <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
                      {/* Pool total */}
                      <div
                        onClick={() => {
                          setSupplySubTab('pool');
                          setSelectedMetric({ tab: 'supply', metric: 'Total Pool', data: workforce.filter(w => w.status === 'Available-Pool') });
                        }}
                        style={{
                          flex: 1, borderRadius: 16, padding: '20px 28px',
                          background: supplySubTab === 'pool'
                            ? 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(99,102,241,0.12))'
                            : (dark ? 'rgba(255,255,255,0.03)' : '#fff'),
                          border: `2px solid ${supplySubTab === 'pool' ? COLORS.info : T.bdr}`,
                          display: 'flex', alignItems: 'center', gap: 20,
                          cursor: 'pointer', transition: 'all 0.25s',
                          boxShadow: supplySubTab === 'pool' ? `0 8px 24px rgba(59,130,246,0.18)` : 'none',
                        }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(59,130,246,0.35)', flexShrink: 0 }}>
                          <Users size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.info, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Total Pool</div>
                          <div style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1 }}>{totalPool}</div>
                          <div style={{ fontSize: 12, color: T.sub, marginTop: 5 }}>Bench resources available now</div>
                        </div>
                        <ArrowRight size={16} color={COLORS.info} style={{ flexShrink: 0, opacity: 0.7 }} />
                      </div>

                      {/* Deallocation total */}
                      <div
                        onClick={() => {
                          setSupplySubTab('deallocation');
                          setSelectedMetric({ tab: 'supply', metric: 'Total Deallocation', data: deallocEmployees });
                        }}
                        style={{
                          flex: 1, borderRadius: 16, padding: '20px 28px',
                          background: supplySubTab === 'deallocation'
                            ? 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(249,115,22,0.12))'
                            : (dark ? 'rgba(255,255,255,0.03)' : '#fff'),
                          border: `2px solid ${supplySubTab === 'deallocation' ? COLORS.warning : T.bdr}`,
                          display: 'flex', alignItems: 'center', gap: 20,
                          cursor: 'pointer', transition: 'all 0.25s',
                          boxShadow: supplySubTab === 'deallocation' ? `0 8px 24px rgba(245,158,11,0.18)` : 'none',
                        }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(245,158,11,0.35)', flexShrink: 0 }}>
                          <Clock size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Total Deallocation</div>
                          <div style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1 }}>{totalDealloc}</div>
                          <div style={{ fontSize: 12, color: T.sub, marginTop: 5 }}>Rolling off from projects</div>
                        </div>
                        <ArrowRight size={16} color={COLORS.warning} style={{ flexShrink: 0, opacity: 0.7 }} />
                      </div>

                      {/* Total Supply — shows all pool + dealloc employees */}
                      <div
                        onClick={() => setSelectedMetric({ tab: 'supply', metric: 'Total Supply', data: workforce.filter(w => w.status === 'Available-Pool' || w.status === 'Deallocating') })}
                        style={{
                          flex: 1, borderRadius: 16, padding: '20px 28px',
                          background: 'linear-gradient(135deg, rgba(16,185,129,0.13), rgba(6,182,212,0.08))',
                          border: `2px solid rgba(16,185,129,0.4)`,
                          display: 'flex', alignItems: 'center', gap: 20,
                          cursor: 'pointer', transition: 'all 0.25s',
                        }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#10b981,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(16,185,129,0.35)', flexShrink: 0 }}>
                          <CheckCircle size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.success, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Total Supply</div>
                          <div style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1 }}>{totalPool + totalDealloc}</div>
                          <div style={{ fontSize: 12, color: T.sub, marginTop: 5 }}>Pool {totalPool} + Deallocation {totalDealloc}</div>
                        </div>
                        <ArrowRight size={16} color={COLORS.success} style={{ flexShrink: 0, opacity: 0.7 }} />
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.text }}>Resource Availability Overview</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: T.sub }}>Tracking <b>{totalSupplyValue}</b> total resources across Pool & Upcoming Deallocations</p>
                  </div>
                  <div style={{ display: 'flex', background: dark ? '#1e293b' : '#fff', padding: 6, borderRadius: 14, border: `1px solid ${T.bdr}` }}>
                    <button 
                      onClick={() => setSupplySubTab('pool')}
                      style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: supplySubTab === 'pool' ? COLORS.info : 'transparent', color: supplySubTab === 'pool' ? '#fff' : T.sub, cursor: 'pointer', fontSize: 14, fontWeight: 900, transition: '0.3s' }}
                    >
                      Pool Dashboard
                    </button>
                    <button 
                      onClick={() => setSupplySubTab('deallocation')}
                      style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: supplySubTab === 'deallocation' ? COLORS.info : 'transparent', color: supplySubTab === 'deallocation' ? '#fff' : T.sub, cursor: 'pointer', fontSize: 14, fontWeight: 900, transition: '0.3s' }}
                    >
                      Deallocation Dashboard
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
                  {[
                    ...ALL_BFSI_SKILLS.map((skill, idx) => {
                      const isPool = supplySubTab === 'pool';

                      // Filter using primary_skill — same source for both card count AND modal
                      const currentFilter = (w: BFSIEmployee) => {
                        const isDealloc = w.status === 'Deallocating' || 
                          (w.status === 'In-project' && !!(w as any).deallocation_date);
                        const statusMatch = isPool ? w.status === 'Available-Pool' : isDealloc;
                        if (!statusMatch) return false;
                        const rawSkill = (w.primary_skill || (w.current_skills || [])[0] || '').toLowerCase();
                        const sk = skill.toLowerCase();

                        if (sk.includes('sdet'))                    return rawSkill.includes('sdet');
                        if (sk.includes('mobile'))                  return rawSkill.includes('mobile');
                        if (sk.includes('ai') && sk.includes('ml')) return rawSkill.includes('ai/ml') || rawSkill.includes('deep learning') || rawSkill.includes('machine learning') || rawSkill.includes('analytics') || rawSkill.includes('mining') || (rawSkill.includes('ai') && rawSkill.includes('ml'));
                        if (sk.includes('data') || sk.includes('etl')) return rawSkill.includes('etl') || rawSkill.includes('database') || rawSkill.includes('data testing') || rawSkill.includes('db testing');
                        if (sk.includes('performance'))             return rawSkill.includes('performance') || rawSkill.includes('non functional') || rawSkill.includes('nonfunctional') || rawSkill.includes('load testing');
                        if (sk.includes('security'))                return rawSkill.includes('security') || rawSkill.includes('cyber') || rawSkill.includes('penetration') || rawSkill.includes('vapt');
                        if (sk.includes('accessibility'))           return rawSkill.includes('accessibility') || rawSkill.includes('a11y') || rawSkill.includes('wcag');
                        if (sk.includes('digital'))                 return rawSkill.includes('digital');
                        if (sk.includes('application'))             return rawSkill.includes('application testing') || rawSkill.includes('application test');
                        if (sk.includes('automation'))              return rawSkill.includes('automation') && !rawSkill.includes('sdet');
                        if (sk.includes('functional'))              return rawSkill.includes('functional') && !rawSkill.includes('mobile');
                        return false;
                      };

                      // Card count = DB filter count = modal count — always in sync
                      const skillValue = workforce.filter(currentFilter).length;

                      // Short display label
                      const labelMap: Record<string, string> = {
                        'Automation Testing': 'Automation',
                        'Automation Testing SDET': 'Automation SDET',
                        'AI/ML AI, ML, DEEP LEARNING': 'AI/ML',
                        'Data / ETL': 'Data / ETL',
                        'Functional Testing Mobile': 'Functional Mobile',
                        'Functional Testing': 'Functional',
                        'Security Testing': 'Security',
                        'Performance Testing': 'Performance',
                        'Application testing': 'Application',
                        'Accessibility Testing': 'Accessibility',
                        'Digital Testing': 'Digital',
                      };

                      return {
                        label: labelMap[skill] || skill,
                        full: skill,
                        value: skillValue,
                        icon: Target,
                        color: COLORS.chart[idx % COLORS.chart.length],
                        filter: currentFilter
                      };
                    })
                  ].map((m, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedMetric({ tab: 'supply', metric: m.label, data: workforce.filter(m.filter as any) })}
                      style={{ background: dark ? '#1e293b' : '#fff', borderRadius: 18, padding: 24, border: `1px solid ${T.bdr}`, cursor: 'pointer', transition: '0.3s', borderTop: `4px solid ${m.color}` }}
                      className="hover-card"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</span>
                        <m.icon size={16} color={m.color} />
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: T.text }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resource Grid/List Section */}
              <div style={{ background: dark ? '#0f172a' : '#fff', borderRadius: 20, border: `1px solid ${T.bdr}`, overflow: 'hidden' }}>
                <div style={{ padding: '24px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: supplySubTab === 'pool' ? COLORS.success : COLORS.warning }} />
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                      {supplySubTab === 'pool' ? 'Current Bench Resources' : 'Project Release Roadmap'}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Excel total (authoritative) */}
                    <div style={{ padding: '4px 14px', background: supplySubTab === 'pool' ? `${COLORS.info}20` : `${COLORS.warning}20`, color: supplySubTab === 'pool' ? COLORS.info : COLORS.warning, borderRadius: 20, fontSize: 11, fontWeight: 900, border: `1px solid ${supplySubTab === 'pool' ? COLORS.info : COLORS.warning}44` }}>
                      {supplySubTab === 'pool'
                        ? `${kpiData?.skillGaps?.reduce((s, sg) => s + (Number(sg.pool) || 0), 0) ?? 0} Total (Excel)`
                        : `${kpiData?.skillGaps?.reduce((s, sg) => s + (Number(sg.deallocation) || 0), 0) ?? 0} Total (Excel)`
                      }
                    </div>
                    {/* DB count */}
                    <div style={{ padding: '4px 14px', background: `${COLORS.success}15`, color: COLORS.success, borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
                      {workforce.filter(w => supplySubTab === 'pool' ? w.status === 'Available-Pool' : (w.status === 'Deallocating' || (w.status === 'In-project' && !!(w as any).deallocation_date))).length} in DB
                    </div>
                  </div>
                </div>

                <div style={{ padding: 32 }}>
                  {supplySubTab === 'pool' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
                      {workforce.filter(w => w.status === 'Available-Pool').map((emp, i) => {
                        const rmgColor = emp.rmg_status?.includes('Interview') ? COLORS.warning
                          : emp.rmg_status?.includes('Reskilling') ? COLORS.purple
                          : emp.rmg_status?.includes('Rejection') ? COLORS.danger
                          : emp.rmg_status?.includes('Proactively') ? COLORS.success
                          : COLORS.info;
                        const isDeployable = (emp as any).deployable_flag === true || String((emp as any).deployable_flag).toLowerCase() === 'deployable';
                        return (
                          <div key={i} style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#fff', borderRadius: 16, border: `1px solid ${T.bdr}`, overflow: 'hidden', transition: '0.3s', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} className="hover-card">
                            {/* Header */}
                            <div style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{emp.employee_name?.[0]}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 900, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.employee_name}</div>
                                <div style={{ fontSize: 12, color: COLORS.info, fontWeight: 700, marginTop: 1 }}>{emp.primary_skill || '—'}</div>
                                <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>ID: {formatZensarId(emp.employee_id)} · {(emp as any).grade || '—'} · {emp.location || '—'}</div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: (emp.aging_days||0) > 30 ? COLORS.danger : COLORS.success, lineHeight: 1 }}>{emp.aging_days || 0}</div>
                                <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase' }}>Days</div>
                              </div>
                            </div>
                            {/* Details grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}` }}>
                              {[
                                { label: 'RMG Status', value: emp.rmg_status || '—' },
                                { label: 'Customer',   value: emp.customer || '—' },
                                { label: 'PM',         value: emp.pm_name || '—' },
                              ].map(f => (
                                <div key={f.label} style={{ padding: '8px 12px', borderRight: f.label !== 'PM' ? `1px solid ${T.bdr}` : 'none' }}>
                                  <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{f.label}</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                                </div>
                              ))}
                            </div>
                            {/* Footer: skills + deployable */}
                            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 6, background: isDeployable ? `${COLORS.success}18` : `${COLORS.danger}18`, color: isDeployable ? COLORS.success : COLORS.danger, border: `1px solid ${isDeployable ? COLORS.success : COLORS.danger}44` }}>
                                {isDeployable ? '✅ Deployable' : '❌ Not Deployable'}
                              </span>
                              {(emp.current_skills || []).filter(s => s && s !== 'NOT_AVAILABLE').slice(0, 3).map((s, j) => (
                                <span key={j} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', background: dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', borderRadius: 6, border: `1px solid ${T.bdr}`, color: T.sub }}>{s}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
                      {workforce
                        .filter(w => w.status === 'Deallocating' || (w.status === 'In-project' && !!(w as any).deallocation_date))
                        .sort((a, b) => {
                          const dA = a.deallocation_date ? new Date(a.deallocation_date).getTime() : Infinity;
                          const dB = b.deallocation_date ? new Date(b.deallocation_date).getTime() : Infinity;
                          return dA - dB;
                        })
                        .map((emp, i) => {
                        const dDate = emp.deallocation_date ? new Date(emp.deallocation_date) : null;
                        const daysLeft = dDate ? Math.ceil((dDate.getTime() - Date.now()) / 86400000) : (emp.aging_days || 0);
                        const releaseDate = dDate
                          ? dDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—';
                        // Color: overdue=red, ≤7d=red, ≤30d=orange, ≤90d=yellow, >90d=blue
                        const urgency = daysLeft < 0 ? COLORS.danger
                          : daysLeft <= 7  ? COLORS.danger
                          : daysLeft <= 30 ? COLORS.warning
                          : daysLeft <= 90 ? '#f59e0b'
                          : COLORS.info;
                        return (
                          <div key={i} style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#fff', borderRadius: 16, borderTop: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}`, borderLeft: `5px solid ${urgency}`, overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${urgency},${urgency}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>{emp.employee_name?.[0]}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 900, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.employee_name}</div>
                                <div style={{ fontSize: 12, color: COLORS.info, fontWeight: 700, marginTop: 1 }}>{emp.primary_skill || '—'}</div>
                                <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>ID: {formatZensarId(emp.employee_id)} · {(emp as any).band || '—'} · {emp.location || '—'}</div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, background: dark ? 'rgba(0,0,0,0.25)' : '#f8fafc', padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: urgency, lineHeight: 1 }}>
                                  {daysLeft < 0 ? 'PAST' : Math.abs(daysLeft)}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', marginTop: 1 }}>
                                  {daysLeft < 0 ? 'Overdue' : 'Days Left'}
                                </div>
                                <div style={{ fontSize: 10, color: urgency, fontWeight: 800, marginTop: 3 }}>📅 {releaseDate}</div>
                              </div>
                            </div>
                            {/* Details grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}` }}>
                              {[
                                { label: 'Project',  value: emp.project_name || '—' },
                                { label: 'Customer', value: emp.customer || '—' },
                                { label: 'PM',       value: emp.pm_name || '—' },
                              ].map(f => (
                                <div key={f.label} style={{ padding: '8px 12px', borderRight: f.label !== 'PM' ? `1px solid ${T.bdr}` : 'none' }}>
                                  <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{f.label}</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                                </div>
                              ))}
                            </div>
                            {/* Footer: RMG + Reason */}
                            <div style={{ padding: '8px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              {emp.rmg_status && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', background: `${COLORS.warning}18`, borderRadius: 6, border: `1px solid ${COLORS.warning}44`, color: COLORS.warning }}>{emp.rmg_status}</span>}
                              {(emp as any).release_reason && <span style={{ fontSize: 10, color: T.sub, fontWeight: 600 }}>{(emp as any).release_reason}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'demand' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              
              <div style={{ background: dark ? '#0f172a' : '#f8fafc', borderRadius: 20, border: `1px solid ${T.bdr}`, padding: 32 }}>

                {/* ── Demand Summary Cards (like Supply) ── */}
                {(() => {
                  const reactiveSRF  = kpiData?.reactiveRoles  ?? kpiData?.skillGaps?.reduce((s, sg) => s + (Number(sg.reactive)  || 0), 0) ?? 0;
                  const proactiveSRF = kpiData?.proactiveRoles ?? kpiData?.skillGaps?.reduce((s, sg) => s + (Number(sg.proactive) || 0), 0) ?? 0;
                  const demandTotal  = kpiData?.totalDemand    ?? (reactiveSRF + proactiveSRF);
                  return (
                    <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
                      {/* Reactive SRF Total */}
                      <div
                        onClick={() => { setDemandSubTab('reactive'); setSelectedMetric({ tab: 'demand', metric: 'Reactive SRF Total', data: roles.filter(r => r.type === 'Reactive') }); }}
                        style={{
                          flex: 1, borderRadius: 16, padding: '20px 28px',
                          background: demandSubTab === 'reactive'
                            ? 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(249,115,22,0.12))'
                            : (dark ? 'rgba(255,255,255,0.03)' : '#fff'),
                          border: `2px solid ${demandSubTab === 'reactive' ? COLORS.danger : T.bdr}`,
                          display: 'flex', alignItems: 'center', gap: 20,
                          cursor: 'pointer', transition: 'all 0.25s',
                          boxShadow: demandSubTab === 'reactive' ? `0 8px 24px rgba(239,68,68,0.18)` : 'none',
                        }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#ef4444,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(239,68,68,0.35)', flexShrink: 0 }}>
                          <Briefcase size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.danger, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Reactive SRF Total</div>
                          <div style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1 }}>{reactiveSRF}</div>
                          <div style={{ fontSize: 12, color: T.sub, marginTop: 5 }}>Urgent open positions</div>
                        </div>
                        <ArrowRight size={16} color={COLORS.danger} style={{ flexShrink: 0, opacity: 0.7 }} />
                      </div>

                      {/* Proactive SRF Total */}
                      <div
                        onClick={() => { setDemandSubTab('proactive'); setSelectedMetric({ tab: 'demand', metric: 'Proactive SRF Total', data: roles.filter(r => r.type === 'Proactive') }); }}
                        style={{
                          flex: 1, borderRadius: 16, padding: '20px 28px',
                          background: demandSubTab === 'proactive'
                            ? 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.12))'
                            : (dark ? 'rgba(255,255,255,0.03)' : '#fff'),
                          border: `2px solid ${demandSubTab === 'proactive' ? COLORS.purple : T.bdr}`,
                          display: 'flex', alignItems: 'center', gap: 20,
                          cursor: 'pointer', transition: 'all 0.25s',
                          boxShadow: demandSubTab === 'proactive' ? `0 8px 24px rgba(139,92,246,0.18)` : 'none',
                        }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(139,92,246,0.35)', flexShrink: 0 }}>
                          <Target size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Proactive SRF Total</div>
                          <div style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1 }}>{proactiveSRF}</div>
                          <div style={{ fontSize: 12, color: T.sub, marginTop: 5 }}>Pipeline positions</div>
                        </div>
                        <ArrowRight size={16} color={COLORS.purple} style={{ flexShrink: 0, opacity: 0.7 }} />
                      </div>

                      {/* Demand Total */}
                      <div
                        onClick={() => setSelectedMetric({ tab: 'demand', metric: 'Demand Total', data: roles })}
                        style={{
                          flex: 1, borderRadius: 16, padding: '20px 28px',
                          background: 'linear-gradient(135deg, rgba(79,70,229,0.13), rgba(99,102,241,0.08))',
                          border: `2px solid rgba(79,70,229,0.4)`,
                          display: 'flex', alignItems: 'center', gap: 20,
                          cursor: 'pointer', transition: 'all 0.25s',
                        }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#4f46e5,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(79,70,229,0.35)', flexShrink: 0 }}>
                          <CheckCircle size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Demand Total</div>
                          <div style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1 }}>{demandTotal}</div>
                          <div style={{ fontSize: 12, color: T.sub, marginTop: 5 }}>Reactive {reactiveSRF} + Proactive {proactiveSRF}</div>
                        </div>
                        <ArrowRight size={16} color="#4f46e5" style={{ flexShrink: 0, opacity: 0.7 }} />
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.text }}>Open Positions</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: T.sub }}>Skills in demand · Roles open now</p>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* Reactive / Proactive toggle */}
                    <div style={{ display: 'flex', background: dark ? '#1e293b' : '#fff', padding: 6, borderRadius: 14, border: `1px solid ${T.bdr}` }}>
                      <button
                        onClick={() => setDemandSubTab('reactive')}
                        style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: demandSubTab === 'reactive' ? COLORS.danger : 'transparent', color: demandSubTab === 'reactive' ? '#fff' : T.sub, cursor: 'pointer', fontSize: 14, fontWeight: 900, transition: '0.3s' }}
                      >
                        Reactive SRF
                      </button>
                      <button
                        onClick={() => setDemandSubTab('proactive')}
                        style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: demandSubTab === 'proactive' ? COLORS.purple : 'transparent', color: demandSubTab === 'proactive' ? '#fff' : T.sub, cursor: 'pointer', fontSize: 14, fontWeight: 900, transition: '0.3s' }}
                      >
                        Proactive SRF
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
                  {[
                    ...ALL_BFSI_SKILLS.map((skill, idx) => {
                      const isReactive = demandSubTab === 'reactive';

                      // Filter roles by primary_skill field — defined FIRST
                      const currentFilter = (r: BFSIRole) => {
                        const typeMatch = isReactive ? r.type === 'Reactive' : r.type === 'Proactive';
                        if (!typeMatch) return false;
                        const rawSkill = (r.required_skills?.[0] || r.role_title || '').toLowerCase();
                        const sk = skill.toLowerCase();

                        if (sk.includes('sdet'))                    return rawSkill.includes('sdet');
                        if (sk.includes('mobile'))                  return rawSkill.includes('mobile');
                        if (sk.includes('ai') && sk.includes('ml')) return rawSkill.includes('ai/ml') || rawSkill.includes('deep learning') || rawSkill.includes('machine learning') || rawSkill.includes('analytics') || rawSkill.includes('mining') || (rawSkill.includes('ai') && rawSkill.includes('ml'));
                        if (sk.includes('data') || sk.includes('etl')) return rawSkill.includes('etl') || rawSkill.includes('database') || rawSkill.includes('data testing') || rawSkill.includes('db testing');
                        if (sk.includes('performance'))             return rawSkill.includes('performance') || rawSkill.includes('non functional') || rawSkill.includes('nonfunctional') || rawSkill.includes('load testing');
                        if (sk.includes('security'))                return rawSkill.includes('security') || rawSkill.includes('cyber');
                        if (sk.includes('accessibility'))           return rawSkill.includes('accessibility');
                        if (sk.includes('digital'))                 return rawSkill.includes('digital');
                        if (sk.includes('application'))             return rawSkill.includes('application testing') || rawSkill.includes('application test');
                        if (sk.includes('automation'))              return rawSkill.includes('automation') && !rawSkill.includes('sdet');
                        if (sk.includes('functional'))              return rawSkill.includes('functional') && !rawSkill.includes('mobile');
                        return false;
                      };

                      // Card count = DB filter count = modal count — always in sync
                      const skillValue = roles.filter(currentFilter).length;

                      const labelMap: Record<string, string> = {
                        'Automation Testing': 'Automation',
                        'Automation Testing SDET': 'Automation SDET',
                        'AI/ML AI, ML, DEEP LEARNING': 'AI/ML',
                        'Data / ETL': 'Data / ETL',
                        'Functional Testing Mobile': 'Functional Mobile',
                        'Functional Testing': 'Functional',
                        'Security Testing': 'Security',
                        'Performance Testing': 'Performance',
                        'Application testing': 'Application',
                        'Accessibility Testing': 'Accessibility',
                        'Digital Testing': 'Digital',
                      };

                      return {
                        label: labelMap[skill] || skill,
                        full: skill,
                        value: skillValue,
                        icon: Target,
                        color: COLORS.chart[idx % COLORS.chart.length],
                        filter: currentFilter
                      };
                    })
                  ].map((m, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedMetric({ tab: 'demand', metric: m.label, data: roles.filter(m.filter as any) })}
                      style={{ background: dark ? '#1e293b' : '#fff', borderRadius: 18, padding: 24, border: `1px solid ${T.bdr}`, cursor: 'pointer', transition: '0.3s', borderTop: `4px solid ${m.color}` }}
                      className="hover-card"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</span>
                        <m.icon size={16} color={m.color} />
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: T.text }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: dark ? '#0f172a' : '#fff', borderRadius: 20, border: `1px solid ${T.bdr}`, overflow: 'hidden' }}>
                <div style={{ padding: '20px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                    {demandSubTab === 'reactive' ? '🔴 Reactive SRFs' : '🟣 Proactive SRFs'}
                    <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: T.sub }}>({filteredRoles.length} shown)</span>
                  </h3>
                </div>
                <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filteredRoles.map((role, i) => {
                    const meta = parseMeta(role);
                    const jdText = getJD(role);
                    const typeColor = role.type === 'Reactive' ? COLORS.danger : COLORS.purple;
                    const pColor = role.fill_priority === 'P1' ? COLORS.danger : role.fill_priority === 'P2' ? COLORS.warning : COLORS.info;
                    return (
                      <div key={i} style={{ background: dark ? 'rgba(30,41,59,0.6)' : '#fff', borderRadius: 16, borderTop: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}`, borderLeft: `5px solid ${typeColor}`, overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${typeColor},${typeColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Briefcase size={20} color="#fff" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontWeight: 900, fontSize: 15, color: T.text }}>{role.role_title}</span>
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}44` }}>{role.type}</span>
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}44` }}>{role.fill_priority || '—'}</span>
                            </div>
                            <div style={{ fontSize: 12, color: T.sub }}>
                              SRF: <strong style={{ color: T.text }}>{role.role_id}</strong>
                              {role.client_name && <> · <strong style={{ color: COLORS.info }}>{role.client_name}</strong></>}
                              {role.location && <> · 📍 {role.location}</>}
                            </div>
                          </div>
                        </div>
                        {/* Details grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', borderTop: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}` }}>
                          {[
                            { label: 'Skill',      value: (role.required_skills || [])[0] || '—' },
                            { label: 'Grade',      value: meta.grade || '—' },
                            { label: 'Openings',   value: String(meta.openings || '1') },
                            { label: 'Start Date', value: meta.startDate || '—' },
                            { label: 'SPOC',       value: role.assigned_spoc || '—' },
                            { label: 'Month',      value: meta.month || '—' },
                          ].map((f, fi) => (
                            <div key={f.label} style={{ padding: '10px 14px', borderRight: fi < 5 ? `1px solid ${T.bdr}` : 'none' }}>
                              <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Footer: View JD */}
                        {jdText && (
                          <div style={{ padding: '10px 24px' }}>
                            <button onClick={() => setJdModal({ title: role.role_title, jd: jdText })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: `${COLORS.info}15`, color: COLORS.info, border: `1px solid ${COLORS.info}44`, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                              <FileText size={13} /> View JD
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredRoles.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 48, color: T.sub }}>
                      <Briefcase size={40} color={T.bdr} style={{ margin: '0 auto 12px' }} />
                      <div style={{ fontWeight: 700 }}>No SRFs match your filters</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* FIND A MATCH TAB - DEDICATED DASHBOARD */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'match' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              
              {/* Header Section */}
              <div style={{ background: dark ? '#0f172a' : '#f8fafc', borderRadius: 20, border: `1px solid ${T.bdr}`, padding: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Sparkles size={32} color={COLORS.success} />
                      Find a Match - AI-Powered Talent Matching
                    </h2>
                    <p style={{ margin: '8px 0 0', fontSize: 14, color: T.sub }}>
                      Intelligent matching engine that connects open SRFs with available talent from Pool & Deallocation
                    </p>
                  </div>

                </div>

                {/* Google-style Search with Autocomplete */}
                <div style={{ position: 'relative', marginBottom: 24 }}>
                  <Search size={20} color={T.sub} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="🔍 Start typing SRF number, skill, customer, location... (e.g., 141816, SDET, Entain, UK)"
                    value={dSearch}
                    onChange={e => setDSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '18px 20px 18px 56px',
                      borderRadius: 16,
                      border: `2px solid ${dSearch ? COLORS.success : T.bdr}`,
                      background: dark ? '#1e293b' : '#fff',
                      color: T.text,
                      fontSize: 15,
                      fontWeight: 600,
                      outline: 'none',
                      transition: 'all 0.3s',
                      boxShadow: dSearch ? `0 8px 24px rgba(16,185,129,0.15)` : 'none'
                    }}
                  />
                  {dSearch && (
                    <button
                      onClick={() => setDSearch('')}
                      style={{
                        position: 'absolute',
                        right: 20,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: T.sub,
                        cursor: 'pointer',
                        fontSize: 20,
                        padding: 4
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Smart Filters - Auto-populated from data */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                  {filterSelect('🎯 Skill', dSkill, setDSkill, uniq(roles.map(r => r.required_skills?.[0])), COLORS.success)}
                  {filterSelect('🏢 Customer', dCustomer, setDCustomer, uniq(roles.map(r => r.client_name)), COLORS.info)}
                  {filterSelect('🌍 Location', dCountry, setDCountry, uniq(roles.map(r => r.location)), COLORS.purple)}
                  {filterSelect('📊 Grade', dGrade, setDGrade, uniq(roles.map(r => parseMeta(r).grade)), COLORS.warning)}
                  {filterSelect('⚡ Priority', dPriority, setDPriority, uniq(roles.map(r => r.fill_priority)), COLORS.danger)}
                  {filterSelect('📅 Month', dMonth, setDMonth, uniq(roles.map(r => parseMeta(r).month)), COLORS.info)}
                  
                  {/* Clear All Filters Button */}
                  {(dSkill !== 'All' || dCustomer !== 'All' || dCountry !== 'All' || dGrade !== 'All' || dPriority !== 'All' || dMonth !== 'All' || dSearch) && (
                    <button
                      onClick={() => {
                        setDSkill('All');
                        setDCustomer('All');
                        setDCountry('All');
                        setDGrade('All');
                        setDPriority('All');
                        setDMonth('All');
                        setDSearch('');
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 10,
                        background: COLORS.danger,
                        color: '#fff',
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <XCircle size={14} />
                      Clear All
                    </button>
                  )}
                </div>

                {/* Summary Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(249,115,22,0.05))', borderRadius: 14, padding: '16px 20px', border: `2px solid ${COLORS.danger}44` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.danger, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Open SRFs</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: T.text, lineHeight: 1 }}>{filteredRoles.length}</div>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(99,102,241,0.05))', borderRadius: 14, padding: '16px 20px', border: `2px solid ${COLORS.info}44` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.info, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Pool Available</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: T.text, lineHeight: 1 }}>{workforce.filter(w => w.status === 'Available-Pool').length}</div>
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>Excel data</div>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(249,115,22,0.05))', borderRadius: 14, padding: '16px 20px', border: `2px solid ${COLORS.warning}44` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Deallocating</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: T.text, lineHeight: 1 }}>{workforce.filter(w => w.status === 'Deallocating').length}</div>
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>Excel data</div>
                  </div>
                </div>
              </div>

              {/* SRF Cards with "Find Matches" Button */}
              <div style={{ background: dark ? '#0f172a' : '#fff', borderRadius: 20, border: `1px solid ${T.bdr}`, overflow: 'hidden' }}>
                <div style={{ padding: '24px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text }}>Open Positions Ready for Matching</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: T.sub }}>
                      {filteredRoles.length} SRFs · Click "Find Matches" to see available talent
                    </p>
                  </div>
                  <div style={{ padding: '8px 16px', background: `${COLORS.success}15`, borderRadius: 12, border: `1px solid ${COLORS.success}44` }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.success }}>
                      {filteredRoles.length} SRFs
                    </span>
                  </div>
                </div>

                <div style={{ padding: 32 }}>
                  {filteredRoles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 64, color: T.sub }}>
                      <Search size={48} color={T.bdr} style={{ margin: '0 auto 16px' }} />
                      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No SRFs Found</div>
                      <div style={{ fontSize: 14 }}>Try adjusting your filters or search query</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 20 }}>
                      {filteredRoles.map((role, idx) => {
                        const meta = parseMeta(role);
                        const typeColor = role.type === 'Reactive' ? COLORS.danger : COLORS.purple;
                        const pColor = role.fill_priority === 'P1' ? COLORS.danger : role.fill_priority === 'P2' ? COLORS.warning : COLORS.info;
                        
                        return (
                          <div key={idx} style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#fff', borderRadius: 16, borderTop: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}`, borderLeft: `5px solid ${typeColor}`, overflow: 'hidden', transition: '0.3s' }} className="hover-card">
                            {/* Header */}
                            <div style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                              <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg,${typeColor},${typeColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Briefcase size={22} color="#fff" />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                  <span style={{ fontWeight: 900, fontSize: 15, color: T.text }}>{role.role_title}</span>
                                  <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 10px', borderRadius: 999, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}44` }}>{role.type}</span>
                                  <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 10px', borderRadius: 999, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}44` }}>{role.fill_priority || 'P3'}</span>
                                </div>
                                <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>
                                  SRF: <strong style={{ color: COLORS.info }}>{role.role_id}</strong>
                                  {role.client_name && <> · <strong>{role.client_name}</strong></>}
                                </div>
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}` }}>
                              {[
                                { label: 'Skill', value: (role.required_skills || [])[0] || '—', icon: Target },
                                { label: 'Location', value: role.location || '—', icon: Building2 },
                                { label: 'Grade', value: meta.grade || '—', icon: Award },
                              ].map((f, fi) => (
                                <div key={f.label} style={{ padding: '12px 16px', borderRight: fi < 2 ? `1px solid ${T.bdr}` : 'none' }}>
                                  <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <f.icon size={10} />
                                    {f.label}
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                                </div>
                              ))}
                            </div>

                            {/* Action Button */}
                            <div style={{ padding: '14px 20px', display: 'flex', gap: 10 }}>
                              <button
                                onClick={async () => {
                                  setMatchLoading(true);
                                  setSelectedSRF(role);
                                  
                                  // Simulate matching process
                                  await new Promise(resolve => setTimeout(resolve, 800));
                                  
                                  const poolEmployees = workforce.filter(w =>
                                    w.status === 'Available-Pool' || w.status === 'Deallocating'
                                  );

                                  // ══════════════════════════════════════════════════════════════
                                  // ENHANCED MATCHING LOGIC - EXACT LOCATION & SKILL MATCHING
                                  // ══════════════════════════════════════════════════════════════
                                  
                                  const requiredSkill = ((role.required_skills || [])[0] || '').trim();
                                  const requiredLocation = (role.location || '').trim();
                                  
                                  console.log('🎯 SRF Requirements:', {
                                    skill: requiredSkill,
                                    location: requiredLocation,
                                    role: role.role_title
                                  });

                                  console.log('👥 Pool Employees Available:', poolEmployees.length);
                                  console.log('📊 Sample Pool Employees (first 5):', poolEmployees.slice(0, 5).map(emp => ({
                                    id: emp.employee_id,
                                    name: emp.employee_name,
                                    primary_skill: emp.primary_skill,
                                    current_skills: emp.current_skills,
                                    current_skills_length: emp.current_skills?.length || 0,
                                    location: emp.location,
                                    status: emp.status
                                  })));

                                  const matchedEmployees = [];
                                  
                                  // ══════════════════════════════════════════════════════════════
                                  // OPTIMIZED BATCH SKILL MATRIX FETCHING
                                  // ══════════════════════════════════════════════════════════════
                                  
                                  // Step 1: Get all employee IDs for batch fetching
                                  const employeeIds = poolEmployees.map(emp => emp.employee_id);
                                  
                                  // Step 2: Batch fetch ALL Zen Matrix data at once
                                  let allSkillMatrixData: Record<string, any[]> = {};
                                  try {
                                    console.log('🚀 Attempting batch skills fetch for employee IDs:', employeeIds);
                                    
                                    const batchResponse = await fetch(`${API_BASE}/employees/batch-skills`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ employeeIds })
                                    });
                                    
                                    console.log('📡 Batch API Response Status:', batchResponse.status, batchResponse.statusText);
                                    
                                    if (batchResponse.ok) {
                                      const rawBatchData = await batchResponse.json();
                                      
                                      // Normalize all ID formats in batch data for easier lookup
                                      allSkillMatrixData = {};
                                      for (const [empId, skills] of Object.entries(rawBatchData)) {
                                        const normalizedId = String(empId).replace(/^0+/, ''); // Remove leading zeros
                                        allSkillMatrixData[normalizedId] = skills as any[];
                                        allSkillMatrixData[empId] = skills as any[]; // Keep original too
                                        allSkillMatrixData[String(empId)] = skills as any[]; // String version
                                        allSkillMatrixData[Number(empId)] = skills as any[]; // Number version
                                      }
                                      
                                      console.log('✅ Batch skills data received and normalized:', {
                                        totalEmployees: Object.keys(rawBatchData).length,
                                        originalIds: Object.keys(rawBatchData),
                                        normalizedIds: Object.keys(allSkillMatrixData).slice(0, 10),
                                        sampleData: Object.keys(rawBatchData).slice(0, 5).reduce((acc, key) => {
                                          acc[key] = (rawBatchData as any)[key]?.length || 0;
                                          return acc;
                                        }, {} as Record<string, number>),
                                        employeesWithSkills: Object.keys(rawBatchData).filter(key => (rawBatchData as any)[key]?.length > 0).length,
                                        employeesWithoutSkills: Object.keys(rawBatchData).filter(key => !(rawBatchData as any)[key] || (rawBatchData as any)[key]?.length === 0).length
                                      });
                                    } else {
                                      const errorText = await batchResponse.text();
                                      console.warn('❌ Batch skills API failed:', batchResponse.status, errorText);
                                    }
                                  } catch (error) {
                                    console.warn('❌ Batch skills fetch failed, falling back to individual calls:', error);
                                  }

                                  // ══════════════════════════════════════════════════════════════
                                  // AI SEMANTIC SKILL MATCHING — Strict Synonym / Alias Map
                                  // KEY RULE: "Automation Testing - SDET" is its OWN group.
                                  //           It does NOT overlap with plain "Automation Testing".
                                  //           resolveSkillGroup() checks longest-match first.
                                  // ══════════════════════════════════════════════════════════════
                                  const SKILL_SYNONYMS: Record<string, string[]> = {
                                    // ── SDET — STRICT (no plain automation variants) ───────────
                                    'automation testing sdet': [
                                      'automation testing sdet',
                                      'automation testing - sdet',
                                      'automation testing-sdet',
                                      'sdet',
                                      'software development engineer in test',
                                      'software development engineer test',
                                    ],
                                    // ── Generic Automation (no SDET) ──────────────────────────
                                    'automation testing': [
                                      'automation testing',
                                      'test automation',
                                      'automated testing',
                                      'basic automation',
                                      'automation tester',
                                      'automation engineer',
                                      'qa automation',
                                      'automation qa',
                                      'selenium',
                                      'cypress',
                                      'playwright',
                                      'webdriver',
                                      'robot framework',
                                    ],
                                    // ── Functional / Manual ────────────────────────────────────
                                    'functional testing': [
                                      'functional testing', 'manual testing',
                                      'system testing', 'integration testing',
                                      'uat', 'user acceptance testing',
                                      'regression testing', 'smoke testing', 'sanity testing',
                                      'black box testing',
                                    ],
                                    // ── Mobile ─────────────────────────────────────────────────
                                    'functional testing mobile': [
                                      'functional testing mobile', 'functional testing - mobile',
                                      'mobile testing', 'mobile qa', 'mobile application testing',
                                      'ios testing', 'android testing', 'app testing',
                                      'appium', 'xcuitest', 'espresso',
                                    ],
                                    // ── Performance ────────────────────────────────────────────
                                    'performance testing': [
                                      'performance testing', 'load testing', 'stress testing',
                                      'jmeter', 'gatling', 'neoload', 'loadrunner',
                                      'performance engineer', 'perf testing',
                                    ],
                                    // ── Security ───────────────────────────────────────────────
                                    'security testing': [
                                      'security testing', 'penetration testing', 'pen testing',
                                      'vapt', 'vulnerability assessment', 'ethical hacking',
                                      'owasp', 'burp suite', 'security qa',
                                    ],
                                    // ── API ────────────────────────────────────────────────────
                                    'api testing': [
                                      'api testing', 'rest api testing', 'soap testing',
                                      'postman', 'rest assured', 'karate', 'api automation',
                                      'web services testing', 'microservices testing',
                                    ],
                                    // ── Data / ETL ─────────────────────────────────────────────
                                    'data etl': [
                                      'data / etl', 'data/etl', 'etl testing', 'data testing',
                                      'etl', 'data warehouse testing', 'bi testing',
                                      'sql testing', 'database testing', 'data validation',
                                      'informatica', 'talend', 'datastage',
                                    ],
                                    // ── AI / ML ────────────────────────────────────────────────
                                    'ai ml': [
                                      'ai/ml', 'ai, ml, deep learning', 'ai ml deep learning',
                                      'machine learning', 'deep learning', 'artificial intelligence',
                                      'ml testing', 'ai testing', 'data science',
                                    ],
                                    // ── Accessibility ──────────────────────────────────────────
                                    'accessibility testing': [
                                      'accessibility testing', 'wcag', 'ada testing',
                                      'screen reader testing', 'axe', 'wave tool',
                                      'a11y', 'accessibility qa',
                                    ],
                                    // ── Digital ────────────────────────────────────────────────
                                    'digital testing': [
                                      'digital testing', 'digital qa', 'digital assurance',
                                      'omnichannel testing', 'digital transformation testing',
                                    ],
                                    // ── Application Testing ────────────────────────────────────
                                    'application testing': [
                                      'application testing',
                                    ],
                                  };

                                  // ══════════════════════════════════════════════════════════════
                                  // AI SEMANTIC LOCATION MATCHING — Full alias map
                                  // Handles "PUNE CAMPUS", "HYDERABAD DLF SEZ", "Offshore" etc.
                                  // ══════════════════════════════════════════════════════════════
                                  const LOCATION_GROUPS: Record<string, string[]> = {
                                    offshore: [
                                      'offshore', 'india', 'offshore india',
                                      'pune', 'pune campus', 'pune - india', 'pune india',
                                      'pune hinjewadi', 'pune baner', 'pune kharadi',
                                      'hyderabad', 'hyderabad dlf sez', 'hyderabad dlf',
                                      'hyderabad india', 'hyd', 'hyderabad campus',
                                      'hyderabad gachibowli', 'hyderabad madhapur',
                                      'bangalore', 'bengaluru', 'bangalore india',
                                      'bengaluru india', 'bangalore campus',
                                      'bengaluru-electronic city', 'bangalore electronic city',
                                      'chennai', 'chennai india', 'chennai campus',
                                      'mumbai', 'mumbai india', 'navi mumbai',
                                      'noida', 'noida india', 'noida campus',
                                      'delhi', 'gurgaon', 'gurugram',
                                    ],
                                    onshore: [
                                      'onshore', 'uk', 'united kingdom', 'london', 'manchester',
                                      'usa', 'united states', 'us', 'new york', 'new jersey',
                                      'chicago', 'dallas', 'atlanta', 'san francisco',
                                      'europe', 'germany', 'france', 'netherlands',
                                      'australia', 'singapore', 'canada',
                                    ],
                                  };

                                  // ── City-level exact match list (for bonus scoring) ──
                                  const CITY_KEYWORDS: Record<string, string[]> = {
                                    'noida':      ['noida'],
                                    'pune':       ['pune'],
                                    'hyderabad':  ['hyderabad', 'hyd', 'dlf sez'],
                                    'bangalore':  ['bangalore', 'bengaluru', 'electronic city'],
                                    'chennai':    ['chennai'],
                                    'mumbai':     ['mumbai', 'navi mumbai'],
                                    'delhi':      ['delhi', 'gurgaon', 'gurugram'],
                                  };

                                  // Normalize a location string for comparison
                                  const normLoc = (s: string) =>
                                    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

                                  // Resolve which group a location string belongs to (exact match)
                                  const resolveLocationGroup = (loc: string): 'offshore' | 'onshore' | 'unknown' => {
                                    const l = normLoc(loc);
                                    if (!l) return 'unknown';
                                    // Check if any known variant exactly equals OR is fully contained in the location string
                                    if (LOCATION_GROUPS.offshore.some(v => {
                                      const vn = normLoc(v);
                                      return l === vn || l.includes(vn);
                                    })) return 'offshore';
                                    if (LOCATION_GROUPS.onshore.some(v => {
                                      const vn = normLoc(v);
                                      return l === vn || l.includes(vn);
                                    })) return 'onshore';
                                    return 'unknown';
                                  };

                                  // Resolve city key from a location string
                                  const resolveCity = (loc: string): string | null => {
                                    const l = normLoc(loc);
                                    for (const [city, keywords] of Object.entries(CITY_KEYWORDS)) {
                                      if (keywords.some(k => l.includes(normLoc(k)))) return city;
                                    }
                                    return null;
                                  };

                                  // Normalize a skill string for comparison
                                  const normSk = (s: string) =>
                                    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

                                  // Resolve canonical skill group — EXACT match only, longest variant first
                                  // This prevents "testing" matching every group that contains the word "testing"
                                  const resolveSkillGroup = (skillStr: string): string | null => {
                                    const s = normSk(skillStr);
                                    // Sort so longer/more-specific variants are checked first
                                    // e.g. "automation testing sdet" before "automation testing"
                                    const entries = Object.entries(SKILL_SYNONYMS).sort((a, b) => {
                                      const maxA = Math.max(...a[1].map(v => v.length));
                                      const maxB = Math.max(...b[1].map(v => v.length));
                                      return maxB - maxA;
                                    });
                                    for (const [canonical, variants] of entries) {
                                      if (variants.some(v => normSk(v) === s)) {
                                        return canonical;
                                      }
                                    }
                                    return null;
                                  };

                                  // Check if employee skill matches required skill
                                  // Rule: both must resolve to the SAME canonical group (exact)
                                  // No substring tricks — "performance testing" ≠ "automation testing"
                                  const skillsMatch = (empSkill: string, reqSkill: string): boolean => {
                                    if (!empSkill || !reqSkill) return false;
                                    const empGroup = resolveSkillGroup(empSkill);
                                    const reqGroup = resolveSkillGroup(reqSkill);
                                    if (empGroup && reqGroup) return empGroup === reqGroup;
                                    // Both unrecognised — fall back to exact normalized string match only
                                    return normSk(empSkill) === normSk(reqSkill);
                                  };

                                  // ── Resolve SRF requirements ─────────────────────────────────
                                  // Try required_skills[0] first, then role_title as fallback
                                  // Also try to resolve role_title through the synonym map
                                  const resolvedReqSkill = (() => {
                                    if (requiredSkill) return requiredSkill;
                                    // role_title fallback — map common title patterns to skill names
                                    const titleLower = (role.role_title || '').toLowerCase();
                                    if (titleLower.includes('sdet')) return 'Automation Testing - SDET';
                                    if (titleLower.includes('performance')) return 'Performance Testing';
                                    if (titleLower.includes('security')) return 'Security Testing';
                                    if (titleLower.includes('mobile')) return 'Functional Testing Mobile';
                                    if (titleLower.includes('automation')) return 'Automation Testing';
                                    if (titleLower.includes('functional') || titleLower.includes('manual')) return 'Functional Testing';
                                    if (titleLower.includes('api')) return 'API Testing';
                                    if (titleLower.includes('etl') || titleLower.includes('data')) return 'Data / ETL';
                                    if (titleLower.includes('accessibility')) return 'Accessibility Testing';
                                    if (titleLower.includes('digital')) return 'Digital Testing';
                                    return role.role_title || '';
                                  })();
                                  const reqLocGroup = resolveLocationGroup(requiredLocation);
                                  const reqCity = resolveCity(requiredLocation);
                                  // Parse SRF start date once for availability hard-filter
                                  const meta = parseMeta(role);
                                  const srfStartDate = meta.startDate ? new Date(meta.startDate) : null;

                                  // Step 3: Process each employee with semantic matching
                                  for (const emp of poolEmployees) {
                                    let score = 0;
                                    let matchReasons: string[] = [];
                                    
                                    let skillMatrixMatch = false;
                                    let excelSkillMatch = false;
                                    let skillLevelBonus = 0;
                                    let matchedZenSkills: string[] = [];
                                    let matchedExcelSkills: string[] = [];
                                    
                                    // ── Resolve employee Zen Matrix data ──
                                    let empSkillMatrixData = allSkillMatrixData[emp.employee_id] || [];
                                    if (empSkillMatrixData.length === 0) {
                                      const altIds = [
                                        String(emp.employee_id),
                                        String(emp.employee_id).replace(/^0+/, ''),
                                        String(emp.employee_id).padStart(6, '0'),
                                        String(emp.employee_id).padStart(5, '0'),
                                      ];
                                      for (const altId of altIds) {
                                        if (allSkillMatrixData[altId]?.length > 0) {
                                          empSkillMatrixData = allSkillMatrixData[altId];
                                          break;
                                        }
                                      }
                                    }

                                    // ══════════════════════════════════════════════════════════════
                                    // SEMANTIC SKILL MATCHING
                                    // ══════════════════════════════════════════════════════════════

                                    // Check Zen Matrix skills
                                    if (empSkillMatrixData.length > 0) {
                                      empSkillMatrixData.forEach((skill: any) => {
                                        const skillName = skill.skill_name || skill.skillName || '';
                                        if (skillsMatch(skillName, resolvedReqSkill)) {
                                          skillMatrixMatch = true;
                                          matchedZenSkills.push(skillName);
                                          const level = skill.selfRating || skill.self_rating || 0;
                                          if (level === 3) skillLevelBonus += 15;
                                          else if (level === 2) skillLevelBonus += 10;
                                          else if (level === 1) skillLevelBonus += 5;
                                        }
                                      });
                                    }

                                    // Check Excel skills (primary + L1-L4)
                                    const allExcelSkills = [
                                      emp.primary_skill || '',
                                      ...(emp.current_skills || [])
                                    ].filter(s => s && s.trim() !== '' && s !== 'NOT_AVAILABLE');

                                    allExcelSkills.forEach(skill => {
                                      if (skillsMatch(skill, resolvedReqSkill)) {
                                        excelSkillMatch = true;
                                        matchedExcelSkills.push(skill);
                                      }
                                    });

                                    // Must match skill in at least one source
                                    if (!skillMatrixMatch && !excelSkillMatch) continue;

                                    // ══════════════════════════════════════════════════════════
                                    // 2. LOCATION — Hard filter + scoring
                                    //    If SRF has a specific city → only that city passes
                                    //    If SRF says "Offshore/India" (no city) → all offshore pass
                                    //    Onshore ↔ Offshore mismatch → always skip
                                    // ══════════════════════════════════════════════════════════

                                    const empLocGroup = resolveLocationGroup(emp.location || '');
                                    const empLocDisplay = emp.location || 'Unknown';
                                    const empCity = resolveCity(emp.location || '');

                                    if (!requiredLocation) {
                                      // No location on SRF — accept everyone
                                      score += 15;
                                      matchReasons.push('📍 Location: Any');
                                    } else if (reqLocGroup === 'unknown') {
                                      // Unrecognised SRF location — don't filter, partial score
                                      score += 10;
                                      matchReasons.push(`📍 ${empLocDisplay}`);
                                    } else if (reqLocGroup === 'offshore' && empLocGroup === 'onshore') {
                                      continue; // ❌ Hard mismatch
                                    } else if (reqLocGroup === 'onshore' && empLocGroup === 'offshore') {
                                      continue; // ❌ Hard mismatch
                                    } else if (reqCity) {
                                      // SRF has a specific city — HARD filter: only that city
                                      if (empCity !== reqCity) {
                                        continue; // ❌ Wrong city — skip entirely
                                      }
                                      score += 25;
                                      matchReasons.push(`📍 ${empLocDisplay} ✓ (exact city)`);
                                    } else {
                                      // SRF says "Offshore" / "India" with no specific city
                                      // Accept all offshore employees, score by region
                                      if (empLocGroup === reqLocGroup) {
                                        score += 15;
                                        matchReasons.push(`📍 ${empLocDisplay} (offshore)`);
                                      } else {
                                        score += 8;
                                        matchReasons.push(`📍 ${empLocDisplay}`);
                                      }
                                    }

                                    // ══════════════════════════════════════════════════════════════
                                    // SCORING SYSTEM
                                    // ══════════════════════════════════════════════════════════════

                                    // Skill score (40 pts max)
                                    if (skillMatrixMatch && excelSkillMatch) {
                                      score += 40;
                                      matchReasons.push('🟢 Skills: Both Excel & Zen Matrix');
                                    } else if (skillMatrixMatch) {
                                      score += 35;
                                      matchReasons.push('🔵 Skills: Zen Matrix');
                                    } else if (excelSkillMatch) {
                                      score += 30;
                                      matchReasons.push('🟡 Skills: Excel');
                                    }

                                    // Skill level bonus
                                    if (skillLevelBonus > 0) {
                                      score += skillLevelBonus;
                                      matchReasons.push(`⭐ Level Bonus: +${skillLevelBonus}pts`);
                                    }

                                    // ══════════════════════════════════════════════════════════
                                    // DATE / AVAILABILITY — Hard filter for deallocating
                                    //   Pool employees  → always available ✅
                                    //   Deallocating    → deallocation_date must be ≤ SRF start
                                    // ══════════════════════════════════════════════════════════
                                    let availabilityLabel = '';
                                    if (emp.status === 'Available-Pool') {
                                      score += 10;
                                      availabilityLabel = '✅ Available now (Pool)';
                                    } else if (emp.status === 'Deallocating') {
                                      if (!srfStartDate) {
                                        // No SRF start date — include all deallocating
                                        score += 8;
                                        availabilityLabel = emp.deallocation_date
                                          ? `✅ Free by ${emp.deallocation_date}`
                                          : '⚠️ Deallocating (date unknown)';
                                      } else if (emp.deallocation_date) {
                                        const deallocDate = new Date(emp.deallocation_date);
                                        if (!isNaN(deallocDate.getTime())) {
                                          if (deallocDate <= srfStartDate) {
                                            const daysBuffer = Math.round(
                                              (srfStartDate.getTime() - deallocDate.getTime()) / 86400000
                                            );
                                            score += 10;
                                            availabilityLabel = `✅ Free ${daysBuffer}d before start`;
                                          } else {
                                            continue; // ❌ Still engaged when SRF starts — skip
                                          }
                                        } else {
                                          score += 5;
                                          availabilityLabel = '⚠️ Dealloc date unclear';
                                        }
                                      } else {
                                        // No deallocation date — include with warning
                                        score += 5;
                                        availabilityLabel = '⚠️ Deallocating (no date)';
                                      }
                                    }
                                    if (availabilityLabel) matchReasons.push(availabilityLabel);

                                    // Grade match (10 pts)
                                    const reqGrade = meta.grade || '';
                                    const empGrade = (emp as any).grade || (emp as any).band || '';
                                    if (reqGrade && empGrade) {
                                      if (reqGrade === empGrade) {
                                        score += 10;
                                        matchReasons.push(`🎓 Grade: ${empGrade} ✓`);
                                      } else if (reqGrade[0] === empGrade[0]) {
                                        score += 5;
                                        matchReasons.push(`🎓 Grade Band: ${empGrade[0]}`);
                                      }
                                    }

                                    // Aging bonus (5 pts)
                                    const aging = emp.aging_days || 0;
                                    if (aging > 60) { score += 5; matchReasons.push(`⏳ Aging: ${aging}d`); }
                                    else if (aging > 30) { score += 3; matchReasons.push(`⏳ Aging: ${aging}d`); }

                                    matchedEmployees.push({
                                      ...emp,
                                      matchScore: Math.min(score, 100),
                                      matchReasons: matchReasons.join(' · '),
                                      rank: 0,
                                      skillLevelBonus,
                                      matchedZenSkills:  [...new Set(matchedZenSkills)],
                                      matchedExcelSkills: [...new Set(matchedExcelSkills)],
                                      matchSource: skillMatrixMatch && excelSkillMatch ? 'Both Sources'
                                                 : skillMatrixMatch ? 'Zen Matrix Only' : 'BFSI Data'
                                    });
                                  }

                                  // ══════════════════════════════════════════════════════════════
                                  // RANKING & SORTING (Multi-tier)
                                  // ══════════════════════════════════════════════════════════════
                                  
                                  const matches = matchedEmployees
                                    .sort((a, b) => {
                                      // 1st priority: Score (highest first)
                                      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
                                      // 2nd priority: Skill Level Bonus (highest first)
                                      if (b.skillLevelBonus !== a.skillLevelBonus) return b.skillLevelBonus - a.skillLevelBonus;
                                      // 3rd priority: Aging Days (highest first - urgent placement)
                                      return (b.aging_days || 0) - (a.aging_days || 0);
                                    })
                                    .map((emp, index) => ({
                                      ...emp,
                                      rank: index + 1
                                    }));

                                  console.log('✅ Final matches:', matches.map(m => ({
                                    rank: m.rank,
                                    name: m.employee_name,
                                    score: m.matchScore,
                                    skillLevelBonus: m.skillLevelBonus,
                                    source: m.matchSource,
                                    reasons: m.matchReasons
                                  })));

                                  // ══════════════════════════════════════════════════════════════
                                  // SOURCE BREAKDOWN — use matchSource already computed per employee
                                  // matchSource = 'Both Sources' | 'Zen Matrix Only' | 'BFSI Data'
                                  // ══════════════════════════════════════════════════════════════
                                  const sourceBreakdown = { excelOnly: 0, zenMatrixOnly: 0, bothSources: 0 };

                                  for (const emp of matches) {
                                    const src = (emp as any).matchSource || 'BFSI Data';
                                    if (src === 'Both Sources')     sourceBreakdown.bothSources++;
                                    else if (src === 'Zen Matrix Only') sourceBreakdown.zenMatrixOnly++;
                                    else                             sourceBreakdown.excelOnly++;
                                  }
                                  
                                  console.log('🎯 SETTING MATCH RESULTS WITH:', {
                                    excelOnly: sourceBreakdown.excelOnly,
                                    skillMatrixOnly: sourceBreakdown.zenMatrixOnly,
                                    bothSources: sourceBreakdown.bothSources,
                                    totalMatches: matches.length
                                  });

                                  setMatchResults({
                                    role,
                                    matches,
                                    excelOnly: sourceBreakdown.excelOnly,
                                    skillMatrixOnly: sourceBreakdown.zenMatrixOnly,
                                    bothSources: sourceBreakdown.bothSources,
                                    allSkillMatrixData: allSkillMatrixData,
                                  });
                                  
                                  // Reset filters/view state for fresh results
                                  setSourceFilter('all');
                                  setShowAllMatches(false);
                                  setShowTopRank(false);
                                  
                                  setMatchLoading(false);
                                  toast.success(`Found ${matches.length} potential matches for ${role.role_title}`);
                                }}
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 10,
                                  padding: '12px 24px',
                                  background: 'linear-gradient(135deg,#10b981,#059669)',
                                  color: '#fff',
                                  borderRadius: 12,
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  fontWeight: 900,
                                  border: 'none',
                                  boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                                  transition: '0.3s'
                                }}
                              >
                                <Sparkles size={16} />
                                FIND MATCHES
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Match Results Modal - Shows in Popup */}
              {/* Moved to modals section below */}

              {/* Loading State */}
              {matchLoading && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                  <div style={{ background: T.card, borderRadius: 24, padding: 48, textAlign: 'center', border: `1px solid ${T.bdr}` }}>
                    <div style={{ width: 64, height: 64, border: '4px solid #e2e8f0', borderTopColor: COLORS.success, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 24px' }} />
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>Finding Perfect Matches...</div>
                    <div style={{ fontSize: 13, color: T.sub }}>Analyzing {workforce.filter(w => w.status === 'Available-Pool' || w.status === 'Deallocating').length} employees</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ZENFINDER TAB — AI-powered natural language employee search    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'zenfinder' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

              {/* Header */}
              <div style={{ textAlign: 'center', paddingTop: 16 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(139,92,246,0.35)' }}>
                    <Search size={26} color="#fff" />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: T.text }}>ZenFinder</h2>
                  </div>
                </div>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', maxWidth: 860, margin: '0 auto', width: '100%' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    {/* Inline ghost text: typed text + faded completion in one container */}
                    <div style={{
                      position: 'relative',
                      border: `2px solid ${COLORS.purple}`,
                      borderRadius: 16,
                      background: dark ? '#0f172a' : '#fff',
                      boxShadow: '0 4px 20px rgba(139,92,246,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                    }}>
                      {/* Ghost overlay — sits behind, shows typed + faded completion */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
                        padding: '18px 20px', fontSize: 15, fontWeight: 600,
                        lineHeight: 1.5, pointerEvents: 'none', zIndex: 0,
                        whiteSpace: 'pre', overflow: 'hidden',
                        fontFamily: 'inherit',
                      }}>
                        {/* Typed part — invisible (same color as bg) */}
                        <span style={{ color: 'transparent' }}>{zfQuery}</span>
                        {/* Ghost completion — faded */}
                        {zfShowSugg && zfSuggestions[0] && (() => {
                          const lastWord = zfQuery.split(/\s+/).pop()?.toLowerCase() || '';
                          const s = zfSuggestions[0];
                          const completion = s.toLowerCase().startsWith(lastWord) ? s.slice(lastWord.length) : '';
                          return completion ? (
                            <span style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(100,100,100,0.4)', fontStyle: 'normal' }}>
                              {completion}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      {/* Real input — transparent bg so ghost shows through */}
                      <input
                        type="text"
                        value={zfQuery}
                        onChange={e => {
                          const val = e.target.value;
                          setZfQuery(val);
                          const lastWord = val.split(/\s+/).pop()?.toLowerCase() || '';
                          if (lastWord.length >= 2) {
                            const allSuggestions = [
                              'automation testing', 'performance testing', 'security testing',
                              'functional testing', 'mobile testing', 'SDET', 'selenium',
                              'finance', 'banking', 'insurance', 'BFSI', 'healthcare',
                              'java', 'python', 'javascript', 'react', 'angular',
                              'aws', 'azure', 'devops', 'kubernetes', 'docker',
                              'agile', 'scrum', 'project management', 'leadership',
                              'chargeability', 'billable', 'available', 'pool',
                              'pune', 'hyderabad', 'bangalore', 'noida', 'chennai',
                              'certification', 'award', 'PMP', 'ISTQB', 'AWS certified',
                              'data engineering', 'ETL', 'SQL', 'machine learning', 'AI',
                            ];
                            const filtered = allSuggestions.filter(s => s.toLowerCase().startsWith(lastWord));
                            setZfSuggestions(filtered.slice(0, 1));
                            setZfShowSugg(filtered.length > 0);
                          } else {
                            setZfShowSugg(false);
                            setZfSuggestions([]);
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Tab' && zfShowSugg && zfSuggestions[0]) {
                            e.preventDefault();
                            const lastWord = zfQuery.split(/\s+/).pop()?.toLowerCase() || '';
                            const suggestion = zfSuggestions[0];
                            if (suggestion.toLowerCase().startsWith(lastWord)) {
                              const words = zfQuery.split(/\s+/);
                              words[words.length - 1] = suggestion;
                              setZfQuery(words.join(' ') + ' ');
                            }
                            setZfShowSugg(false);
                            setZfSuggestions([]);
                            return;
                          }
                          if (e.key === 'Escape') { setZfShowSugg(false); setZfSuggestions([]); return; }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            setZfShowSugg(false);
                            if (zfQuery.trim()) runZenFinderSearch(zfQuery, workforce);
                          }
                        }}
                        placeholder="e.g. 'automation testing pune' or 'AWS certified' or 'SDET bangalore'"
                        style={{
                          position: 'relative', zIndex: 1,
                          width: '100%', padding: '18px 20px',
                          fontSize: 15, fontWeight: 600, lineHeight: 1.5,
                          background: 'transparent', color: T.text,
                          border: 'none', outline: 'none',
                          fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                      />
                      {/* Tab hint badge */}
                      {zfShowSugg && zfSuggestions[0] && (
                        <div style={{ flexShrink: 0, marginRight: 14, padding: '3px 8px', background: `${COLORS.purple}18`, border: `1px solid ${COLORS.purple}44`, borderRadius: 6, fontSize: 10, fontWeight: 800, color: COLORS.purple, whiteSpace: 'nowrap', zIndex: 2 }}>
                          Tab ↹
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!zfQuery.trim()) return;
                      setZfShowSugg(false);
                      runZenFinderSearch(zfQuery, workforce);
                    }}
                    style={{ padding: '18px 32px', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', borderRadius: 16, fontSize: 15, fontWeight: 900, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(139,92,246,0.35)', transition: '0.3s', flexShrink: 0 }}
                  >
                    <Search size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                    Search
                  </button>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['automation testing', 'finance', 'chargeability', 'SDET pune', 'AWS certified', 'performance testing bangalore'].map(hint => (
                    <span
                      key={hint}
                      onClick={() => setZfQuery(hint)}
                      style={{ fontSize: 11, padding: '4px 12px', background: dark ? 'rgba(139,92,246,0.12)' : '#f5f3ff', color: COLORS.purple, borderRadius: 20, cursor: 'pointer', border: `1px solid ${COLORS.purple}44`, fontWeight: 700, transition: '0.2s' }}
                    >
                      {hint}
                    </span>
                  ))}
                  <span style={{ fontSize: 11, color: T.sub, alignSelf: 'center' }}>← quick examples · press Enter or click Search</span>
                </div>
              </div>

              {/* Loading */}
              {zfLoading && (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ width: 48, height: 48, border: '4px solid #e2e8f0', borderTopColor: COLORS.purple, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Searching across all employee data...</div>
                  <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>Scanning BFSI data + Zen Matrix resumes</div>
                </div>
              )}

              {/* Results */}
              {!zfLoading && zfSearched && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h4 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>
                      {zfResults.length > 0
                        ? `Found ${zfResults.length} employees matching "${zfQuery}"`
                        : `No employees found for "${zfQuery}"`}
                    </h4>
                    {zfResults.length > 0 && (
                      <span style={{ fontSize: 12, color: T.sub }}>Sorted by relevance score</span>
                    )}
                  </div>

                  {zfResults.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 64, color: T.sub }}>
                      <Search size={48} color={T.bdr} style={{ margin: '0 auto 16px', display: 'block' }} />
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No matches found</div>
                      <div style={{ fontSize: 13 }}>Try different keywords, a broader term, or check spelling</div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 20 }}>
                    {zfResults.filter((emp: any) => emp.status !== 'In-project').map((emp: any, idx: number) => {
                      const statusColor = emp.status === 'Available-Pool' ? COLORS.success : emp.status === 'Deallocating' ? COLORS.warning : COLORS.info;

                      // Split reasons by source group
                      const lobReasons    = (emp.zfReasons || []).filter((r: any) => r.source === 'Excel');
                      const zenSkills     = (emp.zfReasons || []).filter((r: any) => r.source === 'Zen Matrix → Skills');
                      const zenCerts      = (emp.zfReasons || []).filter((r: any) => r.source === 'Zen Matrix → Certifications');
                      const zenProjects   = (emp.zfReasons || []).filter((r: any) => r.source === 'Zen Matrix → Projects');
                      const zenAwards     = (emp.zfReasons || []).filter((r: any) => r.source === 'Zen Matrix → Awards');
                      const hasZenData    = zenSkills.length + zenCerts.length + zenProjects.length + zenAwards.length > 0;

                      const SectionHeader = ({ icon, label, color, count }: { icon: string; label: string; color: string; count: number }) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13 }}>{icon}</span>
                          <span style={{ fontSize: 10, fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: `${color}18`, color }}>{count} match{count !== 1 ? 'es' : ''}</span>
                        </div>
                      );

                      const ReasonRow = ({ r }: { r: any }) => (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 8px', borderRadius: 6, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, flexShrink: 0 }}>{r.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{r.field}: <span style={{ color: COLORS.purple }}>{r.value}</span></div>
                            <div style={{ fontSize: 10, color: T.sub, fontStyle: 'italic', lineHeight: 1.3 }}>{r.context}</div>
                          </div>
                        </div>
                      );

                      return (
                        <div key={idx} style={{ background: dark ? 'rgba(15,23,42,0.8)' : '#fff', borderRadius: 18, border: `1px solid ${T.bdr}`, overflow: 'hidden', boxShadow: dark ? 'none' : '0 4px 20px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column' }} className="hover-card">

                          {/* ── TOP HEADER ── */}
                          <div style={{ padding: '14px 16px', background: `linear-gradient(135deg,${COLORS.purple}18,${COLORS.purple}08)`, borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${statusColor},${statusColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
                              {(emp.employee_name || '?')[0]}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 900, fontSize: 15, color: T.text }}>{emp.employee_name}</div>
                              <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>
                                {formatZensarId(emp.employee_id)} · {(emp as any).grade || (emp as any).band || '—'} · {emp.location || '—'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                              <div
                                onClick={e => { e.stopPropagation(); setZfScorePopup(emp); }}
                                style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                title="Click to see score breakdown"
                              >
                                {emp.zfScore} pts ℹ️
                              </div>
                            </div>
                          </div>

                          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

                            {/* ── ZEN MATRIX DATA ── */}
                            {hasZenData ? (
                              <div style={{ borderRadius: 12, border: `1px solid #10b98120`, background: dark ? 'rgba(16,185,129,0.06)' : '#f0fdf4', padding: '10px 12px' }}>
                                <SectionHeader icon="🎓" label="Zen Matrix Resume" color="#10b981" count={zenSkills.length + zenCerts.length + zenProjects.length + zenAwards.length} />

                                {/* Skills */}
                                {zenSkills.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, color: '#10b981', fontWeight: 800, marginBottom: 4 }}>🎯 Skills:</div>
                                    {zenSkills.map((r: any, i: number) => <ReasonRow key={i} r={r} />)}
                                  </div>
                                )}

                                {/* Certifications */}
                                {zenCerts.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, color: '#10b981', fontWeight: 800, marginBottom: 4 }}>🏅 Certifications:</div>
                                    {zenCerts.map((r: any, i: number) => <ReasonRow key={i} r={r} />)}
                                  </div>
                                )}

                                {/* Projects */}
                                {zenProjects.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, color: '#10b981', fontWeight: 800, marginBottom: 4 }}>🏗️ Projects:</div>
                                    {zenProjects.map((r: any, i: number) => <ReasonRow key={i} r={r} />)}
                                  </div>
                                )}

                                {/* Awards */}
                                {zenAwards.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 10, color: '#10b981', fontWeight: 800, marginBottom: 4 }}>🏆 Awards:</div>
                                    {zenAwards.map((r: any, i: number) => <ReasonRow key={i} r={r} />)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ borderRadius: 12, border: `1px dashed ${T.bdr}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16 }}>🎓</span>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.sub }}>Zen Matrix Resume</div>
                                  <div style={{ fontSize: 10, color: T.sub, fontStyle: 'italic' }}>No resume uploaded yet</div>
                                </div>
                              </div>
                            )}

                          </div>

                          {/* ── FOOTER ACTIONS ── */}
                          <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.bdr}`, display: 'flex', gap: 8 }}>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch(`${API_BASE}/employees/${emp.employee_id}/skills`);
                                  const skills = res.ok ? await res.json() : [];
                                  setSkillMatrixModal({ employee: emp, skills });
                                } catch { setSkillMatrixModal({ employee: emp, skills: [] }); }
                              }}
                              style={{ flex: 1, padding: '9px 12px', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 900, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <GraduationCap size={14} /> Zen Matrix
                            </button>
                            <button
                              onClick={() => navigate(`/admin/employee/${formatZensarId(emp.employee_id)}`)}
                              style={{ padding: '9px 14px', background: dark ? '#1e293b' : '#f1f5f9', color: T.text, borderRadius: 9, fontSize: 12, fontWeight: 900, border: `1px solid ${T.bdr}`, cursor: 'pointer' }}
                            >
                              Profile
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state before first search */}
              {!zfLoading && !zfSearched && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: T.sub }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: T.text, marginBottom: 8 }}>Search anything about your employees</div>
                  <div style={{ fontSize: 14, maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
                    Type a skill, domain, keyword, or even a full sentence.<br />
                    ZenFinder searches across <strong>BFSI data</strong> (skills, projects, location) and <strong>Zen Matrix resumes</strong> (certifications, awards, all skills).
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SYNC DATA UPLOAD LOADING OVERLAY */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {uploading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: dark ? '#0f172a' : '#fff', borderRadius: 28, padding: '48px 56px', maxWidth: 480, width: '90%', textAlign: 'center', border: `1px solid ${COLORS.info}44`, boxShadow: '0 40px 100px rgba(59,130,246,0.25)' }}>

            {/* Animated icon */}
            <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 28px' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `4px solid ${dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}` }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `4px solid transparent`, borderTopColor: COLORS.info, animation: 'spin 1s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: `linear-gradient(135deg,${COLORS.info}22,${COLORS.purple}22)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={28} color={COLORS.info} />
              </div>
            </div>

            {/* Title */}
            <div style={{ fontSize: 22, fontWeight: 900, color: dark ? '#fff' : '#0f172a', marginBottom: 8 }}>Syncing Data</div>
            <div style={{ fontSize: 14, color: dark ? 'rgba(255,255,255,0.6)' : '#64748b', marginBottom: 32 }}>Processing your Excel file, please wait...</div>

            {/* Progress bar */}
            <div style={{ background: dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9', borderRadius: 99, height: 10, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${uploadStep}%`,
                background: uploadStep === 100
                  ? `linear-gradient(90deg,${COLORS.success},#06b6d4)`
                  : `linear-gradient(90deg,${COLORS.info},${COLORS.purple})`,
                borderRadius: 99,
                transition: 'width 0.6s ease',
              }} />
            </div>

            {/* Step label */}
            <div style={{ fontSize: 13, fontWeight: 700, color: uploadStep === 100 ? COLORS.success : COLORS.info, marginBottom: 24, minHeight: 20 }}>
              {uploadStep === 100 ? '✅ ' : '⏳ '}{uploadStepLabel}
            </div>

            {/* Step indicators */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[
                'LOB Sheet', 'Reactive SRFs', 'Proactive SRFs',
                'Pool', 'Deallocation', 'Database', 'Done'
              ].map((step, i) => {
                const stepPct = [25, 40, 55, 68, 80, 90, 100][i];
                const done = uploadStep >= stepPct;
                const active = uploadStep >= (i === 0 ? 10 : [25, 40, 55, 68, 80, 90, 100][i - 1]) && !done;
                return (
                  <div key={step} style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: done ? `${COLORS.success}20` : active ? `${COLORS.info}20` : (dark ? 'rgba(255,255,255,0.05)' : '#f8fafc'),
                    color: done ? COLORS.success : active ? COLORS.info : (dark ? 'rgba(255,255,255,0.3)' : '#94a3b8'),
                    border: `1px solid ${done ? COLORS.success + '44' : active ? COLORS.info + '44' : 'transparent'}`,
                    transition: '0.3s'
                  }}>
                    {done ? '✓ ' : active ? '● ' : ''}{step}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ZENFINDER SCORE BREAKDOWN POPUP */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {zfScorePopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
          onClick={() => setZfScorePopup(null)}>
          <div style={{ background: T.card, borderRadius: 20, border: `2px solid ${COLORS.purple}`, maxWidth: 680, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(139,92,246,0.3)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Score Breakdown</div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{zfScorePopup.employee_name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                  {formatZensarId(zfScorePopup.employee_id)} · Query: <em>"{zfQuery}"</em>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: '8px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{zfScorePopup.zfScore}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.85 }}>TOTAL PTS</div>
                </div>
                <button onClick={() => setZfScorePopup(null)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: T.sub }}>
                Each row shows <strong>where</strong> the match was found, <strong>which field</strong> matched, <strong>what value</strong> matched, and <strong>how many points</strong> it contributed.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: dark ? 'rgba(139,92,246,0.12)' : '#f5f3ff' }}>
                    {['Source / Page', 'Field', 'Matched Value', 'Points'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: 11, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `2px solid ${COLORS.purple}33` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(zfScorePopup.zfAllReasons || zfScorePopup.zfReasons || []).map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.bdr}`, background: i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)') }}>
                      <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14 }}>{r.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, color: T.text }}>{r.source}</div>
                            <div style={{ fontSize: 10, color: T.sub, marginTop: 1 }}>{r.context?.substring(0, 60)}{r.context?.length > 60 ? '…' : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: T.sub, verticalAlign: 'top' }}>{r.field}</td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                        <span style={{ background: `${COLORS.purple}15`, color: COLORS.purple, padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>{r.value}</span>
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                        <span style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontWeight: 900, fontSize: 12 }}>+{r.pts}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: dark ? 'rgba(139,92,246,0.15)' : '#f5f3ff', borderTop: `2px solid ${COLORS.purple}44` }}>
                    <td colSpan={3} style={{ padding: '12px 14px', fontWeight: 900, fontSize: 14, color: T.text }}>Total Score</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', padding: '5px 14px', borderRadius: 8, fontWeight: 900, fontSize: 15 }}>{zfScorePopup.zfScore} pts</span>
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Score guide */}
              <div style={{ marginTop: 20, padding: '14px 16px', background: dark ? 'rgba(139,92,246,0.06)' : '#faf5ff', borderRadius: 12, border: `1px solid ${COLORS.purple}22` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.purple, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Points Guide</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px' }}>
                  {[
                    { label: 'Zen Matrix Certification', pts: 25 },
                    { label: 'Zen Matrix Achievement', pts: 22 },
                    { label: 'Zen Matrix Skill', pts: 20 },
                    { label: 'BFSI Primary Skill', pts: 20 },
                    { label: 'Zen Matrix Project', pts: 18 },
                    { label: 'BFSI L1–L4 Skill', pts: 15 },
                    { label: 'BFSI Current Project', pts: 12 },
                    { label: 'BFSI Location', pts: 10 },
                    { label: 'BFSI Customer', pts: 10 },
                    { label: 'BFSI Practice', pts: 8 },
                    { label: 'BFSI Service Line', pts: 8 },
                  ].map(g => (
                    <div key={g.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.sub, padding: '2px 0' }}>
                      <span>{g.label}</span>
                      <span style={{ fontWeight: 700, color: COLORS.purple }}>+{g.pts}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MATCH RESULTS MODAL - POPUP */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {matchResults && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(10px)' }} onClick={() => setMatchResults(null)}>
          <div style={{ background: T.card, borderRadius: 24, border: `2px solid ${COLORS.success}`, maxWidth: 1400, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(16,185,129,0.3)' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ padding: '24px 32px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>✨ Match Results</div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{matchResults.role.role_title}</h3>
                <div style={{ fontSize: 14, marginTop: 6, color: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>SRF: <strong>{matchResults.role.role_id}</strong></span>
                  <span>·</span>
                  <span>{matchResults.role.client_name}</span>
                  <span>·</span>
                  <span>📍 {matchResults.role.location || 'N/A'}</span>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => setShowTopRank(!showTopRank)}
                  style={{ 
                    padding: '10px 20px', 
                    background: showTopRank ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)', 
                    border: '1px solid rgba(255,255,255,0.3)', 
                    color: '#fff', 
                    borderRadius: 12, 
                    cursor: 'pointer', 
                    fontSize: 13, 
                    fontWeight: 900, 
                    transition: '0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = showTopRank ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'}
                >
                  <Award size={16} />
                  {showTopRank ? '📊 SHOW ALL' : '🏆 TOP 5 RANK'}
                </button>
                <button
                  onClick={() => setMatchResults(null)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: 12, cursor: 'pointer', fontSize: 22, transition: '0.3s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
              
              {/* Compute live counts — total pool supply vs zen matrix coverage */}
              {(() => {
                const allSkillData = matchResults.allSkillMatrixData || {};
                const poolIds = workforce
                  .filter(w => w.status === 'Available-Pool' || w.status === 'Deallocating' ||
                    (w.status === 'In-project' && !!(w as any).deallocation_date))
                  .map(w => w.employee_id);
                const withZenMatrix = poolIds.filter(id => {
                  const skills = allSkillData[id] || allSkillData[String(id)] ||
                    allSkillData[String(id).replace(/^0+/, '')] || [];
                  return (skills as any[]).length > 0;
                }).length;
                matchResults._withZenMatrix = withZenMatrix;
                const liveCounts = { excel: 0, matrix: 0, both: 0 };
                for (const emp of matchResults.matches) {
                  const src = (emp as any).matchSource || 'BFSI Data';
                  if (src === 'Both Sources') liveCounts.both++;
                  else if (src === 'Zen Matrix Only') liveCounts.matrix++;
                  else liveCounts.excel++;
                }
                matchResults._liveCounts = liveCounts;
                return null;
              })()}

              {/* Source Breakdown — 2 filter cards only */}
              <div style={{ marginBottom: 32 }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: T.text, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <BarChart3 size={22} color={COLORS.success} />
                  Source Breakdown
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginLeft: 4 }}>— click a card to filter</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  <div
                    onClick={() => setSourceFilter(sourceFilter === 'excel' ? 'all' : 'excel')}
                    style={{
                      background: sourceFilter === 'excel' ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(249,115,22,0.1))' : 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(249,115,22,0.05))',
                      borderRadius: 14, padding: '24px',
                      border: `2px solid ${sourceFilter === 'excel' ? COLORS.warning : COLORS.warning + '44'}`,
                      textAlign: 'center', transition: '0.3s', cursor: 'pointer',
                      transform: sourceFilter === 'excel' ? 'scale(1.03)' : 'scale(1)'
                    }}
                    className="hover-card"
                  >
                    <div style={{ fontSize: 48, fontWeight: 800, color: COLORS.warning, lineHeight: 1, marginBottom: 8 }}>{matchResults.matches.length}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: T.text, textTransform: 'uppercase', marginBottom: 4 }}>🟡 BFSI Data</div>
                    <div style={{ fontSize: 11, color: T.sub }}>All matched from BFSI pool data</div>
                    {sourceFilter === 'excel'
                      ? <div style={{ fontSize: 10, color: COLORS.warning, marginTop: 8, fontWeight: 700 }}>✓ FILTERED</div>
                      : <div style={{ fontSize: 10, color: T.sub, marginTop: 8 }}>Click to filter</div>}
                  </div>
                  <div
                    onClick={() => setSourceFilter(sourceFilter === 'matrix' ? 'all' : 'matrix')}
                    style={{
                      background: sourceFilter === 'matrix' ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.1))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.05))',
                      borderRadius: 14, padding: '24px',
                      border: `2px solid ${sourceFilter === 'matrix' ? COLORS.success : COLORS.success + '44'}`,
                      textAlign: 'center', transition: '0.3s', cursor: 'pointer',
                      transform: sourceFilter === 'matrix' ? 'scale(1.03)' : 'scale(1)'
                    }}
                    className="hover-card"
                  >
                    <div style={{ fontSize: 48, fontWeight: 800, color: COLORS.success, lineHeight: 1, marginBottom: 8 }}>
                      {(matchResults._liveCounts?.matrix ?? 0) + (matchResults._liveCounts?.both ?? 0)}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: T.text, textTransform: 'uppercase', marginBottom: 4 }}>🟢 Zen Matrix Resume</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Matched with Zen Matrix skills verified</div>
                    {sourceFilter === 'matrix'
                      ? <div style={{ fontSize: 10, color: COLORS.success, marginTop: 8, fontWeight: 700 }}>✓ FILTERED</div>
                      : <div style={{ fontSize: 10, color: T.sub, marginTop: 8 }}>Click to filter</div>}
                  </div>
                </div>
              </div>

              {/* Matched Employees */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h4 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Users size={22} color={COLORS.success} />
                    Matched Employees
                    {sourceFilter !== 'all' && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.sub, background: dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9', padding: '3px 10px', borderRadius: 8 }}>
                        Filtered: {sourceFilter === 'excel' ? 'BFSI Data' : sourceFilter === 'matrix' ? 'Has Zen Matrix' : 'Both Sources'}
                        <span
                          onClick={() => setSourceFilter('all')}
                          style={{ marginLeft: 6, cursor: 'pointer', color: COLORS.danger, fontWeight: 900 }}
                        >✕</span>
                      </span>
                    )}
                  </h4>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => {
                        // Build CSV from current filtered matches
                        const filtered = matchResults.matches.filter((emp: BFSIEmployee) => {
                          if (sourceFilter === 'all') return true;
                          const src = (emp as any).matchSource || 'BFSI Data';
                          if (sourceFilter === 'excel')  return src === 'BFSI Data';
                          if (sourceFilter === 'matrix') return src === 'Zen Matrix Only';
                          if (sourceFilter === 'both')   return src === 'Both Sources';
                          return true;
                        });

                        const headers = ['Rank', 'Employee ID', 'Employee Name', 'Primary Skill', 'Matched Skill', 'Location', 'Band/Grade', 'Source', 'Match Score'];
                        const rows = filtered.map((emp: BFSIEmployee, idx: number) => {
                          const src = (emp as any).matchSource || 'BFSI Data';
                          const matchedSkill = [
                            ...((emp as any).matchedZenSkills || []),
                            ...((emp as any).matchedExcelSkills || [])
                          ].filter((v, i, a) => a.indexOf(v) === i).join('; ') || emp.primary_skill || '—';
                          return [
                            (emp as any).rank || idx + 1,
                            formatZensarId(emp.employee_id),
                            emp.employee_name,
                            emp.primary_skill || '—',
                            matchedSkill,
                            emp.location || '—',
                            (emp as any).grade || (emp as any).band || '—',
                            src,
                            (emp as any).matchScore || '—'
                          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
                        });

                        const csv = [headers.join(','), ...rows].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `match_results_${matchResults.role.role_id}_${new Date().toISOString().slice(0,10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success(`Exported ${filtered.length} employees to CSV`);
                      }}
                      style={{ padding: '10px 20px', background: COLORS.info, color: '#fff', borderRadius: 12, fontSize: 13, fontWeight: 900, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: '0.3s' }}
                    >
                      <Download size={16} />
                      Export Results
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  {matchResults.matches.slice(0, showTopRank ? 5 : (showAllMatches ? undefined : 10)).filter((emp: BFSIEmployee) => {
                    // Use matchSource — single source of truth computed during matching
                    if (sourceFilter === 'all') return true;
                    const src = (emp as any).matchSource || 'BFSI Data';
                    if (sourceFilter === 'excel')  return src === 'BFSI Data';
                    // 'matrix' filter = any employee with Zen Matrix data (both "Zen Matrix Only" AND "Both Sources")
                    if (sourceFilter === 'matrix') return src === 'Zen Matrix Only' || src === 'Both Sources';
                    if (sourceFilter === 'both')   return src === 'Both Sources';
                    return true;
                  }).map((emp: BFSIEmployee, idx: number) => {
                    // Badge from matchSource — no re-computation, always consistent
                    const src = (emp as any).matchSource || 'BFSI Data';
                    const sourceType = src === 'Both Sources' ? 'both' : src === 'Zen Matrix Only' ? 'matrix' : 'excel';
                    const badgeColor = sourceType === 'both' ? COLORS.success : sourceType === 'matrix' ? COLORS.info : COLORS.warning;
                    const badgeLabel = sourceType === 'both' ? 'Both' : sourceType === 'matrix' ? 'Matrix' : 'BFSI Data';
                    
                    return (
                      <div key={idx} style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#f8fafc', borderRadius: 14, borderTop: `1px solid ${badgeColor}44`, borderRight: `1px solid ${badgeColor}44`, borderBottom: `1px solid ${badgeColor}44`, borderLeft: `4px solid ${badgeColor}`, padding: '16px', transition: '0.3s', position: 'relative' }} className="hover-card">

                        {/* Rank Badge */}
                        {showTopRank && (
                          <div style={{ position: 'absolute', top: -8, left: -8, width: 28, height: 28, borderRadius: '50%', background: idx < 3 ? 'linear-gradient(135deg,#ffd700,#ffed4e)' : 'linear-gradient(135deg,#6b7280,#9ca3af)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900, fontSize: 12, border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                            #{(emp as any).rank || idx + 1}
                          </div>
                        )}

                        {/* ── Header: Name + Score + Status ── */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg,${badgeColor},${badgeColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                            {(emp.employee_name || '?')[0]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 14, color: T.text, marginBottom: 2 }}>{emp.employee_name}</div>
                            <div style={{ fontSize: 11, color: T.sub }}>
                              {formatZensarId(emp.employee_id)} · {(emp as any).grade || (emp as any).band || '—'} · {emp.location || '—'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                            {(emp as any).matchScore && (
                              <div style={{ padding: '3px 10px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 900 }}>
                                {(emp as any).matchScore} pts
                              </div>
                            )}
                            <span style={{ padding: '2px 8px', background: emp.status === 'Available-Pool' ? `${COLORS.success}18` : `${COLORS.warning}18`, color: emp.status === 'Available-Pool' ? COLORS.success : COLORS.warning, borderRadius: 6, fontSize: 10, fontWeight: 800 }}>
                              {emp.status === 'Available-Pool' ? '🟢 Pool' : '🟡 Deallocating'}
                            </span>
                          </div>
                        </div>

                        {/* ── BFSI Data row ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', padding: '8px 12px', background: dark ? 'rgba(59,130,246,0.06)' : '#eff6ff', borderRadius: 8, marginBottom: 8, fontSize: 11 }}>
                          <div><span style={{ color: T.sub }}>Primary Skill: </span><span style={{ fontWeight: 700, color: T.text }}>{emp.primary_skill || '—'}</span></div>
                          <div><span style={{ color: T.sub }}>Aging: </span><span style={{ fontWeight: 700, color: (emp.aging_days || 0) > 60 ? COLORS.success : T.text }}>{emp.aging_days || 0} days {(emp.aging_days || 0) > 60 ? '⭐' : ''}</span></div>
                          {emp.rmg_status && <div style={{ gridColumn: '1/-1' }}><span style={{ color: T.sub }}>RMG: </span><span style={{ fontWeight: 700, color: T.text }}>{emp.rmg_status}</span></div>}
                        </div>

                        {/* ── Zen Matrix matched skills ── */}
                        {(emp as any).matchedZenSkills?.length > 0 && (
                          <div style={{ padding: '8px 12px', background: dark ? 'rgba(16,185,129,0.06)' : '#f0fdf4', borderRadius: 8, marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.success, marginBottom: 4 }}>🎓 Zen Matrix Skills Matched:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {[...new Set((emp as any).matchedZenSkills as string[])].map((s: string, i: number) => (
                                <span key={i} style={{ fontSize: 11, padding: '2px 8px', background: `${COLORS.success}18`, color: COLORS.success, borderRadius: 5, fontWeight: 700 }}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Match reasons ── */}
                        {showTopRank && (emp as any).matchReasons && (
                          <div style={{ fontSize: 10, color: COLORS.success, marginBottom: 8, fontWeight: 600, padding: '4px 8px', background: `${COLORS.success}10`, borderRadius: 6 }}>
                            {(emp as any).matchReasons}
                          </div>
                        )}

                        {/* ── Actions ── */}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={async () => {
                              try {
                                const skillsResponse = await fetch(`${API_BASE}/employees/${emp.employee_id}/skills`);
                                const skills = skillsResponse.ok ? await skillsResponse.json() : [];
                                setSkillMatrixModal({ employee: emp, skills });
                              } catch {
                                setSkillMatrixModal({ employee: emp, skills: [] });
                              }
                            }}
                            style={{ flex: 1, padding: '9px 12px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 900, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <GraduationCap size={14} /> Zen Matrix
                          </button>
                          <button
                            onClick={() => navigate(`/admin/employee/${formatZensarId(emp.employee_id)}`)}
                            style={{ padding: '9px 14px', background: dark ? '#1e293b' : '#fff', color: T.text, borderRadius: 9, fontSize: 12, fontWeight: 900, border: `1px solid ${T.bdr}`, cursor: 'pointer' }}
                          >
                            Profile
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {matchResults.matches.length > 10 && !showTopRank && (
                  <div style={{ textAlign: 'center', marginTop: 28 }}>
                    <button
                      onClick={() => setShowAllMatches(!showAllMatches)}
                      style={{ padding: '14px 36px', background: COLORS.info, color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer', transition: '0.3s', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}
                    >
                      {showAllMatches
                        ? '🏆 Show Top 10'
                        : `📊 Show All ${matchResults.matches.length} Matches`}
                    </button>
                  </div>
                )}
                {showTopRank && matchResults.matches.length > 5 && (
                  <div style={{ textAlign: 'center', marginTop: 28 }}>
                    <button
                      onClick={() => { setShowTopRank(false); setShowAllMatches(true); }}
                      style={{ padding: '14px 36px', background: COLORS.info, color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 900, border: 'none', cursor: 'pointer', transition: '0.3s', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}
                    >
                      📊 Show All {matchResults.matches.length} Matches
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── JD Modal ── */}
      {jdModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(10px)' }} onClick={() => setJdModal(null)}>
          <div style={{ background: T.card, borderRadius: 24, border: `1px solid ${T.bdr}`, maxWidth: 800, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Job Description</div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>{jdModal.title}</h3>
              </div>
              <button onClick={() => setJdModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 32, overflowY: 'auto', flex: 1 }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: T.text, lineHeight: 1.8, margin: 0 }}>{jdModal.jd}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Zen Matrix Modal ── */}
      {skillMatrixModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(10px)' }} onClick={() => setSkillMatrixModal(null)}>
          <div style={{ background: T.card, borderRadius: 24, border: `1px solid ${T.bdr}`, maxWidth: 600, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Zen Matrix</div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>
                  {skillMatrixModal.employee.employee_name} ({formatZensarId(skillMatrixModal.employee.employee_id)})
                  {(() => {
                    console.log(`🎯 [MODAL DISPLAY] Showing employee in modal:`, {
                      displayedEmployeeId: formatZensarId(skillMatrixModal.employee.employee_id),
                      displayedEmployeeName: skillMatrixModal.employee.employee_name,
                      skillsCount: skillMatrixModal.skills.length,
                      fullEmployeeObject: skillMatrixModal.employee
                    });
                    return null;
                  })()}
                </h3>
              </div>
              <button onClick={() => setSkillMatrixModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 32, overflowY: 'auto', flex: 1 }}>
              {skillMatrixModal.skills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: T.sub }}>
                  <GraduationCap size={48} color={T.bdr} style={{ margin: '0 auto 16px' }} />
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No Skills Found in Zen Matrix</div>
                  <div style={{ fontSize: 13 }}>This employee hasn't uploaded their resume or skills yet.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: T.sub, fontWeight: 700, marginBottom: 8 }}>
                    {skillMatrixModal.skills.length} skills from resume upload
                  </div>
                  {skillMatrixModal.skills.map((skill: any, idx: number) => {
                    const rating = skill.selfRating || skill.self_rating || 0;
                    const skillName = skill.skillName || skill.skill_name || 'Unknown Skill';
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: dark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 12, border: `1px solid ${T.bdr}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                            {idx + 1}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{skillName}</div>
                            <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>Self-rated proficiency</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: rating === 3 ? COLORS.success : rating === 2 ? COLORS.warning : COLORS.info }}>
                            L{rating}
                          </div>
                          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700 }}>
                            {rating === 3 ? 'Advanced' : rating === 2 ? 'Intermediate' : 'Beginner'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {selectedMetric && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(10px)' }} onClick={() => { setSelectedMetric(null); setModalSearch(''); setModalLocationFilter('All'); }}>
          <div style={{ background: T.card, borderRadius: 24, border: `1px solid ${T.bdr}`, maxWidth: 1100, width: '100%', maxHeight: '85vh', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 32px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: dark ? 'rgba(0,0,0,0.2)' : '#fff' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selectedMetric.metric}</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: T.sub }}>{selectedMetric.data.length} total records</p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.sub }} />
                  <input value={modalSearch} onChange={e => setModalSearch(e.target.value)}
                    placeholder={selectedMetric.tab === 'demand' ? 'Search SRF / Customer / Skill...' : 'Search Name / ID...'}
                    style={{ padding: '9px 9px 9px 32px', background: dark ? '#0f172a' : '#f1f5f9', border: `1px solid ${T.bdr}`, borderRadius: 10, color: T.text, fontSize: 12, fontWeight: 700, outline: 'none', width: 240 }} />
                </div>
                {selectedMetric.tab !== 'match' && (
                  <select value={modalLocationFilter} onChange={e => setModalLocationFilter(e.target.value)}
                    style={{ padding: '9px 14px', borderRadius: 10, background: dark ? '#0f172a' : '#fff', border: `1px solid ${T.bdr}`, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                    <option value="All">All Locations</option>
                    {[...new Set(selectedMetric.data.map((d: any) => d.location).filter(Boolean))].sort().map((loc: any) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
                <button onClick={() => { setSelectedMetric(null); setModalSearch(''); setModalLocationFilter('All'); }}
                  style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 22, cursor: 'pointer', padding: 4 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 32, overflowY: 'auto', maxHeight: 'calc(85vh - 110px)' }}>

              {/* ── FIND A MATCH results — SRF cards (like demand dashboard) ── */}
              {selectedMetric.tab === 'match' && (() => {
                const s = modalSearch.toLowerCase().trim();

                // Filter SRF cards by search — SRF title, SRF no, customer, skill, grade, employee name/ID
                const filtered = (selectedMetric.data as any[]).filter((item: any) => {
                  if (!s) return true;
                  const role = item.role as BFSIRole;
                  const meta = parseMeta(role);
                  const jd = getJD(role);
                  const searchFields = [
                    role.role_title || '',
                    role.role_id || '',
                    role.client_name || '',
                    role.location || '',
                    (role.required_skills || []).join(' '),
                    meta.grade || '',
                    meta.month || '',
                    meta.startDate || '',
                    role.assigned_spoc || '',
                    // Also search by matched employee
                    item.bestEmployee?.employee_name || '',
                    item.bestEmployee?.employee_id || '',
                    item.bestEmployee?.primary_skill || '',
                    ...(item.allEmployees || []).map((e: any) => e.employee_name || ''),
                    ...(item.allEmployees || []).map((e: any) => e.primary_skill || ''),
                  ].map(x => x.toLowerCase());
                  return searchFields.some(x => x.includes(s));
                });

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Summary */}
                    <div style={{ fontSize: 12, color: T.sub, fontWeight: 700, padding: '8px 14px', background: dark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', borderRadius: 10, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>📋 {filtered.length} SRFs matched</span>
                        <span>👥 {[...new Set((selectedMetric.data as any[]).flatMap((i: any) => (i.allEmployees || []).map((e: any) => e.employee_id)))].length} employees available</span>
                        {s && <span style={{ color: COLORS.info }}>🔍 "{s}"</span>}
                        {(selectedMetric as any).filterReasons && (
                          <span style={{ color: COLORS.danger }}>
                            ❌ {((selectedMetric as any).filterReasons.location || 0) + ((selectedMetric as any).filterReasons.skill || 0) + ((selectedMetric as any).filterReasons.startDate || 0)} filtered out
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setShowAllMatches(!showAllMatches)}
                        style={{ padding: '6px 14px', background: COLORS.info, color: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: 'none' }}
                      >
                        {showAllMatches ? '🏆 Show Top 5' : '📊 Show All'}
                      </button>
                    </div>

                    {/* Filter reasons breakdown */}
                    {(selectedMetric as any).filterReasons && (
                      <div style={{ fontSize: 11, color: T.sub, padding: '8px 14px', background: dark ? 'rgba(239,68,68,0.1)' : '#fef2f2', borderRadius: 10, border: `1px solid ${COLORS.danger}44` }}>
                        <strong style={{ color: COLORS.danger }}>Filtered Out Reasons:</strong>
                        <span style={{ marginLeft: 8 }}>
                          {(selectedMetric as any).filterReasons.location > 0 && `${(selectedMetric as any).filterReasons.location} location mismatch`}
                          {(selectedMetric as any).filterReasons.location > 0 && ((selectedMetric as any).filterReasons.skill > 0 || (selectedMetric as any).filterReasons.startDate > 0) && ' · '}
                          {(selectedMetric as any).filterReasons.skill > 0 && `${(selectedMetric as any).filterReasons.skill} skill mismatch`}
                          {(selectedMetric as any).filterReasons.skill > 0 && (selectedMetric as any).filterReasons.startDate > 0 && ' · '}
                          {(selectedMetric as any).filterReasons.startDate > 0 && `${(selectedMetric as any).filterReasons.startDate} not available by start date`}
                        </span>
                      </div>
                    )}

                    {filtered.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 48, color: T.sub }}>
                        <Search size={36} color={T.bdr} style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 700 }}>No SRFs match "{s}"</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Try: skill name, SRF no, customer, grade, employee name</div>
                      </div>
                    )}

                    {filtered.map((item: any, i: number) => {
                      const role = item.role as BFSIRole;
                      const meta = parseMeta(role);
                      const jdText = getJD(role);
                      const typeColor = role.type === 'Reactive' ? COLORS.danger : COLORS.purple;
                      const pColor = role.fill_priority === 'P1' ? COLORS.danger : role.fill_priority === 'P2' ? COLORS.warning : COLORS.info;
                      const matchedEmps: BFSIEmployee[] = item.allEmployees || [];

                      return (
                        <div key={role.role_id} style={{ background: dark ? 'rgba(30,41,59,0.6)' : '#fff', borderRadius: 16, borderTop: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}`, borderLeft: `5px solid ${typeColor}`, overflow: 'hidden' }}>

                          {/* Row 1: Header — same as demand dashboard */}
                          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${typeColor},${typeColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Briefcase size={20} color="#fff" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontWeight: 900, fontSize: 15, color: T.text }}>{role.role_title}</span>
                                <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}44` }}>{role.type}</span>
                                <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}44` }}>{role.fill_priority || '—'}</span>
                              </div>
                              <div style={{ fontSize: 12, color: T.sub }}>
                                SRF: <strong style={{ color: T.text }}>{role.role_id}</strong>
                                {role.client_name && <> · <strong style={{ color: COLORS.info }}>{role.client_name}</strong></>}
                                {role.location && <> · 📍 {role.location}</>}
                              </div>
                            </div>
                            {/* Match badge */}
                            <div style={{ textAlign: 'right', flexShrink: 0, background: `${COLORS.success}15`, padding: '8px 14px', borderRadius: 12, border: `1px solid ${COLORS.success}44` }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.success, lineHeight: 1 }}>{matchedEmps.length}</div>
                              <div style={{ fontSize: 9, fontWeight: 900, color: COLORS.success, textTransform: 'uppercase' }}>Matched</div>
                            </div>
                          </div>

                          {/* Row 2: Details grid — same as demand dashboard */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', borderTop: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}` }}>
                            {[
                              { label: 'Skill',      value: (role.required_skills || [])[0] || '—' },
                              { label: 'Grade',      value: meta.grade || '—' },
                              { label: 'Openings',   value: String(meta.openings || '1') },
                              { label: 'Start Date', value: meta.startDate || '—' },
                              { label: 'SPOC',       value: role.assigned_spoc || '—' },
                              { label: 'Month',      value: meta.month || '—' },
                            ].map((f, fi) => (
                              <div key={f.label} style={{ padding: '10px 14px', borderRight: fi < 5 ? `1px solid ${T.bdr}` : 'none' }}>
                                <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                              </div>
                            ))}
                          </div>

                          {/* Row 3: Matched employees + View JD + Zen Matrix */}
                          <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Top row: View JD button */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {jdText && (
                                <button onClick={() => setJdModal({ title: role.role_title, jd: jdText })}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: `${COLORS.info}15`, color: COLORS.info, border: `1px solid ${COLORS.info}44`, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                                  <FileText size={13} /> View JD
                                </button>
                              )}
                            </div>
                            
                            {/* Matched employees section */}
                            <div>
                              <div style={{ fontSize: 11, color: T.sub, fontWeight: 700, marginBottom: 8 }}>
                                {showAllMatches ? `All ${matchedEmps.length} Matches:` : 'Top 5 Matches:'}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(showAllMatches ? matchedEmps : matchedEmps.slice(0, 5)).map((emp, ei) => (
                                  <div key={ei} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: dark ? 'rgba(255,255,255,0.06)' : '#f8fafc', borderRadius: 10, border: `1px solid ${T.bdr}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                                        {(emp.employee_name || '?')[0]}
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{emp.employee_name}</div>
                                        <div style={{ fontSize: 11, color: T.sub }}>
                                          {formatZensarId(emp.employee_id)} · {(emp as any).grade || (emp as any).band || '—'} · {emp.primary_skill}
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      onClick={async () => {
                                        console.log(`🎯 [SECOND BUTTON] Opening Skill Matrix for employee:`, {
                                          employee_id: emp.employee_id,
                                          employee_name: emp.employee_name,
                                          primary_skill: emp.primary_skill,
                                          fullEmployeeObject: emp
                                        });
                                        
                                        // Add visual feedback
                                        console.log(`🎯 [SECOND BUTTON] About to set skillMatrixModal state...`);
                                        
                                        try {
                                          const skillsResponse = await fetch(`${API_BASE}/employees/${emp.employee_id}/skills`);
                                          console.log(`📡 [SECOND BUTTON] Skill Matrix API Response:`, {
                                            status: skillsResponse.status,
                                            statusText: skillsResponse.statusText,
                                            url: `${API_BASE}/employees/${emp.employee_id}/skills`,
                                            requestedEmployeeId: emp.employee_id,
                                            requestedEmployeeName: emp.employee_name
                                          });
                                          
                                          let skills = [];
                                          if (skillsResponse.ok) {
                                            skills = await skillsResponse.json();
                                            console.log(`✅ [SECOND BUTTON] Skills fetched successfully:`, {
                                              requestedEmployeeId: emp.employee_id,
                                              requestedEmployeeName: emp.employee_name,
                                              count: skills.length,
                                              skills: skills
                                            });
                                          } else {
                                            const errorText = await skillsResponse.text();
                                            console.log(`❌ [SECOND BUTTON] API Error:`, {
                                              requestedEmployeeId: emp.employee_id,
                                              requestedEmployeeName: emp.employee_name,
                                              status: skillsResponse.status,
                                              error: errorText
                                            });
                                          }
                                          
                                          console.log(`🎯 [SECOND BUTTON] Setting modal with employee:`, {
                                            modalEmployeeId: emp.employee_id,
                                            modalEmployeeName: emp.employee_name,
                                            skillsCount: skills.length
                                          });
                                          
                                          console.log(`🚀 [SECOND BUTTON] Calling setSkillMatrixModal now...`);
                                          setSkillMatrixModal({ employee: emp, skills });
                                          console.log(`✅ [SECOND BUTTON] setSkillMatrixModal called successfully!`);
                                          
                                        } catch (error) {
                                          console.error('❌ [SECOND BUTTON] Network Error fetching skills:', error);
                                          setSkillMatrixModal({ employee: emp, skills: [] });
                                        }
                                      }}
                                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: 'none' }}
                                    >
                                      <GraduationCap size={14} />
                                      Zen Matrix
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── DEMAND (SRF) card layout ── */}
              {selectedMetric.tab === 'demand' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedMetric.data.filter((item: any) => {
                    const s = modalSearch.toLowerCase();
                    if (!s && modalLocationFilter === 'All') return true;
                    const matchSearch = !s || (item.role_title || '').toLowerCase().includes(s) || (item.role_id || '').toLowerCase().includes(s) || (item.client_name || '').toLowerCase().includes(s) || (item.required_skills || []).join(' ').toLowerCase().includes(s);
                    const matchLoc = modalLocationFilter === 'All' || (item.location || '').includes(modalLocationFilter);
                    return matchSearch && matchLoc;
                  }).map((item: any, i: number) => {
                    const meta = (() => { try { const jd = item.job_description || ''; if (jd.startsWith('META:')) { const end = jd.indexOf('\n\nJD:'); return JSON.parse(end > 0 ? jd.slice(5, end) : jd.slice(5)); } } catch {} return {}; })();
                    const jdText = (() => { const jd = item.job_description || ''; const idx = jd.indexOf('\n\nJD:\n'); return idx >= 0 ? jd.slice(idx + 6).trim() : (jd.startsWith('META:') ? '' : jd); })();
                    const typeColor = item.type === 'Reactive' ? COLORS.danger : COLORS.purple;
                    const pColor = item.fill_priority === 'P1' ? COLORS.danger : item.fill_priority === 'P2' ? COLORS.warning : COLORS.info;
                    return (
                      <div key={i} style={{ background: dark ? 'rgba(30,41,59,0.6)' : '#fff', borderRadius: 14, borderTop: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}`, borderLeft: `5px solid ${typeColor}`, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 42, height: 42, borderRadius: 10, background: `linear-gradient(135deg,${typeColor},${typeColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Briefcase size={18} color="#fff" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                              <span style={{ fontWeight: 900, fontSize: 14, color: T.text }}>{item.role_title}</span>
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}44` }}>{item.type}</span>
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}44` }}>{item.fill_priority || '—'}</span>
                            </div>
                            <div style={{ fontSize: 11, color: T.sub }}>
                              SRF: <strong style={{ color: T.text }}>{item.role_id}</strong>
                              {item.client_name && <> · <strong style={{ color: COLORS.info }}>{item.client_name}</strong></>}
                              {item.location && <> · 📍 {item.location}</>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', borderTop: `1px solid ${T.bdr}`, borderBottom: jdText ? `1px solid ${T.bdr}` : 'none' }}>
                          {[
                            { label: 'Skill',      value: (item.required_skills || [])[0] || '—' },
                            { label: 'Grade',      value: meta.grade || '—' },
                            { label: 'Openings',   value: String(meta.openings || '1') },
                            { label: 'Start Date', value: meta.startDate || '—' },
                            { label: 'SPOC',       value: item.assigned_spoc || '—' },
                            { label: 'Month',      value: meta.month || '—' },
                          ].map((f, fi) => (
                            <div key={f.label} style={{ padding: '8px 12px', borderRight: fi < 5 ? `1px solid ${T.bdr}` : 'none' }}>
                              <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{f.label}</div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                            </div>
                          ))}
                        </div>
                        {jdText && (
                          <div style={{ padding: '10px 20px' }}>
                            <button onClick={() => setJdModal({ title: item.role_title, jd: jdText })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: `${COLORS.info}15`, color: COLORS.info, border: `1px solid ${COLORS.info}44`, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                              <FileText size={12} /> View JD
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── SUPPLY (Pool / Deallocation) card layout ── */}
              {selectedMetric.tab !== 'match' && selectedMetric.tab !== 'demand' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedMetric.data.filter((item: any) => {
                    const s = modalSearch.toLowerCase();
                    const matchSearch = !s || (item.employee_name || '').toLowerCase().includes(s) || (item.employee_id || '').toLowerCase().includes(s);
                    const matchLoc = modalLocationFilter === 'All' || item.location === modalLocationFilter;
                    return matchSearch && matchLoc;
                  }).map((item: any, i: number) => {
                    const dDate = item.deallocation_date ? new Date(item.deallocation_date) : null;
                    const daysLeft = dDate ? Math.ceil((dDate.getTime() - Date.now()) / 86400000) : null;
                    const urgency = daysLeft !== null && daysLeft <= 7 ? COLORS.danger : daysLeft !== null && daysLeft <= 21 ? COLORS.warning : COLORS.info;
                    const isDealloc = item.status === 'Deallocating';
                    return (
                      <div key={i} style={{ padding: '18px 24px', background: dark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: 14, borderTop: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, borderBottom: `1px solid ${T.bdr}`, borderLeft: `5px solid ${isDealloc ? COLORS.warning : COLORS.info}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: isDealloc ? 'linear-gradient(135deg,#f59e0b,#f97316)' : 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
                            {(item.employee_name || '?')[0]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                              <span style={{ fontWeight: 900, fontSize: 14, color: T.text }}>{item.employee_name}</span>
                              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: isDealloc ? `${COLORS.warning}22` : `${COLORS.info}22`, color: isDealloc ? COLORS.warning : COLORS.info, border: `1px solid ${isDealloc ? COLORS.warning : COLORS.info}55`, textTransform: 'uppercase' }}>
                                {isDealloc ? 'Deallocating' : 'Pool'}
                              </span>
                              {item.primary_skill && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : '#e2e8f0', color: T.sub }}>{item.primary_skill}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: T.sub }}>ID: {formatZensarId(item.employee_id)} · {(item as any).band || (item as any).grade || '—'} · {item.location || '—'}</div>
                          </div>
                          {/* Days counter */}
                          <div style={{ textAlign: 'right', flexShrink: 0, background: dark ? 'rgba(0,0,0,0.25)' : '#fff', padding: '10px 16px', borderRadius: 12, border: `1px solid ${T.bdr}` }}>
                            {isDealloc && dDate ? (
                              <>
                                <div style={{ fontSize: 20, fontWeight: 800, color: urgency, lineHeight: 1 }}>{daysLeft !== null ? Math.abs(daysLeft) : 0}</div>
                                <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', marginTop: 1 }}>Days Left</div>
                                <div style={{ fontSize: 10, color: urgency, fontWeight: 800, marginTop: 4 }}>📅 {dDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize: 20, fontWeight: 800, color: (item.aging_days || 0) > 30 ? COLORS.danger : COLORS.success, lineHeight: 1 }}>{item.aging_days || 0}</div>
                                <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', marginTop: 1 }}>Ageing</div>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Details grid — different for Pool vs Deallocation */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, padding: '10px 14px', background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', borderRadius: 10 }}>
                          {(isDealloc ? [
                            { label: 'Project',    value: item.project_name || '—' },
                            { label: 'Customer',   value: item.customer || '—' },
                            { label: 'PM',         value: item.pm_name || '—' },
                            { label: 'Reason',     value: (item as any).release_reason || '—' },
                            { label: 'RMG Status', value: item.rmg_status || '—' },
                          ] : [
                            { label: 'RMG Status', value: item.rmg_status || '—' },
                            { label: 'Practice',   value: item.practice_name || '—' },
                            { label: 'Customer',   value: item.customer || '—' },
                            { label: 'PM',         value: item.pm_name || '—' },
                            { label: 'Deployable', value: (item as any).deployable_flag ? '✅ Yes' : '❌ No' },
                          ]).map(f => (
                            <div key={f.label}>
                              <div style={{ fontSize: 9, fontWeight: 900, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.value}>{f.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Skills */}
                        {(item.current_skills || []).filter((s: string) => s && s !== 'NOT_AVAILABLE').length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                            {(item.current_skills || []).filter((s: string) => s && s !== 'NOT_AVAILABLE').slice(0, 6).map((s: string, j: number) => (
                              <span key={j} style={{ padding: '4px 10px', background: dark ? '#1e293b' : '#fff', border: `1px solid ${T.bdr}`, borderRadius: 8, fontSize: 11, fontWeight: 700, color: T.sub }}>{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {weeklyReport && (
        <div style={{ position: 'fixed', inset: 0, background: dark ? '#020617' : '#f1f5f9', zIndex: 2000, overflowY: 'auto' }}>

          {/* Sticky header */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: dark ? '#0f172a' : '#fff', borderBottom: `1px solid ${T.bdr}`, padding: '14px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Landmark size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: T.text }}>ZenTalentHub — Demand vs Supply Report</div>
                <div style={{ fontSize: 11, color: T.sub }}>BFSI Testing Practice · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
            <button onClick={() => setWeeklyReport(null)} style={{ padding: '9px 20px', background: dark ? '#1e293b' : '#f1f5f9', border: `1px solid ${T.bdr}`, borderRadius: 10, color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
          </div>

          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px 60px' }}>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'Total Pool',   val: kpiData?.skillGaps?.reduce((s: number, sg: any) => s + (Number(sg.pool)||0), 0) ?? workforce.filter(w => w.status === 'Available-Pool').length,       color: COLORS.info,    icon: '👥' },
                { label: 'Deallocation', val: kpiData?.skillGaps?.reduce((s: number, sg: any) => s + (Number(sg.deallocation)||0), 0) ?? workforce.filter(w => w.status === 'Deallocating').length, color: COLORS.warning, icon: '⏳' },
                { label: 'Total Supply', val: kpiData?.skillGaps?.reduce((s: number, sg: any) => s + (Number(sg.pool)||0) + (Number(sg.deallocation)||0), 0) ?? 0,                                 color: COLORS.success, icon: '✅' },
                { label: 'Total Demand', val: kpiData?.skillGaps?.reduce((s: number, sg: any) => s + (Number(sg.reactive)||0) + (Number(sg.proactive)||0), 0) ?? roles.length,                    color: COLORS.danger,  icon: '📋' },
                { label: 'Total GAP',    val: kpiData?.skillGaps?.reduce((s: number, sg: any) => s + (Number(sg.gap)||0), 0) ?? 0,                                                                  color: COLORS.purple,  icon: '📊' },
              ].map(k => (
                <div key={k.label} style={{ background: dark ? '#1e293b' : '#fff', borderRadius: 14, padding: '16px 20px', border: `1px solid ${T.bdr}`, borderTop: `4px solid ${k.color}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: T.text, lineHeight: 1 }}>{k.val}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* MAIN TABLE — exactly like Excel Summary sheet */}
            <div style={{ background: dark ? '#1e293b' : '#fff', borderRadius: 16, border: `1px solid ${T.bdr}`, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '14px 24px', borderBottom: `1px solid ${T.bdr}`, background: dark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)' }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: T.text }}>Report 1 — DEMAND VS SUPPLY</div>
                <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>All skills · Status: All</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }}>
                      <th rowSpan={2} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 900, color: T.text, fontSize: 12, borderBottom: `2px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, minWidth: 220, verticalAlign: 'bottom' }}>Primary Skill</th>
                      <th colSpan={3} style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 900, color: COLORS.danger, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, background: `${COLORS.danger}08` }}>DEMAND</th>
                      <th colSpan={3} style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 900, color: COLORS.success, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, background: `${COLORS.success}08` }}>SUPPLY</th>
                      <th rowSpan={2} style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 900, color: T.text, fontSize: 12, borderBottom: `2px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, minWidth: 70, verticalAlign: 'bottom' }}>GAP</th>
                      <th colSpan={3} style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 900, color: COLORS.info, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${T.bdr}`, background: `${COLORS.info}08` }}>OFFERS RECEIVED</th>
                    </tr>
                    <tr style={{ background: dark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                      {[{l:'Reactive SRF',c:COLORS.danger},{l:'Backup SRF',c:COLORS.warning},{l:'Proactive',c:COLORS.purple}].map(h=>(
                        <th key={h.l} style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 800, color: h.c, fontSize: 11, borderBottom: `2px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, whiteSpace: 'nowrap', background: `${h.c}06` }}>{h.l}</th>
                      ))}
                      {[{l:'Pool',c:COLORS.info},{l:'Deallocation',c:COLORS.warning},{l:'Supply Total',c:COLORS.success}].map(h=>(
                        <th key={h.l} style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 800, color: h.c, fontSize: 11, borderBottom: `2px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, whiteSpace: 'nowrap', background: `${h.c}06` }}>{h.l}</th>
                      ))}
                      {[{l:'Reactive',c:COLORS.danger},{l:'Proactive',c:COLORS.purple},{l:'Total',c:COLORS.info}].map(h=>(
                        <th key={h.l} style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 800, color: h.c, fontSize: 11, borderBottom: `2px solid ${T.bdr}`, borderRight: `1px solid ${T.bdr}`, whiteSpace: 'nowrap', background: `${h.c}06` }}>{h.l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(kpiData?.skillGaps || []).map((sg: any, i: number) => {
                      const reactive = Number(sg.reactive||0), proactive = Number(sg.proactive||0);
                      const pool = Number(sg.pool||0), dealloc = Number(sg.deallocation||0);
                      const supplyTotal = pool + dealloc;
                      const gap = Number(sg.gap || (supplyTotal - reactive - proactive));
                      const offR = Number(sg.offers_reactive||0), offP = Number(sg.offers_proactive||0), offT = Number(sg.offers_total||(offR+offP));
                      const isGT = (sg.skill||'').toLowerCase().includes('grand');
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.bdr}`, background: isGT ? (dark?'rgba(59,130,246,0.12)':'rgba(59,130,246,0.06)') : i%2===0?'transparent':(dark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.01)'), fontWeight: isGT?900:400 }}>
                          <td style={{ padding: '12px 16px', fontWeight: isGT?900:700, color: T.text, borderRight: `1px solid ${T.bdr}` }}>{isGT ? '🔢 Grand Total' : sg.skill}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: reactive>0?COLORS.danger:T.sub, fontWeight: reactive>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{reactive||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: T.sub, borderRight: `1px solid ${T.bdr}` }}>—</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: proactive>0?COLORS.purple:T.sub, fontWeight: proactive>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{proactive||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: pool>0?COLORS.info:T.sub, fontWeight: pool>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{pool||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: dealloc>0?COLORS.warning:T.sub, fontWeight: dealloc>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{dealloc||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: supplyTotal>0?COLORS.success:T.sub, fontWeight: supplyTotal>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{supplyTotal||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', borderRight: `1px solid ${T.bdr}` }}>
                            <span style={{ display:'inline-block', minWidth:40, padding:'4px 10px', borderRadius:8, fontWeight:900, fontSize:13, background: gap<0?`${COLORS.danger}18`:gap>0?`${COLORS.success}18`:(dark?'rgba(255,255,255,0.06)':'#f1f5f9'), color: gap<0?COLORS.danger:gap>0?COLORS.success:T.sub, border:`1px solid ${gap<0?COLORS.danger:gap>0?COLORS.success:T.bdr}44` }}>
                              {gap>0?`+${gap}`:gap===0?'0':gap}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: offR>0?COLORS.danger:T.sub, fontWeight: offR>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{offR||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: offP>0?COLORS.purple:T.sub, fontWeight: offP>0?800:400, borderRight: `1px solid ${T.bdr}` }}>{offP||'—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: offT>0?COLORS.info:T.sub, fontWeight: offT>0?800:400 }}>{offT||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '12px 20px', background: dark?'#1e293b':'#fff', borderRadius: 12, border: `1px solid ${T.bdr}`, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.sub }}>Legend:</span>
              {[{c:COLORS.danger,l:'Reactive SRF = urgent open positions'},{c:COLORS.purple,l:'Proactive = pipeline positions'},{c:COLORS.info,l:'Pool = bench resources'},{c:COLORS.warning,l:'Deallocation = rolling off'},{c:COLORS.success,l:'GAP+ = surplus'},{c:COLORS.danger,l:'GAP- = shortage'}].map(l=>(
                <div key={l.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:l.c, flexShrink:0 }} />
                  <span style={{ fontSize:11, color:T.sub }}>{l.l}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:11, color:T.sub }}>ZenTalentHub · BFSI Testing Practice · Data from Excel upload</div>
              <button onClick={() => setWeeklyReport(null)} style={{ padding:'10px 28px', background:COLORS.info, color:'#fff', border:'none', borderRadius:10, fontWeight:800, fontSize:13, cursor:'pointer' }}>Close Report</button>
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .hover-card:hover { transform: translateY(-6px); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.2) !important; }
      `}</style>
    </div>
  );
}
