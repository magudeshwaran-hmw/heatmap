/**
 * zenTaxonomy.ts — ZenAssess 32-Skill Workforce Taxonomy Engine
 *
 * Uses the exact 32 ZenMatrix canonical skills.
 * Resume technologies (including ML/AI) are mapped to the closest
 * canonical skill — e.g. TensorFlow/PyTorch → Python.
 *
 * Scoring weights:
 *   Projects    40%
 *   Experience  30%
 *   Certs       15%
 *   Keywords    15%
 */

// ─── 32 Canonical ZenMatrix Skills ───────────────────────────────────────────
export const CANONICAL_SKILLS = [
  // Tools
  'Selenium', 'Appium', 'JMeter', 'Postman', 'JIRA', 'TestRail', 'Playwright',
  // Technologies
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C#', 'SQL',
  // Application Testing
  'API Testing', 'Mobile Testing', 'Performance Testing', 'Security Testing', 'Database Testing', 'Accessibility Testing',
  // Domain
  'Banking', 'Healthcare', 'E-Commerce', 'Insurance', 'Telecom',
  // Testing Types
  'Functional Testing', 'Automation Testing', 'Regression Testing', 'UAT',
  // DevOps
  'Git', 'Jenkins', 'Docker', 'Azure DevOps',
  // AI
  'ChatGPT/Prompt Engineering', 'AI Test Automation',
] as const;

export type CanonicalSkill = typeof CANONICAL_SKILLS[number];

// ─── 7 Job Families → Skill membership ───────────────────────────────────────
// Routing taxonomy. CHANGE 1 realignment applied:
//   F2 +Playwright · F3 +Security Testing (moved from F5) +Accessibility Testing · F5 −Security Testing
// NOTE: This is a code-only routing layer. It does NOT touch the DB schema.
export interface JobFamily {
  id: number;
  name: string;
  skills: CanonicalSkill[];
}

export const JOB_FAMILIES: JobFamily[] = [
  { id: 1, name: 'Functional & Process QA',  skills: ['Functional Testing', 'Regression Testing', 'UAT', 'JIRA', 'TestRail'] },
  { id: 2, name: 'Automation & Tools',       skills: ['Selenium', 'Appium', 'Mobile Testing', 'Automation Testing', 'AI Test Automation', 'Playwright'] },
  { id: 3, name: 'NFT & API Testing',        skills: ['API Testing', 'Postman', 'Performance Testing', 'JMeter', 'Security Testing', 'Accessibility Testing'] },
  { id: 4, name: 'Domain',                   skills: ['Banking', 'Healthcare', 'E-Commerce', 'Insurance', 'Telecom'] },
  { id: 5, name: 'Programming & Security',   skills: ['Python', 'Java', 'JavaScript', 'TypeScript', 'C#'] },
  { id: 6, name: 'Data & Database',          skills: ['SQL', 'Database Testing'] },
  { id: 7, name: 'DevOps & AI',              skills: ['Git', 'Jenkins', 'Docker', 'Azure DevOps', 'ChatGPT/Prompt Engineering'] },
];

// skill → family lookup (built once)
const SKILL_FAMILY_MAP: Map<CanonicalSkill, JobFamily> = (() => {
  const m = new Map<CanonicalSkill, JobFamily>();
  JOB_FAMILIES.forEach(fam => fam.skills.forEach(s => m.set(s, fam)));
  return m;
})();

export function getSkillFamily(skill: CanonicalSkill | string | null | undefined): JobFamily | null {
  if (!skill) return null;
  const canonical = CANONICAL_SKILLS.includes(skill as CanonicalSkill)
    ? (skill as CanonicalSkill)
    : findCanonicalSkill(skill);
  if (!canonical) return null;
  return SKILL_FAMILY_MAP.get(canonical) ?? null;
}

export function getFamilyById(id: number): JobFamily | null {
  return JOB_FAMILIES.find(f => f.id === id) ?? null;
}

// New skills that still need question banks (flagged, not fabricated):
//   Playwright (F2), Accessibility Testing (F3), Security Testing expert/intermediate banks (F3)
export const SKILLS_NEEDING_BANKS: CanonicalSkill[] = ['Playwright', 'Accessibility Testing'];

