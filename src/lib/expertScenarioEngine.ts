/**
 * expertScenarioEngine.ts — Enterprise Expert Assessment Engine
 *
 * Generic across EVERY skill. The engine logic contains NO domain-specific code;
 * all skill specificity comes from a compact SkillBlueprint (curated data). The
 * engine assembles enterprise Scenario Groups — a realistic scenario read once,
 * followed by 3–7 linked, objectively-gradable questions of mixed primitive
 * types. Generated groups are cached + versioned (the "Scenario Library") so the
 * same skill yields consistent content and can be reused.
 *
 * The ~25 enterprise question formats collapse to 5 auto-gradable primitives:
 *   single  · multi · ordering · match · matrix
 */

import { getSkillFamily } from './zenTaxonomy';

// ─── Question primitives (discriminated union) ───────────────────────────────
export type QuestionType = 'single' | 'multi' | 'ordering' | 'match' | 'matrix';

export interface BaseExpertQuestion {
  id: string;
  type: QuestionType;
  competency: string;            // Leadership · Architecture · Risk · Governance · Execution · Communication …
  prompt: string;
  points: number;                // weight toward the scenario/assessment score
}
export interface SingleQuestion extends BaseExpertQuestion {
  type: 'single';
  options: string[];
  correct: number;               // index of the single best option
}
export interface MultiQuestion extends BaseExpertQuestion {
  type: 'multi';
  options: string[];
  correct: number[];             // indices that must all be selected (partial credit)
}
export interface OrderingQuestion extends BaseExpertQuestion {
  type: 'ordering';
  items: string[];               // shown in this initial order
  correctOrder: number[];        // correct sequence of item indices
}
export interface MatchQuestion extends BaseExpertQuestion {
  type: 'match';
  left: string[];
  right: string[];
  correct: Record<number, number>; // leftIndex -> rightIndex
}
export interface MatrixQuestion extends BaseExpertQuestion {
  type: 'matrix';
  criteria: string[];            // the decision dimensions shown in the matrix
  options: string[];             // candidate decisions (rows)
  correct: number;               // index of the option that best satisfies all criteria
}
export type ExpertQuestion = SingleQuestion | MultiQuestion | OrderingQuestion | MatchQuestion | MatrixQuestion;

// ─── Scenario group ──────────────────────────────────────────────────────────
export interface ScenarioContext {
  businessContext: string;
  currentEnvironment: string;
  constraints: string;
  objectives: string;
  stakeholders: string;
  technicalChallenges: string;
  timeConstraints: string;
  operationalRisks: string;
  successCriteria: string;
}
export interface ScenarioGroup {
  id: string;
  skill: string;
  title: string;
  kind: string;                  // incident · architecture · scaling · governance · leadership
  context: ScenarioContext;
  competencies: string[];
  questions: ExpertQuestion[];
}

// ─── Skill blueprint (the only place skill specificity lives — pure data) ─────
export interface SkillBlueprint {
  skill: string;
  noun: string;        // "data platform", "performance & API platform"
  unit: string;        // "queries", "requests/sec", "transactions"
  role: string;        // "Principal Data Architect"
  qualities: string[]; // ["integrity","latency","consistency"]
  failureModes: string[];
  stakeholders: string[];
}

