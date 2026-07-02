import { SCORING_KEYWORDS } from '../data/scoringKeywords';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McqAnswer { questionId: string; selected: number; correct: number }
export interface ToolIdAnswer { questionIdx: number; answer: string; keywords: string[] }
export interface PracticalAnswer { answer: string; expectedKeywords: string[]; minLength: number }
export interface CodingResult { visiblePassed: number; totalVisible: number; hiddenPassed: number; totalHidden: number }
export interface ScenarioAnswer { answer: string; skill: string }
export interface FrameworkAnswer { answer: string }
export interface CapstoneResult { score: number } // from evaluateGitHubRepo
export interface MentoringAnswer { answer: string }
export interface QuestionnaireAnswer { answer: string }

export interface BeginnerInput {
  skill: string;
  mcqAnswers: McqAnswer[];
  toolIdAnswers: ToolIdAnswer[];
  practicalAnswers: PracticalAnswer[];
}

export interface IntermediateInput {
  skill: string;
  mcqAnswers: McqAnswer[];
  codingResult: CodingResult;
  scenarioAnswers: ScenarioAnswer[];
  frameworkAnswer: FrameworkAnswer;
}

export interface ExpertInput {
  skill: string;
  scenarioAnswers: ScenarioAnswer[];
  capstoneScore: number;
  mentoringAnswers: MentoringAnswer[];
  questionnaireAnswers: QuestionnaireAnswer[];
  ollamaScores?: number[]; // per-scenario scores from Ollama if available
}

export interface ScoringBreakdown {
  finalScore: number;
  components: Record<string, number>;
  silentDropPath?: string;
  passed: boolean;
}

// ─── Word counter ─────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function containsKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase())).length;
}

// ─── BEGINNER SCORING ─────────────────────────────────────────────────────────

export function scoreBeginnerLevel(input: BeginnerInput): ScoringBreakdown {
  const { skill, mcqAnswers, toolIdAnswers, practicalAnswers } = input;

  // MCQ: negative marking (−0.5 per wrong, max 20 questions)
  const correct = mcqAnswers.filter(a => a.selected === a.correct).length;
  const wrong = mcqAnswers.filter(a => a.selected !== a.correct && a.selected >= 0).length;
  const raw = Math.max(0, correct - wrong * 0.5);
  const mcqPct = (raw / Math.max(mcqAnswers.length, 1)) * 100;

  // Tool ID: keyword matching
  const toolIdCorrect = toolIdAnswers.filter(a => {
    if (!a.answer || !a.keywords?.length) return false;
    const found = containsKeywords(a.answer, a.keywords);
    return found >= Math.ceil(a.keywords.length * 0.5);
  }).length;
  const toolIdPct = (toolIdCorrect / Math.max(toolIdAnswers.length, 1)) * 100;

  // Practical: keyword + length check per task
  const practicalScores = practicalAnswers.map(p => {
    if (!p.answer || p.answer.length < p.minLength) return 0;
    const found = containsKeywords(p.answer, p.expectedKeywords);
    return found / Math.max(p.expectedKeywords.length, 1);
  });
  const practicalPct = (practicalScores.reduce((a, b) => a + b, 0) / Math.max(practicalScores.length, 1)) * 100;

  const finalScore = mcqPct * 0.50 + toolIdPct * 0.20 + practicalPct * 0.30;

  return {
    finalScore: Math.round(finalScore * 10) / 10,
    components: {
      mcqScore: Math.round(mcqPct),
      toolIdScore: Math.round(toolIdPct),
      practicalScore: Math.round(practicalPct),
    },
    passed: finalScore >= 60,
  };
}

// ─── INTERMEDIATE SCORING ─────────────────────────────────────────────────────

