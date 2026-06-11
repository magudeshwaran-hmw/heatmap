/**
 * Start ngrok tunnel on gateway port 8080 (single URL for full stack).
 *
 * Auth (pick ONE):
 *   - NGROK_AUTHTOKEN in .env
 *   - ngrok config add-authtoken YOUR_TOKEN  (global, one-time)
 */
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.GATEWAY_PORT || '8080';
const token = process.env.NGROK_AUTHTOKEN?.trim();

const args = token ? ['http', PORT, `--authtoken=${token}`] : ['http', PORT];

console.log(`📡 Starting ngrok → http://localhost:${PORT}`);
console.log('   Routes: / (frontend)  /api (backend+DB)  /ollama (AI)');
console.log('   Dashboard: http://127.0.0.1:4040');
if (!token) {
  console.log('   Using global ngrok config (run once: ngrok config add-authtoken YOUR_TOKEN)');
}
console.log('');

const child = spawn('ngrok', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  if (code !== 0 && !token) {
    console.error('');
    console.error('❌ ngrok needs an authtoken (free account).');
    console.error('');
    console.error('Quick fix — run ONE of these:');
    console.error('');
    console.error('  Option A — add to .env file:');
    console.error('    NGROK_AUTHTOKEN=paste_token_from_ngrok_dashboard');
    console.error('');
    console.error('  Option B — one-time global setup:');
    console.error('    ngrok config add-authtoken paste_token_here');
    console.error('');
    console.error('  Get token: https://dashboard.ngrok.com/get-started/your-authtoken');
    console.error('');
    console.error('  No ngrok account? Use free alternative:');
    console.error('    npm run forward:lt');
    console.error('');
  }
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
