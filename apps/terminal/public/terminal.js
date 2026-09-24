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
    if(!scannerCache.squeeze || scannerCache.squeeze.length < 2) loadScannerData();
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

// ── TICKER & MARKET DATA (Yahoo Finance) ─────────────────
function fmt(n, pre){
  if(!n) return '—';
  pre = pre || '';
  if(n >= 10000) return pre + n.toLocaleString('en',{maximumFractionDigits:0});
  if(n >= 1000)  return pre + n.toLocaleString('en',{maximumFractionDigits:1});
  return pre + n.toFixed(2);
}
function chgHtml(pct){
  if(pct === null || pct === undefined) return '—';
  var sign = pct >= 0 ? '+' : '';
  var cls  = pct >= 0 ? 'up' : 'dn';
  return '<span class="ticker-chg ' + cls + '">' + sign + pct.toFixed(2) + '%</span>';
}
function chgSummHtml(pct){
  if(pct === null || pct === undefined) return '—';
  var sign = pct >= 0 ? '▲ +' : '▼ ';
  var cls  = pct >= 0 ? 'up' : 'dn';
  return '<span class="sc-chg ' + cls + '">' + sign + Math.abs(pct).toFixed(2) + '%</span>';
}

// ── PYTHON API (localhost:5001) ───────────────────────────
var API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5001' : '';

async function fetchQuote(symbol){
  try{
    var r = await fetch(API + '/api/quote?symbol=' + encodeURIComponent(symbol));
    var d = await r.json();
    if(d.error) return null;
    return {price: d.price, pct: d.pct};
  }catch(e){ return null; }
}

async function fetchIntraday(symbol){
  try{
    var r = await fetch(API + '/api/intraday?symbol=' + encodeURIComponent(symbol));
    var d = await r.json();
    return d.closes && d.closes.length ? d.closes : null;
  }catch(e){ return null; }
}

// ── BINANCE (BTC — public API, no key, CORS enabled) ─────────────────────────
var BN_BASE = 'https://api.binance.com/api/v3';
async function bnFetch(path){
  try{ var r = await fetch(BN_BASE + path); return await r.json(); }catch(e){ return null; }
}
async function bnBtcPrice(){
  var d = await bnFetch('/ticker/tradingDay?symbol=BTCUSDT&type=MINI');
  if(!d) return null;
  var openP = parseFloat(d.openPrice), lastP = parseFloat(d.lastPrice);
  var pct = openP > 0 ? (lastP - openP) / openP * 100 : 0;
  return { price: lastP, pct: pct };
}
async function bnBtcKlines(interval, limit){
  var d = await bnFetch('/klines?symbol=BTCUSDT&interval=' + interval + '&limit=' + limit);
  if(!d) return null;
  return d.map(function(x){ return parseFloat(x[4]); });
}
async function bnBtcKlinesLabeled(interval, limit){
  var d = await bnFetch('/klines?symbol=BTCUSDT&interval=' + interval + '&limit=' + limit);
  if(!d) return null;
  return {
    closes: d.map(function(x){ return parseFloat(x[4]); }),
    labels: d.map(function(x){ return new Date(x[0]).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); })
  };
}

async function loadBtcGoldPage(){
  var btcStat = document.getElementById('nrgBtcPct');
  if(btcStat) btcStat.textContent = 'Loading...';
  try{
    // Fetch live prices + intraday in parallel
    var results = await Promise.all([
      bnBtcPrice(),
      fetchQuote('GLD'),
      bnBtcKlinesLabeled('30m', 48),
      fetchIntraday('GLD')
    ]);
    var btcQ = results[0], goldQ = results[1];
    var btcData = results[2], goldCloses = results[3];
    if(!btcQ || !goldQ || !btcData || !goldCloses) throw new Error('fetch failed');
    var btcPrice = btcQ.price, goldPrice = goldQ.price;
    var btcCloses = btcData.closes;
    var btcLabels = btcData.labels;

    // Intraday % change from session open (matches the chart)
    var btcPct  = (btcCloses[btcCloses.length-1]   / btcCloses[0]   - 1) * 100;
    var goldPct = (goldCloses[goldCloses.length-1] / goldCloses[0] - 1) * 100;

    updateRiskGauge(btcPrice, btcPct, goldPrice, goldPct, btcCloses, goldCloses);
    drawNrgCharts(btcCloses, goldCloses, btcLabels);

    // Default ratio chart to 1D
    drawRatioChart(btcCloses, goldCloses, btcLabels, 'Intraday (30m candles)');
    document.querySelectorAll('.ratio-btn').forEach(function(b){ b.classList.remove('active'); });
    var btn1d = document.querySelector('.ratio-btn');
    if(btn1d) btn1d.classList.add('active');
  }catch(e){
    if(btcStat) btcStat.textContent = 'Error loading';
  }
}

