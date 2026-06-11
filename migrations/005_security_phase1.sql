-- ============================================================
-- Migration 005: Phase 1 — Security Completion
-- Safe to run on existing databases (all ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ── 1. Refresh Tokens Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           SERIAL       PRIMARY KEY,
  employee_id  VARCHAR(50)  NOT NULL,
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
  expires_at   TIMESTAMP    NOT NULL,
  revoked      BOOLEAN      DEFAULT FALSE,
  ip_address   VARCHAR(50),
  user_agent   TEXT,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_employee ON refresh_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash     ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires  ON refresh_tokens(expires_at);

-- ── 2. Audit Log Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL       PRIMARY KEY,
  employee_id  VARCHAR(50),
  role         VARCHAR(20),
  action       VARCHAR(100) NOT NULL,
  resource     VARCHAR(100),
  resource_id  VARCHAR(100),
  old_value    JSONB,
  new_value    JSONB,
  ip_address   VARCHAR(50),
  user_agent   TEXT,
  status       VARCHAR(20)  DEFAULT 'success',
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_employee ON audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action   ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log(created_at);

-- ── 3. Login Sessions Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_sessions (
  id             SERIAL       PRIMARY KEY,
  employee_id    VARCHAR(50),
  login_id       VARCHAR(255),
  success        BOOLEAN      NOT NULL,
  failure_reason VARCHAR(100),
  ip_address     VARCHAR(50),
  user_agent     TEXT,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_sessions_employee ON login_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_ip       ON login_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_sessions_created  ON login_sessions(created_at);

-- ── 4. Question Bank Table (Phase 2 prep) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS question_bank (
  id             SERIAL       PRIMARY KEY,
  skill_name     VARCHAR(255) NOT NULL,
  band           VARCHAR(20)  NOT NULL CHECK (band IN ('beginner','intermediate','advanced','expert')),
  difficulty     VARCHAR(20)  NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD','SCENARIO')),
  question_text  TEXT         NOT NULL,
  options        JSONB        NOT NULL,
  correct_option INTEGER      NOT NULL,
  explanation    TEXT,
  topic          VARCHAR(100),
  points         INTEGER      DEFAULT 1,
  time_seconds   INTEGER      DEFAULT 60,
  active         BOOLEAN      DEFAULT TRUE,
  version        INTEGER      DEFAULT 1,
  created_by     VARCHAR(50),
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qbank_skill       ON question_bank(skill_name);
CREATE INDEX IF NOT EXISTS idx_qbank_band        ON question_bank(band);
CREATE INDEX IF NOT EXISTS idx_qbank_difficulty  ON question_bank(difficulty);
CREATE INDEX IF NOT EXISTS idx_qbank_active      ON question_bank(active);

-- ── 5. Assessment Analytics Table (Phase 2 prep) ────────────────────────────
CREATE TABLE IF NOT EXISTS assessment_analytics (
  id              SERIAL       PRIMARY KEY,
  session_id      VARCHAR(50),
  employee_id     VARCHAR(50)  NOT NULL,
  skill_name      VARCHAR(255) NOT NULL,
  band            VARCHAR(20)  NOT NULL,
  question_id     INTEGER,
  time_taken_sec  INTEGER,
  answer_given    INTEGER,
  is_correct      BOOLEAN,
  answer_changes  INTEGER      DEFAULT 0,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_session  ON assessment_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_employee ON assessment_analytics(employee_id);
CREATE INDEX IF NOT EXISTS idx_analytics_skill    ON assessment_analytics(skill_name);

-- ── 6. Manager Reviews Table (Phase 3 prep) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS manager_reviews (
  id                  SERIAL       PRIMARY KEY,
  session_id          VARCHAR(50)  NOT NULL,
  employee_id         VARCHAR(50)  NOT NULL,
  skill_name          VARCHAR(255) NOT NULL,
  reviewer_id         VARCHAR(50),
  review_status       VARCHAR(30)  DEFAULT 'pending'
                      CHECK (review_status IN ('pending','in_review','approved','rejected','escalated')),
  review_notes        TEXT,
  final_decision      VARCHAR(20)  CHECK (final_decision IN ('Expert','Advanced',NULL)),
  sla_deadline        TIMESTAMP,
  review_started_at   TIMESTAMP,
  review_completed_at TIMESTAMP,
  escalated_to        VARCHAR(50),
  escalation_reason   TEXT,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_session  ON manager_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_employee ON manager_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status   ON manager_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_reviews_sla      ON manager_reviews(sla_deadline);

-- ── 7. Extend zenassess_sessions with new fields ─────────────────────────────
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS skill_name          VARCHAR(255);
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS question_ids        INTEGER[];
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS question_bank_ver   INTEGER DEFAULT 1;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS session_fingerprint VARCHAR(255);
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS tab_switch_count    INTEGER DEFAULT 0;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS copy_paste_count    INTEGER DEFAULT 0;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS answer_change_count INTEGER DEFAULT 0;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS time_per_question   JSONB   DEFAULT '{}';
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS integrity_score     INTEGER DEFAULT 100;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS integrity_flags     JSONB   DEFAULT '[]';
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS mcq_score           NUMERIC(5,2);
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS contribution_score  NUMERIC(5,2);
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS evidence_score      NUMERIC(5,2);
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS final_score         NUMERIC(5,2);
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS sla_deadline        TIMESTAMP;

-- ── 8. Extend skills table with freshness fields (Phase 5 prep) ─────────────
ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_used_date      DATE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_project_date   DATE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_validated_date DATE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_cert_date      DATE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS freshness_score     INTEGER DEFAULT 100;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS freshness_status    VARCHAR(20) DEFAULT 'active'
  CHECK (freshness_status IN ('active','aging','stale','expired'));
ALTER TABLE skills ADD COLUMN IF NOT EXISTS confidence_score    INTEGER DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS revalidation_req    BOOLEAN DEFAULT FALSE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS source              VARCHAR(50) DEFAULT 'self';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS hidden_skill        BOOLEAN DEFAULT FALSE;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS discovery_source    VARCHAR(50);

-- ── 9. Extend bfsi_assignments with allocation intelligence fields ───────────
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS allocation_readiness  INTEGER DEFAULT 0;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS confidence_at_alloc   INTEGER DEFAULT 0;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS freshness_at_alloc    INTEGER DEFAULT 0;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS risk_score            INTEGER DEFAULT 0;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS recommended_rank      INTEGER;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS admin_override        BOOLEAN DEFAULT FALSE;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS override_reason       TEXT;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS outcome_status        VARCHAR(30);
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS outcome_notes         TEXT;
ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS outcome_recorded_at   TIMESTAMP;

-- ── 10. Add JWT secret to app_settings if not present ───────────────────────
INSERT INTO app_settings (key, value)
  VALUES ('jwt_secret', encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'refresh_tokens','audit_log','login_sessions',
    'question_bank','assessment_analytics','manager_reviews'
  )
ORDER BY table_name;
