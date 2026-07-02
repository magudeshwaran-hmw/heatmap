/**
 * capstoneEngine.ts — Enterprise Capstone Brief Engine
 *
 * Generates a full, real-world CAPSTONE DELIVERABLE BRIEF for EVERY one of the 32
 * canonical ZenAssess skills — the same shape as the curated "Performance Testing
 * Expert" and "Banking Domain Expert" capstones:
 *
 *   • a realistic business brief (role + org + new feature + scale + timeline)
 *   • 5 concrete deliverable components (with requirements, tables, code trees,
 *     sample findings the assessor looks for)
 *   • a 100-point marking rubric (Pass ≥ 70)
 *   • "what separates a 90% submission from a 70% submission" differentiators
 *
 * The engine logic is generic. All skill specificity comes from compact, curated
 * data: a per-skill SCENARIO (so each capstone is accurate to its skill) plus a
 * family-aware component archetype. Two skills (Performance Testing, Banking) ship
 * fully-curated briefs that match the reference samples; the other 30 are assembled
 * from their scenario + archetype to the same quality bar.
 *
 * Briefs are cached + versioned (localStorage) so a skill yields stable content.
 */

import { getSkillFamily, type CanonicalSkill } from './zenTaxonomy';
import { blueprintFor, type SkillBlueprint } from './expertScenarioEngine';

// ─── Types ───────────────────────────────────────────────────────────────────
export type SubmitKind = 'repo' | 'document' | 'evidence' | 'written';

export interface CapstoneTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface CapstoneComponent {
  id: string;                 // 'c1'..'c5'
  name: string;               // "Performance test strategy document"
  summary: string;            // one-line intent
  requirements: string[];     // bullet checklist of what to include
  table?: CapstoneTable;      // optional SLA / traceability / rubric table
  codeTree?: string;          // optional repo / artifact layout
  sampleFinding?: string;     // optional "the assessor looks for evidence of…"
  submit: SubmitKind;
}

export interface RubricRow { criteria: string; max: number; lookFor: string; }
export interface Differentiator { dimension: string; pass: string; excel: string; }

export interface CapstoneBrief {
  skill: string;
  title: string;              // "Performance Testing Expert"
  role: string;               // candidate's role in the scenario
  org: string;                // organisation + situation (1 sentence)
  brief: string[];            // scenario paragraphs
  timeline: string;           // e.g. "3 weeks before launch"
  deliverable: string;        // "complete performance testing deliverable"
  components: CapstoneComponent[];
  rubric: RubricRow[];
  passMark: number;           // 70
  differentiators: Differentiator[];
}

// ─── Per-skill scenario data (the only place each skill's story lives) ─────────
interface Scenario {
  title: string;
  role: string;
  org: string;
  feature: string;            // the thing being launched / built
  scale: string;              // scale facts
  integrations: string;       // dependent systems / third parties
  timeline: string;
  deliverable: string;
  archetype: Archetype;
}

type Archetype = 'perf' | 'domain' | 'security' | 'data' | 'devops' | 'ai' | 'automation' | 'process';

