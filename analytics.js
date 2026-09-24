/* ==========================================================================
   GCCPROs shared analytics  (GA4: G-1K276GXQK6)
   One file, loaded on every public page. Purely additive: it never touches
   Razorpay, Supabase, forms or any existing logic. It:
     1. Loads GA4 once (idempotent - skips if a page already has gtag)
     2. Auto-fires  form_start  on first interaction with any form
     3. Auto-fires  file_download  on clicks to pdf/zip/xls/doc/ppt/csv
     4. Auto-fires  outbound_click  on links leaving gccpros.com
     5. Fires  scroll_depth  at 25 / 50 / 75 / 90 %
     6. Exposes  window.gccTrack(name, params)  for explicit conversions
        (rsvp_submit, enquiry_submit, newsletter_signup, begin_checkout,
         purchase, etc.)
   ========================================================================== */
(function () {
  var GA_ID = 'G-1K276GXQK6';

  // --- 1) Load GA4 only if the page does not already have it -------------
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    var gaLoaded = false;
    var loadGA = function () {
      if (gaLoaded) return; gaLoaded = true;
      var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
      document.head.appendChild(s);
    };
    // Deferred so it never competes with first paint, but only until the browser is idle:
    // waiting for an interaction or a fixed 6s lost every short visit, which is most of them.
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, loadGA, { once: true, passive: true }); });
    var whenIdle = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(loadGA, { timeout: 1500 });
      else setTimeout(loadGA, 1200);
    };
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle);
    // a visit that ends before the script loads is still worth counting
    ['pagehide', 'visibilitychange'].forEach(function (ev) {
      window.addEventListener(ev, function () { if (document.visibilityState === 'hidden') loadGA(); }, { once: true });
    });
    window.gtag('js', new Date());
    // content_group is a built-in GA4 dimension, so reports can compare sections
    // (city pages against consulting, say) without registering a custom dimension.
    window.gtag('config', GA_ID, { content_group: section() });
  }

  // --- 1b) Which part of the site a page belongs to ----------------------
  function section(p) {
    p = (p || location.pathname).replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (p === '/' || p === '') return 'Home';
    if (/^\/gcc-in-/.test(p)) return 'City pages';
    if (/^\/(gcc-india-atlas|what-is-a-gcc|how-many-gccs-in-india|faq)/.test(p)) return 'Free data and explainers';
    if (/^\/(data|database)/.test(p)) return 'Database';
    if (/^\/(consult|how-to-choose)/.test(p)) return 'Consulting';
    if (/^\/(event|insights-events|gcc-summit)/.test(p)) return 'Events';
    if (/^\/(talent|jobs|opportunities|candidate)/.test(p)) return 'Talent';
    if (/^\/(council|community|industry-council|awards)/.test(p)) return 'Community and council';
    if (/^\/(research|newsroom|insights|thought-leadership)/.test(p)) return 'Research and newsroom';
    if (/^\/(about|privacy|terms)/.test(p)) return 'About and legal';
    return 'Other';
  }

  // --- 6) Explicit event helper (safe to call anywhere) ------------------
  var track = window.gccTrack = function (name, params) {
    try {
      var p = params || {};
      if (p.section === undefined) p.section = section();      // every event knows its part of the site
      if (p.page === undefined) p.page = location.pathname;
      if (window.gtag) window.gtag('event', name, p);
    } catch (e) {}
  };

  // --- 2) form_start: first interaction with any form --------------------
  document.addEventListener('focusin', function (e) {
    var f = e.target && e.target.form;
    if (f && !f.__gccStarted) {
      f.__gccStarted = 1;
      track('form_start', { form_id: f.id || f.name || 'form', page: location.pathname });
    }
  }, true);

  // --- 2b) form_submit: every form that actually submits -----------------
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    track('form_submit', { form_id: f.id || f.name || 'form', page: location.pathname });
  }, true);

  // --- 2c) cta_click: the buttons and links that lead to a conversion ----
  // Pages drive most conversions from JavaScript rather than a form submit, so the click
  // itself is the only reliable signal without touching each page's own logic.
  var CTA = /book a consultation|register|apply|join|subscribe|sign ?up|get started|request|enquir|download|start free|open the (full )?database|reserve/i;
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a,button,[role=button]') : null;
    if (!el) return;
    var label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!label || !CTA.test(label)) return;
    track('cta_click', { cta_label: label, page: location.pathname, cta_href: el.getAttribute('href') || '' });
  }, true);

  // --- 3 + 4) file_download and outbound_click ---------------------------
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a || !a.href) return;
    var href = a.href;
    if (/^(javascript|mailto|tel):/i.test(href)) return;
    if (/\.(pdf|zip|xlsx?|docx?|pptx?|csv)(\?|#|$)/i.test(href)) {
      track('file_download', { link_url: href, file_name: href.split('/').pop().split(/[?#]/)[0] });
    }
    var host = a.hostname || '';
    if (host && host !== location.hostname) {
      var dest = /linkedin\.com|lnkd\.in/i.test(host) ? 'linkedin'
               : /wa\.me|whatsapp\.com/i.test(host) ? 'whatsapp'
               : /instagram\.com/i.test(host) ? 'instagram'
               : /(^|\.)x\.com|twitter\.com/i.test(host) ? 'x'
               : host;
      track('outbound_click', { link_domain: host, link_url: href, destination: dest });
    }
  }, true);

  // --- 5) scroll_depth 25/50/75/90 (custom, distinct from GA's built-in) --
  var marks = [25, 50, 75, 90], fired = {};
  function onScroll() {
    var d = document.documentElement, b = document.body;
    var st = d.scrollTop || b.scrollTop || 0;
    var sh = d.scrollHeight || b.scrollHeight || 0;
    var ch = d.clientHeight || window.innerHeight || 0;
    if (sh <= ch) return;
    var pct = Math.round((st + ch) / sh * 100);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (pct >= m && !fired[m]) { fired[m] = 1; track('scroll_depth', { percent_scrolled: m, page: location.pathname }); }
    }
  }
  var timer = null;
  window.addEventListener('scroll', function () {
    if (timer) return;
    timer = setTimeout(function () { timer = null; onScroll(); }, 200);
  }, { passive: true });
  if (document.readyState !== 'loading') onScroll();
  else document.addEventListener('DOMContentLoaded', onScroll);
})();
