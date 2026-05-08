import { API_BASE } from '@/lib/api';
/*
 * ═══════════════════════════════════════════════
 * TO SWITCH FROM LOCAL TO CLOUD AI:
 *
 * 1. Change: const AI_MODE = 'local'
 *    To:     const AI_MODE = 'cloud'
 *
 * 2. Replace: const CLOUD_API_KEY = 'PASTE_API_KEY_HERE'
 *    With:    const CLOUD_API_KEY = 'your-actual-api-key'
 *
 * 3. Run: npm run build
 * 4. Deploy to GitHub
 *
 * That's it. Everything else works automatically.
 * ═══════════════════════════════════════════════
 */

// ─── AI MODE SWITCH ──────────────────────────────────────────
// CURRENT: 'local' (Ollama for testing)
// FUTURE:  'cloud' (paste API key when manager approves)
// TO SWITCH: change AI_MODE to 'cloud' and add CLOUD_API_KEY
// ─────────────────────────────────────────────────────────────

const LOCAL_MODEL = 'qwen3-coder:480b-cloud'; // Primary model
const RESUME_MODELS = [
  'qwen3-coder:480b-cloud',
  'deepseek-v3.1:671b-cloud',
  'gemini-3-flash-preview:cloud',
  'glm-5.1:cloud',
  'gemma4:cloud',
  'nemotron-3-super:cloud',
  'kimi-k2.5:cloud'
];
const AI_MODE: 'local' | 'cloud' = 'local';
const CACHE_TTL = 3600 * 12; 

// Try both URLs — avoids "AI offline" on machines where 127.0.0.1 works but localhost doesn't
const LOCAL_URLS = [
  `${API_BASE}/llm`, // Proxy via our backend to completely bypass Browser CORS
  'http://localhost:11434/api/generate',
  'http://127.0.0.1:11434/api/generate',
];
const LOCAL_STATUS_URLS = [
  'http://localhost:11434/api/tags',
  'http://127.0.0.1:11434/api/tags',
];
const CLOUD_API_KEY = 'PASTE_API_KEY_HERE'; // replace when approved
const CLOUD_MODEL = 'claude-3-5-sonnet-20241022';

// ─── TIMEOUT HELPER ──────────────────────────────────────────
const withTimeout = (promise: Promise<any>, ms: number) => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM_TIMEOUT')), ms)
  );
  return Promise.race([promise, timeout]);
};

// ─── RESPONSE SHAPE ──────────────────────────────────────────
export interface LLMResult {
  data: any;
  fromCache: boolean;
  error?: 'timeout' | 'offline' | 'parse' | 'unknown';
  message?: string;
}

