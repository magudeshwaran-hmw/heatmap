/**
 * resumeExtraction.ts
 * SINGLE shared resume extraction — used by ALL pages:
 *   ResumeUploadPage · AdminResumeUploadPage · AdminDashboard
 *
 * Handles ANY resume format: structured, unstructured, QA, non-QA, Indian, global.
 */

import { callResumeLLM } from './llm';
import { QE_ALL_SKILLS, findQESkillById, findQESkillByName, QE_SKILL_COUNT, QE_FAMILIES } from './qeSkillTaxonomy';
import { evaluateTaxonomySkills } from './aiEvaluator';
import { textIncludesTech } from './zenTaxonomy';
import * as pdfjsDist from 'pdfjs-dist';
// SECURITY: bundle the PDF.js worker with the app (Vite `?url`) instead of fetching
// it from a remote CDN at runtime — this removes the remote-code-execution vector the
// audit flagged and keeps the worker version locked to the library version.
// @ts-ignore — Vite resolves `?url` to the hashed local asset path.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// ─── Self-hosted PDF.js accessor ──────────────────────────────────────────────
// Single source of truth used by every PDF call site (this module + the pages), so
// no screen ever reaches out to cdnjs. Sets the bundled worker once, then reuses it.
let _pdfjsWorkerSet = false;
export async function getPdfjs(): Promise<any> {
  if (!_pdfjsWorkerSet) {
    try { (pdfjsDist as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl; } catch (_) {}
    _pdfjsWorkerSet = true;
  }
  return pdfjsDist;
}

// ─── PDF Text Extraction ──────────────────────────────────────────────────────
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const pdfjsLib = await getPdfjs();
    if (!pdfjsLib) {
      console.warn('⚠️ PDF.js not loaded, using fallback');
      return await file.text();
    }

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

// ─── Word (.docx) Text Extraction ─────────────────────────────────────────────
// .docx is a zipped XML package — reading it as plain text yields garbage, so we
// parse it properly with mammoth (browser build). .doc (legacy binary) is NOT
// supported by mammoth; we surface a clear message asking for .docx/PDF instead.
export async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const mammoth: any = (await import('mammoth/mammoth.browser')).default || (await import('mammoth/mammoth.browser'));
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = (result?.value || '').trim();
    if (text.length < 20) throw new Error('Too little text extracted from Word document');
    console.log(`✅ DOCX extracted: ${text.length} chars`);
    return text;
  } catch (err) {
    console.error('❌ DOCX extraction error:', err);
    throw err;
  }
}

// ─── Unified extractor — picks the right engine by file type ──────────────────
// PDF → pdf.js · DOCX → mammoth · TXT/other → raw text.
export async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractTextFromPDF(file);
  }

  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return extractTextFromDocx(file);
  }

  // Legacy .doc (binary) — mammoth can't read it. Fail clearly rather than feeding
  // the model binary noise that produces wrong/blank extractions.
  if (type === 'application/msword' || name.endsWith('.doc')) {
    throw new Error('Legacy .doc files are not supported. Please save as .docx or PDF and re-upload.');
  }

  // .txt / .csv / unknown — best-effort plain text.
  try {
    return await file.text();
  } catch {
    return '';
  }
}

// ─── Zensar ID detection (resume text + filename) ────────────────────────────
// A valid Zensar employee ID is EXACTLY 5 or 6 digits (matches zensarIdUtils).
// We look for it in two places, in priority order:
//   1. Explicitly labelled in the resume text ("Zensar ID: 123456", "Emp Code 12345"…)
//   2. Embedded in the file name ("123456_John_Doe.pdf", "John Doe 654321.docx"…)
// Returns the digits as a string, or null when nothing trustworthy is found.
const ZID_LABELS = [
  'zensar\\s*id', 'zensar\\s*employee\\s*id', 'employee\\s*id', 'employee\\s*code',
  'emp\\s*id', 'emp\\s*code', 'emp\\s*no', 'associate\\s*id', 'associate\\s*code',
  'personnel\\s*(?:no|number)', 'staff\\s*id', 'z\\s*id', 'zid',
];

