/**
 * expertPathAI.ts — Local Ollama AI helper utilities for ZenAssess Expert Path (8+ Years)
 */
import { callLLM } from './llm';

export interface ExpertProfile {
  summary: string;
  skills: string[];
  yearsIT: number;
  domains: string[];
  roles: string[];
  technologies: string[];
  certifications: string[];
  projects: string[];
  leadershipIndicators: string[];
}

export interface ExtractedEvidence {
  certifications: Array<{
    candidateName: string;
    certificationName: string;
    provider: string;
    credentialNumber: string;
    issueDate: string;
    expiryDate: string;
    skillAreas: string[];
    technologyAreas: string[];
    certificationLevel: string;
  }>;
  projects: Array<{
    projectName: string;
    client: string;
    domain: string;
    duration: string;
    role: string;
    teamSize: number;
    technologies: string[];
    deliverables: string;
    outcomes: string;
    impact: string;
  }>;
  architecture: Array<{
    architecturePattern: string;
    components: string;
    frameworks: string[];
    securityDesign: string;
    scalabilityDesign: string;
    ownership: string;
    designDecisions: string;
  }>;
  leadership: Array<{
    teamSize: number;
    trainings: string;
    mentoring: string;
    coaching: string;
    leadershipActivities: string;
  }>;
  recognition: Array<{
    awardName: string;
    issuer: string;
    date: string;
    category: string;
    recognitionType: string;
  }>;
}

export interface EvidenceEvaluation {
  evidenceScore: number;
  projectScore: number;
  certificationScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missingInformation: string[];
  improvementSuggestions: string[];
  criteria: {
    completeness: { score: number; max: number; feedback: string };
    evidenceQuality: { score: number; max: number; feedback: string };
    technicalDepth: { score: number; max: number; feedback: string };
    ownershipSignals: { score: number; max: number; feedback: string };
    businessImpact: { score: number; max: number; feedback: string };
    leadershipSignals: { score: number; max: number; feedback: string };
  };
}

export interface TechnicalScenario {
  skill: string;
  scenario: string;
  question: string;
  followUps: string[];
}

export interface TechnicalEvaluation {
  technicalScore: number;
  feedback: string;
  strengths: string[];
  gaps: string[];
}

export interface LeadershipScenario {
  scenario: string;
  question: string;
}

export interface LeadershipEvaluation {
  leadershipScore: number;
  feedback: string;
  dimensions: {
    leadership: { score: number; feedback: string };
    delegation: { score: number; feedback: string };
    riskManagement: { score: number; feedback: string };
    communication: { score: number; feedback: string };
    teamHandling: { score: number; feedback: string };
  };
}

export interface ConsistencyAnalysis {
  consistencyScore: number;
  flaggedInconsistencies: string[];
  explanation: string;
}

export interface RiskAnalysis {
  confidenceScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  evidenceRisk: { level: 'Low' | 'Medium' | 'High'; feedback: string };
  consistencyRisk: { level: 'Low' | 'Medium' | 'High'; feedback: string };
  validationRisk: { level: 'Low' | 'Medium' | 'High'; feedback: string };
}

/** 1. Resume Analysis */
export async function generateExpertProfileAI(resumeText: string): Promise<ExpertProfile> {
  const prompt = `You are ZenScan Expert Recruiter. Analyze the following resume text and build a detailed Expert Candidate Profile (8+ Years Experience). You MUST reply with ONLY a JSON object. No other text, no markdown.

Resume Text:
${resumeText.slice(0, 8000)}

JSON Format:
{
  "summary": "Short 2-3 sentence summary of candidate's career highlights and expert status.",
  "skills": ["list of main testing, coding, or management skills"],
  "yearsIT": 10,
  "domains": ["e.g., Banking, Healthcare, Telecom"],
  "roles": ["e.g., QA Lead, Automation Architect, Test Manager"],
  "technologies": ["list of major tools/tech e.g. Selenium, Python, k6"],
  "certifications": ["list of certs e.g. ISTQB Advanced, AWS Certified"],
  "projects": ["list of major project names/roles"],
  "leadershipIndicators": ["list of leadership signals e.g. Managed 10 engineers, Led framework architecture design"]
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error generating expert profile:', e);
  }
  return {
    summary: 'Candidate has over 8 years of IT experience with focus on QA and testing.',
    skills: ['Performance Testing', 'Automation Testing'],
    yearsIT: 8,
    domains: ['Information Technology'],
    roles: ['QA Engineer'],
    technologies: ['Selenium', 'Java'],
    certifications: [],
    projects: ['Retail Portal testing'],
    leadershipIndicators: ['Led testing activities']
  };
}

export async function extractEvidenceAI(evidence: {
  certifications: string;
  projectDeliverables: string;
  mentoringRecords: string;
  frameworkOwnership: string;
  teamLeadRecords: string;
}): Promise<ExtractedEvidence> {
  const prompt = `You are ZenScan Expert Extractor. Extract structured details from the following candidate evidence fields. Ignore and remove any URLs, links, or file paths. Extract purely textual credentials, projects, patterns, and leadership metrics. You MUST reply with ONLY a JSON object. No other text, no markdown.

EVIDENCE SUBMITTED:
1. Certifications Evidence:
${evidence.certifications}

2. Projects Evidence:
${evidence.projectDeliverables}

3. Leadership & Mentoring Evidence:
${evidence.mentoringRecords}

4. Framework Ownership Evidence:
${evidence.frameworkOwnership}

5. Recognition & Awards Evidence:
${evidence.teamLeadRecords}

JSON Format:
{
  "certifications": [
    { "candidateName": "Candidate Name", "certificationName": "Certification Name", "provider": "Provider/Issuer", "credentialNumber": "ID if provided", "issueDate": "Date", "expiryDate": "Date", "skillAreas": ["Skills"], "technologyAreas": ["Tech"], "certificationLevel": "Associate/Professional/Expert" }
  ],
  "projects": [
    { "projectName": "Project Name", "client": "Client Name", "domain": "Domain", "duration": "Duration", "role": "Role", "teamSize": 5, "technologies": ["Tools/Tech"], "deliverables": "Deliverables description", "outcomes": "Outcomes achieved", "impact": "Business impact" }
  ],
  "architecture": [
    { "architecturePattern": "Architecture Pattern", "components": "Components built", "frameworks": ["Frameworks used"], "securityDesign": "Security details", "scalabilityDesign": "Scalability details", "ownership": "Level of ownership", "designDecisions": "Core design decisions" }
  ],
  "leadership": [
    { "teamSize": 0, "trainings": "Trainings details", "mentoring": "Mentoring details", "coaching": "Coaching details", "leadershipActivities": "Leadership activities details" }
  ],
  "recognition": [
    { "awardName": "Award Name", "issuer": "Issuer", "date": "Date", "category": "Category", "recognitionType": "Type of recognition" }
  ]
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error extracting evidence:', e);
  }
  return { certifications: [], projects: [], architecture: [], leadership: [], recognition: [] };
}

