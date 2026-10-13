/* Wave Capital — "back to the landing page" button for the platform pages (terminal, university, account...).
   Add ONE line before </body> of terminal_app.html (and any other page):  <script src="wave-back.js" defer></script>
   On phones it shows a small floating "← דף הבית" pill at the bottom-left (the AI button sits bottom-right).
   It follows the platform language (localStorage 'wc_lang'), links to index.html (the opener), touches nothing else. */
(function () {
  if (document.getElementById('wave-back')) return;
  var he = false; try { he = (localStorage.getItem('wc_lang') || 'en') === 'he'; } catch (e) {}   // same default as the platform's i18n.js
  var a = document.createElement('a');
  a.id = 'wave-back'; a.href = 'index.html';
  var ar = document.createElement('span'), tx = document.createElement('span');
  ar.setAttribute('aria-hidden', 'true'); ar.textContent = he ? '→' : '←'; tx.textContent = he ? 'דף הבית' : 'Home';
  a.appendChild(ar); a.appendChild(tx);          // flex: the first item sits at the start side (right in Hebrew)
  a.setAttribute('aria-label', he ? 'חזרה לדף הבית של Wave Capital' : 'Back to the Wave Capital home page');
  a.dir = he ? 'rtl' : 'ltr';
  var s = document.createElement('style');
  s.textContent = '#wave-back{position:fixed;z-index:2147483000;left:16px;bottom:calc(18px + env(safe-area-inset-bottom));display:none;align-items:center;gap:6px;' +
    'padding:11px 16px;border-radius:999px;font:600 14px/1 "IBM Plex Sans Hebrew",system-ui,-apple-system,sans-serif;color:#E9EFF7;text-decoration:none;' +
    'background:rgba(5,12,24,.86);border:1px solid rgba(111,178,255,.5);box-shadow:0 10px 30px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent}' +
    '#wave-back[dir=rtl]{direction:rtl!important;unicode-bidi:isolate!important}#wave-back[dir=ltr]{direction:ltr!important;unicode-bidi:isolate!important}#wave-back:active{transform:scale(.97)}@media (max-width:900px){#wave-back{display:inline-flex}}';
  document.head.appendChild(s);
  // came here from the opener? step back in history instead: the browser restores it instantly, at the same scroll spot
  a.addEventListener('click', function (e) {
    try {
      var r = document.referrer && new URL(document.referrer), home = new URL('index.html', location.href);
      var fromOpener = r && r.origin === location.origin && (r.pathname === home.pathname || r.pathname === home.pathname.replace(/index\.html$/, ''));
      if (fromOpener && history.length > 1) { e.preventDefault(); history.back(); }
    } catch (x) {}
  });
  (document.body || document.documentElement).appendChild(a);
})();
