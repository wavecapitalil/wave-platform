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