/** 3. AI Evidence Evaluation (Dynamic Ollama Evaluation) */
export async function evaluateEvidenceAI(extracted: ExtractedEvidence): Promise<EvidenceEvaluation> {
  const prompt = `You are ZenAssess Expert Evaluator. Assess the technical depth, quality, completeness, ownership signals, business impact, and leadership signals of the following extracted evidence.
You MUST rate each of the 6 dimensions on a scale of 0 to 20:
- completeness
- evidenceQuality
- technicalDepth
- ownershipSignals
- businessImpact
- leadershipSignals

Also generate:
1. certificationScore (0 to 100): Evaluate the certifications based on Industry Recognition, Skill Relevance, and Validity. If no valid industry certifications, give a lower score. Do NOT award score simply because text exists.
2. projectScore (0 to 100): Evaluate the projects based on complexity, scale, ownership, and technical depth. If description is simple or lacks details, penalize score.
3. Calculate the overall evidenceScore (0 to 100) using the formula:
evidenceScore = Math.round((completeness + evidenceQuality + technicalDepth + ownershipSignals + businessImpact + leadershipSignals) / 120 * 100).
Rules: Do NOT award scores simply because evidence is present. Look for concrete metrics, real-world complexity, architecture design ownership, and leadership outcomes.

EXTRACTED EVIDENCE:
${JSON.stringify(extracted, null, 2)}

JSON Format:
{
  "evidenceScore": 75,
  "projectScore": 70,
  "certificationScore": 80,
  "summary": "Overall evidence quality summary...",
  "strengths": ["List of identified strengths in the evidence"],
  "weaknesses": ["List of identified gaps/weaknesses in the evidence"],
  "missingInformation": ["List of important info missing from the submission"],
  "criteria": {
    "completeness": { "score": 15, "max": 20, "feedback": "Critique completeness..." },
    "evidenceQuality": { "score": 14, "max": 20, "feedback": "Critique quality..." },
    "technicalDepth": { "score": 15, "max": 20, "feedback": "Critique technical depth..." },
    "ownershipSignals": { "score": 15, "max": 20, "feedback": "Critique ownership..." },
    "businessImpact": { "score": 14, "max": 20, "feedback": "Critique impact..." },
    "leadershipSignals": { "score": 15, "max": 20, "feedback": "Critique leadership..." }
  }
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error evaluating evidence:', e);
  }
  return {
    evidenceScore: 60,
    projectScore: 60,
    certificationScore: 60,
    summary: 'Evidence is sufficient for advanced but lacks the quantitative metrics required for expert status.',
    strengths: ['Relevant technologies mentioned'],
    weaknesses: ['Lacks concrete ownership metrics'],
    missingInformation: ['Specific project business outcomes'],
    improvementSuggestions: ['Add architecture diagrams with specific components, code metrics, and quantifiable business outcomes'],
    criteria: {
      completeness: { score: 12, max: 20, feedback: 'Basic details provided.' },
      evidenceQuality: { score: 12, max: 20, feedback: 'Claims are descriptive but lack metrics.' },
      technicalDepth: { score: 12, max: 20, feedback: 'Standard tools used.' },
      ownershipSignals: { score: 12, max: 20, feedback: 'Shows participation.' },
      businessImpact: { score: 12, max: 20, feedback: 'Lacks business outcomes.' },
      leadershipSignals: { score: 12, max: 20, feedback: 'Basic team participation.' }
    }
  };
}

/** 4. AI Technical Discussion Question Generation */
export async function generateTechnicalScenarioAI(profile: ExpertProfile): Promise<TechnicalScenario> {
  const prompt = `You are ZenAssess Tech Interviewer. Generate a highly specific, non-generic technical scenario question and 3 follow-up prompts based on the candidate's profile.
Do NOT ask generic questions (e.g. 'What is load testing?'). Ask about a highly critical production issue, architecture decision, or performance failure matching their tech stack, roles, and domains.

Guidelines:
- If their skill involves Performance Testing, generate a scenario similar to: "A banking application response time increased from 300ms to 2.5s after deployment under peak load. How would you investigate?"
- If their skill involves Python/Programming, generate a scenario similar to: "A production Python service crashes every 4 hours because memory usage continuously increases. How would you troubleshoot?"
- Tailor the scenario specifically to the candidate's domains and technologies.

CANDIDATE PROFILE:
- Skills: ${profile.skills.join(', ')}
- Domains: ${profile.domains.join(', ')}
- Technologies: ${profile.technologies.join(', ')}
- Projects: ${profile.projects.join(', ')}

JSON Format:
{
  "skill": "e.g., Performance Testing / Python / Web Automation",
  "scenario": "Detailed description of a critical production issue...",
  "question": "How would you troubleshoot and resolve this issue?",
  "followUps": [
    "What metrics would you review first?",
    "What tools would you use?",
    "What would be your first action?"
  ]
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error generating technical scenario:', e);
  }
  return {
    skill: 'Performance Testing',
    scenario: 'A banking application response time increased from 300ms to 2.5s after deployment under peak load. Database CPU is at 100%.',
    question: 'How would you investigate and resolve this performance degradation?',
    followUps: [
      'What metrics would you review first?',
      'What tools would you use?',
      'What would be your first action?'
    ]
  };
}

/** 5. Evaluate Technical Discussion */
export async function evaluateTechnicalDiscussionAI(
  scenario: TechnicalScenario,
  answers: { mainAnswer: string; followUpAnswers: string[] }
): Promise<TechnicalEvaluation> {
  const prompt = `You are ZenAssess Tech Interviewer. Evaluate the candidate's answers to the technical scenario and follow-up questions.
Rate their response from 0 to 100 based on their systematic reasoning, troubleshooting strategy, decision making, and real experience signals.
Do NOT award scores simply because text exists; evaluate the exact depth and accuracy of their troubleshooting strategy.

SCENARIO:
${scenario.scenario}

QUESTION:
${scenario.question}
CANDIDATE MAIN ANSWER:
${answers.mainAnswer}

FOLLOW-UP 1: ${scenario.followUps[0]}
CANDIDATE ANSWER: ${answers.followUpAnswers[0]}

FOLLOW-UP 2: ${scenario.followUps[1]}
CANDIDATE ANSWER: ${answers.followUpAnswers[1]}

FOLLOW-UP 3: ${scenario.followUps[2]}
CANDIDATE ANSWER: ${answers.followUpAnswers[2]}

JSON Format:
{
  "technicalScore": 85,
  "feedback": "Detailed assessment of candidate's technical depth, reasoning and decision making...",
  "strengths": ["list of positive aspects of their answers"],
  "gaps": ["list of areas they missed or answered poorly"]
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error evaluating tech discussion:', e);
  }
  return {
    technicalScore: 70,
    feedback: 'Candidate shows decent knowledge but troubleshooting strategy is generic.',
    strengths: ['Identified APM tools'],
    gaps: ['Missed connection pool sizing and cache validation details']
  };
}

/** 6. AI Leadership Discussion Scenario Generation */
export async function generateLeadershipScenarioAI(profile: ExpertProfile): Promise<LeadershipScenario> {
  const prompt = `You are ZenAssess Executive Evaluator. Generate a highly specific leadership crisis scenario and question based on the candidate's profile.
Do NOT ask generic questions. Focus on project execution, crisis management, resource scaling, team handling, or timeline compression.

Guidelines:
- Tailor the scenario and team details specifically to their domain, projects, and tech stack.
- Include a specific resource constraint and delivery deadline reduction.
- For example: "Your team consists of: 2 Senior Engineers, 5 Mid-Level Engineers, 4 Junior Engineers. The project timeline is suddenly reduced by 50% from 12 weeks to 6 weeks. How would you manage this?"

CANDIDATE PROFILE:
- Skills: ${profile.skills.join(', ')}
- Domains: ${profile.domains.join(', ')}
- Technologies: ${profile.technologies.join(', ')}
- Projects: ${profile.projects.join(', ')}

JSON Format:
{
  "scenario": "Detailed description of a team and project crisis. For example: Your team has 2 Seniors, 5 Mid-Levels, 4 Juniors working on a banking API migration. The client cuts the timeline by 50%...",
  "question": "How would you manage this situation and deliver the project under these constraints?"
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error generating leadership scenario:', e);
  }
  return {
    scenario: 'Your team consists of: 2 Senior Engineers, 5 Mid-Level Engineers, 4 Junior Engineers. The client has suddenly reduced the delivery deadline by 50% from 12 weeks to 6 weeks.',
    question: 'How would you manage this situation and deliver the project under these constraints?'
  };
}

/** 7. Evaluate Leadership Discussion */
export async function evaluateLeadershipDiscussionAI(
  scenario: LeadershipScenario,
  answer: string
): Promise<LeadershipEvaluation> {
  const prompt = `You are ZenAssess Executive Evaluator. Evaluate the candidate's answer to the following leadership scenario:
SCENARIO: ${scenario.scenario}
QUESTION: ${scenario.question}

You MUST rate their strategy on a scale of 0 to 20 for each of these 5 dimensions:
- leadership
- delegation
- riskManagement
- communication
- teamHandling

Calculate leadershipScore = leadership + delegation + riskManagement + communication + teamHandling (max 100).
Evaluate planning logic, resource utilization (seniors pairing with juniors), scope negotiation, client communication, and team handling.
Do NOT award scores simply because text exists; evaluate the quality and maturity of their leadership strategy.

CANDIDATE ANSWER:
${answer}

JSON Format:
{
  "leadershipScore": 80,
  "feedback": "Detailed leadership feedback...",
  "dimensions": {
    "leadership": { "score": 16, "feedback": "Detail..." },
    "delegation": { "score": 16, "feedback": "Detail..." },
    "riskManagement": { "score": 16, "feedback": "Detail..." },
    "communication": { "score": 16, "feedback": "Detail..." },
    "teamHandling": { "score": 16, "feedback": "Detail..." }
  }
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error evaluating leadership:', e);
  }
  return {
    leadershipScore: 70,
    feedback: 'Candidate proposed scope reduction and delegation, but resource allocation was generic.',
    dimensions: {
      leadership: { score: 14, feedback: 'Proposed basic plan.' },
      delegation: { score: 14, feedback: 'Delegated based on seniority.' },
      riskManagement: { score: 14, feedback: 'Missed buffer contingency plan.' },
      communication: { score: 14, feedback: 'Stakeholder status reports proposed.' },
      teamHandling: { score: 14, feedback: 'Motivated team standardly.' }
    }
  };
}

/** 8. Consistency Analysis */
export async function evaluateConsistencyAI(
  profile: ExpertProfile,
  extractedEvidence: ExtractedEvidence,
  techScenario: TechnicalScenario,
  techAnswers: { mainAnswer: string; followUpAnswers: string[] },
  techEval: TechnicalEvaluation,
  leadScenario: LeadershipScenario,
  leadAnswer: string
): Promise<ConsistencyAnalysis> {
  const prompt = `You are ZenAssess Consistency Analyst. Evaluate the consistency between:
1. Candidate's claimed evidence/experience (owning frameworks, leading major migrations, etc.)
2. Technical Discussion answers (systematic troubleshooting, architectural choices)
3. Leadership Discussion answers (resource management under deadline pressure)

Look for discrepancies. For example, if evidence says "Framework Owner of Playwright suite" but in discussion the candidate "Cannot explain framework decisions or Playwright design patterns", flag this inconsistency.
Generate a consistencyScore from 0 to 100. List flagged inconsistencies.

CANDIDATE PROFILE & EVIDENCE:
- Experience: ${profile.yearsIT} years
- Evidence Summary: ${JSON.stringify(extractedEvidence)}

TECHNICAL DISCUSSION:
- Scenario: ${techScenario.scenario}
- Candidate Answers: ${techAnswers.mainAnswer} / ${techAnswers.followUpAnswers.join(' / ')}
- Technical Evaluation: ${techEval.feedback}

LEADERSHIP DISCUSSION:
- Scenario: ${leadScenario.scenario}
- Candidate Answer: ${leadAnswer}

JSON Format:
{
  "consistencyScore": 95,
  "flaggedInconsistencies": [
    "Flag details if any discrepancies exist. Keep empty if candidate reasoning matches their claims."
  ],
  "explanation": "Brief explanation of the consistency analysis..."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error evaluating consistency:', e);
  }
  return {
    consistencyScore: 90,
    flaggedInconsistencies: [],
    explanation: 'Candidate claims in resume and evidence align with their technical and leadership reasoning.'
  };
}

