/**
 * ollamaExpertEngine.ts — ZenAssess Ollama Conversational Expert Validation Engine
 * 
 * Contains Ollama prompt calls and offline fallbacks for:
 * 1. Resume AI Profile Extraction
 * 2. Adaptive Follow-Up Question Generation
 * 3. Granular Signal & Score Evaluation
 */

import { OLLAMA_BASE } from './config';

export interface ExtractedProfile {
  skills: string[];
  projects: Array<{
    name: string;
    role: string;
    description: string;
  }>;
  certifications: string[];
  domains: string[];
}

export interface SignalDetails {
  score: number;
  details: string;
}

export interface ExtractedSignals {
  technicalCapability: SignalDetails;
  leadershipCapability: SignalDetails;
  ownership: SignalDetails;
  domainExpertise: SignalDetails;
  mentoringSignals: SignalDetails;
  communicationQuality: SignalDetails;
  projectAuthenticity: SignalDetails;
  decisionMaking: SignalDetails;
  riskManagement: SignalDetails;
  stakeholderManagement: SignalDetails;
  deliveryOwnership: SignalDetails;
}

export interface IntelligenceScores {
  capabilityScore: number;
  leadershipScore: number;
  ownershipScore: number;
  domainScore: number;
  mentoringScore: number;
  communicationScore: number;
  projectConfidence: number;
  workforceAllocationConfidence: number;
}

export interface SignalEvaluationReport {
  signals: ExtractedSignals;
  scores: IntelligenceScores;
}

// Mock templates for instant developer testing
export const MOCK_TEMPLATES: Record<string, ExtractedProfile> = {
  banking_qa: {
    skills: ['Functional Testing', 'API Testing', 'SQL', 'Agile Methodologies', 'JMeter', 'Selenium'],
    projects: [
      {
        name: 'Core Banking Migration',
        role: 'Lead QA Architect',
        description: 'Led end-to-end migration of core ledger system with zero downtime and automated regression suites.'
      }
    ],
    certifications: ['ISTQB Advanced Test Analyst', 'Certified Scrum Master (CSM)'],
    domains: ['Banking', 'Core Banking', 'Loan Processing', 'Cards & Payments']
  },
  cloud_arch: {
    skills: ['Cloud Architecture', 'AWS', 'Terraform', 'Kubernetes', 'CI/CD Pipelines', 'Docker'],
    projects: [
      {
        name: 'BFSI Cloud Orchestration',
        role: 'Principal DevOps Architect',
        description: 'Designed high-availability infrastructure on AWS with automated deployment and containerization.'
      }
    ],
    certifications: ['AWS Certified Solutions Architect - Professional', 'HashiCorp Certified Terraform Associate'],
    domains: ['Cloud Computing', 'Financial Services (BFSI)', 'Infrastructure as Code (IaC)']
  },
  custom: {
    skills: ['Functional Testing', 'Manual QA', 'Defect Management', 'Software Quality Assurance'],
    projects: [
      {
        name: 'Enterprise Billing Portal',
        role: 'Senior QA Engineer',
        description: 'Managed testing and test case creation for billing integrations and third-party gateways.'
      }
    ],
    certifications: ['ISTQB Foundation Level'],
    domains: ['E-commerce', 'Billing Services']
  }
};

/**
 * Helper to call local Ollama generate API
 */
async function callOllamaGenerate(model: string, prompt: string, maxTokens = 1500): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout for fast UI responsiveness

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: maxTokens,
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Ollama HTTP Error: ${res.status}`);
    }

    const data = await res.json();
    return (data.response || '') as string;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * 1. AI Profile Extraction
 */
export async function extractExpertProfileData(
  resumeText: string,
  modelName: string,
  templateKey?: string
): Promise<ExtractedProfile> {
  // Use mock template if requested
  if (templateKey && MOCK_TEMPLATES[templateKey]) {
    return MOCK_TEMPLATES[templateKey];
  }

  if (!resumeText.trim()) {
    return MOCK_TEMPLATES.custom;
  }

  const prompt = `Analyze this resume and extract specific technical skills, projects, certifications, and primary domains.
  
Resume Text:
${resumeText.slice(0, 3000)}

