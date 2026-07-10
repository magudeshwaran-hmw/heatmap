// ─── AI Evaluator Agent (162-skill QE taxonomy) ──────────────────────────────
// A skeptical SECOND pass over the taxonomy extraction. Given the resume plus the
// skills a first pass proposed, it CONFIRMS or DROPS each one against the resume —
// killing keyword/first-pass false positives (e.g. "Java-Selenium" for someone
// with no Java or Selenium) and enforcing BUILD ≠ TEST — and returns an honest
// per-skill level. Because it runs BEFORE the experience cap, its differentiated
// levels drive an accurate primary/secondary/tertiary instead of alphabetical ties.
//
// Operates ONLY on the 166-skill QE taxonomy — never the legacy 32-skill set.
// The model backend is swappable in llm.ts (AI_MODE local↔cloud); when the model
// is offline the caller falls back to the keyword floor, so extraction never fails.
import { callResumeLLM } from './llm';

export interface EvalCandidate { id: number; name: string; family: string; proficiency: number; }
export interface EvalVerdict { keep: boolean; level: number; evidence: string; }

/**
 * Evaluate the proposed taxonomy skills against the resume.
 * Returns a Map<id, verdict>, or null if the AI is unavailable (caller keeps the
 * first-pass set as the reliability floor).
 */
export async function evaluateTaxonomySkills(
  resumeText: string,
  candidates: EvalCandidate[],
): Promise<Map<number, EvalVerdict> | null> {
  if (candidates.length === 0) return new Map();
  const list = candidates.map(c => `${c.id}. ${c.name} [${c.family}]`).join('\n');
  const prompt = `You are a strict Quality-Engineering skill EVALUATOR agent for an MNC (Zensar).
A first pass proposed the skills below for a candidate. For EACH proposed skill, judge from the RESUME whether it is genuinely evidenced, and give an honest level. Be skeptical — this decides a real skills assessment.

RULES:
- keep=false if the resume does NOT genuinely evidence the skill. Keyword matchers create false positives (e.g. "java" matched inside "javascript"; a tool the person never actually used; a domain tag that is not a skill). When in doubt, DROP.
- BUILD ≠ TEST: a "…Testing" / "…Validation" / QA skill earns level 2-3 ONLY with real testing/validation/QA evidence (verbs: test, validate, verify, QA, coverage, defect, assure). Build/use-only evidence → level 1, or DROP if there is no evidence at all.
- Differentiate levels honestly so the strongest real skills stand out:
    3 = deep, primary expertise with strong multi-project / recent evidence
    2 = solid working evidence
    1 = basic exposure, mentioned once, or build/use-only

PROPOSED SKILLS (id. name [family]):
${list}

RESUME TEXT:
---
${resumeText}
---

Respond with ONLY valid JSON, no markdown, EXACTLY:
{ "verdicts": [ { "id": <id>, "keep": true, "level": 3, "evidence": "<short reason>" }, { "id": <id>, "keep": false, "level": 0, "evidence": "no real evidence" } ] }`;

  try {
    const res = await callResumeLLM(prompt, true);
    const arr = (res.data as any)?.verdicts;
    if (res.error || !Array.isArray(arr)) return null;
    const m = new Map<number, EvalVerdict>();
    for (const v of arr) {
      const id = parseInt(String(v?.id), 10);
      if (!Number.isFinite(id)) continue;
      m.set(id, {
        keep: v?.keep !== false,
        level: Math.max(0, Math.min(3, parseInt(String(v?.level), 10) || 0)),
        evidence: String(v?.evidence || '').slice(0, 200),
      });
    }
    return m;
  } catch {
    return null;
  }
}