export function scoreIntermediateLevel(input: IntermediateInput): ScoringBreakdown {
  const { skill, mcqAnswers, codingResult, scenarioAnswers, frameworkAnswer } = input;
  const kw = SCORING_KEYWORDS[skill];

  // MCQ: same formula, 15 questions
  const correct = mcqAnswers.filter(a => a.selected === a.correct).length;
  const wrong = mcqAnswers.filter(a => a.selected !== a.correct && a.selected >= 0).length;
  const raw = Math.max(0, correct - wrong * 0.5);
  const mcqPct = (raw / Math.max(mcqAnswers.length, 1)) * 100;

  // Coding: visible + hidden weighted
  const { visiblePassed, totalVisible, hiddenPassed, totalHidden } = codingResult;
  const visiblePct = totalVisible > 0 ? visiblePassed / totalVisible : 0;
  const hiddenPct = totalHidden > 0 ? hiddenPassed / totalHidden : 0;
  const codingPct = (visiblePct * 0.5 + hiddenPct * 0.5) * 100;

  // Scenarios: word count + domain keywords
  const scenarioKws = kw?.intermediate?.scenario || [];
  const scenarioScores = scenarioAnswers.map(s => {
    const wc = wordCount(s.answer);
    const kwFound = containsKeywords(s.answer, scenarioKws);
    const wcScore = Math.min(wc / 50, 1) * 40;
    const kwScore = Math.min(kwFound / 3, 1) * 60;
    return wcScore + kwScore;
  });
  const scenarioPct = scenarioScores.reduce((a, b) => a + b, 0) / Math.max(scenarioScores.length, 1);

  // Framework: architecture terms + components + length
  const frameworkKws = kw?.intermediate?.framework || [];
  const fwWc = wordCount(frameworkAnswer.answer);
  const fwKwFound = containsKeywords(frameworkAnswer.answer, frameworkKws);
  const archTerms = ['architecture','component','layer','module','pattern','structure','design','flow','dependency','interface'];
  const archFound = containsKeywords(frameworkAnswer.answer, archTerms);
  const fwScore = Math.min(archFound / 3, 1) * 40 + Math.min(fwKwFound / 3, 1) * 30 + Math.min(fwWc / 100, 1) * 30;

  const finalScore = mcqPct * 0.20 + codingPct * 0.35 + scenarioPct * 0.30 + fwScore * 0.15;

  return {
    finalScore: Math.round(finalScore * 10) / 10,
    components: {
      mcqScore: Math.round(mcqPct),
      codingScore: Math.round(codingPct),
      scenarioScore: Math.round(scenarioPct),
      frameworkScore: Math.round(fwScore),
    },
    passed: finalScore >= 65,
  };
}

// ─── EXPERT SCORING ───────────────────────────────────────────────────────────

export function scoreExpertLevel(input: ExpertInput): ScoringBreakdown {
  const { skill, scenarioAnswers, capstoneScore, mentoringAnswers, questionnaireAnswers, ollamaScores } = input;
  const kw = SCORING_KEYWORDS[skill];
  const expertKws = kw?.expert?.scenario || [];
  const mentoringKws = kw?.expert?.mentoring || ['guide','mentor','team','practice','review','teach','coach','support','feedback','growth'];
  const questionnaireKws = kw?.expert?.questionnaire || ['technical','domain','architecture','design','strategy','experience','approach','decision'];

  // Scenario: use Ollama scores if available, else keyword heuristic
  const scenarioScores = scenarioAnswers.map((s, i) => {
    if (ollamaScores && ollamaScores[i] !== undefined) {
      return ollamaScores[i];
    }
    const wc = wordCount(s.answer);
    const kwFound = containsKeywords(s.answer, expertKws);
    // Structured response: contains numbered list or bullet points
    const isStructured = /(\d\.|•|-)\s/.test(s.answer) ? 30 : 0;
    const wcScore = Math.min(wc / 100, 1) * 30;
    const kwScore = Math.min(kwFound / 5, 1) * 40;
    return wcScore + kwScore + isStructured;
  });
  const scenarioPct = scenarioScores.reduce((a, b) => a + b, 0) / Math.max(scenarioScores.length, 1);

  // Capstone: from GitHub evaluation (0-100)
  const capstonePct = Math.min(capstoneScore, 100);

  // Mentoring
  const mentoringScores = mentoringAnswers.map(m => {
    const wc = wordCount(m.answer);
    const kwFound = containsKeywords(m.answer, mentoringKws);
    return Math.min(wc / 80, 1) * 50 + Math.min(kwFound / 3, 1) * 50;
  });
  const mentoringPct = mentoringScores.reduce((a, b) => a + b, 0) / Math.max(mentoringScores.length, 1);

  // Questionnaire
  const questionnaireScores = questionnaireAnswers.map(q => {
    const wc = wordCount(q.answer);
    const kwFound = containsKeywords(q.answer, questionnaireKws);
    return Math.min(wc / 50, 1) * 50 + Math.min(kwFound / 3, 1) * 50;
  });
  const questionnairePct = questionnaireScores.reduce((a, b) => a + b, 0) / Math.max(questionnaireScores.length, 1);

  const finalScore = scenarioPct * 0.25 + capstonePct * 0.40 + mentoringPct * 0.20 + questionnairePct * 0.15;

  return {
    finalScore: Math.round(finalScore * 10) / 10,
    components: {
      scenarioScore: Math.round(scenarioPct),
      capstoneScore: Math.round(capstonePct),
      mentoringScore: Math.round(mentoringPct),
      questionnaireScore: Math.round(questionnairePct),
    },
    passed: finalScore >= 70,
  };
}

