/* Rebuilds assets/data/gcc-atlas.json from the live database.
   All counts come from the SQL function public.atlas_stats(), which holds the counting rules
   (India filter, city aliases, Delhi NCR de-duplication, domain buckets, maturity, size and vintage bands).
   This script only orders the rows and adds the fixed labels and notes.
   Usage: node _tools/buildatlas.js [--dry]   then run buildpages.js and _tools/sync.js */
const fs = require('fs');
const S = require('path').join(__dirname, '..').replace(/\\/g, '/') + '/';
const OUT = S + 'assets/data/gcc-atlas.json';
const SUPA = 'https://fufnvnvufmrhrzhcoeil.supabase.co';
const KEY = (fs.readFileSync(S + 'console.html', 'utf8').match(/sb_publishable_[A-Za-z0-9_-]{10,}|eyJhbGciOi[A-Za-z0-9_.-]{20,}/) || [])[0];
if (!KEY) throw 'No publishable key found in console.html';

const SCOPES = ['India', 'Bengaluru', 'Pune', 'Hyderabad', 'Delhi NCR', 'Mumbai', 'Chennai'];
const ORDERS = {
  generation: ['Gen 1', 'Gen 2', 'Gen 3', 'Gen 4', 'Not disclosed'],
  size: ['1-100', '101-500', '501-1000', '1001-5000', '5000+', 'Not disclosed'],
  vintage: ['Before 2000', '2000-2009', '2010-2014', '2015-2019', '2020-2022', '2023-2026', 'Not disclosed']
};
const fmt = n => n.toLocaleString('en-US');

(async () => {
  const r = await fetch(SUPA + '/rest/v1/rpc/atlas_stats', {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: '{}'
  });
  if (!r.ok) throw 'atlas_stats failed: ' + r.status + ' ' + await r.text();
  const X = await r.json();

  // Rows per scope: ordered dims follow their order list; others by count desc, then label.
  const dim = (key, extra) => {
    const out = Object.assign({}, extra);
    for (const s of SCOPES) {
      let rows = X.dims[key].filter(x => x[0] === s).map(x => [x[1], x[2]]);
      if (ORDERS[key]) rows = ORDERS[key].map(v => [v, (rows.find(x => x[0] === v) || [v, 0])[1]]);
      else rows.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      out[s] = rows;
    }
    return out;
  };

  const cities = X.cities.filter(c => c[1] >= 2);
  const ncrNames = X.ncr_cities.filter(c => c[1] > 0).map(c => c[0]);
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join('');
  const D = {
    meta: {
      source: 'GCCPROs verified GCC database',
      as_of: new Date().toISOString().slice(0, 10),
      total_india: X.total_india,
      total_global: X.total_global,
      multi_city: X.multi_city,
      countries: X.countries,
      ncr_sum: X.ncr_sum,
      method: 'A GCC with offices in more than one city is counted in each of those cities, so the city figures add up to more than the national total. Every city, region and country total counts each GCC only once.'
    },
    scopes: SCOPES,
    scope_totals: Object.fromEntries(SCOPES.map(s => [s, X.scope_totals[s]])),
    scope_note: {
      'Delhi NCR': `${list(ncrNames)} together: ${fmt(X.scope_totals['Delhi NCR'])} GCCs. Adding up the city figures gives ${fmt(X.ncr_sum)}, because some GCCs have offices in more than one of these cities.`
    },
    cities,
    cities_single: X.cities.length - cities.length,
    cities_one: X.cities.filter(c => c[1] < 2).map(c => c[0]).sort(),
    by_country: X.by_country,
    dims: {
      industry: dim('industry', { label: 'Industry', note: 'Each GCC is classified into exactly one industry, so these add up to the total.' }),
      generation: dim('generation', { label: 'Generation (maturity)', note: 'GCCPROs maturity model. Gen 1 runs support and back-office work; Gen 2 owns delivery for a function; Gen 3 owns products, engineering or a global process end to end; Gen 4 holds global P&L or decision rights.', order: ORDERS.generation }),
      domain: dim('domain', { label: 'Domain (function run)', note: 'Most GCCs run several functions, so a centre appears under every domain it operates. These deliberately add up to more than the total.', multi: true }),
      size: dim('size', { label: 'Headcount', order: ORDERS.size }),
      vintage: dim('vintage', { label: 'Year established', order: ORDERS.vintage })
    },
    by_year: X.by_year
  };

  // Sanity: single-label dimensions must sum to each scope total.
  for (const k of ['industry', 'generation', 'size', 'vintage'])
    for (const s of SCOPES) {
      const t = D.dims[k][s].reduce((a, x) => a + x[1], 0);
      if (t !== D.scope_totals[s]) throw `${k}/${s} sums to ${t}, expected ${D.scope_totals[s]}`;
    }
  if (/\u2014/.test(JSON.stringify(D))) throw 'Em-dash found in atlas data';

  // Same layout as the hand-built file: one row array per line.
  const j = (v) => JSON.stringify(v);
  const dimTxt = (d) => '{\n' + Object.entries(d).map(([k, v]) => `      ${j(k)}: ${j(v)}`).join(',\n') + '\n    }';
  const txt = '{\n'
    + '  "meta": ' + JSON.stringify(D.meta, null, 2).replace(/\n/g, '\n  ') + ',\n'
    + '  "scopes": ' + j(D.scopes) + ',\n'
    + '  "scope_totals": ' + j(D.scope_totals) + ',\n'
    + '  "scope_note": ' + JSON.stringify(D.scope_note, null, 2).replace(/\n/g, '\n  ') + ',\n'
    + '  "cities": [\n    ' + D.cities.map(j).join(', ') + '\n  ],\n'
    + '  "cities_single": ' + D.cities_single + ',\n'
    + '  "cities_one": ' + j(D.cities_one) + ',\n'
    + '  "by_country": [\n    ' + D.by_country.map(j).join(', ') + '\n  ],\n'
    + '  "dims": {\n' + Object.entries(D.dims).map(([k, v]) => `    ${j(k)}: ${dimTxt(v)}`).join(',\n') + '\n  },\n'
    + '  "by_year": ' + j(D.by_year) + '\n}\n';
  JSON.parse(txt);
  if (process.argv.includes('--dry')) console.log(txt.slice(0, 1500));
  else fs.writeFileSync(OUT, txt);
  console.log('India', D.meta.total_india, '| global', D.meta.total_global, '| countries', D.meta.countries,
    '| multi-city', D.meta.multi_city, '| cities', D.cities.length, '+', D.cities_single, 'single');
  console.log('Scopes', j(D.scope_totals), '| NCR sum', X.ncr_sum);
})().catch(e => { console.error(e); process.exit(1); });