// ─── Technology → Canonical Skill Mapping ────────────────────────────────────
// ML/DS frameworks map to Python because Python IS in the 32 skills; ML is not.
export const TECH_SKILL_MAP: Record<string, CanonicalSkill> = {
  'selenium': 'Selenium',
  'selenium webdriver': 'Selenium',
  'appium': 'Appium',
  'jmeter': 'JMeter',
  'apache jmeter': 'JMeter',
  'postman': 'Postman',
  'jira': 'JIRA',
  'confluence': 'JIRA',
  'testrail': 'TestRail',
  'testlink': 'TestRail',
  'qtest': 'TestRail',
  'zephyr': 'TestRail',
  'test management': 'TestRail',
  'test rail': 'TestRail',

  // ── Python (ML/DS tools map here) ──
  'python': 'Python',
  'machine learning': 'Python',
  'ml model': 'Python',
  'deep learning': 'Python',
  'neural network': 'Python',
  'pytorch': 'Python',
  'keras': 'Python',
  'scikit': 'AI Test Automation',
  'scikit-learn': 'AI Test Automation',
  'sklearn': 'AI Test Automation',
  'xgboost': 'Python',
  'lightgbm': 'Python',
  'numpy': 'Python',
  'pandas': 'Python',
  'data science': 'Python',
  'mlops': 'Python',
  'mlflow': 'Python',
  'kubeflow': 'Python',
  'jupyter': 'Python',
  'matplotlib': 'Python',
  'seaborn': 'Python',
  'django': 'Python',
  'flask': 'Python',
  'fastapi': 'Python',
  'pyspark': 'Python',
  'data engineering': 'Python',
  'data analysis': 'Python',
  'data analyst': 'Python',
  'data pipeline': 'Python',
  'etl': 'Python',
  'computer vision': 'Python',
  'opencv': 'Python',
  'nlp': 'Python',
  'natural language processing': 'Python',
  'spacy': 'Python',
  'nltk': 'Python',
  'bert': 'Python',
  'sentiment analysis': 'Python',
  'text classification': 'Python',
  'regression': 'Python',
  'classification': 'Python',

  // ── Java ──
  'java': 'Java',
  'groovy': 'Java',
  'spring': 'Java',
  'spring boot': 'Java',
  'springframework': 'Java',
  'hibernate': 'Java',
  'maven': 'Java',
  'gradle': 'Java',
  'testng': 'Java',
  'junit': 'Java',
  'j2ee': 'Java',
  'jee': 'Java',
  'scala': 'Java',

  // ── JavaScript ──
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'node.js': 'JavaScript',
  'nodejs': 'JavaScript',
  'express': 'JavaScript',
  'react': 'JavaScript',
  'reactjs': 'JavaScript',
  'react.js': 'JavaScript',
  'angular': 'JavaScript',
  'angularjs': 'JavaScript',
  'vue': 'JavaScript',
  'vuejs': 'JavaScript',
  'next.js': 'JavaScript',
  'nuxt': 'JavaScript',
  'webpack': 'JavaScript',
  'full stack': 'JavaScript',

  // ── TypeScript ──
  'typescript': 'TypeScript',
  'ts': 'TypeScript',

  // ── C# ──
  'c#': 'C#',
  'csharp': 'C#',
  '.net': 'C#',
  'dotnet': 'C#',
  'asp.net': 'C#',
  '.net core': 'C#',

  // ── SQL / Databases ──
  'sql': 'SQL',
  'mysql': 'SQL',
  'postgresql': 'SQL',
  'postgres': 'SQL',
  'oracle': 'SQL',
  'microsoft sql': 'SQL',
  'mssql': 'SQL',
  'sqlite': 'SQL',
  'mongodb': 'SQL',
  'cassandra': 'SQL',
  'redis': 'SQL',
  'nosql': 'SQL',
  'firebase': 'SQL',
  'dynamodb': 'SQL',
  'database management': 'SQL',

  // ── API Testing ──
  'api testing': 'API Testing',
  'rest api': 'API Testing',
  'flask api': 'API Testing',
  'restful api': 'API Testing',
  'rest assured': 'API Testing',
  'soapui': 'API Testing',
  'swagger': 'API Testing',
  'graphql': 'API Testing',
  'insomnia': 'API Testing',
  'karate': 'API Testing',
  'api validation': 'API Testing',
  'web services testing': 'API Testing',

  // ── Playwright (own skill in Family 2: Automation & Tools) ──
  'playwright': 'Playwright',
  'playwright test': 'Playwright',
  '@playwright/test': 'Playwright',

  // ── Accessibility Testing (Family 3: NFT & API Testing) ──
  'accessibility testing': 'Accessibility Testing',
  'accessibility': 'Accessibility Testing',
  'a11y': 'Accessibility Testing',
  'wcag': 'Accessibility Testing',
  'axe-core': 'Accessibility Testing',
  'axe core': 'Accessibility Testing',
  'screen reader': 'Accessibility Testing',
  'aria': 'Accessibility Testing',
  'section 508': 'Accessibility Testing',
  'ada compliance': 'Accessibility Testing',

  // ── Mobile Testing ──
  'mobile testing': 'Mobile Testing',
  'android testing': 'Mobile Testing',
  'ios testing': 'Mobile Testing',
  'mobile qa': 'Mobile Testing',
  'flutter': 'Mobile Testing',
  'react native': 'Mobile Testing',

  // ── Performance Testing ──
  'performance testing': 'Performance Testing',
  'load testing': 'Performance Testing',
  'stress testing': 'Performance Testing',
  'soak testing': 'Performance Testing',
  'spike testing': 'Performance Testing',
  'k6': 'Performance Testing',
  'gatling': 'Performance Testing',
  'loadrunner': 'Performance Testing',
  'load runner': 'Performance Testing',
  'neoload': 'Performance Testing',
  'locust': 'Performance Testing',
  'nfr testing': 'Performance Testing',
  'performance engineer': 'Performance Testing',
  'testrtc': 'Performance Testing',
  'appdynamics': 'Performance Testing',
  'app dynamics': 'Performance Testing',
  'datadog': 'Performance Testing',
  'data dog': 'Performance Testing',
  'grafana': 'Performance Testing',
  'kibana': 'Performance Testing',
  'dynatrace': 'Performance Testing',
  'e2e performance': 'Performance Testing',
  'workload model': 'Performance Testing',
  'bottleneck': 'Performance Testing',

  // ── Security Testing ──
  'security testing': 'Security Testing',
  'penetration testing': 'Security Testing',
  'owasp': 'Security Testing',
  'burp suite': 'Security Testing',
  'vulnerability assessment': 'Security Testing',
  'vapt': 'Security Testing',
  'nessus': 'Security Testing',
  'metasploit': 'Security Testing',
  'cybersecurity': 'Security Testing',
  'application security': 'Security Testing',
  'appsec': 'Security Testing',

  // ── Database Testing ──
  'database testing': 'Database Testing',
  'db testing': 'Database Testing',
  'sql testing': 'Database Testing',
  'data validation': 'Database Testing',
  'etl testing': 'Database Testing',

  // ── Domain: Banking ──
  'banking': 'Banking',
  'bfsi': 'Banking',
  'finance': 'Banking',
  'financial services': 'Banking',
  'capital market': 'Banking',
  'core banking': 'Banking',
  'payments': 'Banking',
  'fintech': 'Banking',
  'investment banking': 'Banking',
  'wealth management': 'Banking',

  // ── Domain: Healthcare ──
  'healthcare': 'Healthcare',
  'medical': 'Healthcare',
  'clinical': 'Healthcare',
  'hl7': 'Healthcare',
  'fhir': 'Healthcare',
  'hospital management': 'Healthcare',
  'health it': 'Healthcare',

  // ── Domain: E-Commerce ──
  'e-commerce': 'E-Commerce',
  'ecommerce': 'E-Commerce',
  'retail': 'E-Commerce',
  'shopify': 'E-Commerce',
  'online store': 'E-Commerce',
  'marketplace': 'E-Commerce',

  // ── Domain: Insurance ──
  'insurance': 'Insurance',
  'underwriting': 'Insurance',
  'claims management': 'Insurance',
  'policy management': 'Insurance',

  // ── Domain: Telecom ──
  'telecom': 'Telecom',
  'telco': 'Telecom',
  'telecommunications': 'Telecom',
  '5g': 'Telecom',
  'network testing': 'Telecom',
  'voip': 'Telecom',

  // ── Functional Testing ──
  'functional testing': 'Functional Testing',
  'manual testing': 'Functional Testing',
  'black box testing': 'Functional Testing',
  'smoke testing': 'Functional Testing',
  'sanity testing': 'Functional Testing',
  'quality assurance': 'Functional Testing',
  'test case writing': 'Functional Testing',
  'test planning': 'Functional Testing',
  'qa testing': 'Functional Testing',
  'system testing': 'Functional Testing',

  // ── Automation Testing ──
  'automation testing': 'Automation Testing',
  'test automation': 'Automation Testing',
  'cypress': 'Automation Testing',
  'robot framework': 'Automation Testing',
  'cucumber': 'Automation Testing',
  'bdd': 'Automation Testing',
  'tdd': 'Automation Testing',
  'sdet': 'Automation Testing',
  'automation framework': 'Automation Testing',

  // ── Regression Testing ──
  'regression testing': 'Regression Testing',
  'regression suite': 'Regression Testing',
  'regression test': 'Regression Testing',

  // ── UAT ──
  'uat': 'UAT',
  'user acceptance testing': 'UAT',
  'acceptance testing': 'UAT',

  // ── Git ──
  'git': 'Git',
  'github': 'Git',
  'github actions': 'Git',
  'gitlab': 'Git',
  'bitbucket': 'Git',
  'version control': 'Git',
  'source control': 'Git',

  // ── Jenkins / CI-CD ──
  'jenkins': 'Jenkins',
  'ci/cd': 'Jenkins',
  'bamboo': 'Jenkins',
  'circleci': 'Jenkins',
  'teamcity': 'Jenkins',
  'continuous integration': 'Jenkins',
  'continuous delivery': 'Jenkins',
  'devops pipeline': 'Jenkins',

  // ── Docker ──
  'docker': 'Docker',
  'kubernetes': 'Docker',
  'containerization': 'Docker',
  'helm': 'Docker',
  'container': 'Docker',

  // ── Azure DevOps ──
  'azure devops': 'Azure DevOps',
  'azure': 'Azure DevOps',
  'aws': 'Azure DevOps',
  'amazon web services': 'Azure DevOps',
  'gcp': 'Azure DevOps',
  'google cloud': 'Azure DevOps',
  'cloud': 'Azure DevOps',
  'terraform': 'Azure DevOps',
  'ansible': 'Azure DevOps',
  'infrastructure': 'Azure DevOps',

  // ── ChatGPT/Prompt Engineering ──
  'chatgpt': 'ChatGPT/Prompt Engineering',
  'gpt': 'ChatGPT/Prompt Engineering',
  'prompt engineering': 'ChatGPT/Prompt Engineering',
  'llm': 'ChatGPT/Prompt Engineering',
  'generative ai': 'ChatGPT/Prompt Engineering',
  'openai': 'ChatGPT/Prompt Engineering',
  'gemini': 'ChatGPT/Prompt Engineering',
  'copilot': 'ChatGPT/Prompt Engineering',
  'langchain': 'ChatGPT/Prompt Engineering',
  'rag': 'ChatGPT/Prompt Engineering',
  'large language model': 'ChatGPT/Prompt Engineering',
  'gen ai': 'ChatGPT/Prompt Engineering',

  // ── AI Test Automation ──
  'ai test automation': 'AI Test Automation',
  'ai testing': 'AI Test Automation',
  'intelligent test automation': 'AI Test Automation',
  'ml testing': 'AI Test Automation',
  'ai-powered testing': 'AI Test Automation',
  'ml pipeline': 'AI Test Automation',
  'tensorflow': 'AI Test Automation',
};

