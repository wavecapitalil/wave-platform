/* Wave Capital — page behaviour. The film itself lives in film-engine.js + film-tiers.js (never plays, only follows the scroll). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.__a11yStill, still = !!window.__heroStill, mobile = !!window.__filmMobile;
  var narrow = matchMedia('(max-width: 860px)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var fmt = function (v, dec) { return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); };
  gsap.registerPlugin(ScrollTrigger);

  var lenis = null;
  // iOS: the toolbar collapsing mid-scroll fires resize; don't re-lay-out every scroll animation for it
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (!reduced) { lenis = new Lenis({ lerp: 0.09, smoothWheel: true }); lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(function (t) { lenis.raf(t * 1000); }); gsap.ticker.lagSmoothing(0); }

  /* ---------- dialog + nav ---------- */
  var dlg = $('#talk'), sheet = $('#sheetnav'), menuBtn = $('.hd__menu');
  function closeSheet() { sheet.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function () { var o = sheet.classList.toggle('is-open'); menuBtn.setAttribute('aria-expanded', o); });
  $$('[data-talk]').forEach(function (el) { el.addEventListener('click', function (e) { e.preventDefault(); closeSheet(); if (dlg.showModal) dlg.showModal(); if (lenis) lenis.stop(); }); });
  dlg.addEventListener('close', function () { if (lenis) lenis.start(); });
  $('[data-close]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $$('a[href^="#"]:not([data-talk])').forEach(function (a) {
    a.addEventListener('click', function (e) { var id = a.getAttribute('href'); if (id.length < 2 || id.charAt(0) !== '#') return; var el = $(id); if (!el) return; e.preventDefault(); closeSheet();
      if (lenis) lenis.scrollTo(el, { duration: 1.4 }); else el.scrollIntoView({ behavior: 'smooth' }); });
  });

  /* ---------- hero film ---------- */
  var hero = $('.hero'), video = $('.hero__film'), poster = $('.hero__poster'), fade = $('.hero__fade'), cue = $('.cue'), load = $('.hero__load'), loadBar = $('.hero__load i');
  var hd = $('#hd'), depth = $('#depth'), hws = $$('.h1 .hw');
  var beats = $$('.beat').map(function (el) { return { el: el, a: +el.dataset.in, p: +el.dataset.peak, o: +el.dataset.out }; });
  function beatAlpha(b, p) { if (p < b.a || p > b.o) return 0; if (p < b.p) return (p - b.a) / Math.max(1e-4, b.p - b.a); if (b.o > 1.5) return 1; return 1 - (p - b.p) / Math.max(1e-4, b.o - b.p); }
  function paint(p) {
    beats.forEach(function (b) { var a = beatAlpha(b, p); b.el.style.opacity = a.toFixed(3); b.el.style.transform = 'translateY(' + ((1 - a) * 22).toFixed(1) + 'px)'; b.el.style.pointerEvents = a > 0.6 ? 'auto' : 'none'; });
    hws.forEach(function (w, i) { var a = clamp((p - (0.74 + i * 0.035)) / 0.09, 0, 1), e = 1 - Math.pow(1 - a, 3); w.style.opacity = e.toFixed(3); w.style.transform = 'translateY(' + ((1 - e) * 0.5).toFixed(3) + 'em) rotate(' + ((1 - e) * 3).toFixed(2) + 'deg)'; });
    fade.style.opacity = clamp((p - 0.7) / 0.3, 0, 1).toFixed(3);
    cue.style.opacity = p > 0.03 ? 0 : 1;
    if (depth) depth.textContent = fmt(clamp((p - 0.12) / 0.6, 0, 1) * 12, 1).padStart(4, '0');
    hd.classList.toggle('is-hidden', p < 0.7);
  }
  if (still || reduced) { paint(still ? 1 : 1); hd.classList.remove('is-hidden'); if (still) window.__ready = true; }
  if (!still) {
    filmEngine.start({ video: video, hero: hero, poster: poster, fast: window.__filmFast,
      sharp: mobile ? [{ src: 'assets/film/wc-1010c-m-hq.mp4', gop: false }] : [{ src: 'assets/film/wc-0918-d-hq.mp4', gop: false }],
      onLoad: function (f) { loadBar.style.width = (f * 100).toFixed(0) + '%'; }, onReady: function () { load.classList.add('is-done'); },
      onProgress: function (p) { if (!reduced) paint(p); } });
    if (!reduced) paint(0);
  }
  ScrollTrigger.create({ trigger: '#lead', start: 'top 60%', onEnter: function () { hd.classList.add('is-solid'); }, onLeaveBack: function () { hd.classList.remove('is-solid'); } });

  /* ---------- helpers: scroll-tied numbers and line drawing ---------- */
  function ticks(root) { return $$('.tick', root).map(function (n) { return { n: n, a: +n.dataset.from, b: +n.dataset.to, d: +(n.dataset.dec || 0) }; }); }
  function setTicks(list, t) { list.forEach(function (k) { k.n.textContent = fmt(k.a + (k.b - k.a) * t, k.d); }); }
  function prepDraw(root) { return $$('.draw', root).map(function (p) { var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = reduced ? 0 : L; return { p: p, L: L }; }); }
  function setDraw(list, t) { list.forEach(function (d) { d.p.style.strokeDashoffset = (d.L * (1 - t)).toFixed(1); }); }

  /* ---------- headings assemble word by word, tied to the scroll ---------- */
  function splitWords(el) {
    var out = [];
    [].slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) { node.textContent.split(/(\s+)/).forEach(function (t) { if (!t) return; if (/^\s+$/.test(t)) { out.push(document.createTextNode(' ')); return; } var w = document.createElement('span'); w.className = 'w'; var i = document.createElement('i'); i.textContent = t; w.appendChild(i); out.push(w); }); }
      else { var w2 = document.createElement('span'); w2.className = 'w'; var i2 = document.createElement('i'); i2.appendChild(node.cloneNode(true)); w2.appendChild(i2); out.push(w2); }
    });
    el.textContent = ''; out.forEach(function (n) { el.appendChild(n); });
    return $$('.w > i', el);
  }
  if (!reduced) $$('.rise').forEach(function (h) {
    var ws = splitWords(h);
    gsap.fromTo(ws, { yPercent: 115, rotate: 7, opacity: 0 }, { yPercent: 0, rotate: 0, opacity: 1, ease: 'power2.out', stagger: 0.12,
      scrollTrigger: { trigger: h, start: 'top 92%', end: 'top 48%', scrub: 0.7 } });
  });

  /* ---------- lead: manifesto reveal, glass card straightens, numbers follow the scroll ---------- */
  var rev = $('.mani');
  if (rev && !reduced) {
    var parts = [];
    [].slice.call(rev.childNodes).forEach(function (node) {
      var cls = node.nodeType === 1 ? ' key' : '';
      node.textContent.trim().split(/\s+/).forEach(function (t) { if (t) parts.push('<span class="rw' + cls + '">' + t + '</span>'); });
    });
    rev.innerHTML = parts.join(' ');
    gsap.fromTo('.mani .rw', { opacity: 0.16 }, { opacity: 1, stagger: 0.08, ease: 'none', scrollTrigger: { trigger: rev, start: 'top 80%', end: 'bottom 45%', scrub: 0.5 } });
  }
  var glass = $('#glass'), gT = ticks(glass), gD = prepDraw(glass);
  if (!reduced) {
    gsap.fromTo(glass, { rotate: narrow ? -3 : -7, y: 90, scale: 0.92 }, { rotate: 0, y: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: glass, start: 'top 95%', end: 'top 35%', scrub: 0.8 } });
    ScrollTrigger.create({ trigger: glass, start: 'top 85%', end: 'top 20%', scrub: true, onUpdate: function (s) { setTicks(gT, s.progress); setDraw(gD, s.progress); } });
  } else { setTicks(gT, 1); }

  /* the dot sea: a field of points that rolls like water, only while it is on screen */
  (function sea() {
    var c = $('.lead__sea'); if (!c || reduced) return;
    var g = c.getContext('2d'), W = 0, H = 0, dpr = Math.min(1.5, devicePixelRatio || 1), on = false, t0 = performance.now(), last = 0;
    function size() { W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function draw(now) {
      if (!on) return; requestAnimationFrame(draw);
      if (now - last < 33) return; last = now;
      var t = (now - t0) / 1000, gap = narrow ? 22 : 26, rows = Math.ceil(H * 0.62 / gap), cols = Math.ceil(W / gap) + 1;
      g.clearRect(0, 0, W, H);
      for (var r = 0; r < rows; r++) {
        var depthK = r / rows, y0 = H * 0.4 + r * gap;
        for (var i = 0; i < cols; i++) {
          var x = i * gap, k = Math.sin(x * 0.011 + t * 0.9 + r * 0.35) + Math.sin(x * 0.004 - t * 0.5 + r * 0.2) * 0.8;
          var y = y0 + k * (6 + depthK * 12), a = clamp(0.1 + (k + 1.8) / 3.6 * 0.55, 0, 0.7) * (0.35 + depthK * 0.65);
          g.fillStyle = 'rgba(111,178,255,' + a.toFixed(3) + ')'; g.fillRect(x, y, 1.6 + depthK, 1.6 + depthK);
        }
      }
    }
    size(); addEventListener('resize', size);
    new IntersectionObserver(function (e) { var v = e[0].isIntersecting; if (v && !on) { on = true; requestAnimationFrame(draw); } else if (!v) on = false; }).observe(c);
  })();

  /* ---------- advisory: the card rises, the four topics follow one by one ---------- */
  if (!reduced) {
    gsap.fromTo('#advcard', { y: 90, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#advcard', start: 'top 98%', end: 'top 55%', scrub: 0.7 } });
    $$('.adv__topics li').forEach(function (li, i) {
      gsap.fromTo(li, { y: 40, opacity: 0 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#advcard', start: 'top ' + (88 - i * 6) + '%', end: 'top ' + (52 - i * 6) + '%', scrub: 0.6 } });
    });
  }

  /* ---------- terminal: a tilted stack of tiles spreads into the board; every number follows the scroll ---------- */
  var board = $('#board'), bT = ticks(board), bD = prepDraw(board);
  if (!reduced) {
    var k = narrow ? 0.35 : 1;
    $$('.tile', board).forEach(function (t) {
      gsap.fromTo(t, { x: +t.dataset.x * k, y: +t.dataset.y + 60, rotate: +t.dataset.r, scale: 0.86, opacity: 0.0 }, { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, ease: 'power1.out',
        scrollTrigger: { trigger: board, start: 'top 96%', end: 'top 22%', scrub: 0.9 } });
    });
    ScrollTrigger.create({ trigger: board, start: 'top 80%', end: 'bottom 70%', scrub: true, onUpdate: function (s) { setTicks(bT, s.progress); setDraw(bD, s.progress); } });
    gsap.to('.ghost', { xPercent: -12, ease: 'none', scrollTrigger: { trigger: '.term', start: 'top bottom', end: 'bottom top', scrub: true } });
  } else { setTicks(bT, 1); }
  board.addEventListener('pointermove', function (e) { $$('.tile', board).forEach(function (t) { var r = t.getBoundingClientRect(); t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px'); }); });

  /* ---------- about values, closing chips, footer echo ---------- */
  if (!reduced) {
    gsap.fromTo('#leadbox', { y: 90, rotate: -4, scale: 0.94 }, { y: 0, rotate: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: '#leadbox', start: 'top 98%', end: 'top 50%', scrub: 0.7 } });
    // the philosophy card rises, the wave and the icons draw themselves, the four values follow one by one
    var pD = $$('#phil .pdraw').map(function (p) { var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; return { p: p, L: L }; });
    gsap.fromTo('#phil', { y: 90, rotate: -2, scale: 0.95, opacity: 0 }, { y: 0, rotate: 0, scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#phil', start: 'top 98%', end: 'top 50%', scrub: 0.7 } });
    $$('.phil__vals li').forEach(function (li, i) {
      gsap.fromTo(li, { y: 30, opacity: 0 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#phil', start: 'top ' + (80 - i * 5) + '%', end: 'top ' + (45 - i * 5) + '%', scrub: 0.6 } });
    });
    ScrollTrigger.create({ trigger: '#phil', start: 'top 85%', end: 'top 30%', scrub: true, onUpdate: function (s) { setDraw(pD, s.progress); } });
    $$('.chip').forEach(function (c, i) { gsap.to(c, { yPercent: narrow ? [-35, 0, 0, -35][i] : [-160, 120, -110, 170][i], rotate: [8, -10, -7, 9][i], scale: narrow ? 0.82 : 1, ease: 'none', scrollTrigger: { trigger: '.end', start: 'top bottom', end: 'bottom top', scrub: true } }); });
  }

  /* magnetic buttons */
  if (matchMedia('(hover:hover)').matches) $$('.magnet').forEach(function (b) {
    b.addEventListener('pointermove', function (e) { var r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); gsap.to(b, { x: dx * 0.3, y: dy * 0.3, duration: 0.4, ease: 'power3.out' }); });
    b.addEventListener('pointerleave', function () { gsap.to(b, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,.5)' }); });
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
