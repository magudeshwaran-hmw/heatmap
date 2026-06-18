/**
 * resumeExtraction.ts
 * SINGLE shared resume extraction — used by ALL pages:
 *   ResumeUploadPage · AdminResumeUploadPage · AdminDashboard
 *
 * Handles ANY resume format: structured, unstructured, QA, non-QA, Indian, global.
 */

import { callResumeLLM } from './llm';

// ─── PDF Text Extraction ──────────────────────────────────────────────────────
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      console.warn('⚠️ PDF.js not loaded, using fallback');
      return await file.text();
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Join items with space, preserve line breaks
      const pageText = content.items.map((item: any) => item.str).join(' ');
      text += pageText + '\n\n';
    }

    if (text.trim().length < 50) {
      throw new Error('Too little text extracted from PDF');
    }

    console.log(`✅ PDF extracted: ${text.length} chars from ${pdf.numPages} pages`);
    return text;
  } catch (err) {
    console.error('❌ PDF extraction error:', err);
    try {
      return await file.text();
    } catch {
      return '';
    }
  }
}

// ─── Fast Resume Extraction (8s timeout) ─────────────────────────────────────
export async function fastExtractFromResume(resumeText: string): Promise<any> {
  const fullText = resumeText.slice(0, 20000); // Smaller text for faster processing
  console.log(`⚡ Fast ZenScan extracting from ${fullText.length} characters`);

  // Simplified prompt for faster extraction
  const prompt = `Extract key information from this resume in JSON format:

RESUME:
${fullText}

Return JSON with this structure (no markdown, no backticks):
{
  "profile": {
    "name": "Full Name",
    "yearsIT": 3,
    "designation": "Job Title"
  },
  "skills": {
    "JavaScript": 2,
    "Python": 1,
    "SQL": 2
  },
  "projects": [
    {"ProjectName": "Project", "Role": "Developer", "Description": "What they did"}
  ],
  "certifications": [],
  "education": [
    {"degree": "Bachelor", "institution": "University", "year": "2020"}
  ]
}

Extract only what's clearly mentioned. Rate skills 0-3 based on how much they're mentioned.`;

  try {
    // Use shorter timeout for fast extraction
    const result = await Promise.race([
      callResumeLLM(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('FAST_TIMEOUT')), 8000) // 8 second timeout
      )
    ]) as any;

    if (result.error || !result.data) {
      throw new Error('Fast extraction failed');
    }

    return result.data;
  } catch (err: any) {
    console.log('⚡ Fast extraction timed out, will use fallback');
    throw err;
  }
}

// ─── Original Full Extraction (for backward compatibility) ─────────────────────
export async function extractEverythingFromResume(resumeText: string): Promise<any> {
  // For now, just use the fast extraction - the full one was too slow
  return fastExtractFromResume(resumeText);
}

