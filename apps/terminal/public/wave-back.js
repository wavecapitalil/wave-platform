/* Wave Capital: "back to the home page" bar for the platform pages (terminal, university, account, blog, products).
   Add ONE line before </body>:  <script src="wave-back.js" defer></script>
   13/10 (Yogi): a clear bar at the very top of every platform page, on every screen size, that stays in view.
   It links to index.html (the opener), which then lands on "יתרון מחקרי. ביצוע שיטתי." (see site.js).
   Follows the platform language (localStorage 'wc_lang', Hebrew by default). Only shifts the pages' own top bars down. */
(function () {
  if (document.getElementById('wave-back')) return;
  var he = true; try { he = (localStorage.getItem('wc_lang') || 'he') === 'he'; } catch (e) {}
  var H = 44;

  var bar = document.createElement('div'); bar.id = 'wave-back';
  var a = document.createElement('a'); a.href = 'index.html';
  var ar = document.createElement('span'); ar.className = 'wb-arr'; ar.setAttribute('aria-hidden', 'true');
  var tx = document.createElement('span');
  var br = document.createElement('span'); br.className = 'wb-brand'; br.textContent = 'Wave Capital';
  a.appendChild(ar); a.appendChild(tx); a.appendChild(br); bar.appendChild(a);
  function render(isHe) {
    bar.dir = isHe ? 'rtl' : 'ltr'; ar.textContent = isHe ? '→' : '←'; tx.textContent = isHe ? 'חזרה לדף הבית' : 'Back to home';
    a.setAttribute('aria-label', isHe ? 'חזרה לדף הבית של Wave Capital' : 'Back to the Wave Capital home page');
  }
  render(he);
  // the platform's language button (i18n.js) calls window.onLangChange; chain onto it like the terminal's own modules do
  var prevLang = window.onLangChange;
  window.onLangChange = function (l) { if (typeof prevLang === 'function') prevLang(l); render(l === 'he'); };

  var s = document.createElement('style');
  s.textContent =
    '#wave-back{position:sticky;top:0;z-index:95;flex:0 0 auto;box-sizing:border-box;height:' + H + 'px;width:100%;display:flex;align-items:center;justify-content:center;' +
    'background:linear-gradient(90deg,#040b16,#0a1a31 50%,#040b16);border-bottom:1px solid rgba(111,178,255,.22);font:600 13.5px/1 "IBM Plex Sans Hebrew",system-ui,-apple-system,sans-serif}' +
    '#wave-back a{display:inline-flex;align-items:center;gap:9px;height:30px;padding:0 16px;border-radius:999px;color:#E9EFF7;text-decoration:none;' +
    'border:1px solid rgba(111,178,255,.5);background:rgba(47,128,255,.10);transition:background .25s,border-color .25s;-webkit-tap-highlight-color:transparent}' +
    '#wave-back a:hover,#wave-back a:focus-visible{background:rgba(47,128,255,.22);border-color:#6FB2FF}' +
    '#wave-back a:focus-visible{outline:2px solid #6FB2FF;outline-offset:2px}' +
    '#wave-back .wb-arr{color:#6FB2FF;font-size:15px}' +
    '#wave-back .wb-brand{color:rgba(233,239,247,.55);font-weight:500;padding-inline-start:9px;border-inline-start:1px solid rgba(233,239,247,.18)}' +
    '#wave-back[dir=rtl]{direction:rtl}#wave-back[dir=ltr]{direction:ltr}' +
    '@media (max-width:420px){#wave-back .wb-brand{display:none}}' +
    // the pages' own top bars sit right under it
    'body>nav.nav{top:' + H + 'px!important}body>nav.nav~.page{margin-top:' + H + 'px}' +   // blog, products (fixed nav)
    '.wp-topbar{top:' + H + 'px!important}';                                                   // university, account (sticky header)
  document.head.appendChild(s);

  document.body.insertBefore(bar, document.body.firstChild);
  // No synthetic resize here: the terminal closes its phone menu on every resize, and it already measures its
  // header on DOMContentLoaded, which runs after this deferred script has added the bar.
})();
