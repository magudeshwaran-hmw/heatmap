-- 010_qisl_skill_ratings.sql
-- QISL ZenMatrix: employee self-ratings (0–3) for the QE-taxonomy skills
-- (qeSkillTaxonomy.ts). One row per employee + skill name; level 0 is not stored.
--
-- NOTE: server-postgres.cjs also creates this table automatically on startup, so
-- restarting the backend applies it too — this file lets you apply it directly.

CREATE TABLE IF NOT EXISTS qisl_skill_ratings (
  employee_id VARCHAR(120) NOT NULL,
  skill_name  VARCHAR(255) NOT NULL,
  level       INTEGER      DEFAULT 0,   -- 0 N/A · 1 Beginner · 2 Intermediate · 3 Expert
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id, skill_name)
);
