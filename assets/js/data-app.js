/* Built from the inline scripts of data.html by _work/restructure-data.js.
   Concatenated in document order so the shared top level bindings still resolve.
   Loaded after the load event: the page paints first, then this wires up search,
   sign in, credits and checkout. Edit data.html, then re-run that script. */


/* ════════════════════════════════════════════════════════════════
   GCCPROs Intelligence Portal - v2 client
   Credit system:
     • 500 signup bonus (10 free searches or 5 reveals)
     • 50 credits per search page (5 results)
     • 1 credit = INR 1 = USD 0.0125
     • Click to view profile = free
   Backend: existing Apps Script + new credit actions (patch file)
   ════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────
// Deployment URL for the V2 Apps Script (GCC_Portal_V2_Script.gs).
// After you deploy the standalone V2 script as a Web App, paste the
// new /exec URL here. Until then, the portal will show errors on
// every call - which is what we want, so the closed beta stays
// inert rather than accidentally hitting the LIVE search script.
// DO NOT reuse the live AKfycbz6HJbg... URL here - that would pull
// the production Opportunities/Database script into this page.
// ─────────────────────────────────────────────────────────────────
const SCRIPT_URL = 'https://fufnvnvufmrhrzhcoeil.supabase.co/functions/v1/gccpros-api';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxJasC30oJACYX_mxxPi4s5uk1D6GfiZMImazvkTFDZ-9As76kMws890voHhH3uahkd/exec';
window._rzpKey = 'rzp_live_SoRqo3siqL38Yf'; // Razorpay Key ID (test)

// ── Cloudflare Turnstile (CAPTCHA) ──────────────────────────────
// `1x00000000000000000000AA` is Cloudflare's TEST site key that always
// passes. Replace with your real key from Cloudflare → Turnstile →
// "Add Site" once your domain is registered there. The matching server
// secret must be set on the Edge Function as TURNSTILE_SECRET_KEY.
const TURNSTILE_SITE_KEY = '0x4AAAAAADR4eSfrXpQVH-3f';
window._turnstileWidgets = {}; // id -> widgetId returned by turnstile.render()

// Called by Turnstile script when ready. Any pending widget mounts run here.
window.onTurnstileReady = function() {
  window._turnstileReady = true;
  (window._turnstileQueue || []).forEach(function(fn){ try { fn(); } catch(_){} });
  window._turnstileQueue = [];
};

// Mount a Turnstile widget into the element with id `elId`. Safe to call
// before the script is loaded:the call is queued.
function mountTurnstile(elId, opts) {
  function _mount(){
    var el = document.getElementById(elId);
    if (!el || !window.turnstile) return;
    // Reset if already rendered into this slot
    if (window._turnstileWidgets[elId]) {
      try { window.turnstile.remove(window._turnstileWidgets[elId]); } catch(_){}
      delete window._turnstileWidgets[elId];
    }
    try {
      window._turnstileWidgets[elId] = window.turnstile.render('#' + elId, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: (opts && opts.theme) || 'light',
        size:  (opts && opts.size)  || 'normal',
        action: (opts && opts.action) || 'gcc-form',
        appearance: 'always',
      });
    } catch(_){}
  }
  if (window._turnstileReady && window.turnstile) _mount();
  else { window._turnstileQueue = window._turnstileQueue || []; window._turnstileQueue.push(_mount); }
}

// Read the response token from a Turnstile widget mounted at elId.
function readTurnstileToken(elId) {
  try {
    var wid = window._turnstileWidgets[elId];
    if (wid && window.turnstile && window.turnstile.getResponse) {
      return window.turnstile.getResponse(wid) || '';
    }
  } catch(_){}
  // Fallback: read the hidden input the widget injects
  var inp = document.querySelector('#' + elId + ' input[name="cf-turnstile-response"]');
  return inp ? (inp.value || '') : '';
}

// Reset (clear) a Turnstile widget so the user can re-challenge after an error.
function resetTurnstile(elId) {
  try {
    var wid = window._turnstileWidgets[elId];
    if (wid && window.turnstile && window.turnstile.reset) window.turnstile.reset(wid);
  } catch(_){}
}

// ── apiFetch:wraps fetch() to auto-attach Firebase ID token in
//    Authorization: Bearer header. Closes the H2 IDOR finding.
//    The Edge Function runs in observation mode until IDOR_ENFORCE=true,
//    so adding the header doesn't break unauthenticated paths.
async function apiFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  try {
    var user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (user && typeof user.getIdToken === 'function') {
      var idToken = await user.getIdToken(false);  // false = use cached if valid
      if (idToken) options.headers['Authorization'] = 'Bearer ' + idToken;
    }
  } catch(_) { /* no token = unauthenticated call; server decides */ }
  return fetch(url, options);
}

// ── BETA ACCESS ──────────────────────────────────────────
// No hardcoded allow-list. Access is gated entirely by the backend:
// anyone who signs in lands on "Pending" until admin approves them
// from admin-health.html. Admin can also pre-approve an email via
// the "Add tester" panel there, which instantly creates an Approved
// account so the user walks straight into the portal with 500 credits.
function isAllowedTester(email) { return !!email; }

// Firebase - same project as existing search.html
firebase.initializeApp({
  apiKey:"AIzaSyDBiZl1CSAbqLQiqZJucrycWlxqbdeV_8w",
  authDomain:"gccpros-9aadb.firebaseapp.com",
  projectId:"gccpros-9aadb",
  storageBucket:"gccpros-9aadb.firebasestorage.app",
  messagingSenderId:"764592723192",
  appId:"1:764592723192:web:002a03f217b57d47f0570d"
});

// ── App Check (reCAPTCHA v3), proves requests come from our site ──
// Token auto-refresh enabled so long sessions don't break.
// Site key is public by design (locked to gccpros.com domain server-side).
try {
  firebase.appCheck().activate(
    new firebase.appCheck.ReCaptchaV3Provider('6LfzVs0sAAAAADk_q6RhB0hIU6TCZK6ZfJv2_HVn'),
    true
  );
} catch (e) { console.warn('App Check init failed:', e); }

const auth = firebase.auth();

// ── STATE ────────────────────────────────────────────────
const SEARCH_COST   = 50;               // credits per page of 5 results
const REVEAL_COST   = 100;              // credits to reveal a full company profile
const SIGNUP_BONUS  = 200;              // granted AFTER manual admin approval
const MONTHLY_REVEAL_CAP = 50;          // max unique reveals per calendar month per user
const INR_PER_CREDIT = 1;               // 1 credit = INR 1
const USD_PER_CREDIT = 0.0125;          // 50 credits = USD 0.63; 100 credits = USD 1.25
const DEFAULT_ALLOWANCE = 200;          // progress-bar baseline

let currentUser = null;
let _cachedEmail = localStorage.getItem('gcc_token') || '';
let _credits = null;                    // null = loading; number = known
let _isNewUser = false;
let _totalAllowance = DEFAULT_ALLOWANCE;
let _region = localStorage.getItem('gcc_region') || 'IN';
let _currency = _region === 'INTL' ? 'USD' : 'INR';
let lastQuery = '', lastField = 'city', lastResults = null;

// New revenue-model state
let _accountStatus = null;              // 'Pending' | 'Approved' | 'Suspended' | 'Rejected'
let _monthlyReveals = 0;                // reveals charged this calendar month
let _monthlyCap = MONTHLY_REVEAL_CAP;
let _revealedThisMonth = new Set();     // company names already paid for this month (re-view = free)
let _pendingRevealName = null;          // name in the confirm-reveal modal

const FIELD_META = {
  city     : { label: 'GCC City',         ph: 'e.g. Pune, Mumbai, Bengaluru' },
  company  : { label: 'Company Name',     ph: 'e.g. NielsenIQ India GCC' },
  group    : { label: 'Group Company',    ph: 'e.g. NielsenIQ, Bajaj Finserv' },
  country  : { label: 'HQ Country',       ph: 'e.g. USA, UK, Germany, India' },
  industry : { label: 'Industry',         ph: 'e.g. Banking, Automotive, Retail' },
  domain   : { label: 'GCC Domains',      ph: 'e.g. Analytics, Technology, Finance' },
  headcount: { label: 'Headcount band',   ph: 'e.g. 50-500, 500-5,000' },
  year     : { label: 'Year established', ph: 'e.g. 2018' },
  maturity : { label: 'Maturity tier',    ph: 'e.g. Gen 2, Established' },
  setup    : { label: 'Setup model',      ph: 'e.g. Captive, Wholly-owned subsidiary' },
  glassdoor: { label: 'Glassdoor rating', ph: 'e.g. 4.2' },
  gptw     : { label: 'GPTW certified',   ph: 'e.g. Yes' }
  // Leader search is Enterprise-only - not exposed on the B2C portal.
};

// Credit packs - values in CREDITS; price in rupees / dollars
const PACKS = {
  INR: [
    { credits: 200,  price: 200,  tag: null,          note: 'Starter' },
    { credits: 500,  price: 500,  tag: null,          note: 'Standard' },
    { credits: 1000, price: 950,  tag: 'Popular',     note: '5% off' },
    { credits: 2500, price: 2250, tag: 'Best value',  note: '10% off' }
  ],
  USD: [
    { credits: 200,  price: 2.5,  tag: null,          note: 'Starter' },
    { credits: 500,  price: 6,    tag: null,          note: 'Standard' },
    { credits: 1000, price: 11.5, tag: 'Popular',     note: '8% off' },
    { credits: 2500, price: 27,   tag: 'Best value',  note: '14% off' }
  ]
};

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Region / currency setup
  const regionSel = document.getElementById('region-picker');
  regionSel.value = _region;
  regionSel.addEventListener('change', () => {
    _region = regionSel.value;
    _currency = _region === 'INTL' ? 'USD' : 'INR';
    localStorage.setItem('gcc_region', _region);
    updateCostText();
    if (document.getElementById('buy-modal').classList.contains('open')) {
      setCurrency(_currency);
    }
  });
  updateCostText();

  // Handle any return from a Google-redirect sign-in. No-op otherwise.
  // onAuthStateChanged picks up the user once getRedirectResult resolves.
  handleGoogleRedirectReturn();

  // Hide page if not authed - check early
  if (_cachedEmail) {
    document.body.classList.add('is-authed');
    document.getElementById('user-pill').textContent =
      _cachedEmail.split('@')[0] + ' - Sign out';
    setTimeout(fetchCreditBalance, 600);
  } else {
    // No cached email - show the inline sign-in card immediately so
    // the user never sees a stuck "Loading..." state.
    document.body.classList.remove('is-authed');
    document.getElementById('user-pill').textContent = 'Sign in';
    showSignInState();
  }

  // Initial hint
  onFieldChange();
});

auth.onAuthStateChanged(u => {
  if (u) {
    currentUser = u;
    localStorage.setItem('gcc_token', u.email);
    _cachedEmail = u.email;
    document.body.classList.add('is-authed');
    document.getElementById('user-pill').textContent =
      (u.displayName || u.email.split('@')[0]) + ' - Sign out';
    closeSignInModal();
    // Research hub (and other tools) can send members here to sign in and
    // bounce them straight back via ?next=<page>.html (same-origin only).
    try{ var _n=new URLSearchParams(location.search).get('next'); if(_n && /^[A-Za-z0-9_\-]+\.html$/.test(_n)){ location.replace(_n); return; } }catch(_){}
    fetchCreditBalance();
  } else {
    // Firebase has no session. If we also have no cached email, show
    // the inline sign-in card.
    if (!_cachedEmail) {
      document.body.classList.remove('is-authed');
      document.getElementById('user-pill').textContent = 'Sign in';
      showSignInState();
    }
  }
});

// ── INLINE SIGN-IN CARD (email+password primary) ─────────
// Two modes: 'signin' and 'signup'. Toggle with switchMode().
// Forgot password sends a Firebase reset email.
// Google sign-in is offered as a secondary one-click option.
var _signInMode = 'choose';

