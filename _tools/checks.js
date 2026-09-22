/* House-rule checks. Exit code 1 if any fail, so the nightly refresh never publishes a broken site.
   1. No em-dashes anywhere in the site (character, entity or escape).
   2. Every inline script, JSON-LD block, .js and .json file parses.
   3. No yellow, amber, gold or orange colour values in CSS or inline styles.
   Run: node _tools/checks.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const problems = [];
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (/^(\.git|node_modules|\.claude|functions)$/.test(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(root);
const rel = p => path.relative(root, p).replace(/\\/g, '/');

// 1. em-dashes
const DASH = /—|&mdash;|&#8212;|&#x2014;|\\u2014/g;
for (const f of files.filter(f => /\.(html|js|css|json|txt|md|xml|svg|webmanifest)$/i.test(f) && !rel(f).startsWith('_tools/'))) { // tooling must name the character to detect it
  const s = fs.readFileSync(f, 'utf8'); let m;
  while ((m = DASH.exec(s))) problems.push(`em-dash: ${rel(f)}: ...${s.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}...`);
}

// 2. parsing
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (/\.json$/i.test(f)) { try { JSON.parse(s); } catch (e) { problems.push(`json: ${rel(f)}: ${e.message}`); } continue; }
  if (/\.js$/i.test(f) && !/\.mjs$/i.test(f)) { try { new vm.Script(s, { filename: f }); } catch (e) { problems.push(`js: ${rel(f)}: ${e.message}`); } continue; }
  if (!/\.html$/i.test(f)) continue;
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi; let m, i = 0;
  while ((m = re.exec(s))) {
    i++; const attrs = m[1] || '';
    if (/src=/i.test(attrs) || !m[2].trim()) continue;
    if (/type=["']?application\/(ld\+)?json/i.test(attrs)) { try { JSON.parse(m[2]); } catch (e) { problems.push(`ld+json: ${rel(f)} #${i}: ${e.message}`); } continue; }
    if (/type=["']?(module|text\/template|text\/html)/i.test(attrs)) continue;
    try { new vm.Script(m[2], { filename: f + '#' + i }); } catch (e) { problems.push(`script: ${rel(f)} #${i}: ${e.message}`); }
  }
}

// 3. banned accent colours (hex values in the yellow/amber/orange/gold hue band, and named colours)
const hue = hex => {
  const h = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.18 || mx < 0.35) return null; // greys, near-neutrals and very dark tones are not accents
  let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (H * 60 + 360) % 360;
};
for (const f of files.filter(f => /\.(css|html)$/i.test(f) && !/^(admin|console|talent-admin|customer-portal|expert-|awards-admin|council-console|council-demo|console-demo|candidate-referral|database-pro|cv-view|reset|utm|r\.html)/.test(path.basename(f)))) {
  const s = fs.readFileSync(f, 'utf8').replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/g, '')
    // Google's "G" sign-in mark must use Google's own colours (brand guidelines); it is a logo, not an accent
    .replace(/<svg\b[^>]*>(?:(?!<\/svg>)[\s\S])*?(?:#4285F4|#1976D2)(?:(?!<\/svg>)[\s\S])*?<\/svg>/gi, '');
  for (const m of s.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const H = hue(m[1]);
    if (H !== null && H >= 28 && H <= 62) problems.push(`colour: ${rel(f)}: #${m[1]} (hue ${Math.round(H)}, in the yellow/amber/orange band)`);
  }
  for (const m of s.matchAll(/:\s*(gold|orange|yellow|amber|goldenrod|darkorange)\b/gi)) problems.push(`colour: ${rel(f)}: named colour "${m[1]}"`);
}

const uniq = [...new Set(problems)];
if (uniq.length) { console.error(`CHECKS FAILED (${uniq.length}):\n  ` + uniq.slice(0, 60).join('\n  ') + (uniq.length > 60 ? `\n  ...and ${uniq.length - 60} more` : '')); process.exit(1); }
console.log('checks passed: no em-dashes, all scripts and JSON parse, no banned accent colours');