const SCN: Record<string, Scenario> = {
  // ── Tools ──
  'Selenium': { title: 'Web Automation Expert', role: 'Automation Test Lead', org: 'a retail e-commerce platform serving 8M shoppers', feature: 'a redesigned checkout & order-management web portal', scale: '40,000 orders/day across 5 browsers and 3 locales', integrations: 'a payment gateway, an inventory service and a CRM', timeline: '3 weeks before the seasonal sale', deliverable: 'complete Selenium automation deliverable', archetype: 'automation' },
  'Appium': { title: 'Mobile Automation Expert', role: 'Mobile Automation Lead', org: 'a digital bank with a top-10 app-store banking app', feature: 'a redesigned mobile onboarding & payments journey', scale: '2M monthly active users on iOS and Android', integrations: 'a KYC SDK, a push-notification service and a card-payments API', timeline: '3 weeks before the app release', deliverable: 'complete Appium mobile-automation deliverable', archetype: 'automation' },
  'JMeter': { title: 'Performance Engineering Expert (JMeter)', role: 'Performance Test Lead', org: 'a digital banking platform used by 3.2M customers', feature: 'a new Instant Account Opening journey', scale: '50,000 applications/day, peak 4,000 concurrent', integrations: '6 microservices, a third-party KYC API and a credit-check engine', timeline: '3 weeks before launch', deliverable: 'complete JMeter performance deliverable', archetype: 'perf' },
  'Postman': { title: 'API Testing Expert (Postman)', role: 'API Test Lead', org: 'a payments company processing 1.2B transactions/year', feature: 'a new partner Payments API gateway (v2)', scale: '600 endpoints across 9 microservices', integrations: 'an auth service, a fraud engine and 3 partner banks', timeline: '3 weeks before partner go-live', deliverable: 'complete API test deliverable', archetype: 'automation' },
  'JIRA': { title: 'QE Process & Delivery Expert', role: 'QE Process Lead', org: 'a 200-engineer fintech scaling to 12 squads', feature: 'a standardised quality & defect-governance process', scale: '12 squads, ~400 stories per PI', integrations: 'CI pipelines, a test-management tool and release governance', timeline: '3 weeks before the next Program Increment', deliverable: 'complete QE process & governance deliverable', archetype: 'process' },
  'TestRail': { title: 'Test Management Expert', role: 'Test Manager', org: 'a regulated insurer launching a new digital channel', feature: 'a coverage-traceable test-management practice', scale: '1,200+ test cases across 6 releases', integrations: 'JIRA, CI pipelines and a requirements repository', timeline: '3 weeks before the regulated release', deliverable: 'complete test-management & traceability deliverable', archetype: 'process' },
  'Playwright': { title: 'Modern E2E Automation Expert', role: 'Automation Architect', org: 'a SaaS company with a 500k-seat analytics product', feature: 'a re-platformed dashboard & admin console', scale: '300+ critical user journeys, 4 browsers', integrations: 'an SSO provider, a billing service and a reporting API', timeline: '3 weeks before the GA cutover', deliverable: 'complete Playwright E2E deliverable', archetype: 'automation' },

  // ── Technologies ──
  'Python': { title: 'Python SDET / Automation Expert', role: 'Principal SDET', org: 'a logistics platform tracking 5M shipments/day', feature: 'a Python test-automation & data-validation framework', scale: '2,000+ automated checks across 7 services', integrations: 'REST APIs, a message queue and a data warehouse', timeline: '3 weeks before peak season', deliverable: 'complete Python automation deliverable', archetype: 'automation' },
  'Java': { title: 'Java SDET Expert', role: 'Principal SDET', org: 'a telecom selling 30M plans/year online', feature: 'a Java (TestNG + RestAssured) automation framework', scale: '1,500+ tests across web and API layers', integrations: 'an order-management system, a CRM and a billing API', timeline: '3 weeks before the catalogue launch', deliverable: 'complete Java automation deliverable', archetype: 'automation' },
  'JavaScript': { title: 'JavaScript Test Engineering Expert', role: 'Lead SDET', org: 'a media streaming service with 20M subscribers', feature: 'a JavaScript E2E + integration test framework', scale: '800+ tests across web and Node services', integrations: 'an auth service, a recommendation API and a CDN', timeline: '3 weeks before a major release', deliverable: 'complete JavaScript test deliverable', archetype: 'automation' },
  'TypeScript': { title: 'TypeScript Test Engineering Expert', role: 'Lead SDET', org: 'a B2B SaaS company with a typed front-end monorepo', feature: 'a strongly-typed Playwright + API test framework', scale: '600+ typed tests in a Nx monorepo', integrations: 'an SSO provider, a GraphQL gateway and a billing service', timeline: '3 weeks before GA', deliverable: 'complete TypeScript test deliverable', archetype: 'automation' },
  'C#': { title: '.NET Test Automation Expert', role: 'Principal SDET', org: 'an insurer running a large .NET policy platform', feature: 'a C# (SpecFlow + RestSharp) automation framework', scale: '1,000+ tests across UI and API', integrations: 'a policy-admin system, a payments API and a document service', timeline: '3 weeks before the renewal season', deliverable: 'complete .NET automation deliverable', archetype: 'automation' },
  'SQL': { title: 'Data & SQL Validation Expert', role: 'Principal Data QE', org: 'a bank consolidating into a new data warehouse', feature: 'a data-validation & reconciliation suite for the migration', scale: '4TB across 120 source tables', integrations: 'an ETL pipeline, a source OLTP system and a BI layer', timeline: '3 weeks before the migration cutover', deliverable: 'complete data-validation deliverable', archetype: 'data' },

  // ── Application Testing ──
  'API Testing': { title: 'API Testing Expert', role: 'API Test Lead', org: 'a healthcare platform integrating 14 providers', feature: 'a new FHIR-based clinical Integration API', scale: '250 endpoints, 3M calls/day', integrations: 'an EHR, an identity service and an HL7/FHIR gateway', timeline: '3 weeks before the provider go-live', deliverable: 'complete API test deliverable', archetype: 'automation' },
  'Mobile Testing': { title: 'Mobile Testing Expert', role: 'Mobile QE Lead', org: 'a ride-hailing company with 15M riders', feature: 'a redesigned rider & driver mobile experience', scale: 'iOS + Android, 12 device classes, 4 networks', integrations: 'a maps SDK, a payments API and a real-time location service', timeline: '3 weeks before the city launch', deliverable: 'complete mobile-testing deliverable', archetype: 'automation' },
  'Performance Testing': { title: 'Performance Testing Expert', role: 'Performance Test Lead', org: 'a digital banking platform used by 3.2M customers', feature: 'a new Instant Account Opening journey', scale: '50,000 applications/day, peak 4,000 concurrent (6–8pm)', integrations: '6 microservices, a third-party KYC API, an identity-verification service and a credit-check engine', timeline: '3 weeks before launch', deliverable: 'complete performance testing deliverable', archetype: 'perf' },
  'Security Testing': { title: 'Application Security Testing Expert', role: 'Security Test Lead', org: 'a fintech exposing a regulated open-banking API', feature: 'a new partner-facing Open Banking API surface', scale: '180 endpoints, PII for 4M customers', integrations: 'an OAuth2 provider, a consent service and a transaction store', timeline: '3 weeks before the security gate', deliverable: 'complete security-testing (VAPT) deliverable', archetype: 'security' },
  'Database Testing': { title: 'Database Testing Expert', role: 'Data Quality Lead', org: 'a retailer migrating to a new order data store', feature: 'an ETL + data-integrity validation programme', scale: '2TB across 80 tables, hourly batches', integrations: 'a source ERP, an ETL pipeline and a reporting warehouse', timeline: '3 weeks before the data cutover', deliverable: 'complete database-testing deliverable', archetype: 'data' },
  'Accessibility Testing': { title: 'Accessibility Testing Expert', role: 'Accessibility QE Lead', org: 'a government services portal used by 10M citizens', feature: 'a redesigned online services & forms journey', scale: '60 key pages, WCAG 2.2 AA target', integrations: 'a screen-reader matrix, an identity service and a payments flow', timeline: '3 weeks before the public launch', deliverable: 'complete accessibility-testing deliverable', archetype: 'process' },

  // ── Domain ──
  'Banking': { title: 'Banking Domain Expert', role: 'QE Domain Lead', org: 'a retail bank launching an Open Banking journey', feature: 'an Open Banking-enabled Mortgage Pre-Approval (Decision in Principle)', scale: '15-minute digital journey, FCA/GDPR regulated', integrations: 'a mortgage-origination system, Experian, a property-valuation API and an affordability engine', timeline: '3 weeks before launch', deliverable: 'complete QE domain deliverable', archetype: 'domain' },
  'Healthcare': { title: 'Healthcare Domain Expert', role: 'QE Domain Lead', org: 'a hospital group launching a patient portal', feature: 'an e-prescribing & lab-results journey', scale: '2M patients, HIPAA + HL7/FHIR regulated', integrations: 'an EHR, a pharmacy system, a lab (LIS) and an identity service', timeline: '3 weeks before go-live', deliverable: 'complete QE domain deliverable', archetype: 'domain' },
  'E-Commerce': { title: 'E-Commerce Domain Expert', role: 'QE Domain Lead', org: 'a marketplace expecting a record peak-sale event', feature: 'a re-platformed checkout, promotions & fulfilment journey', scale: '12M shoppers, 60k orders/hour at peak', integrations: 'a payment gateway, a tax engine, an inventory service and a shipping API', timeline: '3 weeks before the peak-sale event', deliverable: 'complete QE domain deliverable', archetype: 'domain' },
  'Insurance': { title: 'Insurance Domain Expert', role: 'QE Domain Lead', org: 'an insurer digitising first-notice-of-loss', feature: 'a digital claims & underwriting decision journey', scale: '500k policies, FCA + GDPR regulated', integrations: 'a policy-admin system, a fraud engine, a payments API and a document service', timeline: '3 weeks before the channel launch', deliverable: 'complete QE domain deliverable', archetype: 'domain' },
  'Telecom': { title: 'Telecom Domain Expert', role: 'QE Domain Lead', org: 'a carrier launching a 5G plan & device journey', feature: 'a digital order-to-activation (OSS/BSS) journey', scale: '30M subscribers, real-time provisioning', integrations: 'an order-management system, a billing engine, a CRM and a network-provisioning API', timeline: '3 weeks before the 5G launch', deliverable: 'complete QE domain deliverable', archetype: 'domain' },

  // ── Testing Types ──
  'Functional Testing': { title: 'Functional QE Expert', role: 'QE Lead', org: 'a bank releasing a customer-servicing platform', feature: 'an end-to-end servicing & self-service journey', scale: '9 epics, 60+ user journeys', integrations: 'a core system, a notification service and a CRM', timeline: '3 weeks before the release', deliverable: 'complete functional QE deliverable', archetype: 'process' },
  'Automation Testing': { title: 'Test Automation Expert', role: 'Automation Architect', org: 'an enterprise with a 3,000-case manual regression pack', feature: 'a scalable automation framework + CI strategy', scale: '3,000 candidate cases across web/API', integrations: 'a CI server, a test-management tool and a reporting stack', timeline: '3 weeks before the automation gate', deliverable: 'complete automation framework deliverable', archetype: 'automation' },
  'Regression Testing': { title: 'Regression Strategy Expert', role: 'QE Lead', org: 'a product team shipping fortnightly to 9M users', feature: 'a risk-based regression optimisation programme', scale: '2,500 regression cases, 6-hour cycle', integrations: 'a CI pipeline, a coverage tool and change-impact analysis', timeline: '3 weeks before the release cadence change', deliverable: 'complete regression-optimisation deliverable', archetype: 'process' },
  'UAT': { title: 'UAT & Acceptance Expert', role: 'UAT Lead', org: 'an insurer rolling out a regulated policy platform', feature: 'a structured UAT & business-acceptance programme', scale: '40 business users, 8 weeks of UAT', integrations: 'a policy-admin system, a payments API and sign-off governance', timeline: '3 weeks before UAT entry', deliverable: 'complete UAT programme deliverable', archetype: 'process' },

  // ── DevOps ──
  'Git': { title: 'Source Control & Release Flow Expert', role: 'Release Engineering Lead', org: 'a 15-squad org with an unstable trunk', feature: 'a branching, review & GitOps release strategy', scale: '15 squads, 200 merges/day', integrations: 'CI/CD pipelines, environments and release governance', timeline: '3 weeks before the release-flow rollout', deliverable: 'complete source-control & release deliverable', archetype: 'devops' },
  'Jenkins': { title: 'CI/CD Pipeline Expert', role: 'DevOps Lead', org: 'a microservices estate of 40 services', feature: 'a standardised CI/CD pipeline & quality-gate strategy', scale: '40 services, 300 builds/day', integrations: 'a container registry, a test stack and a deploy target', timeline: '3 weeks before the pipeline cutover', deliverable: 'complete CI/CD pipeline deliverable', archetype: 'devops' },
  'Docker': { title: 'Containerisation Expert', role: 'Platform Engineering Lead', org: 'a company moving 40 services to containers', feature: 'a container build, registry & orchestration strategy', scale: '40 services to Kubernetes', integrations: 'a registry, a CI pipeline and an orchestrator', timeline: '3 weeks before the platform migration', deliverable: 'complete containerisation deliverable', archetype: 'devops' },
  'Azure DevOps': { title: 'Azure Delivery Expert', role: 'Cloud Delivery Lead', org: 'an enterprise standardising on Azure DevOps', feature: 'an end-to-end pipeline, boards & environments setup', scale: '12 teams, 50 repos', integrations: 'Azure Repos, Pipelines, Artifacts and Environments', timeline: '3 weeks before the org-wide rollout', deliverable: 'complete Azure delivery deliverable', archetype: 'devops' },

  // ── AI ──
  'ChatGPT/Prompt Engineering': { title: 'GenAI / Prompt Engineering Expert', role: 'GenAI Quality Lead', org: 'a company shipping an LLM customer-support assistant', feature: 'a production LLM assistant + evaluation harness', scale: '1M conversations/month', integrations: 'an LLM provider, a RAG knowledge base and a guardrails layer', timeline: '3 weeks before the assistant launch', deliverable: 'complete GenAI quality deliverable', archetype: 'ai' },
  'AI Test Automation': { title: 'AI Test Automation Expert', role: 'Intelligent Automation Lead', org: 'an enterprise with a flaky 4,000-case suite', feature: 'a self-healing, AI-assisted test-automation platform', scale: '4,000 tests, 30% historical flake rate', integrations: 'a CI pipeline, a model/inference service and a test-management tool', timeline: '3 weeks before the stability gate', deliverable: 'complete AI test-automation deliverable', archetype: 'ai' },
};