function showSignInState(mode) {
  if (mode) _signInMode = mode;
  var modal = document.getElementById('signin-modal');
  var wrap = (modal && modal.classList.contains('open'))
    ? document.getElementById('signin-modal-body')
    : document.getElementById('results-wrap');
  if (!wrap) return;
  var m = _signInMode;

  // Helper - back link to the chooser
  var backToChoose =
    '<div style="text-align:center;margin-top:14px;">' +
      '<a href="#" onclick="switchMode(\'choose\');return false;" style="font-size:12px;color:var(--muted);text-decoration:none;">&larr; Back</a>' +
    '</div>';

  // ── CHOOSER MODE: two vertical CTA cards ──
  if (m === 'choose' || !m) {
    wrap.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:18px;">' +
        // Sign UP card
        '<div class="state-box" style="border-top:3px solid var(--gold);padding:34px 28px;text-align:left;cursor:pointer;transition:transform 0.1s,box-shadow 0.1s;" ' +
              'onclick="goToInlineSignup()" ' +
              'onmouseover="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 8px 24px rgba(10,22,40,0.08)\';" ' +
              'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\';">' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div class="sb-icon" style="flex-shrink:0;background:var(--gold);color:var(--ink);border-color:var(--gold);">+</div>' +
            '<div style="flex:1;">' +
              '<div style="display:inline-block;background:var(--gold);color:var(--ink);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 8px;border-radius:2px;margin-bottom:6px;">New here</div>' +
              '<h3 style="font-size:18px;margin:0 0 4px;">Sign up &amp; earn 500 credits today</h3>' +
              '<p style="font-size:12px;color:var(--muted);margin:0;line-height:1.5;">Apply for individual access. Manual approval within 1 business day. 500 credits granted automatically on approval.</p>' +
            '</div>' +
            '<div style="flex-shrink:0;color:var(--gold-deep);font-size:20px;font-weight:600;">&rsaquo;</div>' +
          '</div>' +
        '</div>' +
        // Sign IN card
        '<div class="state-box" style="border-top:3px solid var(--ink);padding:34px 28px;text-align:left;cursor:pointer;transition:transform 0.1s,box-shadow 0.1s;" ' +
              'onclick="switchMode(\'signin\')" ' +
              'onmouseover="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 8px 24px rgba(10,22,40,0.08)\';" ' +
              'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\';">' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div class="sb-icon" style="flex-shrink:0;background:var(--ink);color:#fff;border-color:var(--ink);">&rarr;</div>' +
            '<div style="flex:1;">' +
              '<div style="display:inline-block;background:var(--ink);color:#fff;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 8px;border-radius:2px;margin-bottom:6px;">Returning member</div>' +
              '<h3 style="font-size:18px;margin:0 0 4px;">Welcome back , sign in</h3>' +
              '<p style="font-size:12px;color:var(--muted);margin:0;line-height:1.5;">Sign in with email and password, or with Google to continue your research.</p>' +
            '</div>' +
            '<div style="flex-shrink:0;color:var(--gold-deep);font-size:20px;font-weight:600;">&rsaquo;</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:11px;color:var(--muted);text-align:center;margin-top:16px;">By continuing you agree to the <a href="/terms" target="_blank" style="color:var(--gold-deep);text-decoration:underline;">terms of use</a>. Individual licence - personal research only.</p>';
    return;
  }

  // ── SIGN UP MODE: rich 10-field form ──
  if (m === 'signup') {
    var signupForm =
      '<form onsubmit="submitPasswordSignUp(event)" style="display:flex;flex-direction:column;gap:8px;">' +
        '<label class="field-label" for="f-name">Full name *</label>' +
        '<input type="text" id="f-name" class="search-input" required maxlength="200" placeholder="e.g. Shammi Prabhakar Singh" autocomplete="name">' +
        '<label class="field-label" for="su-email" style="margin-top:6px;">Email *</label>' +
        '<input type="email" id="su-email" class="search-input" required placeholder="you@company.com" autocomplete="email">' +
        '<label class="field-label" for="f-wa" style="margin-top:6px;">WhatsApp number *</label>' +
        '<input type="tel" id="f-wa" class="search-input" required placeholder="+91 98765 43210" autocomplete="tel">' +
        '<label class="field-label" for="f-li" style="margin-top:6px;">LinkedIn profile *</label>' +
        '<input type="url" id="f-li" class="search-input" required placeholder="https://linkedin.com/in/yourprofile">' +
        '<label class="field-label" for="f-gccs" style="margin-top:6px;">Name of GCCs you have worked with *</label>' +
        '<textarea id="f-gccs" class="search-input" required maxlength="1000" placeholder="e.g. NielsenIQ, Bajaj Finserv, KPIT Technologies..." style="min-height:60px;font-family:Inter,sans-serif;"></textarea>' +
        '<label class="field-label" for="f-city" style="margin-top:6px;">Current city *</label>' +
        '<input type="text" id="f-city" class="search-input" required placeholder="e.g. Pune" autocomplete="address-level2">' +
        '<label class="field-label" for="f-exp" style="margin-top:6px;">Years of experience in GCCs *</label>' +
        '<select id="f-exp" class="field-select" required>' +
          '<option value="">Select range</option>' +
          '<option>Less than 2 years</option>' +
          '<option>2-5 years</option>' +
          '<option>5-10 years</option>' +
          '<option>10-15 years</option>' +
          '<option>15+ years</option>' +
        '</select>' +
        '<label class="field-label" for="f-domain" style="margin-top:6px;">Domain expertise *</label>' +
        '<select id="f-domain" class="field-select" required>' +
          '<option value="">Select your domain</option>' +
          '<option>Analytics &amp; Data Science</option>' +
          '<option>Technology &amp; Engineering</option>' +
          '<option>Finance &amp; Accounting</option>' +
          '<option>Operations &amp; Supply Chain</option>' +
          '<option>HR &amp; Talent</option>' +
          '<option>Legal &amp; Compliance</option>' +
          '<option>Marketing &amp; Strategy</option>' +
          '<option>Product Management</option>' +
          '<option>Other</option>' +
        '</select>' +
        '<label class="field-label" for="f-exp2" style="margin-top:6px;">Share your GCC experience &amp; network strength *</label>' +
        '<textarea id="f-exp2" class="search-input" required maxlength="2000" placeholder="Describe your roles, contributions, network reach across the GCC ecosystem..." style="min-height:80px;font-family:Inter,sans-serif;"></textarea>' +
        '<div style="margin-top:6px;font-size:12px;color:var(--graphite);font-weight:600;">Consent for receiving GCC insights &amp; updates on WhatsApp? *</div>' +
        '<div style="display:flex;gap:14px;font-size:13px;color:var(--ink);margin-top:2px;">' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="consent" value="Yes"> Yes, I consent</label>' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="consent" value="No"> No, not now</label>' +
        '</div>' +
        // DPDP Act 2023:express consent block. Separate from the marketing
        // consent above. Mandatory for account creation.
        '<div style="margin-top:14px;padding:12px 14px;background:#EEF3FB;border:1px solid var(--gold-soft);border-radius:3px;">' +
          '<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;font-size:12px;color:var(--ink);line-height:1.45;">' +
            '<input type="checkbox" id="f-dpdp" required style="margin-top:2px;flex-shrink:0;">' +
            '<span><strong>Privacy &amp; data consent (required).</strong> I have read the <a href="/privacy" target="_blank" rel="noopener" style="color:var(--gold-deep);text-decoration:underline;">Privacy Policy</a> and consent to GCCPROs processing the personal data above to (a) verify and approve my account, (b) deliver the research portal, (c) maintain security and statutory records, as described in the policy. I understand I may withdraw this consent at any time via <em>Manage my data</em>. Storage is on Supabase (Singapore). DPDP Act 2023, Section 6.</span>' +
          '</label>' +
        '</div>' +
        '<label class="field-label" for="su-pwd" style="margin-top:10px;">Password *</label>' +
        '<input type="password" id="su-pwd" class="search-input" required minlength="12" placeholder="Min 12 chars: upper, lower, number, special" autocomplete="new-password">' +
        '<label class="field-label" for="su-pwd2" style="margin-top:6px;">Confirm password *</label>' +
        '<input type="password" id="su-pwd2" class="search-input" required minlength="12" placeholder="Repeat password" autocomplete="new-password">' +
        '<div style="margin-top:14px;display:flex;justify-content:center;"><div id="turnstile-signup" aria-label="Bot protection"></div></div>' +
        '<button type="submit" class="search-btn" style="justify-content:center;margin-top:10px;background:var(--gold);color:var(--ink);border:none;font-weight:700;">Apply for access -> 500 credits</button>' +
      '</form>';
    wrap.innerHTML =
      '<div class="state-box" style="border-top:3px solid var(--gold);padding:32px 26px;text-align:left;max-width:none;">' +
        '<div style="text-align:center;margin-bottom:18px;">' +
          '<div style="display:inline-block;background:var(--gold);color:var(--ink);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:4px 10px;border-radius:2px;margin-bottom:10px;">New here</div>' +
          '<h3 style="font-size:19px;">Sign up &amp; earn 500 credits today</h3>' +
          '<p style="font-size:12px;max-width:440px;margin:6px auto 0;">Apply for individual access. New members are manually approved within one business day. 500 credits are granted automatically on approval.</p>' +
        '</div>' +
        '<button type="button" onclick="signInWithGoogle()" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f1f1f;border:1px solid var(--line-2);border-radius:2px;padding:12px 20px;font-size:13px;font-weight:500;font-family:Inter,sans-serif;cursor:pointer;width:100%;transition:all 0.15s;"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Sign up with Google</button>' +
        '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 12px;color:var(--muted);font-size:11px;letter-spacing:1px;text-transform:uppercase;"><span style="flex:1;height:1px;background:var(--line);"></span><span>or sign up with email</span><span style="flex:1;height:1px;background:var(--line);"></span></div>' +
        signupForm +
        '<div id="signin-err" class="modal-err" style="margin-top:10px;"></div>' +
        '<div id="signin-ok" class="modal-ok" style="margin-top:10px;"></div>' +
      '</div>' +
      backToChoose;
    // Mount Cloudflare Turnstile inside the signup card. Safe to call before
    // the script loads:mountTurnstile queues until onTurnstileReady fires.
    setTimeout(function(){ mountTurnstile('turnstile-signup', { action: 'signup' }); }, 50);
    return;
  }

  // ── SIGN IN MODE: simple email + password + Google ──
  if (m === 'signin') {
    var googleBtn =
      '<button type="button" onclick="signInWithGoogle()" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f1f1f;border:1px solid var(--line-2);border-radius:2px;padding:12px 20px;font-size:13px;font-weight:500;font-family:Inter,sans-serif;cursor:pointer;width:100%;transition:all 0.15s;">' +
        '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
        'Sign in with Google' +
      '</button>';
    var divider =
      '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 12px;color:var(--muted);font-size:11px;letter-spacing:1px;text-transform:uppercase;">' +
        '<span style="flex:1;height:1px;background:var(--line);"></span>' +
        '<span>or sign in with email</span>' +
        '<span style="flex:1;height:1px;background:var(--line);"></span>' +
      '</div>';
    var signinForm =
      '<form onsubmit="submitPasswordSignIn(event)" style="display:flex;flex-direction:column;gap:8px;">' +
        '<label class="field-label" for="signin-email">Work email</label>' +
        '<input type="email" id="signin-email" class="search-input" required placeholder="you@company.com" autocomplete="email">' +
        '<label class="field-label" for="signin-pwd" style="margin-top:6px;">Password</label>' +
        '<input type="password" id="signin-pwd" class="search-input" required minlength="8" placeholder="Enter your password" autocomplete="current-password">' +
        '<div style="font-size:11px;color:var(--muted);text-align:right;margin-top:-2px;"><a href="#" onclick="switchMode(\'reset\');return false;" style="color:var(--gold-deep);text-decoration:underline;">Forgot password?</a></div>' +
        '<button type="submit" class="search-btn" style="justify-content:center;margin-top:6px;">Sign in</button>' +
      '</form>';
    wrap.innerHTML =
      '<div class="state-box" style="border-top:3px solid var(--ink);padding:32px 26px;text-align:left;max-width:none;">' +
        '<div style="text-align:center;margin-bottom:18px;">' +
          '<div style="display:inline-block;background:var(--ink);color:#fff;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:4px 10px;border-radius:2px;margin-bottom:10px;">Returning member</div>' +
          '<h3 style="font-size:19px;">Welcome back</h3>' +
          '<p style="font-size:12px;max-width:440px;margin:6px auto 0;">Sign in with email and password, or with Google.</p>' +
        '</div>' +
        '<div style="max-width:380px;margin:0 auto;">' +
          '<div style="background:#EEF3FB;border:1px solid #9DC0EE;border-radius:4px;padding:10px 12px;margin-bottom:14px;font-size:11.5px;color:#1A3A6E;line-height:1.5;">Returning after a while, or migrated from the old portal? If you are facing any login issues, use <a href="#" onclick="switchMode(\'reset\');return false;" style="color:var(--gold-deep);font-weight:700;text-decoration:underline;">Forgot password?</a> to set a new one.</div>' +
          googleBtn + divider + signinForm +
        '</div>' +
        '<div id="signin-err" class="modal-err" style="margin-top:10px;"></div>' +
        '<div id="signin-ok" class="modal-ok" style="margin-top:10px;"></div>' +
      '</div>' +
      backToChoose;
    return;
  }

  // ── OTP MODE: 6-digit verification code entered after the signup form ──
  if (m === 'otp') {
    var pendingEmail = (window._pendingSignup && window._pendingSignup.email) || '';
    wrap.innerHTML =
      '<div class="state-box" style="border-top:3px solid var(--gold);padding:32px 26px;text-align:left;max-width:none;">' +
        '<div style="text-align:center;margin-bottom:18px;">' +
          '<div class="sb-icon" style="margin:0 auto 12px;">@</div>' +
          '<h3 style="font-size:19px;">Check your email</h3>' +
          '<p style="font-size:12px;max-width:440px;margin:6px auto 0;">We sent a 6-digit verification code to <strong>' + escHtml(pendingEmail) + '</strong>. Enter it below to finish creating your account.</p>' +
        '</div>' +
        '<div style="max-width:340px;margin:0 auto;">' +
          '<form onsubmit="submitOTP(event)" style="display:flex;flex-direction:column;gap:10px;">' +
            '<label class="field-label" for="otp-code">6-digit code</label>' +
            '<input type="text" id="otp-code" class="search-input" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" placeholder="000000" autocomplete="one-time-code" autofocus style="font-size:22px;letter-spacing:8px;text-align:center;font-weight:700;">' +
            '<button type="submit" class="search-btn" style="justify-content:center;margin-top:6px;background:var(--gold);color:var(--ink);border:none;font-weight:700;">Verify &amp; create account</button>' +
            '<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:6px;">' +
              'Didn\'t get it? <a href="#" onclick="resendOTP();return false;" style="color:var(--gold-deep);text-decoration:underline;">Resend code</a>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:2px;">' +
              '<a href="#" onclick="switchMode(\'signup\');return false;" style="color:var(--gold-deep);text-decoration:underline;">&larr; Use a different email</a>' +
            '</div>' +
          '</form>' +
          '<div id="signin-err" class="modal-err" style="margin-top:10px;"></div>' +
          '<div id="signin-ok" class="modal-ok" style="margin-top:10px;"></div>' +
        '</div>' +
      '</div>' +
      backToChoose;
    return;
  }

  // ── RESET MODE: send password reset link ──
  if (m === 'reset') {
    wrap.innerHTML =
      '<div class="state-box" style="border-top:3px solid var(--gold);padding:32px 26px;text-align:left;max-width:none;">' +
        '<div style="text-align:center;margin-bottom:18px;">' +
          '<div class="sb-icon" style="margin:0 auto 12px;">?</div>' +
          '<h3 style="font-size:19px;">Reset your password</h3>' +
          '<p style="font-size:12px;max-width:440px;margin:6px auto 0;">Enter your email and we will send you a reset link.</p>' +
        '</div>' +
        '<div style="max-width:380px;margin:0 auto;">' +
          '<form onsubmit="submitPasswordReset(event)" style="display:flex;flex-direction:column;gap:10px;">' +
            '<label class="field-label" for="signin-email">Work email</label>' +
            '<input type="email" id="signin-email" class="search-input" required placeholder="you@company.com" autocomplete="email" autofocus>' +
            '<button type="submit" class="search-btn" style="justify-content:center;">Send reset link</button>' +
            '<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:4px;"><a href="#" onclick="switchMode(\'signin\');return false;" style="color:var(--gold-deep);text-decoration:underline;">Back to sign in</a></div>' +
          '</form>' +
          '<div id="signin-err" class="modal-err" style="margin-top:10px;"></div>' +
          '<div id="signin-ok" class="modal-ok" style="margin-top:10px;"></div>' +
        '</div>' +
      '</div>' +
      backToChoose;
    return;
  }
}

function switchMode(mode) {
  showSignInState(mode);
  setTimeout(function(){
    var el = document.getElementById('signin-email');
    if (el) el.focus();
    // Wire real-time validation on the signup form's email field.
    // Triggers checkEmail when the user blurs the email so duplicates
    // surface immediately, not after they fill the entire form.
    if (mode === 'signup') _wireSignupBlurValidation();
  }, 50);
}

function _wireSignupBlurValidation() {
  var emailEl = document.getElementById('su-email');
  if (emailEl && !emailEl._wired) {
    emailEl._wired = true;
    emailEl.addEventListener('blur', async function() {
      var email = (this.value || '').trim().toLowerCase();
      if (!email || email.indexOf('@') < 1) return;
      try {
        var res = await fetch(SCRIPT_URL + '?action=checkEmail&email=' + encodeURIComponent(email));
        var data = await res.json();
        if (data.exists) {
          var msg;
          if (data.migrated) msg = 'This email was migrated. Use Forgot Password to set a new password.';
          else if (data.source === 'firebase') msg = 'This email already has a login. Use "Welcome back" or Forgot Password.';
          else msg = 'This email is already registered. Use "Welcome back" to sign in.';
          _showSignInErr(msg);
        } else {
          _showSignInErr('');  // clear any previous error
        }
      } catch(_) { /* network glitch; let final submit handle it */ }
    });
  }

  var waEl = document.getElementById('f-wa');
  if (waEl && !waEl._wired) {
    waEl._wired = true;
    waEl.addEventListener('blur', function() {
      var v = (this.value || '').trim();
      if (!v) return;
      var digits = v.replace(/\D/g, '');
      if (digits.length < 10) _showSignInErr('WhatsApp number must be at least 10 digits.');
    });
  }

  var liEl = document.getElementById('f-li');
  if (liEl && !liEl._wired) {
    liEl._wired = true;
    liEl.addEventListener('blur', function() {
      var v = (this.value || '').trim().toLowerCase();
      if (!v) return;
      if (v.indexOf('linkedin.com') < 0) _showSignInErr('LinkedIn URL must contain linkedin.com.');
    });
  }

  var pwdEl = document.getElementById('su-pwd');
  if (pwdEl && !pwdEl._wired) {
    pwdEl._wired = true;
    pwdEl.addEventListener('blur', function() {
      var pwd = this.value || '';
      if (!pwd) return;
      if (pwd.length < 12) return _showSignInErr('Password must be at least 12 characters.');
      if (!/[a-z]/.test(pwd)) return _showSignInErr('Password must include a lowercase letter.');
      if (!/[A-Z]/.test(pwd)) return _showSignInErr('Password must include an uppercase letter.');
      if (!/[0-9]/.test(pwd)) return _showSignInErr('Password must include a number.');
      if (!/[^a-zA-Z0-9]/.test(pwd)) return _showSignInErr('Password must include a special character.');
      _showSignInErr('');
    });
  }
}

function _showSignInErr(msg) {
  var e = document.getElementById('signin-err');
  var o = document.getElementById('signin-ok');
  if (o) o.style.display = 'none';
  if (e) {
    e.textContent = msg || '';
    e.style.display = (msg && String(msg).trim()) ? 'block' : 'none';
  }
}
function _showSignInOk(msg) {
  var e = document.getElementById('signin-err');
  var o = document.getElementById('signin-ok');
  if (e) e.style.display = 'none';
  if (o) { o.textContent = msg; o.style.display = 'block'; }
}

async function submitPasswordSignIn(ev) {
  ev.preventDefault();
  var email = (document.getElementById('signin-email').value || '').trim().toLowerCase();
  var pwd   = document.getElementById('signin-pwd').value;
  var btn   = ev.target.querySelector('button[type="submit"]');
  if (!email || email.indexOf('@') < 1) return _showSignInErr('Please enter a valid email.');
  if (!pwd || pwd.length < 8)            return _showSignInErr('Password must be at least 8 characters.');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pwd);
    _recordLogin(email, true);
    // onAuthStateChanged fires next - takes it from there
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    _recordLogin(email, false);
    var msg;
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential')
      msg = 'No account with that email + password. New here? Click "Create an account".';
    else if (e.code === 'auth/wrong-password') msg = 'Incorrect password. Try again or reset it below.';
    else if (e.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again in a few minutes or reset your password.';
    else if (e.code === 'auth/network-request-failed') msg = 'Network issue. Check your connection and retry.';
    else msg = 'Sign-in failed (' + (e.code || 'unknown') + '). Please try again.';
    _showSignInErr(msg);
  }
}