// Per-family generic defaults so EVERY skill gets a sensible blueprint with no
// hardcoded per-skill logic. Authored overrides can be added to BLUEPRINTS below.
const FAMILY_DEFAULTS: Record<number, Omit<SkillBlueprint, 'skill'>> = {
  1: { noun: 'quality-engineering process', unit: 'release cycles', role: 'Principal QA Architect', qualities: ['coverage', 'reliability', 'release confidence'], failureModes: ['escaped defects', 'flaky suites', 'missed regressions'], stakeholders: ['the Delivery Head', 'Product leadership', 'the release manager', 'Compliance'] },
  2: { noun: 'test-automation platform', unit: 'automated checks', role: 'Principal Automation Architect', qualities: ['stability', 'execution speed', 'maintainability'], failureModes: ['flaky tests', 'long run times', 'brittle locators'], stakeholders: ['the Engineering Director', 'QA leads', 'the SRE on-call lead', 'Product'] },
  3: { noun: 'performance & API platform', unit: 'requests/sec', role: 'Principal Performance Architect', qualities: ['latency', 'throughput', 'scalability'], failureModes: ['resource saturation', 'bottlenecks', 'SLA breaches'], stakeholders: ['the CTO', 'the SRE on-call lead', 'Product leadership', 'Capacity planning'] },
  4: { noun: 'enterprise domain platform', unit: 'transactions', role: 'Principal Domain Architect', qualities: ['compliance', 'accuracy', 'availability'], failureModes: ['data errors', 'regulatory gaps', 'outages'], stakeholders: ['the CTO', 'Compliance', 'Risk & Audit', 'business owners'] },
  5: { noun: 'application platform', unit: 'requests', role: 'Principal Engineer', qualities: ['scalability', 'maintainability', 'security'], failureModes: ['memory leaks', 'race conditions', 'accumulated tech debt'], stakeholders: ['the VP of Engineering', 'Security', 'Product leadership', 'on-call engineers'] },
  6: { noun: 'data platform', unit: 'queries', role: 'Principal Data Architect', qualities: ['data integrity', 'latency', 'consistency'], failureModes: ['replication lag', 'data corruption', 'slow queries'], stakeholders: ['the CTO', 'Data Governance', 'analytics consumers', 'the SRE on-call lead'] },
  7: { noun: 'delivery & AI platform', unit: 'deployments', role: 'Principal Platform Engineer', qualities: ['reliability', 'automation', 'observability'], failureModes: ['failed deployments', 'pipeline outages', 'model/config drift'], stakeholders: ['the VP of Engineering', 'Security', 'the SRE on-call lead', 'Product'] },
};

// Optional authored overrides for specific skills (curated quality). The engine
// works for any skill without an entry here.
const BLUEPRINTS: Record<string, Partial<SkillBlueprint>> = {
  'SQL': { noun: 'relational data platform', unit: 'queries', failureModes: ['replication lag', 'lock contention', 'query plan regressions'] },
  'Performance Testing': { noun: 'performance-engineering platform', unit: 'concurrent users', failureModes: ['resource saturation', 'memory leaks under load', 'thread-pool exhaustion'] },
  'Security Testing': { noun: 'application-security program', unit: 'assets', role: 'Principal Security Architect', qualities: ['confidentiality', 'integrity', 'compliance'], failureModes: ['vulnerabilities', 'data exposure', 'audit findings'] },
};

export function blueprintFor(skill: string): SkillBlueprint {
  const fam = getSkillFamily(skill);
  const base = FAMILY_DEFAULTS[fam?.id ?? 5] || FAMILY_DEFAULTS[5];
  const override = BLUEPRINTS[skill] || {};
  return { skill, ...base, ...override };
}

// ─── Weighted assessment structure ──────────────────────────────────────────
export interface AssessmentSection {
  key: 'scenario' | 'mentoring' | 'experience' | 'capstone';
  title: string;
  weight: number;          // contribution to the final score (sums to 1.0)
  optional?: boolean;
  groups: ScenarioGroup[]; // scenario = 4 groups; others = a single group of questions
}
export interface ExpertAssessment {
  skill: string;
  sections: AssessmentSection[];
}

// ─── Deterministic templates (generic; filled from the blueprint) ─────────────
// Options are enterprise-standard; the correct choice is the balanced best-
// practice decision (curated in the template).
type Template = (bp: SkillBlueprint) => ScenarioGroup;

const q = (id: string, type: QuestionType, competency: string, prompt: string, points: number, extra: any): ExpertQuestion =>
  ({ id, type, competency, prompt, points, ...extra });

const lightContext = (line: string): ScenarioContext => ({
  businessContext: line, currentEnvironment: '', constraints: '', objectives: '',
  stakeholders: '', technicalChallenges: '', timeConstraints: '', operationalRisks: '', successCriteria: '',
});

