-- ============================================================
-- ZENSAR SKILL NAVIGATOR — COMPLETE DATABASE SETUP
-- Run this on a fresh PostgreSQL database: skillmatrix
-- Version: May 2026 (synced with server-postgres.cjs)
-- ============================================================
-- Usage:
--   psql -U postgres -c "CREATE DATABASE skillmatrix;"
--   psql -U postgres -d skillmatrix -f COMPLETE_DATABASE_SETUP.sql
-- ============================================================

-- ============================================================
-- 1. EMPLOYEES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id                 VARCHAR(50)  PRIMARY KEY,
  zensar_id          VARCHAR(50)  UNIQUE,
  name               VARCHAR(255) NOT NULL,
  email              VARCHAR(255) UNIQUE,
  phone              VARCHAR(50),
  designation        VARCHAR(255),
  department         VARCHAR(255),
  location           VARCHAR(255),
  years_it           INTEGER      DEFAULT 0,
  years_zensar       INTEGER      DEFAULT 0,
  password           VARCHAR(255),
  overall_capability INTEGER      DEFAULT 0,
  submitted          BOOLEAN      DEFAULT FALSE,
  resume_uploaded    BOOLEAN      DEFAULT FALSE,
  primary_skill      VARCHAR(255),
  primary_domain     VARCHAR(255),
  secondary_skill    VARCHAR(255),
  tertiary_skill     VARCHAR(255),
  grade              VARCHAR(50),
  created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_email     ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_zensar_id ON employees(zensar_id);
CREATE INDEX IF NOT EXISTS idx_employees_submitted ON employees(submitted);

-- ============================================================
-- 2. SKILLS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
  id             SERIAL       PRIMARY KEY,
  employee_id    VARCHAR(50)  REFERENCES employees(id) ON DELETE CASCADE,
  skill_name     VARCHAR(255) NOT NULL,
  self_rating    INTEGER      DEFAULT 0 CHECK (self_rating BETWEEN 0 AND 5),
  manager_rating INTEGER      CHECK (manager_rating BETWEEN 0 AND 5),
  validated      BOOLEAN      DEFAULT FALSE,
  allocation_readiness INTEGER DEFAULT 0,
  allocation_risk      VARCHAR(20) DEFAULT 'Low',
  ready_for_allocation BOOLEAN DEFAULT TRUE,
  capability_score     INTEGER DEFAULT 0,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skills_employee_id ON skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_skills_skill_name  ON skills(skill_name);

-- ============================================================
-- 3. PROJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id              SERIAL       PRIMARY KEY,
  employee_id     VARCHAR(50)  REFERENCES employees(id) ON DELETE CASCADE,
  project_name    VARCHAR(255) NOT NULL,
  role            VARCHAR(255),
  client          VARCHAR(255),
  domain          VARCHAR(255),
  start_date      DATE,
  end_date        DATE,
  description     TEXT,
  technologies    TEXT[]       DEFAULT '{}',
  skills_used     TEXT[]       DEFAULT '{}',
  team_size       INTEGER      DEFAULT 0,
  outcome         TEXT,
  is_ongoing      BOOLEAN      DEFAULT FALSE,
  is_ai_extracted BOOLEAN      DEFAULT FALSE,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_employee_id ON projects(employee_id);
CREATE INDEX IF NOT EXISTS idx_projects_client      ON projects(client);

-- Prevent duplicate project names per employee
DELETE FROM projects p1 USING projects p2
  WHERE p1.id > p2.id
    AND p1.employee_id = p2.employee_id
    AND LOWER(TRIM(p1.project_name)) = LOWER(TRIM(p2.project_name));

-- ============================================================
-- 4. CERTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS certifications (
  id                   SERIAL       PRIMARY KEY,
  employee_id          VARCHAR(50)  REFERENCES employees(id) ON DELETE CASCADE,
  cert_name            VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255),
  issue_date           DATE,
  expiry_date          DATE,
  no_expiry            BOOLEAN      DEFAULT FALSE,
  credential_id        VARCHAR(255),
  credential_url       TEXT,
  is_ai_extracted      BOOLEAN      DEFAULT FALSE,
  created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_certifications_employee_id ON certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_certifications_cert_name   ON certifications(cert_name);