// ─── Certification → Skill mapping ───────────────────────────────────────────
export const CERT_SKILL_MAP: Record<string, CanonicalSkill> = {
  // Testing certs
  'istqb': 'Functional Testing',
  'ctfl': 'Functional Testing',
  'ctal': 'Automation Testing',
  'selenium': 'Selenium',
  'jmeter': 'Performance Testing',
  'performance': 'Performance Testing',
  'postman': 'API Testing',
  'api': 'API Testing',

  // Technology certs
  'java': 'Java',
  'python': 'Python',
  'machine learning': 'Python',
  'tensorflow': 'AI Test Automation',
  'data science': 'Python',
  'javascript': 'JavaScript',
  'typescript': 'TypeScript',
  'sql': 'SQL',
  'database': 'SQL',

  // DevOps/Cloud certs
  'aws': 'Azure DevOps',
  'azure': 'Azure DevOps',
  'gcp': 'Azure DevOps',
  'google cloud': 'Azure DevOps',
  'terraform': 'Azure DevOps',
  'kubernetes': 'Docker',
  'docker': 'Docker',
  'github': 'Git',
  'git': 'Git',

  // Security certs
  'cissp': 'Security Testing',
  'ceh': 'Security Testing',
  'security': 'Security Testing',
  'owasp': 'Security Testing',

  // Domain certs
  'banking': 'Banking',
  'bfsi': 'Banking',

  // AI certs
  'chatgpt': 'ChatGPT/Prompt Engineering',
  'generative ai': 'ChatGPT/Prompt Engineering',
  'llm': 'ChatGPT/Prompt Engineering',
  'prompt': 'ChatGPT/Prompt Engineering',
  'scrum': 'Functional Testing',
  'pmp': 'Functional Testing',
  'csm': 'Functional Testing',
  'psm': 'Functional Testing',
};