// ─── 100% Accurate Extraction (no timeouts, maximum detail) ─────────────────────
export async function accurateExtractFromResume(resumeText: string): Promise<any> {
  console.log(`🎯 ACCURACY MODE: Precision extraction from ${resumeText.length} characters`);

  const prompt = `
You are a precision resume parser for Zensar Technologies, an MNC QA organisation.
Your job is to extract structured data from a QA/Testing professional's resume text.

CRITICAL RULES — follow every one or the output is wrong:

RULE 1 — NAME:
Extract the candidate's PERSONAL NAME only.
The name is the person's first + last name (e.g. "Nilesh Anil Brahme").
Do NOT extract job titles like "Software Test Engineer" or "QA Lead" as the name.
The name is almost always at the very top of the resume, before the role/email/phone.
If the name has three words, use all three. Never use a job title as the name.

RULE 2 — EXPERIENCE:
Extract years of IT experience as a NUMBER (integer).
Look for phrases like: "10+ years", "10 + yrs", "around 10 yrs", "12 years of experience".
The symbol "+" means "more than" — "10+" means extract 10.
If no explicit statement, calculate from earliest job start date to today (${new Date().getFullYear()}).
Do NOT default to 2 if experience is clearly stated.

RULE 3 — SKILLS (this is the most important section):
Map ONLY to this exact 32-skill list. Do not invent skills outside this list.

CRITICAL ANTI-HALLUCINATION RULE:
Only extract skills that are EXPLICITLY mentioned in the resume text provided (directly, or via a tool/keyword that clearly maps to a skill per the mapping rules below).
Do NOT infer, assume, or add skills that are not written in the resume. If a skill is not in the text, set it to 0.
When in doubt, leave it out — a skill with no textual evidence MUST be 0, not a guess.
For each skill, assign a rating 0-3 based on DEPTH and RECENCY of evidence:

THE 32 SKILLS (map resume content to these names exactly):
"Selenium", "Appium", "JMeter", "Postman", "JIRA", "TestRail",
"Python", "Java", "JavaScript", "TypeScript", "C#", "SQL",
"API Testing", "Mobile Testing", "Performance Testing", "Security Testing",
"Database Testing", "Banking", "Healthcare", "E-Commerce", "Insurance", "Telecom",
"Manual Testing", "Automation Testing", "Regression Testing", "UAT",
"Git", "Jenkins", "Docker", "Azure DevOps",
"ChatGPT/Prompt Engineering", "AI Test Automation"

RATING LOGIC (use evidence, not just word count):
3 = Primary expertise — used in multiple projects, recent (last 2 years), described in detail
2 = Secondary skill — used in some projects, or mentioned as a known tool
1 = Basic exposure — mentioned once, older than 3 years, or listed as secondary skill
0 = Not mentioned anywhere in the resume

SKILL MAPPING RULES:
- "Cypress" → maps to "Automation Testing" (L3 if it is the main tool) AND "JavaScript" (L2 because Cypress is JS-based)
- "TOSCA" / "Tricentis TOSCA" → maps to "Automation Testing" (L3 if primary tool)
- "Playwright" → maps to "Automation Testing"
- "RestAssured" / "Rest Assured" → maps to "API Testing"
- "Postman" → maps to "Postman" (direct match)
- "JMeter" / "Jmeter" → maps to "JMeter" AND "Performance Testing"
- "Selenium" → maps to "Selenium" (direct match)
- "JIRA" / "Jira" → maps to "JIRA"
- "Bitbucket" + "AWS pipeline" → maps to "Jenkins" (L1, CI/CD pipeline equivalent)
- "MongoDB" / "MS SQL Server" / "Oracle" / "SQL" → maps to "SQL" and "Database Testing"
- "SAP FICO" / "SAP Fiori" / "SAP" domain → maps to "Banking" if in finance/accounts domain
- "GenAI" certification → maps to "ChatGPT/Prompt Engineering" (L1) and "AI Test Automation" (L1)
- "IBM RQM" / "UFT" / "SDT" → maps to "Manual Testing" (these are older test management tools)
- "BDD" / "Cucumber" → part of "Automation Testing", do not create a new skill
- "Healthcare" client → maps to "Healthcare" domain skill
- "Banking" client / "EBRD" / "MasterCard" → maps to "Banking" domain skill
- "LoadRunner" / "Load Runner" / "TestRTC" → maps to "Performance Testing"
- "AppDynamics" / "DataDog" / "Dynatrace" / "Grafana" / "Kibana" → maps to "Performance Testing" (APM/monitoring used in perf engineering)
- "Groovy" → maps to "Java" (Groovy is a JVM language)
- "Insurance" client/domain → maps to "Insurance"; "Telecom" → "Telecom"

RULE 4 — CERTIFICATIONS:
Extract EVERY certification listed. Look for sections titled "Certifications", "Certificates", "Achievements".
Each certification must have: CertName, Provider (if mentioned), IssueDate (if mentioned).
If only the cert name is listed with no provider or date, still extract it with Provider: "" and IssueDate: "".
Do NOT return 0 certifications if a Certifications section exists in the resume.

RULE 5 — PROJECTS:
Extract EVERY project with a named project or client.
Each project must have: ProjectName, Role, StartDate, EndDate (or "Present"), Description, Technologies (array).
StartDate and EndDate: extract exactly as written (e.g. "Aug 2025", "Feb 2026", "Nov 2017").
If EndDate says "Present" or is blank for the latest role, set EndDate: "Present".
Extract technologies from the "Technology/Skills/Tools Used" section if present.

RULE 6 — EDUCATION:
Extract every degree. Format: degree, institution, field, year.
"BCA [2010-2014]" → degree: "BCA", institution: "", field: "Computer Applications", year: "2014"

RULE 7 — ANALYSIS:
completenessScore: rate 0-100 based on how complete the resume is (has projects, certs, skills, education, contact info).
A resume with 7 projects, 4 certs, clear experience, and contact info = 90+.
Do NOT give low scores to well-structured resumes.
missingCriticalFields: list only genuinely missing things (LinkedIn URL, photo, etc.)
careerGaps: look at date ranges across all roles and identify gaps > 3 months.
redFlags: only flag genuine concerns (e.g. no dates on roles, contradictory experience claims).

RULE 8 — ACHIEVEMENTS / AWARDS / RECOGNITION:
Scan the resume for lines indicating awards or recognition. Trigger phrases include:
"Monthly Star", "Star Performer", "Client Appreciation", "Award", "Awarded", "Recognition", "Recognized for", "Honored", "Honoured", "Employee of the Month", "Spot Award", "Kudos", "Appreciation".
For EACH match, add an object to the "achievements" array: { "Title": "<short award title>", "Description": "<surrounding context sentence>", "AwardType": "Recognition" }.
Only extract achievements actually present in the text — do not invent. If none are found, return an empty achievements array.

RESUME TEXT TO PARSE:
---
${resumeText}
---

Respond ONLY with valid JSON. No explanation. No markdown. No text before or after the JSON.
The JSON must follow this exact structure:

{
  "profile": {
    "name": "FirstName LastName (person's actual name, not job title)",
    "designation": "their current or most recent job title",
    "yearsIT": 10,
    "location": "city if mentioned",
    "phone": "phone if mentioned",
    "email": "email if mentioned",
    "primarySkill": "their strongest skill from the 32-skill list",
    "secondarySkill": "second strongest skill",
    "tertiarySkill": "third strongest skill"
  },
  "skills": {
    "Selenium": 3,
    "Appium": 0,
    "JMeter": 3,
    "Postman": 3,
    "JIRA": 3,
    "TestRail": 0,
    "Python": 0,
    "Java": 2,
    "JavaScript": 2,
    "TypeScript": 0,
    "C#": 0,
    "SQL": 2,
    "API Testing": 3,
    "Mobile Testing": 0,
    "Performance Testing": 2,
    "Security Testing": 0,
    "Database Testing": 1,
    "Banking": 3,
    "Healthcare": 1,
    "E-Commerce": 0,
    "Insurance": 0,
    "Telecom": 0,
    "Manual Testing": 3,
    "Automation Testing": 3,
    "Regression Testing": 3,
    "UAT": 2,
    "Git": 1,
    "Jenkins": 1,
    "Docker": 0,
    "Azure DevOps": 0,
    "ChatGPT/Prompt Engineering": 1,
    "AI Test Automation": 1
  },
  "certifications": [
    {
      "CertName": "Full certification name exactly as written",
      "Provider": "issuing body if mentioned",
      "IssueDate": "year or month-year if mentioned"
    }
  ],
  "projects": [
    {
      "ProjectName": "Client or project name",
      "Role": "exact role title",
      "StartDate": "Mon YYYY",
      "EndDate": "Mon YYYY or Present",
      "Description": "1-2 sentence project description",
      "Outcome": "key achievement if mentioned",
      "Technologies": ["Tool1", "Tool2"]
    }
  ],
  "education": [
    {
      "degree": "degree name",
      "institution": "college/university name or empty string",
      "field": "field of study",
      "year": "graduation year"
    }
  ],
  "achievements": [
    { "Title": "Monthly Star Performer", "Description": "context sentence from the resume", "AwardType": "Recognition" }
  ],
  "gaps": [],
  "analysis": {
    "completenessScore": 88,
    "missingCriticalFields": ["LinkedIn URL not provided"],
    "careerGaps": ["Gap between Dec 2024 and Feb 2025 (2 months)"],
    "improvementAreas": ["Add measurable outcomes to project descriptions"],
    "formattingIssues": [],
    "redFlags": []
  }
}`;

  try {
    console.log('🤖 Calling AI for precision extraction (5 minute timeout)...');
    const result = await callResumeLLM(prompt, true); // Enable accuracy mode

    if (result.error || !result.data) {
      throw new Error(`AI extraction failed: ${result.error || 'No data returned'}`);
    }

    console.log('✅ Precision extraction completed successfully');
    return result.data;
    
  } catch (err: any) {
    console.error('❌ Precision extraction failed:', err);
    throw err;
  }
}