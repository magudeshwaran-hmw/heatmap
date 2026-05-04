const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function(origin, callback) {
    // Allow all origins but properly (not wildcard when credentials used)
    callback(null, origin || '*');
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 1234,
  database: process.env.DB_NAME || 'skillmatrix',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

// Test database connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err.message);
});

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

// Helper function to execute queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query executed', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Query error:', { text, params, error: error.message });
    throw error;
  }
}

// Initialize database tables on startup
async function initializeDatabase() {
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
        primary_domain VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create skills table
    await query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        skill_name VARCHAR(255) NOT NULL,
        self_rating INTEGER DEFAULT 0,
        manager_rating INTEGER,
        validated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, skill_name)
      )
    `);

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
    console.log('🧹 Cleanup: Removed malformed project records.');

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

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error (non-blocking):', error.message);
  }
}

// API Routes

// Health check endpoint
app.get('/api/health', (req, res) => res.status(200).send('OK'));
app.head('/api/health', (req, res) => res.status(200).send('OK'));

// Get all employees
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


// Get single employee — case-insensitive lookup
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
    res.json(emp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/employees — Admin employee creation with full field support
app.post('/api/employees', async (req, res) => {
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

    const result = await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, designation, department, location, years_it, years_zensar, password)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [zensar_id, zensar_id, name, email, phone, desig, dept, loc, yearsIT, yearsZen, encPw]);

    console.log(`[Admin] ✅ Created employee: ${name} (${zensar_id})`);
    res.json({ success: true, ...result.rows[0], id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Zensar ID or Email already exists. Please use a different ID.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete employee (and all associated data)
app.delete('/api/employees/:id', async (req, res) => {
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
    console.log(`[Admin] 🗑️ Deleted employee: ${realId}`);
    res.json({ success: true, message: `Employee ${realId} deleted successfully` });
  } catch (error) {
    console.error('[Delete Employee Error]', error);
    res.status(500).json({ error: error.message });
  }
});


// Register new employee
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, designation, department, location, yearsIT, yearsZensar, password, zensarId, primarySkill, primaryDomain } = req.body;
    const zid = (zensarId || `emp_${Date.now()}`).trim();
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

    const result = await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, designation, department, location, years_it, years_zensar, password, primary_skill, primary_domain)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [zid, zid, name, emailTrimmed, phoneTrimmed, designation, department, location, yearsIT || 0, yearsZensar || 0, encryptPw(password), primarySkill, primaryDomain]);

    res.json({ success: true, employee: { ...result.rows[0], id: result.rows[0].zensar_id || result.rows[0].id } });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email or Zensar ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const loginId = String(req.body.login || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    // Check for Master Admin from DB
    const adminIdData = await query("SELECT value FROM app_settings WHERE key = 'admin_id'");
    const adminPwData = await query("SELECT value FROM app_settings WHERE key = 'admin_password'");

    const dbAdminId = adminIdData.rows[0]?.value || 'admin';
    const dbAdminPw = adminPwData.rows[0]?.value || 'admin123';

    if (loginId === dbAdminId.toLowerCase() && password === dbAdminPw) {
      return res.json({
        success: true,
        employee: { id: 'admin', name: 'Master Admin', role: 'admin', zensar_id: dbAdminId.toUpperCase() }
      });
    }

    const result = await query(`
      SELECT * FROM employees 
      WHERE LOWER(zensar_id) = $1 OR LOWER(id) = $1 OR LOWER(email) = $1 OR LOWER(phone) = $1
    `, [loginId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found' });
    }

    const emp = result.rows[0];
    const storedPw = String(emp.password || '').trim();

    if (decryptPw(storedPw) !== password && storedPw !== password) { // Support legacy plain text or encrypted
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.json({
      success: true,
      employee: {
        ...emp,
        id: emp.zensar_id || emp.id,
        name: emp.name,
        role: 'employee'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update app settings (admin credentials)
app.post('/api/admin/settings', async (req, res) => {
  try {
    const { admin_id, admin_password } = req.body;
    if (admin_id) await query("UPDATE app_settings SET value = $1 WHERE key = 'admin_id'", [admin_id]);
    if (admin_password) await query("UPDATE app_settings SET value = $1 WHERE key = 'admin_password'", [admin_password]);
    res.json({ success: true, message: 'Admin settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/employees/add', async (req, res) => {
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

// Admin create employee (used by AdminDashboard)
app.post('/api/admin/create-employee', async (req, res) => {
  try {
    const { name, email, employeeId, phone, designation, department, location, yearsIT, yearsZensar, password, skills, projects, certificates, education, primarySkill, primaryDomain } = req.body;
    const zid = (employeeId || '').trim();
    const emailTrimmed = (email || '').trim().toLowerCase();
    const phoneTrimmed = (phone || '').trim();

    console.log('[Admin Create Employee] Request received:', {
      name, email: emailTrimmed, employeeId: zid, phone: phoneTrimmed, designation,
      primarySkill, primaryDomain,
      skillsCount: Array.isArray(skills) ? skills.length : 0,
      projectsCount: Array.isArray(projects) ? projects.length : 0,
      certificatesCount: Array.isArray(certificates) ? certificates.length : 0,
      educationCount: Array.isArray(education) ? education.length : 0
    });

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

    // Determine primary_skill and primary_domain from skills if not provided
    let finalPrimarySkill = primarySkill || '';
    let finalPrimaryDomain = primaryDomain || '';
    
    if (!finalPrimarySkill && Array.isArray(skills) && skills.length > 0) {
      // Find highest rated skill
      const sortedSkills = [...skills].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      finalPrimarySkill = sortedSkills[0]?.name || '';
    }
    
    if (!finalPrimaryDomain && Array.isArray(skills) && skills.length > 0) {
      // Find highest rated domain skill (Banking, Insurance, Healthcare, etc.)
      const domainSkills = ['Banking', 'Insurance', 'Healthcare', 'E-Commerce', 'Telecom', 'Retail', 'Energy & Utilities'];
      const foundDomain = skills.find(s => domainSkills.includes(s.name || s.skillName || ''));
      finalPrimaryDomain = foundDomain?.name || foundDomain?.skillName || '';
    }

    // Create the employee
    const result = await query(`
      INSERT INTO employees (id, zensar_id, name, email, phone, designation, department, location, years_it, years_zensar, password, primary_skill, primary_domain)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [zid, zid, name, emailTrimmed, phoneTrimmed, designation || '', department || '', location || '', yearsIT || 0, yearsZensar || 0, encryptPw(password), finalPrimarySkill, finalPrimaryDomain]);

    console.log('[Admin Create Employee] Employee created:', zid);

    // Save skills if provided
    let skillsSaved = 0;
    if (Array.isArray(skills) && skills.length > 0) {
      console.log('[Admin Create Employee] Saving skills:', skills.length);
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
      console.log('[Admin Create Employee] Skills saved:', skillsSaved);
    }

    // Save projects if provided
    let projectsSaved = 0;
    if (Array.isArray(projects) && projects.length > 0) {
      console.log('[Admin Create Employee] Saving projects:', projects.length);
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
      console.log('[Admin Create Employee] Projects saved:', projectsSaved);
    }

    // Save certifications if provided
    let certsSaved = 0;
    if (Array.isArray(certificates) && certificates.length > 0) {
      console.log('[Admin Create Employee] Saving certifications:', certificates.length);
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
      console.log('[Admin Create Employee] Certifications saved:', certsSaved);
    }

    // Save education if provided
    let eduSaved = 0;
    if (Array.isArray(education) && education.length > 0) {
      console.log('[Admin Create Employee] Saving education:', education.length);
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
      console.log('[Admin Create Employee] Education saved:', eduSaved);
    }

    console.log(`[Admin] ✅ Created employee: ${name} (${zid}) with ${skillsSaved} skills, ${projectsSaved} projects, ${certsSaved} certs, ${eduSaved} education`);
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