// Fallback scenario so an unmapped skill still produces a coherent brief.
function scenarioFor(skill: string): Scenario {
  if (SCN[skill]) return SCN[skill];
  const fam = getSkillFamily(skill);
  const archetype: Archetype = fam?.id === 4 ? 'domain' : fam?.id === 7 ? 'devops' : fam?.id === 6 ? 'data' : 'automation';
  return {
    title: `${skill} Expert`,
    role: 'Principal Engineer',
    org: 'an enterprise platform serving millions of users',
    feature: `a new ${skill.toLowerCase()} capability`,
    scale: 'high-volume production traffic',
    integrations: 'several internal services and a third-party dependency',
    timeline: '3 weeks before launch',
    deliverable: `complete ${skill} deliverable`,
    archetype,
  };
}

// ─── Component archetypes (5 components each, tailored from the scenario) ──────
type Builder = (s: Scenario, bp: SkillBlueprint) => CapstoneComponent[];

const perfComponents: Builder = (s, bp) => [
  {
    id: 'c1', name: 'Performance test strategy document', submit: 'document',
    summary: 'Scope, test types, entry/exit criteria, justified SLAs, environment strategy and a risk register.',
    requirements: [
      'Scope — what is in scope and explicitly what is out of scope',
      'Test types — load, stress, spike and endurance/soak, each with a reason it is needed',
      'Measurable entry and exit criteria (what must be true to start, what counts as a pass)',
      'Environment strategy — why you cannot test on production and how the perf env is representative',
      'Risk register — at least 5 risks with likelihood, impact and mitigation',
    ],
    table: {
      title: 'SLA definitions (each must be justified, not arbitrary)',
      headers: ['Metric', 'Target', 'Justification'],
      rows: [
        [`${s.feature} end-to-end time`, 'P95 < 4 s', 'Business requirement — API calls must not dominate the journey'],
        ['Third-party (e.g. KYC) response', 'P99 < 2 s', 'Third-party SLA — their limit must be tested too'],
        ['Throughput', `≥ ${s.scale.split(',')[0]} at peak`, 'Business / capacity requirement'],
        ['Error rate', '< 0.1 %', 'Zero tolerance in a regulated journey'],
        ['CPU utilisation', '< 70 % at peak', 'Leave headroom for spikes'],
      ],
    },
  },
  {
    id: 'c2', name: 'Test framework (Git repository)', submit: 'repo',
    summary: 'A working k6 or JMeter framework with parameterised data, mocked third party and thresholds-as-code.',
    requirements: [
      'Each virtual user uses a UNIQUE identity (no single test record repeated)',
      'Realistic think time is modelled — not sleep(1) on every step',
      `The third-party dependency (${s.integrations.includes('KYC') ? 'KYC' : 'external service'}) is MOCKED so tests do not depend on it`,
      'SLA thresholds are defined as code — the test fails automatically if they are breached',
      'A CI pipeline triggers the load test nightly and publishes results',
      'Distributed execution is configured for the spike test (one machine cannot generate peak load reliably)',
    ],
    codeTree: [
      '/performance-tests',
      '  /scenarios   load_test · stress_test · spike_test · soak_test',
      '  /data        test_users.csv (10k unique) · kyc_responses.json',
      '  /config      environments.json · thresholds.json (SLAs as code)',
      '  /utils       kyc_mock · data_generator (unique id/DOB/address per VU)',
      '  /ci          Jenkinsfile / GitHub Actions · docker-compose (distributed)',
      '  README.md    setup, execution & interpretation guide',
    ].join('\n'),
  },
  {
    id: 'c3', name: 'Test results & analysis report', submit: 'evidence',
    summary: 'Run the load test, present TPS/P95/P99/error-rate over time, find a bottleneck and root-cause it.',
    requirements: [
      'A dashboard screenshot or HTML report showing TPS, P95, P99 and error rate over time',
      'At least one bottleneck identified and documented',
      'Root-cause analysis — DB connection pool? thread-pool exhaustion? mock latency? a memory leak?',
      'A specific, actionable recommendation (fix it, or accept the risk with justification)',
    ],
    sampleFinding: 'e.g. "At 3,200 concurrent users the account-creation service degraded from 1.2 s to 8.7 s. CPU stayed below 60% but the logs showed thread-pool exhaustion. Raising the pool 200→500 and adding a 3 s connection-pool timeout cut P95 to 2.1 s at 4,000 VU. The mock held steady at 400 ms — confirming the bottleneck was internal, not external."',
  },
  {
    id: 'c4', name: 'CI/CD integration evidence', submit: 'evidence',
    summary: 'Show the performance tests gating the delivery pipeline — both a pass and a threshold-breach failure.',
    requirements: [
      'A pipeline (Jenkins / GitHub Actions) that triggers the load test on merge to main',
      'A run where the test PASSED (log or screenshot)',
      'A run where the test FAILED because a threshold was breached — and the alert that fired',
      'Explanation of how you would gate a production deployment when performance degrades',
    ],
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'Launch-day spike to ~2× the tested peak: walk through your first 30 minutes on call.',
    requirements: [
      'Immediate — read the dashboards to find which service is degrading',
      'Escalate to platform engineering and the incident manager simultaneously',
      'Mitigate — queue-based throttling to cap concurrency, communicate high demand to customers',
      'Communicate to the business — do not let leadership find out from social media',
      'Root cause — was it a configuration cap or a genuine capacity limit?',
      'Post-incident — rerun stress test to the real peak, update capacity plan, add auto-scaling',
    ],
  },
];

