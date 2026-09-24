(function(){
  'use strict';
  var courses={
    macro_regimes:'Macro & Regimes',
    equity_research:'Equity Research',
    crypto_stack:'Crypto Stack',
    quant_process:'Quant Research Process',
    risk_management:'Risk Management',
    commodities:'Commodities'
  };
  function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function initials(name){return String(name||'W').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase()||'W';}
  function fmtPrice(d){
    if(!d||d.price==null)return '<span class="wp-muted">Unavailable</span>';
    var p=Number(d.price),pct=Number(d.pct||0),cls=pct>=0?'wp-positive':'wp-negative';
    return '<div class="wp-price">'+(p>=1000?'$'+p.toLocaleString('en-US',{maximumFractionDigits:0}):p.toLocaleString('en-US',{maximumFractionDigits:2}))+'<div class="'+cls+'" style="font-size:9px;margin-top:3px">'+(pct>=0?'+':'')+pct.toFixed(2)+'%</div></div>';
  }
  async function quote(symbol){
    try{var r=await fetch('/api/quote?symbol='+encodeURIComponent(symbol));if(!r.ok)return null;var d=await r.json();return d&&d.error?null:d;}catch(e){return null;}
  }
  async function renderWatchlist(state){
    var root=document.getElementById('watchList');
    if(!state.watchlist.length){root.innerHTML='<div class="wp-empty">No symbols yet.</div>';return;}
    root.innerHTML=state.watchlist.map(function(s){return '<div class="wp-row" data-symbol="'+esc(s)+'"><div class="wp-row-main"><div class="wp-row-title">'+esc(s)+'</div><div class="wp-row-meta">Loading live quote…</div></div><div class="wp-row-actions"><div class="wp-price">—</div><button class="wp-btn ghost" data-remove="'+esc(s)+'">Remove</button></div></div>';}).join('');
    root.querySelectorAll('[data-remove]').forEach(function(btn){btn.onclick=function(){WavePlatform.removeWatchlist(btn.dataset.remove);};});
    state.watchlist.forEach(async function(s){
      var d=await quote(s),row=root.querySelector('[data-symbol="'+CSS.escape(s)+'"]');if(!row)return;
      row.querySelector('.wp-row-meta').textContent=d&&d.source?'Source: '+d.source:'WAVE market data';
      row.querySelector('.wp-row-actions .wp-price').outerHTML=fmtPrice(d);
    });
  }
  function renderSaved(state){
    var root=document.getElementById('savedList');
    if(!state.saved.length){root.innerHTML='<div class="wp-empty">Nothing saved yet. The collection is ready for research and thesis bookmarks.</div>';return;}
    root.innerHTML=state.saved.map(function(x){return '<div class="wp-row"><div class="wp-row-main"><div class="wp-row-title">'+esc(x.title)+'</div><div class="wp-row-meta">'+esc(x.type)+' · '+new Date(x.savedAt).toLocaleDateString()+'</div></div><div class="wp-row-actions">'+(x.href?'<a class="wp-btn ghost" href="'+esc(x.href)+'">Open</a>':'')+'<button class="wp-btn ghost" data-unsave="'+esc(x.id)+'">Remove</button></div></div>';}).join('');
    root.querySelectorAll('[data-unsave]').forEach(function(btn){btn.onclick=function(){WavePlatform.saveItem({id:btn.dataset.unsave});};});
  }
  function renderProgress(state){
    var root=document.getElementById('progressList');
    root.innerHTML=Object.keys(courses).map(function(id){var p=state.progress[id]||0;return '<div class="wp-row"><div class="wp-row-main"><div class="wp-row-title">'+courses[id]+'</div><div class="wp-progress" style="margin-top:8px"><span style="width:'+p+'%"></span></div></div><div class="wp-price">'+p+'%</div></div>';}).join('');
  }
  function renderAlerts(state){
    var root=document.getElementById('alertList');
    if(!state.alerts.length){root.innerHTML='<div class="wp-empty">No rules saved. Add a condition above; cloud monitoring comes in the next infrastructure phase.</div>';return;}
    root.innerHTML=state.alerts.map(function(a){return '<div class="wp-row"><div class="wp-row-main"><div class="wp-row-title">'+esc(a.symbol)+' · '+esc(a.condition)+'</div><div class="wp-row-meta">'+(a.enabled?'Enabled rule':'Paused rule')+' · local storage only</div></div><div class="wp-row-actions"><button class="wp-btn ghost" data-toggle="'+a.id+'">'+(a.enabled?'Pause':'Enable')+'</button><button class="wp-btn ghost" data-delete="'+a.id+'">Remove</button></div></div>';}).join('');
    root.querySelectorAll('[data-toggle]').forEach(function(btn){btn.onclick=function(){WavePlatform.toggleAlert(btn.dataset.toggle);};});
    root.querySelectorAll('[data-delete]').forEach(function(btn){btn.onclick=function(){WavePlatform.removeAlert(btn.dataset.delete);};});
  }
  function render(state){
    document.getElementById('statWatch').textContent=state.watchlist.length;
    document.getElementById('statSaved').textContent=state.saved.length;
    var vals=Object.keys(courses).map(function(k){return Number(state.progress[k]||0);});
    document.getElementById('statProgress').textContent=Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length)+'%';
    document.getElementById('statAlerts').textContent=state.alerts.length;
    document.getElementById('displayName').value=state.profile.displayName||'';
    document.getElementById('workspaceName').value=state.profile.workspace||'';
    document.getElementById('accountChipName').textContent=state.profile.displayName||'WAVE Member';
    document.getElementById('accountAvatar').textContent=initials(state.profile.displayName);
    renderWatchlist(state);renderSaved(state);renderProgress(state);renderAlerts(state);
  }
  document.getElementById('watchForm').onsubmit=function(e){e.preventDefault();if(WavePlatform.addWatchlist(document.getElementById('watchSymbol').value))document.getElementById('watchSymbol').value='';};
  document.getElementById('profileForm').onsubmit=function(e){e.preventDefault();WavePlatform.updateProfile({displayName:document.getElementById('displayName').value.trim()||'WAVE Member',workspace:document.getElementById('workspaceName').value.trim()||'Personal Research'});WavePlatform.toast('Profile saved locally');};
  document.getElementById('alertForm').onsubmit=function(e){e.preventDefault();if(WavePlatform.addAlert(document.getElementById('alertSymbol').value,document.getElementById('alertCondition').value)){document.getElementById('alertSymbol').value='';document.getElementById('alertCondition').value='';}};
  document.getElementById('resetPreview').onclick=function(){if(confirm('Reset local WAVE preview data in this browser?'))WavePlatform.resetPreview();};
  WavePlatform.subscribe(render);render(WavePlatform.getState());
})();