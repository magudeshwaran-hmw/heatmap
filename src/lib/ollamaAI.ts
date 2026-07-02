/**
 * ollamaAI.ts — Local Ollama AI integration
 * 
 * SETUP (Windows):
 *   set OLLAMA_ORIGINS=* && ollama serve
 * 
 * CUDA / GPU error fix:
 *   If you get "CUDA error" or "llama runner terminated", run:
 *   set CUDA_VISIBLE_DEVICES= && set OLLAMA_ORIGINS=* && ollama serve
 *   This forces CPU-only mode and avoids GPU out-of-memory errors.
 */

import { SKILLS } from './mockData';
import { SkillRating, ProficiencyLevel } from './types';

import { OLLAMA_BASE } from './config';

export interface OllamaStatus {
  available: boolean;
  model: string | null;
  modelShort: string | null;
  error?: string;
}

/** Check if Ollama is running; returns full model tag */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { available: false, model: null, modelShort: null, error: `Ollama HTTP ${res.status}` };

    const data = await res.json();
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name);

    if (models.length === 0) {
      return { available: false, model: null, modelShort: null, error: 'No models installed. Run: ollama pull llama3' };
    }

    // Prefer small/fast models to avoid CUDA OOM; include newer efficient models
    const preferred = ['qwen2.5:0.5b', 'qwen', 'phi3', 'phi', 'gemma', 'mistral', 'llama3'];
    let chosen = models[0];
    for (const p of preferred) {
      const found = models.find(m => m.toLowerCase().includes(p.toLowerCase()));
      if (found) { chosen = found; break; }
    }

    return {
      available: true,
      model: chosen,
      modelShort: chosen.split(':')[0],
    };
  } catch (err) {
    return {
      available: false, model: null, modelShort: null,
      error: `Local AI (Ollama) is not reachable. Run: "set OLLAMA_ORIGINS=* && ollama serve" in a terminal.`,
    };
  }
}

/**
 * Core Ollama generate call — includes CUDA error handling.
 * On CUDA error, retries once with num_gpu:0 (CPU-only mode).
 */
async function ollamaGenerate(model: string, prompt: string, maxTokens = 2000): Promise<string> {
  const body = (numGpu: number) => JSON.stringify({
    model,
    prompt,
    stream: false,
    options: {
      temperature: 0.1,
      num_predict: maxTokens,
      num_gpu: numGpu,   // 0 = CPU only (avoids CUDA OOM)
    },
  });

  // First attempt — let Ollama auto-select GPU/CPU
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body(-1),  // -1 = Ollama default
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'TimeoutError')
      throw new Error('Ollama timed out (120s). Try a smaller model or CPU mode.');
    throw new Error(`Cannot reach Ollama: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Handle CUDA / GPU crash — retry with CPU only
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const isCudaError = errText.toLowerCase().includes('cuda') ||
                        errText.toLowerCase().includes('runner') ||
                        res.status === 500;

    if (isCudaError) {
      console.warn('[Ollama] CUDA error detected, retrying with CPU-only (num_gpu: 0)...');
      try {
        res = await fetch(`${OLLAMA_BASE}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body(0),  // Force CPU
          signal: AbortSignal.timeout(180_000),  // CPU is slower — 3 min timeout
        });
      } catch {
        throw new Error('Ollama failed even in CPU mode. Check: ollama ps and restart the server.');
      }

      if (!res.ok) {
        throw new Error(`Ollama CPU retry failed (${res.status}). Restart: ollama stop && ollama serve`);
      }
    } else {
      throw new Error(`Ollama error ${res.status}: ${errText.slice(0, 200)}`);
    }
  }

  const data = await res.json();
  return (data.response || '') as string;
}

/** Extract readable text from a file (PDF/DOCX/TXT) */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  // PDF and Word (.docx) need real parsers — reading them as raw text yields
  // binary/zip garbage. Delegate to the shared resume extractor.
  if (
    type === 'application/pdf' || name.endsWith('.pdf') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')
  ) {
    try {
      const { extractTextFromFile: extractUnified } = await import('./resumeExtraction');
      const text = (await extractUnified(file)).trim();
      if (text) {
        return text
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
          .replace(/\s{3,}/g, ' ')
          .trim()
          .slice(0, 6000);
      }
    } catch (e) {
      console.error('extractTextFromFile (pdf/docx) failed:', e);
    }
  }

  // .txt / plain text fallback.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string'
        ? reader.result
        : new TextDecoder('utf-8', { fatal: false }).decode(reader.result as ArrayBuffer);
      const clean = raw
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s{3,}/g, ' ')
        .trim()
        .slice(0, 6000);
      resolve(clean || 'No readable text found.');
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export interface EducationEntry {
  degree: string;
  institution: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  grade: string;
}