function drawSparkline(svgId, prices, isPositive){
  var svg = document.getElementById(svgId);
  if(!svg || !prices || prices.length < 2) return;
  var W = 100, H = 28, pad = 1;
  var min = Math.min.apply(null, prices);
  var max = Math.max.apply(null, prices);
  var range = max - min || 1;
  var pts = prices.map(function(v, i){
    var x = pad + (i / (prices.length - 1)) * (W - pad * 2);
    var y = H - pad - ((v - min) / range) * (H - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var color = isPositive ? '#22c55e' : '#ef4444';
  svg.innerHTML =
    '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
}

var nrgChartInst = null, nrgRatioInst = null;
var nrgDataCache = null;

function drawNrgCharts(btcPrices, goldPrices, timeLabels){
  var len     = Math.min(btcPrices.length, goldPrices.length);
  var btcBase = btcPrices[0], goldBase = goldPrices[0];
  var labels  = timeLabels ? timeLabels.slice(0,len) : Array.from({length:len}, function(_,i){ return i; });
  var btcPct  = btcPrices.slice(0,len).map(function(v){ return (v-btcBase)/btcBase*100; });
  var goldPct = goldPrices.slice(0,len).map(function(v){ return (v-goldBase)/goldBase*100; });
  var GLD_OZ  = 10.76; // 1 GLD share ≈ 0.0929 oz → oz price = GLD × 10.76
  var ratio   = btcPrices.slice(0,len).map(function(v,i){ return v/(goldPrices[i]*GLD_OZ); });

  var commonOpts = {
    responsive:true, maintainAspectRatio:false, animation:false,
    plugins:{legend:{display:false}, tooltip:{
      mode:'index', intersect:false,
      backgroundColor:'rgba(15,17,23,0.95)',
      titleColor:'#64748b', bodyColor:'#e2e8f0',
      borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
      titleFont:{size:10}, bodyFont:{size:11,weight:'700'}
    }},
    scales:{
      x:{display:false},
      y:{
        grid:{color:'rgba(255,255,255,0.04)', drawBorder:false},
        ticks:{color:'#475569', font:{size:10}, maxTicksLimit:5,
          callback:function(v){ return v.toFixed(2)+'%'; }}
      }
    }
  };

  if(nrgChartInst) nrgChartInst.destroy();
  nrgChartInst = new Chart(document.getElementById('nrgChartMain'), {
    type:'line',
    data:{labels:labels, datasets:[
      {label:'BTC %',  data:btcPct,  borderColor:'#4a9eff', backgroundColor:'rgba(74,158,255,0.06)',  fill:true, borderWidth:2, pointRadius:0, tension:0.3},
      {label:'Gold %', data:goldPct, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.06)', fill:true, borderWidth:2, pointRadius:0, tension:0.3},
    ]},
    options: commonOpts
  });

  // Ratio chart defaults to 1D using the already-fetched intraday prices
  drawRatioChart(btcPrices.slice(0,len), goldPrices.slice(0,len), null, 'Intraday (5m candles)');
}

function drawRatioChart(btcPrices, goldPrices, labels, periodLabel){
  var len   = Math.min(btcPrices.length, goldPrices.length);
  var ratio = btcPrices.slice(0,len).map(function(v,i){ return v / (goldPrices[i]*10.76); });
  var lbl   = labels ? labels.slice(0,len) : Array.from({length:len},function(_,i){ return i; });

  if(nrgRatioInst) nrgRatioInst.destroy();
  nrgRatioInst = new Chart(document.getElementById('nrgRatioChart'), {
    type:'line',
    data:{labels:lbl, datasets:[{
      label:'BTC/Gold',
      data:ratio,
      borderColor:'#4a9eff',
      backgroundColor:'rgba(74,158,255,0.06)',
      fill:true, borderWidth:2, pointRadius:0, tension:0.3
    }]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      plugins:{legend:{display:false}, tooltip:{
        mode:'index', intersect:false,
        backgroundColor:'rgba(15,17,23,0.95)',
        titleColor:'#64748b', bodyColor:'#e2e8f0',
        borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
        callbacks:{label:function(ctx){ return 'Ratio: ' + ctx.parsed.y.toFixed(2) + 'x'; }}
      }},
      scales:{
        x:{
          ticks:{color:'#334155', font:{size:9}, maxTicksLimit:6,
            maxRotation:0, autoSkip:true},
          grid:{display:false}
        },
        y:{
          grid:{color:'rgba(255,255,255,0.04)', drawBorder:false},
          ticks:{color:'#475569', font:{size:10}, maxTicksLimit:5,
            callback:function(v){ return v.toFixed(1)+'x'; }}
        }
      }
    }
  });
  if(periodLabel) document.getElementById('ratioPeriodLabel').textContent = periodLabel;
}

async function loadRatioPeriod(period, btn){
  document.querySelectorAll('.ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('ratioPeriodLabel').textContent = 'Loading...';
  try{
    var btcCloses, goldCloses, labels, desc;

    if(period === '1D'){
      var results = await Promise.all([bnBtcKlinesLabeled('30m', 48), fetchIntraday('GLD')]);
      var btcData = results[0]; goldCloses = results[1];
      btcCloses = btcData.closes; labels = btcData.labels;
      desc = 'Intraday (30m candles)';
    } else {
      var now = new Date();
      var days, bnLimit;
      if(period === 'MTD'){
        days = now.getDate(); bnLimit = days;
        desc = 'Month to Date (daily)';
      } else if(period === 'YTD'){
        days = Math.ceil((now - new Date(now.getFullYear(),0,1)) / 864e5);
        bnLimit = days; desc = 'Year to Date (daily)';
      } else {
        days = 365; bnLimit = 365;
        desc = 'Past 12 Months (daily)';
      }
      var results = await Promise.all([
        bnBtcKlinesLabeled('1d', bnLimit),
        fetch(API + '/api/history?symbol=GLD&days=' + days).then(function(r){ return r.json(); })
      ]);
      var btcData = results[0];
      btcCloses = btcData.closes; goldCloses = results[1].closes; labels = results[1].dates;
    }

    var len = Math.min(btcCloses.length, goldCloses.length);
    drawRatioChart(btcCloses.slice(0,len), goldCloses.slice(0,len), labels.slice(0,len), desc);
  }catch(e){
    document.getElementById('ratioPeriodLabel').textContent = 'Failed to load data';
  }
}

function updateRiskGauge(btcPrice, btcPct, goldPrice, goldPct, btcPrices, goldPrices){
  var ratio  = btcPrice / (goldPrice * 10.76); // GLD→oz: 1 share ≈ 0.0929 oz
  var spread = btcPct - goldPct;
  var label, color;
  if(spread > 3){       label = 'RISK-ON';  color = '#22c55e'; }
  else if(spread > 0){  label = 'LEAN-ON';  color = '#86efac'; }
  else if(spread > -3){ label = 'LEAN-OFF'; color = '#f59e0b'; }
  else{                 label = 'RISK-OFF'; color = '#ef4444'; }

  // Cache for when user navigates to the page
  nrgDataCache = {btcPrice, btcPct, goldPrice, goldPct, btcPrices, goldPrices, ratio, spread, label, color};

  var sign = spread >= 0 ? '+' : '';
  var bSign = btcPct >= 0 ? '+' : '';
  var gSign = goldPct >= 0 ? '+' : '';

  document.getElementById('nrgRatio').textContent      = ratio.toFixed(1) + 'x';
  document.getElementById('nrgRatio').style.color      = color;
  document.getElementById('nrgBadge').textContent      = label;
  document.getElementById('nrgBadge').style.background = color + '20';
  document.getElementById('nrgBadge').style.color      = color;
  document.getElementById('nrgBtcPct').textContent     = bSign + btcPct.toFixed(2) + '%';
  document.getElementById('nrgBtcPct').style.color     = btcPct >= 0 ? '#22c55e' : '#ef4444';
  document.getElementById('nrgBtcPrice').textContent   = '$' + fmt(btcPrice);
  document.getElementById('nrgGoldPct').textContent    = gSign + goldPct.toFixed(2) + '%';
  document.getElementById('nrgGoldPct').style.color    = goldPct >= 0 ? '#22c55e' : '#ef4444';
  document.getElementById('nrgGoldPrice').textContent  = '$' + fmt(goldPrice * 10.76); // GLD share → gold spot $/oz
  document.getElementById('nrgSpread').textContent     = sign + spread.toFixed(2) + '%';
  document.getElementById('nrgSpread').style.color     = color;
}

async function loadTickerData(){
  var btcData = null;
  // BTC via Binance
  var btcLive = await bnBtcPrice();
  if(btcLive){
    var el = document.getElementById('t-btc');
    var ec = document.getElementById('tc-btc');
    if(el) el.textContent = fmt(btcLive.price, '$');
    if(ec) ec.innerHTML = chgHtml(btcLive.pct);
    var sv = document.getElementById('s-btc');
    var sc = document.getElementById('sc-btc');
    if(sv) sv.textContent = fmt(btcLive.price, '$');
    if(sc) sc.innerHTML = chgSummHtml(btcLive.pct);
    btcData = btcLive;
    bnBtcKlines('5m', 78).then(function(prices){
      if(prices) drawSparkline('spark-btc', prices, btcLive.pct >= 0);
    });
  }
  // Gold/WTI show the REAL commodity price (GC=F spot $/oz, CL=F crude $/bbl) via the
  // backend /api/quote (handles the '=' fine). Futures have no intraday history through
  // the feed, so sparkSym uses the tracking ETF (GLD/USO) purely for the line's shape.
  var tickers = [
    {id:'spy',   sym:'SPY',      pre:'',  card:'sp',  fmt2:fmt,    special:null},
    {id:'qqq',   sym:'QQQ',      pre:'',  card:'qqq', fmt2:fmt,    special:null},
    {id:'vix',   sym:'%5EVIX',   pre:'',  card:'vix', fmt2:fmt,    special:'vix'},
    {id:'gold',  sym:'GC=F',     pre:'$', card:'gold',fmt2:function(v){return fmt(v,'$');}, special:null, sparkSym:'GLD'},
    {id:'dxy',   sym:'DX-Y.NYB', pre:'',  card:null,  fmt2:fmt,    special:null},
    {id:'10y',   sym:'%5ETNX',   pre:'',  card:'10y', fmt2:function(v){return v.toFixed(3)+'%';}, special:null},
    {id:'wti',   sym:'CL=F',     pre:'$', card:'wti', fmt2:function(v){return fmt(v,'$');}, special:null, sparkSym:'USO'},
    {id:'eur',   sym:'FXE',      pre:'',  card:'eur', fmt2:function(v){return v.toFixed(2);}, special:null},
  ];

  for(var t of tickers){
    var q = await fetchQuote(t.sym);
    if(!q) continue;
    // Ticker bar
    var el = document.getElementById('t-' + t.id);
    var ec = document.getElementById('tc-' + t.id);
    if(el) el.textContent = fmt(q.price, t.pre);
    if(ec) ec.innerHTML = chgHtml(q.pct);

    // Summary card
    if(t.card){
      var sv = document.getElementById('s-' + t.card);
      var sc = document.getElementById('sc-' + t.card);
      if(sv) sv.textContent = t.fmt2(q.price);
      if(t.special === 'vix'){
        if(sc) sc.innerHTML = q.price > 30 ? '<span class="sc-chg warn">⚡ ELEVATED</span>' : q.price > 20 ? '<span class="sc-chg warn">🟡 CAUTION</span>' : '<span class="sc-chg up">🟢 CALM</span>';
        var regime = q.price > 30 ? 'RISK-OFF' : q.price > 22 ? 'FRAGILE' : 'NEUTRAL';
        var rc = q.price > 30 ? '#ef4444' : q.price > 22 ? '#f59e0b' : '#22c55e';
        document.getElementById('regimeVal').textContent = regime;
        document.getElementById('regimeVal').style.color = rc;
        document.getElementById('regimeDot').style.background = rc;
      } else {
        if(sc) sc.innerHTML = chgSummHtml(q.pct);
      }
      // Sparkline
      (function(tid, tcardId, tpct){
        fetchIntraday(tid).then(function(prices){
          if(prices) drawSparkline('spark-' + tcardId, prices, tpct >= 0);
        });
      })(t.sparkSym || t.sym, t.card, q.pct);
    }
  }
  if(btcData){
    // The BTC/Gold ratio math is calibrated to GLD (×10.76 → oz), so fetch GLD directly
    // here rather than reusing the ticker's gold value (now GC=F spot).
    var gldQ = await fetchQuote('GLD');
    if(gldQ){
      Promise.all([fetchIntraday('BTC-USD'), fetchIntraday('GLD')]).then(function(results){
        var btcCloses = results[0], goldCloses = results[1];
        var btcPct = btcData.pct, goldPct = gldQ.pct;
        if(btcCloses && btcCloses.length > 1)  btcPct  = (btcCloses[btcCloses.length-1]   / btcCloses[0]   - 1) * 100;
        if(goldCloses && goldCloses.length > 1) goldPct = (goldCloses[goldCloses.length-1] / goldCloses[0] - 1) * 100;
        updateRiskGauge(btcData.price, btcPct, gldQ.price, goldPct, btcCloses, goldCloses);
        // If user is already on the page, draw immediately
        if(currentPage === 'btcgold' && btcCloses && goldCloses){
          drawNrgCharts(btcCloses, goldCloses);
        }
      });
    }
  }
}

// ── TOPIC → VERIFIED UNSPLASH PHOTO ──────────────────────
var PHOTOS = {
  housing:    ['1560518883-ce09059eeffa','1568605114967-8130f3a36994','1512917774080-9991f1c4c750'],
  fed:        ['1554768804-50c1e2b50a6e','1590283603385-17ffb3a7f29f'],
  trade:      ['1558618666-fcd25c85cd64','1494412519320-cd0b0f10c05a'],
  oil:        ['1504711434969-e33886168f5c','1578662996442-48f60103fc96'],
  gold:       ['1610375461246-83df859d849d'],
  crypto:     ['1518546305927-5a555bb7020d'],
  tech:       ['1526374965328-7f61d4dc18c5'],
  jobs:       ['1521737604893-d14cc237f11d','1497366216548-37526070297c'],
  geo:        ['1451187580459-43490279c0fa','1559027615-cd4628902d4a'],
  stocks:     ['1611974789855-9c2a0a7236a3','1590283603385-17ffb3a7f29f'],
};

function headlineToPhoto(headline){
  var h = headline.toLowerCase();
  var key =
    /hous|real estate|mortgage|home price|propert/.test(h) ? 'housing' :
    /fed|federal reserve|fomc|interest rate|powell/.test(h) ? 'fed' :
    /tariff|trade war|import|export|customs|shipping/.test(h) ? 'trade' :
    /oil|energy|opec|crude|wti|brent/.test(h)  ? 'oil' :
    /gold|silver|precious/.test(h)              ? 'gold' :
    /bitcoin|crypto|ethereum|blockchain/.test(h)? 'crypto' :
    /tech|chip|semiconductor|ai|software/.test(h)? 'tech' :
    /job|employ|payroll|labor/.test(h)          ? 'jobs' :
    /geopolit|war|conflict|sanction/.test(h)    ? 'geo' : 'stocks';
  var arr = PHOTOS[key];
  var id  = arr[Math.floor(Math.random() * arr.length)];
  return 'https://images.unsplash.com/photo-' + id + '?w=880&h=380&fit=crop&crop=entropy&q=85';
}

function _hashStr(s){
  var h=0; for(var i=0;i<s.length;i++){h=(Math.imul(31,h)+s.charCodeAt(i))|0;} return h;
}

// Returns the best available image for a story:
// 1. og:image scraped from the article page (exact publisher image)
// 2. Loremflickr keyword image (topic-relevant)
// 3. Hardcoded Unsplash fallback by category
function storyImageUrl(story){
  // Prefer publisher's own og:image
  if(story.image_url && story.image_url.startsWith('http')){
    return story.image_url;
  }
  // Loremflickr with extracted keywords
  var q = (story.image_query || '').trim() || 'stock market finance';
  var keywords = q.split(/\s+/).slice(0, 4).join(',');
  var lock = Math.abs(_hashStr(story.title||''));
  return 'https://loremflickr.com/1200/630/' + keywords + '?lock=' + lock;
}

// ── CATALYST IMAGE ────────────────────────────────────────
function loadCatalystImage(topic){
  var imgEl    = document.getElementById('catalystImg');
  var genBadge = document.getElementById('catalystGenerating');

  imgEl.onload = null;
  imgEl.onerror = null;
  imgEl.classList.remove('loaded');

  var url = headlineToPhoto(topic);

  imgEl.onload  = function(){ imgEl.classList.add('loaded'); genBadge.classList.add('hidden'); };
  imgEl.onerror = function(){ genBadge.classList.add('hidden'); };
  genBadge.classList.remove('hidden');
  imgEl.src = url;
}

// ── LOAD NEWS ─────────────────────────────────────────────
// ── SIDEBAR: Economic Calendar ────────────────────────────────────────────────
async function loadCalendar(){
  try{
    var r = await fetch(API + '/api/econ-calendar');
    var events = await r.json();
    var ilNow = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jerusalem'}));
    var today = ilNow.toISOString().slice(0,10);
    document.getElementById('calDate').textContent = ilNow.toLocaleDateString('en-GB',{day:'numeric',month:'short'});

    var todayEvents = events.filter(function(e){
      return e.date && e.date.slice(0,10) === today && (e.impact==='High'||e.impact==='Medium');
    });
    if(!todayEvents.length){
      todayEvents = events.filter(function(e){ return e.date && e.date.slice(0,10) === today; }).slice(0,6);
    }
    if(!todayEvents.length){
      document.getElementById('calList').innerHTML = '<div style="color:#334155;font-size:11px;padding:4px 0">No major events today</div>';
      return;
    }
    todayEvents.sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); });
    document.getElementById('calList').innerHTML = todayEvents.slice(0,7).map(function(e){
      var imp = (e.impact||'').toLowerCase();
      var t = e.date ? new Date(e.date).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jerusalem'}) : '—';
      var actual = e.actual ? '<span style="color:#22c55e;font-size:10px;font-weight:700">'+e.actual+'</span>' : '';
      return '<div class="cal-row">'
        +'<div class="cal-impact '+imp+'"></div>'
        +'<div class="cal-time">'+t+'</div>'
        +'<div class="cal-title">'+e.title+'</div>'
        +(actual?'<div class="cal-actual">'+e.actual+'</div>':'')
        +'</div>';
    }).join('');
  }catch(e){}
}

// ── SIDEBAR: Sector Pulse ─────────────────────────────────────────────────────
async function loadSectorPulse(){
  try{
    var r = await fetch(API+'/api/sectors');
    var d = await r.json();
    var secs = (d.sectors||[]).slice(0,8);
    var maxAbs = Math.max(...secs.map(function(s){return Math.abs(s.pct||0)}), 0.1);
    var SECTOR_NAMES = {XLK:'Technology',XLV:'Healthcare',XLF:'Financials',XLY:'Cons. Discr.',XLP:'Cons. Staples',XLE:'Energy',XLI:'Industrials',XLB:'Materials',XLRE:'Real Estate',XLU:'Utilities',XLC:'Comm. Services'};
    document.getElementById('sectorPulse').innerHTML = secs.map(function(s){
      var pct = s.pct||0;
      var w   = Math.round(Math.abs(pct)/maxAbs*100);
      var col = pct>=0?'#22c55e':'#ef4444';
      var sym = SECTOR_NAMES[s.symbol] || s.symbol;
      return '<div class="sector-bar-row">'
        +'<div class="sector-bar-label">'+sym+'</div>'
        +'<div class="sector-bar-track"><div class="sector-bar-fill" style="width:'+w+'%;background:'+col+'"></div></div>'
        +'<div class="sector-bar-pct" style="color:'+col+'">'+(pct>=0?'+':'')+pct.toFixed(1)+'%</div>'
        +'</div>';
    }).join('');
  }catch(e){}
}

// ── News Carousel ──────────────────────────────────────────
var _carouselStories=[],_carouselIdx=0,_carouselTimer=null,_carouselProgRAF=null,_carouselProgStart=0;

function _carouselGrad(cat){
  var G={
    'MACRO':'linear-gradient(140deg,rgba(37,99,235,.28) 0%,rgba(10,18,50,.75) 100%)',
    'MARKETS':'linear-gradient(140deg,rgba(22,163,74,.24) 0%,rgba(5,28,16,.8) 100%)',
    'EARNINGS':'linear-gradient(140deg,rgba(124,58,237,.26) 0%,rgba(28,8,60,.8) 100%)',
    'CRYPTO':'linear-gradient(140deg,rgba(234,88,12,.26) 0%,rgba(60,18,4,.8) 100%)',
    'GEO':'linear-gradient(140deg,rgba(220,38,38,.26) 0%,rgba(55,8,8,.8) 100%)',
    'TECH':'linear-gradient(140deg,rgba(14,165,233,.26) 0%,rgba(4,22,45,.8) 100%)',
    'ENERGY':'linear-gradient(140deg,rgba(245,158,11,.26) 0%,rgba(55,28,4,.8) 100%)'
  };
  return G[cat]||G['MARKETS'];
}

function _buildCarouselSlide(s,idx,total){
  var cat=s.category||'MARKETS',t=s.pub?_newsTimeAgo(s.pub):'';
  var imgUrl=storyImageUrl(s);
  var safeTitle=s.title.replace(/'/g,'&apos;').replace(/"/g,'&quot;');
  var safeLink=(s.link||'').replace(/'/g,"\\'");
  var dots='';
  for(var i=0;i<total;i++)
    dots+='<div class="car-dot'+(i===idx?' active':'')+'" onclick="event.stopPropagation();goCarousel('+i+')"></div>';
  return '<div class="car-card" style="background:'+_carouselGrad(cat)+'" onclick="_openStoryArticle('+idx+')">'
    +'<img class="car-bg-img" src="'+imgUrl+'" alt="" onload="this.classList.add(\'loaded\')" onerror="this.style.display=\'none\'">'
    +'<div class="car-overlay"></div>'
    +'<div class="car-content">'
      +'<span class="car-cat wsj-cat wsj-cat-'+cat+'">'+cat+'</span>'
      +'<div class="car-headline">'+s.title+'</div>'
      +(s.desc?'<div class="car-excerpt">'+s.desc+'</div>':'')
      +'<div class="car-foot"><span class="wsj-src">'+s.source+'</span>'+(t?'<span class="wsj-dot"></span><span class="wsj-time">'+t+'</span>':'')+'</div>'
      +'<div class="car-bottom">'
        +'<div class="car-arrows"><button class="car-btn" onclick="event.stopPropagation();stepCarousel(-1)">&#8249;</button></div>'
        +'<div class="car-dots">'+dots+'</div>'
        +'<div class="car-arrows"><button class="car-btn" onclick="event.stopPropagation();stepCarousel(1)">&#8250;</button></div>'
      +'</div>'
      +'<div class="car-progress"><div class="car-progress-fill" id="carProgressFill"></div></div>'
    +'</div>'
    +'</div>';
}

function goCarousel(idx){
  var max=Math.min(_carouselStories.length,5);
  if(!max)return;
  _carouselIdx=((idx%max)+max)%max;
  clearTimeout(_carouselTimer);
  if(_carouselProgRAF)cancelAnimationFrame(_carouselProgRAF);
  var el=document.getElementById('newsCarousel');
  if(!el)return;
  el.innerHTML=_buildCarouselSlide(_carouselStories[_carouselIdx],_carouselIdx,max);
  _carouselProgStart=Date.now();
  (function tick(){
    var f=document.getElementById('carProgressFill');
    if(!f)return;
    var pct=Math.min(100,(Date.now()-_carouselProgStart)/60000*100);
    f.style.width=pct+'%';
    if(pct<100)_carouselProgRAF=requestAnimationFrame(tick);
  })();
  _carouselTimer=setTimeout(function(){goCarousel(_carouselIdx+1);},60000);
}
function stepCarousel(dir){goCarousel(_carouselIdx+dir);}

async function loadNews(){
  try{
    var r=await fetch(API+'/api/top-stories');
    var d=await r.json();
    if(!d.stories||!d.stories.length){
      // Curated archive not populated yet (first run after a fresh install
      // takes a few minutes to write+illustrate the first batch) — fall
      // back to the raw wire feed so the home page isn't empty meanwhile.
      r=await fetch(API+'/api/news');
      d=await r.json();
    }
    var stories=d.stories||[];
    if(!stories.length)return;
    // Keep all 9 (carousel only cycles the first 5 — see goCarousel's
    // Math.min(...,5) — but the secondary grid below opens stories at
    // indices 5-8 via openArticleReader, which reads this same array).
    _carouselStories=stories.slice(0,9);
    _carouselIdx=0;
    var el=document.getElementById('newsList');
    if(!el)return;
    el.innerHTML='<div id="newsCarousel"></div><div class="news-secondary-grid" id="newsSecondary"></div>';
    goCarousel(0);
    var sec=stories.slice(5,9);
    document.getElementById('newsSecondary').innerHTML=sec.map(function(s,i){
      var cat=s.category||'MARKETS',t=s.pub?_newsTimeAgo(s.pub):'';
      var realIdx=i+5;
      return '<div class="news-sec-card" onclick="openArticleReader('+realIdx+')">'
        +'<div class="news-sec-meta"><span class="wsj-cat wsj-cat-'+cat+'">'+cat+'</span>'+(t?'<span class="wsj-dot"></span><span class="wsj-time">'+t+'</span>':'')+'</div>'
        +'<div class="news-sec-headline">'+s.title+'</div>'
        +'</div>';
    }).join('');
  }catch(e){console.error('loadNews:',e);}
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

// ══════════════════════════════════════════════════════════
//  CRYPTO SCANNER — CoinGecko + DeFiLlama + GitHub
// ══════════════════════════════════════════════════════════
var scannerData = [];
var scannerTab = 'squeeze';
var scannerSortCol = -1;
var scannerSortAsc = true;

var SCANNER_TABS = {
  squeeze:      { cols: [{h:'CHAIN',k:'name',fmt:'name'},{h:'SYMBOL',k:'symbol',fmt:'sym'},{h:'PRICE',k:'price',fmt:'price'},{h:'TODAY %',k:'pct_24h',fmt:'pct'},{h:'7D %',k:'pct_7d',fmt:'pct'},{h:'VOLUME',k:'volume_24h',fmt:'usd'},{h:'MCAP',k:'market_cap',fmt:'usd'},{h:'VOL/MCAP',k:'vol_mcap_pct',fmt:'pct'}] },
  fundamentals: { cols: [{h:'CHAIN',k:'name',fmt:'name'},{h:'SYMBOL',k:'symbol',fmt:'sym'},{h:'MCAP',k:'market_cap',fmt:'usd'},{h:'FDV',k:'fdv',fmt:'usd'},{h:'TVL',k:'tvl',fmt:'usd'},{h:'MCAP/TVL',k:'mcap_tvl',fmt:'ratio'},{h:'STABLECOINS',k:'stablecoin_supply',fmt:'usd'}] },
  activity:     { cols: [{h:'CHAIN',k:'name',fmt:'name'},{h:'SYMBOL',k:'symbol',fmt:'sym'},{h:'TVL',k:'tvl',fmt:'usd'},{h:'STABLECOINS',k:'stablecoin_supply',fmt:'usd'},{h:'DEV COMMITS 30D',k:'dev_commits_30d',fmt:'int'},{h:'MCAP',k:'market_cap',fmt:'usd'},{h:'MCAP/TVL',k:'mcap_tvl',fmt:'ratio'}] }
};

function switchScannerTab(tab, btn){
  scannerTab = tab;
  document.querySelectorAll('#scannerTabs .ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  scannerSortCol = -1; scannerSortAsc = true;
  renderScannerTable();
}

function fmtScannerVal(val, fmt){
  if(val === null || val === undefined) return '<span style="color:#334155">—</span>';
  if(fmt === 'name') return '<span class="tk-name">' + val + '</span>';
  if(fmt === 'sym')  return '<span class="tk-sym">' + val + '</span>';
  if(fmt === 'pct'){ var cls=val>0?'up':val<0?'dn':''; var sign=val>0?'+':''; return '<span class="'+cls+'">'+sign+val.toFixed(2)+'%</span>'; }
  if(fmt === 'price'){ if(val>=1000) return '$'+val.toLocaleString('en',{maximumFractionDigits:0}); if(val>=1) return '$'+val.toFixed(2); return '$'+val.toFixed(4); }
  if(fmt === 'usd'){ if(val>=1e12) return '$'+(val/1e12).toFixed(2)+'T'; if(val>=1e9) return '$'+(val/1e9).toFixed(2)+'B'; if(val>=1e6) return '$'+(val/1e6).toFixed(2)+'M'; return '$'+val.toLocaleString('en',{maximumFractionDigits:0}); }
  if(fmt === 'ratio') return val.toFixed(2)+'x';
  if(fmt === 'int') return val.toLocaleString('en');
  return val;
}

async function loadScannerData(){
  document.getElementById('scannerStatus').textContent = 'Fetching live data...';
  document.getElementById('scannerStatus').style.color = '#64748b';
  try{
    var r = await fetch(API + '/api/crypto-scanner');
    var d = await r.json();
    scannerData = d.chains || [];
    var now = new Date();
    document.getElementById('scannerStatus').textContent = '● Live · Updated ' + now.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('scannerStatus').style.color = '#22c55e';
    renderScannerTable();
  }catch(e){
    document.getElementById('scannerStatus').textContent = 'Error loading data';
    document.getElementById('scannerStatus').style.color = '#ef4444';
  }
}

function renderScannerTable(){
  if(!scannerData || !scannerData.length){
    document.getElementById('scannerHead').innerHTML = '';
    document.getElementById('scannerBody').innerHTML = '<tr><td style="padding:40px;text-align:center;color:#475569" colspan="10">No data — click Refresh</td></tr>';
    return;
  }
  var cols = SCANNER_TABS[scannerTab].cols;
  var rows = scannerData.slice();
  if(scannerSortCol >= 0){
    var sk = cols[scannerSortCol].k;
    rows.sort(function(a,b){ var va=a[sk],vb=b[sk]; if(va==null) return 1; if(vb==null) return -1; return scannerSortAsc?va-vb:vb-va; });
  }
  var headHtml = '<tr>';
  cols.forEach(function(c,i){ var arrow=scannerSortCol===i?(scannerSortAsc?' ▲':' ▼'):''; headHtml+='<th onclick="sortScanner('+i+')">'+c.h+arrow+'</th>'; });
  headHtml += '</tr>';
  document.getElementById('scannerHead').innerHTML = headHtml;
  var bodyHtml = '';
  rows.forEach(function(row){ bodyHtml+='<tr>'; cols.forEach(function(c){ bodyHtml+='<td>'+fmtScannerVal(row[c.k],c.fmt)+'</td>'; }); bodyHtml+='</tr>'; });
  document.getElementById('scannerBody').innerHTML = bodyHtml;
}

function sortScanner(col){
  if(scannerSortCol === col) scannerSortAsc = !scannerSortAsc;
  else { scannerSortCol = col; scannerSortAsc = false; }
  renderScannerTable();
}

// ══════════════════════════════════════════════════════════
//  MARKET BREADTH — SPY vs RSP
// ══════════════════════════════════════════════════════════
async function loadBreadthGauge(){
  document.getElementById('breadthStatus').textContent = 'Loading...';
  try{
    var results = await Promise.all([fetchQuote('SPY'), fetchQuote('RSP')]);
    var spy = results[0], rsp = results[1];
    if(!spy || !rsp) throw new Error('fetch failed');

    var spyPct = spy.pct, rspPct = rsp.pct;
    var spread = rspPct - spyPct; // positive = broad, negative = narrow

    // Bars: scale relative to max absolute move, min 20% width for visibility
    var maxAbs = Math.max(Math.abs(spyPct), Math.abs(rspPct), 0.1);
    var spyW = Math.max(20, Math.abs(spyPct) / maxAbs * 100);
    var rspW = Math.max(20, Math.abs(rspPct) / maxAbs * 100);
    var spyColor = spyPct >= 0 ? '#22c55e' : '#ef4444';
    var rspColor = rspPct >= 0 ? '#22c55e' : '#ef4444';

    document.getElementById('breadthSpyPct').textContent = (spyPct >= 0 ? '+' : '') + spyPct.toFixed(2) + '%';
    document.getElementById('breadthSpyPct').style.color = spyColor;
    document.getElementById('breadthSpyBar').style.width = spyW + '%';
    document.getElementById('breadthSpyBar').style.background = spyColor;

    document.getElementById('breadthRspPct').textContent = (rspPct >= 0 ? '+' : '') + rspPct.toFixed(2) + '%';
    document.getElementById('breadthRspPct').style.color = rspColor;
    document.getElementById('breadthRspBar').style.width = rspW + '%';
    document.getElementById('breadthRspBar').style.background = rspColor;

    document.getElementById('breadthSpread').textContent = 'spread: ' + (spread >= 0 ? '+' : '') + spread.toFixed(2) + '%';

    // Verdict
    var label, color, bg, interpret;
    if(spread > 0.5){
      label = 'BROAD'; color = '#22c55e'; bg = 'rgba(34,197,94,0.12)';
      interpret = 'Equal-weight outperforming — rally has broad participation across all 500 stocks.';
    } else if(spread > 0.1){
      label = 'HEALTHY'; color = '#86efac'; bg = 'rgba(134,239,172,0.1)';
      interpret = 'Slight breadth advantage — most stocks participating, no major concentration concerns.';
    } else if(spread > -0.1){
      label = 'MIXED'; color = '#f59e0b'; bg = 'rgba(245,158,11,0.1)';
      interpret = 'SPY and RSP moving in tandem — no clear breadth signal today.';
    } else if(spread > -0.5){
      label = 'NARROW'; color = '#fb923c'; bg = 'rgba(251,146,60,0.1)';
      interpret = 'Cap-weight leading — mega caps (AAPL, NVDA, MSFT) driving the index, broader market lagging.';
    } else {
      label = 'MEGA CAP'; color = '#ef4444'; bg = 'rgba(239,68,68,0.12)';
      interpret = 'Strong narrow leadership — a handful of mega caps masking broad market weakness.';
    }

    var pill = document.getElementById('breadthLabel');
    pill.textContent = label;
    pill.style.color = color;
    pill.style.background = bg;
    document.getElementById('breadthInterpret').textContent = interpret;
    document.getElementById('breadthStatus').textContent = '● Live';
    document.getElementById('breadthStatus').style.color = '#22c55e';
  }catch(e){
    document.getElementById('breadthStatus').textContent = 'Error loading';
  }
}

//  MARKET BREADTH PAGE
// ══════════════════════════════════════════════════════════
async function loadBreadthPage(){
  document.getElementById('bpStatus').textContent = 'Loading...';
  document.getElementById('bpTierBars').innerHTML = '<div style="color:#334155;font-size:12px;padding:20px 0">Fetching data...</div>';
  document.getElementById('bpDiagnosis').textContent = '';
  try{
    // Fetch SPY, RSP, QQQ (mega-cap), MDY (mid), IWM (small) in parallel
    var results = await Promise.all([
      fetchQuote('SPY'),
      fetchQuote('RSP'),
      fetchQuote('QQQ'),
      fetchQuote('MDY'),
      fetchQuote('IWM')
    ]);
    var spy = results[0], rsp = results[1], qqq = results[2], mdy = results[3], iwm = results[4];
    var spyPct = spy.pct, rspPct = rsp.pct, qqqPct = qqq.pct, mdyPct = mdy.pct, iwmPct = iwm.pct;
    var spread = rspPct - spyPct;

    // ── SPY vs RSP gauge ──
    var maxAbs  = Math.max(Math.abs(spyPct), Math.abs(rspPct), 0.5);
    var spyColor = spyPct >= 0 ? 'var(--green)' : 'var(--red)';
    var rspColor = rspPct >= 0 ? 'var(--green)' : 'var(--red)';

    document.getElementById('bpSpyPct').textContent = (spyPct >= 0 ? '+' : '') + spyPct.toFixed(2) + '%';
    document.getElementById('bpSpyPct').style.color  = spyColor;
    document.getElementById('bpSpyBar').style.width  = Math.min(Math.abs(spyPct) / maxAbs * 100, 100) + '%';
    document.getElementById('bpSpyBar').style.background = spyColor;
    document.getElementById('bpRspPct').textContent = (rspPct >= 0 ? '+' : '') + rspPct.toFixed(2) + '%';
    document.getElementById('bpRspPct').style.color  = rspColor;
    document.getElementById('bpRspBar').style.width  = Math.min(Math.abs(rspPct) / maxAbs * 100, 100) + '%';
    document.getElementById('bpRspBar').style.background = rspColor;
    document.getElementById('bpSpread').textContent = 'spread: ' + (spread >= 0 ? '+' : '') + spread.toFixed(2) + '%';

    var verdict, verdictColor, verdictBg, interpret;
    if(spread > 0.5){
      verdict='BROAD'; verdictColor='#22c55e'; verdictBg='rgba(34,197,94,0.12)';
      interpret='Broad participation — equal-weight outpacing cap-weight. Rally is healthy and widespread.';
    } else if(spread > 0.1){
      verdict='HEALTHY'; verdictColor='#4a9eff'; verdictBg='rgba(74,158,255,0.12)';
      interpret='Slight breadth advantage — most stocks participating, no major concentration concerns.';
    } else if(spread > -0.1){
      verdict='MIXED'; verdictColor='#f59e0b'; verdictBg='rgba(245,158,11,0.12)';
      interpret='SPY and RSP moving in tandem — no clear breadth signal today.';
    } else if(spread > -0.5){
      verdict='NARROW'; verdictColor='#f97316'; verdictBg='rgba(249,115,22,0.12)';
      interpret='Cap-weight leading — large-caps carrying the index while smaller names lag.';
    } else {
      verdict='MEGA CAP'; verdictColor='#ef4444'; verdictBg='rgba(239,68,68,0.12)';
      interpret='Strongly concentrated — mega-cap stocks driving SPY while equal-weight lags significantly.';
    }
    var pill = document.getElementById('bpVerdict');
    pill.textContent = verdict;
    pill.style.color = verdictColor;
    pill.style.background = verdictBg;
    document.getElementById('bpInterpret').textContent = interpret;

    // ── Cap Tier bars ──
    var tiers = [
      { label: 'Nasdaq 100', sub: 'Mega-cap tech', sym: 'QQQ', pct: qqqPct },
      { label: 'S&P 500',    sub: 'Large-cap',     sym: 'SPY', pct: spyPct },
      { label: 'S&P 500 EW', sub: 'Equal-weight',  sym: 'RSP', pct: rspPct },
      { label: 'S&P 400',    sub: 'Mid-cap',        sym: 'MDY', pct: mdyPct },
      { label: 'Russell 2000',sub:'Small-cap',      sym: 'IWM', pct: iwmPct }
    ];
    var chartMax = Math.max.apply(null, tiers.map(function(t){ return Math.abs(t.pct); }));
    chartMax = Math.max(chartMax, 0.5);
    var spyBarW  = Math.abs(spyPct) / chartMax * 100;

    var html = '';
    tiers.forEach(function(t){
      var aboveSpy = t.sym !== 'SPY' && t.pct > spyPct;
      var belowSpy = t.sym !== 'SPY' && t.pct < spyPct;
      var isSpy    = t.sym === 'SPY';
      var barColor = isSpy ? '#4a9eff' : (t.pct >= 0 ? 'var(--green)' : 'var(--red)');
      var barOpacity = isSpy ? '0.7' : (aboveSpy ? '0.8' : '0.5');
      var barW     = Math.abs(t.pct) / chartMax * 100;
      var sign     = t.pct >= 0 ? '+' : '';
      var diff     = t.sym !== 'SPY' ? (t.pct - spyPct) : null;
      var diffStr  = diff !== null ? ('vs SPY ' + (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%') : 'benchmark';
      var diffColor= diff !== null ? (diff >= 0 ? '#22c55e' : '#ef4444') : '#4a9eff';
      var tagBg    = isSpy ? 'rgba(74,158,255,0.08)' : 'transparent';

      html +=
        '<div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--border);border-radius:4px;background:' + tagBg + ';margin-bottom:2px">' +
          '<div style="width:130px;flex-shrink:0">' +
            '<div style="font-size:12px;font-weight:600;color:' + (isSpy ? '#4a9eff' : '#cbd5e1') + '">' + t.label + '</div>' +
            '<div style="font-size:10px;color:#475569;margin-top:1px">' + t.sym + ' · ' + t.sub + '</div>' +
          '</div>' +
          '<div style="flex:1;position:relative;background:rgba(255,255,255,0.04);border-radius:3px;height:10px;overflow:visible">' +
            '<div style="width:' + barW.toFixed(1) + '%;height:100%;background:' + barColor + ';border-radius:3px;opacity:' + barOpacity + ';position:absolute;left:0;top:0"></div>' +
            (isSpy ? '' : '<div style="position:absolute;top:-3px;left:' + spyBarW.toFixed(1) + '%;width:2px;height:16px;background:#4a9eff;opacity:0.5;border-radius:1px"></div>') +
          '</div>' +
          '<div style="width:58px;text-align:right;font-size:13px;font-weight:700;color:' + barColor + ';font-family:\'Courier New\',monospace;flex-shrink:0">' + sign + t.pct.toFixed(2) + '%</div>' +
          '<div style="width:80px;text-align:right;font-size:10px;font-weight:500;color:' + diffColor + ';flex-shrink:0">' + diffStr + '</div>' +
        '</div>';
    });
    document.getElementById('bpTierBars').innerHTML = html;

    // ── Diagnosis ──
    var lagging = [], leading = [];
    if(iwmPct < spyPct - 0.2) lagging.push('small-caps (IWM)');
    if(mdyPct < spyPct - 0.2) lagging.push('mid-caps (MDY)');
    if(iwmPct > spyPct + 0.2) leading.push('small-caps (IWM)');
    if(mdyPct > spyPct + 0.2) leading.push('mid-caps (MDY)');
    var diagText;
    if(leading.length > 0 && lagging.length === 0){
      diagText = 'Risk-on breadth — ' + leading.join(' and ') + ' leading SPY. Broad participation across cap tiers.';
    } else if(lagging.length === 2){
      diagText = 'Narrow rally — mid and small caps both lagging SPY. Move driven by large/mega-cap names only.';
    } else if(lagging.length === 1 && iwmPct < spyPct - 0.2){
      diagText = 'Small caps lagging — rally concentrated in large-caps. Watch IWM for confirmation.';
    } else if(lagging.length === 1){
      diagText = 'Mid-caps lagging while small-caps hold. Mixed internals.';
    } else {
      diagText = 'Cap tiers moving in line with SPY — no significant breadth divergence today.';
    }
    document.getElementById('bpDiagnosis').textContent = diagText;

    // ── Summary cards ──
    var qvs = qqqPct - spyPct, mvs = mdyPct - spyPct, ivs = iwmPct - spyPct;
    var el;
    el = document.getElementById('bpQvS');
    el.textContent = (qvs >= 0 ? '+' : '') + qvs.toFixed(2) + '%';
    el.style.color = qvs >= 0 ? 'var(--green)' : 'var(--red)';
    el = document.getElementById('bpMvS');
    el.textContent = (mvs >= 0 ? '+' : '') + mvs.toFixed(2) + '%';
    el.style.color = mvs >= 0 ? 'var(--green)' : 'var(--red)';
    el = document.getElementById('bpIvS');
    el.textContent = (ivs >= 0 ? '+' : '') + ivs.toFixed(2) + '%';
    el.style.color = ivs >= 0 ? 'var(--green)' : 'var(--red)';

    document.getElementById('bpStatus').textContent =
      'Updated ' + new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) + ' · QQQ / SPY / RSP / MDY / IWM';
  }catch(e){
    document.getElementById('bpStatus').textContent = 'Error loading';
    document.getElementById('bpTierBars').innerHTML = '<div style="color:#ef4444;font-size:12px;padding:20px 0">Error: ' + e.message + '</div>';
  }
}

//  SECTOR STRENGTH
// ══════════════════════════════════════════════════════════
async function loadSectors(){
  document.getElementById('sectorsUpdated').textContent = 'Loading...';
  document.getElementById('sectorBars').innerHTML = '<div style="color:#334155;font-size:12px;padding:20px 0">Fetching sector data...</div>';
  try{
    var r = await fetch(API + '/api/sectors');
    var d = await r.json();
    if(d.error) throw new Error(d.error);
    var sectors = d.sectors;
    var maxAbs = Math.max.apply(null, sectors.map(function(s){ return Math.abs(s.pct); }));
    maxAbs = Math.max(maxAbs, 1);

    var html = '';
    sectors.forEach(function(s){
      var isPos = s.pct >= 0;
      var color = isPos ? 'var(--green)' : 'var(--red)';
      var barW  = Math.abs(s.pct) / maxAbs * 100;
      var sign  = isPos ? '+' : '';
      html +=
        '<div onclick="openSectorDetail(\'' + s.symbol + '\',\'' + s.name + '\')" ' +
        'style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;border-radius:4px;padding-left:4px" ' +
        'onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'none\'">' +
          '<div style="width:130px;font-size:12px;font-weight:600;color:#cbd5e1;flex-shrink:0">' + s.name + '</div>' +
          '<div style="width:42px;font-size:10px;color:#475569;flex-shrink:0">' + s.symbol + '</div>' +
          '<div style="flex:1;background:rgba(255,255,255,0.04);border-radius:3px;height:8px;overflow:hidden">' +
            '<div style="width:' + barW.toFixed(1) + '%;height:100%;background:' + color + ';border-radius:3px;opacity:0.85"></div>' +
          '</div>' +
          '<div style="width:64px;text-align:right;font-size:12px;font-weight:700;color:' + color + ';font-family:\'Courier New\',monospace;flex-shrink:0">' + sign + s.pct.toFixed(2) + '%</div>' +
          '<div style="width:16px;text-align:right;font-size:11px;color:#334155;flex-shrink:0">›</div>' +
        '</div>';
    });
    document.getElementById('sectorBars').innerHTML = html;
    document.getElementById('sectorsUpdated').textContent =
      'Updated ' + new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) + ' · Click any sector to drill down';
  }catch(e){
    document.getElementById('sectorBars').innerHTML = '<div style="color:#ef4444;font-size:12px;padding:20px 0">Error: ' + e.message + '</div>';
    document.getElementById('sectorsUpdated').textContent = 'Failed to load';
  }
}

var _detailSector = null;
var _detailPeriod = '1d';

function openSectorDetail(symbol, name){
  _detailSector = symbol;
  _detailPeriod = '1d';
  document.getElementById('sectorListView').style.display = 'none';
  document.getElementById('sectorDetailView').style.display = 'block';
  document.getElementById('detailSectorTitle').textContent = name + ' Sub-Sectors';
  // Reset period buttons
  document.querySelectorAll('#detailPeriodBtns .ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  document.querySelector('#detailPeriodBtns .ratio-btn').classList.add('active');
  loadSectorDetail();
}

function closeSectorDetail(){
  document.getElementById('sectorDetailView').style.display = 'none';
  document.getElementById('sectorListView').style.display = 'block';
}

function switchDetailPeriod(period, btn){
  _detailPeriod = period;
  document.querySelectorAll('#detailPeriodBtns .ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  loadSectorDetail();
}

async function loadSectorDetail(){
  document.getElementById('sectorDetailStatus').textContent = 'Loading...';
  document.getElementById('sectorDetailContent').innerHTML =
    '<div style="color:#334155;font-size:12px;padding:20px 0">Fetching data for all sub-sectors...</div>';
  try{
    var url = API + '/api/sector-detail?sector=' + _detailSector + '&period=' + _detailPeriod;
    var r   = await fetch(url);
    var d   = await r.json();
    if(d.error) throw new Error(d.error);
    renderSectorDetail(d);
    var periodLabel = {'1d':'Today','1w':'Past Week','1m':'Past Month','3m':'Past 3 Months'}[_detailPeriod] || _detailPeriod;
    document.getElementById('sectorDetailStatus').textContent =
      periodLabel + ' performance · ' + new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    document.getElementById('sectorDetailContent').innerHTML =
      '<div style="color:#ef4444;font-size:12px;padding:20px 0">Error: ' + e.message + '</div>';
    document.getElementById('sectorDetailStatus').textContent = 'Failed to load';
  }
}

var COMPANY_NAMES = {
  // Tech
  'NVDA':'Nvidia','AMD':'AMD','AVGO':'Broadcom','QCOM':'Qualcomm','MU':'Micron','AMAT':'Applied Materials','LRCX':'Lam Research','TXN':'Texas Instruments','INTC':'Intel',
  'MSFT':'Microsoft','CRM':'Salesforce','ORCL':'Oracle','NOW':'ServiceNow','ADBE':'Adobe','INTU':'Intuit','PANW':'Palo Alto',
  'AAPL':'Apple','CSCO':'Cisco','IBM':'IBM','ACN':'Accenture','DELL':'Dell','HPQ':'HP',
  // Comm Services
  'META':'Meta','GOOGL':'Alphabet','SNAP':'Snap','PINS':'Pinterest','RDDT':'Reddit',
  'VZ':'Verizon','T':'AT&T','TMUS':'T-Mobile',
  'NFLX':'Netflix','DIS':'Disney','WBD':'Warner Bros','PARA':'Paramount',
  // Consumer Disc
  'AMZN':'Amazon','HD':'Home Depot','LOW':'Lowes','TJX':'TJX Companies','ROST':'Ross Stores','BKNG':'Booking Holdings',
  'TSLA':'Tesla','GM':'General Motors','F':'Ford','RIVN':'Rivian',
  'MAR':'Marriott','HLT':'Hilton','MCD':'McDonalds','SBUX':'Starbucks','NKE':'Nike','YUM':'Yum Brands',
  // Financials
  'JPM':'JPMorgan Chase','BAC':'Bank of America','WFC':'Wells Fargo','C':'Citigroup','GS':'Goldman Sachs','MS':'Morgan Stanley',
  'BRK-B':'Berkshire Hathaway','MET':'MetLife','PRU':'Prudential','AFL':'Aflac','TRV':'Travelers',
  'BLK':'BlackRock','SCHW':'Charles Schwab','ICE':'Intercontinental Exchange','CME':'CME Group',
  'USB':'US Bancorp','TFC':'Truist Financial','PNC':'PNC Financial','CFG':'Citizens Financial','FITB':'Fifth Third',
  // Industrials
  'BA':'Boeing','LMT':'Lockheed Martin','RTX':'RTX Corp','NOC':'Northrop Grumman','GD':'General Dynamics','HII':'Huntington Ingalls',
  'UPS':'UPS','FDX':'FedEx','CSX':'CSX Corp','UNP':'Union Pacific','DAL':'Delta Air Lines','UAL':'United Airlines',
  'CAT':'Caterpillar','DE':'John Deere','EMR':'Emerson Electric','HON':'Honeywell','ETN':'Eaton','PH':'Parker Hannifin',
  // Healthcare
  'LLY':'Eli Lilly','JNJ':'Johnson & Johnson','PFE':'Pfizer','MRK':'Merck','ABBV':'AbbVie','BMY':'Bristol-Myers Squibb',
  'AMGN':'Amgen','GILD':'Gilead Sciences','REGN':'Regeneron','VRTX':'Vertex Pharma','BIIB':'Biogen',
  'MDT':'Medtronic','ABT':'Abbott Labs','SYK':'Stryker','BSX':'Boston Scientific','EW':'Edwards Lifesciences',
  'UNH':'UnitedHealth','CVS':'CVS Health','CI':'Cigna','HUM':'Humana',
  // Consumer Staples
  'KO':'Coca-Cola','PEP':'PepsiCo','MDLZ':'Mondelez','GIS':'General Mills','K':'Kellanova','CPB':'Campbell Soup',
  'PG':'Procter & Gamble','CL':'Colgate-Palmolive','KMB':'Kimberly-Clark','CHD':'Church & Dwight',
  'WMT':'Walmart','COST':'Costco','TGT':'Target','KR':'Kroger',
  'MO':'Altria','PM':'Philip Morris',
  // Materials
  'LIN':'Linde','APD':'Air Products','DD':'DuPont','DOW':'Dow Inc','PPG':'PPG Industries','SHW':'Sherwin-Williams','IFF':'Intl Flavors',
  'FCX':'Freeport-McMoRan','NEM':'Newmont','GOLD':'Barrick Gold','ALB':'Albemarle','MP':'MP Materials',
  'VMC':'Vulcan Materials','MLM':'Martin Marietta',
  'IP':'International Paper','PKG':'Packaging Corp','AMCR':'Amcor','SEE':'Sealed Air',
  // Energy
  'XOM':'ExxonMobil','CVX':'Chevron',
  'COP':'ConocoPhillips','EOG':'EOG Resources','DVN':'Devon Energy','MRO':'Marathon Oil','APA':'APA Corp',
  'SLB':'Schlumberger','HAL':'Halliburton','BKR':'Baker Hughes','NOV':'NOV Inc',
  'ET':'Energy Transfer','EPD':'Enterprise Products','WMB':'Williams Companies','KMI':'Kinder Morgan','OKE':'ONEOK',
  // Real Estate
  'EQIX':'Equinix','DLR':'Digital Realty','AMT':'American Tower','CCI':'Crown Castle','SBAC':'SBA Communications',
  'PLD':'Prologis','FR':'First Industrial','EGP':'EastGroup','REXR':'Rexford Industrial',
  'EQR':'Equity Residential','AVB':'AvalonBay','ESS':'Essex Property','MAA':'Mid-America Apt','UDR':'UDR Inc',
  'SPG':'Simon Property','O':'Realty Income','REG':'Regency Centers','KIM':'Kimco Realty','NNN':'NNN REIT',
  'BXP':'Boston Properties','SLG':'SL Green','VNO':'Vornado Realty','HIW':'Highwoods','CUZ':'Cousins Properties',
  'WELL':'Welltower','VTR':'Ventas','DOC':'Healthpeak',
  'PSA':'Public Storage','EXR':'Extra Space','CUBE':'CubeSmart','LSI':'Life Storage',
  // Utilities
  'NEE':'NextEra Energy','DUK':'Duke Energy','SO':'Southern Company','D':'Dominion Energy','AEP':'American Electric Power','EXC':'Exelon','XEL':'Xcel Energy','PCG':'PG&E',
  'SRE':'Sempra','WEC':'WEC Energy','ES':'Eversource','CMS':'CMS Energy','AES':'AES Corp',
  'AWK':'American Water Works','WTRG':'Essential Utilities',
};

function renderSectorDetail(data){
  // Find global max abs pct for consistent bar scaling
  var allPcts = [];
  data.subsectors.forEach(function(sub){
    sub.stocks.forEach(function(s){ allPcts.push(Math.abs(s.pct)); });
  });
  var maxAbs = Math.max.apply(null, allPcts.concat([1]));

  var html = '';
  data.subsectors.forEach(function(sub){
    var avgPos  = sub.avg_pct >= 0;
    var avgColor = avgPos ? 'var(--green)' : 'var(--red)';
    var avgSign  = avgPos ? '+' : '';

    // Sub-sector header
    html += '<div style="margin-bottom:2px;margin-top:20px;display:flex;align-items:center;justify-content:space-between">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569">' + sub.name + '</div>' +
      '<div style="font-size:11px;font-weight:700;color:' + avgColor + '">' + avgSign + sub.avg_pct.toFixed(2) + '% avg</div>' +
    '</div>';

    // Individual stocks
    sub.stocks.forEach(function(s){
      var isPos  = s.pct >= 0;
      var color  = isPos ? 'var(--green)' : 'var(--red)';
      var sign   = isPos ? '+' : '';
      var barW   = Math.abs(s.pct) / maxAbs * 50; // max 50% of container (centered bar)

      var companyName = COMPANY_NAMES[s.symbol] || s.symbol;
      html += '<div onclick="openStockDetail(\'' + s.symbol + '\',\'' + companyName.replace(/'/g,"\\'") + '\')" ' +
        'style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer;border-radius:4px;transition:background .12s" ' +
        'onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
        '<div style="width:170px;flex-shrink:0">' +
          '<div style="font-size:12px;font-weight:600;color:#cbd5e1">' + companyName + '</div>' +
          '<div style="font-size:10px;color:#475569;margin-top:1px">' + s.symbol + '</div>' +
        '</div>' +
        '<div style="flex:1;display:flex;align-items:center;height:6px;position:relative">' +
          '<div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:rgba(255,255,255,0.08)"></div>' +
          (isPos
            ? '<div style="position:absolute;left:50%;width:' + barW.toFixed(1) + '%;height:100%;background:' + color + ';border-radius:0 2px 2px 0;opacity:0.8"></div>'
            : '<div style="position:absolute;right:50%;width:' + barW.toFixed(1) + '%;height:100%;background:' + color + ';border-radius:2px 0 0 2px;opacity:0.8"></div>') +
        '</div>' +
        '<div style="width:56px;text-align:right;font-size:11px;font-weight:700;color:' + color + ';font-family:\'Courier New\',monospace;flex-shrink:0">' + sign + s.pct.toFixed(2) + '%</div>' +
        '<div style="width:60px;text-align:right;font-size:10px;color:#475569;font-family:\'Courier New\',monospace;flex-shrink:0">$' + s.price.toFixed(2) + '</div>' +
        '<div style="width:14px;text-align:right;font-size:11px;color:#334155;flex-shrink:0">›</div>' +
      '</div>';
    });
  });

  document.getElementById('sectorDetailContent').innerHTML = html;
}

// ── Stock detail ──────────────────────────────────────────
function openStockDetail(symbol, name){
  document.getElementById('sectorDetailView').style.display = 'none';
  document.getElementById('stockDetailView').style.display = 'block';
  document.getElementById('stockDetailBreadcrumb').textContent = 'Equities · ' + (_detailSector || '') + ' · ' + name;
  document.getElementById('stockDetailName').textContent = name;
  document.getElementById('stockDetailSym').textContent = symbol;
  document.getElementById('stockDetailPrice').textContent = '—';
  document.getElementById('stockDetailMcap').textContent = '—';
  document.getElementById('stockDetailIndustry').textContent = '—';
  document.getElementById('stockDetailContent').innerHTML = '<div style="color:#334155;font-size:12px;padding:30px 0 20px">Loading KPIs...</div>';
  document.getElementById('stockDetailStatus').textContent = 'Fetching data from yfinance...';
  fetch(API + '/api/stock-info?symbol=' + symbol)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error) throw new Error(d.error);
      renderStockDetail(d);
    })
    .catch(function(e){
      document.getElementById('stockDetailStatus').textContent = 'Error: ' + e.message;
      document.getElementById('stockDetailContent').innerHTML = '<div style="color:#ef4444;font-size:12px">Failed to load KPIs.</div>';
    });
}

function closeStockDetail(){
  document.getElementById('stockDetailView').style.display = 'none';
  document.getElementById('sectorDetailView').style.display = 'block';
}

function fmtMcap(v){
  if(v == null) return '—';
  if(v >= 1e12) return '$' + (v/1e12).toFixed(2) + 'T';
  if(v >= 1e9)  return '$' + (v/1e9).toFixed(1) + 'B';
  if(v >= 1e6)  return '$' + (v/1e6).toFixed(0) + 'M';
  return '$' + v;
}
function fmtVol(v){
  if(v == null) return '—';
  if(v >= 1e6) return (v/1e6).toFixed(1) + 'M';
  if(v >= 1e3) return (v/1e3).toFixed(0) + 'K';
  return v;
}
function fmtNum(v, decimals){ return v == null ? '—' : v.toFixed(decimals != null ? decimals : 2); }
function fmtPct(v){ return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
function kpiColor(v, goodPositive){
  if(v == null) return '#64748b';
  if(goodPositive === false) return v > 0 ? '#ef4444' : '#22c55e';
  return v > 0 ? '#22c55e' : '#ef4444';
}

function buildOverviewHtml(d){
  var desc = d.description || '';
  var short = desc.length > 280 ? desc.slice(0, 280) + '…' : desc;
  var overviewHtml = '';
  if(desc){
    overviewHtml +=
      '<div style="margin-bottom:20px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#334155;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Company Overview</div>' +
        '<div id="overviewDesc" style="font-size:12px;color:#94a3b8;line-height:1.7">' + short + '</div>' +
        (desc.length > 280
          ? '<div onclick="var el=document.getElementById(\'overviewDesc\');var full='+JSON.stringify(desc)+';el.textContent=el.textContent.length<50?full.slice(0,280)+\'…\':full;this.textContent=el.textContent.length<50?\'Show less\':\'Show more\'" ' +
            'style="font-size:11px;color:#4a9eff;cursor:pointer;margin-top:6px">Show more</div>'
          : '') +
      '</div>';
  }

  function infoRow(label, value){
    if(!value) return '';
    return '<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<div style="width:110px;font-size:11px;color:#475569;flex-shrink:0">' + label + '</div>' +
      '<div style="font-size:11px;color:#cbd5e1;font-weight:500">' + value + '</div>' +
    '</div>';
  }

  var website = d.website ? '<a href="' + d.website + '" target="_blank" style="color:#4a9eff;text-decoration:none">' + d.website.replace(/^https?:\/\//, '') + '</a>' : null;
  var employees = d.employees ? Number(d.employees).toLocaleString() : null;
  var revenue = d.total_revenue ? fmtMcap(d.total_revenue).replace('$','') + ' revenue (TTM)' : null;

  overviewHtml +=
    '<div style="margin-bottom:24px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#334155;margin-bottom:4px;padding-bottom:6px;border-bottom:1px solid var(--border)">Company Profile</div>' +
      infoRow('Full Name',   d.name) +
      infoRow('CEO',         d.ceo) +
      infoRow('Sector',      [d.sector, d.industry].filter(Boolean).join(' · ')) +
      infoRow('Employees',   employees) +
      infoRow('Revenue',     revenue) +
      infoRow('Website',     website) +
      infoRow('Exchange',    d.exchange) +
    '</div>';

  // OTC/ADR warning — PNK exchange = US holders only, real shareholders invisible
  var isOTC   = (d.exchange === 'PNK' || d.exchange === 'OTC' || d.exchange === 'PINK');
  var otcWarn = isOTC
    ? '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#f59e0b">' +
        '⚠️ <strong>OTC / ADR stock</strong> — This ticker trades on US OTC markets. ' +
        'Institutional ownership below reflects <strong>US-registered holders only</strong>. ' +
        'Major shareholders on the primary foreign exchange (e.g. HKEx, TSE) are <strong>not visible</strong> through US 13F filings. ' +
        'Search the primary listing ticker for complete ownership data.' +
      '</div>'
    : '';

  // Ownership placeholder — filled async by loadOwnership()
  overviewHtml +=
    '<div style="margin-bottom:24px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#334155;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">Ownership Structure</div>' +
      otcWarn +
      '<div id="ownershipSection" style="color:#334155;font-size:12px">Loading ownership data...</div>' +
    '</div>';

  return overviewHtml;
}

async function loadOwnership(symbol){
  try{
    var r = await fetch(API + '/api/holders?symbol=' + symbol);
    var d = await r.json();
    if(d.error) throw new Error(d.error);

    var el = document.getElementById('ownershipSection');
    if(!el) return;

    // Pie chart via Chart.js
    var chartId = 'ownershipChart_' + Date.now();
    var insP  = d.insiders_pct;
    var instP = d.institutions_pct;
    var pubP  = d.public_pct;

    var html =
      '<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="position:relative;width:160px;height:160px;flex-shrink:0">' +
          '<canvas id="' + chartId + '" width="160" height="160"></canvas>' +
        '</div>' +
        '<div style="flex:1;min-width:200px">' +
          '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">' +
            '<div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:2px;background:#4a9eff;flex-shrink:0"></div><span style="font-size:12px;color:#94a3b8;flex:1">Institutions</span><span style="font-size:13px;font-weight:700;color:#e2e8f0">' + instP.toFixed(1) + '%</span></div>' +
            '<div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:2px;background:#22c55e;flex-shrink:0"></div><span style="font-size:12px;color:#94a3b8;flex:1">Public Float</span><span style="font-size:13px;font-weight:700;color:#e2e8f0">' + pubP.toFixed(1) + '%</span></div>' +
            '<div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:2px;background:#f59e0b;flex-shrink:0"></div><span style="font-size:12px;color:#94a3b8;flex:1">Insiders</span><span style="font-size:13px;font-weight:700;color:#e2e8f0">' + insP.toFixed(2) + '%</span></div>' +
          '</div>';

    if(d.top_holders && d.top_holders.length){
      var reportDate = d.top_holders.length ? d.top_holders[0].date : '';
      html +=
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#334155;text-transform:uppercase">Top Institutional Holders</div>' +
          '<div style="font-size:10px;color:#334155">13F filing · ' + reportDate + '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;padding:0 0 4px 22px;border-bottom:1px solid var(--border);margin-bottom:2px">' +
          '<div style="font-size:9px;color:#334155;letter-spacing:.5px">HOLDER</div>' +
          '<div style="display:flex;gap:16px;flex-shrink:0">' +
            '<div style="font-size:9px;color:#334155;letter-spacing:.5px;width:36px;text-align:right">% HELD</div>' +
            '<div style="font-size:9px;color:#334155;letter-spacing:.5px;width:52px;text-align:right" title="Change in shares held vs previous quarter 13F filing">QoQ CHNG ▲</div>' +
          '</div>' +
        '</div>';
      d.top_holders.forEach(function(h, i){
        var chgColor = h.pct_change >= 0 ? '#22c55e' : '#ef4444';
        var chgSign  = h.pct_change >= 0 ? '+' : '';
        var chgLabel = chgSign + h.pct_change.toFixed(1) + '%';
        html +=
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<div style="font-size:10px;color:#334155;width:14px">' + (i+1) + '</div>' +
              '<div style="font-size:11px;color:#cbd5e1">' + h.name + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:16px;flex-shrink:0">' +
              '<div style="font-size:11px;font-weight:700;color:#e2e8f0;width:36px;text-align:right">' + h.pct.toFixed(2) + '%</div>' +
              '<div style="font-size:10px;font-weight:600;color:' + chgColor + ';width:52px;text-align:right" title="Change in shares held vs previous quarter">' + chgLabel + '</div>' +
            '</div>' +
          '</div>';
      });
    }

    html += '</div></div>';
    el.innerHTML = html;

    // Draw donut chart
    var ctx = document.getElementById(chartId);
    if(ctx && typeof Chart !== 'undefined'){
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Institutions', 'Public Float', 'Insiders'],
          datasets: [{
            data: [instP, pubP, insP],
            backgroundColor: ['#4a9eff', '#22c55e', '#f59e0b'],
            borderWidth: 0,
            hoverOffset: 4,
          }]
        },
        options: {
          cutout: '68%',
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: function(c){ return c.label + ': ' + c.parsed.toFixed(2) + '%'; }
          }}},
          animation: { duration: 600 }
        }
      });
    }
  }catch(e){
    var el = document.getElementById('ownershipSection');
    if(el) el.innerHTML = '<span style="color:#475569;font-size:11px">Ownership data unavailable</span>';
  }
}

function renderStockDetail(d){
  // Header
  var price = d.price != null ? '$' + d.price.toFixed(2) : '—';
  document.getElementById('stockDetailPrice').textContent = price;
  document.getElementById('stockDetailMcap').textContent = 'Market Cap: ' + fmtMcap(d.market_cap);
  document.getElementById('stockDetailIndustry').textContent = (d.sector || '') + (d.industry ? ' · ' + d.industry : '');
  document.getElementById('stockDetailStatus').textContent =
    '52W: $' + fmtNum(d.fifty_two_low) + ' – $' + fmtNum(d.fifty_two_high) +
    '   |   Beta: ' + fmtNum(d.beta) +
    '   |   Avg Vol: ' + fmtVol(d.avg_volume);

  function kpiRow(label, value, note, color){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<div>' +
        '<div style="font-size:12px;color:#94a3b8">' + label + '</div>' +
        (note ? '<div style="font-size:10px;color:#334155;margin-top:1px">' + note + '</div>' : '') +
      '</div>' +
      '<div style="font-size:14px;font-weight:700;color:' + (color || '#e2e8f0') + ';font-family:\'Courier New\',monospace">' + value + '</div>' +
    '</div>';
  }

  function section(title, rows){
    return '<div style="margin-bottom:20px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#334155;margin-bottom:4px;padding-bottom:6px;border-bottom:1px solid var(--border)">' + title + '</div>' +
      rows.join('') +
    '</div>';
  }

  var html = buildOverviewHtml(d);
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px">';

  // Left column
  html += '<div>';
  html += section('Valuation', [
    kpiRow('P/E (Trailing)',  fmtNum(d.pe_trailing, 1),  'Price / trailing 12M earnings'),
    kpiRow('P/E (Forward)',   fmtNum(d.pe_forward, 1),   'Price / next 12M est. earnings'),
    kpiRow('PEG Ratio',      fmtNum(d.peg_ratio, 2),    'P/E relative to growth rate'),
    kpiRow('P/S Ratio',      fmtNum(d.ps_ratio, 2),     'Price / revenue (TTM)'),
    kpiRow('P/B Ratio',      fmtNum(d.pb_ratio, 2),     'Price / book value'),
    kpiRow('EV/EBITDA',      fmtNum(d.ev_ebitda, 1),    'Enterprise value / EBITDA'),
  ]);
  html += section('Earnings', [
    kpiRow('EPS (Trailing)',  d.eps_trailing != null ? '$' + fmtNum(d.eps_trailing) : '—', 'Last 12 months'),
    kpiRow('EPS (Forward)',   d.eps_forward  != null ? '$' + fmtNum(d.eps_forward)  : '—', 'Next 12M estimate'),
    kpiRow('Revenue Growth',  fmtPct(d.revenue_growth),  'YoY',  kpiColor(d.revenue_growth, true)),
    kpiRow('Earnings Growth', fmtPct(d.earnings_growth), 'YoY',  kpiColor(d.earnings_growth, true)),
  ]);
  html += '</div>';

  // Right column
  html += '<div>';
  html += section('Profitability', [
    kpiRow('Gross Margin',     fmtPct(d.gross_margin),     null, d.gross_margin > 40 ? '#22c55e' : d.gross_margin > 20 ? '#f59e0b' : '#ef4444'),
    kpiRow('Operating Margin', fmtPct(d.operating_margin), null, kpiColor(d.operating_margin, true)),
    kpiRow('Net Margin',       fmtPct(d.net_margin),       null, kpiColor(d.net_margin, true)),
    kpiRow('ROE',              fmtPct(d.roe),              'Return on equity', kpiColor(d.roe, true)),
    kpiRow('ROA',              fmtPct(d.roa),              'Return on assets', kpiColor(d.roa, true)),
  ]);
  html += section('Balance Sheet & Dividends', [
    kpiRow('Debt / Equity',   fmtNum(d.debt_to_equity, 2), null, d.debt_to_equity != null ? (d.debt_to_equity > 200 ? '#ef4444' : d.debt_to_equity > 100 ? '#f59e0b' : '#22c55e') : '#64748b'),
    kpiRow('Current Ratio',   fmtNum(d.current_ratio, 2),  'Current assets / liabilities', d.current_ratio != null ? (d.current_ratio > 1.5 ? '#22c55e' : d.current_ratio > 1 ? '#f59e0b' : '#ef4444') : '#64748b'),
    kpiRow('Quick Ratio',     fmtNum(d.quick_ratio, 2),    'Liquid assets / liabilities'),
    kpiRow('Dividend Yield',  d.dividend_yield != null ? d.dividend_yield.toFixed(2) + '%' : '—',    null, d.dividend_yield > 0 ? '#4a9eff' : '#64748b'),
    kpiRow('Payout Ratio',    fmtPct(d.payout_ratio)),
  ]);
  html += '</div>';

  html += '</div>';
  document.getElementById('stockDetailContent').innerHTML = html;
  loadOwnership(d.symbol);
}

// ── Fundamental Chart page ────────────────────────────────
var _fcPeriod    = 'annual';
var _fcChartType = 'bar';
var _fcMetrics   = ['revenue'];
var _fcChart     = null;
var _fcAllDates  = [];
var _fcFetched   = [];
var _fcTickers   = [];

var FC_COLORS = [
  {bg:'rgba(74,158,255,0.8)',   line:'#4a9eff'},
  {bg:'rgba(34,197,94,0.8)',    line:'#22c55e'},
  {bg:'rgba(167,139,250,0.8)',  line:'#a78bfa'},
  {bg:'rgba(245,158,11,0.8)',   line:'#f59e0b'},
  {bg:'rgba(236,72,153,0.8)',   line:'#ec4899'},
  {bg:'rgba(6,182,212,0.8)',    line:'#06b6d4'},
  {bg:'rgba(249,115,22,0.8)',   line:'#f97316'},
  {bg:'rgba(132,204,22,0.8)',   line:'#84cc16'},
];
// When comparing 2 tickers: each ticker gets its own color family for max contrast
var FC_TICKER_COLORS = [
  // Ticker 1 — cool blues/indigo
  [{bg:'rgba(74,158,255,0.85)',  line:'#4a9eff'},
   {bg:'rgba(99,102,241,0.85)',  line:'#6366f1'},
   {bg:'rgba(34,211,238,0.85)',  line:'#22d3ee'},
   {bg:'rgba(167,139,250,0.85)', line:'#a78bfa'}],
  // Ticker 2 — warm ambers/orange/pink
  [{bg:'rgba(245,158,11,0.85)',  line:'#f59e0b'},
   {bg:'rgba(249,115,22,0.85)',  line:'#f97316'},
   {bg:'rgba(236,72,153,0.85)',  line:'#ec4899'},
   {bg:'rgba(34,197,94,0.85)',   line:'#22c55e'}],
];

function fcSetPeriod(p, btn){
  _fcPeriod = p;
  document.querySelectorAll('#fcPeriodBtns .ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
}

function fcSetChartType(t, btn){
  _fcChartType = t;
  document.querySelectorAll('#fcTypeBtns .ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  if(_fcChart) runFundChart();
}

function fcToggleMetric(m, btn){
  var idx = _fcMetrics.indexOf(m);
  if(idx >= 0){
    if(_fcMetrics.length === 1) return; // keep at least one
    _fcMetrics.splice(idx, 1);
    btn.classList.remove('active');
  } else {
    _fcMetrics.push(m);
    btn.classList.add('active');
  }
}

function fcQuickPick(t1, t2){
  document.getElementById('fcTicker1').value = t1;
  document.getElementById('fcTicker2').value = t2;
  runFundChart();
}

var FC_LABELS = {
  revenue:'Total Revenue', gross_profit:'Gross Profit', operating_income:'Operating Income',
  net_income:'Net Income', eps_diluted:'EPS (Diluted)', free_cash_flow:'Free Cash Flow',
  capex:'CapEx', rd_expense:'R&D Expense',
  gross_margin:'Gross Margin %', operating_margin:'Operating Margin %', net_margin:'Net Margin %',
  revenue_growth:'Revenue Growth %', op_income_growth:'Op. Income Growth %', net_income_growth:'Net Income Growth %'
};
var FC_IS_MARGIN = {gross_margin:1, operating_margin:1, net_margin:1};
var FC_IS_GROWTH = {revenue_growth:1, op_income_growth:1, net_income_growth:1};

function fcFmt(v, metric){
  if(v == null) return '—';
  if(FC_IS_MARGIN[metric] || FC_IS_GROWTH[metric]) return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  var abs = Math.abs(v);
  var sign = v < 0 ? '-' : '';
  if(abs >= 1e12) return sign + '$' + (abs/1e12).toFixed(2) + 'T';
  if(abs >= 1e9)  return sign + '$' + (abs/1e9).toFixed(1) + 'B';
  if(abs >= 1e6)  return sign + '$' + (abs/1e6).toFixed(0) + 'M';
  if(Math.abs(v) < 100) return sign + v.toFixed(2);  // EPS
  return sign + '$' + abs.toLocaleString();
}

// ── CORRELATION PAGE ──────────────────────────────────────
var _corrChartInst = null;

function _corrColor(r){
  if(r === null || r === undefined) return '#64748b';
  if(r >=  0.7) return '#22c55e';   // strong positive
  if(r >=  0.3) return '#86efac';   // moderate positive
  if(r > -0.3)  return '#94a3b8';   // weak
  if(r > -0.7)  return '#fb923c';   // moderate inverse
  return '#ef4444';                  // strong inverse
}

function _corrLabel(r){
  if(r === null || r === undefined) return '—';
  if(r >=  0.7) return 'STRONG +';
  if(r >=  0.3) return 'MODERATE +';
  if(r > -0.3)  return 'WEAK';
  if(r > -0.7)  return 'MODERATE -';
  return 'STRONG -';
}

function _corrCard(label, r, n){
  var c = _corrColor(r);
  var rStr = (r === null || r === undefined) ? '—' : (r >= 0 ? '+' : '') + r.toFixed(3);
  var nStr = n ? n + ' obs' : '';
  return '<div class="summary-card">'
    + '<div class="sc-label">' + label + '</div>'
    + '<div class="sc-val" style="color:' + c + '">' + rStr + '</div>'
    + '<div style="display:inline-block;margin-top:6px;font-size:9px;font-weight:800;letter-spacing:.8px;padding:2px 8px;border-radius:4px;background:' + c + '20;color:' + c + '">' + _corrLabel(r) + '</div>'
    + '<div class="sc-chg" style="color:#475569;font-size:10px;margin-top:4px">' + nStr + '</div>'
    + '</div>';
}

async function runCorrelation(){
  var sym   = document.getElementById('corrTicker').value.trim().toUpperCase();
  var bench = document.getElementById('corrBench').value;
  if(!sym){ document.getElementById('corrStatus').textContent = 'Enter a ticker.'; return; }
  document.getElementById('corrStatus').textContent = 'Loading ' + sym + ' vs ' + bench + '...';
  document.getElementById('corrCards').innerHTML = '';
  try{
    var r = await fetch(API + '/api/correlation?symbol=' + encodeURIComponent(sym) + '&benchmark=' + encodeURIComponent(bench));
    var d = await r.json();
    if(d.error){ document.getElementById('corrStatus').textContent = 'Error: ' + d.error; return; }

    var c = d.corr, n = d.n;
    document.getElementById('corrCards').innerHTML =
        _corrCard('Current (20d)', c.current, n.current)
      + _corrCard('MTD',           c.mtd,     n.mtd)
      + _corrCard('YTD',           c.ytd,     n.ytd)
      + _corrCard('1 Year',        c.y1,      n.y1)
      + _corrCard('3 Years',       c.y3,      n.y3);

    document.getElementById('corrStatus').textContent = sym + ' vs ' + bench + ' · as of ' + (d.as_of || '—');
    document.getElementById('corrChartMeta').textContent = sym + ' vs ' + bench;

    var dates = d.rolling.dates, vals = d.rolling.values;
    if(_corrChartInst) _corrChartInst.destroy();
    var ctx = document.getElementById('corrChart').getContext('2d');
    _corrChartInst = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: '60-day rolling r',
          data: vals,
          borderColor: '#4a9eff',
          backgroundColor: 'rgba(74,158,255,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 1.6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx){ var v = ctx.parsed.y; return 'r = ' + (v >= 0 ? '+' : '') + v.toFixed(3); } } }
        },
        scales: {
          x: {
            ticks: { color:'#64748b', font:{size:9}, maxTicksLimit: 8, callback: function(v, i){ var dt = this.getLabelForValue(v); return dt ? dt.slice(0,7) : ''; } },
            grid: { color:'rgba(255,255,255,0.04)' }
          },
          y: {
            min: -1, max: 1,
            ticks: { color:'#64748b', font:{size:10}, stepSize: 0.25 },
            grid: { color: function(ctx){ return ctx.tick.value === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)'; } }
          }
        }
      }
    });
  }catch(e){
    document.getElementById('corrStatus').textContent = 'Error: ' + (e.message || e);
  }
}

