/**
 * gen-taxonomy.cjs — generate a server-readable JSON of the QE taxonomy.
 *
 * The taxonomy lives in ONE place: src/lib/qeSkillTaxonomy.ts. The CommonJS backend
 * can't import that TS module, so rather than hand-copy 166 skills (which would drift),
 * we parse the QE_TAXONOMY array literal out of the TS file and emit a flat JSON with
 * the SAME stable ids the frontend computes (QE_ALL_SKILLS). Re-run after editing the
 * taxonomy:  node scripts/gen-taxonomy.cjs
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'lib', 'qeSkillTaxonomy.ts');
const outPath = path.join(__dirname, '..', 'src', 'data', 'qeTaxonomy.generated.json');

const src = fs.readFileSync(srcPath, 'utf8');

// Locate the QE_TAXONOMY array literal and extract it by bracket-matching.
const decl = src.indexOf('export const QE_TAXONOMY');
if (decl === -1) throw new Error('QE_TAXONOMY not found');
// Start at the `=` so we skip the `QESkillGroup[]` type annotation's brackets.
const eq = src.indexOf('=', decl);
const arrStart = src.indexOf('[', eq);
let depth = 0, end = -1, inStr = false, quote = '', esc = false;
for (let i = arrStart; i < src.length; i++) {
  const ch = src[i];
  if (inStr) {
    if (esc) { esc = false; }
    else if (ch === '\\') { esc = true; }
    else if (ch === quote) { inStr = false; }
    continue;
  }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = true; quote = ch; continue; }
  if (ch === '[') depth++;
  else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
}
if (end === -1) throw new Error('Could not bracket-match QE_TAXONOMY');
const literal = src.slice(arrStart, end + 1);

// The literal uses the s(name, ...keywords) DSL plus a couple of family-name
// constants. Pull those string constants out of the source so eval can resolve them.
const constRe = /const\s+([A-Z0-9_]+)\s*=\s*(['"`])((?:\\.|(?!\2).)*)\2\s*;/g;
let cm;
const consts = {};
while ((cm = constRe.exec(src)) !== null) consts[cm[1]] = cm[3];
const AI_FOR_QE_FAMILY = consts.AI_FOR_QE_FAMILY;
const QE_FOR_AI_FAMILY = consts.QE_FOR_AI_FAMILY;
const s = (name, ...keywords) => ({ name, keywords });
// eslint-disable-next-line no-eval
const QE_TAXONOMY = eval(literal);

const flat = [];
let id = 1;
for (const g of QE_TAXONOMY) {
  for (const sk of g.skills) {
    flat.push({ id: id++, family: g.family, group: g.group, name: sk.name, keywords: sk.keywords });
  }
}

const families = Array.from(new Set(flat.map(f => f.family)));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ count: flat.length, families, skills: flat }, null, 2));
console.log(`✅ Wrote ${flat.length} skills across ${families.length} families → ${path.relative(process.cwd(), outPath)}`);
