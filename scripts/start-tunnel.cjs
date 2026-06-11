/**
 * Production build + preview on :8080 — most reliable for public tunnel sharing.
 * (Vite dev + localtunnel often shows blank page until bypass click.)
 */
const { spawn, execSync } = require('child_process');
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
    env: { ...process.env, VITE_SINGLE_PORT: 'true', GATEWAY_PORT, ...extraEnv },
  });
  children.push({ name, child });
  return child;
}

function waitFor(url, label, attempts = 60) {
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          console.log(`✅ ${label} ready`);
          resolve(true);
        } else if (++tries >= attempts) resolve(false);
        else setTimeout(tick, 500);
      });
      req.on('error', () => {
        if (++tries >= attempts) resolve(false);
        else setTimeout(tick, 500);
      });
      req.setTimeout(2000, () => { req.destroy(); if (++tries >= attempts) resolve(false); else setTimeout(tick, 500); });
    };
    tick();
  });
}

process.on('SIGINT', () => {
  children.forEach(({ child }) => { try { child.kill(); } catch (_) {} });
  process.exit(0);
});

(async () => {
  console.log('══════════════════════════════════════════════════');
  console.log(' ZenSkill — Tunnel Mode (production preview)');
  console.log('══════════════════════════════════════════════════\n');

  console.log('[1/4] Building frontend...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n[2/4] Starting backend...');
  run('backend', 'node', ['server-postgres.cjs']);
  await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 'Backend');

  console.log('[3/4] Starting Ollama check...');
  run('ollama', 'node', ['scripts/ollama-serve.cjs']);
  await waitFor('http://127.0.0.1:11434/api/tags', 'Ollama');

  console.log('[4/4] Starting preview gateway on :' + GATEWAY_PORT + '...');
  run('preview', 'npx', ['vite', 'preview', '--port', GATEWAY_PORT, '--host', '0.0.0.0', '--strictPort']);
  await waitFor(`http://127.0.0.1:${GATEWAY_PORT}`, 'Gateway');

  console.log('\n══════════════════════════════════════════════════');
  console.log(` 🚀 Ready: http://localhost:${GATEWAY_PORT}`);
  console.log(' 📡 Share:  npm run forward:cf   (recommended)');
  console.log('       or:  npm run forward:lt');
  console.log('══════════════════════════════════════════════════\n');
})();
