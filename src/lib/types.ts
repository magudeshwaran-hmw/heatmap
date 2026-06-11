export type UserRole = 'employee' | 'admin';

export type SkillCategory = 'Tool' | 'Technology' | 'Application' | 'Domain' | 'TestingType' | 'DevOps' | 'AI';

export type ProficiencyLevel = 0 | 1 | 2 | 3;

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
}

export interface SkillRating {
  skillId: string;
  selfRating: ProficiencyLevel;
  managerRating: ProficiencyLevel | null;
  validated: boolean;
  aiDetected?: boolean;  // true = AI filled this; user cannot change it
  lastValidationDate?: string;
  lastProjectDate?: string;
  lastCertificationDate?: string;
  lastUsedDate?: string;
  freshnessScore?: number;
  freshnessStatus?: string;
  revalidationReq?: boolean;
}


export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  designation: string;
  department: string;
  location?: string;
  yearsIT: number;
  yearsZensar: number;
  primarySkill: string;
  primaryDomain: string;
  skills: SkillRating[];
  resumeUploaded: boolean;
  overallCapability: number;
  submitted?: boolean;
  submittedAt?: string;
  grade?: string;
}

export interface GrowthPlan {
  id: string;
  employeeId: string;
  skillId: string;
  currentLevel: ProficiencyLevel;
  targetLevel: ProficiencyLevel;
  targetDate: string;
  progress: number;
  status: 'not-started' | 'in-progress' | 'completed';
  actions: string[];
}

export const PROFICIENCY_DESCRIPTIONS: Record<ProficiencyLevel, { label: string; description: string }> = {
  0: { label: 'Not Applicable', description: 'No experience or not relevant to current role' },
  1: { label: 'Beginner', description: 'Basic understanding, needs guidance and supervision' },
  2: { label: 'Intermediate', description: 'Can work independently, good practical knowledge' },
  3: { label: 'Expert', description: 'Deep expertise, can mentor others and lead initiatives' },
};
