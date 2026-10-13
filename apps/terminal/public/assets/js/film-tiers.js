/* =============================================================================
   film-tiers.js — the phone film in tiers (10/09/2026, shared by all yogiweb sites)
   -----------------------------------------------------------------------------
   Why: on a cold first visit the sharp phone film (7–25MB) took many seconds to arrive, and the old
   blob upgrade only ever swapped while the film still sat on frame 0 — a visitor who scrolled early
   stayed on progressive network seeks for the whole visit (= the stutter people saw).
   How: the page's <head> starts downloading a SMALL "fast" film at parse time; the engine gives it to
   the <video> as a blob (every seek served from memory, never a network stall), so the scrub works
   within a second or two. The sharper tiers are fetched one after another behind it (never two
   downloads in parallel) and swapped in at ANY scroll position: the frame on screen is frozen on a
   canvas over the video while the new source seeks to the same time, so the swap is invisible.
   A tier with `minMbps` is only fetched when the previous download measured at least that speed —
   a 25MB film is not pulled over a 10Mbps link where a 720p tier already looks right.
   Nothing here ever plays the film.
   USAGE
     filmTiers.fast(video, fetchPromiseOrUrl, { gop: true, onReady(){} })  — the first tier as a blob
     filmTiers.upgrade(video, { tiers: [{ src, gop, minMbps, maxMbps }], onProgress(0..1){}, onSwap(t){} })
   minMbps / maxMbps skip a tier that does not fit the measured link speed (e.g. 1440p only above 25Mbps, 1080p only below).
   `gop: true` marks a tier that is not all-intra: the engines seek it with currentTime (exact) instead
   of fastSeek (nearest keyframe). The flag lives on video.dataset.gop.
   ========================================================================== */
