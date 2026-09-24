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

// ── BTC MARKET DATA — via WAVE API ───────────────────────────────────────────
async function bnBtcPrice(){
  try{
    var r=await fetch(API+'/api/crypto-market/quote?symbol=BTCUSDT');
    var d=await r.json();
    if(d.error) return null;
    return {price:Number(d.price),pct:Number(d.pct)};
  }catch(e){return null;}
}

async function _btcKlines(interval,limit){
  try{
    var r=await fetch(API+'/api/crypto-market/klines?symbol=BTCUSDT&interval='+encodeURIComponent(interval)+'&limit='+encodeURIComponent(limit));
    var d=await r.json();
    if(d.error||!d.closes) return null;
    return d;
  }catch(e){return null;}
}

async function bnBtcKlines(interval,limit){
  var d=await _btcKlines(interval,limit);
  return d?d.closes:null;
}

async function bnBtcKlinesLabeled(interval,limit){
  var d=await _btcKlines(interval,limit);
  if(!d) return null;
  return {
    closes:d.closes,
    labels:(d.timestamps||[]).map(function(ts){
      return new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    })
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

