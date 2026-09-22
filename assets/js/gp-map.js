/* GCC map - world view coloured by GCC count; click India to zoom into its cities. No dependencies.
   Outlines: /assets/data/gcc-map.json (built by C:\gw\tools\buildmap.mjs, Natural Earth, India point of view).
   Counts:   /assets/data/gcc-atlas.json (built from the live database by buildatlas.js). */
(function () {
  'use strict';
  var root = document.querySelector('[data-gccmap]');
  if (!root) return;

  var RAMP = ['#DCE8F8', '#B9D2F2', '#9DC0EE', '#7CA3DC', '#5C8BCE', '#3C6CB8', '#2F5DA8', '#1E4478', '#0F2A55'];
  var CITY_PAGE = { 'Bengaluru': 'bengaluru', 'Pune': 'pune', 'Hyderabad': 'hyderabad', 'Mumbai': 'mumbai', 'Chennai': 'chennai' };
  var NCR = ['Gurugram', 'Noida', 'New Delhi', 'Greater Noida', 'Manesar', 'Faridabad', 'Ghaziabad'];
  /* Label text and side (r = right, l = left, b = below, t = above), placed by hand so neighbours never collide. */
  var LABELS = { 'Bengaluru': ['Bengaluru', 'l'], 'Pune': ['Pune', 'b'], 'Hyderabad': ['Hyderabad', 'r'], 'Chennai': ['Chennai', 'r'],
    'Mumbai': ['Mumbai', 'l'], 'New Delhi': ['Delhi NCR', 'r'], 'Kolkata': ['Kolkata', 'l'], 'Ahmedabad': ['Ahmedabad', 'l'],
    'Kochi': ['Kochi', 'l'], 'Coimbatore': ['Coimbatore', 'r'] };
  var M = null, D = null, byName = {}, dbName = {}, view = 'world', sel = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('en-IN'); }
  function pct(n, d) { return d ? (Math.round(n / d * 1000) / 10) : 0; }
  /* Match a map shape to its database country name (e.g. map "Czechia" = database "Czech Republic"). */
  function match(c) {
    var names = [c.n].concat(c.a || []);
    for (var i = 0; i < names.length; i++) { var k = names[i].toLowerCase(); if (byName[k]) return [dbName[k], byName[k]]; }
    return [c.n, 0];
  }
  function shade(n, max) {
    if (!n) return null;
    var t = Math.log(n) / Math.log(max);            // log scale: India is ~7x the next country
    return RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))))];
  }
  function cityRows() {
    return D.cities.concat((D.cities_one || []).map(function (n) { return [n, 1]; }));
  }

  /* ---------- world ---------- */
  function worldSvg() {
    var max = D.by_country[0][1], out = [], dots = [];
    M.world.countries.forEach(function (c) {
      var m = match(c), name = m[0], n = m[1], f = shade(n, max);
      var attrs = n
        ? ' class="gmap__c has-data' + (name === 'India' ? ' is-india' : '') + '" style="fill:' + f + '" tabindex="0" role="button" data-name="' + esc(name) +
          '" data-n="' + n + '" aria-label="' + esc(name) + ': ' + fmt(n) + ' GCCs' + (name === 'India' ? '. Opens the India city map' : '') + '"'
        : ' class="gmap__c"';
      out.push('<path d="' + c.d + '"' + attrs + '/>');
      if (n && c.s < 40) dots.push('<circle class="gmap__dot" cx="' + c.c[0] + '" cy="' + c.c[1] + '" r="' + (3.2 + Math.sqrt(n) / 6).toFixed(1) +
        '" style="fill:' + f + '" data-name="' + esc(name) + '" data-n="' + n + '" aria-hidden="true"/>');
    });
    var india = M.world.countries.filter(function (c) { return c.n === 'India'; })[0];
    var hint = india ? '<g class="gmap__hint" aria-hidden="true"><circle cx="' + india.c[0] + '" cy="' + india.c[1] + '" r="10"/></g>' : '';
    return '<svg class="gmap__svg" viewBox="0 0 ' + M.world.w + ' ' + M.world.h + '" role="group" aria-label="World map of GCCs by country">' +
      out.join('') + hint + dots.join('') + '</svg>';
  }
  function worldPanel() {
    if (sel) {
      var rank = D.by_country.findIndex(function (r) { return r[0] === sel; }) + 1;
      var row = D.by_country[rank - 1] || [sel, 0];
      return '<p class="gmap__eyebrow">Country</p><h3 class="gmap__title">' + esc(sel) + '</h3>' +
        '<p class="gmap__big"><b>' + fmt(row[1]) + '</b> verified GCCs</p>' +
        '<ul class="gmap__facts"><li><span>Share of the ' + fmt(D.meta.total_global) + ' tracked worldwide</span><b>' + pct(row[1], D.meta.total_global) + '%</b></li>' +
        '<li><span>Rank among ' + D.meta.countries + ' countries</span><b>#' + rank + '</b></li></ul>' +
        (sel === 'India' ? '<button type="button" class="btn btn--primary gmap__go" data-go="india">Explore India&rsquo;s cities</button>'
          : '<a class="btn btn--ghost gmap__go" href="/data">See them in the database</a>') +
        '<button type="button" class="gmap__back" data-clear>All countries</button>';
    }
    var top = D.by_country.slice(0, 10).map(function (r) {
      return '<li><button type="button" data-pick="' + esc(r[0]) + '"><span>' + esc(r[0]) + '</span><b>' + fmt(r[1]) + '</b></button></li>';
    }).join('');
    return '<p class="gmap__eyebrow">Worldwide</p><h3 class="gmap__title">' + fmt(D.meta.total_global) + ' GCCs in ' + D.meta.countries + ' countries</h3>' +
      '<p class="gmap__hintline">Click a country for its count. Click <b>India</b> to open the city map.</p>' +
      '<ol class="gmap__list">' + top + '</ol>';
  }

  /* ---------- India ---------- */
  function indiaSvg() {
    var rows = cityRows(), max = rows[0][1], out = [], labels = [];
    M.india.neighbours.forEach(function (n) { out.push('<path class="gmap__nb" d="' + n.d + '"/>'); });
    out.push('<path class="gmap__in" d="' + M.india.outline + '"/>');
    rows.slice().sort(function (a, b) { return b[1] - a[1]; }).forEach(function (r) {
      var p = M.india.cities[r[0]]; if (!p) return;
      var rad = 2.6 + 26 * Math.sqrt(r[1] / max);
      out.push('<circle class="gmap__city' + (sel === r[0] ? ' is-sel' : '') + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + rad.toFixed(1) +
        '" tabindex="0" role="button" data-city="' + esc(r[0]) + '" data-n="' + r[1] + '" aria-label="' + esc(r[0]) + ': ' + fmt(r[1]) + ' GCCs"/>');
      var L = LABELS[r[0]];
      if (L) {
        var side = L[1], x = p[0], y = p[1] + 4, anchor = 'middle';
        if (side === 'r') { x += rad + 5; anchor = 'start'; } else if (side === 'l') { x -= rad + 5; anchor = 'end'; }
        else if (side === 'b') { y = p[1] + rad + 14; } else { y = p[1] - rad - 6; }
        labels.push('<text class="gmap__lbl" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' + esc(L[0]) + '</text>');
      }
    });
    return '<svg class="gmap__svg gmap__svg--india" viewBox="0 0 ' + M.india.w + ' ' + M.india.h + '" role="group" aria-label="Map of India with GCC cities">' +
      out.join('') + '<g aria-hidden="true">' + labels.join('') + '</g></svg>';
  }
  function indiaPanel() {
    var t = D.meta.total_india;
    if (sel) {
      var row = cityRows().filter(function (r) { return r[0] === sel; })[0] || [sel, 0];
      var inNcr = NCR.indexOf(sel) >= 0;
      var link = CITY_PAGE[sel] ? '/gcc-in-' + CITY_PAGE[sel] : inNcr ? '/gcc-in-delhi-ncr' : null;
      return '<p class="gmap__eyebrow">City</p><h3 class="gmap__title">' + esc(sel) + '</h3>' +
        '<p class="gmap__big"><b>' + fmt(row[1]) + '</b> GCC' + (row[1] === 1 ? '' : 's') + ' with an office here</p>' +
        '<ul class="gmap__facts"><li><span>Share of India&rsquo;s ' + fmt(t) + '</span><b>' + pct(row[1], t) + '%</b></li>' +
        (inNcr ? '<li><span>All of Delhi NCR</span><b>' + fmt(D.scope_totals['Delhi NCR']) + '</b></li>' : '') + '</ul>' +
        (link ? '<a class="btn btn--primary gmap__go" href="' + link + '">' + (inNcr ? 'GCCs in Delhi NCR' : 'GCCs in ' + esc(sel)) + '</a>' : '') +
        '<button type="button" class="gmap__back" data-clear>All cities</button>';
    }
    var top = D.cities.slice(0, 10).map(function (r) {
      return '<li><button type="button" data-pick="' + esc(r[0]) + '"><span>' + esc(r[0]) + '</span><b>' + fmt(r[1]) + '</b></button></li>';
    }).join('');
    return '<p class="gmap__eyebrow">India</p><h3 class="gmap__title">' + fmt(t) + ' GCCs across ' + (D.cities.length + D.cities_single) + ' cities</h3>' +
      '<p class="gmap__hintline">Circle size shows the number of GCCs with an office in each city. Click one for detail.</p>' +
      '<ol class="gmap__list">' + top + '</ol>';
  }

  /* ---------- shell ---------- */
  function render(focusSel) {
    var crumbs = view === 'world'
      ? '<span aria-current="page">World</span>'
      : '<button type="button" class="gmap__crumb" data-go="world">World</button><span aria-hidden="true">/</span><span aria-current="page">India</span>';
    var legend = view === 'world'
      ? '<span class="gmap__legend" aria-hidden="true">Fewer <i style="background:' + RAMP[1] + '"></i><i style="background:' + RAMP[4] + '"></i><i style="background:' + RAMP[6] + '"></i><i style="background:' + RAMP[8] + '"></i> More</span>'
      : '<button type="button" class="gmap__crumb gmap__crumb--back" data-go="world">&larr; Back to world map</button>';
    root.innerHTML =
      '<div class="gmap__bar"><nav class="gmap__crumbs" aria-label="Map level">' + crumbs + '</nav>' + legend + '</div>' +
      '<div class="gmap__body"><div class="gmap__stage gmap__stage--' + view + '">' + (view === 'world' ? worldSvg() : indiaSvg()) +
      '<div class="gmap__tip" role="presentation" hidden></div></div>' +
      '<aside class="gmap__panel" aria-live="polite">' + (view === 'world' ? worldPanel() : indiaPanel()) + '</aside></div>' +
      '<p class="gmap__note">Counts from the GCCPROs verified database, ' + esc(D.meta.as_of) +
      '. City figures count every centre with an office in that city. Boundaries: Natural Earth, India&rsquo;s official view.</p>';
    if (sel) {
      var el = root.querySelector(view === 'world' ? '[data-name="' + cssq(sel) + '"].has-data' : '[data-city="' + cssq(sel) + '"]');
      if (el) { el.classList.add('is-sel'); if (focusSel) el.focus({ preventScroll: true }); }
    }
  }
  function cssq(s) { return String(s).replace(/"/g, '\\"'); }
  function go(v) {
    view = v; sel = null; render();
    var first = root.querySelector('.gmap__list button'); if (first) first.focus({ preventScroll: true });
  }
  function pick(name) {
    if (view === 'world' && name === 'India') { view = 'india'; sel = null; render(); return; }
    sel = name; render(true);
  }

  /* ---------- tooltip ---------- */
  function tip(e, el) {
    var t = root.querySelector('.gmap__tip'); if (!t) return;
    if (!el) { t.hidden = true; return; }
    var name = el.getAttribute('data-name') || el.getAttribute('data-city'), n = +el.getAttribute('data-n');
    t.innerHTML = '<b>' + esc(name) + '</b> ' + fmt(n) + ' GCC' + (n === 1 ? '' : 's') + (view === 'world' && name === 'India' ? '<em>Click to open the city map</em>' : '');
    var box = root.querySelector('.gmap__stage').getBoundingClientRect();
    var x = e.clientX - box.left, y = e.clientY - box.top;
    t.hidden = false;
    t.style.left = Math.min(box.width - t.offsetWidth - 6, Math.max(6, x + 14)) + 'px';
    t.style.top = Math.max(6, y - t.offsetHeight - 10) + 'px';
  }

  root.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    tip(e, e.target.closest('.has-data, .gmap__dot, .gmap__city'));
  });
  root.addEventListener('pointerleave', function () { var t = root.querySelector('.gmap__tip'); if (t) t.hidden = true; });
  root.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]'); if (g) { go(g.getAttribute('data-go')); return; }
    if (e.target.closest('[data-clear]')) { sel = null; render(); return; }
    var p = e.target.closest('[data-pick]'); if (p) { pick(p.getAttribute('data-pick')); return; }
    var c = e.target.closest('.has-data, .gmap__dot'); if (c) { pick(c.getAttribute('data-name')); return; }
    var ci = e.target.closest('.gmap__city'); if (ci) { pick(ci.getAttribute('data-city')); }
  });
  root.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest('.has-data, .gmap__city'); if (!el) return;
    e.preventDefault(); pick(el.getAttribute('data-name') || el.getAttribute('data-city'));
  });

  function getJson(url, bust) {
    return fetch(url + (bust ? '?t=' + Date.now() : ''), { cache: bust ? 'reload' : 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }
  function start() {
  if (start.done) return; start.done = true;
  Promise.all([getJson('/assets/data/gcc-map.json'), getJson('/assets/data/gcc-atlas.json')])
  .then(function (res) {
    // Right after a publish the CDN can still hand out the previous data file; fetch a fresh copy past the cache.
    if (res[1].by_country) return res;
    return getJson('/assets/data/gcc-atlas.json', true).then(function (d) { return [res[0], d]; });
  }).then(function (res) {
    M = res[0]; D = res[1];
    if (!D.by_country) throw new Error('gcc-atlas.json has no by_country; rebuild it with buildatlas.js');
    (D.by_country || []).forEach(function (r) { byName[r[0].toLowerCase()] = r[1]; dbName[r[0].toLowerCase()] = r[0]; });
    if (location.hash === '#map-india') view = 'india';
    render();
  }).catch(function (err) {
    if (window.console) console.error('GCC map:', err);
    root.innerHTML = '<p class="gmap__note">The map could not load. Country and city figures are in the tables below and in the <a href="/data">GCC database</a>.</p>';
  });
  }
  // Load the map data only when the map is close to the screen, so it never delays the first paint.
  if (/^#map/.test(location.hash) || !('IntersectionObserver' in window)) start();
  else {
    var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '600px 0px' });
    io.observe(root);
    // belt and braces: a tab that loads hidden, or is restored, throttles observer callbacks
    addEventListener('scroll', start, { once: true, passive: true });
    addEventListener('pointerdown', start, { once: true });
    setTimeout(start, 6000);
  }
})();
