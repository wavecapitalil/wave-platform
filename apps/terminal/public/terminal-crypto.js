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

