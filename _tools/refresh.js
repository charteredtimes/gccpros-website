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
const steps = ['buildatlas.js', 'buildpages.js', 'stats.js', 'critical.js', 'sync.js', 'checks.js'];
for (const s of steps) {
  process.stdout.write(`\n> ${s}\n`);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nrefresh stopped: ${s} failed (exit ${r.status}). Nothing further was changed.`); process.exit(1); }
}
// The share images have a rounded figure painted in, so they go stale whenever the database crosses
// a hundred. Rebuild them here rather than stopping. On 14 October 2026 this was a bare exit(1) and
// the only rebuild script lived outside the repository, so the nightly run failed and every figure
// on the site froze for a day over two share images. _tools/og-images.js is self contained; the one
// thing it needs is sharp, and if that is missing we still stop, because publishing a share card
// that contradicts the site is worse than a visible failure.
const fsx = require('fs');
const stampF = path.join(__dirname, 'og-stamp.json');
if (fsx.existsSync(stampF)) {
  const stamp = JSON.parse(fsx.readFileSync(stampF, 'utf8'));
  const now = JSON.parse(fsx.readFileSync(path.join(root, 'assets/data/site-stats.json'), 'utf8')).values.world_floor;
  if (stamp.world_floor !== now) {
    process.stdout.write(`\n> og-images.js  (the figure moved from ${stamp.world_floor} to ${now})\n`);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'og-images.js')], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`\nog images still show ${stamp.world_floor}, the figure is now ${now}, and the rebuild failed.`
        + `\n  Most likely sharp is not installed. Run: npm install sharp, then node _tools/og-images.js`);
      process.exit(1);
    }
  }
}
console.log('\nrefresh complete: every figure on the site matches the database.');
