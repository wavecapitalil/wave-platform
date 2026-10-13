/* Light / dark switch. The choice lives in localStorage; the class is set in <head> before paint. */
(function () {
  var T = window.WC_T || function (s) { return s; };
  var KEY = 'wc-theme', root = document.documentElement;
  function isLight() { return root.classList.contains('light'); }
  function meta() { var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', isLight() ? '#F3F6FB' : '#03070D'); }
  var css = '.theme-btn{position:fixed;z-index:60;bottom:18px;left:80px;width:52px;height:52px;border-radius:50%;background:#0b1830;border:1px solid rgba(111,178,255,.5);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}' +
    '.theme-btn svg{width:24px;height:24px}.theme-btn .moon{display:none}.light .theme-btn .sun{display:none}.light .theme-btn .moon{display:block}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  function build() {
    var b = document.createElement('button'); b.className = 'theme-btn fab'; b.type = 'button';
    b.innerHTML = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></svg>' +
      '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z"/></svg>';
    function sync() { b.setAttribute('aria-pressed', isLight()); b.setAttribute('aria-label', T(isLight() ? 'מעבר לתצוגה כהה' : 'מעבר לתצוגה בהירה')); b.title = T(isLight() ? 'תצוגה כהה' : 'תצוגה בהירה'); meta(); }
    b.addEventListener('click', function () { root.classList.toggle('light'); try { localStorage.setItem(KEY, isLight() ? 'light' : 'dark'); } catch (e) {} sync(); });
    document.body.appendChild(b); sync();
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
