/* GCC India Atlas - interactive breakdown chart. No dependencies. */
(function () {
  'use strict';
  var root = document.querySelector('[data-atlas]');
  if (!root) return;

  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DIMS = [
    { k: 'industry', t: 'Industry' },
    { k: 'domain', t: 'Domain' },
    { k: 'generation', t: 'Generation' },
    { k: 'size', t: 'Headcount' },
    { k: 'vintage', t: 'Established' },
    { k: 'city', t: 'City' }
  ];
  var RAMP = ['#0F2A55', '#163566', '#1E4478', '#2F5DA8', '#3C6CB8', '#4A7BC4', '#5C8BCE', '#7CA3DC', '#9DC0EE', '#B9D2F2'];
  var TEAL = '#15807A';

  var state = { dim: 'industry', scope: 'India', table: false };
  var D = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmt(n) { return n.toLocaleString('en-IN'); }
  function pct(n, d) { return d ? (Math.round(n / d * 1000) / 10) : 0; }

  function seriesFor(dim, scope) {
    if (dim === 'city') return D.cities.map(function (r) { return { label: r[0], value: r[1] }; });
    var block = D.dims[dim];
    if (!block) return [];
    var rows = block[scope] || block.India;
    return rows.map(function (r) { return { label: r[0], value: r[1] }; });
  }

  function denomFor(dim, scope) {
    if (dim === 'city') return D.meta.total_india;
    if (D.dims[dim] && D.dims[dim].multi) return D.scope_totals[scope];
    return D.scope_totals[scope];
  }

  /* ---------- rendering ---------- */

  function renderControls() {
    var dims = DIMS.map(function (d) {
      return '<button type="button" class="atlas__dim' + (d.k === state.dim ? ' is-on' : '') +
        '" role="tab" aria-selected="' + (d.k === state.dim ? 'true' : 'false') +
        '" data-dim="' + d.k + '">' + esc(d.t) + '</button>';
    }).join('');

    var scopes = D.scopes.map(function (s) {
      return '<button type="button" class="atlas__scope' + (s === state.scope ? ' is-on' : '') +
        '" data-scope="' + esc(s) + '"' + (state.dim === 'city' ? ' disabled' : '') + '>' +
        esc(s) + '</button>';
    }).join('');

    return '<div class="atlas__controls">' +
      '<div class="atlas__group"><span class="atlas__lbl" id="atlas-dim-lbl">Break down by</span>' +
      '<div class="atlas__dims" role="tablist" aria-labelledby="atlas-dim-lbl">' + dims + '</div></div>' +
      '<div class="atlas__group"><span class="atlas__lbl" id="atlas-scope-lbl">Location</span>' +
      '<div class="atlas__scopes" aria-labelledby="atlas-scope-lbl">' + scopes + '</div></div>' +
      '</div>';
  }

  function renderBars(series, denom, multi) {
    var max = series.reduce(function (m, r) { return Math.max(m, r.value); }, 0) || 1;
    var rows = series.map(function (r, i) {
      var w = (r.value / max * 100).toFixed(2);
      var col = r.label === 'Not disclosed' ? '#8FA0BC' : RAMP[Math.min(i, RAMP.length - 1)];
      if (state.dim === 'generation' && r.label !== 'Not disclosed') col = RAMP[Math.min(i * 2, RAMP.length - 1)];
      return '<li class="atlas__row" style="--i:' + i + '">' +
        '<span class="atlas__name">' + esc(r.label) + '</span>' +
        '<span class="atlas__track"><span class="atlas__fill" style="--w:' + w + '%;--c:' + col + '"></span></span>' +
        '<span class="atlas__val"><b>' + fmt(r.value) + '</b><span>' + pct(r.value, denom) + '%</span></span>' +
        '</li>';
    }).join('');
    return '<ol class="atlas__bars' + (RM ? ' no-anim' : '') + '">' + rows + '</ol>';
  }

  function renderYears() {
    var d = D.by_year, w = 760, h = 250, pad = { t: 16, r: 8, b: 30, l: 34 };
    var max = d.reduce(function (m, r) { return Math.max(m, r[1]); }, 0);
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var bw = iw / d.length;
    var bars = d.map(function (r, i) {
      var bh = r[1] / max * ih;
      var x = pad.l + i * bw, y = pad.t + ih - bh;
      var recent = r[0] >= 2020;
      return '<rect class="atlas__yb" x="' + (x + bw * 0.14).toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + (bw * 0.72).toFixed(1) + '" height="' + bh.toFixed(1) +
        '" rx="2" fill="' + (recent ? TEAL : '#2F5DA8') + '" style="--i:' + i + ';--bh:' + bh.toFixed(1) + ';--by:' + y.toFixed(1) + '">' +
        '<title>' + r[0] + ': ' + fmt(r[1]) + ' GCCs established</title></rect>';
    }).join('');
    var ticks = [1985, 1995, 2005, 2015, 2026].map(function (yr) {
      var i = d.findIndex(function (r) { return r[0] === yr; });
      if (i < 0) return '';
      var x = pad.l + i * bw + bw / 2;
      return '<text class="atlas__ax" x="' + x.toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle">' + yr + '</text>';
    }).join('');
    var gl = [0, 0.5, 1].map(function (f) {
      var y = pad.t + ih - f * ih;
      return '<line class="atlas__gl" x1="' + pad.l + '" x2="' + (w - pad.r) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="atlas__ax" x="' + (pad.l - 7) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(f * max) + '</text>';
    }).join('');
    return '<figure class="atlas__years"><svg viewBox="0 0 ' + w + ' ' + h + '" role="img" ' +
      'aria-label="GCCs established in India by year, 1985 to 2026. Peak 131 in 2025.">' +
      gl + bars + ticks + '</svg>' +
      '<figcaption>New GCCs by year of establishment. Centres founded from 2020 onward shown in teal.</figcaption></figure>';
  }

  function renderTable(series, denom) {
    var rows = series.map(function (r) {
      return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + fmt(r.value) + '</td><td>' + pct(r.value, denom) + '%</td></tr>';
    }).join('');
    var dimName = state.dim === 'city' ? 'City' : D.dims[state.dim].label;
    return '<div class="atlas__tablewrap"><table class="atlas__table">' +
      '<caption>' + esc(dimName) + ' breakdown, ' + esc(state.scope) + '</caption>' +
      '<thead><tr><th scope="col">' + esc(dimName) + '</th><th scope="col">GCCs</th><th scope="col">Share</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function render() {
    var isCity = state.dim === 'city';
    var isYear = state.dim === 'vintage';
    var scope = isCity ? 'India' : state.scope;
    var series = seriesFor(state.dim, scope);
    var denom = denomFor(state.dim, scope);
    var block = state.dim === 'city' ? null : D.dims[state.dim];
    var multi = !!(block && block.multi);

    var head = '<div class="atlas__head">' +
      '<p class="atlas__count"><b>' + fmt(denom) + '</b> GCCs' +
      (isCity ? ' across India' : ' in ' + esc(scope)) + '</p>' +
      '<button type="button" class="atlas__toggle" data-toggle>' + (state.table ? 'View as chart' : 'View as table') + '</button>' +
      '</div>';

    var body = state.table ? renderTable(series, denom) : renderBars(series, denom, multi);
    if (isYear && !state.table && scope === 'India') body = renderYears() + body;

    var note = '';
    if (isCity) note = D.meta.method;
    else if (multi) note = block.note;
    else if (block && block.note) note = block.note;
    if (!isCity && state.scope === 'Delhi NCR' && D.scope_note['Delhi NCR']) note += ' ' + D.scope_note['Delhi NCR'];

    root.innerHTML = renderControls() + '<div class="atlas__panel" role="tabpanel" aria-live="polite">' +
      head + body + '</div>' +
      '<p class="atlas__note">' + esc(note) + ' Source: GCCPROs verified database, ' +
      esc(D.meta.as_of) + '.</p>';
  }

  /* ---------- events ---------- */
  root.addEventListener('click', function (e) {
    var d = e.target.closest('[data-dim]');
    if (d) { state.dim = d.getAttribute('data-dim'); if (state.dim === 'city') state.scope = 'India'; render(); return; }
    var s = e.target.closest('[data-scope]');
    if (s && !s.disabled) { state.scope = s.getAttribute('data-scope'); render(); return; }
    if (e.target.closest('[data-toggle]')) { state.table = !state.table; render(); }
  });

  root.addEventListener('keydown', function (e) {
    if (!e.target.matches('[data-dim]')) return;
    var i = DIMS.findIndex(function (d) { return d.k === state.dim; });
    if (e.key === 'ArrowRight') { state.dim = DIMS[(i + 1) % DIMS.length].k; }
    else if (e.key === 'ArrowLeft') { state.dim = DIMS[(i - 1 + DIMS.length) % DIMS.length].k; }
    else return;
    e.preventDefault();
    if (state.dim === 'city') state.scope = 'India';
    render();
    var btn = root.querySelector('[data-dim="' + state.dim + '"]'); if (btn) btn.focus();
  });

  fetch('/assets/data/gcc-atlas.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (json) { D = json; render(); })
    .catch(function () {
      root.innerHTML = '<p class="atlas__note">The interactive breakdown could not load. ' +
        'The full dataset is in the <a href="/data">GCC database</a>.</p>';
    });
})();
