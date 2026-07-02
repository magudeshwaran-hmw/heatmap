/**
 * qeSkillTaxonomy.ts — "New Skill Group" Quality-Engineering taxonomy.
 *
 * This is a SEPARATE, larger taxonomy (Skill Family → Skill Group → Essential
 * Skill) layered on top of the existing 32-skill zenTaxonomy.ts engine.
 * It does NOT replace or modify zenTaxonomy.ts or any DB schema.
 *
 * Used by the admin "New Skill Group" table/tab and the employee ZenRadar card:
 *   - auto-derives each employee's Family + Skill Group from their existing
 *     skills / projects / domain evidence (keyword match),
 *   - derives two flags:  AI for QE  (AI Driven Quality Engineering family)
 *                         QE for AI  (AI/ML & Gen AI-Augmented QE family),
 *   - supports a per-employee admin override stored in localStorage
 *     (frontend-only — no backend changes yet).
 *
 * NOTE: "Retail & Supply Chain Testing" below is a TESTING essential skill under
 * Application & ERP Testing. It is unrelated to the E-Commerce/Retail domain
 * routing in zenTaxonomy.ts — keep them separate.
 */

import { textIncludesTech } from './zenTaxonomy';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface QEEssentialSkill {
  name: string;
  /** distinctive keywords used to auto-match against employee evidence */
  keywords: string[];
}

export interface QESkillGroup {
  family: string;
  group: string;
  skills: QEEssentialSkill[];
}

// Families that drive the two flags.
export const AI_FOR_QE_FAMILY = 'AI Driven Quality Engineering';
export const QE_FOR_AI_FAMILY = 'AI/ML & Gen AI-Augmented Quality Engineering';

const s = (name: string, ...keywords: string[]): QEEssentialSkill => ({ name, keywords });