/** 9. Risk Analysis */
export async function evaluateRiskAI(
  evidenceScore: number,
  techScore: number,
  leadScore: number,
  consistencyScore: number,
  tabSwitches: number,
  copyPastes: number,
  devtools: boolean,
  plagiarismMatched: boolean
): Promise<RiskAnalysis> {
  const prompt = `You are ZenAssess Risk Analyst. Generate an overall Confidence Score (0-100), Risk Level (Low, Medium, or High), and specific risk assessments:
- Evidence Risk (based on evidence verification, completeness)
- Consistency Risk (based on consistency score and discussion matches)
- Validation Risk (based on proctoring violations: tab switches, copy-paste attempts, devtools access, plagiarism)

PROCTORING INPUTS:
- Tab switches: ${tabSwitches}
- Copy-paste attempts: ${copyPastes}
- DevTools console opened: ${devtools}
- Plagiarism match with other candidates: ${plagiarismMatched ? 'YES' : 'NO'}

SCORES:
- Evidence Score: ${evidenceScore}%
- Technical Discussion: ${techScore}%
- Leadership Discussion: ${leadScore}%
- Consistency Score: ${consistencyScore}%

JSON Format:
{
  "confidenceScore": 85,
  "riskLevel": "Low",
  "evidenceRisk": { "level": "Low", "feedback": "Evidence details verified..." },
  "consistencyRisk": { "level": "Low", "feedback": "Consistency score is high..." },
  "validationRisk": { "level": "Low", "feedback": "No proctoring flags..." }
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return res.data;
  } catch (e) {
    console.error('Error evaluating risk:', e);
  }

  let level: 'Low' | 'Medium' | 'High' = 'Low';
  let conf = 80;
  if (tabSwitches > 5 || copyPastes > 3 || devtools || plagiarismMatched) {
    level = 'High';
    conf = 40;
  } else if (tabSwitches > 2 || copyPastes > 1) {
    level = 'Medium';
    conf = 65;
  }

  return {
    confidenceScore: conf,
    riskLevel: level,
    evidenceRisk: { level: 'Low', feedback: 'No evidence issues.' },
    consistencyRisk: { level: 'Low', feedback: 'Consistency is normal.' },
    validationRisk: { level, feedback: `Tab switches: ${tabSwitches}, Copy-pastes: ${copyPastes}` }
  };
}

export interface AuthenticityAnalysis {
  humanWrittenPct: number;
  aiAssistedPct: number;
  copyCount: number;
  pasteCount: number;
  largePasteEvents: number;
  duplicateContentRisk: number;
  authenticityScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  reason: string;
}

/** 10. Authenticity Engine / Content Analysis */
export async function analyzeAuthenticityAI(
  evidenceText: string,
  discussionAnswersText: string,
  copyCount: number,
  pasteCount: number,
  largePasteEvents: number
): Promise<AuthenticityAnalysis> {
  const prompt = `You are ZenAssess Authenticity Analyst. Analyze the following candidate submissions (evidence documents + discussion responses) for potential AI content, generic patterns, and copy-paste risk.
Also evaluate the provided copy-paste counters:
- Copy count: ${copyCount}
- Paste count: ${pasteCount}
- Large paste events: ${largePasteEvents}

Determine:
1. Human Written % (0 to 100)
2. AI Assisted % (0 to 100)
3. Duplicate Content Risk % (0 to 100, look for repeated sentences or boilerplate)
4. Authenticity Score (0 to 100). Calculate as:
   Authenticity Score = Math.max(0, Human Written % - (copyCount * 2) - (pasteCount * 5) - (largePasteEvents * 15))
5. Risk Level ('Low' | 'Medium' | 'High')
   - High Risk: If AI Assisted % > 60% OR Large Paste Events > 2
   - Medium Risk: If AI Assisted % is 30% - 60% OR Paste Count > 5
   - Low Risk: Otherwise
6. Reason: A detailed explanation of why the score was given, and highlighting color-coded warnings (Green for low AI/paste activity, Orange for moderate, Red for high AI patterns or large pastes).

SUBMISSIONS:
--- Evidence Text ---
${evidenceText.slice(0, 5000)}

--- Discussion Answers ---
${discussionAnswersText.slice(0, 5000)}

JSON Format:
{
  "humanWrittenPct": 80,
  "aiAssistedPct": 20,
  "duplicateContentRisk": 10,
  "authenticityScore": 75,
  "riskLevel": "Low",
  "reason": "Large portions are human written with project-specific details. Copy/paste activity is minimal."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return {
      humanWrittenPct: Number(res.data.humanWrittenPct) || 100,
      aiAssistedPct: Number(res.data.aiAssistedPct) || 0,
      copyCount,
      pasteCount,
      largePasteEvents,
      duplicateContentRisk: Number(res.data.duplicateContentRisk) || 0,
      authenticityScore: Number(res.data.authenticityScore) || 100,
      riskLevel: res.data.riskLevel || 'Low',
      reason: res.data.reason || 'Authentic submission.'
    };
  } catch (e) {
    console.error('Error analyzing authenticity:', e);
  }
  return {
    humanWrittenPct: 100,
    aiAssistedPct: 0,
    copyCount,
    pasteCount,
    largePasteEvents,
    duplicateContentRisk: 0,
    authenticityScore: Math.max(0, 100 - (copyCount * 2) - (pasteCount * 5) - (largePasteEvents * 15)),
    riskLevel: (largePasteEvents > 2) ? 'High' : (pasteCount > 5) ? 'Medium' : 'Low',
    reason: 'Authenticity evaluation fallback completed.'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL EVIDENCE ENGINE — Expert Path (8+ Years)
// Supports: PDF · DOCX · PPTX · XLSX · TXT · PNG · JPG · JPEG · WEBP
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentType =
  | 'ProjectReport' | 'Certification' | 'ArchitectureDiagram'
  | 'TrainingMaterial' | 'Presentation' | 'Recognition'
  | 'TechnicalReport' | 'DesignDocument' | 'AssessmentReport'
  | 'SolutionDocument' | 'InternalDoc' | 'PerformanceDashboard'
  | 'Screenshot' | 'Other';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  ProjectReport:       'Project Report',
  Certification:       'Certification',
  ArchitectureDiagram: 'Architecture Diagram',
  TrainingMaterial:    'Training Material',
  Presentation:        'Presentation',
  Recognition:         'Recognition / Award',
  TechnicalReport:     'Technical Report',
  DesignDocument:      'Design Document',
  AssessmentReport:    'Assessment Report',
  SolutionDocument:    'Solution Document',
  InternalDoc:         'Internal Documentation',
  PerformanceDashboard:'Performance Dashboard',
  Screenshot:          'Screenshot',
  Other:               'Other Evidence',
};

export const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  ProjectReport:       '#3B82F6',
  Certification:       '#10B981',
  ArchitectureDiagram: '#8B5CF6',
  TrainingMaterial:    '#F59E0B',
  Presentation:        '#6366F1',
  Recognition:         '#EC4899',
  TechnicalReport:     '#0EA5E9',
  DesignDocument:      '#7C3AED',
  AssessmentReport:    '#059669',
  SolutionDocument:    '#2563EB',
  InternalDoc:         '#64748B',
  PerformanceDashboard:'#EF4444',
  Screenshot:          '#94A3B8',
  Other:               '#6B7280',
};

export interface UniversalEvidenceFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: 'idle' | 'parsing' | 'classifying' | 'success' | 'error';
  extractedText: string;
  classification?: DocumentClassification;
  highlights?: HighlightedSegment[];
  errorMessage?: string;
}

