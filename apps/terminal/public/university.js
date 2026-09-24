(function(){
  'use strict';
  var courses=[
    {id:'macro_regimes',tag:'Macro',title:'Macro & Market Regimes',desc:'Rates, liquidity, inflation, growth, credit, dollar and cross-asset regime classification.',href:'terminal_app.html'},
    {id:'equity_research',tag:'Equities',title:'Equity Research',desc:'Business quality, unit economics, valuation, catalysts, earnings and thesis falsification.',href:'terminal_app.html'},
    {id:'crypto_stack',tag:'Crypto',title:'Crypto Stack & Token Economics',desc:'Networks, applications, value capture, tokenomics, on-chain adoption and protocol economics.',href:'terminal_app.html'},
    {id:'quant_process',tag:'Quant',title:'Quant Research Process',desc:'Data quality, leakage control, backtesting, walk-forward validation, robustness and portfolio integration.',href:'products.html'},
    {id:'risk_management',tag:'Risk',title:'Risk Management',desc:'Sizing, drawdown control, portfolio concentration, regime shifts and risk-budget discipline.',href:'terminal_app.html'},
    {id:'commodities',tag:'Commodities',title:'Commodities & Metals',desc:'Supply-demand mechanics, inventories, curves, positioning, seasonality and macro transmission.',href:'terminal_app.html'}
  ];
  function initials(name){return String(name||'W').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase()||'W';}
  function render(state){
    var ps=courses.map(function(c){return Number(state.progress[c.id]||0);});
    document.getElementById('uniAvg').textContent=Math.round(ps.reduce(function(a,b){return a+b;},0)/ps.length)+'%';
    document.getElementById('uniCompleted').textContent=ps.filter(function(x){return x>=100;}).length;
    document.getElementById('uniName').textContent=state.profile.displayName||'WAVE Member';
    document.getElementById('uniAvatar').textContent=initials(state.profile.displayName);
    document.getElementById('courseGrid').innerHTML=courses.map(function(c){
      var p=Number(state.progress[c.id]||0),cta=p>=100?'Review track':p>0?'Continue track':'Start track';
      return '<article class="wp-course"><div class="wp-course-tag">'+c.tag+'</div><h3>'+c.title+'</h3><p>'+c.desc+'</p><div class="wp-progress"><span style="width:'+p+'%"></span></div><div class="wp-course-foot"><span class="wp-course-pct">'+p+'% complete</span><div style="display:flex;gap:7px"><a class="wp-btn ghost" href="'+c.href+'">'+cta+'</a><button class="wp-btn" data-advance="'+c.id+'">+20%</button></div></div></article>';
    }).join('');
    document.querySelectorAll('[data-advance]').forEach(function(btn){btn.onclick=function(){WavePlatform.advanceCourse(btn.dataset.advance,20);};});
  }
  WavePlatform.subscribe(render);render(WavePlatform.getState());
})();