const domainComponents: Builder = (s) => [
  {
    id: 'c1', name: 'Test strategy & regulatory traceability matrix', submit: 'document',
    summary: 'Scope across all integrations + a matrix mapping each regulation/rule to a specific test case.',
    requirements: [
      `Scope covering all integrations (${s.integrations}) and the end-to-end journey`,
      'A regulatory traceability matrix: at least 20 requirements mapped to test-case IDs',
      'Each row cites the SPECIFIC regulation/rule — not a generic "compliance" line',
      'Risk assessment — top 5 highest-risk areas with impact rating and test-depth justification',
      'Definition of done — what "100% tested" means for a regulatory-critical system',
    ],
    table: {
      title: 'Regulatory traceability matrix (≥ 20 rows; example shape)',
      headers: ['Regulation', 'Rule', 'Test case ID', 'Test description'],
      rows: [
        ['MCOB 11.6.2', 'Affordability must consider committed expenditure', 'TC-AFF-001', 'Verify committed repayments are deducted before the affordability calc'],
        ['GDPR Art 7', 'Consent freely given, specific & informed', 'TC-CONS-001', 'Verify the consent screen states the data is used for this assessment only'],
        ['Open Banking v3.1', 'AIS data not retained beyond consent period', 'TC-DATA-001', 'Verify cached data is deleted after the consent window'],
        ['FCA Consumer Duty', 'Decline reasons in plain English', 'TC-DECL-001', 'Verify a declined customer is given a clear, plain-English reason'],
      ],
    },
  },
  {
    id: 'c2', name: 'Test cases for the core domain scenarios', submit: 'document',
    summary: 'Detailed cases across the affordability/decision engine, the consent flow and the decision output.',
    requirements: [
      'Each case has: test ID, precondition, steps, expected result and the rule it validates',
      'Area A — core decision engine: 8+ cases (happy path, fail path, edge cases, manual-review triggers)',
      'Area B — consent / data flow: 6+ cases (grant, expiry+purge, revoke mid-journey, no-data, multi-source)',
      'Area C — decision output: 6+ cases (issue, decline reason shown, conditional, validity expiry, carry-forward, soft vs hard search)',
      'Expected results must reference the regulation, and edge cases must be domain-specific',
    ],
  },
  {
    id: 'c3', name: 'End-to-end execution evidence & defects', submit: 'evidence',
    summary: 'An execution report for 30+ cases, 3+ well-written defects and a justified go/no-go.',
    requirements: [
      'Execution report (Xray/TestRail/spreadsheet) — 30+ cases executed or a documented walkthrough',
      'At least 3 defects in JIRA format: severity, description, steps to reproduce, suggested fix',
      'Each defect references the SPECIFIC regulatory rule being violated',
      'A test summary: pass rate, failed, blocked, and overall quality assessment',
      'A go/no-go recommendation with clear, evidence-backed justification',
    ],
    sampleFinding: 'e.g. "Critical — the engine does not apply the regulatory stress-rate buffer (base + 3%). A customer who fails affordability when the buffer is applied manually is still approved. MCOB 11.6.18 is violated — recommend blocking go-live."',
  },
  {
    id: 'c4', name: 'Regulatory compliance sign-off checklist', submit: 'document',
    summary: 'A 25+ item checklist the QE team certifies before recommending regulatory go-live.',
    requirements: [
      'At least 25 specific, realistic compliance checks',
      'Each item has a status (Pass / In progress / Fail) and the evidence backing it',
      'Items reference test-case IDs, sign-offs (e.g. DPO) and defect IDs where relevant',
      'Shows real understanding of the bank/insurer/provider\'s compliance obligations',
    ],
    table: {
      title: 'Compliance sign-off (example rows)',
      headers: ['#', 'Compliance check', 'Status', 'Evidence'],
      rows: [
        ['1', 'All core regulatory rules tested and passed', 'Pass', 'TC-AFF-001..008 — all passed'],
        ['2', 'Consent screens reviewed by the DPO', 'Pass', 'DPO sign-off email dated 20 Jun'],
        ['3', 'Data purge tested at the consent boundary', 'Pass', 'TC-DATA-001 — data confirmed deleted'],
        ['4', 'Standardised disclosure document generated for every decision', 'Fail', 'DEF-002 — missing for joint applications'],
      ],
    },
  },
  {
    id: 'c5', name: 'Domain knowledge written scenarios', submit: 'written',
    summary: 'Two one-page answers showing regulatory knowledge beyond QE.',
    requirements: [
      'Scenario 1 — automated decision-making: obligations under Consumer Duty & GDPR Art 22, and what QE should have tested (disclosure wording, human-review path, explanation letter, audit trail of inputs)',
      'Scenario 2 — a TPP/data-access breach: actions from discovery to resolution, including ICO notification within 72h (GDPR Art 33), regulator notification, root cause and the QE failure to fix',
      'Answers must show regulation knowledge (GDPR, FCA, the relevant standard) — not just generic QE',
    ],
  },
];

const securityComponents: Builder = (s) => [
  {
    id: 'c1', name: 'Security test strategy & threat model', submit: 'document',
    summary: 'Scope, threat model, OWASP mapping, rules of engagement and a justified risk register.',
    requirements: [
      `Scope across the surface (${s.integrations}) — in/out of scope explicitly stated`,
      'A threat model (e.g. STRIDE) for the key data flows and trust boundaries',
      'Coverage mapped to OWASP Top 10 / ASVS with the relevant control level',
      'Rules of engagement: environment, authorisation, data handling, stop conditions',
      'Risk register — 5+ risks with likelihood, impact and mitigation (PII exposure called out)',
    ],
  },
  {
    id: 'c2', name: 'Test framework / tooling (Git repository)', submit: 'repo',
    summary: 'Automated security checks: auth/authorization, injection, scope-validation and dependency scanning.',
    requirements: [
      'Authenticated and unauthenticated test paths, with token/scope manipulation',
      'Checks for OWASP issues: injection, broken access control, broken auth, SSRF, etc.',
      'API scope/field validation tests (a low-privilege caller must not read privileged fields)',
      'Dependency / SAST / DAST scanning wired in, with thresholds as code',
      'A CI pipeline that runs the security checks and fails on a new high/critical finding',
    ],
    codeTree: [
      '/security-tests',
      '  /authz       broken-access-control, scope-validation, IDOR',
      '  /injection   sqli, nosqli, command, ssrf',
      '  /config      targets.json · thresholds.json (fail on high/critical)',
      '  /ci          pipeline (SAST + DAST + dependency scan)',
      '  README.md    rules of engagement & how to run safely',
    ].join('\n'),
  },
  {
    id: 'c3', name: 'Findings & analysis report', submit: 'evidence',
    summary: 'Run the assessment, present findings with CVSS, prove at least one exploitable issue and root-cause it.',
    requirements: [
      'Findings table with severity (CVSS), affected asset and evidence (request/response)',
      'At least one exploitable/high-severity finding demonstrated end-to-end',
      'Root-cause analysis — was it missing authz, an unrestricted scope, weak validation?',
      'Specific, actionable remediation with a re-test plan',
    ],
    sampleFinding: 'e.g. "A newly-onboarded partner token could read fields outside its consent scope. Root cause: the API scope was not restricted and consent category was not validated server-side. Adding response-field validation to the regression suite and a scope penetration check to the release gate closes it."',
  },
  {
    id: 'c4', name: 'CI/CD security-gate evidence', submit: 'evidence',
    summary: 'Show security tests gating the pipeline — a clean pass and a blocked build on a new critical finding.',
    requirements: [
      'A pipeline that runs SAST/DAST/dependency scans on merge to main',
      'A run that PASSED the security gate',
      'A run BLOCKED by a new high/critical finding — and the alert raised',
      'How you would gate a production deployment when a critical vulnerability is found',
    ],
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'A live data-exposure incident: walk through discovery to resolution and notification obligations.',
    requirements: [
      'Immediately raise a P1 security defect; escalate to the CISO and DPO',
      'Contain — suspend the affected access while investigating',
      'Scope it — how many records, by whom, over what period',
      'Notify — ICO within 72h if personal data was breached (GDPR Art 33); regulator if required',
      'Root cause + the QE failure (what was not tested) and how you add it to the release gate',
    ],
  },
];

