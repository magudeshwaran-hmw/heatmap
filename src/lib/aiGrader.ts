// ─── AI rubric grader for free-text assessment answers ───────────────────────
// Replaces brittle keyword matching with an LLM "judge" that scores the answer
// on correctness / depth / relevance for the target level, and returns a short
// justification. A keyword scorer is kept as the reliability FALLBACK so grading
// never hard-fails when the AI is offline or returns bad JSON.
//
// The model backend is swappable in src/lib/llm.ts (AI_MODE 'local' | 'cloud') —
// this grader calls callLLM() and inherits whatever model is configured there,
// so switching Ollama → Claude/GPT later needs no change here.
import { callLLM } from './llm';

export type AIGradeType = 'scenarios' | 'framework' | 'practical' | 'toolId';

export interface AIGradeInput {
  qtype: AIGradeType;
  skill: string;
  level: string;              // Beginner | Intermediate | Expert
  prompt: string;             // the question / task shown to the candidate
  answer: string;             // the candidate's free-text answer
  rubricKeywords?: string[];  // concept hints (guidance only — NOT a hard checklist)
  minWords?: number;
  modelAnswer?: string;       // optional ideal answer, if available
}

export interface AIGradeResult {
  score: number;    // 0-100
  feedback: string;
  usedAI: boolean;  // false when the keyword fallback produced the score
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function buildRubricPrompt(i: AIGradeInput): string {
  const kw = (i.rubricKeywords || []).filter(Boolean);
  return [
    `You are a strict but fair senior QA / software-engineering assessor grading a candidate's free-text answer in a skills test.`,
    `Skill: ${i.skill || 'General'}`,
    `Target level: ${i.level || 'Intermediate'}`,
    `Answer type: ${i.qtype}`,
    ``,
    `QUESTION / TASK:`,
    `"""${i.prompt || ''}"""`,
    i.modelAnswer ? `\nREFERENCE (ideal) ANSWER — for your guidance only:\n"""${i.modelAnswer}"""` : ``,
    kw.length ? `\nConcepts a strong answer tends to cover (guidance, NOT a keyword checklist): ${kw.join(', ')}` : ``,
    ``,
    `CANDIDATE'S ANSWER:`,
    `"""${i.answer || ''}"""`,
    ``,
    `Grade on correctness, depth, relevance and clarity for the stated level.`,
    `Reward genuine understanding even when phrased differently from the reference answer.`,
    `Penalise vague, generic, off-topic, copied-question, or empty answers. Do NOT reward keyword stuffing.`,
    `Return ONLY strict JSON, no prose: {"score": <integer 0-100>, "feedback": "<one or two sentence justification>"}.`,
  ].join('\n');
}

/**
 * Grade one free-text answer with the AI judge. `fallback` is invoked (and its
 * value returned with usedAI=false) whenever the AI is unavailable or returns an
 * unusable response — so the caller always gets a numeric score.
 */
export async function gradeTextAnswerAI(
  input: AIGradeInput,
  fallback: () => number,
): Promise<AIGradeResult> {
  const answer = (input.answer || '').trim();
  if (!answer) return { score: 0, feedback: 'No answer provided.', usedAI: false };
  try {
    const res = await callLLM(buildRubricPrompt(input), undefined, {
      temperature: 0.1, numPredict: 400, timeoutMs: 30000,
    });
    const d: any = res.data;
    if (res.error || !d || typeof d.score !== 'number') {
      return { score: clamp(fallback()), feedback: 'Scored by keyword fallback (AI unavailable).', usedAI: false };
    }
    return {
      score: clamp(d.score),
      feedback: String(d.feedback || d.justification || '').slice(0, 600),
      usedAI: true,
    };
  } catch {
    return { score: clamp(fallback()), feedback: 'Scored by keyword fallback (AI error).', usedAI: false };
  }
}