// Admin update employee
app.post('/api/admin/employees/update', async (req, res) => {
  try {
    // Support both camelCase (frontend) and snake_case (legacy)
    const { 
      id, name, email, zensar_id, password, phone, designation, department, location, 
      years_it, years_zensar, primary_skill, primary_domain,
      // camelCase aliases
      yearsIT, yearsZensar, primarySkill, primaryDomain
    } = req.body;

    let encrypted = null;
    if (password) {
      encrypted = encryptPw(password);
    }

    // Use camelCase values as fallback for snake_case
    const finalYearsIT = years_it ?? yearsIT ?? 0;
    const finalYearsZensar = years_zensar ?? yearsZensar ?? 0;
    const finalPrimarySkill = primary_skill ?? primarySkill ?? null;
    const finalPrimaryDomain = primary_domain ?? primaryDomain ?? null;

    await query(`
      UPDATE employees 
      SET name = COALESCE($1, name), email = COALESCE($2, email), zensar_id = COALESCE($3, zensar_id), 
          phone = COALESCE($4, phone), designation = COALESCE($5, designation), 
          department = COALESCE($6, department), location = COALESCE($7, location), 
          years_it = COALESCE($8, years_it), years_zensar = COALESCE($9, years_zensar), 
          password = COALESCE($10, password), primary_skill = COALESCE($11, primary_skill), 
          primary_domain = COALESCE($12, primary_domain),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 OR zensar_id = $13
    `, [
      name, email, zensar_id, phone, designation,
      department, location, finalYearsIT, finalYearsZensar,
      encrypted, finalPrimarySkill, finalPrimaryDomain, id
    ]);

    res.json({ success: true, message: 'Personnel record updated' });
  } catch (error) {
    console.error('[Admin Update Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee skills (batch endpoint for optimization)
app.post('/api/employees/batch-skills', async (req, res) => {
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
      if (!skillsByEmployee[row.employee_id]) {
        skillsByEmployee[row.employee_id] = [];
      }
      
      // Check if it's a predefined skill
      const predefinedIdx = SKILL_NAMES.indexOf(row.skill_name);
      const skillId = predefinedIdx >= 0 ? `s${predefinedIdx + 1}` : row.skill_name;

      skillsByEmployee[row.employee_id].push({
        skillId: skillId,
        skill_name: row.skill_name, // Keep original field name for compatibility
        skillName: row.skill_name,
        selfRating: row.self_rating,
        managerRating: row.manager_rating,
        validated: row.validated
      });
    });

    // Filter out skills with 0 rating and ensure all requested employees are in response
    employeeIds.forEach(empId => {
      if (!skillsByEmployee[empId]) {
        skillsByEmployee[empId] = [];
      } else {
        skillsByEmployee[empId] = skillsByEmployee[empId].filter(s => s.selfRating > 0);
      }
    });

    console.log(`📊 Batch skills fetched for ${employeeIds.length} employees, ${result.rows.length} total skills`);
    res.json(skillsByEmployee);
  } catch (error) {
    console.error('❌ Batch skills error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee skills
app.get('/api/employees/:id/skills', async (req, res) => {
  try {
    const result = await query('SELECT * FROM skills WHERE employee_id = $1', [req.params.id]);

    const skills = result.rows.map(row => {
      // Check if it's a predefined skill
      const predefinedIdx = SKILL_NAMES.indexOf(row.skill_name);
      const skillId = predefinedIdx >= 0 ? `s${predefinedIdx + 1}` : row.skill_name;

      return {
        skillId: skillId,
        skillName: row.skill_name,
        selfRating: row.self_rating,
        managerRating: row.manager_rating,
        validated: row.validated
      };
    }).filter(s => s.selfRating > 0);

    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update employee skills
app.put('/api/employees/:id/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const body = req.body;
    const employeeId = req.params.id;
    const employeeName = body.employeeName || body.EmployeeName;

    // Clear existing skills for this employee
    await client.query('DELETE FROM skills WHERE employee_id = $1', [employeeId]);

    // Insert new skills
    let ratedCount = 0;
    for (const skillName of SKILL_NAMES) {
      const rating = parseInt(String(body[skillName] || 0)) || 0;
      if (rating > 0) {
        ratedCount++;
        await client.query(`
          INSERT INTO skills (employee_id, skill_name, self_rating)
          VALUES ($1, $2, $3)
        `, [employeeId, skillName, rating]);
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
    res.json({ success: true, capability });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Admin itemized skill delete
app.delete('/api/skills/:employeeId/:skillId', async (req, res) => {
  try {
    // Resolve employee db id from zensar_id or id
    let resolvedEmpId = req.params.employeeId;
    const empCheck = await query('SELECT id FROM employees WHERE id = $1 OR zensar_id = $1', [req.params.employeeId]);
    if (empCheck.rows.length > 0) resolvedEmpId = empCheck.rows[0].id;

    // Resolve skill name from skillId format (e.g. "s1" -> "Selenium") or treat as skill_name directly
    const skillParam = req.params.skillId;
    const skillNameFromId = SKILL_NAMES[parseInt(skillParam.replace(/^s/i, '')) - 1];
    const skillName = skillNameFromId || skillParam; // fallback to raw value if not an sN id

    await query('DELETE FROM skills WHERE employee_id = $1 AND skill_name = $2', [resolvedEmpId, skillName]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin batch skill add
app.post('/api/skills', async (req, res) => {
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
app.post('/api/certifications', async (req, res) => {
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
      const month = monthMatch ? (monthMap[monthMatch[0]] || '01') : '01';
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
    console.log(`[Cert Sync] ✅ '${rawEmpId}' → employees.id='${empId}' | ${existingId ? 'Updating' : 'Inserting'} cert: ${certName}`);

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
        console.log(`[Cert Sync] ⚠️ Duplicate skipped: "${certName}" already exists for ${empId}`);
        return res.json({ success: true, duplicate: true, message: `Certification "${certName}" already exists`, id: dupCheck.rows[0].id });
      }
      result = await query(`
        INSERT INTO certifications (employee_id, cert_name, issuing_organization, issue_date, expiry_date, no_expiry, credential_id, credential_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [empId, certName, org, issueDate || null, expiryDate || null, noExpiry, credentialId, url]);
    }

    res.json({ success: true, certification: result.rows[0] });
  } catch (error) {
    console.error('[Cert Sync Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete certification
app.delete('/api/certifications/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM certifications WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Certification record not found' });
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
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, message: 'Project removed' });
  } catch (error) {
    console.error('[Delete Project Error]', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Add or Update project
app.post('/api/projects', async (req, res) => {
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
    console.log(`[Projects Sync] ✅ Resolved '${empId}' → employees.id='${resolvedEmpId}'`);

    // Handle array serialization
    if (typeof techs === 'string') { try { techs = JSON.parse(techs); } catch (e) { techs = [techs]; } }
    if (typeof skillsUsed === 'string') { try { skillsUsed = JSON.parse(skillsUsed); } catch (e) { skillsUsed = [skillsUsed]; } }

    console.log(`[Projects Sync] ${existingId ? 'Updating' : 'Inserting'} project for ${resolvedEmpId}: ${projectName}`);

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
        console.log(`[Projects Sync] ⚠️ Duplicate skipped: "${projectName}" (${role}) already exists for ${resolvedEmpId}`);
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

    res.json({ success: true, project: result.rows[0] });
  } catch (error) {
    console.error('[Projects Sync Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all projects
app.get('/api/projects/ALL', async (req, res) => {
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
app.post('/api/education', async (req, res) => {
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
    console.log(`[Education Sync] ✅ '${rawEmpId}' → '${empId}' | ${existingId && existingId !== rawEmpId ? 'Updating' : 'Inserting'} record: ${degree}`);

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
        console.log(`[Education Sync] ⚠️ Duplicate skipped: "${degree}" at "${institution}" already exists for ${empId}`);
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
app.get('/api/education/:id', async (req, res) => {
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
app.delete('/api/education/:id', async (req, res) => {
  try {
    await query('DELETE FROM education WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Educational record removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get achievements for employee
app.get('/api/achievements/:id', async (req, res) => {
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
app.post('/api/achievements', async (req, res) => {
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
      console.log(`[Achievement Sync] ⚠️ Duplicate skipped: "${body.Title}" already exists for ${employeeId}`);
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
app.delete('/api/achievements/:id', async (req, res) => {
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
    console.log(`🤖 [LLM Proxy] Provider: ${provider} | Model: ${req.body.model || 'default'}`);

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
      res.json({ response: data.choices[0].message.content });

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
app.get('/api/bfsi/roles', async (req, res) => {
  try {
    const roles = await query('SELECT * FROM bfsi_roles ORDER BY created_date DESC');
    res.json({ roles: roles.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all BFSI workforce
app.get('/api/bfsi/workforce', async (req, res) => {
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
app.get('/api/bfsi/dashboard', async (req, res) => {
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
    console.log('📊 Dashboard Grand Total row:', gt);
    console.log('📊 supply_total from GT:', gt.supply_total, 'type:', typeof gt.supply_total);
    
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
    console.log('📊 Skill gaps count:', skillGaps.length);
    console.log('📊 First skill gap:', skillGaps[0]);
    
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
    console.log('📊 Dashboard response totals:', { 
      totalDemand: response.totalDemand, 
      totalSupply: response.totalSupply, 
      totalGap: response.totalGap 
    });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get BFSI summary data (from Excel Summary sheet)
app.get('/api/bfsi/summary-data', async (req, res) => {
  try {
    const result = await query('SELECT * FROM bfsi_summary_data ORDER BY gap DESC');
    res.json({ summary: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get skill demand vs supply
app.get('/api/bfsi/skill-analysis', async (req, res) => {
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
        skillDemand[skill] = (skillDemand[skill] || 0) + 1;
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
          skillSupply.ready[skill] = (skillSupply.ready[skill] || 0) + 1;
        } else if (daysToGrad && daysToGrad <= 14) {
          skillSupply.week2[skill] = (skillSupply.week2[skill] || 0) + 1;
        } else if (daysToGrad && daysToGrad <= 28) {
          skillSupply.week4[skill] = (skillSupply.week4[skill] || 0) + 1;
        } else if (emp.bench_days > 60 || emp.reject_count > 2) {
          skillSupply.blocked[skill] = (skillSupply.blocked[skill] || 0) + 1;
        }
      });
    });
    
    const analysis = Object.entries(skillDemand).map(([skill, demand]) => ({
      skill,
      demand,
      ready: skillSupply.ready[skill] || 0,
      week2: skillSupply.week2[skill] || 0,
      week4: skillSupply.week4[skill] || 0,
      blocked: skillSupply.blocked[skill] || 0,
      totalSupply: (skillSupply.ready[skill] || 0) + (skillSupply.week2[skill] || 0) + (skillSupply.week4[skill] || 0),
      gap: demand - ((skillSupply.ready[skill] || 0) + (skillSupply.week2[skill] || 0) + (skillSupply.week4[skill] || 0))
    }));
    
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Shortlist employees for a role
app.get('/api/bfsi/shortlist/:roleId', async (req, res) => {
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
app.get('/api/bfsi/certifications/pipeline', async (req, res) => {
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
app.get('/api/bfsi/roles/aging', async (req, res) => {
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
app.get('/api/bfsi/reskilling-opportunities', async (req, res) => {
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
        const month = months[m[2].toLowerCase()];
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
app.post('/api/bfsi/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    console.log('📊 Processing Excel sheets:', workbook.SheetNames);
    
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
        console.log(`📋 Processing LOB sheet: ${lobData.length} employees`);
        
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
        console.log(`📋 Processing Reactive sheet: ${reactiveData.length} urgent roles`);
        rolesCount += await processSRFSheet(reactiveData, 'Reactive');
      }

      // ==========================================
      // SHEET 3: Proactive - Pipeline Roles
      // ==========================================
      if (workbook.SheetNames.includes('Proactive')) {
        const proactiveSheet = workbook.Sheets['Proactive'];
        const proactiveData = XLSX.utils.sheet_to_json(proactiveSheet, { raw: false });
        console.log(`📋 Processing Proactive sheet: ${proactiveData.length} pipeline roles`);
        rolesCount += await processSRFSheet(proactiveData, 'Proactive');
      }
      
      // ==========================================
      // SHEET 4: Pool - Available Resources (39 employees)
      // ==========================================
      if (workbook.SheetNames.includes('Pool')) {
        const poolSheet = workbook.Sheets['Pool'];
        const poolData = XLSX.utils.sheet_to_json(poolSheet, { raw: false });
        console.log(`📋 Processing Pool sheet: ${poolData.length} available resources`);
        // Log actual column names from first row to debug mapping
        if (poolData.length > 0) {
          console.log('📋 Pool sheet columns:', Object.keys(poolData[0]));
          console.log('📋 Pool first row sample:', JSON.stringify(poolData[0]).substring(0, 500));
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
            if (row[col]) skills.push(...String(row[col]).split(',').map(s => s.trim()).filter(Boolean));
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
        console.log(`📋 Processing Deallocation sheet: ${deallocData.length} releasing employees`);
        if (deallocData.length > 0) {
          console.log('📋 Deallocation sheet columns:', Object.keys(deallocData[0]));
        }

        // ── Clear stale deallocation dates before re-processing ──
        // This ensures old wrong dates don't persist across uploads
        await client.query(`UPDATE bfsi_workforce SET deallocation_date = NULL, return_to_pool_date = NULL WHERE status = 'Deallocating'`);
        console.log('🧹 Cleared stale deallocation dates before re-processing');
        
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
          
          console.log(`📅 Employee ${empId} - DeallocationDt raw value: "${releaseDateRaw}" from columns:`, 
            Object.keys(row).filter(k => k.toLowerCase().includes('dealloc') || k.toLowerCase().includes('release') || k.toLowerCase().includes('end') || k.toLowerCase().includes('date'))
          );
          
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
            if (row[col]) deallocSkills.push(...String(row[col]).split(',').map(s => s.trim()).filter(Boolean));
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
        console.log(`📋 Processing Summary sheet: ${summaryData.length} rows`);
        
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
        
        console.log('📊 STRICT IMPORT: Processing ONLY main summary rows 5-17');
        console.log('📊 Column mapping:', colMap);
        
        // WIPE existing summary data before every upload so stale/junk rows never persist
        await client.query('DELETE FROM bfsi_summary_data');
        console.log('🗑️  Cleared bfsi_summary_data before fresh import');
        
        // Show what we're about to import
        console.log('📊 Excel data to import:');
        for (let i = firstDataRow; i <= lastDataRow && i < summaryData.length; i++) {
          const row = summaryData[i];
          if (!row || !row[colMap.skill]) continue;
          const skill = String(row[colMap.skill]).trim();
          const pool = safeParseInt(row[colMap.pool], 0);
          const dealloc = safeParseInt(row[colMap.dealloc], 0);
          const reactive = safeParseInt(row[colMap.reactive], 0);
          console.log(`  Row ${i+1}: "${skill}" → Pool=${pool}, Dealloc=${dealloc}, Reactive=${reactive}`);
        }
        
        // Process ONLY the main summary rows - NO sub-reports
        for (let i = firstDataRow; i <= lastDataRow && i < summaryData.length; i++) {
          const row = summaryData[i];
          if (!row || !row[colMap.skill]) continue;
          
          const skillName = String(row[colMap.skill] || '').trim();
          if (!skillName || skillName.toLowerCase().includes('total')) continue;
          
          const poolValue = safeParseInt(row[colMap.pool], 0);
          const deallocValue = safeParseInt(row[colMap.dealloc], 0);
          const reactiveValue = safeParseInt(row[colMap.reactive], 0);
          const proactiveValue = safeParseInt(row[colMap.proactive], 0);
          
          console.log(`✅ Importing: "${skillName}" → Pool=${poolValue}, Dealloc=${deallocValue}, Reactive=${reactiveValue}`);

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
            safeParseInt(row[colMap.demand_total], 0),
            poolValue,
            deallocValue,
            safeParseInt(row[colMap.supply_total], 0),
            safeParseInt(row[colMap.gap], 0),
            safeParseInt(row[colMap.off_total], 0)
          ]);
          summaryCount++;
        }
        
        // Also insert Grand Total row for totalSupply/totalDemand lookups
        const grandTotalRow = summaryData.find((r) => r && String(r[0] || '').toLowerCase().includes('grand total'));
        if (grandTotalRow) {
          await client.query(`
            INSERT INTO bfsi_summary_data (
              primary_skill, reactive_srf, proactive, demand_total,
              pool_supply, deallocation_supply, supply_total, gap, offers_total
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            'Grand Total',
            safeParseInt(grandTotalRow[colMap.reactive], 0),
            safeParseInt(grandTotalRow[colMap.proactive], 0),
            safeParseInt(grandTotalRow[colMap.demand_total], 0),
            safeParseInt(grandTotalRow[colMap.pool], 0),
            safeParseInt(grandTotalRow[colMap.dealloc], 0),
            safeParseInt(grandTotalRow[colMap.supply_total], 0),
            safeParseInt(grandTotalRow[colMap.gap], 0),
            safeParseInt(grandTotalRow[colMap.off_total], 0)
          ]);
          console.log(`✅ Grand Total row inserted: Pool=${safeParseInt(grandTotalRow[colMap.pool],0)}, Dealloc=${safeParseInt(grandTotalRow[colMap.dealloc],0)}, Supply=${safeParseInt(grandTotalRow[colMap.supply_total],0)}`);
        }
        
        console.log(`✅ Summary import complete: ${summaryCount} skills imported`);
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
      console.log('✅ Cleanup: Marked employees with deallocation_date as Deallocating');

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
      
      console.log(`✅ Upload complete: ${rolesCount} roles, ${workforceCount} employees, ${poolCount} pool, ${deallocationCount} deallocating`);
      
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
app.get('/api/bfsi/report/weekly', async (req, res) => {
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
app.post('/api/bfsi/assign', async (req, res) => {
  try {
    const { roleId, employeeId, matchScore } = req.body;
    
    await query(`
      INSERT INTO bfsi_assignments (role_id, employee_id, match_score, assignment_status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (role_id, employee_id) DO UPDATE SET
        match_score = EXCLUDED.match_score,
        assignment_status = EXCLUDED.assignment_status,
        updated_at = CURRENT_TIMESTAMP
    `, [roleId, employeeId, matchScore, 'Assigned']);
    
    await query("UPDATE bfsi_workforce SET status = $1 WHERE employee_id = $2", ['Assigned', employeeId]);
    await query("UPDATE bfsi_roles SET status = $1 WHERE role_id = $2", ['Filled', roleId]);
    
    res.json({ success: true, message: 'Employee assigned to role' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reserve employee for role (reskilling track)
app.post('/api/bfsi/reserve', async (req, res) => {
  try {
    const { roleId, employeeId, matchScore, weeks } = req.body;
    
    await query(`
      INSERT INTO bfsi_assignments (role_id, employee_id, match_score, assignment_status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (role_id, employee_id) DO UPDATE SET
        match_score = EXCLUDED.match_score,
        assignment_status = EXCLUDED.assignment_status,
        updated_at = CURRENT_TIMESTAMP
    `, [roleId, employeeId, matchScore, 'Reserved']);
    
    res.json({ success: true, message: `Employee reserved for role (${weeks} weeks track)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start reskilling for employee
app.post('/api/bfsi/reskill', async (req, res) => {
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
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { raw: false });
      result[sheetName] = {
        rowCount: data.length,
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        firstRow: data.length > 0 ? data[0] : {}
      };
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset all BFSI data
app.post('/api/bfsi/reset', async (req, res) => {
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

// Serve Static Built Vite App for Cloud deployment
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend active on ${PORT}`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
  });
}).catch(err => {
  console.error('🔥 Critical Failure during server startup:', err);
});
