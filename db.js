// Simple SQLite database handler - tested and reliable
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class DB {
  constructor(dbPath = 'zenlap.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  initSchema() {
    const schemaSQL = `
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        zensar_id TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        designation TEXT,
        department TEXT,
        location TEXT,
        years_it INTEGER DEFAULT 0,
        years_zensar INTEGER DEFAULT 0,
        password TEXT,
        overall_capability INTEGER DEFAULT 0,
        submitted BOOLEAN DEFAULT 0,
        resume_uploaded BOOLEAN DEFAULT 0,
        primary_skill TEXT,
        primary_domain TEXT,
        secondary_skill TEXT,
        tertiary_skill TEXT,
        grade TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
        skill_name TEXT NOT NULL,
        self_rating INTEGER DEFAULT 0 CHECK (self_rating BETWEEN 0 AND 5),
        manager_rating INTEGER CHECK (manager_rating BETWEEN 0 AND 5),
        assessment_score INTEGER,
        proficiency_level TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
        skill_name TEXT NOT NULL,
        total_score INTEGER,
        percentage REAL,
        status TEXT DEFAULT 'pending',
        attempt_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
        badge_name TEXT NOT NULL,
        badge_icon TEXT,
        earned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        role TEXT DEFAULT 'employee',
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS login_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS question_bank (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT NOT NULL,
        band TEXT,
        question TEXT NOT NULL,
        options TEXT,
        correct_answer TEXT,
        explanation TEXT,
        active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS assessment_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
        skill_name TEXT NOT NULL,
        questions_attempted INTEGER,
        correct_answers INTEGER,
        time_taken INTEGER,
        score REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS manager_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
        skill_name TEXT,
        manager_rating INTEGER,
        review_status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
      CREATE INDEX IF NOT EXISTS idx_employees_zensar_id ON employees(zensar_id);
      CREATE INDEX IF NOT EXISTS idx_skills_employee ON skills(employee_id);
      CREATE INDEX IF NOT EXISTS idx_assessments_employee ON assessments(employee_id);
      CREATE INDEX IF NOT EXISTS idx_badges_employee ON badges(employee_id);
      CREATE INDEX IF NOT EXISTS idx_rt_employee ON refresh_tokens(employee_id);
      CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_al_employee ON audit_log(employee_id);
      CREATE INDEX IF NOT EXISTS idx_al_action ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_ls_employee ON login_sessions(employee_id);
      CREATE INDEX IF NOT EXISTS idx_qb_skill ON question_bank(skill_name);
      CREATE INDEX IF NOT EXISTS idx_aa_employee ON assessment_analytics(employee_id);
      CREATE INDEX IF NOT EXISTS idx_mr_employee ON manager_reviews(employee_id);
    `;

    const statements = schemaSQL.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      try {
        this.db.exec(stmt);
      } catch (e) {
        // Likely already exists
      }
    }
  }

  // Simple query execution
  query(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return { rows: stmt.all(...params), rowCount: stmt.all(...params).length };
      } else if (sql.trim().toUpperCase().startsWith('INSERT')) {
        const info = stmt.run(...params);
        return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
      } else {
        const info = stmt.run(...params);
        return { rows: [], rowCount: info.changes };
      }
    } catch (err) {
      console.error('DB Query Error:', err.message, { sql, params });
      throw err;
    }
  }

  // Synchronous query (for use in async context)
  querySync(sql, params = []) {
    return this.query(sql, params);
  }

  close() {
    this.db.close();
  }
}

module.exports = DB;