const incidentTemplate: Template = (bp) => ({
  id: `${bp.skill}_scn_incident`,
  skill: bp.skill,
  title: 'Production Incident Under Business Pressure',
  kind: 'incident',
  competencies: ['Risk', 'Incident Response', 'Communication', 'Execution'],
  context: {
    businessContext: `A revenue-critical ${bp.noun} serves 40M customers; an incident has begun during peak business hours.`,
    currentEnvironment: `Primary node ${bp.qualities[0]} is degrading; ${bp.failureModes[0]} is observed and worsening.`,
    constraints: 'No downtime is permitted; a change freeze is in effect; only forward-safe actions are allowed.',
    objectives: 'Stabilise the platform and restore SLA without data loss.',
    stakeholders: `${bp.stakeholders.join(', ')} are on the bridge awaiting your decision.`,
    technicalChallenges: `${bp.failureModes[0]} is cascading toward ${bp.failureModes[1]}.`,
    timeConstraints: 'Management expects measurable recovery within 30 minutes.',
    operationalRisks: 'An incorrect mitigation could cause data loss or a longer outage.',
    successCriteria: `${bp.unit} latency back within SLA, no data loss, clear stakeholder comms.`,
  },
  questions: [
    q(`${bp.skill}_inc_q1`, 'single', 'Incident Response', `As the ${bp.role}, what is the single best FIRST action?`, 2, {
      options: [
        'Immediately apply an untested fix in production to save time',
        'Stabilise with a known forward-safe mitigation, then diagnose root cause in parallel',
        'Restart the primary node and hope the symptom clears',
        'Escalate to the vendor and wait for their guidance',
      ],
      correct: 1,
    }),
    q(`${bp.skill}_inc_q2`, 'ordering', 'Execution', 'Order the incident-response steps correctly (first → last).', 2, {
      items: ['Communicate impact & ETA to stakeholders', 'Detect & confirm the failing component', 'Apply forward-safe mitigation', 'Verify SLA recovery', 'Run blameless post-incident review'],
      correctOrder: [1, 0, 2, 3, 4],
    }),
    q(`${bp.skill}_inc_q3`, 'multi', 'Risk', 'Which actions are appropriate during an active change-freeze incident? (Select all that apply.)', 2, {
      options: [
        'Roll forward with a reversible, low-blast-radius mitigation',
        'Disable safety checks/monitoring to speed things up',
        'Keep stakeholders updated on a fixed cadence',
        'Make multiple simultaneous risky changes to fix faster',
      ],
      correct: [0, 2],
    }),
    q(`${bp.skill}_inc_q4`, 'single', 'Communication', 'What should you tell stakeholders while diagnosis is ongoing?', 1, {
      options: [
        'Nothing until the issue is fully resolved',
        'Confirmed impact, current mitigation in progress, and next update time',
        'A detailed root-cause theory before it is verified',
        'That it is the vendor’s fault',
      ],
      correct: 1,
    }),
  ],
});