You MUST reply with ONLY a JSON object (no markdown, no explanations) matching this exact format:
{
  "skills": ["Skill 1", "Skill 2"],
  "projects": [
    {
      "name": "Project Name",
      "role": "Role Name",
      "description": "Short project description"
    }
  ],
  "certifications": ["Cert 1", "Cert 2"],
  "domains": ["Domain 1", "Domain 2"]
}
`;

  try {
    const raw = await callOllamaGenerate(modelName, prompt, 800);
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON structure');
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      domains: Array.isArray(parsed.domains) ? parsed.domains : []
    };
  } catch (e) {
    console.warn('[Ollama] extractExpertProfileData failed, using fallback custom template:', e);
    // Simple custom fallback extraction via regex
    const skills: string[] = [];
    if (/selenium/i.test(resumeText)) skills.push('Selenium');
    if (/functional testing/i.test(resumeText)) skills.push('Functional Testing');
    if (/java/i.test(resumeText)) skills.push('Java');
    if (/sql/i.test(resumeText)) skills.push('SQL');
    if (/istqb/i.test(resumeText)) skills.push('ISTQB Certification');
    
    return {
      skills: skills.length > 0 ? skills : MOCK_TEMPLATES.custom.skills,
      projects: MOCK_TEMPLATES.custom.projects,
      certifications: MOCK_TEMPLATES.custom.certifications,
      domains: MOCK_TEMPLATES.custom.domains
    };
  }
}

/**
 * 2. Adaptive Follow-Up Question Generation
 */
export async function generateOllamaFollowUp(
  modelName: string,
  coreQuestion: string,
  candidateAnswer: string,
  extractedProfile: ExtractedProfile
): Promise<string> {
  const prompt = `You are an elite technical interviewer conducting a conversational validation assessment.
The candidate was asked this question:
"${coreQuestion}"

They provided this response:
"${candidateAnswer}"

Candidate Profile:
- Skills: ${extractedProfile.skills.join(', ')}
- Projects: ${extractedProfile.projects.map(p => p.name).join(', ')}
- Domains: ${extractedProfile.domains.join(', ')}

Your task is to ask a highly specific, direct follow-up question (containing 2-3 specific sub-questions) that drills down into technical details, choices, tools used, metrics, or lessons learned. Do NOT ask generic questions. Be professional, concise, and direct. Max 2 sentences.
`;

  try {
    const raw = await callOllamaGenerate(modelName, prompt, 350);
    return raw.trim() || generateFallbackFollowUp(coreQuestion, candidateAnswer);
  } catch (e) {
    console.warn('[Ollama] generateOllamaFollowUp failed, using fallback:', e);
    return generateFallbackFollowUp(coreQuestion, candidateAnswer);
  }
}

/**
 * Fallback Follow-up Generator
 */
function generateFallbackFollowUp(question: string, answer: string): string {
  const lc = answer.toLowerCase();
  
  if (question.includes('Core Banking') || question.includes('project')) {
    if (lc.includes('defect') || lc.includes('bug')) {
      return "What type of defects did you handle? How did you identify the root cause, and what tools did you use to trace them?";
    }
    if (lc.includes('automation') || lc.includes('test')) {
      return "What automation framework pattern did you choose? How did you manage test data and minimize flaky test runs?";
    }
    if (lc.includes('migration') || lc.includes('db')) {
      return "How did you manage schema migrations? What validation steps ensured zero data loss during parallel runs?";
    }
    return "What specific technology stack did you implement, and how did you measure overall test coverage and project quality metrics?";
  }
  
  if (question.includes('role')) {
    if (lc.includes('lead') || lc.includes('architect') || lc.includes('manage')) {
      return "What governance models or QA gates did you enforce? How did you align with cross-functional release leads?";
    }
    return "How did you collaborate with business analysts and developers? What was your approach to story signing off and verification?";
  }
  
  if (question.includes('challenge')) {
    if (lc.includes('outage') || lc.includes('performance') || lc.includes('leak')) {
      return "What immediate metrics or monitoring alarms triggered? What diagnostic profiling tools did you use to pinpoint the issue?";
    }
    return "What were the immediate systems impacted, and how did you implement temporary containment before resolving the root cause?";
  }
  
  if (question.includes('solve')) {
    return "How did you validate this solution under high-concurrency stress? What permanent architectural guardrails did you put in place?";
  }
  
  if (question.includes('mentor')) {
    if (lc.includes('no') || lc.includes('none')) {
      return "How do you share technical knowledge or standards with peers? Do you document best practices or code reviews?";
    }
    return "What specific technical competencies did they develop under your guidance? How did you verify their execution readiness?";
  }
  
  if (question.includes('achievement')) {
    return "What direct business value or SLA savings did this achievement deliver? How did you represent this success to senior leadership?";
  }

  return "Could you provide specific technical metrics and tool details that support your response? What was the final business impact?";
}

/**
 * 3. Signal Extraction & Score Evaluation
 */
export async function evaluateExpertConversationSignals(
  modelName: string,
  conversationLog: Array<{ sender: 'ai' | 'user'; text: string; isFollowup?: boolean }>,
  profileData: ExtractedProfile
): Promise<SignalEvaluationReport> {
  const chatTranscript = conversationLog
    .map(c => `${c.sender.toUpperCase()}: ${c.text}`)
    .join('\n\n');

  const prompt = `You are the ZenAssess Workforce Intelligence Evaluation Engine. Review the following technical conversation between the AI and a senior candidate, along with their extracted profile.
  
