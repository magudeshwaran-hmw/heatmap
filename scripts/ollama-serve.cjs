/**
 * Start Ollama if not already running (port 11434).
 * Skips cleanly when another Ollama instance is already serving.
 */
const http = require('http');
const { spawn } = require('child_process');

process.env.OLLAMA_ORIGINS = process.env.OLLAMA_ORIGINS || '*';

function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434/api/tags', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  if (await checkOllama()) {
    console.log('✅ Ollama already running on http://127.0.0.1:11434 (using existing instance)');
    // Stay alive so start-all does not treat this as a crash
    setInterval(() => {}, 60_000);
    return;
  }

  console.log('Starting Ollama on http://127.0.0.1:11434 ...');
  const child = spawn('ollama', ['serve'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', async (code) => {
    if (await checkOllama()) {
      console.log('✅ Ollama is running on http://127.0.0.1:11434');
      setInterval(() => {}, 60_000);
      return;
    }
    console.error(`❌ Ollama exited (code ${code}). Install from https://ollama.com and run: ollama serve`);
    process.exit(code ?? 1);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
})();