const dataComponents: Builder = (s) => [
  {
    id: 'c1', name: 'Data test strategy & coverage model', submit: 'document',
    summary: 'Scope, validation types, reconciliation approach, environment strategy and a risk register.',
    requirements: [
      `Scope across source → ${s.feature} → target (${s.integrations})`,
      'Validation types: completeness, correctness, transformation, referential integrity, duplicates, nulls',
      'Row-count and checksum reconciliation approach (source vs target)',
      'Environment & data strategy — representative volumes, masking of PII',
      'Risk register — 5+ risks (data loss, silent truncation, late-arriving data) with mitigations',
    ],
  },
  {
    id: 'c2', name: 'Validation suite (Git repository)', submit: 'repo',
    summary: 'A working SQL/dbt/Python validation suite with parameterised sources and thresholds as code.',
    requirements: [
      'Reusable, parameterised checks across tables (not one-off ad-hoc queries)',
      'Reconciliation queries: row counts, aggregates and checksums source vs target',
      'Transformation rules validated against the mapping spec',
      'Pass/fail thresholds defined as code (e.g. zero unmatched rows on key columns)',
      'A CI pipeline that runs the suite per batch and publishes a data-quality report',
    ],
    codeTree: [
      '/data-tests',
      '  /reconciliation   counts · aggregates · checksums',
      '  /transformations  mapping-rule assertions',
      '  /integrity        nulls · duplicates · referential',
      '  /config           sources.json · thresholds.json',
      '  /ci               pipeline (per-batch run + report)',
      '  README.md         setup & interpretation guide',
    ].join('\n'),
  },
  {
    id: 'c3', name: 'Results & root-cause report', submit: 'evidence',
    summary: 'Run the suite, present pass/fail by check, find a real data defect and root-cause it.',
    requirements: [
      'A data-quality report: rows checked, matched/unmatched, by validation type',
      'At least one data defect identified (truncation, mismatch, dropped rows, bad join)',
      'Root-cause analysis — ETL mapping bug? timezone/encoding? a late-arriving partition?',
      'A specific, actionable recommendation and a re-validation plan',
    ],
    sampleFinding: 'e.g. "0.4% of orders were missing in the target. Root cause: an inner join dropped rows whose customer record arrived in a later batch. Switching to a left join + a late-arriving-data reconciliation pass recovered all rows; added a daily orphan-row check to the suite."',
  },
  {
    id: 'c4', name: 'CI/CD data-gate evidence', submit: 'evidence',
    summary: 'Show validation gating the data pipeline — a clean batch and a blocked batch on a threshold breach.',
    requirements: [
      'A pipeline that runs the validation suite on each batch/merge',
      'A run that PASSED the data-quality gate',
      'A run BLOCKED because a threshold was breached — and the alert raised',
      'How you would stop a bad batch from being published to the warehouse/BI layer',
    ],
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'Bad data has reached the BI layer and leadership is seeing wrong numbers. Your first 30 minutes.',
    requirements: [
      'Immediate — confirm scope and quarantine/roll back the affected partition',
      'Escalate to data engineering and the incident manager simultaneously',
      'Communicate to consumers — flag the affected reports as not-trusted',
      'Root cause — pipeline change, source change, or a late-arriving-data assumption?',
      'Post-incident — backfill correctly, add the missing validation, update the runbook',
    ],
  },
];

const devopsComponents: Builder = (s) => [
  {
    id: 'c1', name: 'Delivery strategy document', submit: 'document',
    summary: 'Scope, target topology, branching/environment strategy, quality gates and a risk register.',
    requirements: [
      `Scope and goals for ${s.feature} across ${s.scale}`,
      'Target topology / branching & environment model (dev → perf → staging → prod)',
      'Quality gates: build, test, security and approval gates with clear pass criteria',
      'Rollback & progressive-delivery strategy (blue/green or canary)',
      'Risk register — 5+ risks (failed deploys, drift, secret exposure) with mitigations',
    ],
  },
  {
    id: 'c2', name: 'Pipeline / IaC (Git repository)', submit: 'repo',
    summary: 'A working pipeline (and IaC where relevant) with stages, gates and reproducible environments as code.',
    requirements: [
      'Build → test → scan → deploy stages, parameterised per environment',
      'Quality gates wired in (tests + coverage + security) — a breach fails the pipeline',
      'Environments / infrastructure defined as code (reproducible, no snowflakes)',
      'Secrets handled safely (no plaintext credentials; least-privilege access)',
      'Distributed / parallel execution where the workload needs it',
    ],
    codeTree: [
      '/delivery',
      '  /pipeline     build · test · scan · deploy stages',
      '  /iac          environments as code (dev/perf/staging/prod)',
      '  /config       gates.json (thresholds) · environments.json',
      '  /scripts      promote · rollback · smoke-check',
      '  README.md     setup, run & rollback guide',
    ].join('\n'),
  },
  {
    id: 'c3', name: 'Execution results & analysis', submit: 'evidence',
    summary: 'Run the pipeline, present build/deploy metrics, find a bottleneck/instability and root-cause it.',
    requirements: [
      'Metrics over time: build duration, success rate, lead time, deploy frequency',
      'At least one bottleneck or instability identified (slow stage, flaky gate, drift)',
      'Root-cause analysis — caching? parallelism? a non-reproducible environment?',
      'A specific, actionable recommendation with the expected improvement',
    ],
    sampleFinding: 'e.g. "Build time grew from 6 to 19 minutes as services were added. Root cause: no dependency caching and serial test stages. Adding a layer cache and parallelising the test matrix cut it to 7 minutes; flaky-gate rate dropped after pinning the test environment in IaC."',
  },
  {
    id: 'c4', name: 'CI/CD gate evidence', submit: 'evidence',
    summary: 'Show the gates working — a clean deploy and a blocked deploy on a failed gate, plus the alert.',
    requirements: [
      'A run that deployed cleanly through all gates',
      'A run BLOCKED because a gate failed (test/coverage/security) — and the alert raised',
      'Evidence of an automated rollback or a halted promotion',
      'How you would gate a production deployment when quality/health degrades',
    ],
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'A bad release is degrading production during peak. Your first 30 minutes on call.',
    requirements: [
      'Immediate — read dashboards, confirm the bad change and its blast radius',
      'Escalate to the SRE on-call lead and the incident manager simultaneously',
      'Mitigate — roll back / halt promotion (forward-safe only under a freeze)',
      'Communicate to the business on a fixed cadence — impact and ETA',
      'Root cause + post-incident — add the missing gate, update the runbook, blameless review',
    ],
  },
];

