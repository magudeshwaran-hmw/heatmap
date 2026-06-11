/**
 * LocalTunnel — free public URL (no ngrok account).
 * IMPORTANT: first visit shows a loca.lt reminder page — you must click Continue once.
 */
const { spawn } = require('child_process');

const PORT = process.env.GATEWAY_PORT || '8080';

console.log('');
console.log('📡 Starting LocalTunnel → http://localhost:' + PORT);
console.log('');
console.log('⚠️  FIRST VISIT — if the page is BLANK:');
console.log('   1. Open the tunnel URL in the browser');
console.log('   2. Click "Click to Continue" on the loca.lt warning page');
console.log('   3. Press Ctrl+Shift+R to hard-refresh');
console.log('');
console.log('💡 More reliable (no blank page):  npm run forward:cf');
console.log('');

const child = spawn('npx', ['--yes', 'localtunnel', '--port', PORT], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
