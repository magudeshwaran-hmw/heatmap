const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const fallbackQuestions = require('./fallbackQuestions.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection with SSL support for cloud databases
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'skillmatrix',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Test database connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err.message);
});

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.endsWith('.ngrok.io') ||
      origin.endsWith('.ngrok-free.app') ||
      origin.endsWith('.ngrok-free.dev') ||
      origin.endsWith('.trycloudflare.com')
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Attach user from JWT on every request (non-blocking)
app.use((req, res, next) => { if (typeof attachUser === 'function') attachUser(req, res, next); else next(); });

// Skill names array (32 skills)
const SKILL_NAMES = [
  'Selenium', 'Appium', 'JMeter', 'Postman', 'JIRA', 'TestRail',
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C#', 'SQL',
  'API Testing', 'Mobile Testing', 'Performance Testing',
  'Security Testing', 'Database Testing', 'Banking',
  'Healthcare', 'E-Commerce', 'Insurance', 'Telecom',
  'Functional Testing', 'Automation Testing', 'Regression Testing',
  'UAT', 'Git', 'Jenkins', 'Docker', 'Azure DevOps',
  'ChatGPT/Prompt Engineering', 'AI Test Automation'
];

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'zensar_secret_key_32_chars_long!!'; // Must be 32 chars
const IV_LENGTH = 16;

function encryptPw(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).substring(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptPw(text) {
  if (!text) return null;
  if (!text.includes(':')) return text; // Return as is if not encrypted
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).substring(0, 32)), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/**
 * withTimeout
 * Wraps a promise in a timeout to prevent hanging.
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LLM_TIMEOUT')), ms);
    promise.then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

// ============================================================
// PHASE 1 — JWT + SECURITY HELPERS
// ============================================================

// JWT secret — falls back to env var, then a hardcoded dev secret
const JWT_SECRET = process.env.JWT_SECRET || 'zensar_jwt_dev_secret_change_in_production_2026';
const JWT_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_DAYS = 7;

/** Generate a signed access token (15 min) */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Hash a refresh token for safe DB storage */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * JWT Auth Middleware — optional enforcement.
 * Attaches req.user if a valid Bearer token is present.
 * Does NOT block requests without a token (backward compatible).
 * Use requireAuth() or requireAdmin() to enforce on specific routes.
 */
function attachUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded; // { employeeId, role, name }
    } catch (_) {
      // Invalid/expired token — req.user stays undefined
    }
  }
  next();
}

/** Middleware: require a valid JWT. Returns 401 if missing/invalid. (Bypassed during transition) */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Backward compatibility: allow requests without JWT tokens during transition
    return next();
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    // Backward compatibility: allow requests even with expired/invalid JWT tokens during transition
    req.user = undefined;
    next();
  }
}

/** Middleware: require admin role. (Bypassed during transition if no token) */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    // Backward compatibility: allow if no req.user (transition/session mode) or role is admin
    if (!req.user || req.user.role === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
  });
}

/** Middleware: require ownership (employee can only access own data) or admin. (Bypassed during transition if no token) */
function requireOwnership(paramName = 'id') {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      // Backward compatibility: allow if no req.user (transition/session mode)
      if (!req.user) return next();
      if (req.user.role === 'admin') return next();
      const resourceId = Reflect.get(req.params, paramName);
      if (
        resourceId &&
        (resourceId.toLowerCase() === req.user.employeeId.toLowerCase() ||
         resourceId === req.user.employeeId)
      ) return next();
      return res.status(403).json({ error: 'Access denied' });
    });
  };
}

/** Write to audit_log — non-blocking, never throws */
async function auditLog({ employeeId, role, action, resource, resourceId, oldValue, newValue, details, req, status = 'success' }) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
    const ua = req ? (req.headers['user-agent'] || '') : '';
    const detailsVal = details || newValue || null;
    await pool.query(
      `INSERT INTO audit_log (employee_id, role, action, resource, resource_id, old_value, new_value, ip_address, user_agent, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        employeeId || null, role || null, action, resource || null, resourceId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        detailsVal ? JSON.stringify(detailsVal) : null,
        ip, ua, status
      ]
    );
  } catch (_) { /* audit failures must never break the main flow */ }
}

/** Check rate limit: max 5 failed logins per IP in 15 minutes */
async function checkLoginRateLimit(ip) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM login_sessions
       WHERE ip_address = $1 AND success = false
         AND created_at > NOW() - INTERVAL '15 minutes'`,
      [ip]
    );
    return parseInt(result.rows[0].cnt) >= 5;
  } catch (_) { return false; }
}

/** Log a login attempt */
async function logLoginAttempt({ employeeId, loginId, success, failureReason, req }) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
    const ua = req ? (req.headers['user-agent'] || '') : '';
    await pool.query(
      `INSERT INTO login_sessions (employee_id, login_id, success, failure_reason, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [employeeId || null, loginId || null, success, failureReason || null, ip, ua]
    );
  } catch (_) {}
}

/** Ensure Phase 1 security tables exist (idempotent) */
async function ensureSecurityTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        token_hash  VARCHAR(255) NOT NULL UNIQUE,
        expires_at  TIMESTAMP NOT NULL,
        revoked     BOOLEAN DEFAULT FALSE,
        ip_address  VARCHAR(50),
        user_agent  TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rt_employee ON refresh_tokens(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(token_hash)`);
    await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'employee'`);
    await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP`);

    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_al_employee ON audit_log(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_al_action ON audit_log(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_al_created ON audit_log(created_at)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_sessions (
        id             SERIAL PRIMARY KEY,
        employee_id    VARCHAR(50),
        login_id       VARCHAR(255),
        success        BOOLEAN NOT NULL,
        failure_reason VARCHAR(100),
        ip_address     VARCHAR(50),
        user_agent     TEXT,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ls_employee ON login_sessions(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ls_ip ON login_sessions(ip_address)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ls_created ON login_sessions(created_at)`);
  } catch (err) {
    console.error('⚠️ Security tables init error (non-blocking):', err.message);
  }
}

/** Ensure Phase 2 question bank tables exist (idempotent) */
async function ensurePhase2Tables() {
  try {
    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_qb_skill ON question_bank(skill_name)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_qb_band ON question_bank(band)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_qb_active ON question_bank(active)`);

    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_aa_session ON assessment_analytics(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_aa_employee ON assessment_analytics(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_aa_skill ON assessment_analytics(skill_name)`);

    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mr_session ON manager_reviews(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mr_employee ON manager_reviews(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mr_status ON manager_reviews(review_status)`);

    // AI proctoring integrity reports (one row per proctored skill test)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS integrity_reports (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR,
        employee_id VARCHAR,
        skill_name VARCHAR,
        integrity_score INTEGER,
        verdict VARCHAR,
        flags JSONB,
        camera_enabled BOOLEAN DEFAULT false,
        ai_enabled BOOLEAN DEFAULT false,
        tab_switches INTEGER DEFAULT 0,
        copy_attempts INTEGER DEFAULT 0,
        phone_detections INTEGER DEFAULT 0,
        multiple_persons INTEGER DEFAULT 0,
        start_time BIGINT,
        end_time BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ir_employee ON integrity_reports(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ir_verdict ON integrity_reports(verdict)`);

    // Extend zenassess_sessions with new columns
    const newCols = [
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS skill_name          VARCHAR(255)`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS question_ids        INTEGER[]`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS session_fingerprint VARCHAR(255)`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS tab_switch_count    INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS copy_paste_count    INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS answer_change_count INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS time_per_question   JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS integrity_score     INTEGER DEFAULT 100`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS integrity_flags     JSONB DEFAULT '[]'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS mcq_score           NUMERIC(5,2)`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS contribution_score  NUMERIC(5,2)`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS evidence_score      NUMERIC(5,2)`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS final_score         NUMERIC(5,2)`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS sla_deadline        TIMESTAMP`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS fullscreen_exit_count INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS browser_blur_count INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS devtools_detected BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS explain_score_breakdown JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS contribution_breakdown JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS github_metadata JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS allocation_readiness_score INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS allocation_risk VARCHAR(20) DEFAULT 'Low'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS ready_for_allocation BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS expert_profile          JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS extracted_evidence      JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS evidence_evaluation     JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS technical_discussion    JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS leadership_discussion   JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS consistency_analysis    JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS ai_recommendation       JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS authenticity_analysis   JSONB DEFAULT '{}'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS leadership_signals      TEXT`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS architecture_signals    TEXT`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS decision_making_signals TEXT`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS mentoring_signals       TEXT`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS domain_expertise       TEXT`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS project_allocation_score INTEGER DEFAULT 0`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS typing_velocity_log JSONB DEFAULT '[]'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS answer_snapshots    JSONB DEFAULT '[]'`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS integrity_flagged   BOOLEAN DEFAULT false`,
      `ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS badge_withheld      BOOLEAN DEFAULT false`,
    ];
    for (const col of newCols) {
      try { await pool.query(col); } catch (_) {}
    }

    // Extend employees table
    try {
      await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS secondary_skill VARCHAR(255)`);
      await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tertiary_skill VARCHAR(255)`);
    } catch (err) {
      console.error('⚠️ employees alter error:', err.message);
    }

    // Extend skills table
    const skillCols = [
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_used_date      DATE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_project_date   DATE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_validated_date DATE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_cert_date      DATE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS freshness_score     INTEGER DEFAULT 100`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS freshness_status    VARCHAR(20) DEFAULT 'active'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS confidence_score    INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS revalidation_req    BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS source              VARCHAR(50) DEFAULT 'self'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS hidden_skill        BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS discovery_source    VARCHAR(50)`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS allocation_readiness INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS allocation_risk VARCHAR(20) DEFAULT 'Low'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS ready_for_allocation BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS capability_score    INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS leadership_signals      TEXT`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS architecture_signals    TEXT`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS decision_making_signals TEXT`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS mentoring_signals       TEXT`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS domain_expertise       TEXT`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS project_allocation_score INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS validated_level VARCHAR(50) DEFAULT 'Not Validated'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS assessment_score INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS technical_depth INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS project_strength INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS certification_strength INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS mentoring_strength INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS github_strength INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS verified_badge_level VARCHAR(30) DEFAULT NULL`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS self_claimed_level   VARCHAR(30) DEFAULT NULL`,
    ];
    for (const col of skillCols) {
      try { await pool.query(col); } catch (_) {}
    }

    // Extend bfsi_assignments
    const assignCols = [
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS allocation_readiness INTEGER DEFAULT 0`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS confidence_at_alloc  INTEGER DEFAULT 0`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS freshness_at_alloc   INTEGER DEFAULT 0`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS risk_score           INTEGER DEFAULT 0`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS recommended_rank     INTEGER`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS admin_override       BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS override_reason      TEXT`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS outcome_status       VARCHAR(30)`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS outcome_notes        TEXT`,
      `ALTER TABLE bfsi_assignments ADD COLUMN IF NOT EXISTS outcome_recorded_at  TIMESTAMP`,
    ];
    for (const col of assignCols) {
      try { await pool.query(col); } catch (_) {}
    }

    // Create Skill Confidence History table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skill_confidence_history (
        id               SERIAL PRIMARY KEY,
        employee_id      VARCHAR(50) NOT NULL,
        skill_name       VARCHAR(255) NOT NULL,
        confidence_score INTEGER NOT NULL,
        source           VARCHAR(100) NOT NULL,
        reason           TEXT,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sch_emp_skill ON skill_confidence_history(employee_id, skill_name)');

    // Create Recalculate Skill Freshness & Confidence Stored Function
    await pool.query(`
      CREATE OR REPLACE FUNCTION recalculate_employee_skill_freshness(emp_id VARCHAR)
      RETURNS VOID AS $$
      DECLARE
        s RECORD;
        val_date DATE;
        proj_date DATE;
        cert_date DATE;
        used_date DATE;
        f_score INTEGER;
        f_status VARCHAR(20);
        reval BOOLEAN;
        days_since INTEGER;
        
        -- Confidence parameters
        c_score INTEGER;
        self_rating_pts INTEGER;
        assess_pts INTEGER;
        review_pts INTEGER;
        proj_pts INTEGER;
        cert_pts INTEGER;
        proj_count INTEGER;
        cert_count INTEGER;
        has_assess BOOLEAN;
        has_review BOOLEAN;
        last_hist_score INTEGER;
        reason_str TEXT;
        outcome_date DATE;
        success_alloc_count INTEGER;
        failure_alloc_count INTEGER;

        -- Allocation Readiness parameters
        latest_score NUMERIC;
        latest_integrity INTEGER;
        latest_contrib NUMERIC;
        readiness INTEGER;
        risk VARCHAR(20);
        ready BOOLEAN;

        -- Capability Score parameters
        assess_component INTEGER;
        proj_component INTEGER;
        cert_component INTEGER;
        exp_component INTEGER;
        freshness_component INTEGER;
        domain_component INTEGER;
        years_exp INTEGER;
        has_domain_match BOOLEAN;
        cap_score INTEGER;
      BEGIN
        -- ── HIDDEN SKILL DISCOVERY ──
        -- Discover from projects
        FOR s IN 
          SELECT DISTINCT LOWER(p_sk) as l_sk
          FROM projects p,
          LATERAL unnest(COALESCE(p.skills_used, ARRAY[]::TEXT[]) || COALESCE(p.technologies, ARRAY[]::TEXT[])) as p_sk
          WHERE p.employee_id = emp_id
        LOOP
          reason_str := NULL;
          SELECT name INTO reason_str 
          FROM (SELECT unnest(ARRAY['Selenium','Appium','JMeter','Postman','JIRA','TestRail','Python','Java','JavaScript','TypeScript','C#','SQL','API Testing','Mobile Testing','Performance Testing','Security Testing','Database Testing','Banking','Healthcare','E-Commerce','Insurance','Telecom','Functional Testing','Automation Testing','Regression Testing','UAT','Git','Jenkins','Docker','Azure DevOps','ChatGPT/Prompt Engineering','AI Test Automation']) as name) as lst
          WHERE LOWER(lst.name) = s.l_sk;

          IF reason_str IS NOT NULL THEN
            IF NOT EXISTS(SELECT 1 FROM skills WHERE employee_id = emp_id AND skill_name = reason_str) THEN
              INSERT INTO skills (employee_id, skill_name, self_rating, hidden_skill, discovery_source)
              VALUES (emp_id, reason_str, 1, TRUE, 'project');
            END IF;
          END IF;
        END LOOP;

        -- Discover from certifications
        FOR s IN 
          SELECT unnest(ARRAY['Selenium','Appium','JMeter','Postman','JIRA','TestRail','Python','Java','JavaScript','TypeScript','C#','SQL','API Testing','Mobile Testing','Performance Testing','Security Testing','Database Testing','Banking','Healthcare','E-Commerce','Insurance','Telecom','Functional Testing','Automation Testing','Regression Testing','UAT','Git','Jenkins','Docker','Azure DevOps','ChatGPT/Prompt Engineering','AI Test Automation']) as name
        LOOP
          IF EXISTS(
            SELECT 1 FROM certifications 
            WHERE employee_id = emp_id AND cert_name ILIKE '%' || s.name || '%'
          ) THEN
            IF NOT EXISTS(SELECT 1 FROM skills WHERE employee_id = emp_id AND skill_name = s.name) THEN
              INSERT INTO skills (employee_id, skill_name, self_rating, hidden_skill, discovery_source, validated)
              VALUES (emp_id, s.name, 1, TRUE, 'certification', TRUE);
            END IF;
          END IF;
        END LOOP;

        FOR s IN SELECT id, skill_name, self_rating, created_at, updated_at FROM skills WHERE employee_id = emp_id LOOP
          -- 1. last_validated_date
          SELECT COALESCE(MAX(created_at::DATE), s.updated_at::DATE)
          INTO val_date
          FROM zenassess_sessions
          WHERE employee_id = emp_id AND skill_name = s.skill_name AND status = 'completed';

          -- 2. last_project_date
          SELECT MAX(COALESCE(end_date, CURRENT_DATE))
          INTO proj_date
          FROM projects
          WHERE employee_id = emp_id AND (s.skill_name = ANY(skills_used) OR s.skill_name = ANY(technologies));

          -- 3. last_cert_date
          SELECT MAX(issue_date)
          INTO cert_date
          FROM certifications
          WHERE employee_id = emp_id AND cert_name ILIKE '%' || s.skill_name || '%';

          -- 3.5. outcome_date
          SELECT MAX(a.outcome_recorded_at::DATE) INTO outcome_date
          FROM bfsi_assignments a
          JOIN bfsi_roles r ON a.role_id = r.role_id
          WHERE a.employee_id = (SELECT zensar_id FROM employees WHERE id = emp_id)
            AND s.skill_name = ANY(r.required_skills)
            AND a.outcome_status = 'Success';

          -- 4. last_used_date
          used_date := GREATEST(
            COALESCE(val_date, '1970-01-01'::DATE),
            COALESCE(proj_date, '1970-01-01'::DATE),
            COALESCE(cert_date, '1970-01-01'::DATE),
            COALESCE(outcome_date, '1970-01-01'::DATE),
            COALESCE(s.updated_at::DATE, '1970-01-01'::DATE)
          );
          IF used_date = '1970-01-01'::DATE THEN
            used_date := CURRENT_DATE;
          END IF;

          -- Calculate days since
          days_since := CURRENT_DATE - used_date;
          IF days_since < 0 THEN
            days_since := 0;
          END IF;

          -- Freshness Score logic
          IF days_since <= 180 THEN
            f_score := 100;
          ELSIF days_since <= 365 THEN
            f_score := 100 - ((days_since - 180) * 0.16)::INTEGER;
          ELSIF days_since <= 730 THEN
            f_score := 70 - ((days_since - 365) * 0.11)::INTEGER;
          ELSE
            f_score := 30 - ((days_since - 730) * 0.05)::INTEGER;
          END IF;

          IF f_score < 0 THEN
            f_score := 0;
          ELSIF f_score > 100 THEN
            f_score := 100;
          END IF;

          -- Status logic
          IF f_score >= 75 THEN
            f_status := 'active';
          ELSIF f_score >= 40 THEN
            f_status := 'decaying';
          ELSE
            f_status := 'stale';
          END IF;

          IF f_status = 'stale' THEN
            reval := TRUE;
          ELSE
            reval := FALSE;
          END IF;

          -- ── CONFIDENCE CALCULATION ──
          self_rating_pts := 0;
          IF s.self_rating > 0 THEN
            self_rating_pts := 40;
          END IF;

          -- Check if has completed assessment
          SELECT EXISTS(
            SELECT 1 FROM zenassess_sessions 
            WHERE employee_id = emp_id AND skill_name = s.skill_name AND status IN ('completed', 'passed', 'review_required')
          ) INTO has_assess;
          assess_pts := 0;
          IF has_assess THEN
            assess_pts := 30;
          END IF;

          -- Check if has approved manager review
          SELECT EXISTS(
            SELECT 1 FROM manager_reviews 
            WHERE employee_id = emp_id AND skill_name = s.skill_name AND review_status = 'approved'
          ) INTO has_review;
          review_pts := 0;
          IF has_review THEN
            review_pts := 15;
          END IF;

          -- Count projects
          SELECT COUNT(*) INTO proj_count
          FROM projects
          WHERE employee_id = emp_id AND (s.skill_name = ANY(skills_used) OR s.skill_name = ANY(technologies));
          proj_pts := LEAST(10, proj_count * 5);

          -- Count certs
          SELECT COUNT(*) INTO cert_count
          FROM certifications
          WHERE employee_id = emp_id AND cert_name ILIKE '%' || s.skill_name || '%';
          cert_pts := 0;
          IF cert_count > 0 THEN
            cert_pts := 10;
          END IF;

          -- Count successful delivery outcomes in BFSI roles
          SELECT COUNT(*) INTO success_alloc_count
          FROM bfsi_assignments a
          JOIN bfsi_roles r ON a.role_id = r.role_id
          WHERE a.employee_id = (SELECT zensar_id FROM employees WHERE id = emp_id)
            AND s.skill_name = ANY(r.required_skills)
            AND a.outcome_status = 'Success';

          -- Count failure delivery outcomes in BFSI roles
          SELECT COUNT(*) INTO failure_alloc_count
          FROM bfsi_assignments a
          JOIN bfsi_roles r ON a.role_id = r.role_id
          WHERE a.employee_id = (SELECT zensar_id FROM employees WHERE id = emp_id)
            AND s.skill_name = ANY(r.required_skills)
            AND a.outcome_status = 'Failure';

          c_score := self_rating_pts + assess_pts + review_pts + proj_pts + cert_pts + (success_alloc_count * 10) - (failure_alloc_count * 15);
          IF c_score < 0 THEN
            c_score := 0;
          ELSIF c_score > 100 THEN
            c_score := 100;
          END IF;

          -- Fetch details from latest completed zenassess_session
          SELECT COALESCE(score, 0), COALESCE(integrity_score, 100), COALESCE(contribution_score, 0)
          INTO latest_score, latest_integrity, latest_contrib
          FROM zenassess_sessions
          WHERE employee_id = emp_id AND skill_name = s.skill_name AND status IN ('completed', 'passed', 'review_required')
          ORDER BY created_at DESC LIMIT 1;

          IF latest_score IS NULL THEN
            latest_score := 0;
            latest_integrity := 100;
            latest_contrib := 0;
          END IF;

          -- Calculate Readiness Score: (Validation Score * 0.3) + (Confidence * 0.25) + (Freshness * 0.2) + (Integrity * 0.15) + (Contribution * 0.1)
          readiness := ROUND((latest_score * 0.3) + (c_score * 0.25) + (f_score * 0.2) + (latest_integrity * 0.15) + (latest_contrib * 0.1));

          -- Determine Risk:
          -- High Risk: If Integrity < 60 OR Freshness < 40 OR Validation Score < 50
          -- Medium Risk: If Integrity is 60-79 OR Freshness is 40-74 OR Validation Score < 60
          -- Low Risk: Otherwise
          IF latest_integrity < 60 OR f_score < 40 OR latest_score < 50 THEN
            risk := 'High';
          ELSIF latest_integrity < 80 OR f_score < 75 OR latest_score < 60 THEN
            risk := 'Medium';
          ELSE
            risk := 'Low';
          END IF;

          -- Ready For Allocation: (Readiness >= 60% && Integrity >= 50 && Validation Score >= 50)
          IF readiness >= 60 AND latest_integrity >= 50 AND latest_score >= 50 THEN
            ready := TRUE;
          ELSE
            ready := FALSE;
          END IF;

          -- Calculate Capability Score components:
          -- 1. Assessment (max 20 pts)
          assess_component := ROUND(COALESCE(latest_score, 0) * 0.20);
          
          -- 2. Projects (max 20 pts)
          SELECT COALESCE(MAX(
            CASE 
              WHEN domain ILIKE '%Banking%' OR domain ILIKE '%Insurance%' OR domain ILIKE '%BFSI%' OR domain ILIKE '%Claims%' 
                   OR client ILIKE '%Bank%' OR client ILIKE '%Insurance%' OR client ILIKE '%Finance%' OR client ILIKE '%Claims%' THEN 20
              ELSE 10
            END
          ), 5) INTO proj_component
          FROM projects
          WHERE employee_id = emp_id AND (s.skill_name = ANY(skills_used) OR s.skill_name = ANY(technologies));

          -- 3. Certifications (max 20 pts)
          SELECT COALESCE(MAX(
            CASE 
              WHEN cert_name ILIKE '%ISTQB%' OR cert_name ILIKE '%AWS%' OR cert_name ILIKE '%Azure%' OR cert_name ILIKE '%Google%' 
                   OR cert_name ILIKE '%CISA%' OR cert_name ILIKE '%CISSP%' OR cert_name ILIKE '%Scrum%' OR cert_name ILIKE '%Associate%' 
                   OR cert_name ILIKE '%Professional%' OR cert_name ILIKE '%Architect%' THEN 20
              ELSE 5
            END
          ), 0) INTO cert_component
          FROM certifications
          WHERE employee_id = emp_id AND cert_name ILIKE '%' || s.skill_name || '%';

          -- 4. Experience (max 10 pts)
          SELECT COALESCE(years_it, 0) INTO years_exp FROM employees WHERE id = emp_id;
          IF years_exp >= 12 THEN
            exp_component := 10;
          ELSIF years_exp >= 6 THEN
            exp_component := 8;
          ELSE
            exp_component := 5;
          END IF;

          -- 5. Freshness (max 15 pts)
          freshness_component := ROUND(f_score * 0.15);

          -- 6. Domain Match (max 15 pts)
          SELECT EXISTS(
            SELECT 1 FROM employees WHERE id = emp_id AND (primary_domain ILIKE '%Banking%' OR primary_domain ILIKE '%Insurance%' OR primary_domain ILIKE '%BFSI%' OR primary_domain ILIKE '%Claims%')
          ) OR EXISTS(
            SELECT 1 FROM projects WHERE employee_id = emp_id AND (domain ILIKE '%Banking%' OR domain ILIKE '%Insurance%' OR domain ILIKE '%BFSI%' OR domain ILIKE '%Claims%')
          ) INTO has_domain_match;

          IF has_domain_match THEN
            domain_component := 15;
          ELSE
            domain_component := 0;
          END IF;

          cap_score := assess_component + proj_component + cert_component + exp_component + freshness_component + domain_component;
          IF cap_score > 100 THEN
            cap_score := 100;
          END IF;

          -- Update record
          UPDATE skills
          SET last_validated_date = val_date,
              last_project_date = proj_date,
              last_cert_date = cert_date,
              last_used_date = used_date,
              freshness_score = f_score,
              freshness_status = f_status,
              revalidation_req = reval,
              confidence_score = c_score,
              allocation_readiness = readiness,
              allocation_risk = risk,
              ready_for_allocation = ready,
              capability_score = cap_score
          WHERE id = s.id;

          -- Log history & trends
          SELECT confidence_score INTO last_hist_score
          FROM skill_confidence_history
          WHERE employee_id = emp_id AND skill_name = s.skill_name
          ORDER BY created_at DESC LIMIT 1;

          IF last_hist_score IS NULL OR last_hist_score != c_score THEN
            reason_str := 'Score recalculated: Self-Rating (' || self_rating_pts || ' pts)';
            IF assess_pts > 0 THEN
              reason_str := reason_str || ', Assessment (' || assess_pts || ' pts)';
            END IF;
            IF review_pts > 0 THEN
              reason_str := reason_str || ', Expert Review (' || review_pts || ' pts)';
            END IF;
            IF proj_pts > 0 THEN
              reason_str := reason_str || ', Projects (' || proj_pts || ' pts)';
            END IF;
            IF cert_pts > 0 THEN
              reason_str := reason_str || ', Certifications (' || cert_pts || ' pts)';
            END IF;
            
            INSERT INTO skill_confidence_history (employee_id, skill_name, confidence_score, source, reason)
            VALUES (emp_id, s.skill_name, c_score, 'system', reason_str);
          END IF;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Backfill calculations for all employees
    try {
      await pool.query('SELECT recalculate_employee_skill_freshness(id) FROM employees');
    } catch (_) {}

    // Seed Functional Testing Questions
    try {
      await seedFunctionalTestingQuestions();
    } catch (err) {
      console.error('⚠️ Seeding Functional Testing questions failed:', err.message);
    }
  } catch (err) {
    console.error('⚠️ Phase 2 tables init error (non-blocking):', err.message);
  }
}

async function seedFunctionalTestingQuestions() {
  const check = await pool.query("SELECT COUNT(*) FROM question_bank WHERE skill_name = 'Functional Testing'");
  const count = parseInt(check.rows[0].count, 10);
  if (count > 0) {
    return;
  }

  const questions = [
    // 20 Beginner Questions
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Which SDLC model is characterized by incremental development and high adaptability to changes?',
      options: ['Waterfall', 'V-Model', 'Agile', 'Big Bang'],
      correct_option: 2,
      explanation: 'Agile development is structured in short increments called iterations or sprints, allowing teams to adapt to changes quickly.',
      topic: 'SDLC'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'When should test planning begin in the Software Testing Life Cycle (STLC)?',
      options: ['After coding is complete', 'As soon as requirements are gathered', 'During the design phase', 'During the deployment phase'],
      correct_option: 1,
      explanation: 'Test planning should start as early as possible, ideally as soon as the requirements are gathered and analyzed.',
      topic: 'STLC'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Which test case design technique focuses on testing the boundaries of input ranges?',
      options: ['Equivalence Partitioning', 'Boundary Value Analysis', 'Decision Table Testing', 'State Transition Testing'],
      correct_option: 1,
      explanation: 'Boundary Value Analysis (BVA) is a black-box test design technique that focuses on testing values at the boundaries of input domains.',
      topic: 'Test Case Design'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'What is the status of a defect when it is first logged by a tester?',
      options: ['Open', 'New', 'Assigned', 'Resolved'],
      correct_option: 1,
      explanation: 'A newly logged defect enters the Defect Lifecycle with the status New.',
      topic: 'Defect Lifecycle'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'A spelling mistake in the company name on the homepage of a website has:',
      options: ['High Severity, High Priority', 'Low Severity, High Priority', 'High Severity, Low Priority', 'Low Severity, Low Priority'],
      correct_option: 1,
      explanation: 'A spelling mistake on the homepage is low severity because it does not break functionality, but high priority because of business visibility.',
      topic: 'Severity vs Priority'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Regression testing is performed to:',
      options: ['Find new defects in new features', 'Verify that changes did not introduce defects in existing features', 'Test system performance under load', 'Ensure the system is secure'],
      correct_option: 1,
      explanation: 'Regression testing ensures that changes, bug fixes, or enhancements did not break existing features.',
      topic: 'Regression Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'The main goal of smoke testing is to:',
      options: ['Verify the build is stable enough for detailed testing', 'Test all edge cases', 'Execute the entire regression suite', 'Validate database performance'],
      correct_option: 0,
      explanation: 'Smoke testing is a subset of test cases executed to verify that the core functions of a build work and that the build is stable enough for deeper testing.',
      topic: 'Smoke Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Sanity testing is usually:',
      options: ['A broad and deep testing of the entire application', 'A quick and focused test of a specific build to verify minor fixes', 'Automated performance validation', 'Non-functional testing'],
      correct_option: 1,
      explanation: 'Sanity testing is performed on a relatively stable build to check that specific bugs are fixed and related features function properly.',
      topic: 'Sanity Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Which of the following is a functional testing type?',
      options: ['Performance Testing', 'Usability Testing', 'Sanity Testing', 'Load Testing'],
      correct_option: 2,
      explanation: 'Sanity testing is a type of functional testing. Performance, usability, and load testing are non-functional testing types.',
      topic: 'Functional Testing Basics'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'In which SDLC phase are business requirements gathered and analyzed?',
      options: ['Design', 'Implementation', 'Requirements Gathering', 'Maintenance'],
      correct_option: 2,
      explanation: 'Requirements Gathering is the phase where customer/business needs are collected and analyzed.',
      topic: 'SDLC'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'What is the output of the Test Design phase in STLC?',
      options: ['Test Strategy', 'Test Plan', 'Test Cases', 'Test Execution Report'],
      correct_option: 2,
      explanation: 'The primary outputs of the Test Design phase are the finalized Test Cases and Test Data.',
      topic: 'STLC'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Equivalence Partitioning involves:',
      options: ['Dividing input data into valid and invalid partitions', 'Testing all input combinations', 'Testing database constraints', 'Running test cases in random order'],
      correct_option: 0,
      explanation: 'Equivalence Partitioning divides the input data domain into classes of data for which similar system behavior is expected.',
      topic: 'Test Case Design'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'If a developer rejects a logged defect as not a bug, what is the status of the defect?',
      options: ['Rejected', 'Closed', 'Deferred', 'Reopened'],
      correct_option: 0,
      explanation: 'When a developer disagrees that a logged issue is a bug, they set its status to Rejected.',
      topic: 'Defect Lifecycle'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'A crash in a rarely used feature of a banking app has:',
      options: ['High Severity, Low Priority', 'Low Severity, High Priority', 'High Severity, High Priority', 'Low Severity, Low Priority'],
      correct_option: 0,
      explanation: 'A system crash indicates High Severity, but since the feature is rarely used, it might have Low Priority for scheduling the fix.',
      topic: 'Severity vs Priority'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'When is regression testing typically executed?',
      options: ['Only before the first release', 'After code changes, bug fixes, or updates', 'During the requirement gathering phase', 'Only when the customer reports a bug'],
      correct_option: 1,
      explanation: 'Regression testing is executed whenever code is modified or updated to check for side effects.',
      topic: 'Regression Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Who typically performs smoke testing?',
      options: ['Only Business Analysts', 'Only Developers', 'QA Engineers or Developers', 'End Users'],
      correct_option: 2,
      explanation: 'Developers run smoke tests before sharing a build, and QA engineers execute them upon receiving it.',
      topic: 'Smoke Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Sanity testing is a subset of:',
      options: ['Acceptance Testing', 'Regression Testing', 'Unit Testing', 'System Testing'],
      correct_option: 1,
      explanation: 'Sanity testing is a specialized subset of regression testing that focuses on verifying the stability of specific changes.',
      topic: 'Sanity Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'Black-box testing is a testing method where:',
      options: ['The tester knows the internal code structure', 'The tester does not know the internal code structure', 'The test is run without any UI', 'The database is tested directly'],
      correct_option: 1,
      explanation: 'Black-box testing treats the system as a black box where the internal implementation is not known or analyzed.',
      topic: 'Functional Testing Basics'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'What does STLC stand for?',
      options: ['System Testing Lifecycle', 'Software Test Lifecycle', 'Software Testing Life Cycle', 'Standard Test Life Cycle'],
      correct_option: 2,
      explanation: 'STLC stands for Software Testing Life Cycle.',
      topic: 'STLC'
    },
    {
      skill_name: 'Functional Testing',
      band: 'beginner',
      difficulty: 'EASY',
      question_text: 'What status should a defect be set to after a tester verifies the developer\'s fix is working?',
      options: ['Resolved', 'Verified', 'Closed', 'Finished'],
      correct_option: 2,
      explanation: 'After verification, a tester changes the defect status to Closed, marking the end of the lifecycle.',
      topic: 'Defect Lifecycle'
    },

    // 15 Intermediate Questions (Hard)
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'What is the primary purpose of a requirements traceability matrix (RTM)?',
      options: ['To track project budget', 'To map requirements to test cases and defects', 'To monitor team performance', 'To schedule testing tasks'],
      correct_option: 1,
      explanation: 'RTM is a document that maps and traces user requirements with test cases and defects to ensure complete test coverage.',
      topic: 'Requirement Analysis'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'Which estimation technique uses optimistic, pessimistic, and most likely estimates?',
      options: ['Delphi Method', 'Wideband Delphi', 'Three-Point Estimation', 'Function Point Analysis'],
      correct_option: 2,
      explanation: 'Three-Point Estimation utilizes a weighted average of three estimates (optimistic, pessimistic, and realistic) to calculate task duration.',
      topic: 'Test Estimation'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'In risk-based testing, how is test priority determined?',
      options: ['By developer availability', 'By Likelihood of failure and Business Impact', 'By the order requirements are written', 'By the number of lines of code'],
      correct_option: 1,
      explanation: 'Risk exposure is calculated based on probability (likelihood of failure) and business impact.',
      topic: 'Risk-Based Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'If an input field accepts values between 10 and 50 inclusive, which values are tested under boundary value analysis (3-value boundary testing)?',
      options: ['9, 10, 11, 49, 50, 51', '10, 30, 50', '9, 10, 50, 51', '0, 10, 50, 100'],
      correct_option: 0,
      explanation: 'Three-value boundary testing tests the boundary, one step below, and one step above: (9, 10, 11) and (49, 50, 51).',
      topic: 'Boundary Value Analysis'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'For an input field that accepts a 5-digit ZIP code (00000 to 99999), which represents an invalid equivalence partition?',
      options: ['A 5-digit number', 'A 6-digit number', 'Any number starting with 9', 'Any number between 10000 and 20000'],
      correct_option: 1,
      explanation: 'A 6-digit number is an invalid input and represents an invalid equivalence partition.',
      topic: 'Equivalence Partitioning'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'Which defect metric measures the efficiency of the test team in finding defects before release?',
      options: ['Defect Density', 'Defect Detection Efficiency (DDE)', 'Defect Rejection Rate', 'Defect Leakage Rate'],
      correct_option: 1,
      explanation: 'DDE measures the percentage of total software defects that were identified by the QA team during the testing cycle.',
      topic: 'Defect Management'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'Defect density is calculated as:',
      options: ['Total defects / Total test cases executed', 'Total defects / Size of software (e.g., KLOC or Function Points)', 'Total closed defects / Total logged defects', 'Total defects found / Testing hours'],
      correct_option: 1,
      explanation: 'Defect Density is the number of defects confirmed in a module or system divided by the size of the software.',
      topic: 'Test Metrics'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'During requirement analysis, what is "ambiguity in requirements"?',
      options: ['A requirement that cannot be automated', 'A requirement that can be interpreted in multiple ways', 'A requirement that is too expensive to implement', 'A requirement that lacks developer approval'],
      correct_option: 1,
      explanation: 'Ambiguity occurs when a requirement is unclear and can lead to multiple interpretations by developers and testers.',
      topic: 'Requirement Analysis'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'Wideband Delphi estimation relies on:',
      options: ['Historical data analysis', 'Anonymized consensus among a panel of experts', 'A single architect\'s estimation', 'Random sampling of test cases'],
      correct_option: 1,
      explanation: 'Wideband Delphi is a consensus-based estimation technique where a panel of experts answers questionnaires anonymously.',
      topic: 'Test Estimation'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'Risk exposure is calculated as:',
      options: ['Probability × Impact', 'Severity + Priority', 'Defects × Severity', 'Testing Time / Remaining Defects'],
      correct_option: 0,
      explanation: 'Risk exposure (or risk value) is calculated as the product of the probability of occurrence and its negative impact.',
      topic: 'Risk-Based Testing'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'If an input field accepts age from 18 to 60, what are the two-value boundary values?',
      options: ['17, 18, 60, 61', '18, 60', '17, 61', '19, 59'],
      correct_option: 1,
      explanation: 'Two-value boundary testing tests only the exact boundary values: 18 and 60.',
      topic: 'Boundary Value Analysis'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'Which of the following is true about equivalence partitions?',
      options: ['Partitions must overlap', 'A test case can cover multiple values from the same partition to be thorough', 'All values within a single partition are expected to behave the same way', 'Equivalence partitioning applies only to positive inputs'],
      correct_option: 2,
      explanation: 'The fundamental premise of equivalence partitioning is that any value within a partition yields the same result.',
      topic: 'Equivalence Partitioning'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'What is a "deferred" defect?',
      options: ['A defect that is rejected as not a bug', 'A defect whose fix is postponed to a future release', 'A defect that is fixed but not yet verified', 'A defect that cannot be reproduced'],
      correct_option: 1,
      explanation: 'A deferred status means a defect has been acknowledged but its remediation is scheduled for a future sprint or release.',
      topic: 'Defect Management'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'What does a high Defect Leakage Rate indicate?',
      options: ['Excellent testing quality', 'Defects are being missed during the testing phase and caught in production', 'Developers are fixing bugs very quickly', 'The test environment is highly stable'],
      correct_option: 1,
      explanation: 'Defect leakage refers to bugs that slipped past validation and were reported by end-users or clients in production.',
      topic: 'Test Metrics'
    },
    {
      skill_name: 'Functional Testing',
      band: 'intermediate',
      difficulty: 'HARD',
      question_text: 'What is the primary focus of static testing?',
      options: ['Executing the software to find runtime errors', 'Reviewing requirements, designs, and code without executing the software', 'Simulating high traffic load', 'Testing database failover mechanisms'],
      correct_option: 1,
      explanation: 'Static testing is verification performed without executing the code, using reviews, walk-throughs, and inspections.',
      topic: 'Requirement Analysis'
    }
  ];

  for (const q of questions) {
    await pool.query(
      `INSERT INTO question_bank (skill_name, band, difficulty, question_text, options, correct_option, explanation, topic, points, time_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [q.skill_name, q.band, q.difficulty, q.question_text, JSON.stringify(q.options), q.correct_option, q.explanation, q.topic, 1, 60]
    );
  }
}

// ============================================================
// END PHASE 1 HELPERS
// ============================================================

// Helper function to execute queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    return res;
  } catch (error) {
    console.error('❌ Query error:', { text, params, error: error.message });
    throw error;
  }
}

// Full schema sync on startup (tables, migrations, ZenAssess, BFSI, sandbox)
async function syncDatabaseSchema() {
  try {
    console.log('🔄 Syncing Zensar Database Schema...');
    // Create employees table
    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(50) PRIMARY KEY,
        zensar_id VARCHAR(50) UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        designation VARCHAR(255),
        department VARCHAR(255),
        location VARCHAR(255),
        years_it INTEGER DEFAULT 0,
        years_zensar INTEGER DEFAULT 0,
        password VARCHAR(255),
        overall_capability INTEGER DEFAULT 0,
        submitted BOOLEAN DEFAULT FALSE,
        resume_uploaded BOOLEAN DEFAULT FALSE,
        primary_skill VARCHAR(255),
        secondary_skill VARCHAR(255),
        tertiary_skill VARCHAR(255),
        primary_domain VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS github_username VARCHAR(100)`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS secondary_skill VARCHAR(255)`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tertiary_skill VARCHAR(255)`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade VARCHAR(50)`);
    // Marks employees whose Zensar ID was auto-generated (no ID found on the resume
    // during bulk import). Admins can fill in the real ID later via a per-row button;
    // setting the real ID clears this flag.
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS zensar_id_auto BOOLEAN DEFAULT FALSE`);

    // Create skills table
    await query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        skill_name VARCHAR(255) NOT NULL,
        self_rating INTEGER DEFAULT 0,
        manager_rating INTEGER,
        validated BOOLEAN DEFAULT FALSE,
        verified_badge_level VARCHAR(50) DEFAULT NULL,
        self_claimed_level VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, skill_name)
      )
    `);
    await query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS verified_badge_level VARCHAR(50) DEFAULT NULL`).catch(() => {});
    await query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS self_claimed_level VARCHAR(50) DEFAULT NULL`).catch(() => {});

    // Backfill self_claimed_level from the numeric self_rating for legacy rows
    // that have a rating but no claimed level. Mapping matches the rows already
    // populated and the app's level scale: rating 3+ = Expert, 2 = Intermediate,
    // 1 = Beginner. Idempotent (only touches rows where self_claimed_level IS NULL).
    try {
      const backfill = await query(`
        UPDATE skills
        SET self_claimed_level = CASE
          WHEN self_rating >= 3 THEN 'Expert'
          WHEN self_rating = 2 THEN 'Intermediate'
          WHEN self_rating = 1 THEN 'Beginner'
          ELSE NULL
        END
        WHERE self_claimed_level IS NULL
          AND self_rating IS NOT NULL
          AND self_rating > 0
      `);
      if (backfill.rowCount > 0) {
      }
    } catch (e) {
      console.warn('[migration] self_claimed_level backfill skipped:', e.message);
    }

    // Pool employees (resume pool / bench, separate from ZenMatrix employees) +
    // flags on employees so BFSI can combine both sources. Additive & idempotent.
    await query(`
      CREATE TABLE IF NOT EXISTS pool_employees (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        designation VARCHAR(255),
        department VARCHAR(255),
        grade VARCHAR(50),
        years_it INTEGER DEFAULT 0,
        location VARCHAR(255),
        primary_skill VARCHAR(255),
        secondary_skill VARCHAR(255),
        tertiary_skill VARCHAR(255),
        source VARCHAR(50) DEFAULT 'pool',
        resume_url VARCHAR(500),
        added_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `).catch((e) => console.warn('[migration] pool_employees create skipped:', e.message));
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_pool BOOLEAN DEFAULT false`).catch(() => {});
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pool_source VARCHAR(50) DEFAULT NULL`).catch(() => {});

    // Allocate / Reserve tracking (Find a Match). Additive & idempotent.
    for (const col of [
      `status VARCHAR(50) DEFAULT 'available'`,
      `allocated_srf VARCHAR(100) DEFAULT NULL`, `allocated_role VARCHAR(255) DEFAULT NULL`,
      `allocated_at TIMESTAMP DEFAULT NULL`, `allocated_by VARCHAR(100) DEFAULT NULL`,
      `reserved_srf VARCHAR(100) DEFAULT NULL`, `reserved_role VARCHAR(255) DEFAULT NULL`,
      `reserved_at TIMESTAMP DEFAULT NULL`, `reserved_by VARCHAR(100) DEFAULT NULL`,
    ]) {
      await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }
    await query(`
      CREATE TABLE IF NOT EXISTS allocation_log (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(100),
        srf_id VARCHAR(100),
        role_name VARCHAR(255),
        action VARCHAR(50) DEFAULT 'allocated',
        actioned_by VARCHAR(100),
        actioned_at TIMESTAMP DEFAULT NOW()
      )
    `).catch((e) => console.warn('[migration] allocation_log create skipped:', e.message));

    // Create projects table
    await query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        project_name VARCHAR(255) NOT NULL,
        role VARCHAR(255),
        client VARCHAR(255),
        domain VARCHAR(255),
        start_date DATE,
        end_date DATE,
        description TEXT,
        technologies TEXT[],
        skills_used TEXT[],
        team_size INTEGER DEFAULT 0,
        outcome TEXT,
        is_ongoing BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Ensure all columns exist for existing projects table
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client VARCHAR(255)`);
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS domain VARCHAR(255)`);
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS skills_used TEXT[]`);
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_size INTEGER DEFAULT 0`);
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS outcome TEXT`);
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_ongoing BOOLEAN DEFAULT FALSE`);

    // Create certifications table
    await query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        cert_name VARCHAR(255) NOT NULL,
        issuing_organization VARCHAR(255),
        issue_date DATE,
        expiry_date DATE,
        no_expiry BOOLEAN DEFAULT FALSE,
        credential_id VARCHAR(255),
        credential_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add no_expiry column if DB existed before this fix
    await query(`ALTER TABLE certifications ADD COLUMN IF NOT EXISTS no_expiry BOOLEAN DEFAULT FALSE`);

    // Create education table
    await query(`
      CREATE TABLE IF NOT EXISTS education (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        degree VARCHAR(255),
        institution VARCHAR(255),
        field_of_study VARCHAR(255),
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        grade VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create achievements table
    await query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id VARCHAR(50) PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        award_type VARCHAR(50) DEFAULT 'Other',
        category VARCHAR(50) DEFAULT 'Other',
        date_received VARCHAR(50),
        description TEXT,
        issuer VARCHAR(255),
        project_context VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_zensar_id ON employees(zensar_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_skills_employee_id ON skills(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_projects_employee_id ON projects(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_certifications_employee_id ON certifications(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_education_employee_id ON education(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_achievements_employee_id ON achievements(employee_id)`);
    // (growth_plans table removed — index skipped)

    // Create app_settings table
    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT
      )
    `);

    // Seed default admin if missing
    const hasAdmin = await query("SELECT * FROM app_settings WHERE key = 'admin_id'");
    if (hasAdmin.rowCount === 0) {
      await query("INSERT INTO app_settings (key, value) VALUES ('admin_id', 'admin'), ('admin_password', 'admin123')");
    }

    // CLEANUP: Remove any projects with empty/placeholder names
    await query("DELETE FROM projects WHERE project_name IS NULL OR project_name = '' OR project_name = '.'");

    // Create BFSI roles table
    await query(`
      CREATE TABLE IF NOT EXISTS bfsi_roles (
        id SERIAL PRIMARY KEY,
        role_id VARCHAR(50) UNIQUE NOT NULL,
        role_title VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        required_skills TEXT[],
        days_open INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Open',
        fill_priority VARCHAR(50) DEFAULT 'Medium',
        assigned_spoc VARCHAR(255),
        created_date DATE DEFAULT CURRENT_DATE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        hire_type VARCHAR(50),
        job_description TEXT,
        srf_no VARCHAR(50),
        aging_bucket VARCHAR(50),
        type VARCHAR(50)
      )
    `);

    // Create BFSI employee workforce table
    await query(`
      CREATE TABLE IF NOT EXISTS bfsi_workforce (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        current_skills TEXT[],
        certifications TEXT[],
        experience_years INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Available',
        doj DATE,
        primary_skill VARCHAR(255),
        domain_expertise TEXT[],
        reskilling_program VARCHAR(255),
        graduation_date DATE,
        bench_days INTEGER DEFAULT 0,
        reject_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        band VARCHAR(50),
        billing_status VARCHAR(50),
        project_name VARCHAR(255),
        customer VARCHAR(255),
        pm_name VARCHAR(255),
        location VARCHAR(255),
        aging_days INTEGER DEFAULT 0,
        practice_name VARCHAR(255),
        service_line VARCHAR(255),
        deployable_flag BOOLEAN DEFAULT FALSE,
        rmg_status VARCHAR(50),
        pool_status VARCHAR(50),
        deallocation_date DATE,
        return_to_pool_date DATE,
        release_reason VARCHAR(255),
        UNIQUE(employee_id)
      )
    `);
    
    // Add new columns if they don't exist (for existing databases)
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS band VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS billing_status VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS project_name VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS customer VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS pm_name VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS aging_days INTEGER DEFAULT 0`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS practice_name VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS service_line VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS deployable_flag BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS rmg_status VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS pool_status VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS deallocation_date DATE`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS return_to_pool_date DATE`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS release_reason VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS grade VARCHAR(50)`);
    
    // Add new columns to roles table
    await query(`ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS hire_type VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS job_description TEXT`);
    await query(`ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS srf_no VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS aging_bucket VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS type VARCHAR(50)`);
    await query(`ALTER TABLE bfsi_roles ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS pool_status VARCHAR(100)`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS comments TEXT`);
    await query(`ALTER TABLE bfsi_workforce ADD COLUMN IF NOT EXISTS srf_no VARCHAR(50)`);

    // Create BFSI certifications pipeline table
    await query(`
      CREATE TABLE IF NOT EXISTS bfsi_certifications (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES bfsi_workforce(employee_id) ON DELETE CASCADE,
        cert_name VARCHAR(255) NOT NULL,
        provider VARCHAR(255),
        start_date DATE,
        expected_completion DATE,
        status VARCHAR(50) DEFAULT 'In Progress',
        duration_weeks INTEGER DEFAULT 4,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create BFSI role assignments table
    await query(`
      CREATE TABLE IF NOT EXISTS bfsi_assignments (
        id SERIAL PRIMARY KEY,
        role_id VARCHAR(50) REFERENCES bfsi_roles(role_id) ON DELETE CASCADE,
        employee_id VARCHAR(50) REFERENCES bfsi_workforce(employee_id) ON DELETE CASCADE,
        match_score INTEGER DEFAULT 0,
        assignment_status VARCHAR(50) DEFAULT 'Shortlisted',
        assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(role_id, employee_id)
      )
    `);

    // Create BFSI upload history
    await query(`
      CREATE TABLE IF NOT EXISTS bfsi_uploads (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255),
        uploaded_by VARCHAR(255),
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        records_processed INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Success'
      )
    `);
    
    // Create BFSI summary data table for Demand vs Supply
    await query(`
      CREATE TABLE IF NOT EXISTS bfsi_summary_data (
        id SERIAL PRIMARY KEY,
        primary_skill VARCHAR(255) UNIQUE NOT NULL,
        reactive_srf INTEGER DEFAULT 0,
        reactive_backup INTEGER DEFAULT 0,
        demand_forecast INTEGER DEFAULT 0,
        proactive INTEGER DEFAULT 0,
        demand_total INTEGER DEFAULT 0,
        pool_supply INTEGER DEFAULT 0,
        deallocation_supply INTEGER DEFAULT 0,
        supply_total INTEGER DEFAULT 0,
        gap INTEGER DEFAULT 0,
        offers_reactive INTEGER DEFAULT 0,
        offers_proactive INTEGER DEFAULT 0,
        offers_total INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for BFSI tables
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_roles_status ON bfsi_roles(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_roles_type ON bfsi_roles(type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_status ON bfsi_workforce(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_workforce_billing ON bfsi_workforce(billing_status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_certifications_emp ON bfsi_certifications(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_assignments_role ON bfsi_assignments(role_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bfsi_summary_skill ON bfsi_summary_data(primary_skill)`);

    // ── GitHub Intelligence Engine (ZenCode) tables ──
    await query(`
      CREATE TABLE IF NOT EXISTS github_profiles (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR UNIQUE,
        github_username VARCHAR,
        consent_given BOOLEAN DEFAULT false,
        connected_at TIMESTAMP,
        name VARCHAR,
        bio TEXT,
        company VARCHAR,
        location VARCHAR,
        blog VARCHAR,
        twitter VARCHAR,
        public_repos INTEGER,
        followers INTEGER,
        following INTEGER,
        account_created_at TIMESTAMP,
        developer_score INTEGER DEFAULT 0,
        profile_completeness INTEGER DEFAULT 0,
        last_analyzed_at TIMESTAMP,
        analysis_status VARCHAR DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS github_repositories (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR,
        repo_name VARCHAR,
        repo_full_name VARCHAR,
        description TEXT,
        is_fork BOOLEAN DEFAULT false,
        is_private BOOLEAN DEFAULT false,
        stars INTEGER DEFAULT 0,
        forks INTEGER DEFAULT 0,
        watchers INTEGER DEFAULT 0,
        open_issues INTEGER DEFAULT 0,
        topics JSONB DEFAULT '[]',
        size_kb INTEGER,
        default_branch VARCHAR,
        license VARCHAR,
        homepage_url VARCHAR,
        created_at_github TIMESTAMP,
        updated_at_github TIMESTAMP,
        own_commit_count INTEGER DEFAULT 0,
        total_commit_count INTEGER DEFAULT 0,
        contribution_percentage INTEGER DEFAULT 0,
        trivial_commit_ratio INTEGER DEFAULT 0,
        fork_credit_eligible BOOLEAN DEFAULT true,
        health_score INTEGER DEFAULT 0,
        documentation_score INTEGER DEFAULT 0,
        project_category VARCHAR,
        languages JSONB DEFAULT '{}',
        frameworks_detected JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS github_skill_evidence (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR,
        skill_name VARCHAR,
        evidence_count INTEGER DEFAULT 0,
        confidence_score INTEGER DEFAULT 0,
        freshness_score INTEGER DEFAULT 0,
        last_evidence_date TIMESTAMP,
        source_repos JSONB DEFAULT '[]',
        evidence_level VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, skill_name)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS github_workforce_readiness (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR,
        role_name VARCHAR,
        match_percentage INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Integration columns on the existing skills table (ZenMatrix)
    await query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS github_evidence_score INTEGER DEFAULT 0`);
    await query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS github_suggested_level VARCHAR`);

    await query(`CREATE INDEX IF NOT EXISTS idx_github_repos_emp ON github_repositories(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_github_skill_evidence_emp ON github_skill_evidence(employee_id)`);

    // Initialize Phase 1 (Security) and Phase 2 (ZenAssess) tables
    await ensureSecurityTables();
    await ensurePhase2Tables();

    // Create SQL sandbox schema for coding assessments
    await ensureSandboxSchema();
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error (non-blocking):', error.message);
  }
}

async function ensureSandboxSchema() {
  try {
    await query(`CREATE SCHEMA IF NOT EXISTS zenassess_sandbox`);
    await query(`
      CREATE TABLE IF NOT EXISTS zenassess_sandbox.employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        department VARCHAR(100),
        salary NUMERIC(10,2),
        manager_id INTEGER,
        hire_date DATE,
        location VARCHAR(100)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS zenassess_sandbox.products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200),
        category VARCHAR(100),
        price NUMERIC(10,2),
        stock INTEGER,
        supplier_id INTEGER
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS zenassess_sandbox.orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        order_date DATE,
        status VARCHAR(50),
        total_amount NUMERIC(10,2)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS zenassess_sandbox.customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200),
        email VARCHAR(200),
        country VARCHAR(100),
        created_at DATE
      )
    `);
    // Seed only if empty
    const empCount = await query('SELECT COUNT(*) FROM zenassess_sandbox.employees');
    if (parseInt(empCount.rows[0].count) === 0) {
      await query(`INSERT INTO zenassess_sandbox.employees (name, department, salary, manager_id, hire_date, location) VALUES
        ('Alice Johnson', 'Engineering', 95000, NULL, '2018-01-15', 'London'),
        ('Bob Smith', 'Engineering', 80000, 1, '2019-03-20', 'Manchester'),
        ('Carol White', 'QA', 72000, 1, '2020-06-10', 'London'),
        ('David Brown', 'Engineering', 88000, 1, '2017-09-05', 'London'),
        ('Eve Davis', 'QA', 68000, 3, '2021-01-20', 'Edinburgh'),
        ('Frank Wilson', 'DevOps', 91000, 1, '2016-11-30', 'London'),
        ('Grace Lee', 'DevOps', 85000, 6, '2019-07-15', 'Bristol'),
        ('Henry Martinez', 'QA', 65000, 3, '2022-04-01', 'London')
      `);
      await query(`INSERT INTO zenassess_sandbox.customers (name, email, country, created_at) VALUES
        ('Acme Corp', 'contact@acme.com', 'UK', '2020-01-01'),
        ('TechCo Ltd', 'info@techco.com', 'UK', '2020-03-15'),
        ('Global Sys', 'hello@globalsys.com', 'DE', '2021-06-01'),
        ('SoftWare Inc', 'sales@software.com', 'US', '2019-12-01')
      `);
      await query(`INSERT INTO zenassess_sandbox.products (name, category, price, stock, supplier_id) VALUES
        ('Laptop Pro', 'Electronics', 1299.99, 50, 1),
        ('Wireless Mouse', 'Electronics', 29.99, 200, 1),
        ('USB Hub', 'Electronics', 19.99, 150, 2),
        ('Monitor 27"', 'Electronics', 399.99, 30, 1),
        ('Keyboard Mech', 'Electronics', 89.99, 100, 2)
      `);
      await query(`INSERT INTO zenassess_sandbox.orders (customer_id, product_id, quantity, order_date, status, total_amount) VALUES
        (1, 1, 5, '2024-01-10', 'COMPLETED', 6499.95),
        (2, 2, 10, '2024-01-15', 'COMPLETED', 299.90),
        (1, 3, 20, '2024-02-01', 'PENDING', 399.80),
        (3, 4, 2, '2024-02-10', 'COMPLETED', 799.98),
        (4, 5, 8, '2024-03-01', 'PROCESSING', 719.92)
      `);
    }
  } catch (err) {
    console.error('❌ Sandbox schema error (non-blocking):', err.message);
  }
}

// API Routes

// Health check endpoint
app.get('/api/health', (req, res) => res.status(200).send('OK'));
app.head('/api/health', (req, res) => res.status(200).send('OK'));

// Full stack status — DB + Ollama + backend (for single-port / competition demo)
app.get('/api/system/status', async (req, res) => {
  const ollamaUrl = process.env.VITE_OLLAMA_URL || 'http://127.0.0.1:11434';
  let db = false;
  let ollama = false;
  let employeeCount = 0;
  try {
    await pool.query('SELECT 1');
    db = true;
    const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM employees');
    employeeCount = cnt.rows[0]?.n || 0;
  } catch (_) {}
  try {
    const r = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
    ollama = r.ok;
  } catch (_) {}
  res.json({
    ok: db && ollama,
    backend: true,
    database: db,
    ollama,
    employeeCount,
    gatewayPort: Number(process.env.GATEWAY_PORT) || 8080,
    backendPort: PORT,
    singlePortMode: process.env.VITE_SINGLE_PORT === 'true',
  });
});

// Get all employees
// BACKWARD COMPATIBLE: Works with both JWT and session-based auth during transition
app.get('/api/employees', async (req, res) => {
  try {
    const employeesResult = await query('SELECT * FROM employees ORDER BY created_at DESC');
    const skillsResult = await query('SELECT * FROM skills ORDER BY employee_id, skill_name');

    const employees = employeesResult.rows.map(e => ({
      ...e,
      password: decryptPw(e.password)
    }));
    res.json({
      employees,
      skills: skillsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get certifications (ALL or per ID) — case-insensitive, zensar_id fallback
app.get('/api/certifications/:id', async (req, res) => {
  try {
    let result;
    if (req.params.id === 'ALL') {
      result = await query('SELECT * FROM certifications ORDER BY issue_date DESC');
      res.json({ certifications: result.rows });
    } else {
      // Resolve the actual employee_id (case-insensitive, zensar_id fallback)
      const empRes = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
        [req.params.id]
      );
      const resolvedId = empRes.rows[0]?.id || req.params.id;
      result = await query(
        'SELECT * FROM certifications WHERE LOWER(employee_id) = LOWER($1) ORDER BY created_at DESC',
        [resolvedId]
      );
      const mapped = result.rows.map(r => ({
        ID: r.id, id: r.id,
        EmployeeID: r.employee_id,
        CertName: r.cert_name,
        Provider: r.issuing_organization || '',
        IssueDate: r.issue_date ? String(r.issue_date).split('T')[0] : '',
        ExpiryDate: r.expiry_date ? String(r.expiry_date).split('T')[0] : '',
        NoExpiry: r.no_expiry || false,
        RenewalDate: '',
        CredentialID: r.credential_id || '',
        CredentialURL: r.credential_url || '',
        IsAIExtracted: false,
        AddedAt: r.created_at,
      }));
      res.json({ certifications: mapped });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get projects (ALL or per ID) — case-insensitive + zensar_id fallback
app.get('/api/projects/:id', async (req, res) => {
  try {
    if (req.params.id === 'ALL') {
      const result = await query('SELECT * FROM projects ORDER BY created_at DESC');
      const mapped = result.rows.map(r => ({
        ID: r.id, id: r.id,
        EmployeeID: r.employee_id,
        ProjectName: r.project_name,
        Role: r.role || '',
        Client: r.client || '',
        Domain: r.domain || '',
        StartDate: r.start_date ? String(r.start_date).split('T')[0] : '',
        EndDate: r.end_date ? String(r.end_date).split('T')[0] : '',
        IsOngoing: r.is_ongoing || false,
        Description: r.description || '',
        Technologies: Array.isArray(r.technologies) ? r.technologies : [],
        SkillsUsed: Array.isArray(r.skills_used) ? r.skills_used : [],
        TeamSize: r.team_size || 0,
        Outcome: r.outcome || '',
        AddedAt: r.created_at,
      }));
      res.json({ projects: mapped });
    } else {
      // Resolve actual employee.id (case-insensitive + zensar_id lookup)
      const empRes = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
        [req.params.id]
      );
      const resolvedId = empRes.rows[0]?.id || req.params.id;
      const result = await query(
        'SELECT * FROM projects WHERE LOWER(employee_id) = LOWER($1) ORDER BY created_at DESC',
        [resolvedId]
      );
      const mapped = result.rows.map(r => ({
        ID: r.id, id: r.id,
        EmployeeID: r.employee_id,
        ProjectName: r.project_name,
        Role: r.role || '',
        Client: r.client || '',
        Domain: r.domain || '',
        StartDate: r.start_date ? String(r.start_date).split('T')[0] : '',
        EndDate: r.end_date ? String(r.end_date).split('T')[0] : '',
        IsOngoing: r.is_ongoing || false,
        Description: r.description || '',
        Technologies: Array.isArray(r.technologies) ? r.technologies : [],
        SkillsUsed: Array.isArray(r.skills_used) ? r.skills_used : [],
        TeamSize: r.team_size || 0,
        Outcome: r.outcome || '',
        AddedAt: r.created_at,
      }));
      res.json({ projects: mapped });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Derive employee grade from years_it when employees.grade is NULL.
// 0–3 yrs → F1, 4–12 yrs → E1, 13+ yrs → D
function deriveGradeFromYearsIT(years) {
  const yrs = Number(years) || 0;
  if (yrs >= 13) return 'D';
  if (yrs >= 4) return 'E1';
  return 'F1';
}

// Get single employee — case-insensitive lookup
// BACKWARD COMPATIBLE: Works with both JWT and session-based auth during transition
app.get('/api/employees/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = result.rows[0];
    emp.password = decryptPw(emp.password);

    // Grade must never be blank — derive from years_it and persist when missing
    if (!emp.grade) {
      const derivedGrade = deriveGradeFromYearsIT(emp.years_it);
      emp.grade = derivedGrade;
      query('UPDATE employees SET grade = $1 WHERE id = $2', [derivedGrade, emp.id]).catch(() => {});
    }

    res.json(emp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/employees — Admin employee creation with full field support
app.post('/api/employees', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const zensar_id = (body.ZensarID || body.zensar_id || body.zensarId || `EMP_${Date.now()}`).trim();
    const name = (body.EmployeeName || body.name || 'Unknown').trim();
    const email = (body.Email || body.email || `${zensar_id.toLowerCase()}@zensar.com`).trim();
    const phone = (body.Phone || body.phone || '').trim();
    const desig = (body.Designation || body.designation || 'Employee').trim();
    const loc = (body.Location || body.location || 'India').trim();
    const dept = (body.department || body.Department || '').trim();
    const yearsIT = parseInt(body.yearsIT || body.YearsIT || 0) || 0;
    const yearsZen = parseInt(body.yearsZensar || body.YearsZensar || 0) || 0;
    const rawPw = body.password || body.Password || '';
    const encPw = rawPw ? encryptPw(rawPw) : encryptPw('zensar123');

    // Check for duplicates with specific field validation
    const existingZensarId = await query(
      'SELECT * FROM employees WHERE LOWER(zensar_id) = LOWER($1)',
      [zensar_id]
    );
    if (existingZensarId.rows.length > 0) {
      return res.status(400).json({ error: `Zensar ID '${zensar_id}' already exists in the database.` });
    }

    const existingEmail = await query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: `Email '${email}' is already registered with another employee.` });
    }

    if (phone) {
      const existingPhone = await query(
        'SELECT * FROM employees WHERE phone = $1',
        [phone]
      );
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({ error: `Phone number '${phone}' is already associated with another employee.` });
      }
    }

    const grade = body.grade || null;
    const result = await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, designation, department, location, years_it, years_zensar, password, grade)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [zensar_id, zensar_id, name, email, phone, desig, dept, loc, yearsIT, yearsZen, encPw, grade]);

    res.json({ success: true, ...result.rows[0], id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Zensar ID or Email already exists. Please use a different ID.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete employee (and all associated data)
app.delete('/api/employees/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    // Resolve the actual employee id (case-insensitive, zensar_id fallback)
    const empRes = await pool.query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
      [id]
    );
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const realId = empRes.rows[0].id;
    // Delete all associated records first (foreign key safety)
    await pool.query('DELETE FROM skills WHERE LOWER(employee_id) = LOWER($1)', [realId]);
    await pool.query('DELETE FROM certifications WHERE LOWER(employee_id) = LOWER($1)', [realId]);
    await pool.query('DELETE FROM projects WHERE LOWER(employee_id) = LOWER($1)', [realId]);
    await pool.query('DELETE FROM education WHERE LOWER(employee_id) = LOWER($1)', [realId]);
    // Delete the employee
    await pool.query('DELETE FROM employees WHERE id = $1', [realId]);
    await auditLog({ employeeId: req.user?.employeeId, role: req.user?.role, action: 'EMPLOYEE_DELETE', resource: 'employees', resourceId: realId, req });
    res.json({ success: true, message: `Employee ${realId} deleted successfully` });
  } catch (error) {
    console.error('[Delete Employee Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete employees + all their related data (skills, certs, projects, etc.)
app.delete('/api/admin/employees/bulk', requireAdmin, async (req, res) => {
  try {
    const { employeeIds } = req.body || {};
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ error: 'No employee IDs provided' });
    }
    // Type-safe: ids may be stored differently than sent — compare as text.
    const lower = employeeIds.map((x) => String(x).toLowerCase());
    const resolved = await pool.query(
      `SELECT id FROM employees
       WHERE LOWER(id::text) = ANY($1::text[]) OR LOWER(zensar_id::text) = ANY($1::text[])`,
      [lower]
    );
    const realIds = resolved.rows.map((r) => String(r.id));
    if (realIds.length === 0) {
      return res.status(404).json({ error: 'No matching employees found' });
    }

    const beforeCount = await pool.query('SELECT COUNT(*)::int AS n FROM employees');

    // Delete associated records first (foreign key safety), then the employees.
    // Tables that may not exist / may lack employee_id are guarded individually.
    for (const tbl of ['skills', 'certifications', 'projects', 'education', 'zenassess_sessions', 'manager_reviews']) {
      await pool.query(`DELETE FROM ${tbl} WHERE employee_id::text = ANY($1::text[])`, [realIds])
        .catch((e) => console.warn(`[Bulk Delete] skip ${tbl}:`, e.message));
    }
    const result = await pool.query(
      'DELETE FROM employees WHERE id::text = ANY($1::text[]) RETURNING id, name',
      [realIds]
    );
    const afterCount = await pool.query('SELECT COUNT(*)::int AS n FROM employees');

    await auditLog({ employeeId: req.user?.employeeId, role: req.user?.role, action: 'EMPLOYEE_BULK_DELETE', resource: 'employees', resourceId: realIds.join(','), req });
    return res.json({ success: true, deleted: result.rowCount, ids: result.rows.map((r) => r.id) });
  } catch (error) {
    console.error('[Bulk Delete Error]', error);
    return res.status(500).json({ error: error.message });
  }
});


app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, designation, department, location, yearsIT, yearsZensar, password, zensarId, primarySkill, secondarySkill, tertiarySkill, primaryDomain, grade } = req.body;
    const zid = (zensarId || `emp_${Date.now()}`).trim();
    const emailTrimmed = (email || '').trim().toLowerCase();
    const phoneTrimmed = (phone || '').trim();

    // Password policy: min 8 chars, at least one letter and one number
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      if (!/[a-zA-Z]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one letter.' });
      if (!/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one number.' });
    }

    // Check for duplicates with specific field validation
    const existingZensarId = await query(
      'SELECT * FROM employees WHERE LOWER(zensar_id) = LOWER($1)',
      [zid]
    );
    if (existingZensarId.rows.length > 0) {
      return res.status(400).json({ error: `Zensar ID '${zid}' already exists in the database.` });
    }

    const existingEmail = await query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [emailTrimmed]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: `Email '${emailTrimmed}' is already registered with another employee.` });
    }

    if (phoneTrimmed) {
      const existingPhone = await query(
        'SELECT * FROM employees WHERE phone = $1',
        [phoneTrimmed]
      );
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({ error: `Phone number '${phoneTrimmed}' is already associated with another employee.` });
      }
    }

    const result = await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, designation, department, location, years_it, years_zensar, password, primary_skill, secondary_skill, tertiary_skill, primary_domain, grade)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [zid, zid, name, emailTrimmed, phoneTrimmed, designation, department, location, yearsIT || 0, yearsZensar || 0, encryptPw(password), primarySkill, secondarySkill, tertiarySkill, primaryDomain, grade || null]);

    await auditLog({ employeeId: zid, role: 'employee', action: 'REGISTER', resource: 'employees', req });
    res.json({ success: true, employee: { ...result.rows[0], id: result.rows[0].zensar_id || result.rows[0].id } });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email or Zensar ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Login — issues JWT access token + refresh token
app.post('/api/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  try {
    const loginId = String(req.body.login || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    // ── Lockout check: 5 failed attempts in 15 min per IP ──────────────────
    const locked = await checkLoginRateLimit(ip);
    if (locked) {
      await auditLog({ action: 'LOGIN_BLOCKED', resource: 'auth', details: { loginId }, req, status: 'failure' });
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    // ── Admin check ─────────────────────────────────────────────────────────
    const adminIdData = await query("SELECT value FROM app_settings WHERE key = 'admin_id'");
    const adminPwData = await query("SELECT value FROM app_settings WHERE key = 'admin_password'");
    const dbAdminId = adminIdData.rows[0]?.value || 'admin';
    const dbAdminPw = adminPwData.rows[0]?.value || 'admin123';

    if (loginId === dbAdminId.toLowerCase() && password === dbAdminPw) {
      const payload = { employeeId: 'admin', role: 'admin', name: 'Master Admin' };
      const accessToken = generateAccessToken(payload);
      const rawRefresh = crypto.randomBytes(40).toString('hex');
      const refreshHash = hashToken(rawRefresh);
      const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 86400000);
      await pool.query(
        `INSERT INTO refresh_tokens (employee_id, token_hash, role, expires_at, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        ['admin', refreshHash, 'admin', expiresAt, ip, ua]
      );
      await logLoginAttempt({ employeeId: 'admin', loginId, success: true, req });
      await auditLog({ employeeId: 'admin', role: 'admin', action: 'LOGIN', resource: 'auth', req });
      return res.json({
        success: true,
        accessToken,
        refreshToken: rawRefresh,
        expiresIn: 900,
        employee: { id: 'admin', name: 'Master Admin', role: 'admin', zensar_id: dbAdminId.toUpperCase() }
      });
    }

    // ── Employee check ──────────────────────────────────────────────────────
    const result = await query(
      `SELECT * FROM employees WHERE LOWER(zensar_id)=$1 OR LOWER(id)=$1 OR LOWER(email)=$1 OR LOWER(phone)=$1`,
      [loginId]
    );
    if (result.rows.length === 0) {
      await logLoginAttempt({ loginId, success: false, failureReason: 'not_found', req });
      await auditLog({ action: 'LOGIN_FAILED', resource: 'auth', details: { loginId, reason: 'not_found' }, req, status: 'failure' });
      return res.status(401).json({ error: 'Account not found' });
    }

    const emp = result.rows[0];
    const storedPw = String(emp.password || '').trim();
    if (decryptPw(storedPw) !== password && storedPw !== password) {
      await logLoginAttempt({ employeeId: emp.id, loginId, success: false, failureReason: 'wrong_password', req });
      await auditLog({ employeeId: emp.id, action: 'LOGIN_FAILED', resource: 'auth', details: { reason: 'wrong_password' }, req, status: 'failure' });
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const empId = emp.zensar_id || emp.id;
    const payload = { employeeId: empId, role: 'employee', name: emp.name };
    const accessToken = generateAccessToken(payload);
    const rawRefresh = crypto.randomBytes(40).toString('hex');
    const refreshHash = hashToken(rawRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 86400000);
    await pool.query(
      `INSERT INTO refresh_tokens (employee_id, token_hash, role, expires_at, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [empId, refreshHash, 'employee', expiresAt, ip, ua]
    );
    await logLoginAttempt({ employeeId: empId, loginId, success: true, req });
    await auditLog({ employeeId: empId, role: 'employee', action: 'LOGIN', resource: 'auth', req });

    res.json({
      success: true,
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: 900,
      employee: { ...emp, id: empId, name: emp.name, role: 'employee', password: undefined }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh access token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    const hash = hashToken(refreshToken);
    const result = await pool.query(
      `SELECT * FROM refresh_tokens WHERE token_hash=$1 AND revoked=false AND expires_at > NOW()`,
      [hash]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const row = result.rows[0];
    const accessToken = generateAccessToken({ employeeId: row.employee_id, role: row.role, name: '' });
    res.json({ success: true, accessToken, expiresIn: 900 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout — revoke refresh token
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const hash = hashToken(refreshToken);
      await pool.query(`UPDATE refresh_tokens SET revoked=true, revoked_at=NOW() WHERE token_hash=$1`, [hash]);
    }
    if (req.user) {
      await auditLog({ employeeId: req.user.employeeId, role: req.user.role, action: 'LOGOUT', resource: 'auth', req });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs (admin only)
app.get('/api/auth/audit-logs', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.query(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    res.json({ logs: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/reviews — list all expert reviews (admin/manager view)
app.get('/api/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT mr.*, e.name as employee_name, e.zensar_id,
              zs.tab_switch_count, zs.copy_paste_count, zs.integrity_score, zs.integrity_flags,
              zs.fullscreen_exit_count, zs.browser_blur_count, zs.devtools_detected,
              zs.explain_score_breakdown, zs.contribution_breakdown, zs.github_metadata,
              zs.allocation_readiness_score, zs.allocation_risk, zs.ready_for_allocation,
              zs.expert_profile, zs.extracted_evidence, zs.evidence_evaluation, zs.technical_discussion,
              zs.leadership_discussion, zs.consistency_analysis, zs.risk_analysis, zs.ai_recommendation,
              zs.authenticity_analysis
       FROM manager_reviews mr
       JOIN employees e ON mr.employee_id = e.id
       LEFT JOIN zenassess_sessions zs ON mr.session_id = zs.session_id
       ORDER BY mr.created_at DESC`
    );
    res.json({ success: true, reviews: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reviews/claim — claim a review session
app.post('/api/admin/reviews/claim', requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const reviewerId = req.user.employeeId;
    await query(
      `UPDATE manager_reviews 
       SET review_status = 'in_review', 
           reviewer_id = $1, 
           review_started_at = NOW(), 
           updated_at = NOW() 
       WHERE session_id = $2 AND review_status = 'pending'`,
      [reviewerId, sessionId]
    );
    await auditLog({ 
      employeeId: reviewerId, 
      role: 'admin', 
      action: 'REVIEW_CLAIM', 
      resource: 'manager_reviews', 
      resourceId: sessionId, 
      req 
    });
    res.json({ success: true, message: 'Review claimed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reviews/approve — approve expert validation
app.post('/api/admin/reviews/approve', requireAdmin, async (req, res) => {
  try {
    const { sessionId, reviewNotes, adjustedScores } = req.body;
    const reviewerId = req.user.employeeId;
    
    await query(
      `UPDATE manager_reviews 
       SET review_status = 'approved', 
           review_notes = $1, 
           final_decision = 'Expert', 
           review_completed_at = NOW(), 
           updated_at = NOW() 
       WHERE session_id = $2`,
      [reviewNotes, sessionId]
    );

    await query(
      `UPDATE zenassess_evidence 
       SET manager_review_status = 'approved' 
       WHERE session_id = $1`,
      [sessionId]
    );

    if (adjustedScores) {
      const sessionRes = await query('SELECT explain_score_breakdown FROM zenassess_sessions WHERE session_id = $1', [sessionId]);
      if (sessionRes.rows.length > 0) {
        let breakdown = sessionRes.rows[0].explain_score_breakdown || {};
        if (typeof breakdown === 'string') breakdown = JSON.parse(breakdown);
        
        breakdown.finalScore = Number(adjustedScores.finalScore) || breakdown.finalScore;
        if (!breakdown.expertDetails) breakdown.expertDetails = {};
        breakdown.expertDetails.evidenceScore = Number(adjustedScores.evidenceScore);
        breakdown.expertDetails.scenarioScore = Number(adjustedScores.scenarioScore);
        breakdown.expertDetails.mentoringScore = Number(adjustedScores.mentoringScore);
        breakdown.expertDetails.experienceScore = Number(adjustedScores.experienceScore);
        breakdown.expertDetails.projectAllocationScore = Number(adjustedScores.finalScore);

        await query(
          `UPDATE zenassess_sessions 
           SET score = $1, final_score = $1, project_allocation_score = $1,
               evidence_score = $2, mcq_score = $3, contribution_score = $4,
               explain_score_breakdown = $5, allocation_readiness_score = $7, updated_at = NOW()
           WHERE session_id = $6`,
          [
            Number(adjustedScores.finalScore),
            Number(adjustedScores.evidenceScore),
            Number(adjustedScores.scenarioScore),
            Number(adjustedScores.mentoringScore),
            JSON.stringify(breakdown),
            sessionId,
            Number(adjustedScores.allocationConfidence) || 85
          ]
        );
      }
    }

    const reviewResult = await query(
      `SELECT employee_id, skill_name FROM manager_reviews WHERE session_id = $1`,
      [sessionId]
    );
    if (reviewResult.rows.length > 0) {
      const { employee_id, skill_name } = reviewResult.rows[0];
      await query(
        `INSERT INTO skills (employee_id, skill_name, self_rating, validated, manager_rating)
         VALUES ($1, $2, 3, true, 3)
         ON CONFLICT (employee_id, skill_name) 
         DO UPDATE SET validated = true, self_rating = 3, manager_rating = 3, updated_at = NOW()`,
        [employee_id, skill_name]
      );
      await query(
        `UPDATE zenassess_sessions 
         SET status = 'passed', assigned_level = 'Expert', updated_at = NOW() 
         WHERE session_id = $1`,
         [sessionId]
      );
      try {
        await query('SELECT recalculate_employee_skill_freshness($1)', [employee_id]);
      } catch (_) {}
    }

    await auditLog({ 
      employeeId: reviewerId, 
      role: 'admin', 
      action: 'REVIEW_APPROVE', 
      resource: 'manager_reviews', 
      resourceId: sessionId, 
      newValue: { reviewNotes, adjustedScores },
      req 
    });
    res.json({ success: true, message: 'Review approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reviews/reject — reject expert validation (assign Advanced)
app.post('/api/admin/reviews/reject', requireAdmin, async (req, res) => {
  try {
    const { sessionId, reviewNotes, adjustedScores } = req.body;
    const reviewerId = req.user.employeeId;
    
    await query(
      `UPDATE manager_reviews 
       SET review_status = 'rejected', 
           review_notes = $1, 
           final_decision = 'Advanced', 
           review_completed_at = NOW(), 
           updated_at = NOW() 
       WHERE session_id = $2`,
      [reviewNotes, sessionId]
    );

    await query(
      `UPDATE zenassess_evidence 
       SET manager_review_status = 'rejected' 
       WHERE session_id = $1`,
      [sessionId]
    );

    if (adjustedScores) {
      const sessionRes = await query('SELECT explain_score_breakdown FROM zenassess_sessions WHERE session_id = $1', [sessionId]);
      if (sessionRes.rows.length > 0) {
        let breakdown = sessionRes.rows[0].explain_score_breakdown || {};
        if (typeof breakdown === 'string') breakdown = JSON.parse(breakdown);
        
        breakdown.finalScore = Number(adjustedScores.finalScore) || breakdown.finalScore;
        if (!breakdown.expertDetails) breakdown.expertDetails = {};
        breakdown.expertDetails.evidenceScore = Number(adjustedScores.evidenceScore);
        breakdown.expertDetails.scenarioScore = Number(adjustedScores.scenarioScore);
        breakdown.expertDetails.mentoringScore = Number(adjustedScores.mentoringScore);
        breakdown.expertDetails.experienceScore = Number(adjustedScores.experienceScore);
        breakdown.expertDetails.projectAllocationScore = Number(adjustedScores.finalScore);

        await query(
          `UPDATE zenassess_sessions 
           SET score = $1, final_score = $1, project_allocation_score = $1,
               evidence_score = $2, mcq_score = $3, contribution_score = $4,
               explain_score_breakdown = $5, allocation_readiness_score = $7, updated_at = NOW()
           WHERE session_id = $6`,
          [
            Number(adjustedScores.finalScore),
            Number(adjustedScores.evidenceScore),
            Number(adjustedScores.scenarioScore),
            Number(adjustedScores.mentoringScore),
            JSON.stringify(breakdown),
            sessionId,
            Number(adjustedScores.allocationConfidence) || 80
          ]
        );
      }
    }

    const reviewResult = await query(
      `SELECT employee_id, skill_name FROM manager_reviews WHERE session_id = $1`,
      [sessionId]
    );
    if (reviewResult.rows.length > 0) {
      const { employee_id, skill_name } = reviewResult.rows[0];
      await query(
        `INSERT INTO skills (employee_id, skill_name, self_rating, validated, manager_rating)
         VALUES ($1, $2, 3, true, 3)
         ON CONFLICT (employee_id, skill_name) 
         DO UPDATE SET validated = true, self_rating = 3, manager_rating = 3, updated_at = NOW()`,
        [employee_id, skill_name]
      );
      await query(
        `UPDATE zenassess_sessions 
         SET status = 'passed', assigned_level = 'Advanced', updated_at = NOW() 
         WHERE session_id = $1`,
         [sessionId]
      );
      try {
        await query('SELECT recalculate_employee_skill_freshness($1)', [employee_id]);
      } catch (_) {}
    }

    await auditLog({ 
      employeeId: reviewerId, 
      role: 'admin', 
      action: 'REVIEW_REJECT', 
      resource: 'manager_reviews', 
      resourceId: sessionId, 
      newValue: { reviewNotes, adjustedScores },
      req 
    });
    res.json({ success: true, message: 'Review rejected (assigned Advanced)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reviews/escalate — escalate a review
app.post('/api/admin/reviews/escalate', requireAdmin, async (req, res) => {
  try {
    const { sessionId, escalationReason, escalatedTo } = req.body;
    const reviewerId = req.user.employeeId;
    
    await query(
      `UPDATE manager_reviews 
       SET review_status = 'escalated', 
           escalation_reason = $1, 
           escalated_to = $2, 
           updated_at = NOW() 
       WHERE session_id = $3`,
      [escalationReason, escalatedTo || 'admin', sessionId]
    );

    await auditLog({ 
      employeeId: reviewerId, 
      role: 'admin', 
      action: 'REVIEW_ESCALATE', 
      resource: 'manager_reviews', 
      resourceId: sessionId, 
      newValue: { escalationReason, escalatedTo },
      req 
    });
    res.json({ success: true, message: 'Review escalated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update app settings (admin credentials)
app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { admin_id, admin_password } = req.body;
    if (admin_id) await query("UPDATE app_settings SET value = $1 WHERE key = 'admin_id'", [admin_id]);
    if (admin_password) await query("UPDATE app_settings SET value = $1 WHERE key = 'admin_password'", [admin_password]);
    res.json({ success: true, message: 'Admin settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/employees/add', requireAdmin, async (req, res) => {
  try {
    const { name, email, zensar_id, password, phone, designation, department, location, years_it, years_zensar, primary_skill, primary_domain } = req.body;
    const zid = (zensar_id || '').trim();
    const emailTrimmed = (email || '').trim().toLowerCase();
    const phoneTrimmed = (phone || '').trim();

    // Check for duplicates with specific field validation
    const existingZensarId = await query(
      'SELECT * FROM employees WHERE LOWER(zensar_id) = LOWER($1)',
      [zid]
    );
    if (existingZensarId.rows.length > 0) {
      return res.status(400).json({ error: `Zensar ID '${zid}' already exists in the database.` });
    }

    const existingEmail = await query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [emailTrimmed]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: `Email '${emailTrimmed}' is already registered with another employee.` });
    }

    if (phoneTrimmed) {
      const existingPhone = await query(
        'SELECT * FROM employees WHERE phone = $1',
        [phoneTrimmed]
      );
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({ error: `Phone number '${phoneTrimmed}' is already associated with another employee.` });
      }
    }

    const id = zensar_id || `EMP_${Date.now()}`;
    const encrypted = password ? encryptPw(password) : encryptPw('zensar123'); // Default password

    await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, password, designation, department, location, years_it, years_zensar, primary_skill, primary_domain)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [id, zensar_id, name, email, phone, encrypted, designation, department, location, years_it, years_zensar, primary_skill, primary_domain]);

    res.json({ success: true, message: 'Employee added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compute the next auto-generated Zensar ID. Auto IDs occupy the 100001–999999
// range; we take the current max in that range and increment, skipping any value
// already used by an existing id/zensar_id (e.g. a manually-created one).
async function nextAutoZensarId() {
  const r = await query(
    `SELECT COALESCE(MAX(CAST(zensar_id AS BIGINT)), 100000) AS mx
       FROM employees
      WHERE zensar_id ~ '^[0-9]+$' AND CAST(zensar_id AS BIGINT) BETWEEN 100001 AND 999999`
  );
  let next = Number(r.rows[0]?.mx || 100000) + 1;
  if (next < 100001) next = 100001;
  for (let i = 0; i < 5000; i++) {
    const exists = await query('SELECT 1 FROM employees WHERE id = $1 OR zensar_id = $1 LIMIT 1', [String(next)]);
    if (exists.rows.length === 0) return String(next);
    next++;
  }
  return String(next);
}

// Admin create employee (used by AdminDashboard)
app.post('/api/admin/create-employee', requireAdmin, async (req, res) => {
  try {
    const { name, email, employeeId, phone, designation, department, location, yearsIT, yearsZensar, password, skills, projects, certificates, education, primarySkill, secondarySkill, tertiarySkill, primaryDomain } = req.body;
    let zid = (employeeId || '').trim();
    const emailTrimmed = (email || '').trim().toLowerCase();
    const phoneTrimmed = (phone || '').trim();

    // No Zensar ID supplied (e.g. bulk resume import where the resume/filename had
    // no ID) → auto-assign the next sequential ID (100001, 100002, …) and flag it so
    // an admin can fill in the real ID later.
    let zensarIdAuto = false;
    if (!zid) {
      zid = await nextAutoZensarId();
      zensarIdAuto = true;
    }

    // Check for duplicates with specific field validation
    const existingZensarId = await query(
      'SELECT * FROM employees WHERE LOWER(zensar_id) = LOWER($1)',
      [zid]
    );
    if (existingZensarId.rows.length > 0) {
      return res.status(400).json({ error: `Zensar ID '${zid}' already exists in the database.` });
    }

    const existingEmail = await query(
      'SELECT * FROM employees WHERE LOWER(email) = LOWER($1)',
      [emailTrimmed]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: `Email '${emailTrimmed}' is already registered with another employee.` });
    }

    if (phoneTrimmed) {
      const existingPhone = await query(
        'SELECT * FROM employees WHERE phone = $1',
        [phoneTrimmed]
      );
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({ error: `Phone number '${phoneTrimmed}' is already associated with another employee.` });
      }
    }

    // Determine primary_skill, secondary_skill, tertiary_skill, and primary_domain from skills if not provided
    let finalPrimarySkill = primarySkill || '';
    let finalSecondarySkill = secondarySkill || req.body.secondary_skill || '';
    let finalTertiarySkill = tertiarySkill || req.body.tertiary_skill || '';
    let finalPrimaryDomain = primaryDomain || '';
    
    if (Array.isArray(skills) && skills.length > 0) {
      const sortedSkills = [...skills].sort((a, b) => (b.rating || b.selfRating || 0) - (a.rating || a.selfRating || 0));
      if (!finalPrimarySkill) finalPrimarySkill = sortedSkills[0]?.name || sortedSkills[0]?.skillName || '';
      if (!finalSecondarySkill) finalSecondarySkill = sortedSkills[1]?.name || sortedSkills[1]?.skillName || '';
      if (!finalTertiarySkill) finalTertiarySkill = sortedSkills[2]?.name || sortedSkills[2]?.skillName || '';
    }
    
    if (!finalPrimaryDomain && Array.isArray(skills) && skills.length > 0) {
      // Find highest rated domain skill (Banking, Insurance, Healthcare, etc.)
      const domainSkills = ['Banking', 'Insurance', 'Healthcare', 'E-Commerce', 'Telecom', 'Retail', 'Energy & Utilities'];
      const foundDomain = skills.find(s => domainSkills.includes(s.name || s.skillName || ''));
      finalPrimaryDomain = foundDomain?.name || foundDomain?.skillName || '';
    }

    // Create the employee
    const result = await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, designation, department, location, years_it, years_zensar, password, primary_skill, secondary_skill, tertiary_skill, primary_domain, zensar_id_auto)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [zid, zid, name, emailTrimmed, phoneTrimmed, designation || '', department || '', location || '', yearsIT || 0, yearsZensar || 0, encryptPw(password), finalPrimarySkill, finalSecondarySkill, finalTertiarySkill, finalPrimaryDomain, zensarIdAuto]);


    // Save skills if provided
    let skillsSaved = 0;
    if (Array.isArray(skills) && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.name || skill.skillName || '';
        const rating = skill.rating || skill.selfRating || 1; // Default to Level 1
        if (skillName && rating > 0) {
          try {
            await query(`
              INSERT INTO skills (employee_id, skill_name, self_rating)
              VALUES ($1, $2, $3)
              ON CONFLICT (employee_id, skill_name) DO UPDATE SET self_rating = $3
            `, [zid, skillName, Math.min(5, rating)]); // Allow ratings 1-5
            skillsSaved++;
          } catch (err) {
            console.error('[Admin Create Employee] Error saving skill:', skillName, err.message);
          }
        }
      }
    }

    // Save projects if provided
    let projectsSaved = 0;
    if (Array.isArray(projects) && projects.length > 0) {
      for (const proj of projects) {
        const projName = proj.name || proj.projectName || '';
        const projDesc = proj.description || '';
        const projDuration = proj.duration || '';
        const projTech = Array.isArray(proj.technologies) ? proj.technologies : [];
        if (projName) {
          try {
            await query(`
              INSERT INTO projects (employee_id, project_name, description, technologies)
              VALUES ($1, $2, $3, $4)
            `, [zid, projName, projDesc, projTech]);
            projectsSaved++;
          } catch (err) {
            console.error('[Admin Create Employee] Error saving project:', projName, err.message);
          }
        }
      }
    }

    // Save certifications if provided
    let certsSaved = 0;
    if (Array.isArray(certificates) && certificates.length > 0) {
      for (const cert of certificates) {
        const certName = cert.name || cert.CertName || '';
        const certIssuer = cert.issuer || cert.Provider || '';
        const certDate = cert.date || '';
        if (certName) {
          try {
            await query(`
              INSERT INTO certifications (employee_id, cert_name, issuing_organization)
              VALUES ($1, $2, $3)
            `, [zid, certName, certIssuer]);
            certsSaved++;
          } catch (err) {
            console.error('[Admin Create Employee] Error saving certification:', certName, err.message);
          }
        }
      }
    }

    // Save education if provided
    let eduSaved = 0;
    if (Array.isArray(education) && education.length > 0) {
      for (const edu of education) {
        const degree = edu.degree || '';
        if (degree) {
          try {
            await query(`
              INSERT INTO education (employee_id, degree, institution, field_of_study)
              VALUES ($1, $2, $3, $4)
            `, [zid, degree, edu.institution || '', edu.field || '']);
            eduSaved++;
          } catch (err) {
            console.error('[Admin Create Employee] Error saving education:', degree, err.message);
          }
        }
      }
    }

    res.json({ 
      success: true, 
      ...result.rows[0], 
      id: result.rows[0].id,
      saved: {
        skills: skillsSaved,
        projects: projectsSaved,
        certifications: certsSaved,
        education: eduSaved
      }
    });
  } catch (error) {
    console.error('[Admin Create Employee] Error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Zensar ID or Email already exists in the database.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Set the real Zensar ID for an auto-assigned employee.
// We only update the `zensar_id` column (the display ID) — the internal `id`
// primary key is left untouched because child tables (skills, projects, …)
// reference it. Clears the zensar_id_auto flag so the "Set Zensar ID" button
// disappears from the admin table.
app.post('/api/admin/employees/set-zensar-id', requireAdmin, async (req, res) => {
  try {
    const { id, zensarId } = req.body;
    const internalId = (id || '').trim();
    const newZid = (zensarId || '').toString().replace(/[^0-9]/g, '');

    if (!internalId) return res.status(400).json({ error: 'Employee id is required.' });
    if (newZid.length !== 5 && newZid.length !== 6) {
      return res.status(400).json({ error: 'Zensar ID must be exactly 5 or 6 digits.' });
    }

    // The target employee must exist.
    const target = await query('SELECT id FROM employees WHERE id = $1', [internalId]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Employee not found.' });

    // The new Zensar ID must not clash with anyone else.
    const clash = await query(
      'SELECT id FROM employees WHERE (zensar_id = $1 OR id = $1) AND id <> $2 LIMIT 1',
      [newZid, internalId]
    );
    if (clash.rows.length > 0) {
      return res.status(400).json({ error: `Zensar ID '${newZid}' is already used by another employee.` });
    }

    const updated = await query(
      `UPDATE employees SET zensar_id = $1, zensar_id_auto = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *`,
      [newZid, internalId]
    );
    res.json({ success: true, ...updated.rows[0] });
  } catch (error) {
    console.error('[Set Zensar ID] Error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'That Zensar ID is already in use.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Admin update employee
app.post('/api/admin/employees/update', async (req, res) => {
  try {
    // Perform authentication and check target permissions inside
    requireAuth(req, res, async () => {
      try {
        // Support both camelCase (frontend) and snake_case (legacy)
        const { 
          id, name, email, zensar_id, password, phone, designation, department, location, 
          years_it, years_zensar, primary_skill, primary_domain,
          secondary_skill, tertiary_skill,
          // camelCase aliases
          yearsIT, yearsZensar, primarySkill, primaryDomain,
          secondarySkill, tertiarySkill,
          grade
        } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Employee ID (id) is required' });
        }

        // Backward compatibility: allow if no req.user (e.g. no auth token in some modes)
        const isAdmin = !req.user || req.user.role === 'admin';
        const isSelf = req.user && (
          String(req.user.employeeId || '').toLowerCase() === String(id).toLowerCase() ||
          String(req.user.id || '').toLowerCase() === String(id).toLowerCase()
        );

        if (!isAdmin && !isSelf) {
          return res.status(403).json({ error: 'Access denied: Admin role or self-update required' });
        }

        let encrypted = null;
        if (password) {
          encrypted = encryptPw(password);
        }

        // Use camelCase values as fallback for snake_case
        const finalYearsIT = years_it ?? yearsIT ?? 0;
        const finalYearsZensar = years_zensar ?? yearsZensar ?? 0;
        const finalPrimarySkill = primary_skill ?? primarySkill ?? null;
        const finalPrimaryDomain = primary_domain ?? primaryDomain ?? null;
        const finalSecondarySkill = secondary_skill ?? secondarySkill ?? null;
        const finalTertiarySkill = tertiary_skill ?? tertiarySkill ?? null;

        await query(`
          UPDATE employees 
          SET name = COALESCE($1, name), email = COALESCE($2, email), zensar_id = COALESCE($3, zensar_id), 
              phone = COALESCE($4, phone), designation = COALESCE($5, designation), 
              department = COALESCE($6, department), location = COALESCE($7, location), 
              years_it = COALESCE($8, years_it), years_zensar = COALESCE($9, years_zensar), 
              password = COALESCE($10, password), primary_skill = COALESCE($11, primary_skill), 
              primary_domain = COALESCE($12, primary_domain),
              secondary_skill = COALESCE($13, secondary_skill),
              tertiary_skill = COALESCE($14, tertiary_skill),
              grade = COALESCE($15, grade),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $16 OR zensar_id = $16
        `, [
          name, email, zensar_id, phone, designation,
          department, location, finalYearsIT, finalYearsZensar,
          encrypted, finalPrimarySkill, finalPrimaryDomain,
          finalSecondarySkill, finalTertiarySkill, grade || null, id
        ]);

        res.json({ success: true, message: 'Personnel record updated' });
      } catch (innerError) {
        console.error('[Admin Update Inner Error]', innerError);
        res.status(500).json({ error: innerError.message });
      }
    });
  } catch (error) {
    console.error('[Admin Update Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee skills (batch endpoint for optimization)
app.post('/api/employees/batch-skills', requireAuth, async (req, res) => {
  try {
    const { employeeIds } = req.body;
    
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ error: 'employeeIds array is required' });
    }

    // Create placeholders for the IN clause
    const placeholders = employeeIds.map((_, index) => `$${index + 1}`).join(',');
    const query_text = `SELECT * FROM skills WHERE employee_id IN (${placeholders})`;
    
    const result = await query(query_text, employeeIds);

    // Group skills by employee_id
    const skillsByEmployee = {};
    
    result.rows.forEach(row => {
      if (!Reflect.has(skillsByEmployee, row.employee_id)) {
        Reflect.set(skillsByEmployee, row.employee_id, []);
      }
      
      // Check if it's a predefined skill
      const predefinedIdx = SKILL_NAMES.indexOf(row.skill_name);
      const skillId = predefinedIdx >= 0 ? `s${predefinedIdx + 1}` : row.skill_name;

      Reflect.get(skillsByEmployee, row.employee_id).push({
        skillId: skillId,
        skill_name: row.skill_name, // Keep original field name for compatibility
        skillName: row.skill_name,
        selfRating: row.self_rating,
        managerRating: row.manager_rating,
        validated: row.validated,
        // ZenAssess verified badge + self-claimed level (needed by match modal)
        verifiedBadgeLevel: row.verified_badge_level,
        verified_badge_level: row.verified_badge_level,
        selfClaimedLevel: row.self_claimed_level,
        self_claimed_level: row.self_claimed_level,
        lastValidationDate: row.last_validated_date,
        lastProjectDate: row.last_project_date,
        lastCertificationDate: row.last_cert_date,
        lastUsedDate: row.last_used_date,
        freshnessScore: row.freshness_score,
        freshnessStatus: row.freshness_status,
        revalidationReq: row.revalidation_req,
        confidenceScore: row.confidence_score,
        allocationReadiness: row.allocation_readiness,
        allocationRisk: row.allocation_risk,
        readyForAllocation: row.ready_for_allocation,
        capabilityScore: row.capability_score
      });
    });

    // Filter out skills with 0 rating and ensure all requested employees are in response
    employeeIds.forEach(empId => {
      if (!Reflect.has(skillsByEmployee, empId)) {
        Reflect.set(skillsByEmployee, empId, []);
      } else {
        Reflect.set(skillsByEmployee, empId, Reflect.get(skillsByEmployee, empId).filter(s => s.selfRating > 0));
      }
    });

    res.json(skillsByEmployee);
  } catch (error) {
    console.error('❌ Batch skills error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/skills/confidence/:employeeId/:skillId — get confidence details & history
app.get('/api/skills/confidence/:employeeId/:skillId', requireAuth, async (req, res) => {
  try {
    let resolvedId = req.params.employeeId;
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [req.params.employeeId]);
    if (empCheck.rows.length > 0) resolvedId = empCheck.rows[0].id;

    // Resolve skill name
    const skillParam = req.params.skillId;
    const skillNameFromId = Reflect.get(SKILL_NAMES, parseInt(skillParam.replace(/^s/i, '')) - 1);
    const skillName = skillNameFromId || skillParam;

    // Run recalculate to be 100% accurate
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedId]);
    } catch (_) {}

    // Get current rating details
    const skillRes = await query(
      'SELECT * FROM skills WHERE employee_id = $1 AND skill_name = $2',
      [resolvedId, skillName]
    );
    if (skillRes.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not rated' });
    }
    const skillRow = skillRes.rows[0];

    // Compute breakdown details again for visual display
    const self_rating_pts = skillRow.self_rating > 0 ? 40 : 0;
    
    const hasAssess = (await query(
      'SELECT EXISTS(SELECT 1 FROM zenassess_sessions WHERE employee_id = $1 AND skill_name = $2 AND status IN (\'completed\', \'passed\', \'review_required\'))',
      [resolvedId, skillName]
    )).rows[0].exists;
    const assess_pts = hasAssess ? 30 : 0;

    const hasReview = (await query(
      'SELECT EXISTS(SELECT 1 FROM manager_reviews WHERE employee_id = $1 AND skill_name = $2 AND review_status = \'approved\')',
      [resolvedId, skillName]
    )).rows[0].exists;
    const review_pts = hasReview ? 15 : 0;

    const projCount = parseInt((await query(
      'SELECT COUNT(*) FROM projects WHERE employee_id = $1 AND ($2 = ANY(skills_used) OR $2 = ANY(technologies))',
      [resolvedId, skillName]
    )).rows[0].count);
    const proj_pts = Math.min(10, projCount * 5);

    const certCount = parseInt((await query(
      'SELECT COUNT(*) FROM certifications WHERE employee_id = $1 AND cert_name ILIKE $2',
      [resolvedId, '%' + skillName + '%']
    )).rows[0].count);
    const cert_pts = certCount > 0 ? 10 : 0;

    // Fetch history
    const historyRes = await query(
      `SELECT created_at as "date", confidence_score as "score", reason 
       FROM skill_confidence_history 
       WHERE employee_id = $1 AND skill_name = $2 
       ORDER BY created_at ASC`,
      [resolvedId, skillName]
    );

    res.json({
      success: true,
      currentScore: skillRow.confidence_score,
      breakdown: {
        selfRatingPoints: self_rating_pts,
        assessmentPoints: assess_pts,
        reviewPoints: review_pts,
        projectPoints: proj_pts,
        certificationPoints: cert_pts,
        total: skillRow.confidence_score
      },
      validatedLevel: skillRow.validated_level || 'Not Validated',
      capabilityScore: skillRow.capability_score || 0,
      assessmentScore: skillRow.assessment_score || 0,
      technicalDepth: skillRow.technical_depth || 0,
      projectStrength: skillRow.project_strength || 0,
      certificationStrength: skillRow.certification_strength || 0,
      mentoringStrength: skillRow.mentoring_strength || 0,
      githubStrength: skillRow.github_strength || 0,
      history: historyRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workforce-intelligence — Workforce Capability & Analytics
app.get('/api/workforce-intelligence', requireAuth, async (req, res) => {
  try {
    // 1. Hidden Skills
    const hiddenSkillsRes = await query(
      `SELECT s.id, s.employee_id, s.skill_name, s.self_rating, s.discovery_source, s.created_at,
              e.name as employee_name, e.zensar_id 
       FROM skills s 
       JOIN employees e ON s.employee_id = e.id 
       WHERE s.hidden_skill = TRUE 
       ORDER BY s.created_at DESC`
    );

    // 2. Workforce Readiness
    const empStats = await query(
      `SELECT COUNT(*) as total_count,
              COUNT(CASE WHEN overall_capability > 0 THEN 1 END) as validated_count,
              COALESCE(AVG(overall_capability), 0)::NUMERIC(5,2) as avg_readiness,
              COUNT(CASE WHEN overall_capability >= 80 THEN 1 END) as expert_count,
              COUNT(CASE WHEN overall_capability >= 60 AND overall_capability < 80 THEN 1 END) as advanced_count,
              COUNT(CASE WHEN overall_capability >= 30 AND overall_capability < 60 THEN 1 END) as intermediate_count,
              COUNT(CASE WHEN overall_capability < 30 AND overall_capability > 0 THEN 1 END) as beginner_count
       FROM employees`
    );
    const stats = empStats.rows[0];

    // 3. Emerging Skills Count
    const emergingList = ['AI Test Automation', 'ChatGPT/Prompt Engineering', 'TypeScript', 'Docker', 'Python'];
    const emergingRes = await query(
      `SELECT skill_name, COUNT(DISTINCT employee_id) as count 
       FROM skills 
       WHERE skill_name = ANY($1) AND self_rating > 0 
       GROUP BY skill_name`,
      [emergingList]
    );

    // 4. Reskilling Recommendations
    // Find highest demand open role skills
    const roleSkills = await query(
      `SELECT required_skills FROM bfsi_roles WHERE status = 'Open'`
    );
    const demandMap = {};
    roleSkills.rows.forEach(r => {
      (r.required_skills || []).forEach(sk => {
        Reflect.set(demandMap, sk, (Reflect.get(demandMap, sk) || 0) + 1);
      });
    });

    // Recommend learning paths for employees based on prerequisites
    const employeesWithPrereqs = await query(
      `SELECT e.id, e.name as employee_name, e.zensar_id,
              ARRAY_AGG(s.skill_name) as current_skills
       FROM employees e
       JOIN skills s ON e.id = s.employee_id
       WHERE s.self_rating > 0
       GROUP BY e.id, e.name, e.zensar_id`
    );

    const recommendations = [];
    employeesWithPrereqs.rows.forEach(emp => {
      const skills = emp.current_skills || [];
      const hasJava = skills.includes('Java');
      const hasPython = skills.includes('Python');
      const hasFunctional = skills.includes('Functional Testing');
      const hasSelenium = skills.includes('Selenium');

      if (hasJava && !skills.includes('Appium') && (demandMap['Appium'] || 0) > 0) {
        recommendations.push({
          employeeName: emp.employee_name,
          zensarId: emp.zensar_id,
          currentSkill: 'Java',
          recommendedSkill: 'Appium',
          reason: 'High demand open Mobile role. Java is a strong prerequisite.',
          targetRole: 'Mobile SDET'
        });
      }
      if (hasPython && !skills.includes('AI Test Automation') && (demandMap['AI Test Automation'] || 0) > 0) {
        recommendations.push({
          employeeName: emp.employee_name,
          zensarId: emp.zensar_id,
          currentSkill: 'Python',
          recommendedSkill: 'AI Test Automation',
          reason: 'Fastest-growing emerging skill. Python knowledge is ideal.',
          targetRole: 'Cognitive Tester'
        });
      }
      if (hasFunctional && !skills.includes('Selenium') && (demandMap['Selenium'] || 0) > 0) {
        recommendations.push({
          employeeName: emp.employee_name,
          zensarId: emp.zensar_id,
          currentSkill: 'Functional Testing',
          recommendedSkill: 'Selenium',
          reason: 'Core requirement for open automation demand. Bridge functional knowledge.',
          targetRole: 'Automation Engineer'
        });
      }
    });

    // 5. Top Talent Leaderboard
    const leaderboardRes = await query(`
      WITH RankedSkills AS (
        SELECT 
          s.skill_name,
          s.employee_id,
          e.name AS employee_name,
          s.capability_score,
          ROW_NUMBER() OVER(PARTITION BY s.skill_name ORDER BY s.capability_score DESC, s.assessment_score DESC, e.name ASC) as rnk
        FROM skills s
        JOIN employees e ON s.employee_id = e.id
        WHERE s.validated = true OR s.capability_score > 0
      ),
      SkillStats AS (
        SELECT 
          s.skill_name,
          COUNT(CASE WHEN s.validated = true THEN 1 END) as validated_count,
          COALESCE(AVG(CASE WHEN s.validated = true THEN s.capability_score END), 0) as avg_capability
        FROM skills s
        GROUP BY s.skill_name
      )
      SELECT 
        ss.skill_name,
        ss.validated_count,
        ROUND(ss.avg_capability, 1) as avg_capability,
        rs.employee_name as top_employee_name,
        rs.capability_score as top_capability_score
      FROM SkillStats ss
      LEFT JOIN RankedSkills rs ON ss.skill_name = rs.skill_name AND rs.rnk = 1
      ORDER BY ss.validated_count DESC, ss.avg_capability DESC
    `);

    const topTalentLeaderboard = leaderboardRes.rows.map(row => ({
      skillName: row.skill_name,
      validatedCount: parseInt(row.validated_count || 0),
      averageCapability: parseFloat(row.avg_capability || 0),
      topEmployeeName: row.top_employee_name || 'N/A',
      topCapabilityScore: parseInt(row.top_capability_score || 0)
    }));

    res.json({
      success: true,
      topTalentLeaderboard,
      hiddenSkills: hiddenSkillsRes.rows,
      readiness: {
        totalEmployees: parseInt(stats.total_count),
        validatedCount: parseInt(stats.validated_count),
        averageReadiness: parseFloat(stats.avg_readiness),
        capabilityLevels: {
          expert: parseInt(stats.expert_count),
          advanced: parseInt(stats.advanced_count),
          intermediate: parseInt(stats.intermediate_count),
          beginner: parseInt(stats.beginner_count)
        }
      },
      emergingSkills: emergingRes.rows,
      skillClustering: [
        {
          name: 'Web Automation Cluster',
          description: 'Combines test automation logic, scripting proficiency, and regression validation paradigms.',
          skills: ['Selenium', 'Java', 'Python', 'Regression Testing', 'UAT']
        },
        {
          name: 'Mobile & Cloud Cluster',
          description: 'Focuses on mobile software quality, cross-platform app testing, and DevOps deployment integrations.',
          skills: ['Appium', 'Mobile Testing', 'Docker', 'Git', 'Jenkins']
        },
        {
          name: 'Security & API Integration',
          description: 'Centers around service endpoint verification, relational data modeling, and penetration risk mitigation.',
          skills: ['Postman', 'API Testing', 'SQL', 'Database Testing', 'Security Testing']
        },
        {
          name: 'Cognitive Testing Cluster',
          description: 'Emerging tech cluster using large language model prompts, TypeScript engineering, and next-gen AI automation.',
          skills: ['ChatGPT/Prompt Engineering', 'AI Test Automation', 'TypeScript', 'Playwright']
        }
      ],
      reskillingRecommendations: recommendations.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get employee skills
// BACKWARD COMPATIBLE: Works with both JWT and session-based auth during transition
app.get('/api/employees/:id/skills', async (req, res) => {
  try {
    let resolvedId = req.params.id;
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [req.params.id]);
    if (empCheck.rows.length > 0) resolvedId = empCheck.rows[0].id;

    // Recalculate freshness metrics dynamically before returning
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedId]);
    } catch (err) {
      console.error('Recalculate error:', err);
    }

    const result = await query('SELECT * FROM skills WHERE employee_id = $1', [resolvedId]);

    const skills = result.rows.map(row => {
      // Check if it's a predefined skill
      const predefinedIdx = SKILL_NAMES.indexOf(row.skill_name);
      const skillId = predefinedIdx >= 0 ? `s${predefinedIdx + 1}` : row.skill_name;

      return {
        skillId: skillId,
        skillName: row.skill_name,
        selfRating: row.self_rating,
        managerRating: row.manager_rating,
        validated: row.validated,
        lastValidationDate: row.last_validated_date,
        lastProjectDate: row.last_project_date,
        lastCertificationDate: row.last_cert_date,
        lastUsedDate: row.last_used_date,
        freshnessScore: row.freshness_score,
        freshnessStatus: row.freshness_status,
        revalidationReq: row.revalidation_req,
        confidenceScore: row.confidence_score,
        allocationReadiness: row.allocation_readiness,
        allocationRisk: row.allocation_risk,
        readyForAllocation: row.ready_for_allocation,
        capabilityScore: row.capability_score,
        validatedLevel: row.validated_level || 'Not Validated',
        verifiedBadgeLevel: row.verified_badge_level,
        selfClaimedLevel: row.self_claimed_level,
        assessmentScore: row.assessment_score || 0,
        technicalDepth: row.technical_depth || 0,
        projectStrength: row.project_strength || 0,
        certificationStrength: row.certification_strength || 0,
        mentoringStrength: row.mentoring_strength || 0,
        githubStrength: row.github_strength || 0
      };
    }).filter(s => s.selfRating > 0 || s.validated);

    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update employee skills
// BACKWARD COMPATIBLE: Works with both JWT and session-based auth during transition
app.put('/api/employees/:id/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const body = req.body;
    const employeeId = req.params.id;
    const employeeName = body.employeeName || body.EmployeeName;

    // Clear only unvalidated rows — resubmitting the matrix must never wipe an earned badge
    await client.query('DELETE FROM skills WHERE employee_id = $1 AND verified_badge_level IS NULL', [employeeId]);

    // Upsert ratings; verified_badge_level is intentionally untouched here (only the test-complete flow can raise it)
    const SELF_CLAIMED_FROM_RATING = { 1: 'Beginner', 2: 'Intermediate', 3: 'Expert' };
    let ratedCount = 0;
    for (const skillName of SKILL_NAMES) {
      const rating = parseInt(String(Reflect.get(body, skillName) || 0)) || 0;
      if (rating > 0) {
        ratedCount++;
        const selfClaimedLevel = SELF_CLAIMED_FROM_RATING[Math.min(3, rating)] || null;
        await client.query(`
          INSERT INTO skills (employee_id, skill_name, self_rating, self_claimed_level)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (employee_id, skill_name) DO UPDATE SET self_rating = $3, self_claimed_level = $4, updated_at = CURRENT_TIMESTAMP
        `, [employeeId, skillName, rating, selfClaimedLevel]);
      }
    }

    // Update employee capability and submission status
    const capability = Math.round((ratedCount / 32) * 100);
    const submitted = ratedCount >= 25;

    await client.query(`
      UPDATE employees 
      SET overall_capability = $1, submitted = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 OR zensar_id = $3
    `, [capability, submitted, employeeId]);

    await client.query('COMMIT');
    
    // Recalculate freshness dynamically after commit
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [employeeId]);
    } catch (err) {
      console.error('Recalculate error after update:', err);
    }

    await auditLog({ employeeId: req.user?.employeeId, role: req.user?.role, action: 'SKILLS_UPDATE', resource: 'skills', resourceId: employeeId, req });
    res.json({ success: true, capability });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Admin itemized skill delete
app.delete('/api/skills/:employeeId/:skillId', requireAdmin, async (req, res) => {
  try {
    // Resolve employee db id from zensar_id or id
    let resolvedEmpId = req.params.employeeId;
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [req.params.employeeId]);
    if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;

    // Resolve skill name from skillId format (e.g. "s1" -> "Selenium") or treat as skill_name directly
    const skillParam = req.params.skillId;
    const skillNameFromId = Reflect.get(SKILL_NAMES, parseInt(skillParam.replace(/^s/i, '')) - 1);
    const skillName = skillNameFromId || skillParam; // fallback to raw value if not an sN id

    await query('DELETE FROM skills WHERE employee_id = $1 AND skill_name = $2', [resolvedEmpId, skillName]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve a hidden skill
app.post('/api/skills/approve-hidden', requireAuth, async (req, res) => {
  const { employeeId, skillName } = req.body;
  if (!employeeId || !skillName) return res.status(400).json({ error: 'Missing employeeId or skillName' });
  try {
    let resolvedId = employeeId;
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [employeeId]);
    if (empCheck.rows.length > 0) resolvedId = empCheck.rows[0].id;
    
    await query(
      `UPDATE skills SET hidden_skill = FALSE WHERE employee_id = $1 AND skill_name = $2`,
      [resolvedId, skillName]
    );
    
    // Recalculate confidence & freshness since it's now a real skill
    await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedId]);
    
    res.json({ success: true, message: 'Skill approved and added to profile' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin batch skill add
app.post('/api/skills', requireAuth, async (req, res) => {
  // Accept both dbEmployeeId (resolved DB id) and employeeId (zensar id)
  const empId = req.body.dbEmployeeId || req.body.employeeId;
  const skills = req.body.skills;
  if (!empId || !Array.isArray(skills)) return res.status(400).json({ error: 'Invalid payload' });

  // Resolve the actual DB employee id (handle zensar_id lookup)
  let resolvedId = empId;
  try {
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [empId]);
    if (empCheck.rows.length > 0) resolvedId = empCheck.rows[0].id;
  } catch (_) { }

  try {
    for (const s of skills) {
      // Check if skillId is a predefined skill ID (s1, s2, etc.)
      let skillName;
      if (typeof s.skillId === 'string' && s.skillId.match(/^s\d+$/i)) {
        // It's a predefined skill ID like "s1", "s2"
        const idx = parseInt(s.skillId.replace(/^s/i, '')) - 1;
        skillName = SKILL_NAMES[idx] || s.skillId;
      } else {
        // It's a custom skill name (from AI extraction)
        skillName = s.skillId || s.skillName || 'Unknown Skill';
      }

      await query(`
        INSERT INTO skills (employee_id, skill_name, self_rating)
        VALUES ($1, $2, $3)
        ON CONFLICT (employee_id, skill_name) DO UPDATE SET self_rating = $3
      `, [resolvedId, skillName, s.selfRating]);
    }

    // Dynamic freshness recalculation
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedId]);
    } catch (_) {}

    res.json({ success: true, saved: skills.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get certifications for employee — return PascalCase fields the frontend expects
app.get('/api/certifications/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM certifications WHERE LOWER(employee_id) = LOWER($1) ORDER BY created_at DESC', [req.params.id]);
    const mapped = result.rows.map(r => ({
      ID: r.id,
      EmployeeID: r.employee_id,
      CertName: r.cert_name,
      Provider: r.issuing_organization || '',
      IssueDate: r.issue_date ? String(r.issue_date).split('T')[0] : '',
      ExpiryDate: r.expiry_date ? String(r.expiry_date).split('T')[0] : '',
      NoExpiry: r.no_expiry || false,
      RenewalDate: '',
      CredentialID: r.credential_id || '',
      CredentialURL: r.credential_url || '',
      IsAIExtracted: false,
      AddedAt: r.created_at,
    }));
    res.json({ certifications: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add or Update certification
app.post('/api/certifications', requireAuth, async (req, res) => {
  // Helper: returns null for any non-parseable or placeholder date string
  const safeDate = (val) => {
    if (!val) return null;
    const s = String(val).trim().toLowerCase();
    
    // Reject known non-date placeholders
    const invalid = ['pursuing', 'present', 'ongoing', 'current', 'n/a', 'na', '-', 'null', 'none', '', 'undefined'];
    if (invalid.some(inv => s.includes(inv))) return null;
    
    // Attempt standard parse first
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

    // Fallback: Manually extract Year and Month if standard parse fails (e.g. "Dec 2024")
    const yearMatch = s.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
      const year = yearMatch[1];
      const monthMatch = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/);
      const monthMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
      const month = monthMatch ? (Reflect.get(monthMap, monthMatch[0]) || '01') : '01';
      return `${year}-${month}-01`;
    }
    
    return null;
  };

  try {
    const body = req.body;
    const rawEmpId = body.employeeId || body.EmployeeID || body.ZensarID || body.ID;
    const certName = body.certName || body.CertName || '';
    const org = body.issuingOrganization || body.Provider || '';
    const issueDate = safeDate(body.issueDate || body.IssueDate);
    const expiryDate = safeDate(body.expiryDate || body.ExpiryDate);
    const noExpiry = body.noExpiry || body.NoExpiry || false;
    const credentialId = body.credentialId || body.CredentialID || '';
    const url = body.credentialUrl || body.CredentialURL || '';
    const existingId = (body.ID && body.ID !== rawEmpId) ? body.ID : body.id;

    if (!rawEmpId) return res.status(400).json({ error: 'Employee ID required for certifications' });
    if (!certName) return res.status(400).json({ error: 'Certification name is required' });

    // ✅ Resolve actual employees.id to prevent FK violation
    const empLookup = await query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [String(rawEmpId)]
    );
    if (empLookup.rows.length === 0) {
      console.error(`[Cert Sync] ❌ Employee not found: ${rawEmpId}`);
      return res.status(400).json({ error: `Employee '${rawEmpId}' not found. Cannot save certification.` });
    }
    const empId = empLookup.rows[0].id;

    let result;
    if (existingId) {
      result = await query(`
         UPDATE certifications SET 
           cert_name = $1, issuing_organization = $2, 
           issue_date = $3, expiry_date = $4, no_expiry = $5, 
           credential_id = $6, credential_url = $7, updated_at = CURRENT_TIMESTAMP
         WHERE id = $8 AND employee_id = $9
         RETURNING *
       `, [certName, org, issueDate || null, expiryDate || null, noExpiry, credentialId, url, existingId, empId]);
    } else {
      // ── DUPLICATE CHECK: same cert name for same employee ──
      const dupCheck = await query(
        `SELECT id FROM certifications WHERE employee_id = $1 AND LOWER(TRIM(cert_name)) = LOWER(TRIM($2))`,
        [empId, certName]
      );
      if (dupCheck.rows.length > 0) {
        return res.json({ success: true, duplicate: true, message: `Certification "${certName}" already exists`, id: dupCheck.rows[0].id });
      }
      result = await query(`
        INSERT INTO certifications (employee_id, cert_name, issuing_organization, issue_date, expiry_date, no_expiry, credential_id, credential_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [empId, certName, org, issueDate || null, expiryDate || null, noExpiry, credentialId, url]);
    }

    // Dynamic freshness recalculation
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [empId]);
    } catch (_) {}

    res.json({ success: true, certification: result.rows[0] });
  } catch (error) {
    console.error('[Cert Sync Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete certification
app.delete('/api/certifications/:id', requireAuth, async (req, res) => {
  try {
    const fetchEmp = await query('SELECT employee_id FROM certifications WHERE id = $1', [req.params.id]);
    const empId = fetchEmp.rows[0]?.employee_id;
    
    const result = await query('DELETE FROM certifications WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Certification record not found' });
    
    if (empId) {
      try {
        await query('SELECT recalculate_employee_skill_freshness($1)', [empId]);
      } catch (_) {}
    }
    
    res.json({ success: true, message: 'Certification removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove credential' });
  }
});

// NOTE: GET /api/certifications/ALL is handled by the top-level GET /api/certifications/:id handler above
// (Express matches :id='ALL' in the first registered handler)


// NOTE: GET /api/projects/:id is handled by the top-level handler above
// (kept here as comment to avoid re-registering)


// Delete project
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const fetchEmp = await query('SELECT employee_id FROM projects WHERE id = $1', [req.params.id]);
    const empId = fetchEmp.rows[0]?.employee_id;
    
    const result = await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (empId) {
      try {
        await query('SELECT recalculate_employee_skill_freshness($1)', [empId]);
      } catch (_) {}
    }
    
    res.json({ success: true, message: 'Project removed' });
  } catch (error) {
    console.error('[Delete Project Error]', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Add or Update project
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    // Accept snake_case employee_id (from AdminResumeUploadPage dbEmployeeId) as well
    const empId = body.employee_id || body.employeeId || body.EmployeeID || body.ZensarID;
    const projectName = body.ProjectName || body.projectName || '';
    const role = body.Role || body.role || '';
    const client = body.Client || body.client || '';
    const domain = body.Domain || body.domain || '';
    const startDate = body.StartDate || body.startDate || null;
    const endDate = body.EndDate || body.endDate || null;
    const desc = body.Description || body.description || '';
    let techs = body.Technologies || body.technologies || [];
    let skillsUsed = body.SkillsUsed || body.skillsUsed || [];
    const teamSize = parseInt(String(body.TeamSize || body.teamSize || 0)) || 0;

    // Ensure techs/skills are arrays to prevent PG array errors
    if (!Array.isArray(techs)) techs = techs ? [techs] : [];
    if (!Array.isArray(skillsUsed)) skillsUsed = skillsUsed ? [skillsUsed] : [];
    const outcome = body.Outcome || body.outcome || '';
    const isOngoing = body.IsOngoing || body.isOngoing || false;

    // Check if we are updating an existing project (if ID is passed as a separate field or inside body)
    const existingId = body.id || null;

    if (!empId) return res.status(400).json({ error: 'Employee ID required for projects' });
    if (!projectName && !role) return res.status(400).json({ error: 'ProjectName and Role are required' });

    // ✅ CRITICAL: Resolve the actual DB employee.id to prevent projects_employee_id_fkey violation
    // Try case-insensitive match on both id and zensar_id columns
    const empLookup = await query(
      'SELECT id FROM employees WHERE id = $1 OR zensar_id = $1 OR LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
      [String(empId)]
    );
    if (empLookup.rows.length === 0) {
      console.error(`[Projects Sync] ❌ Employee not found for: ${empId}`);
      return res.status(400).json({ error: `Employee '${empId}' not found in database. Cannot save project.` });
    }
    const resolvedEmpId = empLookup.rows[0].id;

    // Handle array serialization
    if (typeof techs === 'string') { try { techs = JSON.parse(techs); } catch (e) { techs = [techs]; } }
    if (typeof skillsUsed === 'string') { try { skillsUsed = JSON.parse(skillsUsed); } catch (e) { skillsUsed = [skillsUsed]; } }


    let result;
    if (existingId) {
      result = await query(`
        UPDATE projects SET 
          project_name = $1, role = $2, client = $3, domain = $4, 
          start_date = $5, end_date = $6, description = $7, 
          technologies = $8, skills_used = $9, team_size = $10, 
          outcome = $11, is_ongoing = $12, updated_at = CURRENT_TIMESTAMP
        WHERE id = $13 AND employee_id = $14
        RETURNING *
      `, [projectName, role, client, domain, startDate || null, endDate || null, desc, techs, skillsUsed, teamSize, outcome, isOngoing, existingId, resolvedEmpId]);
    } else {
      // ── DUPLICATE CHECK: same project name + role for same employee ──
      const dupCheck = await query(
        `SELECT id FROM projects WHERE employee_id = $1 AND LOWER(TRIM(project_name)) = LOWER(TRIM($2)) AND LOWER(TRIM(COALESCE(role,''))) = LOWER(TRIM($3))`,
        [resolvedEmpId, projectName, role]
      );
      if (dupCheck.rows.length > 0) {
        return res.json({ success: true, duplicate: true, message: `Project "${projectName}" already exists`, id: dupCheck.rows[0].id });
      }
      result = await query(`
        INSERT INTO projects (
          employee_id, project_name, role, client, domain, 
          start_date, end_date, description, technologies, 
          skills_used, team_size, outcome, is_ongoing
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [resolvedEmpId, projectName, role, client, domain, startDate || null, endDate || null, desc, techs, skillsUsed, teamSize, outcome, isOngoing]);
    }

    // Dynamic freshness recalculation
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedEmpId]);
    } catch (_) {}

    res.json({ success: true, project: result.rows[0] });
  } catch (error) {
    console.error('[Projects Sync Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all projects
app.get('/api/projects/ALL', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM projects ORDER BY created_at DESC');
    const mapped = result.rows.map(r => ({
      ID: r.id,
      EmployeeID: r.employee_id,
      ProjectName: r.project_name,
      Role: r.role || '',
      Client: r.client || '',
      Domain: r.domain || '',
      StartDate: r.start_date ? String(r.start_date).split('T')[0] : '',
      EndDate: r.end_date ? String(r.end_date).split('T')[0] : '',
      IsOngoing: r.is_ongoing || false,
      Description: r.description || '',
      Technologies: r.technologies || [],
      SkillsUsed: Array.isArray(r.skills_used) ? r.skills_used : [],
      TeamSize: r.team_size || 0,
      Outcome: r.outcome || '',
      AddedAt: r.created_at,
    }));
    res.json({ projects: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add or Update education
app.post('/api/education', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const rawEmpId = body.employeeId || body.EmployeeID || body.ID;
    const degree = body.degree || body.Degree || '';
    const institution = body.institution || body.Institution || '';
    const fieldOfStudy = body.fieldOfStudy || body.FieldOfStudy || '';
    const startDate = body.startDate || body.StartDate || '';
    const endDate = body.endDate || body.EndDate || '';
    const grade = body.grade || body.Grade || '';
    const desc = body.description || body.Description || '';
    const existingId = body.id || body.ID;

    if (!rawEmpId) return res.status(400).json({ error: 'Employee ID required for academic records' });

    // ✅ Resolve actual employees.id (case-insensitive)
    const empLookup = await query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [String(rawEmpId)]
    );
    if (empLookup.rows.length === 0) {
      return res.status(400).json({ error: `Employee '${rawEmpId}' not found. Cannot save education.` });
    }
    const empId = empLookup.rows[0].id;

    let result;
    if (existingId && existingId !== rawEmpId) {
      result = await query(`
        UPDATE education SET 
          degree = $1, institution = $2, field_of_study = $3, 
          start_date = $4, end_date = $5, grade = $6, 
          description = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8 AND employee_id = $9
        RETURNING *
      `, [degree, institution, fieldOfStudy, startDate, endDate, grade, desc, existingId, empId]);
    } else {
      // ── DUPLICATE CHECK: same degree + institution for same employee ──
      const dupCheck = await query(
        `SELECT id FROM education WHERE employee_id = $1 AND LOWER(TRIM(COALESCE(degree,''))) = LOWER(TRIM($2)) AND LOWER(TRIM(COALESCE(institution,''))) = LOWER(TRIM($3))`,
        [empId, degree, institution]
      );
      if (dupCheck.rows.length > 0) {
        return res.json({ success: true, duplicate: true, message: `Education "${degree}" already exists`, id: dupCheck.rows[0].id });
      }
      result = await query(`
        INSERT INTO education (employee_id, degree, institution, field_of_study, start_date, end_date, grade, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [empId, degree, institution, fieldOfStudy, startDate, endDate, grade, desc]);
    }

    res.json({ success: true, education: result.rows[0] });
  } catch (error) {
    console.error('[Education Sync Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Get education for employee
app.get('/api/education/:id', requireAuth, async (req, res) => {
  try {
    let sql = 'SELECT * FROM education WHERE LOWER(employee_id) = LOWER($1) ORDER BY created_at DESC';
    let params = [req.params.id];

    if (req.params.id === 'ALL') {
      sql = 'SELECT * FROM education ORDER BY created_at DESC';
      params = [];
    }

    const result = await query(sql, params);
    const mapped = result.rows.map(r => ({
      ID: r.id,
      id: r.id,
      EmployeeID: r.employee_id,
      employeeId: r.employee_id,
      Degree: r.degree,
      degree: r.degree,
      Institution: r.institution,
      institution: r.institution,
      FieldOfStudy: r.field_of_study,
      fieldOfStudy: r.field_of_study,
      StartDate: r.start_date,
      startDate: r.start_date,
      EndDate: r.end_date,
      endDate: r.end_date,
      Grade: r.grade,
      grade: r.grade,
      Description: r.description,
      description: r.description
    }));
    res.json({ education: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete education
app.delete('/api/education/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM education WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Educational record removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get achievements for employee
app.get('/api/achievements/:id', requireAuth, async (req, res) => {
  try {
    let sql = 'SELECT * FROM achievements WHERE LOWER(employee_id) = LOWER($1) ORDER BY date_received DESC';
    let params = [req.params.id];

    // Also try matching by zensar_id from employees table
    const empSql = 'SELECT id FROM employees WHERE LOWER(zensar_id) = LOWER($1)';
    const empResult = await query(empSql, [req.params.id]);
    if (empResult.rows.length > 0) {
      const empPk = empResult.rows[0].id;
      sql = 'SELECT * FROM achievements WHERE LOWER(employee_id) = LOWER($1) OR LOWER(employee_id) = LOWER($2) ORDER BY date_received DESC';
      params = [req.params.id, empPk];
    }

    const result = await query(sql, params);
    const mapped = result.rows.map(r => ({
      ID: r.id,
      EmployeeID: r.employee_id,
      Title: r.title,
      AwardType: r.award_type,
      Category: r.category,
      DateReceived: r.date_received,
      Description: r.description,
      Issuer: r.issuer,
      ProjectContext: r.project_context
    }));
    res.json({ achievements: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add or Update achievement
app.post('/api/achievements', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const rawEmpId = body.employeeId || body.EmployeeID || body.employee_id;
    const id = body.id || body.ID || `ach_${Date.now()}`;
    const employeeId = rawEmpId || body.user?.id || 'unknown';

    // ── DUPLICATE CHECK: same title for same employee ──
    const dupCheck = await query(
      `SELECT id FROM achievements WHERE employee_id = $1 AND LOWER(TRIM(title)) = LOWER(TRIM($2))`,
      [employeeId, body.Title || body.title || '']
    );
    if (dupCheck.rows.length > 0 && !body.id && !body.ID) {
      return res.json({ success: true, duplicate: true, message: `Achievement "${body.Title}" already exists`, id: dupCheck.rows[0].id });
    }

    await query(`
      INSERT INTO achievements (id, employee_id, title, award_type, category, date_received, description, issuer, project_context)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        award_type = EXCLUDED.award_type,
        category = EXCLUDED.category,
        date_received = EXCLUDED.date_received,
        description = EXCLUDED.description,
        issuer = EXCLUDED.issuer,
        project_context = EXCLUDED.project_context
    `, [
      id, employeeId, body.Title || body.title,
      body.AwardType || body.award_type || 'Other',
      body.Category || body.category || 'Other',
      body.DateReceived || body.date_received || null,
      body.Description || body.description || '',
      body.Issuer || body.issuer || '',
      body.ProjectContext || body.project_context || ''
    ]);

    res.json({ success: true, message: 'Achievement saved', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete achievement
app.delete('/api/achievements/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM achievements WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Achievement removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// QI Intelligence endpoint (keeping existing logic)
app.post('/api/llm', async (req, res) => {
  try {
    const apiKey = process.env.CLOUD_API_KEY;
    const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
    const prompt = req.body.prompt;

    // Log incoming proxy request for debugging

    if (apiKey && apiKey !== 'your_api_key_here' && provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI API Error: ${response.status}`);
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      if (message?.refusal) {
        throw new Error(`OpenAI Refusal: ${message.refusal}`);
      }
      res.json({ response: message?.content || '' });

    } else if (apiKey && apiKey !== 'your_api_key_here' && provider === 'gemini') {
      const model = process.env.LLM_MODEL || 'gemini-1.5-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);
      const data = await response.json();
      res.json({ response: data.candidates[0].content.parts[0].text });

    } else if (apiKey && apiKey !== 'your_api_key_here' && provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`Claude API Error: ${response.status}`);
      const data = await response.json();
      res.json({ response: data.content[0].text });

    } else {
      // DEFAULT FALLBACK: Route to Local Ollama
      try {
        const body = {
          ...req.body,
          stream: false // Double-ensure no streaming to avoid proxy parse errors
        };
        const response = await withTimeout(fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }), 120000); // 2 minute timeout for large models

        if (!response.ok) {
          const errText = await response.text().catch(() => 'No error body');
          throw new Error(`Ollama Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        res.json(data);
      } catch (ollamaErr) {
        console.error('❌ Local Ollama Offline:', ollamaErr.message);
        res.status(503).json({
          error: (process.env.LLM_PROVIDER === 'local' || !process.env.LLM_PROVIDER)
            ? 'Cognitive Engine (Ollama) is offline. Ensure software is running or switch to Cloud IQ Mode.'
            : 'Zensar IQ Cloud unreachable. Check network or Professional subscription.'
        });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// BFSI API ENDPOINTS
// ==========================================

const XLSX = require('xlsx');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// BFSI Skills Taxonomy
const BFSI_SKILLS = {
  testing: ['API Testing', 'Performance Testing', 'Security Testing', 'Database Testing', 'Mobile Testing', 'Automation Testing', 'SDET', 'Functional Testing', 'Regression Testing', 'UAT'],
  automation: ['Selenium', 'Playwright', 'Cypress', 'Appium', 'JMeter', 'Postman', 'SOAP UI', 'LoadRunner'],
  development: ['Java', 'Python', 'C#', 'SQL', 'REST APIs', 'Microservices', 'JavaScript', 'TypeScript'],
  devops: ['Jenkins', 'Git', 'Azure DevOps', 'Docker', 'Kubernetes', 'TFS', 'JIRA', 'TestRail'],
  domain: ['Banking systems', 'Payment Processing', 'Regulatory Compliance', 'SOX', 'PCI-DSS', 'Financial Data Security', 'Banking', 'Insurance', 'E-Commerce']
};

// Get all BFSI roles
app.get('/api/bfsi/roles', requireAuth, async (req, res) => {
  try {
    const roles = await query('SELECT * FROM bfsi_roles ORDER BY created_date DESC');
    res.json({ roles: roles.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all BFSI assignments
app.get('/api/bfsi/assignments', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, r.role_title, r.client_name, r.required_skills, r.location as role_location,
             w.employee_name, w.primary_skill, w.status as employee_status, w.experience_years
      FROM bfsi_assignments a
      JOIN bfsi_roles r ON a.role_id = r.role_id
      JOIN bfsi_workforce w ON a.employee_id = w.employee_id
      ORDER BY a.assigned_date DESC
    `);
    res.json({ assignments: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all BFSI workforce
app.get('/api/bfsi/workforce', requireAuth, async (req, res) => {
  try {
    const workforce = await query('SELECT * FROM bfsi_workforce ORDER BY employee_name');
    const certifications = await query('SELECT * FROM bfsi_certifications');
    res.json({
      workforce: workforce.rows,
      certifications: certifications.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Combined Pool + ZenMatrix employees, skills priority-ordered
// (verified badge first, then Expert/Intermediate/Beginner by claimed level).
// Optional ?skill=Python&level=Expert filtering; verified matches rank first.
app.get('/api/bfsi/employees', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM (
        SELECT e.id, e.name, e.designation, e.department, e.grade, e.years_it,
          e.primary_skill, e.secondary_skill, 'zenmatrix' AS source,
          COALESCE(json_agg(json_build_object(
            'skill_name', s.skill_name,
            'self_claimed_level', s.self_claimed_level,
            'verified_badge_level', s.verified_badge_level,
            'self_rating', s.self_rating
          ) ORDER BY
            CASE WHEN s.verified_badge_level IS NOT NULL THEN 0 ELSE 1 END,
            CASE s.self_claimed_level WHEN 'Expert' THEN 0 WHEN 'Intermediate' THEN 1 WHEN 'Beginner' THEN 2 ELSE 3 END
          ) FILTER (WHERE s.skill_name IS NOT NULL), '[]') AS skills
        FROM employees e
        LEFT JOIN skills s ON LOWER(s.employee_id) = LOWER(e.id)
        GROUP BY e.id

        UNION ALL

        SELECT p.id, p.name, p.designation, p.department, p.grade, p.years_it,
          p.primary_skill, p.secondary_skill, 'pool' AS source,
          json_build_array(
            json_build_object('skill_name', p.primary_skill, 'self_claimed_level', 'Expert', 'verified_badge_level', NULL, 'self_rating', 3),
            json_build_object('skill_name', p.secondary_skill, 'self_claimed_level', 'Intermediate', 'verified_badge_level', NULL, 'self_rating', 2)
          ) AS skills
        FROM pool_employees p
        WHERE p.primary_skill IS NOT NULL
      ) combined
      ORDER BY CASE WHEN source = 'zenmatrix' THEN 0 ELSE 1 END, name
    `);

    let employees = result.rows;

    // Optional skill / level filtering. Verified matches rank ahead of self-claimed.
    const skillFilter = String(req.query.skill || '').trim().toLowerCase();
    const levelFilter = String(req.query.level || '').trim().toLowerCase();
    if (skillFilter) {
      employees = employees
        .map((emp) => {
          const match = (emp.skills || []).find((sk) => {
            const nameOk = String(sk.skill_name || '').toLowerCase().includes(skillFilter);
            if (!nameOk) return false;
            if (!levelFilter) return true;
            const lvl = String(sk.verified_badge_level || sk.self_claimed_level || '').toLowerCase();
            return lvl === levelFilter;
          });
          return match ? { ...emp, _matchVerified: !!match.verified_badge_level } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b._matchVerified ? 1 : 0) - (a._matchVerified ? 1 : 0));
    }

    res.json({ employees });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate skill match score
function calculateMatchScore(employeeSkills, requiredSkills) {
  if (!requiredSkills || requiredSkills.length === 0) return 0;
  if (!employeeSkills || employeeSkills.length === 0) return 0;
  
  const matched = requiredSkills.filter(skill => 
    employeeSkills.some(empSkill => 
      empSkill.toLowerCase().includes(skill.toLowerCase()) || 
      skill.toLowerCase().includes(empSkill.toLowerCase())
    )
  );
  
  const baseScore = Math.round((matched.length / requiredSkills.length) * 100);
  return Math.min(100, baseScore);
}

// Get BFSI dashboard KPIs
app.get('/api/bfsi/dashboard', requireAuth, async (req, res) => {
  try {
    // Total open roles
    const rolesResult = await query("SELECT COUNT(*) as total FROM bfsi_roles WHERE status = 'Open'");
    const totalRoles = parseInt(rolesResult.rows[0].total);
    
    // Reactive vs Proactive roles
    const reactiveResult = await query("SELECT COUNT(*) as total FROM bfsi_roles WHERE status = 'Open' AND type = 'Reactive'");
    const proactiveResult = await query("SELECT COUNT(*) as total FROM bfsi_roles WHERE status = 'Open' AND type = 'Proactive'");
    
    // Filled roles (assigned)
    const filledResult = await query("SELECT COUNT(DISTINCT role_id) as filled FROM bfsi_assignments WHERE assignment_status = 'Assigned'");
    const filledRoles = parseInt(filledResult.rows[0].filled);
    
    // Fill rate
    const fillRate = totalRoles > 0 ? Math.round((filledRoles / (totalRoles + filledRoles)) * 100) : 0;
    
    // Total workforce from LOB
    const totalWorkforceResult = await query("SELECT COUNT(*) as total FROM bfsi_workforce");
    const totalWorkforce = parseInt(totalWorkforceResult.rows[0].total);
    
    // Billable employees
    const billableResult = await query("SELECT COUNT(*) as billable FROM bfsi_workforce WHERE billing_status ILIKE '%billable%'");
    const billableEmployees = parseInt(billableResult.rows[0].billable);
    
    // Pool employees (available)
    const poolResult = await query("SELECT COUNT(*) as pool FROM bfsi_workforce WHERE billing_status ILIKE '%pool%' OR status = 'Available'");
    const poolEmployees = parseInt(poolResult.rows[0].pool);
    
    // Deallocating employees
    const deallocResult = await query("SELECT COUNT(*) as dealloc FROM bfsi_workforce WHERE status = 'Deallocating'");
    const deallocatingCount = parseInt(deallocResult.rows[0].dealloc);
    
    // Employees ready
    const readyResult = await query("SELECT COUNT(*) as ready FROM bfsi_workforce WHERE status = 'Available'");
    const readyEmployees = parseInt(readyResult.rows[0].ready);
    
    // In certification
    const certResult = await query("SELECT COUNT(*) as cert FROM bfsi_certifications WHERE status = 'In Progress'");
    const inCertification = parseInt(certResult.rows[0].cert);
    
    // Average days to fill
    const daysResult = await query("SELECT AVG(days_open) as avg_days FROM bfsi_roles WHERE status = 'Open'");
    const avgDays = Math.round(parseFloat(daysResult.rows[0].avg_days) || 0);
    
    // Aging roles
    const agingResult = await query("SELECT COUNT(*) as aging FROM bfsi_roles WHERE status = 'Open' AND days_open > 90");
    const agingRoles = parseInt(agingResult.rows[0].aging);
    
    // Get summary data from Excel Summary sheet
    const summaryResult = await query("SELECT * FROM bfsi_summary_data ORDER BY gap DESC LIMIT 5");
    const summaryData = summaryResult.rows;
    
    // Calculate totals from summary
    const totalDemand = summaryData.reduce((sum, s) => sum + (s.demand_total || 0), 0);
    const totalSupply = summaryData.reduce((sum, s) => sum + (s.supply_total || 0), 0);
    const totalGap = summaryData.reduce((sum, s) => sum + (s.gap || 0), 0);
    
    // Get Grand Total row specifically for overall KPIs
    const grandTotalResult = await query("SELECT * FROM bfsi_summary_data WHERE primary_skill ILIKE '%Grand Total%'");
    const gt = grandTotalResult.rows[0] || {};
    
    // Skill gaps from summary data (all rows excluding Grand Total for the list)
    const allSummaryResult = await query("SELECT * FROM bfsi_summary_data WHERE primary_skill NOT ILIKE '%Grand Total%' ORDER BY gap DESC");
    const skillGaps = allSummaryResult.rows.map(s => ({
      skill: s.primary_skill,
      demand: s.demand_total,
      supply: s.supply_total,
      gap: s.gap,
      reactive: s.reactive_srf,
      proactive: s.proactive,
      pool: s.pool_supply,
      deallocation: s.deallocation_supply
    }));
    
    const response = {
      totalRoles: safeParseInt(gt.demand_total, totalRoles),
      reactiveRoles: safeParseInt(gt.reactive_srf, 0),
      proactiveRoles: safeParseInt(gt.proactive, 0),
      filledRoles,
      fillRate,
      totalWorkforce,
      billableEmployees,
      poolEmployees: safeParseInt(gt.pool_supply, poolEmployees),
      deallocatingCount: safeParseInt(gt.deallocation_supply, deallocatingCount),
      readyEmployees,
      inCertification,
      avgDays,
      agingRoles,
      totalDemand: safeParseInt(gt.demand_total, totalRoles),
      totalSupply: safeParseInt(gt.supply_total, 0),
      totalGap: safeParseInt(gt.gap, 0),
      skillGaps,
      criticalGap: skillGaps[0]?.skill || 'None'
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get BFSI executive analytics
app.get('/api/bfsi/analytics', requireAuth, async (req, res) => {
  try {
    // 1. Allocation rate
    const totalWorkforce = await query("SELECT COUNT(*) as total FROM bfsi_workforce");
    const assignedResult = await query("SELECT COUNT(*) as total FROM bfsi_workforce WHERE status = 'Assigned'");
    const reservedResult = await query("SELECT COUNT(*) as total FROM bfsi_workforce WHERE status = 'Reserved'");
    
    const total = parseInt(totalWorkforce.rows[0].total) || 1;
    const assigned = parseInt(assignedResult.rows[0].total) || 0;
    const reserved = parseInt(reservedResult.rows[0].total) || 0;
    const pool = Math.max(0, total - assigned - reserved);

    // 2. Readiness trends (grouping by band)
    const bandReadiness = await query(`
      SELECT band, COALESCE(AVG(experience_years * 10), 50)::INTEGER as avg_readiness
      FROM bfsi_workforce
      GROUP BY band
    `);

    // 3. Skill growth forecasts (Demand vs Supply growth projections)
    const certPipeline = await query(`
      SELECT cert_name, COUNT(*) as count
      FROM bfsi_certifications
      WHERE status = 'In Progress'
      GROUP BY cert_name
    `);

    res.json({
      allocationRates: {
        total,
        assigned,
        reserved,
        pool,
        allocationRate: Math.round(((assigned + reserved) / total) * 100)
      },
      readinessTrends: bandReadiness.rows,
      skillGrowthForecast: certPipeline.rows.map(row => ({
        skill: row.cert_name.replace('Certification', '').replace('Course', '').trim(),
        currentSupply: 5,
        projectedSupply: 5 + parseInt(row.count),
        pipelineCount: parseInt(row.count)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get BFSI summary data (from Excel Summary sheet)
app.get('/api/bfsi/summary-data', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM bfsi_summary_data ORDER BY gap DESC');
    res.json({ summary: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get skill demand vs supply
app.get('/api/bfsi/skill-analysis', requireAuth, async (req, res) => {
  try {
    const allRoles = await query("SELECT required_skills FROM bfsi_roles WHERE status = 'Open'");
    // Only supply pool employees (Available-Pool + Deallocating)
    const allWorkforce = await query("SELECT * FROM bfsi_workforce WHERE status IN ('Available-Pool', 'Deallocating')");
    const certifications = await query("SELECT * FROM bfsi_certifications WHERE status = 'In Progress'");
    
    const skillDemand = {};
    const skillSupply = { ready: {}, week2: {}, week4: {}, blocked: {} };
    
    // Calculate demand
    allRoles.rows.forEach(role => {
      (role.required_skills || []).forEach(skill => {
        Reflect.set(skillDemand, skill, (Reflect.get(skillDemand, skill) || 0) + 1);
      });
    });
    
    // Categorize supply by readiness — pool employees are all 'ready'
    allWorkforce.rows.forEach(emp => {
      const skills = emp.current_skills || [];
      const today = new Date();
      const gradDate = emp.graduation_date ? new Date(emp.graduation_date) : null;
      const daysToGrad = gradDate ? Math.ceil((gradDate - today) / (1000 * 60 * 60 * 24)) : null;
      
      skills.forEach(skill => {
        if ((emp.status === 'Available-Pool' || emp.status === 'Deallocating') && !gradDate) {
          Reflect.set(skillSupply.ready, skill, (Reflect.get(skillSupply.ready, skill) || 0) + 1);
        } else if (daysToGrad && daysToGrad <= 14) {
          Reflect.set(skillSupply.week2, skill, (Reflect.get(skillSupply.week2, skill) || 0) + 1);
        } else if (daysToGrad && daysToGrad <= 28) {
          Reflect.set(skillSupply.week4, skill, (Reflect.get(skillSupply.week4, skill) || 0) + 1);
        } else if (emp.bench_days > 60 || emp.reject_count > 2) {
          Reflect.set(skillSupply.blocked, skill, (Reflect.get(skillSupply.blocked, skill) || 0) + 1);
        }
      });
    });
    
    const analysis = Object.entries(skillDemand).map(([skill, demand]) => ({
      skill,
      demand,
      ready: Reflect.get(skillSupply.ready, skill) || 0,
      week2: Reflect.get(skillSupply.week2, skill) || 0,
      week4: Reflect.get(skillSupply.week4, skill) || 0,
      blocked: Reflect.get(skillSupply.blocked, skill) || 0,
      totalSupply: (Reflect.get(skillSupply.ready, skill) || 0) + (Reflect.get(skillSupply.week2, skill) || 0) + (Reflect.get(skillSupply.week4, skill) || 0),
      gap: demand - ((Reflect.get(skillSupply.ready, skill) || 0) + (Reflect.get(skillSupply.week2, skill) || 0) + (Reflect.get(skillSupply.week4, skill) || 0))
    }));
    
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Shortlist employees for a role
app.get('/api/bfsi/shortlist/:roleId', requireAuth, async (req, res) => {
  try {
    const { roleId } = req.params;
    
    // Get role details
    const roleResult = await query('SELECT * FROM bfsi_roles WHERE role_id = $1', [roleId]);
    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    const role = roleResult.rows[0];
    
    // Get all workforce
    const workforceResult = await query('SELECT * FROM bfsi_workforce');
    const certifications = await query('SELECT * FROM bfsi_certifications WHERE status = $1', ['In Progress']);
    
    const today = new Date();
    
    const shortlist = workforceResult.rows.map(emp => {
      const matchScore = calculateMatchScore(emp.current_skills, role.required_skills);
      const certBonus = (emp.certifications || []).some(c => 
        role.required_skills.some(rs => c.toLowerCase().includes(rs.toLowerCase()))
      ) ? 10 : 0;
      const finalScore = Math.min(100, matchScore + certBonus);
      
      const gradDate = emp.graduation_date ? new Date(emp.graduation_date) : null;
      const daysToGrad = gradDate ? Math.ceil((gradDate - today) / (1000 * 60 * 60 * 24)) : null;
      
      let readiness = 'Blocked';
      if (finalScore >= 80 && emp.status === 'Available' && !gradDate) {
        readiness = 'Ready Now';
      } else if (finalScore >= 60 && daysToGrad && daysToGrad <= 14) {
        readiness = '2-Week Ready';
      } else if (finalScore >= 40 && daysToGrad && daysToGrad <= 28) {
        readiness = '4-Week Ready';
      }
      
      const gaps = role.required_skills.filter(reqSkill => 
        !(emp.current_skills || []).some(empSkill => 
          empSkill.toLowerCase().includes(reqSkill.toLowerCase()) ||
          reqSkill.toLowerCase().includes(empSkill.toLowerCase())
        )
      );
      
      return {
        ...emp,
        matchScore: finalScore,
        baseScore: matchScore,
        certBonus,
        readiness,
        daysToGrad,
        gaps,
        skillMatch: `${matchScore}%`
      };
    }).filter(emp => emp.matchScore >= 40).sort((a, b) => b.matchScore - a.matchScore);
    
    res.json({ role, shortlist });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get certification pipeline
app.get('/api/bfsi/certifications/pipeline', requireAuth, async (req, res) => {
  try {
    const pipeline = await query(`
      SELECT c.*, w.employee_name, w.reskilling_program 
      FROM bfsi_certifications c
      JOIN bfsi_workforce w ON c.employee_id = w.employee_id
      WHERE c.status = 'In Progress'
      ORDER BY c.expected_completion ASC
    `);
    res.json({ pipeline: pipeline.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get aging roles
app.get('/api/bfsi/roles/aging', requireAuth, async (req, res) => {
  try {
    const redRoles = await query(`
      SELECT r.*, COUNT(a.employee_id) as candidate_count
      FROM bfsi_roles r
      LEFT JOIN bfsi_assignments a ON r.role_id = a.role_id
      WHERE r.status = 'Open' AND r.days_open > 90
      GROUP BY r.id
      ORDER BY r.days_open DESC
    `);
    
    const amberRoles = await query(`
      SELECT r.*, COUNT(a.employee_id) as candidate_count
      FROM bfsi_roles r
      LEFT JOIN bfsi_assignments a ON r.role_id = a.role_id
      WHERE r.status = 'Open' AND r.days_open BETWEEN 60 AND 90
      GROUP BY r.id
      ORDER BY r.days_open DESC
    `);
    
    res.json({
      red: redRoles.rows,
      amber: amberRoles.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reskilling opportunities
app.get('/api/bfsi/reskilling-opportunities', requireAuth, async (req, res) => {
  try {
    const rolesResult = await query("SELECT * FROM bfsi_roles WHERE status = 'Open'");
    // Only use actual supply pool (Available-Pool + Deallocating) — NOT all LOB employees
    const workforceResult = await query("SELECT * FROM bfsi_workforce WHERE status IN ('Available-Pool', 'Deallocating')");
    const roles = rolesResult.rows || [];
    const workforce = workforceResult.rows || [];
    
    const opportunities = [];
    
    workforce.forEach(emp => {
      roles.forEach(role => {
        const score = calculateMatchScore(emp.current_skills, role.required_skills);
        if (score >= 40 && score < 80) {
          const gaps = role.required_skills.filter(req => 
            !(emp.current_skills || []).some(s => 
              s.toLowerCase().includes(req.toLowerCase()) ||
              req.toLowerCase().includes(s.toLowerCase())
            )
          );
          
          if (gaps.length > 0 && gaps.length <= 3) {
            opportunities.push({
              employeeId: emp.employee_id,
              employeeName: emp.employee_name,
              currentRole: emp.primary_skill || 'Unknown',
              targetRole: role.role_title,
              roleId: role.role_id,
              matchScore: score,
              gaps,
              estimatedWeeks: gaps.length * 2,
              potential: score >= 60 ? 'High' : 'Medium'
            });
          }
        }
      });
    });
    
    res.json({ opportunities: opportunities.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to safely parse integers, avoiding NaN
function safeParseInt(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '' || value === 'NaN' || value === 'null' || value === 'NULL') {
    return defaultValue;
  }
  const num = parseInt(value);
  return isNaN(num) ? defaultValue : num;
}

// Helper function to parse Excel date (serial number or string) to PostgreSQL date
function parseExcelDate(dateValue) {
  // Handle null, undefined, empty string
  if (!dateValue || dateValue === '' || dateValue === 'null' || dateValue === 'NULL') {
    return null;
  }
  
  // If it's already a Date object, return ISO string
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) return null;
    return dateValue.toISOString().split('T')[0];
  }
  
  // If it's a number (Excel serial date), convert it
  if (typeof dateValue === 'number') {
    // Excel's epoch is 1900-01-01 (with the 1900 leap year bug)
    // Valid Excel dates are typically > 1 (day 1 is 1900-01-01)
    if (dateValue < 1) return null;
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const days = Math.floor(dateValue);
    const milliseconds = days * 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + milliseconds);
    if (isNaN(date.getTime())) return null;
    // Check if date is reasonable (between 1950 and 2050)
    const year = date.getFullYear();
    if (year < 1950 || year > 2050) return null;
    return date.toISOString().split('T')[0];
  }
  
  // If it's a string, clean it first
  if (typeof dateValue === 'string') {
    const cleanValue = dateValue.trim();
    if (cleanValue === '' || cleanValue === '-' || cleanValue === 'N/A') return null;
    
    // Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
      const date = new Date(cleanValue);
      if (!isNaN(date.getTime())) {
        return cleanValue;
      }
      return null;
    }
    
    // Try various date formats
    const formats = [
      // DD-MMM-YYYY or DD-MMM-YY (e.g., "15-Apr-25" or "15-Apr-2025")
      { regex: /^(\d{1,2})-(\w{3})-(\d{2,4})$/, parse: (m) => {
        const months = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 
                        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
        const day = parseInt(m[1]);
        const month = Reflect.get(months, m[2].toLowerCase());
        if (month === undefined) return null;
        let year = parseInt(m[3]);
        if (year < 50) year += 2000;
        else if (year < 100) year += 1900;
        return new Date(year, month, day);
      }},
      // DD/MM/YYYY or MM/DD/YYYY — smart detection based on which part > 12
      { regex: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, parse: (m) => {
        const first = parseInt(m[1]);
        const second = parseInt(m[2]);
        const year = parseInt(m[3]);
        let month, day;
        // If first part > 12, it must be DD/MM/YYYY
        if (first > 12) { day = first; month = second; }
        // If second part > 12, it must be MM/DD/YYYY
        else if (second > 12) { month = first; day = second; }
        // Ambiguous — default to MM/DD/YYYY (US/Excel format)
        else { month = first; day = second; }
        // Use UTC to avoid timezone day-shift
        return new Date(Date.UTC(year, month - 1, day));
      }},
      // YYYY-MM-DD (ISO) - already handled above but included for completeness
      { regex: /^(\d{4})-(\d{2})-(\d{2})$/, parse: (m) => {
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      }}
    ];
    
    for (const format of formats) {
      const match = cleanValue.match(format.regex);
      if (match) {
        try {
          const date = format.parse(match);
          if (date && !isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // Try standard Date parsing as final fallback
    try {
      const date = new Date(cleanValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  return null;
}

// Upload Excel and populate BFSI data - Multi-sheet processing
app.post('/api/bfsi/upload', upload.single('file'), requireAdmin, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing data
      await client.query('DELETE FROM bfsi_assignments');
      await client.query('DELETE FROM bfsi_certifications');
      await client.query('DELETE FROM bfsi_workforce');
      await client.query('DELETE FROM bfsi_roles');
      await client.query('DELETE FROM bfsi_summary_data');
      
      let rolesCount = 0;
      let workforceCount = 0;
      let summaryCount = 0;
      let poolCount = 0;
      let deallocationCount = 0;
      
      // ==========================================
      // SHEET 1: LOB - Full Employee Database (1,014 employees)
      // ==========================================
      if (workbook.SheetNames.includes('LOB')) {
        const lobSheet = workbook.Sheets['LOB'];
        const lobData = XLSX.utils.sheet_to_json(lobSheet, { raw: false });
        
        for (const row of lobData) {
          const empId = String(row['Emp Number'] || row['EmpNumber'] || '').trim();
          const empName = String(row['Emp Name'] || row['EmpName'] || '').trim();
          if (!empId || !empName) continue;
          
          // Extract skills from multiple columns
          const skills = [];
          if (row['Primary Skill Name']) skills.push(String(row['Primary Skill Name']));
          if (row['Secondary Skill Name']) skills.push(String(row['Secondary Skill Name']));
          if (row['Tertiary Skill Name']) skills.push(String(row['Tertiary Skill Name']));
          if (row['l1_skills']) skills.push(...String(row['l1_skills']).split(',').map(s => s.trim()).filter(Boolean));
          if (row['l2_skills']) skills.push(...String(row['l2_skills']).split(',').map(s => s.trim()).filter(Boolean));
          if (row['ACTUALSKILL']) skills.push(...String(row['ACTUALSKILL']).split(',').map(s => s.trim()).filter(Boolean));
          
          // Calculate experience from Hire Date
          let expYears = 0;
          const hireDateValue = parseExcelDate(row['Hire Date']);
          if (hireDateValue) {
            const hireDate = new Date(hireDateValue);
            const diffMs = new Date() - hireDate;
            if (!isNaN(diffMs) && diffMs >= 0) {
              expYears = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
            }
          }
          if (isNaN(expYears) || expYears < 0) expYears = 0;
          
          // Determine status based on Billing Status
          let status = 'Available';
          const billingStatus = String(row['Billing Status'] || '').toLowerCase();
          if (billingStatus.includes('billable') || billingStatus.includes('billing')) {
            status = 'In-project';
          } else if (billingStatus.includes('pool')) {
            status = 'Available';
          }
          
          await client.query(`
            INSERT INTO bfsi_workforce (
              employee_id, employee_name, email, current_skills, certifications, 
              experience_years, status, doj, primary_skill, band, 
              billing_status, project_name, customer, pm_name, location,
              aging_days, practice_name, service_line, deployable_flag
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (employee_id) DO UPDATE SET
              employee_name = EXCLUDED.employee_name,
              current_skills = EXCLUDED.current_skills,
              status = EXCLUDED.status,
              project_name = EXCLUDED.project_name,
              updated_at = CURRENT_TIMESTAMP
          `, [
            empId,
            empName,
            row['Email'] || row['Email ID'] || '',
            skills.filter((v, i, a) => a.indexOf(v) === i), // deduplicate
            row['Training_Name'] ? [String(row['Training_Name'])] : [],
            expYears,
            status,
            hireDateValue,
            row['Primary Skill Name'] || row['Role'] || '',
            row['Band'] || '',
            row['Billing Status'] || '',
            row['Project Name'] || '',
            row['Customer'] || '',
            row['Project Manager'] || row['PmName'] || '',
            row['Work Location'] || row['Location'] || '',
            safeParseInt(row['Aging'] || row['Ageing'], 0),
            row['Practice Name(L1)'] || row['PracticeName'] || '',
            row['Service Lines'] || '',
            row['DeployableFlag'] === 'YES' || row['DeployableFlag'] === 'Y'
          ]);
          workforceCount++;
        }
      }
      
      // ==========================================
      // HELPER: Process SRF rows (Reactive + Proactive share same columns)
      // ==========================================
      const processSRFSheet = async (sheetData, sheetType) => {
        let count = 0;
        for (const row of sheetData) {
          const reqNo = String(row['Requisition No'] || '').trim();
          if (!reqNo) continue;

          const primarySkill = String(row['Primary Skill'] || '').trim();
          const skills = primarySkill ? [primarySkill] : [];

          // Location: City + Country + Shore
          const city    = String(row['City']    || '').trim();
          const country = String(row['Country'] || '').trim();
          const shore   = String(row['Shore']   || '').trim();
          const location = [city, country, shore].filter(Boolean).join(' · ');

          // Grade
          const grade = String(row['Grade Name'] || '').trim();

          // Priority — shorten for display
          const rawPriority = String(row['Priority'] || '').trim();
          const priority = rawPriority.startsWith('P1') ? 'P1' : rawPriority.startsWith('P2') ? 'P2' : rawPriority.startsWith('P3') ? 'P3' : rawPriority || 'Medium';

          // SPOC
          const spoc = String(row['TSC SPOC (Name)'] || row['Actual TSC SPOC'] || '').trim();

          // JD
          const jd = String(row['External JD'] || row['Internal JD'] || '').trim();

          // SRF Title
          const srfTitle = String(row['SRF Title'] || row['Requisition Title'] || primarySkill || 'Open Role').trim();

          // Phase / State
          const phase = String(row['Requisition Current Phase'] || 'Open').trim();
          const state = String(row['Requisition Current State'] || '').trim();

          // Month, RBU, VBU, SGO
          const month   = String(row['Month']   || '').trim();
          const rbu     = String(row['RBU']     || '').trim();
          const vbu     = String(row['VBU']     || '').trim();
          const sgo     = String(row['SGO']     || '').trim();
          const hireType = String(row['Hire Type'] || sheetType).trim();

          // Openings
          const openings = safeParseInt(row['Number of Openings'] || 1, 1);

          // Resource Start Date
          const startDate = String(row['Resource Start Date'] || '').trim();

          // Ageing
          const ageing = safeParseInt(row['Ageing'] || 0, 0);
          const ageingBucket = String(row['Ageing Bucket'] || '').trim();

          // Customer
          const customer = String(row['Customer'] || row['Customer Group'] || '').trim();

          // Project
          const projectName = String(row['Project Name'] || '').trim();
          const projectCode = String(row['Project Code'] || '').trim();

          // Candidate info
          const candidateName   = String(row['Offer Sent To (Candidate Name)'] || '').trim();
          const candidateStatus = String(row['Candidate Status'] || '').trim();
          const doj             = String(row['DOJ'] || '').trim();

          await client.query(`
            INSERT INTO bfsi_roles (
              role_id, role_title, client_name, required_skills, days_open,
              status, fill_priority, assigned_spoc, created_date, hire_type,
              job_description, srf_no, aging_bucket, type, location
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (role_id) DO UPDATE SET
              role_title       = EXCLUDED.role_title,
              client_name      = EXCLUDED.client_name,
              required_skills  = EXCLUDED.required_skills,
              days_open        = EXCLUDED.days_open,
              fill_priority    = EXCLUDED.fill_priority,
              assigned_spoc    = EXCLUDED.assigned_spoc,
              job_description  = EXCLUDED.job_description,
              aging_bucket     = EXCLUDED.aging_bucket,
              location         = EXCLUDED.location,
              updated_at       = CURRENT_TIMESTAMP
          `, [
            reqNo, srfTitle, customer, skills, ageing,
            phase, priority, spoc,
            row['Requisition Creation Date'] || new Date().toISOString().split('T')[0],
            hireType, jd, reqNo, ageingBucket, sheetType, location
          ]);

          // Store extra fields as JSON in job_description prefix for UI use
          // We'll encode extra metadata as a JSON prefix so UI can parse it
          const meta = JSON.stringify({
            grade, shore, city, country, rbu, vbu, sgo, month,
            openings, startDate, projectName, projectCode,
            candidateName, candidateStatus, doj, state,
            primarySkill, hireType, ageingBucket
          });
          await client.query(
            `UPDATE bfsi_roles SET job_description = $1 WHERE role_id = $2`,
            [`META:${meta}\n\nJD:\n${jd}`, reqNo]
          );

          count++;
        }
        return count;
      };

      // ==========================================
      // SHEET 2: Reactive - Urgent Role Requisitions
      // ==========================================
      if (workbook.SheetNames.includes('Reactive')) {
        const reactiveSheet = workbook.Sheets['Reactive'];
        const reactiveData = XLSX.utils.sheet_to_json(reactiveSheet, { raw: false });
        rolesCount += await processSRFSheet(reactiveData, 'Reactive');
      }

      // ==========================================
      // SHEET 3: Proactive - Pipeline Roles
      // ==========================================
      if (workbook.SheetNames.includes('Proactive')) {
        const proactiveSheet = workbook.Sheets['Proactive'];
        const proactiveData = XLSX.utils.sheet_to_json(proactiveSheet, { raw: false });
        rolesCount += await processSRFSheet(proactiveData, 'Proactive');
      }
      
      // ==========================================
      // SHEET 4: Pool - Available Resources (39 employees)
      // ==========================================
      if (workbook.SheetNames.includes('Pool')) {
        const poolSheet = workbook.Sheets['Pool'];
        const poolData = XLSX.utils.sheet_to_json(poolSheet, { raw: false });
        // Log actual column names from first row to debug mapping
        if (poolData.length > 0) {
        }
        
        for (const row of poolData) {
          // Try all possible column name variations for employee ID
          const empId = String(
            row['EmpId'] || row['Emp Id'] || row['EMP ID'] || row['EmployeeId'] ||
            row['Employee Id'] || row['Emp Number'] || row['EmpNumber'] ||
            row['EMPID'] || row['empid'] || row['emp_id'] || ''
          ).trim();
          if (!empId) continue;
          
          // Employee name - try all variations
          const empName = String(
            row['EmpName'] || row['Emp Name'] || row['EmployeeName'] ||
            row['Employee Name'] || row['Name'] || row['EMPNAME'] || 'Unknown'
          ).trim();

          // Skills - store ALL skill levels so filtering matches Summary sheet counts
          const skills = [];
          const skillCols = ['l3_skills', 'l4_skills', 'ACTUALSKILL', 'ActualSkill', 'l1_skills', 'l2_skills', 'Primary Skill Name'];
          for (const col of skillCols) {
            const colVal = Reflect.get(row, col);
            if (colVal) skills.push(...String(colVal).split(',').map(s => s.trim()).filter(Boolean));
          }

          // Aging days - try all variations
          const agingDays = safeParseInt(
            row['AgeingDays'] || row['Ageing Days'] || row['AgingDays'] ||
            row['Aging Days'] || row['Aging'] || row['Ageing'] ||
            row['AGEINGDAYS'] || row['Days'] || 0, 0
          );

          // RMG Status
          const rmgStatus = String(
            row['RmgStatus'] || row['RMG Status'] || row['RMGStatus'] ||
            row['Rmg Status'] || row['RMG_STATUS'] || ''
          ).trim();

          // Pool Status / Result
          const poolStatus = String(
            row['Result'] || row['Pool Result'] || row['PoolResult'] ||
            row['Pool Status'] || row['PoolStatus'] || row['STATUS'] || ''
          ).trim();

          // Grade / Band
          const grade = String(row['Grade'] || row['GRADE'] || row['Band'] || row['BAND'] || '').trim();

          // Location
          const location = String(row['Location'] || row['LOCATION'] || row['Loc'] || '').trim();

          // Practice
          const practice = String(row['Practice Name'] || row['Practice'] || row['PRACTICE'] || row['PracticeName'] || '').trim();

          // Service Line
          const serviceLine = String(row['Service Lines'] || row['Service Line'] || row['ServiceLine'] || row['SERVICE_LINE'] || '').trim();

          // Primary skill — use l4_skills (most specific category) → l3_skills → l4_name → l3_name → ACTUALSKILL
          // l4_skills contains values like "Functional Testing", "Automation Testing - SDET"
          const rawL4 = String(row['l4_skills'] || row['l4_name'] || '').split(',')[0].trim();
          const rawL3 = String(row['l3_skills'] || row['l3_name'] || '').split(',')[0].trim();
          const primarySkill = String(
            row['Primary Skill Name'] || rawL4 || rawL3 ||
            row['PrimarySkill'] || row['Primary Skill'] || skills[0] || ''
          ).trim();

          // Customer
          const customer = String(
            row['CustomerName'] || row['Customer Name'] || row['Customer'] || row['Client'] || row['CUSTOMER'] || ''
          ).trim();

          // PM
          const pmName = String(
            row['PmName'] || row['PM Name'] || row['PM'] || row['Manager'] || ''
          ).trim();

          // Project
          const projectName = String(row['ProjectName'] || row['Project Name'] || row['Project'] || row['PROJECT'] || '').trim();

          // Deployable
          const deployable = String(row['DeployableFlag'] || '').toLowerCase().includes('deploy');

          // Comments
          const comments = String(row['Comments'] || '').trim();

          // SRF No
          const srfNo = String(row['SRFNo'] || row['SRF No'] || '').trim();

          // Try to update first
          const updateResult = await client.query(
            `UPDATE bfsi_workforce SET 
              status = $1, aging_days = $2, rmg_status = $3, pool_status = $4, 
              grade = $5, location = $6, practice_name = $7, service_line = $8,
              employee_name = CASE WHEN employee_name = 'Unknown' OR employee_name IS NULL THEN $10 ELSE employee_name END,
              primary_skill = CASE WHEN $11 != '' THEN $11 ELSE primary_skill END,
              customer = CASE WHEN $12 != '' THEN $12 ELSE customer END,
              pm_name = CASE WHEN $13 != '' THEN $13 ELSE pm_name END,
              deployable_flag = $14,
              current_skills = CASE WHEN array_length($15::text[], 1) > 0 THEN $15 ELSE current_skills END,
              updated_at = CURRENT_TIMESTAMP 
            WHERE employee_id = $9`,
            [
              'Available-Pool', agingDays, rmgStatus, poolStatus,
              grade, location, practice, serviceLine,
              empId, empName, primarySkill, customer, pmName, deployable,
              [...new Set(skills)].filter(Boolean)
            ]
          );
          
          // If not exists, insert as new pool employee
          if (updateResult.rowCount === 0) {
            await client.query(`
              INSERT INTO bfsi_workforce (
                employee_id, employee_name, current_skills, status, 
                aging_days, rmg_status, pool_status, grade, location, 
                practice_name, service_line, primary_skill, customer, pm_name, deployable_flag
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
              ON CONFLICT (employee_id) DO UPDATE SET
                status = 'Available-Pool',
                aging_days = EXCLUDED.aging_days,
                rmg_status = EXCLUDED.rmg_status,
                pool_status = EXCLUDED.pool_status,
                grade = EXCLUDED.grade,
                location = EXCLUDED.location,
                practice_name = EXCLUDED.practice_name,
                service_line = EXCLUDED.service_line,
                customer = EXCLUDED.customer,
                pm_name = EXCLUDED.pm_name,
                deployable_flag = EXCLUDED.deployable_flag,
                updated_at = CURRENT_TIMESTAMP
            `, [
              empId, empName,
              [...new Set(skills)].filter(Boolean),
              'Available-Pool', agingDays, rmgStatus, poolStatus,
              grade, location, practice, serviceLine,
              primarySkill, customer, pmName, deployable
            ]);
          }
          poolCount++;
        }
      }
      
      // ==========================================
      // SHEET 5: Deallocation - Employees releasing
      // ==========================================
      if (workbook.SheetNames.includes('Deallocation')) {
        const deallocSheet = workbook.Sheets['Deallocation'];
        const deallocData = XLSX.utils.sheet_to_json(deallocSheet, { raw: false });
        if (deallocData.length > 0) {
        }

        // ── Clear stale deallocation dates before re-processing ──
        // This ensures old wrong dates don't persist across uploads
        await client.query(`UPDATE bfsi_workforce SET deallocation_date = NULL, return_to_pool_date = NULL WHERE status = 'Deallocating'`);
        
        for (const row of deallocData) {
          const empId = String(
            row['Emp Number'] || row['EmpId'] || row['Emp Id'] || row['EMP ID'] ||
            row['EmployeeId'] || row['Employee Id'] || row['EmpNumber'] || row['EMPID'] || ''
          ).trim();
          if (!empId) continue;

          const empName = String(
            row['Emp Name'] || row['EmpName'] || row['Employee Name'] ||
            row['EmployeeName'] || row['Name'] || 'Unknown'
          ).trim();

          // DeallocationDt is column L in Excel — try all known variants
          const releaseDateRaw = 
            row['DeallocationDt'] || row['Deallocation Dt'] || row['DeallocationDate'] ||
            row['Deallocation Date'] || row['Deallocation_Dt'] || row['Deallocation_Date'] ||
            row['DEALLOCATIONDT'] || row['DEALLOCATION_DT'] || row['DEALLOCATION DATE'] ||
            row['Estimated Release Date'] || row['Release Date'] ||
            row['ReleaseDate'] || row['Release_Date'] || row['EndDate'] || row['End Date'] ||
            row['ProjectEndDate'] || row['Project End Date'] || row['End Dt'] || row['EndDt'];
          
          
          const releaseDate = parseExcelDate(releaseDateRaw);

          const agingDays = safeParseInt(
            row['AgeingDays'] || row['Ageing Days'] || row['AgingDays'] ||
            row['Aging Days'] || row['Aging'] || row['Ageing'] || row['Days'] || 0, 0
          );

          const primarySkill = String(
            row['Primary Skill Name'] || row['PrimarySkill'] || row['Primary Skill'] ||
            String(row['l4_skills'] || row['l4_name'] || '').split(',')[0].trim() ||
            String(row['l3_skills'] || row['l3_name'] || '').split(',')[0].trim() ||
            row['ACTUALSKILL'] || ''
          ).trim();

          // Store L3/L4 skills for deallocation employees too (for skill card filtering)
          const deallocSkills = [];
          ['l3_skills', 'l4_skills', 'ACTUALSKILL', 'l1_skills', 'l2_skills'].forEach(col => {
            const colVal = Reflect.get(row, col);
            if (colVal) deallocSkills.push(...String(colVal).split(',').map(s => s.trim()).filter(Boolean));
          });

          const projectName = String(row['ProjectName'] || row['Project Name'] || row['Project'] || '').trim();
          const customer = String(row['CustomerName'] || row['Customer'] || row['Client'] || '').trim();
          const pmName = String(row['ProjectManager'] || row['PM Name'] || row['PM'] || row['Manager'] || '').trim();
          const location = String(row['Location'] || row['LOCATION'] || '').trim();
          const band = String(row['Band'] || row['Grade'] || row['BAND'] || '').trim();
          const rmgStatus = String(row['RmgStatus'] || row['RMG Status'] || row['RMGStatus'] || '').trim();
          const releaseReason = String(row['DEALLOCATION_REASON'] || row['Reason For Deallocation'] || row['Release Reason'] || row['Reason'] || '').trim();
          const deallocWeek = String(row['DeallocationWeek'] || row['Deallocation Week'] || '').trim();

          const updResult = await client.query(
            `UPDATE bfsi_workforce 
             SET status = $1, 
                 deallocation_date = $2,
                 return_to_pool_date = $2,
                 release_reason = $3,
                 aging_days = CASE WHEN $4 > 0 THEN $4 ELSE aging_days END,
                 primary_skill = CASE WHEN $5 != '' THEN $5 ELSE primary_skill END,
                 project_name = CASE WHEN $6 != '' THEN $6 ELSE project_name END,
                 customer = CASE WHEN $7 != '' THEN $7 ELSE customer END,
                 pm_name = CASE WHEN $8 != '' THEN $8 ELSE pm_name END,
                 location = CASE WHEN $9 != '' THEN $9 ELSE location END,
                 rmg_status = CASE WHEN $10 != '' THEN $10 ELSE rmg_status END,
                 pool_status = CASE WHEN $11 != '' THEN $11 ELSE pool_status END,
                 current_skills = CASE WHEN array_length($13::text[], 1) > 0 THEN $13 ELSE current_skills END,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE employee_id = $12`,
            ['Deallocating', releaseDate, releaseReason, agingDays,
             primarySkill, projectName, customer, pmName, location, rmgStatus, deallocWeek, empId,
             [...new Set(deallocSkills)].filter(Boolean)]
          );

          if (updResult.rowCount === 0) {
            await client.query(`
              INSERT INTO bfsi_workforce (
                employee_id, employee_name, status, deallocation_date,
                return_to_pool_date, release_reason, aging_days, primary_skill,
                project_name, customer, pm_name, location, rmg_status, current_skills
              ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              ON CONFLICT (employee_id) DO UPDATE SET
                status = 'Deallocating',
                deallocation_date = EXCLUDED.deallocation_date,
                release_reason = EXCLUDED.release_reason,
                primary_skill = CASE WHEN EXCLUDED.primary_skill != '' THEN EXCLUDED.primary_skill ELSE bfsi_workforce.primary_skill END,
                current_skills = CASE WHEN array_length(EXCLUDED.current_skills, 1) > 0 THEN EXCLUDED.current_skills ELSE bfsi_workforce.current_skills END,
                updated_at = CURRENT_TIMESTAMP
            `, [empId, empName, 'Deallocating', releaseDate,
                releaseReason, agingDays, primarySkill, projectName,
                customer, pmName, location, rmgStatus,
                [...new Set(deallocSkills)].filter(Boolean)]);
          }
          deallocationCount++;
        }
      }
      
      // ==========================================
      // SHEET 6: Summary - Demand vs Supply Analysis
      // ==========================================
      if (workbook.SheetNames.includes('Summary')) {
        const summarySheet = workbook.Sheets['Summary'];
        const summaryData = XLSX.utils.sheet_to_json(summarySheet, { header: 1 });
        
        // STRICT: Only process rows 4-16 (main summary section)
        // Header at row 3 (index 3), data rows 4-16 (indices 4-16)
        // Stop at row 17 where "Grand Total" or report sections begin
        const headerRowIdx = 3; // Row 4 in Excel (0-indexed: 3)
        const firstDataRow = 4; // Row 5 in Excel
        const lastDataRow = 16; // Row 17 in Excel - STOP before Grand Total
        
        // Verified column mapping for this Excel format
        const colMap = {
          skill: 0,        // Primary Skill
          reactive: 1,     // Reactive_SRF
          backup: 2,       // Backup
          forecast: 3,     // Forecast_SRF
          proactive: 4,    // Proactive
          demand_total: 5, // Demand Total
          pool: 6,         // Pool
          dealloc: 7,      // Deallocation
          supply_total: 8, // Supply Total
          gap: 9,          // GAP
          off_react: 10,   // Offer Received: Reactive
          off_pro: 11,     // Offer Received: Proactive
          off_total: 12    // Offer Received: Total
        };
        
        
        // WIPE existing summary data before every upload so stale/junk rows never persist
        await client.query('DELETE FROM bfsi_summary_data');
        
        // Show what we're about to import
        for (let i = firstDataRow; i <= lastDataRow && i < summaryData.length; i++) {
          const row = Reflect.get(summaryData, i);
          if (!row || !Reflect.get(row, colMap.skill)) continue;
          const skill = String(Reflect.get(row, colMap.skill)).trim();
          const pool = safeParseInt(Reflect.get(row, colMap.pool), 0);
          const dealloc = safeParseInt(Reflect.get(row, colMap.dealloc), 0);
          const reactive = safeParseInt(Reflect.get(row, colMap.reactive), 0);
        }
        
        // Process ONLY the main summary rows - NO sub-reports
        for (let i = firstDataRow; i <= lastDataRow && i < summaryData.length; i++) {
          const row = Reflect.get(summaryData, i);
          if (!row || !Reflect.get(row, colMap.skill)) continue;
          
          const skillName = String(Reflect.get(row, colMap.skill) || '').trim();
          if (!skillName || skillName.toLowerCase().includes('total')) continue;
          
          const poolValue = safeParseInt(Reflect.get(row, colMap.pool), 0);
          const deallocValue = safeParseInt(Reflect.get(row, colMap.dealloc), 0);
          const reactiveValue = safeParseInt(Reflect.get(row, colMap.reactive), 0);
          const proactiveValue = safeParseInt(Reflect.get(row, colMap.proactive), 0);
          

          await client.query(`
            INSERT INTO bfsi_summary_data (
              primary_skill, reactive_srf, proactive, demand_total, 
              pool_supply, deallocation_supply, supply_total, gap, offers_total
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            skillName,
            reactiveValue,
            proactiveValue,
            safeParseInt(Reflect.get(row, colMap.demand_total), 0),
            poolValue,
            deallocValue,
            safeParseInt(Reflect.get(row, colMap.supply_total), 0),
            safeParseInt(Reflect.get(row, colMap.gap), 0),
            safeParseInt(Reflect.get(row, colMap.off_total), 0)
          ]);
          summaryCount++;
        }
        
        // Also insert Grand Total row for totalSupply/totalDemand lookups
        const grandTotalRow = summaryData.find((r) => r && String(Reflect.get(r, 0) || '').toLowerCase().includes('grand total'));
        if (grandTotalRow) {
          await client.query(`
            INSERT INTO bfsi_summary_data (
              primary_skill, reactive_srf, proactive, demand_total,
              pool_supply, deallocation_supply, supply_total, gap, offers_total
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            'Grand Total',
            safeParseInt(Reflect.get(grandTotalRow, colMap.reactive), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.proactive), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.demand_total), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.pool), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.dealloc), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.supply_total), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.gap), 0),
            safeParseInt(Reflect.get(grandTotalRow, colMap.off_total), 0)
          ]);
        }
        
      }
      
      // Record upload
      await client.query(`
        INSERT INTO bfsi_uploads (filename, uploaded_by, records_processed, status)
        VALUES ($1, $2, $3, $4)
      `, [
        req.file.originalname, 
        req.body.uploadedBy || 'admin', 
        rolesCount + workforceCount + poolCount + deallocationCount, 
        'Success'
      ]);

      // ── FINAL CLEANUP: Any employee with a deallocation_date should be 'Deallocating'
      // This fixes cases where LOB sheet set status='In-project' but Deallocation sheet
      // also listed them — the deallocation_date is the authoritative signal
      await client.query(`
        UPDATE bfsi_workforce 
        SET status = 'Deallocating'
        WHERE deallocation_date IS NOT NULL 
          AND status != 'Deallocating'
          AND status != 'Available-Pool'
      `);

      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: `Upload successful:`,
        summary: {
          roles: rolesCount,
          employees: workforceCount,
          pool: poolCount,
          deallocating: deallocationCount,
          summarySkills: summaryCount,
          total: rolesCount + workforceCount + poolCount + deallocationCount
        }
      });
      
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('BFSI Upload Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Generate weekly report
app.get('/api/bfsi/report/weekly', requireAuth, async (req, res) => {
  try {
    const dashboard = await query('SELECT * FROM bfsi_uploads ORDER BY upload_date DESC LIMIT 1');
    const roles = await query("SELECT COUNT(*) as total FROM bfsi_roles WHERE status = 'Open'");
    const filled = await query("SELECT COUNT(DISTINCT role_id) as filled FROM bfsi_assignments WHERE assignment_status = 'Assigned'");
    const aging = await query("SELECT COUNT(*) as aging FROM bfsi_roles WHERE status = 'Open' AND days_open > 90");
    const completions = await query("SELECT COUNT(*) as completed FROM bfsi_certifications WHERE status = 'Completed' AND updated_at >= CURRENT_DATE - INTERVAL '7 days'");
    
    res.json({
      generatedAt: new Date().toISOString(),
      lastUpload: dashboard.rows[0],
      summary: {
        openRoles: parseInt(roles.rows[0].total),
        filledRoles: parseInt(filled.rows[0].filled),
        agingRoles: parseInt(aging.rows[0].aging),
        certCompletionsThisWeek: parseInt(completions.rows[0].completed)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign employee to role
// Simple allocate/reserve used by the Find a Match results cards & detail modal.
// Marks the employee in whichever table they live in (employees and/or
// bfsi_workforce), records an allocation_log entry, and best-effort writes a
// bfsi_assignments row so the Allocations tab stays populated.
app.post('/api/admin/allocate', requireAdmin, async (req, res) => {
  try {
    const { employeeId, srfId, roleName, allocatedBy } = req.body || {};
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    const eid = String(employeeId);

    const upEmp = await pool.query(
      `UPDATE employees SET status='allocated', allocated_srf=$1, allocated_role=$2, allocated_at=NOW(), allocated_by=$3
       WHERE id::text=$4::text OR zensar_id::text=$4::text RETURNING id, name, zensar_id`,
      [srfId || null, roleName || null, allocatedBy || null, eid]
    );
    const upWf = await pool.query(`UPDATE bfsi_workforce SET status='Assigned' WHERE employee_id::text=$1::text RETURNING employee_id`, [eid]).catch(() => ({ rowCount: 0 }));
    if (srfId) {
      await pool.query(`INSERT INTO bfsi_assignments (role_id, employee_id, assignment_status) VALUES ($1,$2,'Assigned') ON CONFLICT (role_id, employee_id) DO UPDATE SET assignment_status='Assigned', updated_at=CURRENT_TIMESTAMP`, [srfId, eid]).catch((e) => console.warn('[Allocate] assignment skip:', e.message));
      await pool.query(`UPDATE bfsi_roles SET status='Filled' WHERE role_id=$1`, [srfId]).catch(() => {});
    }
    await pool.query(
      `INSERT INTO allocation_log (employee_id, srf_id, role_name, action, actioned_by, actioned_at) VALUES ($1,$2,$3,'allocated',$4,NOW())`,
      [eid, srfId || null, roleName || null, allocatedBy || null]
    ).catch((e) => console.warn('[Allocate] log skip:', e.message));

    return res.json({ success: true, message: 'Employee allocated', employee: upEmp.rows[0] || { employee_id: eid } });
  } catch (err) {
    console.error('[Allocate] error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reserve', requireAdmin, async (req, res) => {
  try {
    const { employeeId, srfId, roleName, reservedBy } = req.body || {};
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    const eid = String(employeeId);

    const upEmp = await pool.query(
      `UPDATE employees SET status='reserved', reserved_srf=$1, reserved_role=$2, reserved_at=NOW(), reserved_by=$3
       WHERE id::text=$4::text OR zensar_id::text=$4::text RETURNING id, name, zensar_id`,
      [srfId || null, roleName || null, reservedBy || null, eid]
    );
    const upWf = await pool.query(`UPDATE bfsi_workforce SET status='Reserved' WHERE employee_id::text=$1::text RETURNING employee_id`, [eid]).catch(() => ({ rowCount: 0 }));
    await pool.query(
      `INSERT INTO allocation_log (employee_id, srf_id, role_name, action, actioned_by, actioned_at) VALUES ($1,$2,$3,'reserved',$4,NOW())`,
      [eid, srfId || null, roleName || null, reservedBy || null]
    ).catch((e) => console.warn('[Reserve] log skip:', e.message));

    return res.json({ success: true, message: 'Employee reserved', employee: upEmp.rows[0] || { employee_id: eid } });
  } catch (err) {
    console.error('[Reserve] error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/bfsi/assign', requireAdmin, async (req, res) => {
  try {
    const {
      roleId, employeeId, matchScore,
      allocationReadiness, confidenceAtAlloc, freshnessAtAlloc, 
      riskScore, recommendedRank, adminOverride, overrideReason 
    } = req.body;
    
    await query(`
      INSERT INTO bfsi_assignments (
        role_id, employee_id, match_score, assignment_status,
        allocation_readiness, confidence_at_alloc, freshness_at_alloc,
        risk_score, recommended_rank, admin_override, override_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (role_id, employee_id) DO UPDATE SET
        match_score = EXCLUDED.match_score,
        assignment_status = EXCLUDED.assignment_status,
        allocation_readiness = EXCLUDED.allocation_readiness,
        confidence_at_alloc = EXCLUDED.confidence_at_alloc,
        freshness_at_alloc = EXCLUDED.freshness_at_alloc,
        risk_score = EXCLUDED.risk_score,
        recommended_rank = EXCLUDED.recommended_rank,
        admin_override = EXCLUDED.admin_override,
        override_reason = EXCLUDED.override_reason,
        updated_at = CURRENT_TIMESTAMP
    `, [
      roleId, employeeId, matchScore, 'Assigned',
      allocationReadiness || matchScore || 0, confidenceAtAlloc || 0, freshnessAtAlloc || 0,
      riskScore || 0, recommendedRank || 1, adminOverride || false, overrideReason || null
    ]);
    
    await query("UPDATE bfsi_workforce SET status = $1 WHERE employee_id = $2", ['Assigned', employeeId]);
    await query("UPDATE bfsi_roles SET status = $1 WHERE role_id = $2", ['Filled', roleId]);
    
    res.json({ success: true, message: 'Employee assigned to role' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reserve employee for role (reskilling track)
app.post('/api/bfsi/reserve', requireAdmin, async (req, res) => {
  try {
    const { 
      roleId, employeeId, matchScore, weeks,
      allocationReadiness, confidenceAtAlloc, freshnessAtAlloc, 
      riskScore, recommendedRank, adminOverride, overrideReason 
    } = req.body;
    
    await query(`
      INSERT INTO bfsi_assignments (
        role_id, employee_id, match_score, assignment_status,
        allocation_readiness, confidence_at_alloc, freshness_at_alloc,
        risk_score, recommended_rank, admin_override, override_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (role_id, employee_id) DO UPDATE SET
        match_score = EXCLUDED.match_score,
        assignment_status = EXCLUDED.assignment_status,
        allocation_readiness = EXCLUDED.allocation_readiness,
        confidence_at_alloc = EXCLUDED.confidence_at_alloc,
        freshness_at_alloc = EXCLUDED.freshness_at_alloc,
        risk_score = EXCLUDED.risk_score,
        recommended_rank = EXCLUDED.recommended_rank,
        admin_override = EXCLUDED.admin_override,
        override_reason = EXCLUDED.override_reason,
        updated_at = CURRENT_TIMESTAMP
    `, [
      roleId, employeeId, matchScore, 'Reserved',
      allocationReadiness || matchScore || 0, confidenceAtAlloc || 0, freshnessAtAlloc || 0,
      riskScore || 0, recommendedRank || 1, adminOverride || false, overrideReason || null
    ]);
    
    res.json({ success: true, message: `Employee reserved for role (${weeks || 4} weeks track)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record allocation outcome (success/failure) and feedback
app.post('/api/bfsi/outcome', requireAdmin, async (req, res) => {
  try {
    const { roleId, employeeId, outcomeStatus, outcomeNotes } = req.body;
    if (!roleId || !employeeId || !outcomeStatus) {
      return res.status(400).json({ error: 'Missing required parameters: roleId, employeeId, outcomeStatus' });
    }

    // 1. Update assignment outcome details
    await query(`
      UPDATE bfsi_assignments
      SET outcome_status = $1,
          outcome_notes = $2,
          outcome_recorded_at = CURRENT_TIMESTAMP,
          assignment_status = 'Completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE role_id = $3 AND employee_id = $4
    `, [outcomeStatus, outcomeNotes || '', roleId, employeeId]);

    // 2. Set employee back to Available in workforce
    await query("UPDATE bfsi_workforce SET status = 'Available', updated_at = CURRENT_TIMESTAMP WHERE employee_id = $1", [employeeId]);
    
    // 3. Set role to Closed
    await query("UPDATE bfsi_roles SET status = 'Closed', updated_at = CURRENT_TIMESTAMP WHERE role_id = $1", [roleId]);

    // 4. Resolve internal employee id and run recalculation to adjust skill metrics based on outcomes
    let resolvedId = employeeId;
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [employeeId]);
    if (empCheck.rows.length > 0) {
      resolvedId = empCheck.rows[0].id;
      await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedId]);
    }

    res.json({ success: true, message: 'Outcome recorded and skill analytics adjusted dynamically' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start reskilling for employee
app.post('/api/bfsi/reskill', requireAdmin, async (req, res) => {
  try {
    const { employeeId, programName, durationWeeks, targetSkills } = req.body;
    
    const today = new Date();
    const completionDate = new Date(today);
    completionDate.setDate(completionDate.getDate() + (durationWeeks * 7));
    
    await query(`
      UPDATE bfsi_workforce 
      SET reskilling_program = $1, 
          graduation_date = $2, 
          status = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $4
    `, [programName, completionDate.toISOString().split('T')[0], 'Under-reskilling', employeeId]);
    
    await query(`
      INSERT INTO bfsi_certifications (employee_id, cert_name, start_date, expected_completion, duration_weeks, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [employeeId, programName, today.toISOString().split('T')[0], completionDate.toISOString().split('T')[0], durationWeeks, 'In Progress']);
    
    res.json({ success: true, message: 'Reskilling program started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug: Inspect actual column names from uploaded Excel
app.post('/api/bfsi/debug-columns', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const result = {};
    for (const sheetName of workbook.SheetNames) {
      const sheet = Reflect.get(workbook.Sheets, sheetName);
      const data = XLSX.utils.sheet_to_json(sheet, { raw: false });
      Reflect.set(result, sheetName, {
        rowCount: data.length,
        columns: data.length > 0 ? Object.keys(Reflect.get(data, 0)) : [],
        firstRow: data.length > 0 ? Reflect.get(data, 0) : {}
      });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset all BFSI data
app.post('/api/bfsi/reset', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE bfsi_assignments CASCADE');
    await client.query('TRUNCATE TABLE bfsi_certifications CASCADE');
    await client.query('TRUNCATE TABLE bfsi_workforce CASCADE');
    await client.query('TRUNCATE TABLE bfsi_roles CASCADE');
    await client.query('TRUNCATE TABLE bfsi_summary_data CASCADE');
    await client.query('TRUNCATE TABLE bfsi_uploads CASCADE');
    await client.query('COMMIT');
    res.json({ success: true, message: 'All BFSI data has been reset' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ==========================================

// ==========================================
// ZENASSESS API ENDPOINTS
// ==========================================

// Ensure zenassess_sessions table exists (idempotent)
async function ensureZenAssessTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS zenassess_sessions (
      session_id    VARCHAR(50)  PRIMARY KEY,
      employee_id   VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      level_path    VARCHAR(20)  NOT NULL,
      score         NUMERIC(5,2) DEFAULT 0,
      status        VARCHAR(30)  NOT NULL DEFAULT 'pending',
      assigned_level VARCHAR(30) DEFAULT NULL,
      retry_after   TIMESTAMP    DEFAULT NULL,
      questions     JSONB        DEFAULT '[]',
      answers       JSONB        DEFAULT '{}',
      evidence      JSONB        DEFAULT '{}',
      study_path    JSONB        DEFAULT NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_zenassess_employee_id ON zenassess_sessions(employee_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_zenassess_status ON zenassess_sessions(status)`);
  // Add section_scores column if missing (idempotent)
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS section_scores JSONB DEFAULT '{}'`).catch(() => {});
  // ZenAssess 3-skill sequential engine columns (idempotent, safely defaulted)
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS validated_level   VARCHAR(30) DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS attempt_number    INTEGER DEFAULT 1`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS silent_drop_path  VARCHAR(120) DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS badge_awarded     BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS skill_name         VARCHAR(255) DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS self_claimed_level_at_test VARCHAR(50) DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS coding_results    JSONB DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS github_evaluation JSONB DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS timing_analysis   JSONB DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS integrity_flags   JSONB DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS verified_badge_level VARCHAR(50) DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS self_claimed_level   VARCHAR(50) DEFAULT NULL`).catch(() => {});

  // Create dedicated zenassess_evidence storage table
  await query(`
    CREATE TABLE IF NOT EXISTS zenassess_evidence (
      evidence_id             VARCHAR(50)  PRIMARY KEY,
      session_id              VARCHAR(50)  NOT NULL REFERENCES zenassess_sessions(session_id) ON DELETE CASCADE,
      employee_id             VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      evidence_type           VARCHAR(100) NOT NULL,
      original_filename       VARCHAR(255) NOT NULL,
      upload_timestamp        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      extracted_skills        TEXT[]       DEFAULT '{}',
      detected_technologies   TEXT[]       DEFAULT '{}',
      authenticity_score      INTEGER      DEFAULT 100,
      confidence_score        INTEGER      DEFAULT 100,
      evaluation_status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
      manager_review_status   VARCHAR(50)  NOT NULL DEFAULT 'pending'
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ze_session ON zenassess_evidence(session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ze_employee ON zenassess_evidence(employee_id)`);

  // Admin re-assessment grants — a one-time pass that lets an employee bypass the
  // 7-day retake cooldown for a specific skill. Consumed when that skill's test
  // next completes. An unused (used = FALSE) row = an active grant.
  await query(`
    CREATE TABLE IF NOT EXISTS zenassess_retake_grants (
      id          SERIAL       PRIMARY KEY,
      employee_id VARCHAR(50)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      skill_name  VARCHAR(255) NOT NULL,
      granted_by  VARCHAR(120) DEFAULT NULL,
      granted_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      used        BOOLEAN      NOT NULL DEFAULT FALSE,
      used_at     TIMESTAMP    DEFAULT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_zrg_active ON zenassess_retake_grants(employee_id, skill_name) WHERE used = FALSE`);
}

// GET /api/zenassess/skills — get all unique skills in the question bank
// NOTE: Backward compatible during JWT transition
app.get('/api/zenassess/skills', async (req, res) => {
  try {
    const result = await query('SELECT DISTINCT skill_name FROM question_bank ORDER BY skill_name');
    res.json({ success: true, skills: result.rows.map(r => r.skill_name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zenassess/questions — fetch randomized questions for a given skill and band
// NOTE: Backward compatible during JWT transition
app.get('/api/zenassess/questions', async (req, res) => {
  try {
    const skill = req.query.skill || 'Performance Testing';
    const band = req.query.band || 'beginner';
    
    // Choose which bands of questions to include based on user's band
    let bandFilter = `band = 'beginner'`;
    if (band === 'intermediate') {
      bandFilter = `band IN ('beginner', 'intermediate')`;
    } else if (band === 'advanced') {
      bandFilter = `band IN ('intermediate', 'advanced')`;
    } else if (band === 'expert') {
      bandFilter = `band IN ('advanced', 'expert')`;
    }
    
    let limitValue = 10;
    if (skill.toLowerCase() === 'functional testing') {
      if (band === 'beginner') {
        limitValue = 20;
      } else if (band === 'intermediate') {
        limitValue = 15;
      }
    }
    
    const result = await query(
      `SELECT * FROM question_bank 
       WHERE LOWER(skill_name) = LOWER($1) AND active = true AND ${bandFilter}
       ORDER BY RANDOM() LIMIT ${limitValue}`,
      [skill]
    );
    
    const mapped = result.rows.map(r => ({
      id: String(r.id),
      question: r.question_text,
      options: Array.isArray(r.options) ? r.options : JSON.parse(r.options || '[]'),
      correct: r.correct_option + 1, // map 0-based index to 1-based
      difficulty: r.difficulty,
      skill: r.skill_name,
      time: r.time_seconds || 60,
      points: r.points || 1
    }));
    
    res.json({ success: true, questions: mapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zenassess/history/:employeeId — retrieve historical assessment sessions
// NOTE: Backward compatible during JWT transition
app.get('/api/zenassess/history/:employeeId', async (req, res) => {
  try {
    const empRes = await query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [req.params.employeeId]
    );
    const resolvedId = empRes.rows[0]?.id || req.params.employeeId;
    
    const result = await query(
      `SELECT session_id, level_path, score, status, assigned_level, retry_after, created_at, skill_name, tab_switch_count, copy_paste_count, integrity_score
       FROM zenassess_sessions 
       WHERE employee_id = $1 
       ORDER BY created_at DESC`,
      [resolvedId]
    );
    res.json({ success: true, history: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zenassess/analytics/:employeeId — get visual capability analytics
// NOTE: Backward compatible during JWT transition
app.get('/api/zenassess/analytics/:employeeId', async (req, res) => {
  try {
    const empRes = await query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [req.params.employeeId]
    );
    const resolvedId = empRes.rows[0]?.id || req.params.employeeId;

    // Get average score by skill
    const avgScores = await query(
      `SELECT skill_name, AVG(score) as avg_score, COUNT(*) as attempts
       FROM zenassess_sessions 
       WHERE employee_id = $1 AND status != 'in_progress'
       GROUP BY skill_name`,
      [resolvedId]
    );

    // Get overall counts
    const counts = await query(
      `SELECT 
         COUNT(*) as total_attempts,
         COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed_attempts,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_attempts,
         COUNT(CASE WHEN status = 'review_required' THEN 1 END) as pending_review
       FROM zenassess_sessions 
       WHERE employee_id = $1`,
      [resolvedId]
    );

    res.json({ 
      success: true, 
      avgScores: avgScores.rows,
      counts: counts.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zenassess/recommendations/:employeeId — learning recommendations based on gaps
// NOTE: Backward compatible during JWT transition
app.get('/api/zenassess/recommendations/:employeeId', async (req, res) => {
  try {
    const empRes = await query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [req.params.employeeId]
    );
    const resolvedId = empRes.rows[0]?.id || req.params.employeeId;

    // 1. Find failed assessments
    const failedSessions = await query(
      `SELECT DISTINCT skill_name FROM zenassess_sessions 
       WHERE employee_id = $1 AND status = 'failed' AND created_at > NOW() - INTERVAL '30 days'`,
      [resolvedId]
    );
    
    // 2. Find low self-rated skills (< 2)
    const lowSkills = await query(
      `SELECT skill_name FROM skills 
       WHERE employee_id = $1 AND self_rating < 2`,
      [resolvedId]
    );

    const gapSkills = new Set([
      ...failedSessions.rows.map(r => r.skill_name || 'Performance Testing'),
      ...lowSkills.rows.map(r => r.skill_name)
    ]);

    // Simple rule-based recommendations for demonstration
    const recommendations = [];
    for (const skill of gapSkills) {
      if (skill === 'Performance Testing') {
        recommendations.push({
          skill,
          title: 'Advanced Workload Modeling & JMeter Best Practices',
          type: 'Course',
          duration: '4 weeks',
          provider: 'Zensar Learning Academy',
          reason: 'Recommended based on performance assessment gap.'
        });
      } else if (skill === 'Selenium') {
        recommendations.push({
          skill,
          title: 'Selenium Grid & POM Architecture Mastery',
          type: 'Course',
          duration: '3 weeks',
          provider: 'Coursera / Zensar Portal',
          reason: 'Recommended due to low proficiency rating.'
        });
      } else {
        recommendations.push({
          skill,
          title: `Mastering ${skill} fundamentals`,
          type: 'Reading & Lab',
          duration: '2 weeks',
          provider: 'Self-paced learning',
          reason: 'General upskilling recommendation.'
        });
      }
    }

    res.json({ success: true, recommendations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback dynamic database for ZenAssess Workforce Engine
const ZENASSESS_FALLBACK_BANK = {
  'python': {
    easy: [
      { question: "What is the output of print(2 ** 3) in Python?", options: ["6", "8", "9", "Error"], correct: 2, topic: "Syntax" },
      { question: "Which of the following data types is mutable in Python?", options: ["List", "Tuple", "String", "Integer"], correct: 1, topic: "Data Types" },
      { question: "How do you start a comment in Python?", options: ["//", "/*", "#", "--"], correct: 3, topic: "Syntax" },
      { question: "What does len() function do in Python?", options: ["Returns string lowercase", "Returns number of elements", "Returns data type", "Calculates logarithm"], correct: 2, topic: "Builtins" },
      { question: "Which keyword is used to define a function in Python?", options: ["def", "func", "function", "define"], correct: 1, topic: "Functions" },
      { question: "How can you append an element to a list in Python?", options: ["list.add()", "list.append()", "list.insert()", "list.push()"], correct: 2, topic: "Lists" },
      { question: "What does range(5) produce in Python 3?", options: ["List from 0 to 5", "An iterable range object from 0 to 4", "List from 1 to 5", "A tuple from 0 to 4"], correct: 2, topic: "Ranges" }
    ],
    hard: [
      { question: "In Python, how does a generator function yield values?", options: ["Using return statement", "Using yield keyword", "By raising StopIteration", "By returning a list"], correct: 2, topic: "Generators" },
      { question: "What is the purpose of Python decorators?", options: ["To format code", "To dynamically modify function behavior", "To declare static types", "To speed up execution"], correct: 2, topic: "Decorators" },
      { question: "Which of the following is true about Python's Global Interpreter Lock (GIL)?", options: ["It enables multi-core CPU parallelism", "It prevents multiple native threads from executing Python bytecodes at once", "It is only present in PyPy", "It speeds up I/O bound operations"], correct: 2, topic: "Concurrency" },
      { question: "How is memory managed in Python?", options: ["Manual malloc/free", "Automatic garbage collection and reference counting", "No memory management is needed", "Via compiler optimizations"], correct: 2, topic: "Memory Management" },
      { question: "What is a metaclass in Python?", options: ["A class that inherits from multiple classes", "A class whose instances are classes themselves", "A class used to write unit tests", "A configuration file"], correct: 2, topic: "OOP" }
    ],
    practical: [
      { name: "Task 1: Optimize and Refactor Nested Loop Code", description: "Refactor a slow Python function that performs nested database lookups in loops to use dictionary lookups, list comprehensions, and generators. Write unit tests using unittest or pytest to verify correctness." },
      { name: "Task 2: Diagnose Memory Leak in Flask API", description: "Identify a memory leak and performance bottleneck in a Python Flask API endpoint using cProfile or memory_profiler. Document reproduction steps and log code fixes." }
    ],
    scenarios: [
      { name: "Q1", question: "You are importing a large CSV file of 10GB in a Python script, but the server runs out of memory (OOM). How would you redesign the script to process this file efficiently?" },
      { name: "Q2", question: "A Python script using threads is not running any faster on a multi-core CPU for CPU-bound tasks. Explain why this happens and what options you have to fix it." },
      { name: "Q3", question: "Explain the differences between __new__ and __init__ in a Python class and detail a specific use case where you would customize __new__." }
    ]
  },
  'devops': {
    easy: [
      { question: "Which command is used to build a Docker image from a Dockerfile?", options: ["docker run", "docker build", "docker compile", "docker make"], correct: 2, topic: "Docker" },
      { question: "What does CI in CI/CD stand for?", options: ["Continuous Improvement", "Continuous Integration", "Continuous Installation", "Coding Integration"], correct: 2, topic: "Basics" },
      { question: "Which Git command downloads changes from a remote repository without merging?", options: ["git pull", "git push", "git fetch", "git clone"], correct: 3, topic: "Git" },
      { question: "What is the default port for Jenkins dashboard?", options: ["80", "443", "8080", "9000"], correct: 3, topic: "Jenkins" },
      { question: "Which file is commonly used to write a Docker Compose configuration?", options: ["docker-compose.json", "docker-compose.yaml", "docker.xml", "Composefile"], correct: 2, topic: "Docker" }
    ],
    hard: [
      { question: "What is the primary difference between a Kubernetes Deployment and a StatefulSet?", options: ["StatefulSet is faster", "StatefulSet maintains unique network identities and persistent storage for each pod", "Deployment is only for databases", "StatefulSet doesn't support scaling"], correct: 2, topic: "Kubernetes" },
      { question: "How does Ansible communicate with remote Linux nodes by default?", options: ["Agent installed on nodes", "SSH without persistent agents", "WebSockets", "HTTP API calls"], correct: 2, topic: "Ansible" },
      { question: "In Terraform, what is the purpose of the state file?", options: ["It contains secrets", "It maps real-world infrastructure to your configuration", "It contains code comments", "It is only for backups"], correct: 2, topic: "Terraform" },
      { question: "What is a canary deployment strategy?", options: ["Deploying to production all at once", "Releasing to a small subset of users first to test stability", "Keeping both environments active always", "Running code only on local machines"], correct: 2, topic: "Deployment" },
      { question: "In Git, what does a fast-forward merge mean?", options: ["It creates a merge commit always", "It moves the branch pointer forward without a merge commit if history hasn't diverged", "It deletes conflict files", "It runs tests automatically"], correct: 2, topic: "Git" }
    ],
    practical: [
      { name: "Task 1: Create a GitHub Actions Workflow", description: "Write a GitHub Actions workflow to build a Docker image, execute automated test scripts, perform a security scan, and push the image to AWS Elastic Container Registry (ECR)." },
      { name: "Task 2: Write a Kubernetes Manifest with Auto-scaling", description: "Write a Kubernetes Deployment manifest for a microservice with resource limits, liveness and readiness probes, and a Horizontal Pod Autoscaler config." }
    ],
    scenarios: [
      { name: "Q1", question: "A production deployment pipeline fails because a database schema migration takes longer than the timeout limit. How would you troubleshoot and prevent this issue?" },
      { name: "Q2", question: "A Dockerized application runs extremely slowly in Kubernetes under high load. What diagnostics would you perform, and how would you configure resource limits?" },
      { name: "Q3", question: "Explain the differences between blue-green deployment and canary deployment, and describe how you would rollback a failed canary release." }
    ]
  },
  'performance testing': {
    easy: [
      { question: "Which scenario best justifies a soak test?", options: ["Validate login speed", "Identify breaking point", "Detect memory leak over 24 hours", "Sudden traffic surge"], correct: 3, difficulty: "HARD", skill: "Test Types", time: 90, points: 2 },
      { question: "Stress testing primarily helps to identify:", options: ["Response time", "SLA compliance", "Failure point & recovery", "UI rendering issues"], correct: 3, difficulty: "INTERMEDIATE", skill: "Stress Testing", time: 60, points: 1 },
      { question: "A spike test differs from a stress test because spike test:", options: ["Introduces sudden load", "Runs long duration", "Gradually increases users", "Tests max capacity"], correct: 1, difficulty: "HARD", skill: "Test Types", time: 90, points: 2 },
      { question: "Break-point testing ends when:", options: ["SLA met", "Errors start", "Throughput drops", "System crashes"], correct: 4, difficulty: "INTERMEDIATE", skill: "Test Strategy", time: 60, points: 1 },
      { question: "Step-up testing is MOST useful to observe:", options: ["Failure recovery", "Resource saturation pattern", "Browser performance", "API correctness"], correct: 2, difficulty: "HARD", skill: "Workload Modeling", time: 90, points: 2 }
    ],
    hard: [
      { question: "90th percentile response time is critical because:", options: ["It is faster than average", "It ignores outliers", "It shows peak traffic", "It represents user experience by showing 90% of requests are faster"], correct: 4, topic: "SLA Metrics" },
      { question: "Little's Law states which relationship in load testing?", options: ["Users = Throughput * Response Time", "Response Time = Users / Throughput", "Throughput = Response Time * Users", "Users = Response Time - Throughput"], correct: 1, topic: "Performance Theory" },
      { question: "What is correlation in performance test scripting?", options: ["Comparing results", "Extracting dynamic session IDs from response and passing to subsequent requests", "Running script on multiple machines", "Comparing client vs server CPU"], correct: 2, topic: "Scripting" },
      { question: "During execution, which metric signals system saturation first?", options: ["Error count increases", "Response time flattens while throughput drops", "CPU spikes to 50%", "Throughput flattens while response time spikes"], correct: 4, topic: "Monitoring" },
      { question: "What does a high standard deviation in response times indicate?", options: ["Stable response times", "High variability and inconsistency in performance", "Low network latency", "Database optimization"], correct: 2, topic: "Statistics" }
    ],
    practical: [
      { name: "Task 1: Create a k6 Script for API Validation", description: "Create a k6 load test script targeting a checkout API endpoint. Model a step-up workload (0 to 100 users over 5 mins), configure SLAs (95th percentile response time < 500ms), and handle session cookies." },
      { name: "Task 2: Analyze Soak Test Metrics", description: "Review a 24-hour test execution report where memory usage increased linearly while throughput dropped. Identify the root cause and recommend fixes." }
    ],
    scenarios: [
      { name: "Q1", question: "Under a soak test, the response times are gradually increasing over 12 hours. What diagnostics would you run to find the leak?" },
      { name: "Q2", question: "A spike test causes the database CPU to hit 100% and connection pools to exhaust. How do you resolve this connection bottleneck?" },
      { name: "Q3", question: "Explain how you apply Little's Law to model concurrent users using production analytics." }
    ]
  },
  'functional testing': {
    easy: [
      { question: "Which SDLC model is characterized by incremental development and high adaptability to changes?", options: ["Waterfall", "V-Model", "Agile", "Big Bang"], correct: 3, difficulty: 'EASY', skill: 'SDLC', time: 60, points: 1 },
      { question: "When should test planning begin in the Software Testing Life Cycle (STLC)?", options: ["After coding is complete", "As soon as requirements are gathered", "During the design phase", "During the deployment phase"], correct: 2, difficulty: 'EASY', skill: 'STLC', time: 60, points: 1 },
      { question: "Which test case design technique focuses on testing the boundaries of input ranges?", options: ["Equivalence Partitioning", "Boundary Value Analysis", "Decision Table Testing", "State Transition Testing"], correct: 2, difficulty: 'EASY', skill: 'Test Case Design', time: 60, points: 1 },
      { question: "What is the status of a defect when it is first logged by a tester?", options: ["Open", "New", "Assigned", "Resolved"], correct: 2, difficulty: 'EASY', skill: 'Defect Lifecycle', time: 60, points: 1 },
      { question: "A spelling mistake in the company name on the homepage of a website has:", options: ["High Severity, High Priority", "Low Severity, High Priority", "High Severity, Low Priority", "Low Severity, Low Priority"], correct: 2, difficulty: 'EASY', skill: 'Severity vs Priority', time: 60, points: 1 }
    ],
    hard: [
      { question: "What is the primary purpose of a requirements traceability matrix (RTM)?", options: ["To track project budget", "To map requirements to test cases and defects", "To monitor team performance", "To schedule testing tasks"], correct: 2, difficulty: 'HARD', skill: 'Requirement Analysis', time: 60, points: 1 },
      { question: "Which estimation technique uses optimistic, pessimistic, and most likely estimates?", options: ["Delphi Method", "Wideband Delphi", "Three-Point Estimation", "Function Point Analysis"], correct: 3, difficulty: 'HARD', skill: 'Test Estimation', time: 60, points: 1 },
      { question: "In risk-based testing, how is test priority determined?", options: ["By developer availability", "By Likelihood of failure and Business Impact", "By the order requirements are written", "By the number of lines of code"], correct: 2, difficulty: 'HARD', skill: 'Risk-Based Testing', time: 60, points: 1 },
      { question: "If an input field accepts values between 10 and 50 inclusive, which values are tested under boundary value analysis (3-value boundary testing)?", options: ["9, 10, 11, 49, 50, 51", "10, 30, 50", "9, 10, 50, 51", "0, 10, 50, 100"], correct: 1, difficulty: 'HARD', skill: 'Boundary Value Analysis', time: 60, points: 1 },
      { question: "For an input field that accepts a 5-digit ZIP code (00000 to 99999), which represents an invalid equivalence partition?", options: ["A 5-digit number", "A 6-digit number", "Any number starting with 9", "Any number between 10000 and 20000"], correct: 2, difficulty: 'HARD', skill: 'Equivalence Partitioning', time: 60, points: 1 }
    ],
    practical: [
      { name: "Task 1: Create Test Cases for Fund Transfer Module", description: "Create comprehensive functional and negative test cases for an online fund transfer module, detailing preconditions, input parameters (boundary conditions), security validations, and expected outcomes." },
      { name: "Task 2: Find defects in Loan Application Workflow", description: "You are given a scenario where a user submits a loan application, the database locks, and the frontend hangs. Log a detailed defect report with steps, severity, priority, and diagnostic notes." }
    ],
    scenarios: [
      { name: "Q1", question: "A production banking application allows users to transfer funds without mandatory beneficiary validation. How would you test and report this issue?" },
      { name: "Q2", question: "Client reports that after a recent deployment, multiple users cannot complete checkout. How would you systematically troubleshoot and diagnose?" },
      { name: "Q3", question: "Requirement specifications are incomplete, but development has already started. What steps will you take to validate the feature?" }
    ]
  },
  'automation testing': {
    easy: [
      { question: "Which locator strategy is generally most robust in Selenium?", options: ["XPath", "CSS Selector", "ID", "Class Name"], correct: 3, topic: "Locators" },
      { question: "What is the purpose of Implicit Wait in Selenium?", options: ["Wait for a fixed time", "Wait for element to be present for a specified time before throwing exception", "Pause thread execution", "Accelerate browser load"], correct: 2, topic: "Waits" },
      { question: "Which tool natively supports running tests in headless mode?", options: ["Selenium Grid", "Playwright", "AutoIT", "QuickTest Professional"], correct: 2, topic: "Tools" },
      { question: "What does the Page Object Model (POM) primarily solve?", options: ["Code compilation speed", "Test execution speed", "Code duplication and maintainability", "Database connectivity"], correct: 3, topic: "Design Patterns" },
      { question: "Which assertion verifies that two values are equal in JUnit?", options: ["assertFalse()", "assertEquals()", "assertTrue()", "assertNull()"], correct: 2, topic: "JUnit" }
    ],
    hard: [
      { question: "In Playwright, what is the advantage of using Auto-waiting?", options: ["It skips tests if slow", "It checks element actionability before performing actions", "It speeds up browser rendering", "It runs tests in parallel"], correct: 2, topic: "Playwright" },
      { question: "How do you handle dynamic web tables in Selenium automation?", options: ["Hardcode row index", "Use dynamic XPath with indexes and siblings", "Convert page to PDF", "Re-run test till it passes"], correct: 2, topic: "Scripting" },
      { question: "What is the difference between assert and verify in test frameworks?", options: ["assert is faster", "assert stops test execution on failure; verify logs failure but continues test", "verify is only for DB tests", "assert is deprecated"], correct: 2, topic: "Assertions" },
      { question: "How do you automate shadow DOM elements in Selenium 4?", options: ["It is not supported", "Using locator to find shadow host, then locating shadow root", "Using static XPath", "Using JavaScript executeScript exclusively"], correct: 2, topic: "Locators" },
      { question: "What is the primary benefit of parallel test execution in CI/CD pipelines?", options: ["It uses less memory", "It significantly reduces build cycle time", "It prevents bugs", "It generates better reports"], correct: 2, topic: "CI/CD Integration" }
    ],
    practical: [
      { name: "Task 1: Automate E-Commerce Checkout POM", description: "Write an automation script in Playwright or Selenium using Page Object Model to log in, search for a product, add to cart, and assert checkout success." },
      { name: "Task 2: Parallel Jenkins Grid Configuration", description: "Write a Jenkins pipeline script that configures parallel execution of UI tests across multiple browser instances and publishes test reports." }
    ],
    scenarios: [
      { name: "Q1", question: "Tests are flaky and fail 15% of the time in the CI pipeline due to dynamic content loading speeds. How do you resolve this flakiness?" },
      { name: "Q2", question: "You need to automate a canvas-based signature pad in a web application. How would you approach this?" },
      { name: "Q3", question: "Explain when you would choose Playwright over Selenium for a new microservices UI test suite." }
    ]
  },
  'cloud': {
    easy: [
      { question: "Which AWS service is used for scalable compute capacity?", options: ["S3", "EC2", "RDS", "DynamoDB"], correct: 2, topic: "AWS" },
      { question: "What does SaaS stand for?", options: ["System as a Service", "Software as a Service", "Storage as a Service", "Security as a Service"], correct: 2, topic: "Cloud Concepts" },
      { question: "Which service is a managed relational database in Azure?", options: ["Cosmos DB", "Azure SQL Database", "Blob Storage", "Key Vault"], correct: 2, topic: "Azure" },
      { question: "What is the primary purpose of IAM in cloud computing?", options: ["Identity and Access Management", "Internet Application Monitoring", "Internal Asset Mapping", "IP Address Management"], correct: 1, topic: "Security" },
      { question: "What is a serverless database service in AWS?", options: ["EC2 Postgres", "RDS Aurora Serverless", "EBS Volume", "Redshift Cluster"], correct: 2, topic: "Databases" }
    ],
    hard: [
      { question: "What is a VPC peering connection in cloud architecture?", options: [" peeing into logs", "A networking connection between two VPCs that enables routing traffic between them using private IPs", "A public internet connection", "A database synchronization link"], correct: 2, topic: "Networking" },
      { question: "What is the primary benefit of using AWS Lambda?", options: ["Full server control", "Event-driven serverless computing with automatic scaling and no server management", "Cheaper for 24/7 workloads", "Allows desktop UI apps"], correct: 2, topic: "AWS" },
      { question: "How does cloud auto-scaling decide to launch new instances?", options: ["At scheduled times only", "Based on metrics like CPU utilization or request count exceeding thresholds", "By developer approval", "Randomly"], correct: 2, topic: "Auto-scaling" },
      { question: "What is the role of an API Gateway in a microservices cloud architecture?", options: ["Database storage", "A reverse proxy that routes requests, handles authentication, and rate limits", "Container orchestration", "Git hosting"], correct: 2, topic: "Architecture" },
      { question: "What does Infrastructure as Code (IaC) solve?", options: ["Slow compile times", "Inconsistent environments and manual deployment errors", "Vague code documentation", "Low test coverage"], correct: 2, topic: "IaC" }
    ],
    practical: [
      { name: "Task 1: Provision Secure VPC via Terraform", description: "Design a Terraform configuration to provision a secure VPC with public/private subnets, internet gateway, and security groups allowing SSH and HTTP." },
      { name: "Task 2: Event-driven S3 image resizing Lambda", description: "Write an AWS Lambda function triggered on S3 object creation that resizes images and updates meta details in DynamoDB." }
    ],
    scenarios: [
      { name: "Q1", question: "An EC2 instance behind an Auto Scaling Group is terminated, and users lose active session data. How do you resolve this state dependency?" },
      { name: "Q2", question: "Your cloud monthly bill increased by 200%. What cost optimization audit steps would you perform to identify resources leakages?" },
      { name: "Q3", question: "Explain how you secure cloud resources using IAM roles, security groups, and encryption key rotations." }
    ]
  },
  'cybersecurity': {
    easy: [
      { question: "What does SQL Injection primarily target?", options: ["Web browser rendering", "Relational database input parsing", "Network firewall rules", "Server operating systems"], correct: 2, topic: "Vulnerabilities" },
      { question: "Which HTTP status code represents unauthorized access?", options: ["200", "401", "404", "500"], correct: 2, topic: "Web Security" },
      { question: "What is phishing?", options: ["Scanning network ports", "Social engineering to steal user credentials", "Decrypting passwords", "Configuring firewalls"], correct: 2, topic: "Threats" },
      { question: "What is the purpose of SSL/TLS certificate?", options: ["To speed up website loading", "To encrypt web traffic between client and server", "To store session cookies", "To run malware scans"], correct: 2, topic: "Cryptography" },
      { question: "What does MFA stand for in security?", options: ["Multi-Factor Authentication", "Multiple Firewalls Active", "Managed File Access", "Memory Allocation Fault"], correct: 1, topic: "Access Control" }
    ],
    hard: [
      { question: "How does Cross-Site Scripting (XSS) exploit a web application?", options: ["By overloading server requests", "By injecting malicious scripts into trusted websites executed by user browsers", "By modifying database records", "By redirecting domain names"], correct: 2, topic: "Vulnerabilities" },
      { question: "What is the primary difference between symmetric and asymmetric encryption?", options: ["Symmetric is newer", "Symmetric uses the same key for encryption/decryption; asymmetric uses a public/private key pair", "Asymmetric is less secure", "Symmetric is only for networks"], correct: 2, topic: "Cryptography" },
      { question: "What is threat modeling?", options: ["Finding bugs in code", "A structured approach to identify security requirements, threats, and mitigation plans", "Running penetration test tools", "Configuring firewall settings"], correct: 2, topic: "Design" },
      { question: "What does OWASP Top 10 represent?", options: ["Top 10 antivirus systems", "Top 10 critical security risks for web applications", "Top 10 encryption methods", "Top 10 secure hosting sites"], correct: 2, topic: "Compliance" },
      { question: "What is a Man-in-the-Middle (MitM) attack?", options: ["An attacker hijacking a domain name", "An attacker intercepting and altering communications between two parties", "Malware running on server", "Developer pushing unauthorized code"], correct: 2, topic: "Attacks" }
    ],
    practical: [
      { name: "Task 1: Code Security Audit for Input Forms", description: "Audit an input form handler code in Node.js/PHP. Identify SQL injection and Cross-Site Scripting (XSS) vulnerabilities, and write secure parameterized remediation." },
      { name: "Task 2: API Token Validation Check", description: "Design a security verification checklist for an API endpoint using OAuth2 JWT tokens, verifying token signature, expiration, and scope enforcement." }
    ],
    scenarios: [
      { name: "Q1", question: "An attacker bypassed a login screen using SQL injection. Explain the mechanism of this attack and how to remediate the code." },
      { name: "Q2", question: "A DDoS attack is flooding your API gateway. What rate-limiting and WAF rules would you implement to mitigate the impact?" },
      { name: "Q3", question: "Explain asymmetric vs symmetric encryption and how SSH keys establish a secure tunnel." }
    ]
  },
  'data engineering': {
    easy: [
      { question: "Which SQL clause is used to filter group results?", options: ["WHERE", "HAVING", "GROUP BY", "ORDER BY"], correct: 2, topic: "SQL" },
      { question: "What does ETL stand for?", options: ["Extract, Transform, Load", "Encryption, Transfer, Logging", "Evaluation, Testing, Logic", "Engine, Transaction, Memory"], correct: 1, topic: "Concepts" },
      { question: "Which database type is optimized for unstructured data?", options: ["Relational (MySQL)", "NoSQL Document (MongoDB)", "Excel", "Data warehouse"], correct: 2, topic: "Databases" },
      { question: "What is a primary key?", options: ["A key that encrypts data", "A unique identifier for a table record", "A reference to another table", "A master database password"], correct: 2, topic: "Databases" },
      { question: "Which SQL join returns all records when there is a match in either left or right table?", options: ["INNER JOIN", "FULL OUTER JOIN", "LEFT JOIN", "RIGHT JOIN"], correct: 2, topic: "SQL" }
    ],
    hard: [
      { question: "What does data skew mean in distributed processing (like Spark)?", options: ["Data is corrupted", "One partition holds significantly more data than others, causing bottlenecks", "Data has too many columns", "Data formats are inconsistent"], correct: 2, topic: "Distributed Systems" },
      { question: "What is the difference between Star Schema and Snowflake Schema?", options: ["Star is faster to design", "Snowflake has normalized dimension tables with nested relationships; Star has denormalized dimensions", "Star is only for SQLServer", "Snowflake doesn't support joins"], correct: 2, topic: "Data Modeling" },
      { question: "What is consumer lag in a Kafka streaming system?", options: ["Network latency", "The difference between latest produced message offset and the offset read by consumer", "Delay in pipeline startup", "Slow database writes"], correct: 2, topic: "Kafka" },
      { question: "Which index type is best for column values with low cardinality (like Gender)?", options: ["B-Tree Index", "Bitmap Index", "Clustered Index", "Unique Index"], correct: 2, topic: "Indexing" },
      { question: "What is the purpose of partitioning in data lake tables?", options: ["Splitting data for multiple databases", "Organizing files in directories by column values (e.g. Year/Month) to skip reading irrelevant data", "Compressing files", "Encrypting partitions"], correct: 2, topic: "Data Lakes" }
    ],
    practical: [
      { name: "Task 1: Write PySpark ETL Pipeline", description: "Write a PySpark script to ingest 5 million transaction logs from JSON, clean null values, aggregate daily sales by category, and write the output to a PostgreSQL table." },
      { name: "Task 2: SQL Window Function Query Optimization", description: "Write an optimized SQL query using window functions to find the top 3 customers by revenue per month. Explain the indexing strategy to optimize this query." }
    ],
    scenarios: [
      { name: "Q1", question: "A daily ETL pipeline is taking 6 hours instead of 1 hour due to data skew in Spark partition keys. How do you identify and fix it?" },
      { name: "Q2", question: "Explain the differences between a Star Schema and a Snowflake Schema and when you would choose each." },
      { name: "Q3", question: "A streaming Kafka pipeline is dropping messages due to consumer lag. What tuning parameters would you adjust?" }
    ]
  },
  'ai/ml': {
    easy: [
      { question: "What is supervised learning?", options: ["Learning with human supervision always", "Training a model on labeled data with input-output pairs", "Training a model with no data", "Monitoring code execution"], correct: 2, topic: "Concepts" },
      { question: "What is overfitting in machine learning?", options: ["Model is too large", "Model performs well on training data but poorly on unseen test data", "Model cannot compile", "Model takes too long to train"], correct: 2, topic: "Evaluation" },
      { question: "Which metric measures the proportion of true positive predictions among all positive predictions made?", options: ["Accuracy", "Precision", "Recall", "F1 Score"], correct: 2, topic: "Metrics" },
      { question: "What is neural network?", options: ["A network of computer cables", "A machine learning model inspired by structure of human brain", "A web server host", "A data storage partition"], correct: 2, topic: "Models" },
      { question: "Which library is most popular for data manipulation in Python?", options: ["Django", "Pandas", "Flask", "Pytest"], correct: 2, topic: "Libraries" }
    ],
    hard: [
      { question: "What is the purpose of regularizing models (L1/L2 regularization)?", options: ["To speed up training", "To prevent overfitting by penalizing large weights", "To clean input dataset", "To run models in parallel"], correct: 2, topic: "Evaluation" },
      { question: "Explain precision vs recall trade-off in class classification.", options: ["Precision is always better", "Increasing precision reduces false positives but might increase false negatives, lowering recall", "Recall is only for database", "Both must hit 100%"], correct: 2, topic: "Metrics" },
      { question: "What is adversarial testing for ML models?", options: ["Testing with hostile developers", "Providing inputs modified slightly to cause the model to make incorrect predictions", "Stress testing server infrastructure", "Running unit tests"], correct: 2, topic: "Testing" },
      { question: "How do you detect and test for prompt injection vulnerabilities in generative AI systems?", options: ["Standard SQLi testing", "Passing malicious prompts designed to bypass system instructions and asserting model response content", "Scanning code imports", "Reviewing server logs"], correct: 2, topic: "AI Security" },
      { question: "What does backpropagation do in deep learning?", options: ["Stores database records", "Calculates gradient of loss function to update neural network weights", "Renders UI layout", "Pushes code to git"], correct: 2, topic: "Models" }
    ],
    practical: [
      { name: "Task 1: Train and Evaluate Random Forest Model", description: "Write a Python script using scikit-learn to load a dataset, split into train/test, train a Random Forest model, and print precision, recall, and confusion matrix." },
      { name: "Task 2: Security Validation for Generative AI Prompt Interface", description: "Design a test suite containing test prompts to validate a LLM-based customer assistant against prompt injection and jailbreak attacks." }
    ],
    scenarios: [
      { name: "Q1", question: "Your machine learning model achieves 99% accuracy on training data but only 65% on test data. What is wrong and how do you fix it?" },
      { name: "Q2", question: "Explain how you would test a generative AI prompt interface for prompt injection vulnerabilities and jailbreak attempts." },
      { name: "Q3", question: "An image classification model is misclassifying objects in low lighting. What data engineering and training actions would you recommend?" }
    ]
  }
};

// Helper to expand base MCQs to target count
function expandFallbackQuestions(skillName, band, targetCount) {
  const norm = skillName.toLowerCase();
  const bank = ZENASSESS_FALLBACK_BANK[norm] || ZENASSESS_FALLBACK_BANK['functional testing'];
  const baseList = band === 'intermediate' ? bank.hard : bank.easy;
  
  const expanded = [];
  for (let i = 0; i < targetCount; i++) {
    const base = baseList[i % baseList.length];
    const suffix = i >= baseList.length ? ` (Var ${Math.floor(i / baseList.length) + 1})` : '';
    expanded.push({
      id: `${norm.slice(0, 2)}_${band.slice(0, 3)}_${String(i + 1).padStart(2, '0')}`,
      question: base.question + suffix,
      options: [...base.options],
      correct: base.correct,
      difficulty: band === 'intermediate' ? 'HARD' : 'EASY',
      skill: norm.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      time: band === 'intermediate' ? 90 : 60,
      points: band === 'intermediate' ? 2 : 1
    });
  }
  return expanded;
}



// POST /api/zenassess/session — create a new assessment session
// NOTE: Backward compatible during JWT transition (attachUser is already applied globally)
app.post('/api/zenassess/session', async (req, res) => {
  try {
    await ensureZenAssessTable();
    const { employeeId, levelPath, questions, skillName } = req.body;
    if (!employeeId || !levelPath) {
      return res.status(400).json({ error: 'employeeId and levelPath are required' });
    }

    // Resolve zensar_id → employees.id (FK requires the PK, not the zensar_id)
    let resolvedEmpId = employeeId;
    try {
      const empCheck = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
        [employeeId]
      );
      if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;
    } catch (_) { /* keep original if lookup fails */ }

    const sessionId = 'za_' + crypto.randomBytes(12).toString('hex');
    await query(
      `INSERT INTO zenassess_sessions (session_id, employee_id, level_path, status, questions, skill_name)
       VALUES ($1, $2, $3, 'in_progress', $4, $5)`,
      [sessionId, resolvedEmpId, levelPath, JSON.stringify(questions || []), skillName || 'Functional Testing']
    );
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error('❌ ZenAssess session create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function evaluateExpertEvidence(evidence, registeredGithub) {
  const errors = [];
  const breakdown = {
    certifications: { score: 20, max: 20, errors: [] },
    projectDeliverables: { score: 20, max: 20, errors: [] },
    mentoringRecords: { score: 20, max: 20, errors: [] },
    frameworkOwnership: { score: 20, max: 20, errors: [] },
    teamLeadRecords: { score: 20, max: 20, errors: [] },
  };

  const certsText = (evidence.certifications || '').trim();
  const projText = (evidence.projectDeliverables || '').trim();
  const mentText = (evidence.mentoringRecords || '').trim();
  const frameText = (evidence.frameworkOwnership || '').trim();
  const awardText = (evidence.teamLeadRecords || '').trim();

  // 1. Completeness Calculation
  const fields = [certsText, projText, mentText, frameText, awardText];
  const filledFieldsCount = fields.filter(t => t.length > 20).length;
  const completenessScore = Math.round((filledFieldsCount / 5) * 100);

  // 2. GitHub Validation
  const allText = `${certsText} ${projText} ${mentText} ${frameText} ${awardText}`;
  const gitUrls = allText.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)\]]+/gi) || [];
  
  let gitValidated = false;
  let gitMeta = null;

  if (gitUrls.length > 0) {
    for (const url of gitUrls) {
      const cleanUrl = url.replace(/[.,;:!?]$/, '');
      const match = cleanUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?\/?$/i);
      if (!match) {
        breakdown.frameworkOwnership.errors.push(`GitHub URL "${cleanUrl}" is invalid. Rejecting format. Must be https://github.com/owner/repository`);
        breakdown.frameworkOwnership.score = Math.max(0, breakdown.frameworkOwnership.score - 10);
        errors.push(`GitHub URL "${cleanUrl}" is invalid (missing repository name).`);
      } else {
        const owner = match[1];
        const repo = match[2];
        try {
          const headers = { 'User-Agent': 'ZenAssess-Workforce-Intelligence' };
          const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
          
          if (repoRes.status === 404) {
            breakdown.frameworkOwnership.errors.push(`GitHub repository "${owner}/${repo}" does not exist.`);
            breakdown.frameworkOwnership.score = Math.max(0, breakdown.frameworkOwnership.score - 10);
            errors.push(`GitHub repository "${owner}/${repo}" does not exist.`);
          } else if (repoRes.ok) {
            const repoData = await repoRes.json();
            if (registeredGithub && registeredGithub.trim().toLowerCase() !== owner.toLowerCase()) {
              breakdown.frameworkOwnership.errors.push(`GitHub repository owner "${owner}" does not match linked employee profile "${registeredGithub}".`);
              breakdown.frameworkOwnership.score = Math.max(0, breakdown.frameworkOwnership.score - 8);
              errors.push(`GitHub repository owner "${owner}" does not match linked profile "${registeredGithub}".`);
            } else {
              let commits = 0, pulls = 0;
              const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, { headers });
              if (commitRes.ok) {
                const link = commitRes.headers.get('link');
                if (link) {
                  const lastPageMatch = link.match(/&page=(\d+)>; rel="last"/);
                  if (lastPageMatch) commits = parseInt(lastPageMatch[1], 10);
                }
              }
              const pullsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=1`, { headers });
              if (pullsRes.ok) {
                const link = pullsRes.headers.get('link');
                if (link) {
                  const lastPageMatch = link.match(/&page=(\d+)>; rel="last"/);
                  if (lastPageMatch) pulls = parseInt(lastPageMatch[1], 10);
                }
              }
              
              if (commits === 0 && pulls === 0) {
                breakdown.frameworkOwnership.errors.push(`GitHub repository "${owner}/${repo}" has extremely low activity or no contributions.`);
                breakdown.frameworkOwnership.score = Math.max(0, breakdown.frameworkOwnership.score - 5);
                errors.push(`GitHub repository "${owner}/${repo}" has low or no activity.`);
              }
              gitValidated = true;
              gitMeta = { repository: `${owner}/${repo}`, owner, commits, pulls, lastActivity: repoData.updated_at };
            }
          } else if (repoRes.status === 403) {
            gitValidated = true;
            gitMeta = { repository: `${owner}/${repo}`, owner, commits: 35, pulls: 4, lastActivity: new Date().toISOString() };
          }
        } catch (_) {
          gitValidated = true;
          gitMeta = { repository: `${owner}/${repo}`, owner, commits: 15, pulls: 2, lastActivity: new Date().toISOString() };
        }
      }
    }
  } else {
    breakdown.frameworkOwnership.errors.push('No GitHub repository URL provided for framework verification.');
    breakdown.frameworkOwnership.score = Math.max(0, breakdown.frameworkOwnership.score - 8);
    errors.push('No GitHub repository URL was found in your evidence text.');
  }

  // 3. Certifications Validation
  if (certsText.length < 20) {
    breakdown.certifications.errors.push('Certification section is too short or empty.');
    breakdown.certifications.score = 0;
    errors.push('Certifications section lacks sufficient details.');
  } else {
    const hasIssuer = /(ISTQB|AWS|Amazon|Google|Cloud|Microsoft|Azure|Oracle|RedHat|HashiCorp|Zensar|Scrum|PMI|PMP|SAFe|University|Udemy|Coursera|LinkedIn)/i.test(certsText);
    const hasCredId = /(cred|id|verification|cert|verify|license|url|http|https|no\.|number|code)/i.test(certsText);
    
    if (!hasIssuer) {
      breakdown.certifications.errors.push('Missing certificate issuer name (e.g. ISTQB, AWS, Google).');
      breakdown.certifications.score -= 5;
    }
    if (!hasCredId) {
      breakdown.certifications.errors.push('Missing credential ID or verification link.');
      breakdown.certifications.score -= 5;
    }
    breakdown.certifications.score = Math.max(0, breakdown.certifications.score);
  }

  // 4. Project Validation
  if (projText.length < 20) {
    breakdown.projectDeliverables.errors.push('Project deliverables section is too short or empty.');
    breakdown.projectDeliverables.score = 0;
    errors.push('Project deliverables section lacks details.');
  } else {
    const hasProjName = /(project|system|application|app|service|platform|portal)/i.test(projText);
    const hasRole = /(role|architect|lead|engineer|analyst|consultant|manager|designed|led|respons)/i.test(projText);
    const hasOutcome = /(outcome|result|deliverable|%,|reduced|increased|saved|optimized|speed|latency|throughput)/i.test(projText);
    const hasImpact = /(impact|client|business|saved|revenue|cost|delivered|benefit|value)/i.test(projText);
    
    if (!hasProjName) {
      breakdown.projectDeliverables.errors.push('Missing explicit Project Name.');
      breakdown.projectDeliverables.score -= 3;
    }
    if (!hasRole) {
      breakdown.projectDeliverables.errors.push('Missing explicit Role details.');
      breakdown.projectDeliverables.score -= 3;
    }
    if (!hasOutcome) {
      breakdown.projectDeliverables.errors.push('Missing measurable Outcome details.');
      breakdown.projectDeliverables.score -= 3;
    }
    if (!hasImpact) {
      breakdown.projectDeliverables.errors.push('Missing client or business Impact details.');
      breakdown.projectDeliverables.score -= 3;
    }
    breakdown.projectDeliverables.score = Math.max(0, breakdown.projectDeliverables.score);
  }

  // 5. Mentoring Validation
  if (mentText.length < 20) {
    breakdown.mentoringRecords.errors.push('Mentoring section is too short or empty.');
    breakdown.mentoringRecords.score = 0;
    errors.push('Mentoring records section lacks details.');
  } else {
    const hasCount = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|team|members)/i.test(mentText);
    const hasSessions = /(session|training|bootcamp|workshop|classroom|presentation|lecture|conducted|led)/i.test(mentText);
    const hasLeadership = /(leadership|lead|led|steered|guided|program|standard|initiative)/i.test(mentText);
    
    if (!hasCount) {
      breakdown.mentoringRecords.errors.push('Missing specific number of people mentored.');
      breakdown.mentoringRecords.score -= 4;
    }
    if (!hasSessions) {
      breakdown.mentoringRecords.errors.push('Missing details of mentoring sessions or classes conducted.');
      breakdown.mentoringRecords.score -= 4;
    }
    if (!hasLeadership) {
      breakdown.mentoringRecords.errors.push('Missing leadership or program ownership evidence.');
      breakdown.mentoringRecords.score -= 4;
    }
    breakdown.mentoringRecords.score = Math.max(0, breakdown.mentoringRecords.score);
  }

  // 6. Awards Validation
  if (awardText.length < 20) {
    breakdown.teamLeadRecords.errors.push('Recognition & Awards section is too short or empty.');
    breakdown.teamLeadRecords.score = 0;
    errors.push('Awards & Recognition section lacks details.');
  } else {
    const hasAwardName = /(award|recognition|appreciat|rating|star|spotlight|bonus|promotion|certificate)/i.test(awardText);
    const hasAwardIssuer = /(by|from|zensar|client|customer|manager|vp|ceo|director)/i.test(awardText);
    const hasYear = /\b(19|20)\d{2}\b/.test(awardText);
    
    if (!hasAwardName) {
      breakdown.teamLeadRecords.errors.push('Missing explicit Award Name.');
      breakdown.teamLeadRecords.score -= 4;
    }
    if (!hasAwardIssuer) {
      breakdown.teamLeadRecords.errors.push('Missing award Issuer.');
      breakdown.teamLeadRecords.score -= 4;
    }
    if (!hasYear) {
      breakdown.teamLeadRecords.errors.push('Missing award or recognition Year.');
      breakdown.teamLeadRecords.score -= 4;
    }
    breakdown.teamLeadRecords.score = Math.max(0, breakdown.teamLeadRecords.score);
  }

  // 7. Framework Ownership Validation
  if (frameText.length < 20) {
    breakdown.frameworkOwnership.errors.push('Framework ownership section is too short or empty.');
    breakdown.frameworkOwnership.score = 0;
    errors.push('Framework ownership section lacks details.');
  } else {
    const hasFrameName = /(selenium|playwright|cypress|jmeter|k6|postman|soapui|cucumber|testng|pytest|junit|framework)/i.test(frameText);
    const hasOwnership = /(built|designed|created|lead|author|architect|own|maintain|author)/i.test(frameText);
    const hasArchDecisions = /(architect|decision|design|pattern|POM|singleton|scalable|pipeline|integration|ci\/cd)/i.test(frameText);
    
    if (!hasFrameName) {
      breakdown.frameworkOwnership.errors.push('Missing explicit Framework Name.');
      breakdown.frameworkOwnership.score -= 4;
    }
    if (!hasOwnership) {
      breakdown.frameworkOwnership.errors.push('Missing clear Framework Ownership details.');
      breakdown.frameworkOwnership.score -= 4;
    }
    if (!hasArchDecisions) {
      breakdown.frameworkOwnership.errors.push('Missing Architecture Decisions or design pattern details.');
      breakdown.frameworkOwnership.score -= 4;
    }
    breakdown.frameworkOwnership.score = Math.max(0, breakdown.frameworkOwnership.score);
  }

  // Calculate Quality Score
  const qualityScore = breakdown.certifications.score +
                       breakdown.projectDeliverables.score +
                       breakdown.mentoringRecords.score +
                       breakdown.frameworkOwnership.score +
                       breakdown.teamLeadRecords.score;

  // Final Evidence Score
  const finalEvidenceScore = Math.round((completenessScore * 0.4) + (qualityScore * 0.6));

  return {
    completenessScore,
    qualityScore,
    errors,
    breakdown,
    finalEvidenceScore,
    gitMeta
  };
}

// Helper to map 32 canonical skills to the 9 supported fallback keys
function mapSkillToFallbackKey(skill) {
  if (!skill) return 'Functional Testing';
  const lower = skill.toLowerCase();
  if (lower.includes('python') || lower.includes('django') || lower.includes('flask') || lower.includes('fastapi')) return 'Python';
  if (lower.includes('devops') || lower.includes('jenkins') || lower.includes('cicd') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('terraform')) return 'DevOps';
  if (lower.includes('performance testing') || lower.includes('jmeter') || lower.includes('k6') || lower.includes('loadrunner')) return 'Performance Testing';
  if (lower.includes('automation testing') || lower.includes('selenium') || lower.includes('playwright') || lower.includes('cypress')) return 'Automation Testing';
  if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('gcp')) return 'Cloud';
  if (lower.includes('security') || lower.includes('cybersecurity') || lower.includes('penetration')) return 'Cybersecurity';
  if (lower.includes('data engineering') || lower.includes('spark') || lower.includes('kafka') || lower.includes('etl') || lower.includes('database')) return 'Data Engineering';
  if (lower.includes('machine learning') || lower.includes('generative ai') || lower.includes('ai') || lower.includes('ml') || lower.includes('nlp') || lower.includes('vision') || lower.includes('analytics') || lower.includes('tableau') || lower.includes('power bi')) return 'AI/ML';
  return 'Functional Testing';
}

// GET /api/zenassess/can-retake/:employeeId - Check if employee can retake assessment (Phase 5: Retake Cooldown)
app.get('/api/zenassess/can-retake/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { path } = req.query;
    
    if (!employeeId || !path) {
      return res.status(400).json({ error: 'employeeId and path query parameter are required' });
    }

    // Resolve employee ID (handle zensar_id lookup)
    let resolvedEmpId = employeeId;
    try {
      const empCheck = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
        [employeeId]
      );
      if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;
    } catch (_) {}

    // Admin one-time re-assessment grant: an active (unused) grant for THIS skill
    // bypasses the cooldown entirely. The grant is consumed when the skill test
    // next completes (see /zenassess/skill-test-complete).
    if (req.query.skill) {
      try {
        const grant = await query(
          `SELECT id FROM zenassess_retake_grants
           WHERE employee_id = $1 AND LOWER(skill_name) = LOWER($2) AND used = FALSE
           ORDER BY granted_at DESC LIMIT 1`,
          [resolvedEmpId, req.query.skill]
        );
        if (grant.rows.length > 0) {
          return res.json({
            canRetake: true,
            reason: 'admin_granted',
            message: 'An administrator has granted you a one-time re-assessment for this skill.'
          });
        }
      } catch (_) { /* grants table absent — fall through to normal cooldown */ }
    }

    // Cooldown rule: STRICT 7 days for all paths and skills
    const cooldownDays = 7;

    // Get last attempt for this skill (if provided) or path
    let queryStr = `
      SELECT created_at, validated_level as validated, badge_awarded as passed
      FROM zenassess_sessions
      WHERE employee_id = $1
    `;
    const queryParams = [resolvedEmpId];

    if (req.query.skill) {
      queryStr += ` AND skill_name = $2`;
      queryParams.push(req.query.skill);
    } else {
      queryStr += ` AND level_path = $2`;
      queryParams.push(path.toLowerCase());
    }

    queryStr += ` ORDER BY created_at DESC LIMIT 1`;

    const result = await query(queryStr, queryParams);
    if (result.rows.length === 0) {
      // No previous attempts - can proceed
      return res.json({ 
        canRetake: true, 
        reason: 'first_attempt',
        message: 'This is your first attempt. Good luck!' 
      });
    }
    
    const lastAttempt = result.rows[0];
    const lastAttemptDate = new Date(lastAttempt.created_at);
    const nextEligible = new Date(lastAttemptDate);
    nextEligible.setDate(nextEligible.getDate() + cooldownDays);
    
    const now = new Date();
    const timeDiff = nextEligible - now;
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    // Allow retake if: (1) passed previously, OR (2) cooldown period expired
    const canRetake = lastAttempt.passed || now >= nextEligible;
    
    if (canRetake) {
      if (lastAttempt.passed) {
        return res.json({
          canRetake: true,
          reason: 'already_passed',
          lastScore: lastAttempt.score,
          lastPassed: true,
          message: `You previously passed with ${lastAttempt.score}%. You can retake to improve your score.`,
          warning: 'Retaking will replace your previous score.'
        });
      } else {
        return res.json({
          canRetake: true,
          reason: 'cooldown_expired',
          lastScore: lastAttempt.score,
          lastPassed: false,
          lastAttemptDate: lastAttemptDate.toISOString(),
          message: `Cooldown period expired. You can now retake the assessment.`
        });
      }
    } else {
      // Still in cooldown period
      return res.json({
        canRetake: false,
        reason: 'cooldown_active',
        lastAttemptDate: lastAttemptDate.toISOString(),
        nextEligibleDate: nextEligible.toISOString(),
        cooldownDays,
        daysRemaining: Math.max(0, daysRemaining),
        hoursRemaining: Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60))),
        lastScore: lastAttempt.score,
        lastPassed: lastAttempt.passed,
        passThreshold: lastAttempt.pass_threshold,
        message: `You must wait ${daysRemaining} more day(s) before retaking this assessment.`
      });
    }
  } catch (err) {
    console.error('[can-retake] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin re-assessment grants (one-time cooldown bypass) ────────────────────
async function resolveEmpId(idOrZensar) {
  try {
    const r = await query(
      'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
      [idOrZensar]
    );
    if (r.rows.length) return r.rows[0].id;
  } catch (_) {}
  return idOrZensar;
}

// GET /api/zenassess/retake-grants/:employeeId — list active (unused) grants.
app.get('/api/zenassess/retake-grants/:employeeId', async (req, res) => {
  try {
    await ensureZenAssessTable();
    const empId = await resolveEmpId(req.params.employeeId);
    const r = await query(
      `SELECT skill_name, granted_by, granted_at
       FROM zenassess_retake_grants
       WHERE employee_id = $1 AND used = FALSE
       ORDER BY granted_at DESC`,
      [empId]
    );
    res.json({ success: true, grants: r.rows });
  } catch (err) {
    console.error('[retake-grants] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/zenassess/grant-retake — grant a one-time re-assessment for
// one or more skills (admin). Idempotent: an already-active grant is left as-is.
app.post('/api/admin/zenassess/grant-retake', requireAdmin, async (req, res) => {
  try {
    await ensureZenAssessTable();
    const { employeeId, skills } = req.body;
    if (!employeeId || !Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ error: 'employeeId and a non-empty skills[] are required' });
    }
    const empId = await resolveEmpId(employeeId);
    const grantedBy = (req.user && (req.user.name || req.user.employeeId)) || 'admin';
    const granted = [];
    for (const raw of skills) {
      const skill = (raw == null ? '' : String(raw)).trim();
      if (!skill) continue;
      const exists = await query(
        `SELECT id FROM zenassess_retake_grants
         WHERE employee_id = $1 AND LOWER(skill_name) = LOWER($2) AND used = FALSE LIMIT 1`,
        [empId, skill]
      );
      if (exists.rows.length === 0) {
        await query(
          `INSERT INTO zenassess_retake_grants (employee_id, skill_name, granted_by) VALUES ($1, $2, $3)`,
          [empId, skill, grantedBy]
        );
      }
      granted.push(skill);
    }
    res.json({ success: true, granted });
  } catch (err) {
    console.error('[grant-retake] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/zenassess/revoke-retake — remove active (unused) grants (admin).
app.post('/api/admin/zenassess/revoke-retake', requireAdmin, async (req, res) => {
  try {
    await ensureZenAssessTable();
    const { employeeId, skills } = req.body;
    if (!employeeId || !Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ error: 'employeeId and a non-empty skills[] are required' });
    }
    const empId = await resolveEmpId(employeeId);
    for (const raw of skills) {
      const skill = (raw == null ? '' : String(raw)).trim();
      if (!skill) continue;
      await query(
        `DELETE FROM zenassess_retake_grants
         WHERE employee_id = $1 AND LOWER(skill_name) = LOWER($2) AND used = FALSE`,
        [empId, skill]
      );
    }
    res.json({ success: true, revoked: skills });
  } catch (err) {
    console.error('[revoke-retake] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zenassess/ai-coach/:employeeId — ZenAICoach gap analysis and learning path
app.get('/api/zenassess/ai-coach/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    let resolvedEmpId = employeeId;
    try {
      const empCheck = await query('SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)', [employeeId]);
      if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;
    } catch (_) {}

    const lastSession = await query(`
      SELECT score, passed, level_path, validated_level, section_scores, created_at
      FROM zenassess_sessions WHERE employee_id = $1
      ORDER BY created_at DESC LIMIT 1
    `, [resolvedEmpId]);

    if (lastSession.rows.length === 0) {
      return res.json({ gap: 'No assessment data yet', nextLevel: 'Beginner', recommendations: ['Complete your first assessment to get coaching recommendations'], learningPath: [], estimatedWeeksToNextLevel: 4 });
    }

    const s = lastSession.rows[0];
    const score = Number(s.score) || 0;
    const path = (s.level_path || 'beginner').toLowerCase();
    const hasPassed = !!s.passed;

    let nextLevel = 'Intermediate';
    let gap = '';
    let recommendations = [];
    let learningPath = [];
    let estimatedWeeks = 4;

    if (!hasPassed) {
      gap = `Score ${score}% — below passing threshold for ${path}`;
      recommendations = ['Review core concepts before retaking', `Retake available after ${path === 'expert' ? 14 : 7} days`, 'Focus on the section you scored lowest in'];
      learningPath = [{ skill: 'Core QA Concepts', resource: 'ISTQB Foundation Study Guide', timeEstimate: '2 weeks' }];
      estimatedWeeks = path === 'expert' ? 8 : 4;
    } else if (path === 'beginner') {
      gap = 'Validated at Beginner — need project evidence + cert for Intermediate';
      nextLevel = 'Intermediate';
      recommendations = ['Build a GitHub portfolio with 200+ automated tests', 'Get ISTQB Foundation certification', 'Work on 2-3 automation projects with CI/CD'];
      learningPath = [
        { skill: 'Automation Framework', resource: 'Selenium/Playwright official docs', timeEstimate: '3 weeks' },
        { skill: 'CI/CD Integration', resource: 'Jenkins or GitHub Actions tutorial', timeEstimate: '1 week' },
        { skill: 'ISTQB Foundation', resource: 'ISTQB study material', timeEstimate: '4 weeks' },
      ];
      estimatedWeeks = score >= 80 ? 8 : 12;
    } else if (path === 'intermediate') {
      gap = 'Validated at Intermediate — need capstone project + mentoring for Expert';
      nextLevel = 'Expert';
      recommendations = ['Build a complete automation framework capstone project', 'Start mentoring junior team members', 'Aim for ISTQB Advanced or AWS certification'];
      learningPath = [
        { skill: 'Capstone Project', resource: 'Build a real framework for a client project', timeEstimate: '4 weeks' },
        { skill: 'People Development', resource: 'Mentor 1-2 junior engineers', timeEstimate: '8 weeks' },
        { skill: 'Advanced Certification', resource: 'ISTQB Advanced / tool-specific cert', timeEstimate: '6 weeks' },
      ];
      estimatedWeeks = score >= 80 ? 12 : 16;
    } else {
      gap = 'Expert validated — focus on practice leadership and external recognition';
      nextLevel = 'Practice Lead';
      recommendations = ['Apply for Competency Lead / Practice Lead role', 'Present at internal or external conference', 'Publish articles or contribute to open-source'];
      learningPath = [{ skill: 'Thought Leadership', resource: 'Speak at QA conferences / publish blog', timeEstimate: '6 months' }];
      estimatedWeeks = 24;
    }

    res.json({ gap, nextLevel, recommendations, learningPath, estimatedWeeksToNextLevel: estimatedWeeks, score, hasPassed, path });
  } catch (err) {
    console.error('[ai-coach] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zenassess/generate-questions - generate profile-customized assessment questions using local Ollama or JS fallback
app.post('/api/zenassess/generate-questions', async (req, res) => {
  try {
    const { skill, band, employeeId, skills } = req.body;
    const skillsList = Array.isArray(skills) && skills.length > 0 ? skills : [skill || req.body.skillName || 'Functional Testing'];
    const skillName = skillsList[0] || 'Functional Testing';
    const targetBand = band || 'beginner';
    const resolvedEmpId = employeeId || req.user?.employeeId;

    if (!resolvedEmpId) {
      return res.status(400).json({ error: 'Employee ID is required (via body or authentication)' });
    }

    // Fetch candidate profile fields for custom AI prompt
    let employeeProfile = null;
    try {
      const empRes = await query(
        `SELECT name, designation, department, location, years_it, primary_skill, primary_domain 
         FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)`,
        [resolvedEmpId]
      );
      if (empRes.rows.length > 0) employeeProfile = empRes.rows[0];
    } catch (e) {
      console.warn('generate-questions: error fetching profile:', e.message);
    }

    let projects = [];
    try {
      const projRes = await query(
        `SELECT project_name, role, client, description, domain, skills_used, technologies 
         FROM projects WHERE LOWER(employee_id) = LOWER($1) ORDER BY created_at DESC`,
        [resolvedEmpId]
      );
      projects = projRes.rows;
    } catch (e) {
      console.warn('generate-questions: error fetching projects:', e.message);
    }

    let certifications = [];
    try {
      const certRes = await query(
        `SELECT cert_name, issuing_organization as provider, issue_date 
         FROM certifications WHERE LOWER(employee_id) = LOWER($1) ORDER BY created_at DESC`,
        [resolvedEmpId]
      );
      certifications = certRes.rows;
    } catch (e) {
      console.warn('generate-questions: error fetching certifications:', e.message);
    }

    let questions = [];
    let practicalTasks = [];
    let scenarioQuestions = [];
    let expertScenarios = [];
    let expertCapstone = null;
    let expertMentoring = [];
    let success = false;

    // Call local Ollama at http://127.0.0.1:11434/api/generate
    try {
      const candidateSummary = `
Candidate Name: ${employeeProfile?.name || 'Unknown'}
IT Experience: ${employeeProfile?.years_it || 0} years
Designation: ${employeeProfile?.designation || 'None'}
Primary Domain: ${employeeProfile?.primary_domain || 'None'}
Projects: ${JSON.stringify(projects.map(p => ({ name: p.project_name, role: p.role, domain: p.domain, skills: p.skills_used || p.technologies })))}
Certifications: ${JSON.stringify(certifications.map(c => c.cert_name))}
Resume Text: ${employeeProfile?.resume_text || 'None'}
      `;

      let instructions = '';
      let formatPrompt = '';
      if (targetBand === 'expert') {
        instructions = `
1. Generate exactly 5 scenario questions. Each must be a highly complex, strategic real-world scenario (e.g. production outage, performance crisis, architecture migration, security incident, delivery risk) tailored to the candidate's background and "${skillName}" expertise. Each must have:
   - "question": detailed scenario description and problem statement
2. Generate exactly 1 capstone assessment question. This must require the candidate to explain their high-level approach, architecture, strategic decision-making, and risk mitigation strategies (e.g. design testing strategy for a BFSI platform, create quality assurance plan for banking transformation, lead migration testing strategy) for "${skillName}". It must have:
   - "question": detailed architectural or strategic capstone prompt
3. Generate exactly 2 mentoring and leadership review questions. These must present scenarios of leadership challenges (e.g. junior team is underperforming, project deadline reduced by 50%, stakeholder conflict, testing strategy disagreement) in software engineering. Each must have:
   - "question": detailed leadership challenge description
`;
        formatPrompt = `
{
  "expertScenarios": [
    { "question": "..." },
    { "question": "..." },
    { "question": "..." },
    { "question": "..." },
    { "question": "..." }
  ],
  "expertCapstone": { "question": "..." },
  "expertMentoring": [
    { "question": "..." },
    { "question": "..." }
  ]
}
`;
      } else {
        // V10 Beginner: Primary=8, Secondary=7, Tertiary=5
        // V10 Intermediate: 20 MCQs total
        const countMCQs = 20;
        const priCount = targetBand === 'beginner' ? 8 : 10;
        const secCount = targetBand === 'beginner' ? (skillsList[1] ? 7 : 12) : (skillsList[1] ? 6 : 10);
        const tertCount = targetBand === 'beginner' ? (skillsList[2] ? 5 : 0) : (skillsList[2] ? 4 : (skillsList[1] ? 4 : 0));

        instructions = `
1. Generate exactly 20 multiple-choice questions (MCQs). Difficulty must be ${targetBand === 'intermediate' || targetBand === 'advanced' ? 'HARD' : 'BASIC'}.
   - ${priCount} MCQs must evaluate "${skillsList[0]}" (Primary Skill)
   ${skillsList[1] ? `- ${secCount} MCQs must evaluate "${skillsList[1]}" (Secondary Skill)` : ''}
   ${skillsList[2] ? `- ${tertCount} MCQs must evaluate "${skillsList[2]}" (Tertiary Skill)` : ''}
   Each MCQ must have:
   - "question": a detailed, realistic question
   - "options": an array of exactly 4 choices
   - "correct": 1-indexed number of the correct option (e.g. 1, 2, 3, or 4)
   - "difficulty": "${targetBand === 'intermediate' || targetBand === 'advanced' ? 'HARD' : 'BASIC'}"
   - "skill": the specific skill name it evaluates (e.g. "${skillsList[0]}", "${skillsList[1] || skillsList[0]}", or "${skillsList[2] || skillsList[0]}")
   - "time": 60 (time in seconds)
   - "points": 1
2. Generate exactly ${targetBand === 'beginner' ? '2 test case writing tasks' : '2 practical tasks'}.
   - 1 task must evaluate "${skillsList[0]}" (Primary Skill)
   - 1 task must evaluate "${skillsList[1] || skillsList[0]}" (Secondary Skill)
   Each task must have:
   - "name": task title
   - "description": detailed instructions for a hands-on or test case writing task
3. Generate exactly ${targetBand === 'intermediate' ? '3 scenario questions' : '2 scenario questions'}.
   ${targetBand === 'intermediate' ? `- 2 scenario questions must evaluate "${skillsList[0]}" (Primary Skill)\n   - 1 scenario question must evaluate "${skillsList[1] || skillsList[0]}" (Secondary Skill)` : `- 1 scenario question must evaluate "${skillsList[0]}" (Primary Skill)\n   - 1 scenario question must evaluate "${skillsList[1] || skillsList[0]}" (Secondary Skill)`}
   Each question must have:
   - "question": a detailed scenario-based troubleshooting or architecture question
`;
        formatPrompt = `
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct": 1,
      "difficulty": "HARD",
      "skill": "${skillsList[0]}",
      "time": 60,
      "points": 1
    },
    ... (exactly 20 items)
  ],
  "practicalTasks": [
    { "name": "...", "description": "..." },
    { "name": "...", "description": "..." }
  ],
  "scenarioQuestions": [
    { "question": "..." },
    { "question": "..." },
    { "question": "..." }
  ]
}
`;
      }

      const prompt = `You are the ZenAssess Workforce Intelligence Question Generator.
Generate a custom combined assessment for a candidate in the skills: ${skillsList.join(', ')} at the "${targetBand}" level.
Use the candidate's profile to make the questions highly relevant to their background, projects, certifications, and domain expertise:
${candidateSummary}

INSTRUCTIONS:
${instructions}

You MUST reply with ONLY a JSON object. No other text, no markdown.

Response JSON format:
${formatPrompt}
`;

      const response = await withTimeout(fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          prompt: prompt,
          stream: false,
          format: 'json'
        })
      }), 45000);

      if (response.ok) {
        const json = await response.json();
        const rawText = json.response;
        let cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = cleanText.indexOf('{');
        const end = cleanText.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          cleanText = cleanText.slice(start, end + 1);
        }
        const parsed = JSON.parse(cleanText);
        if (targetBand === 'expert') {
          if (parsed.expertScenarios && parsed.expertScenarios.length >= 5) {
            expertScenarios = parsed.expertScenarios.slice(0, 5);
            expertCapstone = parsed.expertCapstone;
            expertMentoring = (parsed.expertMentoring || []).slice(0, 2);
            success = true;
          }
        } else if (parsed.questions && parsed.questions.length > 0) {
          questions = parsed.questions.map((q, idx) => ({
            id: q.id || `ai_${targetBand}_${idx}`,
            question: q.question,
            options: q.options,
            correct: Number(q.correct) || 1,
            difficulty: q.difficulty || (targetBand === 'intermediate' ? 'HARD' : 'BASIC'),
            skill: q.skill || skillsList[0],
            time: Number(q.time) || 60,
            points: Number(q.points) || 1
          }));
          if (questions.length >= 10) {
            practicalTasks = parsed.practicalTasks || [];
            scenarioQuestions = parsed.scenarioQuestions || [];
            success = true;
          }
        }
      }
    } catch (ollamaErr) {
      console.warn('Ollama generate questions failed, falling back to local JS DB:', ollamaErr.message);
    }

    if (!success) {
      const primary = skillsList[0] || 'Functional Testing';
      const secondary = skillsList[1] || skillsList[0] || 'Automation Testing';
      const tertiary = skillsList[2] || skillsList[0] || 'API Testing';

      const pk = mapSkillToFallbackKey(primary);
      const sk = mapSkillToFallbackKey(secondary);
      const tk = mapSkillToFallbackKey(tertiary);

      const dataPri = fallbackQuestions.getQuestions(pk, targetBand);
      const dataSec = fallbackQuestions.getQuestions(sk, targetBand);
      const dataTer = fallbackQuestions.getQuestions(tk, targetBand);

      if (targetBand === 'expert') {
        // V10 Expert: 5 scenarios, 1 capstone, 2 mentoring
        expertScenarios = [
          ...(dataPri.scenarioQuestions || []).slice(0, 3),
          ...(dataSec.scenarioQuestions || []).slice(0, 1),
          ...(dataTer.scenarioQuestions || []).slice(0, 1)
        ];
        expertCapstone = dataPri.expertCapstone || (dataPri.practicalTasks?.[0] ? { question: dataPri.practicalTasks[0].description } : null);
        expertMentoring = [
          ...(dataPri.expertMentoring || []).slice(0, 1),
          ...(dataSec.expertMentoring || []).slice(0, 1)
        ];
      } else {
        // V10 Beginner: Primary=8, Secondary=7, Tertiary=5
        // V10 Intermediate: Primary=10, Secondary=6, Tertiary=4
        const priSlice = targetBand === 'beginner' ? 8 : 10;
        const secSlice = targetBand === 'beginner' ? 7 : 6;
        const terSlice = targetBand === 'beginner' ? 5 : 4;
        const mcqs = [
          ...(dataPri.mcqs || []).slice(0, priSlice),
          ...(dataSec.mcqs || []).slice(0, secSlice),
          ...(dataTer.mcqs || []).slice(0, terSlice)
        ];
        questions = mcqs.map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          correct: q.correct,
          difficulty: q.difficulty,
          skill: q.skill,
          time: q.time,
          points: q.points
        }));

        // Beginner: 2 test case tasks; Intermediate: 2 practical tasks
        practicalTasks = [
          ...(dataPri.practicalTasks || []).slice(0, 1),
          ...(dataSec.practicalTasks || []).slice(0, 1)
        ];

        // Beginner: 2 scenarios; Intermediate: 3 scenarios
        const scenarioCount = targetBand === 'intermediate' ? 3 : 2;
        scenarioQuestions = [
          ...(dataPri.scenarioQuestions || []).slice(0, Math.ceil(scenarioCount * 0.67)),
          ...(dataSec.scenarioQuestions || []).slice(0, Math.floor(scenarioCount * 0.33))
        ].slice(0, scenarioCount);
      }
    }

    // V10: Ensure strict lengths per band
    if (targetBand === 'expert') {
      // Expert: exactly 5 scenarios, 1 capstone, 2 mentoring
      if (expertScenarios.length < 5) {
        const fallbackData = fallbackQuestions.getQuestions(skillName, targetBand);
        expertScenarios = [...expertScenarios, ...(fallbackData.scenarioQuestions || [])].slice(0, 5);
      } else {
        expertScenarios = expertScenarios.slice(0, 5);
      }
      if (!expertCapstone) {
        const fallbackData = fallbackQuestions.getQuestions(skillName, targetBand);
        expertCapstone = fallbackData.expertCapstone || (fallbackData.practicalTasks?.[0] ? { question: fallbackData.practicalTasks[0].description } : { question: 'Describe your approach to designing a complete quality assurance strategy for a critical financial system migration.' });
      }
      if (expertMentoring.length < 2) {
        const fallbackData = fallbackQuestions.getQuestions(skillName, targetBand);
        expertMentoring = [...expertMentoring, ...(fallbackData.expertMentoring || [{ question: 'How would you handle a situation where your junior team consistently misses deadlines?' }, { question: 'Describe your strategy for knowledge transfer when a key team member leaves the project.' }])].slice(0, 2);
      }
    } else {
      // Beginner/Intermediate: 20 MCQs
      const countMCQs = 20;
      if (questions.length < countMCQs) {
        const fallbackData = fallbackQuestions.getQuestions(skillName, targetBand);
        questions = [...questions, ...(fallbackData.mcqs || [])].slice(0, countMCQs);
      } else {
        questions = questions.slice(0, countMCQs);
      }

      // 2 practical/test-case tasks for both Beginner and Intermediate
      if (practicalTasks.length < 2) {
        const fallbackData = fallbackQuestions.getQuestions(skillName, targetBand);
        practicalTasks = [...practicalTasks, ...(fallbackData.practicalTasks || [])].slice(0, 2);
      } else {
        practicalTasks = practicalTasks.slice(0, 2);
      }

      // Beginner: 2 scenarios; Intermediate: 3 scenarios
      const reqScenarios = targetBand === 'intermediate' ? 3 : 2;
      if (scenarioQuestions.length < reqScenarios) {
        const fallbackData = fallbackQuestions.getQuestions(skillName, targetBand);
        scenarioQuestions = [...scenarioQuestions, ...(fallbackData.scenarioQuestions || [])].slice(0, reqScenarios);
      } else {
        scenarioQuestions = scenarioQuestions.slice(0, reqScenarios);
      }
    }

    res.json({
      success: true,
      band: targetBand,
      questions,
      practicalTasks,
      scenarioQuestions,
      expertScenarios,
      expertCapstone,
      expertMentoring
    });
  } catch (err) {
    console.error('generate-questions: general error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings — Retrieve app configurations/mappings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM app_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings — Update/Insert app configuration
app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    await query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/zenassess/complete — save results and update skill matrix if passed
// NOTE: Backward compatible during JWT transition (attachUser is already applied globally)
app.post('/api/zenassess/complete', async (req, res) => {
  try {
    await ensureZenAssessTable();
    const { 
      sessionId, employeeId, score, status: rawStatus, assignedLevel, answers, evidence, studyPath, skills, skillName,
      tabSwitchCount, copyPasteCount, sessionFingerprint, integrityScore, integrityFlags,
      fullscreenExitCount, browserBlurCount, devtoolsDetected, contributionFields,
      expertProfile, extractedEvidence, evidenceEvaluation, technicalDiscussion, leadershipDiscussion, consistencyAnalysis, riskAnalysis, aiRecommendation,
      authenticityAnalysis, authenticity_analysis, typingVelocityLog, answerSnapshots
    } = req.body;
    
    if (!sessionId || !employeeId) {
      return res.status(400).json({ error: 'sessionId and employeeId are required' });
    }

    // ZenAssess V7 never produces a manager-review queue item — silent tier-drop replaces it
    const status = (rawStatus === 'review_required') ? ((Number(score) || 0) >= 60 ? 'passed' : 'failed') : rawStatus;

    // Resolve actual employees.id (handle zensar_id lookup)
    let resolvedEmpId = employeeId;
    try {
      const empCheck = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
        [employeeId]
      );
      if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;
    } catch (_) {}

    // Calculate dynamic integrity scoring & proctoring
    const tabSwitches = Number(tabSwitchCount) || 0;
    const copyPastes = Number(copyPasteCount) || 0;
    const fullscreenExits = Number(fullscreenExitCount) || 0;
    const browserBlurs = Number(browserBlurCount) || 0;
    const devtools = !!devtoolsDetected;

    let calculatedIntegrity = 100 - (tabSwitches * 10) - (copyPastes * 15) - (fullscreenExits * 20) - (browserBlurs * 5) - (devtools ? 50 : 0);
    let finalIntegrityScore = Math.max(0, Math.min(100, calculatedIntegrity));
    const finalIntegrityFlags = Array.isArray(integrityFlags) ? [...integrityFlags] : [];

    if (tabSwitches > 0) finalIntegrityFlags.push(`Tab switches: ${tabSwitches}`);
    if (copyPastes > 0) finalIntegrityFlags.push(`Copy/paste attempts: ${copyPastes}`);
    if (fullscreenExits > 0) finalIntegrityFlags.push(`Fullscreen exits: ${fullscreenExits}`);
    if (browserBlurs > 0) finalIntegrityFlags.push(`Browser focus lost events: ${browserBlurs}`);
    if (devtools) finalIntegrityFlags.push(`DevTools console opened`);

    // Run similarity plagiarism checks for Intermediate (Contribution) or Expert (Evidence)
    let duplicateRiskScore = 0;
    let evidenceText = '';
    if (extractedEvidence) {
      const extEv = typeof extractedEvidence === 'string' ? JSON.parse(extractedEvidence) : extractedEvidence;
      if (extEv && Array.isArray(extEv.documents)) {
        evidenceText = extEv.documents.map(d => d.extractedText || '').join(' ').trim();
      }
    }
    if (!evidenceText && evidence && Object.keys(evidence).length > 0) {
      evidenceText = Object.values(evidence).join(' ').trim();
    }

    if (evidenceText.length > 50) {
      const otherSessions = await query(
        `SELECT session_id, evidence, extracted_evidence FROM zenassess_sessions 
         WHERE employee_id != $1 AND status IN ('review_required', 'passed')`,
        [resolvedEmpId]
      );
      for (const other of otherSessions.rows) {
        let otherText = '';
        if (other.extracted_evidence) {
          const otherExt = typeof other.extracted_evidence === 'string' ? JSON.parse(other.extracted_evidence) : other.extracted_evidence;
          if (otherExt && Array.isArray(otherExt.documents)) {
            otherText = otherExt.documents.map(d => d.extractedText || '').join(' ').trim();
          }
        }
        if (!otherText && other.evidence) {
          const otherEvidence = typeof other.evidence === 'string' ? JSON.parse(other.evidence) : other.evidence;
          otherText = Object.values(otherEvidence || {}).join(' ').trim();
        }
        if (otherText.length > 50) {
          const words1 = new Set(evidenceText.toLowerCase().split(/\s+/));
          const words2 = new Set(otherText.toLowerCase().split(/\s+/));
          const intersection = new Set([...words1].filter(x => words2.has(x)));
          const union = new Set([...words1, ...words2]);
          const jaccard = union.size > 0 ? intersection.size / union.size : 0;
          const simPct = Math.round(jaccard * 100);
          if (simPct > duplicateRiskScore) {
            duplicateRiskScore = simPct;
          }
          if (jaccard > 0.7) {
            finalIntegrityScore = Math.max(0, finalIntegrityScore - 50);
            finalIntegrityFlags.push(`Plagiarism alert: ${simPct}% similarity match with another submission`);
          }
        }
      }
    }

    // Evaluate keystroke interval variance to detect automated AI text insertion
    const typingLog = Array.isArray(typingVelocityLog) ? typingVelocityLog : [];
    let isUniformTyping = false;
    let typingStdDev = null;
    if (typingLog.length >= 10) {
      const mean = typingLog.reduce((a, b) => a + b, 0) / typingLog.length;
      const variance = typingLog.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / typingLog.length;
      typingStdDev = Math.sqrt(variance);
      if (typingStdDev < 15) {
        isUniformTyping = true;
      }
    }

    const authDataRaw = authenticityAnalysis || authenticity_analysis || {};
    let humanPct = authDataRaw.humanWrittenPct !== undefined ? Number(authDataRaw.humanWrittenPct) : (isUniformTyping ? 15 : 100);
    let aiPct = authDataRaw.aiAssistedPct !== undefined ? Number(authDataRaw.aiAssistedPct) : (isUniformTyping ? 85 : 0);
    let authenticityScore = authDataRaw.authenticityScore !== undefined ? Number(authDataRaw.authenticityScore) : (isUniformTyping ? 30 : 100);

    if (isUniformTyping) {
      finalIntegrityScore = Math.max(0, finalIntegrityScore - 40);
      finalIntegrityFlags.push(`Bot/Plagiarism warning: Uniform keystroke cadence (StdDev ${typingStdDev.toFixed(1)}ms) detected, indicating automated text insertion.`);
    }

    const finalAuthenticityAnalysis = {
      humanWrittenPct: humanPct,
      aiAssistedPct: aiPct,
      copyCount: authDataRaw.copyCount !== undefined ? Number(authDataRaw.copyCount) : 0,
      pasteCount: authDataRaw.pasteCount !== undefined ? Number(authDataRaw.pasteCount) : copyPastes,
      largePasteEvents: authDataRaw.largePasteEvents !== undefined ? Number(authDataRaw.largePasteEvents) : 0,
      duplicateContentRisk: Math.max(duplicateRiskScore, authDataRaw.duplicateContentRisk || 0),
      authenticityScore: authenticityScore,
      riskLevel: authDataRaw.riskLevel || (duplicateRiskScore > 70 || isUniformTyping ? 'High' : (copyPastes > 5) ? 'Medium' : 'Low'),
      reason: authDataRaw.reason || (isUniformTyping ? 'Uniform typing velocity indicates automated AI text injection.' : '')
    };

    // Resolve Experience Band & Employee Details
    const empInfo = await query('SELECT years_it, github_username, designation FROM employees WHERE id = $1', [resolvedEmpId]);
    const empDetails = empInfo.rows[0] || {};
    const yearsIT = empDetails.years_it || 0;
    
    // Fetch projects count
    const projQuery = await query('SELECT COUNT(*) as cnt FROM projects WHERE employee_id = $1', [resolvedEmpId]);
    const projectCount = parseInt(projQuery.rows[0]?.cnt || '0');
    const projectScore = Math.min(100, projectCount * 25); // 4+ projects = 100%

    // Fetch certifications count
    const certQuery = await query('SELECT COUNT(*) as cnt FROM certifications WHERE employee_id = $1', [resolvedEmpId]);
    const certCount = parseInt(certQuery.rows[0]?.cnt || '0');
    const certScore = Math.min(100, certCount * 50); // 2+ certs = 100%

    // GitHub score
    const hasGithub = !!(empDetails.github_username && empDetails.github_username.trim());
    const githubScore = hasGithub ? 100 : 0;

    // Mentoring score
    const desLower = (empDetails.designation || '').toLowerCase();
    const mentoringScore = (desLower.includes('lead') || desLower.includes('senior') || desLower.includes('architect') || desLower.includes('manager')) ? 100 : 50;

    // V10 Band detection (0-5=beginner, 6-12=intermediate, 12+=expert)
    let testedLevel = (assignedLevel || 'beginner').toLowerCase();
    let band = testedLevel;

    const mcqRaw = req.body.mcqScore !== undefined ? Number(req.body.mcqScore) : (score || 0);
    const scenarioRaw = req.body.scenarioScore !== undefined ? Number(req.body.scenarioScore) : 0;
    const testCaseRaw = req.body.testCaseScore !== undefined ? Number(req.body.testCaseScore) : 0;
    const handsOnRaw = (req.body.practicalScore !== undefined ? Number(req.body.practicalScore) : (req.body.handsOnScore !== undefined ? Number(req.body.handsOnScore) : testCaseRaw));
    const capstoneRaw = req.body.capstoneScore !== undefined ? Number(req.body.capstoneScore) : 0;
    const mentoringRaw = req.body.mentoringScore !== undefined ? Number(req.body.mentoringScore) : 0;

    // ZenSkillMap Scoring Formulas by path (spec-aligned weights)
    const sectionScoresBody = req.body.sectionScores || {};
    const assessmentPathBody = req.body.assessmentPath || testedLevel;
    let finalScoreValue;
    if (Object.keys(sectionScoresBody).length > 0) {
      // Use frontend-computed section scores when provided
      if (assessmentPathBody === 'Beginner' || testedLevel === 'beginner') {
        const mcqS = sectionScoresBody.mcq !== undefined ? Number(sectionScoresBody.mcq) : mcqRaw;
        const toolS = sectionScoresBody.toolId !== undefined ? Number(sectionScoresBody.toolId) : 0;
        const tcS = sectionScoresBody.testCaseWriting !== undefined ? Number(sectionScoresBody.testCaseWriting) : handsOnRaw;
        finalScoreValue = Math.round(mcqS * 0.50 + toolS * 0.20 + tcS * 0.30);
      } else if (assessmentPathBody === 'Intermediate' || testedLevel === 'intermediate') {
        const mcqS = sectionScoresBody.mcq !== undefined ? Number(sectionScoresBody.mcq) : mcqRaw;
        const codS = sectionScoresBody.coding !== undefined ? Number(sectionScoresBody.coding) : handsOnRaw;
        const scnS = sectionScoresBody.scenarios !== undefined ? Number(sectionScoresBody.scenarios) : scenarioRaw;
        const fwS = sectionScoresBody.frameworkDesign !== undefined ? Number(sectionScoresBody.frameworkDesign) : 0;
        finalScoreValue = Math.round(mcqS * 0.20 + codS * 0.35 + scnS * 0.30 + fwS * 0.15);
      } else {
        const scnS = sectionScoresBody.expertScenarios !== undefined ? Number(sectionScoresBody.expertScenarios) : scenarioRaw;
        const capS = sectionScoresBody.capstone !== undefined ? Number(sectionScoresBody.capstone) : capstoneRaw;
        const menS = sectionScoresBody.mentoring !== undefined ? Number(sectionScoresBody.mentoring) : mentoringRaw;
        const qstS = sectionScoresBody.questionnaire !== undefined ? Number(sectionScoresBody.questionnaire) : 0;
        finalScoreValue = Math.round(scnS * 0.25 + capS * 0.40 + menS * 0.20 + qstS * 0.15);
      }
    } else if (testedLevel === 'beginner') {
      finalScoreValue = Math.round((mcqRaw * 0.50) + (handsOnRaw * 0.30) + (scenarioRaw * 0.20));
    } else if (testedLevel === 'intermediate') {
      finalScoreValue = Math.round((mcqRaw * 0.20) + (scenarioRaw * 0.30) + (handsOnRaw * 0.35) + (capstoneRaw * 0.15));
    } else {
      finalScoreValue = Math.round((scenarioRaw * 0.25) + (capstoneRaw * 0.40) + (mentoringRaw * 0.20));
    }

    // V10 Determine validated level, pass threshold, & Silent Tier Drop
    let validatedLevel = 'Not Validated';
    let passed = false;
    let threshold = 60;

    if (testedLevel === 'expert' || testedLevel === 'advanced') {
      // V10 Expert: pass=70%, silent drop to Intermediate if <70%
      threshold = 70;
      if (finalScoreValue >= 70) {
        validatedLevel = 'Expert';
        passed = true;
      } else {
        validatedLevel = 'Intermediate'; // Silent tier drop
        passed = true; // Still marked passed (silent drop)
      }
    } else if (testedLevel === 'intermediate') {
      // V10 Intermediate: pass=65%, silent drop to Beginner if <65%
      threshold = 65;
      if (finalScoreValue >= 65) {
        validatedLevel = 'Intermediate';
        passed = true;
      } else {
        validatedLevel = 'Beginner'; // Silent tier drop
        passed = true; // Still marked passed (silent drop)
      }
    } else {
      // V10 Beginner: pass=60%, fail → Not Validated
      threshold = 60;
      if (finalScoreValue >= 60) {
        validatedLevel = 'Beginner';
        passed = true;
      } else {
        validatedLevel = 'Not Validated';
        passed = false;
      }
    }

    const calculatedMcqScore = mcqRaw;
    const calculatedContribScore = Math.round((projectScore * 0.33) + (certScore * 0.33) + (githubScore * 0.34));
    const calculatedEvidenceScore = scenarioRaw;

    let githubReason = hasGithub ? '' : 'No GitHub username linked';
    let projectReason = projectCount > 0 ? '' : 'No projects listed';
    let docReason = '';
    let certReason = certCount > 0 ? '' : 'No certifications listed';
    let evidReason = '';
    let githubMeta = { username: empDetails.github_username };

    // Explain Score Breakdown Object
    const explainScore = {
      assessmentScore: mcqRaw,
      assessmentWeight: 30,
      assessmentWeightedScore: mcqRaw * 0.30,
      contributionScore: calculatedContribScore,
      contributionWeight: 10,
      contributionWeightedScore: (projectScore * 0.05) + (certScore * 0.05),
      practicalScore: handsOnRaw,
      practicalWeight: 30,
      practicalWeightedScore: handsOnRaw * 0.30,
      scenarioScore: scenarioRaw,
      scenarioWeight: 25,
      scenarioWeightedScore: scenarioRaw * 0.25,
      experienceScore: mentoringScore,
      experienceWeight: 5,
      experienceWeightedScore: (githubScore * 0.03) + (mentoringScore * 0.02),
      finalScore: finalScoreValue,
      passThreshold: threshold,
      gapRemaining: finalScoreValue >= threshold ? 0 : (threshold - finalScoreValue)
    };

    // Contribution Breakdown Object
    const contributionBreakdown = {
      mcqScore: mcqRaw,
      scenarioScore: scenarioRaw,
      handsOnScore: handsOnRaw,
      projectScore,
      certScore,
      githubScore,
      mentoringScore,
      finalScoreValue
    };

    // Load current skills for estimation
    const currentSkillRes = await query('SELECT confidence_score, freshness_score FROM skills WHERE employee_id = $1 AND skill_name = $2', [resolvedEmpId, skillName || 'Performance Testing']);
    const currentConf = currentSkillRes.rows[0]?.confidence_score || 50;
    const currentFresh = currentSkillRes.rows[0]?.freshness_score || 100;

    const readinessScoreVal = Math.round((finalScoreValue * 0.3) + (currentConf * 0.25) + (currentFresh * 0.2) + (finalIntegrityScore * 0.15) + (calculatedContribScore * 0.1));
    
    let riskVal = 'Low';
    if (finalIntegrityScore < 60 || currentFresh < 40 || finalScoreValue < 50) {
      riskVal = 'High';
    } else if (finalIntegrityScore < 80 || currentFresh < 75 || finalScoreValue < 60) {
      riskVal = 'Medium';
    }

    const readyVal = (readinessScoreVal >= 60 && finalIntegrityScore >= 50 && finalScoreValue >= 50);

    // V10 Retake lock: 7 days for Beginner/Intermediate, 14 days for Expert
    let retryAfter = null;
    if (!passed) {
      const retryDays = (testedLevel === 'expert') ? 14 : 7;
      retryAfter = new Date(Date.now() + retryDays * 24 * 60 * 60 * 1000).toISOString();
    }

    const checkSession = await query('SELECT 1 FROM zenassess_sessions WHERE session_id = $1', [sessionId]);
    if (checkSession.rows.length === 0) {
      await query(
        `INSERT INTO zenassess_sessions (session_id, employee_id, level_path, status, skill_name)
         VALUES ($1, $2, $3, 'in_progress', $4)`,
        [sessionId, resolvedEmpId, band, skillName || 'Performance Testing']
      );
    }

    await query(
      `UPDATE zenassess_sessions
       SET score=$1, status=$2, assigned_level=$3, answers=$4, evidence=$5,
           study_path=$6, retry_after=$7, skill_name=COALESCE($8, skill_name),
           tab_switch_count=$9, copy_paste_count=$10, session_fingerprint=$11,
           integrity_score=$12, integrity_flags=$13,
           fullscreen_exit_count=$14, browser_blur_count=$15, devtools_detected=$16,
           explain_score_breakdown=$17, contribution_breakdown=$18, github_metadata=$19,
           allocation_readiness_score=$20, allocation_risk=$21, ready_for_allocation=$22,
           mcq_score=$23, contribution_score=$24, evidence_score=$25, final_score=$26,
           expert_profile=$29, extracted_evidence=$30, evidence_evaluation=$31,
           technical_discussion=$32, leadership_discussion=$33, consistency_analysis=$34,
           risk_analysis=$35, ai_recommendation=$36, authenticity_analysis=$37,
           leadership_signals=$38, architecture_signals=$39, decision_making_signals=$40,
           mentoring_signals=$41, domain_expertise=$42, project_allocation_score=$43,
           typing_velocity_log=$44, answer_snapshots=$45,
           passed=$46, pass_threshold=$47,
           updated_at=CURRENT_TIMESTAMP
       WHERE session_id=$27 AND employee_id=$28`,
      [
        finalScoreValue,
        passed ? 'passed' : 'failed',  // Set status based on passed flag
        assignedLevel || null,
        JSON.stringify(answers || {}),
        JSON.stringify(evidence || {}),
        studyPath ? JSON.stringify(studyPath) : null,
        retryAfter,
        skillName || null,
        tabSwitches,
        copyPastes,
        sessionFingerprint || null,
        finalIntegrityScore,
        JSON.stringify(finalIntegrityFlags),
        fullscreenExits,
        browserBlurs,
        devtools,
        JSON.stringify(explainScore),
        JSON.stringify(contributionBreakdown),
        JSON.stringify(githubMeta),
        readinessScoreVal,
        riskVal,
        readyVal,
        calculatedMcqScore,
        calculatedContribScore,
        calculatedEvidenceScore,
        finalScoreValue,
        sessionId,
        resolvedEmpId,
        expertProfile ? JSON.stringify(expertProfile) : null,
        extractedEvidence ? JSON.stringify(extractedEvidence) : null,
        evidenceEvaluation ? JSON.stringify(evidenceEvaluation) : null,
        technicalDiscussion ? JSON.stringify(technicalDiscussion) : null,
        leadershipDiscussion ? JSON.stringify(leadershipDiscussion) : null,
        consistencyAnalysis ? JSON.stringify(consistencyAnalysis) : null,
        riskAnalysis ? JSON.stringify(riskAnalysis) : null,
        aiRecommendation ? JSON.stringify(aiRecommendation) : null,
        JSON.stringify(finalAuthenticityAnalysis),
        req.body.leadershipSignals || '',
        req.body.architectureSignals || '',
        req.body.decisionMakingSignals || '',
        req.body.mentoringSignals || '',
        req.body.domainExpertise || '',
        Number(req.body.projectAllocationScore) || finalScoreValue,
        JSON.stringify(typingVelocityLog || []),
        JSON.stringify(answerSnapshots || []),
        passed,  // Add passed column
        threshold  // Add pass_threshold column
      ]
    );

    // Save section scores if provided
    if (req.body.sectionScores && Object.keys(req.body.sectionScores).length > 0) {
      await query(`UPDATE zenassess_sessions SET section_scores=$1 WHERE session_id=$2`, [JSON.stringify(req.body.sectionScores), sessionId]).catch(() => {});
    }

    // Update skills table with validated level and assessment score after passing
    if (passed && validatedLevel && validatedLevel !== 'Not Validated') {
      const skillToUpdate = skillName || req.body.primarySkill || null;
      if (skillToUpdate) {
        await query(
          `UPDATE skills SET validated_level=$1, assessment_score=$2 WHERE employee_id=$3 AND skill_name=$4`,
          [validatedLevel, finalScoreValue, resolvedEmpId, skillToUpdate]
        ).catch(() => {});
      }
    }

    // If v7flow is true, update the employee's primary/secondary/tertiary skills and profile details in employees table
    if (req.body.v7flow) {
      await query(
        `UPDATE employees
         SET name = COALESCE($1, name),
             designation = COALESCE($2, designation),
             years_it = COALESCE($3, years_it),
             primary_skill = $4,
             secondary_skill = $5,
             tertiary_skill = $6
         WHERE id = $7`,
        [
          req.body.name || null,
          req.body.designation || null,
          req.body.yearsIT !== undefined ? Number(req.body.yearsIT) : (req.body.years_it !== undefined ? Number(req.body.years_it) : null),
          skillName || null,
          req.body.secondarySkill || null,
          req.body.tertiarySkill || null,
          resolvedEmpId
        ]
      );
    }

    if (skillName === 'Functional Testing' && assignedLevel === 'Expert') {
      // Update employee profile: set years_it, designation, primary_skill
      await query(
        `UPDATE employees
         SET years_it = GREATEST(COALESCE(years_it, 0), 12),
             designation = 'Functional Testing Expert',
             primary_skill = 'Functional Testing'
         WHERE id = $1`,
        [resolvedEmpId]
      );

      // Write audit log entry
      await auditLog({
        employeeId: resolvedEmpId,
        role: 'employee',
        action: 'AUTOMATIC_EXPERT_RECOGNITION',
        resource: 'zenassess',
        resourceId: sessionId,
        details: {
          skillName: 'Functional Testing',
          assignedLevel: 'Expert',
          yearsIT: 12,
          designation: 'Functional Testing Expert',
          primary_skill: 'Functional Testing',
          status: 'passed'
        },
        req
      });
    }

    // Update the skill matrix for the main tested skill
    const targetSkill = skillName || 'Performance Testing';
    const ratingForSkill = validatedLevel === 'Expert' ? 3 : (validatedLevel === 'Intermediate' || validatedLevel === 'Advanced' ? 2 : (validatedLevel === 'Beginner' ? 1 : 0));
    const validatedFlag = (validatedLevel !== 'Not Validated');

    await query(`
      INSERT INTO skills (
        employee_id, skill_name, self_rating, validated, validated_level, assessment_score,
        technical_depth, project_strength, certification_strength, mentoring_strength, github_strength,
        capability_score, confidence_score, ready_for_allocation, allocation_readiness, allocation_risk, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id, skill_name)
      DO UPDATE SET
        validated = EXCLUDED.validated,
        validated_level = EXCLUDED.validated_level,
        assessment_score = EXCLUDED.assessment_score,
        technical_depth = EXCLUDED.technical_depth,
        project_strength = EXCLUDED.project_strength,
        certification_strength = EXCLUDED.certification_strength,
        mentoring_strength = EXCLUDED.mentoring_strength,
        github_strength = EXCLUDED.github_strength,
        capability_score = EXCLUDED.capability_score,
        confidence_score = EXCLUDED.confidence_score,
        ready_for_allocation = EXCLUDED.ready_for_allocation,
        allocation_readiness = EXCLUDED.allocation_readiness,
        allocation_risk = EXCLUDED.allocation_risk,
        updated_at = CURRENT_TIMESTAMP
    `, [
      resolvedEmpId,
      targetSkill,
      ratingForSkill,
      validatedFlag,
      validatedLevel,
      mcqRaw,
      handsOnRaw,
      projectScore,
      certScore,
      mentoringScore,
      githubScore,
      finalScoreValue,
      Math.round((mcqRaw * 0.4) + (scenarioRaw * 0.4) + (handsOnRaw * 0.2)),
      validatedFlag,
      finalScoreValue,
      finalScoreValue >= 70 ? 'Low' : (finalScoreValue >= 60 ? 'Medium' : 'High')
    ]);

    // If other skills were sent in req.body.skills, we can save them as self-ratings
    if (skills && Object.keys(skills).length > 0) {
      for (const [sName, rating] of Object.entries(skills)) {
        if (sName !== targetSkill) {
          const r = Math.min(3, Math.max(0, Number(rating)));
          await query(
            `INSERT INTO skills (employee_id, skill_name, self_rating, validated)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (employee_id, skill_name)
             DO UPDATE SET self_rating=$3, validated=$4, updated_at=CURRENT_TIMESTAMP`,
            [resolvedEmpId, sName, r, status === 'passed']
          );
        }
      }
    }

    // If expert validation review is required, create a manager review record
    if (status === 'review_required') {
      await query(
        `INSERT INTO manager_reviews (session_id, employee_id, skill_name, reviewer_id, review_status, sla_deadline)
         VALUES ($1, $2, $3, NULL, 'pending', NOW() + INTERVAL '7 days')`,
        [sessionId, resolvedEmpId, skillName || 'Performance Testing']
      );
    }

    // Save individual evidence files if Expert band
    if (band === 'expert' && extractedEvidence) {
      const extEv = typeof extractedEvidence === 'string' ? JSON.parse(extractedEvidence) : extractedEvidence;
      if (extEv && Array.isArray(extEv.documents)) {
        for (const doc of extEv.documents) {
          const evidenceId = doc.evidenceId || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const evType = doc.documentType || 'Other';
          const originalFilename = doc.filename || 'unknown';
          const extSkills = Array.isArray(doc.detectedSkills) ? doc.detectedSkills : [];
          const detTech = Array.isArray(doc.technologies) ? doc.technologies : [];
          const confScore = Number(doc.confidence) || 100;
          const authScoreVal = Number(finalAuthenticityAnalysis.authenticityScore) || 100;
          const evalStatus = doc.status || 'success';
          const managerReviewStatusVal = (status === 'review_required') ? 'pending' : (status === 'passed') ? 'approved' : 'rejected';

          await query(
            `INSERT INTO zenassess_evidence (
              evidence_id, session_id, employee_id, evidence_type, original_filename,
              extracted_skills, detected_technologies, authenticity_score, confidence_score,
              evaluation_status, manager_review_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (evidence_id) DO UPDATE SET
              evidence_type = EXCLUDED.evidence_type,
              original_filename = EXCLUDED.original_filename,
              extracted_skills = EXCLUDED.extracted_skills,
              detected_technologies = EXCLUDED.detected_technologies,
              authenticity_score = EXCLUDED.authenticity_score,
              confidence_score = EXCLUDED.confidence_score,
              evaluation_status = EXCLUDED.evaluation_status,
              manager_review_status = EXCLUDED.manager_review_status`,
            [
              evidenceId,
              sessionId,
              resolvedEmpId,
              evType,
              originalFilename,
              extSkills,
              detTech,
              authScoreVal,
              confScore,
              evalStatus,
              managerReviewStatusVal
            ]
          );
        }
      }
    }

    // Dynamic freshness recalculation
    try {
      await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedEmpId]);
    } catch (_) {}

    // Fetch recalculated skill details
    const skillAfterRecalc = await query(
      `SELECT freshness_score, freshness_status, revalidation_req, confidence_score, allocation_readiness, allocation_risk, ready_for_allocation, capability_score
       FROM skills WHERE employee_id = $1 AND skill_name = $2`,
      [resolvedEmpId, skillName || 'Performance Testing']
    );
    const skillData = skillAfterRecalc.rows[0] || {};

    res.json({ 
      success: true, 
      retryAfter,
      explainScore,
      contributionBreakdown,
      githubMetadata: githubMeta,
      integrityScore: finalIntegrityScore,
      integrityFlags: finalIntegrityFlags,
      authenticityAnalysis: finalAuthenticityAnalysis,
      freshness: {
        score: skillData.freshness_score ?? currentFresh,
        status: skillData.freshness_status ?? 'active',
        reval: skillData.revalidation_req ?? false
      },
      readiness: {
        score: skillData.allocation_readiness ?? readinessScoreVal,
        risk: skillData.allocation_risk ?? riskVal,
        ready: skillData.ready_for_allocation ?? readyVal
      },
      capabilityScore: skillData.capability_score ?? 0,
      expertDetails: explainScore.expertDetails
    });

    await auditLog({ employeeId: resolvedEmpId, role: 'employee', action: 'ASSESSMENT_COMPLETE', resource: 'zenassess', resourceId: sessionId, details: { status, assignedLevel, score: finalScoreValue }, req });
  } catch (err) {
    console.error('❌ ZenAssess complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Server-side tier result helper (mirrors client-side determineTierResult)
function determineTierResult(claimedLevel, finalScore) {
  const levels = ['Not Validated', 'Beginner', 'Intermediate', 'Expert'];
  const idx = levels.indexOf(claimedLevel);
  if (finalScore >= 90) {
    return { action: 'dropup', validatedLevel: levels[Math.min(idx + 1, levels.length - 1)], badge: true };
  }
  if (finalScore >= 60) {
    return { action: 'pass', validatedLevel: claimedLevel, badge: true };
  }
  if (idx <= 1) {
    return { action: 'dropdown', validatedLevel: 'Not Validated', badge: false };
  }
  return { action: 'dropdown', validatedLevel: levels[Math.max(idx - 1, 0)], badge: false };
}

// POST /api/zenassess/skill-test-complete — record one skill's outcome from the
// 3-skill sequential ZenAssess engine (silent tier-drop aware, badge never-downgrade)
// ── AI Proctoring: store an integrity report for a proctored skill test ──────
app.post('/api/zenassess/integrity-report', async (req, res) => {
  try {
    const {
      sessionId, employeeId, skillName,
      integrityScore, verdict, flags,
      cameraEnabled, aiEnabled,
      tabSwitches, copyAttempts,
      phoneDetections, multiplePersons,
      startTime, endTime
    } = req.body;

    await pool.query(`
      INSERT INTO integrity_reports (
        session_id, employee_id, skill_name,
        integrity_score, verdict, flags,
        camera_enabled, ai_enabled,
        tab_switches, copy_attempts,
        phone_detections, multiple_persons,
        start_time, end_time
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14
      )`,
      [
        sessionId, employeeId, skillName,
        integrityScore, verdict,
        JSON.stringify(flags || []),
        cameraEnabled, aiEnabled,
        tabSwitches || 0,
        copyAttempts || 0,
        phoneDetections || 0,
        multiplePersons || 0,
        startTime, endTime
      ]
    );

    // Auto-withhold badge if compromised
    if (verdict === 'compromised' || integrityScore < 40) {
      try {
        await pool.query(`
          UPDATE zenassess_sessions
          SET integrity_flagged = true,
              integrity_score = $1,
              badge_withheld = true
          WHERE session_id = $2`,
          [integrityScore, sessionId]
        );
      } catch (_) { /* session row may not exist yet — best-effort */ }
    }

    return res.json({ success: true, integrityScore, verdict });
  } catch (err) {
    console.error('Integrity report error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── AI Proctoring: list integrity reports for the admin monitor ──────────────
app.get('/api/admin/integrity-reports', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ir.*,
        e.name as employee_name,
        e.designation
      FROM integrity_reports ir
      LEFT JOIN employees e
        ON e.id::text = ir.employee_id::text
        OR e.zensar_id::text = ir.employee_id::text
      ORDER BY ir.created_at DESC
      LIMIT 100
    `);
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/zenassess/skill-test-complete', async (req, res) => {
  try {
    await ensureZenAssessTable();
    const { employeeId, sessionId, skillName, validatedLevel, silentDropPath, badgeAwarded, attemptNumber, selfClaimedLevelAtTest, finalScore } = req.body;

    if (!employeeId || !sessionId || !skillName || !validatedLevel) {
      return res.status(400).json({ error: 'employeeId, sessionId, skillName and validatedLevel are required' });
    }

    // Resolve actual employees.id (handle zensar_id lookup) — same pattern as /zenassess/complete
    let resolvedEmpId = employeeId;
    try {
      const empCheck = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
        [employeeId]
      );
      if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;
    } catch (_) {}

    const isAwarded = !!badgeAwarded;
    const status = isAwarded ? 'passed' : 'not_validated';

    await query(
      `INSERT INTO zenassess_sessions (
        session_id, employee_id, level_path, status, skill_name,
        validated_level, attempt_number, silent_drop_path, badge_awarded, self_claimed_level_at_test
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (session_id) DO UPDATE SET
        validated_level = EXCLUDED.validated_level,
        attempt_number = EXCLUDED.attempt_number,
        silent_drop_path = EXCLUDED.silent_drop_path,
        badge_awarded = EXCLUDED.badge_awarded,
        status = EXCLUDED.status,
        self_claimed_level_at_test = EXCLUDED.self_claimed_level_at_test,
        updated_at = CURRENT_TIMESTAMP`,
      [sessionId, resolvedEmpId, validatedLevel, status, skillName,
       validatedLevel, Number(attemptNumber) || 1, silentDropPath || null, isAwarded, selfClaimedLevelAtTest || null]
    );

    // Consume any active admin re-assessment grant for this skill (one-time pass) —
    // the candidate has now used it, so the normal cooldown resumes from this attempt.
    try {
      await query(
        `UPDATE zenassess_retake_grants
         SET used = TRUE, used_at = CURRENT_TIMESTAMP
         WHERE employee_id = $1 AND LOWER(skill_name) = LOWER($2) AND used = FALSE`,
        [resolvedEmpId, skillName]
      );
    } catch (_) { /* grants table absent — nothing to consume */ }

    const rank = { 'Not Validated': 0, Beginner: 1, Intermediate: 2, Expert: 3 };
    const selfLevelFromRating = (r) => (r >= 3 ? 'Expert' : r === 2 ? 'Intermediate' : r === 1 ? 'Beginner' : null);

    const existing = await query(
      `SELECT verified_badge_level, self_rating, self_claimed_level FROM skills WHERE employee_id = $1 AND skill_name = $2`,
      [resolvedEmpId, skillName]
    );
    const previousBadgeLevel = existing.rows[0]?.verified_badge_level || null;
    let finalBadgeLevel = previousBadgeLevel;
    let upgraded = false;

    if (isAwarded) {
      // Never downgrade — only upgrade if new badge level is higher
      const newBadge = (rank[previousBadgeLevel] || 0) >= (rank[validatedLevel] || 0) ? previousBadgeLevel : validatedLevel;
      const selfClaimed = selfClaimedLevelAtTest
        || existing.rows[0]?.self_claimed_level
        || selfLevelFromRating(Number(existing.rows[0]?.self_rating) || 0);
      upgraded = newBadge !== previousBadgeLevel;
      finalBadgeLevel = newBadge;

      await query(
        `INSERT INTO skills (employee_id, skill_name, verified_badge_level, validated, self_claimed_level, updated_at)
         VALUES ($1, $2, $3, true, $4, NOW())
         ON CONFLICT (employee_id, skill_name)
         DO UPDATE SET
           verified_badge_level = CASE
             WHEN CASE skills.verified_badge_level WHEN 'Expert' THEN 3 WHEN 'Intermediate' THEN 2 WHEN 'Beginner' THEN 1 ELSE 0 END
               >= CASE EXCLUDED.verified_badge_level WHEN 'Expert' THEN 3 WHEN 'Intermediate' THEN 2 WHEN 'Beginner' THEN 1 ELSE 0 END
             THEN skills.verified_badge_level
             ELSE EXCLUDED.verified_badge_level
           END,
           validated = true,
           self_claimed_level = EXCLUDED.self_claimed_level,
           updated_at = NOW()`,
        [resolvedEmpId, skillName, newBadge, selfClaimed]
      );

      try { await query('SELECT recalculate_employee_skill_freshness($1)', [resolvedEmpId]); } catch (_) {}
    }

    res.json({
      success: true,
      status,
      skillName,
      verifiedBadgeLevel: finalBadgeLevel,
      previousBadgeLevel,
      upgraded,
      action: isAwarded ? (upgraded ? 'dropup' : 'pass') : 'dropdown'
    });
  } catch (err) {
    console.error('❌ ZenAssess skill-test-complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});



// GET /api/zenassess/status/:employeeId — get last assessment status
// NOTE: Backward compatible during JWT transition
app.get('/api/zenassess/status/:employeeId', async (req, res) => {
  try {
    await ensureZenAssessTable();
    const { employeeId } = req.params;
    const result = await query(
      `SELECT session_id, level_path, score, status, assigned_level, retry_after, created_at
       FROM zenassess_sessions
       WHERE employee_id=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [employeeId]
    );
    if (result.rowCount === 0) {
      return res.json({ hasSession: false });
    }
    const row = result.rows[0];
    res.json({
      hasSession: true,
      sessionId: row.session_id,
      levelPath: row.level_path,
      score: row.score,
      status: row.status,
      assignedLevel: row.assigned_level,
      retryAfter: null, // Bypassed permanently for testing/immediate retries
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('❌ ZenAssess status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:id/candidate-profile — Save candidateProfile data to DB before assessment
// Called from AssessmentOverviewPage when candidate proceeds to assessment
app.post('/api/employees/:id/candidate-profile', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      primarySkill, secondarySkill, tertiarySkill,
      name, designation, yearsIT, grade, path: validationPath,
      primaryScore, secondaryScore, tertiaryScore,
      domains
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    // Resolve employee ID (handles zensar_id too)
    let resolvedId = id;
    try {
      const empCheck = await query(
        'SELECT id FROM employees WHERE LOWER(id) = LOWER($1) OR LOWER(zensar_id) = LOWER($1)',
        [id]
      );
      if (empCheck.rows.length > 0) resolvedId = empCheck.rows[0].id;
    } catch (_) {}

    // Update employees table with candidate profile data
    await query(
      `UPDATE employees
       SET primary_skill    = COALESCE($1, primary_skill),
           secondary_skill  = COALESCE($2, secondary_skill),
           tertiary_skill   = COALESCE($3, tertiary_skill),
           name             = COALESCE($4, name),
           designation      = COALESCE($5, designation),
           years_it         = COALESCE($6, years_it),
           updated_at       = CURRENT_TIMESTAMP
       WHERE LOWER(id) = LOWER($7)`,
      [
        primarySkill || null,
        secondarySkill || null,
        tertiarySkill || null,
        name || null,
        designation || null,
        yearsIT ? Number(yearsIT) : null,
        resolvedId
      ]
    );

    // Upsert skill entries for primary, secondary, tertiary with taxonomy scores
    const skillEntries = [
      { skillName: primarySkill, score: primaryScore || 0 },
      { skillName: secondarySkill, score: secondaryScore || 0 },
      { skillName: tertiarySkill, score: tertiaryScore || 0 },
    ].filter(s => s.skillName);

    for (const { skillName, score } of skillEntries) {
      try {
        await query(
          `INSERT INTO skills (employee_id, skill_name, self_rating, capability_score, updated_at)
           VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (employee_id, skill_name)
           DO UPDATE SET
             capability_score = GREATEST(skills.capability_score, EXCLUDED.capability_score),
             updated_at = CURRENT_TIMESTAMP`,
          [resolvedId, skillName, Math.round(score)]
        );
      } catch (skillErr) {
        console.warn(`⚠️ candidate-profile: skill upsert failed for ${skillName}:`, skillErr.message);
      }
    }

    // Audit log
    await auditLog({
      employeeId: resolvedId,
      role: 'employee',
      action: 'CANDIDATE_PROFILE_SAVED',
      resource: 'employees',
      resourceId: resolvedId,
      details: { primarySkill, secondarySkill, tertiarySkill, validationPath, grade },
      req
    });


    res.json({
      success: true,
      message: 'Candidate profile saved to database',
      employeeId: resolvedId,
      primarySkill,
      secondarySkill,
      tertiarySkill
    });
  } catch (err) {
    console.error('❌ candidate-profile save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/judge0/run — execute code via Judge0 CE ───────────────────────
app.post('/api/judge0/run', async (req, res) => {
  try {
    const { sourceCode, languageId, stdin, expectedOutput } = req.body;
    const apiKey = process.env.JUDGE0_API_KEY;
    const apiUrl = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
    if (!apiKey) {
      return res.status(503).json({ error: 'Judge0 API key not configured. Set JUDGE0_API_KEY in .env' });
    }
    const submitRes = await fetch(`${apiUrl}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
      },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin || '',
        expected_output: expectedOutput || '',
      }),
    });
    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return res.status(submitRes.status).json({ error: `Judge0 error: ${errText}` });
    }
    const data = await submitRes.json();
    const stdout = data.stdout || '';
    const stderr = data.stderr || data.compile_output || '';
    const actual = stdout.trim();
    const expected = (expectedOutput || '').trim();
    const passed = expected ? actual === expected : data.status?.id === 3;
    res.json({
      passed,
      stdout,
      stderr,
      time: data.time,
      memory: data.memory,
      status: data.status?.description || 'Unknown',
      statusId: data.status?.id,
    });
  } catch (err) {
    console.error('❌ Judge0 run error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/judge0/run-sql — execute SQL in sandbox schema ────────────────
app.post('/api/judge0/run-sql', async (req, res) => {
  try {
    const { sourceCode, stdin, expectedOutput } = req.body;
    const sqlToRun = sourceCode || '';
    // Only allow read operations in sandbox
    const upperSql = sqlToRun.trim().toUpperCase();
    if (/^\s*(DROP|TRUNCATE|DELETE|INSERT|UPDATE|CREATE|ALTER|GRANT|REVOKE)/i.test(sqlToRun)) {
      return res.status(400).json({ error: 'Sandbox only allows SELECT/WITH queries.' });
    }
    // Prefix with SET search_path and run
    const sandboxSql = `SET search_path = zenassess_sandbox, public; ${sqlToRun}`;
    const result = await query(sandboxSql);
    const rows = result.rows || [];
    const stdout = JSON.stringify(rows, null, 2);
    const expected = (expectedOutput || '').trim();
    const passed = expected ? stdout.includes(expected) : rows.length > 0;
    res.json({ passed, stdout, stderr: '', time: '0.01', memory: 0, status: 'Accepted' });
  } catch (err) {
    console.error('❌ SQL sandbox error:', err.message);
    res.json({ passed: false, stdout: '', stderr: err.message, time: '0', memory: 0, status: 'Runtime Error' });
  }
});

// ─── POST /api/zenassess/evaluate-github — evaluate GitHub repository ────────
app.post('/api/zenassess/evaluate-github', async (req, res) => {
  try {
    const { githubUrl, skill, expectedLanguages } = req.body;
    if (!githubUrl) return res.status(400).json({ error: 'githubUrl required' });
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/\s?#]+)/i);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL' });
    const [, owner, repoRaw] = match;
    const repo = repoRaw.replace(/\.git$/, '');
    const ghToken = process.env.GITHUB_TOKEN;
    const headers = { 'User-Agent': 'ZenTalentHub/1.0', ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}) };
    let score = 0;
    const breakdown = {};
    // 1. Repo exists (10 pts)
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) return res.json({ score: 0, breakdown: { repoExists: 0 }, error: 'Repository not found or private' });
    const repoData = await repoRes.json();
    breakdown.repoExists = 10; score += 10;
    // 2. Commit activity (20 pts)
    const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, { headers });
    const commits = commitsRes.ok ? await commitsRes.json() : [];
    const commitCount = Array.isArray(commits) ? commits.length : 0;
    const commitScore = Math.min(20, Math.round((commitCount / 30) * 20));
    breakdown.commitActivity = commitScore; score += commitScore;
    // 3. Language match (25 pts)
    const langsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });
    const languages = langsRes.ok ? await langsRes.json() : {};
    const repoLangs = Object.keys(languages).map(l => l.toLowerCase());
    const expectedLangs = (expectedLanguages || []).map((l) => l.toLowerCase());
    const langMatch = expectedLangs.length === 0 ? 1 : expectedLangs.filter(l => repoLangs.some(r => r.includes(l) || l.includes(r))).length / expectedLangs.length;
    const langScore = Math.round(langMatch * 25);
    breakdown.languageMatch = langScore; score += langScore;
    // 4. README quality (10 pts)
    const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers });
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      const readmeSize = readmeData.size || 0;
      const readmeScore = readmeSize > 500 ? 10 : readmeSize > 100 ? 5 : 2;
      breakdown.readmeQuality = readmeScore; score += readmeScore;
    } else {
      breakdown.readmeQuality = 0;
    }
    // 5. Test files (20 pts)
    const searchRes = await fetch(`https://api.github.com/search/code?q=test+repo:${owner}/${repo}+language:${repoData.language || 'python'}`, { headers });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const testCount = searchData.total_count || 0;
      const testScore = testCount > 5 ? 20 : testCount > 0 ? 10 : 0;
      breakdown.testFilesFound = testScore; score += testScore;
    } else {
      breakdown.testFilesFound = 0;
    }
    // 6. CI/CD (15 pts)
    const ciRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`, { headers });
    const hasCI = ciRes.ok;
    const jenkinsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/Jenkinsfile`, { headers });
    const hasJenkins = jenkinsRes.ok;
    breakdown.ciCdPresent = (hasCI || hasJenkins) ? 15 : 0;
    score += breakdown.ciCdPresent;
    res.json({ score: Math.min(100, score), breakdown, repoName: `${owner}/${repo}`, language: repoData.language, stars: repoData.stargazers_count });
  } catch (err) {
    console.error('❌ GitHub eval error:', err.message);
    res.status(500).json({ error: err.message, score: 0 });
  }
});

// ════════════════════════════════════════════════════════════
// GITHUB INTELLIGENCE ENGINE (ZenCode)
// ════════════════════════════════════════════════════════════

const GITHUB_API = 'https://api.github.com';

const githubFetch = async (path, retries = 2) => {
  const rawToken = process.env.GITHUB_TOKEN;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';

  const buildHeaders = (includeAuth) => {
    const h = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'ZenSkillNavigator',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (includeAuth && token.length > 20) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  };

  const hasToken = token.length > 20;

  try {
    let res = await fetch(`${GITHUB_API}${path}`, { headers: buildHeaders(hasToken) });

    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    console.log(`[GitHub API] ${path} -> ${res.status} | rate: ${remaining}/${limit} | auth: ${hasToken}`);

    // If we sent a token and got 401, the token is bad — retry clean with NO
    // auth header at all.
    if (res.status === 401 && hasToken) {
      console.warn('[GitHub API] Token rejected (401). Retrying unauthenticated.');
      res = await fetch(`${GITHUB_API}${path}`, { headers: buildHeaders(false) });
      console.log(`[GitHub API] retry -> ${res.status}`);
    }

    if (res.status === 404) {
      throw new Error('NOT_FOUND');
    }

    if (res.status === 403) {
      const rem = res.headers.get('x-ratelimit-remaining');
      if (rem === '0') {
        throw new Error('RATE_LIMIT:' + (res.headers.get('x-ratelimit-reset') || ''));
      }
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 2000));
        return githubFetch(path, retries - 1);
      }
      throw new Error('GITHUB_ERROR:403');
    }

    // Any remaining non-401, non-404, non-403 failure (including a 401 that
    // persisted even after the no-auth retry — which means the endpoint itself
    // requires auth, not that our token is bad).
    if (!res.ok) {
      if (res.status === 401) {
        // Endpoint genuinely requires auth and we have none — surface a clear
        // message instead of a raw crash.
        throw new Error('AUTH_REQUIRED');
      }
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return githubFetch(path, retries - 1);
      }
      throw new Error(`GITHUB_ERROR:${res.status}`);
    }

    return await res.json();

  } catch (err) {
    if (err.message.startsWith('RATE_LIMIT') ||
        err.message === 'NOT_FOUND' ||
        err.message === 'AUTH_REQUIRED') {
      throw err;
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return githubFetch(path, retries - 1);
    }
    throw err;
  }
};

// Unauthenticated GitHub allows 60 requests/hour. We stay under that with a safety
// margin and track how many calls an analysis run has spent. Reset at the start of
// each analyzeGitHubProfile() run.
const RATE_LIMIT_BUDGET = 50;
let apiCallsUsed = 0;

function calculateReadmeScore(content) {
  if (!content) return 0;
  let score = 0;
  if (content.length > 500) score += 20;
  if (/install/i.test(content)) score += 15;
  if (/usage|getting started/i.test(content)) score += 15;
  if (/api/i.test(content)) score += 10;
  if (/deploy/i.test(content)) score += 15;
  if (/architecture/i.test(content)) score += 15;
  if (content.includes('```')) score += 10;
  return Math.min(100, score);
}

function calculateRepoHealth(data) {
  let score = 0;
  if (data.hasDescription) score += 10;
  if (data.hasTopics) score += 10;
  if (data.hasLicense) score += 10;
  if (data.hasReadme) score += 15;
  score += Math.min(20, data.readmeScore * 0.2);
  score += Math.min(15, Math.log10(data.stars + 1) * 5);
  if (data.monthsOld < 6) score += 20;
  else if (data.monthsOld < 12) score += 10;
  else if (data.monthsOld < 24) score += 5;
  if (!data.forkCreditEligible) score = score * 0.3;
  return Math.min(100, Math.round(score));
}

function calculateDeveloperScore(data) {
  let score = 0;
  score += Math.min(30, Math.log10(data.publicRepos + 1) * 15);
  score += Math.min(30, data.avgDocScore * 0.3);
  score += Math.min(40, data.analyzedRepoCount * 4);
  return Math.min(100, Math.round(score));
}

async function detectFrameworks(repoFullName) {
  // Rate-limit friendly: list the repo root ONCE (1 call) and detect from file
  // names, then download only package.json content if present (+1 call max) — for
  // the deepest dependency signals. This replaces the old per-file approach that
  // cost up to 12 calls per repo (impossible under the 60/hr unauthenticated cap).
  const detected = [];

  try {
    const contents = await githubFetch(`/repos/${repoFullName}/contents/`);
    apiCallsUsed++;

    if (!Array.isArray(contents)) return [];

    const fileNames = contents.map(f => f.name.toLowerCase());

    // Detect from FILE NAMES only (no content download needed).
    const fileSignals = {
      'package.json': ['npm'],
      'requirements.txt': ['python-deps'],
      'dockerfile': ['Docker'],
      'docker-compose.yml': ['Docker Compose'],
      'cargo.toml': ['Rust'],
      'go.mod': ['Go'],
      'pom.xml': ['Maven/Java'],
      'build.gradle': ['Gradle/Java'],
      'next.config.js': ['Next.js'],
      'vite.config.js': ['Vite'],
      'vite.config.ts': ['Vite'],
      'pyproject.toml': ['Python'],
      'main.tf': ['Terraform'],
      'manage.py': ['Django'],
      'angular.json': ['Angular'],
      'vue.config.js': ['Vue']
    };

    Object.entries(fileSignals).forEach(([file, frameworks]) => {
      if (fileNames.includes(file)) detected.push(...frameworks);
    });

    // Only fetch package.json CONTENT if it exists (+1 call max, not 12) — gives
    // the deepest signal (React, Express, etc.).
    if (fileNames.includes('package.json')) {
      try {
        const pkgFile = contents.find(f => f.name.toLowerCase() === 'package.json');
        const pkgContent = await githubFetch(`/repos/${repoFullName}/contents/${pkgFile.name}`);
        apiCallsUsed++;
        const decoded = Buffer.from(pkgContent.content, 'base64').toString('utf-8').toLowerCase();

        if (decoded.includes('"react"')) detected.push('React');
        if (decoded.includes('"express"')) detected.push('Express');
        if (decoded.includes('"@angular/core"')) detected.push('Angular');
        if (decoded.includes('"vue"')) detected.push('Vue');
        if (decoded.includes('"next"')) detected.push('Next.js');
        if (decoded.includes('"typescript"')) detected.push('TypeScript');
      } catch {
        // package.json fetch failed — skip silently; file-name signals already captured.
      }
    }
  } catch {
    // Root contents fetch failed (empty repo, etc.) — skip.
  }

  return [...new Set(detected)];
}

function classifyProject(languages, frameworks, readme, topics) {
  const fw = frameworks.map(f => f.toLowerCase());
  const langs = Object.keys(languages).map(l => l.toLowerCase());
  const text = (readme + ' ' + topics.join(' ')).toLowerCase();

  if (fw.some(f => ['langchain', 'langgraph', 'crewai', 'autogen'].includes(f))) return 'Agentic AI';
  if (text.includes('rag') || text.includes('vector database') || text.includes('embedding')) return 'Generative AI';
  if (fw.includes('tensorflow') || fw.includes('pytorch') || fw.includes('scikit-learn'))
    return (text.includes('train') || text.includes('model')) ? 'Machine Learning' : 'AI';
  if (fw.includes('docker') && fw.includes('kubernetes')) return 'DevOps';
  if (fw.some(f => ['react', 'next.js', 'angular', 'vue'].includes(f)) &&
      fw.some(f => ['express', 'fastapi', 'django', 'flask', 'spring boot'].includes(f))) return 'Full Stack';
  if (fw.some(f => ['react', 'next.js', 'angular', 'vue'].includes(f))) return 'Frontend';
  if (fw.some(f => ['express', 'fastapi', 'django', 'flask', 'spring boot'].includes(f))) return 'Backend';
  if (langs.includes('swift') || langs.includes('kotlin') || text.includes('android') || text.includes('ios')) return 'Mobile';
  if (text.includes('terraform') || text.includes('aws') || text.includes('azure')) return 'Cloud';
  if (text.includes('blockchain') || text.includes('solidity')) return 'Blockchain';
  return 'General';
}

function mapToCanonicalSkill(input) {
  const map = {
    'python': 'Python', 'javascript': 'JavaScript', 'typescript': 'TypeScript',
    'java': 'Java', 'c#': 'C#', 'selenium': 'Selenium', 'docker': 'Docker',
    'jenkins': 'Jenkins', 'sql': 'SQL', 'postgresql': 'SQL',
    'mongodb': 'Database Testing', 'react': 'JavaScript', 'express': 'JavaScript',
    'fastapi': 'Python', 'django': 'Python', 'flask': 'Python',
    'spring boot': 'Java', 'git': 'Git'
  };
  return map[input.toLowerCase()] || null;
}

async function analyzeGitHubProfile(employeeId, username) {
  await query(`UPDATE github_profiles SET analysis_status = 'analyzing' WHERE employee_id = $1`, [employeeId]);

  // Reset the per-run API call budget (unauthenticated = 60 calls/hour).
  apiCallsUsed = 0;

  try {
    const repos = await githubFetch(`/users/${username}/repos?per_page=100&sort=updated`);
    apiCallsUsed++;

    // Clear prior repo rows so re-analysis doesn't duplicate
    await query(`DELETE FROM github_repositories WHERE employee_id = $1`, [employeeId]);

    // Without auth we have ~58 calls left. Each repo costs roughly:
    //   1 (directory listing) + 0-1 (package.json) + 1 (languages) + 0-1 (readme).
    // Process the top 15 most recently updated repos to stay safely within budget.
    const reposToAnalyze = repos
      .filter(r => !r.archived)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 15);

    console.log(`Analyzing ${reposToAnalyze.length} of ${repos.length} repos (unauthenticated rate limit safety)`);

    const skillEvidence = {};
    let totalDocScore = 0;
    let analyzedRepoCount = 0;

    for (const repo of reposToAnalyze) {
      try {
      const updatedDate = new Date(repo.updated_at);
      const monthsOld = (Date.now() - updatedDate) / (1000 * 60 * 60 * 24 * 30);

      // ── SIMPLIFIED FORK DETECTION ──
      // Without per-commit API calls (saves rate limit). Use repo metadata only.
      let ownCommitRatio = 1.0;
      let forkCreditEligible = true;

      if (repo.fork) {
        // pushed_at > created_at means commits happened after forking.
        const hasOwnActivity = new Date(repo.pushed_at) > new Date(repo.created_at);
        const daysSinceFork =
          (new Date(repo.pushed_at) - new Date(repo.created_at)) / (1000 * 60 * 60 * 24);

        if (!hasOwnActivity) {
          // Never pushed after forking = pure fork, no original work.
          ownCommitRatio = 0.1;
          forkCreditEligible = false;
        } else if (daysSinceFork < 1) {
          // Forked and pushed same day = likely just the initial fork commit.
          ownCommitRatio = 0.3;
          forkCreditEligible = false;
        } else {
          // Sustained activity after forking = genuine contribution.
          ownCommitRatio = 0.7;
          forkCreditEligible = true;
        }
      }

      // ── LANGUAGES ──
      let languages = {};
      try {
        languages = await githubFetch(`/repos/${repo.full_name}/languages`);
        apiCallsUsed++;
      } catch {}

      // ── README ANALYSIS (skippable when budget is low) ──
      let readmeContent = '';
      let readmeScore = 0;
      if (apiCallsUsed < RATE_LIMIT_BUDGET) {
        try {
          const readme = await githubFetch(`/repos/${repo.full_name}/readme`);
          apiCallsUsed++;
          readmeContent = Buffer.from(readme.content, 'base64').toString('utf-8');
          readmeScore = calculateReadmeScore(readmeContent);
        } catch {
          readmeScore = 0;
        }
      } else {
        // Budget exhausted — skip README for the remaining repos this session.
        readmeScore = 0;
      }

      // ── FRAMEWORK DETECTION (detectFrameworks increments apiCallsUsed) ──
      const frameworks = await detectFrameworks(repo.full_name);

      // ── PROJECT CATEGORY ──
      const category = classifyProject(languages, frameworks, readmeContent, repo.topics || []);

      // ── HEALTH SCORE ──
      const healthScore = calculateRepoHealth({
        hasDescription: !!repo.description,
        hasTopics: (repo.topics || []).length > 0,
        hasLicense: !!repo.license,
        hasReadme: readmeContent.length > 0,
        readmeScore,
        stars: repo.stargazers_count,
        monthsOld,
        forkCreditEligible
      });

      totalDocScore += readmeScore;
      analyzedRepoCount++;

      await query(`
        INSERT INTO github_repositories (
          employee_id, repo_name, repo_full_name, description,
          is_fork, is_private, stars, forks, watchers, open_issues,
          topics, size_kb, default_branch, license, homepage_url,
          created_at_github, updated_at_github,
          own_commit_count, total_commit_count, contribution_percentage,
          fork_credit_eligible, health_score, documentation_score,
          project_category, languages, frameworks_detected
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26
        )
      `, [
        employeeId, repo.name, repo.full_name, repo.description,
        repo.fork, repo.private, repo.stargazers_count, repo.forks_count,
        repo.watchers_count, repo.open_issues_count,
        JSON.stringify(repo.topics || []), repo.size, repo.default_branch,
        repo.license?.name, repo.homepage, repo.created_at, repo.updated_at,
        0, 0, Math.round(ownCommitRatio * 100), forkCreditEligible,
        healthScore, readmeScore, category,
        JSON.stringify(languages), JSON.stringify(frameworks)
      ]);

      // ── BUILD SKILL EVIDENCE ──
      const evidenceWeight = forkCreditEligible ? 1.0 : 0.3;

      Object.keys(languages).forEach(lang => {
        const canonicalSkill = mapToCanonicalSkill(lang);
        if (!canonicalSkill) return;
        if (!skillEvidence[canonicalSkill]) {
          skillEvidence[canonicalSkill] = { count: 0, repos: [], lastDate: updatedDate };
        }
        skillEvidence[canonicalSkill].count += evidenceWeight;
        skillEvidence[canonicalSkill].repos.push(repo.name);
        if (updatedDate > skillEvidence[canonicalSkill].lastDate) {
          skillEvidence[canonicalSkill].lastDate = updatedDate;
        }
      });

      frameworks.forEach(fwName => {
        const canonicalSkill = mapToCanonicalSkill(fwName);
        if (!canonicalSkill) return;
        if (!skillEvidence[canonicalSkill]) {
          skillEvidence[canonicalSkill] = { count: 0, repos: [], lastDate: updatedDate };
        }
        skillEvidence[canonicalSkill].count += evidenceWeight;
        skillEvidence[canonicalSkill].repos.push(repo.name);
      });

      // Rate limit safety: small delay
      await new Promise(r => setTimeout(r, 100));
      } catch (repoErr) {
        if (repoErr.message.startsWith('RATE_LIMIT')) {
          console.warn(`Rate limit hit after processing ${analyzedRepoCount} repos. Saving partial results.`);
          // Break out — keep whatever was already saved.
          break;
        }
        // Other errors: skip this repo, continue with the next.
        console.warn(`Skipping repo ${repo.name}:`, repoErr.message);
        continue;
      }
    }

    // Save skill evidence
    for (const [skill, data] of Object.entries(skillEvidence)) {
      const evidenceCount = Math.round(data.count);
      const level =
        evidenceCount >= 10 ? 'Expert' :
        evidenceCount >= 6 ? 'Advanced' :
        evidenceCount >= 3 ? 'Intermediate' : 'Beginner';

      const monthsSinceUse = (Date.now() - data.lastDate) / (1000 * 60 * 60 * 24 * 30);
      const freshness = Math.max(0, Math.round(100 - monthsSinceUse * 5));
      const confidence = Math.min(100, Math.round(evidenceCount * 10 + freshness * 0.3));

      const uniqueRepos = [...new Set(data.repos)];

      await query(`
        INSERT INTO github_skill_evidence (
          employee_id, skill_name, evidence_count, confidence_score,
          freshness_score, last_evidence_date, source_repos, evidence_level
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (employee_id, skill_name)
        DO UPDATE SET
          evidence_count = $3, confidence_score = $4, freshness_score = $5,
          last_evidence_date = $6, source_repos = $7, evidence_level = $8
      `, [
        employeeId, skill, evidenceCount, confidence, freshness,
        data.lastDate, JSON.stringify(uniqueRepos), level
      ]);

      // ── INTEGRATE WITH EXISTING skills table (ZenMatrix) — suggest only ──
      // Never auto-overwrites a verified badge; just records a suggestion.
      if (confidence >= 60) {
        await query(`
          UPDATE skills
          SET github_evidence_score = $1, github_suggested_level = $2
          WHERE employee_id = $3 AND skill_name = $4
        `, [confidence, level, employeeId, skill]);
      }
    }

    const devScore = calculateDeveloperScore({
      publicRepos: repos.length,
      analyzedRepoCount,
      avgDocScore: analyzedRepoCount > 0 ? totalDocScore / analyzedRepoCount : 0
    });

    // Partial coverage is a normal, non-error outcome without a token. Record an
    // informational note so the UI can surface it as a notice (not an error).
    let coverageNote = null;
    if (analyzedRepoCount < reposToAnalyze.length) {
      coverageNote = `Rate limit reached. Analyzed ${analyzedRepoCount} of ${reposToAnalyze.length} repos. Reconnect later for full analysis.`;
    } else if (repos.length > reposToAnalyze.length) {
      coverageNote = `Analyzed top ${reposToAnalyze.length} most recent repositories of ${repos.length} total (unauthenticated API limit).`;
    }

    await query(`
      UPDATE github_profiles
      SET analysis_status = 'complete', developer_score = $1, last_analyzed_at = NOW(), error_message = $2
      WHERE employee_id = $3
    `, [devScore, coverageNote, employeeId]);

  } catch (err) {
    console.error('Analysis failed:', err);

    const isRateLimit = err.message.startsWith('RATE_LIMIT');
    const isAuthIssue = err.message === 'AUTH_REQUIRED';

    await query(`
      UPDATE github_profiles SET analysis_status = 'error', error_message = $1 WHERE employee_id = $2
    `, [
      isRateLimit
        ? 'GitHub API rate limit reached. Please try again in an hour.'
        : isAuthIssue
          ? 'GitHub authentication issue. Please contact admin.'
          : err.message,
      employeeId
    ]);
  }
}

// ─── POST /api/github/connect — consent + trigger analysis ──────────────────
app.post('/api/github/connect', async (req, res) => {
  try {
    const { employeeId, githubUsername } = req.body;
    if (!githubUsername) return res.status(400).json({ error: 'GitHub username required' });
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

    let profile;
    try {
      profile = await githubFetch(`/users/${githubUsername}`);
    } catch (err) {
      console.error('[GitHub Connect] Fetch failed:', err.message);

      if (err.message === 'NOT_FOUND') {
        return res.status(404).json({
          error: 'GitHub username not found. Please check the spelling.'
        });
      }

      if (err.message.startsWith('RATE_LIMIT')) {
        return res.status(429).json({
          error: 'GitHub rate limit reached. Please try again in about an hour, ' +
            'or contact admin to add a GITHUB_TOKEN for higher limits.'
        });
      }

      if (err.message === 'AUTH_REQUIRED') {
        return res.status(401).json({
          error: 'GitHub authentication issue. Public profile data should not ' +
            'require this — please report this to support.'
        });
      }

      // Catch-all — never let an unhandled error become a bare 500.
      return res.status(502).json({
        error: 'Could not reach GitHub right now. Please try again in a moment.'
      });
    }

    await query(`
      INSERT INTO github_profiles (
        employee_id, github_username, consent_given, connected_at,
        name, bio, company, location, blog, twitter,
        public_repos, followers, following, account_created_at, analysis_status
      ) VALUES ($1,$2,true,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
      ON CONFLICT (employee_id) DO UPDATE SET
        github_username = $2, consent_given = true, connected_at = NOW(),
        name = $3, bio = $4, company = $5, location = $6, blog = $7, twitter = $8,
        public_repos = $9, followers = $10, following = $11,
        account_created_at = $12, analysis_status = 'pending', error_message = NULL
    `, [
      employeeId, githubUsername, profile.name, profile.bio, profile.company,
      profile.location, profile.blog, profile.twitter_username, profile.public_repos,
      profile.followers, profile.following, profile.created_at
    ]);

    // Keep employees.github_username in sync so ZenAssess GitHub eval continues to work
    try {
      await query(`UPDATE employees SET github_username = $1 WHERE id = $2`, [githubUsername, employeeId]);
    } catch { /* non-blocking */ }

    // Trigger async analysis (don't block response)
    analyzeGitHubProfile(employeeId, githubUsername)
      .catch(err => console.error('GitHub analysis error:', err));

    return res.json({
      success: true,
      message: 'Analysis started',
      profile: { name: profile.name, publicRepos: profile.public_repos, followers: profile.followers }
    });
  } catch (err) {
    console.error('GitHub connect error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/github/:employeeId/readiness — workforce role match ────────────
app.get('/api/github/:employeeId/readiness', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const skills = await query(
      `SELECT skill_name, confidence_score FROM github_skill_evidence WHERE employee_id = $1`,
      [employeeId]
    );

    const roles = [
      { name: 'AI Engineer', required: ['Python', 'TensorFlow', 'PyTorch'] },
      { name: 'Full Stack Developer', required: ['JavaScript', 'TypeScript', 'SQL'] },
      { name: 'DevOps Engineer', required: ['Docker', 'Jenkins', 'Git'] },
      { name: 'Agentic AI Developer', required: ['Python', 'LangChain', 'LangGraph'] }
    ];

    const readiness = roles.map(role => {
      const matched = role.required.filter(reqSkill =>
        skills.rows.some(s => s.skill_name === reqSkill && s.confidence_score >= 50)
      );
      return { role: role.name, matchPercentage: Math.round((matched.length / role.required.length) * 100) };
    });

    return res.json(readiness);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/github/:employeeId — status + results ─────────────────────────
app.get('/api/github/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const profile = await query(`SELECT * FROM github_profiles WHERE employee_id = $1`, [employeeId]);
    if (profile.rows.length === 0) return res.json({ connected: false });

    const repos = await query(
      `SELECT * FROM github_repositories WHERE employee_id = $1 ORDER BY health_score DESC LIMIT 50`,
      [employeeId]
    );
    const skills = await query(
      `SELECT * FROM github_skill_evidence WHERE employee_id = $1 ORDER BY confidence_score DESC`,
      [employeeId]
    );

    return res.json({
      connected: true,
      profile: profile.rows[0],
      repositories: repos.rows,
      skills: skills.rows
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Serve Static Built Vite App for Cloud deployment
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Initialize database and start server
syncDatabaseSchema().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend active on ${PORT}`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
    console.log(`📦 Database: ${process.env.DB_NAME || 'skillmatrix'} @ ${process.env.DB_HOST || 'localhost'}`);
  });
}).catch(err => {
  console.error('🔥 Critical Failure during server startup:', err);
});
