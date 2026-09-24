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

