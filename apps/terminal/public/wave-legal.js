/* Wave Capital: legal line for the platform pages (terminal, university, account, blog, products).
   Add ONE line before </body>:  <script src="wave-legal.js" defer></script>
   Adds a quiet line at the end of the page: "not investment advice" + links to privacy / terms / accessibility.
   In the terminal it goes at the bottom of the scrolling area (#mainContent), so it ends every terminal screen.
   Follows the platform language (localStorage 'wc_lang', Hebrew by default), touches nothing else. */
(function () {
  if (document.getElementById('wave-legal')) return;
  var he = true; try { he = (localStorage.getItem('wc_lang') || 'he') === 'he'; } catch (e) {}
  var T = he
    ? { note: 'המידע באתר ובמערכת הוא מידע כללי בלבד ואינו ייעוץ השקעות. מסחר והשקעה כרוכים בסיכון.',
        links: [['privacy.html', 'מדיניות פרטיות'], ['terms.html', 'תקנון ותנאי שימוש'], ['terms.html#disclosure', 'גילוי נאות'], ['accessibility.html', 'הצהרת נגישות']],
        label: 'מידע משפטי' }
    : { note: 'Information on this site and platform is general information only and is not investment advice. Trading and investing involve risk.',
        links: [['privacy.html', 'Privacy Policy'], ['terms.html', 'Terms of Use'], ['terms.html#disclosure', 'Disclosure'], ['accessibility.html', 'Accessibility Statement']],
        label: 'Legal information' };

  var box = document.createElement('aside');
  box.id = 'wave-legal'; box.dir = he ? 'rtl' : 'ltr'; box.setAttribute('aria-label', T.label);
  var p = document.createElement('p'); p.textContent = T.note; box.appendChild(p);
  var nav = document.createElement('nav'); nav.setAttribute('aria-label', T.label);
  T.links.forEach(function (l) { var a = document.createElement('a'); a.href = l[0]; a.textContent = l[1]; nav.appendChild(a); });
  box.appendChild(nav);

  var s = document.createElement('style');
  s.textContent = '#wave-legal{box-sizing:border-box;width:100%;margin:48px 0 0;padding:22px 16px 26px;border-top:1px solid rgba(233,239,247,.08);' +
    'text-align:center;font:400 12px/1.7 "IBM Plex Sans Hebrew",system-ui,-apple-system,sans-serif;color:rgba(233,239,247,.5);clear:both}' +
    '#wave-legal p{margin:0 auto 8px;max-width:760px}' +
    '#wave-legal nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 18px}' +
    '#wave-legal a{color:rgba(233,239,247,.72);text-decoration:none;border-bottom:1px solid rgba(111,178,255,.28);padding-bottom:1px}' +
    '#wave-legal a:hover,#wave-legal a:focus-visible{color:#E9EFF7;border-color:#6FB2FF}' +
    '@media (max-width:900px){#wave-legal{padding-bottom:96px}}';   // room for the floating Home / AI buttons
  document.head.appendChild(s);

  var host = document.getElementById('mainContent') || document.body;
  host.appendChild(box);
})();
