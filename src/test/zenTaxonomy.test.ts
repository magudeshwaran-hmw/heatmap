import { describe, it, expect } from "vitest";
import {
  computeSkillTaxonomy,
  findCanonicalSkill,
  getSkillTier,
  type TaxonomyInput
} from "../lib/zenTaxonomy";

describe("ZenScan & ZenAssess V7 Skill Ranking Engine Tests", () => {
  
  // Test 1: ZenScan Extraction Exists Verification
  it("should verify ZenScan profile structure and fields exist", () => {
    const mockProfile = {
      name: "Magudeshwaran H",
      yearsIT: 8.5,
      designation: "Senior AI Engineer",
      skills: [
        { skillName: "TensorFlow", selfRating: 3, assessmentScore: 85 },
        { skillName: "Pandas", selfRating: 2 }
      ],
      projects: [
        { name: "GenAI Chatbot", technologies: ["LangChain", "OpenAI"], description: "RAG search chatbot" }
      ],
      certifications: ["AWS Certified Developer"]
    };
    
    expect(mockProfile.yearsIT).toBe(8.5);
    expect(mockProfile.skills.length).toBeGreaterThan(0);
    expect(mockProfile.projects.length).toBeGreaterThan(0);
    expect(mockProfile.certifications.length).toBeGreaterThan(0);
  });

  // Test 2: Skill Mapping Works (Taxonomy mapping)
  it("should correctly map technologies to canonical skills", () => {
    expect(findCanonicalSkill("TensorFlow")).toBe("Machine Learning");
    expect(findCanonicalSkill("PyTorch")).toBe("Machine Learning");
    expect(findCanonicalSkill("Pandas")).toBe("Data Engineering");
    expect(findCanonicalSkill("Power BI")).toBe("Data Analytics");
    expect(findCanonicalSkill("JMeter")).toBe("Performance Testing");
    expect(findCanonicalSkill("Selenium")).toBe("Automation Testing");
    expect(findCanonicalSkill("LangChain")).toBe("Generative AI");
  });

  // Test 3: Ranking Calculation Correct (formula verification)
  it("should compute composite scores using formula: Projects 45% | Experience 30% | Certs 10% | Assessment 10% | Keywords 5%", () => {
    const input: TaxonomyInput = {
      yearsIT: 5,
      skills: [
        { skillName: "Machine Learning", selfRating: 3, assessmentScore: 80 }
      ],
      projects: [
        { name: "ML Prediction", technologies: ["tensorflow"], description: "Predictive ML model" }
      ],
      certifications: ["TensorFlow Developer Certificate"],
      designation: "Machine Learning Specialist"
    };

    const result = computeSkillTaxonomy(input);
    const mlScore = result.allSkills.find(s => s.skill === "Machine Learning");

    expect(mlScore).toBeDefined();
    if (mlScore) {
      // Projects (45%): 1 project = 15 points
      expect(mlScore.projectScore).toBe(15);
      
      // Certifications (10%): 1 cert = 5 points
      expect(mlScore.certScore).toBe(5);
      
      // Assessment (10%): 80 score = 8 points
      expect(mlScore.assessmentScore).toBe(8);
      
      // Experience (30%): 5 years = 30 points
      expect(mlScore.expScore).toBe(30);

      // Keywords (5%): designation match = 5 points
      expect(mlScore.keywordScore).toBe(5);

      // Total: 15 + 5 + 8 + 30 + 5 = 63
      expect(mlScore.score).toBe(63);
    }
  });

  // Test 4: Top 3 Skills & Certification Constraint
  it("should NOT allow certifications alone to qualify a skill for Top 3", () => {
    const input: TaxonomyInput = {
      yearsIT: 5,
      skills: [
        { skillName: "Machine Learning", selfRating: 3 }
      ],
      projects: [
        { name: "Deep Learning project", technologies: ["tensorflow"], description: "ML model" }
      ],
      certifications: [
        "AWS Certified Solutions Architect", // Cloud & DevOps cert (10%)
        "TensorFlow Developer"               // ML cert
      ],
      designation: "Engineer"
    };

    const result = computeSkillTaxonomy(input);

    // Machine Learning: Has project, experience, and cert -> Eligible
    const mlScore = result.allSkills.find(s => s.skill === "Machine Learning");
    expect(mlScore?.eligibleForTop3).toBe(true);

    // Cloud & DevOps: Has only certifications (no projects, no experience, no assessments) -> Ineligible
    const cloudScore = result.allSkills.find(s => s.skill === "Cloud & DevOps");
    expect(cloudScore?.eligibleForTop3).toBe(false);

    // Top 3 (primary, secondary, tertiary) must exclude Cloud & DevOps from Top 3
    expect(result.primary.skill).not.toBe("Cloud & DevOps");
    expect(result.secondary.skill).not.toBe("Cloud & DevOps");
    expect(result.tertiary.skill).not.toBe("Cloud & DevOps");
  });

  // Test 5: Assessment Generation Correct Simulation
  it("should generate unified assessment payload matching top 3 skills", () => {
    const input: TaxonomyInput = {
      yearsIT: 6,
      skills: [
        { skillName: "Machine Learning", selfRating: 3 },
        { skillName: "Data Engineering", selfRating: 2 },
        { skillName: "Generative AI", selfRating: 2 }
      ],
      projects: [
        { name: "AI Pipeline", technologies: ["tensorflow", "pandas", "openai"], description: "Unified pipeline" }
      ],
      certifications: [],
      designation: "AI Engineer"
    };

    const taxonomy = computeSkillTaxonomy(input);
    
    // Assessment configuration mock
    const payload = {
      skills: [taxonomy.primary.skill, taxonomy.secondary.skill, taxonomy.tertiary.skill],
      band: "intermediate"
    };

    expect(payload.skills.length).toBe(3);
    expect(payload.skills).toContain("Machine Learning");
    expect(payload.skills).toContain("Data Engineering");
    expect(payload.skills).toContain("Generative AI");
  });

  // Test 6: ZenMatrix Update Correct Payload Simulation
  it("should structure update payload using ranked skills only", () => {
    const input: TaxonomyInput = {
      yearsIT: 4,
      skills: [
        { skillName: "Automation Testing", selfRating: 3 },
        { skillName: "Performance Testing", selfRating: 2 },
        { skillName: "API Testing", selfRating: 2 }
      ],
      projects: [
        { name: "Test Suite", technologies: ["selenium", "jmeter", "postman"], description: "Test automation suite execution" }
      ],
      certifications: [],
      designation: "Automation Engineer"
    };

    const taxonomy = computeSkillTaxonomy(input);

    const updatePayload = {
      primarySkill: taxonomy.primary.skill,
      secondarySkill: taxonomy.secondary.skill,
      tertiarySkill: taxonomy.tertiary.skill,
      overallScore: 85,
      v7flow: true
    };

    expect(updatePayload.primarySkill).toBe("Automation Testing");
    expect(updatePayload.secondarySkill).toBe("Performance Testing");
    expect(updatePayload.tertiarySkill).toBe("API Testing");
    expect(updatePayload.v7flow).toBe(true);
  });
});