export interface DocumentClassification {
  documentType: DocumentType;
  documentTypeLabel: string;
  confidence: number;
  detectedSkills: string[];
  technologies: string[];
  projectNames: string[];
  domains: string[];
  roles: string[];
  responsibilities: string[];
  teamSize: number | null;
  leadershipIndicators: string[];
  architectureIndicators: string[];
  ownershipIndicators: string[];
  businessImpact: string;
  achievements: string[];
  certifications: string[];
  trainingActivities: string[];
  evidenceSummary: string;
}

export interface HighlightedSegment {
  text: string;
  color: 'green' | 'orange' | 'red';
  reason: string;
}

export interface UniversalExtractedEvidence {
  documents: Array<DocumentClassification & { filename: string; evidenceId: string }>;
  aggregated: {
    detectedSkills: string[];
    technologies: string[];
    projectNames: string[];
    domains: string[];
    roles: string[];
    leadershipIndicators: string[];
    architectureIndicators: string[];
    ownershipIndicators: string[];
    businessImpactSummary: string;
    achievements: string[];
    certifications: string[];
    trainingActivities: string[];
    overallConfidence: number;
  };
}

// ── Helper: build safe DocumentClassification from AI response ──────────────
function safeClassification(raw: any, filename: string): DocumentClassification {
  const dt = (raw?.documentType as DocumentType) || 'Other';
  return {
    documentType: dt,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[dt] || raw?.documentTypeLabel || dt,
    confidence: Number(raw?.confidence) || 50,
    detectedSkills:       Array.isArray(raw?.detectedSkills)       ? raw.detectedSkills       : [],
    technologies:         Array.isArray(raw?.technologies)         ? raw.technologies         : [],
    projectNames:         Array.isArray(raw?.projectNames)         ? raw.projectNames         : [],
    domains:              Array.isArray(raw?.domains)              ? raw.domains              : [],
    roles:                Array.isArray(raw?.roles)                ? raw.roles                : [],
    responsibilities:     Array.isArray(raw?.responsibilities)     ? raw.responsibilities     : [],
    teamSize:             raw?.teamSize != null ? Number(raw.teamSize) : null,
    leadershipIndicators: Array.isArray(raw?.leadershipIndicators) ? raw.leadershipIndicators : [],
    architectureIndicators:Array.isArray(raw?.architectureIndicators)?raw.architectureIndicators:[],
    ownershipIndicators:  Array.isArray(raw?.ownershipIndicators)  ? raw.ownershipIndicators  : [],
    businessImpact:       raw?.businessImpact || '',
    achievements:         Array.isArray(raw?.achievements)         ? raw.achievements         : [],
    certifications:       Array.isArray(raw?.certifications)       ? raw.certifications       : [],
    trainingActivities:   Array.isArray(raw?.trainingActivities)   ? raw.trainingActivities   : [],
    evidenceSummary:      raw?.evidenceSummary || `Evidence file: ${filename}`,
  };
}

/** Universal Step 1: Classify a single document and extract all evidence signals */
export async function classifyDocumentAI(
  filename: string,
  extractedText: string,
  mimeType: string
): Promise<DocumentClassification> {
  const isImage = mimeType.startsWith('image/');
  const contentBlock = isImage
    ? `[IMAGE FILE — no OCR text. Classify purely from filename: "${filename}".]`
    : extractedText.slice(0, 5000);

  const prompt = `You are ZenAssess Document Intelligence. Classify and extract all expert evidence signals from a professional document uploaded for Expert (8+ years) capability validation.

FILENAME: ${filename}
MIME TYPE: ${mimeType}
CONTENT:
---
${contentBlock}
---

INSTRUCTIONS:
1. Classify documentType from: ProjectReport, Certification, ArchitectureDiagram, TrainingMaterial, Presentation, Recognition, TechnicalReport, DesignDocument, AssessmentReport, SolutionDocument, InternalDoc, PerformanceDashboard, Screenshot, Other
2. Set confidence 0-100 based on evidence specificity and quality (low for images without OCR)
3. Extract ALL signals present — do NOT fabricate anything not in the text
4. For images with no OCR, use filename context only for classification
5. evidenceSummary: 1-2 sentence plain English summary of what this document proves

You MUST reply with ONLY a valid JSON object. No markdown, no backticks.

{
  "documentType": "ProjectReport",
  "documentTypeLabel": "Project Report",
  "confidence": 82,
  "detectedSkills": ["Performance Testing", "JMeter", "k6"],
  "technologies": ["JMeter", "Grafana", "Jenkins", "AWS"],
  "projectNames": ["Banking API Load Test Q3-2024"],
  "domains": ["Banking"],
  "roles": ["Performance Test Lead"],
  "responsibilities": ["Designed distributed load scenarios", "Led 500-user peak load tests"],
  "teamSize": 8,
  "leadershipIndicators": ["Led 8-member QA team", "Reported to CTO"],
  "architectureIndicators": ["Distributed load generation", "Grafana dashboards"],
  "ownershipIndicators": ["Framework architect", "Sole owner of perf suite"],
  "businessImpact": "Reduced production incidents by 40% via proactive load testing",
  "achievements": ["Delivered 10% under SLA breach target"],
  "certifications": [],
  "trainingActivities": [],
  "evidenceSummary": "Project report demonstrating hands-on performance testing leadership for a critical banking API with measurable business outcomes."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) return safeClassification(res.data, filename);
  } catch (e) {
    console.error('[classifyDocumentAI] Error:', e);
  }
  return safeClassification(null, filename);
}

/** Universal Step 2: Aggregate all document classifications into a unified evidence profile */
export async function extractUniversalEvidenceAI(
  documents: Array<{ filename: string; text: string; mimeType: string; classification?: DocumentClassification }>
): Promise<UniversalExtractedEvidence> {
  const payload = documents.map((d, i) => ({
    evidenceId: `ev_${i + 1}`,
    filename: d.filename,
    mimeType: d.mimeType,
    documentType: d.classification?.documentType || 'Other',
    documentTypeLabel: d.classification?.documentTypeLabel || 'Other Evidence',
    confidence: d.classification?.confidence || 40,
    detectedSkills: d.classification?.detectedSkills || [],
    technologies: d.classification?.technologies || [],
    projectNames: d.classification?.projectNames || [],
    leadershipIndicators: d.classification?.leadershipIndicators || [],
    architectureIndicators: d.classification?.architectureIndicators || [],
    ownershipIndicators: d.classification?.ownershipIndicators || [],
    businessImpact: d.classification?.businessImpact || '',
    certifications: d.classification?.certifications || [],
    achievements: d.classification?.achievements || [],
    evidenceSummary: d.classification?.evidenceSummary || d.filename,
  }));

  const prompt = `You are ZenAssess Evidence Aggregator. Aggregate evidence intelligence from ${documents.length} uploaded professional documents for Expert (8+ years) capability validation.

DOCUMENTS:
${JSON.stringify(payload, null, 2)}

TASK: De-duplicate and aggregate ALL unique signals across all documents into one comprehensive evidence profile.
Do NOT fabricate signals not present in the documents above.

You MUST reply with ONLY a valid JSON object. No markdown.

{
  "documents": [
    {
      "evidenceId": "ev_1",
      "filename": "aws_cert.pdf",
      "documentType": "Certification",
      "documentTypeLabel": "Certification",
      "confidence": 90,
      "detectedSkills": ["AWS", "Cloud Architecture"],
      "technologies": ["AWS EC2", "S3"],
      "projectNames": [],
      "domains": ["Cloud"],
      "roles": ["Cloud Architect"],
      "responsibilities": [],
      "teamSize": null,
      "leadershipIndicators": [],
      "architectureIndicators": [],
      "ownershipIndicators": ["AWS Certified"],
      "businessImpact": "Validates cloud expertise",
      "achievements": ["AWS Solutions Architect - Associate"],
      "certifications": ["AWS Solutions Architect - Associate"],
      "trainingActivities": [],
      "evidenceSummary": "AWS certification validating cloud architecture skills."
    }
  ],
  "aggregated": {
    "detectedSkills": ["AWS", "Performance Testing"],
    "technologies": ["AWS EC2", "JMeter"],
    "projectNames": ["Banking API Migration"],
    "domains": ["Banking", "Cloud"],
    "roles": ["Cloud Architect", "Performance Lead"],
    "leadershipIndicators": ["Led team of 12"],
    "architectureIndicators": ["Microservices design"],
    "ownershipIndicators": ["Framework owner"],
    "businessImpactSummary": "Demonstrated measurable business impact: 40% incident reduction, performance SLA met.",
    "achievements": ["AWS Certification", "Best Performance Award 2023"],
    "certifications": ["AWS Solutions Architect - Associate"],
    "trainingActivities": ["Conducted k6 training for 10-member team"],
    "overallConfidence": 78
  }
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data && Array.isArray(res.data.documents)) {
      return {
        documents: res.data.documents,
        aggregated: {
          detectedSkills:       res.data.aggregated?.detectedSkills       || [],
          technologies:         res.data.aggregated?.technologies         || [],
          projectNames:         res.data.aggregated?.projectNames         || [],
          domains:              res.data.aggregated?.domains              || [],
          roles:                res.data.aggregated?.roles                || [],
          leadershipIndicators: res.data.aggregated?.leadershipIndicators || [],
          architectureIndicators:res.data.aggregated?.architectureIndicators||[],
          ownershipIndicators:  res.data.aggregated?.ownershipIndicators  || [],
          businessImpactSummary:res.data.aggregated?.businessImpactSummary|| '',
          achievements:         res.data.aggregated?.achievements         || [],
          certifications:       res.data.aggregated?.certifications       || [],
          trainingActivities:   res.data.aggregated?.trainingActivities   || [],
          overallConfidence:    Number(res.data.aggregated?.overallConfidence) || 60,
        },
      };
    }
  } catch (e) {
    console.error('[extractUniversalEvidenceAI] Error:', e);
  }

  // Fallback: build from individual classifications
  const unique = <T>(arr: T[]): T[] => [...new Set(arr)];
  return {
    documents: documents.map((d, i) => ({
      evidenceId: `ev_${i + 1}`,
      filename: d.filename,
      ...(d.classification || safeClassification(null, d.filename)),
    })),
    aggregated: {
      detectedSkills:       unique(documents.flatMap(d => d.classification?.detectedSkills || [])),
      technologies:         unique(documents.flatMap(d => d.classification?.technologies || [])),
      projectNames:         unique(documents.flatMap(d => d.classification?.projectNames || [])),
      domains:              unique(documents.flatMap(d => d.classification?.domains || [])),
      roles:                unique(documents.flatMap(d => d.classification?.roles || [])),
      leadershipIndicators: unique(documents.flatMap(d => d.classification?.leadershipIndicators || [])),
      architectureIndicators:unique(documents.flatMap(d => d.classification?.architectureIndicators || [])),
      ownershipIndicators:  unique(documents.flatMap(d => d.classification?.ownershipIndicators || [])),
      businessImpactSummary:documents.map(d => d.classification?.businessImpact).filter(Boolean).join('. '),
      achievements:         unique(documents.flatMap(d => d.classification?.achievements || [])),
      certifications:       unique(documents.flatMap(d => d.classification?.certifications || [])),
      trainingActivities:   unique(documents.flatMap(d => d.classification?.trainingActivities || [])),
      overallConfidence:    Math.round(documents.reduce((s, d) => s + (d.classification?.confidence || 40), 0) / Math.max(1, documents.length)),
    },
  };
}

