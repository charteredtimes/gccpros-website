/* Layout hygiene audit, run in the browser on the local preview (http://localhost:8765).
   Loads each page in a same-origin iframe at a given width, forces reveal animations to their end
   state, hides fixed/sticky chrome, then reports:
   - covered: text whose visible area is painted over by another element (like cards over a heading)
   - overflow: the page scrolls sideways, or an element pokes past the viewport edge
   - clipped: a heading or button whose text is cut off by its own box
   Usage (browser console / javascript_tool): await runAudit(['index.html', ...], [1280, 375]) */
window.runAudit = async function (pages, widths) {
  const out = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const w of widths) for (const p of pages) {
    const f = document.createElement('iframe');
    f.style.cssText = `position:absolute;left:-10000px;top:0;width:${w}px;height:900px;border:0`;
    document.body.appendChild(f);
    await new Promise(r => { f.onload = r; f.src = '/' + p + (p.includes('?') ? '&' : '?') + 'audit=1'; setTimeout(r, 8000); });
    await sleep(1200);
    let res;
    try { res = audit(f.contentWindow, w); } catch (e) { res = ['ERROR ' + e.message]; }
    if (res.length) out.push(`${p} @${w}: ` + res.join(' | '));
    f.remove();
  }
  return out;
};
function audit(win, w) {
  const d = win.document, issues = [];
  if (!d.body) return issues;
  const st = d.createElement('style');
  st.textContent = `[data-reveal],[data-reveal] *,.reveal,.split-words .w>span{opacity:1!important;transform:none!important;transition:none!important;animation:none!important}
  *{transition:none!important;animation-play-state:paused!important}`;
  d.head.appendChild(st);
  d.querySelectorAll('.split-words .w>span').forEach(e => e.style.transform = 'none');
  // Hide fixed/sticky chrome so it doesn't count as covering content.
  for (const e of d.querySelectorAll('body *')) {
    const cs = win.getComputedStyle(e);
    if (cs.position === 'fixed' || cs.position === 'sticky') e.style.visibility = 'hidden';
  }
  const H = d.documentElement.scrollHeight;
  const vis = e => { const cs = win.getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const label = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '"';
  const hiddenByAncestor = e => { for (let a = e; a && a !== d.body; a = a.parentElement) { const cs = win.getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return true; if (a.getAttribute('aria-hidden') === 'true' && a !== e) return false; } return false; };
  // 1. covered text
  const texts = [...d.querySelectorAll('h1,h2,h3,h4,p,li,label,.btn,button,a.cta,.stat__num,.stat__label')]
    .filter(e => vis(e) && !hiddenByAncestor(e) && e.textContent.trim().length > 2 && !e.closest('dialog,[role=dialog],.modal-overlay,.modal,[hidden],nav,header .menu,.mega,.drawer'));
  let covered = 0;
  for (const e of texts) {
    const r0 = e.getBoundingClientRect();
    if (r0.width < 8 || r0.height < 8) continue;
    win.scrollTo(0, Math.max(0, r0.top + win.scrollY - 200));
    const r = e.getBoundingClientRect();
    const pts = [[.15, .35], [.4, .35], [.6, .35], [.85, .35], [.15, .75], [.4, .75], [.6, .75], [.85, .75]].map(([x, y]) => [r.left + r.width * x, r.top + r.height * y]).filter(([x]) => x > 0 && x < w);
    let bad = 0, by = null;
    for (const [x, y] of pts) {
      if (y < 0 || y > win.innerHeight) continue;
      const t = d.elementFromPoint(x, y);
      if (!t || t === e || e.contains(t) || t.contains(e)) continue;
      // same stacking context siblings of a label/inputs are fine
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') continue;
      bad++; by = t;
    }
    if (bad >= 2 && covered < 6) { covered++; issues.push('COVERED ' + label(e) + ' by ' + label(by)); }
  }
  // 2. horizontal overflow
  const sw = d.documentElement.scrollWidth;
  if (sw > w + 2) {
    let worst = null, wr = 0;
    for (const e of d.querySelectorAll('body *')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.right > wr && r.right > w + 2 && r.width < w * 3) { wr = r.right; worst = e; } }
    issues.push(`HSCROLL ${sw}px > ${w}px, widest ${worst ? label(worst) : '?'}`);
  }
  // 3. clipped headings/buttons
  let clipped = 0;
  for (const e of d.querySelectorAll('h1,h2,h3,.btn,button,.stat__num')) {
    if (!vis(e) || hiddenByAncestor(e) || !e.textContent.trim()) continue;
    const cs = win.getComputedStyle(e);
    if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 3) && clipped < 4) {
      clipped++; issues.push(`CLIPPED ${label(e)} (${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight})`);
    }
  }
  return issues;
}
