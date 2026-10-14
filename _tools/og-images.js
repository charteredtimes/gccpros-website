#!/usr/bin/env node
/* Rebuild the two social cards that carry the GCC figure.

   The figure on these cards is world_floor, rounded down to the nearest hundred, so it only moves
   when the database crosses a hundred. When it does, the images and _tools/og-stamp.json have to be
   rebuilt together, otherwise a share card contradicts the site. refresh.js checks the stamp and
   calls this script when it has drifted.

   Everything this needs lives in the repo: the card as _tools/og-card.svg, the logo already trimmed
   and sized as _tools/og-logo.png. That is deliberate. On 14 October 2026 the database crossed 4,700
   and the nightly run failed, because the only copy of the rebuild script was on one laptop, outside
   the repository, and the runner had no way to repair itself. Every figure on the site froze for a
   day. Underscore directories are skipped by Jekyll, so none of this is served by Pages.

   The one outside requirement is sharp, to rasterise SVG to JPEG. refresh.js reports clearly if it
   is missing rather than failing obscurely.

   Usage: node _tools/og-images.js      (from the repo root) */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const P = (f) => path.join(root, f);

const sharp = require('sharp');
const V = JSON.parse(fs.readFileSync(P('assets/data/site-stats.json'), 'utf8')).values;
const template = fs.readFileSync(path.join(__dirname, 'og-card.svg'), 'utf8');
const logo = fs.readFileSync(path.join(__dirname, 'og-logo.png')).toString('base64');

const line = (t, i) =>
  '<text x="72" y="' + (340 + i * 76) + '" font-family="Georgia, serif" font-size="66" font-weight="700" fill="#fff">' + t + '</text>';

const CARDS = {
  'og-default': {
    kicker: 'THE WORLD&#8217;S GCC ECOSYSTEM',
    title: ['Intelligence, community', 'and advisory for GCCs'],
    sub: V.world_floor + ' verified Global Capability Centres &#183; Industry Council &#183; Research'
  },
  'og-data': {
    kicker: 'GCC DATABASE',
    title: [V.world_floor + ' verified', 'Global Capability Centres'],
    sub: 'Search by country, city, industry, headcount, domain and leadership'
  }
};

(async () => {
  for (const [name, c] of Object.entries(CARDS)) {
    const svg = template
      .split('{{logo}}').join(logo)
      .split('{{kicker}}').join(c.kicker)
      .split('{{titleLines}}').join(c.title.map(line).join(''))
      .split('{{subY}}').join(String(340 + c.title.length * 76 + 30))
      .split('{{sub}}').join(c.sub);
    await sharp(Buffer.from(svg)).jpeg({ quality: 84, mozjpeg: true }).toFile(P('assets/img/' + name + '.jpg'));
    console.log('rebuilt ' + (name + '.jpg').padEnd(18) + 'with ' + V.world_floor);
  }

  fs.writeFileSync(P('_tools/og-stamp.json'), JSON.stringify({
    note: 'Figure painted into og-default.jpg and og-data.jpg. Rebuilt by _tools/og-images.js.',
    world_floor: V.world_floor
  }, null, 1) + '\n');
  console.log('og-stamp.json now records ' + V.world_floor);
})();