export interface PersonalDetails {
  name: string;
  email: string;
  phone: string;
  designation: string;
  location: string;
  yearsIT: number;
  education: EducationEntry[];
  missingInfoGaps: string[];
}

/**
 * AI-powered personal detail extraction.
 * Uses Ollama if available, otherwise falls back to regex.
 */
export async function extractPersonalDetailsAI(
  text: string,
  fullModelName: string
): Promise<PersonalDetails> {
  const snippet = text.slice(0, 2500);
  const prompt = `Extract personal details and education from this resume. Reply ONLY with JSON.
  
Resume:
${snippet}

Reply with this exact JSON format:
{
  "name": "full name",
  "email": "email",
  "phone": "phone number",
  "designation": "job title",
  "location": "city",
  "yearsIT": 0,
  "education": [{"degree": "...", "institution": "...", "fieldOfStudy": "...", "startDate": "...", "endDate": "...", "grade": "..."}],
  "missingInfoGaps": ["list any missing project data, gap years, or missing info here"]
}

Rules:
- name: full name
- email: email
- phone: phone
- designation: job title
- location: city
- yearsIT: total years of IT experience (number)
- education: list of degrees/certifications with details
- missingInfoGaps: array of strings identifying missing data (e.g. "Missing project details for 2020-2022", "Resume gap detected between 2018 and 2019")`;

  try {
    const raw = await ollamaGenerate(fullModelName, prompt, 800);
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    // Improved JSON extraction regex
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON block found in AI response');
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      name:        (parsed.name && typeof parsed.name === 'string' && parsed.name.length > 2) ? parsed.name.trim() : extractPersonalDetails(text).name,
      email:       (parsed.email && typeof parsed.email === 'string') ? parsed.email.trim() : extractPersonalDetails(text).email,
      phone:       (parsed.phone && typeof parsed.phone === 'string') ? parsed.phone.trim() : extractPersonalDetails(text).phone,
      designation: (parsed.designation && typeof parsed.designation === 'string') ? parsed.designation.trim() : extractPersonalDetails(text).designation,
      location:    (parsed.location && typeof parsed.location === 'string') ? parsed.location.trim() : extractPersonalDetails(text).location,
      yearsIT:     typeof parsed.yearsIT === 'number' ? parsed.yearsIT : extractPersonalDetails(text).yearsIT,
      education:   Array.isArray(parsed.education) ? parsed.education : [],
      missingInfoGaps: Array.isArray(parsed.missingInfoGaps) ? parsed.missingInfoGaps : []
    };
  } catch (err) {
    console.error('[Ollama] Extraction error:', err);
    // Silent fallback to regex
    return { ...extractPersonalDetails(text), education: [], missingInfoGaps: [] };
  }
}

/**
 * Regex-based personal detail extraction (offline fallback).
 */