const architectureTemplate: Template = (bp) => ({
  id: `${bp.skill}_scn_architecture`,
  skill: bp.skill,
  title: 'Architecture Decision Under Constraints',
  kind: 'architecture',
  competencies: ['Architecture', 'Trade-off Analysis', 'Cost', 'Scalability'],
  context: {
    businessContext: `The business is doubling ${bp.unit} volume over 12 months on the ${bp.noun}.`,
    currentEnvironment: `Current design is approaching limits on ${bp.qualities[2] || bp.qualities[0]}.`,
    constraints: 'Fixed budget this quarter; small team; must avoid a risky big-bang rewrite.',
    objectives: `Sustain growth while protecting ${bp.qualities[0]} and ${bp.qualities[1]}.`,
    stakeholders: `${bp.stakeholders[0]} wants cost control; ${bp.stakeholders[1]} wants speed.`,
    technicalChallenges: `Avoiding ${bp.failureModes[1]} as load grows.`,
    timeConstraints: 'A defensible target architecture is needed within the sprint.',
    operationalRisks: 'Over-engineering wastes budget; under-engineering risks an outage at scale.',
    successCriteria: 'A staged, reversible architecture aligned to business priorities and cost.',
  },
  questions: [
    q(`${bp.skill}_arch_q1`, 'matrix', 'Architecture', 'Given the decision matrix, which option is the best overall enterprise decision?', 3, {
      criteria: ['Scalability', 'Cost', 'Delivery Risk', 'Maintainability'],
      options: [
        'Big-bang rewrite to a new architecture now',
        'Incremental, reversible evolution with measurable checkpoints',
        'Vertically scale the existing design only',
        'Outsource the whole platform to a managed vendor immediately',
      ],
      correct: 1,
    }),
    q(`${bp.skill}_arch_q2`, 'match', 'Trade-off Analysis', 'Match each constraint to the architectural lever that best addresses it.', 3, {
      left: ['Tight budget', 'Rapid load growth', 'Small team', 'High availability'],
      right: ['Horizontal scaling / partitioning', 'Managed/automated tooling to reduce ops toil', 'Phased rollout to control spend', 'Redundancy & failover'],
      correct: { 0: 2, 1: 0, 2: 1, 3: 3 },
    }),
    q(`${bp.skill}_arch_q3`, 'single', 'Cost', 'How should you justify the architecture to ' + bp.stakeholders[0] + '?', 2, {
      options: [
        'By citing the newest technology trend',
        'By tying each decision to business priorities, risk reduction and staged cost',
        'By choosing whatever the largest competitor uses',
        'By minimising cost regardless of risk',
      ],
      correct: 1,
    }),
    q(`${bp.skill}_arch_q4`, 'ordering', 'Execution', 'Order the rollout of the new architecture (first → last).', 2, {
      items: ['Prove it on a low-risk slice', 'Define measurable checkpoints & rollback', 'Expand coverage incrementally', 'Decommission the legacy path'],
      correctOrder: [1, 0, 2, 3],
    }),
  ],
});

const governanceTemplate: Template = (bp) => ({
  id: `${bp.skill}_scn_governance`,
  skill: bp.skill,
  title: 'Governance, Compliance & Risk',
  kind: 'governance',
  competencies: ['Governance', 'Risk', 'Compliance', 'Business Alignment'],
  context: {
    businessContext: `An external audit of the ${bp.noun} is scheduled; regulators require demonstrable controls.`,
    currentEnvironment: 'Controls are partly informal and inconsistently evidenced.',
    constraints: 'Cannot block delivery; must satisfy auditors; limited compliance staff.',
    objectives: 'Establish defensible governance without halting engineering throughput.',
    stakeholders: `${bp.stakeholders.includes('Compliance') ? 'Compliance' : bp.stakeholders[0]}, Risk & Audit, and engineering leads.`,
    technicalChallenges: `Preventing ${bp.failureModes[2] || bp.failureModes[0]} while proving control effectiveness.`,
    timeConstraints: 'Audit readiness required within the quarter.',
    operationalRisks: 'Audit findings, regulatory penalties, or delivery slowdown.',
    successCriteria: 'Evidenced, automated controls with minimal delivery friction.',
  },
  questions: [
    q(`${bp.skill}_gov_q1`, 'single', 'Governance', 'What is the best governance approach under these constraints?', 2, {
      options: [
        'Add heavy manual sign-offs on every change',
        'Automate controls into the workflow with auditable evidence and risk-based gating',
        'Freeze all delivery until the audit passes',
        'Document policies but skip enforcement',
      ],
      correct: 1,
    }),
    q(`${bp.skill}_gov_q2`, 'multi', 'Compliance', 'Which are valid, auditable control mechanisms? (Select all that apply.)', 2, {
      options: [
        'Automated policy checks in the pipeline with retained logs',
        'Verbal approvals with no record',
        'Role-based access with periodic access reviews',
        'Disabling logging to improve performance',
      ],
      correct: [0, 2],
    }),
    q(`${bp.skill}_gov_q3`, 'ordering', 'Risk', 'Order these risk-treatment steps (first → last).', 2, {
      items: ['Identify & assess the risk', 'Define the control', 'Automate & evidence the control', 'Monitor & review effectiveness'],
      correctOrder: [0, 1, 2, 3],
    }),
    q(`${bp.skill}_gov_q4`, 'single', 'Business Alignment', 'An auditor flags a gap that would slow delivery to fix immediately. Best response?', 2, {
      options: [
        'Hide the gap until after the audit',
        'Log it as a risk with an owner, a remediation date, and an interim compensating control',
        'Halt all delivery until it is fully fixed',
        'Argue the gap is not relevant and take no action',
      ],
      correct: 1,
    }),
  ],
});