async function runFundChart(){
  var t1 = document.getElementById('fcTicker1').value.trim().toUpperCase();
  var t2 = document.getElementById('fcTicker2').value.trim().toUpperCase();
  if(!t1){ document.getElementById('fcStatus').textContent = 'Enter at least one ticker.'; return; }
  if(!_fcMetrics.length){ document.getElementById('fcStatus').textContent = 'Select at least one metric.'; return; }

  var tickers = t2 ? [t1, t2] : [t1];
  document.getElementById('fcStatus').textContent = 'Loading ' + tickers.join(' & ') + '...';
  document.getElementById('fcChartWrap').style.display = 'none';

  try{
    var fetches = [];
    _fcMetrics.forEach(function(metric){
      tickers.forEach(function(ticker){
        fetches.push(
          fetch(API + '/api/fundamentals?symbol=' + ticker + '&metric=' + metric + '&period=' + _fcPeriod)
            .then(function(r){ return r.json(); })
            .then(function(d){ return {metric: metric, ticker: ticker, result: d}; })
        );
      });
    });
    var fetched = await Promise.all(fetches);
    fetched.forEach(function(f){ if(f.result.error) throw new Error(f.ticker + ': ' + f.result.error); });

    // Unified date axis across all results — store globally for range slider
    var allDates = [];
    fetched.forEach(function(f){
      (f.result.data||[]).forEach(function(x){ if(allDates.indexOf(x.date)<0) allDates.push(x.date); });
    });
    allDates.sort();
    _fcAllDates = allDates;
    _fcFetched  = fetched;
    _fcTickers  = tickers;

    fcInitRangeSlider(allDates);
    fcDrawChart(allDates);

    document.getElementById('fcChartWrap').style.display = 'block';
    document.getElementById('fcStatus').textContent = '';
  }catch(e){
    document.getElementById('fcStatus').textContent = 'Error: ' + e.message;
  }
}

function fcDateLabel(d){
  if(_fcPeriod === 'annual') return d.slice(0,4);
  var dt = new Date(d); var q = Math.ceil((dt.getMonth()+1)/3);
  return dt.getFullYear() + ' Q' + q;
}

function fcInitRangeSlider(dates){
  var n = dates.length - 1;
  if(n < 1){ document.getElementById('fcRangeWrap').style.display='none'; return; }
  var minEl = document.getElementById('fcRangeMin');
  var maxEl = document.getElementById('fcRangeMax');
  minEl.max = maxEl.max = n;
  minEl.value = 0;
  maxEl.value = n;
  document.getElementById('fcRangeWrap').style.display = 'block';
  fcUpdateRangeUI(0, n, dates);
}

function fcRangeChange(){
  var minEl = document.getElementById('fcRangeMin');
  var maxEl = document.getElementById('fcRangeMax');
  var lo = parseInt(minEl.value), hi = parseInt(maxEl.value);
  if(lo > hi){ var tmp=lo; lo=hi; hi=tmp; minEl.value=lo; maxEl.value=hi; }
  fcUpdateRangeUI(lo, hi, _fcAllDates);
  fcDrawChart(_fcAllDates.slice(lo, hi + 1));
}

function fcUpdateRangeUI(lo, hi, dates){
  var n = dates.length - 1;
  var loP = n > 0 ? (lo / n * 100) : 0;
  var hiP = n > 0 ? (hi / n * 100) : 100;
  document.getElementById('fcRangeFill').style.left  = loP + '%';
  document.getElementById('fcRangeFill').style.width = (hiP - loP) + '%';
  document.getElementById('fcRangeLabel').textContent = fcDateLabel(dates[lo]) + ' → ' + fcDateLabel(dates[hi]);
}