// ─── The taxonomy ────────────────────────────────────────────────────────────
export const QE_TAXONOMY: QESkillGroup[] = [
  // 1 ─ Test Automation Engineering - SDET ──────────────────────────────────
  {
    family: 'Test Automation Engineering - SDET',
    group: 'Full Stack Automation',
    skills: [
      s('Java-Selenium', 'selenium', 'java-selenium', 'webdriver'),
      s('TestNG', 'testng'),
      s('Appium', 'appium'),
      s('Cypress', 'cypress'),
      s('Tosca/UFT/AccelQ', 'tosca', 'uft', 'accelq', 'qtp'),
      s('Cloud Mobile Platforms (TestMu, Saucelabs, Headspin, BrowserStack, pCloudy, etc)', 'saucelabs', 'sauce labs', 'browserstack', 'headspin', 'pcloudy', 'lambdatest', 'testmu'),
      s('Maven', 'maven'),
      s('GitHub Actions', 'github actions'),
      s('WebDriver IO', 'webdriverio', 'webdriver io', 'wdio'),
      s('Playwright', 'playwright'),
      s('RestAssured Framework', 'rest assured', 'restassured'),
      s('TestComplete', 'testcomplete', 'test complete'),
      s('Karate', 'karate'),
    ],
  },
  {
    family: 'Test Automation Engineering - SDET',
    group: 'Automation Engineering',
    skills: [
      s('Test Framework Development', 'framework development', 'automation framework'),
      s('Continuous Automation', 'continuous automation'),
      s('Self Healing', 'self healing', 'self-healing'),
      s('AI Driven Automation', 'ai driven automation', 'ai-driven automation', 'ai test automation'),
      s('UI Automation', 'ui automation'),
      s('Mobile Automation', 'mobile automation', 'mobile testing'),
      s('API Automation', 'api automation', 'api testing'),
      s('BDD/TDD', 'bdd', 'tdd', 'cucumber', 'behave', 'specflow'),
      s('Low-Code Automation', 'low-code', 'low code', 'no-code'),
      s('Parallel/Hyper Execution', 'parallel execution', 'hyper execution', 'selenium grid'),
      s('Docker', 'docker', 'kubernetes', 'container'),
      s('SonarQube', 'sonarqube', 'sonar'),
      s('Azure DevOps', 'azure devops'),
      s('Github/GitLab', 'github', 'gitlab', 'bitbucket'),
    ],
  },

  // 2 ─ Non-Functional Testing ───────────────────────────────────────────────
  {
    family: 'Non-Functional Testing',
    group: 'Performance & Reliability Engineering',
    skills: [
      s('NeoLoad', 'neoload'),
      s('LoadRunner', 'loadrunner', 'load runner'),
      s('Silk Performer', 'silk performer', 'silkperformer'),
      s('Apache JMeter', 'jmeter', 'performance testing', 'load testing', 'stress testing', 'gatling', 'k6', 'locust', 'performance engineer'),
    ],
  },
  {
    family: 'Non-Functional Testing',
    group: 'Specialised NFT',
    skills: [
      s('Compatibility Testing', 'compatibility testing', 'cross browser', 'cross-browser'),
      s('Accessibility Testing', 'accessibility', 'a11y', 'wcag', 'section 508'),
      s('Security Testing (SAST, DAST, VA & PT)', 'security testing', 'sast', 'dast', 'penetration testing', 'vapt', 'owasp', 'burp'),
      s('Infrastructure Testing', 'infrastructure testing'),
      s('Network Testing', 'network testing'),
      s('Semi-conductor Testing', 'semiconductor', 'semi-conductor'),
      s('Gaming Testing', 'gaming testing', 'game testing'),
    ],
  },

  // 3 ─ AI Driven Quality Engineering  (→ "AI for QE") ───────────────────────
  {
    family: AI_FOR_QE_FAMILY,
    group: 'AI Driven Quality Engineering Architecture',
    skills: [
      s('LLMs & Gen AI architecture', 'llm', 'large language model', 'gen ai', 'generative ai', 'genai'),
      s('Agentic AI', 'agentic', 'ai agent', 'agentic ai'),
      s('RAG Engineering', 'rag engineering', 'retrieval augmented'),
      s('Prompt Engineering', 'prompt engineering'),
      s('Vector Databases', 'vector database', 'pinecone', 'weaviate', 'faiss', 'chroma'),
      s('Knowledge Base', 'knowledge base'),
      s('Model Evaluation', 'model evaluation'),
      s('LLM Ops & QI Deployment', 'llmops', 'llm ops', 'mlops'),
      s('AI Security', 'ai security'),
      s('AI Compliance', 'ai compliance'),
      s('Guard Rails', 'guardrail', 'guard rail'),
      s('AI adoption strategy', 'ai adoption'),
      s('AI Test Generation', 'ai test generation'),
      s('AI Test Optimization', 'ai test optimization', 'ai test optimisation'),
      s('Autonomous Test Automation', 'autonomous test', 'autonomous automation'),
    ],
  },

  // 4 ─ AI/ML & Gen AI-Augmented Quality Engineering  (→ "QE for AI") ────────
  {
    family: QE_FOR_AI_FAMILY,
    group: 'AI/ML Quality Engineering',
    skills: [
      s('AI/ML Testing', 'ai/ml testing', 'ml testing', 'machine learning testing', 'model testing'),
      s('Deep Learning', 'deep learning', 'neural network', 'tensorflow', 'pytorch', 'keras'),
      s('AI Test Generation', 'ai test generation'),
      s('AI Test Optimization', 'ai test optimization'),
      s('Autonomous Test Automation', 'autonomous test'),
      s('Prompt Engineering', 'prompt engineering'),
      s('Synthetic Test Design', 'synthetic test', 'synthetic data'),
      s('Defect Prediction', 'defect prediction'),
      s('Self-Healing Automation', 'self-healing automation', 'self healing automation'),
    ],
  },
  {
    family: QE_FOR_AI_FAMILY,
    group: 'Gen AI Quality Engineering',
    skills: [
      s('LLM Testing', 'llm testing'),
      s('RAG Validation', 'rag validation'),
      s('Prompt Validation', 'prompt validation'),
      s('Hallucination Detection', 'hallucination'),
      s('AI Safety Testing', 'ai safety'),
      s('Bias & Fairness Testing', 'bias testing', 'fairness'),
      s('Explainability Assessment', 'explainability', 'xai'),
      s('Responsible AI', 'responsible ai'),
    ],
  },

  // 5 ─ Data Quality Engineering ─────────────────────────────────────────────
  {
    family: 'Data Quality Engineering',
    group: 'Data',
    skills: [
      s('Database Testing', 'database testing', 'db testing'),
      s('ETL Testing', 'etl testing', 'etl'),
      s('Data Reconciliation', 'data reconciliation', 'reconciliation'),
      s('Data Migration Testing', 'data migration'),
      s('Data Validation', 'data validation'),
      s('Data Profiling', 'data profiling'),
      s('SMAC Testing', 'smac'),
      s('Data Governance', 'data governance'),
    ],
  },

  // 6 ─ Digital, Mobile & Channel Testing ────────────────────────────────────
  {
    family: 'Digital, Mobile & Channel Testing',
    group: 'Mobile & Digital Testing',
    skills: [
      s('Mobile Testing', 'mobile testing', 'android testing', 'ios testing'),
      s('Digital Testing', 'digital testing'),
      s('Device Testing', 'device testing'),
    ],
  },
  {
    family: 'Digital, Mobile & Channel Testing',
    group: 'Experience Testing',
    skills: [
      s('CX Testing', 'cx testing', 'customer experience'),
      s('UX Testing', 'ux testing', 'usability'),
      s('A/B Testing', 'a/b testing', 'ab testing'),
      s('Localization Testing', 'localization', 'localisation', 'l10n'),
    ],
  },

  // 7 ─ Service Integration Quality Engineering ──────────────────────────────
  {
    family: 'Service Integration Quality Engineering',
    group: 'API & Microservices',
    skills: [
      s('API Testing (SOAP / REST)', 'api testing', 'rest api', 'soap', 'postman', 'rest assured'),
      s('Contract Testing', 'contract testing', 'pact'),
      s('Event Testing', 'event testing', 'event driven'),
      s('Service Virtualization', 'service virtualization', 'service virtualisation'),
      s('Microservices Validation', 'microservices'),
    ],
  },
  {
    family: 'Service Integration Quality Engineering',
    group: 'Enterprise Integration',
    skills: [
      s('3rd Party Integration Testing', '3rd party', 'third party integration'),
      s('Web Services / SOA Testing', 'soa', 'web services'),
      s('Mocking & Stubbing', 'mocking', 'stubbing', 'wiremock'),
      s('Schema & Payload validation', 'schema validation', 'payload validation'),
      s('Message Queue (Kafka RabbitMQ)', 'kafka', 'rabbitmq', 'message queue'),
      s('API Integration', 'api integration'),
      s('Middleware Integration', 'middleware'),
      s('E2E Service Testing', 'e2e service', 'end to end service'),
    ],
  },

  // 8 ─ Functional & Domain Quality Engineering ──────────────────────────────
  {
    family: 'Functional & Domain Quality Engineering',
    group: 'BFSI Domain',
    skills: [s('Banking, Financial Services & Insurance', 'banking', 'bfsi', 'financial services', 'insurance', 'fintech')],
  },
  {
    family: 'Functional & Domain Quality Engineering',
    group: 'MCS Domain',
    skills: [s('Manufacturing & Consumer Services', 'manufacturing', 'consumer services')],
  },
  {
    family: 'Functional & Domain Quality Engineering',
    group: 'TMT Domain',
    skills: [s('Telecom, Media & Technology', 'telecom', 'telco', 'media', '5g')],
  },
  {
    family: 'Functional & Domain Quality Engineering',
    group: 'HLS Domain',
    skills: [s('Health & Life Sciences', 'healthcare', 'life sciences', 'clinical', 'pharma', 'hl7', 'fhir')],
  },
  {
    family: 'Functional & Domain Quality Engineering',
    group: 'Functional Testing',
    skills: [
      s('Exploratory Testing', 'exploratory testing'),
      s('Document Mgmt Testing', 'document management', 'dms'),
      s('Business Rules Validation', 'business rules'),
      s('Risk-Based Testing', 'risk-based testing', 'risk based testing'),
      s('UAT', 'uat', 'user acceptance'),
    ],
  },

  // 9 ─ Packaged & Enterprise Applications Testing ───────────────────────────
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Microsoft Dynamics (D365)',
    skills: [
      s('D365 ERP Online', 'd365', 'dynamics 365', 'dynamics'),
      s('D365 Functional Associate', 'd365 functional'),
      s('D365 Solution Design – Functional (Requirements Analysis)', 'd365 solution design'),
      s('D365 Solution Design – Functional Design', 'd365 functional design'),
      s('Dynamics 365 Customer Engagement Fundamentals', 'customer engagement'),
      s('Dynamics 365 ERP Fundamentals', 'dynamics erp'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Oracle Cloud',
    skills: [
      s('Oracle CPQ', 'oracle cpq', 'cpq'),
      s('Oracle Recruiting Cloud', 'oracle recruiting'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Oracle EBS – Finance',
    skills: [
      s('General Ledger', 'general ledger'),
      s('Payables', 'payables', 'accounts payable'),
      s('Receivables', 'receivables', 'accounts receivable'),
      s('Accounting Hub', 'accounting hub'),
      s('Cash Management', 'cash management'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Oracle EBS – HCM',
    skills: [
      s('HRMS', 'hrms'),
      s('Payroll', 'payroll'),
      s('Absence Management', 'absence management'),
      s('Benefits / Compensation', 'benefits', 'compensation'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Salesforce Core',
    skills: [
      s('Salesforce Sales Cloud', 'salesforce', 'sales cloud'),
      s('Salesforce Marketing Cloud', 'marketing cloud'),
      s('Salesforce Service Cloud', 'service cloud'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'SAP Core',
    skills: [
      s('SAP FICO', 'sap fico', 'fico'),
      s('SAP MM', 'sap mm'),
      s('SAP SD', 'sap sd'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Other Platforms',
    skills: [
      s('ServiceMax', 'servicemax'),
      s('E&U Cloud CLM', 'e&u cloud', 'clm'),
    ],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'PEGA',
    skills: [s('Pega Testing', 'pega')],
  },
  {
    family: 'Packaged & Enterprise Applications Testing',
    group: 'Application & ERP Testing',
    skills: [
      s('Manhattan Testing', 'manhattan'),
      s('JD Edwards Testing', 'jd edwards', 'jde'),
      s('ERP Testing', 'erp testing'),
      // Testing skill only — NOT the E-Commerce/Retail domain. Narrow keywords on purpose.
      s('Retail & Supply Chain Testing', 'supply chain testing', 'retail & supply chain'),
    ],
  },

  // 10 ─ Continuous Testing & Release Quality Engineering ─────────────────────
  {
    family: 'Continuous Testing & Release Quality Engineering',
    group: 'DevOps & Continuous Quality',
    skills: [
      s('CI/CD', 'ci/cd', 'jenkins', 'continuous integration'),
      s('Continuous Testing / Quality Gates', 'continuous testing', 'quality gates'),
      s('Release Validation', 'release validation'),
      s('Test Orchestration', 'test orchestration'),
      s('Shift Left/Right', 'shift left', 'shift right'),
    ],
  },

  // 11 ─ Test Data Management ─────────────────────────────────────────────────
  {
    family: 'Test Data Management',
    group: 'Data Provisioning & Test Data Engineering',
    skills: [
      s('TDM', 'tdm', 'test data management'),
      s('Synthetic Data', 'synthetic data'),
      s('Environment Provisioning', 'environment provisioning'),
      s('Data Masking (Tools like GenRocket, etc)', 'data masking', 'genrocket'),
      s('Digital Twins', 'digital twin'),
    ],
  },

  // 12 ─ Learning & Enablement ────────────────────────────────────────────────
  {
    family: 'Learning & Enablement',
    group: 'Upskilling Initiatives & Capability Building',
    skills: [
      s('Panel Enablement', 'panel enablement'),
      s('Certification Enablement', 'certification enablement'),
      s('Continuous Upskilling Programs', 'upskilling'),
      s('Curriculum Development', 'curriculum'),
      s('Bootcamps', 'bootcamp'),
    ],
  },

  // 13 ─ Test Delivery, Governance & Pre-Sales support ───────────────────────
  {
    family: 'Test Delivery, Governance & Pre-Sales support',
    group: 'QI Transformation & Delivery',
    skills: [
      s('QI Transformation', 'qi transformation', 'quality transformation'),
      s('Operating Model Design', 'operating model'),
      s('Quality Governance', 'quality governance'),
      s('Quality Maturity Assessment', 'quality maturity', 'maturity assessment'),
      s('Advisory Consulting', 'advisory consulting'),
      s('KPI Frameworks', 'kpi framework'),
      s('Business Value Realization', 'business value'),
    ],
  },

  // 14 ─ QI Pre-Sales & Governance ────────────────────────────────────────────
  {
    family: 'QI Pre-Sales & Governance',
    group: 'QI Business Enablement',
    skills: [
      s('RFP/RFI', 'rfp', 'rfi'),
      s('Program Governance', 'program governance'),
      s('Estimation', 'estimation'),
      s('Resource Planning', 'resource planning'),
      s('Solutioning', 'solutioning'),
      s('Client Consulting', 'client consulting'),
      s('Value Engineering', 'value engineering'),
    ],
  },
];

// ─── Domains (fixed set of 4) ────────────────────────────────────────────────
export const QE_DOMAINS = ['BFSI', 'TMT', 'HLS', 'MCS'] as const;
export type QEDomain = typeof QE_DOMAINS[number];

export const QE_DOMAIN_LABEL: Record<string, string> = {
  BFSI: 'Banking, Financial Services & Insurance (BFSI)',
  TMT: 'Technology, Media & Telecom (TMT)',
  HLS: 'Health & Life Sciences (HLS)',
  MCS: 'Manufacturing & Consumer Services (MCS)',
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  BFSI: ['bfsi', 'banking', 'financial services', 'finance', 'insurance', 'fintech', 'capital market', 'payments', 'wealth'],
  TMT: ['tmt', 'telecom', 'telco', 'telecommunications', 'media', '5g'],
  HLS: ['hls', 'healthcare', 'health', 'life sciences', 'life science', 'clinical', 'pharma', 'medical', 'hl7', 'fhir'],
  MCS: ['mcs', 'manufacturing', 'consumer services', 'consumer', 'supply chain'],
};

/** Map any free-text domain (e.g. from an uploaded Excel) to one of the 4 codes. */
export function normalizeDomain(raw?: string | null): string {
  if (!raw) return '';
  const t = String(raw).toLowerCase().trim();
  for (const code of QE_DOMAINS) {
    if (t === code.toLowerCase()) return code;
  }
  for (const [code, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    if (kws.some(k => textIncludesTech(t, k))) return code;
  }
  return '';
}

/** Best-effort domain code derived from an employee's evidence (fallback only). */
export function deriveDomain(emp: any): string {
  const ev = buildEvidence(emp);
  for (const [code, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    if (kws.some(k => textIncludesTech(ev, k))) return code;
  }
  return '';
}

// Distinct families / groups (for dropdowns in the admin override UI).
export const QE_FAMILIES: string[] = Array.from(new Set(QE_TAXONOMY.map(g => g.family)));

export function groupsForFamily(family: string): string[] {
  return QE_TAXONOMY.filter(g => g.family === family).map(g => g.group);
}

export function essentialSkillsFor(family: string, group: string): string[] {
  const g = QE_TAXONOMY.find(x => x.family === family && x.group === group);
  return g ? g.skills.map(sk => sk.name) : [];
}

// ─── Auto-derive ─────────────────────────────────────────────────────────────
export interface QEAssignment {
  family: string;
  group: string;
  /** essential skills (within the chosen group) that matched the employee */
  matchedSkills: string[];
  /** resolved primary / secondary skill (declared → matched → override) */
  primarySkill: string;
  secondarySkill: string;
  aiForQe: boolean;
  qeForAi: boolean;
  test: boolean;
  testAutomation: boolean;
  isOverridden: boolean;
  // raw auto values (before any override) — surfaced for the override UI
  autoFamily: string;
  autoGroup: string;
  autoAiForQe: boolean;
  autoQeForAi: boolean;
  autoTest: boolean;
  autoTestAutomation: boolean;
}

const UNASSIGNED = 'Unassigned';

/** Flatten an employee object into one lowercased evidence string. */
function buildEvidence(emp: any): string {
  const parts: string[] = [];
  const push = (v: any) => { if (v != null && v !== '') parts.push(String(v)); };

  // declared skills (ZenMatrix ratings)
  (emp?.skills || []).forEach((sk: any) => {
    const rating = Number(sk?.selfRating || sk?.self_rating || 0) + Number(sk?.managerRating || sk?.manager_rating || 0);
    if (rating > 0 || sk?.validated) push(sk?.skillName || sk?.skill_name);
  });

  push(emp?.primary_skill); push(emp?.primarySkill);
  push(emp?.secondary_skill); push(emp?.secondarySkill);
  push(emp?.tertiary_skill); push(emp?.tertiarySkill);
  push(emp?.primary_domain); push(emp?.primaryDomain);
  push(emp?.designation); push(emp?.Designation);
  push(emp?.department); push(emp?.Department);

  (emp?.projects || []).forEach((p: any) => {
    push(Array.isArray(p?.technologies) ? p.technologies.join(' ') : p?.technologies);
    push(Array.isArray(p?.skills) ? p.skills.join(' ') : p?.skills);
    push(p?.domain); push(p?.name || p?.project_name); push(p?.description); push(p?.role);
  });

  (emp?.certifications || []).forEach((c: any) => {
    push(c?.name || c?.Name || c?.title || c?.Title || c?.certification_name);
  });

  return parts.join('  ').toLowerCase();
}

/** Auto-derive Family + Skill Group + flags purely from employee evidence. */
export function deriveQEAssignment(emp: any): QEAssignment {
  const evidence = buildEvidence(emp);

  let best: { group: QESkillGroup; matched: string[] } | null = null;
  let aiForQe = false;
  let qeForAi = false;

  for (const grp of QE_TAXONOMY) {
    const matched: string[] = [];
    for (const sk of grp.skills) {
      if (sk.keywords.some(k => textIncludesTech(evidence, k))) matched.push(sk.name);
    }
    if (matched.length === 0) continue;

    if (grp.family === AI_FOR_QE_FAMILY) aiForQe = true;
    if (grp.family === QE_FOR_AI_FAMILY) qeForAi = true;

    if (!best || matched.length > best.matched.length) best = { group: grp, matched };
  }

  const family = best ? best.group.family : UNASSIGNED;
  const group = best ? best.group.group : UNASSIGNED;
  const matchedSkills = best ? best.matched : [];
  const primarySkill = emp?.primary_skill || emp?.primarySkill || matchedSkills[0] || '';
  const secondarySkill = emp?.secondary_skill || emp?.secondarySkill || matchedSkills[1] || '';
  // Everyone matched into this QE taxonomy is a tester by default; the "Test
  // Automation" flag turns on for the SDET / automation family specifically.
  const test = !!best;
  const testAutomation = family === 'Test Automation Engineering - SDET';

  return {
    family, group, matchedSkills, primarySkill, secondarySkill, aiForQe, qeForAi, test, testAutomation, isOverridden: false,
    autoFamily: family, autoGroup: group, autoAiForQe: aiForQe, autoQeForAi: qeForAi,
    autoTest: test, autoTestAutomation: testAutomation,
  };
}

// ─── Per-employee override (frontend-only, localStorage) ──────────────────────
export interface QEOverride {
  family?: string;
  group?: string;
  primarySkill?: string;
  secondarySkill?: string;
  aiForQe?: boolean;
  qeForAi?: boolean;
  test?: boolean;
  testAutomation?: boolean;
}

const OVERRIDE_KEY = 'qe_assignment_overrides';

function readOverrides(): Record<string, QEOverride> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeOverrides(all: Record<string, QEOverride>): void {
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all)); } catch { /* ignore quota */ }
}

export function getQEOverride(empId: string | number): QEOverride | null {
  if (empId == null) return null;
  return readOverrides()[String(empId)] || null;
}

export function setQEOverride(empId: string | number, patch: QEOverride): void {
  if (empId == null) return;
  const all = readOverrides();
  all[String(empId)] = { ...all[String(empId)], ...patch };
  writeOverrides(all);
}

export function clearQEOverride(empId: string | number): void {
  if (empId == null) return;
  const all = readOverrides();
  delete all[String(empId)];
  writeOverrides(all);
}

/** Auto-derive, then layer any saved admin override on top. */
export function resolveQEAssignment(emp: any): QEAssignment {
  const auto = deriveQEAssignment(emp);
  const empId = emp?.id ?? emp?.zensar_id ?? emp?.ID;
  const ov = getQEOverride(empId);
  if (!ov) return auto;

  const family = ov.family ?? auto.family;
  const group = ov.group ?? auto.group;
  // If family/group were overridden, recompute matched skills against the chosen group.
  const matchedSkills = (ov.family || ov.group)
    ? essentialSkillsFor(family, group)
    : auto.matchedSkills;

  return {
    ...auto,
    family,
    group,
    matchedSkills,
    primarySkill: ov.primarySkill ?? auto.primarySkill,
    secondarySkill: ov.secondarySkill ?? auto.secondarySkill,
    aiForQe: ov.aiForQe ?? auto.aiForQe,
    qeForAi: ov.qeForAi ?? auto.qeForAi,
    test: ov.test ?? auto.test,
    testAutomation: ov.testAutomation ?? auto.testAutomation,
    isOverridden: true,
  };
}
