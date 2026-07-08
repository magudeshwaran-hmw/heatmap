// Bundles the TypeScript question bank (src/data/questionBank/index.ts) and dumps its
// QUESTION_BANK to a JSON the CJS server can require + seed into the DB on startup.
// Run via `npm run gen:qbank` (also on prebuild). Keeps the built-in questions
// (Python, SQL, Selenium, API Testing, …) as the single source that lands in Postgres.
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

(async () => {
  const entry = path.join(__dirname, '..', 'src', 'data', 'questionBank', 'index.ts');
  const result = await esbuild.build({
    entryPoints: [entry], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  const QB = mod.exports.QUESTION_BANK || {};

  const skills = [];
  for (const [skill, bank] of Object.entries(QB)) {
    const rec = { skill };
    if (bank.beginner) rec.beginner = { mcq: bank.beginner.mcq || [], toolId: bank.beginner.toolId || [], practical: bank.beginner.practical || [] };
    if (bank.intermediate) rec.intermediate = { mcq: bank.intermediate.mcq || [], coding: bank.intermediate.coding || [], scenarios: bank.intermediate.scenarios || [], framework: bank.intermediate.framework || [] };
    skills.push(rec);
  }
  const dest = path.join(__dirname, '..', 'src', 'data', 'questionBank.generated.json');
  fs.writeFileSync(dest, JSON.stringify({ skills }));
  const counts = skills.map(s => `${s.skill}(${(s.beginner?.mcq?.length || 0)}B/${(s.intermediate?.mcq?.length || 0)}I)`).join(', ');
  console.log(`✅ Wrote ${skills.length} built-in skills → ${path.relative(process.cwd(), dest)}`);
  console.log('   ' + counts);
})().catch(e => { console.error('gen-question-bank failed:', e.message); process.exit(1); });
