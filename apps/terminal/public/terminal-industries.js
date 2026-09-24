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