// ─── SILENT TIER DROP ─────────────────────────────────────────────────────────

export type AssessmentLevel = 'expert' | 'intermediate' | 'beginner' | 'not_validated';

export interface TierDropResult {
  originalLevel: AssessmentLevel;
  finalLevel: AssessmentLevel;
  silentDropPath: string;
  drops: AssessmentLevel[];
}

export function resolveSilentTierDrop(
  originalLevel: AssessmentLevel,
  scores: Partial<Record<AssessmentLevel, number>>,
): TierDropResult {
  const drops: AssessmentLevel[] = [];
  let current = originalLevel;

  const expertScore = scores.expert ?? -1;
  const intermediateScore = scores.intermediate ?? -1;
  const beginnerScore = scores.beginner ?? -1;

  if (current === 'expert' && expertScore < 70) {
    drops.push('expert');
    current = 'intermediate';
  }
  if (current === 'intermediate' && intermediateScore < 65) {
    drops.push('intermediate');
    current = 'beginner';
  }
  if (current === 'beginner' && beginnerScore < 60) {
    drops.push('beginner');
    current = 'not_validated';
  }

  const pathParts = [originalLevel, ...drops.map(d => `${d}_dropped`), current];
  const silentDropPath = drops.length === 0 ? '' : pathParts.join('→');

  return { originalLevel, finalLevel: current, silentDropPath, drops };
}

// ─── TIER DROP/UPGRADE LOGIC ─────────────────────────────────────────────────

export function determineTierResult(
  claimedLevel: string,
  finalScore: number
): {
  action: 'dropup' | 'pass' | 'dropdown';
  validatedLevel: string;
  badgeLevel: string | null;
  nextTestLevel: string | null;
} {
  const levels = ['Not Validated', 'Beginner', 'Intermediate', 'Expert'];
  const currentIndex = levels.indexOf(claimedLevel);

  if (finalScore >= 90) {
    const upgradedLevel = levels[Math.min(currentIndex + 1, levels.length - 1)];
    return { action: 'dropup', validatedLevel: upgradedLevel, badgeLevel: upgradedLevel, nextTestLevel: null };
  }

  if (finalScore >= 60) {
    return { action: 'pass', validatedLevel: claimedLevel, badgeLevel: claimedLevel, nextTestLevel: null };
  }

  if (currentIndex <= 1) {
    return { action: 'dropdown', validatedLevel: 'Not Validated', badgeLevel: null, nextTestLevel: null };
  }

  const lowerLevel = levels[Math.max(currentIndex - 1, 0)];
  return { action: 'dropdown', validatedLevel: lowerLevel, badgeLevel: null, nextTestLevel: lowerLevel };
}

// ─── CHANGE 4: ADAPTIVE CHECKPOINT (Expert path, mid-exam) ──────────────────
export type CheckpointAction = 'reroute_intermediate' | 'continue' | 'continue_bonus';

export interface CheckpointResult {
  action: CheckpointAction;
  bonusDepthQuestions: boolean;
  reason: string;
}

// Applies ONLY on the Expert path, mid-exam.
//   checkpoint < 50%  → reroute to Intermediate (served as a shortlist — CHANGE 5)
//   checkpoint 50-84% → continue Expert
//   checkpoint ≥ 85%  → continue Expert + bonus depth questions
export function applyAdaptiveCheckpoint(checkpointPct: number): CheckpointResult {
  if (checkpointPct < 50) {
    return { action: 'reroute_intermediate', bonusDepthQuestions: false, reason: `Checkpoint ${Math.round(checkpointPct)}% < 50% — reroute to Intermediate.` };
  }
  if (checkpointPct >= 85) {
    return { action: 'continue_bonus', bonusDepthQuestions: true, reason: `Checkpoint ${Math.round(checkpointPct)}% ≥ 85% — continue Expert with bonus depth questions.` };
  }
  return { action: 'continue', bonusDepthQuestions: false, reason: `Checkpoint ${Math.round(checkpointPct)}% — continue Expert.` };
}

// GATE A (resolved: mid-test drop-UP allowed): mid-exam checkpoint for the
// Intermediate path — a very high checkpoint promotes UP to Expert, served as
// an Expert shortlist (CHANGE 5). Promotion threshold reuses the ≥85 band.
export const INTERMEDIATE_PROMOTE_THRESHOLD = 85;

