-- ============================================================
-- Migration 004: ZenAssess Sessions Table
-- ============================================================

-- UP
CREATE TABLE IF NOT EXISTS zenassess_sessions (
  session_id    VARCHAR(50)  PRIMARY KEY,
  employee_id   VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  level_path    VARCHAR(20)  NOT NULL CHECK (level_path IN ('junior', 'midlevel', 'senior')),
  score         NUMERIC(5,2) DEFAULT 0,
  status        VARCHAR(30)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'passed', 'failed', 'review_required')),
  assigned_level VARCHAR(30) DEFAULT NULL,
  retry_after   TIMESTAMP    DEFAULT NULL,
  questions     JSONB        DEFAULT '[]',
  answers       JSONB        DEFAULT '{}',
  evidence      JSONB        DEFAULT '{}',
  study_path    JSONB        DEFAULT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_zenassess_employee_id ON zenassess_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_zenassess_status      ON zenassess_sessions(status);

-- ============================================================
-- ROLLBACK (run manually to undo)
-- ============================================================
-- DROP TABLE IF EXISTS zenassess_sessions;