async function submitPasswordSignUp(ev) {
  ev.preventDefault();
  function val(id){ var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
  var email = val('su-email').toLowerCase();
  var pwd   = document.getElementById('su-pwd').value;
  var pwd2  = document.getElementById('su-pwd2').value;
  var fullName    = val('f-name');
  var whatsapp    = val('f-wa');
  var linkedin    = val('f-li');
  var gccsWorked  = val('f-gccs');
  var currentCity = val('f-city');
  var yearsExp    = val('f-exp');
  var domainExp   = val('f-domain');
  var eligibility = val('f-exp2');
  var consentEl   = document.querySelector('input[name="consent"]:checked');
  var waConsent   = consentEl ? consentEl.value : '';
  var dpdpEl      = document.getElementById('f-dpdp');
  var dpdpConsent = !!(dpdpEl && dpdpEl.checked);
  var btn = ev.target.querySelector('button[type="submit"]');

  if (!fullName)                         return _showSignInErr('Please enter your full name.');
  if (!email || email.indexOf('@') < 1)  return _showSignInErr('Please enter a valid email.');
  if (!whatsapp || whatsapp.replace(/\D/g,'').length < 10) return _showSignInErr('Please enter a valid WhatsApp number (at least 10 digits).');
  if (!linkedin || linkedin.toLowerCase().indexOf('linkedin.com') < 0) return _showSignInErr('Please enter a valid LinkedIn profile URL.');
  if (!gccsWorked)                       return _showSignInErr('Please list at least one GCC you have worked with.');
  if (!currentCity)                      return _showSignInErr('Please enter your current city.');
  if (!yearsExp)                         return _showSignInErr('Please select your years of experience.');
  if (!domainExp)                        return _showSignInErr('Please select your domain expertise.');
  if (!eligibility)                      return _showSignInErr('Please describe your GCC experience and network strength.');
  if (!waConsent)                        return _showSignInErr('Please choose your WhatsApp consent preference.');
  if (!dpdpConsent)                      return _showSignInErr('Please tick the Privacy & data consent box to continue. (Required under the DPDP Act 2023.)');
  if (!pwd || pwd.length < 12)           return _showSignInErr('Password must be at least 12 characters.');
  if (!/[a-z]/.test(pwd))                return _showSignInErr('Password must include a lowercase letter.');
  if (!/[A-Z]/.test(pwd))                return _showSignInErr('Password must include an uppercase letter.');
  if (!/[0-9]/.test(pwd))                return _showSignInErr('Password must include a number.');
  if (!/[^a-zA-Z0-9]/.test(pwd))         return _showSignInErr('Password must include a special character (e.g. ! @ # $ %).');
  if (pwd !== pwd2)                      return _showSignInErr('Passwords do not match.');

  // CAPTCHA token (Cloudflare Turnstile). Block submit if the user did not
  // complete the challenge:guards the requestApproval endpoint downstream.
  var cfToken = readTurnstileToken('turnstile-signup');
  if (!cfToken) {
    return _showSignInErr('Please complete the "I’m human" verification just above the Apply button, then try again.');
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }

  // 1. Block if email already in V2_Accounts (migrated, pending, suspended, etc.)
  try {
    var checkRes = await fetch(SCRIPT_URL + '?action=checkEmail&email=' + encodeURIComponent(email));
    var checkData = await checkRes.json();
    if (checkData.exists) {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply for access -> 500 credits'; }
      var msg;
      if (checkData.migrated) {
        msg = 'This email was migrated from the old portal. Please click "Welcome back" -> "Forgot password" to set a new password.';
      } else if (checkData.source === 'firebase') {
        msg = 'This email already has a login on file. Try "Welcome back" with your password, or "Forgot password" to reset. If you do not remember signing up, contact admin@gccpros.com.';
      } else {
        msg = 'This email is already registered (' + (checkData.status || 'on file') + '). Try "Welcome back" to sign in, or "Forgot password" to reset.';
      }
      _showSignInErr(msg);
      return;
    }
  } catch(_) { /* if check fails, proceed - server-side gate will catch dups */ }

  // 2. Stash the form so we can resubmit after OTP verifies.
  //    dpdpConsentTs records the exact moment the Data Principal ticked the
  //    consent box:auditable proof for DPDP Act compliance.
  window._pendingSignup = {
    email: email, pwd: pwd,
    fullName: fullName, whatsapp: whatsapp, linkedin: linkedin,
    gccsWorked: gccsWorked, currentCity: currentCity, yearsExp: yearsExp,
    domainExpertise: domainExp, eligibility: eligibility, waConsent: waConsent,
    cfToken: cfToken,
    dpdpConsent: 'Yes',
    dpdpConsentTs: new Date().toISOString(),
    dpdpPolicyVersion: '2026-05-18'
  };

  // 3. Request OTP
  if (btn) btn.textContent = 'Sending code...';
  try {
    // OTP send/verify continues to run through the legacy Apps Script (it has
    // Gmail access for the email). Everything else goes through the Edge Function.
    var otpRes = await fetch(APPS_SCRIPT_URL + '?action=requestOTP&email=' + encodeURIComponent(email));
    var otpData = await otpRes.json();
    if (otpData.error) {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply for access -> 500 credits'; }
      if (otpData.error === 'email_exists') {
        _showSignInErr('This email is already registered. Try signing in or use Forgot Password.');
      } else if (otpData.error === 'rate_limited') {
        _showSignInErr(otpData.message || 'Please wait before requesting another code.');
      } else if (otpData.error === 'captcha_failed') {
        resetTurnstile('turnstile-signup');
        _showSignInErr('CAPTCHA verification failed. Please tick the "I’m human" box again and re-submit.');
      } else {
        _showSignInErr('Could not send verification code. Try again.');
      }
      return;
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply for access -> 500 credits'; }
    _showSignInErr('Network issue while sending verification code. Please retry.');
    return;
  }

  // 4. Switch to OTP entry screen
  switchMode('otp');
}

async function submitOTP(ev) {
  ev.preventDefault();
  if (!window._pendingSignup) {
    _showSignInErr('Session expired. Please start signup again.');
    switchMode('signup');
    return;
  }
  // Tell fetchCreditBalance that a legitimate signup is in flight, so it
  // doesn't sign the user out during the brief window between Firebase
  // user creation and V2_Accounts row creation.
  window._signupInProgress = true;
  setTimeout(function(){ window._signupInProgress = false; }, 30000);
  var code = (document.getElementById('otp-code').value || '').trim();
  if (!/^\d{6}$/.test(code)) return _showSignInErr('Enter the 6-digit code from your email.');
  var p = window._pendingSignup;
  var btn = ev.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }

  // 1. Verify OTP
  var signupToken = '';
  try {
    var vres = await fetch(APPS_SCRIPT_URL + '?action=verifyOTP&email=' + encodeURIComponent(p.email) + '&code=' + encodeURIComponent(code));
    var vdata = await vres.json();
    if (vdata.error) {
      if (btn) { btn.disabled = false; btn.textContent = 'Verify & create account'; }
      if (vdata.error === 'wrong_code')          _showSignInErr('That code is incorrect. Try again or request a new one.');
      else if (vdata.error === 'expired_or_unknown') _showSignInErr('Code expired. Please request a new one.');
      else _showSignInErr('Verification failed. Please retry.');
      return;
    }
    signupToken = vdata.signupToken;
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Verify & create account'; }
    _showSignInErr('Network issue verifying code. Please retry.');
    return;
  }

  // 2. Create (or reuse) the Firebase user.
  if (btn) btn.textContent = 'Creating account...';
  var _authReady = false;
  try {
    await firebase.auth().createUserWithEmailAndPassword(p.email, p.pwd);
    _authReady = true;
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      // Email already has a Firebase login (e.g. a user previously deleted from our DB
      // re-registering). Reuse it by signing in with the entered password, then continue
      // below so the account row is rebuilt. If the password no longer matches, email a
      // reset link instead.
      try { await firebase.auth().signInWithEmailAndPassword(p.email, p.pwd); _authReady = true; } catch (_e2) {}
      if (!_authReady) {
        if (btn) { btn.disabled = false; btn.textContent = 'Verify & create account'; }
        try { await firebase.auth().sendPasswordResetEmail(p.email); } catch(_) {}
        _showSignInOk('This email already has a login. Use your previous password to continue, or we have emailed a reset link to ' + p.email + ' so you can set a new one and sign in.');
        window._pendingSignup = null;
        window._signupInProgress = false;
        setTimeout(function(){ switchMode('signin'); }, 8000);
        return;
      }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Verify & create account'; }
      var msg;
      if (e.code === 'auth/invalid-email')               msg = 'That email does not look valid.';
      else if (e.code === 'auth/weak-password')          msg = 'Password is too weak.';
      else if (e.code === 'auth/network-request-failed') msg = 'Network issue. Check your connection and retry.';
      else msg = 'Sign-up failed (' + (e.code || 'unknown') + '). Please try again.';
      _showSignInErr(msg);
      return;
    }
  }
  if (!_authReady) return;

  // 3. Submit profile + signupToken to backend (this creates the users row)
  //    The Turnstile token captured at sign-up time is forwarded here so the
  //    Edge Function can server-side verify before writing to the DB.
  // 2026-06-08 v7.7-loud-signup-errors:
  // The silent catch here used to swallow EVERY failure, leaving Firebase
  // accounts orphaned with no Supabase row. The user saw "Pending" forever
  // and the admin panel had no entry to approve. Now we surface the real
  // cause to the user AND log it to the console for post-mortem.
  console.log('[signup] POST requestApproval for', p.email);
  try {
    var _raUrl = SCRIPT_URL + '?action=requestApproval'
      + '&token='     + encodeURIComponent(p.email)
      + '&signupToken=' + encodeURIComponent(signupToken)
      + '&cfToken='   + encodeURIComponent(p.cfToken || '')
      + '&ua='        + encodeURIComponent(navigator.userAgent || '')
      + '&ref='       + encodeURIComponent(document.referrer || '')
      + '&fullName='  + encodeURIComponent(p.fullName)
      + '&whatsapp='  + encodeURIComponent(p.whatsapp)
      + '&linkedin='  + encodeURIComponent(p.linkedin)
      + '&gccsWorked='+ encodeURIComponent(p.gccsWorked)
      + '&currentCity='+ encodeURIComponent(p.currentCity)
      + '&yearsExp='  + encodeURIComponent(p.yearsExp)
      + '&domainExpertise=' + encodeURIComponent(p.domainExpertise)
      + '&eligibility='+ encodeURIComponent(p.eligibility)
      + '&waConsent=' + encodeURIComponent(p.waConsent)
      + '&dpdpConsent=' + encodeURIComponent(p.dpdpConsent || 'Yes')
      + '&dpdpConsentTs=' + encodeURIComponent(p.dpdpConsentTs || new Date().toISOString())
      + '&dpdpPolicyVersion=' + encodeURIComponent(p.dpdpPolicyVersion || '2026-05-18');
    var _raRes = await fetch(_raUrl);
    var _raText = await _raRes.text();
    console.log('[signup] requestApproval status=' + _raRes.status + ' body=' + _raText.substring(0, 500));
    var _raJson = {}; try { _raJson = JSON.parse(_raText); } catch (_) { _raJson = { error: 'non_json_response', message: _raText.substring(0, 200) }; }
    if (!_raRes.ok || (_raJson && _raJson.error)) {
      var _errCode = (_raJson && _raJson.error) || ('HTTP_' + _raRes.status);
      var _rmsg = (_raJson && _raJson.message) || (_errCode === 'duplicate_identity'
        ? 'This LinkedIn profile or phone number is already registered to another account. Each member may hold only one account.'
        : _errCode === 'captcha_failed'
        ? 'The bot check did not pass. Please reload the page and try again.'
        : _errCode === 'blacklisted'
        ? 'This account has been blocked. Please contact admin@gccpros.com.'
        : ('Registration did not complete (' + _errCode + '). Please screenshot this and email admin@gccpros.com.'));
      console.error('[signup] FAILED:', _errCode, _raJson);
      // remove the just-created Firebase account so no orphan login remains
      try { var _cu = firebase.auth().currentUser; if (_cu) { await _cu.delete(); } } catch (_) { try { await firebase.auth().signOut(); } catch (_) {} }
      window._pendingSignup = null;
      switchMode('signin');
      _showSignInErr(_rmsg);
      return;
    }
    console.log('[signup] requestApproval OK, user row created in Supabase');
  } catch (e) {
    // Network failure / CORS / DNS, was previously SILENTLY swallowed.
    console.error('[signup] requestApproval threw exception:', e);
    var _netMsg = 'Could not reach the registration server (' + (e && e.message ? e.message : 'network error') + '). Your account was NOT saved. Please retry, and if it keeps failing email admin@gccpros.com with this message.';
    try { var _cu2 = firebase.auth().currentUser; if (_cu2) { await _cu2.delete(); } } catch (_) { try { await firebase.auth().signOut(); } catch (_) {} }
    window._pendingSignup = null;
    switchMode('signin');
    _showSignInErr(_netMsg);
    return;
  }

  window._pendingSignup = null;
  // onAuthStateChanged will pick up the new user and show the Pending screen.
}

async function resendOTP() {
  if (!window._pendingSignup) return;
  _showSignInErr('');
  try {
    var r = await fetch(APPS_SCRIPT_URL + '?action=requestOTP&email=' + encodeURIComponent(window._pendingSignup.email));
    var d = await r.json();
    if (d.ok) _showSignInOk('A new code has been sent.');
    else if (d.error === 'rate_limited') _showSignInErr(d.message || 'Please wait 30 seconds before requesting another code.');
    else _showSignInErr('Could not resend code. Please try again.');
  } catch (_) { _showSignInErr('Network issue. Please retry.'); }
}

async function submitPasswordReset(ev) {
  ev.preventDefault();
  var email = (document.getElementById('signin-email').value || '').trim().toLowerCase();
  var btn   = ev.target.querySelector('button[type="submit"]');
  if (!email || email.indexOf('@') < 1) return _showSignInErr('Please enter a valid email.');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }

  // v6.2: only REGISTERED members may reset. A non-registered email that happens
  // to have a Firebase login could otherwise reset and then hit the "not
  // registered" wall at sign-in (the abhay case). Verify the users registry first.
  try {
    var _cr = await fetch(SCRIPT_URL + '?action=checkEmail&email=' + encodeURIComponent(email));
    var _cd = await _cr.json();
    if (_cd && _cd.exists === false) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
      return _showSignInErr('This email is not registered for the GCC Database. Please use "Sign up & earn 500 credits" to apply for access first - you cannot reset a password for an account that does not exist yet.');
    }
  } catch (_) { /* registry check failed - fall through and let Firebase handle it */ }

  if (btn) { btn.textContent = 'Sending link...'; }
  try {
    await firebase.auth().sendPasswordResetEmail(email);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
    if (e.code === 'auth/invalid-email') return _showSignInErr('That email does not look valid.');
    if (e.code === 'auth/network-request-failed') return _showSignInErr('Network issue. Please retry.');
    return _showSignInErr('Could not send reset link (' + (e.code || 'unknown') + '). Try again.');
  }
  _showSignInOk('If this email is registered, a reset link has been sent. Please check your inbox (and spam folder) within 1-2 minutes.');
  if (btn) { btn.disabled = true; btn.textContent = 'Sent'; }
  setTimeout(function(){ switchMode('signin'); }, 4500);
}

// Fire-and-forget: record a login attempt to the V2_Accounts sheet.
// Used to power the "last login" / "failed login" tracking. We don't
// await this - if it fails, the user shouldn't notice or wait.
function _recordLogin(email, success) {
  if (!email) return;
  try {
    fetch(SCRIPT_URL + '?action=recordLogin&email=' + encodeURIComponent(email) + '&success=' + (success ? '1' : '0'), { mode: 'no-cors' });
  } catch(_) { /* silent */ }
}

async function signInWithGoogle() {
  _showSignInErr('');
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // Try popup first - keeps the auth flow in a first-party context, so the
  // session cookies survive the round-trip back to www.gccpros.com.
  // Fall back to redirect only if the popup is blocked (e.g. on mobile).
  try {
    var r = await firebase.auth().signInWithPopup(provider);
    if (r && r.user) _recordLogin(r.user.email, true);
    // onAuthStateChanged fires with the user; nothing more to do.
    return r;
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      try {
        await firebase.auth().signInWithRedirect(provider);
        return;
      } catch (e2) {
        e = e2;
      }
    }
    if (e && e.code === 'auth/popup-closed-by-user') return; // user cancelled - silent
    if (e && e.code === 'auth/cancelled-popup-request') return;
    var msg;
    if (e.code === 'auth/unauthorized-domain')          msg = 'This domain is not authorised for Google sign-in. Use email + password instead.';
    else if (e.code === 'auth/operation-not-allowed')   msg = 'Google sign-in is disabled. Use email + password instead.';
    else if (e.code === 'auth/network-request-failed')  msg = 'Network issue. Check your connection and retry.';
    else msg = 'Could not start Google sign-in (' + (e.code || 'unknown') + '). Use email + password instead.';
    _showSignInErr(msg);
  }
}

async function handleGoogleRedirectReturn() {
  try {
    var r = await firebase.auth().getRedirectResult();
    return r && r.user ? true : false;
  } catch (e) {
    if (e && e.code) {
      var msg = 'Google sign-in failed (' + e.code + '). Please use email + password.';
      setTimeout(function(){ _showSignInErr(msg); }, 800);
    }
    return false;
  }
}

// ── USER PILL: SIGN-IN / SIGN-OUT TOGGLE ────────────────
async function onUserPillClick() {
  var isAuthed = !!(currentUser || _cachedEmail);
  if (isAuthed) {
    // SIGN OUT
    try { await firebase.auth().signOut(); } catch(e) {}
    try {
      var t = _cachedEmail || (currentUser && currentUser.email) || localStorage.getItem('gcc_token');
      if (t) localStorage.removeItem('gcc_credits_' + t);
      localStorage.removeItem('gcc_token');
      localStorage.removeItem('gcc_region');
    } catch(e) {}
    currentUser = null;
    _cachedEmail = null;
    _credits = 0;
    _accountStatus = null;
    document.body.classList.remove('is-authed');
    // Hard reload so every state derived from the previous session is gone.
    location.reload();
  } else {
    openSignInModal();
  }
}

// ── HELPERS ──────────────────────────────────────────────
function getToken() {
  return (currentUser ? currentUser.email : null) || _cachedEmail || localStorage.getItem('gcc_token') || '';
}

// ── COST TEXT ────────────────────────────────────────────
function updateCostText() {
  var sCost = document.getElementById('search-cost-text');
  var rCost = document.getElementById('reveal-cost-text');
  if (sCost) {
    var priceS = (_currency === 'USD') ? '$' + (SEARCH_COST * USD_PER_CREDIT).toFixed(2) : '\u20b9' + (SEARCH_COST * INR_PER_CREDIT);
    sCost.textContent = SEARCH_COST + ' credits (' + priceS + ')';
  }
  if (rCost) {
    var priceR = (_currency === 'USD') ? '$' + (REVEAL_COST * USD_PER_CREDIT).toFixed(2).replace(/\.00$/,'') : '\u20b9' + (REVEAL_COST * INR_PER_CREDIT);
    rCost.textContent = REVEAL_COST + ' credits (' + priceR + ')';
  }
}

// ── CREDIT BALANCE ──────────────────────────────────────
async function fetchCreditBalance(retryCount) {
  retryCount = retryCount || 0;
  const token = getToken();
  if (!token) return;
  try {
    const res = await apiFetch(SCRIPT_URL + '?action=getCreditBalance&token=' + encodeURIComponent(token));
    const data = await res.json();
    if (data.error && data.error !== 'new_user' && !data.newUser) {
      console.warn('Credit fetch failed', data.error);
      _credits = 0; _accountStatus = data.status || 'Unknown'; renderCredits();
      var lbl = document.getElementById('cm-label');
      if (lbl) lbl.textContent = 'Could not load credits. Refresh to retry.';
      return;
    }
    if (data.newUser || data.error === 'new_user' || data.status === 'New' || data.status === 'Unregistered') {
      // Race window during legitimate signup: V2_Accounts row is being
      // created server-side. Retry briefly before giving up.
      if (window._signupInProgress && retryCount < 8) {
        setTimeout(function(){ fetchCreditBalance(retryCount + 1); }, 1500);
        return;
      }
      // Unregistered Firebase user trying to access the portal (e.g. via
      // Forgot Password on an unknown email, or Google sign-in for a
      // brand-new email). Sign them out and tell them to use Sign Up.
      try { await firebase.auth().signOut(); } catch(_) {}
      try {
        var t = _cachedEmail || (currentUser && currentUser.email) || localStorage.getItem('gcc_token');
        if (t) localStorage.removeItem('gcc_credits_' + t);
        localStorage.removeItem('gcc_token');
      } catch(_) {}
      currentUser = null; _cachedEmail = null;
      _credits = 0; _accountStatus = null;
      document.body.classList.remove('is-authed');
      var pill = document.getElementById('user-pill');
      if (pill) pill.textContent = 'Sign in';
      showSignInState('choose');
      // Surface a clear error banner above the chooser
      setTimeout(function(){
        var w = document.getElementById('results-wrap');
        if (w) {
          var banner = document.createElement('div');
          banner.style.cssText = 'background:#FEF1F1;border:1px solid #FFB3B3;padding:14px 18px;border-radius:4px;margin-bottom:14px;color:#C62828;font-size:13px;line-height:1.5;';
          banner.innerHTML = '<strong>This email is not registered.</strong> Please apply for access using <strong>"Sign up & earn 500 credits"</strong>. New members must complete the registration form and pass email verification before they can access the database.';
          w.insertBefore(banner, w.firstChild);
        }
      }, 50);
      return;
    }
    _accountStatus = data.status || 'Approved';
    var _prevCredits = _credits;
    _credits = (typeof data.credits === 'number') ? data.credits : 0;
    // Seed ledger on very first load so user sees at least a balance snapshot
    if (_ledgerRead().length === 0 && _credits > 0) {
      _ledgerPush('credit', _credits, _credits, 'Account balance (on sign-in)');
    }
    _monthlyReveals = (typeof data.monthlyReveals === 'number') ? data.monthlyReveals : 0;
    _monthlyCap = (typeof data.monthlyCap === 'number') ? data.monthlyCap : MONTHLY_REVEAL_CAP;
    _revealedThisMonth = new Set(Array.isArray(data.revealedThisMonth) ? data.revealedThisMonth : []);
    _totalAllowance = Math.max(_credits, DEFAULT_ALLOWANCE);

    if (_accountStatus === 'Suspended') { renderCredits(); showSuspendedState(data.suspendedReason || ''); return; }
    if (_accountStatus === 'Rejected')  { renderCredits(); showRejectedState(); return; }
    if (_accountStatus === 'Pending')   { renderCredits(); showPendingState(); return; }
    renderCredits();
    // Approved, replace any sign-in/sign-up/pending card in results-wrap
    // with the default "Begin your research" state, so the auth box never
    // lingers after a successful login.
    if (_accountStatus === 'Approved') showReadyToSearchState();
    if (typeof onFieldChange === 'function') onFieldChange();
  } catch(err) {
    console.warn('Credit fetch error', err);
    var mirror = parseInt(localStorage.getItem('gcc_credits_' + getToken()) || '0', 10);
    if (mirror > 0) { _credits = mirror; _accountStatus = 'Approved'; renderCredits(); }
    else { var lbl = document.getElementById('cm-label'); if (lbl) lbl.textContent = 'Could not load credits. Refresh to retry.'; }
  }
}