// ─── MAIN LLM CALL ───────────────────────────────────────────
export const callLLM = async (
  prompt: string,
  modelOverride?: string
): Promise<LLMResult> => {

  const getPromptHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  };

  const cacheKey = `llmCache_${getPromptHash(prompt)}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return { data: parsed, fromCache: true };
      }
    } catch {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    let rawText = '';

    if (AI_MODE === 'local') {
      // ── LOCAL OLLAMA — try both localhost and 127.0.0.1 ─────────────────
      let localRes: Response | null = null;
      for (const url of LOCAL_URLS) {
        try {
          const attempt = await withTimeout(
            fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelOverride || LOCAL_MODEL,
                prompt: prompt,
                stream: false,
                format: 'json',
              }),
            }),
            50000 // Give it longer (50s) to run on CPU machines
          ) as Response;
          if (attempt.ok) { 
            localRes = attempt; 
            break; 
          }
        } catch (err: any) { continue; }
      }
      if (!localRes) throw new Error('Ollama connection completely failed.');
      const json = await localRes.json();
      rawText = json.response;

    } else {
      // ── CLOUD API (Anthropic Claude) ─────────────────────────
      const res = await withTimeout(
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLOUD_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLOUD_MODEL,
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        }),
        30000 // 30-second timeout for cloud
      ) as Response;

      if (!res.ok) throw new Error(`Cloud API error: ${res.status}`);
      const json = await res.json();
      rawText = json.content?.[0]?.text || '';
    }

    // ── PARSE JSON RESPONSE ───────────────────────────────────
    // Some models wrap the result in conversation or truncate it.
    // We try to extract and repair the JSON before parsing.
    const extractJSON = (txt: string): string => {
      // Remove markdown code fences
      let t = txt.replace(/```json/g, '').replace(/```/g, '').trim();
      // Find the outermost { ... } block
      const start = t.indexOf('{');
      if (start === -1) return t;
      // Find matching closing brace (handle nesting)
      let depth = 0;
      let end = -1;
      for (let i = start; i < t.length; i++) {
        if (t[i] === '{') depth++;
        else if (t[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) return t.slice(start, end + 1);
      // JSON was truncated — attempt to close all open braces/brackets
      const partial = t.slice(start);
      let repaired = partial;
      let openBraces = 0, openBrackets = 0;
      let inString = false, escape = false;
      for (const ch of partial) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets--;
      }
      // Remove trailing comma before closing
      repaired = repaired.replace(/,\s*$/, '');
      // Close open brackets then braces
      repaired += ']'.repeat(Math.max(0, openBrackets));
      repaired += '}'.repeat(Math.max(0, openBraces));
      return repaired;
    };

    const clean = extractJSON(rawText).trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.warn('AI JSON Parse Failed. Raw:', rawText);
      throw new Error('LLM_PARSE_ERROR');
    }

    // ── SAVE TO CACHE ─────────────────────────────────────────
    localStorage.setItem(cacheKey, JSON.stringify(parsed));

    return { data: parsed, fromCache: false };

  } catch (err: any) {
    if (err.message === 'LLM_TIMEOUT') {
      return {
        data: null, fromCache: false, error: 'timeout',
        message: 'AI took too long to respond. Click Regenerate.',
      };
    }
    if (err.message === 'LLM_PARSE_ERROR') {
      return {
        data: null, fromCache: false, error: 'parse',
        message: 'AI returned invalid data format. Please try again.',
      };
    }

    if (
      err.message?.includes('offline') ||
      err.message?.includes('fetch') ||
      err.name === 'TypeError'
    ) {
      return {
        data: null, fromCache: false, error: 'offline',
        message: AI_MODE === 'local'
          ? 'Local AI offline. Ensure Ollama/Cloud-Node is running and reachable.'
          : 'Cloud AI unreachable. Check API key or network.',
      };
    }

    return {
      data: null,
      fromCache: false,
      error: 'unknown',
      message: `AI error: ${err.message || 'Unknown infrastructure disruption'}.`,
    };
  }
};

// ─── LLM STATUS CHECK ────────────────────────────────────────
export const checkLLMStatus = async (): Promise<{
  online: boolean;
  mode: string;
  message: string;
}> => {
  if (AI_MODE === 'local') {
    for (const url of LOCAL_STATUS_URLS) {
      try {
        const res = await withTimeout(fetch(url), 2000) as Response;
        if (res.ok) return {
          online: true,
          mode: 'Local Ollama',
          message: '🟢 Local AI Online',
        };
      } catch { continue; }
    }
    return {
      online: false,
      mode: 'Local Ollama',
      message: '🔴 Local AI Offline',
    };
  } else {
    const configured = CLOUD_API_KEY && CLOUD_API_KEY !== 'PASTE_API_KEY_HERE';
    return {
      online: !!configured,
      mode: 'Cloud AI',
      message: configured ? 'Cloud AI Connected' : 'API Key not configured',
    };
  }
};

// ─── CACHE UTILITIES ──────────────────────────────────────────
export const clearLLMCache = () => {
  Object.keys(localStorage)
    .filter(k => k.startsWith('llmCache_'))
    .forEach(k => localStorage.removeItem(k));
};

export const getLLMMode = () => AI_MODE;

/**
 * ─── SMART EXTRACTOR ──────────────────────────────────────────
 * Tries the new high-end models in sequence for best accuracy.
 */
export const callResumeLLM = async (prompt: string): Promise<LLMResult> => {
  let lastResult: LLMResult | null = null;
  
  for (const model of RESUME_MODELS) {
    try {
      console.log(`🤖 [AI Audit] Attempting scan with ${model}...`);
      const result = await callLLM(prompt, model);
      if (result.data && !result.error) return result;
      lastResult = result;
    } catch (e) {
      console.error(`❌ [AI Audit] ${model} failed:`, e);
    }
  }
  
  return lastResult || { data: null, fromCache: false, error: 'unknown', message: 'All models failed to extract data.' };
};

/** @deprecated Use checkLLMStatus() */
export const pingLLM = async (): Promise<boolean> => {
  const status = await checkLLMStatus();
  return status.online;
};