Candidate Profile:
- Skills: ${profileData.skills.join(', ')}
- Projects: ${profileData.projects.map(p => p.name).join(', ')}
- Domains: ${profileData.domains.join(', ')}

Conversation Log:
${chatTranscript}

You MUST evaluate the candidate on 11 signal dimensions and compute 8 quantitative workforce intelligence scores.
Dimensions (Score 0-100 and brief justification based on conversation signals):
1. Technical Capability
2. Leadership Capability
3. Ownership
4. Domain Expertise
5. Mentoring Signals
6. Communication Quality
7. Project Authenticity
8. Decision Making
9. Risk Management
10. Stakeholder Management
11. Delivery Ownership

Scores:
- capabilityScore (0-100)
- leadershipScore (0-100)
- ownershipScore (0-100)
- domainScore (0-100)
- mentoringScore (0-100)
- communicationScore (0-100)
- projectConfidence (0-100)
- workforceAllocationConfidence (0-100)

You MUST respond ONLY with a JSON object in this format (no markdown, no other text):
{
  "signals": {
    "technicalCapability": { "score": 85, "details": "justification details" },
    "leadershipCapability": { "score": 75, "details": "justification details" },
    "ownership": { "score": 80, "details": "justification details" },
    "domainExpertise": { "score": 90, "details": "justification details" },
    "mentoringSignals": { "score": 70, "details": "justification details" },
    "communicationQuality": { "score": 85, "details": "justification details" },
    "projectAuthenticity": { "score": 95, "details": "justification details" },
    "decisionMaking": { "score": 80, "details": "justification details" },
    "riskManagement": { "score": 75, "details": "justification details" },
    "stakeholderManagement": { "score": 80, "details": "justification details" },
    "deliveryOwnership": { "score": 85, "details": "justification details" }
  },
  "scores": {
    "capabilityScore": 85,
    "leadershipScore": 75,
    "ownershipScore": 80,
    "domainScore": 90,
    "mentoringScore": 70,
    "communicationScore": 85,
    "projectConfidence": 95,
    "workforceAllocationConfidence": 88
  }
}
`;

  try {
    const raw = await callOllamaGenerate(modelName, prompt, 1500);
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON structure');
    return JSON.parse(jsonMatch[0]) as SignalEvaluationReport;
  } catch (e) {
    console.warn('[Ollama] evaluateExpertConversationSignals failed, using fallback scoring engine:', e);
    return generateFallbackSignals(conversationLog);
  }
}

/**
 * Fallback Scorer (Rule-based heuristic evaluator)
 */
function generateFallbackSignals(
  log: Array<{ sender: 'ai' | 'user'; text: string; isFollowup?: boolean }>
): SignalEvaluationReport {
  const answers = log.filter(c => c.sender === 'user').map(c => c.text);
  const totalLength = answers.reduce((acc, text) => acc + text.length, 0);
  const avgLength = answers.length > 0 ? totalLength / answers.length : 0;

  // Simple heuristic scores based on answer detail and word count
  let baseScore = 65;
  if (avgLength > 150) baseScore = 88;
  else if (avgLength > 80) baseScore = 78;

  // Custom signals based on keywords in answers
  const fullText = answers.join(' ').toLowerCase();
  
  const hasMentoring = /mentor|train|junior|lead|review|guide|teach/i.test(fullText);
  const hasRisk = /risk|mitigate|prevent|backup|failover|contingency/i.test(fullText);
  const hasStakeholder = /stakeholder|client|manager|director|align|report/i.test(fullText);
  const hasDecision = /decide|choose|decision|architecture|pattern/i.test(fullText);

  const tcScore = baseScore + (fullText.match(/automation|database|framework|metrics|tool/g)?.length || 0) * 1.5;
  const lsScore = baseScore - (hasMentoring ? 0 : 10) + 4;
  const owScore = baseScore + 2;
  const dmScore = baseScore - (hasDecision ? 0 : 8) + 3;
  const mtScore = baseScore - (hasMentoring ? 0 : 15);
  const commScore = Math.min(95, baseScore + (avgLength > 120 ? 5 : 0));
  const paScore = Math.min(98, baseScore + (fullText.length > 300 ? 8 : 0));
  const rmScore = baseScore - (hasRisk ? 0 : 8) + 2;
  const smScore = baseScore - (hasStakeholder ? 0 : 6) + 3;
  const doScore = baseScore + 1;
  const domScore = baseScore + 5;

  const clamp = (val: number) => Math.max(40, Math.min(98, Math.round(val)));

  return {
    signals: {
      technicalCapability: {
        score: clamp(tcScore),
        details: tcScore > 80 
          ? "Demonstrated comprehensive technical experience, detailing tools, architecture principles, and framework designs."
          : "Exhibited moderate familiarity with standard testing methods and frameworks; details could be deepened."
      },
      leadershipCapability: {
        score: clamp(lsScore),
        details: lsScore > 80
          ? "Showed robust qualities in directing engineering efforts and aligning cross-functional teams."
          : "Focused more on individual delivery tasks; direct architectural governance signals were limited."
      },
      ownership: {
        score: clamp(owScore),
        details: "Assumed direct accountability for end-to-end releases and system stability."
      },
      domainExpertise: {
        score: clamp(domScore),
        details: "Exhibited deep knowledge of business rules, system integrations, and functional flows."
      },
      mentoringSignals: {
        score: clamp(mtScore),
        details: hasMentoring
          ? "Actively engaged in training junior team members, facilitating peer code reviews and knowledge transfers."
          : "Mentorship indicators were sparse; primarily focused on core personal deliverables."
      },
      communicationQuality: {
        score: clamp(commScore),
        details: commScore > 80
          ? "Expressed ideas articulately with structured technical reasoning and professional tone."
          : "Responses are concise but occasionally lack thorough technical structure and depth."
      },
      projectAuthenticity: {
        score: clamp(paScore),
        details: "Project context is consistent, referencing realistic enterprise workflows and integration limits."
      },
      decisionMaking: {
        score: clamp(dmScore),
        details: hasDecision
          ? "Detailed clear architectural choices and tradeoffs made under technical constraints."
          : "Decisions were guided heavily by existing patterns, showing limited trade-off analysis."
      },
      riskManagement: {
        score: clamp(rmScore),
        details: hasRisk
          ? "Documented active risks and detailed mitigation frameworks, rollbacks, and monitors."
          : "Ad-hoc approach to risk; containment strategies were reactive rather than proactive."
      },
      stakeholderManagement: {
        score: clamp(smScore),
        details: hasStakeholder
          ? "Proactively managed client expectations and coordinated deliverables with managers."
          : "Limited direct stakeholder management signals; interaction focused mostly on developer peers."
      },
      deliveryOwnership: {
        score: clamp(doScore),
        details: "Maintained strong focus on meeting SLAs, quality milestones, and driving release pipelines."
      }
    },
    scores: {
      capabilityScore: clamp(tcScore),
      leadershipScore: clamp(lsScore),
      ownershipScore: clamp(owScore),
      domainScore: clamp(domScore),
      mentoringScore: clamp(mtScore),
      communicationScore: clamp(commScore),
      projectConfidence: clamp(paScore),
      workforceAllocationConfidence: clamp((tcScore * 0.3 + domScore * 0.2 + lsScore * 0.15 + owScore * 0.15 + commScore * 0.1 + mtScore * 0.1))
    }
  };
}