function fcDrawChart(dates){
  var fetched = _fcFetched;
  var tickers = _fcTickers;
  var allDates = dates;

  var labels = allDates.map(fcDateLabel);

  function mapVals(dataArr){
    var m = {}; (dataArr||[]).forEach(function(x){ m[x.date]=x.value; });
    return allDates.map(function(d){ return m[d]!=null ? m[d] : null; });
  }

    var hasMargin = _fcMetrics.some(function(m){ return FC_IS_MARGIN[m] || FC_IS_GROWTH[m]; });
    var hasDollar = _fcMetrics.some(function(m){ return !FC_IS_MARGIN[m] && !FC_IS_GROWTH[m]; });
    var dualAxis  = hasMargin && hasDollar;

    var dsType    = _fcChartType === 'line' ? 'line' : 'bar';
    var isStacked = _fcChartType === 'stacked';
    var isLine    = _fcChartType === 'line';

    var datasets = [];
    var datasetMetrics = [];
    var legendItems = [];

    _fcMetrics.forEach(function(metric, mi){
      var isMargin = FC_IS_MARGIN[metric] || FC_IS_GROWTH[metric];
      var yAxisID = dualAxis ? (isMargin ? 'y1' : 'y') : 'y';

      tickers.forEach(function(ticker, ti){
        var col = tickers.length > 1
          ? FC_TICKER_COLORS[ti][mi % FC_TICKER_COLORS[ti].length]
          : FC_COLORS[mi % FC_COLORS.length];
        var f = fetched.find(function(x){ return x.metric===metric && x.ticker===ticker; });
        if(!f) return;
        var vals = mapVals(f.result.data);
        var isSecond = ti === 1;
        var bg = col.bg;
        var lbl = (tickers.length > 1 ? ticker + ' — ' : '') + FC_LABELS[metric];

        datasets.push({
          label:            lbl,
          data:             vals,
          backgroundColor:  bg,
          borderColor:      col.line,
          borderWidth:      isLine ? 2 : (isSecond ? 1 : 0),
          borderDash:       isSecond && !isLine ? [4,3] : undefined,
          borderRadius:     isLine ? 0 : 3,
          type:             dsType,
          tension:          0.3,
          pointRadius:      isLine ? 4 : 0,
          pointHoverRadius: isLine ? 6 : 0,
          fill:             false,
          spanGaps:         true,
          yAxisID:          yAxisID,
          stack:            isStacked ? ('stack' + ti) : undefined,
        });
        datasetMetrics.push(metric);
        legendItems.push({color: col.line, label: lbl});
      });
    });

    if(_fcChart){ _fcChart.destroy(); _fcChart = null; }
    var ctx = document.getElementById('fcCanvas').getContext('2d');
    var dollarMetric = _fcMetrics.find(function(m){ return !FC_IS_MARGIN[m] && !FC_IS_GROWTH[m]; }) || _fcMetrics[0];

    var scales = {
      x: { stacked: isStacked, grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#475569', font:{ size:11 } } },
      y: {
        stacked: isStacked,
        grid:{ color:'rgba(255,255,255,0.04)' },
        ticks:{ color:'#475569', font:{ size:11 }, callback: function(v){ return fcFmt(v, dollarMetric); } }
      }
    };
    if(dualAxis){
      scales.y1 = {
        position: 'right',
        grid:{ drawOnChartArea: false },
        ticks:{ color:'#475569', font:{ size:11 }, callback: function(v){ return v.toFixed(1)+'%'; } }
      };
    }

    _fcChart = new Chart(ctx, {
      type: dsType,
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode:'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor:'#0f1117',
            borderColor:'rgba(255,255,255,0.1)',
            borderWidth:1,
            titleColor:'#94a3b8',
            bodyColor:'#e2e8f0',
            callbacks: {
              label: function(c){ return ' ' + c.dataset.label + ': ' + fcFmt(c.raw, datasetMetrics[c.datasetIndex]); }
            }
          }
        },
        scales: scales
      }
    });

    // Legend
    document.getElementById('fcLegend').innerHTML = legendItems.map(function(it){
      return '<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:2px;background:'+it.color+'"></div><span style="color:#94a3b8">'+it.label+'</span></div>';
    }).join('');
    document.getElementById('fcChartTitle').textContent =
      _fcMetrics.map(function(m){ return FC_LABELS[m]; }).join(' + ') +
      ' — ' + _fcPeriod.charAt(0).toUpperCase() + _fcPeriod.slice(1);

    // Data table — one section per metric
    var tableHtml = '';
    _fcMetrics.forEach(function(metric, mi){
      var mFetches = fetched.filter(function(f){ return f.metric===metric; });
      if(!mFetches.length) return;
      var valsMap = {};
      mFetches.forEach(function(f){
        var m = {}; (f.result.data||[]).forEach(function(x){ m[x.date]=x.value; });
        valsMap[f.ticker] = m;
      });
      var colLine = FC_COLORS[mi % FC_COLORS.length].line;
      var thead = '<tr style="border-bottom:1px solid var(--border)">' +
        '<th style="text-align:left;padding:6px 8px;font-size:10px;color:#475569;letter-spacing:1px;font-weight:600">PERIOD</th>' +
        mFetches.map(function(f, ti){
          var thColor = tickers.length > 1
            ? FC_TICKER_COLORS[ti][mi % FC_TICKER_COLORS[ti].length].line
            : colLine;
          return '<th style="text-align:right;padding:6px 8px;font-size:10px;color:'+thColor+';letter-spacing:1px;font-weight:600">' +
            (tickers.length>1 ? f.ticker+' — ' : '') + FC_LABELS[metric] + '</th>';
        }).join('') + '</tr>';
      var tbody = allDates.slice().reverse().map(function(d){
        var lbl = labels[allDates.indexOf(d)];
        var cells = mFetches.map(function(f){
          var v = valsMap[f.ticker] ? valsMap[f.ticker][d] : null;
          var c = v!=null && v>=0 ? '#e2e8f0' : '#ef4444';
          return '<td style="padding:6px 8px;font-size:12px;font-weight:600;color:'+c+';text-align:right;font-family:\'Courier New\',monospace">'+fcFmt(v,metric)+'</td>';
        }).join('');
        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)"><td style="padding:6px 8px;font-size:11px;color:#64748b">'+lbl+'</td>'+cells+'</tr>';
      }).join('');
      tableHtml += '<div style="margin-bottom:16px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:'+colLine+';text-transform:uppercase;margin-bottom:8px">'+FC_LABELS[metric]+'</div>' +
        '<table style="width:100%;border-collapse:collapse"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table></div>';
    });
    document.getElementById('fcTable').innerHTML = tableHtml;
}

// ── Institutional Holdings ────────────────────────────────
var _instListLoaded = false;
var _instActiveCik  = null;

function loadInstitutionsList(){
  if(_instListLoaded) return;
  fetch(API + '/api/institutions-list')
    .then(function(r){ return r.json(); })
    .then(function(d){
      _instListLoaded = true;
      renderInstButtons(d.institutions);
    })
    .catch(function(){
      document.getElementById('instButtons').innerHTML = '<div style="color:#ef4444;font-size:12px">Failed to load institutions</div>';
    });
}

function renderInstButtons(insts){
  var el   = document.getElementById('instButtons');
  var html = '';
  insts.forEach(function(inst){
    html +=
      '<div class="inst-pill" data-cik="' + inst.cik + '" onclick="loadInstitution(\'' + inst.cik + '\',this)" ' +
      'style="cursor:pointer;padding:10px 16px;border:1px solid var(--border2);border-radius:8px;background:rgba(255,255,255,0.02);transition:all .15s;text-align:center;min-width:110px" ' +
      'onmouseover="this.style.background=\'rgba(74,158,255,0.07)\'" onmouseout="if(!this.classList.contains(\'inst-active\'))this.style.background=\'rgba(255,255,255,0.02)\'">' +
      '<div style="font-size:20px;margin-bottom:4px">' + inst.emoji + '</div>' +
      '<div style="font-size:12px;font-weight:700;color:#e2e8f0">' + inst.name + '</div>' +
      '<div style="font-size:10px;color:#475569;margin-top:2px">' + inst.short + '</div>' +
      '</div>';
  });
  el.innerHTML = html;
  // Auto-load first
  var first = el.querySelector('.inst-pill');
  if(first) loadInstitution(insts[0].cik, first);
}

function loadInstitution(cik, btnEl){
  if(_instActiveCik === cik) return;
  _instActiveCik = cik;

  // Update button highlight
  document.querySelectorAll('.inst-pill').forEach(function(b){
    b.classList.remove('inst-active');
    b.style.background = 'rgba(255,255,255,0.02)';
    b.style.borderColor = 'var(--border2)';
  });
  if(btnEl){
    btnEl.classList.add('inst-active');
    btnEl.style.background    = 'rgba(74,158,255,0.1)';
    btnEl.style.borderColor   = 'rgba(74,158,255,0.4)';
  }

  var content = document.getElementById('instContent');
  content.innerHTML = '<div style="color:#334155;font-size:12px;padding:24px 0">Fetching 13F filings from SEC EDGAR… this takes ~10s for large portfolios</div>';

  fetch(API + '/api/institutions?cik=' + cik)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ content.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:20px 0">Error: ' + d.error + '</div>'; return; }
      renderInstHoldings(d);
    })
    .catch(function(){
      content.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:20px 0">Request failed</div>';
    });
}

function renderInstHoldings(d){
  function fmtShares(n){
    if(n == null || n === 0) return '—';
    var a = Math.abs(n);
    if(a >= 1e9) return (n/1e9).toFixed(2)+'B';
    if(a >= 1e6) return (n/1e6).toFixed(1)+'M';
    if(a >= 1e3) return (n/1e3).toFixed(0)+'K';
    return n.toLocaleString();
  }
  function summCard(label, val){
    return '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:12px 18px;flex:1;min-width:120px">' +
      '<div style="font-size:10px;color:#475569;letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px">' + label + '</div>' +
      '<div style="font-size:16px;font-weight:700;color:#e2e8f0">' + val + '</div>' +
    '</div>';
  }

  var html = '';

  // Summary row
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">';
  html += summCard('Portfolio Value',   fmtMcap(d.total_value));
  html += summCard('Total Positions',   d.total_positions.toLocaleString());
  html += summCard('Latest Quarter',    (d.period || d.filed || '—').slice(0,7));
  if(d.prev_period) html += summCard('Prior Quarter', d.prev_period.slice(0,7));
  html += '</div>';

  // Holdings table
  html += '<div class="mini-section">';
  html += '<div class="ms-header"><div class="ms-title">📋 Top 50 Holdings · ' + d.name + '</div>' +
          '<div style="font-size:10px;color:#475569">Filed ' + (d.filed||'') + '</div></div>';
  html += '<div style="overflow-x:auto;margin-top:12px">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';

  // Header
  var thStyle = 'padding:6px 10px;color:#475569;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap';
  html += '<tr>';
  html += '<th style="' + thStyle + ';text-align:left">#</th>';
  html += '<th style="' + thStyle + ';text-align:left">Company</th>';
  html += '<th style="' + thStyle + ';text-align:right">Value</th>';
  html += '<th style="' + thStyle + ';text-align:right">Shares</th>';
  html += '<th style="' + thStyle + ';text-align:right">% Portfolio</th>';
  html += '<th style="' + thStyle + ';text-align:center">QoQ Change</th>';
  html += '</tr>';

  d.holdings.forEach(function(h, i){
    // Change badge
    var chg = '';
    if(h.chg_type === 'NEW'){
      chg = '<span style="background:rgba(74,158,255,0.15);color:#4a9eff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">NEW</span>';
    } else if(h.chg_type === 'INCREASED' && h.chg_pct != null){
      chg = '<span style="color:#22c55e;font-weight:700;font-size:12px">+' + h.chg_pct.toFixed(1) + '%</span>';
    } else if(h.chg_type === 'DECREASED' && h.chg_pct != null){
      chg = '<span style="color:#ef4444;font-weight:700;font-size:12px">' + h.chg_pct.toFixed(1) + '%</span>';
    } else {
      chg = '<span style="color:#334155;font-size:11px">—</span>';
    }

    // % portfolio with mini bar
    var barW = Math.min(h.pct_port * 6, 100);
    var portHtml =
      '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">' +
        '<span style="font-family:\'Courier New\',monospace;font-weight:700;color:#e2e8f0">' + h.pct_port.toFixed(1) + '%</span>' +
        '<div style="width:36px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;flex-shrink:0">' +
          '<div style="width:' + barW + '%;height:100%;background:#4a9eff;border-radius:2px"></div>' +
        '</div>' +
      '</div>';

    var rowBg = i % 2 === 0 ? '' : 'background:rgba(255,255,255,0.01)';
    html += '<tr style="' + rowBg + '" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'' + (i%2===0?'transparent':'rgba(255,255,255,0.01)') + '\'">';
    html += '<td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:#475569;font-size:11px">' + (i+1) + '</td>';
    html += '<td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04);font-weight:600;color:#e2e8f0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + h.name + '</td>';
    html += '<td style="text-align:right;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04);font-family:\'Courier New\',monospace;color:#94a3b8">' + fmtMcap(h.value) + '</td>';
    html += '<td style="text-align:right;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:#64748b;white-space:nowrap">' + fmtShares(h.shares) + '</td>';
    html += '<td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">' + portHtml + '</td>';
    html += '<td style="text-align:center;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">' + chg + '</td>';
    html += '</tr>';
  });

  html += '</table></div></div>';

  // Exited positions
  if(d.sold && d.sold.length > 0){
    html += '<div class="mini-section" style="margin-top:16px">';
    html += '<div class="ms-header"><div class="ms-title">🚪 Exited Positions vs. Prior Quarter</div></div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">';
    d.sold.forEach(function(s){
      html +=
        '<div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:6px;padding:7px 14px">' +
          '<div style="font-size:12px;font-weight:600;color:#fca5a5">' + s.name + '</div>' +
          '<div style="font-size:10px;color:#64748b;margin-top:2px">Was ' + fmtMcap(s.value) + '</div>' +
        '</div>';
    });
    html += '</div></div>';
  }

  document.getElementById('instContent').innerHTML = html;
}

// ── Company Research page ─────────────────────────────────
function runResearch(){
  var sym = document.getElementById('researchInput').value.trim().toUpperCase();
  if(!sym) return;
  researchTicker(sym);
}

function researchTicker(sym){
  document.getElementById('researchInput').value = sym;
  document.getElementById('researchStatus').textContent = 'Loading ' + sym + '...';
  document.getElementById('researchResult').style.display = 'none';
  document.getElementById('resKpiContent').innerHTML    = '';
  document.getElementById('resInsiderSection').innerHTML = '';
  document.getElementById('resAnalystSection').innerHTML = '';
  document.getElementById('resPeersSection').innerHTML  = '';
  fetch(API + '/api/stock-info?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error) throw new Error(d.error);
      renderResearchResult(d);
    })
    .catch(function(e){
      document.getElementById('researchStatus').textContent = 'Error: ' + e.message;
    });
}

function renderResearchResult(d){
  document.getElementById('researchResult').style.display = 'block';
  document.getElementById('researchStatus').textContent = '';

  document.getElementById('resNameLine').textContent = d.name || d.symbol;
  document.getElementById('resIndustryLine').textContent = [d.sector, d.industry].filter(Boolean).join(' · ');
  document.getElementById('resPriceLine').textContent = d.price != null ? '$' + d.price.toFixed(2) : '—';
  document.getElementById('resMcapLine').textContent = 'Market Cap: ' + fmtMcap(d.market_cap);
  document.getElementById('resBetaLine').textContent = 'Beta: ' + fmtNum(d.beta) + '   |   Avg Vol: ' + fmtVol(d.avg_volume);
  document.getElementById('res52wLine').textContent = '52W Range: $' + fmtNum(d.fifty_two_low) + ' – $' + fmtNum(d.fifty_two_high);

  function kpiRow(label, value, note, color){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<div>' +
        '<div style="font-size:12px;color:#94a3b8">' + label + '</div>' +
        (note ? '<div style="font-size:10px;color:#334155;margin-top:1px">' + note + '</div>' : '') +
      '</div>' +
      '<div style="font-size:14px;font-weight:700;color:' + (color || '#e2e8f0') + ';font-family:\'Courier New\',monospace">' + value + '</div>' +
    '</div>';
  }
  function section(title, rows){
    return '<div style="margin-bottom:20px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#334155;margin-bottom:4px;padding-bottom:6px;border-bottom:1px solid var(--border)">' + title + '</div>' +
      rows.join('') +
    '</div>';
  }

  var html = buildOverviewHtml(d);
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px">';
  html += '<div>';
  html += section('Valuation', [
    kpiRow('P/E (Trailing)',  fmtNum(d.pe_trailing, 1),  'Price / trailing 12M earnings'),
    kpiRow('P/E (Forward)',   fmtNum(d.pe_forward, 1),   'Price / next 12M est. earnings'),
    kpiRow('PEG Ratio',      fmtNum(d.peg_ratio, 2),    'P/E relative to growth rate'),
    kpiRow('P/S Ratio',      fmtNum(d.ps_ratio, 2),     'Price / revenue (TTM)'),
    kpiRow('P/B Ratio',      fmtNum(d.pb_ratio, 2),     'Price / book value'),
    kpiRow('EV/EBITDA',      fmtNum(d.ev_ebitda, 1),    'Enterprise value / EBITDA'),
  ]);
  html += section('Earnings', [
    kpiRow('EPS (Trailing)',  d.eps_trailing != null ? '$' + fmtNum(d.eps_trailing) : '—', 'Last 12 months'),
    kpiRow('EPS (Forward)',   d.eps_forward  != null ? '$' + fmtNum(d.eps_forward)  : '—', 'Next 12M estimate'),
    kpiRow('Revenue Growth',  fmtPct(d.revenue_growth),  'YoY', kpiColor(d.revenue_growth, true)),
    kpiRow('Earnings Growth', fmtPct(d.earnings_growth), 'YoY', kpiColor(d.earnings_growth, true)),
  ]);
  html += '</div>';
  html += '<div>';
  html += section('Profitability', [
    kpiRow('Gross Margin',     fmtPct(d.gross_margin),     null, d.gross_margin > 40 ? '#22c55e' : d.gross_margin > 20 ? '#f59e0b' : '#ef4444'),
    kpiRow('Operating Margin', fmtPct(d.operating_margin), null, kpiColor(d.operating_margin, true)),
    kpiRow('Net Margin',       fmtPct(d.net_margin),       null, kpiColor(d.net_margin, true)),
    kpiRow('ROE',              fmtPct(d.roe),              'Return on equity', kpiColor(d.roe, true)),
    kpiRow('ROA',              fmtPct(d.roa),              'Return on assets', kpiColor(d.roa, true)),
  ]);
  html += section('Balance Sheet & Dividends', [
    kpiRow('Debt / Equity',  fmtNum(d.debt_to_equity, 2), null, d.debt_to_equity != null ? (d.debt_to_equity > 200 ? '#ef4444' : d.debt_to_equity > 100 ? '#f59e0b' : '#22c55e') : '#64748b'),
    kpiRow('Current Ratio',  fmtNum(d.current_ratio, 2),  'Current assets / liabilities', d.current_ratio != null ? (d.current_ratio > 1.5 ? '#22c55e' : d.current_ratio > 1 ? '#f59e0b' : '#ef4444') : '#64748b'),
    kpiRow('Quick Ratio',    fmtNum(d.quick_ratio, 2),    'Liquid assets / liabilities'),
    kpiRow('Dividend Yield', d.dividend_yield != null ? d.dividend_yield.toFixed(2) + '%' : '—',    null, d.dividend_yield > 0 ? '#4a9eff' : '#64748b'),
    kpiRow('Payout Ratio',   fmtPct(d.payout_ratio)),
  ]);
  html += '</div></div>';
  document.getElementById('resKpiContent').innerHTML = html;
  loadOwnership(d.symbol);
  loadResearchInsiders(d.symbol);
  loadAnalystEstimates(d.symbol);
  loadPeersComparison(d.symbol);
}

// ── Analyst estimates ─────────────────────────────────────
function loadAnalystEstimates(sym){
  var el = document.getElementById('resAnalystSection');
  if(!el) return;
  el.innerHTML = '';
  fetch(API + '/api/analyst-estimates?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error || (!d.eps_estimates && !d.price_target)) return;
      renderAnalystEstimates(d, el);
    })
    .catch(function(){});
}

