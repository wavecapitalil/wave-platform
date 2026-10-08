// Calculation details are centralized on Sources & Methodology.
function calculationPeriod(d,key,fallback){
  var m=d.calculation_meta||{};
  if(key==='quick_ratio'||key==='current_ratio')return m.balance_date||fallback;
  if(key==='pb_ratio')return m.balance_date||fallback;
  if(key==='ps_ratio')return m.fiscal_year?'FY '+m.fiscal_year:fallback;
  if(key==='peg_historical')return m.fiscal_year?'FY '+m.fiscal_year+' · EPS YoY':null;
  if((m.custom_metrics||[]).indexOf(key)>=0){
    if(key==='pb_ratio')return m.balance_date||null;
    return m.fiscal_year?'FY '+m.fiscal_year:null;
  }
  return fallback;
}
function registerCalculationSources(d){
  if(!window.WaveSources||!d.calculation_meta)return;
  var m=d.calculation_meta,c=m.custom_metrics||[];
  var quick=c.indexOf('quick_ratio')>=0?'Owner-configured Quick Ratio.':'Quick Ratio = (cash + short-term investments + net accounts receivable) / current liabilities; financing receivables are excluded.';
  WaveSources.record('calculation-'+d.symbol,d.symbol+' · Financial calculations',
    quick+' Balance inputs come from the same SEC reporting date: '+(m.balance_date||'unavailable')+'. Missing inputs remain missing; absent tags are not treated as zero. '+
    'Historical PEG is separate from provider PEG: trailing P/E divided by positive annual diluted EPS growth in percentage points. FY: '+(m.fiscal_year||'unavailable')+'. '+
    'Calculation revision '+m.revision+'. Custom metrics: '+(c.join(', ')||'none')+'. '+
    'Custom annual margin, growth, ROE/ROA and P/S formulas use the fiscal year shown; default provider metrics retain their provider period. ROE/ROA defaults use year-end equity/assets, not averages. '+
    (m.sec_stale?'SEC cache fallback was used.':''));
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
  var target = document.getElementById('ownershipSection');
  try{
    var r = await fetch(API + '/api/holders?symbol=' + symbol);
    var d = await r.json();
    if(d.error) throw new Error(d.error);

    var el = document.getElementById('ownershipSection');
    if(!el || el !== target) return;

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
    if(el && el === target) el.innerHTML = '<span style="color:#475569;font-size:11px">Ownership data unavailable</span>';
  }
}