export function extractPersonalDetails(text: string): PersonalDetails {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : '';

  const phoneMatch = text.match(/(?:\+91[\s-]?)?(?:\(?[0-9]{3,5}\)?[\s-]?)?[0-9]{3,5}[\s-]?[0-9]{4,5}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : '';

  let name = '';
  for (const line of lines.slice(0, 8)) {
    if (/^[A-Za-z]+(?: [A-Za-z]+){1,3}$/.test(line) && line.length > 4 && line.length < 50) {
      name = line; break;
    }
  }

  const titlePatterns = [
    /(?:Senior |Lead |Principal |Associate )?(QA|QI|SDET|Test|Quality|Automation|DevOps|Software|Full.?Stack|Data|AI|ML|Cloud)\s+(?:Engineer|Analyst|Architect|Developer|Lead|Manager|Consultant|Specialist)/i,
    /(?:Software|Application|Systems?) (?:Engineer|Developer|Architect)/i,
    /(?:Project|Program|Delivery|Technical) (?:Manager|Lead|Director)/i,
    /Scrum Master|Product Owner|Business Analyst|System Analyst/i,
  ];
  let designation = '';
  for (const line of lines.slice(0, 20)) {
    for (const pat of titlePatterns) {
      if (pat.test(line)) { designation = line.replace(/[|•·,]/g, '').trim().slice(0, 80); break; }
    }
    if (designation) break;
  }

  const locationMatch = text.match(/(?:Bangalore|Bengaluru|Mumbai|Pune|Hyderabad|Chennai|Delhi|Noida|Gurgaon|Kolkata|Ahmedabad|Jaipur|Kochi|Coimbatore|Indore)[,\s]?(?:Karnataka|Maharashtra|Telangana|Tamil Nadu|UP|Haryana|WB|Gujarat|Rajasthan|Kerala|MP)?/i);
  const location = locationMatch ? locationMatch[0].trim() : '';

  const expMatch = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:(?:total\s+)?(?:IT\s+)?(?:work\s+)?(?:professional\s+)?(?:industry\s+)?)?experience/i)
    || text.match(/experience\s+of\s+(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  const yearsIT = expMatch ? parseFloat(expMatch[1]) : 0;

  return { name, email, phone, designation, location, yearsIT, education: [], missingInfoGaps: [] };
}



export interface DetectedSkill {
  skillId: string;
  skillName: string;
  category: string;
  selfRating: ProficiencyLevel;
  confidence: number;
  reason: string;
}

/** Analyze resume text — detect BOTH profile details + QI skills using AI */
export async function analyzeResumeWithOllama(
  resumeText: string,
  fullModelName: string
): Promise<DetectedSkill[]> {
  const skillList = SKILLS.map(s => `${s.id}:${s.name}`).join(', ');
  const resume = resumeText.slice(0, 3000);

  const prompt = `List QI skills found in this resume. Use only these skill IDs: ${skillList}

Resume:
${resume}

Reply ONLY with a JSON array (no markdown, no explanation):
[{"skillId":"s1","selfRating":2,"reason":"brief reason"}]

Rules: selfRating 1=Beginner 2=Intermediate 3=Expert. Only include skills clearly mentioned.`;

  let raw: string;
  try {
    raw = await ollamaGenerate(fullModelName, prompt, 600);
  } catch (e) {
    throw new Error(`Resume analysis failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI response did not return valid JSON. Try again.');

  let parsed: Array<{ skillId: string; selfRating: number; confidence?: number; reason?: string }>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Could not parse AI response JSON. Try again.');
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(p => p.skillId && SKILLS.find(s => s.id === p.skillId))
    .map(p => {
      const skill = SKILLS.find(s => s.id === p.skillId)!;
      return {
        skillId:    p.skillId,
        skillName:  skill.name,
        category:   skill.category,
        selfRating: Math.max(1, Math.min(3, Math.round(p.selfRating || 1))) as ProficiencyLevel,
        confidence: typeof p.confidence === 'number' ? p.confidence : 0.8,
        reason:     typeof p.reason === 'string' ? p.reason : '',
      };
    });
}

/** Generate AI skill growth report after submission */
export async function generateSkillReport(
  employeeName: string,
  ratings: SkillRating[],
  fullModelName: string
): Promise<{ strengths: string[]; gaps: string[]; suggestions: string[]; summary: string }> {

  const ratedSkills = SKILLS
    .map(s => {
      const r = ratings.find(r => r.skillId === s.id);
      return r && r.selfRating > 0 ? `- ${s.name} (${s.category}): Level ${r.selfRating}/3` : null;
    })
    .filter(Boolean)
    .join('\n') || 'None rated yet';

  const unratedNames = SKILLS
    .filter(s => !ratings.find(r => r.skillId === s.id && r.selfRating > 0))
    .slice(0, 8)
    .map(s => s.name)
    .join(', ');

  const completion = Math.round((ratings.filter(r => r.selfRating > 0).length / SKILLS.length) * 100);

  // Simple, strict prompt that small LLMs can reliably follow
  const prompt = `You are a QI career coach reviewing a skill self-assessment.

Employee: ${employeeName}
Completion: ${completion}% (${ratings.filter(r => r.selfRating > 0).length} of ${SKILLS.length} skills rated)

RATED SKILLS:
${ratedSkills}

UNRATED SKILLS (sample): ${unratedNames}

Return ONLY valid JSON, no markdown, no explanation:
{"strengths":["strength 1","strength 2","strength 3"],"gaps":["gap 1","gap 2","gap 3"],"suggestions":["action 1","action 2","action 3","action 4","action 5"],"summary":"2 sentence summary of the employee skill profile and top recommendation"}`;

  try {
    const raw = await ollamaGenerate(fullModelName, prompt, 800);

    // Extract JSON — handle cases where model wraps in markdown
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return generateFallbackReport(ratings);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return generateFallbackReport(ratings);
    }

    const toStrArr = (v: unknown, minLen = 1): string[] => {
      if (!Array.isArray(v)) return [];
      const arr = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      return arr.length >= minLen ? arr : [];
    };

    const strengths   = toStrArr(parsed.strengths,   1);
    const gaps        = toStrArr(parsed.gaps,         1);
    const suggestions = toStrArr(parsed.suggestions,  1);
    const summary     = typeof parsed.summary === 'string' && parsed.summary.trim().length > 10
      ? parsed.summary.trim()
      : '';

    // If AI returned empty arrays, fall back
    if (strengths.length === 0 || gaps.length === 0 || suggestions.length === 0 || !summary) {
      return generateFallbackReport(ratings);
    }

    return { strengths, gaps, suggestions, summary };
  } catch {
    return generateFallbackReport(ratings);
  }
}

// ─── Rich data-driven fallback report (no Ollama needed) ────────────────────
function generateFallbackReport(ratings: SkillRating[]) {
  // --- category analysis ---
  const categories = [...new Set(SKILLS.map(s => s.category))];
  const catStats = categories.map(cat => {
    const catSkills = SKILLS.filter(s => s.category === cat);
    const rated = catSkills.map(s => ratings.find(r => r.skillId === s.id)?.selfRating ?? 0);
    const ratedCount = rated.filter(v => v > 0).length;
    const avgLevel = ratedCount > 0 ? rated.filter(v => v > 0).reduce((a, b) => a + b, 0) / ratedCount : 0;
    const coverage = catSkills.length > 0 ? (ratedCount / catSkills.length) * 100 : 0;
    return { cat, avgLevel, coverage, ratedCount, total: catSkills.length };
  });

  // --- proficiency bands ---
  const expert       = SKILLS.filter(s => ratings.find(r => r.skillId === s.id)?.selfRating === 3);
  const intermediate = SKILLS.filter(s => ratings.find(r => r.skillId === s.id)?.selfRating === 2);
  const beginner     = SKILLS.filter(s => ratings.find(r => r.skillId === s.id)?.selfRating === 1);
  const unrated      = SKILLS.filter(s => !(ratings.find(r => r.skillId === s.id)?.selfRating));
  const completion   = Math.round((ratings.filter(r => r.selfRating > 0).length / SKILLS.length) * 100);

  // --- strengths: top categories by avgLevel --------------------------------
  const topCats = [...catStats].sort((a, b) => b.avgLevel - a.avgLevel).slice(0, 3);
  const strengths: string[] = [];
  if (expert.length > 0) {
    strengths.push(`🏆 Expert in ${expert.slice(0, 3).map(s => s.name).join(', ')} — ready to lead and mentor`);
  }
  if (intermediate.length > 0) {
    strengths.push(`✅ Solid intermediate proficiency in ${intermediate.slice(0, 3).map(s => s.name).join(', ')}`);
  }
  topCats.forEach(c => {
    if (c.avgLevel > 0 && c.coverage >= 60) {
      strengths.push(`📂 Strong ${c.cat} coverage: ${c.ratedCount}/${c.total} skills rated at avg Level ${c.avgLevel.toFixed(1)}/3`);
    }
  });
  if (strengths.length === 0) {
    strengths.push('📋 Skill profile set up — ready for structured QI capability assessment');
    strengths.push('🎯 All 7 skill categories available for a comprehensive evaluation');
  }

  // --- gaps: weakest areas + unrated priority skills -----------------------
  const gaps: string[] = [];
  const weakCats = [...catStats].sort((a, b) => a.avgLevel - b.avgLevel).filter(c => c.avgLevel > 0 && c.avgLevel < 1.5);
  weakCats.slice(0, 2).forEach(c => {
    gaps.push(`⚠️ ${c.cat}: Low avg proficiency (${c.avgLevel.toFixed(1)}/3) — targeted upskilling recommended`);
  });
  if (beginner.length > 0) {
    gaps.push(`📈 ${beginner.length} Beginner-level skills need attention: ${beginner.slice(0, 3).map(s => s.name).join(', ')}`);
  }
  if (unrated.length > 0) {
    gaps.push(`❓ ${unrated.length} skills not yet assessed — complete for a full QI profile`);
  }
  const lowCovCats = catStats.filter(c => c.coverage < 50 && c.ratedCount > 0);
  lowCovCats.slice(0, 1).forEach(c => {
    gaps.push(`📊 Only ${c.coverage.toFixed(0)}% coverage in ${c.cat} — rate remaining ${c.total - c.ratedCount} skills`);
  });
  if (gaps.length === 0) gaps.push('🎉 All skill areas have been assessed — great discipline!');

  // --- suggestions: actionable, data-driven --------------------------------
  const suggestions: string[] = [];

  // Upgrade beginner → intermediate
  if (beginner.length > 0) {
    suggestions.push(`📚 Priority: Upgrade ${beginner.slice(0, 2).map(s => s.name).join(' & ')} from Beginner → Intermediate. Take 1 online course per skill (Udemy/Coursera).`);
  }
  // Complete missing category
  const emptyCat = catStats.find(c => c.ratedCount === 0);
  if (emptyCat) {
    suggestions.push(`🔍 Explore ${emptyCat.cat} skills: ${SKILLS.filter(s => s.category === emptyCat.cat).map(s => s.name).slice(0, 3).join(', ')} — none rated yet.`);
  }
  // AI skills are high demand
  const aiSkills = SKILLS.filter(s => s.category === 'AI');
  const ratedAI = aiSkills.filter(s => (ratings.find(r => r.skillId === s.id)?.selfRating ?? 0) > 0);
  if (ratedAI.length < aiSkills.length) {
    suggestions.push(`🤖 AI Testing is the fastest-growing QI domain. Rate/upskill: ${aiSkills.filter(s => !(ratings.find(r => r.skillId === s.id)?.selfRating)).slice(0, 2).map(s => s.name).join(', ')} for maximum career impact.`);
  }
  // Get validation
  if (expert.length > 0) {
    suggestions.push(`🏅 Request manager validation for your ${expert.length} Expert-level skill${expert.length > 1 ? 's' : ''} (${expert.slice(0, 2).map(s => s.name).join(', ')}) to gain official recognition.`);
  }
  // DevOps push
  const devOpsSkills = catStats.find(c => c.cat === 'DevOps');
  if (devOpsSkills && devOpsSkills.avgLevel < 2) {
    suggestions.push('☁️ DevOps skills (Docker, Kubernetes, CI/CD) are mandatory for senior QI roles — invest 4 hours/week to level up.');
  }
  // 90-day goal
  const skillsToLevel = beginner.length;
  if (skillsToLevel > 0) {
    suggestions.push(`🗓️ 90-day goal: Move ${Math.min(3, skillsToLevel)} Beginner skills to Intermediate level. Track progress monthly.`);
  }
  // Certifications
  suggestions.push('🎓 Pursue ISTQB Advanced / Selenium Certification / AWS DevOps to add certified weight to your skill profile.');

  // --- summary --------------------------------------------------------------
  const topStrengthName = expert[0]?.name ?? intermediate[0]?.name ?? topCats[0]?.cat ?? 'QI skills';
  const dominantCat = topCats[0];
  const summary = `You have completed ${completion}% of your QI skill matrix (${ratings.filter(r => r.selfRating > 0).length}/${SKILLS.length} skills rated).
` +
  (expert.length > 0
    ? `Your standout strength is ${topStrengthName} at Expert level — positioning you as a subject matter expert. `
    : intermediate.length > 0
    ? `You show solid intermediate proficiency in ${topStrengthName} — strong foundation to build on. `
    : 'Your profile is being established — complete all skills for a comprehensive assessment. ') +
  (dominantCat && dominantCat.avgLevel > 0
    ? `${dominantCat.cat} is your strongest category (avg ${dominantCat.avgLevel.toFixed(1)}/3). `
    : '') +
  (beginner.length > 0
    ? `Focus on elevating your ${beginner.length} Beginner-level skills to Intermediate to significantly boost your capability score.`
    : unrated.length > 0
    ? `Complete the remaining ${unrated.length} unrated skills to get full insights and a personalized growth roadmap.`
    : '🎉 All skills rated — focus on Expert-level validation and manager endorsements.');

  return { strengths, gaps, suggestions, summary };
}


/** Apply AI-detected skills into existing ratings (only pre-fills, doesn't overwrite existing non-zero) */
export function applyDetectedSkills(
  existing: SkillRating[],
  detected: DetectedSkill[]
): SkillRating[] {
  return existing.map(r => {
    const found = detected.find(d => d.skillId === r.skillId);
    // Only apply if currently unrated OR if AI confidence is high
    if (found && (r.selfRating === 0)) {
      return { ...r, selfRating: found.selfRating, aiDetected: true };
    }
    return r;
  });
}

/**
 * Chat with Ollama using a custom context (for AI Coach).
 * Simple one-shot prompt — no multi-turn history management.
 */
export async function ollamaChatWithContext(
  fullModelName: string,
  userMessage: string,
  context: string
): Promise<string> {
  // context is now the full system instruction (already includes user's skill data)
  const prompt = context
    ? `${context}\n\nUser says: "${userMessage}"\n\nRespond naturally:`
    : `You are a helpful QI career coach. User says: "${userMessage}"\n\nRespond in 2-3 sentences:`;

  const raw = await ollamaGenerate(fullModelName, prompt, 250);
  return raw.trim() || "I'll need a moment to think about that. Try rephrasing your question!";
}

