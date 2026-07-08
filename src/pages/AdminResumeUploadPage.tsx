import { API_BASE, apiSaveTaxonomySkills } from '@/lib/api';
/**
 * AdminResumeUploadPage.tsx — Admin-specific resume upload with side-by-side comparison
 */
import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckSquare, Square, X, Save, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useDark, mkTheme } from '@/lib/themeContext';
import { SKILLS } from '@/lib/mockData';
import { toast } from '@/lib/ToastContext';
import ZensarLoader from '@/components/ZensarLoader';
import type { ProficiencyLevel, SkillRating } from '@/lib/types';
import { extractTextFromFile, extractEverythingFromResume, extractTaxonomySkillsFromResume } from '@/lib/resumeExtraction';

interface AdminResumeUploadPageProps {
  employeeId: string;
  employeeName: string;
  existingData: {
    skills: SkillRating[];
    projects: any[];
    certifications: any[];
    education: any[];
    achievements?: any[];
    profile?: any;
  };
  onClose: () => void;
  onSuccess: () => void;
  preExtractedData?: {
    skills: Record<string, number>;
    projects: any[];
    certifications: any[];
    education: any[];
    achievements?: any[];
    profile?: any;
  } | null;
}

export default function AdminResumeUploadPage({ 
  employeeId, 
  employeeName, 
  existingData, 
  onClose, 
  onSuccess,
  preExtractedData
}: AdminResumeUploadPageProps) {
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'extracting' | 'preview' | 'error'>('idle');
  const [extractedData, setExtractedData] = useState<any>(null);
  const [resumeText, setResumeText] = useState('');   // retained for the 166-skill taxonomy chain-link on save
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    skills: true,
    projects: true,
    certifications: true,
    education: true,
    achievements: true,
    profile: true
  });
  
  // Selection states for EXISTING data (to keep/delete)
  const [existingSkillsSelected, setExistingSkillsSelected] = useState<Record<string, boolean>>({});
  const [existingProjectsSelected, setExistingProjectsSelected] = useState<Record<number, boolean>>({});
  const [existingCertsSelected, setExistingCertsSelected] = useState<Record<number, boolean>>({});
  const [existingEducationSelected, setExistingEducationSelected] = useState<Record<number, boolean>>({});
  const [existingAchievementsSelected, setExistingAchievementsSelected] = useState<Record<number, boolean>>({});
  const [existingProfileSelected, setExistingProfileSelected] = useState<Record<string, boolean>>({});
  // Fallback: skills fetched directly from API when existingData.skills is empty
  const [fetchedExistingSkills, setFetchedExistingSkills] = useState<any[]>([]);

  // Selection states for NEW/EXTRACTED data (to import)
  const [selectedSkills, setSelectedSkills] = useState<Record<string, boolean>>({});
  const [selectedProjects, setSelectedProjects] = useState<Record<number, boolean>>({});
  const [selectedCerts, setSelectedCerts] = useState<Record<number, boolean>>({});
  const [selectedEducation, setSelectedEducation] = useState<Record<number, boolean>>({});
  const [selectedAchievements, setSelectedAchievements] = useState<Record<number, boolean>>({});
  const [selectedProfileFields, setSelectedProfileFields] = useState<Record<string, boolean>>({});
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize existing data selections on mount (all selected by default)
  // Also fetch skills directly from API if existingData.skills is empty (fallback)
  useEffect(() => {
    const initFromSkills = (skills: any[]) => {
      const existingSkillMap: Record<string, boolean> = {};
      skills?.forEach((s) => {
        if (s && s.skillId) existingSkillMap[s.skillId] = false;
      });
      setExistingSkillsSelected(existingSkillMap);
    };

    if (existingData.skills?.length > 0) {
      initFromSkills(existingData.skills);
    } else if (employeeId) {
      // Fallback: fetch skills directly from API
      fetch(`${API_BASE}/employees`)
        .then(r => r.json())
        .then(({ employees, skills: allSkills }) => {
          const emp = (employees || []).find((e: any) =>
            String(e.id).toLowerCase() === String(employeeId).toLowerCase() ||
            String(e.zensar_id || '').toLowerCase() === String(employeeId).toLowerCase()
          );
          if (!emp) return;
          const empId = String(emp.id || '').toLowerCase();
          const zid = String(emp.zensar_id || '').toLowerCase();
          const empSkills = (allSkills || []).filter((s: any) => {
            const sid = String(s.employee_id || s.employeeId || '').toLowerCase();
            return sid === empId || sid === zid;
          });
          const mapped = empSkills
            .filter((s: any) => parseInt(String(s.self_rating ?? 0)) > 0)
            .map((s: any) => ({
              skillId: String(s.skill_name || s.SkillName || '').trim(),
              selfRating: parseInt(String(s.self_rating ?? 0)) as any,
              managerRating: null,
              validated: false
            }));
          initFromSkills(mapped);
          // Also update the displayed existing skills list
          setFetchedExistingSkills(mapped);
        })
        .catch(() => {});
    }

    // Initialize existing projects (all selected by default)
    const existingProjMap: Record<number, boolean> = {};
    existingData.projects?.forEach((_, i) => existingProjMap[i] = true);
    setExistingProjectsSelected(existingProjMap);
    
    // Initialize existing certs (all selected by default)
    const existingCertMap: Record<number, boolean> = {};
    existingData.certifications?.forEach((_, i) => existingCertMap[i] = true);
    setExistingCertsSelected(existingCertMap);
    
    // Initialize existing education (all selected by default)
    const existingEduMap: Record<number, boolean> = {};
    existingData.education?.forEach((_, i) => existingEduMap[i] = true);
    setExistingEducationSelected(existingEduMap);

    // Initialize existing achievements (all selected by default)
    const existingAchievementsMap: Record<number, boolean> = {};
    existingData.achievements?.forEach((_: any, i: number) => {
      existingAchievementsMap[i] = true;
    });
    setExistingAchievementsSelected(existingAchievementsMap);

    // Initialize existing profile fields (all selected by default)
    const existingProfileMap: Record<string, boolean> = {};
    if (existingData.profile) {
      Object.keys(existingData.profile).forEach(key => {
        if (existingData.profile[key]) existingProfileMap[key] = true;
      });
    }
    setExistingProfileSelected(existingProfileMap);
  }, [existingData, employeeId]);

  // Process pre-extracted data if provided (from AdminDashboard resume scan)
  useEffect(() => {
    if (preExtractedData) {
      // Convert skills array to object format if needed
      let skillsObj: Record<string, number> = {};
      if (Array.isArray(preExtractedData.skills)) {
        // Handle array format: [{name: "Java", rating: 3}]
        preExtractedData.skills.forEach((s: any) => {
          if (typeof s === 'string') {
            skillsObj[s] = 3; // Default rating
          } else if (s && s.name) {
            skillsObj[s.name] = s.rating || s.level || 3;
          }
        });
      } else {
        // Already in object format: { "Java": 3 }
        skillsObj = preExtractedData.skills || {};
      }

      // Convert projects to expected format
      const projectsArr = (preExtractedData.projects || []).map((p: any) => ({
        ProjectName: p.name || p.ProjectName || 'Untitled',
        Role: p.Role || '',
        StartDate: p.StartDate || p.duration || '',
        Description: p.description || p.Description || '',
        Outcome: p.Outcome || ''
      }));

      // Convert certifications to expected format
      const certsArr = (preExtractedData.certifications || []).map((c: any) => ({
        CertName: c.name || c.CertName || '',
        Provider: c.issuer || c.Provider || '',
        IssueDate: c.date || c.IssueDate || ''
      }));

      // Convert education to expected format
      const eduArr = (preExtractedData.education || []).map((e: any) => ({
        degree: e.degree || '',
        institution: e.institution || '',
        field: e.field || '',
        year: e.year || ''
      }));

      // Convert achievements to expected format
      const achievementsArr = (preExtractedData.achievements || []).map((a: any) => ({
        Title: a.Title || a.title || '',
        AwardType: a.AwardType || a.awardType || 'Other',
        Category: a.Category || a.category || '',
        DateReceived: a.DateReceived || a.dateReceived || a.date || '',
        Description: a.Description || a.description || '',
        Issuer: a.Issuer || a.issuer || '',
        ProjectContext: a.ProjectContext || a.projectContext || ''
      }));

      const formattedData = {
        skills: skillsObj,
        customSkills: preExtractedData.customSkills || [],
        projects: projectsArr,
        certifications: certsArr,
        education: eduArr,
        achievements: achievementsArr,
        profile: preExtractedData.profile || null
      };

      setExtractedData(formattedData);
      setStatus('preview');
      
      // Initialize extracted items as SELECTED by default (admin can deselect what they don't want)
      const skillMap: Record<string, boolean> = {};
      Object.entries(skillsObj).forEach(([skill, lvl]) => {
        if ((lvl as number) > 0) skillMap[skill] = false;
      });
      // Also init custom skills
      (preExtractedData.customSkills || []).forEach((cs: any) => {
        if (cs.name) skillMap[cs.name] = false;
      });
      setSelectedSkills(skillMap);
      
      const projMap: Record<number, boolean> = {};
      projectsArr.forEach((_: any, i: number) => projMap[i] = false);
      setSelectedProjects(projMap);
      
      const certMap: Record<number, boolean> = {};
      certsArr.forEach((_: any, i: number) => certMap[i] = false);
      setSelectedCerts(certMap);
      
      const eduMap: Record<number, boolean> = {};
      eduArr.forEach((_: any, i: number) => eduMap[i] = false);
      setSelectedEducation(eduMap);

      // Achievements: pre-selected by default
      const achievementsMap: Record<number, boolean> = {};
      achievementsArr.forEach((_: any, i: number) => achievementsMap[i] = true);
      setSelectedAchievements(achievementsMap);

      const profileMap: Record<string, boolean> = {};
      if (formattedData.profile) {
        Object.keys(formattedData.profile).forEach(key => {
          if (formattedData.profile[key]) profileMap[key] = false;
        });
      }
      setSelectedProfileFields(profileMap);
    }
  }, [preExtractedData]);

  const handleFile = async (f: File) => {
    setFile(f);
    setStatus('reading');
    setErrorMsg('');
    try {
      const text = await extractTextFromFile(f);
      if (!text.trim()) {
        setStatus('error');
        setErrorMsg('Could not read text from file. Try a text-based PDF or .docx.');
        return;
      }
      setResumeText(text); // retained for the 166-skill taxonomy chain-link on save
      setStatus('extracting');
      let data;
      try {
        data = await extractEverythingFromResume(text);
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err?.message || 'AI could not extract data. Please try again.');
        return;
      }
      if (!data) {
        setStatus('error');
        setErrorMsg('AI could not extract data. Please try again.');
        return;
      }
      setExtractedData(data);
      
      const skillMap: Record<string, boolean> = {};
      Object.entries(data.skills || {}).forEach(([skill, lvl]) => {
        if ((lvl as number) > 0) skillMap[skill] = false;
      });
      (data.customSkills || []).forEach((cs: any) => {
        if (cs.name) skillMap[cs.name] = false;
      });
      setSelectedSkills(skillMap);
      
      const projMap: Record<number, boolean> = {};
      (data.projects || []).forEach((_: any, i: number) => projMap[i] = false);
      setSelectedProjects(projMap);
      
      const certMap: Record<number, boolean> = {};
      (data.certifications || []).forEach((_: any, i: number) => certMap[i] = false);
      setSelectedCerts(certMap);
      
      const eduMap: Record<number, boolean> = {};
      (data.education || []).forEach((_: any, i: number) => eduMap[i] = false);
      setSelectedEducation(eduMap);

      // Achievements: pre-selected by default
      const achievementsMap: Record<number, boolean> = {};
      (data.achievements || []).forEach((_: any, i: number) => achievementsMap[i] = true);
      setSelectedAchievements(achievementsMap);

      const profileMap: Record<string, boolean> = {};
      if (data.profile) {
        Object.keys(data.profile).forEach(key => {
          if (data.profile[key]) profileMap[key] = false;
        });
      }
      setSelectedProfileFields(profileMap);
      
      setStatus('preview');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Unexpected error. Please try again.');
    }
  };

  const onDrop = (e: React.DragEvent) => { 
    e.preventDefault(); 
    setDragging(false); 
    const f = e.dataTransfer.files?.[0]; 
    if (f) handleFile(f); 
  };
  
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
    const f = e.target.files?.[0]; 
    if (f) handleFile(f); 
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const selectAllInSection = (section: string, items: any[], selectedMap: Record<string | number, boolean>, setSelectedMap: (map: any) => void) => {
    const allSelected = Object.keys(selectedMap).length === items.length && Object.values(selectedMap).every(v => v);
    const newMap: any = {};
    items.forEach((_, i) => newMap[i] = !allSelected);
    setSelectedMap(newMap);
  };

  // Helper: Check if education is a duplicate (case-insensitive matching on degree and institution)
  const isEducationDuplicate = (newEdu: any, existingEdus: any[]) => {
    if (!existingEdus || existingEdus.length === 0) return false;
    const newDegree = (newEdu.degree || '').toLowerCase().trim();
    const newInstitution = (newEdu.institution || '').toLowerCase().trim();
    const newField = (newEdu.field || newEdu.fieldOfStudy || '').toLowerCase().trim();

    return existingEdus.some(existing => {
      const existingDegree = (existing.degree || '').toLowerCase().trim();
      const existingInstitution = (existing.institution || '').toLowerCase().trim();
      const existingField = (existing.fieldOfStudy || existing.field || '').toLowerCase().trim();

      // Match if degree and (institution OR field) are similar
      const degreeMatch = existingDegree === newDegree || existingDegree.includes(newDegree) || newDegree.includes(existingDegree);
      const institutionMatch = existingInstitution === newInstitution || existingInstitution.includes(newInstitution) || newInstitution.includes(existingInstitution);
      const fieldMatch = existingField === newField || existingField.includes(newField) || newField.includes(existingField);

      return degreeMatch && (institutionMatch || fieldMatch || (!newInstitution && !existingInstitution));
    });
  };

  // Helper: Check if certification is a duplicate (case-insensitive matching on cert name and provider)
  const isCertificationDuplicate = (newCert: any, existingCerts: any[]) => {
    if (!existingCerts || existingCerts.length === 0) return false;
    const newName = (newCert.CertName || newCert.certName || '').toLowerCase().trim();
    const newProvider = (newCert.Provider || newCert.issuingOrganization || '').toLowerCase().trim();

    return existingCerts.some(existing => {
      const existingName = (existing.CertName || existing.certName || '').toLowerCase().trim();
      const existingProvider = (existing.Provider || existing.issuingOrganization || '').toLowerCase().trim();

      // Match if cert names are similar
      const nameMatch = existingName === newName || existingName.includes(newName) || newName.includes(existingName);
      const providerMatch = !newProvider || !existingProvider || existingProvider === newProvider || existingProvider.includes(newProvider) || newProvider.includes(existingProvider);

      return nameMatch && providerMatch;
    });
  };

  // Helper: Check if project is a duplicate (case-insensitive matching on project name and role)
  const isProjectDuplicate = (newProject: any, existingProjects: any[]) => {
    if (!existingProjects || existingProjects.length === 0) return false;
    const newName = (newProject.ProjectName || newProject.projectName || '').toLowerCase().trim();
    const newRole = (newProject.Role || newProject.role || '').toLowerCase().trim();

    return existingProjects.some(existing => {
      const existingName = (existing.ProjectName || existing.projectName || '').toLowerCase().trim();
      const existingRole = (existing.Role || existing.role || '').toLowerCase().trim();

      // Match if project names are similar
      const nameMatch = existingName === newName || existingName.includes(newName) || newName.includes(existingName);
      const roleMatch = !newRole || !existingRole || existingRole === newRole || existingRole.includes(newRole) || newRole.includes(existingRole);

      return nameMatch && roleMatch;
    });
  };

  // Helper: Check if achievement is a duplicate (case-insensitive matching on title and issuer)
  const isAchievementDuplicate = (newAchievement: any, existingAchievements: any[]) => {
    if (!existingAchievements || existingAchievements.length === 0) return false;
    const newTitle = (newAchievement.Title || newAchievement.title || '').toLowerCase().trim();
    const newIssuer = (newAchievement.Issuer || newAchievement.issuer || '').toLowerCase().trim();

    return existingAchievements.some(existing => {
      const existingTitle = (existing.Title || existing.title || '').toLowerCase().trim();
      const existingIssuer = (existing.Issuer || existing.issuer || '').toLowerCase().trim();

      // Match if titles are similar
      const titleMatch = existingTitle === newTitle || existingTitle.includes(newTitle) || newTitle.includes(existingTitle);
      const issuerMatch = !newIssuer || !existingIssuer || existingIssuer === newIssuer || existingIssuer.includes(newIssuer) || newIssuer.includes(existingIssuer);

      return titleMatch && issuerMatch;
    });
  };

  const onSaveSelected = async () => {
    if (!employeeId) return;
    setIsSaving(true);
    try {
      const empName = employeeName;
      let savedCount = 0;
      let deletedCount = 0;
      let duplicateSkippedCount = 0;

      // First ensure employee exists in database
      const empCheckRes = await fetch(`${API_BASE}/employees/${employeeId}`);
      let dbEmployeeId = employeeId;
      
      if (!empCheckRes.ok) {
        // Employee doesn't exist — create with proper data using admin endpoint
        const profile = existingData?.profile || {};
        const createRes = await fetch(`${API_BASE}/admin/create-employee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: employeeId,
            name: empName || profile.name || 'Unknown',
            email: profile.email || `${employeeId}@zensar.com`,
            phone: profile.phone || '',
            designation: profile.designation || '',
            location: profile.location || '',
            yearsIT: parseFloat(profile.yearsIT || '0') || 0,
            yearsZensar: 0,
            password: 'zensar123',
            skills: [],
            projects: [],
            certificates: [],
            education: []
          })
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          toast.error(`Cannot save: ${err.error || 'Employee creation failed'}`);
          setIsSaving(false);
          return;
        }
        const createdEmp = await createRes.json().catch(() => null);
        if (createdEmp?.id) dbEmployeeId = createdEmp.id;
        await new Promise(r => setTimeout(r, 300));
      } else {
        const existingEmp = await empCheckRes.json().catch(() => null);
        if (existingEmp?.id) dbEmployeeId = existingEmp.id;
      }
      
      // Verify employee exists
      const verifyRes = await fetch(`${API_BASE}/employees/${dbEmployeeId}`);
      if (!verifyRes.ok) {
        toast.error('Employee verification failed. Please try again.');
        setIsSaving(false);
        return;
      }

      // === DELETE UNCHECKED EXISTING SKILLS ===
      const skillsToDelete = existingData.skills?.filter((s: any) => s?.skillId && !existingSkillsSelected[s.skillId]);
      for (const skill of skillsToDelete || []) {
        const encodedSkillId = encodeURIComponent(skill.skillId);
        const res = await fetch(`${API_BASE}/skills/${dbEmployeeId}/${encodedSkillId}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.text().catch(() => 'Unknown error');
          console.error('Failed to delete skill:', skill.skillId, err);
          toast.error(`Failed to delete skill: ${err}`);
        } else {
          deletedCount++;
        }
      }

      // Save selected NEW skills (both predefined and custom extracted)
      const extractedSkills = extractedData?.skills || {};
      const customSkillsArr: any[] = extractedData?.customSkills || [];
      const skillsToSave: SkillRating[] = [];

      // Process predefined skills
      Object.entries(extractedSkills).forEach(([skillName, level]) => {
        const lvl = level as number;
        if (lvl > 0 && selectedSkills[skillName]) {
          const predefinedSkill = SKILLS.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
          if (predefinedSkill) {
            skillsToSave.push({
              skillId: predefinedSkill.id,
              selfRating: Math.min(3, Math.max(0, lvl)) as ProficiencyLevel,
              managerRating: null,
              validated: false,
            });
          }
        }
      });

      // Process custom skills
      customSkillsArr.forEach((cs: any) => {
        const skillName = cs.name || '';
        const lvl = cs.rating || 3;
        if (skillName && selectedSkills[skillName]) {
          skillsToSave.push({
            skillId: skillName,
            selfRating: Math.min(5, Math.max(1, lvl)) as ProficiencyLevel,
            managerRating: null,
            validated: false,
          });
        }
      });
      if (skillsToSave.length > 0) {
        const res = await fetch(`${API_BASE}/skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Pass dbEmployeeId so server uses the real DB primary key (avoids FK violation)
          body: JSON.stringify({ dbEmployeeId, employeeId, skills: skillsToSave })
        });
        if (!res.ok) {
          const err = await res.text().catch(() => 'Unknown error');
          console.error('Failed to save skills:', err);
          toast.error(`Failed to save skills: ${err}`);
        } else {
          savedCount += skillsToSave.length;
        }
      }

      // === DELETE UNCHECKED EXISTING EDUCATION ===
      const educationToDelete = existingData.education?.filter((_: any, i: number) => !existingEducationSelected[i]);
      for (const edu of educationToDelete || []) {
        if (edu.id) {
          const res = await fetch(`${API_BASE}/education/${edu.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.text().catch(() => 'Unknown error');
            console.error('Failed to delete education:', edu.id, err);
            toast.error(`Failed to delete education: ${err}`);
          } else {
            deletedCount++;
          }
        }
      }

      // Get remaining existing education (not deleted) to check for duplicates
      const remainingExistingEducation = existingData.education?.filter((_: any, i: number) => existingEducationSelected[i]) || [];
      const newlySavedEducation: any[] = [];

      // Save selected NEW education (with duplicate detection)
      const educationToSave = (extractedData?.education || [])
        .filter((_: any, i: number) => selectedEducation[i]);
      for (const edu of educationToSave) {
        // Check for duplicates against remaining existing AND newly saved education
        const allExistingEdus = [...remainingExistingEducation, ...newlySavedEducation];
        if (isEducationDuplicate(edu, allExistingEdus)) {
          console.log('Skipping duplicate education:', edu.degree, edu.institution);
          duplicateSkippedCount++;
          continue;
        }

        const res = await fetch(`${API_BASE}/education`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: dbEmployeeId,
            degree: edu.degree,
            institution: edu.institution,
            fieldOfStudy: edu.field,
            endDate: edu.year
          })
        });
        if (!res.ok) {
          const err = await res.text().catch(() => 'Unknown error');
          console.error('Failed to save education:', err);
          toast.error(`Failed to save education: ${err}`);
        } else {
          savedCount++;
          newlySavedEducation.push(edu); // Track for duplicate checking
        }
      }

      // === DELETE UNCHECKED EXISTING CERTIFICATIONS ===
      const certsToDelete = existingData.certifications?.filter((_: any, i: number) => !existingCertsSelected[i]);
      for (const cert of certsToDelete || []) {
        const certId = cert.id || cert.CertID;
        if (certId) {
          const res = await fetch(`${API_BASE}/certifications/${certId}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.text().catch(() => 'Unknown error');
            console.error('Failed to delete certification:', certId, err);
            toast.error(`Failed to delete certification: ${err}`);
          } else {
            deletedCount++;
          }
        }
      }

      // Get remaining existing certifications (not deleted) to check for duplicates
      const remainingExistingCerts = existingData.certifications?.filter((_: any, i: number) => existingCertsSelected[i]) || [];
      const newlySavedCerts: any[] = [];

      // Save selected NEW certifications (with duplicate detection)
      const certsToSave = (extractedData?.certifications || [])
        .filter((_: any, i: number) => selectedCerts[i]);
      for (const cert of certsToSave) {
        // Check for duplicates against remaining existing AND newly saved certifications
        const allExistingCerts = [...remainingExistingCerts, ...newlySavedCerts];
        if (isCertificationDuplicate(cert, allExistingCerts)) {
          console.log('Skipping duplicate certification:', cert.CertName, cert.Provider);
          duplicateSkippedCount++;
          continue;
        }

        const res = await fetch(`${API_BASE}/certifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: dbEmployeeId,
            certName: cert.CertName,
            issuingOrganization: cert.Provider,
            issueDate: cert.IssueDate,
            isAIExtracted: true
          })
        });
        if (!res.ok) {
          const err = await res.text().catch(() => 'Unknown error');
          console.error('Failed to save certification:', err);
          toast.error(`Failed to save certification: ${err}`);
        } else {
          savedCount++;
          newlySavedCerts.push(cert); // Track for duplicate checking
        }
      }

      // === DELETE UNCHECKED EXISTING PROJECTS ===
      const projectsToDelete = existingData.projects?.filter((_: any, i: number) => !existingProjectsSelected[i]);
      for (const proj of projectsToDelete || []) {
        const projId = proj.id || proj.ProjectID;
        if (projId) {
          const res = await fetch(`${API_BASE}/projects/${projId}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.text().catch(() => 'Unknown error');
            console.error('Failed to delete project:', projId, err);
            toast.error(`Failed to delete project: ${err}`);
          } else {
            deletedCount++;
          }
        }
      }

      // Helper to parse dates from various formats to YYYY-MM-DD
      const parseDate = (dateStr: string): string | null => {
        if (!dateStr || dateStr.toLowerCase().includes('present')) return null;
        
        // Try to extract year and month from formats like "Jun-Aug 2025", "Jan 2023", "2024"
        const yearMatch = dateStr.match(/\b(20\d{2})\b/);
        if (!yearMatch) return null;
        
        const year = yearMatch[1];
        const monthMatch = dateStr.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
        
        if (monthMatch) {
          const monthMap: Record<string, string> = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
          };
          const month = monthMap[monthMatch[1].toLowerCase()] || '01';
          return `${year}-${month}-01`;
        }
        
        return `${year}-01-01`; // Default to Jan 1 if no month found
      };

      // Get remaining existing projects (not deleted) to check for duplicates
      const remainingExistingProjects = existingData.projects?.filter((_: any, i: number) => existingProjectsSelected[i]) || [];
      const newlySavedProjects: any[] = [];

      // Save selected NEW projects (with duplicate detection)
      const projectsToSave = (extractedData?.projects || [])
        .filter((_: any, i: number) => selectedProjects[i]);
      console.log('Saving projects:', projectsToSave.length, 'for employee:', employeeId);
      for (const proj of projectsToSave) {
        // Check for duplicates against remaining existing AND newly saved projects
        const allExistingProjects = [...remainingExistingProjects, ...newlySavedProjects];
        if (isProjectDuplicate(proj, allExistingProjects)) {
          console.log('Skipping duplicate project:', proj.ProjectName, proj.Role);
          duplicateSkippedCount++;
          continue;
        }

        const formattedStartDate = parseDate(proj.StartDate);
        const formattedEndDate = proj.EndDate ? parseDate(proj.EndDate) : null;

        const body: any = {
          employee_id: dbEmployeeId,  // Use actual database ID for foreign key
          ZensarID: employeeId,
          EmployeeID: employeeId,
          EmployeeName: empName,
          ProjectName: proj.ProjectName || 'Untitled Project',
          Role: proj.Role || 'Team Member',
          Description: proj.Description || '',
          Outcome: proj.Outcome || '',
          IsAIExtracted: true
        };

        // Only add dates if they're valid
        if (formattedStartDate) body.startDate = formattedStartDate;
        if (formattedEndDate) body.endDate = formattedEndDate;

        // Ensure consistent field names for the backend
        body.projectName = body.ProjectName; delete body.ProjectName;
        body.role = body.Role; delete body.Role;
        body.description = body.Description; delete body.Description;
        body.outcome = body.Outcome; delete body.Outcome;
        body.isAIExtracted = body.IsAIExtracted; delete body.IsAIExtracted;

        console.log('Project POST body:', body);
        const res = await fetch(`${API_BASE}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const err = await res.text().catch(() => 'Unknown error');
          console.error('Failed to save project:', err);
          toast.error(`Failed to save project: ${err}`);
        } else {
          savedCount++;
          newlySavedProjects.push(proj); // Track for duplicate checking
        }
      }

      // === DELETE UNCHECKED EXISTING ACHIEVEMENTS ===
      const achievementsToDelete = existingData.achievements?.filter((_: any, i: number) => !existingAchievementsSelected[i]);
      for (const ach of achievementsToDelete || []) {
        const achId = ach.id || ach.ID;
        if (achId) {
          const res = await fetch(`${API_BASE}/achievements/${achId}`, { method: 'DELETE' });
          if (res.ok) deletedCount++;
        }
      }

      // Get remaining existing achievements (not deleted) to check for duplicates
      const remainingExistingAchievements = existingData.achievements?.filter((_: any, i: number) => existingAchievementsSelected[i]) || [];
      const newlySavedAchievements: any[] = [];

      // Save selected NEW achievements (with duplicate detection)
      const achievementsToSave = (extractedData?.achievements || [])
        .filter((_: any, i: number) => selectedAchievements[i]);
      for (const ach of achievementsToSave) {
        // Check for duplicates against remaining existing AND newly saved achievements
        const allExistingAchievements = [...remainingExistingAchievements, ...newlySavedAchievements];
        if (isAchievementDuplicate(ach, allExistingAchievements)) {
          console.log('Skipping duplicate achievement:', ach.Title, ach.Issuer);
          duplicateSkippedCount++;
          continue;
        }

        const body = {
          employee_id: dbEmployeeId,
          ZensarID: employeeId,
          EmployeeID: employeeId,
          Title: ach.Title || 'Untitled Achievement',
          AwardType: ach.AwardType || 'Other',
          Category: ach.Category || '',
          DateReceived: ach.DateReceived || null,
          Description: ach.Description || '',
          Issuer: ach.Issuer || '',
          ProjectContext: ach.ProjectContext || ''
        };

        const res = await fetch(`${API_BASE}/achievements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const err = await res.text().catch(() => 'Unknown error');
          console.error('Failed to save achievement:', err);
          toast.error(`Failed to save achievement: ${err}`);
        } else {
          savedCount++;
          newlySavedAchievements.push(ach); // Track for duplicate checking
        }
      }

      // === HANDLE PROFILE FIELDS ===
      // Clear unchecked existing profile fields
      const profileClears: any = {};
      ['name', 'email', 'designation', 'yearsIT', 'location', 'phone', 'primary_skill', 'secondary_skill', 'tertiary_skill'].forEach(key => {
        if (existingData.profile?.[key] && !existingProfileSelected[key]) {
          profileClears[key] = null; // Clear the field
        }
      });
      
      // Add selected new profile fields
      if (extractedData?.profile) {
        const keyMap: Record<string, string> = {
          name: 'name',
          email: 'email',
          designation: 'designation',
          yearsIT: 'yearsIT',
          location: 'location',
          phone: 'phone',
          primarySkill: 'primary_skill',
          secondarySkill: 'secondary_skill',
          tertiarySkill: 'tertiary_skill'
        };
        Object.keys(selectedProfileFields).forEach(key => {
          if (selectedProfileFields[key] && extractedData.profile[key]) {
            const dbKey = keyMap[key] || key;
            profileClears[dbKey] = extractedData.profile[key];
          }
        });
      }
      
      if (Object.keys(profileClears).length > 0) {
        await fetch(`${API_BASE}/admin/employees/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: employeeId, ...profileClears })
        }).catch(() => {});
        savedCount++;
      }

      // Create CandidateProfile object and raw extraction for validation
      if (extractedData) {
        const p = extractedData.profile || {};
        const s = extractedData.skills || {};
        const c = extractedData.certifications || [];
        const pr = extractedData.projects || [];
        const ed = extractedData.education || [];

        const skillsList = Object.entries(s).filter(([_, lvl]) => (lvl as number) > 0).map(([name, lvl]) => ({
          skillName: name,
          selfRating: lvl as number,
          assessmentScore: 0
        }));

        const projectsList = pr.map((proj: any) => ({
          name: proj.ProjectName || proj.name || '',
          role: proj.Role || proj.role || '',
          description: proj.Description || proj.description || '',
          technologies: proj.technologies || (proj.skills_used || '').split ? (proj.technologies || proj.skills_used || '').split(/[,;]+/).map((t: string) => t.trim()).filter(Boolean) : [],
          skills: proj.skills || (proj.skills_used || '').split ? (proj.skills_used || '').split(/[,;]+/).map((t: string) => t.trim()).filter(Boolean) : [],
          domain: proj.Domain || proj.domain || '',
        }));

        const certsList = c.map((cert: any) => cert.CertName || cert.certName || cert || '');
        const educationList = ed.map((e: any) => ({
          degree: e.degree || '',
          institution: e.institution || '',
          year: e.year || ''
        }));

        const candidateProfile = {
          name: p.name || 'Unknown',
          experience: `${p.yearsIT || 0} Year${(p.yearsIT || 0) !== 1 ? 's' : ''}`,
          yearsIT: p.yearsIT || 0,
          designation: p.designation || 'Software Engineer',
          skills: skillsList,
          projects: projectsList,
          certifications: certsList,
          domains: Array.from(new Set(projectsList.map((proj: any) => proj.domain).filter(Boolean))),
          education: educationList,
          candidateId: employeeId,
          source: 'ZenScan PDF Parser (Admin)',
          extractionTimestamp: new Date().toISOString(),
          profileVersion: '1.0.0'
        };

        localStorage.setItem('candidateProfile', JSON.stringify(candidateProfile));
        localStorage.setItem('zenscan_raw_extraction', JSON.stringify(extractedData));
      }

      // CHAIN-LOCK: map the resume to the full 166-skill QE taxonomy and populate
      // the employee's QISL ZenMatrix (family + priority). Guarded + non-fatal.
      try {
        if (resumeText) {
          const taxo = await extractTaxonomySkillsFromResume(resumeText, Number(extractedData?.profile?.yearsIT) || 0);
          const chainSkills = [
            ...taxo.skills.map(s => ({ id: s.id, name: s.name, family: s.family, group: s.group, proficiency: s.proficiency, priority: s.priority })),
            ...taxo.others.map(o => ({ name: o.name, family: o.family, proficiency: o.proficiency, priority: null })),
          ];
          if (chainSkills.length > 0) {
            await apiSaveTaxonomySkills(dbEmployeeId, {
              source: 'ai',
              primarySkill: taxo.primarySkill,
              secondarySkill: taxo.secondarySkill,
              tertiarySkill: taxo.tertiarySkill,
              skills: chainSkills,
            });
            const extra = taxo.others.length ? ` (+${taxo.others.length} in Others)` : '';
            toast.success(`Mapped ${taxo.matchedCount} skills into the QI SL ZenMatrix${extra} ✓`);
          }
        }
      } catch (e: any) {
        console.warn('[AdminResumeUpload] Taxonomy chain-link failed:', e);
        toast.error('Could not sync to QI SL ZenMatrix: ' + (e?.message || 'server error') + ' — if you just updated the app, restart the backend.');
      }

      const msg = [];
      if (savedCount > 0) msg.push(`Saved ${savedCount} new items`);
      if (deletedCount > 0) msg.push(`Removed ${deletedCount} old items`);
      if (duplicateSkippedCount > 0) msg.push(`Skipped ${duplicateSkippedCount} duplicates`);
      toast.success(msg.join(', ') || 'No changes made');
      onSuccess();
    } catch (err: any) {
      toast.error('Error saving resume data: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const isProcessing = status === 'reading' || status === 'extracting';

  if (isSaving) {
    return <ZensarLoader fullScreen label="Saving selected resume data..." />;
  }

  if (status === 'preview' && extractedData) {
    const p = extractedData.profile || {};
    const s = extractedData.skills || {};
    const c = extractedData.certifications || [];
    const pr = extractedData.projects || [];
    const ed = extractedData.education || [];
    
    const standardSkillNames = new Set(SKILLS.map(sk => sk.name.toLowerCase()));

    // Predefined skills with rating > 0
    const predefinedExtracted = Object.entries(s)
      .filter(([skill, lvl]) => (lvl as number) > 0 && standardSkillNames.has(skill.toLowerCase()));

    // Custom skills from customSkills array (not in predefined list)
    const customSkillsRaw: Array<any> = extractedData.customSkills || [];
    const customExtracted: Array<[string, number]> = customSkillsRaw
      .filter((cs: any) => {
        const name = (cs.name || '').toLowerCase();
        return name && !standardSkillNames.has(name);
      })
      .map((cs: any) => [cs.name, cs.rating || 3] as [string, number]);

    // Merge: predefined first, then custom
    const extractedSkillsList: Array<[string, number]> = [...predefinedExtracted as Array<[string, number]>, ...customExtracted];
    // Use fetched skills as fallback if existingData.skills is empty
    // Only show standard ZenMatrix skills (filter out custom/non-standard skills from previous uploads)
    const effectiveExistingSkills = (existingData.skills?.length > 0
      ? existingData.skills
      : fetchedExistingSkills
    ).filter((skill: any) => {
      const name = (SKILLS.find(s => s.id === skill.skillId)?.name || skill.skillId || '').toLowerCase();
      return standardSkillNames.has(name);
    });
    
    return (
      <div style={{ 
        position: 'fixed', inset: 0, zIndex: 3000,
        background: dark ? 'rgba(15,15,26,0.85)' : 'rgba(245,245,245,0.85)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          width: '100%', maxWidth: 1200, maxHeight: '90vh',
          background: T.cardSolid,
          borderRadius: 24,
          border: `1px solid ${T.bdr}`,
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'auto'
        }}>
          {/* Header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: `1px solid ${T.bdr}`,
            background: T.card,
            position: 'relative',
            zIndex: 20,
            pointerEvents: 'auto'
          }}>
            {/* Title Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🤖 Resume Data Comparison</h2>
                <p style={{ margin: '4px 0 0', color: T.sub, fontSize: 14 }}>Compare existing data with AI-extracted resume data. Select items to import.</p>
              </div>
              <button onClick={onClose} style={{
                background: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
                border: 'none',
                cursor: 'pointer',
                color: T.text,
                width: 40, height: 40,
                borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <X size={22} />
              </button>
            </div>

            {/* Action Buttons Row - Centered */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', position: 'relative', zIndex: 10, background: T.card, padding: '8px 0', borderRadius: 12, pointerEvents: 'auto' }}>
              <button
                type="button"
                onClick={() => {
                  // Select all extracted items
                  const allSkills: Record<string, boolean> = {};
                  Object.keys(selectedSkills).forEach(k => allSkills[k] = true);
                  setSelectedSkills(allSkills);

                  const allProjects: Record<number, boolean> = {};
                  Object.keys(selectedProjects).forEach(k => allProjects[Number(k)] = true);
                  setSelectedProjects(allProjects);

                  const allCerts: Record<number, boolean> = {};
                  Object.keys(selectedCerts).forEach(k => allCerts[Number(k)] = true);
                  setSelectedCerts(allCerts);

                  const allEdu: Record<number, boolean> = {};
                  Object.keys(selectedEducation).forEach(k => allEdu[Number(k)] = true);
                  setSelectedEducation(allEdu);

                  const allAchievements: Record<number, boolean> = {};
                  Object.keys(selectedAchievements).forEach(k => allAchievements[Number(k)] = true);
                  setSelectedAchievements(allAchievements);

                  // Also select all profile fields
                  const allProfile: Record<string, boolean> = {};
                  Object.keys(selectedProfileFields).forEach(k => allProfile[k] = true);
                  setSelectedProfileFields(allProfile);

                  toast.success('All extracted items selected!');
                }}
                style={{ padding: '10px 20px', borderRadius: 10, background: '#3B82F6', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, pointerEvents: 'auto' }}
              >
                <CheckSquare size={16} /> Select All Extracted
              </button>
              <button
                type="button"
                onClick={() => setStatus('idle')}
                style={{ padding: '10px 20px', borderRadius: 10, background: T.input, border: `1px solid ${T.bdr}`, color: T.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, pointerEvents: 'auto' }}
              >
                <RefreshCw size={16} /> Upload Different Resume
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '10px 20px', borderRadius: 10, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, cursor: 'pointer', fontWeight: 600, fontSize: 14, pointerEvents: 'auto' }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={onSaveSelected}
                style={{ padding: '10px 24px', borderRadius: 10, background: '#10B981', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(16,185,129,0.3)', fontSize: 14, pointerEvents: 'auto' }}
              >
                <Save size={18} /> Save Selected Items
              </button>
            </div>
          </div>
          
          {/* Scrollable Content */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '24px 28px', position: 'relative', zIndex: 1 }}>

          {/* Skills Section */}
          <div style={{ marginBottom: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            <div 
              onClick={() => toggleSection('skills')}
              style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {expandedSections.skills ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                <span style={{ fontWeight: 700, fontSize: 16 }}>🛠️ Skills</span>
                <span style={{ color: T.sub, fontSize: 13 }}>({extractedSkillsList.length} extracted)</span>
              </div>
            </div>
            
            {expandedSections.skills && (
              <div style={{ padding: 20 }}>

                {/* ── LEGEND ── */}
                <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 14, background: dark ? 'rgba(255,255,255,0.04)' : '#f8fafc', border: `1px solid ${T.bdr}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 14 }}>Colour Guide</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {[
                      { color: '#10B981', bg: 'rgba(16,185,129,0.15)', label: 'In my Skill Matrix (DB)', example: 'JIRA (L3)' },
                      { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', label: 'Extracted from Resume', example: 'Selenium (L2)' },
                      { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', label: 'Both DB + Resume (duplicate)', example: 'SQL (L2)' },
                      { color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)', bg: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', label: 'Not in DB, not in Resume', example: 'Docker' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: item.bg, border: `1px solid ${item.color}44`, minWidth: 200 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: item.color, flexShrink: 0, display: 'inline-block' }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.label}</div>
                          <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>e.g. {item.example}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: T.muted, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <span>✅ <b>Click any skill</b> to select/deselect it for saving</span>
                    <span>🔄 Selecting a skill on one side <b>auto-deselects</b> the same skill on the other side</span>
                    <span>💾 Only <b>selected skills</b> (ticked) will be saved when you click Save</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                  {/* ── LEFT: ALL 32 standard skills ── */}
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      📋 My Skills (Select to keep)
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {SKILLS.map((sk) => {
                        const existingSkill = effectiveExistingSkills.find((e: any) => {
                          const eName = (SKILLS.find(s => s.id === e.skillId)?.name || e.skillId || '').toLowerCase();
                          return eName === sk.name.toLowerCase();
                        });
                        const myRating = existingSkill?.selfRating ?? 0;
                        const resumeEntry = extractedSkillsList.find(([rSkill]) => rSkill.toLowerCase() === sk.name.toLowerCase());
                        const resumeRating = resumeEntry ? (resumeEntry[1] as number) : 0;
                        const resumeSelected = resumeEntry ? (selectedSkills[resumeEntry[0]] || false) : false;
                        const isSelected = existingSkill ? (existingSkillsSelected[existingSkill.skillId] || false) : false;
                        const hasMySkill = myRating > 0;
                        const hasResumeSkill = resumeRating > 0;

                        // 4-colour system
                        let chipColor: string;
                        let chipBg: string;
                        let chipBorder: string;

                        if (hasMySkill && hasResumeSkill) {
                          // BLUE — duplicate (in both DB and resume)
                          chipColor = '#3B82F6';
                          chipBg = isSelected ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.08)';
                          chipBorder = isSelected ? '2px solid #3B82F6' : '1px solid rgba(59,130,246,0.4)';
                        } else if (hasMySkill) {
                          // GREEN — only in my DB
                          chipColor = '#10B981';
                          chipBg = isSelected ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.08)';
                          chipBorder = isSelected ? '2px solid #10B981' : '1px solid rgba(16,185,129,0.4)';
                        } else if (resumeSelected) {
                          // YELLOW — being imported from resume
                          chipColor = '#F59E0B';
                          chipBg = 'rgba(245,158,11,0.15)';
                          chipBorder = '2px solid #F59E0B';
                        } else {
                          // GREY — not in DB, not in resume
                          chipColor = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
                          chipBg = 'transparent';
                          chipBorder = `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`;
                        }

                        const isClickable = hasMySkill;

                        return (
                          <label key={sk.id} style={{
                            padding: '6px 12px', borderRadius: 14, fontSize: 11,
                            background: chipBg, border: chipBorder, color: chipColor,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            cursor: isClickable ? 'pointer' : 'default',
                            fontWeight: isClickable ? 700 : 400,
                            transition: 'all 0.15s',
                            opacity: (!hasMySkill && !resumeSelected) ? 0.45 : 1,
                          }}>
                            {isClickable && (
                              <input type="checkbox" checked={isSelected}
                                onChange={(e) => {
                                  if (!existingSkill) return;
                                  const checked = e.target.checked;
                                  setExistingSkillsSelected({ ...existingSkillsSelected, [existingSkill.skillId]: checked });
                                  if (checked && resumeEntry) {
                                    setSelectedSkills({ ...selectedSkills, [resumeEntry[0]]: false });
                                  }
                                }}
                                style={{ display: 'none' }}
                              />
                            )}
                            {/* Tick icon when selected */}
                            {isSelected && <span style={{ fontSize: 10 }}>✓</span>}
                            {sk.name}
                            {hasMySkill && <span style={{ opacity: 0.65, fontSize: 10 }}>L{myRating}</span>}
                            {resumeSelected && resumeRating > 0 && <span style={{ opacity: 0.65, fontSize: 10 }}>→L{resumeRating}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── RIGHT: Resume extracted skills ── */}
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      🤖 Resume Extracted Skills (Select to import)
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {extractedSkillsList.map(([skill, lvl]) => {
                        const isSelected = selectedSkills[skill] || false;
                        const myEntry = effectiveExistingSkills.find((e: any) => {
                          const eName = (SKILLS.find(s => s.id === e.skillId)?.name || e.skillId || '').toLowerCase();
                          return eName === skill.toLowerCase();
                        });
                        const myRating = myEntry?.selfRating ?? 0;
                        const hasMySkill = myRating > 0;

                        // BLUE if duplicate (in both), YELLOW if resume-only
                        const chipColor = hasMySkill ? '#3B82F6' : '#F59E0B';
                        const chipBg = isSelected
                          ? (hasMySkill ? 'rgba(59,130,246,0.22)' : 'rgba(245,158,11,0.22)')
                          : (hasMySkill ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.08)');
                        const chipBorder = isSelected
                          ? `2px solid ${chipColor}`
                          : `1px solid ${chipColor}55`;

                        return (
                          <label key={skill} style={{
                            padding: '6px 12px', borderRadius: 14, fontSize: 11,
                            background: chipBg, border: chipBorder, color: chipColor,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            cursor: 'pointer', fontWeight: 700, transition: 'all 0.15s',
                          }}>
                            <input type="checkbox" checked={isSelected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedSkills({ ...selectedSkills, [skill]: checked });
                                if (checked && myEntry) {
                                  setExistingSkillsSelected({ ...existingSkillsSelected, [myEntry.skillId]: false });
                                }
                              }}
                              style={{ display: 'none' }}
                            />
                            {isSelected && <span style={{ fontSize: 10 }}>✓</span>}
                            {skill} L{lvl as number}
                            {hasMySkill && <span style={{ opacity: 0.65, fontSize: 10 }}>(DB: L{myRating})</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* Projects Section */}
          <div style={{ marginBottom: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            <div 
              onClick={() => toggleSection('projects')}
              style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {expandedSections.projects ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                <span style={{ fontWeight: 700, fontSize: 16 }}>📁 Projects</span>
                <span style={{ color: T.sub, fontSize: 13 }}>({pr.length} extracted)</span>
              </div>
            </div>
            
            {expandedSections.projects && (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  {/* Existing Projects with Checkboxes */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, color: T.sub }}>📋 Existing Projects (Select to keep)</h4>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {existingData.projects?.length > 0 ? (
                        existingData.projects.map((proj: any, i: number) => {
                          const isSelected = existingProjectsSelected[i] || false;
                          return (
                            <label 
                              key={i} 
                              style={{ 
                                padding: 12, 
                                background: isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(100,100,100,0.1)', 
                                borderRadius: 8, 
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                cursor: 'pointer',
                                border: isSelected ? '1px solid #10B981' : '1px solid transparent'
                              }}
                            >
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => setExistingProjectsSelected({...existingProjectsSelected, [i]: e.target.checked})}
                                style={{ display: 'none' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                {isSelected ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} />}
                                <div>
                                  <div style={{ fontWeight: 600 }}>{proj.ProjectName || proj.project_name}</div>
                                  <div style={{ color: T.sub }}>{proj.Role || proj.role}</div>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <span style={{ color: T.sub, fontStyle: 'italic' }}>No existing projects</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Extracted Projects with Checkboxes */}
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#3B82F6' }}>🤖 Resume Extracted Projects (Select to import)</h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {pr.map((proj: any, i: number) => (
                        <label 
                          key={i} 
                          style={{ 
                            padding: 12, 
                            background: selectedProjects[i] ? 'rgba(59,130,246,0.1)' : 'rgba(100,100,100,0.05)', 
                            borderRadius: 8, 
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            cursor: 'pointer',
                            border: selectedProjects[i] ? '1px solid #3B82F6' : '1px solid transparent'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedProjects[i] || false}
                            onChange={(e) => setSelectedProjects({...selectedProjects, [i]: e.target.checked})}
                            style={{ display: 'none' }}
                          />
                          <div style={{ marginTop: 2 }}>
                            {selectedProjects[i] ? <CheckSquare size={16} color="#3B82F6" /> : <Square size={16} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{proj.ProjectName}</div>
                            <div style={{ color: T.sub }}>{proj.Role}</div>
                            {proj.Description && <div style={{ color: T.muted, marginTop: 4, fontSize: 11 }}>{proj.Description.slice(0, 100)}...</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Certifications Section */}
          <div style={{ marginBottom: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            <div 
              onClick={() => toggleSection('certifications')}
              style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {expandedSections.certifications ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                <span style={{ fontWeight: 700, fontSize: 16 }}>🏆 Certifications</span>
                <span style={{ color: T.sub, fontSize: 13 }}>({c.length} extracted)</span>
              </div>
            </div>
            
            {expandedSections.certifications && (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  {/* Existing Certs with Checkboxes */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, color: T.sub }}>📋 Existing Certifications (Select to keep)</h4>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {existingData.certifications?.length > 0 ? (
                        existingData.certifications.map((cert: any, i: number) => {
                          const isSelected = existingCertsSelected[i] || false;
                          return (
                            <label 
                              key={i} 
                              style={{ 
                                padding: 12, 
                                background: isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(100,100,100,0.1)', 
                                borderRadius: 8, 
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                cursor: 'pointer',
                                border: isSelected ? '1px solid #10B981' : '1px solid transparent'
                              }}
                            >
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => setExistingCertsSelected({...existingCertsSelected, [i]: e.target.checked})}
                                style={{ display: 'none' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                {isSelected ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} />}
                                <div>
                                  <div style={{ fontWeight: 600 }}>{cert.CertName || cert.cert_name}</div>
                                  <div style={{ color: T.sub }}>{cert.Provider || cert.provider}</div>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <span style={{ color: T.sub, fontStyle: 'italic' }}>No existing certifications</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Extracted Certs with Checkboxes */}
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#3B82F6' }}>🤖 Resume Extracted Certifications (Select to import)</h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {c.map((cert: any, i: number) => (
                        <label 
                          key={i} 
                          style={{ 
                            padding: 12, 
                            background: selectedCerts[i] ? 'rgba(16,185,129,0.1)' : 'rgba(100,100,100,0.05)', 
                            borderRadius: 8, 
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            cursor: 'pointer',
                            border: selectedCerts[i] ? '1px solid #10B981' : '1px solid transparent'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedCerts[i] || false}
                            onChange={(e) => setSelectedCerts({...selectedCerts, [i]: e.target.checked})}
                            style={{ display: 'none' }}
                          />
                          <div style={{ marginTop: 2 }}>
                            {selectedCerts[i] ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{cert.CertName}</div>
                            <div style={{ color: T.sub }}>{cert.Provider} • {cert.IssueDate}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Education Section */}
          <div style={{ marginBottom: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            <div 
              onClick={() => toggleSection('education')}
              style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {expandedSections.education ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                <span style={{ fontWeight: 700, fontSize: 16 }}>🎓 Education</span>
                <span style={{ color: T.sub, fontSize: 13 }}>({ed.length} extracted)</span>
              </div>
            </div>
            
            {expandedSections.education && (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  {/* Existing Education with Checkboxes */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, color: T.sub }}>📋 Existing Education (Select to keep)</h4>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {existingData.education?.length > 0 ? (
                        existingData.education.map((edu: any, i: number) => {
                          const isSelected = existingEducationSelected[i] || false;
                          return (
                            <label 
                              key={i} 
                              style={{ 
                                padding: 12, 
                                background: isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(100,100,100,0.1)', 
                                borderRadius: 8, 
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                cursor: 'pointer',
                                border: isSelected ? '1px solid #10B981' : '1px solid transparent'
                              }}
                            >
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => setExistingEducationSelected({...existingEducationSelected, [i]: e.target.checked})}
                                style={{ display: 'none' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                {isSelected ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} />}
                                <div>
                                  <div style={{ fontWeight: 600 }}>{edu.degree}</div>
                                  <div style={{ color: T.sub }}>{edu.institution}</div>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <span style={{ color: T.sub, fontStyle: 'italic' }}>No existing education</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Extracted Education with Checkboxes */}
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#3B82F6' }}>🤖 Resume Extracted Education (Select to import)</h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {ed.map((edu: any, i: number) => (
                        <label 
                          key={i} 
                          style={{ 
                            padding: 12, 
                            background: selectedEducation[i] ? 'rgba(139,92,246,0.1)' : 'rgba(100,100,100,0.05)', 
                            borderRadius: 8, 
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            cursor: 'pointer',
                            border: selectedEducation[i] ? '1px solid #8B5CF6' : '1px solid transparent'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedEducation[i] || false}
                            onChange={(e) => setSelectedEducation({...selectedEducation, [i]: e.target.checked})}
                            style={{ display: 'none' }}
                          />
                          <div style={{ marginTop: 2 }}>
                            {selectedEducation[i] ? <CheckSquare size={16} color="#8B5CF6" /> : <Square size={16} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{edu.degree}</div>
                            <div style={{ color: T.sub }}>{edu.institution} • {edu.field} • {edu.year}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Achievements Section */}
          <div style={{ marginBottom: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            <div
              onClick={() => toggleSection('achievements')}
              style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {expandedSections.achievements ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                <span style={{ fontWeight: 700, fontSize: 16 }}>🏆 Achievements & Awards</span>
                <span style={{ color: T.sub, fontSize: 13 }}>({extractedData?.achievements?.length || 0} extracted)</span>
              </div>
            </div>

            {expandedSections.achievements && (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  {/* Existing Achievements with Checkboxes */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, color: T.sub }}>📋 Existing Achievements (Select to keep)</h4>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {existingData.achievements?.length > 0 ? (
                        existingData.achievements.map((ach: any, i: number) => {
                          const isSelected = existingAchievementsSelected[i] || false;
                          return (
                            <label
                              key={i}
                              style={{
                                padding: 12,
                                background: isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(100,100,100,0.1)',
                                borderRadius: 8,
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                cursor: 'pointer',
                                border: isSelected ? '1px solid #10B981' : '1px solid transparent'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => setExistingAchievementsSelected({...existingAchievementsSelected, [i]: e.target.checked})}
                                style={{ display: 'none' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                {isSelected ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} />}
                                <div>
                                  <div style={{ fontWeight: 600 }}>{ach.Title || ach.title}</div>
                                  <div style={{ color: T.sub }}>{ach.AwardType || ach.awardType} • {ach.Issuer || ach.issuer}</div>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <span style={{ color: T.sub, fontStyle: 'italic' }}>No existing achievements</span>
                      )}
                    </div>
                  </div>

                  {/* Extracted Achievements with Checkboxes */}
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#3B82F6' }}>🤖 Resume Extracted Achievements (Select to import)</h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(extractedData?.achievements || []).map((ach: any, i: number) => (
                        <label
                          key={i}
                          style={{
                            padding: 12,
                            background: selectedAchievements[i] ? 'rgba(245,158,11,0.1)' : 'rgba(100,100,100,0.05)',
                            borderRadius: 8,
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            cursor: 'pointer',
                            border: selectedAchievements[i] ? '1px solid #F59E0B' : '1px solid transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedAchievements[i] || false}
                            onChange={(e) => setSelectedAchievements({...selectedAchievements, [i]: e.target.checked})}
                            style={{ display: 'none' }}
                          />
                          <div style={{ marginTop: 2 }}>
                            {selectedAchievements[i] ? <CheckSquare size={16} color="#F59E0B" /> : <Square size={16} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{ach.Title}</div>
                            <div style={{ color: T.sub }}>{ach.AwardType} • {ach.Issuer}</div>
                            {ach.DateReceived && <div style={{ color: T.muted, fontSize: 11 }}>{ach.DateReceived}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Profile Section */}
          {Object.keys(p).length > 0 && (
            <div style={{ marginBottom: 16, background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
              <div 
                onClick={() => toggleSection('profile')}
                style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {expandedSections.profile ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                  <span style={{ fontWeight: 700, fontSize: 16 }}>👤 Profile Info</span>
                </div>
              </div>
              
              {expandedSections.profile && (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                    {/* Existing Profile with Checkboxes */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 14, color: T.sub }}>📋 Current Profile (Select to keep)</h4>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {(['name', 'email', 'designation', 'yearsIT', 'location', 'phone'] as const).map((key) => {
                          const value = existingData.profile?.[key];
                          if (!value) return null;
                          const isSelected = existingProfileSelected[key] || false;
                          return (
                            <label 
                              key={key} 
                              style={{ 
                                padding: 10, 
                                background: isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(100,100,100,0.1)', 
                                borderRadius: 8, 
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                border: isSelected ? '1px solid #10B981' : '1px solid transparent'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setExistingProfileSelected({...existingProfileSelected, [key]: checked});
                                  // If selecting existing, unselect extracted for this field
                                  if (checked) {
                                    setSelectedProfileFields({...selectedProfileFields, [key]: false});
                                  }
                                }}
                                style={{ display: 'none' }}
                              />
                              {isSelected ? <CheckSquare size={16} color="#10B981" /> : <Square size={16} />}
                              <div>
                                <span style={{ color: T.sub }}>{key}: </span>
                                <span style={{ fontWeight: 600 }}>{value} {key === 'yearsIT' ? 'years' : ''}</span>
                              </div>
                            </label>
                          );
                        })}
                        {!existingData.profile && (
                          <span style={{ color: T.sub, fontStyle: 'italic' }}>No existing profile data</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Extracted Profile with Checkboxes */}
                    <div>
                      <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#3B82F6' }}>🤖 Resume Extracted Profile (Select to update)</h4>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {(() => {
                          // Clean label map — only show meaningful profile fields
                          const labelMap: Record<string, string> = {
                            name: 'Full Name',
                            email: 'Email',
                            phone: 'Phone',
                            location: 'Location',
                            designation: 'Designation',
                            yearsIT: 'Years in IT',
                            primarySkill: 'Primary Skill',
                            secondarySkill: 'Secondary Skill',
                            tertiarySkill: 'Tertiary Skill',
                          };
                          return Object.entries(p)
                            .filter(([key, value]) => value && labelMap[key]) // only known fields with values
                            .map(([key, value]) => (
                              <label
                                key={key}
                                style={{
                                  padding: 10,
                                  background: selectedProfileFields[key] ? 'rgba(59,130,246,0.1)' : 'rgba(100,100,100,0.05)',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  cursor: 'pointer',
                                  border: selectedProfileFields[key] ? '1px solid #3B82F6' : '1px solid transparent'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedProfileFields[key] || false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedProfileFields({...selectedProfileFields, [key]: checked});
                                    if (checked) {
                                      setExistingProfileSelected({...existingProfileSelected, [key]: false});
                                    }
                                  }}
                                  style={{ display: 'none' }}
                                />
                                {selectedProfileFields[key] ? <CheckSquare size={16} color="#3B82F6" /> : <Square size={16} />}
                                <div>
                                  <span style={{ color: T.sub }}>{labelMap[key]}: </span>
                                  <span style={{ fontWeight: 600 }}>{value as string}</span>
                                </div>
                              </label>
                            ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 600 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FileText size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Admin: Resume Upload</h1>
          <p style={{ fontSize: 14, color: T.sub }}>Upload resume for <strong>{employeeName}</strong> to extract and compare data.</p>
        </div>

        {(status === 'idle' || status === 'error') && (
          <div>
            <div onClick={() => inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              style={{ border: `2px dashed ${dragging ? '#3B82F6' : T.bdr}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', background: T.card, cursor: 'pointer', marginBottom: 16 }}>
              <Upload size={32} color={T.muted} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>📄 Drop Resume (PDF Only)</div>
              <div style={{ fontSize: 12, color: T.sub, marginTop: 8 }}>Click to upload or drag & drop</div>
              <input ref={inputRef} type="file" accept=".pdf,.docx" onChange={onInputChange} style={{ display: 'none' }} />
            </div>
            
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: `1px solid rgba(59, 130, 246, 0.3)`, borderRadius: 12, padding: '16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#3B82F6' }}>✓ PDF Format Only</div>
                <div style={{ marginBottom: 8 }}>
                  Upload resume as <strong>PDF</strong> for optimal extraction accuracy and data quality.
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Converting from Word?</strong> Use these free tools:
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
            <ZensarLoader size={48} dark={dark} label={status === 'reading' ? 'Reading CV...' : 'Extracting data with AI...'} />
          </div>
        )}

        {status === 'error' && (
          <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={onClose} 
            style={{ flex: 1, padding: 12, borderRadius: 12, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, fontWeight: 600, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
