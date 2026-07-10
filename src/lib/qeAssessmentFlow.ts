/**
 * qeAssessmentFlow.ts — the 166-skill (QE taxonomy) analog of the assessment flow
 * in zenTaxonomy.ts. This is the 162-ONLY world's implementation of the manager's
 * ZenSkillMap flowchart (Phases 2, 3, 5, 6):
 *
 *   PHASE 2 — L3 Skill Family scored per the spec's 40 / 40 / 20 weights
 *             (skill frequency 40% + project-tool usage 40% + tenure 20%)
 *   PHASE 3 — L4 Skill Group elected inside the winning family
 *             (the group with the most evidenced L5 skill matches)
 *   PHASE 5 — Top-3 L5 skills ranked by depth (years · projects · frequency),
 *             scoped to the winning group/family first — no self-rating used
 *   PHASE 6 — Validation path from Grade + Family score
 *             (reuses assignPathFromGradeScore: e.g. E1 + score ≥ 80 → Expert)
 *
 * It runs at assessment time over the employee's stored QISL skills (each carries
 * family + group + level) plus their projects and years — so it needs no resume
 * re-parse. The old 32-skill engine (scoreJobFamilies / computeAssessmentFlow) is
 * left untouched; this is its 166-skill sibling used only by the new ZenAssess.
 */

import { assignPathFromGradeScore, normalizeGradeBand, textIncludesTech, type AssessPath } from './zenTaxonomy';
import { findQESkillByName } from './qeSkillTaxonomy';

export interface QEQislSkill {
  name: string;
  level: number;               // 1-3 QISL proficiency (evidence depth from extraction)
  family: string | null;
  group: string | null;
  priority?: string | null;
  /** DB taxonomy_skill_id — null/undefined means this is an "Other" (custom, non-162) skill */
  taxonomyId?: number | null;
}

export interface QEProject {
  name?: string;
  technologies?: string[];
  skills?: string[];
  domain?: string;
  description?: string;
  role?: string;
}

export interface QEFamilyScore {
  family: string;
  score: number;               // 0-100 weighted 40/40/20
  components: { skillFrequency: number; projectToolUsage: number; tenure: number };
  matched: string[];           // evidenced skill names in this family
}

export interface QEGroupScore {
  group: string;
  score: number;               // 0-100
  matches: number;             // evidenced L5 skills in this group
  skills: string[];
}

export interface QETop3Skill {
  name: string;
  family: string;
  group: string;
  depthScore: number;          // 0-100 — years · projects · frequency (no self-rating)
  level: number;
  projects: number;
  frequency: number;
  gradeAppropriate: boolean;   // Filter 2: skill complexity matches the grade band
}

// ZenSkillMap Phase 5, Filter 2 — grade-appropriate skill complexity.
// The QISL evidence level (1 basic · 2 intermediate · 3 advanced) is the complexity
// proxy. Junior grades are assessed on basics→intermediate, mid on intermediate→
// advanced, senior on advanced — "E1 sees advanced skills · F2 sees basics".
function gradePreferredLevels(band: string): Set<number> {
  switch (band) {
    case 'G0':
    case 'F2':
    case 'F1': return new Set([1, 2]);   // Junior → basics / intermediate
    case 'E2':
    case 'E1': return new Set([2, 3]);   // Mid → intermediate / advanced
    case 'D':
    case 'C':  return new Set([3]);      // Senior → advanced
    default:   return new Set([1, 2, 3]);
  }
}

export interface QEAssessmentFlow {
  familyScores: QEFamilyScore[];
  winningFamily: string | null;
  winningFamilyScore: number;
  groupScores: QEGroupScore[];
  winningGroup: string | null;
  top3: QETop3Skill[];
  /** EVERY evidenced skill scored (real projects · depth · grade-fit) — no placeholders */
  allScored: QETop3Skill[];
  path: AssessPath;
  gradeBand: string;
}

