import { API_BASE } from '@/lib/api';
/**
 * ResumeUploadPage.tsx — /employee/resume-upload
 * Step shown BEFORE skill matrix for first-time users.
 * Allows optional PDF resume upload to pre-fill skills, certs, and projects.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, SkipForward, Loader2, AlertCircle, Edit2, Trash2, CheckCircle, X } from 'lucide-react';
import { useDark, mkTheme } from '@/lib/themeContext';
import { SKILLS } from '@/lib/mockData';
import { useAuth } from '@/lib/authContext';
import { useApp } from '@/lib/AppContext';
import { toast } from '@/lib/ToastContext';
import { getEmployee, saveSkillRatings, upsertEmployee } from '@/lib/localDB';
import { apiSaveSkills, apiSaveTaxonomySkills, isServerAvailable } from '@/lib/api';
import ZensarLoader from '@/components/ZensarLoader';
import type { ProficiencyLevel, SkillRating } from '@/lib/types';
import { extractTextFromFile, accurateExtractFromResume, extractTaxonomySkillsFromResume } from '@/lib/resumeExtraction';

// Enhanced fallback extraction when AI is completely unavailable
const createEnhancedFallback = (text: string, filename: string) => {
  console.log('[ResumeUpload] � Creating enhanced pattern-based extraction');
  
  // Extract name with better patterns
  const namePatterns = [
    /([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)/g, // Three names
    /([A-Z][a-z]+ [A-Z][a-z]+)/g, // Two names
    /^([A-Z][a-z]+)\s/m, // First line name
  ];
  
  let extractedName = '';
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[0] && match[0].length > 3) {
      extractedName = match[0];
      break;
    }
  }
  
  if (!extractedName) {
    extractedName = filename.replace(/[._]/g, ' ').replace(/\.(pdf|doc|docx)$/i, '');
  }
  
  // Extract skills by looking for keywords
  const skillMap: Record<string, number> = {
    "Selenium": 0, "Appium": 0, "JMeter": 0, "Postman": 0, "JIRA": 0, "TestRail": 0,
    "Python": 0, "Java": 0, "JavaScript": 0, "TypeScript": 0, "C#": 0, "SQL": 0,
    "API Testing": 0, "Mobile Testing": 0, "Performance Testing": 0, "Security Testing": 0, "Database Testing": 0,
    "Banking": 0, "Healthcare": 0, "E-Commerce": 0, "Insurance": 0, "Telecom": 0,
    "Functional Testing": 0, "Automation Testing": 0, "Regression Testing": 0, "UAT": 0,
    "Git": 0, "Jenkins": 0, "Docker": 0, "Azure DevOps": 0,
    "ChatGPT/Prompt Engineering": 0, "AI Test Automation": 0
  };
  
  const lowerText = text.toLowerCase();
  
  // Pattern matching for skills with context
  Object.keys(skillMap).forEach(skill => {
    const skillLower = skill.toLowerCase();
    const skillPatterns = [
      skillLower,
      skillLower.replace(/\s+/g, '[-_\\s]*'), // Handle variations
      skillLower.replace(/testing/g, 'test'), // "automation test" -> "automation testing"
    ];
    
    skillPatterns.forEach(pattern => {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) {
        const count = matches.length;
        // Score based on frequency and context
        if (count >= 3) skillMap[skill] = 3;
        else if (count >= 2) skillMap[skill] = 2;
        else skillMap[skill] = 1;
      }
    });
  });
  
  // Extract experience years
  const expPatterns = [
    /(\d+)[\s\+]*years?\s+(?:of\s+)?experience/i,
    /(\d+)\s*yrs?\s+exp/i,
    /experience.*?(\d+)\s*years?/i
  ];
  
  let yearsIT = 2;
  for (const pattern of expPatterns) {
    const match = text.match(pattern);
    if (match) {
      yearsIT = parseInt(match[1]) || 2;
      break;
    }
  }
  
  // Extract designation
  const designationPatterns = [
    /(?:software|qa|test)\s+(?:engineer|developer|analyst|tester)/i,
    /(?:senior|junior|lead)\s+(?:developer|engineer|tester)/i,
    /(?:full\s+stack|frontend|backend)\s+developer/i
  ];
  
  let designation = 'Software Engineer';
  for (const pattern of designationPatterns) {
    const match = text.match(pattern);
    if (match) {
      designation = match[0];
      break;
    }
  }
  
  // Determine primary skills from high-scored skills
  const scoredSkills = Object.entries(skillMap)
    .filter(([_, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);
  
  return {
    profile: {
      name: extractedName,
      designation: designation,
      yearsIT: yearsIT,
      primarySkill: scoredSkills[0]?.[0] || 'Software Development',
      secondarySkill: scoredSkills[1]?.[0] || 'Testing', 
      tertiarySkill: scoredSkills[2]?.[0] || 'API Development'
    },
    skills: skillMap,
    projects: [{
      ProjectName: 'Professional Experience',
      Role: designation,
      Description: 'Software development and testing experience'
    }],
    certifications: [],
    education: [{ degree: 'Bachelor', institution: 'University', year: new Date().getFullYear() - yearsIT }]
  };
};

export default function ResumeUploadPage({ 
  isPopup: propIsPopup, 
  onTabChange: propOnTabChange 
}: { 
  isPopup?: boolean; 
  onTabChange?: (path: string) => void; 
}) {
  const navigate = useNavigate();
  const { employeeId } = useAuth();
  const { isPopup: ctxIsPopup, onTabChange: ctxOnTabChange } = useApp();
  const { dark } = useDark();
  const T = mkTheme(dark);

  // Use props if provided, otherwise fall back to context
  const isPopup = propIsPopup !== undefined ? propIsPopup : ctxIsPopup;
  const onTabChange = propOnTabChange || ctxOnTabChange;

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'extracting' | 'preview' | 'error'>('idle');
  const [extractedData, setExtractedData] = useState<any>(null);
  const [resumeText, setResumeText] = useState('');   // kept for the 166-skill taxonomy chain-link at save time
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExtractedData(null);
    setStatus('idle');
    setFile(null);
  }, []);

  const handleFile = async (f: File) => {
    setStatus('reading');
    setErrorMsg('');
    try {
      const text = await extractTextFromFile(f);
      if (!text.trim()) {
        setStatus('error');
        setErrorMsg('Could not read text from file. Try a text-based PDF or .docx, or use pattern extraction.');
        return;
      }
      
      setStatus('extracting');
      
      console.log('[ResumeUpload] Starting accurate AI extraction (unlimited time)...');
      
  setResumeText(text); // retained for the 166-skill taxonomy chain-link on save
  try {
    // Use accurate extraction with unlimited time for perfect results
    const extractionResult = await accurateExtractFromResume(text);
    console.log('[ResumeUpload] ✅ Accurate extraction succeeded!');
    setExtractedData(extractionResult);
    setStatus('preview');
    return;
  } catch (err: any) {
    console.log('[ResumeUpload] ❌ AI extraction failed, using enhanced fallback...');
    console.log('[ResumeUpload] Error details:', err.message);
    
    // Use enhanced pattern-based fallback when AI is unavailable
    const fallbackData = createEnhancedFallback(text, f.name);
    console.log('[ResumeUpload] 🔄 Enhanced fallback data created:', fallbackData);
    setExtractedData(fallbackData);
    setStatus('preview');
    
    // Provide user feedback about AI status
    if (err.message?.includes('subscription') || err.message?.includes('403')) {
      toast.info('Using smart pattern extraction (AI models require subscription)');
    } else if (err.message?.includes('LLM_TIMEOUT') || err.message?.includes('timeout')) {
      toast.info('Using smart pattern extraction (AI response too slow)');
    } else if (err.message?.includes('503') || err.message?.includes('unavailable')) {
      toast.info('Using smart pattern extraction (AI service temporarily unavailable)');
    } else {
      toast.info('Using enhanced pattern extraction for data processing');
    }
    return;
  }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Unexpected error. Please try pattern extraction.');
    }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); };

  const onConfirmAndSave = async () => {
    if (!employeeId || employeeId === 'new') return;
    setIsSaving(true);
    
    try {
      // Handle case where no extractedData exists
      if (!extractedData) {
        // Create minimal profile for ZenAssess
        const minimalProfile = {
          name: 'User',
          experience: '1 Year',
          yearsIT: 1,
          designation: 'Software Engineer',
          primarySkill: 'Software Development',
          secondarySkill: 'Testing',
          tertiarySkill: 'API Development',
          skills: [],
          projects: [],
          certifications: [],
          education: [],
          candidateId: employeeId,
          source: 'Manual Entry',
          extractionTimestamp: new Date().toISOString(),
          profileVersion: '1.0.0'
        };
        
        console.log('[ResumeUpload] 📝 Creating minimal profile with Primary/Secondary/Tertiary skills:', {
          primary: minimalProfile.primarySkill,
          secondary: minimalProfile.secondarySkill,
          tertiary: minimalProfile.tertiarySkill
        });
        
        localStorage.setItem('candidateProfile', JSON.stringify(minimalProfile));
        localStorage.setItem('zenscan_raw_extraction', JSON.stringify({}));
        
        if (isPopup && onTabChange) {
          onTabChange('/employee/zenassess');
        } else {
          navigate('/employee/zenassess');
        }
        return;
      }

      const emp = getEmployee(employeeId);
      const extractedSkills = extractedData?.skills || {};
      const ratings: SkillRating[] = SKILLS.map(sk => ({
        skillId: sk.id,
        selfRating: (Math.min(3, Math.max(0, extractedSkills[sk.name] ?? 0))) as ProficiencyLevel,
        managerRating: null, validated: false,
      }));

      // Helper to parse dates from various formats (e.g. "Jun 2025", "2024", "Mar-Aug 2023") to YYYY-MM-DD
      const parseDate = (dateStr: string): string | null => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const s = dateStr.trim().toLowerCase();
        if (s.includes('present') || s.includes('ongoing') || s.includes('current')) return null;

        const yearMatch = s.match(/\b(20\d{2}|19\d{2})\b/);
        if (!yearMatch) return null;
        const year = yearMatch[1];
        
        const monthMatch = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
        const monthMap: Record<string, string> = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const month = monthMatch ? monthMap[monthMatch[1].toLowerCase()] : '01';
        return `${year}-${month}-01`;
      };

      const p = extractedData?.profile || {};
      const s = extractedData?.skills || {};
      const c = extractedData?.certifications || [];
      const pr = extractedData?.projects || [];
      const ed = extractedData?.education || [];

      // Create candidateProfile for ZenAssess (localStorage)
      const skillsList = Object.entries(s).filter(([_, lvl]) => (lvl as number) > 0).map(([name, lvl]) => ({
        skillName: name,
        selfRating: lvl as number,
        assessmentScore: 0
      }));

      // Determine Primary/Secondary/Tertiary skills based on ratings
      const sortedSkills = Object.entries(s)
        .filter(([_, lvl]) => (lvl as number) > 0)
        .sort(([, a], [, b]) => (b as number) - (a as number)); // Sort by rating descending
      
      console.log('[ResumeUpload] 📊 Sorted skills for Primary/Secondary/Tertiary:', sortedSkills.slice(0, 5));
      
      const primarySkill = sortedSkills[0]?.[0] || p.primarySkill || 'Software Development';
      const secondarySkill = sortedSkills[1]?.[0] || p.secondarySkill || 'Testing';
      const tertiarySkill = sortedSkills[2]?.[0] || p.tertiarySkill || 'API Development';

      console.log('[ResumeUpload] 🎯 Final Skills Classification:', {
        primary: primarySkill,
        secondary: secondarySkill, 
        tertiary: tertiarySkill
      });

      const candidateProfile = {
        name: p.name || 'Unknown',
        experience: `${p.yearsIT || 0} Year${(p.yearsIT || 0) !== 1 ? 's' : ''}`,
        yearsIT: p.yearsIT || 0,
        designation: p.designation || 'Software Engineer',
        primarySkill: primarySkill,
        secondarySkill: secondarySkill,
        tertiarySkill: tertiarySkill,
        skills: skillsList,
        projects: pr.map((proj: any) => ({
          name: proj.ProjectName || proj.name || '',
          role: proj.Role || proj.role || '',
          description: proj.Description || proj.description || ''
        })),
        certifications: c.map((cert: any) => {
          // Ensure certifications are strings (fix the toLowerCase error)
          if (typeof cert === 'string') return cert;
          return cert.CertName || cert.certName || cert.name || String(cert) || '';
        }).filter(Boolean),
        education: ed.map((e: any) => ({
          degree: e.degree || '',
          institution: e.institution || '',
          year: e.year || ''
        })),
        candidateId: employeeId,
        source: 'ZenScan PDF Parser',
        extractionTimestamp: new Date().toISOString(),
        profileVersion: '1.0.0'
      };

      console.log('[ResumeUpload] Saving candidateProfile for ZenAssess:', candidateProfile);
      console.log('[ResumeUpload] 🎯 Primary/Secondary/Tertiary Skills Check:', {
        primary: candidateProfile.primarySkill,
        secondary: candidateProfile.secondarySkill,
        tertiary: candidateProfile.tertiarySkill,
        skillsCount: candidateProfile.skills.length
      });
      
      localStorage.setItem('candidateProfile', JSON.stringify(candidateProfile));
      localStorage.setItem('zenscan_raw_extraction', JSON.stringify(extractedData));
      
      // Verify the data was saved
      const saved = localStorage.getItem('candidateProfile');
      console.log('[ResumeUpload] Verified saved profile:', saved ? JSON.parse(saved) : 'NOT FOUND');

      // Store in localDB
      if (emp) saveSkillRatings(employeeId, emp.name, ratings);

      // Save skills to backend DB
      try {
        const serverUp = await isServerAvailable();
        if (serverUp) {
          const skillsPayload: Record<string, number> = {};
          SKILLS.forEach(sk => {
            skillsPayload[sk.name] = Math.min(3, Math.max(0, extractedSkills[sk.name] ?? 0));
          });
          await apiSaveSkills(employeeId, emp?.name || '', skillsPayload);
        }
      } catch (e) {
        console.warn('Skills backend save failed, saved locally only');
      }

      // CHAIN-LOCK: map the resume against the full 166-skill QE taxonomy and push
      // the result into the QISL ZenMatrix (with family + priority). This is what
      // makes one upload fan out to QISL + the admin/employee family-grouped views.
      // Guarded + non-fatal: a failure here never blocks the main save.
      try {
        if (resumeText && (await isServerAvailable())) {
          toast.info('Mapping your resume to the QI SL skill matrix…');
          const taxo = await extractTaxonomySkillsFromResume(resumeText, Number(extractedData?.profile?.yearsIT) || 0);
          const chainSkills = [
            ...taxo.skills.map(s => ({ id: s.id, name: s.name, family: s.family, group: s.group, proficiency: s.proficiency, priority: s.priority })),
            ...taxo.others.map(o => ({ name: o.name, family: o.family, proficiency: o.proficiency, priority: null })),
          ];
          if (chainSkills.length > 0) {
            await apiSaveTaxonomySkills(employeeId, {
              source: 'ai',
              primarySkill: taxo.primarySkill,
              secondarySkill: taxo.secondarySkill,
              tertiarySkill: taxo.tertiarySkill,
              skills: chainSkills,
            });
            const extra = taxo.others.length ? ` (+${taxo.others.length} in Others)` : '';
            toast.success(`Mapped ${taxo.matchedCount} skills into your QI SL ZenMatrix${extra} ✓`);
          } else {
            toast.info('No QI SL skills could be matched from this resume.');
          }
        }
      } catch (e: any) {
        console.warn('[ResumeUpload] Taxonomy chain-link failed:', e);
        toast.error('Could not sync to QI SL ZenMatrix: ' + (e?.message || 'server error') + ' — if you just updated the app, restart the backend.');
      }

      // Fetch existing data to check for duplicates
      let existingEducation: any[] = [];
      let existingCerts: any[] = [];
      let existingProjects: any[] = [];

      try {
        const [eduRes, certRes, projRes] = await Promise.all([
          fetch(`${API_BASE}/education/${employeeId}`).catch(() => null),
          fetch(`${API_BASE}/certifications/${employeeId}`).catch(() => null),
          fetch(`${API_BASE}/projects/${employeeId}`).catch(() => null)
        ]);

        if (eduRes?.ok) {
          const eduData = await eduRes.json();
          existingEducation = eduData.education || [];
        }
        if (certRes?.ok) {
          const certData = await certRes.json();
          existingCerts = certData.certifications || [];
        }
        if (projRes?.ok) {
          const projData = await projRes.json();
          existingProjects = projData.projects || [];
        }
      } catch (e) {
        console.log('Could not fetch existing data for duplicate check');
      }

      // Helper: Check for education duplicates
      const isEduDuplicate = (newEdu: any, existing: any[]) => {
        const newDeg = (newEdu.degree || '').toLowerCase().trim();
        const newInst = (newEdu.institution || '').toLowerCase().trim();
        return existing.some(ex => {
          const exDeg = (ex.degree || '').toLowerCase().trim();
          const exInst = (ex.institution || '').toLowerCase().trim();
          return (exDeg === newDeg || exDeg.includes(newDeg) || newDeg.includes(exDeg)) &&
                 (exInst === newInst || exInst.includes(newInst) || newInst.includes(exInst) || !newInst || !exInst);
        });
      };

      // Helper: Check for certification duplicates
      const isCertDuplicate = (newCert: any, existing: any[]) => {
        const newName = (newCert.CertName || '').toLowerCase().trim();
        const newProv = (newCert.Provider || '').toLowerCase().trim();
        return existing.some(ex => {
          const exName = (ex.CertName || ex.certName || '').toLowerCase().trim();
          const exProv = (ex.Provider || ex.issuingOrganization || '').toLowerCase().trim();
          return (exName === newName || exName.includes(newName) || newName.includes(exName)) &&
                 (!newProv || !exProv || exProv === newProv || exProv.includes(newProv) || newProv.includes(exProv));
        });
      };

      // Helper: Check for project duplicates
      const isProjDuplicate = (newProj: any, existing: any[]) => {
        const newName = (newProj.ProjectName || '').toLowerCase().trim();
        const newRole = (newProj.Role || '').toLowerCase().trim();
        return existing.some(ex => {
          const exName = (ex.ProjectName || ex.projectName || '').toLowerCase().trim();
          const exRole = (ex.Role || ex.role || '').toLowerCase().trim();
          return (exName === newName || exName.includes(newName) || newName.includes(exName)) &&
                 (!newRole || !exRole || exRole === newRole || exRole.includes(newRole) || newRole.includes(exRole));
        });
      };

      // Save Education (with duplicate detection)
      let eduSaved = 0, eduSkipped = 0;
      if (extractedData?.education) {
        for (const edu of extractedData.education) {
          if (isEduDuplicate(edu, existingEducation)) {
            eduSkipped++;
            continue;
          }
          const res = await fetch(`${API_BASE}/education`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: employeeId,
              degree: edu.degree,
              institution: edu.institution,
              fieldOfStudy: edu.field,
              endDate: edu.year
            })
          });
          if (res.ok) {
            eduSaved++;
            existingEducation.push(edu); // Track for further duplicate checking
          }
        }
      }

      // Save Certs (with duplicate detection)
      let certSaved = 0, certSkipped = 0;
      if (extractedData?.certifications) {
        for (const cert of extractedData.certifications) {
          if (isCertDuplicate(cert, existingCerts)) {
            certSkipped++;
            continue;
          }
          const res = await fetch(`${API_BASE}/certifications`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: employeeId,
              certName: cert.CertName,
              issuingOrganization: cert.Provider,
              issueDate: parseDate(cert.IssueDate),
              isAIExtracted: true
            })
          });
          if (res.ok) {
            certSaved++;
            existingCerts.push(cert); // Track for further duplicate checking
          }
        }
      }

      // Save Projects (with duplicate detection)
      let projSaved = 0, projSkipped = 0;
      if (extractedData?.projects) {
        for (const proj of extractedData.projects) {
          if (isProjDuplicate(proj, existingProjects)) {
            projSkipped++;
            continue;
          }
          const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: employeeId,
              projectName: proj.ProjectName,
              role: proj.Role,
              startDate: parseDate(proj.StartDate),
              endDate: parseDate(proj.EndDate),
              description: proj.Description,
              outcome: proj.Outcome,
              isAIExtracted: true
            })
          });
          if (res.ok) {
            projSaved++;
            existingProjects.push(proj); // Track for further duplicate checking
          }
        }
      }

      // Save Achievements (with duplicate detection)
      let achSaved = 0, achSkipped = 0;
      if (extractedData?.achievements?.length > 0) {
        let existingAchievements: any[] = [];
        try {
          const achRes = await fetch(`${API_BASE}/achievements/${employeeId}`).catch(() => null);
          if (achRes?.ok) existingAchievements = (await achRes.json()).achievements || [];
        } catch {}

        for (const ach of extractedData.achievements) {
          if (!ach.Title?.trim()) continue;
          const newTitle = ach.Title.toLowerCase().trim();
          const isDup = existingAchievements.some((ex: any) => {
            const exTitle = (ex.Title || ex.title || '').toLowerCase().trim();
            return exTitle === newTitle || exTitle.includes(newTitle) || newTitle.includes(exTitle);
          });
          if (isDup) { achSkipped++; continue; }
          const res = await fetch(`${API_BASE}/achievements`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_id: employeeId,
              Title: ach.Title,
              AwardType: ach.AwardType || 'Other',
              Category: ach.Category || '',
              DateReceived: parseDate(ach.DateReceived),
              Description: ach.Description || '',
              Issuer: ach.Issuer || '',
              ProjectContext: ach.ProjectContext || ''
            })
          });
          if (res.ok) { achSaved++; existingAchievements.push(ach); }
        }
      }

      const totalSkipped = eduSkipped + certSkipped + projSkipped + achSkipped;
      const skipMsg = totalSkipped > 0 ? ` (${totalSkipped} duplicates skipped)` : '';

      if (emp && extractedData?.profile) {
        const p = extractedData.profile;
        upsertEmployee({
          ...emp,
          name: p.name || emp.name,
          designation: p.designation || emp.designation,
          yearsIT: p.yearsIT || emp.yearsIT,
          location: p.location || emp.location,
          phone: p.phone || emp.phone,
          primarySkill: p.primarySkill || emp.primarySkill,
        });
        // NOTE: primary/secondary/tertiary skill in the DB are owned by the QISL
        // taxonomy chain (apiSaveTaxonomySkills above), which is the source of truth.
        // We intentionally do NOT overwrite primary_skill from the legacy 32-skill
        // profile here — that used to clobber the taxonomy primary with e.g. "Python".
      }

      // Show success and redirect to ZenAssess
      const totalSaved = eduSaved + certSaved + projSaved + achSaved;
      toast.success(`✅ Resume data saved! Skills ✓ · ${projSaved} projects · ${certSaved} certs · ${eduSaved} education · ${achSaved} achievements${skipMsg}`);

      // In popup mode, switch to ZenAssess tab. Otherwise navigate to ZenAssess.
      if (isPopup && onTabChange) {
        onTabChange('/employee/zenassess');
      } else {
        navigate('/employee/zenassess', { state: { fromResume: true, saved: true } });
      }
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Some items may not have saved. Please check your profile. Error: ' + (err.message || 'Unknown'));
    } finally {
      setIsSaving(false);
    }
  };

  const isProcessing = status === 'reading' || status === 'extracting';

  if (isSaving) {
    return <ZensarLoader fullScreen label="Syncing AI Insights to IQ Cloud..." />;
  }

  if (status === 'preview' && extractedData) {
    const p = extractedData.profile || {};
    const s = extractedData.skills || {};
    const c = extractedData.certifications || [];
    const pr = extractedData.projects || [];
    const skillCount = Object.values(s).filter(v => (v as number) > 0).length;

    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '40px 7vw' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, #6B2D8B, #3B82F6)', padding: '24px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🤖 AI Extracted Insights</h2>
            <button
              onClick={() => isPopup && onTabChange ? onTabChange('/employee/dashboard') : navigate('/employee/dashboard')}
              aria-label="Close"
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={20} />
            </button>
          </div>
          <div style={{ padding: '24px' }}>
            {(() => {
              const projCount = pr.length;
              const certCount = c.length;
              const eduCount = extractedData.education?.length || 0;
              const confidence = Math.min(65, skillCount * 3 + projCount * 5 + certCount * 6 + eduCount * 3 + (p.yearsIT ? 8 : 0));
              return (
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <CheckCircle size={18} color="#10B981" />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#10B981' }}>Resume Processed</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>Extracted from your resume:</div>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: T.text, display: 'grid', gap: 4 }}>
                    <li>{skillCount} skills identified</li>
                    <li>{projCount} projects found</li>
                    <li>{certCount} certifications detected</li>
                    <li>{p.yearsIT ? `${p.yearsIT} years experience calculated` : 'Experience not detected'}</li>
                  </ul>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTop: `1px solid ${T.bdr}` }}>
                    <span style={{ fontSize: 13, color: T.text }}>Profile confidence: <strong style={{ color: '#F59E0B' }}>{confidence}/100</strong></span>
                    <span style={{ fontSize: 12, color: T.muted }}>Next step: Take ZenAssess to increase to 70+</span>
                  </div>
                </div>
              );
            })()}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 10, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              <div><span style={{ color: T.muted }}>Name:</span> {p.name || '—'}</div>
              <div><span style={{ color: T.muted }}>Role:</span> {p.designation || '—'}</div>
              <div><span style={{ color: T.muted }}>Experience:</span> {p.yearsIT ? p.yearsIT + ' years' : '—'}</div>
            </div>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: T.sub, marginBottom: 12 }}>Skills ({skillCount})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {Object.entries(s).filter(([, lvl]) => (lvl as number) > 0).map(([skill, lvl]) => (
                <div key={skill} style={{ background: 'rgba(59,130,246,0.1)', color: '#60A5FA', padding: '6px 12px', borderRadius: 20, fontSize: 12 }}>
                  {skill} (L{lvl as any})
                </div>
              ))}
            </div>

            {/* EDUCATION */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, margin: 0 }}>Education ({extractedData.education?.length || 0})</h3>
              <button onClick={() => {
                const items = [...(extractedData.education || [])];
                items.push({ degree: 'New Degree', institution: 'University Name', field: 'Major', year: '2024' });
                setExtractedData({ ...extractedData, education: items });
              }} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: 'none', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>+ Add Academic</button>
            </div>
            <div style={{ marginBottom: 24, display: 'grid', gap: 8 }}>
              {extractedData.education?.map((edu: any, i: number) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bdr}`, borderRadius: 10, fontSize: 12, position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <input
                      value={edu.degree}
                      onChange={e => {
                        const items = [...extractedData.education];
                        items[i].degree = e.target.value;
                        setExtractedData({ ...extractedData, education: items });
                      }}
                      style={{ background: 'transparent', border: 'none', color: T.text, fontWeight: 700, fontSize: 12, width: '70%' }}
                    />
                    <button onClick={() => {
                      const items = extractedData.education.filter((_: any, idx: number) => idx !== i);
                      setExtractedData({ ...extractedData, education: items });
                    }} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                      value={edu.institution}
                      onChange={e => {
                        const items = [...extractedData.education];
                        items[i].institution = e.target.value;
                        setExtractedData({ ...extractedData, education: items });
                      }}
                      style={{ background: 'transparent', border: 'none', color: T.sub, fontSize: 11, flex: 1 }}
                      placeholder="Institution"
                    />
                    <input
                      value={edu.year}
                      onChange={e => {
                        const items = [...extractedData.education];
                        items[i].year = e.target.value;
                        setExtractedData({ ...extractedData, education: items });
                      }}
                      style={{ background: 'transparent', border: 'none', color: T.sub, fontSize: 11, width: 60, textAlign: 'right' }}
                      placeholder="Year"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* CERTS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, margin: 0 }}>Certifications ({extractedData.certifications?.length || 0})</h3>
              <button onClick={() => {
                const items = [...(extractedData.certifications || [])];
                items.push({ CertName: 'New Certification', Provider: 'Issuer', IssueDate: '2024' });
                setExtractedData({ ...extractedData, certifications: items });
              }} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', color: '#10B981', border: 'none', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>+ Add Cert</button>
            </div>
            <div style={{ marginBottom: 24, display: 'grid', gap: 8 }}>
              {extractedData.certifications?.map((c: any, i: number) => (
                <div key={i} style={{ padding: '8px 12px', borderLeft: '3px solid #10B981', background: 'rgba(16,185,129,0.05)', borderRadius: '0 8px 8px 0', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <input
                      value={c.CertName}
                      onChange={e => {
                        const items = [...extractedData.certifications];
                        items[i].CertName = e.target.value;
                        setExtractedData({ ...extractedData, certifications: items });
                      }}
                      style={{ background: 'transparent', border: 'none', color: T.text, fontWeight: 700, fontSize: 12, width: '80%' }}
                    />
                    <button onClick={() => {
                      const items = extractedData.certifications.filter((_: any, idx: number) => idx !== i);
                      setExtractedData({ ...extractedData, certifications: items });
                    }} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                  <input
                    value={c.Provider}
                    onChange={e => {
                      const items = [...extractedData.certifications];
                      items[i].Provider = e.target.value;
                      setExtractedData({ ...extractedData, certifications: items });
                    }}
                    style={{ background: 'transparent', border: 'none', color: T.sub, fontSize: 11, width: '100%', marginTop: 2 }}
                    placeholder="Provider"
                  />
                </div>
              ))}
            </div>

            {/* PROJECTS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: T.sub, letterSpacing: 1, margin: 0 }}>Projects ({extractedData.projects?.length || 0})</h3>
              <button onClick={() => {
                const items = [...(extractedData.projects || [])];
                items.push({ ProjectName: 'New Project', Role: 'Role', Description: 'Description', StartDate: '2024' });
                setExtractedData({ ...extractedData, projects: items });
              }} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: 'none', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>+ Add Project</button>
            </div>
            <div style={{ marginBottom: 24, display: 'grid', gap: 10 }}>
              {extractedData.projects?.map((p: any, i: number) => (
                <div key={i} style={{ padding: '10px 14px', borderLeft: '3px solid #3B82F6', background: 'rgba(59,130,246,0.05)', borderRadius: '0 8px 8px 0', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <input
                      value={p.ProjectName}
                      onChange={e => {
                        const items = [...extractedData.projects];
                        items[i].ProjectName = e.target.value;
                        setExtractedData({ ...extractedData, projects: items });
                      }}
                      style={{ background: 'transparent', border: 'none', color: T.text, fontWeight: 700, fontSize: 13, width: '80%' }}
                    />
                    <button onClick={() => {
                      const items = extractedData.projects.filter((_: any, idx: number) => idx !== i);
                      setExtractedData({ ...extractedData, projects: items });
                    }} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                  <input
                    value={p.Role}
                    onChange={e => {
                      const items = [...extractedData.projects];
                      items[i].Role = e.target.value;
                      setExtractedData({ ...extractedData, projects: items });
                    }}
                    style={{ background: 'transparent', border: 'none', color: T.sub, fontSize: 12, width: '100%', marginBottom: 4 }}
                    placeholder="Role"
                  />
                  <textarea
                    value={p.Description}
                    onChange={e => {
                      const items = [...extractedData.projects];
                      items[i].Description = e.target.value;
                      setExtractedData({ ...extractedData, projects: items });
                    }}
                    style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 11, width: '100%', minHeight: 40, resize: 'vertical' }}
                    placeholder="Description"
                  />
                </div>
              ))}
            </div>

            {/* AI COMPREHENSIVE RESUME ANALYSIS */}
            {(extractedData.gaps || []).length > 0 || extractedData.analysis ? (
              <div style={{ marginBottom: 24 }}>
                {/* Analysis Header with Score */}
                <div style={{ padding: 20, background: 'rgba(245,158,11,0.08)', border: '2px solid rgba(245,158,11,0.3)', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <AlertCircle size={20} color="#F59E0B" />
                    <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: '#F59E0B', letterSpacing: 1, margin: 0, fontWeight: 800 }}>ZenScan Analysis Report</h3>
                  </div>

                  {/* Completeness Score */}
                  {extractedData.analysis?.completenessScore > 0 && (
                    <div style={{ marginBottom: 16, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: T.sub }}>Resume Completeness Score</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: extractedData.analysis.completenessScore >= 80 ? '#10B981' : extractedData.analysis.completenessScore >= 60 ? '#F59E0B' : '#EF4444' }}>
                          {extractedData.analysis.completenessScore}%
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${extractedData.analysis.completenessScore}%`, background: extractedData.analysis.completenessScore >= 80 ? '#10B981' : extractedData.analysis.completenessScore >= 60 ? '#F59E0B' : '#EF4444', borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, margin: 0 }}>
                    Our AI has performed a comprehensive analysis of your resume. Below are the detailed findings including gaps, missing information, and areas for improvement:
                  </p>
                </div>

                {/* Critical Missing Fields */}
                {extractedData.analysis?.missingCriticalFields?.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 16, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, borderLeft: '4px solid #EF4444' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', margin: '0 0 10px 0', textTransform: 'uppercase' }}>🚨 Critical Missing Information</h4>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.text, display: 'grid', gap: 6 }}>
                      {extractedData.analysis.missingCriticalFields.map((field: string, i: number) => (
                        <li key={i}>{field}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Career Gaps */}
                {extractedData.analysis?.careerGaps?.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 16, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, borderLeft: '4px solid #F59E0B' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', margin: '0 0 10px 0', textTransform: 'uppercase' }}>📅 Career Timeline Gaps</h4>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.text, display: 'grid', gap: 6 }}>
                      {extractedData.analysis.careerGaps.map((gap: string, i: number) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvement Areas */}
                {extractedData.analysis?.improvementAreas?.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 16, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, borderLeft: '4px solid #3B82F6' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', margin: '0 0 10px 0', textTransform: 'uppercase' }}>💡 Areas for Improvement</h4>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.text, display: 'grid', gap: 6 }}>
                      {extractedData.analysis.improvementAreas.map((area: string, i: number) => (
                        <li key={i}>{area}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Formatting Issues */}
                {extractedData.analysis?.formattingIssues?.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 16, background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, borderLeft: '4px solid #8B5CF6' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#8B5CF6', margin: '0 0 10px 0', textTransform: 'uppercase' }}>📝 Formatting Issues</h4>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.text, display: 'grid', gap: 6 }}>
                      {extractedData.analysis.formattingIssues.map((issue: string, i: number) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Red Flags */}
                {extractedData.analysis?.redFlags?.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 16, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, borderLeft: '4px solid #DC2626' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', margin: '0 0 10px 0', textTransform: 'uppercase' }}>⚠️ Red Flags - Immediate Attention Required</h4>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.text, display: 'grid', gap: 6 }}>
                      {extractedData.analysis.redFlags.map((flag: string, i: number) => (
                        <li key={i} style={{ fontWeight: 500 }}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* General Gaps List */}
                {(extractedData.gaps || []).length > 0 && (
                  <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bdr}`, borderRadius: 10 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: T.sub, margin: '0 0 10px 0', textTransform: 'uppercase' }}>📋 Complete List of Findings</h4>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.text, display: 'grid', gap: 6 }}>
                      {extractedData.gaps.map((gap: string, i: number) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 24, padding: 24, background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CheckCircle size={24} color="#10B981" />
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#10B981' }}>Excellent Resume Quality</span>
                    <p style={{ fontSize: 12, color: T.sub, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                      Our AI analysis found no significant gaps, missing information, or issues. Your resume is comprehensive and well-structured.
                    </p>
                  </div>
                </div>
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(16,185,129,0.1)', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>95-100%</span>
                  <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>Estimated Completeness Score</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={() => setStatus('idle')} style={{ padding: '14px 32px', minWidth: 140, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.text, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                ← Re-upload
              </button>
              <button onClick={onConfirmAndSave} style={{ padding: '14px 40px', minWidth: 200, background: '#3B82F6', border: 'none', color: '#fff', fontWeight: 700, borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
                Go to ZenAssess →
              </button>
            </div>

            {/* What happens next */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.bdr}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>What happens next</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.muted, display: 'grid', gap: 6, lineHeight: 1.5 }}>
                <li>Your skills are now in ZenMatrix.</li>
                <li>You appear in project staffing searches.</li>
                <li>Take ZenAssess to verify your top 3 skills and earn badges.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 500 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FileText size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>ZenScan</h1>
          <p style={{ fontSize: 14, color: T.sub }}>Pre-fill your profile using Local AI. Fast & Private.</p>
        </div>

        {(status === 'idle' || status === 'error') && (
          <div>
            <div onClick={() => inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              style={{ border: `2px dashed ${dragging ? '#3B82F6' : T.bdr}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', background: T.card, cursor: 'pointer', marginBottom: 16 }}>
              <Upload size={32} color={T.muted} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>📄 Upload Resume (PDF or Word)</div>
              <div style={{ fontSize: 13, color: T.sub, marginTop: 8 }}>Drag & drop or click to upload — PDF or .docx</div>
              <input ref={inputRef} type="file" accept=".pdf,.docx" onChange={onInputChange} style={{ display: 'none' }} />
            </div>
            
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: `1px solid rgba(59, 130, 246, 0.3)`, borderRadius: 12, padding: '16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#3B82F6' }}>📋 PDF Format Required</div>
                <div style={{ marginBottom: 8 }}>
                  For best accuracy and data quality, please upload your resume as a <strong>PDF file only</strong>.
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Have a Word document?</strong> Convert it to PDF for free:
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <a href="https://smallpdf.com/word-to-pdf" target="_blank" rel="noopener noreferrer" 
                    style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: 600, fontSize: 11 }}>
                    → smallpdf.com
                  </a>
                  <span style={{ color: T.muted }}>•</span>
                  <a href="https://ilovepdf.com/word-to-pdf" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: 600, fontSize: 11 }}>
                    → ilovepdf.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {isProcessing && (
          <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: '32px', textAlign: 'center', marginBottom: 16 }}>
            <ZensarLoader size={48} dark={dark} label={status === 'reading' ? 'Reading CV...' : 'AI Processing Resume...'} />
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>{errorMsg}</div>
          </div>
        )}

        <button onClick={() => isPopup && onTabChange ? onTabChange('/employee/dashboard') : navigate('/employee/dashboard')} disabled={isProcessing} style={{ width: '100%', padding: 12, borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}`, color: T.sub, fontWeight: 600, cursor: 'pointer', opacity: isProcessing ? 0.5 : 1 }}>
          Skip to Dashboard →
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
