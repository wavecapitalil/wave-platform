/* Light rings that never stop (11/10/2026, Yogi: "they must keep turning while I scroll, and the site must be smooth").
   Same look as the old ::before/::after rings (a conic point of light on a 1.5px frame + a soft blurred halo), but the
   conic gradient is now drawn ONCE on an inner square and only that square is rotated with a CSS transform. A transform
   animation runs on the GPU compositor, so turning costs no repaint: the rings spin all the time, scroll or not.
   Every ring shares one clock (same speed, direction and phase). CSS: .orb in the page / legal.css. */
(function () {
  var SEL = '.btn,.hd__menu,.x,.fab,.by';
  function add(el) {
    if (el.__orb) return; el.__orb = true;
    ['orb', 'orb orb--glow'].forEach(function (c) {
      var s = document.createElement('span'); s.className = c; s.setAttribute('aria-hidden', 'true');
      s.appendChild(document.createElement('i')); el.appendChild(s);
    });
  }
  function sync() {
    if (!document.getAnimations || !document.timeline) return;
    var now = document.timeline.currentTime; if (now == null) return;
    document.getAnimations().forEach(function (a) { if (a.animationName === 'orb-spin') { try { a.currentTime = now % 3600; } catch (e) {} } });
  }
  function run() {
    [].forEach.call(document.querySelectorAll(SEL), add);
    requestAnimationFrame(sync);
  }
  // the floating a11y / theme buttons are created by their own scripts, so run after them
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else setTimeout(run, 0);
  addEventListener('load', function () { setTimeout(sync, 60); });
})();
