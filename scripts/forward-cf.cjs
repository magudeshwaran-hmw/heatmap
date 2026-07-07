/**
 * Cloudflare Quick Tunnel — no signup, no loca.lt bypass page (recommended for demos).
 */
const { spawn } = require('child_process');

const PORT = process.env.GATEWAY_PORT || '7000';

console.log('');
console.log('📡 Starting Cloudflare tunnel → http://localhost:' + PORT);
console.log('   Copy the https://*.trycloudflare.com URL when it appears.');
console.log('');

const child = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
