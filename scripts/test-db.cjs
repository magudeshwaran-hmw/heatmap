require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 1234,
  database: process.env.DB_NAME || 'skillmatrix',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

pool
  .query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  )
  .then((r) => {
    console.log('DB:', process.env.DB_NAME);
    console.log('Tables:', r.rows.map((x) => x.table_name).join(', ') || 'NONE');
    return pool.end();
  })
  .catch((e) => {
    console.error('Connection failed:', e.message);
    pool.end().catch(() => {});
    process.exit(1);
  });