const aiComponents: Builder = (s) => [
  {
    id: 'c1', name: 'Evaluation strategy document', submit: 'document',
    summary: 'Scope, eval dimensions, golden dataset, guardrail policy, success metrics and a risk register.',
    requirements: [
      `Scope of the ${s.feature} and what is explicitly out of scope`,
      'Evaluation dimensions: correctness, grounding/faithfulness, safety, tone, latency, cost',
      'A golden dataset / rubric strategy — how ground truth is defined and curated',
      'Guardrail & safety policy (PII, jailbreaks, hallucination, prompt injection)',
      'Risk register — 5+ risks (hallucination, drift, prompt injection, cost runaway) with mitigations',
    ],
  },
  {
    id: 'c2', name: 'Evaluation harness (Git repository)', submit: 'repo',
    summary: 'A working eval harness with a versioned dataset, automated scorers and thresholds as code.',
    requirements: [
      'A versioned golden dataset of representative + adversarial cases',
      'Automated scorers (exact/semantic match, LLM-as-judge with a rubric, regex guards)',
      'Grounding/faithfulness checks against the knowledge source (for RAG)',
      'Pass/fail thresholds defined as code — a regression fails the run automatically',
      'A CI pipeline that runs evals on prompt/model changes and publishes a scorecard',
    ],
    codeTree: [
      '/llm-eval',
      '  /datasets     golden.jsonl · adversarial.jsonl (versioned)',
      '  /scorers      match · llm-judge · grounding · safety-guards',
      '  /config       thresholds.json (fail on regression)',
      '  /ci           pipeline (eval on prompt/model change + scorecard)',
      '  README.md     setup, run & interpretation guide',
    ].join('\n'),
  },
  {
    id: 'c3', name: 'Evaluation results & analysis', submit: 'evidence',
    summary: 'Run the evals, present scores by dimension, find a failure mode and root-cause it.',
    requirements: [
      'A scorecard: accuracy/grounding/safety/latency/cost over the dataset',
      'At least one failure mode identified (hallucination, refusal, injection, drift)',
      'Root-cause analysis — prompt? retrieval quality? model choice? missing guardrail?',
      'A specific, actionable recommendation (prompt/retrieval/guardrail change) with before/after',
    ],
    sampleFinding: 'e.g. "Faithfulness dropped to 71% on multi-document questions. Root cause: retrieval returned only the top-1 chunk. Raising k to 4 + re-ranking lifted grounded answers to 93% with a 120 ms latency cost; added a no-context → safe-refusal guard."',
  },
  {
    id: 'c4', name: 'CI/CD eval-gate evidence', submit: 'evidence',
    summary: 'Show evals gating prompt/model changes — a clean pass and a blocked change on a regression.',
    requirements: [
      'A pipeline that runs the eval suite on any prompt/model/config change',
      'A run that PASSED the eval gate',
      'A run BLOCKED by a quality/safety regression — and the alert raised',
      'How you would gate a production rollout (and roll back) when quality regresses',
    ],
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'The assistant starts giving unsafe/wrong answers in production. Your first 30 minutes.',
    requirements: [
      'Immediate — confirm scope via logs/traces; identify the change (prompt/model/data)',
      'Escalate to the on-call lead and the incident manager simultaneously',
      'Mitigate — roll back the prompt/model or tighten the guardrail / fall back to a safe response',
      'Communicate to the business and (if needed) affected users',
      'Root cause + post-incident — add the missing eval case, update guardrails, monitor drift',
    ],
  },
];

const automationComponents: Builder = (s, bp) => [
  {
    id: 'c1', name: 'Test strategy & automation approach', submit: 'document',
    summary: 'Scope, layered test strategy, framework design, environment strategy and a risk register.',
    requirements: [
      `Scope across ${s.feature} (${s.integrations}) — in/out of scope explicit`,
      'Test pyramid: what is automated at unit/API/UI and why; what stays manual',
      'Framework design: page objects / API layer, data strategy, reporting, parallelism',
      'Environment & test-data strategy (isolated, repeatable, no shared mutable state)',
      'Risk register — 5+ risks (flaky locators, env instability, test-data collisions) with mitigations',
    ],
  },
  {
    id: 'c2', name: 'Automation framework (Git repository)', submit: 'repo',
    summary: 'A working, modular framework with parameterised data, mocked dependencies and thresholds as code.',
    requirements: [
      'Modular design — reusable page objects / API clients, no copy-paste tests',
      'Parameterised, unique test data per run (no shared single record reused everywhere)',
      'External/3rd-party dependencies stubbed or mocked so tests are deterministic',
      'Cross-browser / cross-device or multi-environment configuration where relevant',
      'Pass/fail gates as code; a CI pipeline runs the suite and publishes a report',
      'Parallel / distributed execution configured for the full regression run',
    ],
    codeTree: [
      `/${bp.skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tests`,
      '  /tests        feature-grouped specs',
      '  /pages        page objects / API clients (reusable)',
      '  /data         parameterised, unique-per-run data',
      '  /fixtures     mocks / stubs for external services',
      '  /config       environments.json · thresholds (gates as code)',
      '  /ci           pipeline + parallel/distributed run',
      '  README.md     setup, execution & interpretation guide',
    ].join('\n'),
  },
  {
    id: 'c3', name: 'Execution results & analysis', submit: 'evidence',
    summary: 'Run the suite, present pass rate / flake / duration, find a real problem and root-cause it.',
    requirements: [
      'A report: pass rate, flake rate and run duration over time',
      'At least one real defect or instability identified and documented',
      `Root-cause analysis — ${bp.failureModes[0]}? ${bp.failureModes[1]}? a timing/sync issue?`,
      'A specific, actionable recommendation (and the expected improvement)',
    ],
    sampleFinding: `e.g. "The checkout suite flaked ~12% of runs. Root cause: hard waits and a locator tied to a dynamic id. Replacing with explicit waits + a stable data-testid and isolating test data cut flake to <1% and run time by 30%."`,
  },
  {
    id: 'c4', name: 'CI/CD integration evidence', submit: 'evidence',
    summary: 'Show the suite gating the pipeline — a clean pass and a blocked merge on a failure, plus the alert.',
    requirements: [
      'A pipeline (Jenkins / GitHub Actions / Azure) that runs the suite on merge to main',
      'A run that PASSED the gate',
      'A run that FAILED and BLOCKED the merge — and the alert/notification raised',
      'How you would gate a production deployment when the suite (or a smoke check) fails',
    ],
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'A regression escaped to production during a release. Your first 30 minutes and the QE response.',
    requirements: [
      'Immediate — confirm the defect, its blast radius and whether to roll back',
      'Escalate to the release/on-call lead and the incident manager simultaneously',
      'Mitigate — roll back or feature-flag off; communicate impact to stakeholders',
      'Root cause — why did automation miss it (coverage gap, disabled test, flaky-skip)?',
      'Post-incident — add the missing test to the gate, fix the gap, blameless review',
    ],
  },
];

