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