// ─── Score Interfaces ─────────────────────────────────────────────────────────
export interface SkillScore {
  skill: CanonicalSkill;
  score: number;
  projectScore: number;
  certScore: number;
  expScore: number;
  assessmentScore: number;
  keywordScore: number;
  projectCount: number;
  estimatedYears: number;
  confidence: number;
  technologies: string[];
  eligibleForTop3: boolean;
}

export interface TaxonomyResult {
  primary: SkillScore;
  secondary: SkillScore;
  tertiary: SkillScore;
  allSkills: SkillScore[];
}

export interface TaxonomyInput {
  yearsIT: number;
  primarySkillDB?: string;
  secondarySkillDB?: string;
  tertiarySkillDB?: string;
  skills: Array<{ skillName: string; selfRating: number; assessmentScore?: number }>;
  projects: Array<{
    name?: string;
    technologies?: string[];
    skills?: string[];
    domain?: string;
    description?: string;
    role?: string;
  }>;
  certifications: string[];
  designation?: string;
  department?: string;
}

// Boundary-aware keyword match. Plain String.includes() lets short keys like
// 'ts' (TypeScript) or 'js' (JavaScript) match INSIDE unrelated words such as
// "agents" or "documents", fabricating skill evidence. This requires the key to
// sit on a non-alphanumeric boundary on any side whose edge char is alphanumeric,
// while still matching symbol keys like 'c#', '.net' and 'node.js'.
export function textIncludesTech(text: string, tech: string): boolean {
  if (!tech) return false;
  const isAlnum = (c: string) => c >= 'a' && c <= 'z' || c >= '0' && c <= '9';
  const firstAlnum = isAlnum(tech[0]);
  const lastAlnum = isAlnum(tech[tech.length - 1]);
  let from = 0;
  for (;;) {
    const idx = text.indexOf(tech, from);
    if (idx === -1) return false;
    const before = idx > 0 ? text[idx - 1] : '';
    const after = idx + tech.length < text.length ? text[idx + tech.length] : '';
    const startOk = firstAlnum ? !isAlnum(before) : true;
    const endOk = lastAlnum ? !isAlnum(after) : true;
    if (startOk && endOk) return true;
    from = idx + 1;
  }
}