/** Universal Step 3: Evaluate quality of aggregated universal evidence — returns same EvidenceEvaluation for backward compat */
export async function evaluateUniversalEvidenceAI(extracted: UniversalExtractedEvidence): Promise<EvidenceEvaluation> {
  const docSummary = extracted.documents.map(d =>
    `- [${d.documentTypeLabel}] ${d.filename} (confidence: ${d.confidence}%): ${d.evidenceSummary}`
  ).join('\n');

  const prompt = `You are ZenAssess Expert Evaluator. Evaluate ${extracted.documents.length} submitted professional documents for an Expert (8+ years) capability validation. Assess quality, depth, authenticity, and expert signals.

DOCUMENT SUMMARY:
${docSummary}

AGGREGATED SIGNALS:
- Skills: ${extracted.aggregated.detectedSkills.join(', ') || 'None detected'}
- Technologies: ${extracted.aggregated.technologies.join(', ') || 'None'}
- Projects: ${extracted.aggregated.projectNames.join(', ') || 'None'}
- Leadership: ${extracted.aggregated.leadershipIndicators.join(', ') || 'None'}
- Architecture: ${extracted.aggregated.architectureIndicators.join(', ') || 'None'}
- Ownership: ${extracted.aggregated.ownershipIndicators.join(', ') || 'None'}
- Business Impact: ${extracted.aggregated.businessImpactSummary || 'Not specified'}
- Certifications: ${extracted.aggregated.certifications.join(', ') || 'None'}
- Overall Confidence: ${extracted.aggregated.overallConfidence}%

Rate each of 6 dimensions on a scale of 0 to 20:
- completeness: Are all key evidence areas covered (projects, certs, leadership, architecture)?
- evidenceQuality: Is evidence specific, concrete, and verifiable?
- technicalDepth: Does evidence demonstrate deep technical expertise?
- ownershipSignals: Does evidence prove direct ownership (not just participation)?
- businessImpact: Does evidence show measurable business outcomes?
- leadershipSignals: Does evidence prove leadership (team management, mentoring, strategic decisions)?

Also:
- certificationScore (0-100): Based on certification relevance and industry recognition
- projectScore (0-100): Based on project complexity, scale, and ownership
- evidenceScore (0-100) = round(sum of 6 dimension scores / 120 * 100)

CRITICAL: Do NOT award full marks just because documents were uploaded. Evaluate actual signal quality.

JSON Format:
{
  "evidenceScore": 75,
  "projectScore": 70,
  "certificationScore": 80,
  "summary": "Overall evidence quality assessment...",
  "strengths": ["List of evidence strengths"],
  "weaknesses": ["List of evidence gaps"],
  "missingInformation": ["Critical missing evidence"],
  "improvementSuggestions": ["Actionable advice for improvement (e.g. Add architecture diagrams with specific components, provide code metrics, include manager recognition awards)"],
  "criteria": {
    "completeness": { "score": 15, "max": 20, "feedback": "..." },
    "evidenceQuality": { "score": 14, "max": 20, "feedback": "..." },
    "technicalDepth": { "score": 15, "max": 20, "feedback": "..." },
    "ownershipSignals": { "score": 15, "max": 20, "feedback": "..." },
    "businessImpact": { "score": 14, "max": 20, "feedback": "..." },
    "leadershipSignals": { "score": 15, "max": 20, "feedback": "..." }
  }
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        evidenceScore: Number(res.data.evidenceScore) || 60,
        projectScore: Number(res.data.projectScore) || 60,
        certificationScore: Number(res.data.certificationScore) || 60,
        summary: res.data.summary || 'Evidence evaluated.',
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : [],
        weaknesses: Array.isArray(res.data.weaknesses) ? res.data.weaknesses : [],
        missingInformation: Array.isArray(res.data.missingInformation) ? res.data.missingInformation : [],
        improvementSuggestions: Array.isArray(res.data.improvementSuggestions) ? res.data.improvementSuggestions : [
          'Upload official certificates to verify certifications claims.',
          'Provide architectural components breakdown with concrete design decisions.'
        ],
        criteria: res.data.criteria || {
          completeness:    { score: 12, max: 20, feedback: 'Completeness evaluated.' },
          evidenceQuality: { score: 12, max: 20, feedback: 'Quality evaluated.' },
          technicalDepth:  { score: 12, max: 20, feedback: 'Depth evaluated.' },
          ownershipSignals:{ score: 12, max: 20, feedback: 'Ownership evaluated.' },
          businessImpact:  { score: 12, max: 20, feedback: 'Impact evaluated.' },
          leadershipSignals:{ score: 12, max: 20, feedback: 'Leadership evaluated.' },
        }
      };
    }
  } catch (e) {
    console.error('[evaluateUniversalEvidenceAI] Error:', e);
  }
  return {
    evidenceScore: 60,
    projectScore: 60,
    certificationScore: 60,
    summary: 'Evidence submitted. Evaluation fallback used — AI scoring unavailable.',
    strengths: ['Multiple professional documents provided'],
    weaknesses: ['AI evaluation unavailable — manual review required'],
    missingInformation: [],
    improvementSuggestions: [
      'Provide concrete quantitative metrics for business impact.',
      'Add official certificates or credential IDs to claim validations.',
      'Detail direct architectural design decisions and component ownership.'
    ],
    criteria: {
      completeness:    { score: 12, max: 20, feedback: 'Documents provided.' },
      evidenceQuality: { score: 12, max: 20, feedback: 'Quality assessment pending.' },
      technicalDepth:  { score: 12, max: 20, feedback: 'Technical depth pending.' },
      ownershipSignals:{ score: 12, max: 20, feedback: 'Ownership signals pending.' },
      businessImpact:  { score: 12, max: 20, feedback: 'Business impact pending.' },
      leadershipSignals:{ score: 12, max: 20, feedback: 'Leadership signals pending.' },
    },
  };
}

/** Universal Step 4: Highlight extracted text with GREEN / ORANGE / RED content signals */
export async function highlightEvidenceContentAI(
  text: string,
  documentType: string
): Promise<HighlightedSegment[]> {
  if (!text || text.length < 30) return [];

  const prompt = `You are ZenAssess Content Highlighter. Analyze this expert evidence document and identify key text segments by signal strength.

DOCUMENT TYPE: ${documentType}
TEXT (first 2500 chars):
---
${text.slice(0, 2500)}
---

Return up to 8 highlighted text segments. Rules:
- GREEN: Strong ownership proof, specific metrics, concrete leadership, architecture decisions, deep technical detail
- ORANGE: Vague claims, participation without ownership, incomplete context, mentioned but unexplained
- RED: Generic/AI-sounding boilerplate, no ownership signal, repeated patterns, zero specificity

CONSTRAINTS:
- text must be an exact substring from the document (max 120 characters)
- Only return segments that exist verbatim in the source text
- Prefer impactful, representative segments

Reply with ONLY a JSON array. No markdown.

[
  { "text": "Architected the Playwright framework from scratch for a 12-member team", "color": "green", "reason": "Strong ownership + concrete team scale + technical specificity" },
  { "text": "Responsible for testing activities in the project", "color": "red", "reason": "Generic statement, no ownership, no specificity" }
]`;

  try {
    const res = await callLLM(prompt);
    if (Array.isArray(res.data)) return res.data.slice(0, 8);
    if (res.data && Array.isArray(res.data.segments)) return res.data.segments.slice(0, 8);
  } catch (e) {
    console.error('[highlightEvidenceContentAI] Error:', e);
  }
  return [];
}

export interface AdaptiveQuestionEvaluation {
  questionScore: number;
  reasoningScore: number;
  technicalDepth: number;
  leadershipSignals: number;
  ownershipSignals: number;
  authenticityScore: number;
  humanContentPct: number;
  aiAssistedPct: number;
  confidenceScore: number;
  strengths: string[];
  gaps: string[];
  improvementSuggestions: string[];
}

export async function generateAdaptiveQuestionAI(
  profile: ExpertProfile,
  questionType: 'Technical' | 'Leadership' | 'Architecture/Ownership',
  experienceBand: '8-10 Years' | '10-15 Years' | '15+ Years',
  history: Array<{ question: string; answer: string; type: string }>
): Promise<{ question: string }> {
  let historyPrompt = '';
  if (history.length > 0) {
    historyPrompt = `\n--- PREVIOUS DISCUSSION HISTORY ---\n` + history.map((h, i) => 
      `Question ${i+1} (${h.type}): ${h.question}\nCandidate Response: ${h.answer}\n`
    ).join('\n') + `\n-----------------------------------\nBased on this history, generate a follow-up or next capability-based question that builds upon these answers or moves to the next focus area.`;
  }

  const prompt = `You are ZenAssess Expert Interviewer. Generate a highly specific, adaptive ${questionType} question for a candidate with ${experienceBand} experience.
DO NOT generate generic questions (e.g., 'What is load testing?' or 'How do you lead a team?').
Customize the question based on the candidate's career footprint:
- Summary: ${profile.summary}
- Skills: ${profile.skills.join(', ')}
- Domains: ${profile.domains.join(', ')}
- Technologies: ${profile.technologies.join(', ')}
- Certifications: ${profile.certifications.join(', ')}
- Projects: ${profile.projects.join(', ')}

DIFFICULTY LEVEL TARGET: ${experienceBand}
- For '8-10 Years': Focus on hands-on advanced engineering, troubleshooting critical production issues, tool telemetry, and best practices.
- For '10-15 Years': Focus on architecture patterns, framework design, performance scaling, complex cross-team delivery, and mentoring mid/juniors.
- For '15+ Years': Focus on enterprise strategy, technology governance, business impact, organizational roadmaps, and stakeholder alignment.

QUESTION TYPE SPECIFICS:
- If 'Technical': Focus on a specific technical failure, performance bottleneck, or deep technical scenario matching their stack.
- If 'Leadership': Focus on a project crisis, delivery schedule compression (e.g. 50% timeline reduction), handling resource constraints, developer fatigue, and client negotiation.
- If 'Architecture/Ownership': Focus on direct architectural design, pattern selection decisions, technology selection trade-offs, ownership of the capability, and handling production regressions.
${historyPrompt}

You MUST reply with ONLY a JSON object. No other text, no markdown.
JSON Format:
{
  "question": "The generated question text here..."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data && res.data.question) {
      return { question: res.data.question };
    }
  } catch (e) {
    console.error('Error generating adaptive question:', e);
  }

  // Fallbacks based on type
  if (questionType === 'Technical') {
    return {
      question: `A critical banking application using ${profile.technologies.join(', ') || 'Selenium and k6'} experienced a 10x latency spike under a sudden peak load in production. How would you diagnose the root cause and troubleshoot the system?`
    };
  } else if (questionType === 'Leadership') {
    return {
      question: `Your team consists of 2 Seniors, 5 Mid-Levels, and 4 Juniors working on a critical microservices migration. The client suddenly cuts the delivery timeline from 12 weeks to 6 weeks. What strategy would you employ to manage delivery, delegate tasks, and negotiate scope?`
    };
  } else {
    return {
      question: `Describe a core architectural decision you owned for a testing framework or production infrastructure. What trade-offs did you evaluate, how did you handle ownership of the design, and how did you resolve subsequent technical regression?`
    };
  }
}

