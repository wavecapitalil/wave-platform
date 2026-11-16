(function(){
  var state = {trades:null, daily:null, chart:null, ft:null, filter:'all', ready:false, loading:false, raf:0, focus:-1};
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
      'Eligible 7d sample is 415 touches / 88 episodes / 3340 baseline days. Four later touches had no t+7 in the frozen file (horizon H=1 uses 419).\n'+
      'Seed 42. 10,000 draws. No costs in the base case.\n'+
      'The delivered report prints two random-baseline percentile triples for the 7d horizon. Summary table: all-touches 8.6 / 73.3 / 63.2 and episodes 10.6 / 46.1 / 39.9. Horizon table H=7: 8.6 / 73.3 / 62.4 and 10.7 / 46.2 / 40.1. Both are shown as printed. They were not averaged.',
      [{title:'Binance Vision BTCUSDT 1d', url:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d'}]);
    WaveSources.record('btc-bb:oos','BTC BB research · PRE-SAMPLE HOLDOUT OOS',
      'Files: oos/btc_bb_oos_report_HE.html, oos/validation_report_OOS_HE.md, oos/oos_results.json, oos/charts_oos_hero.png.\n'+
      'Bitstamp public OHLC API v2, BTC/USD, step=86400. Pulled 2026-11-04 22:22 UTC (report: 2026-11-05 00:22 Asia/Jerusalem). 2191 rows, 2011-08-18 → 2017-08-16. Last entry with an exit: 2017-08-09.\n'+
      'E0 OOS: duplicates 0, missing 0, OHLC 0, zero-volume days 33, daily moves above 25%: 13. Nothing removed. Overlap check 2017-08-17 → 2018-12-31: level correlation 0.9994, return correlation 0.982, mean close gap 0.65%, max 9.9%.\n'+
      'Code sha256 recorded as byte-identical. Verdict on episodes: gap -1.69pp ≤ 0 → E4 BLOCKER, REJECT / confirm STOP.',
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
      'Coins and E0 ranges are the screen report table (all E0 PASS). Single Binance source. No IS/OOS embargo. Survivorship from choosing coins by current volume. PEPE OOS episodes: 10.',
      []);
    WaveSources.record('btc-bb:forward','BTC BB research · Forward test snapshot',
      'Snapshot date shown on the page: 16 Nov 2026.\n'+
      'Files: forward_test/last_report.json, forward_test/state.json, forward_test/events.csv, forward_test/daily_ft_series.csv, forward_test/e0_audit.json.\n'+
      'Run at 2026-11-16T05:45:03.128228+00:00. Last complete UTC bar 2026-11-15. Window start 2026-11-04. Seed 42. Standard: Wave Capital Backtest Research Standard v2.0.\n'+
      'E0 WARNING. Evidence NOT CHECKABLE. Accumulating verdict INCONCLUSIVE. Completed touches 4, completed episodes 0, pending touches 5, pending episodes 0, baseline completed days 5.\n'+
      'all_touch_mean -0.09190822279918645 (−9.19%). baseline_mean -0.10441615836177034 (−10.44%). episode_mean_gap null.\n'+
      'Completed ret_7d from the Hebrew run summary: -8.0602%, -6.0824%, -9.9283%, -12.6923%.\n'+
      'E0 issues inherited from the research freeze: partial day 2018-02-08, large move 2020-03-12 (-0.5026), single source data-api.binance.vision. Rows 3378, 2017-08-17 → 2026-11-15. New anomalies would be BLOCKER. Decision note: Completed touches=4 but completed episodes=0. Episode Addendum-2 rule not evaluable. Accumulating.',
      [{title:'Binance Vision BTCUSDT 1d', url:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d'}]);
    WaveSources.record('btc-bb:horizon10','BTC BB research · 10-day descriptive summary',
      'File: horizon_heatmap.csv. Rows used: sample all/ep where horizon_days=10, plus the base_* fields on those rows.\n'+
      'all: n_total 412, n_pos 210, x_of_n 210/412, hit_rate 0.5097087378640777, median 0.0008377288255548843, mean 0.0012901717011777928, rand_pct_mean 5.07.\n'+
      'ep: n_total 88, n_pos 45, x_of_n 45/88, hit_rate 0.5113636363636364, median 0.0008991433287443007, mean -0.009680701006155768, rand_pct_mean 5.11.\n'+
      'baseline: base_n 3337, base_hit 0.5397063230446509, base_median 0.0068557930008597, base_mean 0.015223044225750873.\n'+
      'Displayed at the same precision as the request (2 decimal percent, percentile as printed). Primary frozen horizon remains 7 days. 10 days is descriptive only.',
      []);
    WaveSources.record('btc-bb:trades10','BTC BB research · 10-day trades window',
      'Files: trades_10d_view.csv (419 touches, 2017-09-05 → 2026-11-02, 88 episodes) and daily_series_with_bands.csv (3366 daily rows, 2017-08-17 → 2026-11-03, no calendar gaps) for the close and lower-band lines.\n'+
      'Seven rows have an empty t+10 exit in the frozen file and are shown with a pending pill: 2026-10-25, 2026-10-26, 2026-10-27, 2026-10-29, 2026-10-30, 2026-10-31, 2026-11-02.\n'+
      'Prices and ret_10d are the CSV cells. Percents on screen are ret_10d × 100 at 2 decimals. The chart does not recompute bands or returns.',
      []);
  }

  function palette(){
    return {text:'#90a8c2', grid:'rgba(23,55,82,.9)', blue:'#55aaff', cyan:'#58d7e8', amber:'#ffc857', red:'#ff6f82', green:'#48d18a'};
  }

  function drawPrice(){
    var canvas = document.getElementById('bbPriceChart');
    if(!canvas || !window.Chart || !state.daily) return;
    var c = palette();
    var close = state.daily.close.map(Number);
    var lower = state.daily.lower.map(function(v){return v==null?null:Number(v);});
    state.n = close.length;
    if(state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type:'line',
      data:{
        datasets:[
          {label:'Close', data:close.map(function(y,i){return {x:i,y:y};}), borderColor:c.blue, borderWidth:1.4, pointRadius:0, tension:0},
          {label:'Lower band', data:lower.map(function(y,i){return {x:i,y:y};}), borderColor:c.cyan, borderWidth:1, pointRadius:0, borderDash:[4,3], spanGaps:false},
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
    state.chart.update('none');
  }

  function renderTrades(){
    var body = document.getElementById('bbTradesBody');
    if(!body) return;
    var html = state.trades.map(function(t, i){
      var pending = !t.ret_10d;
      return '<tr data-i="'+i+'" data-ep="'+(t.episode?'1':'0')+'">'
        +'<td>'+bdi(t.touch_date)+'</td>'
        +'<td>'+(t.episode?'<span class="bb-pill ep">Episode</span>':'—')+'</td>'
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

  function load(){
    if(state.loading||state.ready) return;
    state.loading = true;
    recordSources();
    bindTrades();
    drawForward();
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
      return;
    }
    load();
  }

  window.BtcBbResearch = {open:open};
})();