function renderAnalystEstimates(d, el){
  var html = '<div class="mini-section" style="margin-top:20px">';
  html += '<div class="ms-header"><div class="ms-title">📈 Analyst Estimates</div></div>';

  // ── Row 1: Price Target + Consensus ──────────────────────────────
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">';

  // Price target card
  var pt = d.price_target || {};
  if(pt.mean && pt.current){
    var lo = pt.low || pt.current, hi = pt.high || pt.mean;
    var pct = ((pt.mean - pt.current) / pt.current * 100).toFixed(1);
    var upside = parseFloat(pct) >= 0;
    // bar position: current relative to low–high range
    var range = hi - lo;
    var curPos = range > 0 ? Math.max(0, Math.min(100, (pt.current - lo) / range * 100)) : 50;
    var meanPos = range > 0 ? Math.max(0, Math.min(100, (pt.mean - lo) / range * 100)) : 50;
    html += '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:8px;padding:14px">';
    html += '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-bottom:10px">Price Target</div>';
    html += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">';
    html += '<span style="font-size:22px;font-weight:700;color:#f1f5f9">$' + (pt.mean||pt.median||0).toFixed(2) + '</span>';
    html += '<span style="font-size:13px;font-weight:600;color:' + (upside?'#22c55e':'#ef4444') + '">' + (upside?'+':'') + pct + '% upside</span>';
    html += '</div>';
    html += '<div style="font-size:11px;color:#475569;margin-bottom:10px">mean · median $' + (pt.median||0).toFixed(2) + '</div>';
    // range bar
    html += '<div style="position:relative;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;margin-bottom:6px">';
    html += '<div style="position:absolute;left:0;right:0;top:0;bottom:0;background:linear-gradient(90deg,rgba(239,68,68,0.3),rgba(34,197,94,0.3));border-radius:3px"></div>';
    // mean marker
    html += '<div style="position:absolute;top:-3px;width:2px;height:12px;background:#60a5fa;border-radius:1px;left:' + meanPos.toFixed(1) + '%"></div>';
    // current price marker
    html += '<div style="position:absolute;top:-4px;width:10px;height:14px;background:#f1f5f9;border-radius:2px;transform:translateX(-50%);left:' + curPos.toFixed(1) + '%"></div>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:#334155">';
    html += '<span>Low $' + (pt.low||0).toFixed(0) + '</span><span>High $' + (pt.high||0).toFixed(0) + '</span>';
    html += '</div>';
    html += '</div>';
  } else {
    html += '<div></div>';
  }

  // Consensus card
  var rec = d.recommendation || {};
  var totalRec = (rec.strongBuy||0) + (rec.buy||0) + (rec.hold||0) + (rec.sell||0) + (rec.strongSell||0);
  if(totalRec > 0){
    var bullish = rec.strongBuy + rec.buy;
    var bearish = rec.sell + rec.strongSell;
    var bullPct = (bullish / totalRec * 100).toFixed(0);
    var holdPct = (rec.hold / totalRec * 100).toFixed(0);
    var bearPct = (bearish / totalRec * 100).toFixed(0);
    var verdict = bullish > totalRec * 0.6 ? 'Strong Buy' : bullish > totalRec * 0.4 ? 'Buy' : bearish > totalRec * 0.4 ? 'Sell' : 'Hold';
    var verdictCol = verdict === 'Strong Buy' ? '#22c55e' : verdict === 'Buy' ? '#4ade80' : verdict === 'Sell' ? '#ef4444' : '#f59e0b';
    html += '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:8px;padding:14px">';
    html += '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-bottom:10px">Analyst Consensus <span style="font-weight:400;text-transform:none;letter-spacing:0">· ' + totalRec + ' analysts</span></div>';
    html += '<div style="font-size:22px;font-weight:700;color:' + verdictCol + ';margin-bottom:8px">' + verdict + '</div>';
    // stacked bar
    html += '<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px">';
    if(bullPct > 0) html += '<div style="width:' + bullPct + '%;background:#22c55e"></div>';
    if(holdPct > 0) html += '<div style="width:' + holdPct + '%;background:#f59e0b"></div>';
    if(bearPct > 0) html += '<div style="width:' + bearPct + '%;background:#ef4444"></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:12px;font-size:11px">';
    html += '<span style="color:#22c55e">▲ Buy ' + bullish + '</span>';
    html += '<span style="color:#f59e0b">— Hold ' + rec.hold + '</span>';
    html += '<span style="color:#ef4444">▼ Sell ' + bearish + '</span>';
    html += '</div>';
    html += '</div>';
  } else {
    html += '<div></div>';
  }
  html += '</div>'; // end grid

  // ── EPS + Revenue estimates table ──────────────────────────────────
  var eps = d.eps_estimates || [];
  var rev = d.rev_estimates || [];
  if(eps.length || rev.length){
    function fmtRev(v){ if(!v) return '—'; if(v>=1e12) return '$'+(v/1e12).toFixed(2)+'T'; if(v>=1e9) return '$'+(v/1e9).toFixed(1)+'B'; return '$'+(v/1e6).toFixed(0)+'M'; }
    function fmtGrowth(v){ if(v===null||v===undefined) return '—'; var pct=(v*100).toFixed(1); return '<span style="color:'+(parseFloat(pct)>=0?'#22c55e':'#ef4444')+'">'+(parseFloat(pct)>=0?'+':'')+pct+'%</span>'; }
    var periods = ['This Qtr','Next Qtr','This Year','Next Year'];
    var epsMap = {}; eps.forEach(function(r){ epsMap[r.period]=r; });
    var revMap = {}; rev.forEach(function(r){ revMap[r.period]=r; });
    html += '<div style="margin-top:14px;overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr>';
    html += '<th style="text-align:left;padding:6px 8px;color:#475569;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">Period</th>';
    html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">EPS Est</th>';
    html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">EPS Range</th>';
    html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">YoY</th>';
    html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">Rev Est</th>';
    html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">Rev YoY</th>';
    html += '</tr></thead><tbody>';
    periods.forEach(function(p){
      var e = epsMap[p] || {};
      var r = revMap[p] || {};
      var isAnnual = p === 'This Year' || p === 'Next Year';
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)' + (isAnnual?';background:rgba(255,255,255,0.02)':'') + '">';
      html += '<td style="padding:8px 8px;font-weight:600;color:#e2e8f0">' + p + '</td>';
      html += '<td style="text-align:right;padding:8px 8px;font-family:\'Courier New\',monospace;font-weight:700;color:#60a5fa">' + (e.avg!=null?'$'+e.avg:'—') + '</td>';
      html += '<td style="text-align:right;padding:8px 8px;color:#475569;font-size:11px">' + (e.low!=null&&e.high!=null?'$'+e.low+' – $'+e.high:'—') + '</td>';
      html += '<td style="text-align:right;padding:8px 8px">' + fmtGrowth(e.growth) + '</td>';
      html += '<td style="text-align:right;padding:8px 8px;font-family:\'Courier New\',monospace;font-weight:700;color:#a78bfa">' + fmtRev(r.avg) + '</td>';
      html += '<td style="text-align:right;padding:8px 8px">' + fmtGrowth(r.growth) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── Peer comparison ───────────────────────────────────────
function loadPeersComparison(sym){
  var el = document.getElementById('resPeersSection');
  if(!el) return;
  el.innerHTML = '<div style="color:#334155;font-size:12px;padding:16px 0">Loading peer comparison...</div>';
  fetch(API + '/api/peers?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){
        el.innerHTML =
          '<div style="background:rgba(100,116,139,0.08);border:1px solid var(--border2);border-radius:6px;padding:10px 14px;margin-top:16px;font-size:11px;color:#475569">' +
            '📊 <strong>Peer comparison not available</strong> for this ticker. ' +
            'Coverage is limited to major US-listed companies in the SPDR sector universe. ' +
            'Foreign stocks (OTC/ADR), small-caps, and ETFs are not included.' +
          '</div>';
        return;
      }
      renderPeers(d, el);
    })
    .catch(function(){ el.innerHTML = ''; });
}

function renderPeers(d, el){
  var peers = d.peers;
  var metrics = [
    { key:'pe_trailing',      label:'P/E (TTM)',    lowerBetter:true,  fmt:function(v){ return v != null && v > 0 ? v.toFixed(1) : '—'; } },
    { key:'pe_forward',       label:'P/E (Fwd)',    lowerBetter:true,  fmt:function(v){ return v != null && v > 0 ? v.toFixed(1) : '—'; } },
    { key:'gross_margin',     label:'Gross Margin', lowerBetter:false, fmt:function(v){ return v != null ? v.toFixed(1)+'%' : '—'; } },
    { key:'operating_margin', label:'Op. Margin',   lowerBetter:false, fmt:function(v){ return v != null ? v.toFixed(1)+'%' : '—'; } },
    { key:'net_margin',       label:'Net Margin',   lowerBetter:false, fmt:function(v){ return v != null ? v.toFixed(1)+'%' : '—'; } },
  ];

  function cellColor(val, allVals, lowerBetter){
    if(val == null || (lowerBetter && val <= 0)) return '#64748b';
    var valid = allVals.filter(function(v){ return v != null && (!lowerBetter || v > 0); });
    if(valid.length < 2) return '#e2e8f0';
    var mn = Math.min.apply(null, valid), mx = Math.max.apply(null, valid);
    if(mx === mn) return '#e2e8f0';
    var pct = (val - mn) / (mx - mn); // 0=min, 1=max
    if(lowerBetter) pct = 1 - pct;    // flip: lower value = greener
    return pct >= 0.65 ? '#22c55e' : pct >= 0.35 ? '#f59e0b' : '#ef4444';
  }

  var allVals = {};
  metrics.forEach(function(m){
    allVals[m.key] = peers.map(function(p){ return p[m.key]; });
  });

  var html = '<div class="mini-section" style="margin-top:20px">';
  html += '<div class="ms-header"><div class="ms-title">⚔️ Peer Comparison <span style="font-size:11px;font-weight:400;color:#475569">· ' + d.subsector + '</span></div></div>';
  html += '<div style="overflow-x:auto;margin-top:14px">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';

  // Header
  html += '<tr>';
  html += '<th style="text-align:left;padding:6px 8px;color:#475569;font-weight:600;font-size:10px;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap;min-width:120px">Company</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-weight:600;font-size:10px;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border)">MCap</th>';
  metrics.forEach(function(m){
    html += '<th style="text-align:right;padding:6px 8px;color:#475569;font-weight:600;font-size:10px;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap">' + m.label + '</th>';
  });
  html += '</tr>';

  // Rows
  peers.forEach(function(p){
    var isT = p.is_target;
    var bg  = isT ? 'rgba(74,158,255,0.06)' : 'transparent';
    var bl  = isT ? '2px solid #4a9eff' : '2px solid transparent';
    var rowStyle = 'background:' + bg + ';border-left:' + bl + (isT?'':'') + ';transition:background .15s';
    var rowAttrs = isT
      ? ' style="' + rowStyle + '"'
      : ' style="' + rowStyle + ';cursor:pointer"'
        + ' onclick="researchTicker(\'' + p.symbol + '\')"'
        + ' onmouseover="this.style.background=\'rgba(96,165,250,0.06)\'"'
        + ' onmouseout="this.style.background=\'' + bg + '\'"'
        + ' title="Research ' + p.symbol + '"';
    html += '<tr' + rowAttrs + '>';
    html += '<td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,0.04)">';
    html += '<div style="font-weight:' + (isT?'700':'500') + ';color:' + (isT?'#4a9eff':'#60a5fa') + ';font-size:13px' + (isT?'':';text-decoration:underline;text-underline-offset:2px') + '">' + p.symbol + '</div>';
    html += '<div style="font-size:10px;color:#334155;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.name||'') + '</div>';
    html += '</td>';
    html += '<td style="text-align:right;padding:8px 8px;border-bottom:1px solid rgba(255,255,255,0.04);color:#64748b;white-space:nowrap;font-size:11px">' + fmtMcap(p.market_cap) + '</td>';
    metrics.forEach(function(m){
      var val   = p[m.key];
      var color = cellColor(val, allVals[m.key], m.lowerBetter);
      html += '<td style="text-align:right;padding:8px 8px;border-bottom:1px solid rgba(255,255,255,0.04);font-family:\'Courier New\',monospace;font-weight:700;color:' + color + '">' + m.fmt(val) + '</td>';
    });
    html += '</tr>';
  });
  html += '</table></div>';

  // Verdict pills for the target company
  var target = null;
  peers.forEach(function(p){ if(p.is_target) target = p; });

  if(target){
    var pills = [];

    // P/E verdict
    var peVals = peers.map(function(p){ return p.pe_trailing; }).filter(function(v){ return v != null && v > 0; });
    if(target.pe_trailing != null && target.pe_trailing > 0 && peVals.length >= 3){
      var below = peVals.filter(function(v){ return v < target.pe_trailing; }).length;
      var peRank = below / (peVals.length - 1); // 0=cheapest, 1=most expensive
      var peLbl  = peRank < 0.33 ? 'Cheap' : peRank < 0.66 ? 'Fair' : 'Expensive';
      var peCol  = peRank < 0.33 ? '#22c55e' : peRank < 0.66 ? '#f59e0b' : '#ef4444';
      pills.push({ metric:'P/E vs Peers', label:peLbl, col:peCol });
    }

    // Margin verdicts
    [['gross_margin','Gross Margin'],['operating_margin','Op. Margin'],['net_margin','Net Margin']].forEach(function(pair){
      var k = pair[0], lab = pair[1];
      var mVals = peers.map(function(p){ return p[k]; }).filter(function(v){ return v != null; });
      if(target[k] != null && mVals.length >= 3){
        var above = mVals.filter(function(v){ return v > target[k]; }).length;
        var mRank = above / (mVals.length - 1); // 0=best, 1=worst
        var mLbl  = mRank < 0.33 ? 'Strong' : mRank < 0.66 ? 'Average' : 'Weak';
        var mCol  = mRank < 0.33 ? '#22c55e' : mRank < 0.66 ? '#f59e0b' : '#ef4444';
        pills.push({ metric:lab, label:mLbl, col:mCol });
      }
    });

    if(pills.length){
      html += '<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px">';
      pills.forEach(function(pill){
        html += '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:6px;padding:6px 12px">';
        html += '<div style="font-size:9px;color:#475569;letter-spacing:.8px;text-transform:uppercase;margin-bottom:3px">' + pill.metric + '</div>';
        html += '<div style="font-size:13px;font-weight:700;color:' + pill.col + '">' + pill.label + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
//  RISK ON / OFF METER
// ══════════════════════════════════════════════════════════

function riskScoreToColor(s){
  if(s<=20)return'#ef4444';
  if(s<=40)return'#f97316';
  if(s<=60)return'#f59e0b';
  if(s<=80)return'#86efac';
  return'#22c55e';
}

function riskScoreToLabel(s){
  if(s<=20)return'EXTREME RISK-OFF';
  if(s<=40)return'RISK-OFF';
  if(s<=60)return'NEUTRAL';
  if(s<=80)return'RISK-ON';
  return'EXTREME RISK-ON';
}

function buildRiskGaugeSvg(score){
  score=Math.max(0,Math.min(100,score));
  var cx=150,cy=148,r=105,sw=16;
  function toRad(s){return Math.PI*(1-s/100);}
  function px(a,rad){return cx+(rad==null?r:rad)*Math.cos(a);}
  function py(a,rad){return cy-(rad==null?r:rad)*Math.sin(a);}
  function arc(s1,s2,col){
    var a1=toRad(s1),a2=toRad(s2);
    var x1=px(a1).toFixed(1),y1=py(a1).toFixed(1),x2=px(a2).toFixed(1),y2=py(a2).toFixed(1);
    var lg=(s2-s1)>50?1:0;
    return'<path d="M '+x1+','+y1+' A '+r+','+r+' 0 '+lg+' 1 '+x2+','+y2+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-linecap="butt"/>';
  }
  var svg='';
  svg+=arc(0,100,'rgba(255,255,255,0.05)');
  svg+=arc(0,25,'#ef4444');
  svg+=arc(25,50,'#f97316');
  svg+=arc(50,75,'#f59e0b');
  svg+=arc(75,100,'#22c55e');
  // Tick marks + labels at 0,25,50,75,100
  [0,25,50,75,100].forEach(function(t){
    var a=toRad(t);
    var ix=px(a,r-sw/2-1).toFixed(1),iy=py(a,r-sw/2-1).toFixed(1);
    var ox=px(a,r+sw/2+3).toFixed(1),oy=py(a,r+sw/2+3).toFixed(1);
    svg+='<line x1="'+ix+'" y1="'+iy+'" x2="'+ox+'" y2="'+oy+'" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>';
    var lrad=r+sw/2+13;
    var lx=px(a,lrad).toFixed(1),ly=(py(a,lrad)+3).toFixed(1);
    svg+='<text x="'+lx+'" y="'+ly+'" fill="#334155" font-size="8" font-family="Inter,sans-serif" font-weight="600" text-anchor="middle">'+t+'</text>';
  });
  // Needle
  var ang=toRad(score);
  var nx=px(ang,r*0.79).toFixed(1),ny=py(ang,r*0.79).toFixed(1);
  svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+nx+'" y2="'+ny+'" stroke="rgba(255,255,255,0.12)" stroke-width="8" stroke-linecap="round"/>';
  svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+nx+'" y2="'+ny+'" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.92"/>';
  // Center dot
  var col=riskScoreToColor(score);
  svg+='<circle cx="'+cx+'" cy="'+cy+'" r="6.5" fill="'+col+'" stroke="#080810" stroke-width="3"/>';
  // Side labels
  svg+='<text x="24" y="164" fill="#475569" font-size="8" font-family="Inter,sans-serif" font-weight="700" text-anchor="middle">OFF</text>';
  svg+='<text x="276" y="164" fill="#475569" font-size="8" font-family="Inter,sans-serif" font-weight="700" text-anchor="middle">ON</text>';
  return'<svg viewBox="0 0 300 170" style="width:100%;max-width:340px;display:block;margin:0 auto">'+svg+'</svg>';
}

function scoreRiskSignals(data){
  var S={};
  // 1. VIX Level (15%)
  var vix=data.vix.current;
  var vs;
  if(vix<=12)vs=100;
  else if(vix<=15)vs=Math.round(100-(vix-12)/3*20);
  else if(vix<=20)vs=Math.round(80-(vix-15)/5*30);
  else if(vix<=25)vs=Math.round(50-(vix-20)/5*25);
  else if(vix<=30)vs=Math.round(25-(vix-25)/5*20);
  else vs=Math.max(0,Math.round(5-(vix-30)*1.5));
  S.vixLevel={score:vs,weight:.15,label:'VIX Level',icon:'⚡',
    value:vix.toFixed(1),
    detail:vix<=15?'Calm — market relaxed':vix<=20?'Elevated — caution zone':vix<=25?'High fear — risk-off pressure':'Panic — extreme risk-off'};
  // 2. VIX Term Structure (15%)
  var vxv=data.vxv||vix;
  var ratio=vxv>0?vix/vxv:1;
  var ts;
  if(ratio<0.85)ts=100;
  else if(ratio<0.92)ts=Math.round(100-(ratio-0.85)/0.07*25);
  else if(ratio<0.97)ts=Math.round(75-(ratio-0.92)/0.05*20);
  else if(ratio<1.02)ts=Math.round(55-(ratio-0.97)/0.05*25);
  else if(ratio<1.10)ts=Math.round(30-(ratio-1.02)/0.08*25);
  else ts=Math.max(0,Math.round(5-(ratio-1.1)*20));
  var tsText=ratio<0.90?'Deep contango — very calm':ratio<0.97?'Contango — normal':ratio<1.02?'Near flat — watch closely':ratio<1.10?'Backwardation — fear':'Extreme backwardation — panic';
  S.termStructure={score:ts,weight:.15,label:'VIX Term Structure',icon:'📐',
    value:'Ratio '+ratio.toFixed(3),
    detail:tsText+' (VXV '+vxv.toFixed(1)+')'};
  // 3. Credit Spreads (20%) — HYG vs LQD daily %
  var hyg=data.credit.hyg_pct,lqd=data.credit.lqd_pct;
  var csp=hyg-lqd;
  var cs=Math.round(50+csp/0.5*50);
  cs=Math.max(0,Math.min(100,cs));
  S.credit={score:cs,weight:.20,label:'Credit Spreads',icon:'🏦',
    value:(csp>=0?'+':'')+csp.toFixed(2)+'%',
    detail:'HYG '+(hyg>=0?'+':'')+hyg.toFixed(2)+'% vs LQD '+(lqd>=0?'+':'')+lqd.toFixed(2)+'%'};
  // 4. Market Breadth (15%) — RSP vs SPY
  var spy=data.breadth.spy_pct,rsp=data.breadth.rsp_pct;
  var bsp=rsp-spy;
  var bs=Math.round(50+bsp/0.5*50);
  bs=Math.max(0,Math.min(100,bs));
  S.breadth={score:bs,weight:.15,label:'Market Breadth',icon:'📊',
    value:(bsp>=0?'+':'')+bsp.toFixed(2)+'%',
    detail:'SPY '+(spy>=0?'+':'')+spy.toFixed(2)+'% · RSP '+(rsp>=0?'+':'')+rsp.toFixed(2)+'%'};
  // 5. Sector Rotation (15%) — risk-on vs defensive ETFs
  var sr=data.sector_rotation,ssp=sr.spread;
  var ss=Math.round(50+ssp/2.0*50);
  ss=Math.max(0,Math.min(100,ss));
  var ro=sr.risk_on_avg,rof=sr.risk_off_avg;
  S.sectorRotation={score:ss,weight:.15,label:'Sector Rotation',icon:'🔄',
    value:(ssp>=0?'+':'')+ssp.toFixed(2)+'%',
    detail:'Tech/Disc/Comm '+(ro>=0?'+':'')+ro.toFixed(2)+'% · Util/Staples/Health '+(rof>=0?'+':'')+rof.toFixed(2)+'%'};
  // 6. Put/Call Ratio (10%)
  var pcr=data.pcr||1.0;
  var ps=Math.round((1.3-pcr)/(1.3-0.5)*100);
  ps=Math.max(0,Math.min(100,ps));
  var pcrText=pcr<0.65?'Extreme call buying — greed':pcr<0.80?'Bullish options flow':pcr<0.95?'Balanced sentiment':pcr<1.10?'Defensive put buying':'Heavy put buying — fear';
  S.pcr={score:ps,weight:.10,label:'Put/Call Ratio',icon:'⚖️',
    value:pcr.toFixed(2),
    detail:pcrText};
  // 7. SPY 200DMA (10%)
  var pa=data.spy_200dma.pct_above;
  var ds;
  if(pa>8)ds=100;
  else if(pa>5)ds=Math.round(85+(pa-5)/3*15);
  else if(pa>2)ds=Math.round(65+(pa-2)/3*20);
  else if(pa>0)ds=Math.round(55+pa/2*10);
  else if(pa>-2)ds=Math.round(35+(pa+2)/2*20);
  else if(pa>-5)ds=Math.round(10+(pa+5)/3*25);
  else ds=Math.max(0,Math.round(10+(pa+5)*3));
  S.spy200dma={score:ds,weight:.10,label:'SPY 200-Day MA',icon:'📈',
    value:(pa>=0?'+':'')+pa.toFixed(1)+'%',
    detail:'SPY $'+data.spy_200dma.current.toFixed(0)+' · MA200 $'+data.spy_200dma.ma200.toFixed(0)};
  // Composite weighted average
  var total=0,wt=0;
  Object.values(S).forEach(function(sig){total+=sig.score*sig.weight;wt+=sig.weight;});
  var comp=Math.max(0,Math.min(100,Math.round(total/wt)));
  return{signals:S,composite:comp};
}

function generateRiskSummary(signals,composite){
  var arr=Object.values(signals).sort(function(a,b){return Math.abs(b.score-50)-Math.abs(a.score-50);});
  var lead=arr[0],second=arr[1];
  var mood=composite>=75?'Risk appetite is elevated':composite>=60?'Markets leaning risk-on':composite>=45?'Conditions broadly neutral':composite>=30?'Risk sentiment cautious':'Markets in risk-off mode';
  var ld=lead.score>=75?lead.label+' firmly bullish ('+lead.score+'/100)':lead.score>=60?lead.label+' mildly positive ('+lead.score+'/100)':lead.score<=25?lead.label+' signaling danger ('+lead.score+'/100)':lead.score<=40?lead.label+' leaning bearish ('+lead.score+'/100)':lead.label+' mixed';
  var sd=second.score>=65?' with '+second.label.toLowerCase()+' also supportive.':second.score<=35?' and '+second.label.toLowerCase()+' also concerning.':'.';
  return mood+'. '+ld+sd;
}

function renderRiskMeter(result,data){
  var composite=result.composite,signals=result.signals;
  var color=riskScoreToColor(composite);
  document.getElementById('riskGaugeSvgWrap').innerHTML=buildRiskGaugeSvg(composite);
  var sn=document.getElementById('riskScoreNum');
  sn.textContent=composite;sn.style.color=color;
  var rl=document.getElementById('riskLabel');
  rl.textContent=riskScoreToLabel(composite);rl.style.color=color;
  document.getElementById('riskSummary').textContent=generateRiskSummary(signals,composite);
  // Contributions (sorted best→worst)
  var arr=Object.entries(signals).sort(function(a,b){return b[1].score-a[1].score;});
  var cHtml='';
  arr.forEach(function(e){
    var sig=e[1],sc=riskScoreToColor(sig.score);
    cHtml+='<div class="rsig-contrib-row">'
      +'<div class="rsig-contrib-name">'+sig.icon+' '+sig.label+'</div>'
      +'<div class="rsig-contrib-track"><div class="rsig-contrib-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-contrib-score" style="color:'+sc+'">'+sig.score+'</div>'
      +'</div>';
  });
  document.getElementById('riskContribRows').innerHTML=cHtml;
  // Signal cards
  var gHtml='';
  Object.values(signals).forEach(function(sig){
    var sc=riskScoreToColor(sig.score);
    var bc=sig.score>=65?'ron':sig.score>=45?'neu':'rof';
    var bt=sig.score>=65?'RISK-ON':sig.score>=45?'NEUTRAL':'RISK-OFF';
    gHtml+='<div class="rsig-card">'
      +'<div class="rsig-card-head">'
        +'<div class="rsig-card-name">'+sig.icon+'&nbsp;'+sig.label+'</div>'
        +'<span class="rsig-badge '+bc+'">'+bt+'</span>'
      +'</div>'
      +'<div class="rsig-val" style="color:'+sc+'">'+sig.value+'</div>'
      +'<div class="rsig-detail">'+sig.detail+'</div>'
      +'<div class="rsig-bar-track"><div class="rsig-bar-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-bar-foot">'
        +'<div class="rsig-bar-score">Score '+sig.score+'/100</div>'
        +'<div class="rsig-bar-wt">WT '+(sig.weight*100|0)+'%</div>'
      +'</div>'
      +'</div>';
  });
  document.getElementById('riskSignalGrid').innerHTML=gHtml;
}

async function loadRiskMeter(){
  document.getElementById('riskLastUpdated').textContent='Loading...';
  document.getElementById('riskGaugeSvgWrap').innerHTML='<div style="color:#334155;font-size:12px;padding:40px 0">Fetching signals...</div>';
  document.getElementById('riskSignalGrid').innerHTML='';
  document.getElementById('riskContribRows').innerHTML='';
  try{
    var res=await fetch(API+'/api/risk-signals');
    var data=await res.json();
    if(data.error)throw new Error(data.error);
    var result=scoreRiskSignals(data);
    renderRiskMeter(result,data);
    document.getElementById('riskLastUpdated').textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    document.getElementById('riskLastUpdated').textContent='Failed — '+e.message;
    document.getElementById('riskGaugeSvgWrap').innerHTML='';
    console.error('loadRiskMeter:',e);
  }
}

// ── CRYPTO DASHBOARD ─────────────────────────────────────
var _cohortChart = null, _onchainChart = null;
var _cohortPeriod = '24h', _cohortView = 'bar', _cohortLineDays = 30, _onchainKpi = 'tvl';

function fmtMc(v){
  if(v >= 1e12) return '$' + (v/1e12).toFixed(2) + 'T';
  if(v >= 1e9)  return '$' + (v/1e9).toFixed(1) + 'B';
  if(v >= 1e6)  return '$' + (v/1e6).toFixed(0) + 'M';
  return '$' + Math.round(v).toLocaleString();
}
function fmtPct(v){return (v>=0?'+':'')+v.toFixed(2)+'%';}
function pctColor(v){return v>=0?'#22c55e':'#ef4444';}

async function loadCryptoDash(){
  document.getElementById('cdLastUpdated').textContent = 'Loading…';
  await Promise.all([
    loadCryptoGlobal(),
    loadCohortChart(),
    loadOnchainChart(),
  ]);
  document.getElementById('cdLastUpdated').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

async function loadCryptoGlobal(){
  try{
    var r = await fetch(API+'/api/crypto-global');
    var d = await r.json();
    if(d.error) return;
    var mc = d.total_market_cap;
    var el = document.getElementById('cdMcValue');
    el.textContent = fmtMc(mc);
    el.style.color = pctColor(d.mc_change_24h);
    var c24 = document.getElementById('cdChg24h');
    c24.textContent = fmtPct(d.mc_change_24h);
    c24.style.color  = pctColor(d.mc_change_24h);
    var c7 = document.getElementById('cdChg7d');
    c7.textContent = fmtPct(d.mc_change_7d);
    c7.style.color  = pctColor(d.mc_change_7d);
    document.getElementById('cdBtcDom').textContent = d.btc_dominance + '%';
    document.getElementById('cdVol24h').textContent = fmtMc(d.total_volume_24h);
  }catch(e){console.error('loadCryptoGlobal:',e);}
}

function setCohortPeriod(period, btn){
  _cohortPeriod = period;
  document.querySelectorAll('#cohortPeriodTabs .cd-tab').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  loadCohortChart();
}
function setCohortLineDays(days, btn){
  _cohortLineDays = days;
  document.querySelectorAll('#cohortLinePeriodTabs .cd-tab').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  loadCohortChart();
}
function setCohortView(view){
  _cohortView = view;
  document.getElementById('cohortBarBtn').classList.toggle('active', view==='bar');
  document.getElementById('cohortLineBtn').classList.toggle('active', view==='line');
  document.getElementById('cohortLinePeriodTabs').style.display = view==='line' ? 'flex' : 'none';
  document.getElementById('cohortBreakdown').style.display = 'none';
  loadCohortChart();
}

var _COHORT_COLORS = [
  '#f59e0b','#4a9eff','#22c55e','#a78bfa','#fb923c',
  '#38bdf8','#f472b6','#34d399','#e2e8f0','#fbbf24',
  '#60a5fa','#c084fc','#86efac'
];

async function loadCohortChart(){
  var canvas = document.getElementById('cohortChart');
  if(!canvas) return;
  if(_cohortChart){ _cohortChart.destroy(); _cohortChart = null; }
  canvas.style.opacity = '0.4';

  try{
    if(_cohortView === 'bar'){
      var r = await fetch(API+'/api/cohort-performance?period='+_cohortPeriod);
      var data = await r.json();
      if(!Array.isArray(data) || !data.length){ canvas.style.opacity='1'; return; }
      canvas.style.opacity = '1';

      var labels = data.map(function(d){ return d.cohort; });
      var values = data.map(function(d){ return d.change; });
      var bgColors = values.map(function(v){ return v>=0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'; });
      var bdColors = values.map(function(v){ return v>=0 ? '#22c55e' : '#ef4444'; });

      _cohortChart = new Chart(canvas, {
        type: 'bar',
        data: { labels: labels, datasets:[{
          data: values, backgroundColor: bgColors, borderColor: bdColors,
          borderWidth: 0, borderRadius: 5, borderSkipped: false,
        }]},
        options:{
          indexAxis: 'y', responsive:true, maintainAspectRatio:false,
          onClick: function(e, els, chart){
            var nat = e.native;
            var cx = nat.offsetX, cy = nat.offsetY;
            // Detect click in y-axis label area (left of chart area)
            if(cx < chart.chartArea.left){
              var yAxis = chart.scales.y;
              for(var i=0; i<data.length; i++){
                var py = yAxis.getPixelForValue(i);
                if(Math.abs(cy - py) <= 14){ showCohortBreakdown(data[i]); return; }
              }
              return;
            }
            if(!els.length) return;
            showCohortBreakdown(data[els[0].index]);
          },
          plugins:{
            legend:{display:false},
            tooltip:{
              callbacks:{
                label: function(ctx){
                  return ' ' + fmtPct(ctx.raw);
                },
                afterBody: function(items){
                  var d2 = data[items[0].dataIndex];
                  return d2.coins.map(function(c){ return '  '+c.name+': '+fmtPct(c.change); });
                }
              }
            }
          },
          scales:{
            x:{ grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
                ticks:{color:'#475569', callback:function(v){return fmtPct(v);}} },
            y:{ grid:{display:false}, border:{color:'transparent'},
                ticks:{color:'#4a9eff', font:{size:11, weight:'700'}} }
          }
        }
      });

    } else {
      // Line: normalized price history
      var r2 = await fetch(API+'/api/cohort-prices?days='+_cohortLineDays);
      var priceData = await r2.json();
      if(priceData.error){ canvas.style.opacity='1'; return; }
      canvas.style.opacity = '1';

      var cohorts = Object.keys(priceData);
      var datasets = cohorts.map(function(name, i){
        var series = priceData[name];
        var color = _COHORT_COLORS[i % _COHORT_COLORS.length];
        return {
          label: name,
          data: series.indexed,
          borderColor: color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
        };
      });

      // Use first series timestamps as labels (formatted dates)
      var firstSeries = priceData[cohorts[0]];
      var labels2 = firstSeries.timestamps.map(function(ts){
        var d3 = new Date(ts);
        return (d3.getMonth()+1) + '/' + d3.getDate();
      });

      _cohortChart = new Chart(canvas, {
        type: 'line',
        data: { labels: labels2, datasets: datasets },
        options:{
          responsive:true, maintainAspectRatio:false,
          interaction:{mode:'index', intersect:false},
          plugins:{
            legend:{
              display:true,
              position:'top',
              labels:{color:'#64748b', font:{size:9}, boxWidth:12, padding:10}
            },
            tooltip:{
              callbacks:{
                label: function(ctx){
                  var v = ctx.raw - 100;
                  return ' '+ctx.dataset.label+': '+(v>=0?'+':'')+v.toFixed(1)+'%';
                }
              }
            }
          },
          scales:{
            x:{ grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
                ticks:{color:'#475569', maxTicksLimit:10, font:{size:10}} },
            y:{ grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
                ticks:{color:'#475569', callback:function(v){
                  return (v-100>=0?'+':'')+(v-100).toFixed(0)+'%';
                }},
                title:{display:true, text:'% vs start', color:'#334155', font:{size:9}}
              }
          }
        }
      });
    }
  }catch(e){ canvas.style.opacity='1'; console.error('loadCohortChart:',e); }
}

function showCohortBreakdown(cohortData){
  var el = document.getElementById('cohortBreakdown');
  var coins = (cohortData.coins || []).slice().sort(function(a,b){ return b.change - a.change; });
  var leaders = coins.filter(function(c){ return c.change >= 0; });
  var laggards = coins.filter(function(c){ return c.change < 0; }).reverse();

  function tokenCard(c, idx){
    var col = pctColor(c.change);
    var bg = c.change >= 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)';
    var sym = c.name || c.symbol || c.id || '';
    var safeId = (c.id || '').replace(/'/g, '');
    var safeSym = sym.replace(/'/g, '');
    var priceStr = c.price != null ? (c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)) : '—';
    return '<div class="cd-token-card" style="border-color:'+(c.change>=0?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)')+';background:'+bg+'" onclick="openTokenDetail(\''+safeId+'\',\''+safeSym+'\')">'
      + '<div class="cd-token-rank">#'+(idx+1)+'</div>'
      + '<div class="cd-token-name">'+sym+'</div>'
      + '<div class="cd-token-sym">'+safeId+'</div>'
      + '<div class="cd-token-chg" style="color:'+col+'">'+fmtPct(c.change)+'</div>'
      + '<div class="cd-token-meta">$'+priceStr+' · $'+c.mcap_b+'B</div>'
      + '</div>';
  }

  var totalMcap = coins.reduce(function(sum,c){ return sum + (c.mcap_b||0); }, 0);
  var avgChange = coins.length ? (coins.reduce(function(sum,c){ return sum+(c.change||0);},0)/coins.length) : 0;

  var html = '<div class="cd-drill-panel">'
    + '<div class="cd-drill-header">'
    + '<div>'
    + '<span class="cd-drill-title">'+cohortData.cohort+' — '+coins.length+' tokens</span>'
    + '<div style="display:flex;gap:12px;margin-top:5px">'
    + '<span style="font-size:10px;color:#94a3b8">Total Mcap: <b style="color:#e2e8f0">$'+totalMcap.toFixed(1)+'B</b></span>'
    + '<span style="font-size:10px;color:#94a3b8">Avg Move: <b style="color:'+pctColor(avgChange)+'">'+fmtPct(avgChange)+'</b></span>'
    + '</div>'
    + '</div>'
    + '<button class="cd-drill-close" onclick="document.getElementById(\'cohortBreakdown\').style.display=\'none\'">✕ Close</button>'
    + '</div>';

  if(leaders.length){
    html += '<div class="cd-drill-label">▲ Leaders</div><div class="cd-token-grid">';
    leaders.forEach(function(c, i){ html += tokenCard(c, i); });
    html += '</div>';
  }
  if(laggards.length){
    html += '<div class="cd-drill-label" style="margin-top:10px">▼ Laggards</div><div class="cd-token-grid">';
    laggards.forEach(function(c, i){ html += tokenCard(c, i); });
    html += '</div>';
  }

  // News placeholder — load async
  html += '<div class="cd-news-section"><div class="cd-news-title">📰 Related News — '+cohortData.cohort+'</div>'
    + '<div id="cohortNewsContainer"><div style="font-size:10px;color:#334155;padding:6px 0">Loading news…</div></div>'
    + '</div></div>';

  el.innerHTML = html;
  el.style.display = 'block';

  // Scroll into view
  el.scrollIntoView({behavior:'smooth', block:'nearest'});

  // Load news async
  loadCohortNews(cohortData.cohort);
}

async function loadCohortNews(cohort){
  var container = document.getElementById('cohortNewsContainer');
  if(!container) return;
  try{
    var r = await fetch(API+'/api/cohort-news?cohort='+encodeURIComponent(cohort));
    var stories = await r.json();
    if(!stories.length){
      container.innerHTML = '<div style="font-size:10px;color:#334155;padding:6px 0">No recent news found for this cohort.</div>';
      return;
    }
    container.innerHTML = stories.map(function(s){
      return '<div class="cd-news-item" onclick="window.open(\''+s.url+'\',\'_blank\')">'
        + '<div style="flex:1">'
        + '<div class="cd-news-headline">'+s.title+'</div>'
        + '<div class="cd-news-source">'+s.source+' · '+s.pub+'</div>'
        + '</div>'
        + '<div style="color:#334155;font-size:12px;align-self:center">›</div>'
        + '</div>';
    }).join('');
  }catch(e){
    if(container) container.innerHTML = '<div style="font-size:10px;color:#334155">News unavailable.</div>';
  }
}

// ── TOKEN DETAIL OVERLAY ──────────────────────────────────
var _tdChart = null;

function openTokenDetail(coinId, displayLabel){
  if(!coinId){ console.error('openTokenDetail: no coinId'); return; }
  document.getElementById('tokenOverlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  document.getElementById('tdBody').innerHTML = '<div style="text-align:center;padding:80px 0;color:#334155;font-size:14px">Loading '+(displayLabel||coinId)+'…</div>';
  fetchTokenDetail(coinId);
}

function closeTokenOverlay(){
  document.getElementById('tokenOverlay').style.display = 'none';
  document.body.style.overflow = '';
  if(_tdChart){ _tdChart.destroy(); _tdChart = null; }
}

function _fmtSupply(v){
  if(!v) return '—';
  if(v >= 1e9) return (v/1e9).toFixed(2)+'B';
  if(v >= 1e6) return (v/1e6).toFixed(2)+'M';
  return v.toLocaleString();
}

function _fmtPrice(v){
  if(!v && v !== 0) return '—';
  if(v >= 1) return '$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  if(v >= 0.01) return '$'+v.toFixed(4);
  return '$'+v.toFixed(8);
}

async function fetchTokenDetail(coinId){
  try{
    var r = await fetch(API+'/api/token-detail?id='+encodeURIComponent(coinId));
    var d = await r.json();
    if(d.error){
      document.getElementById('tdBody').innerHTML =
        '<div style="padding:60px 24px;text-align:center">'
        + '<div style="font-size:32px;margin-bottom:12px">⚠️</div>'
        + '<div style="font-size:13px;color:#ef4444;margin-bottom:8px">'+d.error+'</div>'
        + '<div style="font-size:11px;color:#334155">Coin ID: '+coinId+'</div>'
        + (d.error.includes('rate') ? '<button onclick="fetchTokenDetail(\''+coinId+'\')" style="margin-top:16px;background:rgba(74,158,255,0.1);border:1px solid rgba(74,158,255,0.3);color:#4a9eff;border-radius:8px;padding:8px 20px;cursor:pointer;font-size:12px">Retry</button>' : '')
        + '</div>';
      return;
    }
    renderTokenDetail(d);
  }catch(e){
    document.getElementById('tdBody').innerHTML = '<div style="padding:40px;color:#ef4444">Failed to load token data. Check console.</div>';
    console.error('fetchTokenDetail:', e);
  }
}

function renderTokenDetail(d){
  var chg24  = d.price_change_24h  || 0;
  var chg7d  = d.price_change_7d   || 0;
  var chg30d = d.price_change_30d  || 0;

  function chgPill(v, label){
    var cls = v >= 0 ? 'up' : 'dn';
    return '<span class="td-chg-pill '+cls+'">'+(v>=0?'▲':'▼')+' '+Math.abs(v).toFixed(2)+'% '+label+'</span>';
  }

  // Supply tokenomics
  var circ  = d.circulating_supply || 0;
  var total = d.total_supply || d.max_supply || circ;
  var maxS  = d.max_supply;
  var locked = total > circ ? total - circ : 0;
  var circPct  = total > 0 ? (circ/total*100).toFixed(1) : 0;
  var lockedPct = total > 0 ? (locked/total*100).toFixed(1) : 0;

  // Score badges
  var scores = [
    {val: d.coingecko_score ? d.coingecko_score.toFixed(1) : '—', lbl:'CoinGecko'},
    {val: d.developer_score ? d.developer_score.toFixed(1) : '—', lbl:'Developer'},
    {val: d.community_score ? d.community_score.toFixed(1) : '—', lbl:'Community'},
    {val: d.sentiment_up ? d.sentiment_up.toFixed(0)+'%' : '—', lbl:'Sentiment ↑'},
  ];

  // Stats grid
  var stats = [
    {label:'Market Cap',    val: d.market_cap ? fmtMc(d.market_cap) : '—', sub: d.market_cap_rank ? '#'+d.market_cap_rank+' rank' : ''},
    {label:'24h Volume',    val: d.volume_24h ? fmtMc(d.volume_24h) : '—', sub: d.market_cap ? 'V/MC: '+(d.volume_24h/d.market_cap*100).toFixed(1)+'%' : ''},
    {label:'FDV',           val: d.fdv ? fmtMc(d.fdv) : '—', sub: d.market_cap && d.fdv ? 'MC/FDV: '+(d.market_cap/d.fdv*100).toFixed(0)+'%' : ''},
    {label:'Circulating',   val: _fmtSupply(d.circulating_supply), sub: maxS ? 'of '+_fmtSupply(maxS)+' max' : ''},
    {label:'All-Time High', val: _fmtPrice(d.ath), sub: d.ath_change_pct ? fmtPct(d.ath_change_pct)+' from ATH' : ''},
    {label:'All-Time Low',  val: _fmtPrice(d.atl), sub: d.ath_date ? 'ATH: '+d.ath_date : ''},
  ];

  // Links
  var links = [];
  if(d.homepage) links.push('<a class="td-link" href="'+d.homepage+'" target="_blank">🌐 Website</a>');
  if(d.whitepaper) links.push('<a class="td-link" href="'+d.whitepaper+'" target="_blank">📄 Whitepaper</a>');
  if(d.github) links.push('<a class="td-link" href="'+d.github+'" target="_blank">💻 GitHub</a>');
  if(d.twitter) links.push('<a class="td-link" href="https://twitter.com/'+d.twitter+'" target="_blank">𝕏 @'+d.twitter+'</a>');
  if(d.reddit) links.push('<a class="td-link" href="'+d.reddit+'" target="_blank">Reddit</a>');

  // Truncate description at 400 chars
  var desc = (d.description || '').replace(/<[^>]+>/g,'');
  var descShort = desc.length > 400 ? desc.slice(0,400)+'…' : desc;

  var html = ''
    // Header
    + '<div class="td-header">'
    + (d.image ? '<img class="td-logo" src="'+d.image+'" alt="">' : '<div class="td-logo"></div>')
    + '<div class="td-name-block">'
    + '<div class="td-name">'+d.name+'</div>'
    + '<div class="td-sym-rank">'+d.symbol+' · '+d.categories.slice(0,3).join(' · ')+(d.genesis_date?' · Since '+d.genesis_date.slice(0,4):'')+'</div>'
    + '</div>'
    + '<div class="td-price-block">'
    + '<div class="td-price">'+_fmtPrice(d.price)+'</div>'
    + '<div class="td-changes">'+chgPill(chg24,'24h')+chgPill(chg7d,'7D')+chgPill(chg30d,'30D')+'</div>'
    + '</div></div>'

    // Price chart
    + '<div class="td-section-title">30-Day Price</div>'
    + '<div class="td-chart-wrap"><canvas id="tdPriceChart"></canvas></div>'

    // Scores
    + '<div class="td-section-title">Scores</div>'
    + '<div class="td-scores">'
    + scores.map(function(s){ return '<div class="td-score-card"><div class="td-score-val">'+s.val+'</div><div class="td-score-lbl">'+s.lbl+'</div></div>'; }).join('')
    + '</div>'

    // Key stats
    + '<div class="td-section-title">Key Metrics</div>'
    + '<div class="td-stats-grid">'
    + stats.map(function(s){ return '<div class="td-stat"><div class="td-stat-label">'+s.label+'</div><div class="td-stat-val">'+s.val+'</div>'+(s.sub?'<div class="td-stat-sub">'+s.sub+'</div>':'')+'</div>'; }).join('')
    + '</div>'

    // Tokenomics supply bar
    + '<div class="td-section-title">Token Supply</div>'
    + '<div class="td-supply-bar-wrap">'
    + (circ > 0 ? '<div class="td-supply-seg" style="width:'+circPct+'%;background:linear-gradient(90deg,#22c55e,#16a34a)"></div>' : '')
    + (locked > 0 ? '<div class="td-supply-seg" style="width:'+lockedPct+'%;background:linear-gradient(90deg,#f59e0b,#d97706)"></div>' : '')
    + '</div>'
    + '<div class="td-supply-legend">'
    + (circ > 0 ? '<span class="td-supply-legend-item"><span class="td-supply-dot" style="background:#22c55e"></span>Circulating '+_fmtSupply(circ)+' ('+circPct+'%)</span>' : '')
    + (locked > 0 ? '<span class="td-supply-legend-item"><span class="td-supply-dot" style="background:#f59e0b"></span>Locked '+_fmtSupply(locked)+' ('+lockedPct+'%)</span>' : '')
    + (maxS ? '<span class="td-supply-legend-item" style="color:#334155">Max '+_fmtSupply(maxS)+'</span>' : '')
    + '</div>'

    // About
    + '<div class="td-section-title">About</div>'
    + (desc ? '<div class="td-about" id="tdAbout">'+descShort+'</div>'
       + (desc.length > 400 ? '<div class="td-about-toggle" onclick="_tdToggleAbout()">Read more ›</div>' : '')
     : '<div style="font-size:12px;color:#334155">No description available.</div>')

    // Links
    + (links.length ? '<div class="td-links">'+links.join('')+'</div>' : '');

  document.getElementById('tdBody').innerHTML = html;

  // Render price chart
  if(d.prices_30d && d.prices_30d.length){
    var canvas2 = document.getElementById('tdPriceChart');
    if(canvas2){
      if(_tdChart){ _tdChart.destroy(); _tdChart = null; }
      var prices = d.prices_30d;
      var plabels = prices.map(function(p){ return new Date(p[0]).toLocaleDateString('en-US',{month:'short',day:'numeric'}); });
      var pvals   = prices.map(function(p){ return p[1]; });
      var isUp = pvals[pvals.length-1] >= pvals[0];
      var lineColor = isUp ? '#22c55e' : '#ef4444';
      var ctx2 = canvas2.getContext('2d');
      var grad2 = ctx2.createLinearGradient(0,0,0,200);
      grad2.addColorStop(0, isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)');
      grad2.addColorStop(1, 'rgba(0,0,0,0)');
      _tdChart = new Chart(canvas2, {
        type:'line',
        data:{ labels: plabels, datasets:[{
          data: pvals, borderColor: lineColor, backgroundColor: grad2,
          borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35,
        }]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{
            backgroundColor:'rgba(10,14,33,0.9)', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
            callbacks:{ label: function(ctx){ return ' '+_fmtPrice(ctx.raw); } }
          }},
          scales:{
            x:{ grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'}, ticks:{color:'#475569',maxTicksLimit:7}},
            y:{ grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'}, ticks:{color:'#475569',callback:function(v){return _fmtPrice(v);}}}
          }
        }
      });
    }
  }
}

function _tdToggleAbout(){
  var el = document.getElementById('tdAbout');
  if(!el) return;
  el.classList.toggle('expanded');
  var btn = el.nextElementSibling;
  if(btn) btn.textContent = el.classList.contains('expanded') ? 'Show less ‹' : 'Read more ›';
}

var _onchainDays = 30;
var _onchainHiddenProtocols = {};
var _onchainAllProtocols = [];

var _ONCHAIN_LINE_COLORS = ['#4a9eff','#22c55e','#a78bfa','#f59e0b','#fb923c','#f472b6','#38bdf8','#34d399','#fbbf24','#60a5fa','#c084fc','#86efac','#e2e8f0'];

function setOnchainKpi(kpi, btn){
  _onchainKpi = kpi;
  _onchainHiddenProtocols = {};
  document.querySelectorAll('#onchainKpiTabs .cd-tab').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  loadOnchainChart();
}

function setOnchainDays(days, btn){
  _onchainDays = days;
  document.querySelectorAll('#onchainDaysTabs .cd-vbtn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  loadOnchainChart();
}

function _buildOnchainPicker(protocols){
  var el = document.getElementById('onchainProtocolPicker');
  if(!el) return;
  el.innerHTML = protocols.map(function(name, i){
    var hidden = !!_onchainHiddenProtocols[name];
    var color = _ONCHAIN_LINE_COLORS[i % _ONCHAIN_LINE_COLORS.length];
    return '<button onclick="_toggleOnchainProtocol(\''+name+'\')" style="'+
      'font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;cursor:pointer;transition:all .15s;'+
      'border:1px solid '+(hidden?'rgba(255,255,255,0.07)':color)+';'+
      'background:'+(hidden?'transparent':'rgba('+_hexToRgb(color)+',0.12)')+';'+
      'color:'+(hidden?'#475569':color)+';'+
      '" data-proto="'+name+'">'+name+'</button>';
  }).join('');
}

function _hexToRgb(hex){
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}

function _toggleOnchainProtocol(name){
  if(_onchainHiddenProtocols[name]) delete _onchainHiddenProtocols[name];
  else _onchainHiddenProtocols[name] = true;
  _buildOnchainPicker(_onchainAllProtocols);
  _renderOnchainLineChart(_onchainLastData);
}

var _onchainLastData = null;

async function loadOnchainChart(){
  var canvas = document.getElementById('onchainChart');
  if(!canvas) return;
  if(_onchainChart){ _onchainChart.destroy(); _onchainChart = null; }
  canvas.style.opacity = '0.4';
  document.getElementById('onchainMeta').textContent = 'Loading…';

  try{
    var r = await fetch(API+'/api/onchain-history?kpi='+_onchainKpi+'&days='+_onchainDays);
    var data = await r.json();
    if(data.error){ canvas.style.opacity='1'; document.getElementById('onchainMeta').textContent='Error: '+data.error; return; }

    _onchainLastData = data;
    var protocols = Object.keys(data).filter(function(k){ return k !== '__protocols__'; });
    _onchainAllProtocols = protocols;
    _buildOnchainPicker(protocols);
    _renderOnchainLineChart(data);

  }catch(e){ canvas.style.opacity='1'; console.error('loadOnchainChart:',e); }
}

function _renderOnchainLineChart(data){
  if(!data) return;
  var canvas = document.getElementById('onchainChart');
  if(!canvas) return;
  if(_onchainChart){ _onchainChart.destroy(); _onchainChart = null; }

  var protocols = Object.keys(data).filter(function(k){ return k !== '__protocols__'; });
  var kpiLabel = {tvl:'TVL ($)', dex_volume:'DEX Volume ($)', fees:'Fees ($)', revenue:'Revenue ($)'}[_onchainKpi] || _onchainKpi;

  // Build shared labels from first visible protocol's timestamps
  var refProto = protocols.find(function(n){ return data[n] && data[n].timestamps && data[n].timestamps.length; });
  var sharedLabels = refProto
    ? data[refProto].timestamps.map(function(ts){
        return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      })
    : [];

  var datasets = protocols.map(function(name, i){
    var series = data[name];
    if(!series || !series.values) return null;
    var hidden = !!_onchainHiddenProtocols[name];
    var color = _ONCHAIN_LINE_COLORS[i % _ONCHAIN_LINE_COLORS.length];
    return {
      label: name,
      data: series.values,
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.35,
      hidden: hidden,
    };
  }).filter(Boolean);

  canvas.style.opacity = '1';

  // Thin labels: show ~8 ticks max
  var step = Math.max(1, Math.floor(sharedLabels.length / 8));
  var displayLabels = sharedLabels.map(function(l, i){ return i % step === 0 ? l : ''; });

  _onchainChart = new Chart(canvas, {
    type: 'line',
    data: { labels: sharedLabels, datasets: datasets },
    options:{
      responsive: true, maintainAspectRatio: false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:'rgba(10,14,33,0.92)',
          borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
          titleColor:'#94a3b8', bodyColor:'#e2e8f0',
          padding:10,
          itemSort:function(a,b){ return (b.raw||0) - (a.raw||0); },
          callbacks:{
            label: function(ctx){
              return ' '+ctx.dataset.label+': '+fmtMc(ctx.raw||0);
            }
          }
        }
      },
      scales:{
        x:{
          grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
          ticks:{
            color:'#475569', maxTicksLimit:8, maxRotation:0,
            callback: function(val, idx){ return idx % step === 0 ? sharedLabels[idx] : ''; }
          }
        },
        y:{
          grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
          ticks:{color:'#475569', callback:function(v){ return fmtMc(v); }}
        }
      }
    }
  });

  var kpiName = {tvl:'TVL',dex_volume:'DEX Volume',fees:'Fees',revenue:'Revenue'}[_onchainKpi];
  document.getElementById('onchainMeta').textContent =
    protocols.length+' protocols · '+_onchainDays+'D history · '+kpiName+' · Source: DeFiLlama';
}

// ── ARTICLE READER ───────────────────────────────────────
var _arStoryIndex = null;

function _openStoryArticle(idx){
  openArticleReader(idx);
}

function openArticleFromStory(story){
  // Open article reader from any story object — not tied to _carouselStories
  document.getElementById('articleOverlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  var arContent = document.getElementById('arContent');
  var cat = story.category || 'MARKETS';
  var catColor = {MACRO:'#f59e0b',MARKETS:'#4a9eff',EARNINGS:'#22c55e',CRYPTO:'#a78bfa',GEO:'#fb923c',TECH:'#38bdf8',ENERGY:'#f59e0b'}[cat]||'#4a9eff';
  arContent.innerHTML =
    '<div style="width:100%;overflow:hidden;border-radius:0 0 16px 16px;position:relative">'
    +'<img id="arHeroImg" style="width:100%;height:420px;object-fit:cover;display:block;filter:brightness(.75) saturate(1.1)" src="'+storyImageUrl(story)+'" alt="" onerror="this.style.height=\'120px\'">'
    +'<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(2,4,16,1) 0%,transparent 60%)"></div>'
    +'</div>'
    +'<div class="ar-body">'
    +'<span class="ar-cat-pill wsj-cat wsj-cat-'+cat+'" style="margin-bottom:14px">'+cat+'</span>'
    +'<div class="ar-headline">'+story.title+'</div>'
    +'<div class="ar-meta">'
    +'<span class="ar-byline">Wave Capital Intelligence</span>'
    +'<span class="ar-meta-sep">·</span>'
    +'<span>'+(story.source||'News')+'</span>'
    +'</div>'
    +'<div id="arArticleBody">'
    +'<div class="ar-loading"><div class="ar-loading-spinner"></div><div style="font-size:13px">Generating article…</div><div style="font-size:10px;margin-top:6px;color:#1e293b">Gathering sources across Bloomberg, CNBC, Reuters</div></div>'
    +'</div>'
    +'</div>';
  _fetchArticle(story);
}

function openArticleReader(idx){
  _arStoryIndex = idx;
  var s = _carouselStories[idx];
  if(!s) return;
  document.getElementById('articleOverlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  var arContent = document.getElementById('arContent');
  var cat = s.category || 'MARKETS';
  var catColor = {MACRO:'#f59e0b',MARKETS:'#4a9eff',EARNINGS:'#22c55e',CRYPTO:'#a78bfa',GEO:'#fb923c',TECH:'#38bdf8',ENERGY:'#f59e0b'}[cat]||'#4a9eff';
  arContent.innerHTML =
    '<div style="width:100%;overflow:hidden;border-radius:0 0 16px 16px;position:relative">'
    +'<img id="arHeroImg" style="width:100%;height:420px;object-fit:cover;display:block;filter:brightness(.75) saturate(1.1)" src="'+storyImageUrl(s)+'" alt="" onerror="this.style.height=\'120px\'">'
    +'<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(2,4,16,1) 0%,transparent 60%)"></div>'
    +'</div>'
    +'<div class="ar-body">'
    +'<span class="ar-cat-pill wsj-cat wsj-cat-'+cat+'" style="margin-bottom:14px">'+cat+'</span>'
    +'<div class="ar-headline">'+s.title+'</div>'
    +'<div class="ar-meta">'
    +'<span class="ar-byline">Wave Capital Intelligence</span>'
    +'<span class="ar-meta-sep">·</span>'
    +'<span>'+_newsTimeAgo(s.pub)+'</span>'
    +'<span class="ar-meta-sep">·</span>'
    +'<span>'+s.source+'</span>'
    +'</div>'
    +'<div id="arArticleBody">'
    +'<div class="ar-loading"><div class="ar-loading-spinner"></div><div style="font-size:13px">Generating article…</div><div style="font-size:10px;margin-top:6px;color:#1e293b">Gathering sources across Bloomberg, CNBC, Reuters</div></div>'
    +'</div>'
    +'</div>';
  // Fetch generated article
  _fetchArticle(s);
}

function closeArticleReader(){
  document.getElementById('articleOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

async function _fetchArticle(s){
  var body = document.getElementById('arArticleBody');
  if(!body) return;
  try{
    var d;
    if(s.id){
      // Pre-generated top story — read the already-written article + image
      // from the archive instead of paying for a second LLM call.
      var r = await fetch(API+'/api/blog/article/'+s.id);
      d = await r.json();
    } else {
      var params = new URLSearchParams({url: s.link||'', title: s.title||'', source: s.source||'', desc: s.desc||''});
      var r2 = await fetch(API+'/api/article?'+params.toString());
      d = await r2.json();
    }
    if(d.error){
      body.innerHTML = '<div style="padding:24px 0;color:#ef4444;font-size:13px">'+d.error+'</div>';
      return;
    }
    _renderArticle(d, !!(s.id || s.image_url));
  }catch(e){
    if(body) body.innerHTML = '<div style="padding:24px 0;color:#ef4444;font-size:13px">Failed to generate article. '+e.message+'</div>';
  }
}

function _renderArticle(d, keepImage){
  var body = document.getElementById('arArticleBody');
  if(!body) return;
  // Only fall back to a keyword photo search if we don't already have a
  // real image showing (the story's generated/scraped image, or one the
  // caller told us to keep) — this used to unconditionally clobber a good
  // hero image with an unrelated loremflickr keyword match once the
  // article text loaded, which is the "photo doesn't match" bug.
  if(!keepImage && d.image_query){
    var hero = document.getElementById('arHeroImg');
    if(hero){
      var kw = d.image_query.split(/\s+/).slice(0,4).join(',');
      hero.src = 'https://loremflickr.com/1200/630/' + kw;
    }
  }
  var refsHtml = '';
  if(d.sources && d.sources.length){
    refsHtml = '<div class="ar-refs">'
      +'<div class="ar-refs-title">Sources & References</div>'
      +d.sources.map(function(ref, i){
        return '<div class="ar-ref-item">'
          +'<span class="ar-ref-num">['+(i+1)+']</span>'
          +'<a class="ar-ref-link" href="'+ref.url+'" target="_blank">'+ref.title+'</a>'
          +'<span class="ar-ref-src">'+ref.source+'</span>'
          +'</div>';
      }).join('')
      +'</div>';
  }
  // Convert simple markdown to HTML
  var content = (d.body||'').replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h3>$1</h3>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n\n/g,'</p><p>').replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');
  body.innerHTML =
    (d.lead ? '<div class="ar-lead">'+d.lead+'</div>' : '')
    +'<div class="ar-content"><p>'+content+'</p></div>'
    +refsHtml;
}

// ── INIT ─────────────────────────────────────────────────
window.addEventListener('load', function(){
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

// ── RATES & YIELDS ────────────────────────────────────────────────────────────
var _ratesChart     = null;
var _ratesCurveChart = null;

function loadRatesPage(){
  fetch(API + '/api/yields')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ return; }
      ratesRenderStrip(d.curve);
      ratesRenderSpread(d.spread_2_10, d.spread_3m_10, d.curve);
      ratesRenderChart(d.chart10y);
      ratesRenderCurve(d.curve);
      ratesRenderExplainer(d.spread_2_10, d.curve);
    });
}

function ratesRenderStrip(curve){
  var labels = {'3M':'3-Month','2Y':'2-Year','5Y':'5-Year','10Y':'10-Year','30Y':'30-Year'};
  var html = curve.map(function(c){
    var chgCol = c.chg_day > 0 ? '#ef4444' : c.chg_day < 0 ? '#22c55e' : '#475569';
    var sign   = c.chg_day > 0 ? '+' : '';
    return '<div style="background:#0f1729;border:1px solid #1e293b;border-radius:10px;padding:14px 16px">'
      +'<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-bottom:6px">'+labels[c.label]+'</div>'
      +'<div style="font-size:22px;font-weight:800;color:#f1f5f9">'+c.yield+'%</div>'
      +'<div style="font-size:11px;color:'+chgCol+';margin-top:4px">'+sign+c.chg_day.toFixed(3)+' today</div>'
      +'</div>';
  }).join('');
  document.getElementById('ratesStrip').innerHTML = html;
}

function ratesRenderSpread(s210, s3m10, curve){
  if(s210 === null && s3m10 === null) return;
  var inverted = s210 !== null ? s210 < 0 : s3m10 < 0;
  var spread   = s210 !== null ? s210 : s3m10;
  var label    = s210 !== null ? '2Y–10Y Spread' : '3M–10Y Spread';
  var statusColor = inverted ? '#ef4444' : spread < 0.5 ? '#f59e0b' : '#22c55e';
  var statusText  = inverted ? 'INVERTED' : spread < 0.5 ? 'FLAT' : 'NORMAL';
  var verdict = inverted
    ? 'The curve is inverted — short-term rates are higher than long-term. Historically the most reliable recession predictor (usually 12–18 months ahead).'
    : spread < 0.5
    ? 'The curve is flat — almost no difference between short and long rates. Markets are uncertain about growth.'
    : 'The curve is positively sloped — normal. Markets expect growth and modest inflation ahead.';

  var html = '<div style="background:#0f1729;border:1px solid '+statusColor+'44;border-left:3px solid '+statusColor+';border-radius:10px;padding:18px 20px;display:flex;align-items:center;gap:20px">'
    +'<div>'
    +  '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-bottom:4px">'+label+'</div>'
    +  '<div style="font-size:32px;font-weight:800;color:'+statusColor+'">'+(spread>=0?'+':'')+spread.toFixed(2)+'%</div>'
    +'</div>'
    +'<div style="width:1px;height:48px;background:#1e293b"></div>'
    +'<div>'
    +  '<div style="font-size:13px;font-weight:700;color:'+statusColor+';margin-bottom:4px">'+statusText+'</div>'
    +  '<div style="font-size:12px;color:#64748b;line-height:1.55;max-width:500px">'+verdict+'</div>'
    +'</div>'
    +'</div>';
  document.getElementById('ratesSpread').innerHTML = html;
}

function ratesRenderChart(data){
  var ctx = document.getElementById('ratesChart');
  if(!ctx) return;
  if(_ratesChart){ _ratesChart.destroy(); _ratesChart = null; }
  var labels = data.map(function(d){ return d.date.slice(5); });
  var values = data.map(function(d){ return d.value; });
  _ratesChart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: [{
      data: values, borderColor: '#4a9eff', borderWidth: 2,
      fill: true, backgroundColor: 'rgba(74,158,255,0.08)',
      pointRadius: 0, tension: 0.3
    }]},
    options: {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: function(c){ return c.raw.toFixed(3) + '%'; } }
      }},
      scales: {
        x: { ticks: { color:'#334155', font:{size:9}, maxTicksLimit:8 }, grid: { color:'#1e293b' }},
        y: { ticks: { color:'#64748b', font:{size:10}, callback: function(v){ return v+'%'; } }, grid: { color:'#1e293b' }}
      }
    }
  });
}

function ratesRenderCurve(curve){
  var ctx = document.getElementById('ratesCurveCanvas');
  if(!ctx) return;
  if(_ratesCurveChart){ _ratesCurveChart.destroy(); _ratesCurveChart = null; }
  var labels = curve.map(function(c){ return c.label; });
  var values = curve.map(function(c){ return c.yield; });
  // Color segments: inverted segments red, normal green
  var segColors = values.map(function(v,i){
    if(i === 0) return '#4a9eff';
    return values[i] < values[i-1] ? '#ef4444' : '#22c55e';
  });
  _ratesCurveChart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: [{
      data: values, borderColor: '#4a9eff', borderWidth: 3,
      fill: false, pointBackgroundColor: segColors, pointRadius: 6, pointHoverRadius: 8,
      tension: 0.3
    }]},
    options: {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: function(c){ return c.label + ': ' + c.raw.toFixed(3) + '%'; } }
      }},
      scales: {
        x: { ticks: { color:'#94a3b8', font:{size:11,weight:'700'} }, grid: { color:'#1e293b' }},
        y: { ticks: { color:'#64748b', font:{size:10}, callback: function(v){ return v+'%'; } }, grid: { color:'#1e293b' }}
      }
    }
  });
}

function ratesRenderExplainer(spread, curve){
  var y3m  = curve.find(function(c){ return c.label==='3M'; });
  var y2   = curve.find(function(c){ return c.label==='2Y'; });
  var y10  = curve.find(function(c){ return c.label==='10Y'; });
  var y30  = curve.find(function(c){ return c.label==='30Y'; });

  var inverted = spread !== null && spread < 0;

  var bullets = [
    {
      icon: '🏦',
      title: 'What are Treasury yields?',
      text: 'When the US government borrows money it issues bonds. The yield is the annual interest rate investors earn for lending that money. Higher yield = investors want more compensation (usually because they expect inflation or risk).'
    },
    {
      icon: '⚡',
      title: 'Why does the curve shape matter?',
      text: 'Normally long-term rates (10Y, 30Y) are higher than short-term (2Y, 3M) — investors demand more for tying up money longer. When that flips (short > long), it signals the market expects the economy to slow or the Fed to cut rates.'
    },
    {
      icon: inverted ? '🚨' : '✅',
      title: inverted ? 'Right now: Curve is INVERTED' : 'Right now: Curve looks ' + (spread < 0.5 ? 'FLAT' : 'NORMAL'),
      text: inverted
        ? 'The 2Y yield ('+(y2?y2.yield+'%':'?')+') is above the 10Y ('+(y10?y10.yield+'%':'?')+'). Every US recession since 1950 was preceded by an inverted curve — though the lag can be 6–24 months.'
        : 'The 2Y ('+(y2?y2.yield+'%':'?')+') is below the 10Y ('+(y10?y10.yield+'%':'?')+'). A positive spread suggests markets are not pricing in an imminent recession.'
    },
    {
      icon: '💡',
      title: 'What affects yields day-to-day?',
      text: 'Fed policy decisions, CPI inflation prints, jobs reports, and global risk appetite. When investors flee to safety they buy bonds → prices rise → yields fall. When growth is strong, yields rise.'
    },
    {
      icon: '🏠',
      title: 'How does it affect you?',
      text: 'The 10Y Treasury drives mortgage rates, corporate borrowing costs, and stock valuations (higher yields = stocks worth less in theory). The 2Y tracks where the Fed is heading next.'
    }
  ];

  var html = '<div class="mini-section"><div class="ms-header"><div class="ms-title">💬 What Does This Mean?</div></div>';
  html += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">';
  bullets.forEach(function(b){
    html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:8px;padding:14px 16px;display:flex;gap:14px">'
      +'<div style="font-size:20px;flex-shrink:0;margin-top:1px">'+b.icon+'</div>'
      +'<div>'
      +  '<div style="font-size:12px;font-weight:700;color:#e2e8f0;margin-bottom:4px">'+b.title+'</div>'
      +  '<div style="font-size:12px;color:#64748b;line-height:1.6">'+b.text+'</div>'
      +'</div>'
      +'</div>';
  });
  html += '</div></div>';
  document.getElementById('ratesExplainer').innerHTML = html;
}

// ── EV INDUSTRY ───────────────────────────────────────────────────────────────
var _evAdoptionChart  = null;
var _evDeliveryChart  = null;
var _evDeliveryMode   = 'bev';
var _evData           = null;

function loadEvPage(){
  if(_evData){ evRender(_evData); return; }
  fetch(API + '/api/ev-market')
    .then(function(r){ return r.json(); })
    .then(function(d){ _evData = d; evRender(d); })
    .catch(function(){ document.getElementById('evCompanyTable').innerHTML='<div style="color:#475569;font-size:12px">Failed to load EV data.</div>'; });
}

function evRender(d){
  evRenderAdoption(d.adoption);
  evRenderDeliveries(d);
  evRenderCompanies(d.companies);
}

function evRenderAdoption(data){
  var ctx = document.getElementById('evAdoptionChart');
  if(_evAdoptionChart){ _evAdoptionChart.destroy(); _evAdoptionChart = null; }
  var labels  = data.map(function(r){ return r.year; });
  var evVals  = data.map(function(r){ return r.ev; });
  var iceVals = data.map(function(r){ return r.ice; });
  var pctVals = data.map(function(r){ return r.ev_pct; });

  _evAdoptionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {label: 'EV (M units)',  data: evVals,  backgroundColor: '#22c55e', stack: 'a', borderRadius: 3},
        {label: 'ICE (M units)', data: iceVals, backgroundColor: '#1e293b', stack: 'a', borderRadius: 3},
        {label: 'EV Share %',    data: pctVals, type: 'line', yAxisID: 'y2',
         borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)',
         borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#60a5fa', tension: 0.3, fill: false}
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {labels:{color:'#64748b', font:{size:10}}},
        tooltip: {callbacks:{label:function(c){ return c.dataset.label+': '+(c.dataset.yAxisID==='y2' ? c.parsed.y.toFixed(1)+'%' : c.parsed.y.toFixed(1)+'M'); }}}
      },
      scales: {
        x:  {stacked:true, ticks:{color:'#475569',font:{size:11}}, grid:{color:'#0f172a'}},
        y:  {stacked:true, ticks:{color:'#475569',font:{size:10},callback:function(v){return v+'M';}}, grid:{color:'#1e293b'}, title:{display:true,text:'Units (millions)',color:'#334155',font:{size:10}}},
        y2: {position:'right', min:0, max:30, ticks:{color:'#60a5fa',font:{size:10},callback:function(v){return v+'%';}}, grid:{display:false}, title:{display:true,text:'EV Share %',color:'#60a5fa',font:{size:10}}}
      }
    }
  });
}

