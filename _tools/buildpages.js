/* Generates the GCC Atlas hub, the six city pillar pages and the /what-is-a-gcc pillar.
   Every number is read from assets/data/gcc-atlas.json - nothing is hand-typed. */
const fs = require('fs');
const S = require('path').join(__dirname, '..').replace(/\\/g, '/') + '/';
const D = JSON.parse(fs.readFileSync(S + 'assets/data/gcc-atlas.json', 'utf8'));
const SITE = 'https://www.gccpros.com';
// cache-bust the map script by content, since sync.js only stamps gp.js/gp.css
const MAPV = require('crypto').createHash('md5').update(fs.readFileSync(S + 'assets/js/gp-map.js')).digest('hex').slice(0, 8);
const RAMP = ['#0F2A55', '#163566', '#1E4478', '#2F5DA8', '#3C6CB8', '#4A7BC4', '#5C8BCE', '#7CA3DC', '#9DC0EE', '#B9D2F2'];

const fmt = n => n.toLocaleString('en-IN');
const pc = (n, d) => Math.round(n / d * 1000) / 10;
const esc = s => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (dim, scope) => D.dims[dim][scope];
const val = (dim, scope, label) => { const r = (D.dims[dim][scope] || []).find(x => x[0] === label); return r ? r[1] : 0; };

/* ---------- static bar list, same markup/CSS as the interactive chart ---------- */
function bars(rows, denom, limit) {
  const list = limit ? rows.slice(0, limit) : rows;
  const max = list.reduce((m, r) => Math.max(m, r[1]), 0) || 1;
  return `<ol class="atlas__bars">` + list.map((r, i) => {
    const w = (r[1] / max * 100).toFixed(2);
    const c = r[0] === 'Not disclosed' ? '#8FA0BC' : RAMP[Math.min(i, RAMP.length - 1)];
    return `<li class="atlas__row" style="--i:${i}"><span class="atlas__name">${esc(r[0])}</span>` +
      `<span class="atlas__track"><span class="atlas__fill" style="--w:${w}%;--c:${c}"></span></span>` +
      `<span class="atlas__val"><b>${fmt(r[1])}</b><span>${pc(r[1], denom)}%</span></span></li>`;
  }).join('') + `</ol>`;
}

function statStrip(items) {
  return `<div class="stats" data-reveal>` + items.map(([n, l]) =>
    `<div class="stat"><div class="stat__num" data-count>${n}</div><div class="stat__label">${esc(l)}</div></div>`).join('') + `</div>`;
}

/* ---------- page shell ---------- */
function page({ slug, title, desc, priority, crumbs, jsonld, body, atlas }) {
  const canonical = `${SITE}/${slug}`;
  const webpage = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': canonical + '#webpage', url: canonical, name: title.replace(/\s*\|\s*GCCPROs$/, ''), inLanguage: 'en-IN',
    dateModified: '{{updated_iso}}', isPartOf: { '@id': SITE + '/#website' }, publisher: { '@id': SITE + '/#org' }, author: { '@id': SITE + '/#org' } };
  const ld = jsonld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n') +
    // dateModified is stamped by sync.js from the page's real last-changed date
    `\n<script type="application/ld+json" data-stat-tpl="${esc(JSON.stringify(webpage)).replace(/"/g, '&quot;')}">{}</script>`;
  // byline under the H1; sync.js fills in the date
  body = body.replace('</h1>', '</h1>\n      <p class="byline">By the <a href="/about">GCCPROs research team</a> &middot; Updated <time data-updated datetime=""></time></p>');
  return `<!DOCTYPE html>
<html lang="en-IN" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta name="gp:priority" content="${priority}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="GCCPROs">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/assets/img/og-default.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@GCC_PROS">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/assets/img/og-default.jpg">
<!-- gp:head -->
<!-- /gp:head -->
${ld}
</head>
<body class="gp">
<!-- gp:nav -->
<!-- /gp:nav -->
<main id="main" class="gp-main">
  <section class="page-hero">
    <div class="page-hero__orb orb-a" aria-hidden="true"></div><div class="page-hero__orb orb-b" aria-hidden="true"></div><div class="grid-lines" aria-hidden="true"></div>
    <div class="shell">
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
${body}
</main>
<!-- gp:footer -->
<!-- /gp:footer -->
<script src="/assets/js/gp.js" defer></script>
${atlas ? '<script src="/assets/js/gp-atlas.js" defer></script>\n<script src="/assets/js/gp-map.js?v=' + MAPV + '" defer></script>\n' : ''}<script src="/analytics.js" defer></script>
</body>
</html>
`;
}

const ORG = { '@id': SITE + '/#org' };
const breadcrumb = items => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x[0], item: SITE + x[1] }))
});
const faqLd = qa => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
});
const faqHtml = qa => `<div class="acc">` + qa.map(([q, a], i) =>
  `<details${i === 0 ? ' open' : ''}><summary><h3>${esc(q)}</h3></summary><div class="acc__body"><p>${a}</p></div></details>`).join('') + `</div>`;

