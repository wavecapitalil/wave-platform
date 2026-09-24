// ── GREETING ────────────────────────────────────────────────
(function(){
  var h = new Date().getHours();
  var greeting = h < 12 ? t('home.greetingMorning','Good morning') : h < 17 ? t('home.greetingAfternoon','Good afternoon') : t('home.greetingEvening','Good evening');
  document.getElementById('greeting').innerHTML = greeting + ', <span>Daniel</span> ' + (h < 17 ? '☀️' : '🌙');
  var now = new Date();
  var lang = getLang();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('greetingDate').textContent = now.toLocaleDateString(lang==='he'?'he-IL':'en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  (function updateBriefSession(){
    var ilNow = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Jerusalem'}));
    var ilH = ilNow.getHours(), ilM = ilNow.getMinutes();
    var icon, label;
    if(ilH < 16){ icon='🌅'; label='Morning Brief'; window._briefSession='morning'; }
    else if(ilH < 23 || (ilH===23 && ilM < 30)){ icon='🔔'; label='Before Open Brief'; window._briefSession='opening'; }
    else { icon='🌙'; label='End of Day Brief'; window._briefSession='eod'; }
    var timeStr = String(ilH).padStart(2,'0') + ':' + String(ilM).padStart(2,'0');
    var el;
    el = document.getElementById('briefDate');
    if(el) el.textContent = days[ilNow.getDay()] + ' · ' + months[ilNow.getMonth()] + ' ' + ilNow.getDate() + ', ' + ilNow.getFullYear() + ' · ' + timeStr + ' Israel Time';
    el = document.getElementById('briefPageTitle');
    if(el) el.textContent = label;
    el = document.getElementById('briefNavIcon');
    if(el) el.textContent = icon;
    el = document.getElementById('briefNavLabel');
    if(el) el.textContent = ' ' + label;
    el = document.getElementById('briefNavBadge');
    if(el) el.textContent = timeStr;
  })();
})();

// ── CLOCK ─────────────────────────────────────────────────
function updateClock(){
  var now = new Date();
  var h = String(now.getHours()).padStart(2,'0');
  var m = String(now.getMinutes()).padStart(2,'0');
  var s = String(now.getSeconds()).padStart(2,'0');
  document.getElementById('tickerTime').textContent = '🕐 ' + h + ':' + m + ':' + s + ' IL';
}
setInterval(updateClock, 1000);
updateClock();

// ── DEBUG: find what intercepts clicks ────────────────────
document.addEventListener('click', function(e){
  document.title = (e.target.id || e.target.className || e.target.tagName).toString().substr(0,40);
}, true);

// ── NAVIGATION ────────────────────────────────────────────
var currentPage = 'welcome';