function pickValidZid(candidate: string | undefined | null): string | null {
  if (!candidate) return null;
  const digits = candidate.replace(/[^0-9]/g, '');
  return digits.length === 5 || digits.length === 6 ? digits : null;
}

export function extractZensarIdFromText(resumeText: string, fileName?: string): string | null {
  const text = resumeText || '';

  // 1. Labelled ID inside the resume — strongest signal.
  for (const label of ZID_LABELS) {
    const re = new RegExp(`${label}\\s*[:#\\-]?\\s*([0-9][0-9\\s\\-]{3,10}[0-9])`, 'i');
    const m = text.match(re);
    const zid = pickValidZid(m?.[1]);
    if (zid) return zid;
  }

  // 2. File name — e.g. "654321 - Nilesh Brahme.pdf" or "Nilesh_Brahme_654321.docx".
  //    Take the first standalone 5-6 digit group that is not part of a longer number
  //    (avoids matching phone numbers or years embedded in the name).
  const base = (fileName || '').replace(/\.(pdf|docx?|txt)$/i, '');
  const fileMatch = base.match(/(?<![0-9])([0-9]{5,6})(?![0-9])/);
  const fileZid = pickValidZid(fileMatch?.[1]);
  if (fileZid) return fileZid;

  return null;
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

// ─── QE-Taxonomy Skill Extraction (166 skills, family-grouped, priority) ──────
// This is the chain-lock extractor. Instead of the legacy 32-skill list, it maps a
// resume against the FULL qeSkillTaxonomy (166 essential skills / 14 families) and
// returns a family-grouped, priority-ranked structure whose skill names match the
// QISL ZenMatrix verbatim — so one extraction can populate qisl_skill_ratings and
// fan out to the admin/employee views.
//
// Strategy (robust for a local model): feed the model a NUMBERED catalog of all 166
// skills and ask it to return ONLY {id, proficiency} for skills with real textual
// evidence. Compact output (no 166-key template to truncate or copy), exact matching
// by id (no name drift), and the id encodes family so the 4 duplicate names are
// unambiguous. Family + priority are then derived deterministically here.
export type SkillPriority = 'primary' | 'secondary' | 'tertiary' | null;

export interface TaxonomySkill {
  id: number;
  name: string;
  family: string;
  group: string;
  proficiency: number;       // 1-3 (0 skills are dropped)
  priority: SkillPriority;   // per-family rank of the top skills
}

/** A resume skill that is NOT one of the 166 taxonomy skills, filed under its best-fit family. */
export interface OtherSkill {
  name: string;
  family: string;
  proficiency: number;   // 1-3
}

export interface TaxonomyExtraction {
  skills: TaxonomySkill[];
  /** { exact skill name -> level } — ready for apiSaveQislSkills / qisl_skill_ratings */
  ratingsByName: Record<string, number>;
  /** grouped by family, strongest family first, each family's skills strongest first */
  byFamily: { family: string; skills: TaxonomySkill[] }[];
  /** resume skills outside the 166 list, each placed in a family's "Others" bucket */
  others: OtherSkill[];
  primarySkill: string;
  secondarySkill: string;
  tertiarySkill: string;
  matchedCount: number;
}

const EMPTY_TAXONOMY_EXTRACTION: TaxonomyExtraction = {
  skills: [], ratingsByName: {}, byFamily: [], others: [],
  primarySkill: '', secondarySkill: '', tertiarySkill: '', matchedCount: 0,
};

function buildTaxonomyCatalog(): string {
  return QE_ALL_SKILLS.map(s => `${s.id}. [${s.family}] ${s.name}`).join('\n');
}

// Deterministic keyword match against the taxonomy's keyword[] arrays. This is the
// reliable floor: it needs no LLM, so a resume always populates QISL even when the
// model is offline / can't handle the 166-skill prompt. Proficiency comes from how
// much distinct keyword evidence a skill has.
export function keywordExtractTaxonomy(resumeText: string): Array<{ id: number; proficiency: number }> {
  const lower = (resumeText || '').toLowerCase();
  if (!lower) return [];
  const out: Array<{ id: number; proficiency: number; hits: number }> = [];
  for (const s of QE_ALL_SKILLS) {
    let hits = 0;
    for (const kw of s.keywords) {
      if (textIncludesTech(lower, kw)) hits++;
    }
    // Beginner-first: a single mention = Beginner (1); 2-3 distinct evidences = a
    // solid Intermediate (2); 4+ = strong Expert-grade (3, later gated by experience).
    // `hits` (raw evidence count) is retained separately — it is the RANKING signal
    // (the bucketed proficiency ties too easily once the experience cap flattens it).
    if (hits > 0) out.push({ id: s.id, proficiency: hits >= 4 ? 3 : hits >= 2 ? 2 : 1, hits });
  }
  return out;
}

/** Turn a raw LLM {id, proficiency} list into the family-grouped, prioritized result. */
export function assembleTaxonomyExtraction(raw: Array<{ id: any; proficiency: any }>): TaxonomyExtraction {
  // 1. Validate ids, coerce proficiency to 0-3, keep the highest per id.
  const byId = new Map<number, number>();
  for (const row of raw || []) {
    const id = parseInt(String(row?.id), 10);
    if (!Number.isFinite(id)) continue;
    const meta = findQESkillById(id);
    if (!meta) continue; // hallucinated id → drop
    let p = parseInt(String(row?.proficiency), 10);
    if (!Number.isFinite(p)) p = 0;
    p = Math.max(0, Math.min(3, p));
    if (p <= 0) continue; // no evidence → not stored
    byId.set(id, Math.max(byId.get(id) || 0, p));
  }

  // 2. Build skill objects.
  const skills: TaxonomySkill[] = [];
  for (const [id, proficiency] of byId) {
    const meta = findQESkillById(id)!;
    skills.push({ id, name: meta.name, family: meta.family, group: meta.group, proficiency, priority: null });
  }

  // 3. Group by family; strongest family (sum of proficiencies) first.
  const famMap = new Map<string, TaxonomySkill[]>();
  for (const sk of skills) {
    const arr = famMap.get(sk.family) || [];
    arr.push(sk);
    famMap.set(sk.family, arr);
  }
  const byFamily = Array.from(famMap.entries())
    .map(([family, fs]) => {
      fs.sort((a, b) => b.proficiency - a.proficiency || a.name.localeCompare(b.name));
      // per-family priority: top three become primary/secondary/tertiary
      const tiers: SkillPriority[] = ['primary', 'secondary', 'tertiary'];
      fs.forEach((sk, i) => { sk.priority = i < 3 ? tiers[i] : null; });
      return { family, skills: fs, strength: fs.reduce((n, s) => n + s.proficiency, 0) };
    })
    .sort((a, b) => b.strength - a.strength)
    .map(({ family, skills: fs }) => ({ family, skills: fs }));

  // 4. Overall primary/secondary/tertiary = the three strongest skills overall.
  const strongest = [...skills].sort((a, b) => b.proficiency - a.proficiency || a.name.localeCompare(b.name));
  const ratingsByName: Record<string, number> = {};
  for (const sk of skills) {
    // a name can repeat across families (4 cases) — keep the higher level
    ratingsByName[sk.name] = Math.max(ratingsByName[sk.name] || 0, sk.proficiency);
  }

  return {
    skills,
    ratingsByName,
    byFamily,
    others: [],
    primarySkill: strongest[0]?.name || '',
    secondarySkill: strongest[1]?.name || '',
    tertiarySkill: strongest[2]?.name || '',
    matchedCount: skills.length,
  };
}

// Generic quality-engineering words that carry no evidence on their own — an "Other"
// skill must share a MORE distinctive word with the resume to be trusted.
const OTHER_GENERIC_WORDS = new Set([
  'testing', 'test', 'validation', 'quality', 'engineering', 'management', 'analysis',
  'assessment', 'automation', 'api', 'apis', 'and', 'the', 'of', 'for', 'tools', 'tool',
  'data', 'integration', 'service', 'services', 'system', 'framework', 'platform',
]);

/** True if the resume text actually evidences this custom "Other" skill (drops pure inventions). */
function otherHasEvidence(name: string, resumeLower: string): boolean {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !OTHER_GENERIC_WORDS.has(w));
  if (words.length === 0) return resumeLower.includes(name.toLowerCase());
  return words.some(w => resumeLower.includes(w));
}

