-- ============================================================
-- Migration 005: Phase 1 Security — Auth Tables
-- Run: psql -U postgres -d skillmatrix -f migrations/005_auth_security.sql
-- ============================================================

-- 1. Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           SERIAL       PRIMARY KEY,
  token_hash   VARCHAR(64)  NOT NULL UNIQUE,  -- SHA-256 of the raw token
  employee_id  VARCHAR(50)  NOT NULL,
  role         VARCHAR(20)  NOT NULL DEFAULT 'employee',
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  expires_at   TIMESTAMP    NOT NULL,
  revoked      BOOLEAN      DEFAULT FALSE,
  revoked_at   TIMESTAMP,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rt_token_hash   ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_employee_id  ON refresh_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires_at   ON refresh_tokens(expires_at);

-- 2. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id           SERIAL       PRIMARY KEY,
  employee_id  VARCHAR(50),
  role         VARCHAR(20),
  action       VARCHAR(100) NOT NULL,  -- LOGIN, LOGOUT, SKILL_UPDATE, EMPLOYEE_DELETE, etc.
  resource     VARCHAR(255),           -- e.g. "employees/12345"
  details      JSONB        DEFAULT '{}',
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  status       VARCHAR(20)  DEFAULT 'success',  -- success | failure
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_al_employee_id ON audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_al_action      ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_al_created_at  ON audit_logs(created_at);

-- 3. Login Attempts (for lockout)
CREATE TABLE IF NOT EXISTS login_attempts (
  id           SERIAL       PRIMARY KEY,
  identifier   VARCHAR(255) NOT NULL,  -- lowercased login input (id/email/phone)
  ip_address   VARCHAR(45),
  success      BOOLEAN      DEFAULT FALSE,
  attempted_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_la_identifier   ON login_attempts(identifier);
CREATE INDEX IF NOT EXISTS idx_la_ip_address   ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_la_attempted_at ON login_attempts(attempted_at);

-- 4. Active Sessions
CREATE TABLE IF NOT EXISTS active_sessions (
  id           SERIAL       PRIMARY KEY,
  session_id   VARCHAR(64)  NOT NULL UNIQUE,
  employee_id  VARCHAR(50)  NOT NULL,
  role         VARCHAR(20)  NOT NULL DEFAULT 'employee',
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  last_seen_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  expires_at   TIMESTAMP    NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_as_session_id   ON active_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_as_employee_id  ON active_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_as_expires_at   ON active_sessions(expires_at);

-- ============================================================
-- ROLLBACK (run manually to undo)
-- DROP TABLE IF EXISTS active_sessions, login_attempts, audit_logs, refresh_tokens;
-- ============================================================