(function () {
  function fetchBlob(src, prog) {
    var t0 = Date.now(), p = (src && typeof src.then === 'function') ? src : fetch(src);
    return p.then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var total = +r.headers.get('Content-Length') || 0;
      if (!r.body || !r.body.getReader) return r.blob().then(function (b) { return { blob: b, mbps: total ? (total * 8 / 1e6) / Math.max(0.05, (Date.now() - t0) / 1000) : 0 }; });
      var rd = r.body.getReader(), chunks = [], got = 0, last = 0;
      return (function pump() {
        return rd.read().then(function (x) {
          if (x.done) { if (prog) prog(1); return { blob: new Blob(chunks, { type: 'video/mp4' }), mbps: (got * 8 / 1e6) / Math.max(0.05, (Date.now() - t0) / 1000) }; }
          chunks.push(x.value); got += x.value.length;
          var now = Date.now(); if (prog && total && now - last > 150) { last = now; prog(got / total); }
          return pump();
        });
      })();
    });
  }

  /* swap the <video>'s source at the current time without a visible flash */
  function swapSrc(v, url, gop, onSwap) {
    var t = v.currentTime || 0, mask = null, parent = v.parentElement;
    if (parent && v.readyState >= 2 && v.videoWidth) {
      try {
        mask = document.createElement('canvas');
        mask.width = v.videoWidth; mask.height = v.videoHeight;
        mask.getContext('2d').drawImage(v, 0, 0, mask.width, mask.height);
        var cs = getComputedStyle(v), z = parseInt(cs.zIndex, 10);
        mask.style.cssText = 'position:absolute;top:' + v.offsetTop + 'px;left:' + v.offsetLeft + 'px;width:' + v.offsetWidth + 'px;height:' + v.offsetHeight + 'px;object-fit:' + (cs.objectFit || 'cover') + ';object-position:' + (cs.objectPosition || '50% 50%') + ';pointer-events:none' + (isNaN(z) ? '' : ';z-index:' + z);
        mask.setAttribute('aria-hidden', 'true');
        parent.insertBefore(mask, v.nextSibling);
      } catch (e) { mask = null; }
    }
    var done = false;
    var finish = function () { if (done) return; done = true; if (mask && mask.parentNode) mask.parentNode.removeChild(mask); };
    var onSeeked = function () { v.removeEventListener('seeked', onSeeked); requestAnimationFrame(function () { requestAnimationFrame(finish); }); };
    var onMeta = function () {
      v.removeEventListener('loadedmetadata', onMeta);
      v.addEventListener('seeked', onSeeked);
      try { v.currentTime = Math.max(0, Math.min(t, (isFinite(v.duration) ? v.duration : t + 1) - 0.04)); } catch (e) { finish(); }
    };
    v.addEventListener('loadedmetadata', onMeta);
    if (gop) v.dataset.gop = '1'; else delete v.dataset.gop;
    v.src = url; try { v.load(); } catch (e) {}
    try { if (onSwap) onSwap(t); } catch (e) {}
    setTimeout(finish, 2000);   // insurance: never leave the frozen frame on screen
  }

  /* first tier: the small film, from the fetch the <head> already started, as a blob */
  function fast(v, src, o) {
    o = o || {};
    if (o.gop) v.dataset.gop = '1'; else delete v.dataset.gop;
    return fetchBlob(src, o.onProgress).then(function (r) {
      v.preload = 'auto';   // only now: preload=auto on an element whose markup src is the desktop film would start that download
      v.src = URL.createObjectURL(r.blob); try { v.load(); } catch (e) {}
      if (o.onReady) o.onReady(r.mbps);
      return r.mbps;
    }).catch(function () {
      // network trouble: fall back to plain progressive loading of the same file
      try { v.src = typeof src === 'string' ? src : (o.fallback || ''); v.preload = 'auto'; v.load(); } catch (e) {}
      return 0;
    });
  }

  /* the sharper tiers, one after another, each swapped in wherever the visitor is */
  function upgrade(v, o) {
    o = o || {};
    var tiers = (o.tiers || []).slice(), state = { swaps: 0, cancelled: false, cancel: function () { state.cancelled = true; } };
    var mbps = o.mbps || 0;
    (function next() {
      var tier = tiers.shift();
      if (!tier || state.cancelled) return;
      if ((tier.minMbps && mbps && mbps < tier.minMbps) || (tier.maxMbps && mbps && mbps > tier.maxMbps)) return next();   // not for this link speed: skip to the next tier
      fetchBlob(tier.src, o.onProgress).then(function (r) {
        if (state.cancelled) return;
        mbps = r.mbps;
        swapSrc(v, URL.createObjectURL(r.blob), !!tier.gop, o.onSwap);
        state.swaps++;
        next();
      }).catch(function () {});
    })();
    return state;
  }

  /* NO play(), ever (Yogi, 05/09 + 10/09/2026: every play() the engines made "to unlock iOS painting" was seen on his iPhone as the
     film running by itself). A blob source at readyState 4 paints seeks on modern iOS without ever playing. As insurance, after the
     visitor's FIRST real scroll we compare pixels of frame 0 and the frame the scroll landed on; only if the picture did not change do we
     run one play()+pause() in the same synchronous call — Safari aborts such a play before a single frame is shown. */
  function ensurePaints(v) {
    var base = null, done = false;
    var grab = function () { try { var c = document.createElement('canvas'); c.width = 24; c.height = 24; var g = c.getContext('2d'); g.drawImage(v, 0, 0, 24, 24); return g.getImageData(0, 0, 24, 24).data; } catch (e) { return null; } };
    var onSeeked = function () {
      if (done) return;
      if (base === null) { if (v.currentTime < 0.05 && v.readyState >= 2) base = grab(); return; }
      if (v.currentTime < 0.5) return;
      var now = grab(); if (!base || !now) { done = true; return; }
      var d = 0; for (var i = 0; i < now.length; i += 4) d += Math.abs(now[i] - base[i]) + Math.abs(now[i + 1] - base[i + 1]) + Math.abs(now[i + 2] - base[i + 2]);
      done = true; v.removeEventListener('seeked', onSeeked);
      if (d / (24 * 24) < 2) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); v.pause(); } catch (e) {} }
    };
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('loadeddata', function () { base = null; }, false);   // a new source (tier swap) = a new baseline
  }
  /* the hard rule, attachable by any engine: whatever starts playing is paused on the spot and snapped back to the scroll position */
  function neverPlay(v, onSnap, allow) {
    var stop = function () { if (allow && allow()) return; try { v.pause(); } catch (e) {} if (onSnap) { try { onSnap(); } catch (e) {} } };
    v.addEventListener('play', stop); v.addEventListener('playing', stop);
    v.addEventListener('timeupdate', function () { if (!v.paused) stop(); });
  }
  if (typeof window !== 'undefined') window.filmTiers = { fast: fast, upgrade: upgrade, fetchBlob: fetchBlob, swapSrc: swapSrc, ensurePaints: ensurePaints, neverPlay: neverPlay };
})();
