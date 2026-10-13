/* Hebrew / English. The choice lives in localStorage 'wc_lang', the same key the Wave platform uses,
   so a visitor who picked a language in the platform sees the opener in it too (and the other way round).
   Hebrew is the default. <html lang/dir> is set by the inline script in <head> before paint; this file swaps
   the text, so it must run before site.js (word splitting) and before company.js / a11y.js / theme.js. */
(function () {
  var KEY = 'wc_lang', lang = 'he';
  try { if (localStorage.getItem(KEY) === 'en') lang = 'en'; localStorage.setItem(KEY, lang); } catch (e) {}   // saved at once: every platform page opens in the opener's language
  var EN = lang === 'en', root = document.documentElement;

  var T = {
    'דילוג לתוכן המרכזי': 'Skip to main content',
    'Wave Capital, לראש העמוד': 'Wave Capital, back to top',
    'Wave Capital, חזרה לעמוד הבית': 'Wave Capital, back to the home page',
    'ניווט ראשי': 'Main navigation', 'תפריט נייד': 'Mobile menu', 'תפריט': 'Menu',
    'ניווט תחתון': 'Footer navigation', 'מידע משפטי': 'Legal information',
    'ייעוץ': 'Advisory', 'אודות': 'About', 'צור קשר': 'Contact', 'כניסה למערכת': 'Enter Terminal', '←': '→',
    'הלוגו של Wave Capital': 'Wave Capital logo',
    'מחקר': 'Research', 'טכנולוגיה': 'Technology', 'הון': 'Capital',
    'Wave Capital מחברת בין ניהול הון, פיתוח אסטרטגיות והשקעות ערך, כדי להפוך מידע לתהליך החלטה מדויק.':
      'Wave Capital brings together capital management, strategy development and value investing to turn information into a precise decision process.',
    'ניהול הון': 'Capital management', 'מחקר השקעות': 'Investment research', 'מערכות מסחר': 'Trading systems',
    'פגישה ממוקדת עם הצוות של Wave Capital: בונים יחד תהליך עבודה, מחקר, ניהול סיכון או תשתית מסחר שמתאימים לכם.':
      'A focused meeting with the Wave Capital team. Together we build the workflow, research, risk management or trading infrastructure that fits you.',
    'תהליך עבודה': 'Workflow', 'סדר קבוע להחלטות': 'A set order for every decision',
    'מהשאלה ועד התשובה': 'From the question to the answer',
    'ניהול סיכון': 'Risk management', 'גודל פוזיציה וגבולות': 'Position sizing and limits',
    'תשתית מסחר': 'Trading infrastructure', 'כלים שעובדים בשבילכם': 'Tools that work for you',
    'לקביעת שיחה': 'Book a call', 'שיחת היכרות קצרה, ומשם מתאימים את הפגישה.': 'A short intro call first, then we tailor the meeting.',
    'הערכת שווי, מעקב וחקירת מניות, במערכת אחת.': 'Valuation, watchlists and stock research in one platform.',
    'מחיר בשוק': 'Market price', 'שווי הוגן': 'Fair value', 'פער': 'Gap',
    'הערכת שווי': 'Valuation', 'כמה החברה שווה באמת, מול המחיר שבו היא נסחרת.': 'What the company is really worth, against the price it trades at.',
    'מעקב מניות': 'Watchlist', 'כל החברות שאתם מחזיקים או בוחנים, במבט אחד.': 'Every company you hold or are watching, at a glance.',
    'חקירת מניות': 'Stock research', 'מהדוחות הכספיים ועד התמונה המלאה על החברה.': 'From the financial statements to the full picture of the company.',
    'איך זה עובד': 'How it works', 'בוחרים מניה': 'Pick a stock', 'חוקרים את החברה': 'Research the company',
    'מעריכים שווי': 'Estimate its value', 'עוקבים לאורך זמן': 'Track it over time',
    'כל הכלים מחכים בפנים.': 'All the tools are waiting inside.',
    'חברה לניהול כספים, פיתוח אסטרטגיות והשקעות ערך.': 'Money management, strategy development and value investing.',
    'אנחנו חוקרים שווקים גלובליים ומפתחים תהליכים וכלים שמטרתם לשפר את איכות ההחלטות. הדגש שלנו הוא על ניהול סיכון, שקיפות ועקביות.':
      'We research global markets and build processes and tools designed to improve the quality of decisions. Our focus is on risk management, transparency and consistency.',
    'מחקר עצמאי': 'Independent research', 'שווקים גלובליים, בעיניים שלנו': 'Global markets, through our own eyes',
    'גישה שיטתית': 'Systematic approach', 'כל החלטה עוברת את אותו תהליך': 'Every decision goes through the same process',
    'שמירה על ההון לפני הכל': 'Protecting capital comes first',
    'פיתוח טכנולוגי': 'Technology development', 'כלים שבנינו לעבודה היומיומית': 'Tools we built for everyday work',
    'כל הכלים מחכים במערכת. לשאלות או לשיחת היכרות, אפשר לפנות אלינו ישירות.': 'All the tools are waiting in the platform. For questions or an intro call, reach us directly.',
    'דברו איתנו': 'Talk to us', 'בחרו את הדרך הנוחה לכם, ונחזור אליכם בהקדם.': 'Pick whatever suits you and we will get back to you soon.',
    'וואטסאפ': 'WhatsApp', 'שיחת טלפון': 'Phone call', 'מייל': 'Email',
    'מדיניות פרטיות': 'Privacy Policy', 'תקנון ותנאי שימוש': 'Terms of Use', 'הצהרת נגישות': 'Accessibility Statement',
    'המידע באתר הוא מידע כללי בלבד. הוא אינו ייעוץ השקעות או שיווק השקעות ואינו תחליף לייעוץ שמתחשב בצרכים של כל אדם. מסחר והשקעה כרוכים בסיכון.':
      'Everything published here is general information only. It is not investment advice or investment marketing, and it does not replace advice that takes each person\'s needs into account. Trading and investing involve risk.',
    'לגילוי הנאות המלא': 'Full disclosure', 'ח.פ': 'Company No.',
    'האתר נוצר על ידי yogiweb, מעבר לאתר הסטודיו בלשונית חדשה': 'Site built by yogiweb, opens the studio website in a new tab',
    'נוצר על ידי': 'Built by', 'סגירה': 'Close', 'שיחת היכרות': 'Intro call', 'בחרו איך נוח לכם לדבר איתנו.': 'Choose how you would like to talk to us.',
    'חזרה לאתר': 'Back to site', 'עמוד הבית': 'Home',
    /* widgets (a11y.js, theme.js, company.js) */
    'תפריט נגישות': 'Accessibility menu', 'התאמות נגישות': 'Accessibility adjustments', 'נגישות': 'Accessibility',
    'הגדלת טקסט': 'Larger text', 'ניגודיות גבוהה': 'High contrast', 'הדגשת קישורים': 'Highlight links', 'גופן קריא': 'Readable font',
    'עצירת תנועה': 'Stop motion', 'איפוס ההתאמות': 'Reset adjustments',
    'מעבר לתצוגה כהה': 'Switch to dark mode', 'מעבר לתצוגה בהירה': 'Switch to light mode', 'תצוגה כהה': 'Dark mode', 'תצוגה בהירה': 'Light mode',
    'יושלם לפני העלייה לאוויר': 'To be completed before launch',
    'היי, הגעתי מהאתר של Wave Capital': 'Hi, I found you through the Wave Capital website'
  };
  /* elements whose markup differs between the languages (word spans, accent words, line breaks) */
  var H = {
    '.h1': '<span class="hw">Research</span> <span class="hw">edge.</span><br><span class="hw"><em>Systematic</em></span> <span class="hw"><em>execution.</em></span>',
    '.lead__title': 'About <em>us</em>',
    '.mani': 'Wave Capital combines independent investment research, value investing and the development of systematic trading strategies. We turn complex information <em class="key">into clear decision processes,</em> with rigorous risk management.',
    '#products .h2': 'A personal <em>advisory</em> call',
    '#terminal .h2': 'The trader\'s <em>workspace</em>',
    '#about .h2': 'Capital managed through <em>process</em>',
    '.phil__q': 'We don\'t chase<br><em>forecasts.</em>',
    '#contact .h2': 'Want to work more <em>precisely</em>?'
  };
  var TITLES = {
    'Wave Capital | מחקר השקעות, השקעות ערך ומסחר שיטתי': 'Wave Capital | Investment research, value investing and systematic trading',
    'מדיניות פרטיות | Wave Capital': 'Privacy Policy | Wave Capital', 'תקנון ותנאי שימוש | Wave Capital': 'Terms of Use | Wave Capital',
    'הצהרת נגישות | Wave Capital': 'Accessibility Statement | Wave Capital'
  };

  window.WC_LANG = lang;
  window.WC_T = function (s) { return EN && T[s] ? T[s] : s; };

  function swapText(scope) {
    var w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (node) { var v = node.nodeValue, k = v.trim(); if (k && T[k]) node.nodeValue = v.replace(k, T[k]); });
    [].forEach.call(scope.querySelectorAll('[aria-label],[alt],[title]'), function (el) {
      ['aria-label', 'alt', 'title'].forEach(function (a) { var v = el.getAttribute(a); if (v && T[v]) el.setAttribute(a, T[v]); });
    });
  }
  function apply() {
    var tpl = document.getElementById('en-main'), main = document.getElementById('main');
    if (tpl && main) main.innerHTML = tpl.innerHTML;
    Object.keys(H).forEach(function (sel) { var el = document.querySelector(sel); if (el) el.innerHTML = H[sel]; });
    swapText(document.body);
    if (TITLES[document.title]) document.title = TITLES[document.title];
    var d = document.querySelector('meta[name="description"]');
    if (d && document.querySelector('.h1')) d.setAttribute('content', 'Wave Capital combines independent investment research, value investing and systematic trading strategies, with rigorous risk management.');
  }

  function toggle() {
    try { localStorage.setItem(KEY, EN ? 'he' : 'en'); } catch (e) {}
    location.reload();
  }
  function button(cls) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'lang-btn ' + (cls || '');
    b.textContent = EN ? 'עב' : 'EN'; b.lang = EN ? 'he' : 'en';
    b.setAttribute('aria-label', EN ? 'מעבר לעברית' : 'Switch to English');
    b.addEventListener('click', toggle); return b;
  }
  function mount() {
    var s = document.createElement('style');
    s.textContent = '.lang-btn{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;color:var(--ink,#E9EFF7);border:1px solid rgba(111,178,255,.35);border-radius:999px;padding:10px 14px;background:none;cursor:pointer;transition:border-color .3s,color .3s}' +
      '.lang-btn[lang="he"]{font-family:"IBM Plex Sans Hebrew",system-ui,sans-serif;letter-spacing:0;font-size:14px;padding:8px 14px}.lang-btn:hover{border-color:#6FB2FF;color:#6FB2FF}' +
      '.hd__nav .lang-btn{align-self:center;padding:8px 12px;margin-top:-2px}.lang-btn--m{display:none}' +
      '@media (max-width:980px){.lang-btn--m{display:inline-block;margin-inline-start:auto;margin-inline-end:10px}}' +
      '.en .a11y-btn,.en .a11y-panel{left:auto;right:18px}.en .theme-btn{left:auto;right:80px}' +
      '.hd__nav .lang-btn[lang="he"]{padding:6px 12px}.top .lang-btn{margin-inline-start:auto;margin-inline-end:12px;color:#E9EFF7}';
    document.head.appendChild(s);
    var nav = document.querySelector('.hd__nav'); if (nav) nav.appendChild(button());
    var menu = document.querySelector('.hd__menu'); if (menu) menu.parentNode.insertBefore(button('lang-btn--m'), menu);
    var back = document.querySelector('.top > .back'); if (back) back.parentNode.insertBefore(button(), back);
  }

  if (EN) apply();
  mount();
  // walking into the platform carries the opener's language with it (same key the platform reads)
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-app],[data-sys]')) { try { localStorage.setItem(KEY, lang); } catch (x) {} }
  }, true);
})();