async function requestApproval() {
  const token = getToken();
  try {
    await fetch(SCRIPT_URL + '?action=requestApproval'
      + '&token=' + encodeURIComponent(token)
      + '&ua='    + encodeURIComponent(navigator.userAgent || '')
      + '&ref='   + encodeURIComponent(document.referrer || ''), { mode: 'no-cors' });
  } catch(e) {}
}


// ── LOCAL CREDIT LEDGER (localStorage) ──────────────────────────────────────
// Stores the last 100 transactions in the browser so the statement modal
// works without needing a deployed Apps Script endpoint.
var _LEDGER_KEY_PREFIX = 'gcc_ledger_';
function _ledgerKey() { return _LEDGER_KEY_PREFIX + (getToken() || 'anon'); }

function _ledgerPush(type, amount, balanceAfter, reason) {
  try {
    var key = _ledgerKey();
    var rows = JSON.parse(localStorage.getItem(key) || '[]');
    rows.unshift({ ts: new Date().toISOString(), type: type, amount: amount, balance: balanceAfter, reason: reason || '' });
    if (rows.length > 100) rows = rows.slice(0, 100);
    localStorage.setItem(key, JSON.stringify(rows));
  } catch(_) {}
}

function _ledgerRead() {
  try { return JSON.parse(localStorage.getItem(_ledgerKey()) || '[]'); } catch(_) { return []; }
}

function renderCredits() {
  const n = (typeof _credits === 'number') ? _credits : 0;
  const reveals = Math.floor(n / REVEAL_COST);
  const searches = Math.floor(n / SEARCH_COST);
  const chip = document.getElementById('credit-chip-num');
  const cmNum = document.getElementById('cm-num');
  if (chip) chip.textContent = n.toLocaleString('en-IN');
  if (cmNum) cmNum.textContent = n.toLocaleString('en-IN');

  let label;
  if (n <= 0) label = 'No credits - top up to continue';
  else {
    const valueStr = (_currency === 'USD')
      ? '$' + (n * USD_PER_CREDIT).toFixed(2)
      : '\u20b9' + (n * INR_PER_CREDIT).toLocaleString('en-IN');
    label = reveals + ' reveal' + (reveals === 1 ? '' : 's') + ' or ' + searches + ' search page' + (searches === 1 ? '' : 's') + ' \u00b7 ' + valueStr;
  }
  const lbl = document.getElementById('cm-label');
  if (lbl) lbl.textContent = label;

  const pct = Math.max(4, Math.min(100, Math.round((n / _totalAllowance) * 100)));
  const fill = document.getElementById('cm-fill');
  if (fill) fill.style.width = pct + '%';

  const mrEl = document.getElementById('cm-reveals-num');
  if (mrEl) mrEl.textContent = _monthlyReveals;

  if (getToken()) localStorage.setItem('gcc_credits_' + getToken(), String(n));
}

async function deductCredits(cost, reason) {
  const token = getToken();
  if (!token) return false;
  try {
    const url = SCRIPT_URL + '?action=deductCredits&token=' + encodeURIComponent(token) +
                '&amount=' + cost + '&reason=' + encodeURIComponent(reason || 'search');
    const res = await apiFetch(url);
    const data = await res.json();
    if (data.error === 'insufficient_credits') { showInsufficientCredits(data.balance || 0, cost); return false; }
    if (data.error) {
      _credits = Math.max(0, (_credits || 0) - cost);
      renderCredits();
      return true;
    }
    _credits = data.balance;
    _ledgerPush('debit', -cost, _credits, reason || 'search');
    renderCredits();
    return true;
  } catch(e) {
    _credits = Math.max(0, (_credits || 0) - cost);
    _ledgerPush('debit', -cost, _credits, reason || 'search');
    renderCredits();
    return true;
  }
}

function showInsufficientCredits(balance, needed) {
  document.getElementById('results-wrap').innerHTML =
    '<div class="state-box" style="border-top:3px solid var(--gold);">' +
      '<div class="sb-icon" style="color:var(--gold-deep);border-color:var(--gold);">!</div>' +
      '<h3>Out of credits</h3>' +
      '<p>You have <strong>' + balance + '</strong> credits - each search requires <strong>' + needed + '</strong>. Top up to continue your research.</p>' +
      '<button class="credit-meter-cta" style="margin-top:16px;" onclick="openBuyCredits()">Top up now</button>' +
    '</div>';
}

// Reset the results area to the default "Begin your research" tile.
// Called after a successful Approved login so the sign-in card disappears.
function showReadyToSearchState() {
  var wrap = document.getElementById('results-wrap');
  if (!wrap) return;
  wrap.innerHTML =
    '<div class="state-box">' +
      '<div class="sb-icon">Q</div>' +
      '<h3>Begin your research</h3>' +
      '<p>Each search returns a page of 5 companies for 50 credits (~&#8377;50 / $0.63). Revealing a full company profile costs 100 credits. You can reveal up to 50 unique companies per month. New members get 500 credits free on approval.</p>' +
    '</div>';
}

