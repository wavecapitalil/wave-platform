/* Accessibility widget — text size, contrast, link highlight, readable font, stop motion. Preferences live in localStorage only. */
(function () {
  var T = window.WC_T || function (s) { return s; };
  var KEY = 'wc-a11y', st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  var root = document.documentElement;
  function apply() {
    root.classList.toggle('a11y-contrast', !!st.contrast); root.classList.toggle('a11y-links', !!st.links); root.classList.toggle('a11y-font', !!st.font);
    document.body.style.zoom = st.size ? (1 + st.size * 0.1) : '';
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var css = '.a11y-btn{position:fixed;z-index:60;bottom:18px;left:18px;width:52px;height:52px;border-radius:50%;background:#0b1830;border:1px solid rgba(111,178,255,.5);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}' +
    '.a11y-btn svg{width:26px;height:26px}.a11y-panel{position:fixed;z-index:61;bottom:80px;left:18px;width:min(300px,calc(100vw - 36px));background:#050B16;border:1px solid rgba(111,178,255,.35);border-radius:18px;padding:18px;color:#E9EFF7;font:400 15px/1.4 "IBM Plex Sans Hebrew",system-ui,sans-serif;direction:rtl;display:none}' +
    '.a11y-panel.is-open{display:block}.a11y-panel h2{font-size:18px;margin:0 0 12px}.a11y-panel button{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:46px;padding:0 14px;margin-top:8px;border-radius:12px;border:1px solid rgba(233,239,247,.16);background:#03070D;color:inherit;font:inherit;cursor:pointer;text-align:start}' +
    '.a11y-panel button[aria-pressed="true"]{border-color:#6FB2FF;background:rgba(47,128,255,.18)}.a11y-panel a{display:block;margin-top:14px;color:#6FB2FF;text-decoration:underline}' +
    '.a11y-contrast{--mute:#fff;--faint:rgba(255,255,255,.5);--ink:#fff;--blue-hi:#9ccaff}.a11y-contrast .pitem{opacity:1!important}.a11y-contrast .mani .rw{opacity:1!important}' +
    '.a11y-links a{text-decoration:underline!important;outline:1px dashed currentColor;outline-offset:3px}.a11y-font,.a11y-font *{font-family:Arial,"Arial Hebrew",sans-serif!important;letter-spacing:0!important}' +
    '.skip{position:fixed;top:-80px;right:16px;z-index:70;background:#1A66E0;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600}.skip:focus{top:16px}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  function build() {
    var b = document.createElement('button'); b.className = 'a11y-btn fab'; b.setAttribute('aria-label', T('תפריט נגישות')); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 8.5h14M12 8.5v6m0 0-3.2 5.5M12 14.5l3.2 5.5"/></svg>';
    var p = document.createElement('div'); p.className = 'a11y-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', T('התאמות נגישות'));
    var items = [['size', T('הגדלת טקסט')], ['contrast', T('ניגודיות גבוהה')], ['links', T('הדגשת קישורים')], ['font', T('גופן קריא')], ['still', T('עצירת תנועה')]];
    var h = '<h2>' + T('נגישות') + '</h2>'; items.forEach(function (it) { h += '<button data-k="' + it[0] + '" aria-pressed="false"><span>' + it[1] + '</span><span data-v></span></button>'; });
    h += '<button data-k="reset"><span>' + T('איפוס ההתאמות') + '</span></button><a href="accessibility.html">' + T('הצהרת נגישות') + '</a>'; p.innerHTML = h;
    function sync() { [].forEach.call(p.querySelectorAll('button[data-k]'), function (x) { var k = x.getAttribute('data-k'); if (k === 'reset') return; x.setAttribute('aria-pressed', !!st[k]); var v = x.querySelector('[data-v]'); if (k === 'size') v.textContent = st.size ? '+' + st.size * 10 + '%' : ''; }); }
    p.addEventListener('click', function (e) { var x = e.target.closest('button[data-k]'); if (!x) return; var k = x.getAttribute('data-k');
      if (k === 'reset') { var had = st.still; st = {}; save(); apply(); sync(); if (had) location.reload(); return; }
      if (k === 'size') st.size = ((st.size || 0) + 1) % 4; else st[k] = !st[k];
      save(); apply(); sync(); if (k === 'still') location.reload(); });
    b.addEventListener('click', function () { var o = p.classList.toggle('is-open'); b.setAttribute('aria-expanded', o); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && p.classList.contains('is-open')) { p.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); b.focus(); } });
    document.body.appendChild(b); document.body.appendChild(p); sync(); apply();
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
