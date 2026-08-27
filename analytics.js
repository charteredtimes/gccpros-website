/* ==========================================================================
   GCCPROs shared analytics  (GA4: G-1K276GXQK6)
   One file, loaded on every public page. Purely additive: it never touches
   Razorpay, Supabase, forms or any existing logic. It:
     1. Loads GA4 once (idempotent — skips if a page already has gtag)
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
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  // --- 6) Explicit event helper (safe to call anywhere) ------------------
  var track = window.gccTrack = function (name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  };

  // --- 2) form_start: first interaction with any form --------------------
  document.addEventListener('focusin', function (e) {
    var f = e.target && e.target.form;
    if (f && !f.__gccStarted) {
      f.__gccStarted = 1;
      track('form_start', { form_id: f.id || f.name || 'form', page: location.pathname });
    }
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