function evSetDeliveryMode(mode){
  _evDeliveryMode = mode;
  document.getElementById('evBtnBev').style.background   = mode==='bev'   ? '#1e3a5f' : 'transparent';
  document.getElementById('evBtnBev').style.borderColor  = mode==='bev'   ? '#3b82f6' : '#334155';
  document.getElementById('evBtnBev').style.color        = mode==='bev'   ? '#93c5fd' : '#475569';
  document.getElementById('evBtnTotal').style.background = mode==='total' ? '#1e3a5f' : 'transparent';
  document.getElementById('evBtnTotal').style.borderColor= mode==='total' ? '#3b82f6' : '#334155';
  document.getElementById('evBtnTotal').style.color      = mode==='total' ? '#93c5fd' : '#475569';
  if(_evData) evRenderDeliveries(_evData);
}

function evRenderDeliveries(d){
  var data = _evDeliveryMode === 'bev' ? d.deliveries_bev : d.deliveries_total;
  var ctx  = document.getElementById('evDeliveryChart');
  if(_evDeliveryChart){ _evDeliveryChart.destroy(); _evDeliveryChart = null; }
  var maxK = data[0].k;
  var colors = data.map(function(r,i){
    var leaders = ['Tesla','BYD'];
    return leaders.indexOf(r.company) >= 0 ? '#22c55e' : (i < 3 ? '#60a5fa' : '#334155');
  });

  _evDeliveryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(function(r){ return r.flag + ' ' + r.company; }),
      datasets: [{
        data: data.map(function(r){ return r.k; }),
        backgroundColor: colors,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {display:false},
        tooltip: {callbacks:{label:function(c){ return c.parsed.x.toLocaleString()+'K deliveries'; }}}
      },
      scales: {
        x: {ticks:{color:'#475569',font:{size:10},callback:function(v){return (v/1000).toFixed(0)+'M';}}, grid:{color:'#1e293b'}},
        y: {ticks:{color:'#94a3b8',font:{size:11}}, grid:{display:false}}
      }
    }
  });
}

