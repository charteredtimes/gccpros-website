/* GCCPROs shared UI layer - nav, motion, counters, charts, globe.
   Progressive enhancement only: every page works without this file. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches;
  root.classList.remove('no-js'); root.classList.add('js');

  /* ---------- nav ---------- */
  var nav = d.querySelector('.gp-nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', w.scrollY > 12); };
    onScroll(); w.addEventListener('scroll', onScroll, { passive: true });

    var burger = nav.querySelector('.gp-burger');
    var setMenu = function (open) {
      nav.classList.toggle('menu-open', open);
      root.classList.toggle('gp-lock', open);
      if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    if (burger) burger.addEventListener('click', function () { setMenu(!nav.classList.contains('menu-open')); });
    d.querySelectorAll('.gp-mobile a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

    // dropdowns: click toggles, hover opens on fine pointers, Esc closes
    var drops = nav.querySelectorAll('.gp-menu > li.has-drop');
    var closeAll = function (except) { drops.forEach(function (li) { if (li !== except) { li.classList.remove('is-open'); var b = li.querySelector('button'); if (b) b.setAttribute('aria-expanded', 'false'); } }); };
    drops.forEach(function (li) {
      var b = li.querySelector('button'), t;
      b.addEventListener('click', function (e) { e.stopPropagation(); var open = !li.classList.contains('is-open'); closeAll(li); li.classList.toggle('is-open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
      if (finePointer) {
        li.addEventListener('mouseenter', function () { clearTimeout(t); closeAll(li); li.classList.add('is-open'); b.setAttribute('aria-expanded', 'true'); });
        li.addEventListener('mouseleave', function () { t = setTimeout(function () { li.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); }, 160); });
      }
    });
    d.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeAll(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeAll(); setMenu(false); } });

    // mark current page
    var here = location.pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').replace(/\/$/, '') || '/';
    d.querySelectorAll('.gp-nav a[href], .gp-mobile a[href]').forEach(function (a) {
      var p = (a.getAttribute('href') || '').split('#')[0].replace(/\.html$/, '').replace(/\/$/, '') || '/';
      if (p === here && !a.classList.contains('gp-cta')) {
        a.setAttribute('aria-current', 'page');
        var li = a.closest('li.has-drop'); if (li) li.classList.add('is-current');
      }
    });
  }

  /* ---------- scroll progress ---------- */
  var bar = d.querySelector('.gp-progress');
  if (bar) {
    var raf = 0;
    var upd = function () { raf = 0; var h = root.scrollHeight - root.clientHeight; bar.style.setProperty('--p', h > 0 ? (w.scrollY / h).toFixed(4) : 0); };
    w.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true }); upd();
  }

  /* footer year runs everywhere */
  d.querySelectorAll('[data-year]').forEach(function (y) { y.textContent = new Date().getFullYear(); });

  /* Everything below is for marketing pages (body.gp). App pages only get the chrome above. */
  if (!d.body.classList.contains('gp')) return;

  /* ---------- split words ---------- */
  d.querySelectorAll('.split-words').forEach(function (el) {
    var i = 0;
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(part)); return; }
            var o = d.createElement('span'); o.className = 'w';
            var s = d.createElement('span'); s.textContent = part; s.style.setProperty('--i', i++);
            o.appendChild(s); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  });

  /* ---------- stagger helper ---------- */
  d.querySelectorAll('[data-stagger]').forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (c, i) { if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', ''); c.style.setProperty('--d', i); });
  });

  /* ---------- counters ---------- */
  var fmt = function (n, loc) { return n.toLocaleString(loc || 'en-US'); };
  var countUp = function (el) {
    var to = parseFloat(el.getAttribute('data-count')), dec = +(el.getAttribute('data-decimals') || 0), loc = el.getAttribute('data-locale') || 'en-US';
    var suffix = el.querySelector('.u'), sufHTML = suffix ? suffix.outerHTML : '';
    if (reduce || isNaN(to)) return;
    var t0 = performance.now(), dur = +(el.getAttribute('data-dur') || 1600);
    var tick = function (now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4), v = to * e;
      el.innerHTML = (dec ? v.toFixed(dec) : fmt(Math.round(v), loc)) + sufHTML;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ---------- reveal + triggers ---------- */
  var onVisible = function (el) {
    el.classList.add('in');
    if (el.hasAttribute('data-count')) countUp(el);
    el.querySelectorAll && el.querySelectorAll('[data-count]').forEach(function (c) { if (!c.__c) { c.__c = 1; countUp(c); } });
  };
  var targets = d.querySelectorAll('[data-reveal], .split-words, [data-count], [data-bars], [data-draw]');
  // anything already on screen reveals immediately (no wait for the observer; better LCP)
  var vh = w.innerHeight || root.clientHeight;
  targets = Array.prototype.filter.call(targets, function (t) {
    var r = t.getBoundingClientRect();
    if (r.top < vh * 0.94 && r.bottom > 0) { t.__c = 1; setTimeout(function () { onVisible(t); }, 40); return false; }
    return true;
  });
  if ('IntersectionObserver' in w && !reduce) {
    var ioAlive = false;
    var io = new IntersectionObserver(function (es) {
      ioAlive = true;
      es.forEach(function (e) { if (e.isIntersecting) { if (!e.target.__c) { e.target.__c = 1; onVisible(e.target); } io.unobserve(e.target); } });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (t) { io.observe(t); });
    // failsafe: if the observer never reports (throttled/embedded contexts), never leave content hidden
    setTimeout(function () { if (!ioAlive) targets.forEach(function (t) { if (!t.__c) { t.__c = 1; onVisible(t); } }); }, 2000);
  } else targets.forEach(function (t) { onVisible(t); });

  /* ---------- pointer effects ---------- */
  if (finePointer && !reduce) {
    d.addEventListener('pointermove', function (e) {
      var s = e.target.closest && e.target.closest('.spot');
      if (s) { var r = s.getBoundingClientRect(); s.style.setProperty('--mx', (e.clientX - r.left) + 'px'); s.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
    }, { passive: true });
    d.querySelectorAll('[data-tilt]').forEach(function (el) {
      var max = +(el.getAttribute('data-tilt') || 6);
      el.style.transformStyle = 'preserve-3d';
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * max).toFixed(2) + 'deg) rotateY(' + (x * max).toFixed(2) + 'deg) translateY(-4px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
    d.querySelectorAll('.btn--magnetic').forEach(function (b) {
      b.addEventListener('pointermove', function (e) { var r = b.getBoundingClientRect(); b.style.setProperty('--bx', ((e.clientX - r.left - r.width / 2) * .18).toFixed(1) + 'px'); b.style.setProperty('--by', ((e.clientY - r.top - r.height / 2) * .28).toFixed(1) + 'px'); });
      b.addEventListener('pointerleave', function () { b.style.setProperty('--bx', '0px'); b.style.setProperty('--by', '0px'); });
    });
  }

  /* ---------- marquee: clone track for a seamless loop ---------- */
  d.querySelectorAll('.marquee').forEach(function (m) {
    var t = m.querySelector('.marquee__track'); if (!t || m.__done) return; m.__done = 1;
    var c = t.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.querySelectorAll('a,button').forEach(function (x) { x.tabIndex = -1; }); m.appendChild(c);
  });

  /* ---------- tabs (generic) ---------- */
  d.querySelectorAll('[data-tabs]').forEach(function (g) {
    var tabs = g.querySelectorAll('[role="tab"]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (x) { var on = x === tab; x.setAttribute('aria-selected', on); var p = d.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; });
      });
    });
  });

  /* ---------- lightbox for [data-lightbox] images ---------- */
  var lbItems = d.querySelectorAll('[data-lightbox]');
  if (lbItems.length) {
    var lb = d.createElement('div'); lb.className = 'gp-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML = '<button class="gp-lb__x" aria-label="Close">&times;</button><button class="gp-lb__nav gp-lb__prev" aria-label="Previous">&#8592;</button><figure><img alt=""><figcaption></figcaption></figure><button class="gp-lb__nav gp-lb__next" aria-label="Next">&#8594;</button>';
    d.body.appendChild(lb);
    var list = Array.prototype.slice.call(lbItems), idx = 0, img = lb.querySelector('img'), cap = lb.querySelector('figcaption'), last;
    var show = function (i) { idx = (i + list.length) % list.length; var a = list[idx]; img.src = a.getAttribute('href') || a.querySelector('img').src; img.alt = (a.querySelector('img') || {}).alt || ''; cap.textContent = a.getAttribute('data-caption') || img.alt; };
    var open = function (i) { last = d.activeElement; show(i); lb.classList.add('open'); root.classList.add('gp-lock'); lb.querySelector('.gp-lb__x').focus(); };
    var close = function () { lb.classList.remove('open'); root.classList.remove('gp-lock'); if (last) last.focus(); };
    list.forEach(function (a, i) { a.addEventListener('click', function (e) { e.preventDefault(); open(i); }); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    lb.querySelector('.gp-lb__x').addEventListener('click', close);
    lb.querySelector('.gp-lb__prev').addEventListener('click', function () { show(idx - 1); });
    lb.querySelector('.gp-lb__next').addEventListener('click', function () { show(idx + 1); });
    d.addEventListener('keydown', function (e) { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
  }

  /* ---------- globe ---------- */
  d.querySelectorAll('canvas[data-globe]').forEach(function (cv) { initGlobe(cv); });

  function initGlobe(cv) {
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var DEG = Math.PI / 180, pts = null, W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = Math.min(w.devicePixelRatio || 1, 1.5);
    var hubs = [];
    try { hubs = JSON.parse(cv.getAttribute('data-hubs') || '[]'); } catch (e) {}
    var origin = hubs[0] || { lat: 20.6, lon: 78.9 };
    var baseYaw = -origin.lon * DEG - 0.15, yaw = baseYaw, swayT = 0, tilt = -16 * DEG, dragging = false, lastX = 0, lastY = 0, inertia = 0;
    var ink = cv.getAttribute('data-ink') || '47,93,168', hot = cv.getAttribute('data-hot') || '21,128,122';
    var vec = function (lat, lon, r) { r = r || 1; var la = lat * DEG, lo = lon * DEG; return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)]; };
    // yaw and tilt are the same for every point in a frame, so the four trig calls are done once
    // per frame rather than four times per land dot (there are about 4,200 of them)
    var cyw = 1, syw = 0, ct = 1, st = 0;
    var orient = function () { cyw = Math.cos(yaw); syw = Math.sin(yaw); ct = Math.cos(tilt); st = Math.sin(tilt); };
    var proj = function (v) {
      var x = v[0] * cyw + v[2] * syw, z = -v[0] * syw + v[2] * cyw, y = v[1];
      var y2 = y * ct - z * st, z2 = y * st + z * ct;
      return [cx + x * R, cy - y2 * R, z2, x, y2];
    };
    var hubV = hubs.map(function (h) { return vec(h.lat, h.lon); });
    // great-circle arcs from origin with lift
    var arcs = hubs.slice(1).map(function (h, i) {
      var a = hubV[0], b = hubV[i + 1], dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], om = Math.acos(Math.max(-1, Math.min(1, dot))), so = Math.sin(om) || 1, seg = [], N = 48;
      for (var k = 0; k <= N; k++) {
        var t = k / N, f1 = Math.sin((1 - t) * om) / so, f2 = Math.sin(t * om) / so, lift = 1 + Math.sin(Math.PI * t) * (0.08 + om * 0.09);
        seg.push([(a[0] * f1 + b[0] * f2) * lift, (a[1] * f1 + b[1] * f2) * lift, (a[2] * f1 + b[2] * f2) * lift]);
      }
      return { pts: seg, off: Math.random(), speed: 0.12 + Math.random() * 0.1 };
    });
    // the two background gradients depend only on the geometry, so they are built when the canvas is
    // sized rather than on every frame
    var gAtmos = null, gBody = null;
    var size = function () {
      var r = cv.getBoundingClientRect(); W = r.width; H = r.height; if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.44; cx = W / 2; cy = H / 2;
      gAtmos = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.25);
      gAtmos.addColorStop(0, 'rgba(' + ink + ',0.10)'); gAtmos.addColorStop(0.72, 'rgba(' + ink + ',0.06)'); gAtmos.addColorStop(1, 'rgba(' + ink + ',0)');
      gBody = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
      gBody.addColorStop(0, 'rgba(255,255,255,0.95)'); gBody.addColorStop(1, 'rgba(226,235,248,0.9)');
    };
    var visibleArcPt = function (p) { return p[2] > 0 || (p[3] * p[3] + p[4] * p[4]) > 1; };
    var t0 = performance.now(), running = true, lastT = t0;
    // On phones and low-core machines the globe is drawn once and left still. The sway is a slow
    // 0.16Hz drift that nobody notices on a 390px hero, but animating it keeps the main thread busy
    // for as long as the hero is on screen, which is exactly the window that decides the page's
    // blocking time. Dragging still spins it. Treated the same way as prefers-reduced-motion below.
    var still = reduce || (w.matchMedia && w.matchMedia('(max-width:900px)').matches) || (navigator.hardwareConcurrency || 8) <= 4;
    var frame = function (now) {
      if (!running) return;
      var dt = Math.min(64, now - lastT); lastT = now;
      if (!dragging) {
        // sway around the origin hub (India) so the story stays in view; drag nudges the base
        baseYaw += inertia * dt / 16; inertia *= 0.95;
        swayT += dt / 1000;
        yaw = baseYaw + (reduce ? 0 : Math.sin(swayT * 0.16) * 0.95);
      }
      draw((now - t0) / 1000);
      requestAnimationFrame(frame);
    };
    function draw(time) {
      orient();
      ctx.clearRect(0, 0, W, H);
      // atmosphere
      ctx.fillStyle = gAtmos; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 7); ctx.fill();
      // sphere body
      ctx.fillStyle = gBody; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(' + ink + ',0.16)'; ctx.lineWidth = 1; ctx.stroke();
      // land dots
      if (pts) {
        // batch dots into depth buckets: one path + fill per bucket
        var s = Math.max(1.4, R / 125), B = 6, paths = [];
        for (var b = 0; b < B; b++) paths.push(new Path2D());
        // the projection is written out here instead of calling proj(), which would allocate an
        // array per dot: 4,200 short-lived arrays a frame is enough garbage to show up in a profile
        for (var i = 0; i < pts.length; i++) {
          var v = pts[i], z = -v[0] * syw + v[2] * cyw, dz = v[1] * st + z * ct;
          if (dz <= 0) continue;
          var dx = cx + (v[0] * cyw + v[2] * syw) * R, dy = cy - (v[1] * ct - z * st) * R;
          var k = Math.min(B - 1, (dz * B) | 0), rr = s * (0.55 + dz * 0.45) / 2 + 0.3;
          paths[k].moveTo(dx + rr, dy); paths[k].arc(dx, dy, rr, 0, 6.2832);
        }
        for (b = 0; b < B; b++) { ctx.fillStyle = 'rgba(' + ink + ',' + (0.28 + ((b + .5) / B) * 0.62).toFixed(3) + ')'; ctx.fill(paths[b]); }
      }
      // arcs
      arcs.forEach(function (a, ai) {
        var P = a.pts.map(proj), head = ((time * a.speed + a.off) % 1.4);
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(' + ink + ',0.22)'; ctx.beginPath();
        var pen = false;
        for (var k = 0; k < P.length; k++) { var q = P[k]; if (visibleArcPt(q)) { pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; } else pen = false; }
        ctx.stroke();
        // travelling pulse
        var hi = Math.floor(Math.min(1, head) * (P.length - 1));
        for (var j = Math.max(0, hi - 10); j <= hi; j++) {
          var q2 = P[j]; if (!visibleArcPt(q2)) continue; var al = 1 - (hi - j) / 10;
          ctx.fillStyle = 'rgba(' + hot + ',' + (al * 0.9).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(q2[0], q2[1], 1.2 + al * 1.6, 0, 7); ctx.fill();
        }
      });
      // hubs
      ctx.font = '600 12px Manrope, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      hubs.forEach(function (h, i) {
        var p = proj(hubV[i]); if (p[2] <= 0.05) return;
        var big = i === 0, r = big ? 5.5 : 3.6, pulse = (time * 0.8 + i * 0.37) % 1;
        ctx.strokeStyle = 'rgba(' + (big ? hot : ink) + ',' + (0.55 * (1 - pulse)).toFixed(2) + ')'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], r + pulse * (big ? 20 : 12), 0, 7); ctx.stroke();
        ctx.fillStyle = big ? 'rgb(' + hot + ')' : 'rgb(' + ink + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.38, 0, 7); ctx.fill();
        if (h.label && p[2] > 0.25 && W > 360) {
          var txt = h.label, tw = ctx.measureText(txt).width, lx = p[0] + r + 8, ly = p[1];
          ctx.globalAlpha = Math.min(1, (p[2] - 0.25) * 3);
          ctx.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(lx - 6, ly - 11, tw + 12, 22, 11); ctx.fill();
          ctx.strokeStyle = 'rgba(11,23,51,0.10)'; ctx.stroke();
          ctx.fillStyle = '#0B1733'; ctx.fillText(txt, lx, ly + 0.5); ctx.globalAlpha = 1;
        }
      });
    }
    function roundRect(x, y, w2, h2, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w2, y, x + w2, y + h2, r); ctx.arcTo(x + w2, y + h2, x, y + h2, r); ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w2, y, r); ctx.closePath(); }
    // drag to spin
    cv.style.touchAction = 'pan-y'; cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', function (e) {
      if (!dragging) return; var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      baseYaw += dx * 0.006; yaw += dx * 0.006; tilt = Math.max(-1.1, Math.min(1.1, tilt + dy * 0.004)); inertia = dx * 0.0008; if (still) draw(0);
    });
    var end = function () { dragging = false; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    size(); w.addEventListener('resize', function () { size(); if (still) draw(0); });
    fetch(cv.getAttribute('data-globe')).then(function (r) { return r.json(); }).then(function (flat) {
      pts = []; for (var i = 0; i < flat.length; i += 2) pts.push(vec(flat[i + 1], flat[i]));
      if (still) { draw(0); return; }
      if ('IntersectionObserver' in w) {
        new IntersectionObserver(function (es) { es.forEach(function (e) { var was = running; running = e.isIntersecting; if (running && !was) { lastT = performance.now(); requestAnimationFrame(frame); } }); }).observe(cv);
      }
      requestAnimationFrame(frame);
    }).catch(function () { draw(0); });
  }
})();