// Parse + validate the LLM's "others" list: keep only entries whose family is a real
// QE family and whose name is genuinely NOT one of the 166 taxonomy skills.
function parseOtherSkills(rawOthers: any[]): OtherSkill[] {
  if (!Array.isArray(rawOthers)) return [];
  const famLower = new Map(QE_FAMILIES.map(f => [f.toLowerCase(), f]));
  const seen = new Set<string>();
  const out: OtherSkill[] = [];
  for (const o of rawOthers) {
    const name = String(o?.name || '').trim();
    if (!name || findQESkillByName(name)) continue;          // already a taxonomy skill → not an "other"
    const family = famLower.get(String(o?.family || '').trim().toLowerCase());
    if (!family) continue;                                    // unknown family → cannot place it
    const key = `${family}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let p = parseInt(String(o?.proficiency), 10);
    if (!Number.isFinite(p)) p = 1;
    out.push({ name, family, proficiency: Math.max(1, Math.min(3, p)) });
  }
  return out;
}

// Experience gate: how high a proficiency an employee can be shown at, given years
// of IT experience. Applied to the DISPLAYED level only — it never re-orders skills,
// so the primary/secondary/tertiary derivation is untouched.
//   < 3 years  → Intermediate max (a fresher isn't an "Expert" on a résumé mention)
//   >= 3 years → Expert allowed
function experienceCap(years: number): number {
  const y = Number(years) || 0;
  return y >= 3 ? 3 : 2;
}

export async function extractTaxonomySkillsFromResume(resumeText: string, years = 0): Promise<TaxonomyExtraction> {
  const text = (resumeText || '').trim();
  if (text.length < 30) return EMPTY_TAXONOMY_EXTRACTION;

  console.log(`🧬 QE-Taxonomy extraction over ${QE_SKILL_COUNT} skills from ${text.length} chars`);

  const prompt = `You are a precision Quality-Engineering skill extractor for Zensar (an MNC QA org).
You are given a resume and a NUMBERED CATALOG of ${QE_SKILL_COUNT} quality-engineering skills.
Your job: decide which catalog skills the resume gives REAL textual evidence for, and rate each 0-3.

STRICT RULES:
- Only include a skill if the resume text actually evidences it (a tool, framework, activity, or clear synonym). When in doubt, LEAVE IT OUT.
- Do NOT invent skills or ids. Use ONLY ids from the catalog below.

- CRITICAL — BUILDING IS NOT TESTING. This is a Quality-Engineering catalog: most skills are about TESTING / VALIDATING / assuring QUALITY of something, not building it. Distinguish carefully:
    • If the resume shows the person BUILT, DEVELOPED, INTEGRATED, or USED a technology (development work), that is NOT proof they TEST it.
    • Only rate a "…Testing" / "…Validation" / QA skill 2 or 3 if the resume shows actual testing, validation, QA, quality, or assurance activity on it (verbs like test, validate, verify, QA, assert, coverage, defect, quality).
    • If the evidence is build/use ONLY (no testing verb), either OMIT the QA skill or rate it 1 at most.
    • Examples of what NOT to do: do NOT credit "API Testing" just because they integrated/built APIs; do NOT credit "Database Testing" just because they used a database; do NOT credit "LLM Testing" just because they built an LLM app.
- Rate proficiency:
    3 = primary expertise WITH clear testing/quality evidence, across multiple/recent projects
    2 = solid working skill with some testing/quality evidence, OR a non-QA foundational skill (language/framework/domain) used in depth
    1 = basic exposure, build/use-only evidence, mentioned once, or older
- Omit any skill with no evidence (do NOT output it with 0). Prefer FEWER, well-justified skills over many optimistic ones.
- A resume typically matches 8-25 skills, not all ${QE_SKILL_COUNT}. Quality over quantity — an honest smaller list is better than an inflated one.

CATALOG (id. [family] skill):
${buildTaxonomyCatalog()}

ALSO: if the resume clearly shows QA / quality-engineering skills or tools that are NOT in the catalog,
list them under "others" with the closest matching family name (copy a family name EXACTLY from the catalog's [family] tags).
Only include genuinely QE-relevant skills; do not include the person's name, companies, or soft skills.

FAMILIES (use these exact names for "others"):
${QE_FAMILIES.map(f => `- ${f}`).join('\n')}

RESUME TEXT:
---
${text}
---

Respond with ONLY valid JSON, no markdown, in EXACTLY this shape:
{ "skills": [ { "id": 12, "proficiency": 3 }, { "id": 45, "proficiency": 2 } ],
  "others": [ { "name": "GraphQL", "family": "Service Integration Quality Engineering", "proficiency": 2 } ] }`;

  const lower = text.toLowerCase();
  // Reliable floor: keyword matches always available, no LLM required.
  const keywordRaw = keywordExtractTaxonomy(text);
  const keywordIds = new Set(keywordRaw.map(k => k.id));
  // Raw evidence count per skill id — the deterministic RANKING signal (see below).
  const hitsById = new Map<number, number>();
  keywordRaw.forEach((k: any) => hitsById.set(k.id, k.hits ?? k.proficiency ?? 0));

  // Best-effort refinement: ask the model to rate skills; if it's offline or returns
  // junk we simply keep the keyword matches instead of failing the whole chain.
  let llmRaw: Array<{ id: any; proficiency: any }> = [];
  let othersRaw: any[] = [];
  try {
    const result = await callResumeLLM(prompt, true);
    if (result.data && !result.error) {
      const data = result.data;
      llmRaw =
        Array.isArray(data) ? data :
        Array.isArray(data?.skills) ? data.skills :
        Array.isArray(data?.matches) ? data.matches : [];
      othersRaw = Array.isArray(data?.others) ? data.others : [];
      console.log(`🧬 LLM taxonomy pass returned ${llmRaw.length} rows, ${othersRaw.length} others`);
    } else {
      console.warn(`🧬 LLM taxonomy pass unavailable (${result.error || 'no data'}) — using keyword matches only`);
    }
  } catch (e) {
    console.warn('🧬 LLM taxonomy pass threw — using keyword matches only:', e);
  }

  // ACCURACY MODE: only taxonomy skills with real keyword evidence in the resume are
  // kept. The LLM may only refine the proficiency of THOSE skills; skills it infers
  // with no textual keyword match are dropped entirely (no "Hallucination Detection"
  // for someone who merely built an LLM app).
  const llmForKeywordSkills = llmRaw
    .map(r => ({ id: parseInt(String(r?.id), 10), proficiency: parseInt(String(r?.proficiency), 10) || 0 }))
    .filter(r => Number.isFinite(r.id) && keywordIds.has(r.id));

  // First pass: keyword floor refined by the extractor LLM (assemble keeps the
  // higher proficiency per id).
  const firstPass = assembleTaxonomyExtraction([...keywordRaw, ...llmForKeywordSkills]);

  // ── AI EVALUATOR AGENT (skeptical 2nd pass) ──────────────────────────────────
  // Confirms or DROPS each proposed skill against the resume — kills keyword false
  // positives (e.g. "Java-Selenium" with no Java/Selenium) and enforces BUILD≠TEST.
  // Runs on PRE-cap levels so the differentiated result drives an accurate
  // primary/secondary/tertiary. Keyword floor is the fallback when the AI is offline.
  const evalCandidates = firstPass.skills.map(s => ({ id: s.id, name: s.name, family: s.family, proficiency: s.proficiency }));
  const verdicts = await evaluateTaxonomySkills(text, evalCandidates);
  let finalRaw: Array<{ id: number; proficiency: number }>;
  if (verdicts && verdicts.size > 0) {
    // Drop a skill ONLY on an explicit keep:false. A candidate with no matching
    // verdict (model returned mismatched/partial ids) is KEPT — never dropped by
    // omission, which previously wiped the whole set to zero skills.
    finalRaw = evalCandidates
      .filter(c => { const v = verdicts.get(c.id); return v ? v.keep : true; })
      .map(c => ({ id: c.id, proficiency: verdicts.get(c.id)?.level || c.proficiency }));
    // Safety net: if the evaluator still emptied everything, fall back to first-pass.
    if (finalRaw.length === 0) finalRaw = evalCandidates.map(c => ({ id: c.id, proficiency: c.proficiency }));
    console.log(`🧪 Evaluator agent kept ${finalRaw.length}/${evalCandidates.length} skills`);
  } else {
    finalRaw = evalCandidates.map(c => ({ id: c.id, proficiency: c.proficiency }));
    console.warn('🧪 Evaluator agent offline — keeping first-pass skills');
  }

  // Re-assemble from the evaluated set → clean per-family tiers.
  const assembled = assembleTaxonomyExtraction(finalRaw);
  // "Others" (skills outside the 166) are kept only when the resume text actually
  // contains the skill's distinctive word — drops purely invented entries.
  assembled.others = parseOtherSkills(othersRaw).filter(o => otherHasEvidence(o.name, lower));

  // ── Deterministic trio ranking by RAW evidence strength ──────────────────────
  // The bucketed proficiency ties heavily once the experience cap flattens everything
  // to level 2, so ranking by it degenerates to alphabetical (Deep Learning/Docker/
  // ETL beat LLMs/Vector DB purely on the letter). Rank the overall primary/secondary/
  // tertiary by the raw keyword-evidence count instead — heavily-evidenced skills
  // (Deep Learning, LLMs) outrank one-mention skills (Docker, ETL), independent of the
  // model's (often flat) level output.
  const rankedByEvidence = [...assembled.skills].sort((a, b) =>
    (hitsById.get(b.id) || 0) - (hitsById.get(a.id) || 0) ||
    b.proficiency - a.proficiency ||
    a.name.localeCompare(b.name)
  );
  if (rankedByEvidence[0]) assembled.primarySkill = rankedByEvidence[0].name;
  if (rankedByEvidence[1]) assembled.secondarySkill = rankedByEvidence[1].name;
  if (rankedByEvidence[2]) assembled.tertiarySkill = rankedByEvidence[2].name;

  // Apply the experience gate to the DISPLAYED proficiency only. primarySkill /
  // secondarySkill / tertiarySkill and the per-family priority tiers were already
  // derived from the pre-cap strength, so this does not change them.
  const cap = experienceCap(years);
  const capP = (p: number) => Math.min(p, cap);
  assembled.skills.forEach(s => { s.proficiency = capP(s.proficiency); });
  assembled.byFamily.forEach(f => f.skills.forEach(s => { s.proficiency = capP(s.proficiency); }));
  Object.keys(assembled.ratingsByName).forEach(k => { assembled.ratingsByName[k] = capP(assembled.ratingsByName[k]); });
  assembled.others.forEach(o => { o.proficiency = capP(o.proficiency); });

  console.log(`🧬 Taxonomy extraction matched ${assembled.matchedCount} skills + ${assembled.others.length} others across ${assembled.byFamily.length} families (years=${years}, cap=${cap}; keyword ${keywordRaw.length} + llm ${llmRaw.length})`);
  return assembled;
}