function renderStockDetail(d){
  registerCalculationSources(d);
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

  var html = buildOverviewHtml(d) + forwardPanel(d);
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px">';

  // Left column
  html += '<div>';
  html += section('Valuation', [
    kpiRow('P/E (Trailing)',  fmtNum(d.pe_trailing, 1),  'Price / trailing 12M earnings'),
    kpiRow('P/E (Forward)',   fmtNum(d.pe_forward, 1),   forwardNote(d)),
    kpiRow('PEG (Provider)', fmtNum(d.peg_ratio, 2), null),
    kpiRow('PEG Historical', fmtNum(d.peg_historical, 2), calculationPeriod(d,'peg_historical',null)),
    kpiRow('P/S Ratio',      fmtNum(d.ps_ratio, 2),     calculationPeriod(d,'ps_ratio','Price / revenue (TTM)')),
    kpiRow('P/B Ratio',      fmtNum(d.pb_ratio, 2),     calculationPeriod(d,'pb_ratio','Price / book value')),
    kpiRow('EV/EBITDA',      fmtNum(d.ev_ebitda, 1),    'Enterprise value / EBITDA'),
  ]);
  html += section('Earnings', [
    kpiRow('EPS (Trailing)',  d.eps_trailing != null ? '$' + fmtNum(d.eps_trailing) : '—', 'Last 12 months'),
    kpiRow('EPS (Forward)',   forwardEpsValue(d), forwardNote(d)),
    kpiRow('Revenue Growth',  fmtPct(d.revenue_growth),  calculationPeriod(d,'revenue_growth','YoY'),  kpiColor(d.revenue_growth, true)),
    kpiRow('Earnings Growth', fmtPct(d.earnings_growth), calculationPeriod(d,'earnings_growth','YoY'),  kpiColor(d.earnings_growth, true)),
  ]);
  html += '</div>';

  // Right column
  html += '<div>';
  html += section('Profitability', [
    kpiRow('Gross Margin',     fmtPct(d.gross_margin),     calculationPeriod(d,'gross_margin',null), d.gross_margin > 40 ? '#22c55e' : d.gross_margin > 20 ? '#f59e0b' : '#ef4444'),
    kpiRow('Operating Margin', fmtPct(d.operating_margin), calculationPeriod(d,'operating_margin',null), kpiColor(d.operating_margin, true)),
    kpiRow('Net Margin',       fmtPct(d.net_margin),       calculationPeriod(d,'net_margin',null), kpiColor(d.net_margin, true)),
    kpiRow('ROE',              fmtPct(d.roe),              calculationPeriod(d,'roe','Return on equity'), kpiColor(d.roe, true)),
    kpiRow('ROA',              fmtPct(d.roa),              calculationPeriod(d,'roa','Return on assets'), kpiColor(d.roa, true)),
  ]);
  html += section('Balance Sheet & Dividends', [
    kpiRow('Debt / Equity',   fmtNum(d.debt_to_equity, 2), null, d.debt_to_equity != null ? (d.debt_to_equity > 200 ? '#ef4444' : d.debt_to_equity > 100 ? '#f59e0b' : '#22c55e') : '#64748b'),
    kpiRow('Current Ratio',   fmtNum(d.current_ratio, 2),  calculationPeriod(d,'current_ratio',null), d.current_ratio != null ? (d.current_ratio > 1.5 ? '#22c55e' : d.current_ratio > 1 ? '#f59e0b' : '#ef4444') : '#64748b'),
    kpiRow('Quick Ratio',     fmtNum(d.quick_ratio, 2),    calculationPeriod(d,'quick_ratio',null)),
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
var _fcValueMode = 'absolute';
var _fcRequestId = 0;
var _fcLoading = false;
var _fcVisibleDates = [];
var _fcRenderMeta = null;
var FC_GROWTH_BASE = {revenue_growth:'revenue', op_income_growth:'operating_income', net_income_growth:'net_income'};

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
  if(_fcChart || _fcLoading) runFundChart();
}

function fcSetChartType(t, btn){
  _fcChartType = t;
  document.querySelectorAll('#fcTypeBtns .ratio-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  if(_fcChart && !_fcLoading) fcDrawChart(_fcVisibleDates);
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
  if(_fcChart || _fcLoading) runFundChart();
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
  return WaveFundamentalChart.formatValue(v, metric, _fcValueMode === 'growth' ? 'growth' : 'values');
}

function fcSetValueMode(mode, btn){
  _fcValueMode = mode === 'growth' ? 'growth' : 'absolute';
  document.querySelectorAll('#fcModeBtns button').forEach(function(b){
    var active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  if(_fcChart && !_fcLoading) fcDrawChart(_fcVisibleDates);
}

function fcInvalidateTicker(){
  // Invalidate before a new request: old data must never look like this ticker.
  ++_fcRequestId;
  _fcLoading = false;
  _fcFetched = [];
  _fcRenderMeta = null;
  if(_fcChart){ _fcChart.destroy(); _fcChart = null; }
  document.getElementById('fcChartWrap').style.display = 'none';
  document.getElementById('fcRangeWrap').style.display = 'none';
  document.getElementById('fcDownloadPng').disabled = true;
  document.getElementById('fcStatus').textContent = 'Press Chart to load this ticker.';
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
  var requestId = ++_fcRequestId;
  var t1 = document.getElementById('fcTicker1').value.trim().toUpperCase();
  var t2 = document.getElementById('fcTicker2').value.trim().toUpperCase();
  var metrics = _fcMetrics.slice(), period = _fcPeriod;
  var status = document.getElementById('fcStatus');
  if(_fcChart){ _fcChart.destroy(); _fcChart = null; }
  _fcFetched = [];
  _fcLoading = false;
  _fcRenderMeta = null;
  document.getElementById('fcChartWrap').style.display = 'none';
  document.getElementById('fcRangeWrap').style.display = 'none';
  document.getElementById('fcDownloadPng').disabled = true;
  if(!t1){ status.textContent = 'Enter at least one ticker.'; return; }
  if(!/^[A-Z0-9.^-]{1,12}$/.test(t1) || (t2 && !/^[A-Z0-9.^-]{1,12}$/.test(t2))){ status.textContent = 'Enter a valid ticker.'; return; }
  if(!metrics.length){ status.textContent = 'Select at least one metric.'; return; }
  var tickers = t2 && t2 !== t1 ? [t1,t2] : [t1];
  _fcLoading = true;
  status.textContent = 'Loading ' + tickers.join(' & ') + '...';
  try{
    var requests = {};
    var fetched = await Promise.all(metrics.flatMap(function(metric){
      return tickers.map(async function(ticker){
        var baseMetric = FC_GROWTH_BASE[metric] || metric;
        var key = ticker + ':' + baseMetric;
        if(!requests[key]) requests[key] = fetch(API + '/api/fundamentals?symbol=' + encodeURIComponent(ticker) + '&metric=' + baseMetric + '&period=' + period)
          .then(async function(r){ var d = await r.json(); if(!r.ok || d.error) throw new Error(ticker + ': ' + (d.error || 'Data request failed')); return d; });
        var result = await requests[key];
        var data = result.data || [];
        if(FC_GROWTH_BASE[metric]){
          data = WaveFundamentalChart.buildSeries(data, {metric:baseMetric,period:period,mode:'growth'}).map(function(p){
            return {date:p.date || p.key, key:p.key, value:p.value, status:p.status, reason:p.reason,
              fiscalYear:p.fiscalYear, fiscalQuarter:p.fiscalQuarter};
          });
        }
        return {metric:metric,ticker:ticker,result:Object.assign({},result,{data:data})};
      });
    }));
    if(requestId !== _fcRequestId) return;
    _fcLoading = false;
    _fcFetched = fetched;
    _fcTickers = tickers;
    var dateSet = new Set();
    fetched.forEach(function(f){
      WaveFundamentalChart.buildSeries(f.result.data,{metric:f.metric,period:period,mode:'values'}).forEach(function(p){ dateSet.add(p.key); });
    });
    _fcAllDates = Array.from(dateSet).sort();
    if(!_fcAllDates.length) throw new Error('No reported periods are available.');
    document.getElementById('fcChartWrap').style.display = 'block';
    fcInitRangeSlider(_fcAllDates);
    fcDrawChart(_fcAllDates);
    status.textContent = '';
  }catch(e){
    if(requestId !== _fcRequestId) return;
    _fcLoading = false;
    _fcFetched = [];
    _fcRenderMeta = null;
    status.textContent = 'Error: ' + e.message;
  }
}

function fcPeriodKey(d){ return WaveFundamentalChart.periodKey(d, _fcPeriod); }
function fcDateLabel(d){ return String(d); }
function fcInitRangeSlider(dates){
  var n = dates.length - 1;
  var minEl = document.getElementById('fcRangeMin'), maxEl = document.getElementById('fcRangeMax');
  minEl.max = maxEl.max = Math.max(n,0);
  minEl.value = 0; maxEl.value = Math.max(n,0);
  document.getElementById('fcRangeWrap').style.display = n > 0 ? 'block' : 'none';
  fcUpdateRangeUI(0,Math.max(n,0),dates);
}
function fcRangeChange(){
  if(_fcLoading || !_fcFetched.length) return;
  var minEl=document.getElementById('fcRangeMin'), maxEl=document.getElementById('fcRangeMax');
  var lo=Number(minEl.value),hi=Number(maxEl.value);
  if(lo>hi){ var t=lo;lo=hi;hi=t;minEl.value=lo;maxEl.value=hi; }
  fcUpdateRangeUI(lo,hi,_fcAllDates);
  fcDrawChart(_fcAllDates.slice(lo,hi+1));
}
function fcUpdateRangeUI(lo,hi,dates){
  var n=dates.length-1;
  document.getElementById('fcRangeFill').style.left=(n>0?lo/n*100:0)+'%';
  document.getElementById('fcRangeFill').style.width=(n>0?(hi-lo)/n*100:100)+'%';
  document.getElementById('fcRangeLabel').textContent=(dates[lo]||'')+' → '+(dates[hi]||'');
}
function fcEscape(value){ return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function fcUnit(f){
  if(_fcValueMode==='growth') return 'YoY relative change (%)';
  if(FC_IS_MARGIN[f.metric] || FC_IS_GROWTH[f.metric]) return '%';
  var currency=f.result.currency || (f.result.meta && f.result.meta.currency);
  var unit=currency && /^[A-Z]{3}$/.test(currency) ? currency : 'Reported currency'+(_fcTickers.length>1?' ['+f.ticker+']':'');
  return unit + (f.metric==='eps_diluted' ? ' / share' : '');
}
function fcSeriesLabel(f){
  var label=f.ticker+' · '+FC_LABELS[f.metric];
  if(_fcValueMode==='growth'){
    label += f.metric==='capex' ? ' · Outflow magnitude YoY %' : ' · YoY relative change %';
  }else{ label += ' ('+fcUnit(f)+')'; }
  return label;
}
function fcDrawChart(dates){
  if(!_fcFetched.length || _fcLoading) return;
  _fcVisibleDates=dates.slice();
  var growth=_fcValueMode==='growth';
  var series=_fcFetched.map(function(f){
    var points=WaveFundamentalChart.buildSeries(f.result.data,{metric:f.metric,period:_fcPeriod,mode:growth?'growth':'values'});
    var byKey={};points.forEach(function(p){byKey[p.key]=p;});
    var mi=_fcMetrics.indexOf(f.metric),ti=_fcTickers.indexOf(f.ticker);
    var color=_fcTickers.length>1?FC_TICKER_COLORS[ti][mi%FC_TICKER_COLORS[ti].length]:FC_COLORS[mi%FC_COLORS.length];
    return {f:f,byKey:byKey,points:dates.map(function(d){return byKey[d]||{value:null,reason:'No reported value for this period.'};}),color:color,label:fcSeriesLabel(f),unit:fcUnit(f)};
  });
  var units=[];series.forEach(function(s){if(units.indexOf(s.unit)<0)units.push(s.unit);});
  // Percentage rates and mixed-unit quantities are never added into a stack.
  var stacked=_fcChartType==='stacked' && !growth && units.length===1 && units[0]!=='%' && !units[0].includes('/ share');
  var line=_fcChartType==='line';
  var scales={x:{stacked:stacked,grid:{color:'rgba(255,255,255,0.06)'},ticks:{color:'#94a3b8',font:{size:11}}}};
  units.forEach(function(unit,i){
    var member=series.find(function(s){return s.unit===unit;});
    scales['y'+(i||'')]={type:'linear',position:i===0?'left':'right',stacked:stacked,beginAtZero:!line,
      title:{display:true,text:unit,color:'#cbd5e1',font:{size:11}},
      grid:{color:'rgba(255,255,255,0.08)',drawOnChartArea:i===0},
      ticks:{color:'#94a3b8',font:{size:11},callback:function(v){return fcFmt(v,member.f.metric);}}};
  });
  var datasets=series.map(function(s){
    return {label:s.label,data:s.points.map(function(p){return p.value;}),backgroundColor:s.color.bg,borderColor:s.color.line,
      type:line?'line':'bar',borderWidth:line?2:0,borderRadius:line?0:3,tension:0.2,pointRadius:line?3:0,
      fill:false,spanGaps:false,yAxisID:'y'+(units.indexOf(s.unit)||''),stack:stacked?s.f.ticker:undefined};
  });
  if(_fcChart)_fcChart.destroy();
  _fcChart=new Chart(document.getElementById('fcCanvas').getContext('2d'),{
    type:line?'line':'bar',data:{labels:dates,datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:Math.max(2,window.devicePixelRatio||1),
      interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f172a',titleColor:'#e2e8f0',bodyColor:'#e2e8f0',callbacks:{
        label:function(c){return c.dataset.label+': '+fcFmt(c.raw,series[c.datasetIndex].f.metric);},
        afterLabel:function(c){var p=series[c.datasetIndex].points[c.dataIndex];return growth && p.priorDate ? 'Compared with '+p.priorDate : '';}
      }}},scales:scales}
  });
  var title=_fcTickers.join(' vs ')+' · '+(_fcPeriod==='annual'?'Annual':'Quarterly')+' · '+(growth?'YoY change %':'Values');
  document.getElementById('fcChartTitle').textContent=title;
  document.getElementById('fcLegend').innerHTML=series.map(function(s){return '<div class="fc-legend-item"><i style="background:'+s.color.line+'"></i><span>'+fcEscape(s.label)+'</span></div>';}).join('');
  var unavailable=series.reduce(function(n,s){return n+s.points.filter(function(p){return p.value==null;}).length;},0);
  var summary=unavailable ? unavailable+' unavailable value'+(unavailable===1?'':'s')+'; reasons appear in the data table.' : '';
  if(_fcChartType==='stacked'&&!stacked)summary+=' Grouped bars: these units or percentage rates cannot be added.';
  document.getElementById('fcDataStatus').textContent=summary;
  document.getElementById('fcTable').innerHTML='<table class="fc-data-table"><thead><tr><th>Reporting period</th>'+series.map(function(s){return '<th style="color:'+s.color.line+'">'+fcEscape(s.label)+'</th>';}).join('')+'</tr></thead><tbody>'+dates.slice().reverse().map(function(d){return '<tr><td>'+fcEscape(d)+'</td>'+series.map(function(s){var p=s.byKey[d]||{value:null,reason:'No reported value for this period.'};return '<td>'+ (p.value==null?'<span class="fc-unavailable">N/A</span><small>'+fcEscape(p.reason||'Value unavailable.')+'</small>':fcFmt(p.value,s.f.metric))+(growth&&p.priorDate?'<small>'+fcEscape(p.date)+' vs '+fcEscape(p.priorDate)+'</small>':'')+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
  var sources=Array.from(new Set(_fcFetched.map(function(f){return f.result.meta&&f.result.meta.source||f.result.source;}).filter(Boolean)));
  var timestamps=Array.from(new Set(_fcFetched.map(function(f){return f.result.meta&&(f.result.meta.provider_fetched_at||f.result.meta.fetched_at)||f.result.as_of;}).filter(Boolean)));
  _fcRenderMeta={title:title,tickers:_fcTickers.slice(),metrics:_fcMetrics.slice(),period:_fcPeriod,mode:_fcValueMode,chartType:stacked?'stacked':(line?'line':'bar'),range:dates[0]+' to '+dates[dates.length-1],
    legend:series.map(function(s){return {label:s.label,color:s.color.line};}),sources:sources,asOf:timestamps,unavailable:unavailable};
  document.getElementById('fcDownloadPng').disabled=false;
  if(window.WaveSources)WaveSources.record('fundamental-chart','Fundamental Charts',
    'YoY relative change = (current / prior - 1) × 100. Prior periods are matched by fiscal year/quarter only when provided; otherwise a unique reporting end 350–380 days earlier is required. X-axis labels without fiscal metadata refer to reporting-end calendar years/quarters. Missing, zero or negative comparison bases are N/A; negative profit bases distinguish loss reduction and loss-to-profit. CapEx compares cash-outflow magnitude. Percentage-valued metrics use relative percent change, not percentage points. Growth metric pills are derived from their underlying reported series using the same matching rules. The full loaded history provides comparison bases, including periods outside the visible range. Currency is displayed only when supplied by the data provider; otherwise the unit is reported currency. '+sources.join('; ')+' '+timestamps.join('; '),[]);
}
async function fcDownloadPng(){
  if(!_fcChart||!_fcRenderMeta||_fcLoading)return;
  var button=document.getElementById('fcDownloadPng');
  var chart=_fcChart,meta=_fcRenderMeta;
  button.disabled=true;
  try{await WaveChartExport.download(chart,meta);}
  catch(e){document.getElementById('fcStatus').textContent='PNG download failed: '+e.message;}
  finally{button.disabled=!_fcChart||!_fcRenderMeta||_fcLoading;}
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
var _researchRequest = 0;
function runResearch(){
  var sym = document.getElementById('researchInput').value.trim().toUpperCase();
  if(!sym) return;
  researchTicker(sym);
}

function researchTicker(sym){
  sym = String(sym || '').trim().toUpperCase();
  var requestId = ++_researchRequest;
  if(window.WavePriceHistory) WavePriceHistory.load(sym);
  document.getElementById('researchInput').value = sym;
  document.getElementById('researchStatus').textContent = 'Loading ' + sym + '...';
  document.getElementById('researchResult').style.display = 'none';
  document.getElementById('researchDetails').style.display = 'none';
  document.getElementById('resKpiContent').innerHTML    = '';
  document.getElementById('resInsiderSection').innerHTML = '';
  document.getElementById('resAnalystSection').innerHTML = '';
  document.getElementById('resPeersSection').innerHTML  = '';
  fetch(API + '/api/stock-info?symbol=' + encodeURIComponent(sym))
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(requestId !== _researchRequest) return;
      if(d.error) throw new Error(d.error);
      renderResearchResult(d);
    })
    .catch(function(e){
      if(requestId !== _researchRequest) return;
      document.getElementById('researchStatus').textContent = 'Error: ' + e.message;
    });
}

function renderResearchResult(d){
  registerCalculationSources(d);
  document.getElementById('researchResult').style.display = 'block';
  document.getElementById('researchDetails').style.display = 'block';
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

  var html = buildOverviewHtml(d) + forwardPanel(d);
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px">';
  html += '<div>';
  html += section('Valuation', [
    kpiRow('P/E (Trailing)',  fmtNum(d.pe_trailing, 1),  'Price / trailing 12M earnings'),
    kpiRow('P/E (Forward)',   fmtNum(d.pe_forward, 1),   forwardNote(d)),
    kpiRow('PEG (Provider)', fmtNum(d.peg_ratio, 2), null),
    kpiRow('PEG Historical', fmtNum(d.peg_historical, 2), calculationPeriod(d,'peg_historical',null)),
    kpiRow('P/S Ratio',      fmtNum(d.ps_ratio, 2),     calculationPeriod(d,'ps_ratio','Price / revenue (TTM)')),
    kpiRow('P/B Ratio',      fmtNum(d.pb_ratio, 2),     calculationPeriod(d,'pb_ratio','Price / book value')),
    kpiRow('EV/EBITDA',      fmtNum(d.ev_ebitda, 1),    'Enterprise value / EBITDA'),
  ]);
  html += section('Earnings', [
    kpiRow('EPS (Trailing)',  d.eps_trailing != null ? '$' + fmtNum(d.eps_trailing) : '—', 'Last 12 months'),
    kpiRow('EPS (Forward)',   forwardEpsValue(d), forwardNote(d)),
    kpiRow('Revenue Growth',  fmtPct(d.revenue_growth),  calculationPeriod(d,'revenue_growth','YoY'), kpiColor(d.revenue_growth, true)),
    kpiRow('Earnings Growth', fmtPct(d.earnings_growth), calculationPeriod(d,'earnings_growth','YoY'), kpiColor(d.earnings_growth, true)),
  ]);
  html += '</div>';
  html += '<div>';
  html += section('Profitability', [
    kpiRow('Gross Margin',     fmtPct(d.gross_margin),     calculationPeriod(d,'gross_margin',null), d.gross_margin > 40 ? '#22c55e' : d.gross_margin > 20 ? '#f59e0b' : '#ef4444'),
    kpiRow('Operating Margin', fmtPct(d.operating_margin), calculationPeriod(d,'operating_margin',null), kpiColor(d.operating_margin, true)),
    kpiRow('Net Margin',       fmtPct(d.net_margin),       calculationPeriod(d,'net_margin',null), kpiColor(d.net_margin, true)),
    kpiRow('ROE',              fmtPct(d.roe),              calculationPeriod(d,'roe','Return on equity'), kpiColor(d.roe, true)),
    kpiRow('ROA',              fmtPct(d.roa),              calculationPeriod(d,'roa','Return on assets'), kpiColor(d.roa, true)),
  ]);
  html += section('Balance Sheet & Dividends', [
    kpiRow('Debt / Equity',  fmtNum(d.debt_to_equity, 2), null, d.debt_to_equity != null ? (d.debt_to_equity > 200 ? '#ef4444' : d.debt_to_equity > 100 ? '#f59e0b' : '#22c55e') : '#64748b'),
    kpiRow('Current Ratio',  fmtNum(d.current_ratio, 2),  calculationPeriod(d,'current_ratio',null), d.current_ratio != null ? (d.current_ratio > 1.5 ? '#22c55e' : d.current_ratio > 1 ? '#f59e0b' : '#ef4444') : '#64748b'),
    kpiRow('Quick Ratio',    fmtNum(d.quick_ratio, 2),    calculationPeriod(d,'quick_ratio',null)),
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
  var researchRequest = _researchRequest;
  var el = document.getElementById('resAnalystSection');
  if(!el) return;
  el.innerHTML = '';
  fetch(API + '/api/analyst-estimates?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(researchRequest !== _researchRequest) return;
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
  var researchRequest = _researchRequest;
  var el = document.getElementById('resPeersSection');
  if(!el) return;
  el.innerHTML = '<div style="color:#334155;font-size:12px;padding:16px 0">Loading peer comparison...</div>';
  fetch(API + '/api/peers?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(researchRequest !== _researchRequest) return;
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
    .catch(function(){ if(researchRequest === _researchRequest) el.innerHTML = ''; });
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
  var researchRequest = _researchRequest;
  var el = document.getElementById('resInsiderSection');
  if(!el) return;
  el.innerHTML = '';
  fetch(API + '/api/insider-activity?symbol=' + sym)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(researchRequest !== _researchRequest) return;
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