function evRenderCompanies(companies){
  var el = document.getElementById('evCompanyTable');
  if(!companies || !companies.length){ el.innerHTML='<div style="color:#475569;font-size:12px">No data.</div>'; return; }

  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="border-bottom:1px solid #1e293b">'
    + '<th style="text-align:left;padding:8px 6px;color:#475569;font-weight:600">Company</th>'
    + '<th style="text-align:right;padding:8px 6px;color:#475569;font-weight:600">Price</th>'
    + '<th style="text-align:right;padding:8px 6px;color:#475569;font-weight:600">1D %</th>'
    + '<th style="text-align:right;padding:8px 6px;color:#475569;font-weight:600">Revenue (USD)</th>'
    + '<th style="text-align:right;padding:8px 6px;color:#475569;font-weight:600">Mkt Cap</th>'
    + '<th style="text-align:right;padding:8px 6px;color:#475569;font-weight:600">Gross Margin</th>'
    + '</tr></thead><tbody>';

  companies.forEach(function(c, i){
    var chgColor = c.chg_pct >= 0 ? '#22c55e' : '#ef4444';
    var chgSign  = c.chg_pct >= 0 ? '+' : '';
    var gmColor  = c.gm_pct === null ? '#475569' : c.gm_pct >= 15 ? '#22c55e' : c.gm_pct >= 5 ? '#f59e0b' : '#ef4444';
    html += '<tr style="border-bottom:1px solid #0f172a;'+(i%2===0?'background:#080d14':'')+'">'
      + '<td style="padding:9px 6px;color:#e2e8f0;font-weight:600">'+c.flag+' <span style="cursor:pointer;color:#93c5fd" onclick="navigate(\'research\');setTimeout(function(){document.getElementById(\'resSearchInput\').value=\''+c.ticker+'\';researchTicker(\''+c.ticker+'\');},300)">'+c.name+'</span> <span style="color:#334155;font-size:10px">'+c.ticker+'</span></td>'
      + '<td style="padding:9px 6px;text-align:right;color:#e2e8f0">'+(c.price ? '$'+c.price.toFixed(2) : '—')+'</td>'
      + '<td style="padding:9px 6px;text-align:right;color:'+chgColor+'">'+chgSign+c.chg_pct+'%</td>'
      + '<td style="padding:9px 6px;text-align:right;color:#94a3b8">'+(c.rev_usd !== null ? '$'+c.rev_usd+'B' : '—')+'</td>'
      + '<td style="padding:9px 6px;text-align:right;color:#94a3b8">'+(c.mc_usd  !== null ? '$'+c.mc_usd+'B'  : '—')+'</td>'
      + '<td style="padding:9px 6px;text-align:right;color:'+gmColor+'">'+(c.gm_pct !== null ? c.gm_pct+'%' : '—')+'</td>'
      + '</tr>';
  });

  html += '</tbody></table>';
  html += '<div style="font-size:10px;color:#334155;margin-top:8px">Revenue &amp; market cap converted to USD · CNY and EUR tickers use live FX rates · Sorted by market cap · Click company name → Research page</div>';
  el.innerHTML = html;
}

// ── PUT/CALL RATIO ────────────────────────────────────────────────────────────
var _pcrChart = null;

function pcrZone(v){
  if(v === null) return {label:'N/A', color:'#475569', bg:'#0f172a'};
  if(v < 0.80)  return {label:'EXTREME GREED', color:'#ef4444', bg:'#450a0a'};
  if(v < 1.00)  return {label:'GREED',         color:'#f97316', bg:'#431407'};
  if(v < 1.30)  return {label:'NEUTRAL',        color:'#94a3b8', bg:'#0f172a'};
  if(v < 1.60)  return {label:'FEAR',           color:'#60a5fa', bg:'#0c1a2e'};
  return                {label:'EXTREME FEAR',  color:'#a78bfa', bg:'#1e1040'};
}

function pcrRenderGauge(d){
  var v    = d.pcr;
  var zone = pcrZone(v);

  // Gauge: min=0.5 max=2.0, clamp position (SPY range)
  var MIN = 0.5, MAX = 2.0;
  var pct  = Math.max(0, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100));

  // Zone boundaries as % of bar (SPY-calibrated)
  var zones = [
    {from: 0,    to: 20.0, color:'#ef4444', label:'Ext. Greed'},  // <0.80
    {from: 20.0, to: 33.3, color:'#f97316', label:'Greed'},       // 0.80–1.00
    {from: 33.3, to: 53.3, color:'#64748b', label:'Neutral'},     // 1.00–1.30
    {from: 53.3, to: 73.3, color:'#60a5fa', label:'Fear'},        // 1.30–1.60
    {from: 73.3, to:100,   color:'#a78bfa', label:'Ext. Fear'},   // >1.60
  ];

  var zoneBar = zones.map(function(z){
    return '<div style="position:absolute;top:0;bottom:0;left:'+z.from+'%;width:'+(z.to-z.from)+'%;background:'+z.color+';opacity:0.25"></div>';
  }).join('');

  var html = '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:18px">';

  // Big PCR value
  html += '<div style="background:'+zone.bg+';border:1px solid '+zone.color+'44;border-radius:10px;padding:16px 24px;text-align:center;min-width:130px">'
    + '<div style="font-size:36px;font-weight:700;color:'+zone.color+';line-height:1">'+( v !== null ? v.toFixed(3) : '—' )+'</div>'
    + '<div style="font-size:10px;font-weight:700;color:'+zone.color+';letter-spacing:1px;margin-top:4px">SPY P/C RATIO</div>'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:'+zone.color+';margin-top:6px;padding:3px 10px;background:'+zone.color+'22;border-radius:4px">'+zone.label+'</div>'
    + '</div>';

  // Meta
  html += '<div style="flex:1;min-width:200px">';
  html += '<div style="display:flex;gap:12px;margin-bottom:10px">';
  if(d.ma5)  html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:6px;padding:8px 14px"><div style="font-size:18px;font-weight:600;color:#e2e8f0">'+d.ma5+'</div><div style="font-size:10px;color:#475569;margin-top:2px">5-DAY AVG</div></div>';
  if(d.ma20) html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:6px;padding:8px 14px"><div style="font-size:18px;font-weight:600;color:#e2e8f0">'+d.ma20+'</div><div style="font-size:10px;color:#475569;margin-top:2px">20-DAY AVG</div></div>';
  html += '</div>';
  html += '<div style="font-size:11px;color:#475569">Put vol: <b style="color:#94a3b8">'+(d.put_vol||0).toLocaleString()+'</b> &nbsp;·&nbsp; Call vol: <b style="color:#94a3b8">'+(d.call_vol||0).toLocaleString()+'</b></div>';
  html += '<div style="font-size:10px;color:#334155;margin-top:4px">Source: CBOE SPX options chain · as of '+d.date+'</div>';
  html += '</div>';
  html += '</div>';

  // Zone gauge bar
  html += '<div style="position:relative;height:20px;border-radius:6px;overflow:hidden;background:#1e293b;margin-bottom:6px">';
  html += zoneBar;
  // marker
  html += '<div style="position:absolute;top:0;bottom:0;left:calc('+pct+'% - 2px);width:4px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff8"></div>';
  html += '</div>';

  // Zone labels
  html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:#334155;letter-spacing:0.5px;margin-bottom:6px">';
  html += '<span style="color:#ef4444">EXT. GREED<br>(&lt; 0.80)</span>';
  html += '<span style="color:#f97316;text-align:center">GREED<br>(0.80–1.00)</span>';
  html += '<span style="color:#64748b;text-align:center">NEUTRAL<br>(1.00–1.30)</span>';
  html += '<span style="color:#60a5fa;text-align:center">FEAR<br>(1.30–1.60)</span>';
  html += '<span style="color:#a78bfa;text-align:right">EXT. FEAR<br>(&gt; 1.60)</span>';
  html += '</div>';

  document.getElementById('pcrContent').innerHTML = html;
}

function pcrRenderChart(history){
  if(!history || history.length < 2){ return; }
  document.getElementById('pcrChartWrap').style.display = '';
  var ctx = document.getElementById('pcrChart');
  if(_pcrChart){ _pcrChart.destroy(); _pcrChart = null; }

  var labels = history.map(function(h){ return h.date.slice(5); });
  var vals   = history.map(function(h){ return h.pcr; });

  _pcrChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: vals,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {display: false},
        tooltip: {
          callbacks: {
            label: function(c){ return 'PCR: ' + c.parsed.y.toFixed(3); }
          }
        },
        annotation: {
          annotations: {
            neutral_lo: {type:'line', yMin:0.85, yMax:0.85, borderColor:'#475569', borderWidth:1, borderDash:[4,4]},
            neutral_hi: {type:'line', yMin:1.05, yMax:1.05, borderColor:'#475569', borderWidth:1, borderDash:[4,4]}
          }
        }
      },
      scales: {
        x: {ticks:{color:'#475569',font:{size:10}}, grid:{color:'#0f172a'}},
        y: {ticks:{color:'#475569',font:{size:10}}, grid:{color:'#1e293b'},
            min: 0.5, max: 1.6,
            afterBuildTicks: function(axis){ axis.ticks = [0.7,0.85,1.0,1.05,1.25,1.5].map(function(v){ return {value:v}; }); }}
      }
    }
  });
}

function pcrRenderExplainer(v){
  var zone = pcrZone(v);
  var bullets = [
    {icon:'📊', title:'What is the Put/Call Ratio?',
     text:'It measures how many put options (bets that the market goes down) are traded relative to call options (bets it goes up). A ratio above 1.0 means more puts than calls — traders are hedging or bearish. Below 1.0 means calls dominate — traders are bullish.'},
    {icon:'🔄', title:'Why is it a contrarian indicator?',
     text:'Extreme readings are contrarian signals. When everyone is buying puts (very high PCR), markets are often near a bottom — panic is already priced in. When everyone is buying calls (very low PCR), complacency may be setting in and a pullback could follow.'},
    {icon: zone.color === '#94a3b8' ? '✅' : (v < 0.85 ? '⚠️' : '🔔'),
     title: 'Right now: ' + zone.label + ' (' + (v !== null ? v.toFixed(3) : '—') + ')',
     text: v === null ? 'Data unavailable.'
       : v < 0.80 ? 'Very few puts being bought relative to calls. Markets may be overconfident. Watch for a surprise reversal — complacency can get punished quickly.'
       : v < 1.00 ? 'Call volume is elevated. Sentiment is optimistic. Not dangerous on its own, but a reading near lows warrants caution.'
       : v < 1.30 ? 'Balanced activity between puts and calls. No extreme signal. Markets are functioning with normal two-sided hedging activity.'
       : v < 1.60 ? 'Elevated put buying. Traders are paying up to hedge downside. This can indicate worry, but also a healthy wall of worry that markets often climb.'
       : 'Very high put activity. Fear is elevated. Historically, extreme PCR readings have preceded short-term bounces — though timing is imprecise.'},
    {icon:'💡', title:'Important caveats',
     text:'This ratio uses SPY (S&P 500 ETF) options — a mix of retail and institutional flow, making it a better sentiment gauge than pure index options (SPX). The zones are calibrated for SPY\'s natural range (higher than equity-only PCR). The 5-day and 20-day averages are better signals than any single day.'}
  ];

  var html = '<div class="mini-section"><div class="ms-header"><div class="ms-title">💬 Understanding the Put/Call Ratio</div></div>';
  html += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">';
  bullets.forEach(function(b){
    html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:8px;padding:14px 16px;display:flex;gap:14px">'
      +'<div style="font-size:20px;flex-shrink:0;margin-top:1px">'+b.icon+'</div>'
      +'<div>'
      +  '<div style="font-size:12px;font-weight:700;color:#e2e8f0;margin-bottom:4px">'+b.title+'</div>'
      +  '<div style="font-size:12px;color:#64748b;line-height:1.6">'+b.text+'</div>'
      +'</div>'
      +'</div>';
  });
  html += '</div></div>';
  document.getElementById('pcrExplainer').innerHTML = html;
}

function loadPcrSection(){
  fetch(API + '/api/pcr')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ document.getElementById('pcrContent').innerHTML = '<div style="color:#ef4444;font-size:12px">PCR data unavailable: '+d.error+'</div>'; return; }
      pcrRenderGauge(d);
      pcrRenderChart(d.history);
      pcrRenderExplainer(d.pcr);
    })
    .catch(function(){ document.getElementById('pcrContent').innerHTML = '<div style="color:#475569;font-size:12px">Could not load PCR data.</div>'; });
}

// ── MACRO SCANNER ─────────────────────────────────────────────────────────────
var _macroStories   = [];
var _macroTopics    = {};
var _macroActive    = {};  // {CAT: true} — all active by default
var _macroCountries = {};  // {CODE: true} — all active by default

var _MACRO_COUNTRIES = {
  'US':     { flag: '🇺🇸', label: 'USA' },
  'EU':     { flag: '🇪🇺', label: 'Europe' },
  'CN':     { flag: '🇨🇳', label: 'China' },
  'UK':     { flag: '🇬🇧', label: 'UK' },
  'JP':     { flag: '🇯🇵', label: 'Japan' },
  'IL':     { flag: '🇮🇱', label: 'Israel' },
  'GLOBAL': { flag: '🌍', label: 'Global' },
};

function loadMacroScanner(){
  document.getElementById('macroCount').textContent = 'Loading...';
  fetch(API + '/api/macro-news')
    .then(function(r){ return r.json(); })
    .then(function(d){
      _macroStories = d.stories || [];
      _macroTopics  = d.topics  || {};
      if(!Object.keys(_macroActive).length){
        Object.keys(_macroTopics).forEach(function(k){ _macroActive[k] = true; });
      }
      if(!Object.keys(_macroCountries).length){
        Object.keys(_MACRO_COUNTRIES).forEach(function(k){ _macroCountries[k] = true; });
      }
      macroRenderPills();
      macroRenderCountryPills();
      macroRenderGrid();
    }).catch(function(){
      document.getElementById('macroGrid').innerHTML = '<div style="color:#334155;font-size:13px;padding:40px 0;text-align:center">Failed to load — check connection</div>';
    });
}

function macroRenderPills(){
  var counts = {};
  _macroStories.forEach(function(s){ counts[s.category] = (counts[s.category]||0)+1; });
  var html = Object.keys(_macroTopics).map(function(cat){
    var cfg   = _macroStories.find(function(s){return s.category===cat;});
    var color = cfg ? cfg.color : '#475569';
    var emoji = cfg ? cfg.emoji : '';
    var cnt   = counts[cat] || 0;
    var active = _macroActive[cat];
    return '<div class="macro-topic-pill'+(active?' active':'')+'" '
      + 'style="background:'+color+'22;color:'+color+';border-color:'+color+'44" '
      + 'onclick="macroToggle(\''+cat+'\')">'
      + emoji + ' ' + _macroTopics[cat]
      + ' <span style="opacity:.6;font-size:10px">' + cnt + '</span>'
      + '</div>';
  }).join('');
  document.getElementById('macroTopics').innerHTML = html;
}

function macroRenderCountryPills(){
  var counts = {};
  _macroStories.forEach(function(s){ var c = s.country||'US'; counts[c]=(counts[c]||0)+1; });
  var html = Object.keys(_MACRO_COUNTRIES).map(function(code){
    var cfg    = _MACRO_COUNTRIES[code];
    var cnt    = counts[code] || 0;
    var active = _macroCountries[code];
    var baseCls = 'macro-topic-pill' + (active ? ' active' : '');
    return '<div class="'+baseCls+'" '
      + 'style="background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.2)" '
      + 'onclick="macroCountryToggle(\''+code+'\')" title="Toggle '+cfg.label+' news">'
      + cfg.flag + ' ' + cfg.label
      + ' <span style="opacity:.5;font-size:10px">'+cnt+'</span>'
      + '</div>';
  }).join('');
  var el = document.getElementById('macroCountryPills');
  if(el) el.innerHTML = html;
}

function macroToggle(cat){
  _macroActive[cat] = !_macroActive[cat];
  macroRenderPills();
  macroRenderGrid();
}

function macroCountryToggle(code){
  _macroCountries[code] = !_macroCountries[code];
  macroRenderCountryPills();
  macroRenderGrid();
}