/* ================= CITY PAGES ================= */
const CITIES = {
  'bengaluru': {
    name: 'Bengaluru', scope: 'Bengaluru', alt: 'Bangalore', state: 'Karnataka',
    blurb: 'Bengaluru is the centre of gravity of the whole industry, and not narrowly: it leads on scale, on deep-tech and on decision rights at the same time.',
    facts: [
      () => `Bengaluru holds <strong>${fmt(D.scope_totals.Bengaluru)} of India\u2019s ${fmt(D.meta.total_india)} GCCs</strong>: ${pc(D.scope_totals.Bengaluru, D.meta.total_india)}% of the country, and more than Pune and Hyderabad combined.`,
      () => `It is where the silicon is. <strong>${val('industry','Bengaluru','Technology: Semiconductors & Hardware')} of India\u2019s ${val('industry','India','Technology: Semiconductors & Hardware')}</strong> semiconductor and hardware GCCs sit here, ${pc(val('industry','Bengaluru','Technology: Semiconductors & Hardware'), val('industry','India','Technology: Semiconductors & Hardware'))}% of the national total. Cybersecurity is almost as concentrated, at ${pc(val('industry','Bengaluru','Technology: Cybersecurity'), val('industry','India','Technology: Cybersecurity'))}%.`,
      () => `It is also where the mandates are biggest. <strong>${val('generation','Bengaluru','Gen 4')} of India\u2019s ${val('generation','India','Gen 4')} Gen\u00a04 centres</strong> (those holding global P&amp;L or decision rights) are in Bengaluru, and so are <strong>${val('size','Bengaluru','5000+')} of the ${val('size','India','5000+')}</strong> centres employing more than 5,000 people.`
    ],
    faq: [
      ['How many GCCs are there in Bengaluru?', `GCCPROs has ${fmt(D.scope_totals.Bengaluru)} verified Global Capability Centres with an office in Bengaluru, out of ${fmt(D.meta.total_india)} across India. Centres that also have offices in other cities are counted in Bengaluru and in those cities, because each is a real operating site.`],
      ['What kind of companies run GCCs in Bengaluru?', `The largest group is SaaS and software (${val('industry','Bengaluru','Technology: SaaS & Software')} centres), followed by banking, fintech and capital markets (${val('industry','Bengaluru','BFSI: Banking, FinTech & Capital Markets')}) and semiconductors and hardware (${val('industry','Bengaluru','Technology: Semiconductors & Hardware')}). All ${D.dims.industry.India.length} industry groups in the database are represented.`],
      ['Is Bengaluru still growing as a GCC location?', `Yes, though it is no longer the fastest. ${val('vintage','Bengaluru','2023-2026')} of Bengaluru\u2019s centres were established from 2023 onward, which is ${pc(val('vintage','Bengaluru','2023-2026'), D.scope_totals.Bengaluru)}% of its base. Hyderabad\u2019s equivalent share is ${pc(val('vintage','Hyderabad','2023-2026'), D.scope_totals.Hyderabad)}%, so newer centres are landing there at a faster relative rate.`]
    ]
  },
  'pune': {
    name: 'Pune', scope: 'Pune', alt: 'Poona', state: 'Maharashtra',
    blurb: 'Pune is where engineering actually gets done. The profile is unmistakably industrial, and it has quietly become India\u2019s second-largest GCC city.',
    facts: [
      () => `Pune is India\u2019s <strong>second-largest GCC city</strong>, with ${fmt(D.scope_totals.Pune)} centres, ${pc(D.scope_totals.Pune, D.meta.total_india)}% of the national total, narrowly ahead of Hyderabad.`,
      () => `It is the automotive capital. <strong>${val('industry','Pune','Automotive & Auto Components')} of India\u2019s ${val('industry','India','Automotive & Auto Components')}</strong> automotive GCCs are in Pune, ${pc(val('industry','Pune','Automotive & Auto Components'), val('industry','India','Automotive & Auto Components'))}%, alongside ${val('industry','Pune','Industrial, Engineering & Manufacturing')} industrial and manufacturing centres.`,
      () => `Engineering is the job. <strong>${val('domain','Pune','Engineering & R&D')} of Pune\u2019s ${fmt(D.scope_totals.Pune)} centres</strong> run engineering or R&amp;D work, ${pc(val('domain','Pune','Engineering & R&D'), D.scope_totals.Pune)}%, against ${pc(val('domain','Mumbai','Engineering & R&D'), D.scope_totals.Mumbai)}% in Mumbai, and ${val('domain','Pune','Manufacturing Technology')} run manufacturing technology.`
    ],
    faq: [
      ['How many GCCs are there in Pune?', `GCCPROs has ${fmt(D.scope_totals.Pune)} verified Global Capability Centres with an office in Pune, which makes it India\u2019s second-largest GCC city after Bengaluru. Many of these also operate in Mumbai or Bengaluru; each unit is counted in the city where it sits.`],
      ['What makes Pune different from Bengaluru?', `Composition. Pune skews industrial: automotive (${val('industry','Pune','Automotive & Auto Components')} centres) and industrial engineering and manufacturing (${val('industry','Pune','Industrial, Engineering & Manufacturing')}) together account for ${pc(val('industry','Pune','Automotive & Auto Components') + val('industry','Pune','Industrial, Engineering & Manufacturing'), D.scope_totals.Pune)}% of its base, against ${pc(val('industry','Bengaluru','Automotive & Auto Components') + val('industry','Bengaluru','Industrial, Engineering & Manufacturing'), D.scope_totals.Bengaluru)}% in Bengaluru.`],
      ['How mature are Pune\u2019s GCCs?', `${val('generation','Pune','Gen 3')} of Pune\u2019s centres are Gen\u00a03, meaning they own a product, an engineering charter or a global process end to end. That is ${pc(val('generation','Pune','Gen 3'), D.scope_totals.Pune)}% of the city\u2019s base, against ${pc(val('generation','Bengaluru','Gen 3'), D.scope_totals.Bengaluru)}% in Bengaluru.`]
    ]
  },
  'hyderabad': {
    name: 'Hyderabad', scope: 'Hyderabad', alt: 'Secunderabad', state: 'Telangana',
    blurb: 'Hyderabad is the fastest-growing of the major GCC cities, and the one where life sciences and AI work sit side by side.',
    facts: [
      () => `Hyderabad has ${fmt(D.scope_totals.Hyderabad)} GCCs, ${pc(D.scope_totals.Hyderabad, D.meta.total_india)}% of India\u2019s total.`,
      () => `It is growing fastest. <strong>${val('vintage','Hyderabad','2023-2026')} of its centres were established from 2023 onward</strong>: ${pc(val('vintage','Hyderabad','2023-2026'), D.scope_totals.Hyderabad)}% of the city\u2019s base. The comparable figure is ${pc(val('vintage','Bengaluru','2023-2026'), D.scope_totals.Bengaluru)}% for Bengaluru, ${pc(val('vintage','Pune','2023-2026'), D.scope_totals.Pune)}% for Pune and ${pc(val('vintage','Chennai','2023-2026'), D.scope_totals.Chennai)}% for Chennai.`,
      () => `Two specialisms stand out. Hyderabad holds <strong>${val('industry','Hyderabad','Pharma & Life Sciences')} of India\u2019s ${val('industry','India','Pharma & Life Sciences')}</strong> pharma and life-sciences GCCs, and <strong>${pc(val('domain','Hyderabad','Data, Analytics & AI'), D.scope_totals.Hyderabad)}% of its centres run data, analytics or AI work</strong>: a higher share than any other major city.`
    ],
    faq: [
      ['How many GCCs are there in Hyderabad?', `GCCPROs has ${fmt(D.scope_totals.Hyderabad)} verified Global Capability Centres with an office in Hyderabad, out of ${fmt(D.meta.total_india)} in India.`],
      ['Why is Hyderabad growing faster than other cities?', `On the data, the clearest signal is recency of establishment: ${pc(val('vintage','Hyderabad','2023-2026'), D.scope_totals.Hyderabad)}% of Hyderabad\u2019s centres were set up from 2023 onward, the highest share among India\u2019s five largest GCC cities. The database records when a centre was established, not why a company chose the city, so treat the drivers as a separate question.`],
      ['Is Hyderabad only a pharma city for GCCs?', `No. Pharma and life sciences is a genuine specialism at ${val('industry','Hyderabad','Pharma & Life Sciences')} centres, but the largest groups are SaaS and software (${val('industry','Hyderabad','Technology: SaaS & Software')}) and banking, fintech and capital markets (${val('industry','Hyderabad','BFSI: Banking, FinTech & Capital Markets')}).`]
    ]
  },
  'delhi-ncr': {
    name: 'Delhi NCR', scope: 'Delhi NCR', alt: 'Gurugram, Noida and New Delhi', state: 'Delhi, Haryana and Uttar Pradesh',
    blurb: 'The National Capital Region is one market spread across several cities, and counting it properly changes the number.',
    facts: [
      () => `Across Gurugram, Noida, New Delhi, Greater Noida, Manesar and Faridabad, <strong>${fmt(D.scope_totals['Delhi NCR'])} GCCs</strong> operate in the NCR, ${pc(D.scope_totals['Delhi NCR'], D.meta.total_india)}% of India\u2019s total. The individual city figures add up to ${fmt(D.meta.ncr_sum)}, because many GCCs have offices in more than one NCR city; the regional total counts each of them once.`,
      () => `Gurugram carries most of it, with ${D.cities.find(c => c[0] === 'Gurugram')[1]} centres, ahead of Noida (${D.cities.find(c => c[0] === 'Noida')[1]}) and New Delhi (${D.cities.find(c => c[0] === 'New Delhi')[1]}).`,
      () => `Its edge is advisory and services. The NCR holds <strong>${val('industry','Delhi NCR','Professional Services & Consulting')} of India\u2019s ${val('industry','India','Professional Services & Consulting')}</strong> professional-services GCCs, ${pc(val('industry','Delhi NCR','Professional Services & Consulting'), val('industry','India','Professional Services & Consulting'))}%, and they make up ${pc(val('industry','Delhi NCR','Professional Services & Consulting'), D.scope_totals['Delhi NCR'])}% of its base, against ${pc(val('industry','Bengaluru','Professional Services & Consulting'), D.scope_totals.Bengaluru)}% in Bengaluru.`
    ],
    faq: [
      ['How many GCCs are there in Delhi NCR?', `${fmt(D.scope_totals['Delhi NCR'])} Global Capability Centres operate across the National Capital Region. Many have offices in two or more NCR cities, so adding up the figures for Gurugram, Noida, New Delhi, Greater Noida, Manesar and Faridabad would count them twice and give ${fmt(D.meta.ncr_sum)}.`],
      ['Which NCR city has the most GCCs?', `Gurugram, with ${D.cities.find(c => c[0] === 'Gurugram')[1]} centres, followed by Noida with ${D.cities.find(c => c[0] === 'Noida')[1]} and New Delhi with ${D.cities.find(c => c[0] === 'New Delhi')[1]}.`],
      ['What kind of work do NCR GCCs do?', `Technology is the most common function (${val('domain','Delhi NCR','Technology')} centres), but the NCR over-indexes on professional services and consulting (${val('industry','Delhi NCR','Professional Services & Consulting')} centres) and under-indexes sharply on cybersecurity, with only ${val('industry','Delhi NCR','Technology: Cybersecurity')} centres against Bengaluru\u2019s ${val('industry','Bengaluru','Technology: Cybersecurity')}.`]
    ]
  },
  'mumbai': {
    name: 'Mumbai', scope: 'Mumbai', alt: 'Bombay', state: 'Maharashtra',
    blurb: 'Mumbai\u2019s GCC base looks like Mumbai: it is a financial-services city, and the capability centres follow the money.',
    facts: [
      () => `Mumbai has ${fmt(D.scope_totals.Mumbai)} GCCs, ${pc(D.scope_totals.Mumbai, D.meta.total_india)}% of India\u2019s total. Navi Mumbai adds a further ${D.cities.find(c => c[0] === 'Navi Mumbai')[1]} and Thane ${D.cities.find(c => c[0] === 'Thane')[1]}.`,
      () => `It is India\u2019s financial GCC capital. Banking, fintech and capital markets (${val('industry','Mumbai','BFSI: Banking, FinTech & Capital Markets')}) plus insurance (${val('industry','Mumbai','BFSI: Insurance')}) make up <strong>${pc(val('industry','Mumbai','BFSI: Banking, FinTech & Capital Markets') + val('industry','Mumbai','BFSI: Insurance'), D.scope_totals.Mumbai)}% of the city\u2019s centres</strong>, against ${pc(val('industry','India','BFSI: Banking, FinTech & Capital Markets') + val('industry','India','BFSI: Insurance'), D.meta.total_india)}% nationally.`,
      () => `That shows up in the work. <strong>${pc(val('domain','Mumbai','Risk & Compliance'), D.scope_totals.Mumbai)}% of Mumbai\u2019s GCCs run risk and compliance</strong> and ${pc(val('domain','Mumbai','Finance & Accounting'), D.scope_totals.Mumbai)}% run finance and accounting, both the highest shares in the country, against ${pc(val('domain','India','Risk & Compliance'), D.meta.total_india)}% and ${pc(val('domain','India','Finance & Accounting'), D.meta.total_india)}% nationally.`
    ],
    faq: [
      ['How many GCCs are there in Mumbai?', `GCCPROs has ${fmt(D.scope_totals.Mumbai)} verified Global Capability Centres with an office in Mumbai proper. Navi Mumbai (${D.cities.find(c => c[0] === 'Navi Mumbai')[1]}) and Thane (${D.cities.find(c => c[0] === 'Thane')[1]}) are counted separately because they are distinct operating locations.`],
      ['Is Mumbai only a BFSI location for GCCs?', `It is heavily BFSI, ${pc(val('industry','Mumbai','BFSI: Banking, FinTech & Capital Markets') + val('industry','Mumbai','BFSI: Insurance'), D.scope_totals.Mumbai)}% of its centres, but professional services (${val('industry','Mumbai','Professional Services & Consulting')}) and SaaS and software (${val('industry','Mumbai','Technology: SaaS & Software')}) are both substantial.`],
      ['Why does Mumbai have fewer GCCs than Pune?', `The database records where units are, not why. What it shows is that Pune has ${fmt(D.scope_totals.Pune)} centres to Mumbai\u2019s ${fmt(D.scope_totals.Mumbai)}, and that the gap is almost entirely engineering: Pune has ${val('domain','Pune','Engineering & R&D')} centres running engineering or R&D against Mumbai\u2019s ${val('domain','Mumbai','Engineering & R&D')}.`]
    ]
  },
  'chennai': {
    name: 'Chennai', scope: 'Chennai', alt: 'Madras', state: 'Tamil Nadu',
    blurb: 'Chennai is the oldest and the heaviest of the major GCC cities: fewer centres, but bigger ones, and a manufacturing spine.',
    facts: [
      () => `Chennai has ${fmt(D.scope_totals.Chennai)} GCCs, ${pc(D.scope_totals.Chennai, D.meta.total_india)}% of India\u2019s total. Coimbatore adds ${D.cities.find(c => c[0] === 'Coimbatore')[1]} and Hosur ${D.cities.find(c => c[0] === 'Hosur')[1]}.`,
      () => `Its centres are the largest in the country by share. <strong>${pc(val('size','Chennai','5000+'), D.scope_totals.Chennai)}% of Chennai\u2019s GCCs employ more than 5,000 people</strong>, against ${pc(val('size','Bengaluru','5000+'), D.scope_totals.Bengaluru)}% in Bengaluru and ${pc(val('size','India','5000+'), D.meta.total_india)}% nationally.`,
      () => `It is also the oldest base. <strong>${pc(val('vintage','Chennai','Before 2000'), D.scope_totals.Chennai)}% of Chennai\u2019s centres were established before 2000</strong>, the highest share of the five largest cities, and manufacturing runs through it: ${val('industry','Chennai','Industrial, Engineering & Manufacturing')} industrial and ${val('industry','Chennai','Automotive & Auto Components')} automotive centres, plus ${pc(val('industry','Chennai','Energy, Power & Oil & Gas'), val('industry','India','Energy, Power & Oil & Gas'))}% of India\u2019s energy GCCs.`
    ],
    faq: [
      ['How many GCCs are there in Chennai?', `GCCPROs has ${fmt(D.scope_totals.Chennai)} verified Global Capability Centres with an office in Chennai, out of ${fmt(D.meta.total_india)} in India.`],
      ['What kind of GCCs does Chennai attract?', `Large, established, industrial ones. Banking and capital markets leads at ${val('industry','Chennai','BFSI: Banking, FinTech & Capital Markets')} centres, but industrial engineering and manufacturing (${val('industry','Chennai','Industrial, Engineering & Manufacturing')}), automotive (${val('industry','Chennai','Automotive & Auto Components')}) and energy (${val('industry','Chennai','Energy, Power & Oil & Gas')}) together outweigh it.`],
      ['Are Chennai\u2019s GCCs bigger than average?', `Yes, markedly. ${val('size','Chennai','5000+')} of its ${fmt(D.scope_totals.Chennai)} centres employ more than 5,000 people and ${val('size','Chennai','1001-5000')} employ 1,001\u20135,000, together ${pc(val('size','Chennai','5000+') + val('size','Chennai','1001-5000'), D.scope_totals.Chennai)}% of the city\u2019s base, the highest of any major GCC city.`]
    ]
  }
};

