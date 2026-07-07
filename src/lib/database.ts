import { Pool, PoolClient } from 'pg';

// PostgreSQL connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '1234'),
  database: process.env.DB_NAME || 'skillmatrix',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
});

// Test database connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Helper function to execute queries
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query executed', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Query error:', { text, params, error });
    throw error;
  }
}

// Helper function for transactions
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize database tables
export async function initializeDatabase() {
  try {
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
        start_date DATE,
        end_date DATE,
        description TEXT,
        technologies TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create certifications table
    await query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        cert_name VARCHAR(255) NOT NULL,
        issuing_organization VARCHAR(255),
        issue_date DATE,
        expiry_date DATE,
        credential_id VARCHAR(255),
        credential_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create growth_plans table
    await query(`
      CREATE TABLE IF NOT EXISTS growth_plans (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
        skill_id VARCHAR(50),
        current_level INTEGER DEFAULT 0,
        target_level INTEGER DEFAULT 0,
        target_date DATE,
        progress INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Active',
        actions TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_zensar_id ON employees(zensar_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_skills_employee_id ON skills(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_projects_employee_id ON projects(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_certifications_employee_id ON certifications(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_growth_plans_employee_id ON growth_plans(employee_id)`);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

export default pool;
