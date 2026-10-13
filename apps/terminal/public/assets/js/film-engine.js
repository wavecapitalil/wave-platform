/* =============================================================================
   film-engine.js — scroll-scrubbed <video> hero for the smoothie-bar sites (11/09/2026)
   -----------------------------------------------------------------------------
   Yogi's film rules (CLAUDE.md, 10/09/2026) decide the architecture, not the skill:
   the guard's coldphone.js / selfplay.js judge a <video> element (currentTime vs scroll,
   seek stalls, first decodable frame), so the film IS a <video>, scrubbed by currentTime,
   served in tiers by film-tiers.js (fast blob first, sharp tiers swapped behind).
     • never play(): filmTiers.neverPlay snaps anything that starts playing back to the scroll.
     • the hero is `section.hero` — the selector the lab picks — and film time is a LINEAR
       function of the hero's scroll span (expected = y/H × duration), so the lab's lag test
       and the visitor's finger agree.
     • Android (html.hero-still, decided in <head>) gets one sharp still and no video at all.
   USAGE (one call, after film-tiers.js):
     filmEngine.start({
       video: HTMLVideoElement, hero: Element, poster: HTMLImageElement|null,
       fast: Promise|string (the <head> fetch), sharp: [{src, gop, minMbps, maxMbps}],
       onProgress(p, t){}   // p = 0..1 over the hero span; called every frame
       onLoad(frac){}        // fast-tier download 0..1 (progress bar)
       onReady(){}           // first frame decodable
     });
   Dev contract for the screenshot harness: ?jump=<scrollY> lands pre-scrolled (instant, only
   before any user input — Yogi 05/09: no programmatic scroll after the first touch) and
   window.__ready = true once the film can paint.
   ========================================================================== */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.__a11yStill;

  function start(o) {
    var v = o.video, hero = o.hero, poster = o.poster || null;
    var dur = 0, target = 0, shown = -1, seeking = false, pending = null, ready = false, userTouched = false;
    var H = 1, lastP = -1, rafOn = false, ease = 0.32;

    function measure() { H = Math.max(1, hero.offsetHeight - innerHeight); }
    function progress() {
      var r = hero.getBoundingClientRect();
      return Math.max(0, Math.min(1, -r.top / H));
    }
    /* one seek in flight at a time; the newest target always wins */
    function seek(t) {
      if (!ready || !dur) return;
      t = Math.max(0, Math.min(dur - 0.04, t));
      if (seeking) { pending = t; return; }
      if (Math.abs(t - shown) < 0.012) return;
      seeking = true; shown = t;
      try {
        if (v.dataset.gop || typeof v.fastSeek !== 'function') v.currentTime = t; else v.fastSeek(t);
      } catch (e) { seeking = false; }
    }
    v.addEventListener('seeked', function () {
      seeking = false;
      if (pending !== null) { var t = pending; pending = null; seek(t); }
    });
    v.addEventListener('error', function () { seeking = false; });
    /* the whole rule in one line: whatever plays is paused and snapped back to the scroll */
    if (window.filmTiers && filmTiers.neverPlay) filmTiers.neverPlay(v, function () { shown = -1; seeking = false; seek(target); });
    if (window.filmTiers && filmTiers.ensurePaints) filmTiers.ensurePaints(v);

    var cur = 0;
    function tick() {
      var p = progress();
      if (dur) {
        var want = p * dur;
        // short lerp for butter, but never more than ~0.3s behind the finger (lab: maxLag < 1.5s)
        cur += (want - cur) * ease;
        if (Math.abs(want - cur) < 0.01 || Math.abs(want - cur) > 0.6) cur = want;
        target = want;
        seek(cur);
      }
      if (p !== lastP) { lastP = p; if (o.onProgress) o.onProgress(p, dur ? p * dur : 0); }
      if (rafOn) requestAnimationFrame(tick);
    }
    function scheduleTick() { if (!rafOn) { rafOn = true; requestAnimationFrame(tick); } }

    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      addEventListener(ev, function () { userTouched = true; }, { passive: true, once: true });
    });
    // re-measure on real resizes only: iOS fires resize when its toolbar collapses mid-scroll, and re-measuring then
    // nudges the film a few frames (a visible hitch). Width changes and big height changes (rotation) still re-measure.
    var lastW = innerWidth, lastH = innerHeight;
    addEventListener('resize', function () { if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 160) { lastW = innerWidth; lastH = innerHeight; measure(); } });
    measure();

    function onFirstFrame() {
      if (ready) return; ready = true;
      if (poster) poster.classList.add('is-gone');
      if (o.onReady) o.onReady();
      var J = new URLSearchParams(location.search).get('jump');
      if (J !== null && !userTouched) { history.scrollRestoration = 'manual'; scrollTo({ top: +J || 0, behavior: 'instant' }); }
      measure(); cur = progress() * dur; shown = -1; seek(cur);
      requestAnimationFrame(function () { window.__ready = true; });
    }
    v.addEventListener('loadedmetadata', function () { if (isFinite(v.duration) && v.duration > 0) dur = v.duration; measure(); });
    v.addEventListener('loadeddata', function () { if (v.readyState >= 2 && v.videoWidth) onFirstFrame(); });
    v.addEventListener('canplay', function () { if (v.videoWidth) onFirstFrame(); });

    if (reduced) {   // reduced motion: first frame only, no scrubbing, page still works
      window.__ready = true; if (poster) poster.classList.remove('is-gone');
    } else {
      scheduleTick();
      if (window.filmTiers) {
        filmTiers.fast(v, o.fast, { gop: true, onProgress: o.onLoad, onReady: function (mbps) {
          if (o.sharp && o.sharp.length) filmTiers.upgrade(v, { tiers: o.sharp, mbps: mbps, onSwap: function () { shown = -1; seeking = false; } });
        } });
      } else { v.src = typeof o.fast === 'string' ? o.fast : ''; v.preload = 'auto'; v.load(); }
    }
    return { progress: progress, measure: measure, video: v };
  }
  window.filmEngine = { start: start };
})();
