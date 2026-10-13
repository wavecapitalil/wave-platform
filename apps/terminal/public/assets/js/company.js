/* Wave Capital — company details. ONE place: fill these and every legal page + the footer update.
   An empty value shows as a visible "to be completed" marker on the legal pages, and the site must not go live like that. */
window.WAVE_CO = {
  name: 'Wave Capital',
  legal: '',        // שם משפטי מלא, למשל: ווייב קפיטל בע"מ
  id: '',           // ח.פ / ע.מ
  address: '',      // כתובת מלאה
  phone: '',        // טלפון
  email: 'Waveadmin@wavecapital.co.il',        // דוא"ל לפניות
  whatsapp: '050-534-1418',     // מספר וואטסאפ, למשל 0501234567
  app: 'terminal_app.html',          // כתובת המערכת של הלקוח (כפתורי "כניסה למערכת"), למשל https://app.wavecapital.co.il
  a11yName: '',     // שם רכז/ת הנגישות
  site: '',         // כתובת האתר, למשל: https://wavecapital.co.il
  city: ''          // עיר סמכות השיפוט, למשל: תל אביב
};
(function () {
  var T = window.WC_T || function (s) { return s; };
  var co = window.WAVE_CO, els = document.querySelectorAll('[data-co]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i], v = co[el.getAttribute('data-co')];
    if (v) { el.textContent = v; if (el.hasAttribute('data-tel')) el.setAttribute('href', 'tel:' + v.replace(/[^0-9+]/g, '')); if (el.hasAttribute('data-mail')) el.setAttribute('href', 'mailto:' + v); }
    else if (el.hasAttribute('data-soft')) { var row = el.closest('[data-co-row]'); if (row) row.hidden = true; }
    else { el.textContent = T('יושלם לפני העלייה לאוויר'); el.className += ' co-missing'; }
  }
  // direct contact buttons + "כניסה למערכת". Until a value is filled the button stays on the page and leads to #contact.
  var digits = function (v) { return v.replace(/[^0-9]/g, ''); };
  var reach = { wa: co.whatsapp && 'https://wa.me/' + digits(co.whatsapp).replace(/^0/, '972') + '?text=' + encodeURIComponent(T('היי, הגעתי מהאתר של Wave Capital')),
                tel: co.phone && 'tel:' + co.phone.replace(/[^0-9+]/g, ''), mail: co.email && 'mailto:' + co.email };
  [].forEach.call(document.querySelectorAll('[data-reach]'), function (a) { var h = reach[a.getAttribute('data-reach')]; if (h) a.setAttribute('href', h); if (a.getAttribute('data-reach') !== 'wa') a.removeAttribute('target'); });
  // "כניסה למערכת" and the system's own pages (data-sys) open in the same tab, like walking from the lobby into the platform.
  var base = co.app.replace(/[^\/]*$/, '');
  [].forEach.call(document.querySelectorAll('[data-app]'), function (a) { a.removeAttribute('target'); a.removeAttribute('rel'); if (co.app) a.setAttribute('href', co.app); });
  [].forEach.call(document.querySelectorAll('[data-sys]'), function (a) { if (co.app) { a.setAttribute('href', base + a.getAttribute('data-sys')); a.hidden = false; } });
})();

/* Faster hop into the platform (11/10): the platform's files are fetched quietly into the browser cache once this page
   has settled (and right away when a finger touches a platform link), so "כניסה למערכת" opens almost instantly. */
(function () {
  var co = window.WAVE_CO; if (!co || !co.app) return;
  var c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
  var app = new URL(co.app, location.href), same = app.origin === location.origin, done = {}, warmed = false;
  // a different site (the Vercel preview) has its own browser cache, so only open the connection early there
  if (!same) { var l = document.createElement('link'); l.rel = 'preconnect'; l.href = app.origin; document.head.appendChild(l); return; }
  function get(u) { if (done[u]) return; done[u] = 1; try { fetch(u, { credentials: 'same-origin', priority: 'low' }).catch(function () {}); } catch (e) {} }
  function warm() {
    if (warmed) return; warmed = true;
    fetch(app.href, { credentials: 'same-origin', priority: 'low' }).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html'), list = [];
      [].forEach.call(doc.querySelectorAll('script[src],link[rel="stylesheet"][href]'), function (el) {
        var u = new URL(el.getAttribute('src') || el.getAttribute('href'), app.href); if (u.origin === app.origin) list.push(u.href);
      });
      (function next() { var u = list.shift(); if (!u) return; get(u); setTimeout(next, 60); })();
    }).catch(function () {});
  }
  ['pointerdown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (e.target.closest && e.target.closest('[data-app],[data-sys]')) { get(app.href); warm(); } }, { passive: true, capture: true });
  });
  addEventListener('load', function () {
    var go = function () { if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2000 }); else setTimeout(warm, 1200); };
    if (scrollY > innerHeight) go(); else addEventListener('scroll', function f() { if (scrollY > innerHeight) { removeEventListener('scroll', f); go(); } }, { passive: true });
  });
})();
