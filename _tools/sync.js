#!/usr/bin/env node
/* Keeps shared chrome and every quoted figure in sync across the site. Run from the repo root:
     node _tools/sync.js            (normally via: node _tools/refresh.js)
   1. Partials: replaces content between marker pairs with the matching file in _partials/:
        <!-- gp:head -->...<!-- /gp:head -->  <!-- gp:nav -->...  <!-- gp:footer -->...
   2. Cache busting: stamps a content hash onto gp-core.css, gp.css, gp.js and gp-map.js references.
   3. Figures, from assets/data/site-stats.json (built by stats.js from the live database):
        <span data-stat="india">2,503</span>                 visible text: inner text is replaced
        <title data-stat-tpl="... {{india}} ...">...</title>  titles: text rendered from the template
        <meta content="..." data-stat-tpl="...{{india}}...">  meta tags: content rendered from the template
        <script type="application/ld+json" data-stat-tpl="{...{{india}}...}">  JSON-LD: body rendered
      Templates also accept {{updated}} and {{updated_iso}}: the date this page's content last changed.
   4. Dates: <time data-updated> elements show that same date. It only moves when the page's content
      (ignoring the date itself) actually changes, so it is an honest "last updated".
   5. llms.txt is rendered from _partials/llms.txt.
   6. sitemap.xml from pages with a canonical and no noindex, lastmod = the page's real updated date.
   7. Guard: fails if any figure the site has ever published appears outside a stamped slot. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const P = f => path.join(root, f);
const read = f => fs.readFileSync(P(f), 'utf8');
const hash = f => crypto.createHash('md5').update(fs.readFileSync(P(f))).digest('hex').slice(0, 8);
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const parts = { head: read('_partials/head.html'), 'head-app': read('_partials/head-app.html'), nav: read('_partials/nav.html'), footer: read('_partials/footer.html') };
const ver = { core: hash('assets/css/gp-core.css'), css: hash('assets/css/gp.css'), js: hash('assets/js/gp.js'), map: hash('assets/js/gp-map.js') };

// ---- figures ------------------------------------------------------------------------------
const STATS = fs.existsSync(P('assets/data/site-stats.json')) ? JSON.parse(read('assets/data/site-stats.json')).values : {};
const HIST_F = '_tools/stat-history.json';
const HIST = fs.existsSync(P(HIST_F)) ? JSON.parse(read(HIST_F)) : {};
const DATES_F = '_tools/page-dates.json';
const DATES = fs.existsSync(P(DATES_F)) ? JSON.parse(read(DATES_F)) : {};
const todayISO = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST, not UTC
const longDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const unattr = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrEsc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const errors = [];

function render(tpl, file, extra) {
  return tpl.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, k) => {
    if (k in extra) return extra[k];
    if (!(k in STATS)) { errors.push(`${file}: unknown figure {{${k}}}`); return `{{${k}}}`; }
    return STATS[k];
  });
}

// strip everything sync.js itself writes, so a page's fingerprint only moves when its real content does
function fingerprint(c) {
  return md5(c
    .replace(/(<span data-stat="[a-z0-9_]+">)[^<]*(<\/span>)/g, '$1$2')
    .replace(/(<time data-updated[^>]*>)[^<]*(<\/time>)/g, '$1$2')
    .replace(/(<time data-updated) datetime="[^"]*"/g, '$1')
    .replace(/(<title data-stat-tpl="[^"]*">)[^<]*(<\/title>)/g, '$1$2')
    .replace(/(<meta [^>]*?)content="[^"]*"([^>]*data-stat-tpl)/g, '$1$2')
    .replace(/(<script type="application\/ld\+json" data-stat-tpl="[^"]*">)[\s\S]*?(<\/script>)/g, '$1$2')
    .replace(/\?v=[\w]+/g, ''));
}

function stamp(c, file) {
  // page date first (it can feed templates)
  const fp = fingerprint(c);
  if (!DATES[file] || DATES[file].fp !== fp) DATES[file] = { fp, date: todayISO };
  const upd = DATES[file].date;
  const extra = { updated: longDate(upd), updated_iso: upd };

  c = c.replace(/(<span data-stat="([a-z0-9_]+)">)[^<]*(<\/span>)/g, (m, a, k, b) => {
    if (!(k in STATS)) { errors.push(`${file}: unknown figure data-stat="${k}"`); return m; }
    return a + STATS[k] + b;
  });
  c = c.replace(/(<time data-updated)(?: datetime="[^"]*")?([^>]*>)[^<]*(<\/time>)/g, (_, a, b, e) => `${a} datetime="${upd}"${b}${extra.updated}${e}`);
  c = c.replace(/(<title data-stat-tpl="([^"]*)">)[^<]*(<\/title>)/g, (_, a, tpl, b) => a + render(unattr(tpl), file, extra) + b);
  c = c.replace(/<meta ([^>]*?)data-stat-tpl="([^"]*)"([^>]*)>/g, (m, pre, tpl, post) => {
    const val = attrEsc(render(unattr(tpl), file, extra));
    let tag = `<meta ${pre}data-stat-tpl="${tpl}"${post}>`;
    return /content="/.test(tag) ? tag.replace(/content="[^"]*"/, `content="${val}"`) : tag.replace('<meta ', `<meta content="${val}" `);
  });
  c = c.replace(/(<script type="application\/ld\+json" data-stat-tpl="([^"]*)">)[\s\S]*?(<\/script>)/g, (_, a, tpl, b) => {
    const json = render(unattr(tpl), file, extra);
    try { JSON.parse(json); } catch (e) { errors.push(`${file}: JSON-LD template does not render to valid JSON (${e.message})`); }
    return a + json.replace(/<\/script/gi, '<\\/script') + b;
  });
  return c;
}

// ---- guard: any figure ever published must sit inside a slot ------------------------------
// <span data-stat-ignore>...</span> marks a number that only looks like a site figure (a sample record, a price)
//
// JSON-LD is policed like any other content. It used to be skipped whole, which let hand-typed
// figures sit in structured data and go stale unseen: /data and /research were serving 4,506 GCCs in
// their schema long after the site said 4,611, and structured data is precisely what search engines
// and AI answer engines read. So the rendered body is dropped (sync writes it) but the template is
// kept and searched, minus its {{slots}}.
function unslotted(c) {
  return c
    .replace(/<span data-stat-ignore>[\s\S]*?<\/span>/g, '')
    .replace(/<span data-stat="[a-z0-9_]+">[^<]*<\/span>/g, '')
    .replace(/<title data-stat-tpl="[^"]*">[^<]*<\/title>/g, '')
    .replace(/<meta [^>]*data-stat-tpl[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json"([^>]*)>([\s\S]*?)<\/script>/g, (_, attrs, body) => {
      const tpl = (attrs.match(/data-stat-tpl="([^"]*)"/) || [])[1];
      // no template means the body is hand-written, so the body is what gets policed
      return tpl === undefined ? body : unattr(tpl).replace(/\{\{[a-z0-9_]+\}\}/g, '');
    })
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
}
// Figures distinctive enough to police: four-digit counts. Small numbers (e.g. "20", "364") are too
// common in ordinary prose to police blindly; they must simply be written as slots.
const POLICED = ['world', 'world_floor', 'india', 'india_floor', 'bengaluru', 'setup_captive', 'setup_recorded'];

// ---- run ----------------------------------------------------------------------------------
let changed = 0; const urls = []; const PAGE_DATE = {};
const GUARD_EXEMPT = /^(admin|console|council-console|expert-|talent-admin|customer-portal|cv-view|r\.html|reset|utm|gccpros-auth|awards-admin|council-demo|console-demo|candidate-referral|database-pro)/;
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  let c = read(f), o = c;
  for (const [k, v] of Object.entries(parts)) {
    const re = new RegExp(`(<!-- gp:${k} -->)[\\s\\S]*?(<!-- /gp:${k} -->)`, 'g');
    c = c.replace(re, (_, a, b) => `${a}\n${v.trim()}\n${b}`);
  }
  c = c.replace(/\/assets\/css\/gp-core\.css(\?v=[\w]+)?/g, '/assets/css/gp-core.css?v=' + ver.core)
       .replace(/\/assets\/css\/gp\.css(\?v=[\w]+)?/g, '/assets/css/gp.css?v=' + ver.css)
       .replace(/\/assets\/js\/gp\.js(\?v=[\w]+)?/g, '/assets/js/gp.js?v=' + ver.js)
       .replace(/\/assets\/js\/gp-map\.js(\?v=[\w]+)?/g, '/assets/js/gp-map.js?v=' + ver.map);
  if (Object.keys(STATS).length) c = stamp(c, f);
  if (c !== o) { fs.writeFileSync(P(f), c); changed++; }
  PAGE_DATE[f] = (DATES[f] && DATES[f].date) || todayISO;

  if (!GUARD_EXEMPT.test(f)) {
    const bare = unslotted(c);
    for (const k of POLICED) for (const old of (HIST[k] || [])) {
      if (old !== STATS[k] && bare.includes(old)) errors.push(`${f}: stale figure "${old}" (${k} is now ${STATS[k]}) outside a data-stat slot`);
    }
  }
  const canon = (c.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(c);
  const refresh = /http-equiv="refresh"/i.test(c);
  if (canon && !noindex && !refresh && !canon.includes('#')) {
    const pri = (c.match(/<meta name="gp:priority" content="([\d.]+)"/) || [])[1] || '0.7';
    urls.push({ loc: canon, pri, lastmod: PAGE_DATE[f] });
  }
}

// llms.txt from its template
if (fs.existsSync(P('_partials/llms.txt')) && Object.keys(STATS).length) {
  const txt = render(read('_partials/llms.txt'), 'llms.txt', { updated: longDate(todayISO), updated_iso: todayISO });
  if (!fs.existsSync(P('llms.txt')) || read('llms.txt') !== txt) { fs.writeFileSync(P('llms.txt'), txt); changed++; }
  for (const k of POLICED) for (const old of (HIST[k] || [])) if (old !== STATS[k] && txt.includes(old)) errors.push(`llms.txt: stale figure "${old}"`);
}

// remember every value ever published, so the guard can catch it if it reappears
for (const [k, v] of Object.entries(STATS)) { HIST[k] = HIST[k] || []; if (!HIST[k].includes(v)) HIST[k].push(v); }
fs.writeFileSync(P(HIST_F), JSON.stringify(HIST, null, 1) + '\n');
fs.writeFileSync(P(DATES_F), JSON.stringify(Object.fromEntries(Object.entries(DATES).sort()), null, 1) + '\n');

const uniq = [...new Map(urls.map(u => [u.loc, u])).values()].sort((a, b) => b.pri - a.pri || a.loc.localeCompare(b.loc));
fs.writeFileSync(P('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniq.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`);
console.log(`synced ${changed} file(s); sitemap: ${uniq.length} urls; ${Object.keys(STATS).length} figures; css ${ver.css} js ${ver.js}`);
if (errors.length) { console.error('\nSYNC PROBLEMS (' + errors.length + '):\n  ' + errors.join('\n  ')); process.exit(1); }