function cityPage(slug, C) {
  const n = D.scope_totals[C.scope], t = D.meta.total_india;
  const ind = T('industry', C.scope), dom = T('domain', C.scope), gen = T('generation', C.scope);
  const size = T('size', C.scope), vin = T('vintage', C.scope);
  const title = `GCCs in ${C.name}: ${fmt(n)} Global Capability Centres | GCCPROs`;
  const desc = `${fmt(n)} verified Global Capability Centres operate in ${C.name}, ${pc(n, t)}% of India\u2019s ${fmt(t)}. Breakdown by industry, function, maturity, size and year established.`;

  const body = `      <span class="eyebrow eyebrow--pill" data-reveal>GCC city profile &middot; ${esc(C.state)}</span>
      <h1 class="display split-words">GCCs in <em>${esc(C.name)}.</em></h1>
      <p class="lede" data-reveal style="--d:3">${fmt(n)} verified Global Capability Centres run a unit in ${esc(C.name)}: <strong>${pc(n, t)}% of the ${fmt(t)} GCCs</strong> GCCPROs tracks across India. ${esc(C.blurb)}</p>
      <div class="btn-row" data-reveal style="--d:4">
        <a class="btn btn--primary btn--magnetic" href="/data">Search the full database <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg></a>
        <a class="btn btn--ghost" href="/gcc-india-atlas">Compare every city</a>
      </div>
      ${statStrip([[fmt(n), `GCCs in ${C.name}`], [pc(n, t) + '%', 'of India\u2019s total'], [fmt(ind[0][1]), 'in ' + ind[0][0].replace(/.*/, '')], [fmt(val('size', C.scope, '5000+')), 'with 5,000+ staff']])}
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="ct-count">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>The number</span>
      <h2 class="h2" id="ct-count" data-reveal style="--d:1">How many GCCs are in ${esc(C.name)}?</h2></div>
      ${C.facts.map(f => `<p class="lede" data-reveal>${f()}</p>`).join('\n      ')}
      <p data-reveal><strong>How we count.</strong> ${esc(D.meta.method)} A centre operating in ${esc(C.name)} and one other city appears in both, which is why India\u2019s city figures add up to more than ${fmt(t)}. ${fmt(D.meta.multi_city)} of the ${fmt(t)} GCCs in India have offices in more than one city.</p>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="ct-ind">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Industry</span>
      <h2 class="h2" id="ct-ind" data-reveal style="--d:1">Which industries run GCCs in ${esc(C.name)}?</h2>
      <p class="lede" data-reveal style="--d:2">Every centre is classified into exactly one industry, so these add up to ${fmt(n)}.</p></div>
      ${bars(ind, n)}
    </div>
  </section>

  <section class="section" aria-labelledby="ct-dom">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Function</span>
      <h2 class="h2" id="ct-dom" data-reveal style="--d:1">What work do they actually do?</h2>
      <p class="lede" data-reveal style="--d:2">Most centres run several functions, so a GCC appears under each one it operates. These deliberately add up to more than ${fmt(n)}.</p></div>
      ${bars(dom, n)}
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="ct-gen">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Maturity</span>
      <h2 class="h2" id="ct-gen" data-reveal style="--d:1">How mature are ${esc(C.name)}\u2019s centres?</h2>
      <p class="lede" data-reveal style="--d:2">${esc(D.dims.generation.note)}</p></div>
      ${bars(gen, n)}
    </div>
  </section>

  <section class="section" aria-labelledby="ct-size">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Scale and vintage</span>
      <h2 class="h2" id="ct-size" data-reveal style="--d:1">How big are they, and when did they arrive?</h2></div>
      <h3 data-reveal>Headcount</h3>
      ${bars(size, n)}
      <h3 data-reveal style="margin-top:34px">Year established</h3>
      ${bars(vin, n)}
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="ct-faq">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Questions</span>
      <h2 class="h2" id="ct-faq" data-reveal style="--d:1">GCCs in ${esc(C.name)}, answered.</h2></div>
      ${faqHtml(C.faq)}
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="ct-more">
    <div class="shell">
      <div class="section-head"><span class="eyebrow" data-reveal>Other cities</span>
      <h2 class="h2" id="ct-more" data-reveal style="--d:1">Compare with the rest of India.</h2></div>
      <div class="grid grid-3">
        ${Object.entries(CITIES).filter(([s]) => s !== slug).map(([s, o]) =>
          `<a class="card" href="/gcc-in-${s}" data-reveal><h3>GCCs in ${esc(o.name)}</h3><p>${fmt(D.scope_totals[o.scope])} verified centres, ${pc(D.scope_totals[o.scope], t)}% of India.</p><span class="link-arrow">See the breakdown <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></a>`).join('\n        ')}
      </div>
      <div class="cta-panel" data-reveal style="margin-top:46px">
        <div><span class="eyebrow">The underlying records</span>
        <h2 class="h3">Every one of these ${fmt(n)} centres, in full.</h2>
        <p>Names, parent company, site leadership, headcount, functions and 46 fields per centre, all searchable, filterable and exportable.</p>
        <div class="btn-row"><a class="btn btn--primary" href="/data">Open the GCC database</a><a class="btn btn--ghost" href="/consult">Talk to a GCC advisor</a></div></div>
      </div>
    </div>
  </section>
`;

  return page({
    slug: 'gcc-in-' + slug, title, desc, priority: '0.8',
    crumbs: `<a href="/">Home</a><span aria-hidden="true">/</span><a href="/gcc-india-atlas">GCC India Atlas</a><span aria-hidden="true">/</span><span aria-current="page">${esc(C.name)}</span>`,
    jsonld: [
      breadcrumb([['Home', '/'], ['GCC India Atlas', '/gcc-india-atlas'], [`GCCs in ${C.name}`, '/gcc-in-' + slug]]),
      faqLd(C.faq),
      {
        '@context': 'https://schema.org', '@type': 'Dataset',
        name: `Global Capability Centres in ${C.name}`,
        description: desc, url: `${SITE}/gcc-in-${slug}`,
        keywords: [`GCC ${C.name}`, `Global Capability Centres ${C.name}`, `GCC list ${C.name}`, C.alt],
        spatialCoverage: { '@type': 'Place', name: `${C.name}, ${C.state}, India` },
        temporalCoverage: D.meta.as_of, isAccessibleForFree: true,
        creator: ORG, publisher: ORG, variableMeasured: 'Number of Global Capability Centres',
        measurementTechnique: D.meta.method
      }
    ],
    body
  });
}

