/**
 * Start full ZenSkill stack on a single gateway port (default 8080).
 * Internal services: backend :3001, Ollama :11434, PostgreSQL :5432
 * Public entry: http://localhost:8080 (proxy via Vite)
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const GATEWAY_PORT = process.env.GATEWAY_PORT || '8080';
const BACKEND_PORT = process.env.PORT || '3001';
const isWin = process.platform === 'win32';

const children = [];

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${name}] exited with code ${code}`);
  });
  children.push({ name, child });
  return child;
}

function waitFor(url, label, attempts = 40, delayMs = 500) {
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          console.log(`✅ ${label} ready`);
          resolve(true);
        } else if (++tries >= attempts) resolve(false);
        else setTimeout(tick, delayMs);
      });
      req.on('error', () => {
        if (++tries >= attempts) {
          console.warn(`⚠️  ${label} not responding yet (${url})`);
          resolve(false);
        } else setTimeout(tick, delayMs);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (++tries >= attempts) resolve(false);
        else setTimeout(tick, delayMs);
      });
    };
    tick();
  });
}

function shutdown() {
  console.log('\n🛑 Stopping all services...');
  for (const { name, child } of children) {
    try {
      if (!child.killed) child.kill(isWin ? undefined : 'SIGTERM');
    } catch (_) {
      console.warn(`Could not stop ${name}`);
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  console.log('══════════════════════════════════════════════════');
  console.log(' ZenSkill Navigator — Single Port Stack');
  console.log('══════════════════════════════════════════════════');
  console.log(` Gateway (public):  http://localhost:${GATEWAY_PORT}`);
  console.log(` Backend (internal): http://localhost:${BACKEND_PORT}/api`);
  console.log(` Ollama (internal):  http://127.0.0.1:11434`);
  console.log(` Database:           PostgreSQL :5432`);
  console.log('══════════════════════════════════════════════════\n');

  // DB connectivity check
  const { Pool } = require('pg');
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const dbPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'skillmatrix',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  });
  try {
    await dbPool.query('SELECT 1');
    const cnt = await dbPool.query('SELECT COUNT(*)::int AS n FROM employees');
    console.log(`✅ Database connected (${cnt.rows[0]?.n || 0} employees)`);
  } catch (e) {
    console.error('❌ Database not connected:', e.message);
    console.error('   Check PostgreSQL is running and .env DB_* settings.');
    process.exit(1);
  } finally {
    await dbPool.end().catch(() => {});
  }

  console.log('\n[1/3] Starting backend...');
  run('backend', 'node', ['server-postgres.cjs']);
  await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 'Backend');

  console.log('[2/3] Starting Ollama...');
  run('ollama', 'node', ['scripts/ollama-serve.cjs']);
  await waitFor('http://127.0.0.1:11434/api/tags', 'Ollama');

  console.log('[3/3] Starting gateway (Vite)...');
  run('gateway', 'npx', ['vite', '--port', GATEWAY_PORT, '--strictPort', '--host'], {
    VITE_SINGLE_PORT: 'true',
    GATEWAY_PORT,
  });
  await waitFor(`http://127.0.0.1:${GATEWAY_PORT}`, 'Gateway');

  console.log('\n══════════════════════════════════════════════════');
  console.log(` 🚀 ALL SERVICES RUNNING — open http://localhost:${GATEWAY_PORT}`);
  console.log(' 📡 To forward externally: npm run forward');
  console.log('    (single ngrok tunnel → port', GATEWAY_PORT + ')');
  console.log('══════════════════════════════════════════════════\n');
})();