const scalingTemplate: Template = (bp) => ({
  id: `${bp.skill}_scn_scaling`,
  skill: bp.skill,
  title: 'Capacity, Scaling & Resilience',
  kind: 'scaling',
  competencies: ['Architecture', 'Risk', 'Scalability', 'Cost'],
  context: {
    businessContext: `A major launch will push the ${bp.noun} to 3× peak ${bp.unit} for a 6-hour window.`,
    currentEnvironment: `Headroom is unknown; ${bp.failureModes[0]} appeared in the last load test.`,
    constraints: 'Hard launch date; finite budget; no second chance with customers.',
    objectives: `Guarantee ${bp.qualities[0]} at peak without overspending.`,
    stakeholders: `${bp.stakeholders[0]} and Capacity planning need a defensible plan.`,
    technicalChallenges: `Eliminating the ${bp.failureModes[0]} bottleneck before launch.`,
    timeConstraints: 'Plan and validation must complete two weeks before launch.',
    operationalRisks: 'Under-provisioning fails the launch; over-provisioning wastes budget.',
    successCriteria: 'Validated headroom, autoscaling/limits, and a tested fallback.',
  },
  questions: [
    q(`${bp.skill}_scl_q1`, 'single', 'Scalability', 'What is the most reliable way to establish real capacity before launch?', 2, {
      options: [
        'Estimate capacity from intuition and past experience',
        'Run a production-like load test to the breakpoint, then provision with headroom + autoscaling',
        'Add as much hardware as the budget allows',
        'Assume current capacity is sufficient',
      ],
      correct: 1,
    }),
    q(`${bp.skill}_scl_q2`, 'multi', 'Risk', 'Which are sound resilience measures for the launch window? (Select all that apply.)', 2, {
      options: [
        'Autoscaling with sane upper limits and alerts',
        'A tested fallback / degraded mode',
        'Turning off monitoring to save resources',
        'Load-shedding / rate-limiting for non-critical traffic',
      ],
      correct: [0, 1, 3],
    }),
    q(`${bp.skill}_scl_q3`, 'match', 'Trade-off Analysis', 'Match each symptom to its most likely scaling remedy.', 3, {
      left: [`${bp.failureModes[0]}`, 'Hot single node', 'Bursty spikes', 'Slow downstream dependency'],
      right: ['Horizontal scale + partitioning', 'Autoscaling + buffering/queue', 'Caching / circuit breaker', 'Add capacity + tune limits'],
      correct: { 0: 3, 1: 0, 2: 1, 3: 2 },
    }),
    q(`${bp.skill}_scl_q4`, 'matrix', 'Cost', 'Best capacity decision given the matrix?', 3, {
      criteria: ['Reliability at peak', 'Cost', 'Time to implement', 'Reversibility'],
      options: [
        'Permanently over-provision 5× for safety',
        'Right-size with autoscaling + validated headroom + fallback',
        'Do nothing and hope current capacity holds',
        'Re-platform onto new infrastructure days before launch',
      ],
      correct: 1,
    }),
  ],
});

// The 4 scenario-based groups (Section 1 = 40%).
const SCENARIO_TEMPLATES: Template[] = [incidentTemplate, architectureTemplate, governanceTemplate, scalingTemplate];

