-- ============================================================
-- ZENSAR SKILL NAVIGATOR — SQLite DATABASE SETUP
-- Auto-created on first run
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
  id                 TEXT PRIMARY KEY,
  zensar_id          TEXT UNIQUE,
  name               TEXT NOT NULL,
  email              TEXT UNIQUE,
  phone              TEXT,
  designation        TEXT,
  department         TEXT,
  location           TEXT,
  years_it           INTEGER DEFAULT 0,
  years_zensar       INTEGER DEFAULT 0,
  password           TEXT,
  overall_capability INTEGER DEFAULT 0,
  submitted          BOOLEAN DEFAULT 0,
  resume_uploaded    BOOLEAN DEFAULT 0,
  primary_skill      TEXT,
  primary_domain     TEXT,
  secondary_skill    TEXT,
  tertiary_skill     TEXT,
  grade              TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skills (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    TEXT REFERENCES employees(id) ON DELETE CASCADE,
  skill_name     TEXT NOT NULL,
  self_rating    INTEGER DEFAULT 0 CHECK (self_rating BETWEEN 0 AND 5),
  manager_rating INTEGER CHECK (manager_rating BETWEEN 0 AND 5),
  assessment_score INTEGER,
  proficiency_level TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assessments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    TEXT REFERENCES employees(id) ON DELETE CASCADE,
  skill_name     TEXT NOT NULL,
  total_score    INTEGER,
  percentage     REAL,
  status         TEXT DEFAULT 'pending',
  attempt_count  INTEGER DEFAULT 0,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS badges (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    TEXT REFERENCES employees(id) ON DELETE CASCADE,
  badge_name     TEXT NOT NULL,
  badge_icon     TEXT,
  earned_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT UNIQUE NOT NULL,
  password       TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_zensar_id ON employees(zensar_id);
CREATE INDEX IF NOT EXISTS idx_skills_employee ON skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_assessments_employee ON assessments(employee_id);
CREATE INDEX IF NOT EXISTS idx_badges_employee ON badges(employee_id);