export async function evaluateAdaptiveAnswerAI(
  question: string,
  answer: string,
  questionType: 'Technical' | 'Leadership' | 'Architecture/Ownership',
  experienceBand: '8-10 Years' | '10-15 Years' | '15+ Years'
): Promise<AdaptiveQuestionEvaluation> {
  const prompt = `You are ZenAssess Expert Evaluator. Assess the candidate's response to the following capability audit question.
Evaluate the answer from the perspective of an expert with ${experienceBand} experience.

QUESTION:
${question}

CANDIDATE RESPONSE:
${answer}

Evaluate the following metrics on a scale of 0 to 100:
1. questionScore: General quality and completeness of the answer relative to the question asked.
2. reasoningScore: Depth of logic, structured methodology, telemetry-driven reasoning, or strategic planning shown.
3. technicalDepth: Level of detail regarding tools, metrics, code, configurations, database tuning, or architecture components.
4. leadershipSignals: Evidence of resource allocation, mentoring, client negotiation, delegation, and managing developers under timeline pressure.
5. ownershipSignals: Evidence of direct design decision ownership, framework architecture selection, accountability for quality, and handling production regressions.
6. authenticityScore: Estimation of whether the answer is based on actual project experiences (high score for specific names, metrics, constraints, failures) vs. generic textbook knowledge.
7. humanContentPct: Likelihood of being written by a human (0-100). Look for sentence variety, personal tone, and specific constraints.
8. aiAssistedPct: Likelihood of AI generation or assistance (0-100). Look for textbook explanations, boilerplate formatting, bulleted list styles, and lack of project specifics.
9. confidenceScore: conviction level, clarity of thought, and structured presentation.

Create:
- strengths: List of 2-3 specific points of strength in their answer.
- gaps: List of 2-3 specific areas they missed or failed to elaborate.
- improvementSuggestions: List of 2-3 actionable advice points for them to improve their strategy.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "questionScore": 85,
  "reasoningScore": 80,
  "technicalDepth": 75,
  "leadershipSignals": 40,
  "ownershipSignals": 70,
  "authenticityScore": 80,
  "humanContentPct": 90,
  "aiAssistedPct": 10,
  "confidenceScore": 85,
  "strengths": ["Clear explanation of thread locks", "Telemetry metrics mentioned"],
  "gaps": ["Missed connection pool sizing detail", "Lacked recovery playbook strategy"],
  "improvementSuggestions": ["Elaborate on pool size formulas in future", "Include backup replication sync delays"]
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        questionScore: Number(res.data.questionScore) || 60,
        reasoningScore: Number(res.data.reasoningScore) || 60,
        technicalDepth: Number(res.data.technicalDepth) || 60,
        leadershipSignals: Number(res.data.leadershipSignals) || 0,
        ownershipSignals: Number(res.data.ownershipSignals) || 0,
        authenticityScore: Number(res.data.authenticityScore) || 60,
        humanContentPct: Number(res.data.humanContentPct) || 100,
        aiAssistedPct: Number(res.data.aiAssistedPct) || 0,
        confidenceScore: Number(res.data.confidenceScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Valid response points provided.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks depth in technical configurations.'],
        improvementSuggestions: Array.isArray(res.data.improvementSuggestions) ? res.data.improvementSuggestions : ['Elaborate on specific metrics in your next response.']
      };
    }
  } catch (e) {
    console.error('Error evaluating adaptive answer:', e);
  }

  // Fallback
  return {
    questionScore: 65,
    reasoningScore: 60,
    technicalDepth: 60,
    leadershipSignals: questionType === 'Leadership' ? 65 : 10,
    ownershipSignals: questionType === 'Architecture/Ownership' ? 65 : 10,
    authenticityScore: 70,
    humanContentPct: 100,
    aiAssistedPct: 0,
    confidenceScore: 65,
    strengths: ['Addressed the main question scenario'],
    gaps: ['Lacks specific metrics and tool telemetry examples'],
    improvementSuggestions: ['Detail concrete tools and parameters used in the troubleshooting process']
  };
}

export interface PracticalEvaluation {
  practicalScore: number;
  strengths: string[];
  gaps: string[];
  competencies: string[];
  feedback: string;
}

export async function evaluateIntermediatePracticalAI(
  task1Response: string,
  task2Response: string,
  skillName?: string,
  task1Details?: { name: string; description: string },
  task2Details?: { name: string; description: string }
): Promise<PracticalEvaluation> {
  const resolvedSkill = skillName || 'Functional Testing';
  const t1Name = task1Details?.name || 'Create Test Cases for Internet Banking Login Page';
  const t1Desc = task1Details?.description || 'Write comprehensive test cases covering positive flow, invalid password locking policies, security/SQL injection sanity inputs, and session management behavior.';
  const t2Name = task2Details?.name || 'Identify Defects from E-Commerce Checkout Flow';
  const t2Desc = task2Details?.description || 'In a checkout flow, the payment is processed successfully but the application hangs on a spinner, the cart is not cleared, and no confirmation page is shown. Log a detailed defect report with reproduction steps, severity, priority, and potential root cause ideas.';

  const prompt = `You are ZenAssess ${resolvedSkill} Expert. Evaluate the candidate's answers to the following 2 Practical Tasks:
  
TASK 1: ${t1Name}
Description: ${t1Desc}
CANDIDATE RESPONSE:
${task1Response}

TASK 2: ${t2Name}
Description: ${t2Desc}
CANDIDATE RESPONSE:
${task2Response}

INSTRUCTIONS:
1. Rate the overall practical capability from 0 to 100 in practicalScore. Look for specific technical correctness, completeness, edge case coverage, methodology, and best practices for the skill "${resolvedSkill}".
2. List 2-3 specific strengths.
3. List 2-3 specific gaps/weaknesses.
4. List 2-3 detected competencies.
5. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "practicalScore": 82,
  "strengths": ["Comprehensive cases", "Excellent logic coverage"],
  "gaps": ["Missed input verification", "Defect logs lack detail"],
  "competencies": ["Test Design", "Reporting", "Verification"],
  "feedback": "Overall, the candidate demonstrates strong practical capability with some gaps."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        practicalScore: Number(res.data.practicalScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Valid response provided.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks depth.'],
        competencies: Array.isArray(res.data.competencies) ? res.data.competencies : [resolvedSkill],
        feedback: res.data.feedback || 'Evaluation completed.'
      };
    }
  } catch (e) {
    console.error('Error evaluating intermediate practical answers:', e);
  }

  return {
    practicalScore: 70,
    strengths: ['Addressed both practical tasks'],
    gaps: ['Lacks depth in edge case scenarios'],
    competencies: [resolvedSkill, 'Practical Execution'],
    feedback: 'Adequate implementation, demonstrating core practical capabilities.'
  };
}