const processComponents: Builder = (s, bp) => [
  {
    id: 'c1', name: 'Test strategy & quality plan', submit: 'document',
    summary: 'Scope, test approach, entry/exit criteria, coverage/traceability model and a risk register.',
    requirements: [
      `Scope across ${s.feature} (${s.integrations}) — in/out of scope explicit`,
      'Test approach and levels (functional, integration, regression, UAT) with the reason for each',
      'Measurable entry and exit criteria — what must be true to start and what counts as a pass',
      'Coverage & traceability model: requirements → test cases → execution',
      'Risk register — 5+ risks specific to this release, with likelihood, impact and mitigation',
    ],
  },
  {
    id: 'c2', name: 'Test cases & traceability', submit: 'document',
    summary: 'Detailed, traceable test cases covering happy path, negatives and edge/boundary conditions.',
    requirements: [
      'Each case: ID, precondition, steps, expected result, and the requirement it traces to',
      '30+ cases covering happy path, negative paths and boundary/edge conditions',
      'Coverage matrix mapping every in-scope requirement to at least one case',
      'Prioritisation (P1/P2) tied to risk, so the critical path is unambiguous',
    ],
  },
  {
    id: 'c3', name: 'Execution evidence, defects & summary', submit: 'evidence',
    summary: 'An execution report for 30+ cases, 3+ well-written defects and a justified go/no-go.',
    requirements: [
      'Execution report (TestRail/Xray/spreadsheet) — 30+ cases executed or a documented walkthrough',
      'At least 3 defects: severity, description, steps to reproduce and a suggested fix',
      'A summary: pass rate, failed, blocked and an overall quality assessment',
      'A go/no-go recommendation with clear, evidence-backed justification',
    ],
    sampleFinding: `e.g. "High — under concurrent submission the journey double-counts ${bp.unit}, producing an inconsistent state. Steps reproduce 3/3. Recommend blocking go-live until idempotency is added."`,
  },
  {
    id: 'c4', name: 'Process / governance & sign-off', submit: 'document',
    summary: 'A defect-governance + quality-gate definition and a 20+ item readiness sign-off checklist.',
    requirements: [
      'A defect lifecycle + triage/SLA model (who, severity, target times)',
      'Quality-gate definition: what must be green for the release to proceed',
      'A 20+ item release-readiness sign-off checklist with status and evidence',
      'How the process scales across teams without becoming a bottleneck',
    ],
    table: {
      title: 'Release-readiness sign-off (example rows)',
      headers: ['#', 'Readiness check', 'Status', 'Evidence'],
      rows: [
        ['1', 'All P1 test cases executed and passed', 'Pass', 'Run #214 — 100% P1 pass'],
        ['2', 'Open critical/high defects = 0', 'Pass', 'JIRA filter — 0 open Sev-1/2'],
        ['3', 'Regression pack green in CI', 'In progress', 'Awaiting nightly run'],
        ['4', 'Requirements traceability complete', 'Pass', 'Matrix — 100% mapped'],
      ],
    },
  },
  {
    id: 'c5', name: 'Incident simulation (written, 1 page)', submit: 'written',
    summary: 'A severity-1 escaped defect surfaces post-release. Your first 30 minutes and the QE response.',
    requirements: [
      'Immediate — confirm impact and blast radius; decide rollback vs forward-fix',
      'Escalate to the release/incident manager and the owning squad simultaneously',
      'Mitigate and communicate impact + ETA to stakeholders on a fixed cadence',
      'Root cause — why did the process miss it (coverage gap, skipped gate, env mismatch)?',
      'Post-incident — close the gap in the gate/checklist, update the process, blameless review',
    ],
  },
];

const BUILDERS: Record<Archetype, Builder> = {
  perf: perfComponents,
  domain: domainComponents,
  security: securityComponents,
  data: dataComponents,
  devops: devopsComponents,
  ai: aiComponents,
  automation: automationComponents,
  process: processComponents,
};

// ─── Rubric & differentiators (archetype-aware) ──────────────────────────────
function rubricFor(a: Archetype): RubricRow[] {
  if (a === 'domain') return [
    { criteria: 'Regulatory traceability matrix', max: 25, lookFor: '≥ 20 rules mapped, specific not generic, correct regulation cited' },
    { criteria: 'Test case quality', max: 25, lookFor: 'Precise steps, expected results reference regulations, edge cases are domain-specific' },
    { criteria: 'Execution evidence & defects', max: 20, lookFor: 'Defects well-written and rule-specific; go/no-go justified with evidence' },
    { criteria: 'Compliance sign-off checklist', max: 15, lookFor: 'Specific, realistic, shows real understanding of compliance obligations' },
    { criteria: 'Written scenarios', max: 15, lookFor: 'Regulatory knowledge beyond QE — GDPR/FCA/Consumer Duty etc.' },
  ];
  return [
    { criteria: 'Strategy document quality', max: 20, lookFor: 'SLAs/criteria justified not arbitrary; risks specific; entry/exit measurable' },
    { criteria: 'Framework / artifact technical quality', max: 25, lookFor: 'Modular, realistic data, mocked dependencies, thresholds as code, CI integration' },
    { criteria: 'Results analysis depth', max: 25, lookFor: 'Bottleneck/defect identified and root-caused; recommendation specific and actionable' },
    { criteria: 'CI/CD integration', max: 15, lookFor: 'Pipeline exists; pass AND fail (threshold-breach) scenarios both demonstrated' },
    { criteria: 'Incident simulation', max: 15, lookFor: 'Calm, systematic, stakeholder-aware, technically sound' },
  ];
}

function differentiatorsFor(a: Archetype): Differentiator[] {
  if (a === 'domain') return [
    { dimension: 'SLAs / criteria', pass: 'Defined but not justified', excel: 'Referenced to the regulator/business case' },
    { dimension: 'Test cases', pass: 'Happy path + some negatives', excel: 'Regulatory edge cases, vulnerable users, data-boundary conditions' },
    { dimension: 'Defects', pass: 'Severity + description', excel: 'Cite the specific regulatory rule being violated' },
    { dimension: 'Written answers', pass: 'Show QE knowledge', excel: 'Show banking/domain regulation knowledge — a domain expert, not just a tester' },
  ];
  return [
    { dimension: 'SLAs / criteria', pass: 'Defined but not justified', excel: 'Tied to the business case / SLA / standard' },
    { dimension: 'Test coverage', pass: 'Happy path + some negatives', excel: 'Edge cases, boundary conditions, failure modes' },
    { dimension: 'Defects / findings', pass: 'Raised with severity', excel: 'Root-caused, with a specific actionable fix' },
    { dimension: 'Framework', pass: 'Works and CI is integrated', excel: 'Realistic data generation, mock services and auto-fail thresholds' },
  ];
}

// ─── Assembly ────────────────────────────────────────────────────────────────
function buildBrief(skill: string): CapstoneBrief {
  const s = scenarioFor(skill);
  const bp = blueprintFor(skill);
  const components = BUILDERS[s.archetype](s, bp);
  return {
    skill,
    title: s.title,
    role: s.role,
    org: s.org,
    timeline: s.timeline,
    deliverable: s.deliverable,
    brief: [
      `You are the ${s.role} at ${s.org}. The organisation is launching ${s.feature}.`,
      `It involves ${s.integrations}. Expected scale: ${s.scale}.`,
      `You have ${s.timeline}. Build and submit a ${s.deliverable} for this feature.`,
    ],
    components,
    rubric: rubricFor(s.archetype),
    passMark: 70,
    differentiators: differentiatorsFor(s.archetype),
  };
}

