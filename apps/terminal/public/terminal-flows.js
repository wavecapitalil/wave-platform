// ── Cross-Asset Flows ──────────────────────────────────────
var _flowTab='crypto';

function flowFmt(v,d){
  if(v===null||v===undefined||Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString(undefined,{maximumFractionDigits:d===undefined?2:d});
}
function flowPct(v){ return v===null||v===undefined?'—':flowFmt(v,2)+'%'; }

function flowSetTab(tab,btn){
  _flowTab=tab;
  document.querySelectorAll('#page-comm-flows .cd-vbtn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  flowRenderControls();
  flowLoad();
}

function loadCommFlows(){
  var btn=document.getElementById('flowTabCrypto');
  flowSetTab(_flowTab||'crypto',btn);
}

function flowRenderControls(){
  var el=document.getElementById('flowControls');
  if(!el) return;
  if(_flowTab==='crypto'){
    el.innerHTML='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      +'<label style="font-size:10px;color:#90a8c2">Pair</label><select id="flowCryptoPair"><option>BTCUSD</option><option>ETHUSD</option></select>'
      +'<label style="font-size:10px;color:#90a8c2">Period</label><select id="flowCryptoPeriod"><option value="1h">1H</option><option value="4h">4H</option><option value="1d">1D</option></select>'
      +'<button class="cd-vbtn" onclick="flowLoad()">Refresh</button></div>';
  } else if(_flowTab==='futures'){
    el.innerHTML='<div style="display:flex;gap:7px;flex-wrap:wrap">'
      +['gold','silver','oil','natgas','sp500','nasdaq','dow'].map(function(a){return '<button class="cd-vbtn flow-asset-btn" data-asset="'+a+'" onclick="flowSelectFuture(\''+a+'\',this)">'+a.toUpperCase()+'</button>';}).join('')
      +'</div>';
    var first=el.querySelector('.flow-asset-btn'); if(first) first.classList.add('active');
    el.dataset.asset='gold';
  } else if(_flowTab==='options'){
    el.innerHTML='<div style="display:flex;gap:10px;align-items:center"><input id="flowOptionSymbol" value="SPY" style="width:120px;text-transform:uppercase"><button class="cd-vbtn" onclick="flowLoad()">Load Options</button></div>';
  } else {
    el.innerHTML='<div style="display:flex;gap:10px;align-items:center"><input id="flowShortSymbol" value="AAPL" style="width:120px;text-transform:uppercase"><button class="cd-vbtn" onclick="flowLoad()">Load Short Interest</button></div>';
  }
}

function flowSelectFuture(asset,btn){
  var el=document.getElementById('flowControls'); if(el) el.dataset.asset=asset;
  document.querySelectorAll('.flow-asset-btn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  flowLoad();
}

function flowCard(label,value,sub){
  return '<div class="td-stat"><div class="td-stat-label">'+label+'</div><div class="td-stat-val" style="font-size:22px">'+value+'</div>'+(sub?'<div class="td-stat-sub">'+sub+'</div>':'')+'</div>';
}

async function flowLoad(){
  var content=document.getElementById('flowContent');
  var status=document.getElementById('flowStatus');
  if(!content) return;
  content.innerHTML='<div class="mini-section" style="padding:30px;text-align:center;color:#90a8c2">Loading…</div>';
  if(status) status.textContent='Loading '+_flowTab+' data…';
  try{
    if(_flowTab==='crypto'){
      var pair=(document.getElementById('flowCryptoPair')||{}).value||'BTCUSD';
      var period=(document.getElementById('flowCryptoPeriod')||{}).value||'1h';
      var d=await fetch(API+'/api/flows/crypto?pair='+encodeURIComponent(pair)+'&period='+period).then(function(r){return r.json();});
      if(d.error) throw new Error(d.error);
      var blocks=[
        ['Global Accounts',d.series&&d.series.global_accounts],
        ['Top Trader Accounts',d.series&&d.series.top_accounts],
        ['Top Trader Positions',d.series&&d.series.top_positions]
      ];
      content.innerHTML='<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">'
        +blocks.map(function(b){var row=b[1]&&b[1].length?b[1][b[1].length-1]:{};return '<div class="mini-section"><div class="ms-title">'+b[0]+'</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">'+flowCard('Long',flowPct(row.long_pct))+flowCard('Short',flowPct(row.short_pct))+'</div><div style="font-size:10px;color:#90a8c2;margin-top:10px">L/S ratio: '+flowFmt(row.long_short_ratio,3)+'</div></div>';}).join('')
        +'</div><div style="font-size:10px;color:#597895;margin-top:8px">Source: '+((d.meta&&d.meta.source)||d.venue||'Binance')+' · '+d.pair+' · '+d.period+'</div>';
    } else if(_flowTab==='futures'){
      var ctl=document.getElementById('flowControls'); var asset=(ctl&&ctl.dataset.asset)||'gold';
      var d=await fetch(API+'/api/flows/futures?asset='+asset).then(function(r){return r.json();});
      if(d.error) throw new Error(d.error);
      content.innerHTML='<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px">'
        +flowCard('Long Contracts',flowFmt(d.long_contracts,0))
        +flowCard('Short Contracts',flowFmt(d.short_contracts,0))
        +flowCard('Net Contracts',flowFmt(d.net_contracts,0))
        +flowCard('Open Interest',flowFmt(d.open_interest,0))
        +flowCard('Short Share',flowPct(d.short_share_of_group_pct),d.trader_group)
        +'</div><div class="mini-section" style="margin-top:10px"><div class="ms-title">'+(d.market||asset.toUpperCase())+'</div><div style="font-size:11px;color:#90a8c2;margin-top:8px">Report date: '+(d.report_date||'—')+' · CFTC weekly positioning; not a live flow measure.</div></div>';
    } else if(_flowTab==='options'){
      var sym=((document.getElementById('flowOptionSymbol')||{}).value||'SPY').trim().toUpperCase();
      var d=await fetch(API+'/api/flows/options?symbol='+encodeURIComponent(sym)).then(function(r){return r.json();});
      if(d.error) throw new Error(d.error);
      content.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">'
        +flowCard('Call Open Interest',flowFmt(d.call_open_interest,0))
        +flowCard('Put Open Interest',flowFmt(d.put_open_interest,0))
        +flowCard('Put/Call OI',flowFmt(d.put_call_oi_ratio,3))
        +flowCard('Put/Call Volume',flowFmt(d.put_call_volume_ratio,3))
        +'</div><div style="font-size:10px;color:#597895;margin-top:8px">'+d.symbol+' · nearest expiry '+(d.expiry||'—')+' · '+((d.meta&&d.meta.note)||'')+'</div>';
    } else {
      var sym=((document.getElementById('flowShortSymbol')||{}).value||'AAPL').trim().toUpperCase();
      var d=await fetch(API+'/api/flows/short-interest?symbol='+encodeURIComponent(sym)).then(function(r){return r.json();});
      if(d.error) throw new Error(d.error);
      content.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">'
        +flowCard('Short % Float',flowPct(d.short_float_pct))
        +flowCard('Short % Shares Out',flowPct(d.short_outstanding_pct))
        +flowCard('Shares Short',flowFmt(d.shares_short,0))
        +flowCard('MoM Change',flowPct(d.shares_short_change_pct))
        +'</div><div style="font-size:10px;color:#597895;margin-top:8px">'+d.symbol+' · '+((d.meta&&d.meta.note)||'')+'</div>';
    }
    if(status) status.textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    content.innerHTML='<div class="callout red">Could not load '+_flowTab+' data: '+e.message+'</div>';
    if(status) status.textContent='Data unavailable';
  }
}

