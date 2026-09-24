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