function navigate(page){
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  var el = document.getElementById('page-' + page);
  if(el) el.classList.add('active');

  document.querySelectorAll('.icon-btn').forEach(function(b){ b.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(b){ b.classList.remove('active'); });
  var activeNav = document.querySelector('.nav-item[data-page="' + page + '"]');
  if(activeNav) activeNav.classList.add('active');

  // Load Risk Meter when navigating to that page
  if(page === 'risk'){
    setTimeout(loadRiskMeter, 50);
  }

  // Load Sector Strength + Breadth Gauge when navigating to that page
  if(page === 'sectors'){
    setTimeout(loadSectors, 50);
  }

  if(page === 'breadth'){
    setTimeout(loadBreadthPage, 50);
  }

  if(page === 'research'){
    setTimeout(function(){ document.getElementById('researchInput').focus(); }, 100);
  }

  if(page === 'institutions'){
    setTimeout(loadInstitutionsList, 50);
  }

  if(page === 'comm-flows'){
    setTimeout(loadCommFlows, 50);
  }

  if(page === 'mover'){
    setTimeout(function(){ var i=document.getElementById('moverInput'); if(i) i.focus(); }, 100);
  }

  if(page === 'fundchart'){
    setTimeout(function(){ document.getElementById('fcTicker1').focus(); }, 100);
  }

  // Draw BTC/Gold charts when navigating to that page
  if(page === 'btcgold'){
    setTimeout(function(){
      if(nrgDataCache && nrgDataCache.btcPrices){
        drawNrgCharts(nrgDataCache.btcPrices, nrgDataCache.goldPrices);
      } else {
        loadBtcGoldPage();
      }
    }, 60);
  }

  if(page === 'home') { loadNews(); loadSectorPulse(); loadCalendar(); }
  if(page === 'pcr') loadPcrSection();
  if(page === 'housing') setTimeout(loadHousingGauge, 50);
  if(page === 'seasonality') setTimeout(function(){ seasLoad('SPY','S&P 500', document.querySelector('.seas-asset-btn')); }, 50);
  if(page === 'ev')  loadEvPage();

  // Load scanner data when navigating to scanner page
  if(page === 'scanner'){
    if(!scannerData || scannerData.length < 2) loadScannerData();
    else renderScannerTable();
  }

  if(page === 'crypto') loadCryptoDash();
  if(page === 'commodities'){ loadCommodities(); }
  if(page === 'hormuz')     loadHormuz();
  if(page === 'rates') loadRatesPage();
  if(page === 'macro') loadMacroScanner();
  if(page === 'confluence') loadConfluence();
  if(page === 'earnings'){ loadEarningsPage(); earnSetTab(_earnTab); }
  if(page === 'correlation' && !window._corrLoadedOnce){ window._corrLoadedOnce = true; runCorrelation(); }

  // Load brief iframe — pulls from iCloud Trading Briefings folder via Flask
  if(page === 'brief'){
    var frame = document.getElementById('briefFrame');
    frame.src = '';
    frame.src = API + '/api/daily-brief?t=' + Date.now();
    // Auto-refresh every 2 minutes while on this page
    clearInterval(window._briefRefreshTimer);
    window._briefRefreshTimer = setInterval(function(){
      if(currentPage === 'brief'){
        frame.src = API + '/api/daily-brief?t=' + Date.now();
      } else {
        clearInterval(window._briefRefreshTimer);
      }
    }, 2 * 60 * 1000);
  } else {
    clearInterval(window._briefRefreshTimer);
  }

  currentPage = page;
}

// ── WHAT'S MOVING (catalyst deep-dive) ────────────────────
function loadMover(){
  var inp = document.getElementById('moverInput');
  var sym = (inp.value||'').trim().toUpperCase();
  var body = document.getElementById('moverBody');
  if(!sym){ inp.focus(); return; }
  body.innerHTML = '<div style="padding:50px 0;text-align:center;color:#64748b">'
    + '<div class="ar-loading-spinner" style="margin:0 auto 14px"></div>'
    + 'Pulling price, news, SEC filings, Reddit &amp; StockTwits for <b style="color:#e2e8f0">'+sym+'</b>…'
    + '<div style="font-size:11px;margin-top:6px">The AI deep-dive can take 10–20s.</div></div>';
  fetch(API + '/api/ticker-mover?symbol=' + encodeURIComponent(sym))
    .then(function(r){ return r.json(); })
    .then(renderMover)
    .catch(function(e){ body.innerHTML = '<div style="color:#ef4444;padding:24px 0">Failed to analyze: '+e.message+'</div>'; });
}

function _moverSrcTag(t){
  var m = {news:{l:'NEWS',c:'#4a9eff'}, sec_8k:{l:'SEC 8-K',c:'#22c55e'}, reddit:{l:'REDDIT',c:'#fb923c'}, stocktwits:{l:'STOCKTWITS',c:'#a78bfa'}};
  var x = m[t] || {l:(t||'SRC').toUpperCase(),c:'#64748b'};
  return '<span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:'+x.c+';border:1px solid '+x.c+'55;padding:2px 6px;border-radius:5px">'+x.l+'</span>';
}

function renderMover(d){
  var body = document.getElementById('moverBody');
  if(!body) return;
  var html = '';

  // Price header
  if(d.price){
    var up = d.price.pct >= 0, col = up ? '#22c55e' : '#ef4444', sign = up ? '+' : '';
    html += '<div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;border:1px solid #1e293b;background:#0b1120;border-radius:14px;padding:18px 22px;margin-bottom:18px">'
      + '<div style="font-size:30px;font-weight:800;color:#e2e8f0">'+d.symbol+'</div>'
      + '<div style="font-size:26px;font-weight:700;color:#e2e8f0">$'+d.price.price+'</div>'
      + '<div style="font-size:20px;font-weight:700;color:'+col+'">'+sign+d.price.pct+'% <span style="font-size:13px;color:#64748b">today</span></div>'
      + '<div style="font-size:14px;color:'+(d.price.pct_5d>=0?'#22c55e':'#ef4444')+'">'+(d.price.pct_5d>=0?'+':'')+d.price.pct_5d+'% <span style="color:#64748b">5d</span></div>'
      + '<div style="margin-left:auto;font-size:11px;color:#475569">as of '+d.price.asof+'</div>'
      + '</div>';
  } else {
    html += '<div style="color:#f59e0b;border:1px solid #f59e0b44;border-radius:12px;padding:14px 18px;margin-bottom:18px">Couldn\'t confirm a live price for '+(d.symbol||'this ticker')+'. Showing catalysts only.</div>';
  }

  if(d.error){
    html += '<div style="color:#f59e0b;font-size:13px;margin-bottom:16px">'+d.error+'</div>';
  }

  var a = d.analysis || {};
  if(a.lead){
    html += '<div style="font-size:17px;line-height:1.5;color:#e2e8f0;font-weight:600;border-left:3px solid #4a9eff;padding-left:14px;margin-bottom:18px">'+a.lead+'</div>';
  }

  // Ranked catalysts
  if(a.catalysts && a.catalysts.length){
    html += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;margin-bottom:10px">LIKELY CATALYSTS</div>';
    a.catalysts.forEach(function(c){
      var cc = {high:'#22c55e',medium:'#f59e0b',low:'#64748b'}[c.confidence]||'#64748b';
      html += '<div style="border:1px solid #1e293b;background:#0b1120;border-radius:12px;padding:14px 16px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
        + _moverSrcTag(c.source_type)
        + '<span style="font-weight:700;color:#e2e8f0;font-size:14px">'+(c.title||'')+'</span>'
        + '<span style="margin-left:auto;font-size:10px;font-weight:700;color:'+cc+'">'+(c.confidence||'').toUpperCase()+'</span>'
        + '</div>'
        + '<div style="color:#94a3b8;font-size:13px;line-height:1.5">'+(c.why||'')+'</div>'
        + '</div>';
    });
  }

  // Context body
  if(a.body){
    var content = a.body.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n\n/g,'</p><p>');
    html += '<div style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:16px 0"><p>'+content+'</p></div>';
  }

  // Sentiment
  if(d.sentiment && (d.sentiment.bullish || d.sentiment.bearish)){
    html += '<div style="font-size:13px;color:#94a3b8;margin:14px 0">StockTwits tagged sentiment: '
      + '<span style="color:#22c55e;font-weight:700">'+d.sentiment.bullish+' bullish</span> / '
      + '<span style="color:#ef4444;font-weight:700">'+d.sentiment.bearish+' bearish</span>'
      + (a.sentiment_note ? ' — '+a.sentiment_note : '') + '</div>';
  }

  // Sources
  if(d.sources && d.sources.length){
    html += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;margin:22px 0 10px">SOURCES ('+d.sources.length+')</div>';
    d.sources.forEach(function(s){
      html += '<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #131a2a">'
        + _moverSrcTag(s.source_type)
        + '<a href="'+s.url+'" target="_blank" style="color:#93c5fd;font-size:13px;text-decoration:none;flex:1">'+s.title+'</a>'
        + (s.date?'<span style="font-size:10px;color:#475569">'+s.date+'</span>':'')
        + '</div>';
    });
  }

  if(d.disclaimer){
    html += '<div style="font-size:11px;color:#475569;margin-top:18px;font-style:italic">'+d.disclaimer+'</div>';
  }

  body.innerHTML = html || '<div style="color:#64748b;padding:24px 0">No data returned.</div>';
}

