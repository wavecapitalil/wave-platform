(function(){
  'use strict';
  var terminal=[
    ['welcome','Terminal Home','Overview & morning intelligence'],
    ['mover',"What's Moving",'Catalyst deep-dive'],
    ['brief','Morning Brief','Daily briefing'],
    ['risk','Risk Meter','Cross-asset regime risk'],
    ['macro','Macro Scanner','Macro dashboard'],
    ['fx','FX Monitor','Currencies'],
    ['rates','Rates Monitor','Rates & yield curve'],
    ['commodities','Gold / Silver Ratio','Metals context'],
    ['hormuz','Hormuz Risk','Energy & geopolitical risk'],
    ['crypto','Crypto Dashboard','Crypto market intelligence'],
    ['scanner','Crypto Scanner','Token screening'],
    ['sectors','Sector Strength','Equity sectors'],
    ['breadth','Market Breadth','SPY vs RSP breadth'],
    ['research','Equity Research','Company research workspace'],
    ['institutions','Institutions','Institutional activity'],
    ['comm-flows','Cross-Asset Flows','Futures, options and crypto flows'],
    ['confluence','Confluence Monitor','Multi-factor evidence'],
    ['earnings','Earnings','Earnings calendar & analysis'],
    ['correlation','Correlation','Cross-asset relationships'],
    ['btcgold','BTC / Gold','Risk appetite ratio'],
    ['housing','Housing Risk','Housing regime gauge'],
    ['seasonality','Seasonality','Historical path context']
  ];
  var courses=[
    ['Macro & Market Regimes','Rates, liquidity, inflation, growth and credit'],
    ['Equity Research','Business quality, valuation and catalysts'],
    ['Crypto Stack & Token Economics','Networks, value capture and tokenomics'],
    ['Quant Research Process','Backtesting, validation and robustness'],
    ['Risk Management','Sizing, drawdown and portfolio risk'],
    ['Commodities & Metals','Supply, inventories, curves and positioning']
  ];
  var overlay,input,results,entries=[],active=0;

  function addStyle(){
    if(document.getElementById('waveSearchStyle'))return;
    var s=document.createElement('style');s.id='waveSearchStyle';
    s.textContent='.wave-search-launch{border:1px solid rgba(85,170,255,.22);background:rgba(85,170,255,.06);color:#90a8c2;border-radius:9px;padding:7px 10px;font:600 10px Inter,-apple-system,sans-serif;cursor:pointer;white-space:nowrap}.wave-search-launch:hover{color:#edf6ff;border-color:rgba(85,170,255,.5)}#waveSearchOverlay{position:fixed;inset:0;z-index:9999;background:rgba(2,8,14,.76);backdrop-filter:blur(12px);display:none;align-items:flex-start;justify-content:center;padding:11vh 18px 30px}#waveSearchOverlay.open{display:flex}.wave-search-panel{width:min(700px,100%);background:#081624;border:1px solid #244e73;border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.55);overflow:hidden}.wave-search-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #173752}.wave-search-icon{color:#55aaff;font-size:18px}.wave-search-input{flex:1;background:transparent;border:0;outline:0;color:#edf6ff;font:600 15px Inter,-apple-system,sans-serif}.wave-search-input::placeholder{color:#647d98}.wave-search-kbd{font:600 9px Inter;color:#647d98;border:1px solid #173752;border-radius:6px;padding:4px 6px}.wave-search-results{max-height:56vh;overflow:auto;padding:8px}.wave-search-row{display:flex;justify-content:space-between;gap:14px;padding:11px 12px;border-radius:11px;cursor:pointer}.wave-search-row.active,.wave-search-row:hover{background:rgba(85,170,255,.09)}.wave-search-title{font:700 12px Inter;color:#edf6ff}.wave-search-sub{font:500 9px Inter;color:#7891ab;margin-top:4px}.wave-search-type{font:800 8px Inter;color:#55aaff;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;margin-top:2px}.wave-search-empty{padding:28px;text-align:center;color:#7891ab;font:500 11px Inter}';
    document.head.appendChild(s);
  }
  function buildEntries(){
    entries=[];
    terminal.forEach(function(x){entries.push({type:'Terminal',title:x[1],sub:x[2],slug:x[0]});});
    courses.forEach(function(x){entries.push({type:'University',title:x[0],sub:x[1],href:'university.html'});});
    [
      ['Account','Account Workspace','Watchlists, saved research and alerts','account.html'],
      ['Research','Research Library','WAVE articles and theses','blog.html'],
      ['Products','Products','Indicators, tools and research products','products.html']
    ].forEach(function(x){entries.push({type:x[0],title:x[1],sub:x[2],href:x[3]});});
    if(window.WavePlatform){
      var st=WavePlatform.getState();
      (st.watchlist||[]).forEach(function(sym){entries.push({type:'Watchlist',title:sym,sub:'Open catalyst research',slug:'mover',symbol:sym});});
      (st.saved||[]).forEach(function(x){entries.push({type:'Saved',title:x.title||x.id,sub:x.type||'Saved research',href:x.href||'account.html'});});
    }
    document.querySelectorAll('.card[href], .news-sec-card').forEach(function(el){
      var title=(el.querySelector('.card-title,.news-sec-headline')||{}).textContent;
      if(title)entries.push({type:'On page',title:title.trim(),sub:'Current page result',href:el.getAttribute('href')||''});
    });
  }
  function ensure(){
    if(overlay)return;
    addStyle();
    overlay=document.createElement('div');overlay.id='waveSearchOverlay';
    overlay.innerHTML='<div class="wave-search-panel" role="dialog" aria-modal="true" aria-label="WAVE Search"><div class="wave-search-head"><span class="wave-search-icon">⌕</span><input id="waveSearchInput" class="wave-search-input" autocomplete="off" placeholder="Search Terminal, University, watchlist, saved research…"><span class="wave-search-kbd">ESC</span></div><div id="waveSearchResults" class="wave-search-results"></div></div>';
    document.body.appendChild(overlay);input=document.getElementById('waveSearchInput');results=document.getElementById('waveSearchResults');
    overlay.addEventListener('mousedown',function(e){if(e.target===overlay)close();});
    input.addEventListener('input',render);
    input.addEventListener('keydown',function(e){
      var rows=results.querySelectorAll('.wave-search-row');
      if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(active+1,rows.length-1);paint(rows);}
      else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(active-1,0);paint(rows);}
      else if(e.key==='Enter'&&rows[active]){e.preventDefault();rows[active].click();}
    });
  }
  function paint(rows){rows.forEach(function(r,i){r.classList.toggle('active',i===active);});if(rows[active])rows[active].scrollIntoView({block:'nearest'});}
  function filtered(){
    var q=(input.value||'').trim().toLowerCase();
    if(!q)return entries.slice(0,14);
    return entries.filter(function(x){return (x.title+' '+x.sub+' '+x.type).toLowerCase().indexOf(q)>=0;}).slice(0,20);
  }
  function render(){
    active=0;var data=filtered();
    if(!data.length){results.innerHTML='<div class="wave-search-empty">No matching WAVE tools or research.</div>';return;}
    results.innerHTML='';
    data.forEach(function(x,i){
      var row=document.createElement('div');row.className='wave-search-row'+(i===0?' active':'');
      var left=document.createElement('div'),title=document.createElement('div'),sub=document.createElement('div'),type=document.createElement('div');
      title.className='wave-search-title';title.textContent=x.title;sub.className='wave-search-sub';sub.textContent=x.sub||'';type.className='wave-search-type';type.textContent=x.type;
      left.appendChild(title);left.appendChild(sub);row.appendChild(left);row.appendChild(type);
      row.onclick=function(){go(x);};results.appendChild(row);
    });
  }
  function go(x){
    close();
    if(x.slug){
      if(typeof window.navigate==='function'){
        navigate(x.slug);
        if(x.symbol&&x.slug==='mover'){var inp=document.getElementById('moverInput');if(inp){inp.value=x.symbol;setTimeout(function(){if(typeof loadMover==='function')loadMover();},60);}}
        history.replaceState(null,'','#page='+encodeURIComponent(x.slug)+(x.symbol?'&symbol='+encodeURIComponent(x.symbol):''));
      }else{
        location.href='terminal_app.html#page='+encodeURIComponent(x.slug)+(x.symbol?'&symbol='+encodeURIComponent(x.symbol):'');
      }
    }else if(x.href){location.href=x.href;}
  }
  function open(){
    ensure();buildEntries();input.value='';active=0;render();overlay.classList.add('open');setTimeout(function(){input.focus();},20);
  }
  function close(){if(overlay)overlay.classList.remove('open');}
  function addLauncher(){
    var host=document.querySelector('.top-nav-right')||document.querySelector('.wp-topbar')||document.querySelector('.nav');
    if(!host||host.querySelector('.wave-search-launch'))return;
    var b=document.createElement('button');b.className='wave-search-launch';b.type='button';b.textContent='Search ⌘K';b.onclick=open;
    if(host.classList.contains('wp-topbar')){var chip=host.querySelector('.wp-account-chip');host.insertBefore(b,chip||null);}else host.appendChild(b);
  }
  document.addEventListener('keydown',function(e){
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();overlay&&overlay.classList.contains('open')?close():open();}
    else if(e.key==='Escape')close();
  });
  window.WaveSearch={open:open,close:close,rebuild:buildEntries};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLauncher);else addLauncher();
})();