/* ================= ATLAS HUB ================= */
function atlasPage() {
  const t = D.meta.total_india;
  const title = `GCC India Atlas: ${fmt(t)} Centres by City & Industry | GCCPROs`;
  const desc = `Interactive breakdown of India\u2019s ${fmt(t)} verified Global Capability Centres by city, industry, function, maturity, headcount and year established.`;
  const rows = D.cities.map(c => `<tr><th scope="row"><a href="${['Bengaluru','Pune','Hyderabad','Mumbai','Chennai'].includes(c[0]) ? '/gcc-in-' + c[0].toLowerCase() : '#'}">${esc(c[0])}</a></th><td>${fmt(c[1])}</td><td>${pc(c[1], t)}%</td></tr>`).join('');

  const body = `      <span class="eyebrow eyebrow--pill" data-reveal>Free GCC data &middot; updated ${esc(D.meta.as_of)}</span>
      <h1 class="display split-words">The GCC <em>India Atlas.</em></h1>
      <p class="lede" data-reveal style="--d:3">Every Global Capability Centre GCCPROs has verified in India, <strong>${fmt(t)} of them</strong>: broken down by city, industry, function, maturity, headcount and year established. A centre with offices in two cities is counted in both.</p>
      <div class="btn-row" data-reveal style="--d:4">
        <a class="btn btn--primary btn--magnetic" href="#atlas">Explore the data <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg></a>
        <a class="btn btn--ghost" href="/data">Open the full database</a>
      </div>
      ${statStrip([[fmt(t), 'GCCs in India'], [fmt(D.meta.total_global), 'GCCs worldwide'], [fmt(D.meta.multi_city), 'run multiple cities'], [String(D.cities.length + D.cities_single), 'cities covered']])}
    </div>
  </section>

  <section class="section section--tight" id="map" aria-labelledby="map-title">
    <div class="shell">
      <div class="section-head"><span class="eyebrow" data-reveal>Interactive map</span>
      <h2 class="h2" id="map-title" data-reveal style="--d:1">Where the world’s <em>${fmt(D.meta.total_global)} GCCs</em> are.</h2>
      <p class="lede" data-reveal style="--d:2">Click any country for its count from the GCCPROs database. Click India to open the city map and see all ${D.cities.length + D.cities_single} cities with a verified GCC.</p></div>
      <div data-gccmap class="gmap"><p class="gmap__note">Loading the map&hellip;</p></div>
      <noscript><div class="atlas"><div class="atlas__tablewrap"><table class="atlas__table"><caption>GCCs by country</caption><thead><tr><th scope="col">Country</th><th scope="col">GCCs</th></tr></thead><tbody>${(D.by_country || []).map(r => `<tr><th scope="row">${esc(r[0])}</th><td>${fmt(r[1])}</td></tr>`).join('')}</tbody></table></div></div></noscript>
    </div>
  </section>

  <section class="section section--tight" id="atlas" aria-labelledby="at-title">
    <div class="shell">
      <div class="section-head"><span class="eyebrow" data-reveal>Interactive</span>
      <h2 class="h2" id="at-title" data-reveal style="--d:1">Break India\u2019s GCCs down <em>any way you like.</em></h2>
      <p class="lede" data-reveal style="--d:2">Pick a dimension, then narrow it to a city. Every figure counts each verified centre once.</p></div>
      <div data-atlas class="atlas"><p class="atlas__note">Loading the breakdown&hellip;</p></div>
      <noscript><div class="atlas"><div class="atlas__tablewrap"><table class="atlas__table"><caption>GCCs by city, India</caption><thead><tr><th scope="col">City</th><th scope="col">GCCs</th><th scope="col">Share of India</th></tr></thead><tbody>${rows}</tbody></table></div></div></noscript>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="at-count">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Method</span>
      <h2 class="h2" id="at-count" data-reveal style="--d:1">Why the city numbers add up to more than ${fmt(t)}.</h2></div>
      <p class="lede" data-reveal>Because a Global Capability Centre is not one building. ${fmt(D.meta.multi_city)} of India\u2019s ${fmt(t)} GCCs, ${pc(D.meta.multi_city, t)}% of them, have offices in two or more cities.</p>
      <p data-reveal>A company with engineering in Bengaluru and a finance hub in Pune is a real employer in both places. Counting it once, in whichever city happens to be listed first, would understate both. So every city figure here counts the centres with an office in that city, and the city column deliberately sums to more than the national total.</p>
      <p data-reveal>Where a region is made of several cities, the opposite correction applies. Delhi NCR is the clearest case: Gurugram, Noida, New Delhi, Greater Noida, Manesar and Faridabad add up to ${fmt(D.meta.ncr_sum)}, but ${fmt(D.scope_totals['Delhi NCR'])} GCCs actually operate there, because many of them have offices in more than one NCR city. Every regional total on this page counts each GCC once; it is never a sum of its cities.</p>
      <p data-reveal><strong>Source.</strong> The GCCPROs verified database, as of ${esc(D.meta.as_of)}: ${fmt(D.meta.total_global)} centres across ${D.meta.countries} countries, ${fmt(t)} of them in India. Figures change as centres are added and verified.</p>
    </div>
  </section>

  <section class="section" aria-labelledby="at-cities">
    <div class="shell">
      <div class="section-head"><span class="eyebrow" data-reveal>City profiles</span>
      <h2 class="h2" id="at-cities" data-reveal style="--d:1">India\u2019s six biggest GCC markets.</h2></div>
      <div class="grid grid-3">
        ${Object.entries(CITIES).map(([s, o]) =>
          `<a class="card" href="/gcc-in-${s}" data-reveal><span class="tag">${pc(D.scope_totals[o.scope], t)}% of India</span><h3>GCCs in ${esc(o.name)}</h3><p><strong>${fmt(D.scope_totals[o.scope])}</strong> verified centres. Largest industry: ${esc(T('industry', o.scope)[0][0].replace(/, /, ' · '))}.</p><span class="link-arrow">See the breakdown <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="at-all">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Every city</span>
      <h2 class="h2" id="at-all" data-reveal style="--d:1">All ${D.cities.length + D.cities_single} Indian cities with a GCC.</h2>
      <p class="lede" data-reveal style="--d:2">Cities with two or more verified centres are listed; a further ${D.cities_single} cities have one each.</p></div>
      <div class="atlas"><div class="atlas__tablewrap"><table class="atlas__table"><thead><tr><th scope="col">City</th><th scope="col">GCCs</th><th scope="col">Share of India</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="shell">
      <div class="cta-panel" data-reveal>
        <div><span class="eyebrow">Beyond the aggregate</span>
        <h2 class="h3">These are the totals. The database has the names.</h2>
        <p>46 fields per centre (parent company, site leadership, headcount, functions, maturity, legal entity and more) across all ${fmt(D.meta.total_global)} verified GCCs worldwide.</p>
        <div class="btn-row"><a class="btn btn--primary" href="/data">Open the GCC database</a><a class="btn btn--ghost" href="/research">Read the research</a></div></div>
      </div>
    </div>
  </section>
`;

  return page({
    slug: 'gcc-india-atlas', title, desc, priority: '0.9', atlas: true,
    crumbs: `<a href="/">Home</a><span aria-hidden="true">/</span><a href="/data">Intelligence</a><span aria-hidden="true">/</span><span aria-current="page">GCC India Atlas</span>`,
    jsonld: [
      breadcrumb([['Home', '/'], ['GCC India Atlas', '/gcc-india-atlas']]),
      {
        '@context': 'https://schema.org', '@type': 'Dataset',
        name: 'GCC India Atlas: Global Capability Centres in India by city, industry and maturity',
        description: desc, url: SITE + '/gcc-india-atlas',
        keywords: ['GCC data', 'GCC India', 'Global Capability Centres India', 'GCC statistics', 'GCC by city'],
        spatialCoverage: { '@type': 'Place', name: 'India' },
        temporalCoverage: D.meta.as_of, isAccessibleForFree: true,
        creator: ORG, publisher: ORG,
        variableMeasured: ['Number of Global Capability Centres', 'Industry', 'Function', 'Maturity generation', 'Headcount band', 'Year established'],
        measurementTechnique: D.meta.method,
        distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: SITE + '/assets/data/gcc-atlas.json' }
      }
    ],
    body
  });
}

/* ================= WHAT IS A GCC ================= */
function whatIsPage() {
  const t = D.meta.total_india;
  const qa = [
    ['So what is a GCC, in one sentence?', `A Global Capability Centre is an offshore office that a multinational owns and staffs itself, instead of paying a third-party vendor to do the work. The parent company employs the people, sets the priorities and keeps the intellectual property. India hosts the world\u2019s largest concentration of them: GCCPROs verifies ${fmt(t)} centres across the country.`],
    ['What does GCC stand for?', 'Global Capability Centre (spelled Global Capability Center in American English). In an Indian business context GCC almost always means this. It is not the Gulf Cooperation Council, and not the GNU Compiler Collection.'],
    ['What is the difference between a GCC and outsourcing (BPO)?', 'Ownership. In outsourcing you buy an outcome from a supplier who employs the staff and can serve your competitors tomorrow. In a GCC the people are your employees, on your systems, inside your security perimeter, and the capability compounds inside your company rather than inside the vendor\u2019s.'],
    ['What is the difference between a GCC and a GIC or captive centre?', 'Nothing structural. The names are historical. "Captive centre" was the 1990s term, "Global In-house Centre" or GIC became common in the 2000s, and "Global Capability Centre" is the current term, chosen because these centres now own capability rather than just execute tasks.'],
    ['How many GCCs are there in India?', `GCCPROs verifies ${fmt(t)} Global Capability Centres operating in India, out of ${fmt(D.meta.total_global)} tracked across ${D.meta.countries} countries. Bengaluru has ${fmt(D.scope_totals.Bengaluru)} of them, Pune ${fmt(D.scope_totals.Pune)} and Hyderabad ${fmt(D.scope_totals.Hyderabad)}.`],
    ['Where are most GCCs located in India?', `Bengaluru, by a distance: ${pc(D.scope_totals.Bengaluru, t)}% of India\u2019s GCCs have a unit there. Pune (${fmt(D.scope_totals.Pune)}), Hyderabad (${fmt(D.scope_totals.Hyderabad)}), Delhi NCR (${fmt(D.scope_totals['Delhi NCR'])} distinct centres), Mumbai (${fmt(D.scope_totals.Mumbai)}) and Chennai (${fmt(D.scope_totals.Chennai)}) follow. Centres are spread across more than ${D.cities.length + D.cities_single} Indian cities in total.`],
    ['What work do GCCs do?', `Increasingly, the work the parent company cannot afford to lose. Of India\u2019s ${fmt(t)} centres, ${fmt(val('domain','India','Technology'))} run technology, ${fmt(val('domain','India','Engineering & R&D'))} run engineering or R&D and ${fmt(val('domain','India','Data, Analytics & AI'))} run data, analytics or AI. Finance and accounting (${fmt(val('domain','India','Finance & Accounting'))}), customer operations (${fmt(val('domain','India','Customer Operations'))}), risk and compliance (${fmt(val('domain','India','Risk & Compliance'))}) and HR shared services (${fmt(val('domain','India','HR Shared Services'))}) are all substantial.`],
    ['How long does it take to set up a GCC in India?', 'Typically six to twelve months from decision to a functioning team, depending on the legal structure, the city and whether you build directly or through a build-operate-transfer partner. The entity, the lease and the first leadership hire tend to set the pace, not the recruitment of the wider team.'],
    ['How do you know if a GCC is working?', `By what it is trusted to own, not by headcount. The GCCPROs maturity model reads it in four generations: Gen\u00a01 runs support and back-office work; Gen\u00a02 owns delivery for a function; Gen\u00a03 owns a product, an engineering charter or a global process end to end; Gen\u00a04 holds global P&L or decision rights. In India, ${fmt(val('generation','India','Gen 1'))} centres are Gen\u00a01 and ${fmt(val('generation','India','Gen 4'))} have reached Gen\u00a04.`]
  ];

  const title = 'What Is a GCC? Global Capability Centre Explained | GCCPROs';
  const desc = `What a Global Capability Centre is, how it differs from outsourcing, BPO and a GIC, and where India’s ${fmt(t)} verified GCCs actually are.`;

  const body = `      <span class="eyebrow eyebrow--pill" data-reveal>Plain-English explainer</span>
      <h1 class="display split-words">What is a <em>GCC?</em></h1>
      <p class="lede" data-reveal style="--d:3">A <strong>Global Capability Centre</strong> is an offshore office that a multinational company owns and staffs itself, rather than paying an outsourcing vendor to do the work. The parent employs the people, sets the priorities and keeps the intellectual property.</p>
      <div class="btn-row" data-reveal style="--d:4">
        <a class="btn btn--primary btn--magnetic" href="/gcc-india-atlas">See the ${fmt(t)} in India <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg></a>
        <a class="btn btn--ghost" href="/consult">Get help setting one up</a>
      </div>
      ${statStrip([[fmt(t), 'GCCs in India'], [fmt(D.meta.total_global), 'tracked worldwide'], [String(D.meta.countries), 'countries covered'], [fmt(val('generation','India','Gen 4')), 'at Gen 4 maturity']])}
    </div>
  </section>

  <section class="section section--tight" aria-labelledby="w-def">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Definition</span>
      <h2 class="h2" id="w-def" data-reveal style="--d:1">The one-sentence version, and what sits behind it.</h2></div>
      <p class="lede" data-reveal>A GCC is <strong>owned capability in another country</strong>. That is the whole idea, and every other difference follows from it.</p>
      <p data-reveal>If you outsource, you buy an outcome. A supplier employs the staff, runs the process, bills you monthly, and is free to serve your competitor next quarter. The knowledge your work generates accumulates inside their business.</p>
      <p data-reveal>If you build a GCC, you buy capacity and keep the capability. The people are on your payroll, on your systems, inside your security perimeter, holding your context. Five years in, the outsourced process is still a process; the GCC has become a team that knows why decisions were made.</p>
      <p data-reveal>That is also the honest catch. A GCC is a real subsidiary with a real legal entity, real leases and real leadership risk. It is slower to start and harder to unwind than a contract. Companies build one when the work is strategic enough that owning it matters.</p>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="w-names">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>The vocabulary</span>
      <h2 class="h2" id="w-names" data-reveal style="--d:1">GCC, GIC, captive, COE: what each one means.</h2>
      <p class="lede" data-reveal style="--d:2">Mostly the same thing, named in different decades.</p></div>
      <div class="grid grid-2">
        <div class="card" data-reveal><h3>Global Capability Centre (GCC)</h3><p>The current term, and the one used across this site. Chosen deliberately: these centres now own capability rather than merely execute tasks.</p></div>
        <div class="card" data-reveal><h3>Global In-house Centre (GIC)</h3><p>The 2000s term for the same structure. Still appears in policy documents and older analyst reports.</p></div>
        <div class="card" data-reveal><h3>Captive centre</h3><p>The original 1990s term. Accurate but unflattering; it framed the centre as owned rather than capable, which is why the industry moved on.</p></div>
        <div class="card" data-reveal><h3>Centre of Excellence (CoE)</h3><p>Not a synonym. A CoE is a specialist team <em>inside</em> a GCC that owns one capability for the whole group, such as data engineering or actuarial modelling.</p></div>
        <div class="card" data-reveal><h3>Shared services centre (SSC)</h3><p>A centre consolidating transactional work (payroll, accounts payable) for many business units. Many GCCs began life as one and grew out of it.</p></div>
        <div class="card" data-reveal><h3>Build-Operate-Transfer (BOT)</h3><p>A route, not a destination. A partner builds and runs the centre for an agreed period, then hands it to the parent company.</p></div>
      </div>
      <p data-reveal style="margin-top:28px"><strong>One disambiguation worth stating.</strong> Outside India, "GCC" usually means the Gulf Cooperation Council, and among software engineers it means the GNU Compiler Collection. In an Indian business context it means a Global Capability Centre, which is the sense used throughout this site.</p>
    </div>
  </section>

  <section class="section" aria-labelledby="w-gen">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Maturity</span>
      <h2 class="h2" id="w-gen" data-reveal style="--d:1">The four generations of a GCC.</h2>
      <p class="lede" data-reveal style="--d:2">Headcount tells you how big a centre is. Generation tells you what it is trusted to own, which is the number that matters. Here is how India\u2019s ${fmt(t)} centres distribute.</p></div>
      ${bars(T('generation', 'India'), t)}
      <div class="grid grid-2" style="margin-top:34px">
        <div class="card" data-reveal><h3>Gen 1 &middot; Support</h3><p>Back-office and support work, measured on cost and service levels. The brief comes from headquarters.</p></div>
        <div class="card" data-reveal><h3>Gen 2 &middot; Delivery</h3><p>Owns delivery for a function end to end, and is measured on outcomes rather than tickets closed.</p></div>
        <div class="card" data-reveal><h3>Gen 3 &middot; Ownership</h3><p>Owns a product, an engineering charter or a global process. Sets its own roadmap inside an agreed strategy.</p></div>
        <div class="card" data-reveal><h3>Gen 4 &middot; Decision rights</h3><p>Holds global P&amp;L or decision rights. The centre is where the call gets made, not where it gets implemented.</p></div>
      </div>
    </div>
  </section>

  <section class="section section--alt" aria-labelledby="w-india">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>India</span>
      <h2 class="h2" id="w-india" data-reveal style="--d:1">Why India, and where exactly.</h2></div>
      <p class="lede" data-reveal>India hosts ${fmt(t)} of the ${fmt(D.meta.total_global)} GCCs GCCPROs tracks worldwide, more than any other country, by a wide margin.</p>
      <p data-reveal>The base is also old enough to have proved itself. ${fmt(val('vintage','India','Before 2000'))} centres were established before 2000 and ${fmt(val('vintage','India','2000-2009'))} in the decade that followed, so the country has multiple cycles of evidence that the model survives recessions, leadership changes and repatriation debates. At the other end, ${fmt(val('vintage','India','2023-2026'))} centres have been established since 2023.</p>
      ${bars(D.cities, t, 10)}
      <p data-reveal style="margin-top:22px">A GCC with units in two cities is counted in both, because each is a real operating site, ${fmt(D.meta.multi_city)} of India\u2019s centres run more than one. <a href="/gcc-india-atlas">The full atlas</a> breaks all ${fmt(t)} down by city, industry, function, maturity, size and year.</p>
    </div>
  </section>

  <section class="section" aria-labelledby="w-faq">
    <div class="shell shell--narrow">
      <div class="section-head"><span class="eyebrow" data-reveal>Questions</span>
      <h2 class="h2" id="w-faq" data-reveal style="--d:1">Common questions about GCCs.</h2></div>
      ${faqHtml(qa)}
      <p data-reveal style="margin-top:26px">More terms and answers in the <a href="/faq">GCC FAQ and glossary</a>.</p>
    </div>
  </section>

  <section class="section section--tight">
    <div class="shell">
      <div class="cta-panel" data-reveal>
        <div><span class="eyebrow">Next step</span>
        <h2 class="h3">Thinking about building one?</h2>
        <p>GCCPROs advisory is delivered by people who have set up and run capability centres themselves, not career consultants. Start with a conversation about what you are actually trying to own.</p>
        <div class="btn-row"><a class="btn btn--primary" href="/consult">Talk to a GCC advisor</a><a class="btn btn--ghost" href="/gcc-india-atlas">Explore the data first</a></div></div>
      </div>
    </div>
  </section>
`;

  return page({
    slug: 'what-is-a-gcc', title, desc, priority: '0.9',
    crumbs: `<a href="/">Home</a><span aria-hidden="true">/</span><a href="/faq">Intelligence</a><span aria-hidden="true">/</span><span aria-current="page">What is a GCC?</span>`,
    jsonld: [
      breadcrumb([['Home', '/'], ['What is a GCC?', '/what-is-a-gcc']]),
      faqLd(qa),
      {
        '@context': 'https://schema.org', '@type': 'DefinedTerm',
        '@id': SITE + '/what-is-a-gcc#gcc',
        name: 'Global Capability Centre',
        alternateName: ['GCC', 'Global Capability Center', 'Global In-house Centre', 'GIC', 'Captive centre'],
        description: 'An offshore centre that a multinational company owns and staffs itself, rather than outsourcing the work to a third-party vendor.',
        url: SITE + '/what-is-a-gcc',
        inDefinedTermSet: { '@type': 'DefinedTermSet', '@id': SITE + '/faq#glossary', name: 'GCC glossary', url: SITE + '/faq' }
      }
    ],
    body
  });
}

/* ================= WRITE ================= */
let n = 0;
for (const [slug, C] of Object.entries(CITIES)) {
  fs.writeFileSync(S + 'gcc-in-' + slug + '.html', cityPage(slug, C)); n++;
  console.log('gcc-in-' + slug + '.html'.padEnd(10), D.scope_totals[C.scope], 'GCCs');
}
fs.writeFileSync(S + 'gcc-india-atlas.html', atlasPage()); n++;
fs.writeFileSync(S + 'what-is-a-gcc.html', whatIsPage()); n++;
console.log('gcc-india-atlas.html\nwhat-is-a-gcc.html\nwrote', n, 'pages');
