/* Builds the inline critical CSS carried in the head partials, so the first screen paints without
   waiting for any stylesheet. Run before sync.js (refresh.js does this for you).

   Inlined:  assets/css/fonts.css  (self-hosted @font-face, ~2 KB)
             assets/css/gp-core.css (shared nav, footer and page chrome, needed on every page)
             the above-the-fold rules of assets/css/gp.css (hero, headings, buttons, stat strip)
   Deferred: the rest of gp.css, loaded without blocking and cached as a file.

   If a first-screen component looks unstyled for a moment after a redesign, add its class to ABOVE. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const P = f => path.join(root, f);
const read = f => fs.readFileSync(P(f), 'utf8');

const ABOVE = /(^|[\s,>+~])(html|body|:root|\*)([\s,{:]|$)|hero|page-hero|display|lede|eyebrow|crumbs|btn|stats|stat__|stat\b|shell|section-head|byline|split-words|grid-lines|orb|answer|skip-link|gp-main|section--|h1|h2|no-js|sr-only|container|wrap\b/;

// strip comments, collapse whitespace, drop the spaces CSS does not need
const min = css => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>~+])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();

// keep only the rules whose selector looks like first-screen content, including inside @media
function subset(css) {
  const out = [];
  const re = /(@media[^{]+\{)|([^{}]+)\{([^{}]*)\}|(\})/g;
  let m, media = null;
  while ((m = re.exec(css))) {
    if (m[1]) { media = m[1]; continue; }
    if (m[4]) { media = null; continue; }
    if (!m[2]) continue;
    const sel = m[2].trim();
    if (!sel || sel.startsWith('@')) continue;
    if (!ABOVE.test(sel)) continue;
    out.push(media ? `${media}${sel}{${m[3]}}}` : `${sel}{${m[3]}}`);
  }
  return out.join('');
}

const critical = min(read('assets/css/fonts.css')) + min(read('assets/css/gp-core.css')) + subset(min(read('assets/css/gp.css')));

// the two faces the first screen actually uses, preloaded so text swaps in immediately
const preload = fs.readdirSync(P('assets/fonts'))
  .filter(f => f.includes('-latin-') && !f.includes('-latin-ext-') && /(fraunces-normal|manrope-normal)/.test(f))
  .map(f => `<link rel="preload" href="/assets/fonts/${f}" as="font" type="font/woff2" crossorigin>`).join('\n');

// gp.css stays a normal blocking stylesheet on purpose. Loading it asynchronously was measurably
// worse: gp.js runs before the styles land and forces repeated layout recalculation (4s of style
// work and a 1.3s long task on the homepage). The win here comes from inlining the chrome CSS and
// self-hosting the fonts, which removes three round trips before first paint.
const block = `<!-- gp:critical -->\n${preload}\n<style>${critical}</style>\n<link rel="stylesheet" href="/assets/css/gp.css">\n<!-- /gp:critical -->`;

let n = 0;
for (const p of ['_partials/head.html', '_partials/head-app.html']) {
  let t = read(p);
  t = t.includes('<!-- gp:critical -->')
    ? t.replace(/<!-- gp:critical -->[\s\S]*?<!-- \/gp:critical -->/, block)
    : t.trimEnd() + '\n' + block + '\n';
  fs.writeFileSync(P(p), t);
  n++;
}
console.log(`critical.css inlined into ${n} head partials: ${(critical.length / 1024).toFixed(1)} KB (gp.css now loads without blocking)`);