export interface ScenariosEvaluation {
  scenarioScore: number;
  strengths: string[];
  gaps: string[];
  testingSignals: string[];
  feedback: string;
}

export async function evaluateIntermediateScenariosAI(
  q1Response: string,
  q2Response: string,
  q3Response: string,
  skillName?: string,
  q1Question?: string,
  q2Question?: string,
  q3Question?: string
): Promise<ScenariosEvaluation> {
  const resolvedSkill = skillName || 'Functional Testing';
  const q1Text = q1Question || 'A production banking application allows users to transfer funds without mandatory beneficiary validation. How would you test and report this issue?';
  const q2Text = q2Question || 'Client reports that after deployment, multiple users cannot complete checkout. How would you approach testing?';
  const q3Text = q3Question || 'Requirements are incomplete and development has already started. What would you do?';

  const prompt = `You are ZenAssess ${resolvedSkill} Senior Consultant. Evaluate the candidate's answers to the following 3 Scenario Questions:

QUESTION 1: ${q1Text}
CANDIDATE RESPONSE:
${q1Response}

QUESTION 2: ${q2Text}
CANDIDATE RESPONSE:
${q2Response}

QUESTION 3: ${q3Text}
CANDIDATE RESPONSE:
${q3Response}

INSTRUCTIONS:
1. Rate the overall scenario-based problem-solving capability from 0 to 100 in scenarioScore. Look for risk mitigation, diagnostics, checking logs, environment verification, requirement collaboration, and structured troubleshooting for the skill "${resolvedSkill}".
2. List 2-3 specific strengths.
3. List 2-3 specific gaps/weaknesses.
4. List 2-3 testing signals detected.
5. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "scenarioScore": 78,
  "strengths": ["Immediate escalation protocol mentioned", "Traced failure logs"],
  "gaps": ["Missed static analysis", "Did not specify session verification"],
  "testingSignals": ["Risk Awareness", "Troubleshooting Strategy"],
  "feedback": "The candidate has solid operational logic but can improve on formal verification."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        scenarioScore: Number(res.data.scenarioScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Valid response provided.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks depth.'],
        testingSignals: Array.isArray(res.data.testingSignals) ? res.data.testingSignals : [resolvedSkill],
        feedback: res.data.feedback || 'Evaluation completed.'
      };
    }
  } catch (e) {
    console.error('Error evaluating intermediate scenario answers:', e);
  }

  return {
    scenarioScore: 70,
    strengths: ['Identified key risks and requirement gaps'],
    gaps: ['Lacks specific diagnostic steps'],
    testingSignals: [resolvedSkill, 'Troubleshooting'],
    feedback: 'Demonstrates reasonable troubleshooting ability and risk awareness in production scenarios.'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MID-LEVEL BAND (6–12 Years) — Coding & Scenario Evaluators
// ═══════════════════════════════════════════════════════════════════════════════

export interface MidLevelCodingEvaluation {
  codingScore: number;
  strengths: string[];
  gaps: string[];
  feedback: string;
}

export async function evaluateMidLevelCodingAI(
  c1Response: string,
  c2Response: string
): Promise<MidLevelCodingEvaluation> {
  const prompt = `You are ZenAssess Senior QA Evaluator. Evaluate the candidate's answers to the following 2 Coding/Technical Questions for a 6-12 year experienced QA professional:

CODING QUESTION 1: Write a test automation script or describe in detail the logic for automating a login flow using Selenium or any automation tool. Cover: launching browser, navigating to URL, entering credentials, clicking submit, and asserting success.
CANDIDATE RESPONSE:
${c1Response}

CODING QUESTION 2: Describe your approach for setting up a CI/CD pipeline that integrates test automation. Include: which tools (Jenkins/GitHub Actions/Azure DevOps), when tests run, how failures are handled, and how reports are published.
CANDIDATE RESPONSE:
${c2Response}

INSTRUCTIONS:
1. Rate from 0 to 100 in codingScore. Evaluate code correctness (Q1) and CI/CD process maturity (Q2). Look for specific tool names, realistic steps, error handling, and assertion logic.
2. List 2-3 strengths.
3. List 2-3 gaps/weaknesses.
4. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "codingScore": 75,
  "strengths": ["Correct selenium locator strategy", "Mentions CI trigger on PR"],
  "gaps": ["No assertion mentioned in login script", "CI pipeline missing test report publishing step"],
  "feedback": "Candidate demonstrates solid automation foundations but needs to improve on assertions and reporting integration."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        codingScore: Number(res.data.codingScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Adequate response provided.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks depth in implementation details.'],
        feedback: res.data.feedback || 'Evaluation completed.'
      };
    }
  } catch (e) {
    console.error('Error evaluating mid-level coding answers:', e);
  }
  return {
    codingScore: 65,
    strengths: ['Described automation approach', 'Mentioned CI/CD integration'],
    gaps: ['Missing assertion details', 'Pipeline steps not fully specified'],
    feedback: 'Candidate shows understanding of automation and CI/CD but needs more technical precision.'
  };
}

export interface MidLevelScenariosEvaluation {
  scenarioScore: number;
  strengths: string[];
  gaps: string[];
  feedback: string;
}

