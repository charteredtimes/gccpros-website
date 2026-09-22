#!/usr/bin/env node
/* One command to bring every figure on the site in line with the live database.
     node _tools/refresh.js            (from the repo root; the nightly GitHub Action runs the same)
   1. buildatlas.js  - public.atlas_stats()  -> assets/data/gcc-atlas.json
   2. buildpages.js  - gcc-atlas.json        -> Atlas, 6 city pages, what-is-a-gcc
   3. stats.js       - atlas + public.site_stats() -> assets/data/site-stats.json
   4. sync.js        - stamps every figure into every page, meta tag, JSON-LD block and llms.txt,
                       refreshes partials, dates and the sitemap, and fails on any stale figure
   5. checks.js      - house rules: no em-dashes, everything parses, no banned accent colours
   Stops at the first failure, so a half-updated site is never published. */
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const steps = ['buildatlas.js', 'buildpages.js', 'stats.js', 'sync.js', 'checks.js'];
for (const s of steps) {
  process.stdout.write(`\n> ${s}\n`);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nrefresh stopped: ${s} failed (exit ${r.status}). Nothing further was changed.`); process.exit(1); }
}
console.log('\nrefresh complete: every figure on the site matches the database.');
