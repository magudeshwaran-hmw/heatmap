/**
 * AdminDashboard.tsx
 * Elite Terminal Aesthetic with Global Capability Analytics.
 * Features: Personnel Intelligence Audit, Reversible Encryption, and Live Session Sync.
 */
import { useMemo, useState, useEffect, useRef } from 'react';

import { SKILLS, MOCK_EMPLOYEES } from '@/lib/mockData';
import { useNavigate } from 'react-router-dom';
import {
  Users, TrendingUp, AlertTriangle, Award, Download, Edit2, Plus,
  BarChart3, CheckCircle2, Search, Eye, FileSpreadsheet, RefreshCw, Grid, X, Settings, Shield, Lock, Mail, Phone, Calendar, Briefcase, Filter, Upload, Sparkles, FileUp, Trash2, GraduationCap, Info
} from 'lucide-react';

import { toast } from '@/lib/ToastContext';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { computeCompletion, exportAllToExcel } from '@/lib/localDB';
import { apiGetAllEmployees, API_BASE } from '@/lib/api';
import { AppContext, useApp } from '@/lib/AppContext';
import { loadAppData, AppData } from '@/lib/appStore';
import EmployeeDashboard from './EmployeeDashboard';
import SkillMatrixPage from './SkillMatrixPage';
import CertificationsPage from './CertificationsPage';
import ProjectsPage from './ProjectsPage';
import EducationPage from './EducationPage';
import AchievementsPage from './AchievementsPage';
import AIIntelligencePage from './AIIntelligencePage';
import AdminResumeUploadPage from './AdminResumeUploadPage';
import ResumeBuilderPage from './ResumeBuilderPage';
import { callResumeLLM } from '@/lib/llm';

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  BarController, LineController, DoughnutController, Tooltip, Legend, Title
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  BarController, LineController, DoughnutController, Tooltip, Legend, Title
);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { setGlobalLoading } = useApp();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [activeTab, setActiveTab] = useState<'Overview' | 'Manage Employees' | 'Skill Heatmap' | 'Certifications' | 'Achievements' | 'Education' | 'Projects'>('Overview');
  const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Newest' | 'Oldest'>('A-Z');
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '', email: '', designation: '', employeeId: '',
    location: '', phone: '', department: '',
    yearsIT: '', yearsZensar: '', password: '', confirmPassword: ''
  });
  const [resumeScanLoading, setResumeScanLoading] = useState(false);
  const [resumeScanned, setResumeScanned] = useState(false);
  const [emailWarningConfirmed, setEmailWarningConfirmed] = useState(false);
  const [showEmployeeDetails, setShowEmployeeDetails] = useState(false);
  const [showResumeUploadPage, setShowResumeUploadPage] = useState(false);
  const [createdEmployeeId, setCreatedEmployeeId] = useState<string>('');
  const [extractedDetails, setExtractedDetails] = useState({
    skills: [] as { name: string; rating: number }[],
    projects: [] as { name: string; description: string; technologies: string[]; duration: string }[],
    certificates: [] as { name: string; issuer: string; date: string }[],
    education: [] as { degree: string; institution: string; year: string }[]
  });
  const [rawExtractedData, setRawExtractedData] = useState<any>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  // ── Extract text from PDF (with proper visual line detection) ──
  const extractPDFText = async (file: File): Promise<string> => {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          // Group text items by Y-position to reconstruct visual lines
          let lastY: number | null = null;
          let line = '';
          for (const item of content.items as any[]) {
            const y = item.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > 3) {
              // Y position changed → new visual line
              if (line.trim()) fullText += line.trim() + '\n';
              line = '';
            }
            line += (item.str || '') + ' ';
            lastY = y;
          }
          if (line.trim()) fullText += line.trim() + '\n';
          fullText += '\n'; // page separator
        }
        return fullText;
      }
      // Non-PDF files (txt, doc)
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        return '';
      }
      return await file.text();
    } catch (e) {
      console.error('[PDF Extract]', e);
      return '';
    }
  };


  // ── Scan resume and auto-fill form ──
  const handleResumeScan = async (file: File) => {
    setResumeScanLoading(true);
    setResumeScanned(false);
    try {
      // Step 1: Extract text
      const text = await extractPDFText(file);
      const resumeText = text.trim();
      if (!resumeText || resumeText.startsWith('%PDF') || resumeText.includes('\x00')) {
        toast.error('PDF reader not ready. Please refresh the page and try again.');
        setResumeScanLoading(false);
        return;
      }
      console.log('[Resume Scan] Text length:', resumeText.length, '| First 120:', resumeText.slice(0, 120));

      // ── Regex helpers (always reliable) ──
      const rGet = (re: RegExp) => (resumeText.match(re)?.[1] ?? resumeText.match(re)?.[0] ?? '').trim();

      // Extract email & phone via regex (very reliable)
      const rxEmail = rGet(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
      const rxPhone = rGet(/(\+?[\d][\d\s\-(). ]{7,15}[\d])/);

      // Extract name: labeled field first, then heuristic scan
      const rxName = (() => {
        // First try labeled: "Name: Kishore S" or "Candidate Name: ..."
        const labeled = rGet(/(?:^|\n)(?:candidate\s*)?name\s*[:\-–]\s*([A-Za-z][A-Za-z .'-]+)/im);
        if (labeled && labeled.length > 2) return labeled.trim();
        // Scan first 20 lines for a name-like line (allow single-char initials)
        const lines = resumeText.split('\n').slice(0, 20).map(l => l.trim()).filter(l => l.length > 1 && l.length < 55);
        for (const l of lines) {
          if (/[@\d|\\/#<>{}\[\]]/.test(l)) continue;
          if (/^(resume|cv|curriculum|vitae|profile|summary|contact|email|phone|mobile|address|www|http|dear|to|from|date|ref)/i.test(l)) continue;
          // Title Case: "Kishore S" or "Rahul Kumar Sharma" — allow 1-char words (initials)
          if (/^[A-Z][a-zA-Z'-]*(?:\s[A-Z][a-zA-Z'-]*){1,3}$/.test(l)) return l;
          // ALL CAPS: "KISHORE S" or "RAHUL KUMAR"
          if (/^[A-Z]+(?:\s[A-Z]+){1,3}$/.test(l) && !/^(QA|IT|UI|UX|HR|DB|AI|ML|DL|CI|CD)$/.test(l)) {
            return l.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          }
          // all lowercase: "kishore s"
          if (/^[a-z][a-z'-]*(?:\s[a-z][a-z'-]*){1,3}$/.test(l) && l.split(' ').length >= 2) {
            return l.replace(/\b\w/g, c => c.toUpperCase());
          }
        }
        // Last fallback: first 2-word short line with no special chars
        return lines.find(l => !/@|\d/.test(l) && l.split(' ').length === 2 && l.length < 35) || '';
      })();

      // Designation - check for labeled field or second prominent line
      const rxDesig = rGet(/(?:designation|title|position|current\s*role|profile|objective)\s*[:\-–]\s*([A-Za-z][A-Za-z .\/]+)/im)
        || rGet(/^(?:software|senior|junior|lead|associate|principal|staff|qa|quality|devops|full.?stack|front.?end|back.?end|data|mobile|android|ios|test)\s+\w+/im);

      // Location — labeled field or Indian city names
      const rxLocation = (
        rGet(/(?:location|city|address|residing|place|based(?:\s*(?:at|in|out))?|current\s*loc(?:ation)?|living\s*in)\s*[:\-–]\s*([A-Za-z][A-Za-z ,]+?)(?:\n|,\s*\d|\s{3,}|$)/im)
        || (() => {
          // Scan for Indian city names directly
          const cities = 'Chennai|Pune|Bangalore|Bengaluru|Hyderabad|Mumbai|Delhi|Noida|Gurgaon|Gurugram|Kolkata|Ahmedabad|Surat|Jaipur|Coimbatore|Madurai|Kochi|Trivandrum|Nagpur|Indore|Bhopal|Chandigarh|Lucknow|Patna|Mysore|Mysuru|Vizag|Visakhapatnam|Vadodara|Rajkot|Thane|Navi Mumbai|Greater Noida|Faridabad|Ghaziabad';
          const m = resumeText.match(new RegExp(`((?:[A-Za-z]+[,\\s]+)?(?:${cities})(?:[,\\s]+[A-Za-z]+)?)`, 'i'));
          return m?.[1]?.trim() || '';
        })()
      );

      // Department  
      const rxDept = rGet(/(?:department|division|team|vertical|practice|domain)\s*[:\-–]\s*([A-Za-z][A-Za-z ]+?)(?:\n|$)/im);

      // Years IT - comprehensive patterns
      const rxYearsIT = (() => {
        const pats = [
          /(\d+)(?:\.\d+)?\s*\+?\s*(?:years?|yrs?).*?(?:IT|software|technolog|develop|testing|engineer|industry|work)/i,
          /(?:experience|exp(?:erience)?)\s*(?:of\s*)?[:\-–]?\s*(\d+)(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)/i,
          /(\d+)(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:total\s+)?(?:professional\s+)?experience/i,
          /total\s+(?:work\s+)?(?:exp|experience)[:\s]*(\d+)/i,
          /(?:having|with)\s+(\d+)(?:\.\d+)?\s*\+?\s*(?:year|yr)/i,
          /(\d+)\s*\+?\s*(?:year|yr)s?\s+(?:as|in)\s+(?:a\s+)?(?:QA|developer|engineer|analyst)/i,
        ];
        for (const p of pats) { const m = resumeText.match(p); if (m) return parseInt(m[1]) || 0; }
        return 0;
      })();

      // Step 2: Try High-Fidelity LLM Extraction
      let llm: any = {};
      try {
        const prompt = `Extract employee info from this resume. Return ONLY a JSON object, no markdown, no explanation.
Format: {"name":"","email":"","phone":"","designation":"","location":"","department":"","yearsIT":0,"yearsZensar":0}
Resume: ${resumeText.slice(0, 3000)}
JSON:`;

        const result = await callResumeLLM(prompt);
        if (result.data) {
          llm = result.data;
          console.log('[Resume Scan] High-Fidelity LLM Success:', llm);
        }
      } catch (e) { console.warn('[Resume Scan] LLM failed:', e); }

      // Step 2b: Extract Skills, Projects, Certificates, Education, Achievements (COMPREHENSIVE)
      let detailsExtraction: any = {};
      try {
        const detailsPrompt = `🚨 CRITICAL EXTRACTION TASK - READ CAREFULLY 🚨

You are extracting data from a PROFESSIONAL RESUME. Extract ALL skills, projects, achievements, certifications, and education.

STEP 1: EXTRACT SKILLS FROM PREDEFINED LIST ONLY (CRITICAL)
⚠️ ONLY extract skills that EXACTLY MATCH these 32 predefined skills:

TOOLS: Selenium, Appium, JMeter, Postman, JIRA, TestRail
TECHNOLOGIES: Python, Java, JavaScript, TypeScript, C#, SQL
APPLICATIONS: API Testing, Mobile Testing, Performance Testing, Security Testing, Database Testing
DOMAINS: Banking, Healthcare, E-Commerce, Insurance, Telecom
TESTING TYPES: Functional Testing, Automation Testing, Regression Testing, UAT
DEVOPS: Git, Jenkins, Docker, Azure DevOps
AI: ChatGPT/Prompt Engineering, AI Test Automation

EXTRACTION RULES:
- Look in "Core competencies/skills", "Tools", "Databases", "Domains", "Expertise" sections
- ONLY extract skills that EXACTLY match the 32 names above (case-sensitive)
- DO NOT extract: AWS, GCP, Oracle, DB2, Postgres, Test Management, Scrum Master, HP ALM, ACCELQ, or any other skills not in the list
- Rate each skill 1-5 based on prominence (Primary skills = 4-5, Secondary = 2-3, Mentioned = 1-2)
- Extract AT LEAST 5-10 matching skills from the resume

CRITICAL: If you extract less than 5 skills, YOU HAVE FAILED.

STEP 2: EXTRACT ALL PROJECTS
- Look for "PROFESSIONAL EXPERIENCE" section
- Each line starting with "Project -" is a SEPARATE project
- Extract: name, client, role, startDate, endDate, description, technologies, duration

STEP 3: EXTRACT ALL ACHIEVEMENTS
⚠️ STRICT RULE - Only extract REAL awards/recognitions. DO NOT extract project metrics or outcomes.

✅ VALID achievements (extract these):
- Named awards: Pegasus, Gold Award, Silver Award, Bronze Medal, Best Team Award, Star Award
- External recognitions: Kaggle medals, hackathon wins, competition rankings
- Client appreciation: "Appreciated by client for quality and timely delivery"

❌ INVALID - DO NOT extract these as achievements:
- Project metrics: "Reduced false positive rate by 20%", "Improved accuracy to 82%"
- Project outcomes: "Data Quality Improvement", "Page Load Speed Improvement"
- Technical improvements: "Reduced manual review time", "Experiment time reduction"
- Anything that is a project result/KPI/metric

WHERE TO LOOK:
- "Awards" section: extract named awards (Pegasus, Gold, Silver, etc.)
- "Major achievements" in each project: ONLY if it is a NAMED AWARD, not a metric
- "Any client appreciation" in each project: extract client appreciation text

IF NO AWARDS EXIST IN THE RESUME → return empty achievements array []

STEP 4: EXTRACT ALL CERTIFICATIONS
- Look in "Certifications" section
- Extract each bullet point as separate certification

STEP 5: EXTRACT EDUCATION
- Look in "Education" section

RESUME TEXT (${resumeText.length} characters):
${resumeText.slice(0, 50000)}

OUTPUT FORMAT (STRICT JSON):
{
  "skills": [
    {"name": "JIRA", "rating": 4},
    {"name": "Azure DevOps", "rating": 4},
    {"name": "GCP", "rating": 3},
    {"name": "AWS", "rating": 3},
    {"name": "HP ALM", "rating": 3},
    {"name": "Test Management", "rating": 5},
    {"name": "Scrum Master", "rating": 5},
    {"name": "Project Management", "rating": 4},
    {"name": "Banking", "rating": 4},
    {"name": "Insurance", "rating": 3},
    {"name": "Healthcare", "rating": 2},
    {"name": "Oracle", "rating": 3},
    {"name": "DB2", "rating": 3},
    {"name": "Postgres SQL", "rating": 3}
  ],
  "projects": [
    {
      "name": "Tesco Bank - IT Infrastructure Testing",
      "client": "Tesco Bank",
      "role": "Test Manager",
      "description": "IT Infrastructure testing for banking systems...",
      "duration": "Sep 2025 to Feb 2026",
      "technologies": ["AWS", "Azure", "Google Cloud"]
    }
  ],
  "certifications": [
    {"name": "Google Cloud Digital Leader", "issuer": "Google", "date": ""}
  ],
  "education": [
    {"degree": "B. Tech in Information Technology", "institution": "", "year": "2003-2007"}
  ],
  "achievements": [
    {"title": "Pegasus Award", "type": "Pegasus", "description": "", "project": ""}
  ]
}

CRITICAL REQUIREMENTS:
- Extract ONLY skills from the 32 predefined skills list (JIRA, Python, Banking, etc.)
- Extract AT LEAST 5-10 matching skills from the predefined list
- Extract AT LEAST 5 projects if resume has work experience
- Extract ALL certifications and achievements
- Rate skills 1-5: Primary skills = 4-5, Secondary skills = 2-3, Mentioned = 1-2
- YOU FAIL if you extract less than 5 skills OR if you extract skills not in the predefined list

Return ONLY valid JSON. NO markdown. NO explanations.`;

        const detailsResult = await callResumeLLM(detailsPrompt);
        if (detailsResult.data) {
          detailsExtraction = detailsResult.data;
          console.log('[Resume Scan] Comprehensive Details Extraction Success:', detailsExtraction);
        }
      } catch (e) { console.warn('[Resume Scan] Details extraction failed:', e); }

      // Step 3: Merge — LLM fills where regex couldn't, regex wins for email/phone
      const final = {
        name:        (llm.name?.trim()        || rxName        || ''),
        email:       (rxEmail                 || llm.email?.trim()        || ''),
        phone:       (rxPhone                 || llm.phone?.trim()        || ''),
        designation: (llm.designation?.trim() || rxDesig       || ''),
        location:    (llm.location?.trim()    || rxLocation    || ''),
        department:  (llm.department?.trim()  || rxDept        || ''),
        yearsIT:     (parseInt(llm.yearsIT || '0') || rxYearsIT || 0),
        yearsZensar: parseInt(llm.yearsZensar || '0') || 0,
      };
      console.log('[Resume Scan] Final:', final);

      // Step 4: Apply basic info
      const filled: string[] = [];
      const updates: Record<string, string> = {};
      if (final.name)        { updates.name        = final.name.slice(0, 60);         filled.push('Name'); }
      if (final.email)       { updates.email       = final.email;                     filled.push('Email'); }
      if (final.phone)       { updates.phone       = final.phone.replace(/\s+/g, ' ');filled.push('Phone'); }
      if (final.designation) { updates.designation = final.designation.slice(0, 60);  filled.push('Designation'); }
      if (final.location)    { updates.location    = final.location.slice(0, 50);     filled.push('Location'); }
      if (final.department)  { updates.department  = final.department.slice(0, 50);   filled.push('Department'); }
      if (final.yearsIT)     { updates.yearsIT     = String(final.yearsIT);           filled.push('Years IT'); }
      if (final.yearsZensar) { updates.yearsZensar = String(final.yearsZensar); }

      // Apply extracted details - FILTER TO ONLY PREDEFINED 32 SKILLS
      const PREDEFINED_SKILLS = [
        'Selenium', 'Appium', 'JMeter', 'Postman', 'JIRA', 'TestRail',
        'Python', 'Java', 'JavaScript', 'TypeScript', 'C#', 'SQL',
        'API Testing', 'Mobile Testing', 'Performance Testing', 'Security Testing', 'Database Testing',
        'Banking', 'Healthcare', 'E-Commerce', 'Insurance', 'Telecom',
        'Functional Testing', 'Automation Testing', 'Regression Testing', 'UAT',
        'Git', 'Jenkins', 'Docker', 'Azure DevOps',
        'ChatGPT/Prompt Engineering', 'AI Test Automation'
      ];
      
      const extractedSkills = Array.isArray(detailsExtraction.skills) 
        ? detailsExtraction.skills
            .map((s: any) => {
              if (typeof s === 'string') return { name: s, rating: 3 };
              if (typeof s === 'object' && s !== null) return { name: s.name || s.skill || '', rating: s.rating || s.level || 3 };
              return { name: String(s), rating: 3 };
            })
            .filter((s: any) => PREDEFINED_SKILLS.includes(s.name)) // ONLY KEEP PREDEFINED SKILLS
        : [];
      const extractedProjects = Array.isArray(detailsExtraction.projects) ? detailsExtraction.projects.map((p: any) => ({ name: p.name || '', description: p.description || '', technologies: p.technologies || [], duration: p.duration || '' })) : [];
      // Handle both 'certifications' and 'certificates' field names from LLM
      const certsList = detailsExtraction.certifications || detailsExtraction.certificates || [];
      const extractedCertificates = Array.isArray(certsList) ? certsList.map((c: any) => ({ name: c.name || '', issuer: c.issuer || '', date: c.date || '' })) : [];
      const extractedEducation = Array.isArray(detailsExtraction.education) ? detailsExtraction.education.map((e: any) => ({ degree: e.degree || '', institution: e.institution || '', year: e.year || '' })) : [];

      setExtractedDetails({
        skills: extractedSkills,
        projects: extractedProjects,
        certificates: extractedCertificates,
        education: extractedEducation
      });

      // Save raw extracted data for comparison page (COMPREHENSIVE FORMAT)
      // Determine primary and secondary skills from extracted skills (highest rated)
      const sortedSkills = [...extractedSkills].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      const primarySkill = sortedSkills[0]?.name || '';
      const secondarySkill = sortedSkills[1]?.name || '';
      
      setRawExtractedData({
        skills: detailsExtraction.skills || [],
        projects: detailsExtraction.projects || [],
        certifications: detailsExtraction.certifications || detailsExtraction.certificates || [],
        education: detailsExtraction.education || [],
        achievements: detailsExtraction.achievements || [],
        profile: {
          name: final.name,
          email: final.email,
          phone: final.phone,
          designation: final.designation,
          location: final.location,
          yearsIT: final.yearsIT,
          yearsZensar: final.yearsZensar,
          primarySkill: primarySkill,
          secondarySkill: secondarySkill
        }
      });

      if (filled.length > 0 || extractedSkills.length > 0 || extractedProjects.length > 0) {
        setNewEmployee(prev => ({ ...prev, ...updates }));
        setResumeScanned(true);
        const allFilled = [...filled];
        if (extractedSkills.length > 0) allFilled.push(`${extractedSkills.length} Skills`);
        if (extractedProjects.length > 0) allFilled.push(`${extractedProjects.length} Projects`);
        if (extractedCertificates.length > 0) allFilled.push(`${extractedCertificates.length} Certificates`);
        if (extractedEducation.length > 0) allFilled.push(`${extractedEducation.length} Education`);
        const achievementsCount = Array.isArray(detailsExtraction.achievements) ? detailsExtraction.achievements.length : 0;
        if (achievementsCount > 0) allFilled.push(`${achievementsCount} Achievements`);
        toast.success(`✅ Auto-filled: ${allFilled.join(' · ')}`);
      } else {
        toast.error('Could not extract details. Please fill the form manually.');
      }
    } catch (e) {
      console.error('[Resume Scan Error]', e);
      toast.error('Scan failed. Please fill the form manually.');
    } finally {
      setResumeScanLoading(false);
    }
  };


  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Advanced Filters
  const [filters, setFilters] = useState({
    role: '',
    minExperience: '',
    maxExperience: '',
    minProjects: '',
    minCertifications: '',
    skillLevel: '', // 'Beginner', 'Intermediate', 'Expert', 'All'
    completionRange: '', // '0-25', '25-50', '50-75', '75-100', 'All'
    hasProjects: false,
    hasCertifications: false,
    isValidated: false,
    selectedSkills: [] as string[], // Array of skill IDs
  });
  const [showFilters, setShowFilters] = useState(false);

  // AI Search state for Manage Employees
  const [aiSearch, setAiSearch] = useState('');
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<any[]>([]);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);

  // AI Search state for Certifications / Achievements / Education / Projects tabs
  const [certSearch, setCertSearch] = useState('');
  const [achSearch, setAchSearch] = useState('');
  const [eduSearch, setEduSearch] = useState('');
  const [projSearch, setProjSearch] = useState('');
  // Expanded cards state (empId → boolean)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const runAiSearch = (query: string, empList: any[]) => {
    if (!query.trim()) { setAiSearchActive(false); setAiSearchResults([]); return; }
    setAiSearchLoading(true);
    setAiSearchActive(true);
    const q = query.trim().toLowerCase();
    const qWords = q.split(/\s+/).filter(w => w.length > 1);
    const matches = (text: string) => {
      const t = (text || '').toLowerCase();
      return t.includes(q) || qWords.some(w => t.includes(w));
    };
    const scored = empList.map(e => {
      let score = 0;
      if (matches(e.name)) score += 30;
      if (matches(e.zensar_id || e.id)) score += 25;
      if (matches(e.designation)) score += 20;
      if (matches(e.department)) score += 15;
      if (matches(e.location)) score += 15;
      if (matches(e.email)) score += 10;
      (e.skills || []).forEach((s: any) => { if (s.selfRating > 0 && matches(s.skillName)) score += 18; });
      (e.certifications || []).forEach((c: any) => { if (matches(c.cert_name || c.name || '')) score += 22; });
      (e.projects || []).forEach((p: any) => { if (matches(p.project_name || p.name || '') || matches(p.client || '')) score += 16; });
      return { ...e, _aiScore: score };
    }).filter(e => e._aiScore > 0).sort((a, b) => b._aiScore - a._aiScore);
    setAiSearchResults(scored);
    setAiSearchLoading(false);
  };

  // Popup Preview State
  const [previewUser, setPreviewUser] = useState<any | null>(null);
  const [previewData, setPreviewData] = useState<AppData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [popupActiveTab, setPopupActiveTab] = useState<'ZenRadar' | 'ZenScan' | 'ZenMatrix' | 'My Education' | 'My Projects' | 'My Certification' | 'My Achievements' | 'ZenProfile'>('ZenRadar');
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── DELETE employee ──
  const handleDeleteEmployee = async (empId: string, empName: string) => {
    setGlobalLoading(`Purging ${empName} from records...`);
    try {
      const res = await fetch(`${API_BASE}/employees/${empId}`, { method: 'DELETE' });
      const d = await res.json();
      if (res.ok && d.success) {
        toast.success(`🗑️ Account for "${empName}" permanently removed.`);
        setPreviewUser(null);
        setPreviewData(null);
        setDeleteConfirming(false);
        loadAllData();
      } else {
        toast.error(d.error || 'Failed to remove employee');
      }
    } catch (e) {
      toast.error('Network failure during sync purge');
    } finally {
      setGlobalLoading(null);
    }
  };

  // Edit State for Personal Details
  const [editForm, setEditForm] = useState({
    name: '',
    zensar_id: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
    location: '',
    years_it: 0,
    years_zensar: 0,
    password: '',
    primary_skill: '',
    primary_domain: ''
  });

  const handleOpenPreview = async (emp: any, targetTab?: typeof popupActiveTab) => {
    setIsPreviewLoading(true);
    setGlobalLoading('Accessing Employee Portfolio...');
    setPreviewUser(emp);
    setPopupActiveTab(targetTab || 'ZenRadar');
    setEditForm({
      name: emp.name || emp.Name || '',
      zensar_id: emp.zensar_id || emp.ZensarID || emp.id || '',
      email: emp.email || emp.Email || '',
      phone: emp.phone || emp.Phone || '',
      designation: emp.designation || emp.Designation || '',
      department: emp.department || emp.Department || '',
      location: emp.location || emp.Location || '',
      years_it: emp.years_it || emp.YearsIT || 0,
      years_zensar: emp.years_zensar || emp.YearsZensar || 0,
      password: emp.password || '',
      primary_skill: emp.primary_skill || emp.PrimarySkill || '',
      primary_domain: emp.primary_domain || emp.PrimaryDomain || ''
    });

    try {
      const data = await loadAppData(emp.id);
      setPreviewData(data);
    } catch (err) {
      toast.error('Failed to load employee preview');
    } finally {
      setGlobalLoading(null);
      setIsPreviewLoading(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setGlobalLoading('Synchronizing Global Cloud...');
    try {
      // ── Employees + Skills (essential) ──
      const res = await fetch(`${API_BASE}/employees`);
      const d = await res.json();
      const _emps = d.employees || [];
      const _skills = d.skills || [];

      // ── Certifications (non-blocking) ──
      let certifications: any[] = [];
      try {
        const cRes = await fetch(`${API_BASE}/certifications/ALL`);
        if (cRes.ok) ({ certifications } = await cRes.json());
      } catch { /* ignore — show employees without cert data */ }

      // ── Projects (non-blocking) ──
      let projects: any[] = [];
      try {
        const pRes = await fetch(`${API_BASE}/projects/ALL`);
        if (pRes.ok) ({ projects } = await pRes.json());
      } catch { /* ignore — show employees without project data */ }

      // ── Achievements (non-blocking) ──
      let achievements: any[] = [];
      try {
        const aRes = await fetch(`${API_BASE}/achievements/ALL`);
        if (aRes.ok) { const aData = await aRes.json(); achievements = aData.achievements || aData || []; }
      } catch { /* ignore */ }

      // ── Education (non-blocking) ──
      let education: any[] = [];
      try {
        const eRes = await fetch(`${API_BASE}/education/ALL`);
        if (eRes.ok) { const eData = await eRes.json(); education = eData.education || eData || []; }
      } catch { /* ignore */ }

      const formatted = _emps.map((e: any) => {
        const eid = String(e.id || '').toLowerCase();
        const zid = String(e.zensar_id || '').toLowerCase();
        const primaryId = e.zensar_id || e.id;

        const eSkillsRaw = _skills.filter((s: any) => {
          const sid = String(s.employee_id || s.employeeId || '').toLowerCase();
          return sid === eid || (zid && sid === zid);
        });

        // Map predefined skills
        const predefinedRatings = SKILLS.map(sk => {
          const raw = eSkillsRaw.find((s: any) =>
            String(s.skill_name || '').toLowerCase() === sk.name.toLowerCase()
          );
          return {
            skillId: sk.id,
            skillName: sk.name,
            selfRating: (raw?.self_rating || 0) as any,
            managerRating: raw?.manager_rating || null,
            validated: raw?.validated || false,
            isCustom: false
          };
        });

        // Find custom skills (not in predefined list) with ratings > 0
        const predefinedSkillNames = new Set(SKILLS.map(sk => sk.name.toLowerCase()));
        const customSkills = eSkillsRaw
          .filter((s: any) => {
            const skillName = String(s.skill_name || '').toLowerCase();
            return !predefinedSkillNames.has(skillName) && (s.self_rating > 0 || s.manager_rating > 0);
          })
          .map((s: any, idx: number) => ({
            skillId: `custom_${idx}_${String(s.skill_name).replace(/\s+/g, '_')}`,
            skillName: s.skill_name,
            selfRating: s.self_rating || 0,
            managerRating: s.manager_rating || null,
            validated: s.validated || false,
            isCustom: true
          }));

        const ratingsArray = [...predefinedRatings, ...customSkills];

        const eCerts = certifications.filter((c: any) => {
          const cid = String(c.EmployeeID || c.employee_id || '').toLowerCase();
          return cid === eid || (zid && cid === zid);
        });

        const eProjs = projects.filter((p: any) => {
          const pid = String(p.EmployeeID || p.employee_id || '').toLowerCase();
          return pid === eid || (zid && pid === zid);
        });

        const eAchs = achievements.filter((a: any) => {
          const aid = String(a.EmployeeID || a.employee_id || '').toLowerCase();
          return aid === eid || (zid && aid === zid);
        });

        const eEdu = education.filter((ed: any) => {
          const edid = String(ed.EmployeeID || ed.employee_id || '').toLowerCase();
          return edid === eid || (zid && edid === zid);
        });

        return {
          ...e,
          id: primaryId,
          name: e.name || e.Name || 'Unknown',
          skills: ratingsArray,
          certifications: eCerts,
          projects: eProjs,
          achievements: eAchs,
          education: eEdu,
          completion: computeCompletion(ratingsArray),
          submitted: e.submitted || e.Submitted === 'Yes'
        };
      });

      setEmployees(formatted);
    } catch (err: any) {
      console.error('loadAllData error:', err);
      toast.error('Failed to load employee data. Check server connection.');
    } finally {
      setGlobalLoading(null);
      setLoading(false);
    }
  };

  useEffect(() => { loadAllData(); }, []);

  const handleUpdateDetails = async () => {
    setGlobalLoading('Updating Personnel Records...');
    
    try {
      const resp = await fetch(`${API_BASE}/admin/employees/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: previewUser.id,
          ...editForm
        })
      });
      const res = await resp.json();
      if (res.success) {
        toast.success('Personnel record updated and encrypted.');
        await loadAllData();
        // Update local preview state
        setPreviewUser({ ...previewUser, ...editForm });
      } else {
        toast.error(res.error || 'Update failed');
      }
    } catch (e) {
      toast.error('Network failure during sync');
    } finally {
      setGlobalLoading(null);
    }
  };

  const handleAddEmployee = async (openDetails = false, skipEmailCheck = false) => {
    // Validation
    if (!newEmployee.employeeId || !newEmployee.name || !newEmployee.email || !newEmployee.password) {
      toast.error('Zensar ID, Full Name, Email and Password are required');
      return;
    }
    if (!/^\d{6}$/.test(newEmployee.employeeId.trim())) {
      toast.error('Zensar ID must be exactly 6 digits');
      return;
    }
    // Check password match
    if (newEmployee.password !== newEmployee.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    // If email is not @zensar.com and warning not yet confirmed, show warning
    if (!newEmployee.email.includes('@zensar.com') && !skipEmailCheck && !emailWarningConfirmed) {
      setEmailWarningConfirmed(true);
      return;
    }
    // Create employee account with extracted resume data
    // Determine primary skill and domain from extracted skills
    const sortedSkills = [...extractedDetails.skills].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const primarySkill = sortedSkills[0]?.name || '';
    const domainSkills = ['Banking', 'Insurance', 'Healthcare', 'E-Commerce', 'Telecom', 'Retail', 'Energy & Utilities'];
    const primaryDomain = extractedDetails.skills.find(s => domainSkills.includes(s.name))?.name || '';
    
    const payload = {
      name: newEmployee.name,
      email: newEmployee.email,
      employeeId: newEmployee.employeeId,
      phone: newEmployee.phone,
      designation: newEmployee.designation,
      department: newEmployee.department,
      location: newEmployee.location,
      yearsIT: parseFloat(newEmployee.yearsIT) || 0,
      yearsZensar: parseFloat(newEmployee.yearsZensar) || 0,
      password: newEmployee.password,
      primarySkill: primarySkill,
      primaryDomain: primaryDomain,
      // Include extracted resume data
      skills: extractedDetails.skills,
      projects: extractedDetails.projects,
      certificates: extractedDetails.certificates,
      education: extractedDetails.education
    };
    
    const res = await fetch(`${API_BASE}/admin/create-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorMsg = err.error || err.message || 'Failed to create employee';
      console.error('[Admin Create Employee] Error:', errorMsg);
      toast.error(errorMsg);
      setEmailWarningConfirmed(false);
      return;
    }
    
    const result = await res.json();
    const savedCounts = {
      skills: payload.skills?.length || 0,
      projects: payload.projects?.length || 0,
      certificates: payload.certificates?.length || 0,
      education: payload.education?.length || 0
    };
    
    toast.success(`✅ "${newEmployee.name}" created — ${savedCounts.skills} skills, ${savedCounts.projects} projects, ${savedCounts.certificates} certs!`);

    if (openDetails && rawExtractedData) {
      // Employee now exists in DB — open comparison page with correct ID
      setCreatedEmployeeId(newEmployee.employeeId);
      setShowAddEmployeeModal(false);
      setEmailWarningConfirmed(false);
      setShowResumeUploadPage(true);
    } else {
      setShowAddEmployeeModal(false);
      setResumeScanned(false);
      setEmailWarningConfirmed(false);
      setShowEmployeeDetails(false);
      setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' });
      setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] });
      setRawExtractedData(null);
      setActiveTab('Manage Employees');
      loadAllData();
    }
  };
  const stats = {
    teamSize: employees.length,
    submitted: employees.filter(e => e.submitted).length,
    avgComp: employees.length ? Math.round(employees.reduce((acc, e) => acc + e.completion, 0) / employees.length) : 0,
    beginnerCount: employees.reduce((acc, e) => acc + e.skills.filter((s:any)=>s.selfRating===1).length, 0)
  };

  const StatCard = ({ label, value, sub, icon: Icon, color }: any) => (
    <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 16, flex: 1, minWidth: 160 }}>
       <div style={{ padding: 8, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: color, width: 'fit-content', marginBottom: 12 }}>
          <Icon size={16} />
       </div>
       <div style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 2, letterSpacing: -0.5 }}>{value}</div>
       <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{label}</div>
       <div style={{ fontSize: 11, color: T.sub }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '24px 7vw 40px', fontFamily: "'Inter', sans-serif" }}>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        
        {/* Title & Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 30 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>ZenRadar</h1>
            <p style={{ margin: '4px 0 0', color: T.sub, fontSize: 14, fontWeight: 500 }}>Strategic visibility into team capabilities, performance metrics, and skill distribution for informed decision-making.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <button onClick={loadAllData} style={{ padding: '10px 22px', borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
               <RefreshCw size={16} className={loading?'animate-spin':''} /> Sync
            </button>
            <button onClick={() => exportAllToExcel(employees)} style={{ padding: '10px 28px', borderRadius: 12, background: '#22c55e', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
               <Download size={18} /> Export
            </button>
          </div>
        </div>

        {/* Hero Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard label="Team Size" value={stats.teamSize} sub="Total employees" icon={Users} color="#3B82F6" />
          <StatCard label="Submitted" value={stats.submitted} sub={`${stats.submitted}/${stats.teamSize} total`} icon={CheckCircle2} color="#10B981" />
          <StatCard label="Avg Readiness" value={`${stats.avgComp}%`} sub="Team benchmark" icon={TrendingUp} color="#8B5CF6" />
          <StatCard label="Skill Gaps" value={stats.beginnerCount} sub="Development needs" icon={AlertTriangle} color="#F59E0B" />
        </div>

        {/* Main Viewport */}
        <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: '24px 7vw', maxWidth: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 12, width: 'fit-content', maxWidth: '100%', marginBottom: 24, border: `1px solid ${T.bdr}` }}>
            {[
              { id: 'Overview',          icon: BarChart3,      color: '#3B82F6' },
              { id: 'Manage Employees',  icon: Users,          color: '#3B82F6' },
              { id: 'Skill Heatmap',     icon: Grid,           color: '#3B82F6' },
              { id: 'Certifications',    icon: Award,          color: '#10B981' },
              { id: 'Achievements',      icon: Sparkles,       color: '#F59E0B' },
              { id: 'Education',         icon: GraduationCap,  color: '#8B5CF6' },
              { id: 'Projects',          icon: Briefcase,      color: '#F97316' },
            ].map((t: any) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: activeTab === t.id ? t.color : 'transparent',
                  color: activeTab === t.id ? '#fff' : T.sub,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s', flexShrink: 0
                }}
              >
                <t.icon size={14} /> {t.id}
              </button>
            ))}
          </div>

          {activeTab === 'Overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 30, animation: 'fadeIn 0.4s ease' }}>
              <div>
                <h3 style={{ margin: '0 0 32px', fontSize: 18, fontWeight: 800, display:'flex', alignItems:'center', gap:12 }}><BarChart3 size={20} color="#3B82F6" /> Distribution</h3>
                <div style={{ height: 350 }}>
                  <Bar
                    data={{
                      labels: ['Tool', 'Tech', 'App', 'Dom', 'Test', 'Devs', 'AI'],
                      datasets: [{ label: 'Readiness', data: [2.1, 2.4, 1.8, 2.8, 2.3, 1.5, 2.0], backgroundColor: '#3B82F6', borderRadius: 6, barThickness: 24 }]
                    }}
                    options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: T.sub, font: { size: 10, weight: 600 } }, beginAtZero: true, max: 3 }, x: { grid: { display: false }, ticks: { color: T.sub, font: { size: 10, weight: 600 } } } } }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', alignContent: 'start', gap: 20 }}>
                 {[{l:'Senior (>75%)', c:employees.filter(e=>e.completion>=75).length, col: '#10B981'}, {l:'Mid (50-74%)', c:employees.filter(e=>e.completion>=50 && e.completion<75).length, col: '#3B82F6'}, {l:'Junior (<50%)', c:employees.filter(e=>e.completion<50).length, col: '#EF4444'}].map(t=>(
                    <div key={t.l} style={{ background: T.bg, padding: 24, borderRadius: 20, border: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div>
                         <div style={{ fontSize: 11, fontWeight: 900, color: T.sub, marginBottom: 6, letterSpacing: 0.5 }}>{t.l}</div>
                         <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{t.c} <span style={{ fontSize: 14, color: T.sub, fontWeight: 500 }}>People</span></div>
                       </div>
                       <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.col, boxShadow: `0 0 15px ${t.col}` }} />
                    </div>
                 ))}
              </div>
            </div>
          )}

          {activeTab === 'Manage Employees' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* Search & Sort Bar */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                  <Search size={16} color={T.muted} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    placeholder="Search name, ID or role..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 500, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    onClick={() => {
                      const filtered = employees.filter(e => {
                        const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                        const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                        const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                           (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                        const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                        const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                        const matchesCompletion = !filters.completionRange || (() => {
                          const [min, max] = filters.completionRange.split('-').map(Number);
                          return e.completion >= min && e.completion <= max;
                        })();
                        const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                        const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                        const matchesValidated = !filters.isValidated || e.submitted;
                        return matchesSearch && matchesRole && matchesExp && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                      });
                      exportAllToExcel(filtered);
                      toast.success(`Exported ${filtered.length} filtered employees to Excel`);
                    }}
                    style={{ 
                      padding: '10px 14px', 
                      borderRadius: 10, 
                      background: '#10B981', 
                      border: 'none',
                      color: '#fff', 
                      fontSize: 12, 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Download size={14} /> Export
                  </button>
                  <select 
                    value={sortOrder} 
                    onChange={e => setSortOrder(e.target.value as any)}
                    style={{ padding: '10px 14px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 500, cursor: 'pointer', minWidth: 110 }}
                  >
                    <option value="A-Z">A-Z</option>
                    <option value="Z-A">Z-A</option>
                    <option value="Newest">Newest</option>
                    <option value="Oldest">Oldest</option>
                  </select>
                </div>
              </div>

              {/* Results Count */}
              <div style={{ marginBottom: 16, fontSize: 13, color: T.sub }}>
                Showing {employees.filter(e => {
                  const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                  const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                  const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                     (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                  const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                  const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                  const matchesCompletion = !filters.completionRange || (() => {
                    const [min, max] = filters.completionRange.split('-').map(Number);
                    return e.completion >= min && e.completion <= max;
                  })();
                  const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                  const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                  const matchesValidated = !filters.isValidated || e.submitted;
                  return matchesSearch && matchesRole && matchesExp && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                }).length} of {employees.length} employees
              </div>
              
              <div style={{ display: 'grid', gap: 16 }}>
                {employees
                  .filter(e => {
                    const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                    const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                    const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                       (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                    const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                    const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                    const matchesCompletion = !filters.completionRange || (() => {
                      const [min, max] = filters.completionRange.split('-').map(Number);
                      return e.completion >= min && e.completion <= max;
                    })();
                    const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                    const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                    const matchesValidated = !filters.isValidated || e.submitted;
                    return matchesSearch && matchesRole && matchesExp && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                  })
                  .sort((a, b) => {
                    if (sortOrder === 'A-Z') return a.name?.localeCompare(b.name);
                    if (sortOrder === 'Z-A') return b.name?.localeCompare(a.name);
                    if (sortOrder === 'Newest') return (b.id || '').localeCompare(a.id || '');
                    if (sortOrder === 'Oldest') return (a.id || '').localeCompare(b.id || '');
                    return 0;
                  })
                  .map(e => (
                    <div key={e.id} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 20, padding: '24px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative' }}>
                       {/* Left Content: Identity */}
                       <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '1 1 300px' }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, boxShadow: '0 8px 16px rgba(59,130,246,0.15)', flexShrink: 0 }}>
                            {e.name?.substring(0,2).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                             <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                                <span style={{ padding: '3px 8px', borderRadius: 6, background: e.submitted ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)', color: e.submitted ? '#10B981' : '#3B82F6', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>{e.submitted ? 'VALIDATED' : 'SENSING'}</span>
                             </div>
                             <div style={{ fontSize: 12, color: T.sub, fontWeight: 500, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                               <span>{e.email || 'no-email@zensar.com'}</span>
                               <span style={{ color: T.bdr }}>|</span>
                               <span style={{ color: '#3B82F6', fontWeight: 700 }}>ID: {e.zensar_id || e.id}</span>
                             </div>
                          </div>
                       </div>

                       {/* Right Content: Stats & Actions */}
                       <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: '1 1 200px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ flexShrink: 0 }}>
                             <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: 20, fontWeight: 800, color: e.completion >= 75 ? '#10B981' : '#3B82F6' }}>{e.completion}</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: T.sub }}>%</span>
                             </div>
                             <div style={{ width: 100, height: 6, borderRadius: 10, background: T.bdr, marginTop: 6, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${e.completion}%`, background: e.completion >= 75 ? '#10B981' : '#3B82F6', borderRadius: 10 }} />
                             </div>
                          </div>
                          <button onClick={() => handleOpenPreview(e)} style={{ width: 44, height: 44, borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}`, color: '#3B82F6', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: '0.2s' }} aria-label="View Audit"><Eye size={20}/></button>
                       </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'Manage Employees' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* Search & Filter Bar */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                  <Search size={16} color={T.muted} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    placeholder="Search people by name or ID..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, fontWeight: 500, outline: 'none' }}
                  />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  style={{ 
                    padding: '10px 16px', 
                    borderRadius: 10, 
                    background: showFilters ? '#3B82F6' : T.input, 
                    border: `1px solid ${T.inputBdr}`, 
                    color: showFilters ? '#fff' : T.text, 
                    fontSize: 13, 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Filter size={14} /> Filters {(filters.role || filters.minExperience || filters.minProjects || filters.minCertifications || filters.completionRange || filters.hasProjects || filters.hasCertifications || filters.isValidated || (filters.selectedSkills || []).length > 0) ? '●' : ''}
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    onClick={() => {
                      const filtered = employees.filter(e => {
                        const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                        const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                        const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                           (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                        const matchesSkills = !(filters.selectedSkills || []).length || (filters.selectedSkills || []).every((skillId: string) => 
                          (e.skills || []).some((s: any) => s.skillId === skillId && s.selfRating > 0)
                        );
                        const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                        const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                        const matchesCompletion = !filters.completionRange || (() => {
                          const [min, max] = filters.completionRange.split('-').map(Number);
                          return e.completion >= min && e.completion <= max;
                        })();
                        const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                        const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                        const matchesValidated = !filters.isValidated || e.submitted;
                        return matchesSearch && matchesRole && matchesExp && matchesSkills && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                      });
                      exportAllToExcel(filtered);
                      toast.success(`Exported ${filtered.length} filtered people to Excel`);
                    }}
                    style={{ 
                      padding: '10px 14px', 
                      borderRadius: 10, 
                      background: '#10B981', 
                      border: 'none',
                      color: '#fff', 
                      fontSize: 12, 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Download size={14} /> Export
                  </button>
                  <button
                    onClick={() => setShowAddEmployeeModal(true)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      background: '#10B981',
                      border: 'none',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Plus size={16} /> Add Employee
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['A-Z', 'Z-A', 'Newest', 'Oldest'] as const).map((sort) => (
                    <button
                      key={sort}
                      onClick={() => setSortOrder(sort)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: sortOrder === sort ? '#3B82F6' : T.input,
                        border: `1px solid ${T.inputBdr}`,
                        color: sortOrder === sort ? '#fff' : T.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        minWidth: 50
                      }}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Filters Panel for People Tab */}
              {showFilters && (
                <div style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Filter People</h3>
                    <button 
                      onClick={() => {
                        setFilters({
                          role: '', minExperience: '', maxExperience: '', minProjects: '', minCertifications: '',
                          skillLevel: '', completionRange: '', hasProjects: false, hasCertifications: false, isValidated: false,
                          selectedSkills: []
                        });
                        setSearch('');
                      }}
                      style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Reset All
                    </button>
                  </div>
                  
                  {/* Role Filter */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 6, display: 'block' }}>
                      👔 Role
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['All', 'QA', 'Senior QA', 'Lead', 'Manager', 'Dev', 'DevOps'].map(role => (
                        <button
                          key={role}
                          onClick={() => setFilters({...filters, role: role === 'All' ? '' : role})}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 12,
                            background: (filters.role === role || (role === 'All' && !filters.role)) ? '#3B82F6' : T.input,
                            border: `1px solid ${T.inputBdr}`,
                            color: (filters.role === role || (role === 'All' && !filters.role)) ? '#fff' : T.text,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Experience Filter */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 6, display: 'block' }}>
                      📅 Experience
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['All', '0-2', '2-5', '5-8', '8+'].map(exp => (
                        <button
                          key={exp}
                          onClick={() => {
                            if (exp === 'All') {
                              setFilters({...filters, minExperience: '', maxExperience: ''});
                            } else if (exp === '8+') {
                              setFilters({...filters, minExperience: '8', maxExperience: ''});
                            } else {
                              const [min, max] = exp.split('-');
                              setFilters({...filters, minExperience: min, maxExperience: max});
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 12,
                            background: (exp === 'All' && !filters.minExperience) || 
                                       (exp === '8+' && filters.minExperience === '8') ||
                                       (exp !== 'All' && exp !== '8+' && filters.minExperience === exp.split('-')[0]) 
                                       ? '#3B82F6' : T.input,
                            border: `1px solid ${T.inputBdr}`,
                            color: (exp === 'All' && !filters.minExperience) || 
                                   (exp === '8+' && filters.minExperience === '8') ||
                                   (exp !== 'All' && exp !== '8+' && filters.minExperience === exp.split('-')[0]) 
                                   ? '#fff' : T.text,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {exp === 'All' ? 'Any' : exp + 'y'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Skills Filter - Checkbox List */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 6, display: 'block' }}>
                      🛠️ Skills
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 4, maxHeight: 160, overflowY: 'auto', padding: 8, background: T.input, borderRadius: 8 }}>
                      {SKILLS.map(skill => (
                        <label key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: T.text, padding: '4px 6px', borderRadius: 4, background: (filters.selectedSkills || []).includes(skill.id) ? 'rgba(59,130,246,0.2)' : 'transparent' }}>
                          <input 
                            type="checkbox" 
                            checked={(filters.selectedSkills || []).includes(skill.id)}
                            onChange={(e) => {
                              const current = filters.selectedSkills || [];
                              if (e.target.checked) {
                                setFilters({...filters, selectedSkills: [...current, skill.id]});
                              } else {
                                setFilters({...filters, selectedSkills: current.filter((id: string) => id !== skill.id)});
                              }
                            }}
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: (filters.selectedSkills || []).includes(skill.id) ? 600 : 400 }}>{skill.name}</span>
                        </label>
                      ))}
                    </div>
                    {(filters.selectedSkills || []).length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#3B82F6' }}>
                        {(filters.selectedSkills || []).length} selected
                      </div>
                    )}
                  </div>

                  {/* Additional Filters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                    {/* Completion Range */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 4, display: 'block' }}>Completion %</label>
                      <select 
                        value={filters.completionRange}
                        onChange={e => setFilters({...filters, completionRange: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 12, cursor: 'pointer' }}
                      >
                        <option value="">All</option>
                        <option value="0-25">0-25%</option>
                        <option value="25-50">25-50%</option>
                        <option value="50-75">50-75%</option>
                        <option value="75-100">75-100%</option>
                      </select>
                    </div>

                    {/* Min Projects */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 4, display: 'block' }}>Min Projects</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 2"
                        value={filters.minProjects}
                        onChange={e => setFilters({...filters, minProjects: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 12 }}
                      />
                    </div>

                    {/* Min Certifications */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: T.sub, marginBottom: 4, display: 'block' }}>Min Certs</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 1"
                        value={filters.minCertifications}
                        onChange={e => setFilters({...filters, minCertifications: e.target.value})}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 12 }}
                      />
                    </div>
                  </div>

                  {/* Toggle Filters */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.text }}>
                      <input 
                        type="checkbox" 
                        checked={filters.hasProjects}
                        onChange={e => setFilters({...filters, hasProjects: e.target.checked})}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      📁 Has Projects
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.text }}>
                      <input 
                        type="checkbox" 
                        checked={filters.hasCertifications}
                        onChange={e => setFilters({...filters, hasCertifications: e.target.checked})}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      🏆 Has Certs
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.text }}>
                      <input 
                        type="checkbox" 
                        checked={filters.isValidated}
                        onChange={e => setFilters({...filters, isValidated: e.target.checked})}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      ✅ Validated
                    </label>
                  </div>
                </div>
              )}

              {/* Results Count */}
              <div style={{ marginBottom: 16, fontSize: 13, color: T.sub }}>
                {(() => {
                  const filtered = employees.filter(e => {
                    const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                    const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                    const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                       (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                    const matchesSkills = !(filters.selectedSkills || []).length || (filters.selectedSkills || []).every((skillId: string) => 
                      (e.skills || []).some((s: any) => s.skillId === skillId && s.selfRating > 0)
                    );
                    const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                    const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                    const matchesCompletion = !filters.completionRange || (() => {
                      const [min, max] = filters.completionRange.split('-').map(Number);
                      return e.completion >= min && e.completion <= max;
                    })();
                    const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                    const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                    const matchesValidated = !filters.isValidated || e.submitted;
                    return matchesSearch && matchesRole && matchesExp && matchesSkills && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                  });
                  return `Showing ${filtered.length} of ${employees.length} people`;
                })()}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                {(aiSearchActive ? aiSearchResults : employees)
                  .filter(e => {
                    if (aiSearchActive) return true; // AI search already filtered
                    const matchesSearch = e.name?.toLowerCase().includes(search.toLowerCase()) || String(e.id).includes(search);
                    const matchesRole = !filters.role || e.designation?.toLowerCase().includes(filters.role.toLowerCase());
                    const matchesExp = (!filters.minExperience || (e.yearsExperience || 0) >= parseInt(filters.minExperience)) && 
                                       (!filters.maxExperience || (e.yearsExperience || 0) <= parseInt(filters.maxExperience));
                    const matchesSkills = !(filters.selectedSkills || []).length || (filters.selectedSkills || []).every((skillId: string) => 
                      (e.skills || []).some((s: any) => s.skillId === skillId && s.selfRating > 0)
                    );
                    const matchesProjects = !filters.minProjects || (e.projects?.length || 0) >= parseInt(filters.minProjects);
                    const matchesCerts = !filters.minCertifications || (e.certifications?.length || 0) >= parseInt(filters.minCertifications);
                    const matchesCompletion = !filters.completionRange || (() => {
                      const [min, max] = filters.completionRange.split('-').map(Number);
                      return e.completion >= min && e.completion <= max;
                    })();
                    const matchesHasProjects = !filters.hasProjects || (e.projects?.length > 0);
                    const matchesHasCerts = !filters.hasCertifications || (e.certifications?.length > 0);
                    const matchesValidated = !filters.isValidated || e.submitted;
                    return matchesSearch && matchesRole && matchesExp && matchesSkills && matchesProjects && matchesCerts && matchesCompletion && matchesHasProjects && matchesHasCerts && matchesValidated;
                  })
                  .sort((a, b) => {
                    if (aiSearchActive) return 0; // AI search already sorted by score
                    if (sortOrder === 'A-Z') return a.name?.localeCompare(b.name);
                    if (sortOrder === 'Z-A') return b.name?.localeCompare(a.name);
                    if (sortOrder === 'Newest') return (b.id || '').localeCompare(a.id || '');
                    if (sortOrder === 'Oldest') return (a.id || '').localeCompare(b.id || '');
                    return 0;
                  })
                  .map(e => (
                    <div key={e.id} onClick={() => handleOpenPreview(e)} style={{ background: T.bg, border: `1px solid ${aiSearchActive && e._aiScore ? '#8B5CF6' : T.bdr}`, borderRadius: 20, padding: 24, cursor: 'pointer', transition: '0.2s', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }} className="hover:scale-105">
                       <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                          <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff' }}>
                            {e.name?.substring(0,2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                             <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.name}>{e.name}</div>
                             <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                             {aiSearchActive && e._aiScore ? (
                               <div style={{ fontSize: 13, fontWeight: 900, color: '#8B5CF6', lineHeight: 1, padding: '3px 8px', background: 'rgba(139,92,246,0.1)', borderRadius: 6 }}>{e._aiScore} pts</div>
                             ) : (
                               <>
                                 <div style={{ fontSize: 18, fontWeight: 900, color: e.completion >= 75 ? '#10B981' : '#3B82F6', lineHeight: 1 }}>{e.completion}%</div>
                                 <div style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>Complete</div>
                               </>
                             )}
                          </div>
                       </div>
                       
                       <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                          <span style={{ padding: '3px 8px', borderRadius: 4, background: e.submitted ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)', color: e.submitted ? '#10B981' : '#3B82F6', fontSize: 9, fontWeight: 800 }}>{e.submitted ? 'VALIDATED' : 'SENSING'}</span>
                          <span style={{ padding: '3px 8px', borderRadius: 4, background: T.card, color: T.sub, fontSize: 9, fontWeight: 600 }}>{e.designation?.substring(0, 20) || 'Employee'}</span>
                          {e.yearsExperience > 0 && (
                            <span style={{ padding: '3px 8px', borderRadius: 4, background: T.card, color: T.sub, fontSize: 9, fontWeight: 600 }}>{e.yearsExperience} yrs exp</span>
                          )}
                       </div>

                       {/* Skills Preview */}
                       {e.skills && e.skills.filter((s: any) => s.selfRating > 0).length > 0 && (
                         <div style={{ marginBottom: 16 }}>
                           <div style={{ fontSize: 9, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Top Skills</div>
                           <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                             {e.skills.filter((s: any) => s.selfRating > 0).slice(0, 4).map((s: any) => (
                               <span key={s.skillId} style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 9, fontWeight: 600 }}>
                                 {SKILLS.find(sk => sk.id === s.skillId)?.name}: {s.selfRating}
                               </span>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.muted }}>
                            {e.projects?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>📁 {e.projects.length}</span>}
                            {e.certifications?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>🏆 {e.certifications.length}</span>}
                          </div>
                          <Eye size={16} color={T.muted} />
                       </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'Skill Heatmap' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
               <h3 style={{ margin: '0 0 24px', fontSize: 16, fontWeight: 800 }}>Organizational Heatmap</h3>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                  {SKILLS.map(sk => {
                    const avg = employees.length ? employees.reduce((sum, e) => (sum + (e.skills.find((s:any)=>s.skillId===sk.id)?.selfRating || 0)), 0) / employees.length : 0;
                    return (
                      <div key={sk.id} style={{ background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                         <div style={{ fontSize: 10, fontWeight: 800, color: T.sub, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sk.name}</div>
                         <div style={{ fontSize: 20, fontWeight: 900, color: T.text, marginBottom: 6 }}>{avg.toFixed(1)}</div>
                         <div style={{ position:'absolute', bottom:0, left:0, width:'100%', height:4, background: avg >= 2.5 ? '#10B981' : avg >= 1.5 ? '#3B82F6' : avg > 0 ? '#F59E0B' : T.bdr }} />
                      </div>
                    );
                  })}
               </div>
            </div>
          )}

          {/* ── CERTIFICATIONS TAB ── */}
          {activeTab === 'Certifications' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Award size={20} color="#10B981" /> Certifications
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 12, fontWeight: 700, color: '#10B981' }}>
                    {employees.reduce((s, e) => s + (e.certifications?.length || 0), 0)} Total Certs
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.certifications?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, certification, issuer..." value={certSearch} onChange={e => setCertSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.certifications?.length || 0) > 0).filter(e => {
                  if (!certSearch.trim()) return true;
                  const q = certSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.certifications || []).some((c: any) => (c.cert_name || c.name || '').toLowerCase().includes(q) || (c.issuing_organization || c.issuer || '').toLowerCase().includes(q));
                }).sort((a, b) => (b.certifications?.length || 0) - (a.certifications?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`cert_${e.id}`];
                  const items = expanded ? e.certifications : e.certifications.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(16,185,129,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #10B981' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Certification')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.certifications.length} 🏅</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((c: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(16,185,129,0.06)' : '#f0fdf4', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>🏅</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.cert_name || c.name || 'Certificate'}</div>
                              {(c.issuing_organization || c.issuer) && <div style={{ fontSize: 10, color: T.sub }}>{c.issuing_organization || c.issuer}</div>}
                            </div>
                          </div>
                        ))}
                        {e.certifications.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`cert_${e.id}`]: !prev[`cert_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#10B981', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.certifications.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.certifications?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <Award size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No certifications uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ACHIEVEMENTS TAB ── */}
          {activeTab === 'Achievements' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={20} color="#F59E0B" /> Achievements & Awards
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>
                    {employees.reduce((s, e) => s + (e.achievements?.length || 0), 0)} Total Awards
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.achievements?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, award title, type..." value={achSearch} onChange={e => setAchSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.achievements?.length || 0) > 0).filter(e => {
                  if (!achSearch.trim()) return true;
                  const q = achSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.achievements || []).some((a: any) => (a.title || a.award_title || '').toLowerCase().includes(q) || (a.award_type || a.category || '').toLowerCase().includes(q));
                }).sort((a, b) => (b.achievements?.length || 0) - (a.achievements?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`ach_${e.id}`];
                  const items = expanded ? e.achievements : e.achievements.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(245,158,11,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #F59E0B' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Achievements')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#F59E0B,#D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.achievements.length} 🏆</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((a: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(245,158,11,0.06)' : '#fffbeb', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>🏆</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.title || a.award_title || 'Achievement'}</div>
                              {(a.award_type || a.category) && <div style={{ fontSize: 10, color: T.sub }}>{a.award_type || a.category}</div>}
                            </div>
                          </div>
                        ))}
                        {e.achievements.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`ach_${e.id}`]: !prev[`ach_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#F59E0B', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.achievements.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.achievements?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <Sparkles size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No achievements uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── EDUCATION TAB ── */}
          {activeTab === 'Education' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <GraduationCap size={20} color="#8B5CF6" /> Education
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', fontSize: 12, fontWeight: 700, color: '#8B5CF6' }}>
                    {employees.reduce((s, e) => s + (e.education?.length || 0), 0)} Total Records
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.education?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, degree, institution..." value={eduSearch} onChange={e => setEduSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.education?.length || 0) > 0).filter(e => {
                  if (!eduSearch.trim()) return true;
                  const q = eduSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.education || []).some((ed: any) => (ed.degree || ed.qualification || '').toLowerCase().includes(q) || (ed.institution || ed.university || '').toLowerCase().includes(q));
                }).sort((a, b) => (b.education?.length || 0) - (a.education?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`edu_${e.id}`];
                  const items = expanded ? e.education : e.education.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(139,92,246,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #8B5CF6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Education')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.education.length} 🎓</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((ed: any, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(139,92,246,0.06)' : '#faf5ff', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>🎓</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{ed.degree || ed.qualification || 'Degree'}</div>
                              {(ed.institution || ed.university) && <div style={{ fontSize: 10, color: T.sub }}>{ed.institution || ed.university}{ed.year ? ` · ${ed.year}` : ''}</div>}
                            </div>
                          </div>
                        ))}
                        {e.education.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`edu_${e.id}`]: !prev[`edu_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#8B5CF6', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.education.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.education?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <GraduationCap size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No education records uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PROJECTS TAB ── */}
          {activeTab === 'Projects' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Briefcase size={20} color="#F97316" /> Projects
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', fontSize: 12, fontWeight: 700, color: '#F97316' }}>
                    {employees.reduce((s, e) => s + (e.projects?.length || 0), 0)} Total Projects
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>
                    {employees.filter(e => (e.projects?.length || 0) > 0).length} Employees
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Search size={15} color={T.sub} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input placeholder="Search by name, project title, client, domain..." value={projSearch} onChange={e => setProjSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10, background: T.input, border: `1px solid ${T.inputBdr}`, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {employees.filter(e => (e.projects?.length || 0) > 0).filter(e => {
                  if (!projSearch.trim()) return true;
                  const q = projSearch.toLowerCase();
                  return e.name?.toLowerCase().includes(q) || (e.projects || []).some((p: any) =>
                    (p.ProjectName || p.project_name || p.name || '').toLowerCase().includes(q) ||
                    (p.Client || p.client || '').toLowerCase().includes(q) ||
                    (p.Domain || p.domain || '').toLowerCase().includes(q)
                  );
                }).sort((a, b) => (b.projects?.length || 0) - (a.projects?.length || 0)).map((e: any) => {
                  const expanded = expandedCards[`proj_${e.id}`];
                  const items = expanded ? e.projects : e.projects.slice(0, 3);
                  return (
                    <div key={e.id} style={{ background: T.bg, border: '1px solid rgba(249,115,22,0.25)', borderRadius: 16, padding: 20, transition: '0.2s', borderTop: '3px solid #F97316' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }} onClick={() => handleOpenPreview(e, 'My Projects')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#F97316,#EA580C)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {e.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>{e.zensar_id || e.id}</div>
                        </div>
                        <div style={{ background: 'rgba(249,115,22,0.15)', color: '#F97316', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{e.projects.length} 📁</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((p: any, i: number) => {
                          const title = p.ProjectName || p.project_name || p.name || '';
                          const sub = [p.Client || p.client, p.Domain || p.domain].filter(Boolean).join(' · ');
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: dark ? 'rgba(249,115,22,0.06)' : '#fff7ed', borderRadius: 8 }}>
                              <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || 'Untitled Project'}</div>
                                {sub && <div style={{ fontSize: 10, color: T.sub }}>{sub}</div>}
                              </div>
                            </div>
                          );
                        })}
                        {e.projects.length > 3 && (
                          <button onClick={() => setExpandedCards(prev => ({ ...prev, [`proj_${e.id}`]: !prev[`proj_${e.id}`] }))}
                            style={{ marginTop: 4, padding: '6px 0', background: 'none', border: 'none', color: '#F97316', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                            {expanded ? '▲ Show Less' : `▼ See More (${e.projects.length - 3} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.filter(e => (e.projects?.length || 0) > 0).length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: T.sub }}>
                    <Briefcase size={40} color={T.bdr} style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 700 }}>No projects uploaded yet</div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal Popup for Intelligence Audit */}
      {previewUser && (
        <div style={{ position: 'fixed', inset: 0, background: dark ? 'rgba(10,10,18,0.9)' : 'rgba(229,229,229,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2vh 2vw' }}>
          <div style={{ background: T.bg, borderRadius: '24px', width: '100%', maxWidth: 1300, height: '96vh', overflow: 'hidden', border: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
            
            {/* Modal Top Bar */}
            <div style={{ padding: '16px 4vw', borderBottom: `1px solid ${T.bdr}`, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', background: T.card }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewUser.name}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.sub, textTransform: 'uppercase', opacity: 0.6 }}>{previewUser.zensar_id || previewUser.id}</span>
               </div>
               
               <div style={{ display: 'flex', gap: 6, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 12, overflowX: 'auto', flex: 1, minWidth: 200, WebkitOverflowScrolling: 'touch' }}>
                {(['ZenRadar', 'ZenScan', 'ZenMatrix', 'My Education', 'My Projects', 'My Certification', 'My Achievements', 'ZenProfile'] as const).map(tab => (
                   <button 
                     key={tab} 
                     onClick={() => setPopupActiveTab(tab)}
                     style={{
                        padding: '8px 14px', borderRadius: 10, border: 'none', 
                        background: popupActiveTab === tab ? '#3B82F6' : 'transparent',
                        color: popupActiveTab === tab ? '#fff' : T.sub,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.2s',
                        whiteSpace: 'nowrap'
                     }}
                   >
                     {tab}
                   </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                 <button 
                  onClick={() => setDeleteConfirming(!deleteConfirming)}
                  style={{ 
                    width: 40, height: 40, borderRadius: 14, 
                    background: deleteConfirming ? '#EF4444' : (dark ? 'rgba(239,68,68,0.1)' : '#FEF2F2'), 
                    border: `1px solid ${deleteConfirming ? '#EF4444' : 'rgba(239,68,68,0.2)'}`, 
                    color: deleteConfirming ? '#fff' : '#EF4444', 
                    cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                    transition: '0.2s'
                  }}
                  title="Delete Employee"
                 >
                   <Trash2 size={20}/>
                 </button>

                 <button onClick={() => { setPreviewUser(null); setPreviewData(null); setDeleteConfirming(false); }} style={{ width: 40, height: 40, borderRadius: 14, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                   <X size={24}/>
                 </button>
               </div>
             </div>

             {/* ── Inline Delete Confirmation ── */}
             {deleteConfirming && (
               <div style={{ 
                 margin: '0 40px 24px', padding: '16px 24px', 
                 background: 'rgba(239,68,68,0.08)', borderRadius: 20, 
                 border: '1px solid rgba(239,68,68,0.2)',
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                 animation: 'fadeIn 0.3s ease'
               }}>
                 <div>
                   <div style={{ fontSize: 13, fontWeight: 800, color: '#EF4444' }}>Terminate Record?</div>
                   <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>Warning: This will permanently delete <b>{previewUser.name}</b> and all associated skill records.</div>
                 </div>
                 <div style={{ display: 'flex', gap: 10 }}>
                   <button 
                     onClick={() => setDeleteConfirming(false)} 
                     style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.card, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                   >
                     Cancel
                   </button>
                   <button 
                     onClick={() => handleDeleteEmployee(previewUser.id, previewUser.name)} 
                     style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}
                   >
                     Yes, Purge Record
                   </button>
                 </div>
               </div>
             )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isPreviewLoading ? (
                 <div style={{ height: '100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 20 }}>
                    <RefreshCw size={40} color="#3B82F6" className="animate-spin" />
                    <div style={{ fontSize: 14, color: T.sub }}>Syncing Profile Data...</div>
                 </div>
              ) : (
                <AppContext.Provider value={{ 
                  data: previewData, 
                  isLoading: false, 
                  isPopup: true,
                    onTabChange: (path: any) => {
                      const tabMap: Record<string, 'ZenRadar' | 'ZenScan' | 'ZenMatrix' | 'My Education' | 'My Projects' | 'My Certification' | 'My Achievements' | 'ZenProfile'> = {
                        '/employee/skills': 'ZenMatrix',
                        '/employee/certifications': 'My Certification',
                        '/employee/projects': 'My Projects',
                        '/employee/education': 'My Education',
                        '/employee/resume-upload': 'ZenScan',
                        '/employee/achievements': 'My Achievements',
                        '/employee/personal-details': 'ZenProfile'
                      };
                      const p = typeof path === 'string' ? path : path?.path;
                      const tab = tabMap[p];
                      if (tab) setPopupActiveTab(tab);
                    },
                  setGlobalLoading: () => {}, 
                  reload: async () => {
                    try {
                      const d = await loadAppData(previewUser.id);
                      if (d) {
                        setPreviewData(d);
                        loadAllData();
                      } else {
                        toast.error('Failed to reload employee data');
                      }
                    } catch (err) {
                      toast.error('Failed to reload employee data');
                    }
                  }
                }}>
                  <div style={{ animation: 'fadeIn 0.4s' }}>
                    {popupActiveTab === 'ZenRadar' && (
                      <div>
                        {/* ── Full Profile Summary Card ── */}
                        <div style={{ padding: '20px 4vw 0' }}>
                          <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.bdr}`, padding: 'min(24px, 5vw)', marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
                              {/* Left: Identity */}
                              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                                <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                                  {(previewUser.name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{previewUser.name || '—'}</div>
                                  <div style={{ fontSize: 13, color: '#3B82F6', fontWeight: 700, marginTop: 2 }}>{previewUser.designation || previewUser.Designation || '—'}</div>
                                  <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>ID: <b style={{color:T.text}}>{previewUser.zensar_id || previewUser.id}</b> &nbsp;|&nbsp; {previewUser.department || '—'}</div>
                                </div>
                              </div>
                              {/* Right: Stats */}
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                {[
                                  { l: 'Completion', v: `${previewUser.completion ?? 0}%`, c: '#10B981' },
                                  { l: 'Skills', v: (previewUser.skills?.filter((s:any)=>s.selfRating>0).length ?? 0), c: '#3B82F6' },
                                  { l: 'Certs', v: previewUser.certifications?.length ?? 0, c: '#8B5CF6' },
                                  { l: 'Projects', v: previewUser.projects?.length ?? 0, c: '#F59E0B' },
                                ].map(s => (
                                  <div key={s.l} style={{ textAlign: 'center', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '10px 12px', flex: '1 1 100px', maxWidth: 140 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.sub, textTransform: 'uppercase', marginTop: 2 }}>{s.l}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.bdr}` }}>
                              {[
                                { label: '📧 Email',         value: previewUser.email },
                                { label: '📱 Phone',         value: previewUser.phone },
                                { label: '📍 Location',      value: previewUser.location },
                                { label: '🏢 Department',    value: previewUser.department },
                                { label: '💼 Years in IT',   value: previewUser.years_it ? `${previewUser.years_it} yrs` : '—' },
                                { label: '🏷️ Years@Zensar',  value: previewUser.years_zensar ? `${previewUser.years_zensar} yrs` : '—' },
                                { label: '⭐ Primary Skill', value: previewUser.primary_skill || previewData?.user?.primarySkill || '—' },
                                { label: '🎯 Domain',        value: previewUser.primary_domain || previewData?.user?.primaryDomain || '—' },
                                { label: '📚 Education',     value: `${previewData?.education?.length ?? 0} record(s)` },
                                { label: '✅ Validated',     value: previewUser.submitted ? 'Yes' : 'No' },
                                { label: '🗓️ Joined',        value: previewUser.created_at ? new Date(previewUser.created_at).toLocaleDateString('en-IN') : '—' },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 10, padding: '10px 14px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4, wordBreak: 'break-all' }}>{value || '—'}</div>
                                </div>
                              ))}
                            </div>

                            {/* Education records if any */}
                            {previewData?.education && previewData.education.length > 0 && (
                              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 10 }}>🎓 Education</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  {previewData.education.map((ed: any, i: number) => (
                                    <div key={i} style={{ background: dark ? 'rgba(59,130,246,0.08)' : '#eff6ff', borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
                                      <div style={{ fontWeight: 800, color: T.text }}>{ed.degree || ed.Degree || ed.course || '—'}</div>
                                      <div style={{ color: T.sub, marginTop: 2 }}>{ed.institution || ed.college || ed.College || '—'} {ed.year || ed.Year ? `· ${ed.year || ed.Year}` : ''}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Certifications preview */}
                            {previewUser.certifications?.length > 0 && (
                              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 10 }}>🏅 Certifications ({previewUser.certifications.length})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {previewUser.certifications.slice(0, 6).map((c: any, i: number) => (
                                    <span key={i} style={{ background: dark ? 'rgba(139,92,246,0.12)' : '#f5f3ff', color: '#8B5CF6', borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700 }}>
                                      {c.CertName || c.cert_name || c.name || '—'}
                                    </span>
                                  ))}
                                  {previewUser.certifications.length > 6 && <span style={{ fontSize: 11, color: T.sub, padding: '4px 8px' }}>+{previewUser.certifications.length - 6} more</span>}
                                </div>
                              </div>
                            )}

                            {/* Projects preview */}
                            {previewUser.projects?.length > 0 && (
                              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.bdr}` }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', marginBottom: 10 }}>🚀 Projects ({previewUser.projects.length})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {previewUser.projects.slice(0, 5).map((p: any, i: number) => (
                                    <span key={i} style={{ background: dark ? 'rgba(245,158,11,0.1)' : '#fffbeb', color: '#F59E0B', borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 700 }}>
                                      {p.ProjectName || p.project_name || p.name || '—'}
                                    </span>
                                  ))}
                                  {previewUser.projects.length > 5 && <span style={{ fontSize: 11, color: T.sub, padding: '4px 8px' }}>+{previewUser.projects.length - 5} more</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <EmployeeDashboard key="dashboard" isPopup={true} overrideData={previewData!} onTabChange={(path: any) => {
                           const tabMap: Record<string, 'ZenRadar' | 'ZenScan' | 'ZenMatrix' | 'My Education' | 'My Projects' | 'My Certification' | 'My Achievements' | 'ZenProfile'> = {
                            '/employee/skills': 'ZenMatrix',
                            '/employee/certifications': 'My Certification',
                            '/employee/projects': 'My Projects',
                            '/employee/education': 'My Education',
                            '/employee/resume-upload': 'ZenScan',
                            '/employee/achievements': 'My Achievements',
                            '/employee/personal-details': 'ZenProfile'
                          };
                          const tab = tabMap[typeof path === 'string' ? path : path?.path];
                          if (tab) setPopupActiveTab(tab);
                        }} />
                      </div>
                    )}

                    {popupActiveTab === 'ZenMatrix' && <SkillMatrixPage key="skills" isPopup={true} />}
                    {popupActiveTab === 'My Certification' && <CertificationsPage key="certs" isPopup={true} />}
                    {popupActiveTab === 'My Projects' && <ProjectsPage key="projects" isPopup={true} />}
                    {popupActiveTab === 'My Education' && <EducationPage key="education" isPopup={true} />}
                    {popupActiveTab === 'My Achievements' && <AchievementsPage key="achievements" isPopup={true} />}
                                        {popupActiveTab === 'ZenScan' && (
                      <AdminResumeUploadPage 
                        key="resume" 
                        employeeId={previewUser.id} 
                        employeeName={previewUser.name} 
                        existingData={{
                          skills: previewData
                            ? Object.entries(previewData.ratings || {})
                                .filter(([, rating]) => (rating as number) > 0)
                                .map(([name, rating]) => ({
                                  skillId: name,
                                  selfRating: rating as any,
                                  managerRating: null,
                                  validated: false
                                }))
                            : (previewUser?.skills || []).filter((s: any) => s.selfRating > 0),
                          projects: previewData?.projects || previewUser?.projects || [],
                          certifications: previewData?.certifications || previewUser?.certifications || [],
                          education: previewData?.education || [],
                          profile: previewData?.user || previewUser
                        }}
                        onClose={() => setPopupActiveTab('ZenRadar')}
                        onSuccess={() => {
                          loadAppData(previewUser.id)
                            .then(data => {
                              if (data) {
                                setPreviewData(data);
                              } else {
                                toast.warning('Data saved but preview refresh failed. Please reopen the preview.');
                              }
                            })
                            .catch(() => {
                              toast.warning('Data saved but could not refresh preview. Please reopen the preview.');
                            });
                          setPopupActiveTab('ZenRadar');
                        }}
                      />
                    )}
                    
                    {popupActiveTab === 'ZenProfile' && (
                      <div style={{ padding: window.innerWidth < 600 ? 16 : 40, maxWidth: 800, margin: '0 auto' }}>
                         <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: window.innerWidth < 600 ? 20 : 32 }}>
                            <Shield size={24} color="#3B82F6" />
                            <h2 style={{ fontSize: window.innerWidth < 600 ? 18 : 22, fontWeight: 700, margin: 0, color: T.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Personal Details</h2>
                         </div>

                         <div style={{ display:'grid', gridTemplateColumns: window.innerWidth < 600 ? '1fr' : '1fr 1fr', gap: 16 }}>
                            <div style={{ gridColumn: window.innerWidth < 600 ? '1' : 'span 2' }}>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Full Name</label>
                               <input value={editForm.name} onChange={e=>setEditForm({...editForm, name:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14, boxSizing:'border-box' as const }} />
                            </div>
                            
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Zensar ID</label>
                               <input value={editForm.zensar_id} onChange={e=>setEditForm({...editForm, zensar_id:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Designation</label>
                               <input value={editForm.designation} onChange={e=>setEditForm({...editForm, designation:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Department</label>
                               <input value={editForm.department} onChange={e=>setEditForm({...editForm, department:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Location</label>
                               <input value={editForm.location} onChange={e=>setEditForm({...editForm, location:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Email</label>
                               <input value={editForm.email} onChange={e=>setEditForm({...editForm, email:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Phone</label>
                               <input value={editForm.phone} onChange={e=>setEditForm({...editForm, phone:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Years IT Exp</label>
                               <input type="number" value={editForm.years_it} onChange={e=>setEditForm({...editForm, years_it: parseInt(e.target.value)||0})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Years Zensar Exp</label>
                               <input type="number" value={editForm.years_zensar} onChange={e=>setEditForm({...editForm, years_zensar: parseInt(e.target.value)||0})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Primary Skill</label>
                               <input value={editForm.primary_skill} onChange={e=>setEditForm({...editForm, primary_skill:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>
                            <div>
                               <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform:'uppercase' }}>Primary Domain</label>
                               <input value={editForm.primary_domain} onChange={e=>setEditForm({...editForm, primary_domain:e.target.value})} style={{ width:'100%', background:T.input, border:`1px solid ${T.inputBdr}`, padding:14, borderRadius:10, color:T.text, marginTop:6, fontSize:14 }} />
                            </div>

                            <div style={{ gridColumn: window.innerWidth < 600 ? '1' : 'span 2' }}>
                               <label style={{ fontSize: 11, fontWeight: 800, color: '#EF4444', textTransform:'uppercase' }}>Password</label>
                               <div style={{ position:'relative', marginTop:6 }}>
                                  <Lock size={16} style={{ position:'absolute', left:14, top:16, color:'#EF4444' }} />
                                  <input type="text" value={editForm.password} onChange={e=>setEditForm({...editForm, password:e.target.value})} style={{ width:'100%', background: dark ? 'rgba(239,68,68,0.05)' : '#FEF2F2', border:'1px solid rgba(239,68,68,0.2)', padding:'14px 14px 14px 42px', borderRadius:10, color:T.text, fontSize:14, boxSizing:'border-box' as const }} />
                               </div>
                            </div>

                            <div style={{ gridColumn: window.innerWidth < 600 ? '1' : 'span 2', marginTop: 20 }}>
                               <button onClick={handleUpdateDetails} style={{ width:'100%', padding:'16px', borderRadius:12, background:'#3B82F6', border:'none', color:'#fff', fontWeight:800, fontSize:15, cursor:'pointer' }}>Update Personal Details</button>
                            </div>
                         </div>
                      </div>
                    )}
                  </div>
                </AppContext.Provider>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Employee Modal */}
      {showAddEmployeeModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: dark ? 'rgba(15,15,26,0.9)' : 'rgba(245,245,245,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, padding: 20
        }}>
          <div style={{
            background: dark ? '#1a1b2e' : '#ffffff', borderRadius: 24, width: '100%', maxWidth: 560,
            border: `1px solid ${T.bdr}`,
            boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '24px 28px 20px',
              borderBottom: `1px solid ${T.bdr}`
            }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: 0 }}>Add New Employee</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: T.sub }}>Fill in the details to create a Zensar employee account</p>
              </div>
              <button onClick={() => { setShowAddEmployeeModal(false); setResumeScanned(false); setEmailWarningConfirmed(false); setShowEmployeeDetails(false); setShowResumeUploadPage(false); setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' }); setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] }); setRawExtractedData(null); }} style={{ background: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', border: 'none', color: T.text, cursor: 'pointer', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px 28px 28px' }}>

              {/* ── RESUME UPLOAD SCANNER ── */}
              <div
                onClick={() => !resumeScanLoading && resumeFileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleResumeScan(f);
                }}
                style={{
                  border: `2px dashed ${resumeScanned ? '#10B981' : '#3B82F6'}`,
                  borderRadius: 16,
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: resumeScanLoading ? 'wait' : 'pointer',
                  background: resumeScanned
                    ? (dark ? 'rgba(16,185,129,0.08)' : '#f0fdf4')
                    : (dark ? 'rgba(59,130,246,0.06)' : '#eff6ff'),
                  marginBottom: 20,
                  transition: 'all 0.2s'
                }}
              >
                <input
                  ref={resumeFileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeScan(f); }}
                />
                {resumeScanLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <RefreshCw size={28} className="animate-spin" style={{ color: '#3B82F6' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#3B82F6' }}>AI Scanning Resume...</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Extracting name, phone, skills & more</div>
                  </div>
                ) : resumeScanned ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={28} style={{ color: '#10B981' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>Resume Scanned Successfully!</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Form auto-filled ↓ — review & complete missing fields</div>
                    <button onClick={e => { e.stopPropagation(); resumeFileRef.current?.click(); }} style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 2 }}>Upload different resume</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileUp size={24} style={{ color: '#3B82F6' }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6' }}>Upload Resume to Auto-Fill</div>
                    <div style={{ fontSize: 11, color: T.sub }}>Drag & drop or click — PDF, DOC, TXT supported</div>
                    <div style={{ fontSize: 10, color: T.sub, background: dark ? 'rgba(59,130,246,0.08)' : '#dbeafe', padding: '3px 10px', borderRadius: 99, marginTop: 2 }}>
                      <Sparkles size={10} style={{ display: 'inline', marginRight: 4 }} />
                      AI extracts: Name · Phone · Email · Designation · Location · Experience
                    </div>
                  </div>
                )}
              </div>

              {(() => {
                const inp = (label: string, key: keyof typeof newEmployee, opts: any = {}) => (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: opts.required ? T.text : T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                      {label}{opts.required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
                    </label>
                    <input
                      type={opts.type || 'text'}
                      value={newEmployee[key]}
                      onChange={e => setNewEmployee({ ...newEmployee, [key]: e.target.value })}
                      placeholder={opts.placeholder || ''}
                      maxLength={opts.maxLength}
                      style={{
                        width: '100%', padding: '13px 16px', borderRadius: 12,
                        border: `1.5px solid ${T.bdr}`,
                        background: T.input, color: T.text, fontSize: 14,
                        outline: 'none', boxSizing: 'border-box' as const,
                        fontFamily: 'inherit'
                      }}
                    />
                    {opts.hint && <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{opts.hint}</div>}
                  </div>
                );
                return (
                  <>
                    {/* ROW 1: Zensar ID */}
                    {inp('Zensar ID', 'employeeId', { required: true, placeholder: '6-digit number e.g. 741852', maxLength: 6, hint: 'Exactly 6 digits, e.g. 741852' })}

                    {/* ROW 2: Full Name */}
                    {inp('Full Name', 'name', { required: true, placeholder: 'e.g. Rahul Sharma' })}

                    {/* ROW 3: Mobile */}
                    {inp('Mobile Number', 'phone', { required: false, placeholder: '+91 98765 43210', type: 'tel' })}

                    {/* ROW 4: Email */}
                    {inp('Email', 'email', { required: true, placeholder: 'rahul@zensar.com or rahul@gmail.com', type: 'email', hint: 'Any valid email accepted (zensar.com, gmail.com, etc.)' })}

                    {/* ROW 5: Designation + Department (2-col) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Designation</label>
                        <input value={newEmployee.designation} onChange={e => setNewEmployee({ ...newEmployee, designation: e.target.value })} placeholder="QA Engineer" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Department</label>
                        <input value={newEmployee.department} onChange={e => setNewEmployee({ ...newEmployee, department: e.target.value })} placeholder="Quality Intelligence" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    </div>

                    {/* ROW 6: Location */}
                    {inp('Location', 'location', { placeholder: 'Pune, Maharashtra' })}

                    {/* ROW 7: Years IT + Years Zensar (2-col) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Years in IT</label>
                        <input type="number" min="0" max="40" value={newEmployee.yearsIT} onChange={e => setNewEmployee({ ...newEmployee, yearsIT: e.target.value })} placeholder="e.g. 5" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Years at Zensar</label>
                        <input type="number" min="0" max="40" value={newEmployee.yearsZensar} onChange={e => setNewEmployee({ ...newEmployee, yearsZensar: e.target.value })} placeholder="e.g. 2" style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: `1px solid ${T.bdr}`, margin: '8px 0 20px', position: 'relative' }}>
                      <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: dark ? '#1a1b2e' : '#ffffff', padding: '0 10px', fontSize: 11, color: T.sub, fontWeight: 600 }}>Security</span>
                    </div>

                    {/* ROW 8: Password */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Password<span style={{ color: '#EF4444', marginLeft: 3 }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
                        <input type="password" value={newEmployee.password} onChange={e => setNewEmployee({ ...newEmployee, password: e.target.value })} placeholder="Min 6 characters" style={{ width: '100%', padding: '13px 16px 13px 40px', borderRadius: 12, border: `1.5px solid ${T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    </div>

                    {/* ROW 9: Confirm Password */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Confirm Password<span style={{ color: '#EF4444', marginLeft: 3 }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <Shield size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: newEmployee.confirmPassword && newEmployee.confirmPassword === newEmployee.password ? '#10B981' : '#6B7280' }} />
                        <input type="password" value={newEmployee.confirmPassword} onChange={e => setNewEmployee({ ...newEmployee, confirmPassword: e.target.value })} placeholder="Repeat password" style={{ width: '100%', padding: '13px 16px 13px 40px', borderRadius: 12, border: `1.5px solid ${newEmployee.confirmPassword ? (newEmployee.confirmPassword === newEmployee.password ? '#10B981' : '#EF4444') : T.bdr}`, background: T.input, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      {newEmployee.confirmPassword && newEmployee.confirmPassword !== newEmployee.password && (
                        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>⚠ Passwords do not match</div>
                      )}
                      {newEmployee.confirmPassword && newEmployee.confirmPassword === newEmployee.password && (
                        <div style={{ fontSize: 11, color: '#10B981', marginTop: 4 }}>✅ Passwords match</div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* ── Inline Email Warning Banner ── */}
              {emailWarningConfirmed && (
                <div style={{
                  marginTop: 16, padding: '14px 16px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 12,
                  display: 'flex', alignItems: 'flex-start', gap: 12
                }}>
                  <Info size={20} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6' }}>External Email Detected</div>
                      <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>
                        <b style={{ color: T.text }}>{newEmployee.email}</b> is an external email.<br />
                        You can still proceed with creating this account.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setEmailWarningConfirmed(false)}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'none', color: '#F59E0B', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                    >
                      ✏️ Change Email
                    </button>
                    <button
                      onClick={() => handleAddEmployee(false, true)}
                      style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}
                    >
                      ✅ Yes, Create Anyway
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', pointerEvents: 'auto' }}>
                <button
                  onClick={() => { setShowAddEmployeeModal(false); setResumeScanned(false); setEmailWarningConfirmed(false); setShowEmployeeDetails(false); setShowResumeUploadPage(false); setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' }); setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] }); setRawExtractedData(null); }}
                  style={{ flex: 1, padding: '14px', borderRadius: 12, border: `1px solid ${T.bdr}`, background: 'none', color: T.text, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancel
                </button>

                {resumeScanned && rawExtractedData && (
                  <button
                    onClick={() => {
                      setCreatedEmployeeId(newEmployee.employeeId);
                      setShowAddEmployeeModal(false);
                      setShowResumeUploadPage(true);
                    }}
                    disabled={!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || newEmployee.employeeId.length !== 6}
                    style={{
                      flex: 2, padding: '14px', borderRadius: 12, border: `2px solid #3B82F6`,
                      background: dark ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: '#3B82F6', fontWeight: 800,
                      cursor: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || newEmployee.employeeId.length !== 6) ? 'not-allowed' : 'pointer',
                      opacity: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || newEmployee.employeeId.length !== 6) ? 0.5 : 1,
                      fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                  >
                    <Eye size={18} /> Show Details
                  </button>
                )}

                <button
                  onClick={() => handleAddEmployee(false)}
                  disabled={!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || newEmployee.employeeId.length !== 6}
                  style={{
                    flex: 2, padding: '14px', borderRadius: 12, border: 'none',
                    background: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || newEmployee.employeeId.length !== 6) ? '#9CA3AF' : 'linear-gradient(135deg, #10B981, #059669)',
                    color: '#fff', fontWeight: 800, cursor: (!newEmployee.name || !newEmployee.email.includes('@') || !newEmployee.password || newEmployee.password !== newEmployee.confirmPassword || !newEmployee.employeeId || newEmployee.employeeId.length !== 6) ? 'not-allowed' : 'pointer', fontSize: 14,
                    boxShadow: '0 8px 24px rgba(16,185,129,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}
                >
                  <Plus size={18} /> Create Account
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Admin Resume Upload Page - Shows when clicking Show Details */}
      {showResumeUploadPage && (
        <AdminResumeUploadPage
          employeeId={createdEmployeeId}
          employeeName={newEmployee.name}
          existingData={{
            skills: [],
            projects: [],
            certifications: [],
            education: [],
            profile: {
              name: newEmployee.name,
              email: newEmployee.email,
              designation: newEmployee.designation,
              yearsIT: newEmployee.yearsIT,
              location: newEmployee.location,
              phone: newEmployee.phone
            }
          }}
          preExtractedData={rawExtractedData}
          onClose={() => {
            // Go back to the add employee form with all data intact
            setShowResumeUploadPage(false);
            setShowAddEmployeeModal(true);
          }}
          onSuccess={() => {
            // Employee was created and data saved inside AdminResumeUploadPage — just clean up
            setShowResumeUploadPage(false);
            setShowAddEmployeeModal(false);
            setResumeScanned(false);
            setEmailWarningConfirmed(false);
            setNewEmployee({ name: '', email: '', designation: '', employeeId: '', location: '', phone: '', department: '', yearsIT: '', yearsZensar: '', password: '', confirmPassword: '' });
            setExtractedDetails({ skills: [] as {name: string; rating: number}[], projects: [], certificates: [], education: [] });
            setRawExtractedData(null);
            setActiveTab('Manage Employees');
            loadAllData();
            toast.success('Employee created and resume data saved!');
          }}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}; }
      `}</style>
    </div>
  );
}
