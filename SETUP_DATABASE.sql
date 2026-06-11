-- =====================================================================
--  ZenSkill Navigator — Complete Database Setup
-- =====================================================================
--  Run this ONCE on a new machine against an empty `skillmatrix` database.
--
--  pgAdmin:  open the Query Tool on the skillmatrix database,
--            open this file, press F5 (Execute).
--  psql:     \c skillmatrix
--            \i /path/to/SETUP_DATABASE.sql
--
--  Everything below is idempotent (IF NOT EXISTS / ON CONFLICT), so it is
--  safe to re-run. The schema mirrors server-postgres.cjs exactly, so the
--  app boots without needing its automatic migrations to run first.
-- =====================================================================

-- ---------------------------------------------------------------------
--  SECTION 1 — Core application tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employees (
  id                 VARCHAR(50) PRIMARY KEY,
  zensar_id          VARCHAR(50) UNIQUE,
  name               VARCHAR(255) NOT NULL,
  email              VARCHAR(255) UNIQUE,
  phone              VARCHAR(50),
  designation        VARCHAR(255),
  department         VARCHAR(255),
  location           VARCHAR(255),
  grade              VARCHAR(50),
  years_it           INTEGER DEFAULT 0,
  years_zensar       INTEGER DEFAULT 0,
  password           VARCHAR(255),
  overall_capability INTEGER DEFAULT 0,
  submitted          BOOLEAN DEFAULT FALSE,
  resume_uploaded    BOOLEAN DEFAULT FALSE,
  github_username    VARCHAR(100),
  primary_skill      VARCHAR(255),
  secondary_skill    VARCHAR(255),
  tertiary_skill     VARCHAR(255),
  primary_domain     VARCHAR(255),
  -- Allocate / Reserve tracking (Find a Match)
  status             VARCHAR(50) DEFAULT 'available',
  allocated_srf      VARCHAR(100),
  allocated_role     VARCHAR(255),
  allocated_at       TIMESTAMP,
  allocated_by       VARCHAR(100),
  reserved_srf       VARCHAR(100),
  reserved_role      VARCHAR(255),
  reserved_at        TIMESTAMP,
  reserved_by        VARCHAR(100),
  -- Pool / bench flags
  is_pool            BOOLEAN DEFAULT FALSE,
  pool_source        VARCHAR(50),
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skills (
  id                     SERIAL PRIMARY KEY,
  employee_id            VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  skill_name             VARCHAR(255) NOT NULL,
  self_rating            INTEGER DEFAULT 0,
  manager_rating         INTEGER,
  validated              BOOLEAN DEFAULT FALSE,
  verified_badge_level   VARCHAR(50) DEFAULT NULL,
  self_claimed_level     VARCHAR(50) DEFAULT NULL,
  validated_level        VARCHAR(50) DEFAULT 'Not Validated',
  assessment_score       INTEGER DEFAULT 0,
  capability_score       INTEGER DEFAULT 0,
  technical_depth        INTEGER DEFAULT 0,
  project_strength       INTEGER DEFAULT 0,
  certification_strength INTEGER DEFAULT 0,
  mentoring_strength     INTEGER DEFAULT 0,
  github_strength        INTEGER DEFAULT 0,
  confidence_score       INTEGER DEFAULT 0,
  freshness_score        INTEGER DEFAULT 100,
  freshness_status       VARCHAR(20) DEFAULT 'active',
  revalidation_req       BOOLEAN DEFAULT FALSE,
  source                 VARCHAR(50) DEFAULT 'self',
  hidden_skill           BOOLEAN DEFAULT FALSE,
  discovery_source       VARCHAR(50),
  allocation_readiness   INTEGER DEFAULT 0,
  allocation_risk        VARCHAR(20) DEFAULT 'Low',
  ready_for_allocation   BOOLEAN DEFAULT TRUE,
  project_allocation_score INTEGER DEFAULT 0,
  leadership_signals      TEXT,
  architecture_signals    TEXT,
  decision_making_signals TEXT,
  mentoring_signals       TEXT,
  domain_expertise        TEXT,
  last_used_date          DATE,
  last_project_date       DATE,
  last_validated_date     DATE,
  last_cert_date          DATE,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, skill_name)
);

CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  employee_id   VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  project_name  VARCHAR(255) NOT NULL,
  role          VARCHAR(255),
  client        VARCHAR(255),
  domain        VARCHAR(255),
  start_date    DATE,
  end_date      DATE,
  description   TEXT,
  technologies  TEXT[],
  skills_used   TEXT[],
  team_size     INTEGER DEFAULT 0,
  outcome       TEXT,
  is_ongoing    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certifications (
  id                   SERIAL PRIMARY KEY,
  employee_id          VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  cert_name            VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255),
  issue_date           DATE,
  expiry_date          DATE,
  no_expiry            BOOLEAN DEFAULT FALSE,
  credential_id        VARCHAR(255),
  credential_url       TEXT,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS education (
  id             SERIAL PRIMARY KEY,
  employee_id    VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  degree         VARCHAR(255),
  institution    VARCHAR(255),
  field_of_study VARCHAR(255),
  start_date     VARCHAR(50),
  end_date       VARCHAR(50),
  grade          VARCHAR(50),
  description    TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievements (
  id              VARCHAR(50) PRIMARY KEY,
  employee_id     VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  award_type      VARCHAR(50) DEFAULT 'Other',
  category        VARCHAR(50) DEFAULT 'Other',
  date_received   VARCHAR(50),
  description     TEXT,
  issuer          VARCHAR(255),
  project_context VARCHAR(255),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pool_employees (
  id              VARCHAR(50) PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  designation     VARCHAR(255),
  department      VARCHAR(255),
  grade           VARCHAR(50),
  years_it        INTEGER DEFAULT 0,
  location        VARCHAR(255),
  primary_skill   VARCHAR(255),
  secondary_skill VARCHAR(255),
  tertiary_skill  VARCHAR(255),
  source          VARCHAR(50) DEFAULT 'pool',
  resume_url      VARCHAR(500),
  added_at        TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allocation_log (
  id          SERIAL PRIMARY KEY,
  employee_id VARCHAR(100),
  srf_id      VARCHAR(100),
  role_name   VARCHAR(255),
  action      VARCHAR(50) DEFAULT 'allocated',
  actioned_by VARCHAR(100),
  actioned_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------
--  SECTION 2 — Security / auth tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  revoked     BOOLEAN DEFAULT FALSE,
  revoked_at  TIMESTAMP,
  role        VARCHAR(20) DEFAULT 'employee',
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  employee_id VARCHAR(50),
  role        VARCHAR(20),
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  resource_id VARCHAR(100),
  old_value   JSONB,
  new_value   JSONB,
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  status      VARCHAR(20) DEFAULT 'success',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_sessions (
  id             SERIAL PRIMARY KEY,
  employee_id    VARCHAR(50),
  login_id       VARCHAR(255),
  success        BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),
  ip_address     VARCHAR(50),
  user_agent     TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
--  SECTION 3 — ZenAssess (assessment engine) tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS question_bank (
  id             SERIAL PRIMARY KEY,
  skill_name     VARCHAR(255) NOT NULL,
  band           VARCHAR(20)  NOT NULL,
  difficulty     VARCHAR(20)  NOT NULL,
  question_text  TEXT NOT NULL,
  options        JSONB NOT NULL,
  correct_option INTEGER NOT NULL,
  explanation    TEXT,
  topic          VARCHAR(100),
  points         INTEGER DEFAULT 1,
  time_seconds   INTEGER DEFAULT 60,
  active         BOOLEAN DEFAULT TRUE,
  version        INTEGER DEFAULT 1,
  created_by     VARCHAR(50),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assessment_analytics (
  id             SERIAL PRIMARY KEY,
  session_id     VARCHAR(50),
  employee_id    VARCHAR(50) NOT NULL,
  skill_name     VARCHAR(255) NOT NULL,
  band           VARCHAR(20) NOT NULL,
  question_id    INTEGER,
  time_taken_sec INTEGER,
  answer_given   INTEGER,
  is_correct     BOOLEAN,
  answer_changes INTEGER DEFAULT 0,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS manager_reviews (
  id                  SERIAL PRIMARY KEY,
  session_id          VARCHAR(50) NOT NULL,
  employee_id         VARCHAR(50) NOT NULL,
  skill_name          VARCHAR(255) NOT NULL,
  reviewer_id         VARCHAR(50),
  review_status       VARCHAR(30) DEFAULT 'pending',
  review_notes        TEXT,
  final_decision      VARCHAR(20),
  sla_deadline        TIMESTAMP,
  review_started_at   TIMESTAMP,
  review_completed_at TIMESTAMP,
  escalated_to        VARCHAR(50),
  escalation_reason   TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- zenassess_sessions: all columns the app adds via migrations, consolidated.
CREATE TABLE IF NOT EXISTS zenassess_sessions (
  session_id    VARCHAR(50)  PRIMARY KEY,
  employee_id   VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  level_path    VARCHAR(20)  NOT NULL DEFAULT 'beginner',
  score         NUMERIC(5,2) DEFAULT 0,
  status        VARCHAR(30)  NOT NULL DEFAULT 'pending',
  assigned_level VARCHAR(30) DEFAULT NULL,
  retry_after   TIMESTAMP    DEFAULT NULL,
  questions     JSONB        DEFAULT '[]',
  answers       JSONB        DEFAULT '{}',
  evidence      JSONB        DEFAULT '{}',
  study_path    JSONB        DEFAULT NULL,
  section_scores JSONB       DEFAULT '{}',
  -- 3-skill sequential engine
  skill_name    VARCHAR(255) DEFAULT NULL,
  validated_level VARCHAR(30) DEFAULT NULL,
  attempt_number INTEGER DEFAULT 1,
  silent_drop_path VARCHAR(120) DEFAULT NULL,
  badge_awarded  BOOLEAN DEFAULT FALSE,
  self_claimed_level_at_test VARCHAR(50) DEFAULT NULL,
  coding_results JSONB DEFAULT NULL,
  github_evaluation JSONB DEFAULT NULL,
  timing_analysis JSONB DEFAULT NULL,
  -- integrity / proctoring
  question_ids        INTEGER[],
  session_fingerprint VARCHAR(255),
  tab_switch_count    INTEGER DEFAULT 0,
  copy_paste_count    INTEGER DEFAULT 0,
  answer_change_count INTEGER DEFAULT 0,
  time_per_question   JSONB DEFAULT '{}',
  integrity_score     INTEGER DEFAULT 100,
  integrity_flags     JSONB DEFAULT '[]',
  fullscreen_exit_count INTEGER DEFAULT 0,
  browser_blur_count  INTEGER DEFAULT 0,
  devtools_detected   BOOLEAN DEFAULT FALSE,
  typing_velocity_log JSONB DEFAULT '[]',
  answer_snapshots    JSONB DEFAULT '[]',
  -- scoring breakdown
  mcq_score           NUMERIC(5,2),
  contribution_score  NUMERIC(5,2),
  evidence_score      NUMERIC(5,2),
  final_score         NUMERIC(5,2),
  explain_score_breakdown JSONB DEFAULT '{}',
  contribution_breakdown  JSONB DEFAULT '{}',
  github_metadata     JSONB DEFAULT '{}',
  -- allocation readiness
  allocation_readiness_score INTEGER DEFAULT 0,
  allocation_risk     VARCHAR(20) DEFAULT 'Low',
  ready_for_allocation BOOLEAN DEFAULT TRUE,
  project_allocation_score INTEGER DEFAULT 0,
  -- expert path evaluation
  expert_profile        JSONB DEFAULT '{}',
  extracted_evidence    JSONB DEFAULT '{}',
  evidence_evaluation   JSONB DEFAULT '{}',
  technical_discussion  JSONB DEFAULT '{}',
  leadership_discussion JSONB DEFAULT '{}',
  consistency_analysis  JSONB DEFAULT '{}',
  ai_recommendation     JSONB DEFAULT '{}',
  authenticity_analysis JSONB DEFAULT '{}',
  leadership_signals      TEXT,
  architecture_signals    TEXT,
  decision_making_signals TEXT,
  mentoring_signals       TEXT,
  domain_expertise        TEXT,
  sla_deadline          TIMESTAMP,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zenassess_evidence (
  evidence_id           VARCHAR(50)  PRIMARY KEY,
  session_id            VARCHAR(50)  NOT NULL REFERENCES zenassess_sessions(session_id) ON DELETE CASCADE,
  employee_id           VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  evidence_type         VARCHAR(100) NOT NULL,
  original_filename     VARCHAR(255) NOT NULL,
  upload_timestamp      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  extracted_skills      TEXT[]       DEFAULT '{}',
  detected_technologies TEXT[]       DEFAULT '{}',
  authenticity_score    INTEGER      DEFAULT 100,
  confidence_score      INTEGER      DEFAULT 100,
  evaluation_status     VARCHAR(50)  NOT NULL DEFAULT 'pending',
  manager_review_status VARCHAR(50)  NOT NULL DEFAULT 'pending'
);

-- ---------------------------------------------------------------------
--  SECTION 4 — BFSI demand/supply tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bfsi_roles (
  id              SERIAL PRIMARY KEY,
  role_id         VARCHAR(50) UNIQUE NOT NULL,
  role_title      VARCHAR(255) NOT NULL,
  client_name     VARCHAR(255),
  required_skills TEXT[],
  days_open       INTEGER DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'Open',
  fill_priority   VARCHAR(50) DEFAULT 'Medium',
  assigned_spoc   VARCHAR(255),
  created_date    DATE DEFAULT CURRENT_DATE,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hire_type       VARCHAR(50),
  job_description TEXT,
  srf_no          VARCHAR(50),
  aging_bucket    VARCHAR(50),
  type            VARCHAR(50),
  location        VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS bfsi_workforce (
  id                SERIAL PRIMARY KEY,
  employee_id       VARCHAR(50) NOT NULL UNIQUE,
  employee_name     VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  current_skills    TEXT[],
  certifications    TEXT[],
  experience_years  INTEGER DEFAULT 0,
  status            VARCHAR(50) DEFAULT 'Available',
  doj               DATE,
  primary_skill     VARCHAR(255),
  domain_expertise  TEXT[],
  reskilling_program VARCHAR(255),
  graduation_date   DATE,
  bench_days        INTEGER DEFAULT 0,
  reject_count      INTEGER DEFAULT 0,
  band              VARCHAR(50),
  billing_status    VARCHAR(50),
  project_name      VARCHAR(255),
  customer          VARCHAR(255),
  pm_name           VARCHAR(255),
  location          VARCHAR(255),
  aging_days        INTEGER DEFAULT 0,
  practice_name     VARCHAR(255),
  service_line      VARCHAR(255),
  deployable_flag   BOOLEAN DEFAULT FALSE,
  rmg_status        VARCHAR(50),
  pool_status       VARCHAR(100),
  deallocation_date DATE,
  return_to_pool_date DATE,
  release_reason    VARCHAR(255),
  grade             VARCHAR(50),
  comments          TEXT,
  srf_no            VARCHAR(50),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bfsi_certifications (
  id                  SERIAL PRIMARY KEY,
  employee_id         VARCHAR(50) REFERENCES bfsi_workforce(employee_id) ON DELETE CASCADE,
  cert_name           VARCHAR(255) NOT NULL,
  provider            VARCHAR(255),
  start_date          DATE,
  expected_completion DATE,
  status              VARCHAR(50) DEFAULT 'In Progress',
  duration_weeks      INTEGER DEFAULT 4,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bfsi_assignments (
  id                SERIAL PRIMARY KEY,
  role_id           VARCHAR(50) REFERENCES bfsi_roles(role_id) ON DELETE CASCADE,
  employee_id       VARCHAR(50) REFERENCES bfsi_workforce(employee_id) ON DELETE CASCADE,
  match_score       INTEGER DEFAULT 0,
  assignment_status VARCHAR(50) DEFAULT 'Shortlisted',
  allocation_readiness INTEGER DEFAULT 0,
  confidence_at_alloc  INTEGER DEFAULT 0,
  assigned_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (role_id, employee_id)
);

CREATE TABLE IF NOT EXISTS bfsi_uploads (
  id                SERIAL PRIMARY KEY,
  filename          VARCHAR(255),
  uploaded_by       VARCHAR(255),
  upload_date       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  records_processed INTEGER DEFAULT 0,
  status            VARCHAR(50) DEFAULT 'Success'
);

CREATE TABLE IF NOT EXISTS bfsi_summary_data (
  id                  SERIAL PRIMARY KEY,
  primary_skill       VARCHAR(255) UNIQUE NOT NULL,
  reactive_srf        INTEGER DEFAULT 0,
  reactive_backup     INTEGER DEFAULT 0,
  demand_forecast     INTEGER DEFAULT 0,
  proactive           INTEGER DEFAULT 0,
  demand_total        INTEGER DEFAULT 0,
  pool_supply         INTEGER DEFAULT 0,
  deallocation_supply INTEGER DEFAULT 0,
  supply_total        INTEGER DEFAULT 0,
  gap                 INTEGER DEFAULT 0,
  offers_reactive     INTEGER DEFAULT 0,
  offers_proactive    INTEGER DEFAULT 0,
  offers_total        INTEGER DEFAULT 0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
--  SECTION 5 — Indexes
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_employees_email        ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_zensar        ON employees(zensar_id);
CREATE INDEX IF NOT EXISTS idx_skills_employee         ON skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_skills_name             ON skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_projects_employee_id    ON projects(employee_id);
CREATE INDEX IF NOT EXISTS idx_certifications_employee_id ON certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_education_employee_id    ON education(employee_id);
CREATE INDEX IF NOT EXISTS idx_achievements_employee_id ON achievements(employee_id);

CREATE INDEX IF NOT EXISTS idx_rt_employee   ON refresh_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_rt_hash       ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_al_employee   ON audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_al_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_al_created    ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ls_employee   ON login_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_ls_ip         ON login_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_ls_created    ON login_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_qb_skill      ON question_bank(skill_name);
CREATE INDEX IF NOT EXISTS idx_qb_band       ON question_bank(band);
CREATE INDEX IF NOT EXISTS idx_qb_active     ON question_bank(active);
CREATE INDEX IF NOT EXISTS idx_aa_session    ON assessment_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_aa_employee   ON assessment_analytics(employee_id);
CREATE INDEX IF NOT EXISTS idx_aa_skill      ON assessment_analytics(skill_name);
CREATE INDEX IF NOT EXISTS idx_mr_session    ON manager_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_mr_employee   ON manager_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_mr_status     ON manager_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_sessions_employee ON zenassess_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_zenassess_status  ON zenassess_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ze_session    ON zenassess_evidence(session_id);
CREATE INDEX IF NOT EXISTS idx_ze_employee   ON zenassess_evidence(employee_id);

CREATE INDEX IF NOT EXISTS idx_bfsi_roles_status     ON bfsi_roles(status);
CREATE INDEX IF NOT EXISTS idx_bfsi_roles_type       ON bfsi_roles(type);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_status ON bfsi_workforce(status);
CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_billing ON bfsi_workforce(billing_status);
CREATE INDEX IF NOT EXISTS idx_bfsi_certifications_emp ON bfsi_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_bfsi_assignments_role ON bfsi_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_bfsi_summary_skill    ON bfsi_summary_data(primary_skill);

-- ---------------------------------------------------------------------
--  SECTION 6 — Default admin login
-- ---------------------------------------------------------------------
INSERT INTO app_settings (key, value)
VALUES ('admin_id', 'admin'), ('admin_password', 'admin123')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
--  SECTION 7 — SQL sandbox schema (used by coding assessments)
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS zenassess_sandbox;

CREATE TABLE IF NOT EXISTS zenassess_sandbox.employees (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100),
  department VARCHAR(100),
  salary     NUMERIC(10,2),
  manager_id INTEGER,
  hire_date  DATE,
  location   VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS zenassess_sandbox.products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200),
  category    VARCHAR(100),
  price       NUMERIC(10,2),
  stock       INTEGER,
  supplier_id INTEGER
);

CREATE TABLE IF NOT EXISTS zenassess_sandbox.orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER,
  product_id   INTEGER,
  quantity     INTEGER,
  order_date   DATE,
  status       VARCHAR(50),
  total_amount NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS zenassess_sandbox.customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200),
  email      VARCHAR(200),
  country    VARCHAR(100),
  created_at DATE
);

-- Seed sandbox sample data (only if employees table is empty)
INSERT INTO zenassess_sandbox.employees (name, department, salary, manager_id, hire_date, location)
SELECT * FROM (VALUES
  ('Alice Johnson', 'Engineering', 95000, NULL::INTEGER, DATE '2018-01-15', 'London'),
  ('Bob Smith',     'Engineering', 80000, 1,    DATE '2019-03-20', 'Manchester'),
  ('Carol White',   'QA',          72000, 1,    DATE '2020-06-10', 'London'),
  ('David Brown',   'Engineering', 88000, 1,    DATE '2017-09-05', 'London'),
  ('Eve Davis',     'QA',          68000, 3,    DATE '2021-01-20', 'Edinburgh'),
  ('Frank Wilson',  'DevOps',      91000, 1,    DATE '2016-11-30', 'London'),
  ('Grace Lee',     'DevOps',      85000, 6,    DATE '2019-07-15', 'Bristol'),
  ('Henry Martinez','QA',          65000, 3,    DATE '2022-04-01', 'London')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM zenassess_sandbox.employees);

INSERT INTO zenassess_sandbox.customers (name, email, country, created_at)
SELECT * FROM (VALUES
  ('Acme Corp',    'contact@acme.com',     'UK', DATE '2020-01-01'),
  ('TechCo Ltd',   'info@techco.com',      'UK', DATE '2020-03-15'),
  ('Global Sys',   'hello@globalsys.com',  'DE', DATE '2021-06-01'),
  ('SoftWare Inc', 'sales@software.com',   'US', DATE '2019-12-01')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM zenassess_sandbox.customers);

INSERT INTO zenassess_sandbox.products (name, category, price, stock, supplier_id)
SELECT * FROM (VALUES
  ('Laptop Pro',     'Electronics', 1299.99, 50,  1),
  ('Wireless Mouse', 'Electronics', 29.99,   200, 1),
  ('USB Hub',        'Electronics', 19.99,   150, 2),
  ('Monitor 27"',    'Electronics', 399.99,  30,  1),
  ('Keyboard Mech',  'Electronics', 89.99,   100, 2)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM zenassess_sandbox.products);

INSERT INTO zenassess_sandbox.orders (customer_id, product_id, quantity, order_date, status, total_amount)
SELECT * FROM (VALUES
  (1, 1, 5,  DATE '2024-01-10', 'COMPLETED',  6499.95),
  (2, 2, 10, DATE '2024-01-15', 'COMPLETED',  299.90),
  (1, 3, 20, DATE '2024-02-01', 'PENDING',    399.80),
  (3, 4, 2,  DATE '2024-02-10', 'COMPLETED',  799.98),
  (4, 5, 8,  DATE '2024-03-01', 'PROCESSING', 719.92)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM zenassess_sandbox.orders);

-- ---------------------------------------------------------------------
--  SECTION 8 — Clean up test / dummy / orphaned data
-- ---------------------------------------------------------------------

-- Remove skills & sessions belonging to test/dummy/demo accounts
DELETE FROM skills
WHERE employee_id IN (
  SELECT id FROM employees
  WHERE name ILIKE '%tester%' OR name ILIKE '%dummy%' OR name ILIKE '%demo%'
     OR designation ILIKE '%tester%'
);

DELETE FROM zenassess_sessions
WHERE employee_id IN (
  SELECT id FROM employees
  WHERE name ILIKE '%tester%' OR name ILIKE '%dummy%' OR name ILIKE '%demo%'
);

-- Remove the test/dummy/demo employee accounts themselves
DELETE FROM employees
WHERE name ILIKE '%Beginner Tester%'
   OR name ILIKE '%Expert Tester%'
   OR name ILIKE '%Intermediate Tester%'
   OR name ILIKE '%dummy%'
   OR name ILIKE '%demo employee%';

-- Remove malformed project rows
DELETE FROM projects
WHERE project_name IS NULL OR project_name = '' OR project_name = '.';

-- Remove orphaned child rows (employee no longer exists)
DELETE FROM skills s
WHERE NOT EXISTS (
  SELECT 1 FROM employees e
  WHERE e.id = s.employee_id OR e.zensar_id = s.employee_id
);

DELETE FROM zenassess_sessions z
WHERE NOT EXISTS (
  SELECT 1 FROM employees e
  WHERE e.id = z.employee_id OR e.zensar_id = z.employee_id
);

-- Remove duplicate skills (keep the highest id per employee+skill)
DELETE FROM skills a
USING skills b
WHERE a.id < b.id
  AND a.employee_id = b.employee_id
  AND a.skill_name = b.skill_name;

-- Backfill self_claimed_level from the numeric self_rating where missing
UPDATE skills
SET self_claimed_level = CASE
  WHEN self_rating >= 3 THEN 'Expert'
  WHEN self_rating = 2  THEN 'Intermediate'
  WHEN self_rating = 1  THEN 'Beginner'
  ELSE NULL
END
WHERE self_claimed_level IS NULL
  AND self_rating IS NOT NULL
  AND self_rating > 0;

-- Reclaim space and refresh planner statistics
VACUUM ANALYZE;

-- =====================================================================
--  End of SETUP_DATABASE.sql
-- =====================================================================
