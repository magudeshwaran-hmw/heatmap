-- 011_qisl_chain_columns.sql
-- Chain-lock enrichment for the QISL ZenMatrix ratings.
--
-- Adds the columns a resume extraction needs so ONE upload can populate QISL and
-- then drive the admin/employee family-grouped, priority-ordered skill views:
--   taxonomy_skill_id  stable id from qeSkillTaxonomy.ts QE_ALL_SKILLS (disambiguates
--                      the handful of skill names that repeat across families)
--   skill_family       QE family the rating belongs to
--   skill_group        QE skill group
--   priority           primary | secondary | tertiary | NULL (per-family ranking)
--   source             'ai' (from resume extraction) | 'self' (manual QISL edit)
--
-- Additive + idempotent. The existing (employee_id, skill_name) primary key and the
-- manual QISL read/write path are unchanged, so nothing breaks.
--
-- NOTE: server-postgres.cjs also applies these ALTERs on startup, so restarting the
-- backend is enough — this file lets you apply them directly too.

ALTER TABLE qisl_skill_ratings ADD COLUMN IF NOT EXISTS taxonomy_skill_id INTEGER;
ALTER TABLE qisl_skill_ratings ADD COLUMN IF NOT EXISTS skill_family      VARCHAR(120);
ALTER TABLE qisl_skill_ratings ADD COLUMN IF NOT EXISTS skill_group       VARCHAR(160);
ALTER TABLE qisl_skill_ratings ADD COLUMN IF NOT EXISTS priority          VARCHAR(12);
ALTER TABLE qisl_skill_ratings ADD COLUMN IF NOT EXISTS source            VARCHAR(20) DEFAULT 'self';

CREATE INDEX IF NOT EXISTS idx_qisl_employee ON qisl_skill_ratings(employee_id);
CREATE INDEX IF NOT EXISTS idx_qisl_family   ON qisl_skill_ratings(skill_family);