// ── NAV PANEL TOGGLE ──────────────────────────────────────
var navVisible = true;
function toggleNav(){
  var panel  = document.getElementById('navPanel');
  var reopen = document.getElementById('navReopen');
  navVisible = !navVisible;
  panel.classList.toggle('collapsed', !navVisible);
  reopen.classList.toggle('visible', !navVisible);
}

// ── SECTION COLLAPSE ─────────────────────────────────────
function toggleSection(id){
  var items = document.getElementById('items-' + id);
  var caret = document.getElementById('caret-' + id);
  var isOpen = items.style.display !== 'none';
  items.style.display = isOpen ? 'none' : 'block';
  if(caret) caret.textContent = isOpen ? '▸' : '▾';
}

// ── Wave + Tilt ─────────────────────────────────────────────
function initHeroWave(){
  var canvas=document.getElementById('heroWaveCanvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  function resize(){
    var p=canvas.parentElement||document.body;
    canvas.width=p.offsetWidth||window.innerWidth;
    canvas.height=p.offsetHeight||window.innerHeight;
  }
  resize();
  window.addEventListener('resize',resize);
  var t=0;
  var layers=[
    {amp:26,fA:0.005,fB:0.013,sA:1.1,sB:0.7,a:0.055,r:74,g:158,b:255},
    {amp:16,fA:0.008,fB:0.019,sA:0.85,sB:1.25,a:0.032,r:139,g:92,b:246},
    {amp:38,fA:0.003,fB:0.008,sA:0.55,sB:0.45,a:0.022,r:74,g:158,b:255}
  ];
  (function draw(){
    var w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    layers.forEach(function(l,i){
      ctx.beginPath();
      var base=h*(0.36+i*0.09);
      ctx.moveTo(0,base);
      for(var x=0;x<=w;x+=3){
        var y=base+Math.sin(x*l.fA+t*l.sA)*l.amp+Math.sin(x*l.fB+t*l.sB)*l.amp*0.4;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
      ctx.fillStyle='rgba('+l.r+','+l.g+','+l.b+','+l.a+')';
      ctx.fill();
    });
    t+=0.016;
    requestAnimationFrame(draw);
  })();
}

function initTiltCards(){
  document.querySelectorAll('[data-tilt]').forEach(function(card){
    card.style.transition='transform .12s ease';
    card.addEventListener('mousemove',function(e){
      var r=card.getBoundingClientRect();
      var x=((e.clientX-r.left)/r.width-0.5)*2;
      var y=((e.clientY-r.top)/r.height-0.5)*2;
      card.style.transform='perspective(500px) rotateX('+(-y*6)+'deg) rotateY('+(x*6)+'deg) translateZ(5px)';
    });
    card.addEventListener('mouseleave',function(){card.style.transform='';});
  });
}

function _newsTimeAgo(pubStr){
  try{
    var diff = Math.floor((Date.now() - new Date(pubStr)) / 60000);
    if(diff < 1)   return 'Just now';
    if(diff < 60)  return diff + 'm ago';
    if(diff < 1440) return Math.floor(diff/60) + 'h ago';
    return Math.floor(diff/1440) + 'd ago';
  }catch(e){ return ''; }
}

// ── INIT ─────────────────────────────────────────────────
window.addEventListener('load', function(){
  var deep = new URLSearchParams((location.hash||'').replace(/^#/, ''));
  var deepPage = deep.get('page');
  if(deepPage && document.getElementById('page-' + deepPage)){
    navigate(deepPage);
    var deepSymbol = deep.get('symbol');
    if(deepSymbol && deepPage === 'mover'){
      var deepInput = document.getElementById('moverInput');
      if(deepInput){
        deepInput.value = deepSymbol;
        setTimeout(function(){ if(typeof loadMover === 'function') loadMover(); }, 120);
      }
    }
  }
  initHeroWave();
  initTiltCards();
  loadTickerData();
  loadNews();
  loadScannerData();
  loadCalendar();
  loadSectorPulse();
  fetch(API+'/api/earnings').catch(function(){});  // warm up cache on load
  setInterval(loadTickerData, 5 * 60 * 1000);
  setInterval(loadNews, 10 * 60 * 1000);
  setInterval(loadScannerData, 10 * 60 * 1000);
  setInterval(loadSectorPulse, 5 * 60 * 1000);
});

