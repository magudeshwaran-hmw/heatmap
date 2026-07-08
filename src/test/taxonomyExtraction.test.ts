import { describe, it, expect } from 'vitest';
import { assembleTaxonomyExtraction, keywordExtractTaxonomy } from '@/lib/resumeExtraction';
import { QE_ALL_SKILLS, QE_SKILL_COUNT, findQESkillByName } from '@/lib/qeSkillTaxonomy';

const idOf = (name: string) => QE_ALL_SKILLS.find(s => s.name === name)!.id;

describe('QE taxonomy foundation', () => {
  it('exposes 166 skills with stable, unique, contiguous ids', () => {
    expect(QE_SKILL_COUNT).toBe(166);
    const ids = QE_ALL_SKILLS.map(s => s.id);
    expect(new Set(ids).size).toBe(166);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(166);
  });

  it('disambiguates the 4 cross-family duplicate names via family', () => {
    const rows = QE_ALL_SKILLS.filter(s => s.name === 'Prompt Engineering');
    expect(rows.length).toBe(2);
    const a = findQESkillByName('Prompt Engineering', rows[0].family);
    const b = findQESkillByName('Prompt Engineering', rows[1].family);
    expect(a!.id).not.toBe(b!.id);
  });
});

describe('assembleTaxonomyExtraction', () => {
  it('groups by family, ranks priority per family, and drops invalid/zero rows', () => {
    const raw = [
      { id: idOf('Java-Selenium'), proficiency: 3 },
      { id: idOf('TestNG'), proficiency: 2 },
      { id: idOf('Appium'), proficiency: 1 },
      { id: 999999, proficiency: 3 },              // hallucinated id → dropped
      { id: idOf('Java-Selenium'), proficiency: 0 }, // 0 duplicate → keeps the earlier 3
    ];
    const r = assembleTaxonomyExtraction(raw as any);

    expect(r.matchedCount).toBe(3);

    const sdet = r.byFamily.find(f => f.family === 'Test Automation Engineering - SDET')!;
    expect(sdet.skills.map(s => s.name)).toEqual(['Java-Selenium', 'TestNG', 'Appium']);
    expect(sdet.skills.map(s => s.priority)).toEqual(['primary', 'secondary', 'tertiary']);

    expect(r.primarySkill).toBe('Java-Selenium');
    expect(r.ratingsByName['Java-Selenium']).toBe(3);
    expect(r.ratingsByName).not.toHaveProperty('__proto__');
  });

  it('keyword fallback maps a realistic resume into taxonomy skills (no LLM)', () => {
    const resume = `Senior SDET with 8 years. Built automation frameworks in Java-Selenium and TestNG,
      API automation with RestAssured and Postman, performance testing with JMeter, CI/CD via Jenkins
      and Docker. Worked in Banking (BFSI) domain.`;
    const raw = keywordExtractTaxonomy(resume);
    const r = assembleTaxonomyExtraction(raw);
    const names = r.skills.map(s => s.name);
    expect(names).toContain('Java-Selenium');
    expect(names).toContain('TestNG');
    expect(names).toContain('RestAssured Framework');
    expect(r.byFamily.length).toBeGreaterThan(1);
    expect(r.matchedCount).toBeGreaterThan(3);
  });

  it('keyword floor stays accurate to a non-QA (ML) resume — no testing-skill inflation', () => {
    // An ML-builder resume: builds models/APIs/data, never mentions testing them.
    const mlResume = `Machine Learning Engineer. Python, scikit-learn, TensorFlow, PyTorch, Keras.
      LangChain, Hugging Face. Built LLM apps and RAG. Deployed Flask API. ETL pipeline with Pandas.
      Docker, Git, GitHub. FAISS vector database. Healthcare diabetes prediction.`;
    const r = assembleTaxonomyExtraction(keywordExtractTaxonomy(mlResume));
    const names = r.skills.map(s => s.name);
    // Real, evidenced skills are present:
    expect(names).toContain('Deep Learning');
    expect(names).toContain('Docker');
    // Inferred AI-testing skills must NOT appear from keyword evidence alone:
    for (const inferred of ['Hallucination Detection', 'Bias & Fairness Testing', 'AI Safety Testing', 'RAG Validation', 'Responsible AI']) {
      expect(names).not.toContain(inferred);
    }
  });

  it('keyword levels are Beginner-first (1 mention = Beginner, 4+ evidences = Expert-grade)', () => {
    const oneMention = keywordExtractTaxonomy('The team used Docker for containers.');
    expect(oneMention.find(r => r.id === idOf('Docker'))?.proficiency).toBe(1); // Beginner
    const strong = keywordExtractTaxonomy('Deep Learning with TensorFlow, PyTorch and Keras.');
    expect(strong.find(r => r.id === idOf('Deep Learning'))?.proficiency).toBe(3); // 4 evidences
  });

  it('orders families by total strength (strongest first)', () => {
    const raw = [
      { id: idOf('Appium'), proficiency: 1 },        // SDET family, weak
      { id: idOf('NeoLoad'), proficiency: 3 },       // Non-Functional family, strong
    ];
    const r = assembleTaxonomyExtraction(raw as any);
    expect(r.byFamily[0].family).toBe('Non-Functional Testing');
  });
});