// ─── Section 2: Mentoring & Contribution (6–8 questions, 20%) ────────────────
const mentoringGroup = (bp: SkillBlueprint): ScenarioGroup => ({
  id: `${bp.skill}_sec_mentoring`,
  skill: bp.skill,
  title: 'Mentoring & Contribution',
  kind: 'mentoring',
  competencies: ['Leadership', 'Mentoring', 'Communication', 'Stakeholder Management'],
  context: lightContext('Evidence of how you grow people, resolve conflict and contribute beyond your own delivery.'),
  questions: [
    q(`${bp.skill}_men_q1`, 'single', 'Leadership', 'Two strong engineers are deadlocked on the approach. Best leadership move?', 2, {
      options: ['Pick the louder engineer’s option to end it', 'Agree decision criteria, time-box a spike, then decide and record the rationale', 'Escalate to ' + bp.stakeholders[0], 'Let the deadline decide'],
      correct: 1,
    }),
    q(`${bp.skill}_men_q2`, 'single', 'Mentoring', 'A junior engineer keeps shipping fragile work. Best intervention?', 2, {
      options: ['Publicly call out the mistakes', 'Pair on reviews, set standards, give specific private feedback', 'Quietly redo their work', 'Remove them from the project'],
      correct: 1,
    }),
    q(`${bp.skill}_men_q3`, 'multi', 'Contribution', 'Which count as real engineering contribution beyond your tickets? (Select all.)', 2, {
      options: ['Mentoring with measurable outcomes', 'Improving shared tooling/standards others adopt', 'Only finishing your own tasks fast', 'Documenting decisions and onboarding others'],
      correct: [0, 1, 3],
    }),
    q(`${bp.skill}_men_q4`, 'ordering', 'Communication', 'Order how you communicate a hard technical decision (first → last).', 2, {
      items: ['Decide using agreed criteria', 'Explain rationale & trade-offs to the team', 'Give stakeholders impact & timeline', 'Capture a decision record'],
      correctOrder: [0, 1, 2, 3],
    }),
    q(`${bp.skill}_men_q5`, 'single', 'Stakeholder Management', 'A stakeholder pushes for an unrealistic date. Best response?', 2, {
      options: ['Agree to avoid conflict, then miss it', 'Present options with trade-offs and a data-backed realistic plan', 'Refuse without explanation', 'Blame another team for the constraint'],
      correct: 1,
    }),
    q(`${bp.skill}_men_q6`, 'match', 'Mentoring', 'Match each situation to the best coaching response.', 3, {
      left: ['Capable but unconfident engineer', 'Skilled but siloed engineer', 'New joiner ramping up', 'Repeated avoidable mistakes'],
      right: ['Stretch ownership + visible support', 'Encourage knowledge-sharing/reviews', 'Structured onboarding + pairing', 'Root-cause + clear standards & feedback'],
      correct: { 0: 0, 1: 1, 2: 2, 3: 3 },
    }),
    q(`${bp.skill}_men_q7`, 'multi', 'Leadership', 'Signs of healthy technical leadership? (Select all.)', 1, {
      options: ['Decisions tied to explicit criteria', 'Taking all credit personally', 'Growing others to make decisions', 'Transparent trade-off communication'],
      correct: [0, 2, 3],
    }),
  ],
});

