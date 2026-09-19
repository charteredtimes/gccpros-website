#!/usr/bin/env node
/* Keeps shared chrome in sync across pages. Run from the repo root:  node _tools/sync.js
   - Replaces content between marker pairs with the matching file in _partials/:
       <!-- gp:head -->…<!-- /gp:head -->   <!-- gp:nav -->…<!-- /gp:nav -->   <!-- gp:footer -->…<!-- /gp:footer -->
   - Stamps a content hash onto /assets/css/gp.css and /assets/js/gp.js references (cache busting).
   - Regenerates sitemap.xml from pages that carry <link rel="canonical"> and no noindex. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const hash = f => crypto.createHash('md5').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 8);
const parts = { head: read('_partials/head.html'), 'head-app': read('_partials/head-app.html'), nav: read('_partials/nav.html'), footer: read('_partials/footer.html') };
const ver = { core: hash('assets/css/gp-core.css'), css: hash('assets/css/gp.css'), js: hash('assets/js/gp.js') };
let changed = 0; const urls = [];
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  let c = read(f), o = c;
  for (const [k, v] of Object.entries(parts)) {
    const re = new RegExp(`(<!-- gp:${k} -->)[\\s\\S]*?(<!-- /gp:${k} -->)`, 'g');
    c = c.replace(re, (_, a, b) => `${a}\n${v.trim()}\n${b}`);
  }
  c = c.replace(/\/assets\/css\/gp-core\.css(\?v=[\w]+)?/g, '/assets/css/gp-core.css?v=' + ver.core)
       .replace(/\/assets\/css\/gp\.css(\?v=[\w]+)?/g, '/assets/css/gp.css?v=' + ver.css)
       .replace(/\/assets\/js\/gp\.js(\?v=[\w]+)?/g, '/assets/js/gp.js?v=' + ver.js);
  if (c !== o) { fs.writeFileSync(path.join(root, f), c); changed++; }
  const canon = (c.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(c);
  const refresh = /http-equiv="refresh"/i.test(c);
  if (canon && !noindex && !refresh && !canon.includes('#')) {
    const pri = (c.match(/<meta name="gp:priority" content="([\d.]+)"/) || [])[1] || '0.7';
    urls.push({ loc: canon, pri });
  }
}
const today = new Date().toISOString().slice(0, 10);
const uniq = [...new Map(urls.map(u => [u.loc, u])).values()].sort((a, b) => b.pri - a.pri || a.loc.localeCompare(b.loc));
fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniq.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`);
console.log(`synced ${changed} file(s); sitemap: ${uniq.length} urls; css ${ver.css} js ${ver.js}`);