// ─── Curated overrides (exact-fidelity to the reference samples) ──────────────
// Performance Testing & Banking ship verbatim-quality briefs. The generated path
// already produces these via the perf/domain archetypes; the overrides simply pin
// the headline framing so they match the published capstones one-to-one.
const CURATED: Record<string, Partial<CapstoneBrief>> = {
  'Performance Testing': {
    brief: [
      'You are the Performance Test Lead for a digital banking platform used by 3.2 million customers. The bank is launching a new feature — Instant Account Opening — where a customer can open a current account entirely online in under 5 minutes.',
      'The feature involves 6 backend microservices, a third-party KYC API, an identity-verification service and a credit-check engine. The bank expects 50,000 new applications per day at launch, with a peak of 4,000 simultaneous applications between 6pm and 8pm. The existing platform already processes 800,000 transactions per day.',
      'You have 3 weeks before the launch. Build and submit a complete performance testing deliverable for this feature.',
    ],
  },
  'Banking': {
    brief: [
      'You are the QE Domain Lead supporting a retail bank launching Open Banking-enabled Mortgage Pre-Approval — a digital journey where a customer applies for a mortgage pre-approval in 15 minutes. The system pulls income & expenditure from the current account (with consent), runs an affordability assessment and produces a Decision in Principle (DIP) immediately.',
      'It integrates with 4 internal systems: the mortgage-origination system, the credit-reference agency (Experian), the property-valuation API and the affordability engine. The journey must comply with FCA mortgage rules (MCOB), GDPR consent requirements and the UK Open Banking Standard.',
      'Design and submit a complete QE deliverable for this system.',
    ],
  },
};

// ─── Public API (versioned cache) ────────────────────────────────────────────
export const CAPSTONE_ENGINE_VERSION = 1;

export function generateCapstoneBrief(skill: string): CapstoneBrief {
  const base = buildBrief(skill);
  const override = CURATED[skill];
  return override ? { ...base, ...override } : base;
}

export function getCapstoneBrief(skill: string): CapstoneBrief {
  const key = `zen_capstone_brief::${skill}::v${CAPSTONE_ENGINE_VERSION}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as CapstoneBrief;
  } catch { /* ignore cache read errors */ }
  const brief = generateCapstoneBrief(skill);
  try { localStorage.setItem(key, JSON.stringify(brief)); } catch { /* ignore quota */ }
  return brief;
}

// ─── Submission scoring ──────────────────────────────────────────────────────
// Each of the 5 components is worth an equal share. A component scores on whether
// its evidence is provided (repo URL / written notes) and how substantive it is —
// generous but not free: empty submissions score 0, thin ones score partial.
export interface ComponentSubmission { link?: string; notes?: string }

export function scoreCapstoneSubmission(
  brief: CapstoneBrief,
  submissions: Record<string, ComponentSubmission>,
): { final: number; perComponent: Record<string, number> } {
  const perComponent: Record<string, number> = {};
  const share = 100 / brief.components.length;
  let total = 0;
  brief.components.forEach(c => {
    const sub = submissions[c.id] || {};
    const hasLink = !!sub.link && /\S/.test(sub.link);
    const words = (sub.notes || '').trim().split(/\s+/).filter(Boolean).length;
    // repo/evidence components reward a link; document/written reward substance.
    const linkPart = (c.submit === 'repo' || c.submit === 'evidence') ? (hasLink ? 0.45 : 0) : 0;
    const cap = (c.submit === 'repo' || c.submit === 'evidence') ? 0.55 : 1;
    const notesPart = Math.min(cap, words / 80 * cap); // ~80 words → full notes credit
    const frac = Math.min(1, linkPart + notesPart);
    const pts = Math.round(frac * share);
    perComponent[c.id] = pts;
    total += pts;
  });
  return { final: Math.min(100, Math.round(total)), perComponent };
}

// ─── Capstone lifecycle state (localStorage, per user + skill) ─────────────────
// The Expert capstone is issued AFTER the timed test. The candidate has a 2-week
// window to submit it; completing it certifies Expert at 100%. If the window
// lapses, the capstone expires and the candidate must retake the Expert test.
export const CAPSTONE_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CapstoneStatus = 'pending' | 'completed' | 'expired';

export interface CapstoneState {
  userId: string;
  skill: string;
  testScore: number;          // the Expert test score that unlocked the capstone
  issuedAt: number;           // ms epoch when issued
  deadline: number;           // issuedAt + window
  status: CapstoneStatus;
  submissions: Record<string, ComponentSubmission>;
  score?: number;             // capstone submission score
  completedAt?: number;
}

const stateKey = (userId: string, skill: string) =>
  `zen_capstone_state::${userId || 'anon'}::${skill}`;

function readState(userId: string, skill: string): CapstoneState | null {
  try {
    const raw = localStorage.getItem(stateKey(userId, skill));
    if (!raw) return null;
    return JSON.parse(raw) as CapstoneState;
  } catch { return null; }
}

function writeState(s: CapstoneState): void {
  try { localStorage.setItem(stateKey(s.userId, s.skill), JSON.stringify(s)); } catch { /* quota */ }
}

// Returns the live state, lazily flipping a lapsed `pending` to `expired`.
export function getCapstoneState(userId: string, skill: string): CapstoneState | null {
  const s = readState(userId, skill);
  if (!s) return null;
  if (s.status === 'pending' && Date.now() > s.deadline) {
    s.status = 'expired';
    writeState(s);
  }
  return s;
}

// Issue (or return the existing) capstone for a user+skill. Idempotent: an open
// pending/completed capstone is returned unchanged; an expired one is re-issued
// fresh (used after a retake).
export function issueCapstone(userId: string, skill: string, testScore: number): CapstoneState {
  const existing = getCapstoneState(userId, skill);
  if (existing && existing.status !== 'expired') return existing;
  const now = Date.now();
  const s: CapstoneState = {
    userId, skill, testScore,
    issuedAt: now,
    deadline: now + CAPSTONE_WINDOW_DAYS * DAY_MS,
    status: 'pending',
    submissions: {},
  };
  writeState(s);
  return s;
}

export function saveCapstoneProgress(userId: string, skill: string, submissions: Record<string, ComponentSubmission>): void {
  const s = getCapstoneState(userId, skill);
  if (!s || s.status !== 'pending') return;
  s.submissions = submissions;
  writeState(s);
}

export function completeCapstone(userId: string, skill: string, submissions: Record<string, ComponentSubmission>): CapstoneState | null {
  const s = getCapstoneState(userId, skill);
  if (!s || s.status !== 'pending') return s;
  const brief = getCapstoneBrief(skill);
  const { final } = scoreCapstoneSubmission(brief, submissions);
  s.submissions = submissions;
  s.score = final;
  s.status = 'completed';
  s.completedAt = Date.now();
  writeState(s);
  return s;
}

// Clear a capstone entirely (used on "retake from first" after a missed deadline).
export function clearCapstone(userId: string, skill: string): void {
  try { localStorage.removeItem(stateKey(userId, skill)); } catch { /* ignore */ }
}

// All capstones for a user (across skills), lazily expiring lapsed ones.
export function listCapstones(userId: string): CapstoneState[] {
  const out: CapstoneState[] = [];
  const prefix = `zen_capstone_state::${userId || 'anon'}::`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const s = JSON.parse(raw) as CapstoneState;
      if (s.status === 'pending' && Date.now() > s.deadline) { s.status = 'expired'; writeState(s); }
      out.push(s);
    }
  } catch { /* ignore */ }
  return out;
}

// The capstone the candidate should be working on now: the open pending one with
// the soonest deadline; otherwise the most recently issued (completed/expired).
export function getActiveCapstone(userId: string): CapstoneState | null {
  const all = listCapstones(userId);
  if (all.length === 0) return null;
  const pending = all.filter(s => s.status === 'pending').sort((a, b) => a.deadline - b.deadline);
  if (pending.length) return pending[0];
  return all.sort((a, b) => b.issuedAt - a.issuedAt)[0];
}

// Days/hours left before a pending capstone's deadline (0 if past/none).
export function capstoneTimeLeft(s: CapstoneState | null): { days: number; hours: number; expired: boolean } {
  if (!s) return { days: 0, hours: 0, expired: true };
  const ms = s.deadline - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, expired: true };
  return { days: Math.floor(ms / DAY_MS), hours: Math.floor((ms % DAY_MS) / (60 * 60 * 1000)), expired: false };
}
