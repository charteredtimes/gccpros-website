/* House-rule checks. Exit code 1 if any fail, so the nightly refresh never publishes a broken site.
   1. No em-dashes anywhere in the site (character, entity or escape).
   2. Every inline script, JSON-LD block, .js and .json file parses.
   3. No yellow, amber, gold or orange colour values in CSS or inline styles.
   4. Element nesting balances, so a mistyped closing tag cannot quietly restructure a page.
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

// 4. element nesting
// Two links on /about were closed with </div> instead of </a>. Nothing complained: the page still
// rendered, the card simply ended early and the rest of its paragraph became a sibling, which left a
// hole in the grid. A browser silently repairs this, so it has to be caught here.
// Only elements that always carry a closing tag are tracked; p and li may be closed implicitly, and
// the void elements never are.
const TRACK = /^(div|section|main|article|aside|nav|header|footer|a|ul|ol|table|form|details|summary|figure|figcaption|button|h1|h2|h3|h4|h5|h6|span|em|strong|label|select|blockquote)$/;
for (const f of files.filter(f => /\.html$/i.test(f))) {
  const s = fs.readFileSync(f, 'utf8')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '');
  const stack = [];
  let bad = 0;
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const [, close, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (!TRACK.test(name)) continue;
    if (attrs.trimEnd().endsWith('/')) continue;
    if (!close) { stack.push({ name, at: m.index }); continue; }
    if (!stack.length) { problems.push(`nesting: ${rel(f)}: stray </${name}>`); bad++; continue; }
    const top = stack[stack.length - 1];
    if (top.name === name) { stack.pop(); continue; }
    // a closing tag that does not match what is open: report it with the text around it
    const ctx = s.slice(Math.max(0, m.index - 70), m.index + 20).replace(/\s+/g, ' ');
    problems.push(`nesting: ${rel(f)}: </${name}> closes <${top.name}> ...${ctx}...`);
    bad++;
    // resync on the nearest matching open tag so one mistake does not cascade
    const back = stack.map(x => x.name).lastIndexOf(name);
    if (back >= 0) stack.length = back; else stack.pop();
    if (bad >= 5) break;
  }
  if (!bad && stack.length) problems.push(`nesting: ${rel(f)}: ${stack.length} unclosed <${stack[stack.length - 1].name}>`);
}

// 5. stat strips declare their own column count
// .stats is a grid of repeat(var(--n,3)). A strip of four stats without --n falls back to three
// columns and leaves the fourth alone on a row of its own with two empty cells beside it. That was
// live on 14 pages. buildpages.js now emits --n; this catches a hand-built page that forgets it.
for (const f of files.filter(f => /\.html$/i.test(f))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<div class="stats"([^>]*)>([\s\S]*?)(?=<div class="stats"|<\/section>|$)/g)) {
    const count = (m[2].match(/<div class="stat"/g) || []).length;
    if (count < 2) continue;
    const n = (m[1].match(/--n:\s*(\d+)/) || [])[1];
    if (!n) problems.push(`stats: ${rel(f)}: a strip of ${count} stats has no --n, so it renders in 3 columns`);
    else if (+n !== count) problems.push(`stats: ${rel(f)}: --n is ${n} but the strip holds ${count} stats`);
  }
}

const uniq = [...new Set(problems)];
if (uniq.length) { console.error(`CHECKS FAILED (${uniq.length}):\n  ` + uniq.slice(0, 60).join('\n  ') + (uniq.length > 60 ? `\n  ...and ${uniq.length - 60} more` : '')); process.exit(1); }
console.log('checks passed: no em-dashes, all scripts and JSON parse, no banned accent colours, tags balance');