// ─── Main Taxonomy Engine ─────────────────────────────────────────────────────
export function computeSkillTaxonomy(input: TaxonomyInput): TaxonomyResult {
  const scores: Map<CanonicalSkill, SkillScore & { techs: Set<string>; keywordCount: number }> = new Map();

  const initSkill = (skill: CanonicalSkill) => {
    if (!scores.has(skill)) {
      scores.set(skill, {
        skill,
        score: 0,
        projectScore: 0,
        certScore: 0,
        expScore: 0,
        assessmentScore: 0,
        keywordScore: 0,
        projectCount: 0,
        estimatedYears: 0,
        confidence: 0,
        technologies: [],
        techs: new Set<string>(),
        keywordCount: 0,
        eligibleForTop3: false,
      });
    }
    return scores.get(skill)!;
  };

  CANONICAL_SKILLS.forEach(skill => initSkill(skill));

  // ── 1. Project-based scoring (40%) ───────────────────────────────────────
  const totalProjects = input.projects.length || 1;
  input.projects.forEach((proj) => {
    const projectTechs = new Set<CanonicalSkill>();
    const allProjText = [
      ...(proj.technologies || []),
      ...(proj.skills || []),
      proj.domain || '',
      proj.description || '',
      proj.role || '',
      proj.name || '',
    ].join(' ').toLowerCase();

    Object.entries(TECH_SKILL_MAP).forEach(([tech, skill]) => {
      if (textIncludesTech(allProjText, tech)) {
        projectTechs.add(skill);
        initSkill(skill).techs.add(tech);
      }
    });

    projectTechs.forEach(skill => {
      initSkill(skill).projectCount++;
    });
  });

  scores.forEach((entry) => {
    entry.projectScore = Math.min(40, entry.projectCount * 14);
  });

  // ── 2. Certification-based scoring (15%) ─────────────────────────────────
  input.certifications.forEach((cert) => {
    const certLower = cert.toLowerCase();
    Object.entries(CERT_SKILL_MAP).forEach(([keyword, skill]) => {
      if (certLower.includes(keyword)) {
        const entry = initSkill(skill);
        entry.techs.add(cert);
        entry.certScore = Math.min(15, (entry.certScore || 0) + 7);
      }
    });
  });

  // ── 3. Experience-based scoring (30%) ────────────────────────────────────
  scores.forEach((entry, skill) => {
    const avgProjDuration = Math.max(0.5, input.yearsIT / Math.max(totalProjects, 1));
    let estimatedYears = entry.projectCount * avgProjDuration;

    const matchingSkill = input.skills?.find(s => findCanonicalSkill(s.skillName) === skill);
    if (matchingSkill) {
      estimatedYears = Math.max(estimatedYears, matchingSkill.selfRating * (input.yearsIT / 3));
    }

    if (input.primarySkillDB && findCanonicalSkill(input.primarySkillDB) === skill) {
      estimatedYears = Math.max(estimatedYears, input.yearsIT);
    }
    if (input.secondarySkillDB && findCanonicalSkill(input.secondarySkillDB) === skill) {
      estimatedYears = Math.max(estimatedYears, input.yearsIT * 0.6);
    }
    if (input.tertiarySkillDB && findCanonicalSkill(input.tertiarySkillDB) === skill) {
      estimatedYears = Math.max(estimatedYears, input.yearsIT * 0.3);
    }

    entry.estimatedYears = Math.round(estimatedYears * 10) / 10;
    entry.expScore = Math.min(30, Math.round((estimatedYears / 5) * 30));
  });

  // ── 4. Assessment-based scoring (10%) ────────────────────────────────────
  scores.forEach((entry, skill) => {
    const matchingSkill = input.skills?.find(s => findCanonicalSkill(s.skillName) === skill);
    const dbScore = matchingSkill ? (matchingSkill.assessmentScore || 0) : 0;
    entry.assessmentScore = Math.min(10, Math.round(dbScore * 0.1));
  });

  // ── 5. Designation keyword scoring (5%) ──────────────────────────────────
  const designationText = `${input.designation || ''} ${input.department || ''}`.toLowerCase();
  Object.entries(TECH_SKILL_MAP).forEach(([tech, skill]) => {
    if (textIncludesTech(designationText, tech)) {
      const entry = initSkill(skill);
      entry.techs.add(tech);
      entry.keywordCount++;
    }
  });

  scores.forEach((entry) => {
    entry.keywordScore = Math.min(5, entry.keywordCount * 5);
  });

  // ── Final scores & eligibility ────────────────────────────────────────────
  scores.forEach((entry) => {
    const total = entry.projectScore + entry.expScore + entry.certScore + entry.assessmentScore + entry.keywordScore;
    entry.score = Math.min(100, Math.round(total));
    entry.confidence = Math.min(99, Math.round(total * 0.95));
    entry.technologies = Array.from(entry.techs);

    const matchingSkill = input.skills?.find(s => findCanonicalSkill(s.skillName) === entry.skill);
    const dbScore = matchingSkill ? (matchingSkill.assessmentScore || 0) : 0;
    entry.eligibleForTop3 = (entry.projectCount > 0) || (entry.estimatedYears > 0) || (dbScore > 0);
  });

  const allSkillsList = Array.from(scores.values());
  let eligibleCount = allSkillsList.filter(s => s.eligibleForTop3).length;

  while (eligibleCount < 3) {
    const currentEligible = allSkillsList.filter(s => s.eligibleForTop3).map(s => s.skill);
    const filler = buildFillerSkill(input, currentEligible);
    const entry = scores.get(filler.skill)!;
    Object.assign(entry, filler, { eligibleForTop3: true });
    eligibleCount = allSkillsList.filter(s => s.eligibleForTop3).length;
  }

  const sorted = Array.from(scores.values()).sort((a, b) => {
    if (a.eligibleForTop3 && !b.eligibleForTop3) return -1;
    if (!a.eligibleForTop3 && b.eligibleForTop3) return 1;
    return b.score - a.score;
  });

  return {
    primary: sorted[0],
    secondary: sorted[1],
    tertiary: sorted[2],
    allSkills: sorted,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function findCanonicalSkill(text: string): CanonicalSkill | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  if (CANONICAL_SKILLS.includes(text as CanonicalSkill)) return text as CanonicalSkill;

  for (const [key, skill] of Object.entries(TECH_SKILL_MAP)) {
    if (textIncludesTech(lower, key)) return skill;
  }

  for (const cs of CANONICAL_SKILLS) {
    if (cs.toLowerCase().includes(lower) || lower.includes(cs.toLowerCase())) {
      return cs;
    }
  }

  return null;
}

export function getSkillTier(score: number): string {
  if (score >= 80) return 'Expert';
  if (score >= 60) return 'Advanced';
  if (score >= 35) return 'Intermediate';
  return 'Beginner';
}

export function formatExperience(years: number): string {
  if (years === 0) return 'Beginner';
  if (years < 1) return `${Math.round(years * 12)} Months`;
  return `${years} Year${years !== 1 ? 's' : ''}`;
}

export function getRecommendedRoles(taxonomy: TaxonomyResult): string[] {
  const roles: Partial<Record<CanonicalSkill, string[]>> = {
    'Selenium': ['SDET', 'Automation Engineer', 'QA Architect'],
    'Appium': ['Mobile QA Engineer', 'Automation Engineer'],
    'JMeter': ['Performance Engineer', 'NFR Test Lead'],
    'Postman': ['API Test Engineer', 'Integration Tester'],
    'JIRA': ['QA Lead', 'Scrum Master'],
    'TestRail': ['Test Manager', 'QA Lead'],
    'Python': ['Python Developer', 'SDET', 'Automation Engineer'],
    'Java': ['Java Developer', 'SDET', 'Backend Engineer'],
    'JavaScript': ['JavaScript Developer', 'Full Stack Engineer'],
    'TypeScript': ['TypeScript Developer', 'Frontend Engineer'],
    'C#': ['.NET Developer', 'QA Automation Engineer'],
    'SQL': ['Database Administrator', 'Data Analyst'],
    'API Testing': ['API Test Engineer', 'Integration Tester'],
    'Mobile Testing': ['Mobile QA Engineer', 'Mobile Test Lead'],
    'Performance Testing': ['Performance Engineer', 'SRE'],
    'Security Testing': ['Security Tester', 'AppSec Engineer'],
    'Database Testing': ['Database Tester', 'Data Quality Engineer'],
    'Banking': ['BFSI Domain Expert', 'Banking Test Lead'],
    'Healthcare': ['Healthcare IT Analyst', 'Clinical Tester'],
    'E-Commerce': ['E-Commerce QA Lead', 'Retail Tech Engineer'],
    'Insurance': ['Insurance Domain Specialist', 'Claims Testing Lead'],
    'Telecom': ['Telecom Test Engineer', 'Network QA Engineer'],
    'Functional Testing': ['QA Engineer', 'Test Analyst', 'Test Manager'],
    'Automation Testing': ['SDET', 'Automation Engineer', 'QA Architect'],
    'Regression Testing': ['QA Engineer', 'Regression Test Lead'],
    'UAT': ['UAT Coordinator', 'Business Analyst'],
    'Git': ['DevOps Engineer', 'SDET'],
    'Jenkins': ['DevOps Engineer', 'CI/CD Engineer'],
    'Docker': ['DevOps Engineer', 'Platform Engineer'],
    'Azure DevOps': ['Azure DevOps Engineer', 'Cloud QA Engineer'],
    'ChatGPT/Prompt Engineering': ['AI Engineer', 'GenAI Test Engineer'],
    'AI Test Automation': ['AI Test Engineer', 'Intelligent Automation Lead'],
  };

  const result = new Set<string>();
  [taxonomy.primary, taxonomy.secondary, taxonomy.tertiary].forEach(s => {
    (roles[s.skill] || []).slice(0, 2).forEach(r => result.add(r));
  });
  return Array.from(result).slice(0, 5);
}

export function getRecommendedProjects(taxonomy: TaxonomyResult): string[] {
  const projects: Partial<Record<CanonicalSkill, string[]>> = {
    'Selenium': ['Web Automation Framework', 'Regression Suite Build'],
    'Appium': ['Mobile Test Automation', 'Cross-Device Test Suite'],
    'JMeter': ['Load Testing Initiative', 'Performance Baseline Study'],
    'Postman': ['API Contract Testing', 'Microservices API Validation'],
    'Python': ['Test Framework in Python', 'Data-Driven Testing'],
    'Java': ['TestNG Framework Development', 'Spring Boot API Testing'],
    'JavaScript': ['Cypress E2E Suite', 'Playwright Automation'],
    'SQL': ['Database Validation Suite', 'ETL Testing Framework'],
    'API Testing': ['API Gateway Testing', 'REST API Validation'],
    'Performance Testing': ['Soak Test Campaign', 'SLA Compliance Testing'],
    'Security Testing': ['VAPT Project', 'OWASP Compliance Testing'],
    'Banking': ['Core Banking Integration Testing', 'Payment Gateway Testing'],
    'Healthcare': ['EHR System Testing', 'HIPAA Compliance Validation'],
    'Functional Testing': ['Enterprise Test Strategy', 'UAT Coordination'],
    'Automation Testing': ['BDD Framework Implementation', 'Regression Automation'],
    'Azure DevOps': ['Azure Pipeline Setup', 'Cloud Migration Testing'],
    'Docker': ['Containerized Test Execution', 'Docker CI Testing'],
    'ChatGPT/Prompt Engineering': ['AI-assisted Test Generation', 'Prompt-driven Test Cases'],
    'AI Test Automation': ['Intelligent Test Automation', 'Self-healing Test Suite'],
  };

  const result = new Set<string>();
  [taxonomy.primary, taxonomy.secondary, taxonomy.tertiary].forEach(s => {
    (projects[s.skill] || []).slice(0, 2).forEach(p => result.add(p));
  });
  return Array.from(result).slice(0, 4);
}

// ─── Grade to Path Mapping ───────────────────────────────────────────────────────
export function getGradePath(grade: string | null | undefined): 'Beginner' | 'Intermediate' | 'Expert' {
  if (!grade || grade === 'Not Assigned' || grade === '—') return 'Beginner';
  const g = grade.trim().toUpperCase();
  if (g === 'F1') return 'Beginner';
  if (g === 'E1' || g === 'E2') return 'Intermediate';
  if (g === 'D' || g === 'C') return 'Expert';
  return 'Beginner';
}

export function deriveGradeFromYears(years: number): string {
  if (years >= 13) return 'D';
  if (years >= 4) return 'E1';
  return 'F1';
}

// ─── CHANGE 2: Family + Grade + Depth assessment flow ────────────────────────
// Canonical 9-phase model. Replaces self_claimed_level for TEST ROUTING.
// (DB column self_claimed_level is left untouched — it is simply no longer used
//  to choose the test level.)
export type AssessPath = 'Beginner' | 'Intermediate' | 'Expert';

export interface FamilyScore {
  family: JobFamily;
  score: number;                 // 0-100 weighted (freq 40 / tool 40 / tenure 20)
  components: { skillFrequency: number; projectToolUsage: number; tenure: number };
  matchedSkillNames: CanonicalSkill[];
}

export interface DepthScored {
  skill: CanonicalSkill;
  depthScore: number;            // 0-100 — years · projects · frequency, NO self-rating
  depthYears: number;
  depthProjects: number;
  depthFrequency: number;
  base: SkillScore;
}

export interface AssessmentFlow {
  grade: string;
  gradeBand: string;
  winningFamily: JobFamily | null;
  familyScores: FamilyScore[];
  top3: DepthScored[];
  path: AssessPath;
  pathScore: number;             // depth score that drove the grade×score matrix
  taxonomy: TaxonomyResult;      // reordered so primary/secondary/tertiary = family top-3
}

// tenure-allocated years derived from PROJECTS + IT experience only — never self-rating
function cleanTenureYears(sc: SkillScore, input: TaxonomyInput): number {
  const totalProjects = Math.max(input.projects.length, 1);
  if (sc.projectCount <= 0) return 0;
  return Math.min(input.yearsIT, sc.projectCount * (input.yearsIT / totalProjects));
}

// Depth score (Filter 3): years · projects · frequency. Explicitly self-rating-free.
function computeDepth(sc: SkillScore, input: TaxonomyInput): DepthScored {
  const cleanYears = cleanTenureYears(sc, input);
  const projects = sc.projectCount;
  const frequency = sc.technologies.length;
  const yearsComp = Math.min(40, cleanYears * 8);   // ~5 yrs → 40
  const projComp = Math.min(40, projects * 13);     // ~3 projects → 39
  const freqComp = Math.min(20, frequency * 5);     // ~4 techs → 20
  const depthScore = Math.min(100, Math.round(yearsComp + projComp + freqComp));
  return {
    skill: sc.skill,
    depthScore,
    depthYears: Math.round(cleanYears * 10) / 10,
    depthProjects: projects,
    depthFrequency: frequency,
    base: sc,
  };
}

// Phase 3: JOB FAMILY scoring.
// The winning family is the one that owns the candidate's SINGLE STRONGEST skill
// (peak depth), not the one with the most distinct shallow skills. This stops a
// specialist (e.g. a Performance Tester: one deep skill, 3 projects) from being
// out-voted by a family of several shallowly-evidenced skills (e.g. 3 domain
// skills with 1 project each). Project-tool-usage / frequency / tenure remain as
// supporting components (and are surfaced for transparency).
export function scoreJobFamilies(taxonomy: TaxonomyResult, input: TaxonomyInput): FamilyScore[] {
  const bySkill = new Map(taxonomy.allSkills.map(s => [s.skill, s]));
  const depthBySkill = new Map(taxonomy.allSkills.map(s => [s.skill, computeDepth(s, input).depthScore]));
  const raw = JOB_FAMILIES.map(fam => {
    let freq = 0, tool = 0, ten = 0, peakDepth = 0;
    const matched: CanonicalSkill[] = [];
    fam.skills.forEach(sk => {
      const sc = bySkill.get(sk);
      if (!sc) return;
      freq += sc.technologies.length;
      tool += sc.projectCount;
      ten += cleanTenureYears(sc, input);
      peakDepth = Math.max(peakDepth, depthBySkill.get(sk) ?? 0);
      if (sc.projectCount > 0 || sc.technologies.length > 0) matched.push(sk);
    });
    return { fam, freq, tool, ten, peakDepth, matched };
  });
  const maxFreq = Math.max(1, ...raw.map(r => r.freq));
  const maxTool = Math.max(1, ...raw.map(r => r.tool));
  const maxTen = Math.max(1, ...raw.map(r => r.ten));
  return raw
    .map(r => {
      const skillFrequency = (r.freq / maxFreq) * 100;
      const projectToolUsage = (r.tool / maxTool) * 100;
      const tenure = (r.ten / maxTen) * 100;
      // Depth-led: the family's strongest single skill dominates; tool usage,
      // frequency and tenure act as supporting/tie-break signals.
      const score = Math.round(r.peakDepth * 0.60 + projectToolUsage * 0.20 + skillFrequency * 0.10 + tenure * 0.10);
      return {
        family: r.fam,
        score,
        components: {
          skillFrequency: Math.round(skillFrequency),
          projectToolUsage: Math.round(projectToolUsage),
          tenure: Math.round(tenure),
        },
        matchedSkillNames: r.matched,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// Phase 4: grade band normalisation (G0 < F2 < F1 < E2 < E1 < D < C)
export function normalizeGradeBand(grade: string | null | undefined): string {
  if (!grade) return 'G0';
  const g = grade.trim().toUpperCase();
  if (['G0', 'F2', 'F1', 'E2', 'E1', 'D', 'C'].includes(g)) return g;
  if (g === '—' || g === 'NOT ASSIGNED') return 'G0';
  return g;
}

// Phase 6: PATH from the grade × score matrix.
//   G0/F2 → always Beginner · F1≥80 → Intermediate · E2<60 → Beginner ·
//   E1≥80 → Expert · D/C → Expert. (score = primary skill depth score, 0-100)
export function assignPathFromGradeScore(grade: string | null | undefined, score: number): AssessPath {
  const g = normalizeGradeBand(grade);
  switch (g) {
    case 'G0':
    case 'F2': return 'Beginner';
    case 'F1': return score >= 80 ? 'Intermediate' : 'Beginner';
    case 'E2': return score < 60 ? 'Beginner' : 'Intermediate';
    case 'E1': return score >= 80 ? 'Expert' : 'Intermediate';
    case 'D':
    case 'C':  return 'Expert';
    default:   return 'Beginner';
  }
}

// Full flow: family scoring → top-3 (3 sequential filters) → grade×score path.
export function computeAssessmentFlow(input: TaxonomyInput, grade: string | null | undefined): AssessmentFlow {
  const taxonomy = computeSkillTaxonomy(input);
  const familyScores = scoreJobFamilies(taxonomy, input);
  const winningFamily = familyScores[0]?.family ?? null;

  // Real, résumé-grounded evidence = depthScore > 0 (projects · tenure · tech
  // frequency). This deliberately ignores self-ratings AND declared DB skills
  // (primary/secondary/tertiary_skill), so a phantom skill — e.g. a declared
  // "TypeScript" with no projects and no matched technologies — can NEVER reach
  // the top-3. (Filters 2 & 3 of the spec collapse into this single depth gate.)
  const allDepth = taxonomy.allSkills
    .map(s => computeDepth(s, input))
    .filter(d => d.depthScore > 0)
    .sort((a, b) => b.depthScore - a.depthScore || b.base.score - a.base.score);

  // Filter 1 — Job Family: prefer the winning family's evidenced skills first.
  const familySkillSet = new Set<CanonicalSkill>(winningFamily ? winningFamily.skills : []);
  const top3: DepthScored[] = allDepth.filter(d => familySkillSet.has(d.skill));

  // Thin family → pad from the candidate's next-best EVIDENCED skills across all
  // families (real résumé evidence only — never zero-evidence padding).
  if (top3.length < 3) {
    const used = new Set(top3.map(t => t.skill));
    for (const d of allDepth) {
      if (top3.length >= 3) break;
      if (!used.has(d.skill)) { top3.push(d); used.add(d.skill); }
    }
  }

  // Last resort only (essentially no résumé evidence at all): fall back to the
  // global taxonomy order so the UI still renders 3 cards.
  if (top3.length < 3) {
    const used = new Set(top3.map(t => t.skill));
    for (const s of taxonomy.allSkills) {
      if (top3.length >= 3) break;
      if (!used.has(s.skill)) { top3.push(computeDepth(s, input)); used.add(s.skill); }
    }
  }
  const finalTop3 = top3.slice(0, 3);

  const pathScore = finalTop3[0]?.depthScore ?? 0;
  const path = assignPathFromGradeScore(grade, pathScore);

  const reordered: TaxonomyResult = {
    primary: finalTop3[0]?.base ?? taxonomy.primary,
    secondary: finalTop3[1]?.base ?? taxonomy.secondary,
    tertiary: finalTop3[2]?.base ?? taxonomy.tertiary,
    allSkills: taxonomy.allSkills,
  };

  return {
    grade: grade || '',
    gradeBand: normalizeGradeBand(grade),
    winningFamily,
    familyScores,
    top3: finalTop3,
    path,
    pathScore,
    taxonomy: reordered,
  };
}

function buildFillerSkill(input: TaxonomyInput, exclude: CanonicalSkill[]): SkillScore {
  const defaults: CanonicalSkill[] = [
    'Functional Testing', 'SQL', 'Git', 'API Testing', 'Automation Testing', 'Python'
  ];
  const pick = defaults.find(d => !exclude.includes(d)) || 'Functional Testing';
  return {
    skill: pick, score: 20, projectScore: 8, certScore: 3,
    expScore: 6, keywordScore: 3, projectCount: 0,
    estimatedYears: Math.max(0.5, input.yearsIT * 0.2),
    confidence: 18, technologies: [],
    eligibleForTop3: true, assessmentScore: 0,
  };
}
