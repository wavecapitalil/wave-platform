(function(){
  var state = {trades:null, daily:null, chart:null, ft:null, extra:[], filter:'all', ready:false, loading:false, raf:0, focus:-1};
  var ASSET = 'assets/research/btc-bb/';

  function bdi(text){return '<bdi>'+text+'</bdi>';}
  function price(s){
    if(s==null||s==='') return '—';
    var neg = s.charAt(0)==='-';
    var body = neg ? s.slice(1) : s;
    var bits = body.split('.');
    var whole = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg?'−':'')+whole+(bits.length>1?'.'+bits[1]:'');
  }
  function retHtml(s){
    if(s==null||s==='') return '<span class="bb-pill pending">pending</span>';
    var n = Number(s);
    var cls = n>0?'up':n<0?'dn':'';
    var sign = n>0?'+':n<0?'−':'';
    return '<bdi class="'+cls+'">'+sign+Math.abs(n*100).toFixed(2)+'%</bdi>';
  }
  function dateAt(i){
    var t = Date.UTC(2017,7,17)+i*86400000;
    return new Date(t).toISOString().slice(0,10);
  }

  function recordSources(){
    if(!window.WaveSources) return;
    WaveSources.record('btc-bb:main','BTC BB research · Main study',
      'Study ID BTC_BB_LOWER_TOUCH_7D_v1. Backtest Research Standard v2.0.\n'+
      'Source files: btc_bb_lower_touch_report_HE_standalone.html, validation_report_HE.md, analysis_results.json, PREREGISTRATION_frozen_definitions.md, charts/*.png.\n'+
      'Frozen 2026-11-05 00:05 Asia/Jerusalem (2026-11-04 22:05 UTC). Data pulled 2026-11-04 22:01 UTC; report clock 2026-11-05 00:01 Asia/Jerusalem via data-api.binance.vision (api.binance.com returned HTTP 451). Rows 3366, 2017-08-17 → 2026-11-03, partial current candle removed.\n'+
      'E0: duplicates 0, missing days 0, OHLC violations 0, UTC 00:00 opens, partial day 2018-02-08, large move 2020-03-12. Single source, not cross-checked.\n'+
      'Eligible 7d sample is 415 כל ימי הנגיעה / 88 ימי טריגר / 3340 baseline days. Four later touches had no t+7 in the frozen file (horizon H=1 uses 419).\n'+
      'Seed 42. 10,000 draws. No costs in the base case.\n'+
      'The delivered report prints two random-baseline percentile triples for the 7d horizon. Summary table: כל ימי הנגיעה 8.6 / 73.3 / 63.2 and ימי טריגר 10.6 / 46.1 / 39.9. Horizon table H=7: 8.6 / 73.3 / 62.4 and 10.7 / 46.2 / 40.1. Both are shown as printed. They were not averaged.',
      [{title:'Binance Vision BTCUSDT 1d', url:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d'}]);
    WaveSources.record('btc-bb:oos','BTC BB research · PRE-SAMPLE HOLDOUT OOS',
      'Files: oos/btc_bb_oos_report_HE.html, oos/validation_report_OOS_HE.md, oos/oos_results.json, oos/charts_oos_hero.png.\n'+
      'Bitstamp public OHLC API v2, BTC/USD, step=86400. Pulled 2026-11-04 22:22 UTC (report: 2026-11-05 00:22 Asia/Jerusalem). 2191 rows, 2011-08-18 → 2017-08-16. Last entry with an exit: 2017-08-09.\n'+
      'E0 OOS: duplicates 0, missing 0, OHLC 0, zero-volume days 33, daily moves above 25%: 13. Nothing removed. Overlap check 2017-08-17 → 2018-12-31: level correlation 0.9994, return correlation 0.982, mean close gap 0.65%, max 9.9%.\n'+
      'Code sha256 recorded as byte-identical. Verdict on ימי טריגר: gap -1.69pp ≤ 0 → E4 BLOCKER, REJECT / confirm STOP.',
      [{title:'Bitstamp BTC/USD daily', url:'https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000'}]);
    WaveSources.record('btc-bb:h1','BTC BB research · H1 weakness',
      'Files: h1_weakness/btc_bb_h1_weakness_report_HE.html, h1_weakness/validation_report_H1_HE.md, h1_weakness/h1_results.json.\n'+
      'H1 was written after both Binance 2017–2026 and Bitstamp 2011–2017 had been seen, so neither split is True OOS. E4 NOT CHECKABLE. Pre-specified outcome INCONCLUSIVE (4 of 6). Holm p = 0.229. Research Action STOP. Production Confidence LOW. Evidence Verdict NO EDGE FOUND.\n'+
      'POOLED rows 5557, eligible days 5531, 2011-09-06 → 2026-10-27.',
      []);
    WaveSources.record('btc-bb:eth','BTC BB research · ETH complementary check',
      'Files: eth_check/eth_bb_lower_touch_check_HE.html, eth_check/validation_report_HE.md.\n'+
      'Complementary cross-asset check only. Not an E4 evidence item for the BTC study and not an OOS test of the BTC rule. E4 of this check: NOT CHECKABLE. BTC E4 status is unchanged by it.\n'+
      'eth_check/oos/STOPPED_NOT_DELIVERED.txt: stopped 2026-11-05 18:55 Asia/Jerusalem. Kraken tape incomplete. No OOS signal or return statistic was computed. Not delivered.\n'+
      'ETHUSDT Binance 1d, 3367 days, 2017-08-17 → 2026-11-04. Daily return correlation with BTC 0.80. 62% of ETH touches fell on a BTC touch day.',
      [{title:'Binance Vision ETHUSDT 1d', url:'https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT&interval=1d'}]);
    WaveSources.record('btc-bb:multi','BTC BB research · 10-coin 70/30 screen',
      'Files: multi_asset_70_30/multi10_bb_lower_touch_70_30_HE.html, multi_asset_70_30/validation_report_HE.md, multi_asset_70_30/screen_results.json.\n'+
      'Evidence Verdict (screen): NO EDGE FOUND. Research Action: STOP. Production Confidence: LOW. E4: NOT CHECKABLE. This screen is not the E4 of the BTC study.\n'+
      'IS edge candidates 0/10. OOS SUPPORT 0/10, INCONCLUSIVE 3/10 (BTC, SOL, BNB), REJECT 7/10. Holm survivors 0/10. Bonferroni survivors 0/10.\n'+
      'Coins and E0 ranges are the screen report table (all E0 PASS). Single Binance source. No IS/OOS embargo. Survivorship from choosing coins by current volume. PEPE OOS ימי טריגר: 10.',
      []);
    WaveSources.record('btc-bb:forward','BTC BB research · Forward test snapshot',
      'Snapshot date shown on the page: 16 Nov 2026.\n'+
      'Files: forward_test/last_report.json, forward_test/state.json, forward_test/events.csv, forward_test/daily_ft_series.csv, forward_test/e0_audit.json.\n'+
      'Run at 2026-11-16T05:45:03.128228+00:00. Last complete UTC bar 2026-11-15. Window start 2026-11-04. Seed 42. Standard: Wave Capital Backtest Research Standard v2.0.\n'+
      'E0 WARNING. Evidence NOT CHECKABLE. Accumulating verdict INCONCLUSIVE. Completed touches 4, ימי טריגר שהושלמו 0, pending touches 5, ימי טריגר ממתינים 0, baseline completed days 5.\n'+
      'all_touch_mean -0.09190822279918645 (−9.19%). baseline_mean -0.10441615836177034 (−10.44%). episode_mean_gap null.\n'+
      'Completed ret_7d from the Hebrew run summary: -8.0602%, -6.0824%, -9.9283%, -12.6923%.\n'+
      'E0 issues inherited from the research freeze: partial day 2018-02-08, large move 2020-03-12 (-0.5026), single source data-api.binance.vision. Rows 3378, 2017-08-17 → 2026-11-15. New anomalies would be BLOCKER. Decision note: Completed touches=4 but ימי טריגר שהושלמו=0. יום טריגר Addendum-2 rule not evaluable. Accumulating.',
      [{title:'Binance Vision BTCUSDT 1d', url:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d'}]);
    WaveSources.record('btc-bb:horizon10','BTC BB research · 10-day descriptive summary',
      'File: horizon_heatmap.csv. Rows used: sample all/ep where horizon_days=10, plus the base_* fields on those rows.\n'+
      'all: n_total 412, n_pos 210, x_of_n 210/412, hit_rate 0.5097087378640777, median 0.0008377288255548843, mean 0.0012901717011777928, rand_pct_mean 5.07.\n'+
      'ep: n_total 88, n_pos 45, x_of_n 45/88, hit_rate 0.5113636363636364, median 0.0008991433287443007, mean -0.009680701006155768, rand_pct_mean 5.11.\n'+
      'baseline: base_n 3337, base_hit 0.5397063230446509, base_median 0.0068557930008597, base_mean 0.015223044225750873.\n'+
      'Displayed at the same precision as the request (2 decimal percent, percentile as printed). Primary frozen horizon remains 7 days. 10 days is descriptive only.',
      []);
    WaveSources.record('btc-bb:trades10','BTC BB research · 10-day trades window',
      'Files: trades_10d_view.csv (419 touches, 2017-09-05 → 2026-11-02, 88 ימי טריגר) and daily_series_with_bands.csv (3366 daily OHLC rows, 2017-08-17 → 2026-11-03, no calendar gaps). The chart draws those open/high/low/close values. Full range uses weekly candles built from each 7-day block of that daily OHLC; a selected trade shows the daily candles. The lower band is the file value, not a new calculation.\n'+
      'Seven rows have an empty t+10 exit in the frozen file and are shown with a pending pill: 2026-10-25, 2026-10-26, 2026-10-27, 2026-10-29, 2026-10-30, 2026-10-31, 2026-11-02.\n'+
      'Prices and ret_10d are the CSV cells. Percents on screen are ret_10d × 100 at 2 decimals. The chart does not recompute bands or returns.',
      []);
    WaveSources.record('btc-bb:continuation','BTC BB research · Continuation',
      'Study ID BTC_BB_LOWER_TOUCH_CONTINUATION_v1. Same frozen Binance BTCUSDT 1d file and BB(20, 2.0) touch rule as the reversion study. Decisive object: ימי טריגר (88 of 415 כל ימי הנגיעה). Primary horizon 7 calendar days.\n'+
      'H_cont outcome INCONCLUSIVE (2 of 5 decisive criteria). Evidence Verdict NO EDGE FOUND. Research Action STOP. Production Confidence LOW.\n'+
      'E0 WARNING. E1 WARNING. E2 BLOCKER. E3 WARNING. E4 NOT CHECKABLE.\n'+
      'Trigger-day mean -0.57% vs baseline +1.04% (gap -1.61pp). Median +0.11% vs +0.48% (gap -0.36pp). Random-timing percentile of the mean 10.6. Bootstrap 95% CI on the mean gap [-3.52, +0.23]pp. Holm p 0.1728 (raw 0.0432).\n'+
      'Short gross mean +0.57%, median -0.11%, hit 50.00%. Net 10bps+funding +0.40%, 20bps+funding +0.30%, 50bps+funding -0.00%. Charts that are not rebuilt from the printed tables or CSVs are the delivered PNGs.',
      [{title:'Binance Vision BTCUSDT 1d', url:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d'}]);
    WaveSources.record('btc-bb:synthesis','BTC BB research · Synthesis',
      'Synthesis of the reversion study and the continuation study. Same signal, same sample, no new tests. Daily BTC, BB(20, 2.0), about one week.\n'+
      'A lower-band touch gives no edge, neither reversal nor continuation. Evidence Verdict NO EDGE FOUND. Research Action STOP. Production Confidence LOW.\n'+
      'Trigger days 88 / all touch days 415. Trigger-day 7d mean -0.57%, median +0.11%, up/down 50/50. Long net after 0.20% is -0.77%. Short net after 0.20% and funding is +0.30%.',
      []);
  }

  function palette(){
    return {text:'#90a8c2', grid:'rgba(23,55,82,.9)', blue:'#55aaff', cyan:'#58d7e8', amber:'#ffc857', red:'#ff6f82', green:'#48d18a', up:'#60d5b0', dn:'#ef8590'};
  }

  function buildSeries(daily){
    var n = daily.c.length;
    var ohlc = new Array(n);
    for(var i=0;i<n;i++){
      ohlc[i] = {
        o:Number(daily.o[i]),
        h:Number(daily.h[i]),
        l:Number(daily.l[i]),
        c:Number(daily.c[i]),
        b:daily.b[i]==null||daily.b[i]===''?null:Number(daily.b[i])
      };
    }
    var weeks = [];
    for(var s=0;s<n;s+=7){
      var e = Math.min(n-1, s+6);
      var hi = -Infinity, lo = Infinity;
      for(var j=s;j<=e;j++){
        if(ohlc[j].h>hi) hi = ohlc[j].h;
        if(ohlc[j].l<lo) lo = ohlc[j].l;
      }
      weeks.push({i0:s, i1:e, o:ohlc[s].o, h:hi, l:lo, c:ohlc[e].c});
    }
    state.ohlc = ohlc;
    state.weeks = weeks;
    state.n = n;
  }

  function paintCandle(ctx, xScale, yScale, bar, px, width){
    var up = bar.c>=bar.o;
    ctx.strokeStyle = ctx.fillStyle = up?'#60d5b0':'#ef8590';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, yScale.getPixelForValue(bar.h));
    ctx.lineTo(px, yScale.getPixelForValue(bar.l));
    ctx.stroke();
    var oy = yScale.getPixelForValue(bar.o);
    var cy = yScale.getPixelForValue(bar.c);
    ctx.fillRect(px-width/2, Math.min(oy,cy), width, Math.max(1, Math.abs(cy-oy)));
  }

  var candlePlugin = {
    id:'bbCandles',
    beforeDatasetsDraw:function(chart){
      if(chart.canvas.id!=='bbPriceChart' || !state.ohlc) return;
      var area = chart.chartArea;
      if(!area) return;
      var x = chart.scales.x, y = chart.scales.y;
      var min = x.min, max = x.max, span = Math.max(1, max-min);
      var weekly = span>120;
      var ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.width, area.height);
      ctx.clip();
      var pxPer = area.width/span;
      if(weekly){
        var ww = Math.max(2, Math.min(11, pxPer*5));
        state.weeks.forEach(function(bar){
          if(bar.i1<min || bar.i0>max) return;
          paintCandle(ctx, x, y, bar, x.getPixelForValue((bar.i0+bar.i1)/2), ww);
        });
      } else {
        var dw = Math.max(3, Math.min(16, pxPer*0.62));
        var i0 = Math.max(0, Math.floor(min));
        var i1 = Math.min(state.ohlc.length-1, Math.ceil(max));
        for(var i=i0;i<=i1;i++) paintCandle(ctx, x, y, state.ohlc[i], x.getPixelForValue(i), dw);
      }
      ctx.restore();
    }
  };

  function fitY(min, max){
    var i0 = Math.max(0, Math.floor(min));
    var i1 = Math.min(state.ohlc.length-1, Math.ceil(max));
    var lo = Infinity, hi = -Infinity;
    for(var i=i0;i<=i1;i++){
      var p = state.ohlc[i];
      if(p.h>hi) hi = p.h;
      if(p.l<lo) lo = p.l;
      if(p.b!=null){
        if(p.b>hi) hi = p.b;
        if(p.b<lo) lo = p.b;
      }
    }
    if(!isFinite(lo)||!isFinite(hi)) return;
    var pad = (hi-lo)*0.08 || hi*0.04;
    var yMin = lo-pad;
    if(lo>=0 && yMin<0) yMin = 0;
    state.chart.options.scales.y.min = yMin;
    state.chart.options.scales.y.max = hi+pad;
  }

  function drawPrice(){
    var canvas = document.getElementById('bbPriceChart');
    if(!canvas || !window.Chart || !state.daily) return;
    var c = palette();
    buildSeries(state.daily);
    var lower = state.ohlc.map(function(p,i){return {x:i,y:p.b};});
    if(state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type:'line',
      plugins:[candlePlugin],
      data:{
        datasets:[
          {label:'Candles', data:[{x:0,y:state.ohlc[0].c}], borderColor:c.up, backgroundColor:c.dn, pointRadius:0, borderWidth:2},
          {label:'Lower band', data:lower, borderColor:c.cyan, borderWidth:1.25, pointRadius:0, borderDash:[4,3], spanGaps:false},
          {type:'scatter', label:'Trade', data:[], showLine:true, borderColor:c.amber, borderWidth:1.5, pointRadius:7, pointHoverRadius:8, pointBackgroundColor:[]}
        ]
      },
      options:{
        animation:false,
        responsive:true,
        maintainAspectRatio:false,
        parsing:false,
        interaction:{mode:'nearest', intersect:false, axis:'x'},
        plugins:{
          legend:{labels:{color:'#edf6ff', boxWidth:14, font:{size:12}}},
          tooltip:{
            callbacks:{
              title:function(items){return dateAt(items[0].parsed.x);},
              label:function(item){
                var y = item.parsed.y;
                return item.dataset.label+': '+Number(y).toLocaleString('en-US',{maximumFractionDigits:2});
              }
            }
          }
        },
        scales:{
          x:{type:'linear', min:0, max:state.n-1, ticks:{color:c.text, autoSkip:true, maxTicksLimit:4, maxRotation:0, callback:function(v){return dateAt(Math.round(v));}}, grid:{color:c.grid}},
          y:{ticks:{color:c.text, callback:function(v){return Number(v).toLocaleString('en-US',{maximumFractionDigits:0});}}, grid:{color:c.grid}}
        }
      }
    });
    fitY(0, state.n-1);
    state.chart.update('none');
  }

  function focusTrade(index, scroll){
    var trade = state.trades[index];
    if(!trade || !state.chart) return;
    state.focus = index;
    var body = document.getElementById('bbTradesBody');
    Array.prototype.forEach.call(body.querySelectorAll('tr'), function(tr){
      tr.classList.toggle('is-on', Number(tr.dataset.i)===index);
    });
    var a = trade.i, b = trade.i10==null?trade.i:trade.i10;
    var min = Math.max(0, Math.min(a,b)-20);
    var max = Math.min(state.n-1, Math.max(a,b)+12);
    var pts = [{x:trade.i, y:Number(trade.close_t)}];
    var colors = ['#ffc857'];
    if(trade.i10!=null && trade.close_t_plus_10){
      pts.push({x:trade.i10, y:Number(trade.close_t_plus_10)});
      colors.push(Number(trade.ret_10d)>=0?'#48d18a':'#ff6f82');
    }
    var ds = state.chart.data.datasets[2];
    ds.data = pts;
    ds.pointBackgroundColor = colors;
    state.chart.options.scales.x.min = min;
    state.chart.options.scales.x.max = max;
    fitY(min, max);
    state.chart.update('none');
    if(scroll){
      var box = document.getElementById('bbPriceChart');
      if(box) box.scrollIntoView({block:'nearest', behavior:'smooth'});
    }
  }

  function resetRange(){
    state.focus = -1;
    var body = document.getElementById('bbTradesBody');
    if(body) Array.prototype.forEach.call(body.querySelectorAll('tr'), function(tr){tr.classList.remove('is-on');});
    if(!state.chart) return;
    state.chart.data.datasets[2].data = [];
    state.chart.options.scales.x.min = 0;
    state.chart.options.scales.x.max = state.n-1;
    fitY(0, state.n-1);
    state.chart.update('none');
  }

  function renderTrades(){
    var body = document.getElementById('bbTradesBody');
    if(!body) return;
    var html = state.trades.map(function(t, i){
      var pending = !t.ret_10d;
      return '<tr data-i="'+i+'" data-ep="'+(t.episode?'1':'0')+'">'
        +'<td>'+bdi(t.touch_date)+'</td>'
        +'<td>'+(t.episode?'<span class="bb-pill ep">יום טריגר</span>':'—')+'</td>'
        +'<td>'+bdi(price(t.low))+'</td>'
        +'<td>'+bdi(price(t.lower_band))+'</td>'
        +'<td>'+bdi(price(t.close_t))+'</td>'
        +'<td>'+(t.date_t_plus_10?bdi(t.date_t_plus_10):'—')+'</td>'
        +'<td>'+(t.close_t_plus_10?bdi(price(t.close_t_plus_10)):'—')+'</td>'
        +'<td>'+retHtml(t.ret_10d)+'</td>'
        +'<td>'+(pending?'—':bdi(price(t.min_close_10d)))+'</td>'
        +'<td>'+(pending?'—':bdi(price(t.max_close_10d)))+'</td>'
        +'</tr>';
    }).join('');
    body.innerHTML = html;
    applyFilter();
  }

  function applyFilter(){
    var epOnly = state.filter==='ep';
    var body = document.getElementById('bbTradesBody');
    if(!body) return;
    Array.prototype.forEach.call(body.querySelectorAll('tr'), function(tr){
      tr.hidden = epOnly && tr.dataset.ep!=='1';
    });
    document.querySelectorAll('#page-btc-bb-research [data-bb-filter]').forEach(function(btn){
      btn.setAttribute('aria-pressed', btn.getAttribute('data-bb-filter')===state.filter?'true':'false');
    });
  }

  function bindTrades(){
    var body = document.getElementById('bbTradesBody');
    if(!body || body.dataset.bound) return;
    body.dataset.bound = '1';
    function fromEvent(e){
      var tr = e.target.closest('tr');
      if(!tr || !body.contains(tr) || tr.hidden) return null;
      return Number(tr.dataset.i);
    }
    body.addEventListener('mouseover', function(e){
      var i = fromEvent(e);
      if(i==null || i===state.focus) return;
      if(state.raf) cancelAnimationFrame(state.raf);
      state.raf = requestAnimationFrame(function(){state.raf=0; focusTrade(i, false);});
    });
    body.addEventListener('click', function(e){
      var i = fromEvent(e);
      if(i==null) return;
      focusTrade(i, true);
    });
    document.querySelectorAll('#page-btc-bb-research [data-bb-filter]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var key = btn.getAttribute('data-bb-filter');
        if(key==='range'){resetRange(); return;}
        state.filter = key;
        applyFilter();
      });
    });
  }

  function drawForward(){
    var canvas = document.getElementById('bbFtChart');
    if(!canvas || !window.Chart || state.ft) return;
    var c = palette();
    var vals = [-8.0602, -6.0824, -9.9283, -12.6923];
    state.ft = new Chart(canvas, {
      type:'bar',
      data:{
        labels:['2026-11-04','2026-11-05','2026-11-06','2026-11-08'],
        datasets:[
          {label:'Ret 7D', data:vals, backgroundColor:vals.map(function(){return 'rgba(255,111,130,.8)';}), borderRadius:8, barPercentage:.62},
          {type:'line', label:'All-touch mean', data:[-9.19,-9.19,-9.19,-9.19], borderColor:c.blue, pointRadius:0, borderDash:[5,4], borderWidth:1.5},
          {type:'line', label:'All-days baseline', data:[-10.44,-10.44,-10.44,-10.44], borderColor:c.cyan, pointRadius:0, borderWidth:1.5}
        ]
      },
      options:{
        animation:false,
        responsive:true,
        maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#edf6ff', boxWidth:14, font:{size:12}}}},
        scales:{
          x:{ticks:{color:c.text}, grid:{display:false}},
          y:{ticks:{color:c.text, callback:function(v){return v+'%';}}, grid:{color:c.grid}}
        }
      }
    });
  }

  function chartBase(){
    var c = palette();
    return {
      animation:false,
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#edf6ff', boxWidth:12, font:{size:11}}}},
      scales:{
        x:{ticks:{color:c.text, maxRotation:0}, grid:{display:false}},
        y:{ticks:{color:c.text}, grid:{color:c.grid}}
      }
    };
  }

  function mountChart(id, cfg){
    var canvas = document.getElementById(id);
    if(!canvas || !window.Chart || canvas.dataset.bbOn) return;
    canvas.dataset.bbOn = '1';
    state.extra.push(new Chart(canvas, cfg));
  }

  function barLabels(fmt){
    return {
      id:'bbBarLabels',
      afterDatasetsDraw:function(chart){
        var ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = '#edf6ff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        chart.data.datasets.forEach(function(ds, di){
          var meta = chart.getDatasetMeta(di);
          if(meta.hidden || meta.type!=='bar') return;
          meta.data.forEach(function(bar, i){
            var v = ds.data[i];
            if(v==null || typeof v!=='number') return;
            var y = bar.y + (v>=0 ? -6 : 12);
            ctx.fillText(fmt(v), bar.x, y);
          });
        });
        ctx.restore();
      }
    };
  }

  function drawStudies(){
    if(!window.Chart) return;
    var c = palette();
    var pct = function(v){return (v>0?'+':'')+v.toFixed(2)+'%';};

    mountChart('bbContSplit', {
      type:'bar',
      data:{
        labels:['מוקדם 70%','מאוחר 30%'],
        datasets:[
          {label:'יום טריגר', data:[-1.78, 1.78], backgroundColor:c.blue, borderRadius:6, barPercentage:.7},
          {label:'בסיס החלון', data:[1.23, 0.62], backgroundColor:'rgba(144,168,194,.85)', borderRadius:6, barPercentage:.7}
        ]
      },
      options:(function(){var b=chartBase(); return Object.assign({}, b, {plugins:Object.assign({}, b.plugins, {tooltip:{callbacks:{label:function(t){return t.dataset.label+' '+pct(t.parsed.y);}}}})});})(),
      plugins:[barLabels(function(v){return pct(v);})]
    });

    var gaps = [-7.46,-4.98,-1.83,-10.06,-3.19,1.27,-0.06,-0.76,1.72,3.34];
    mountChart('bbContYearly', {
      type:'bar',
      data:{
        labels:['2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'],
        datasets:[{label:'פער ממוצע (pp)', data:gaps, backgroundColor:gaps.map(function(v){return v<0?c.blue:c.red;}), borderRadius:6}]
      },
      options:(function(){var b=chartBase(); return Object.assign({}, b, {
        plugins:Object.assign({}, b.plugins, {legend:{display:false}}),
        scales:{
          x:b.scales.x,
          y:{ticks:{color:c.text, callback:function(v){return v;}}, grid:{color:c.grid}}
        }
      });})()
    });

    var meanGap = [-0.79,-0.73,-1.27,-1.26,-1.84,-1.99,-1.61,-1.55,-1.57,-2.49,-2.38,-2.64,-2.36,-2.68,-2.42,-2.98,-3.12,-3.23,-3.67,-3.07];
    var medGap = [-0.20,-0.39,-0.90,0.05,-1.25,-1.48,-0.36,-0.52,-0.94,-0.60,-0.54,-0.49,-0.18,-0.53,-0.51,-0.77,0.27,-0.42,-1.32,-1.44];
    var pctile = [2.2,11.0,3.5,7.6,2.4,3.3,10.7,14.9,17.5,5.1,7.5,6.1,11.9,9.8,14.9,9.3,9.0,9.0,6.2,13.8];
    var hz = [];
    for(var h=1;h<=20;h++) hz.push(String(h));
    mountChart('bbContHorizons', {
      data:{
        labels:hz,
        datasets:[
          {type:'line', label:'פער ממוצע', data:meanGap, borderColor:c.blue, backgroundColor:c.blue, pointRadius:hz.map(function(x){return x==='7'?5:2;}), tension:.15, yAxisID:'y'},
          {type:'line', label:'פער חציון', data:medGap, borderColor:'#9aa8bc', backgroundColor:'#9aa8bc', pointRadius:2, tension:.15, yAxisID:'y'},
          {type:'line', label:'אחוזון', data:pctile, borderColor:c.red, backgroundColor:c.red, pointRadius:hz.map(function(x){return x==='7'?5:2;}), tension:.15, yAxisID:'y1'}
        ]
      },
      options:{
        animation:false,
        responsive:true,
        maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#edf6ff', boxWidth:12, font:{size:11}}}},
        scales:{
          x:{ticks:{color:c.text, maxRotation:0, autoSkip:true}, grid:{display:false}},
          y:{position:'left', ticks:{color:c.text}, grid:{color:c.grid}},
          y1:{position:'right', min:0, max:100, ticks:{color:c.red}, grid:{display:false}}
        }
      }
    });

    mountChart('bbContCosts', {
      type:'line',
      data:{
        labels:['0','0.17','0.27','0.57'],
        datasets:[
          {label:'ממוצע שורט', data:[0.57,0.40,0.30,0.00], borderColor:c.blue, backgroundColor:c.blue, pointRadius:5, tension:0},
          {label:'שורט בכל יום', data:[-1.04,-1.04,-1.04,-1.04], borderColor:'#9aa8bc', borderDash:[5,4], pointRadius:0, borderWidth:1.5}
        ]
      },
      options:(function(){var b=chartBase(); return Object.assign({}, b, {
        plugins:Object.assign({}, b.plugins, {tooltip:{callbacks:{label:function(t){return t.dataset.label+' '+pct(t.parsed.y);}}}}),
        scales:{
          x:{title:{display:true, text:'עלות + מימון (pp)', color:c.text}, ticks:{color:c.text}, grid:{display:false}},
          y:{ticks:{color:c.text, callback:function(v){return v+'%';}}, grid:{color:c.grid}}
        }
      });})()
    });

    var means = [0.08,-0.57,1.04];
    mountChart('bbSynthMean', {
      type:'bar',
      data:{
        labels:['כל ימי הנגיעה','ימי טריגר','כל הימים'],
        datasets:[
          {label:'ממוצע', data:means, backgroundColor:[c.amber, c.red, c.blue], borderRadius:6, barPercentage:.62},
          {type:'line', label:'חציון', data:[0.48,0.11,0.48], borderColor:'#edf6ff', pointBackgroundColor:'#edf6ff', pointStyle:'rectRot', pointRadius:6, showLine:false}
        ]
      },
      options:(function(){var b=chartBase(); return Object.assign({}, b, {plugins:Object.assign({}, b.plugins, {tooltip:{callbacks:{label:function(t){return t.dataset.label+' '+pct(t.parsed.y);}}}})});})(),
      plugins:[barLabels(function(v){return pct(v);})]
    });

    mountChart('bbSynthHit', {
      type:'bar',
      data:{
        labels:['כל ימי הנגיעה','ימי טריגר','כל הימים'],
        datasets:[{label:'שיעור עליות', data:[52.3,50.0,52.8], backgroundColor:[c.amber, c.red, c.blue], borderRadius:6, barPercentage:.62}]
      },
      options:(function(){var b=chartBase(); return Object.assign({}, b, {
        plugins:Object.assign({}, b.plugins, {legend:{display:false}}),
        scales:{
          x:b.scales.x,
          y:{min:35, max:65, ticks:{color:c.text, callback:function(v){return v+'%';}}, grid:{color:c.grid}}
        }
      });})(),
      plugins:[barLabels(function(v){return v.toFixed(1)+'%';})]
    });

    mountChart('bbSynthSplit', {
      type:'bar',
      data:{
        labels:['עד ינואר 2024','מינואר 2024'],
        datasets:[
          {label:'יום טריגר', data:[-1.78,1.78], backgroundColor:c.blue, borderRadius:6, barPercentage:.7},
          {label:'בסיס', data:[1.23,0.62], backgroundColor:'rgba(144,168,194,.85)', borderRadius:6, barPercentage:.7}
        ]
      },
      options:chartBase(),
      plugins:[barLabels(function(v){return pct(v);})]
    });

    mountChart('bbSynthYearly', {
      type:'bar',
      data:{
        labels:['2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'],
        datasets:[
          {label:'יום טריגר', data:[1.63,-6.94,-0.12,-6.58,-2.05,-0.24,2.03,1.04,1.72,3.16], backgroundColor:c.blue, borderRadius:4, barPercentage:.8},
          {label:'בסיס', data:[9.09,-1.96,1.71,3.48,1.15,-1.51,2.09,1.80,0,-0.18], backgroundColor:'rgba(144,168,194,.85)', borderRadius:4, barPercentage:.8}
        ]
      },
      options:chartBase()
    });
  }

  function load(){
    if(state.loading||state.ready) return;
    state.loading = true;
    recordSources();
    bindTrades();
    drawForward();
    drawStudies();
    Promise.all([
      fetch(ASSET+'trades-10d.json').then(function(r){return r.json();}),
      fetch(ASSET+'daily.json').then(function(r){return r.json();})
    ]).then(function(pair){
      state.trades = pair[0];
      state.daily = pair[1];
      renderTrades();
      drawPrice();
      state.ready = true;
      state.loading = false;
    }).catch(function(){
      state.loading = false;
      var body = document.getElementById('bbTradesBody');
      if(body) body.innerHTML = '<tr><td colspan="10">הטבלה לא נטענה</td></tr>';
    });
  }

  function open(){
    recordSources();
    var page = document.getElementById('page-btc-bb-research');
    if(!page || !page.classList.contains('active')) return;
    if(state.ready){
      if(state.chart) state.chart.resize();
      if(state.ft) state.ft.resize();
      state.extra.forEach(function(ch){ch.resize();});
      return;
    }
    load();
  }

  window.BtcBbResearch = {open:open};
})();
