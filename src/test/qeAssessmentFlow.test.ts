import { describe, it, expect } from 'vitest';
import { computeQEAssessmentFlow, type QEQislSkill, type QEProject } from '../lib/qeAssessmentFlow';

// A "Kavya"-style SDET résumé (ZenSkillMap worked example): deep Full Stack
// Automation, some scattered NFT/other evidence. E1 grade, high family score.
const kavyaSkills: QEQislSkill[] = [
  { name: 'Java-Selenium', level: 3, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' },
  { name: 'Appium',        level: 3, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' },
  { name: 'TestNG',        level: 2, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' },
  { name: 'Playwright',    level: 1, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' },
  { name: 'BDD/TDD',       level: 1, family: 'Test Automation Engineering - SDET', group: 'Automation Engineering' },
  { name: 'API Automation',level: 1, family: 'Test Automation Engineering - SDET', group: 'Automation Engineering' },
];

const kavyaProjects: QEProject[] = [
  { name: 'Web Regression Suite', technologies: ['Selenium', 'Java', 'TestNG', 'Maven'], description: 'Selenium WebDriver framework with TestNG' },
  { name: 'Mobile Automation',    technologies: ['Appium', 'Java'], description: 'Appium mobile test automation' },
  { name: 'CI Pipeline',          technologies: ['Selenium', 'Appium'], description: 'parallel selenium and appium runs' },
];

describe('computeQEAssessmentFlow — ZenSkillMap Phases 2/3/5/6', () => {
  it('elects the SDET family and Full Stack Automation group', () => {
    const flow = computeQEAssessmentFlow(kavyaSkills, kavyaProjects, 10, 'E1');
    expect(flow.winningFamily).toBe('Test Automation Engineering - SDET');
    expect(flow.winningGroup).toBe('Full Stack Automation');
  });

  it('scores the winning family 0-100 with 40/40/20 components present', () => {
    const flow = computeQEAssessmentFlow(kavyaSkills, kavyaProjects, 10, 'E1');
    expect(flow.winningFamilyScore).toBeGreaterThan(0);
    expect(flow.winningFamilyScore).toBeLessThanOrEqual(100);
    const top = flow.familyScores[0];
    expect(top.components).toHaveProperty('skillFrequency');
    expect(top.components).toHaveProperty('projectToolUsage');
    expect(top.components).toHaveProperty('tenure');
  });

  it('PHASE 6: E1 + family score >= 80 unlocks the Expert path', () => {
    const flow = computeQEAssessmentFlow(kavyaSkills, kavyaProjects, 10, 'E1');
    // single-family résumé → winning family normalises near 100 → Expert for E1
    expect(flow.winningFamilyScore).toBeGreaterThanOrEqual(80);
    expect(flow.path).toBe('Expert');
  });

  it('PHASE 6: E1 with a weak family score stays Intermediate (no false Expert)', () => {
    // two families of equal weight → neither normalises to >= 80 across all 3 signals
    const mixed: QEQislSkill[] = [
      { name: 'Java-Selenium', level: 2, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' },
      { name: 'JMeter',        level: 2, family: 'Non-Functional Testing', group: 'Performance & Reliability Engineering' },
    ];
    const projects: QEProject[] = [
      { name: 'A', technologies: ['Selenium'] },
      { name: 'B', technologies: ['JMeter'] },
    ];
    const flow = computeQEAssessmentFlow(mixed, projects, 8, 'E1');
    expect(flow.winningFamilyScore).toBeLessThan(80);
    expect(flow.path).toBe('Intermediate');
  });

  it('PHASE 5: Top-3 are depth-ranked and scoped to the winning family', () => {
    const flow = computeQEAssessmentFlow(kavyaSkills, kavyaProjects, 10, 'E1');
    expect(flow.top3).toHaveLength(3);
    // deepest evidenced skills first (Selenium/Appium level 3 + most projects)
    expect(flow.top3[0].name).toBe('Java-Selenium');
    expect(flow.top3.every(t => t.family === 'Test Automation Engineering - SDET')).toBe(true);
    // depth scores are ordered descending
    expect(flow.top3[0].depthScore).toBeGreaterThanOrEqual(flow.top3[1].depthScore);
    expect(flow.top3[1].depthScore).toBeGreaterThanOrEqual(flow.top3[2].depthScore);
  });

  it('PHASE 5 Filter 2: a junior grade leads with grade-appropriate (basic/intermediate) skills', () => {
    const juniorSkills: QEQislSkill[] = [
      { name: 'Java-Selenium', level: 3, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' }, // advanced (off-grade for F1)
      { name: 'TestNG',        level: 2, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' }, // intermediate (grade-appropriate)
      { name: 'Cypress',       level: 1, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' }, // basic (grade-appropriate)
    ];
    const flow = computeQEAssessmentFlow(juniorSkills, [{ technologies: ['Selenium', 'TestNG', 'Cypress'] }], 3, 'F1');
    // Grade-appropriate skill leads; the advanced level-3 skill is NOT discarded, just ranked after.
    expect(flow.top3[0].gradeAppropriate).toBe(true);
    expect(flow.top3.map(t => t.name)).toContain('Java-Selenium');
    const testngRank = flow.top3.findIndex(t => t.name === 'TestNG');
    const seleniumRank = flow.top3.findIndex(t => t.name === 'Java-Selenium');
    expect(testngRank).toBeLessThan(seleniumRank);
  });

  it('PHASE 5 Filter 2: a senior grade (D) leads with advanced skills', () => {
    const seniorSkills: QEQislSkill[] = [
      { name: 'Java-Selenium', level: 3, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' }, // advanced (grade-appropriate for D)
      { name: 'TestNG',        level: 2, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation' }, // off-grade for D
    ];
    const flow = computeQEAssessmentFlow(seniorSkills, [{ technologies: ['Selenium', 'TestNG'] }], 16, 'D');
    expect(flow.top3[0].name).toBe('Java-Selenium');
    expect(flow.top3[0].gradeAppropriate).toBe(true);
  });

  it('a junior grade (F1) never reaches Expert regardless of score', () => {
    const flow = computeQEAssessmentFlow(kavyaSkills, kavyaProjects, 4, 'F1');
    expect(flow.path).not.toBe('Expert');
  });

  it('backfills family/group from the taxonomy for legacy rows with null family', () => {
    // A legacy QISL row saved before the family/group columns existed.
    const legacy: QEQislSkill[] = [
      { name: 'Java-Selenium', level: 3, family: null, group: null },
      { name: 'Appium',        level: 2, family: null, group: null },
    ];
    const flow = computeQEAssessmentFlow(legacy, [{ technologies: ['Selenium', 'Appium'] }], 8, 'E1');
    expect(flow.winningFamily).toBe('Test Automation Engineering - SDET');
    expect(flow.winningGroup).toBe('Full Stack Automation');
    expect(flow.top3.every(t => t.family !== 'Other')).toBe(true);
  });

  it('never assigns an "Other" (non-162) skill as primary/secondary/tertiary', () => {
    // A custom off-list skill with STRONG evidence must still be kept out of the trio.
    const withOther: QEQislSkill[] = [
      { name: 'CompanyInternalHarness', level: 3, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation', taxonomyId: null }, // Other — highest evidence
      { name: 'Java-Selenium', level: 2, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation', taxonomyId: 1 },
      { name: 'Appium',        level: 2, family: 'Test Automation Engineering - SDET', group: 'Full Stack Automation', taxonomyId: 3 },
    ];
    const flow = computeQEAssessmentFlow(withOther, [{ technologies: ['CompanyInternalHarness', 'Selenium', 'Appium'] }], 10, 'E1');
    const names = flow.top3.map(t => t.name);
    expect(names).not.toContain('CompanyInternalHarness');   // Other excluded
    expect(names).toContain('Java-Selenium');
    expect(names).toContain('Appium');
    // ...even though the Other has the highest raw depth
    const other = flow.allScored.find(s => s.name === 'CompanyInternalHarness');
    expect(other).toBeDefined();
  });

  it('handles an empty skill set without throwing', () => {
    const flow = computeQEAssessmentFlow([], [], 0, null);
    expect(flow.winningFamily).toBeNull();
    expect(flow.top3).toHaveLength(0);
    expect(flow.path).toBe('Beginner');
  });
});
