(function(){
  'use strict';
  var KEY='wave.platform.v1';
  var listeners=[];
  var defaults={
    version:1,
    profile:{displayName:'WAVE Member',workspace:'Personal Research',authMode:'local_preview'},
    watchlist:['SPY','QQQ','BTC-USD','GLD'],
    saved:[],
    progress:{macro_regimes:25,equity_research:0,crypto_stack:0,quant_process:0,risk_management:0,commodities:0},
    alerts:[],
    preferences:{language:'en',compact:false}
  };
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function normalize(x){
    x=x&&typeof x==='object'?x:{};
    var d=clone(defaults);
    d.profile=Object.assign(d.profile,x.profile||{});
    d.watchlist=Array.isArray(x.watchlist)?x.watchlist.slice(0,30):d.watchlist;
    d.saved=Array.isArray(x.saved)?x.saved.slice(0,100):[];
    d.progress=Object.assign(d.progress,x.progress||{});
    d.alerts=Array.isArray(x.alerts)?x.alerts.slice(0,50):[];
    d.preferences=Object.assign(d.preferences,x.preferences||{});
    return d;
  }
  function load(){
    try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(e){return clone(defaults);}
  }
  var state=load();
  function persist(){
    localStorage.setItem(KEY,JSON.stringify(state));
    listeners.forEach(function(fn){try{fn(clone(state));}catch(e){}});
  }
  function cleanSymbol(v){return String(v||'').toUpperCase().trim().replace(/[^A-Z0-9.^=-]/g,'').slice(0,20);}
  function uid(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
  function toast(msg){
    var el=document.getElementById('waveToast');
    if(!el){el=document.createElement('div');el.id='waveToast';el.className='wp-toast';document.body.appendChild(el);}
    el.textContent=msg;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('show');},1800);
  }
  var api={
    getState:function(){return clone(state);},
    subscribe:function(fn){listeners.push(fn);return function(){listeners=listeners.filter(function(x){return x!==fn;});};},
    hydrateCloud:function(patch){
      patch=patch||{};
      if(patch.profile)state.profile=Object.assign({},state.profile,patch.profile,{authMode:'supabase'});
      if(Array.isArray(patch.watchlist))state.watchlist=patch.watchlist.slice(0,30);
      if(Array.isArray(patch.saved))state.saved=patch.saved.slice(0,100);
      if(patch.progress)state.progress=Object.assign({},state.progress,patch.progress);
      if(Array.isArray(patch.alerts))state.alerts=patch.alerts.slice(0,50);
      persist();
    },
    setAuthMode:function(mode){state.profile.authMode=mode||'local_preview';persist();},
    resetPreview:function(){state=clone(defaults);persist();toast('Preview workspace reset');},
    updateProfile:function(patch){state.profile=Object.assign({},state.profile,patch||{});persist();},
    addWatchlist:function(symbol){symbol=cleanSymbol(symbol);if(!symbol)return false;if(state.watchlist.indexOf(symbol)<0){state.watchlist.push(symbol);persist();toast(symbol+' added to watchlist');}return true;},
    removeWatchlist:function(symbol){state.watchlist=state.watchlist.filter(function(x){return x!==symbol;});persist();},
    saveItem:function(item){
      if(!item||!item.id)return;
      var idx=state.saved.findIndex(function(x){return x.id===item.id;});
      if(idx>=0) state.saved.splice(idx,1); else state.saved.unshift({id:String(item.id),title:String(item.title||item.id),type:String(item.type||'research'),href:String(item.href||''),savedAt:new Date().toISOString()});
      persist();
    },
    isSaved:function(id){return state.saved.some(function(x){return x.id===id;});},
    setProgress:function(courseId,pct){pct=Math.max(0,Math.min(100,Number(pct)||0));state.progress[courseId]=pct;persist();},
    advanceCourse:function(courseId,step){api.setProgress(courseId,(state.progress[courseId]||0)+(step||20));toast('Learning progress updated');},
    addAlert:function(symbol,condition){
      symbol=cleanSymbol(symbol);condition=String(condition||'').trim().slice(0,100);
      if(!symbol||!condition)return false;
      state.alerts.unshift({id:uid(),symbol:symbol,condition:condition,enabled:true,mode:'saved_rule',createdAt:new Date().toISOString()});persist();toast('Alert rule saved locally');return true;
    },
    toggleAlert:function(id){var a=state.alerts.find(function(x){return x.id===id;});if(a){a.enabled=!a.enabled;persist();}},
    removeAlert:function(id){state.alerts=state.alerts.filter(function(x){return x.id!==id;});persist();},
    toast:toast
  };
  window.WavePlatform=api;
})();