export function applyIntermediateCheckpoint(checkpointPct: number): { action: 'promote_expert' | 'continue'; reason: string } {
  if (checkpointPct >= INTERMEDIATE_PROMOTE_THRESHOLD) {
    return { action: 'promote_expert', reason: `Checkpoint ${Math.round(checkpointPct)}% ≥ ${INTERMEDIATE_PROMOTE_THRESHOLD}% — promote to Expert.` };
  }
  return { action: 'continue', reason: `Checkpoint ${Math.round(checkpointPct)}% — continue Intermediate.` };
}

// ─── CHANGE 4: FINAL EXPERT AUTHENTICATION ──────────────────────────────────
export interface ExpertAuthResult {
  level: 'Expert' | 'Intermediate' | 'Not Validated';
  action: 'authenticated' | 'reroute_down' | 'retake';
  capstoneUnlocked: boolean;
  capstoneWindowDays: number | null;
  retakeDays: number | null;
  profileFlag: string | null;
}

// Final authentication after the Expert path completes.
//   ≥70  → Expert (capstone unlocked, 7-day window)
//   65-69 → Intermediate
//   <65  → retake in 14 days
// When the candidate reached Expert via a reroute (down from Expert attempt),
// flag the profile "Attempted Expert · Authenticated Intermediate".
export function authenticateExpertFinal(finalPct: number, wasReroutedDown = false): ExpertAuthResult {
  if (finalPct >= 70) {
    return { level: 'Expert', action: 'authenticated', capstoneUnlocked: true, capstoneWindowDays: 7, retakeDays: null, profileFlag: null };
  }
  if (finalPct >= 65) {
    return { level: 'Intermediate', action: 'reroute_down', capstoneUnlocked: false, capstoneWindowDays: null, retakeDays: null,
      profileFlag: 'Attempted Expert · Authenticated Intermediate' };
  }
  return { level: 'Not Validated', action: 'retake', capstoneUnlocked: false, capstoneWindowDays: null, retakeDays: 14,
    profileFlag: wasReroutedDown ? 'Attempted Expert · Authenticated Intermediate' : null };
}

// ─── CHANGE 5: REROUTE = SHORTLIST ──────────────────────────────────────────
// Whenever a candidate is rerouted mid-flow (up OR down) they do NOT write the
// full new-level test — they get a fixed-N core subset (auto top-N by
// difficulty). Pass the subset → authenticate at the new level; fail → retake.
export const REROUTE_SHORTLIST_SIZE = 10;
export const REROUTE_RETAKE_DAYS = 14;

// Pass threshold for a rerouted shortlist — authenticate at the new level if met.
export function passedRerouteShortlist(scorePct: number, level: AssessmentLevel): boolean {
  const threshold = level === 'expert' ? 70 : level === 'intermediate' ? 65 : 60;
  return scorePct >= threshold;
}

// ─── INTEGRITY SCORING ────────────────────────────────────────────────────────

export interface IntegrityFlags {
  tabSwitches: number;
  copyPastes: number;
  fullscreenExits: number;
  browserBlurs: number;
  devtoolsDetected: boolean;
  avgMcqTimeSec?: number;
  uniformAnswers?: boolean;
}

export function scoreIntegrity(flags: IntegrityFlags): { score: number; warnings: string[]; integrityWarning: boolean } {
  let score = 100;
  const warnings: string[] = [];

  score -= flags.tabSwitches * 10;
  score -= flags.copyPastes * 15;
  score -= flags.fullscreenExits * 20;
  score -= flags.browserBlurs * 5;
  if (flags.devtoolsDetected) score -= 50;

  if (flags.tabSwitches > 0) warnings.push(`Tab switches: ${flags.tabSwitches}`);
  if (flags.copyPastes > 0) warnings.push(`Copy/paste: ${flags.copyPastes}`);
  if (flags.fullscreenExits > 0) warnings.push(`Fullscreen exits: ${flags.fullscreenExits}`);
  if (flags.devtoolsDetected) warnings.push('DevTools opened');

  // Suspicious timing: average < 3s per MCQ
  if (flags.avgMcqTimeSec !== undefined && flags.avgMcqTimeSec < 3) {
    score -= 20;
    warnings.push(`Suspicious timing: avg ${flags.avgMcqTimeSec.toFixed(1)}s/question`);
  }

  // All same answer (AAAA or BBBB)
  if (flags.uniformAnswers) {
    score -= 15;
    warnings.push('Uniform answer pattern detected');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    warnings,
    integrityWarning: score < 50,
  };
}
