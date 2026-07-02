-- 008_zenassess_retake_grants.sql
-- Admin re-assessment grants: a one-time pass that lets an employee bypass the
-- 7-day ZenAssess retake cooldown for a specific skill. The grant is consumed
-- (used = TRUE) when that skill's test next completes, after which the normal
-- cooldown resumes from the new attempt.
--
-- An unused row (used = FALSE) = an active grant. Admins grant per skill from the
-- employee detail page; /api/zenassess/can-retake honours an active grant.

CREATE TABLE IF NOT EXISTS zenassess_retake_grants (
  id          SERIAL       PRIMARY KEY,
  employee_id VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_name  VARCHAR(255) NOT NULL,
  granted_by  VARCHAR(120) DEFAULT NULL,
  granted_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  used        BOOLEAN      NOT NULL DEFAULT FALSE,
  used_at     TIMESTAMP    DEFAULT NULL
);

-- Fast lookup of active grants per employee + skill.
CREATE INDEX IF NOT EXISTS idx_zrg_active
  ON zenassess_retake_grants (employee_id, skill_name)
  WHERE used = FALSE;

COMMENT ON TABLE  zenassess_retake_grants            IS 'Admin one-time re-assessment passes that bypass the ZenAssess retake cooldown.';
COMMENT ON COLUMN zenassess_retake_grants.skill_name IS 'Skill the grant unlocks (matched case-insensitively).';
COMMENT ON COLUMN zenassess_retake_grants.used       IS 'TRUE once consumed by a completed skill test; FALSE = active grant.';