// ─── Section 3: Experience Depth (8–10 questions, 25%) ───────────────────────
const experienceGroup = (bp: SkillBlueprint): ScenarioGroup => ({
  id: `${bp.skill}_sec_experience`,
  skill: bp.skill,
  title: 'Experience Depth',
  kind: 'experience',
  competencies: ['Technical Expertise', 'Risk', 'Trade-off Analysis', 'Operations'],
  context: lightContext(`Calibrated checks for real, hands-on depth with ${bp.skill} in production enterprise environments.`),
  questions: [
    q(`${bp.skill}_exp_q1`, 'single', 'Technical Expertise', `Which is the most characteristic root cause of "${bp.failureModes[0]}" in production?`, 2, {
      options: ['A cosmetic UI issue', `A genuine ${bp.qualities[0]}/capacity limit reached under real load`, 'A documentation typo', 'An unrelated third-party outage'],
      correct: 1,
    }),
    q(`${bp.skill}_exp_q2`, 'multi', 'Operations', 'Which signals would an experienced practitioner monitor first? (Select all.)', 2, {
      options: [`${bp.qualities[0]} / saturation metrics`, 'Error & latency rates', 'Office Wi-Fi strength', 'Throughput vs. capacity headroom'],
      correct: [0, 1, 3],
    }),
    q(`${bp.skill}_exp_q3`, 'single', 'Trade-off Analysis', 'Under real delivery pressure, the right default trade-off is usually to:', 2, {
      options: ['Optimise prematurely everywhere', 'Make the safe, reversible choice and measure before optimising', 'Always pick the newest technology', 'Ignore maintainability for speed'],
      correct: 1,
    }),
    q(`${bp.skill}_exp_q4`, 'match', 'Technical Expertise', `Match each ${bp.skill} symptom to its most likely cause.`, 3, {
      left: [`${bp.failureModes[0]}`, `${bp.failureModes[1]}`, `${bp.failureModes[2] || 'Intermittent errors'}`, 'Gradual degradation over time'],
      right: ['Capacity/limit reached under load', 'Design/contention flaw', 'Process/governance gap', 'Resource leak / unbounded growth'],
      correct: { 0: 0, 1: 1, 2: 2, 3: 3 },
    }),
    q(`${bp.skill}_exp_q5`, 'ordering', 'Operations', 'Order a sound production change for a high-risk fix (first → last).', 2, {
      items: ['Validate in a production-like environment', 'Roll out behind a guard / to a small slice', 'Monitor key metrics', 'Expand or roll back based on data'],
      correctOrder: [0, 1, 2, 3],
    }),
    q(`${bp.skill}_exp_q6`, 'single', 'Risk', 'A change "works on my machine" but is risky at scale. Experienced move?', 2, {
      options: ['Ship it directly to production', 'Validate under representative load/data before rollout', 'Disable monitoring to avoid noise', 'Wait indefinitely'],
      correct: 1,
    }),
    q(`${bp.skill}_exp_q7`, 'multi', 'Technical Expertise', `Which reflect genuine ${bp.skill} depth (vs. textbook knowledge)? (Select all.)`, 2, {
      options: ['Having debugged real production incidents', 'Owning trade-offs and their consequences', 'Only memorising definitions', 'Improving systems used by others'],
      correct: [0, 1, 3],
    }),
    q(`${bp.skill}_exp_q8`, 'single', 'Trade-off Analysis', 'The best way to choose between two viable technical options is to:', 2, {
      options: ['Pick the one you know best regardless of fit', 'Decide against explicit criteria and the real constraints', 'Ask which is trendiest', 'Always choose the cheapest'],
      correct: 1,
    }),
    q(`${bp.skill}_exp_q9`, 'matrix', 'Operations', 'Best operational posture for a critical production system?', 3, {
      criteria: ['Reliability', 'Observability', 'Recoverability', 'Cost'],
      options: ['Maximise features, defer ops', 'Right-sized reliability with monitoring, alerting and tested recovery', 'No monitoring to cut cost', 'Manual everything for control'],
      correct: 1,
    }),
  ],
});

// ─── Assembly: the weighted 3-section Expert Assessment (in-test) ────────────
// The capstone is no longer part of the timed test. It is issued AFTER the test
// as a separate, deadline-gated deliverable (see capstoneEngine.ts) and is what
// certifies Expert at 100%. The three in-test sections therefore re-normalise to
// sum to 1.0: Scenario 0.45 · Mentoring 0.25 · Experience 0.30.
export function generateExpertAssessment(skill: string): ExpertAssessment {
  const bp = blueprintFor(skill);
  return {
    skill,
    sections: [
      { key: 'scenario', title: 'Scenario-Based Assessment', weight: 0.45, groups: SCENARIO_TEMPLATES.map(t => t(bp)) },
      { key: 'mentoring', title: 'Mentoring & Contribution', weight: 0.25, groups: [mentoringGroup(bp)] },
      { key: 'experience', title: 'Experience Depth', weight: 0.30, groups: [experienceGroup(bp)] },
    ],
  };
}

// ─── Scenario Library (versioned cache → stored + reused) ────────────────────
export const SCENARIO_ENGINE_VERSION = 3;