function macroRenderGrid(){
  var visible = _macroStories.filter(function(s){
    return _macroActive[s.category] && _macroCountries[s.country||'US'];
  });
  var activeCntries = Object.keys(_macroCountries).filter(function(k){ return _macroCountries[k]; }).length;
  document.getElementById('macroCount').textContent = visible.length + ' stories · ' + Object.values(_macroActive).filter(Boolean).length + ' topics · ' + activeCntries + ' regions';
  if(!visible.length){
    document.getElementById('macroGrid').innerHTML = '<div style="color:#334155;font-size:13px;padding:40px 0;text-align:center">No stories match selected topics</div>';
    return;
  }
  var cards = visible.map(function(s){
    var t = s.pub ? _newsTimeAgo(s.pub) : '';
    return '<div class="macro-card" style="border-left-color:'+s.color+'" onclick="window.open(\''+s.link.replace(/'/g,"\\'") +'\',\'_blank\')">'
      + '<div class="macro-card-top">'
      +   '<span class="macro-card-emoji">'+s.emoji+'</span>'
      +   '<span class="macro-card-label" style="color:'+s.color+'">'+s.label+'</span>'
      +   '<span class="macro-card-src">'+s.source+'</span>'
      +   (t?'<span class="macro-card-time" style="color:#334155">'+t+'</span>':'')
      + '</div>'
      + '<div class="macro-card-headline">'+s.title+'</div>'
      + (s.desc?'<div class="macro-card-desc">'+s.desc+'</div>':'')
      + '</div>';
  }).join('');
  document.getElementById('macroGrid').innerHTML = '<div class="macro-grid">'+cards+'</div>';
}

// ── EARNINGS ──────────────────────────────────────────────────────────────────
var _earnData      = [];
var _earnTab       = 'week';
var _earnSort      = {col:'date', asc:true};  // default: date asc, market cap secondary
var _earnMinMktCap = 1;   // $1B minimum mktcap filter (0 = show all)
var _earnPoll      = null;

function earnRenderBeatSummary(){
  var banner = document.getElementById('earnBeatBanner');
  if(!banner || !_earnData.length) return;

  var todayS = new Date().toISOString().slice(0,10);

  // Companies that have already reported (past date, ep_actual available)
  var reported = _earnData.filter(function(e){
    return e.date < todayS && e.eps_actual !== null && e.eps_actual !== undefined;
  });
  // Companies with both actual + estimate for beat calculation
  var withEst = reported.filter(function(e){
    return e.eps_est !== null && e.eps_est !== undefined;
  });
  var beats = withEst.filter(function(e){ return e.eps_actual > e.eps_est; });
  var misses = withEst.filter(function(e){ return e.eps_actual < e.eps_est; });
  var inLine = withEst.filter(function(e){ return e.eps_actual === e.eps_est; });

  // Avg surprise % (from companies that have surprise field)
  var withSurp = reported.filter(function(e){ return e.surprise !== null && e.surprise !== undefined; });
  var avgSurp = withSurp.length
    ? withSurp.reduce(function(s,e){ return s + e.surprise; }, 0) / withSurp.length
    : null;

  // Median surprise
  var surprises = withSurp.map(function(e){ return e.surprise; }).sort(function(a,b){ return a-b; });
  var medSurp = surprises.length ? surprises[Math.floor(surprises.length/2)] : null;

  // Beat rate
  var beatPct = withEst.length ? Math.round(beats.length / withEst.length * 100) : null;
  var beatColor = beatPct >= 75 ? '#22c55e' : beatPct >= 60 ? '#f59e0b' : '#ef4444';

  // Avg surprise color
  var surpColor = avgSurp === null ? '#64748b' : avgSurp > 0 ? '#22c55e' : '#ef4444';

  // Detect current quarter from most common fiscal_q among reported
  var qCounts = {};
  reported.forEach(function(e){ if(e.fiscal_q) qCounts[e.fiscal_q] = (qCounts[e.fiscal_q]||0)+1; });
  var currentQ = Object.entries(qCounts).sort(function(a,b){return b[1]-a[1];})[0];
  var qLabel = currentQ ? currentQ[0] : '';

  // Season progress (total in our universe with a date)
  var total = _earnData.filter(function(e){ return e.mktcap_B && e.mktcap_B >= 1; }).length;
  var repCount = reported.filter(function(e){ return e.mktcap_B && e.mktcap_B >= 1; }).length;
  var progressPct = total ? Math.round(repCount / total * 100) : 0;

  // Top beats and misses by market cap
  var sortedBeats = beats.slice().sort(function(a,b){ return (b.mktcap_B||0)-(a.mktcap_B||0); }).slice(0,3);
  var sortedMisses = misses.slice().sort(function(a,b){ return (b.mktcap_B||0)-(a.mktcap_B||0); }).slice(0,3);

  function tickerPill(e, isbeat){
    var surpStr = e.surprise !== null ? (e.surprise>0?'+':'')+e.surprise.toFixed(1)+'%' : '';
    var bg = isbeat ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
    var fc = isbeat ? '#22c55e' : '#ef4444';
    return '<span style="background:'+bg+';color:'+fc+';border-radius:20px;padding:2px 9px;font-size:10px;font-weight:700;margin-right:4px;display:inline-block;margin-bottom:3px">'
      +e.ticker+(surpStr?' '+surpStr:'')+'</span>';
  }

  var beatPills  = sortedBeats.map(function(e){ return tickerPill(e,true); }).join('');
  var missPills  = sortedMisses.map(function(e){ return tickerPill(e,false); }).join('');

  banner.style.display = '';
  banner.innerHTML = '<div class="earn-beat-banner">'
    // Season label + progress bar across full top
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
      +'<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#334155">'
        +(qLabel ? '📊 '+qLabel+' Earnings Season' : '📊 Current Earnings Season')
      +'</div>'
      +'<div style="font-size:10px;color:#475569">'+repCount+' reported · '+progressPct+'% of universe complete</div>'
    +'</div>'
    +'<div class="earn-beat-progress" style="margin-bottom:16px">'
      +'<div class="earn-beat-fill" style="width:'+progressPct+'%;background:linear-gradient(90deg,#4a9eff,#22c55e)"></div>'
    +'</div>'

    // 5 KPI cells
    +'<div class="earn-beat-grid">'

      // Cell 1: EPS Beat Rate
      +'<div class="earn-beat-cell earn-beat-divider">'
        +'<div class="earn-beat-tag">EPS Beat Rate</div>'
        +'<div class="earn-beat-val" style="color:'+beatColor+'">'+(beatPct!==null?beatPct+'%':'—')+'</div>'
        +'<div class="earn-beat-sub">of S&amp;P 500 cos beat estimates</div>'
        +'<div class="earn-beat-progress" style="margin-top:8px">'
          +'<div class="earn-beat-fill" style="width:'+(beatPct||0)+'%;background:'+beatColor+'"></div>'
        +'</div>'
      +'</div>'

      // Cell 2: Avg Surprise
      +'<div class="earn-beat-cell earn-beat-divider">'
        +'<div class="earn-beat-tag">Avg EPS Surprise</div>'
        +'<div class="earn-beat-val" style="color:'+surpColor+'">'
          +(avgSurp!==null?(avgSurp>0?'+':'')+avgSurp.toFixed(1)+'%':'—')
        +'</div>'
        +'<div class="earn-beat-sub">median '+(medSurp!==null?(medSurp>0?'+':'')+medSurp.toFixed(1)+'%':'—')+'</div>'
      +'</div>'

      // Cell 3: Beats / Misses / In-Line
      +'<div class="earn-beat-cell earn-beat-divider">'
        +'<div class="earn-beat-tag">Beats / Misses / In-Line</div>'
        +'<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px">'
          +'<span class="earn-beat-val" style="font-size:20px;color:#22c55e">'+beats.length+'</span>'
          +'<span style="font-size:14px;color:#334155">/</span>'
          +'<span class="earn-beat-val" style="font-size:20px;color:#ef4444">'+misses.length+'</span>'
          +'<span style="font-size:14px;color:#334155">/</span>'
          +'<span class="earn-beat-val" style="font-size:20px;color:#475569">'+inLine.length+'</span>'
        +'</div>'
        +'<div class="earn-beat-sub">of '+withEst.length+' with estimates</div>'
      +'</div>'

      // Cell 4: Top Beats
      +'<div class="earn-beat-cell earn-beat-divider">'
        +'<div class="earn-beat-tag">Notable Beats</div>'
        +'<div style="margin-top:4px">'+(beatPills||'<span style="color:#334155;font-size:10px">—</span>')+'</div>'
      +'</div>'

      // Cell 5: Top Misses
      +'<div class="earn-beat-cell">'
        +'<div class="earn-beat-tag">Notable Misses</div>'
        +'<div style="margin-top:4px">'+(missPills||'<span style="color:#334155;font-size:10px">—</span>')+'</div>'
      +'</div>'

    +'</div>'
  +'</div>';
}

function earnSetTab(tab){
  _earnTab = tab;
  document.getElementById('earnTabWeek').style.background = tab==='week'?'#1e3a5f':'transparent';
  document.getElementById('earnTabWeek').style.color      = tab==='week'?'#4a9eff':'#475569';
  document.getElementById('earnTabAll').style.background  = tab==='all' ?'#1e3a5f':'transparent';
  document.getElementById('earnTabAll').style.color       = tab==='all' ?'#4a9eff':'#475569';
  var cf = document.getElementById('earnCapFilter');
  if(cf) cf.style.display = tab==='all' ? 'flex' : 'none';
  earnRender();
}

function earnRefresh(){
  document.getElementById('earnStatus').textContent = 'Refreshing...';
  fetch(API+'/api/earnings/refresh',{method:'POST'}).then(function(){
    earnStartPolling();
  });
}

function earnStartPolling(){
  clearInterval(_earnPoll);
  _earnPoll = setInterval(loadEarningsPage, 5000);
}

function loadEarningsPage(){
  fetch(API+'/api/earnings').then(function(r){return r.json();}).then(function(d){
    if(d.status==='loading'){
      earnStartPolling();
      document.getElementById('earnStatus').textContent = 'Scanning universe...';
      return;
    }
    clearInterval(_earnPoll);
    _earnData = d.results || [];
    var ts = d.ts ? new Date(d.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    var todayS = new Date().toISOString().slice(0,10);
    var upcoming = _earnData.filter(function(e){ return e.date >= todayS && (_earnMinMktCap===0||(e.mktcap_B||0)>=_earnMinMktCap); }).length;
    document.getElementById('earnStatus').textContent = 'Updated: ' + ts + ' · ' + upcoming + ' upcoming companies';
    earnRender();
  }).catch(function(){
    earnStartPolling();
  });
}

function earnRender(){
  if(!_earnData.length){
    document.getElementById('earnContent').innerHTML = '<div style="color:#334155;font-size:13px;padding:40px 0;text-align:center">Loading earnings data from Nasdaq calendar...</div>';
    return;
  }
  earnRenderBeatSummary();
  if(_earnTab === 'week') earnRenderWeek();
  else earnRenderTable();
}

function earnRenderWeek(){
  var today    = new Date();
  var todayStr = today.toISOString().slice(0,10);
  var dow      = today.getDay(); // 0=Sun, 1=Mon … 6=Sat

  function weekDays(refMon){
    var days = [];
    for(var i=0;i<5;i++){
      var d = new Date(refMon); d.setDate(refMon.getDate()+i);
      days.push(d);
    }
    return days;
  }

  // Monday of current week
  var thisMon = new Date(today); thisMon.setDate(today.getDate() - (dow===0?6:dow-1));
  var nextMon = new Date(thisMon); nextMon.setDate(thisMon.getDate()+7);

  // On Thu/Fri (most of this week is done) → show next week first, this week second (collapsed)
  var showNextFirst = dow >= 4; // Thu or Fri

  function earnCardHtml(e, isPast){
    var mktcap = e.mktcap_B ? (e.mktcap_B>=1000?'$'+(e.mktcap_B/1000).toFixed(1)+'T':'$'+e.mktcap_B+'B') : '';
    var tIcon  = e.timing==='BMO'?'☀️':e.timing==='AMC'?'🌙':'';
    var tTitle = e.timing==='BMO'?'Before Market Open':e.timing==='AMC'?'After Market Close':'';
    var hasActual = e.eps_actual !== null && e.eps_actual !== undefined;
    var beat = hasActual && e.eps_est !== null ? e.eps_actual > e.eps_est : null;
    var surprisePct = e.surprise !== null && e.surprise !== undefined ? e.surprise : null;

    var pillsHtml = '';
    if(isPast && hasActual){
      // Show actual EPS with beat/miss color
      var actCol = beat === true ? '#22c55e' : beat === false ? '#ef4444' : '#94a3b8';
      pillsHtml += '<span class="earn-pill" style="background:'+actCol+'22;color:'+actCol+';border:1px solid '+actCol+'44;font-weight:700">Act $'+e.eps_actual+'</span>';
      if(e.eps_est !== null) pillsHtml += '<span class="earn-pill earn-pill-eps" style="opacity:.65">Est $'+e.eps_est+'</span>';
      if(surprisePct !== null){
        var sCol = surprisePct >= 0 ? '#22c55e' : '#ef4444';
        pillsHtml += '<span class="earn-pill" style="background:'+sCol+'22;color:'+sCol+'">'+(surprisePct>=0?'+':'')+surprisePct+'%</span>';
      }
    } else {
      if(e.eps_est !== null) pillsHtml += '<span class="earn-pill earn-pill-eps">Est $'+e.eps_est+'</span>';
    }
    if(e.fiscal_q) pillsHtml += '<span class="earn-pill" style="background:#1a1a2e;color:#334155">'+e.fiscal_q+'</span>';
    if(mktcap) pillsHtml += '<span class="earn-pill earn-pill-mkt">'+mktcap+'</span>';

    return '<div class="earn-card'+(isPast?' earn-card-past':'')+'" onclick="navigate(\'research\');setTimeout(function(){researchTicker(\''+e.ticker+'\')},300)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">'
      +  '<div class="earn-ticker">'+e.ticker+'</div>'
      +  (tIcon?'<span title="'+tTitle+'" style="font-size:12px;cursor:default">'+tIcon+'</span>':'')
      +'</div>'
      +'<div class="earn-name">'+e.name+'</div>'
      +'<div class="earn-estimates">'+pillsHtml+'</div>'
      +'</div>';
  }

  function renderWeekGrid(dayArr, label, collapsible){
    var cols = dayArr.map(function(d){
      var ds      = d.toISOString().slice(0,10);
      var isToday = ds === todayStr;
      var isPast  = ds < todayStr;
      var dayName = ['Mon','Tue','Wed','Thu','Fri'][d.getDay()-1] || '';
      var dateStr = (d.getMonth()+1)+'/'+d.getDate();
      var stocks  = _earnData.filter(function(e){ return e.date === ds; })
                             .sort(function(a,b){ return (b.mktcap_B||0)-(a.mktcap_B||0); });
      var cards = stocks.length
        ? stocks.map(function(e){ return earnCardHtml(e, isPast||isToday); }).join('')
        : '<div class="earn-empty">—</div>';
      return '<div class="earn-day-col'+(isPast?' earn-col-past':'')+'">'
        +'<div class="earn-day-header'+(isToday?' today':'')+'">'
        +  '<span>'+dayName+'</span><span class="earn-date-date">'+dateStr+'</span>'
        +'</div>'
        +cards
        +'</div>';
    }).join('');
    var gridId = 'earnGrid_'+label.replace(/\s/g,'_');
    if(collapsible){
      return '<details style="margin-top:16px">'
        +'<summary style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#334155;margin-bottom:8px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px">'
        +'<span style="font-size:10px">▶</span> '+label+'</summary>'
        +'<div class="earn-week-grid" style="margin-top:8px">'+cols+'</div>'
        +'</details>';
    }
    return '<div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:8px">'+label+'</div>'
      +'<div class="earn-week-grid">'+cols+'</div>';
  }

  var html = '';
  if(showNextFirst){
    html += renderWeekGrid(weekDays(nextMon), 'Next Week', false);
    html += renderWeekGrid(weekDays(thisMon), 'This Week (Results)', true);
  } else {
    html += renderWeekGrid(weekDays(thisMon), 'This Week', false);
    html += renderWeekGrid(weekDays(nextMon), 'Next Week', false);
  }
  document.getElementById('earnContent').innerHTML = html;
}

function earnRenderTable(){
  var todayStr3 = new Date().toISOString().slice(0,10);
  var filtered = _earnData.filter(function(e){
    return e.date >= todayStr3 && (_earnMinMktCap === 0 || (e.mktcap_B||0) >= _earnMinMktCap);
  });
  var sorted = filtered.slice().sort(function(a,b){
    var av = a[_earnSort.col], bv = b[_earnSort.col];
    if(av===null||av===undefined) return 1;
    if(bv===null||bv===undefined) return -1;
    var primary = _earnSort.asc ? (av>bv?1:-1) : (av<bv?1:-1);
    if(primary !== 0) return primary;
    return (b.mktcap_B||0) - (a.mktcap_B||0);
  });

  var today = new Date().toISOString().slice(0,10);
  var inWeek = new Date(); inWeek.setDate(inWeek.getDate()+7);
  var inWeekStr = inWeek.toISOString().slice(0,10);

  function th(label, col){
    var arrow = _earnSort.col===col ? (_earnSort.asc?' ↑':' ↓') : '';
    return '<th onclick="earnSortBy(\''+col+'\')" style="white-space:nowrap">'+label+arrow+'</th>';
  }

  var todayStr2 = new Date().toISOString().slice(0,10);
  var rows = sorted.map(function(e){
    var mktcap   = e.mktcap_B ? (e.mktcap_B>=1000?'$'+(e.mktcap_B/1000).toFixed(1)+'T':'$'+e.mktcap_B+'B') : '—';
    var badgeCls = e.date <= inWeekStr ? (e.date === today ? 'thisweek' : 'soon') : '';
    var isPast   = e.date <= todayStr2;
    var hasAct   = e.eps_actual !== null && e.eps_actual !== undefined;
    var beat     = hasAct && e.eps_est !== null ? e.eps_actual > e.eps_est : null;
    var actCol   = beat === true ? '#22c55e' : beat === false ? '#ef4444' : '#94a3b8';
    var actCell  = hasAct
      ? '<strong style="color:'+actCol+'">$'+e.eps_actual+'</strong>'
      : '<span style="color:#1e293b">—</span>';
    var surpCell = (e.surprise !== null && e.surprise !== undefined)
      ? '<span style="color:'+(e.surprise>=0?'#22c55e':'#ef4444')+'">'+(e.surprise>=0?'+':'')+e.surprise+'%</span>'
      : '—';
    return '<tr onclick="navigate(\'research\');setTimeout(function(){researchTicker(\''+e.ticker+'\')},300)">'
      +'<td><strong style="color:#f1f5f9">'+e.ticker+'</strong></td>'
      +'<td style="color:#64748b;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+e.name+'</td>'
      +'<td><span class="earn-date-badge '+badgeCls+'">'+e.date+'</span> '+(e.timing==='BMO'?'<span title="Before Market Open">☀️</span>':e.timing==='AMC'?'<span title="After Market Close">🌙</span>':'')+'</td>'
      +'<td style="color:#475569;font-size:11px">'+(e.fiscal_q||'—')+'</td>'
      +'<td style="color:#60a5fa;font-weight:700">'+(e.eps_est!==null?'$'+e.eps_est:'—')+'</td>'
      +'<td>'+actCell+'</td>'
      +'<td>'+surpCell+'</td>'
      +'<td style="color:#475569">'+mktcap+'</td>'
      +'</tr>';
  }).join('');

  document.getElementById('earnContent').innerHTML =
    '<div style="overflow-x:auto"><table class="earn-table">'
    +'<thead><tr>'+th('Ticker','ticker')+th('Company','name')+th('Date','date')+th('Quarter','fiscal_q')+th('EPS Est','eps_est')+th('Actual','eps_actual')+th('Surprise','surprise')+th('Mkt Cap','mktcap_B')+'</tr></thead>'
    +'<tbody>'+rows+'</tbody></table></div>';
}

function earnSortBy(col){
  if(_earnSort.col===col) _earnSort.asc = !_earnSort.asc;
  else { _earnSort.col=col; _earnSort.asc=(col==='mktcap_B'||col==='surprise'?false:true); }
  earnRenderTable();
}

function earnSetMinCap(val){
  _earnMinMktCap = val;
  ['0','1','10','50'].forEach(function(v){
    var btn = document.getElementById('earnCap'+v);
    if(!btn) return;
    var active = parseFloat(v)===val;
    btn.style.background    = active ? '#1e3a5f' : 'transparent';
    btn.style.color         = active ? '#4a9eff' : '#475569';
    btn.style.borderColor   = active ? '#2d4f7a' : '#1e293b';
  });
  earnRenderTable();
}

// ── Research tab — Insider Activity ───────────────────────────────────────────
function loadResearchInsiders(sym){
  var el = document.getElementById('resInsiderSection');
  if(!el) return;
  el.innerHTML = '';
  fetch(API + '/api/insider-activity?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      var rows = (d.results||[]).filter(function(r){ return r.text; });
      if(!rows.length) return;
      var html = '<div class="mini-section" style="margin-top:20px">';
      html += '<div class="ms-header"><div class="ms-title">🏦 Insider Transactions <span style="font-size:11px;font-weight:400;color:#475569">· last 6 months</span></div></div>';
      html += '<div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">';
      rows.forEach(function(r){
        if(!r.text) return;
        var isBuy  = r.is_buy;
        var isSale = r.is_sale;
        var typeCol = isBuy ? '#22c55e' : isSale ? '#ef4444' : '#64748b';
        var typeLabel = isBuy ? '▲ Buy' : isSale ? '▼ Sell' : '● Other';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:6px;border-left:2px solid '+typeCol+'">'
          + '<div style="min-width:56px;font-size:10px;font-weight:700;color:'+typeCol+'">'+typeLabel+'</div>'
          + '<div style="flex:1">'
          +   '<span style="font-size:12px;font-weight:600;color:#e2e8f0">'+r.insider+'</span>'
          +   '<span style="font-size:11px;color:#475569;margin-left:6px">'+r.title+'</span>'
          + '</div>'
          + '<div style="text-align:right;font-size:11px;color:#94a3b8">'
          +   (r.value ? ibFmtVal(r.value) : '')
          +   (r.shares ? ' · '+r.shares.toLocaleString()+' sh' : '')
          +   '<span style="color:#334155;margin-left:6px">'+r.date+'</span>'
          + '</div>'
          + '</div>';
      });
      html += '</div></div>';
      el.innerHTML = html;
    }).catch(function(){});
}

// ══════════════════════════════════════════════════════════════
// HOUSING RISK GAUGE — Cross-Asset Macro Regime Model
// 8 signals, institutionally weighted, FRED + yfinance data
// ══════════════════════════════════════════════════════════════

var _hrgChart1=null, _hrgChart2=null, _hrgChart3=null;

async function hrgFred(series){
  var r = await fetch(API + '/api/fred?series=' + series);
  var txt = await r.text();
  var rows = txt.trim().split('\n').slice(1);
  var out = [];
  rows.forEach(function(line){
    var p = line.split(',');
    if(p[1] && p[1].trim() !== '.') out.push({date:p[0], value:parseFloat(p[1])});
  });
  return out;
}

async function hrgHist(symbol, days){
  var r = await fetch(API + '/api/history?symbol=' + encodeURIComponent(symbol) + '&days=' + days);
  return r.json();
}

function hrgRet(closes, lookback){
  if(!closes || closes.length <= lookback) return null;
  var n = closes.length;
  return (closes[n-1] / closes[n-1-lookback] - 1) * 100;
}

function hrgScoreSpread(aRet, bRet, range){
  // positive spread = a outperforms b = risk-on
  if(aRet === null || bRet === null) return 50;
  var r = range || 25;
  return Math.max(0, Math.min(100, Math.round(((aRet - bRet) + r) / (r*2) * 100)));
}

function hrgScoreHY(bps){
  if(bps < 200) return 92; if(bps < 250) return 84; if(bps < 300) return 74;
  if(bps < 350) return 62; if(bps < 400) return 50; if(bps < 450) return 38;
  if(bps < 500) return 28; if(bps < 600) return 18; return 8;
}

function hrgScoreCurve(v){
  if(v > 2.0) return 90; if(v > 1.5) return 82; if(v > 1.0) return 73;
  if(v > 0.5) return 64; if(v > 0.0) return 55; if(v > -0.5) return 40;
  if(v > -1.0) return 28; return 14;
}

function hrgScoreVIX(v){
  if(v < 12) return 92; if(v < 15) return 83; if(v < 18) return 73;
  if(v < 22) return 60; if(v < 28) return 42; if(v < 35) return 25; return 12;
}

function hrgScoreNFCI(v){
  // negative = loose = risk-on
  if(v < -0.7) return 90; if(v < -0.4) return 78; if(v < -0.1) return 65;
  if(v < 0.2)  return 50; if(v < 0.5)  return 35; if(v < 0.8)  return 22; return 10;
}

function hrgChartOpts(title){
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{display:false},
      title:{display:true,text:title,color:'#475569',font:{size:10,weight:'700',family:'Inter,sans-serif'},padding:{bottom:8}},
      tooltip:{
        backgroundColor:'rgba(8,8,16,0.92)', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
        titleColor:'#94a3b8', bodyColor:'#e2e8f0', padding:10,
      },
    },
    scales:{
      x:{ticks:{color:'#334155',font:{size:8},maxTicksLimit:6,maxRotation:0},grid:{color:'rgba(255,255,255,0.03)'},border:{color:'rgba(255,255,255,0.06)'}},
      y:{ticks:{color:'#334155',font:{size:8}},grid:{color:'rgba(255,255,255,0.04)'},border:{color:'rgba(255,255,255,0.06)'}},
    }
  };
}

function hrgDrawCharts(woodH, gldH, copxH, hyData, curveData){
  // ── Chart 1: WOOD/GLD Ratio (normalized to 100) ──────────────
  if(_hrgChart1){_hrgChart1.destroy();_hrgChart1=null;}
  var c1 = document.getElementById('hrg-chart-1');
  if(c1 && woodH.closes && gldH.closes && woodH.closes.length && gldH.closes.length){
    var n1 = Math.min(woodH.closes.length, gldH.closes.length, 90);
    var wc = woodH.closes.slice(-n1), gc = gldH.closes.slice(-n1);
    var labels1 = (woodH.dates||[]).slice(-n1);
    var base = wc[0]/gc[0];
    var ratio = wc.map(function(w,i){ return +(w/gc[i]/base*100).toFixed(2); });
    var mn = ratio.reduce(function(a,b){return a+b;},0)/ratio.length;
    _hrgChart1 = new Chart(c1.getContext('2d'),{
      type:'line',
      data:{
        labels:labels1,
        datasets:[
          {label:'WOOD/GLD',data:ratio,
           segment:{borderColor:function(sc){return ((sc.p0.parsed.y+sc.p1.parsed.y)/2)>=mn?'#22c55e':'#ef4444';}},
           borderWidth:2,pointRadius:0,fill:false,tension:0.3},
          {label:'Mean',data:ratio.map(function(){return+mn.toFixed(2);}),
           borderColor:'rgba(74,158,255,0.45)',borderWidth:1.5,borderDash:[6,3],pointRadius:0,fill:false,tension:0},
        ]
      },
      options:hrgChartOpts('WOOD/GLD Ratio · Lumber vs Gold (90D)'),
    });
  }

  // ── Chart 2: HY Credit Spreads (bps) ────────────────────────
  if(_hrgChart2){_hrgChart2.destroy();_hrgChart2=null;}
  var c2 = document.getElementById('hrg-chart-2');
  if(c2 && hyData.length){
    var hy = hyData.slice(-90);
    var labels2 = hy.map(function(d){return d.date.slice(5);});
    var hyBps   = hy.map(function(d){return +(d.value*100).toFixed(0);});
    var hyMn    = hyBps.reduce(function(a,b){return a+b;},0)/hyBps.length;
    _hrgChart2 = new Chart(c2.getContext('2d'),{
      type:'line',
      data:{
        labels:labels2,
        datasets:[
          {label:'HY Spread (bps)',data:hyBps,
           segment:{borderColor:function(sc){return ((sc.p0.parsed.y+sc.p1.parsed.y)/2)>hyMn?'#ef4444':'#22c55e';}},
           borderWidth:2,pointRadius:0,fill:false,tension:0.3},
          {label:'Mean',data:hyBps.map(function(){return+hyMn.toFixed(0);}),
           borderColor:'rgba(74,158,255,0.45)',borderWidth:1.5,borderDash:[6,3],pointRadius:0,fill:false,tension:0},
        ]
      },
      options:hrgChartOpts('HY Credit Spread · ICE BofA OAS (bps)'),
    });
  }

  // ── Chart 3: 2s10s Yield Curve ──────────────────────────────
  if(_hrgChart3){_hrgChart3.destroy();_hrgChart3=null;}
  var c3 = document.getElementById('hrg-chart-3');
  if(c3 && curveData.length){
    var cv = curveData.slice(-90);
    var labels3 = cv.map(function(d){return d.date.slice(5);});
    var cvVals  = cv.map(function(d){return+d.value.toFixed(2);});
    _hrgChart3 = new Chart(c3.getContext('2d'),{
      type:'line',
      data:{
        labels:labels3,
        datasets:[
          {label:'2s10s (%)',data:cvVals,
           segment:{borderColor:function(sc){return ((sc.p0.parsed.y+sc.p1.parsed.y)/2)>=0?'#22c55e':'#ef4444';}},
           backgroundColor:function(ctx){
             var chart=ctx.chart,{ctx:c,chartArea:a}=chart;
             if(!a) return;
             var grad=c.createLinearGradient(0,a.top,0,a.bottom);
             grad.addColorStop(0,'rgba(34,197,94,0.07)');
             grad.addColorStop(0.5,'rgba(0,0,0,0)');
             grad.addColorStop(1,'rgba(239,68,68,0.07)');
             return grad;
           },
           fill:'origin',
           borderWidth:2,pointRadius:0,tension:0.3},
          {label:'Zero',data:cvVals.map(function(){return 0;}),
           borderColor:'rgba(255,255,255,0.1)',borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,tension:0},
        ]
      },
      options:hrgChartOpts('2s10s Yield Curve · Steepening = Risk-On (%)'),
    });
  }
}

function renderHrgPortfolio(composite){
  var ALLOC=[
    {asset:'US Equities (SPY)',     ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Cyclical earnings expand',     nExpl:'Mixed backdrop',         fExpl:'Earnings risk, multiple compression'},
    {asset:'Cyclical Sectors (XLI/XLY)',ron:'OW+',neu:'N',rof:'UW-',rExpl:'Industrial/consumer lead',     nExpl:'Sector-neutral',         fExpl:'Defensives outperform'},
    {asset:'Homebuilders (XHB)',    ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Housing cycle accelerating',   nExpl:'Rate-dependent',         fExpl:'Rising rates crush demand'},
    {asset:'Duration / Bonds (TLT)',ron:'UW',  neu:'N',  rof:'OW',  rExpl:'Rates rise, bonds weak',       nExpl:'Duration neutral',       fExpl:'Flight to safety, price appreciation'},
    {asset:'High Yield Credit',     ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Spreads tighten, carry accrues',nExpl:'Spread-neutral',        fExpl:'Spread widening destroys returns'},
    {asset:'Commodities ex-Gold',   ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Demand growth + capex cycle',  nExpl:'Range-bound demand',     fExpl:'Demand destruction'},
    {asset:'Gold (GLD)',            ron:'UW',  neu:'N',  rof:'OW',  rExpl:'Opportunity cost rises',       nExpl:'Neutral real rates',     fExpl:'Safe haven, real yield decline'},
    {asset:'USD (DXY)',             ron:'UW',  neu:'N',  rof:'OW',  rExpl:'Risk appetite = EM/growth bid',nExpl:'Fundamentals-driven',    fExpl:'Flight to safety'},
    {asset:'Volatility (VIX)',      ron:'Short',neu:'N', rof:'Long', rExpl:'Low vol regime, sell premium', nExpl:'Neutral positioning',    fExpl:'Hedge tail risk, buy protection'},
    {asset:'Emerging Markets (EEM)',ron:'OW',  neu:'N',  rof:'UW',  rExpl:'USD weakness + growth cycle',  nExpl:'EM-specific factors',    fExpl:'Dollar strength + risk aversion'},
  ];
  var isRon = composite >= 55, isRof = composite < 42;
  var key = isRon ? 'ron' : isRof ? 'rof' : 'neu';
  var exKey = isRon ? 'rExpl' : isRof ? 'fExpl' : 'nExpl';
  var html = '<table class="hrg-alloc-table"><thead><tr>'
    +'<th>Asset Class</th><th>Positioning</th><th>Rationale</th>'
    +'</tr></thead><tbody>';
  ALLOC.forEach(function(row){
    var val = row[key], expl = row[exKey];
    var isOW = val==='OW'||val==='OW+', isUW = val==='UW'||val==='UW-';
    var isSh = val==='Short', isLong = val==='Long';
    var pillCls = (isOW||isSh) ? 'hrg-ow' : (isUW||isLong) ? 'hrg-uw' : 'hrg-neu';
    var stanceCls = (isOW||isSh)?'hrg-stance-up':(isUW||isLong)?'hrg-stance-dn':'hrg-stance-ne';
    var stanceTxt = (isOW)?'▲ Overweight':(isUW)?'▼ Underweight':(isSh)?'▽ Short Vol':(isLong)?'△ Long Vol':'— Neutral';
    html+='<tr><td>'+row.asset+'</td>'
      +'<td><span class="hrg-pill '+pillCls+'">'+val+'</span></td>'
      +'<td class="'+stanceCls+'">'+expl+'</td>'
      +'</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('hrg-portfolio').innerHTML = html;
}

function renderHousingGauge(signals, composite){
  var color = riskScoreToColor(composite);
  document.getElementById('hrg-gauge-wrap').innerHTML = buildRiskGaugeSvg(composite);
  var sn = document.getElementById('hrg-score-num');
  sn.textContent = composite; sn.style.color = color;
  var rl = document.getElementById('hrg-label');
  rl.textContent = riskScoreToLabel(composite); rl.style.color = color;

  var sArr = Object.values(signals);
  var bull = sArr.filter(function(s){return s.score>=60;}).length;
  var bear = sArr.filter(function(s){return s.score<=40;}).length;
  var lead = sArr.sort(function(a,b){return Math.abs(b.score-50)-Math.abs(a.score-50);})[0];
  var mood = composite>=68?'Cross-asset signals firmly risk-on':composite>=55?'Markets leaning into risk':composite>=42?'Mixed regime — no clear directional edge':composite>=30?'Risk-off pressure building across asset classes':'Extreme risk-off — defensive posture warranted';
  document.getElementById('hrg-summary').textContent = mood+'. '+bull+' of 8 signals bullish, '+bear+' defensive. Lead signal: '+lead.label+'.';

  // Contribution bars (sorted high→low)
  var sorted = Object.entries(signals).sort(function(a,b){return b[1].score-a[1].score;});
  var cHtml = '';
  sorted.forEach(function(e){
    var sig=e[1], sc=riskScoreToColor(sig.score);
    cHtml+='<div class="rsig-contrib-row">'
      +'<div class="rsig-contrib-name">'+sig.icon+' '+sig.label+'</div>'
      +'<div class="rsig-contrib-track"><div class="rsig-contrib-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-contrib-score" style="color:'+sc+'">'+sig.score+'</div>'
      +'</div>';
  });
  document.getElementById('hrg-contrib-rows').innerHTML = cHtml;

  // Signal cards (8, 4-col grid)
  var gHtml = '';
  Object.values(signals).forEach(function(sig){
    var sc = riskScoreToColor(sig.score);
    var bc = sig.score>=65?'ron':sig.score>=45?'neu':'rof';
    var bt = sig.score>=65?'RISK-ON':sig.score>=45?'NEUTRAL':'RISK-OFF';
    gHtml+='<div class="rsig-card">'
      +'<div class="rsig-card-head">'
        +'<div class="rsig-card-name">'+sig.icon+'&nbsp;'+sig.label+'</div>'
        +'<span class="rsig-badge '+bc+'">'+bt+'</span>'
      +'</div>'
      +'<div class="rsig-val" style="color:'+sc+'">'+sig.value+'</div>'
      +'<div class="rsig-detail">'+sig.detail+'</div>'
      +'<div class="rsig-bar-track"><div class="rsig-bar-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-bar-foot">'
        +'<div class="rsig-bar-score">Score '+sig.score+'/100</div>'
        +'<div class="rsig-bar-wt">WT '+Math.round(sig.weight*100)+'%</div>'
      +'</div>'
      +'</div>';
  });
  document.getElementById('hrg-signal-grid').innerHTML = gHtml;

  renderHrgPortfolio(composite);
}

async function loadHousingGauge(){
  var updEl = document.getElementById('hrg-updated');
  if(updEl) updEl.textContent = 'Loading...';
  document.getElementById('hrg-gauge-wrap').innerHTML = '<div style="color:#334155;font-size:12px;padding:40px 0;text-align:center">Fetching cross-asset data...</div>';
  document.getElementById('hrg-signal-grid').innerHTML = '';
  document.getElementById('hrg-contrib-rows').innerHTML = '';

  try{
    var LOOK = 65; // 13 weeks ≈ 65 trading days
    var [woodH, gldH, copxH, xhbH, spyH, vixH, dxyH, hyData, curveData, nfciData] = await Promise.all([
      hrgHist('WOOD',    100),
      hrgHist('GLD',     100),
      hrgHist('COPX',    100),
      hrgHist('XHB',     100),
      hrgHist('SPY',     100),
      hrgHist('^VIX',     30),
      hrgHist('DX-Y.NYB',100),
      hrgFred('BAMLH0A0HYM2'),
      hrgFred('T10Y2Y'),
      hrgFred('NFCI'),
    ]);

    var woodRet = hrgRet(woodH.closes, LOOK);
    var gldRet  = hrgRet(gldH.closes,  LOOK);
    var copxRet = hrgRet(copxH.closes, LOOK);
    var xhbRet  = hrgRet(xhbH.closes,  LOOK);
    var spyRet  = hrgRet(spyH.closes,  LOOK);
    var dxyRet  = hrgRet(dxyH.closes,  LOOK);
    var curVIX  = vixH.closes && vixH.closes.length ? vixH.closes[vixH.closes.length-1] : null;
    var curHY   = hyData.length  ? hyData[hyData.length-1].value * 100  : null; // % → bps
    var curCurve= curveData.length ? curveData[curveData.length-1].value : null;
    var curNFCI = nfciData.length  ? nfciData[nfciData.length-1].value  : null;

    var fmt1 = function(v){ return v!==null ? (v>0?'+':'')+v.toFixed(1)+'%' : '—'; };

    var signals = {
      woodGold:{
        score:   hrgScoreSpread(woodRet, gldRet, 25),
        weight:  0.18, label:'Lumber/Gold', icon:'🌲',
        value:   woodRet!==null&&gldRet!==null ? fmt1(woodRet-gldRet) : '—',
        detail:  'WOOD 13W '+fmt1(woodRet)+' · GLD '+fmt1(gldRet)+' · construction vs safe haven',
      },
      copxGold:{
        score:   hrgScoreSpread(copxRet, gldRet, 25),
        weight:  0.15, label:'Copper/Gold', icon:'🔶',
        value:   copxRet!==null&&gldRet!==null ? fmt1(copxRet-gldRet) : '—',
        detail:  'COPX 13W '+fmt1(copxRet)+' · GLD '+fmt1(gldRet)+' · industrial demand proxy',
      },
      hy:{
        score:   curHY!==null ? hrgScoreHY(curHY) : 50,
        weight:  0.20, label:'HY Credit', icon:'📉',
        value:   curHY!==null ? curHY.toFixed(0)+'bps' : '—',
        detail:  'ICE BofA HY OAS · tight=risk-on · wide=credit stress',
      },
      curve:{
        score:   curCurve!==null ? hrgScoreCurve(curCurve) : 50,
        weight:  0.15, label:'2s10s Curve', icon:'📐',
        value:   curCurve!==null ? (curCurve>0?'+':'')+curCurve.toFixed(2)+'%' : '—',
        detail:  'Steepening = expansion · Inverted = recession risk',
      },
      xhbSpy:{
        score:   hrgScoreSpread(xhbRet, spyRet, 15),
        weight:  0.12, label:'Homebuilders/SPY', icon:'🏠',
        value:   xhbRet!==null&&spyRet!==null ? fmt1(xhbRet-spyRet) : '—',
        detail:  'XHB 13W '+fmt1(xhbRet)+' · SPY '+fmt1(spyRet)+' · housing sector leadership',
      },
      vix:{
        score:   curVIX!==null ? hrgScoreVIX(curVIX) : 50,
        weight:  0.10, label:'VIX Regime', icon:'😰',
        value:   curVIX!==null ? curVIX.toFixed(1) : '—',
        detail:  curVIX<15?'Low fear · risk-on':curVIX<25?'Elevated uncertainty · mixed':'High fear · de-risking underway',
      },
      dxy:{
        score:   hrgScoreSpread(-1*(dxyRet||0), 0, 10) , // invert: DXY down = risk-on
        weight:  0.05, label:'Dollar (DXY)', icon:'💵',
        value:   fmt1(dxyRet),
        detail:  'DXY 13W change · weakening USD = risk-on for commodities & EM',
      },
      nfci:{
        score:   curNFCI!==null ? hrgScoreNFCI(curNFCI) : 50,
        weight:  0.05, label:'Financial Conditions', icon:'🏦',
        value:   curNFCI!==null ? curNFCI.toFixed(3) : '—',
        detail:  'Chicago Fed NFCI · negative=loose=risk-on · positive=tightening',
      },
    };

    var composite = 0;
    Object.values(signals).forEach(function(s){ composite += s.score * s.weight; });
    composite = Math.round(composite);

    renderHousingGauge(signals, composite);
    hrgDrawCharts(woodH, gldH, copxH, hyData, curveData);

    if(updEl) updEl.textContent = 'Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.error('loadHousingGauge:',e);
    if(updEl) updEl.textContent = 'Error — '+e.message;
    document.getElementById('hrg-gauge-wrap').innerHTML = '';
  }
}