const EMPTY_FLOW: QEAssessmentFlow = {
  familyScores: [], winningFamily: null, winningFamilyScore: 0,
  groupScores: [], winningGroup: null, top3: [], allScored: [], path: 'Beginner', gradeBand: 'G0',
};

// Distinctive keywords for a QISL skill. Taxonomy skills use their catalog keywords;
// an "Other" (non-taxonomy) skill falls back to its own distinctive name words.
function keywordsFor(skill: QEQislSkill): string[] {
  const meta = findQESkillByName(skill.name, skill.family || undefined);
  if (meta && meta.keywords.length) return meta.keywords;
  const words = skill.name.toLowerCase().split(/[^a-z0-9#.+]+/).filter(w => w.length >= 3);
  return words.length ? words : [skill.name.toLowerCase()];
}

// Flatten a project into one searchable lowercase string.
function projectText(p: QEProject): string {
  return [
    ...(p.technologies || []), ...(p.skills || []),
    p.domain || '', p.description || '', p.role || '', p.name || '',
  ].join(' ').toLowerCase();
}

/**
 * Full flow for the new ZenAssess. `qislSkills` are the employee's evidenced QISL
 * rows (level > 0), `projects` their résumé projects, `years` total IT experience,
 * `grade` the Zensar grade (from DB / Azure AD when wired).
 */
export function computeQEAssessmentFlow(
  qislSkills: QEQislSkill[],
  projects: QEProject[],
  years: number,
  grade: string | null | undefined,
): QEAssessmentFlow {
  const skills = (qislSkills || [])
    .filter(s => s && s.name && (s.level || 0) > 0)
    // Backfill family/group from the taxonomy for legacy QISL rows that were stored
    // before the family/group columns existed (or from a manual self-rating). Without
    // this they'd all collapse into a single "Other" family and break the election.
    .map(s => {
      if (s.family && s.group) return s;
      const meta = findQESkillByName(s.name, s.family || undefined);
      return meta ? { ...s, family: s.family || meta.family, group: s.group || meta.group } : s;
    });
  if (skills.length === 0) {
    return { ...EMPTY_FLOW, gradeBand: normalizeGradeBand(grade), path: assignPathFromGradeScore(grade, 0) };
  }

  const projTexts = (projects || []).map(projectText);
  const totalProjects = Math.max(projTexts.length, 1);

  // Per-skill evidence, kept as TWO separate signals:
  //   • skillProjects  — # projects that mention the skill (project-tool usage)
  //   • skillRawFreq   — # DISTINCT keywords of the skill seen in project text.
  //     This is the depth-ranking frequency and is NOT floored by level, so two
  //     equally-rated skills still separate by how much distinct evidence each has
  //     (fixes the cap-flatten → alphabetical tie the trio used to fall into).
  const skillProjects = new Map<string, number>();
  const skillRawFreq = new Map<string, number>();
  for (const sk of skills) {
    const kws = keywordsFor(sk);
    let projCount = 0;
    for (const pt of projTexts) {
      if (kws.some(kw => textIncludesTech(pt, kw))) projCount++;
    }
    const distinctKw = kws.filter(kw => projTexts.some(pt => textIncludesTech(pt, kw))).length;
    skillProjects.set(sk.name, projCount);
    skillRawFreq.set(sk.name, distinctKw);
  }

  // ── PHASE 2: family scoring (40 freq / 40 project-tool / 20 tenure) ──────────
  // Signals use SHARE-OF-TOTAL (absolute) normalisation, not division by the top
  // family — so the winning family's score reflects genuine concentration (a
  // specialist scores high; someone split across families scores lower), which is
  // what makes the Phase-6 "≥ 80 → Expert" gate actually discriminate.
  const famMap = new Map<string, QEQislSkill[]>();
  for (const sk of skills) {
    const fam = sk.family || 'Other';
    (famMap.get(fam) || famMap.set(fam, []).get(fam)!).push(sk);
  }

  type RawFam = { family: string; freqRaw: number; toolProjects: number; levelSum: number; matched: string[] };
  const raw: RawFam[] = [];
  for (const [family, fs] of famMap) {
    let freqRaw = 0, levelSum = 0;
    const toolSet = new Set<number>();
    const matched: string[] = [];
    for (const sk of fs) {
      // Floor keyword evidence by the QISL level so a highly-rated skill with no
      // parsed project text still contributes frequency weight to its family.
      freqRaw += Math.max(skillRawFreq.get(sk.name) || 0, sk.level);
      levelSum += sk.level;
      matched.push(sk.name);
      const kws = keywordsFor(sk);
      projTexts.forEach((pt, i) => { if (kws.some(kw => textIncludesTech(pt, kw))) toolSet.add(i); });
    }
    raw.push({ family, freqRaw, toolProjects: toolSet.size, levelSum, matched });
  }

  const totalFreqRaw = Math.max(1, raw.reduce((n, r) => n + r.freqRaw, 0));
  const totalLevelSum = Math.max(1, raw.reduce((n, r) => n + r.levelSum, 0));
  const nProjects = projTexts.length; // 0 → project-tool signal is 0 for everyone

  const familyScores: QEFamilyScore[] = raw.map(r => {
    const skillFreqN = (r.freqRaw / totalFreqRaw) * 100;                 // share of all keyword evidence
    const projToolN = nProjects > 0 ? (r.toolProjects / nProjects) * 100 : 0; // fraction of projects touching the family
    const tenureN = (r.levelSum / totalLevelSum) * 100;                 // proficiency concentration (tenure proxy)
    // Spec weights, verbatim: skill frequency 40% + project-tool usage 40% + tenure 20%.
    const score = Math.round(skillFreqN * 0.40 + projToolN * 0.40 + tenureN * 0.20);
    return {
      family: r.family,
      score,
      components: {
        skillFrequency: Math.round(skillFreqN),
        projectToolUsage: Math.round(projToolN),
        tenure: Math.round(tenureN),
      },
      matched: r.matched,
    };
  }).sort((a, b) => b.score - a.score);

  const winningFamily = familyScores[0]?.family ?? null;
  const winningFamilyScore = familyScores[0]?.score ?? 0;

  // ── PHASE 3: elect the winning L4 group inside the winning family ────────────
  const famSkills = skills.filter(s => (s.family || 'Other') === winningFamily);
  const grpMap = new Map<string, QEQislSkill[]>();
  for (const sk of famSkills) {
    const grp = sk.group || '—';
    (grpMap.get(grp) || grpMap.set(grp, []).get(grp)!).push(sk);
  }
  const groupScoresRaw = Array.from(grpMap.entries()).map(([group, gs]) => {
    // Group strength = evidenced L5 matches, weighted by level + project usage.
    const matches = gs.length;
    const levelSum = gs.reduce((n, s) => n + s.level, 0);
    const projSum = gs.reduce((n, s) => n + (skillProjects.get(s.name) || 0), 0);
    const rawScore = levelSum * 2 + projSum * 3 + matches;
    return { group, matches, skills: gs.map(s => s.name), rawScore };
  });
  const maxGrp = Math.max(1, ...groupScoresRaw.map(g => g.rawScore));
  const groupScores: QEGroupScore[] = groupScoresRaw
    .map(g => ({ group: g.group, matches: g.matches, skills: g.skills, score: Math.round((g.rawScore / maxGrp) * 100) }))
    .sort((a, b) => b.score - a.score || b.matches - a.matches);
  const winningGroup = groupScores[0]?.group ?? null;

  // ── PHASE 5: Top-3 via the spec's THREE sequential filters ──────────────────
  //   Filter 1 — Skill Group : winning group first, then family, then the rest.
  //   Filter 2 — Zensar Grade: grade-appropriate complexity ranked ahead of off-grade.
  //   Filter 3 — Depth       : years · projects · frequency (no self-rating).
  const band = normalizeGradeBand(grade);
  const preferred = gradePreferredLevels(band);

  const depthOf = (sk: QEQislSkill): QETop3Skill => {
    const projects = skillProjects.get(sk.name) || 0;
    // Depth frequency = raw distinct keyword evidence (NOT floored by level) so
    // equally-rated skills separate by real evidence, not alphabetically.
    const frequency = skillRawFreq.get(sk.name) || 0;
    // Depth = years·projects·frequency, self-rating-free. Level (from extraction
    // evidence, not self-claim) stands in for "years in skill" depth.
    const levelComp = Math.min(45, (sk.level / 3) * 45);      // 3 → 45
    const projComp = Math.min(35, projects * 12);             // ~3 projects → 35
    const freqComp = Math.min(20, frequency * 5);             // ~4 evidences → 20
    const depthScore = Math.min(100, Math.round(levelComp + projComp + freqComp));
    return {
      name: sk.name, family: sk.family || 'Other', group: sk.group || '—',
      depthScore, level: sk.level, projects, frequency,
      gradeAppropriate: preferred.has(sk.level),
    };
  };

  // Every evidenced skill scored with REAL evidence (used by the UI so no card ever
  // shows a placeholder zero for projects/depth).
  const allScored = skills.map(depthOf);

  // Filter 2 before Filter 3: grade-appropriate skills sort ahead, then by depth.
  // (Off-grade skills are NOT discarded — they backfill when a grade-appropriate
  // trio can't be filled, so a sparse résumé still yields three cards.)
  const rankFn = (a: QETop3Skill, b: QETop3Skill) =>
    (b.gradeAppropriate ? 1 : 0) - (a.gradeAppropriate ? 1 : 0) ||
    b.depthScore - a.depthScore || b.level - a.level || a.name.localeCompare(b.name);

  // The Top-3 (primary/secondary/tertiary) may ONLY be one of the 162 taxonomy
  // skills — never an employee-added "Other" (custom, off-list skill). A skill is a
  // real taxonomy skill if it carries a taxonomy_skill_id OR its name resolves in the
  // catalog. "Others" still count toward family/group scoring, but are never assigned
  // as a priority skill. (They remain testable via the "Select your skill" card.)
  const isTaxonomy = (s: QEQislSkill) =>
    (s.taxonomyId != null) || !!findQESkillByName(s.name, s.family || undefined);

  const inGroup = famSkills.filter(s => (s.group || '—') === winningGroup && isTaxonomy(s)).map(depthOf).sort(rankFn);
  const inFamily = famSkills.filter(s => (s.group || '—') !== winningGroup && isTaxonomy(s)).map(depthOf).sort(rankFn);
  const restAll = skills.filter(s => (s.family || 'Other') !== winningFamily && isTaxonomy(s)).map(depthOf).sort(rankFn);

  // Fill order honours Filter 1 (group → family → rest). Within each scope, take the
  // grade-appropriate skills first (Filter 2), then allow off-grade to backfill, so
  // the three filters compose without ever returning fewer than the résumé supports.
  const top3: QETop3Skill[] = [];
  const used = new Set<string>();
  const take = (pool: QETop3Skill[], onlyGradeFit: boolean) => {
    for (const d of pool) {
      if (top3.length >= 3) break;
      if (used.has(d.name)) continue;
      if (onlyGradeFit && !d.gradeAppropriate) continue;
      top3.push(d); used.add(d.name);
    }
  };
  // Pass 1 — grade-appropriate only, widening group → family → rest.
  for (const pool of [inGroup, inFamily, restAll]) take(pool, true);
  // Pass 2 — backfill with off-grade skills (still group → family → rest).
  for (const pool of [inGroup, inFamily, restAll]) take(pool, false);

  // ── PHASE 6: path from Grade + Family score (E1 + score ≥ 80 → Expert, etc.) ─
  const path = assignPathFromGradeScore(grade, winningFamilyScore);

  return {
    familyScores,
    winningFamily,
    winningFamilyScore,
    groupScores,
    winningGroup,
    top3,
    allScored,
    path,
    gradeBand: band,
  };
}
