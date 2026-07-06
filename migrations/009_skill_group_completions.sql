-- 009_skill_group_completions.sql
-- Admin Excel-driven Skill-Group flags (AI for QE / QE for AI / Test Automation).
-- The admin uploads a completions Excel (ID, Name + a Yes/No column per flag);
-- each person becomes one row here, matched to employees by ID or Name. Flags
-- default to No for everyone; only rows present here (with a TRUE flag) turn Yes.
--
-- Persisted so uploads survive restarts. A per-flag "reset" clears that column to
-- FALSE for all rows, and rows left with no flag are removed (see the API layer).
--
-- NOTE: server-postgres.cjs also creates this table automatically on startup, so
-- restarting the backend applies it too — this file lets you apply it directly.

CREATE TABLE IF NOT EXISTS skill_group_completions (
  emp_key         VARCHAR(160) PRIMARY KEY,   -- stable key: lowercased id (preferred) or name
  emp_id          VARCHAR(120),
  emp_name        VARCHAR(200),
  ai_for_qe       BOOLEAN      DEFAULT FALSE,  -- Test AI for QE (Zense.AI QI)
  qe_for_ai       BOOLEAN      DEFAULT FALSE,  -- Test QE for AI (AssureAI)
  test_automation BOOLEAN      DEFAULT FALSE,  -- Test Automation
  source_file     VARCHAR(255),                -- name of the last uploaded Excel
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