// ── ACCOUNT STATE SCREENS ───────────────────────────────
function showPendingState() {
  document.getElementById('results-wrap').innerHTML =
    '<div class="state-box" style="border-top:3px solid var(--gold);padding:48px 24px;">' +
      '<div class="sb-icon">\u29d6</div>' +
      '<h3>Your account is being verified</h3>' +
      '<p>We manually approve every individual-access member to keep the database fair and secure. Approvals typically complete within <strong>1 business day</strong>.</p>' +
      '<p style="margin-top:14px;">You will receive an email at <strong>' + escHtml(getToken()) + '</strong> the moment your account is live. Your <strong>200-credit welcome bonus</strong> will be granted automatically on approval.</p>' +
      '<p style="margin-top:18px;font-size:11px;color:var(--muted);">Questions? Email <a href="mailto:admin@gccpros.com" style="color:var(--gold-deep);">admin@gccpros.com</a>.</p>' +
    '</div>';
}
function showSuspendedState(reason) {
  document.getElementById('results-wrap').innerHTML =
    '<div class="state-box" style="border-top:3px solid var(--danger);padding:48px 24px;">' +
      '<div class="sb-icon" style="color:var(--danger);border-color:var(--danger);">\u2715</div>' +
      '<h3>Account suspended</h3>' +
      '<p>Your account has been paused pending review. ' + (reason ? 'Reason: <em>' + escHtml(reason) + '</em>.' : '') + '</p>' +
      '<p style="margin-top:14px;">Please contact <a href="mailto:admin@gccpros.com" style="color:var(--gold-deep);">admin@gccpros.com</a>.</p>' +
    '</div>';
}
function showRejectedState() {
  document.getElementById('results-wrap').innerHTML =
    '<div class="state-box" style="border-top:3px solid var(--danger);padding:48px 24px;">' +
      '<div class="sb-icon" style="color:var(--danger);border-color:var(--danger);">\u2715</div>' +
      '<h3>Access not approved</h3>' +
      '<p>We were unable to approve your application for individual access. If you believe this is in error, please email <a href="mailto:admin@gccpros.com" style="color:var(--gold-deep);">admin@gccpros.com</a>.</p>' +
    '</div>';
}
function showMonthlyCapReached() {
  document.getElementById('results-wrap').innerHTML =
    '<div class="state-box" style="border-top:3px solid var(--gold);padding:48px 24px;">' +
      '<div class="sb-icon">\u2713</div>' +
      '<h3>Monthly reveal cap reached</h3>' +
      '<p>You have revealed <strong>' + _monthlyCap + ' companies</strong> this calendar month. Cap resets on <strong>' + _monthEndText() + '</strong>.</p>' +
    '</div>';
}
function _monthEndText() {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return first.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function showClosedBetaState() { showSignInState(); }

// ── SEARCH ───────────────────────────────────────────────
const CLIENT_PAGE_SIZE = 5;
const BATCH_SIZE = 1;
let _allFetchedResults = [];
let _totalServerPages = 1;
let _lastServerPage = 0;
let _currentClientPage = 1;
let _searchParams = {};

function onFieldChange() {
  const field = document.getElementById('field-select').value;
  lastField = field;
  const meta = FIELD_META[field] || FIELD_META.city;
  const input = document.getElementById('search-input');
  if (input) { input.placeholder = meta.ph; input.value = ''; }
  loadFieldValues(field, 'filter-values-1');
}
function onFieldChange2() {
  const field = document.getElementById('field-select-2').value;
  const input = document.getElementById('search-input-2');
  if (!input) return;
  if (!field) { input.disabled = true; input.value = ''; input.placeholder = 'Optional second filter...'; input.style.opacity = '0.5'; return; }
  input.disabled = false; input.style.opacity = '1';
  input.placeholder = (FIELD_META[field] || FIELD_META.city).ph;
  input.value = '';
  loadFieldValues(field, 'filter-values-2');
}

// Per-field value cache so we don't re-fetch every time the user toggles
// between fields. Cleared on full page reload.
const _fieldValueCache = {};
// Fields with too many unique values to be useful as a dropdown
// (browser stutter + user can't scan thousands of company names).
const _NO_AUTOCOMPLETE_FIELDS = ['company', 'group'];
async function loadFieldValues(field, datalistId) {
  const dl = document.getElementById(datalistId);
  if (!dl) return;
  // Skip noisy fields - clear any leftover suggestions and bail
  if (_NO_AUTOCOMPLETE_FIELDS.indexOf(field) >= 0) {
    dl.innerHTML = '';
    return;
  }
  const token = getToken();
  if (!token) return;  // anonymous users don't need autocomplete
  // Use cached values if we have them
  if (_fieldValueCache[field]) {
    _renderDatalist(dl, _fieldValueCache[field]);
    return;
  }
  try {
    const res = await fetch(SCRIPT_URL + '?action=getFieldValues&field=' + encodeURIComponent(field) + '&token=' + encodeURIComponent(token));
    const data = await res.json();
    if (data && Array.isArray(data.values)) {
      _fieldValueCache[field] = data.values;
      _renderDatalist(dl, data.values);
    }
  } catch (_) { /* silent - autocomplete is a nice-to-have */ }
}
function _renderDatalist(dl, values) {
  // Build options as a single string for performance (datalists with
  // thousands of children are slow to attach individually).
  const html = values.map(function(v){
    return '<option value="' + String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') + '">';
  }).join('');
  dl.innerHTML = html;
}

async function doSearch(page) {
  page = page || 1;
  const q = document.getElementById('search-input').value.trim();
  const field = document.getElementById('field-select').value;
  if (!q) { alert('Please type a search term first.'); return; }
  const token = getToken();
  if (!token) { alert('Please sign in first.'); return; }
  if (_accountStatus && _accountStatus !== 'Approved') {
    if (_accountStatus === 'Pending')   return showPendingState();
    if (_accountStatus === 'Suspended') return showSuspendedState();
    if (_accountStatus === 'Rejected')  return showRejectedState();
  }
  if (typeof _credits !== 'number') { alert('Balance is loading - please wait a moment and try again.'); return; }
  if (_credits < SEARCH_COST) return showInsufficientCredits(_credits, SEARCH_COST);

  showLoading();
  const ok = await deductCredits(SEARCH_COST, 'search:' + field);
  if (!ok) return;

  lastQuery = q; lastField = field;
  const field2 = document.getElementById('field-select-2').value;
  const q2 = (document.getElementById('search-input-2').value || '').trim();
  const f2Param = (field2 && q2 ? '&field2=' + encodeURIComponent(field2) + '&q2=' + encodeURIComponent(q2) : '');

  _allFetchedResults = [];
  _lastServerPage = 0;
  _searchParams = { token, field, q, f2Param };

  const done = await _fetchBatch();
  if (!done) return;
  showPage(1);
}

async function _fetchBatch() {
  const { token, field, q, f2Param } = _searchParams;
  const startPage = _lastServerPage + 1;
  const endPage = startPage + BATCH_SIZE - 1;
  const fetches = [];
  for (let p = startPage; p <= endPage; p++) {
    const url = SCRIPT_URL + '?token=' + encodeURIComponent(token) + '&field=' + field + '&q=' + encodeURIComponent(q) + '&page=' + p + f2Param;
    fetches.push(fetch(url).then(r => r.json()).catch(() => null));
  }
  try {
    const responses = await Promise.all(fetches);
    if (_lastServerPage === 0) {
      const first = responses[0];
      if (!first) { showState('Search failed', 'Please check your connection and try again.'); return false; }
      if (first.error === 'Unauthorized' || first.error === 'not_approved') {
        showPendingState(); return false;
      }
      if (first.error) { showState('No results', first.error); return false; }
      _totalServerPages = first.pages || 1;
    }
    const seen = new Set(_allFetchedResults.map(r => r.name));
    for (const data of responses) {
      if (data && data.results && data.results.length > 0) {
        if (data.pages) _totalServerPages = Math.max(_totalServerPages, data.pages);
        for (const r of data.results) {
          if (!seen.has(r.name)) { seen.add(r.name); _allFetchedResults.push(r); }
        }
      }
    }
    _lastServerPage = endPage;
    if (_allFetchedResults.length === 0 && _lastServerPage <= BATCH_SIZE) {
      showState('No results', 'Nothing matched "<strong>' + escHtml(lastQuery) + '</strong>" in <strong>' + escHtml(FIELD_META[lastField].label) + '</strong>. Try a different term.');
      return false;
    }
    return true;
  } catch(e) {
    showState('Search failed', 'Please check your connection and try again.');
    return false;
  }
}

function _hasMoreServerPages() { return _lastServerPage < _totalServerPages; }

function showPage(page) {
  _currentClientPage = page;
  const totalResults = _allFetchedResults.length;
  const totalPages = Math.ceil(totalResults / CLIENT_PAGE_SIZE);
  const startIdx = (page - 1) * CLIENT_PAGE_SIZE;
  const endIdx = Math.min(startIdx + CLIENT_PAGE_SIZE, totalResults);
  const pageResults = _allFetchedResults.slice(startIdx, endIdx);
  const wrap = document.getElementById('results-wrap');
  const startNum = startIdx + 1;
  const fieldLabel = FIELD_META[lastField].label;
  const rows = pageResults.map(function(r, i) {
    return '<div class="result-row" onclick="showCompanyDetail(\'' + escHtml(r.name).replace(/'/g, "\\'") + '\')" oncontextmenu="return false">' +
      '<span class="r-num">' + String(startNum + i).padStart(2,'0') + '</span>' +
      '<div class="r-body">' +
        '<span class="r-name">' + escHtml(r.name) + (r.verified ? ' <span title="Data verified by an active GCC leader" style="color:#1D9BF0;font-weight:700">\u2713</span>' : '') + '</span>' +
        (lastField !== 'company' ? '<span class="r-match">' + escHtml(fieldLabel) + ' - ' + escHtml(r.matchedValue || '') + '</span>' : '') +
      '</div>' +
      '<span class="r-arrow">\u203a</span>' +
    '</div>';
  }).join('');

  let pagination = '';
  if (totalPages > 1 || _hasMoreServerPages()) {
    let btns = '';
    if (page > 1) btns += '<button class="pg-btn" onclick="showPage(' + (page - 1) + ')">\u2039 Prev</button>';
    for (let p = 1; p <= totalPages; p++) {
      btns += '<button class="pg-btn' + (p === page ? ' active' : '') + '" onclick="showPage(' + p + ')">' + p + '</button>';
    }
    if (page < totalPages) btns += '<button class="pg-btn" onclick="showPage(' + (page + 1) + ')">Next \u203a</button>';
    else if (_hasMoreServerPages()) btns += '<button class="pg-btn" style="background:var(--gold);color:var(--ink);border-color:var(--gold);font-weight:700;" onclick="loadMoreAndShow()" title="Fetches the next page of 5 results">More results \u00b7 ' + SEARCH_COST + ' credits \u203a</button>';
    pagination = '<div class="pagination">' + btns + '</div><div class="pg-info">Page ' + page + ' of ' + totalPages + (_hasMoreServerPages() ? ' +' : '') + ' \u00b7 ' + totalResults + ' results \u00b7 ' + CLIENT_PAGE_SIZE + ' per page</div>';
  }
  const betaNote = '<div class="beta-note">\u26a0\ufe0e <strong>Beta</strong> \u00b7 Data targets 95% accuracy. Use <em>Suggest a correction</em> on any profile to help us improve it.</div>';
  wrap.innerHTML =
    '<div class="result-meta">' +
      '<span class="result-count">' + totalResults + ' results for "<strong>' + escHtml(lastQuery) + '</strong>"' + (_hasMoreServerPages() ? ' (more available)' : '') + '</span>' +
      '<span class="secure-badge">Watermarked</span>' +
    '</div>' +
    '<div class="result-list" oncontextmenu="return false">' + rows + '</div>' +
    pagination + betaNote +
    '<div class="submit-nudge" onclick="openSubmitModal()">' +
      '<div class="nudge-icon">+</div>' +
      '<div class="nudge-text"><strong>Didn\'t find a GCC? Submit it for review.</strong><span>Accepted submissions earn <strong>100 credits</strong>.</span></div>' +
      '<div class="nudge-arrow">\u203a</div>' +
    '</div>';
}

async function loadMoreAndShow() {
  if (_credits < SEARCH_COST) return showInsufficientCredits(_credits, SEARCH_COST);
  showLoading();
  const ok = await deductCredits(SEARCH_COST, 'search:next_page');
  if (!ok) return;
  const fetched = await _fetchBatch();
  if (!fetched) return;
  showPage(_currentClientPage + 1);
}

// ── REVEAL FLOW ─────────────────────────────────────────
// Clicking a result row: if company already revealed this month, fetch free;
// otherwise show the paid-reveal confirmation modal.
async function showCompanyDetail(name) {
  // Gate on account status
  if (_accountStatus && _accountStatus !== 'Approved') {
    if (_accountStatus === 'Pending')   return showPendingState();
    if (_accountStatus === 'Suspended') return showSuspendedState();
    if (_accountStatus === 'Rejected')  return showRejectedState();
  }

  // Already paid this month? Free re-view.
  if (_revealedThisMonth.has(name)) { return fetchAndRenderReveal(name, false); }

  // Hit the monthly cap? Block before we even show the modal.
  if (_monthlyReveals >= _monthlyCap) return showMonthlyCapReached();

  // Not enough credits?
  if ((_credits || 0) < REVEAL_COST) return showInsufficientCredits(_credits, REVEAL_COST);

  openRevealModal(name);
}

function openRevealModal(name) {
  _pendingRevealName = name;
  document.getElementById('reveal-company-name').textContent = name;
  document.getElementById('reveal-cost-display').textContent = REVEAL_COST + ' credits';
  const priceR = (_currency === 'USD') ? '$' + (REVEAL_COST * USD_PER_CREDIT).toFixed(2).replace(/\.00$/,'') : '₹' + REVEAL_COST;
  document.getElementById('reveal-price-display').textContent = priceR;
  document.getElementById('reveal-balance-display').textContent = (_credits || 0).toLocaleString('en-IN') + ' credits';
  document.getElementById('reveal-remaining-display').textContent = Math.max(0, _monthlyCap - _monthlyReveals) + ' of ' + _monthlyCap;
  document.getElementById('reveal-err').style.display = 'none';
  const btn = document.getElementById('reveal-confirm-btn');
  btn.disabled = false;
  btn.textContent = 'Reveal for ' + REVEAL_COST + ' credits';
  document.getElementById('reveal-modal').classList.add('open');
}

function closeRevealModal() {
  document.getElementById('reveal-modal').classList.remove('open');
  _pendingRevealName = null;
}

async function confirmReveal() {
  if (!_pendingRevealName) return;
  const btn = document.getElementById('reveal-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Revealing…';
  const name = _pendingRevealName;
  closeRevealModal();
  return fetchAndRenderReveal(name, true);
}

async function fetchAndRenderReveal(name, shouldCharge) {
  showLoading();
  const token = getToken();
  try {
    const url = SCRIPT_URL + '?action=revealCompany'
      + '&token=' + encodeURIComponent(token)
      + '&company=' + encodeURIComponent(name);
    const res = await apiFetch(url);
    const data = await res.json();
    if (data.error === 'cap_reached') { showMonthlyCapReached(); return; }
    if (data.error === 'insufficient_credits') { showInsufficientCredits(data.balance || _credits, REVEAL_COST); return; }
    if (data.error === 'not_approved') {
      if (data.status === 'Pending')   return showPendingState();
      if (data.status === 'Suspended') return showSuspendedState(data.reason);
      if (data.status === 'Rejected')  return showRejectedState();
    }
    if (data.error) { showState('Reveal failed', data.error); return; }

    // Server returns the canonical balance and counter - trust it.
    if (typeof data.balance === 'number') { _credits = data.balance; _ledgerPush('debit', -REVEAL_COST, _credits, 'reveal'); }
    if (typeof data.monthlyReveals === 'number') _monthlyReveals = data.monthlyReveals;
    if (data.charged) _revealedThisMonth.add(name);
    renderCredits();
    renderDetail(data.profile || data);
  } catch(e) {
    // Network fallback - optimistic state, but don't mark as paid (server reconciles)
    if (shouldCharge) {
      _credits = Math.max(0, (_credits || 0) - REVEAL_COST);
      _monthlyReveals += 1;
      _revealedThisMonth.add(name);
      renderCredits();
    }
    showState('Reveal failed', 'Network issue. Your credits have not been charged - please retry.');
  }
}

// ── RENDER DETAIL - 10 B2C-WHITELISTED FIELDS ONLY ──────
// Leader contact data, granular headcount, domain process notes and
// audit commentary are Enterprise-only and never rendered here.
function renderDetail(data) {
  const wrap = document.getElementById('results-wrap');
  if (!data || data.error) {
    wrap.innerHTML = `<span class="back-link" onclick="backToResults()">← Back</span>
      <div class="state-box"><div class="sb-icon">!</div><h3>Company not found</h3><p>Could not load this profile. Please try again.</p></div>`;
    return;
  }
  window._currentRecord = data;

  // Always render the card; show an em-dash placeholder when the value is empty.
  // This makes the 12-field B2C structure visible at all times and surfaces data gaps.
  const f = (lbl, val) => {
    const blank = (val == null || String(val).trim() === '');
    const body  = blank ? '<span style="color:var(--muted);opacity:0.7;">-</span>' : escHtml(String(val));
    return `<div class="detail-field"><label>${lbl}</label><p>${body}</p></div>`;
  };

  // Bucket headcount on the client as well, defensively - server also sends bucketed,
  // but if a raw number leaks through we still present a band.
  const bucketedHeadcount = bucketHeadcount(data.headcountBucket || data.headcount);

  const memberEmail = (currentUser ? currentUser.email : _cachedEmail) || 'GCCPROs Member';
  const now = new Date();
  const ts = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const wmText = escHtml(memberEmail) + ' · ' + ts + ' · GCCPROs Confidential';
  // Watermark on TOP layer (z-index:99), click-through (pointer-events:none).
  // Tuned subtle: opacity 0.06, weight 500, size 10:readable through but not loud.
  const watermark = `<div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:2px;z-index:99;">
    ${Array.from({length:7},(_,i)=>`<div style="position:absolute;left:-20%;width:140%;transform:rotate(-28deg);top:${6+i*14}%;white-space:nowrap;font-size:10px;font-weight:500;color:rgba(10,22,40,0.06);letter-spacing:1.4px;user-select:none;-webkit-user-select:none;">${wmText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${wmText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${wmText}</div>`).join('')}
  </div>`;

  // B2C locked spec 2026-05-16: 12 fields = Country, Company Name, Group Company,
  // HQ Country, GCC City, Industry, GCC Domains, Headcount, Office Addresses,
  // State, Glassdoor, GPTW. Year Established / Maturity / Setup Model intentionally dropped.
  const locationStr = data.gccCity || '';

  // Glassdoor rating shown as a badge (GPTW now rendered as a field card below).
  const sentimentBits = [];
  if (data.glassdoorRating) {
    sentimentBits.push(`<span style="display:inline-flex;align-items:center;gap:6px;background:var(--ivory);border:1px solid var(--gold-soft);color:var(--ink);padding:4px 10px;border-radius:2px;font-size:12px;font-weight:600;">★ ${escHtml(String(data.glassdoorRating))} <small style="font-size:9px;color:var(--muted);letter-spacing:1px;">GLASSDOOR</small></span>`);
  }
  const sentimentRow = sentimentBits.length
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative;z-index:1;">${sentimentBits.join('')}</div>`
    : '';

  wrap.innerHTML = `
    <span class="back-link" onclick="backToResults()">← Back to results</span>
    <div class="detail-card" oncontextmenu="return false" onselectstart="return false">
      ${watermark}
      <div style="position:relative;z-index:1;">
        <div class="detail-company">${escHtml(data.companyName || '')}</div>
        ${data.groupCompany ? `<div style="font-size:12px;color:var(--muted);letter-spacing:0.3px;margin-bottom:10px;">Part of <strong style="color:var(--graphite);">${escHtml(data.groupCompany)}</strong></div>` : ''}
        <div class="detail-city-tag">${escHtml(locationStr || data.gccCity || '')}</div>
        <div class="detail-grid">
          ${f('Country', data.country)}
          ${f('HQ country', data.hqCountry)}
          ${f('State / Province', data.gccState)}
          ${f('Industry', data.industry)}
          ${f('GCC domains', data.gccDomains)}
          ${f('Headcount band', bucketedHeadcount)}
          ${f('Office addresses', data.officeAddresses)}
          ${f('GPTW Certified', data.gptwCertified)}
        </div>
        ${sentimentRow}
        ${(data.allFields && data.allFields.length) ? '<div class="detail-grid" style="margin-top:14px;border-top:1px solid var(--gold-soft);padding-top:14px;">' + data.allFields.map(function(f){
          return '<div class="detail-field"><label>' + escHtml(f.label) + '</label><p>' + escHtml(f.value) + '</p></div>';
        }).join('') + '</div>' : ''}
      </div>
    </div>
    <div class="confidential-strip">
      🔒 <strong>Confidential - Individual licence.</strong> This profile is watermarked to your account. Leader contacts, granular headcount, domain processes and audit notes are reserved for <strong>Enterprise</strong> subscribers.
    </div>
    <div class="correction-bar" onclick="openCorrectionModal()">
      <span>✎ Suggest a correction</span>
      <small>Earn <strong>20 credits</strong> on acceptance</small>
    </div>`;
}

// Headcount bucketing - matches the 4-band scheme agreed with Shammi
// (1-50 / 50-500 / 500-5k / 5k+). Accepts either a raw number or an already-bucketed label.
function bucketHeadcount(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string' && /-/.test(v)) return v;       // already a band
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  if (!n || isNaN(n)) return String(v);
  if (n <= 50)    return '1-50';
  if (n <= 500)   return '50-500';
  if (n <= 5000)  return '500-5,000';
  return '4,506+';
}

function backToResults() {
  if (_allFetchedResults.length > 0) showPage(_currentClientPage || 1);
  else showState('Begin your research', 'Select a filter, type your query and click Search.');
}
function showLoading() {
  document.getElementById('results-wrap').innerHTML = `
    <div class="state-box"><div class="loading-dots"><span></span><span></span><span></span></div><p>Retrieving matches from the GCC database…</p></div>`;
}
function showState(title, msg) {
  // H4 audit fix:escape both arguments before injecting into innerHTML.
  // Callers occasionally pass server-controlled strings (Edge Function error
  // text); without escHtml, a malicious or accidental error containing HTML
  // would be rendered as live DOM.
  document.getElementById('results-wrap').innerHTML = `
    <div class="state-box"><div class="sb-icon">Q</div><h3>${escHtml(title)}</h3><p>${escHtml(msg)}</p></div>`;
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── COPY GUARD ───────────────────────────────────────────
document.addEventListener('copy', e => e.preventDefault());

// ═══════════════════════ BUY CREDITS ═══════════════════════
let _selectedCredits = 0, _selectedPrice = 0, _selectedCurrency = 'INR';

function openBuyCredits() {
  if (_accountStatus && _accountStatus !== 'Approved') {
    showToast(
      _accountStatus === 'Pending'
        ? 'Your account is pending approval. Top-up will be available once approved.'
        : 'Top-up is not available for your account. Contact admin@gccpros.com.',
      '#1A3A6E'
    );
    return;
  }
  document.getElementById('buy-modal').classList.add('open');
  setTimeout(function() { setCurrency(_currency || 'INR'); }, 10);
}
function closeBuyCredits() { document.getElementById('buy-modal').classList.remove('open'); }

function setCurrency(cur) {
  _selectedCurrency = cur;
  _selectedCredits = 0; _selectedPrice = 0;
  document.getElementById('cur-inr').classList.toggle('active', cur === 'INR');
  document.getElementById('cur-usd').classList.toggle('active', cur === 'USD');
  const grid = document.getElementById('pack-grid');
  grid.innerHTML = PACKS[cur].map((p, i) => {
    const priceFmt = cur === 'INR' ? '<span class="rupee">₹</span>' + p.price.toLocaleString('en-IN') : '$' + p.price.toFixed(2).replace(/\.00$/, '');
    return `<div class="pack" onclick="selectPack(${i})" data-idx="${i}">
      ${p.tag ? `<div class="pack-tag">${p.tag}</div>` : ''}
      <div class="pack-coins">${p.credits.toLocaleString('en-IN')}</div>
      <div class="pack-lbl">credits</div>
      <div class="pack-price">${priceFmt}</div>
      <div class="pack-searches">${p.note}</div>
    </div>`;
  }).join('');
  document.getElementById('buy-selected').style.display = 'none';
  document.getElementById('buy-err').style.display = 'none';
  const payBtn = document.getElementById('pay-btn');
  payBtn.disabled = true; payBtn.textContent = 'Pay & credit';
}

function selectPack(idx) {
  const pack = PACKS[_selectedCurrency][idx];
  _selectedCredits = pack.credits;
  _selectedPrice = pack.price;
  document.querySelectorAll('#pack-grid .pack').forEach(el => el.classList.remove('selected'));
  document.querySelector('#pack-grid .pack[data-idx="' + idx + '"]').classList.add('selected');
  const sel = document.getElementById('buy-selected');
  const priceFmt = _selectedCurrency === 'INR' ? '₹' + _selectedPrice.toLocaleString('en-IN') : '$' + _selectedPrice.toFixed(2).replace(/\.00$/, '');
  sel.style.display = 'block';
  sel.textContent = _selectedCredits.toLocaleString('en-IN') + ' credits selected - ' + priceFmt;
  var btn = document.getElementById('pay-btn');
  btn.disabled = false;
  var priceFmt2 = _selectedCurrency === 'INR' ? '₹' + _selectedPrice.toLocaleString('en-IN') : '$' + _selectedPrice.toFixed(2);
  btn.textContent = 'Pay ' + priceFmt2 + ' → ' + _selectedCredits.toLocaleString('en-IN') + ' credits';
  btn.style.opacity = '1';
}

async function initiatePayment() {
  const token = getToken();
  if (!token || !_selectedCredits) return;
  const errBox = document.getElementById('buy-err');
  errBox.style.display = 'none';

  if (typeof Razorpay === 'undefined') {
    errBox.textContent = 'Payment gateway is loading - please try again in a moment.';
    errBox.style.display = 'block';
    return;
  }

  // C1 fix:server creates the Razorpay Order first. We never trust the
  // client to declare what was paid; the webhook (with HMAC signature) is
  // the authoritative source of "credits should be added".
  const packMap = { 200: '200', 500: '500', 1000: '1000', 2500: '2500' };
  const pack = packMap[_selectedCredits];
  if (!pack) {
    errBox.textContent = 'Unsupported credit pack. Please choose 200, 500, 1000 or 2500.';
    errBox.style.display = 'block';
    return;
  }

  let order;
  try {
    const orderRes = await apiFetch(SCRIPT_URL + '?action=razorpayCreateOrder&token=' + encodeURIComponent(token) + '&pack=' + pack);
    order = await orderRes.json();
    if (order.error) throw new Error(order.message || order.error);
  } catch (err) {
    errBox.textContent = 'Could not start payment (' + (err.message || 'server error') + '). Please retry, or WhatsApp +91-85069-76700.';
    errBox.style.display = 'block';
    return;
  }

  const options = {
    key: order.key_id,
    order_id: order.order_id,        // ← binds the checkout to the server-created order
    amount: order.amount,
    currency: order.currency,
    name: 'GCCPROs Intelligence Portal',
    description: _selectedCredits + ' research credits',
    prefill: { email: token },
    theme: { color: '#0A1628' },
    handler: async function(response) {
      // v7.9.20:credit SYNCHRONOUSLY via the HMAC-verified server endpoint.
      // Crediting no longer depends on the async webhook; the webhook stays as an
      // idempotent backup (deduped by payment_id) so a payment is credited exactly once.
      closeBuyCredits();
      showToast('Payment received - adding credits...', '#1e40af');
      try {
        const vurl = SCRIPT_URL + '?action=razorpayVerifyPayment'
          + '&token=' + encodeURIComponent(token)
          + '&razorpay_order_id='   + encodeURIComponent(response.razorpay_order_id || '')
          + '&razorpay_payment_id=' + encodeURIComponent(response.razorpay_payment_id || '')
          + '&razorpay_signature='  + encodeURIComponent(response.razorpay_signature || '');
        const vres = await apiFetch(vurl);
        const vj = await vres.json().catch(function(){ return {}; });
        if (vres.ok && vj && vj.status === 'ok') {
          await fetchCreditBalance(); // refresh _credits from the server
          const added = (typeof vj.credited === 'number' && vj.credited > 0) ? vj.credited : _selectedCredits;
          const balTxt = (typeof _credits === 'number') ? _credits.toLocaleString('en-IN') : (vj.balance != null ? vj.balance : '');
          showToast('✓ ' + added + ' credits added. Balance: ' + balTxt, '#2D7A4E');
          return;
        }
        // verify returned non-ok:fall through to the webhook polling fallback
      } catch (_) { /* network hiccup:fall back to webhook polling below */ }

      // Fallback: the webhook may still credit asynchronously. Poll briefly.
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          await fetchCreditBalance();
          if (typeof _credits === 'number' && _credits >= _selectedCredits) {
            showToast('✓ ' + _selectedCredits + ' credits added. Balance: ' + _credits.toLocaleString('en-IN'), '#2D7A4E');
            return;
          }
        } catch(_) {}
      }
      showToast('Payment captured. If your balance is not updated within a minute, email admin@gccpros.com with reference ' + response.razorpay_payment_id, '#1e40af');
    },
    modal: { ondismiss: function() {} }
  };
  const rzp = new Razorpay(options);
  rzp.on('payment.failed', function(resp) {
    var code = (resp.error && resp.error.code) || '';
    var desc = (resp.error && resp.error.description) || 'Payment could not be completed.';
    var msg = desc;
    if (reason === 'payment_failed')   msg = 'Your payment was declined. Please try a different card or payment method.';
    if (reason === 'payment_cancelled') msg = 'Payment was cancelled.';
    if (code === 'BAD_REQUEST_ERROR')   msg = 'Payment failed. Please check your card details and try again.';
    errBox.textContent = msg;
    errBox.style.display = 'block';
    payBtn.disabled = false;
    payBtn.textContent = 'Try again';
    payBtn.style.opacity = '1';
  });
  rzp.open();
}


// ── CREDIT STATEMENT ─────────────────────────────────────────────────────────
async function openStatement() {
  document.getElementById('stmt-modal').classList.add('open');
  document.getElementById('stmt-loading').style.display = 'block';
  document.getElementById('stmt-table-wrap').style.display = 'none';
  document.getElementById('stmt-empty').style.display = 'none';
  document.getElementById('stmt-err').style.display = 'none';

  var token = getToken();
  if (!token) {
    document.getElementById('stmt-loading').style.display = 'none';
    document.getElementById('stmt-err').textContent = 'Please sign in to view your statement.';
    document.getElementById('stmt-err').style.display = 'block';
    return;
  }

  // Authoritative source: server-side credit_transactions via Edge Function.
  var rows = [];
  try {
    var url = SCRIPT_URL + '?action=getCreditStatement&token=' + encodeURIComponent(token) + '&_t=' + Date.now();
    var resp = await apiFetch(url, { cache: 'no-store' });
    var data = await resp.json();
    if (data && data.error) throw new Error(data.error);
    rows = (data && data.statement) || [];
  } catch (err) {
    rows = _ledgerRead() || [];
    document.getElementById('stmt-err').textContent = 'Showing offline copy:could not reach server: ' + (err && err.message || err);
    document.getElementById('stmt-err').style.display = 'block';
  }

  document.getElementById('stmt-loading').style.display = 'none';
  if (!rows.length) {
    document.getElementById('stmt-empty').style.display = 'block';
    return;
  }

  var runningBal = (typeof _credits === 'number') ? _credits : null;
  var tbody = document.getElementById('stmt-tbody');
  tbody.innerHTML = rows.map(function(row, i) {
    var ts = row.ts || row.timestamp || row.created_at || '';
    var d = new Date(ts);
    var date = isNaN(d.getTime()) ? String(ts).substring(0,10) : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    var time = isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    var amt = Number(row.amount || 0);
    var amtStr = amt > 0 ? '+' + amt : String(amt);
    var amtColor = amt > 0 ? '#065f46' : '#991b1b';
    var reason = row.reason || row.type || '';
    var meta = row.metadata || {};
    var desc;
    if (reason === 'reveal') {
      desc = 'Company reveal' + (meta.company_name ? ' - ' + escHtml(meta.company_name) : '');
    } else if (reason === 'search') {
      var q = meta.query || '';
      desc = 'Search' + (q ? ' - "' + escHtml(String(q).substring(0,40)) + '"' : '');
    } else if (reason === 'signup_bonus') {
      desc = 'Welcome bonus on approval';
    } else if (reason === 'purchase') {
      desc = 'Credit purchase' + (meta.currency ? ' (' + meta.currency + ')' : '');
    } else if (reason === 'admin_grant') {
      desc = 'Admin grant' + (meta.note ? ' - ' + escHtml(String(meta.note).substring(0,40)) : '');
    } else if (reason === 'migration') {
      desc = 'Migration credit (legacy V2)';
    } else {
      desc = escHtml(reason || 'transaction');
    }
    var bal;
    if (typeof row.balance_after === 'number') {
      bal = row.balance_after;
    } else if (runningBal !== null) {
      bal = runningBal;
      runningBal = runningBal - amt;
    } else {
      bal = '-';
    }
    var bg = i % 2 === 0 ? '#fff' : '#f9fafb';
    return '<tr style="background:' + bg + ';border-bottom:1px solid #f0f0f0;">' +
      '<td style="padding:9px 12px;white-space:nowrap;color:var(--muted);">' + date + '<br><span style="font-size:11px;">' + time + '</span></td>' +
      '<td style="padding:9px 12px;">' + desc + '</td>' +
      '<td style="padding:9px 12px;text-align:right;font-weight:700;color:' + amtColor + ';font-family:var(--mono);">' + amtStr + '</td>' +
      '<td style="padding:9px 12px;text-align:right;font-family:var(--mono);color:var(--ink);">' + (typeof bal === 'number' ? bal.toLocaleString('en-IN') : bal) + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('stmt-table-wrap').style.display = 'block';
}

function _stmtDesc(row) {
  var type   = String(row.type || '').toLowerCase();
  var reason = String(row.reason || '');
  var rl     = reason.toLowerCase();
  if (type === 'credit' && rl.indexOf('top up') !== -1) return '💳 ' + reason;
  if (type === 'credit' && rl.indexOf('signup') !== -1) return '🎁 Signup bonus';
  if (type === 'credit' && rl.indexOf('balance') !== -1) return '📊 ' + reason;
  if (type === 'credit' && rl.indexOf('admin') !== -1) return '🔧 Admin credit';
  if (type === 'credit') return '➕ ' + (reason || 'Credit');
  if (type === 'debit' && rl.indexOf('reveal') !== -1) return '🔍 Company reveal';
  if (type === 'debit' && rl.indexOf('search') !== -1) return '🔎 Search';
  return (type === 'credit' ? '➕ ' : '➖ ') + (reason || type);
}

function closeStatement() {
  document.getElementById('stmt-modal').classList.remove('open');
}

// ── SIGN-IN MODAL ────────────────────────────────────────────────────────────
function openSignInModal() {
  var m = document.getElementById('signin-modal');
  if (m) m.classList.add('open');
  showSignInState('choose');
}
function closeSignInModal() {
  var m = document.getElementById('signin-modal');
  if (m) m.classList.remove('open');
}
// Top-right modal "Sign up" routes to the single working inline form (results-wrap)
// instead of rendering a duplicate signup form in the modal (which collided on ids
// like su-email/f-name and made the modal signup do nothing).
function goToInlineSignup() {
  closeSignInModal();
  switchMode('signup');
  var el = document.getElementById('results-wrap');
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// TOAST
function showToast(msg, color) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#0A1628') + ';color:#fff;padding:12px 22px;border-radius:2px;font-size:13px;font-weight:500;letter-spacing:0.3px;font-family:Inter,sans-serif;z-index:9999;box-shadow:0 4px 24px rgba(10,22,40,0.3);max-width:90%;text-align:center;border-left:3px solid #0A66C2;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 4500);
}

// SUBMIT GCC
function openSubmitModal() {
  ['sub-company','sub-group','sub-country','sub-city','sub-industry','sub-domain','sub-headcount','sub-leader1','sub-leader2'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
  var err = document.getElementById('sub-err'); if (err) err.style.display = 'none';
  var ok = document.getElementById('sub-ok'); if (ok) ok.style.display = 'none';
  var btn = document.getElementById('sub-save-btn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit for review'; }
  var m = document.getElementById('submit-modal'); if (m) m.classList.add('open');
}
function closeSubmitModal() { var m = document.getElementById('submit-modal'); if (m) m.classList.remove('open'); }

async function submitGCC() {
  const errBox = document.getElementById('sub-err');
  const okBox = document.getElementById('sub-ok');
  const btn = document.getElementById('sub-save-btn');
  errBox.style.display = 'none'; okBox.style.display = 'none';
  const company = document.getElementById('sub-company').value.trim();
  const city = document.getElementById('sub-city').value.trim();
  const industry = document.getElementById('sub-industry').value.trim();
  if (!company)  { errBox.textContent = 'Please enter the company name.'; errBox.style.display = 'block'; return; }
  if (!city)     { errBox.textContent = 'Please enter the GCC city.';     errBox.style.display = 'block'; return; }
  if (!industry) { errBox.textContent = 'Please enter the industry.';     errBox.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Submitting...';
  const token = getToken();
  const url = SCRIPT_URL + '?action=submitGCC&token=' + encodeURIComponent(token)
    + '&company='  + encodeURIComponent(company)
    + '&group='    + encodeURIComponent(document.getElementById('sub-group').value.trim())
    + '&country='  + encodeURIComponent(document.getElementById('sub-country').value.trim())
    + '&city='     + encodeURIComponent(city)
    + '&industry=' + encodeURIComponent(industry)
    + '&domain='   + encodeURIComponent(document.getElementById('sub-domain').value.trim())
    + '&headcount='+ encodeURIComponent(document.getElementById('sub-headcount').value.trim())
    + '&leader1='  + encodeURIComponent(document.getElementById('sub-leader1').value.trim())
    + '&leader2='  + encodeURIComponent(document.getElementById('sub-leader2').value.trim());
  try { await fetch(url, { mode: 'no-cors' }); } catch(e) {}
  okBox.style.display = 'block';
  btn.textContent = 'Submitted';
  setTimeout(closeSubmitModal, 3000);
}

// CORRECTION
function openCorrectionModal() {
  const rec = window._currentRecord || {};
  var set = function(id, v){ var el = document.getElementById(id); if (el) el.value = v || ''; };
  set('corr-company',  rec.companyName);
  set('corr-group',    rec.groupCompany);
  set('corr-city',     rec.gccCity);
  set('corr-country',  rec.hqCountry);
  set('corr-industry', rec.industry);
  set('corr-domain',   rec.gccDomains);
  set('corr-headcount',rec.headcountBucket || rec.headcount);
  set('corr-year',     rec.yearEstablished);
  set('corr-maturity', rec.maturityGen);
  set('corr-setup',    rec.setupModel);
  set('corr-note', '');
  var err = document.getElementById('corr-err'); if (err) err.style.display = 'none';
  var ok = document.getElementById('corr-ok'); if (ok) ok.style.display = 'none';
  var btn = document.getElementById('corr-save-btn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit correction'; }
  var m = document.getElementById('correction-modal'); if (m) m.classList.add('open');
}
function closeCorrectionModal() { var m = document.getElementById('correction-modal'); if (m) m.classList.remove('open'); }

async function submitCorrection() {
  const errBox = document.getElementById('corr-err');
  const okBox = document.getElementById('corr-ok');
  const btn = document.getElementById('corr-save-btn');
  errBox.style.display = 'none'; okBox.style.display = 'none';
  const note = document.getElementById('corr-note').value.trim();
  if (!note) { errBox.textContent = 'Please add a note explaining the change.'; errBox.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Submitting...';
  const token = getToken();
  const v = function(id){ return document.getElementById(id).value.trim(); };
  const url = SCRIPT_URL + '?action=submitCorrection&token=' + encodeURIComponent(token)
    + '&company='  + encodeURIComponent(v('corr-company'))
    + '&group='    + encodeURIComponent(v('corr-group'))
    + '&city='     + encodeURIComponent(v('corr-city'))
    + '&country='  + encodeURIComponent(v('corr-country'))
    + '&industry=' + encodeURIComponent(v('corr-industry'))
    + '&domain='   + encodeURIComponent(v('corr-domain'))
    + '&headcount='+ encodeURIComponent(v('corr-headcount'))
    + '&year='     + encodeURIComponent(v('corr-year'))
    + '&maturity=' + encodeURIComponent(v('corr-maturity'))
    + '&setup='    + encodeURIComponent(v('corr-setup'))
    + '&note='     + encodeURIComponent(note);
  try { await fetch(url, { mode: 'no-cors' }); } catch(e) {}
  okBox.style.display = 'block';
  btn.textContent = 'Submitted';
  setTimeout(closeCorrectionModal, 3000);
}

// PASSWORD
function openPwdModal() {
  ['pwd-current','pwd-new','pwd-confirm'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
  var err = document.getElementById('pwd-err'); if (err) err.style.display = 'none';
  var ok = document.getElementById('pwd-ok'); if (ok) ok.style.display = 'none';
  var btn = document.getElementById('pwd-save-btn'); if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  var m = document.getElementById('pwd-modal'); if (m) m.classList.add('open');
}
function closePwdModal() { var m = document.getElementById('pwd-modal'); if (m) m.classList.remove('open'); }

async function changePassword() {
  const current = document.getElementById('pwd-current').value;
  const newPwd  = document.getElementById('pwd-new').value;
  const confirmVal = document.getElementById('pwd-confirm').value;
  const errBox = document.getElementById('pwd-err');
  const okBox = document.getElementById('pwd-ok');
  const btn = document.getElementById('pwd-save-btn');
  errBox.style.display = 'none'; okBox.style.display = 'none';
  if (!current)              { errBox.textContent = 'Enter your current password.'; errBox.style.display = 'block'; return; }
  if (!newPwd)               { errBox.textContent = 'Enter a new password.';        errBox.style.display = 'block'; return; }
  if (newPwd.length < 12)    { errBox.textContent = 'New password must be at least 12 characters.'; errBox.style.display = 'block'; return; }
  if (!/[a-z]/.test(newPwd)) { errBox.textContent = 'New password must include a lowercase letter.'; errBox.style.display = 'block'; return; }
  if (!/[A-Z]/.test(newPwd)) { errBox.textContent = 'New password must include an uppercase letter.'; errBox.style.display = 'block'; return; }
  if (!/[0-9]/.test(newPwd)) { errBox.textContent = 'New password must include a number.'; errBox.style.display = 'block'; return; }
  if (!/[^a-zA-Z0-9]/.test(newPwd)) { errBox.textContent = 'New password must include a special character.'; errBox.style.display = 'block'; return; }
  if (newPwd !== confirmVal) { errBox.textContent = 'New passwords do not match.'; errBox.style.display = 'block'; return; }
  if (newPwd === current)    { errBox.textContent = 'New password must be different.'; errBox.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('no_session');
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(newPwd);
    okBox.style.display = 'block';
    btn.textContent = 'Done';
    setTimeout(closePwdModal, 2500);
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Save';
    if (e && (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')) errBox.textContent = 'Current password is incorrect.';
    else if (e && e.code === 'auth/weak-password') errBox.textContent = 'New password is too weak.';
    else if (e && e.code === 'auth/requires-recent-login') errBox.textContent = 'Please sign out and back in, then retry.';
    else if (e && e.message === 'no_session') errBox.textContent = 'Password change requires an active session. Sign in again first.';
    else errBox.textContent = 'Something went wrong. Please try again.';
    errBox.style.display = 'block';
  }
}

// ENTERPRISE WAITLIST - corporate emails only
const _PERSONAL_EMAIL_DOMAINS = [
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.in','yahoo.co.uk','ymail.com',
  'hotmail.com','hotmail.co.uk','outlook.com','outlook.in','live.com','msn.com',
  'icloud.com','me.com','aol.com','aim.com','proton.me','protonmail.com',
  'rediffmail.com','rediff.com','zoho.com','gmx.com','gmx.net','mail.com',
  'fastmail.com','tutanota.com','yandex.com','yandex.ru','mailinator.com',
  '10minutemail.com','tempmail.com','guerrillamail.com','yopmail.com'
];
function _isPersonalEmail(addr) {
  var domain = (addr.split('@')[1] || '').toLowerCase().trim();
  return _PERSONAL_EMAIL_DOMAINS.indexOf(domain) !== -1;
}

async function joinWaitlist(ev) {
  ev.preventDefault();
  const email = document.getElementById('wl-email').value.trim().toLowerCase();
  const company = document.getElementById('wl-company').value.trim();
  const msg = document.getElementById('wl-msg');
  if (!email || !company) return;
  msg.style.display = 'block';

  if (email.indexOf('@') < 1) {
    msg.textContent = 'Please enter a valid work email.';
    msg.style.color = '#FF6B6B';
    return;
  }
  if (_isPersonalEmail(email)) {
    msg.textContent = 'Enterprise access requires a corporate email. Please use your work email instead of ' + email.split('@')[1] + '.';
    msg.style.color = '#FF6B6B';
    return;
  }

  msg.textContent = 'Submitting...';
  msg.style.color = 'inherit';
  try {
    // No CAPTCHA on this form by design (low-risk endpoint). Server-side
    // rate-limits this to 3 submissions/hour/IP:see Edge Function.
    const url = SCRIPT_URL + '?action=enterpriseWaitlist&email=' + encodeURIComponent(email)
      + '&company=' + encodeURIComponent(company)
      + '&_t=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (data && data.status === 'ok') {
      msg.textContent = '✓ Added to the Enterprise waitlist. Our team will reach out within 3 working days at ' + email + '.';
      msg.style.color = '#34D399';
      document.getElementById('wl-email').value = '';
      document.getElementById('wl-company').value = '';
      // (no widget on this form:nothing to reset)
    } else if (data && data.error === 'missing_fields') {
      msg.textContent = 'Please enter both your work email and company.';
      msg.style.color = '#FF6B6B';
    } else if (data && data.error === 'captcha_failed') {
      msg.textContent = 'CAPTCHA verification failed. Please re-tick the box and submit again.';
      msg.style.color = '#FF6B6B';
      // (no widget on this form:nothing to reset)
    } else if (data && data.error) {
      msg.textContent = 'Could not submit (' + data.error + '). Please email admin@gccpros.com directly.';
      msg.style.color = '#FF6B6B';
      // (no widget on this form:nothing to reset)
    } else {
      msg.textContent = '✓ Submission received. If you do not hear back in 3 days, email admin@gccpros.com.';
      msg.style.color = '#34D399';
      document.getElementById('wl-email').value = '';
      document.getElementById('wl-company').value = '';
      // (no widget on this form:nothing to reset)
    }
  } catch(e) {
    msg.textContent = 'Network error. Please email admin@gccpros.com with your details.';
    msg.style.color = '#FF6B6B';
    resetTurnstile('turnstile-waitlist');
  }
}

/* ─────────────────────────────────────────────────────────────
   ENTERPRISE LAUNCH COUNTDOWN · target = 1 June 2026, 00:00 IST
   ───────────────────────────────────────────────────────────── */
(function initEnterpriseCountdown(){
  var banner = document.getElementById('enterpriseCountdownBanner');
  if (!banner) return;
  var TARGET = new Date('2026-06-01T00:00:00+05:30').getTime();
  var $d = document.getElementById('ecb-days');
  var $h = document.getElementById('ecb-hours');
  var $m = document.getElementById('ecb-mins');
  var $s = document.getElementById('ecb-secs');
  var timer = null;
  function pad(n){ n=String(n); return n.length<2 ? '0'+n : n; }
  function tick(){
    var diff = TARGET - Date.now();
    if (diff <= 0) {
      banner.classList.add('is-launched');
      var titleEl = banner.querySelector('.ecb-title');
      if (titleEl) titleEl.innerHTML = '<strong>Enterprise Edition is LIVE</strong> &middot; Verified leader contacts &amp; full dataset access available now';
      if (eb) eb.textContent = 'Now Available';
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var mins = Math.floor((diff % 3600000) / 60000);
    var secs = Math.floor((diff % 60000) / 1000);
    if ($d) $d.textContent = pad(days);
    if ($h) $h.textContent = pad(hours);
    if ($m) $m.textContent = pad(mins);
    if ($s) $s.textContent = pad(secs);
  }
  // (ecb-close removed:countdown banner is now persistent)
  tick();
  timer = setInterval(tick, 1000);
})();


/* ---- next block ---- */


function openManageDataModal(){ var m=document.getElementById('manage-data-modal'); if(m){m.style.display='flex';m.classList.add('open');} }
function closeManageDataModal(){ var m=document.getElementById('manage-data-modal'); if(m){m.classList.remove('open');m.style.display='none';} }
// Open an email composer pre-filled with the request type + the user's email.
// Server-side handling: any of these requests are received by admin@gccpros.com,
// where the grievance officer logs and acts on them within the SLA.
function dprRequest(kind){
  var who = (window._currentEmail || (typeof getToken === 'function' ? getToken() : '') || 'unknown@unknown').toLowerCase();
  var subjects = {
    access:    'DPDP Access Request:email me my data',
    correction:'DPDP Correction Request',
    withdraw:  'DPDP Withdraw Marketing Consent',
    erasure:   'DPDP Erasure Request:delete my account',
    nominate:  'DPDP Nomination Request',
    grievance: 'DPDP Grievance'
  };
  var bodies = {
    access:    'Hi GCCPROs team,\n\nPlease send me a structured export of all personal data you hold about my account ('+who+'), including profile fields, credit ledger, search history, reveal history, and the list of third-party processors who have received my data.\n\nI understand the response SLA is 7 working days.\n\nThank you.',
    correction:'Hi GCCPROs team,\n\nPlease correct the following data on my account ('+who+'):\n\n[describe what is wrong and what it should be]\n\nThank you.',
    withdraw:  'Hi GCCPROs team,\n\nI am withdrawing my consent to receive marketing communications (WhatsApp / email GCC updates). My account is '+who+'. My main account access should remain active.\n\nThank you.',
    erasure:   'Hi GCCPROs team,\n\nI am exercising my right to erasure under Sec. 12 of the DPDP Act. Please delete the personal data associated with my account ('+who+') within 30 days, retaining only what Indian tax law strictly requires (in anonymised form).\n\nThank you.',
    nominate:  'Hi GCCPROs team,\n\nI wish to nominate the following individual to exercise my rights under the DPDP Act in the event of my death or incapacity:\n\nName:\nRelationship:\nEmail:\nMobile:\n\nMy account: '+who+'\n\nThank you.',
    grievance: 'Hi Shammi (Grievance Officer),\n\nI wish to file a grievance regarding the handling of my personal data on the GCCPROs portal. My account is '+who+'.\n\nGrievance:\n\n[describe the issue]\n\nExpected resolution:\n\nThank you.'
  };
  var subj = encodeURIComponent(subjects[kind] || 'DPDP Request');
  var body = encodeURIComponent(bodies[kind] || ('Account: '+who));
  window.location.href = 'mailto:admin@gccpros.com?subject=' + subj + '&body=' + body;
}


/* ---- next block ---- */


// ===== Database feedback (logged-in users):added 2026-05-22 =====
function fbSetStars(groupId, v) {
  var g = document.getElementById(groupId); if (!g) return;
  v = Math.max(0, Math.min(5, parseInt(v, 10) || 0));
  g.setAttribute('data-val', String(v));
  Array.prototype.forEach.call(g.querySelectorAll('span'), function (sp) {
    sp.classList.toggle('on', parseInt(sp.getAttribute('data-v'), 10) <= v);
  });
}
function fbBindStars(groupId) {
  var g = document.getElementById(groupId); if (!g || g._bound) return; g._bound = true;
  Array.prototype.forEach.call(g.querySelectorAll('span'), function (sp) {
    sp.addEventListener('click', function () { fbSetStars(groupId, sp.getAttribute('data-v')); });
    sp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fbSetStars(groupId, sp.getAttribute('data-v')); } });
  });
}
async function openFeedbackModal() {
  var token = getToken();
  if (!token) { if (typeof openSignInModal === 'function') openSignInModal(); return; }
  var m = document.getElementById('feedback-modal'); if (!m) return;
  fbBindStars('fb-quality'); fbBindStars('fb-coverage');
  fbSetStars('fb-quality', 0); fbSetStars('fb-coverage', 0);
  var c = document.getElementById('fb-comment'); if (c) c.value = '';
  var res = document.getElementById('feedback-result'); res.style.display = 'none';
  m.style.display = 'flex'; m.classList.add('open');
  // Prefill existing feedback (one editable entry per user).
  try {
    var r = await apiFetch(SCRIPT_URL + '?action=getMyFeedback&token=' + encodeURIComponent(token) + '&_t=' + Date.now());
    var j = await r.json();
    if (j && j.feedback) {
      fbSetStars('fb-quality', j.feedback.data_quality_rating);
      fbSetStars('fb-coverage', j.feedback.coverage_rating);
      if (c) c.value = j.feedback.comment || '';
      if (j.feedback.status) {
        res.style.display = 'block'; res.style.background = '#eef2ff'; res.style.color = '#3730a3';
        res.textContent = 'Your current feedback status: ' + j.feedback.status + '. Saving will resubmit it for review.';
      }
    }
  } catch (_) {}
}
function closeFeedbackModal() { var m = document.getElementById('feedback-modal'); if (m) { m.classList.remove('open'); m.style.display = 'none'; } }
async function submitFeedbackForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  var token = getToken();
  if (!token) { if (typeof openSignInModal === 'function') openSignInModal(); return; }
  var quality  = parseInt((document.getElementById('fb-quality')  || {}).getAttribute && document.getElementById('fb-quality').getAttribute('data-val'), 10) || 0;
  var coverage = parseInt((document.getElementById('fb-coverage') || {}).getAttribute && document.getElementById('fb-coverage').getAttribute('data-val'), 10) || 0;
  var comment  = (document.getElementById('fb-comment') || {}).value || '';
  comment = comment.trim();
  var res = document.getElementById('feedback-result');
  if (quality < 1 || coverage < 1) {
    res.style.display = 'block'; res.style.background = '#fef2f2'; res.style.color = '#b91c1c';
    res.textContent = 'Please rate both data quality and coverage (1–5 stars).';
    return;
  }
  var btn = document.getElementById('fb-submit-btn'); var oldTxt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    var url = SCRIPT_URL + '?action=submitFeedback&token=' + encodeURIComponent(token)
            + '&quality=' + quality + '&coverage=' + coverage
            + '&comment=' + encodeURIComponent(comment);
    var r = await apiFetch(url);
    var j = await r.json();
    if (j.error) throw new Error(j.message || j.error);
    res.style.display = 'block'; res.style.background = '#ecfdf5'; res.style.color = '#065f46';
    res.textContent = 'Thank you! Your feedback was submitted and will appear once approved.';
    setTimeout(closeFeedbackModal, 1600);
  } catch (err) {
    res.style.display = 'block'; res.style.background = '#fef2f2'; res.style.color = '#b91c1c';
    res.textContent = 'Could not submit: ' + (err.message || 'error') + '. Please try again or email admin@gccpros.com.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldTxt; }
  }
}

function openInsiderModal(){
  var m=document.getElementById('insider-modal'); if(!m) return;
  m.style.display='flex'; m.classList.add('open');
  setTimeout(function(){ mountTurnstile('turnstile-insider', { action: 'insider-apply' }); }, 60);
}
function closeInsiderModal(){ var m=document.getElementById('insider-modal'); if(m){m.classList.remove('open');m.style.display='none';} }
function openCouncilModal(){
  var m=document.getElementById('council-modal'); if(!m) return;
  m.style.display='flex'; m.classList.add('open');
  setTimeout(function(){ mountTurnstile('turnstile-council', { action: 'council-apply' }); }, 60);
}
function closeCouncilModal(){ var m=document.getElementById('council-modal'); if(m){m.classList.remove('open');m.style.display='none';} }

function _appResult(boxId, msg, ok){
  var b=document.getElementById(boxId);
  if(!b) return;
  b.style.display='block';
  b.style.background = ok ? '#E6F4EA' : '#FDECEA';
  b.style.color      = ok ? '#1E7E34' : '#C53030';
  b.textContent = msg;
}

async function submitInsider(ev){
  ev.preventDefault();
  function v(id){ var e=document.getElementById(id); return e ? (e.value||'').trim() : ''; }
  var cfToken = readTurnstileToken('turnstile-insider');
  if(!cfToken){ _appResult('insider-result','Please complete the "I’m human" verification.',false); return; }
  if(!document.getElementById('ins-dpdp').checked){ _appResult('insider-result','Please tick the consent box (required by DPDP Act).',false); return; }
  var btn=ev.target.querySelector('button[type="submit"]'); if(btn){btn.disabled=true; btn.textContent='Submitting…';}
  try {
    var url = SCRIPT_URL + '?action=insiderApply'
      + '&fullName=' + encodeURIComponent(v('ins-name'))
      + '&email='    + encodeURIComponent(v('ins-email').toLowerCase())
      + '&whatsapp=' + encodeURIComponent(v('ins-wa'))
      + '&linkedin=' + encodeURIComponent(v('ins-li'))
      + '&company='  + encodeURIComponent(v('ins-company'))
      + '&role='     + encodeURIComponent(v('ins-role'))
      + '&yearsInGcc=' + encodeURIComponent(v('ins-yrs'))
      + '&domain='   + encodeURIComponent(v('ins-domain'))
      + '&city='     + encodeURIComponent(v('ins-city'))
      + '&contribute=' + encodeURIComponent(v('ins-contribute'))
      + '&cfToken='  + encodeURIComponent(cfToken)
      + '&dpdpConsent=Yes'
      + '&ua=' + encodeURIComponent(navigator.userAgent || '');
    var r = await fetch(url, { cache:'no-store' });
    var j = await r.json().catch(()=>({}));
    if(j.status==='ok'){
      _appResult('insider-result','✓ '+ (j.message || 'Application received.'), true);
      document.getElementById('insider-form').reset();
      resetTurnstile('turnstile-insider');
    } else if(j.error==='captcha_failed'){
      _appResult('insider-result','CAPTCHA verification failed. Re-tick the box and resubmit.', false);
      resetTurnstile('turnstile-insider');
    } else {
      _appResult('insider-result','Could not submit ('+(j.error||'unknown')+'). Please email admin@gccpros.com.', false);
    }
  } catch(e){
    _appResult('insider-result','Network error. Please email admin@gccpros.com.', false);
  } finally {
    if(btn){btn.disabled=false; btn.textContent='Apply to the Insider Community →';}
  }
}

async function submitCouncil(ev){
  ev.preventDefault();
  function v(id){ var e=document.getElementById(id); return e ? (e.value||'').trim() : ''; }
  var cfToken = readTurnstileToken('turnstile-council');
  if(!cfToken){ _appResult('council-result','Please complete the "I’m human" verification.',false); return; }
  if(!document.getElementById('cn-dpdp').checked){ _appResult('council-result','Please tick the consent box (required by DPDP Act).',false); return; }
  var btn=ev.target.querySelector('button[type="submit"]'); if(btn){btn.disabled=true; btn.textContent='Submitting…';}
  try {
    var url = SCRIPT_URL + '?action=councilApply'
      + '&fullName=' + encodeURIComponent(v('cn-name'))
      + '&email='    + encodeURIComponent(v('cn-email').toLowerCase())
      + '&whatsapp=' + encodeURIComponent(v('cn-wa'))
      + '&linkedin=' + encodeURIComponent(v('cn-li'))
      + '&company='  + encodeURIComponent(v('cn-company'))
      + '&title='    + encodeURIComponent(v('cn-title'))
      + '&seniority='+ encodeURIComponent(v('cn-seniority'))
      + '&yearsSenior=' + encodeURIComponent(v('cn-yrsr'))
      + '&gccsLed='  + encodeURIComponent(v('cn-gccs'))
      + '&nominationType=' + encodeURIComponent(v('cn-nomtype'))
      + '&nominatorName='  + encodeURIComponent(v('cn-nomname'))
      + '&nominatorEmail=' + encodeURIComponent(v('cn-nomemail'))
      + '&contribution=' + encodeURIComponent(v('cn-contrib'))
      + '&whyJoin=' + encodeURIComponent(v('cn-why'))
      + '&cfToken='  + encodeURIComponent(cfToken)
      + '&dpdpConsent=Yes'
      + '&ua=' + encodeURIComponent(navigator.userAgent || '');
    var r = await fetch(url, { cache:'no-store' });
    var j = await r.json().catch(()=>({}));
    if(j.status==='ok'){
      _appResult('council-result','✓ '+ (j.message || 'Application received.'), true);
      document.getElementById('council-form').reset();
      document.getElementById('cn-nom-fields').style.display='none';
      resetTurnstile('turnstile-council');
    } else if(j.error==='captcha_failed'){
      _appResult('council-result','CAPTCHA verification failed. Re-tick the box and resubmit.', false);
      resetTurnstile('turnstile-council');
    } else {
      _appResult('council-result','Could not submit ('+(j.error||'unknown')+'). Please email admin@gccpros.com.', false);
    }
  } catch(e){
    _appResult('council-result','Network error. Please email admin@gccpros.com.', false);
  } finally {
    if(btn){btn.disabled=false; btn.textContent='Submit Council application →';}
  }
}


/* ---- next block ---- */


function openCreditsFaq(){ var m=document.getElementById('credits-faq-modal'); if(m){m.style.display='flex';m.classList.add('open');} }
function closeCreditsFaq(){ var m=document.getElementById('credits-faq-modal'); if(m){m.classList.remove('open');m.style.display='none';} }


/* ---- next block ---- */


/* Reuses the existing, HMAC-verified Razorpay create-order + verify-payment
   flow (pack="report"). On a verified ₹4,999 payment the buyer is granted
   4,999 credits AND the report is unlocked: fetched, watermarked to the buyer,
   downloaded, with a Chartered Times LLP tax invoice. No existing function is
   modified:all names are namespaced _rpt*. */
var REPORT_CFG = {
  PACK:        'report',
  PRICE_INR:   4999,
  CREDITS:     4999,
  // Host the report PDF on the SAME origin as this page (so fetch() is allowed),
  // then point REPORT_URL at it. Default assumes it sits next to this page.
  REPORT_URL:  'GCCPROs_India_GCC_Report_2026.pdf',
  FILENAME:    'GCCPROs_India_GCC_Report_2026.pdf'
};
var RPT_SELLER = {
  name:"Chartered Times LLP", tag:"Market Intelligence & Talent Solutions",
  a1:"B 101, Marvel Citrine, Rakshak Nagar", a2:"Kharadi, Pune – 411 014, Maharashtra",
  gstin:"27AAPFC1327B1ZT", pan:"AAPFC1327B", email:"admin@gccpros.com",
  phone:"+91 85069 76700", state:"27:Maharashtra"
};
function _rptMsg(m){ var el=document.getElementById('report-purchase-msg'); if(el) el.innerHTML=m||''; }
function _rptDownload(bytes, filename){
  var blob=new Blob([bytes],{type:'application/pdf'}); var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}
function _rptInvNo(){
  var n=new Date();
  var fy=(n.getMonth()>=3)?(n.getFullYear()%100)+''+((n.getFullYear()+1)%100):((n.getFullYear()-1)%100)+''+(n.getFullYear()%100);
  var seq=String(Math.floor(n.getTime()/1000)%100000).padStart(5,'0');
  return 'CT/INV/'+fy+'/'+seq;
}
function _rptToday(){ var d=new Date(); return d.getDate()+' '+d.toLocaleString('en-GB',{month:'short'})+' '+d.getFullYear(); }

async function _rptWatermark(bytes, name){
  var L=PDFLib, doc=await L.PDFDocument.load(bytes), font=await doc.embedFont(L.StandardFonts.HelveticaBold);
  var text="Licensed to "+name;
  doc.getPages().forEach(function(pg){
    var s=pg.getSize();
    for(var y=-40;y<s.height+120;y+=104) for(var x=-60;x<s.width+200;x+=270)
      pg.drawText(text,{x:x,y:y,size:15,font:font,color:L.rgb(0.42,0.48,0.58),opacity:0.09,rotate:L.degrees(33)});
  });
  return await doc.save();
}
async function _rptInvoice(o){
  var L=PDFLib, MM=2.834645669, W=595.276, H=841.890;
  var NAVY=L.rgb(0.039,0.086,0.157),SKY=L.rgb(0.357,0.639,0.839),INK=L.rgb(0.125,0.161,0.239),
      MUTE=L.rgb(0.420,0.478,0.600),HAIR=L.rgb(0.863,0.890,0.925),GREEN=L.rgb(0.122,0.478,0.200),WHITE=L.rgb(1,1,1);
  var doc=await L.PDFDocument.create(), pg=doc.addPage([W,H]);
  var reg=await doc.embedFont(L.StandardFonts.Helvetica), bold=await doc.embedFont(L.StandardFonts.HelveticaBold);
  var mm=function(v){return v*MM;};
  var T=function(t,x,y,s,f,c){pg.drawText(String(t),{x:x,y:y,size:s,font:f,color:c});};
  var TR=function(t,x,y,s,f,c){var w=f.widthOfTextAtSize(String(t),s);pg.drawText(String(t),{x:x-w,y:y,size:s,font:f,color:c});};
  var LN=function(x1,y1,x2,y2,c,w){pg.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},color:c,thickness:w});};
  var intra=String(o.b_state_code)==="27";
  T(RPT_SELLER.name,mm(18),H-mm(22),20,bold,NAVY); T(RPT_SELLER.tag,mm(18),H-mm(27),8.5,reg,MUTE);
  TR("TAX INVOICE",W-mm(18),H-mm(22),17,bold,NAVY);
  TR("Invoice No: "+o.invno,W-mm(18),H-mm(28),8.5,reg,MUTE);
  TR("Invoice Date: "+o.date,W-mm(18),H-mm(32.5),8.5,reg,MUTE);
  TR("Payment: Razorpay  ·  "+o.orderid,W-mm(18),H-mm(37),8.5,reg,MUTE);
  LN(mm(18),H-mm(41),W-mm(18),H-mm(41),SKY,1.4);
  var y=H-mm(50);
  T("BILL FROM",mm(18),y,8,bold,MUTE); T("BILL TO",mm(108),y,8,bold,MUTE);
  T(RPT_SELLER.name,mm(18),y-mm(6),10,bold,INK); T(o.b_name,mm(108),y-mm(6),10,bold,INK);
  var fl=[RPT_SELLER.a1,RPT_SELLER.a2,"GSTIN: "+RPT_SELLER.gstin+"  ·  PAN: "+RPT_SELLER.pan,"State Code: "+RPT_SELLER.state,RPT_SELLER.email+"  ·  "+RPT_SELLER.phone];
  var tl=[o.b_email,"State Code: "+o.b_state_code,"Place of Supply: "+(intra?"Maharashtra":"Other State"),"Supply Type: "+(intra?"Intra-State":"Inter-State"),"Tax: "+(intra?"CGST + SGST":"IGST")];
  fl.forEach(function(t,i){T(t,mm(18),y-mm(11)-i*mm(4.6),8.5,reg,MUTE);});
  tl.forEach(function(t,i){T(t,mm(108),y-mm(11)-i*mm(4.6),8.5,reg,MUTE);});
  var ty=y-mm(40);
  pg.drawRectangle({x:mm(18),y:ty,width:W-mm(36),height:mm(8),color:NAVY});
  T("DESCRIPTION",mm(21),ty+mm(2.5),8.5,bold,WHITE);T("SAC",mm(120),ty+mm(2.5),8.5,bold,WHITE);
  T("QTY",mm(140),ty+mm(2.5),8.5,bold,WHITE);TR("AMOUNT (INR)",W-mm(21),ty+mm(2.5),8.5,bold,WHITE);
  T("GCCPROs Database-Pro:credit top-up",mm(21),ty-mm(8),10,reg,INK);
  T("Prepaid research credits for the Database-Pro portal. 1 credit = Rs 1.",mm(21),ty-mm(12.5),8,reg,MUTE);
  T("998431",mm(120),ty-mm(8),9,reg,INK);T(o.credits+" cr",mm(140),ty-mm(8),9,reg,INK);
  TR(o.amount.toFixed(2),W-mm(21),ty-mm(8),10,reg,INK);
  LN(mm(18),ty-mm(16),W-mm(18),ty-mm(16),HAIR,1);
  var taxable=Math.round((o.amount/1.18)*100)/100, gst=Math.round((o.amount-taxable)*100)/100,
      cg=Math.round((gst/2)*100)/100, sg=Math.round((gst-cg)*100)/100;
  var row=function(lbl,val,yy,b){var f=b?bold:reg,sz=b?10:9,col=b?NAVY:MUTE;TR(lbl,W-mm(52),yy,sz,f,col);TR(val,W-mm(21),yy,sz,f,INK);};
  var ry=ty-mm(23); row("Taxable value",taxable.toFixed(2),ry,false); var nb;
  if(intra){row("CGST 9%",cg.toFixed(2),ry-mm(5),false);row("SGST 9%",sg.toFixed(2),ry-mm(10),false);nb=ry-mm(13);}
  else{row("IGST 18%",gst.toFixed(2),ry-mm(5),false);nb=ry-mm(8);}
  LN(W-mm(92),nb,W-mm(18),nb,HAIR,1); row("TOTAL (INR)",o.amount.toFixed(2),nb-mm(6),true);
  TR("PAID",W-mm(21),nb-mm(13),10,bold,GREEN);
  T("Amount is the credit top-up paid via Razorpay and is treated as inclusive of GST. Credits are non-refundable and non-transferable.",mm(18),mm(40),8,reg,MUTE);
  T("Reverse charge: No.  ·  This is a computer-generated tax invoice and does not require a signature.",mm(18),mm(36),8,reg,MUTE);
  LN(mm(18),mm(30),W-mm(18),mm(30),SKY,1);
  T(RPT_SELLER.name+"  ·  "+RPT_SELLER.email+"  ·  gccpros.com",mm(18),mm(25),8,reg,MUTE);
  TR("GCCPROs is a brand of "+RPT_SELLER.name,W-mm(18),mm(25),8,reg,MUTE);
  return await doc.save();
}

async function _rptDeliver(orderId){
  var cu=(typeof currentUser!=='undefined' && currentUser)?currentUser:null;
  var email=(cu&&cu.email)||(typeof getToken==='function'&&getToken())||'member@gccpros.com';
  var name=(cu&&cu.displayName)|| (email.split('@')[0]) || email;
  if(typeof PDFLib==='undefined'){ _rptMsg('Download engine still loading:please retry in a moment.'); return; }
  _rptMsg('Preparing your watermarked report and invoice…');
  var resp=await fetch(REPORT_CFG.REPORT_URL,{cache:'no-store'});
  if(!resp.ok) throw new Error('report fetch '+resp.status);
  var reportBytes=new Uint8Array(await resp.arrayBuffer());
  var wm=await _rptWatermark(reportBytes, name);
  _rptDownload(wm, REPORT_CFG.FILENAME);
  var inv=await _rptInvoice({b_name:name,b_email:email,b_state_code:'27',invno:_rptInvNo(),date:_rptToday(),orderid:orderId,amount:REPORT_CFG.PRICE_INR,credits:REPORT_CFG.CREDITS});
  _rptDownload(inv,'GCCPROs_TaxInvoice.pdf');
  _rptMsg('✓ Done:your report and invoice have downloaded. Keep them safe; the report is licensed to you.');
}

async function buyReport(){
  var token=(typeof getToken==='function')?getToken():null;
  if(!token){ if(typeof showToast==='function') showToast('Please sign in to buy the report.','#1A3A6E'); _rptMsg('Please sign in to buy the report.'); return; }
  if(typeof _accountStatus!=='undefined' && _accountStatus && _accountStatus!=='Approved'){ if(typeof showToast==='function') showToast('Your account must be approved before purchase.','#1A3A6E'); return; }
  if(typeof Razorpay==='undefined'){ _rptMsg('Payment gateway is loading:please try again in a moment.'); return; }
  _rptMsg('Starting secure checkout…');
  var order;
  try{
    var orderRes=await apiFetch(SCRIPT_URL+'?action=razorpayCreateOrder&token='+encodeURIComponent(token)+'&pack='+encodeURIComponent(REPORT_CFG.PACK));
    order=await orderRes.json();
    if(order.error) throw new Error(order.message||order.error);
  }catch(err){ _rptMsg('Could not start payment ('+(err.message||'server error')+'). Please retry, or WhatsApp +91-85069-76700.'); return; }
  var rzp=new Razorpay({
    key:order.key_id, order_id:order.order_id, amount:order.amount, currency:order.currency,
    name:'GCCPROs', description:'India GCC Report 2026:Definitive Edition',
    prefill:{ email:token }, theme:{ color:'#0A1628' },
    handler:async function(response){
      _rptMsg('Payment received:verifying…');
      try{
        var vurl=SCRIPT_URL+'?action=razorpayVerifyPayment&token='+encodeURIComponent(token)
          +'&razorpay_order_id='+encodeURIComponent(response.razorpay_order_id||'')
          +'&razorpay_payment_id='+encodeURIComponent(response.razorpay_payment_id||'')
          +'&razorpay_signature='+encodeURIComponent(response.razorpay_signature||'');
        var vres=await apiFetch(vurl); var vj=await vres.json().catch(function(){return {};});
        if(!(vres.ok && vj && vj.status==='ok')){
          _rptMsg('Payment captured. If your download does not start, email admin@gccpros.com with reference '+(response.razorpay_payment_id||''));
        }
        try{ if(typeof fetchCreditBalance==='function') await fetchCreditBalance(); }catch(_){}
        await _rptDeliver(response.razorpay_payment_id||response.razorpay_order_id||'order');
      }catch(e){ _rptMsg('Verification issue: '+(e.message||e)+'. Email admin@gccpros.com with your payment reference.'); }
    },
    modal:{ ondismiss:function(){ _rptMsg(''); } }
  });
  rzp.on('payment.failed',function(resp){ _rptMsg('Payment failed: '+((resp.error&&resp.error.description)||'please retry')); });
  rzp.open();
}

async function redeemReportWithCredits(){
  var token=(typeof getToken==='function')?getToken():null;
  if(!token){ if(typeof showToast==='function') showToast('Please sign in to use credits.','#1A3A6E'); _rptMsg('Please sign in to use credits.'); return; }
  if(typeof _accountStatus!=='undefined' && _accountStatus && _accountStatus!=='Approved'){ if(typeof showToast==='function') showToast('Your account must be approved first.','#1A3A6E'); return; }
  if(typeof PDFLib==='undefined'){ _rptMsg('Download engine still loading:please retry in a moment.'); return; }
  _rptMsg('Redeeming 4,999 credits…');
  try{
    var res=await apiFetch(SCRIPT_URL+'?action=redeemReport&token='+encodeURIComponent(token));
    var j=await res.json().catch(function(){return {};});
    if(j.error==='insufficient_credits'){ _rptMsg('You have '+(j.balance!=null?j.balance:'0')+' credits:the report costs 4,999. Use “Buy & download” to pay directly, or top up.'); return; }
    if(!(res.ok && j.status==='ok')){ _rptMsg('Could not redeem credits ('+(j.error||j.message||'server error')+'). Please use “Buy & download” instead.'); return; }
    try{ if(typeof fetchCreditBalance==='function') await fetchCreditBalance(); }catch(_){}
    await _rptDeliver('credits:'+(j.spent||4999));
  }catch(e){ _rptMsg('Could not redeem credits: '+(e.message||e)); }
}


/* ---- next block ---- */


/* Enterprise Inquiry form:v7.0 (2026-06-08) */
async function submitEnterpriseInquiry(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  var btn  = document.getElementById('ent-submit-btn');
  var data = {
    fullName:     (document.getElementById('ent-fullName')     || {}).value || '',
    organization: (document.getElementById('ent-organization') || {}).value || '',
    email:        (document.getElementById('ent-email')        || {}).value || '',
    phone:        (document.getElementById('ent-phone')        || {}).value || '',
    useCase:      (document.getElementById('ent-useCase')      || {}).value || '',
    sourceUrl:    location.href.split('?')[0]
  };
  if (!data.fullName.trim() || !data.organization.trim() || !data.email.trim() || !data.useCase.trim()) {
    _entMsgShow('err', 'Name, organisation, email and use case are required.');
    return false;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email.trim())) {
    _entMsgShow('err', 'That email does not look valid.');
    return false;
  }
  // Business-email guard. Reuses the existing personal-domain blocklist on this page.
  try {
    if (typeof _isPersonalEmail === 'function' && _isPersonalEmail(data.email.trim().toLowerCase())) {
      _entMsgShow('err', 'Please use your work email:personal addresses (Gmail, Yahoo, Outlook, etc.) cannot be processed for Enterprise enquiries.');
      return false;
    }
  } catch (_) { /* if helper is missing, fall through */ }
  // Phone validation:optional, but if entered must look like a real number
  // (10–15 digits after stripping +, spaces, hyphens, parentheses).
  var _phoneRaw = (data.phone || '').trim();
  if (_phoneRaw) {
    var _phoneDigits = _phoneRaw.replace(/[^\d]/g, '');
    if (_phoneDigits.length < 10 || _phoneDigits.length > 15) {
      _entMsgShow('err', 'Phone number looks off:please enter 10 to 15 digits (country code optional).');
      return false;
    }
    if (!/^[+\d][\d\s\-().]*$/.test(_phoneRaw)) {
      _entMsgShow('err', 'Phone number contains invalid characters. Use digits, spaces, +, -, ( ) only.');
      return false;
    }
  }
  btn.disabled = true;
  btn.textContent = 'Opening email…';
  // Pure mailto, opens the user's email client with a prefilled draft to
  // admin@gccpros.com. No backend call. No Supabase. No edge function. No
  // failure modes beyond "no email client installed", which is rare.
  var subj = encodeURIComponent('Enterprise plan enquiry - ' + data.organization);
  var body = encodeURIComponent(
    'Hi GCCPROs team,\n\n' +
    'Name: ' + data.fullName + '\n' +
    'Organisation: ' + data.organization + '\n' +
    'Email: ' + data.email + '\n' +
    (data.phone ? ('Phone: ' + data.phone + '\n') : '') +
    '\nUse case:\n' + data.useCase + '\n\nThanks.'
  );
  window.location.href = 'mailto:admin@gccpros.com?subject=' + subj + '&body=' + body;
  _entMsgShow('ok',
    'Your email client is opening with a prefilled message. Please review and click Send to deliver it to admin@gccpros.com. ' +
    'If nothing opens, copy this address (admin@gccpros.com) into your usual email tool and paste the same details.');
  setTimeout(function(){
    btn.disabled = false;
    btn.textContent = 'Send to Enterprise team →';
  }, 1500);
  return false;
}
function entClearFieldError(el) {
  if (!el) return;
  el.style.border = '1px solid rgba(255,255,255,0.20)';
  var hint = document.getElementById(el.id + '-hint');
  if (hint) hint.remove();
  var msg = document.getElementById('ent-msg');
  if (msg && msg.style.display === 'block' && /email|phone/i.test(msg.textContent || '')) msg.style.display = 'none';
}
function _entMarkFieldErr(el, hintText) {
  if (!el) return;
  el.style.border = '1.5px solid #F2A0A0';
  var hint = document.getElementById(el.id + '-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = el.id + '-hint';
    hint.style.cssText = 'grid-column:1/-1;font-size:11.5px;color:#F2C0C0;background:rgba(178,59,59,0.15);border:1px solid rgba(178,59,59,0.45);border-radius:3px;padding:6px 10px;margin-top:-4px;line-height:1.4;';
    el.parentNode.insertBefore(hint, el.nextSibling);
  }
  hint.textContent = hintText;
}
function entValidateEmail(el) {
  if (!el) return true;
  var v = (el.value || '').trim().toLowerCase();
  if (!v) { entClearFieldError(el); return true; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
    _entMarkFieldErr(el, 'That email does not look valid:please double-check.');
    return false;
  }
  try {
    if (typeof _isPersonalEmail === 'function' && _isPersonalEmail(v)) {
      _entMarkFieldErr(el, 'Please use a work email:personal addresses (Gmail, Yahoo, Outlook, etc.) cannot be accepted for Enterprise enquiries.');
      return false;
    }
  } catch (_) {}
  entClearFieldError(el);
  return true;
}
function entValidatePhone(el) {
  if (!el) return true;
  var v = (el.value || '').trim();
  if (!v) { entClearFieldError(el); return true; }
  if (!/^[+\d][\d\s\-().]*$/.test(v)) {
    _entMarkFieldErr(el, 'Phone may contain digits, spaces, +, -, ( ) only.');
    return false;
  }
  var digits = v.replace(/[^\d]/g, '');
  if (digits.length < 10 || digits.length > 15) {
    _entMarkFieldErr(el, 'Phone must have 10 to 15 digits (country code optional).');
    return false;
  }
  entClearFieldError(el);
  return true;
}
function _entMsgShow(kind, text) {
  var msg = document.getElementById('ent-msg');
  if (!msg) return;
  msg.textContent = text;
  msg.style.display = 'block';
  if (kind === 'ok') {
    msg.style.background = 'rgba(45,122,78,0.18)';
    msg.style.border     = '1px solid rgba(45,122,78,0.55)';
    msg.style.color      = '#B6DFC0';
  } else {
    msg.style.background = 'rgba(178,59,59,0.18)';
    msg.style.border     = '1px solid rgba(178,59,59,0.55)';
    msg.style.color      = '#F2C0C0';
  }
}


/* ---- next block ---- */

window.addEventListener('load',function(){try{var qs=new URLSearchParams(location.search);var want=qs.get('auth');if(!want&&qs.get('signup'))want='signup';if(want!=='signup'&&want!=='signin')return;setTimeout(function(){try{var u=(window.firebase&&firebase.auth&&firebase.auth().currentUser);if(u)return;if(typeof openSignInModal==='function'){openSignInModal();if(typeof switchMode==='function')switchMode(want);}}catch(_){}},600);}catch(_){}});

/* ---- next block ---- */


(function(){
  var BOT_URL="https://fufnvnvufmrhrzhcoeil.supabase.co/functions/v1/company-bot-beta";
  var lastQid=null, busy=false;
  function el(id){return document.getElementById(id);}
  function esc(s){var d=document.createElement('div');d.textContent=(s==null?'':''+s);return d.innerHTML;}
  window.gcbotToggle=function(){var p=el('gcbot-panel');p.classList.toggle('open');if(p.classList.contains('open')){setTimeout(function(){el('gcbot-q').focus();},60);}};
  function add(cls,html){var log=el('gcbot-log');var d=document.createElement('div');d.className='gcb-msg '+cls;d.innerHTML=html;log.appendChild(d);el('gcbot-body').scrollTop=el('gcbot-body').scrollHeight;return d;}
  function sys(html){return add('gcb-sys',html);}
  async function idTok(){
    try{ if(window.firebase&&firebase.auth&&firebase.auth().currentUser){ return await firebase.auth().currentUser.getIdToken(); } }catch(e){}
    return null;
  }
  async function call(payload){
    var tok=await idTok();
    if(!tok){ return {ok:false,needLogin:true}; }
    var ctrl=new AbortController(); var timer=setTimeout(function(){ctrl.abort();},60000);
    try{
      var r=await fetch(BOT_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify(Object.assign({idToken:tok},payload)),signal:ctrl.signal});
      clearTimeout(timer);
      var d=await r.json(); d._http=r.status; return d;
    }catch(e){ clearTimeout(timer); return {ok:false,_neterr:true,_aborted:(e&&e.name==='AbortError')}; }
  }
  function refreshBal(){ try{ if(typeof fetchCreditBalance==='function') fetchCreditBalance(); }catch(e){} }
  function setMore(show){ el('gcbot-more').style.display=show?'block':'none'; }
  window.gcbotAsk=async function(){
    if(busy)return; var q=el('gcbot-q').value.trim(); if(!q)return;
    busy=true; el('gcbot-send').disabled=true; setMore(false);
    add('gcb-u',esc(q)); el('gcbot-q').value='';
    var wait=sys('Thinking...');
    var d=await call({q:q});
    wait.remove();
    if(d.needLogin){ sys('Please sign in to use the Data Bot.'); busy=false; el('gcbot-send').disabled=false; return; }
    if(d._neterr){ var m=sys(d._aborted?'That took too long. Your answer may already be saved.':'Network hiccup. Your answer may already be saved.'); var b=document.createElement('button'); b.textContent='Recover my last answer (no charge)'; b.style.cssText='margin-top:6px;display:block;background:#fff;border:1px solid #2F5DA8;color:#2F5DA8;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer'; b.onclick=gcbotRecover; m.appendChild(b); busy=false; el('gcbot-send').disabled=false; return; }
    if(d._http===401||d.error==='auth'){ sys(d.answer||'Please sign in again to use the Data Bot.'); busy=false; el('gcbot-send').disabled=false; return; }
    if(d.insufficient){ var mm=add('gcb-a',esc(d.answer||'You need 100 credits to ask.')); try{ var bb=document.createElement('button'); bb.textContent='Buy credits'; bb.style.cssText='margin-top:6px;display:block;background:#2F5DA8;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer'; bb.onclick=function(){ if(typeof openBuyCredits==='function') openBuyCredits(); }; mm.appendChild(bb); }catch(e){} busy=false; el('gcbot-send').disabled=false; return; }
    add('gcb-a',esc(d.answer||'No answer.'));
    lastQid=d.queryId||null; setMore(!!d.hasMore && !!lastQid);
    if(d.charged) refreshBal();
    busy=false; el('gcbot-send').disabled=false;
  };
  window.gcbotMore=async function(){
    if(busy||!lastQid)return; busy=true; setMore(false);
    var wait=sys('Fetching more...');
    var d=await call({action:'more',queryId:lastQid});
    wait.remove();
    if(d.needLogin){ sys('Please sign in again.'); busy=false; return; }
    if(d._neterr){ sys('Network hiccup. Please try again.'); busy=false; return; }
    if(d.insufficient){ add('gcb-a',esc(d.answer)); busy=false; return; }
    add('gcb-a',esc(d.answer||'No more details.'));
    setMore(!!d.hasMore); if(d.charged) refreshBal();
    busy=false;
  };
  window.gcbotRecover=async function(){
    if(busy)return; busy=true;
    var wait=sys('Recovering...');
    var d=await call({action:'recover'});
    wait.remove();
    if(d&&d.answer){ add('gcb-a',esc(d.answer)); lastQid=d.queryId||null; setMore(!!d.hasMore&&!!lastQid); }
    else{ sys('No recent answer to recover.'); }
    busy=false;
  };
})();