export function getExpertAssessment(skill: string): ExpertAssessment {
  const key = `zen_expert_assessment::${skill}::v${SCENARIO_ENGINE_VERSION}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as ExpertAssessment;
  } catch { /* ignore cache read errors */ }
  const assessment = generateExpertAssessment(skill);
  try { localStorage.setItem(key, JSON.stringify(assessment)); } catch { /* ignore quota */ }
  return assessment;
}

// ─── Auto-grading (returns fraction 0..1 of the question's points) ───────────
export function gradeExpertQuestion(question: ExpertQuestion, answer: any): number {
  switch (question.type) {
    case 'single':
    case 'matrix':
      return answer === question.correct ? 1 : 0;
    case 'multi': {
      const sel: number[] = Array.isArray(answer) ? answer : [];
      const correct = new Set(question.correct);
      let right = 0, wrong = 0;
      sel.forEach(i => (correct.has(i) ? right++ : wrong++));
      const frac = (right - wrong) / Math.max(question.correct.length, 1);
      return Math.max(0, Math.min(1, frac));
    }
    case 'ordering': {
      const ord: number[] = Array.isArray(answer) ? answer : [];
      let correct = 0;
      question.correctOrder.forEach((v, idx) => { if (ord[idx] === v) correct++; });
      return question.correctOrder.length ? correct / question.correctOrder.length : 0;
    }
    case 'match': {
      const m: Record<number, number> = answer || {};
      const keys = Object.keys(question.correct);
      let correct = 0;
      keys.forEach(k => { if (m[Number(k)] === question.correct[Number(k)]) correct++; });
      return keys.length ? correct / keys.length : 0;
    }
    default:
      return 0;
  }
}

// Raw 0..100 score for a set of groups (points-weighted within the section).
function scoreGroups(groups: ScenarioGroup[], answers: Record<string, any>): number {
  let earned = 0, possible = 0;
  groups.forEach(g => g.questions.forEach(qn => {
    possible += qn.points;
    earned += gradeExpertQuestion(qn, answers[qn.id]) * qn.points;
  }));
  return possible ? (earned / possible) * 100 : 0;
}

export interface SectionResult { key: string; title: string; weight: number; sectionScore: number; weighted: number; }

// Weighted final score (0..100) per the strategy: Scenario 40 · Mentoring 20 ·
// Experience 25 · Capstone 15. An optional section left unanswered simply scores
// 0 for its weight (so skipping the capstone caps the maximum at 85).
export function scoreExpertAssessment(assessment: ExpertAssessment, answers: Record<string, any>): { final: number; sections: SectionResult[] } {
  const sections = assessment.sections.map(s => {
    const sectionScore = Math.round(scoreGroups(s.groups, answers));
    return { key: s.key, title: s.title, weight: s.weight, sectionScore, weighted: sectionScore * s.weight };
  });
  const final = Math.round(sections.reduce((sum, s) => sum + s.weighted, 0));
  return { final, sections };
}

// One scenario group per palette block, in display order, tagged with its section.
export interface FlatGroup { group: ScenarioGroup; sectionKey: string; sectionTitle: string; weight: number; startIdx: number; scenarioNumInSection: number; }
export interface FlatQ { gi: number; group: ScenarioGroup; sectionKey: string; sectionTitle: string; question: ExpertQuestion; qIdx: number; }

export function flattenAssessment(assessment: ExpertAssessment): { flat: FlatQ[]; groups: FlatGroup[] } {
  const flat: FlatQ[] = [];
  const groups: FlatGroup[] = [];
  let gi = 0;
  assessment.sections.forEach(s => {
    s.groups.forEach((g, idx) => {
      groups.push({ group: g, sectionKey: s.key, sectionTitle: s.title, weight: s.weight, startIdx: gi, scenarioNumInSection: idx + 1 });
      g.questions.forEach((qn, qIdx) => { flat.push({ gi, group: g, sectionKey: s.key, sectionTitle: s.title, question: qn, qIdx }); gi++; });
    });
  });
  return { flat, groups };
}