-- ============================================================
-- 5. EDUCATION TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS education (
  id             SERIAL       PRIMARY KEY,
  employee_id    VARCHAR(50)  REFERENCES employees(id) ON DELETE CASCADE,
  degree         VARCHAR(255),
  institution    VARCHAR(255),
  field_of_study VARCHAR(255),
  start_date     VARCHAR(50),
  end_date       VARCHAR(50),
  year           VARCHAR(50),
  grade          VARCHAR(50),
  description    TEXT,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_education_employee_id ON education(employee_id);

-- ============================================================
-- 6. ACHIEVEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  id              VARCHAR(50)  PRIMARY KEY,
  employee_id     VARCHAR(50)  REFERENCES employees(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  award_type      VARCHAR(50)  DEFAULT 'Other',
  category        VARCHAR(50)  DEFAULT 'Other',
  date_received   VARCHAR(50),
  description     TEXT,
  issuer          VARCHAR(255),
  project_context VARCHAR(255),
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_achievements_employee_id ON achievements(employee_id);

-- ============================================================
-- 7. APP SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Default admin credentials (change password after first login!)
INSERT INTO app_settings (key, value) VALUES ('admin_id',       'admin')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('admin_password', 'admin123')
  ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 8. BFSI ROLES TABLE (Reactive + Proactive SRFs)
-- ============================================================
CREATE TABLE IF NOT EXISTS bfsi_roles (
  id              SERIAL       PRIMARY KEY,
  role_id         VARCHAR(50)  UNIQUE NOT NULL,
  role_title      VARCHAR(255) NOT NULL,
  client_name     VARCHAR(255),
  required_skills TEXT[]       DEFAULT '{}',
  days_open       INTEGER      DEFAULT 0,
  status          VARCHAR(50)  DEFAULT 'Open',
  fill_priority   VARCHAR(50)  DEFAULT 'Medium',
  assigned_spoc   VARCHAR(255),
  created_date    DATE         DEFAULT CURRENT_DATE,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  hire_type       VARCHAR(50),
  job_description TEXT,
  srf_no          VARCHAR(50),
  aging_bucket    VARCHAR(50),
  type            VARCHAR(50),
  location        VARCHAR(255),
  candidate_count INTEGER      DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bfsi_roles_status ON bfsi_roles(status);
CREATE INDEX IF NOT EXISTS idx_bfsi_roles_type   ON bfsi_roles(type);
CREATE INDEX IF NOT EXISTS idx_bfsi_roles_skill  ON bfsi_roles USING GIN(required_skills);

-- ============================================================
-- 9. BFSI WORKFORCE TABLE (Pool + Deallocation employees)
-- ============================================================
CREATE TABLE IF NOT EXISTS bfsi_workforce (
  id                  SERIAL       PRIMARY KEY,
  employee_id         VARCHAR(50)  NOT NULL UNIQUE,
  employee_name       VARCHAR(255) NOT NULL,
  email               VARCHAR(255),
  current_skills      TEXT[]       DEFAULT '{}',
  certifications      TEXT[]       DEFAULT '{}',
  experience_years    INTEGER      DEFAULT 0,
  status              VARCHAR(50)  DEFAULT 'Available',
  doj                 DATE,
  primary_skill       VARCHAR(255),
  domain_expertise    TEXT[]       DEFAULT '{}',
  reskilling_program  VARCHAR(255),
  graduation_date     DATE,
  bench_days          INTEGER      DEFAULT 0,
  reject_count        INTEGER      DEFAULT 0,
  band                VARCHAR(50),
  billing_status      VARCHAR(50),
  project_name        VARCHAR(255),
  customer            VARCHAR(255),
  pm_name             VARCHAR(255),
  location            VARCHAR(255),
  aging_days          INTEGER      DEFAULT 0,
  practice_name       VARCHAR(255),
  service_line        VARCHAR(255),
  deployable_flag     BOOLEAN      DEFAULT FALSE,
  rmg_status          VARCHAR(100),
  pool_status         VARCHAR(100),
  deallocation_date   DATE,
  return_to_pool_date DATE,
  release_reason      VARCHAR(255),
  grade               VARCHAR(50),
  comments            TEXT,
  srf_no              VARCHAR(50),
  vertical            VARCHAR(100),
  rbu                 VARCHAR(100),
  vbu                 VARCHAR(100),
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_status        ON bfsi_workforce(status);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_billing       ON bfsi_workforce(billing_status);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_primary_skill ON bfsi_workforce(primary_skill);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_location      ON bfsi_workforce(location);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_dealloc_date  ON bfsi_workforce(deallocation_date);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_skills        ON bfsi_workforce USING GIN(current_skills);

-- ============================================================
-- 10. BFSI CERTIFICATIONS PIPELINE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS bfsi_certifications (
  id                  SERIAL       PRIMARY KEY,
  employee_id         VARCHAR(50)  REFERENCES bfsi_workforce(employee_id) ON DELETE CASCADE,
  cert_name           VARCHAR(255) NOT NULL,
  provider            VARCHAR(255),
  start_date          DATE,
  expected_completion DATE,
  status              VARCHAR(50)  DEFAULT 'In Progress',
  duration_weeks      INTEGER      DEFAULT 4,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bfsi_certifications_emp    ON bfsi_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_bfsi_certifications_status ON bfsi_certifications(status);

-- ============================================================
-- 11. BFSI ROLE ASSIGNMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS bfsi_assignments (
  id                SERIAL       PRIMARY KEY,
  role_id           VARCHAR(50)  REFERENCES bfsi_roles(role_id) ON DELETE CASCADE,
  employee_id       VARCHAR(50)  REFERENCES bfsi_workforce(employee_id) ON DELETE CASCADE,
  match_score       INTEGER      DEFAULT 0,
  assignment_status VARCHAR(50)  DEFAULT 'Shortlisted',
  assigned_date     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_bfsi_assignments_role ON bfsi_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_bfsi_assignments_emp  ON bfsi_assignments(employee_id);

-- ============================================================
-- 12. BFSI UPLOAD HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS bfsi_uploads (
  id                SERIAL       PRIMARY KEY,
  filename          VARCHAR(255),
  uploaded_by       VARCHAR(255),
  upload_date       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  records_processed INTEGER      DEFAULT 0,
  status            VARCHAR(50)  DEFAULT 'Success',
  error_message     TEXT
);

-- ============================================================
-- 13. BFSI SUMMARY DATA TABLE (from Excel Summary sheet)
-- ============================================================
CREATE TABLE IF NOT EXISTS bfsi_summary_data (
  id                  SERIAL       PRIMARY KEY,
  primary_skill       VARCHAR(255) UNIQUE NOT NULL,
  reactive_srf        INTEGER      DEFAULT 0,
  reactive_backup     INTEGER      DEFAULT 0,
  demand_forecast     INTEGER      DEFAULT 0,
  proactive           INTEGER      DEFAULT 0,
  demand_total        INTEGER      DEFAULT 0,
  pool_supply         INTEGER      DEFAULT 0,
  deallocation_supply INTEGER      DEFAULT 0,
  supply_total        INTEGER      DEFAULT 0,
  gap                 INTEGER      DEFAULT 0,
  offers_reactive     INTEGER      DEFAULT 0,
  offers_proactive    INTEGER      DEFAULT 0,
  offers_total        INTEGER      DEFAULT 0,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bfsi_summary_skill ON bfsi_summary_data(primary_skill);

-- ============================================================
-- SAFE ALTER TABLE — add any missing columns to existing DBs
-- (Safe to run on both fresh and existing databases)
-- ============================================================
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS vertical            VARCHAR(100);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS rbu                 VARCHAR(100);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS vbu                 VARCHAR(100);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS grade               VARCHAR(50);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS comments            TEXT;
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS srf_no              VARCHAR(50);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS pool_status         VARCHAR(100);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS rmg_status          VARCHAR(100);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS deallocation_date   DATE;
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS return_to_pool_date DATE;
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS release_reason      VARCHAR(255);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS deployable_flag     BOOLEAN DEFAULT FALSE;
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS service_line        VARCHAR(255);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS practice_name       VARCHAR(255);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS band                VARCHAR(50);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS billing_status      VARCHAR(50);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS project_name        VARCHAR(255);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS customer            VARCHAR(255);
ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS pm_name             VARCHAR(255);

ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS type            VARCHAR(50);
ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS location        VARCHAR(255);
ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS candidate_count INTEGER DEFAULT 0;
ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS srf_no          VARCHAR(50);
ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS aging_bucket    VARCHAR(50);

ALTER TABLE education ADD COLUMN IF NOT EXISTS year VARCHAR(50);
ALTER TABLE bfsi_uploads ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- ZENASSESS V10 BACKEND FIXES (June 2026)
-- ============================================================
-- Add missing columns to employees table for grade-based assessment
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tertiary_skill VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade VARCHAR(50);

-- Create or extend zenassess_sessions table for per-skill tracking
CREATE TABLE IF NOT EXISTS zenassess_sessions (
  id              SERIAL       PRIMARY KEY,
  employee_id     VARCHAR(50)  REFERENCES employees(id) ON DELETE CASCADE,
  skill_name      VARCHAR(255) NOT NULL,
  validated_level VARCHAR(50),
  attempt_number  INTEGER      DEFAULT 1,
  silent_drop_path TEXT,
  badge_awarded   BOOLEAN      DEFAULT FALSE,
  self_claimed_level_at_test VARCHAR(50),
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to skills table
ALTER TABLE skills ADD COLUMN IF NOT EXISTS verified_badge_level VARCHAR(50);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS self_claimed_level VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_zenassess_employee_skill ON zenassess_sessions(employee_id, skill_name);

-- ============================================================
-- VERIFICATION QUERY — run after setup to confirm all tables
-- ============================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND c.table_name = columns.table_name) AS column_count
FROM information_schema.tables c
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================================
-- EXPECTED OUTPUT — 13 tables:
--   achievements        | bfsi_assignments    | bfsi_certifications
--   bfsi_roles          | bfsi_summary_data   | bfsi_uploads
--   bfsi_workforce      | certifications      | education
--   employees           | projects            | skills
--   app_settings
-- ============================================================