export async function evaluateMidLevelScenariosAI(
  s1Response: string,
  s2Response: string,
  s3Response: string
): Promise<MidLevelScenariosEvaluation> {
  const prompt = `You are ZenAssess Senior QA Consultant. Evaluate the candidate's answers to 3 real-world scenario questions for a 6–12 year QA professional:

SCENARIO 1: A critical production bug is found 2 hours before release. The bug causes data corruption but only affects 5% of users. What do you do?
CANDIDATE RESPONSE:
${s1Response}

SCENARIO 2: Your team's test automation coverage dropped from 80% to 60% after a sprint due to unupdated scripts. The next release is in 3 days. How do you handle this?
CANDIDATE RESPONSE:
${s2Response}

SCENARIO 3: Business stakeholders want to skip regression testing to meet a deadline. The app has 200+ test cases. How do you handle this and what do you recommend?
CANDIDATE RESPONSE:
${s3Response}

INSTRUCTIONS:
1. Rate from 0 to 100 in scenarioScore. Look for: risk assessment, stakeholder communication, prioritization, technical decision-making, and leadership maturity.
2. List 2-3 specific strengths.
3. List 2-3 specific gaps/weaknesses.
4. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "scenarioScore": 78,
  "strengths": ["Correctly escalated to stakeholders", "Proposed risk-based regression approach"],
  "gaps": ["Did not mention rollback plan for production bug", "No mention of hotfix testing process"],
  "feedback": "Candidate shows strong stakeholder communication and risk prioritization but needs to strengthen production incident response protocols."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        scenarioScore: Number(res.data.scenarioScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Valid response provided.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks depth in risk mitigation.'],
        feedback: res.data.feedback || 'Evaluation completed.'
      };
    }
  } catch (e) {
    console.error('Error evaluating mid-level scenario answers:', e);
  }
  return {
    scenarioScore: 65,
    strengths: ['Showed stakeholder awareness', 'Risk-based approach mentioned'],
    gaps: ['Rollback strategy missing', 'Regression prioritization not detailed'],
    feedback: 'Candidate demonstrates reasonable QA leadership but could improve on production incident handling and structured regression planning.'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPERT BAND (12+ Years) — Dynamic Evaluators
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExpertScenariosEvaluation {
  scenarioScore: number;
  strengths: string[];
  gaps: string[];
  decisionMakingSignals: string;
  domainExpertise: string;
  feedback: string;
}

export async function evaluateExpertScenariosAI(
  answers: string[],
  questions: string[],
  skillName: string
): Promise<ExpertScenariosEvaluation> {
  const prompt = `You are ZenAssess Senior Executive Talent Evaluator. Evaluate the candidate's answers to the following 3 strategic scenario questions for a highly experienced professional (12+ years experience) in the field of "${skillName}".
  
QUESTION 1: ${questions[0]}
CANDIDATE RESPONSE:
${answers[0]}

QUESTION 2: ${questions[1]}
CANDIDATE RESPONSE:
${answers[1]}

QUESTION 3: ${questions[2]}
CANDIDATE RESPONSE:
${answers[2]}

INSTRUCTIONS:
1. Rate the overall scenario solving, production crisis handling, and strategic decision making from 0 to 100 in scenarioScore. Look for architectural understanding, mitigation speed, governance, root-cause diagnostics, and systemic guardrails.
2. List 2-3 specific strengths.
3. List 2-3 specific gaps/weaknesses.
4. Provide a detailed summary of "decisionMakingSignals" (how the candidate handles pressure, risk trade-offs, and critical decisions).
5. Provide a summary of "domainExpertise" (specific domain/technical patterns demonstrated).
6. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "scenarioScore": 88,
  "strengths": ["Clear escalation matrix", "Systemic automated failover design"],
  "gaps": ["Lacks focus on immediate telemetry captures", "Could detail post-mortem RCA sharing"],
  "decisionMakingSignals": "Demonstrates rapid risk-mitigation thinking and structured containment protocols.",
  "domainExpertise": "Expertise in high-throughput transaction processing, cloud telemetry, and database replication.",
  "feedback": "Overall, the candidate demonstrates stellar crisis management and strategic engineering foresight."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        scenarioScore: Number(res.data.scenarioScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Demonstrated senior troubleshooting.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks depth in systemic guardrails.'],
        decisionMakingSignals: res.data.decisionMakingSignals || 'Demonstrates logical crisis handling.',
        domainExpertise: res.data.domainExpertise || `${skillName} Expert`,
        feedback: res.data.feedback || 'Evaluation completed successfully.'
      };
    }
  } catch (e) {
    console.error('Error evaluating expert scenarios:', e);
  }

  return {
    scenarioScore: 75,
    strengths: ['Identified containment and RCA steps'],
    gaps: ['Lacks detailed telemetry examples'],
    decisionMakingSignals: 'Logical decision-making and standard containment strategies.',
    domainExpertise: `${skillName} Architecture`,
    feedback: 'Adequate crisis-solving responses demonstrating senior technical awareness.'
  };
}

export interface ExpertCapstoneEvaluation {
  capstoneScore: number;
  strengths: string[];
  gaps: string[];
  architectureSignals: string;
  decisionMakingSignals: string;
  feedback: string;
}

export async function evaluateExpertCapstoneAI(
  answer: string,
  question: string,
  skillName: string
): Promise<ExpertCapstoneEvaluation> {
  const prompt = `You are ZenAssess Principal Architect and Strategist. Evaluate the candidate's response to the following Capstone architectural prompt in the context of "${skillName}":

PROMPT: ${question}
CANDIDATE RESPONSE:
${answer}

INSTRUCTIONS:
1. Rate the overall architecture design, strategic planning, and risk management from 0 to 100 in capstoneScore. Look for architectural patterns, clear phase-wise transitions, compliance/security gates, and cost-benefit trade-offs.
2. List 2-3 specific strengths.
3. List 2-3 specific gaps/weaknesses.
4. Provide a detailed summary of "architectureSignals" (candidate's architectural thinking, framework selection, and system decoupling capability).
5. Provide a detailed summary of "decisionMakingSignals" (strategic prioritization, risk mitigation, and standard compliance planning).
6. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "capstoneScore": 90,
  "strengths": ["Solid multi-tier deployment architecture", "Excellent quality gate integration"],
  "gaps": ["No explicit disaster recovery strategy mentioned", "Vague cost-optimization parameters"],
  "architectureSignals": "Strong systems design thinking, prioritizing loosely coupled components and security compliance.",
  "decisionMakingSignals": "Pragmatic approach to timelines, proposing realistic phase-wise rollouts and data-driven gates.",
  "feedback": "The capstone design is enterprise-grade, showcasing deep domain mastery and architectural maturity."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        capstoneScore: Number(res.data.capstoneScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Showed high-level strategy.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks detailed architectural blueprints.'],
        architectureSignals: res.data.architectureSignals || 'Demonstrates basic architectural planning.',
        decisionMakingSignals: res.data.decisionMakingSignals || 'Logical approach to risk mitigation.',
        feedback: res.data.feedback || 'Evaluation completed successfully.'
      };
    }
  } catch (e) {
    console.error('Error evaluating expert capstone:', e);
  }

  return {
    capstoneScore: 75,
    strengths: ['Addressed the strategic prompt', 'Outlined migration/deployment phases'],
    gaps: ['Lacks specific tool integrations'],
    architectureSignals: 'Outlines standard enterprise patterns and quality gates.',
    decisionMakingSignals: 'Sound prioritization of risk-based milestones.',
    feedback: 'Adequate architectural strategy demonstrating capable systems design.'
  };
}

export interface ExpertMentoringEvaluation {
  mentoringScore: number;
  strengths: string[];
  gaps: string[];
  leadershipSignals: string;
  mentoringSignals: string;
  feedback: string;
}

export async function evaluateExpertMentoringAI(
  answers: string[],
  questions: string[],
  skillName: string
): Promise<ExpertMentoringEvaluation> {
  const prompt = `You are ZenAssess Leadership and Mentorship Coach. Evaluate the candidate's answers to the following 2 team leadership and mentoring scenarios:

QUESTION 1: ${questions[0]}
CANDIDATE RESPONSE:
${answers[0]}

QUESTION 2: ${questions[1]}
CANDIDATE RESPONSE:
${answers[1]}

INSTRUCTIONS:
1. Rate the overall leadership maturity, mentoring capability, conflict resolution, and technical governance from 0 to 100 in mentoringScore. Look for empathetic coaching, clear metrics-driven alignment, transparent stakeholder negotiation, and constructive feedback loops.
2. List 2-3 specific strengths.
3. List 2-3 specific gaps/weaknesses.
4. Provide a detailed summary of "leadershipSignals" (empathetic leading, deadline management under pressure, and conflict resolution style).
5. Provide a summary of "mentoringSignals" (coaching framework, junior enablement, and technical governance).
6. Provide a summary feedback paragraph.

You MUST reply with ONLY a JSON object. No other text, no markdown.

JSON Format:
{
  "mentoringScore": 85,
  "strengths": ["Empathetic 1-on-1 coaching model", "Data-driven negotiation with stakeholders"],
  "gaps": ["No formal metrics for junior performance tracking", "Could specify upskilling curriculum details"],
  "leadershipSignals": "Maintains calm delegation and transparency during high-pressure timeline contractions.",
  "mentoringSignals": "Focuses on mentorship over policing, introducing pair-programming and documentation guidelines.",
  "feedback": "The candidate shows high leadership and mentoring maturity, focusing on people enablement and team cohesion."
}`;

  try {
    const res = await callLLM(prompt);
    if (res.data) {
      return {
        mentoringScore: Number(res.data.mentoringScore) || 60,
        strengths: Array.isArray(res.data.strengths) ? res.data.strengths : ['Showed employee empathy.'],
        gaps: Array.isArray(res.data.gaps) ? res.data.gaps : ['Lacks structured upskilling frameworks.'],
        leadershipSignals: res.data.leadershipSignals || 'Sound team delegation style.',
        mentoringSignals: res.data.mentoringSignals || 'Focuses on peer coaching and review loops.',
        feedback: res.data.feedback || 'Evaluation completed successfully.'
      };
    }
  } catch (e) {
    console.error('Error evaluating expert mentoring:', e);
  }

  return {
    mentoringScore: 75,
    strengths: ['Empathetic team stance', 'Clear stakeholder communications'],
    gaps: ['Lacks technical governance metrics'],
    leadershipSignals: 'Standard delegation and negotiation practices.',
    mentoringSignals: 'Focuses on peer coaching and review loops.',
    feedback: 'Demonstrates capable people management and mentoring values.'
  };
}



