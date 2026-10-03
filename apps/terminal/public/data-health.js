(function(){
  'use strict';
  var API='https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data';
  var state={rows:[],summary:{},group:'',status:'',query:'',timer:null,auto:true};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function dt(v){if(!v)return '—';var d=new Date(v);return isNaN(d)?'—':d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function duration(sec){
    if(sec==null||!isFinite(sec))return '—';
    var neg=sec<0;sec=Math.abs(sec);
    var text=sec<60?Math.round(sec)+'s':sec<3600?Math.round(sec/60)+'m':sec<86400?(sec/3600).toFixed(sec<10800?1:0)+'h':(sec/86400).toFixed(sec<259200?1:0)+'d';
    return (neg?'−':'')+text;
  }
  function rowStatus(r){
    if(r.status==='error')return 'error';
    if(r.status==='partial')return 'partial';
    if(r.stale)return 'stale';
    if(r.fallback)return 'fallback';
    return 'ok';
  }
  function statusLabel(r){
    var s=rowStatus(r);return s==='ok'?'Healthy':s.charAt(0).toUpperCase()+s.slice(1);
  }
  function setText(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}

  async function load(){
    var btn=document.getElementById('refreshBtn');
    btn.disabled=true;btn.textContent='Refreshing…';
    try{
      var r=await fetch(API+'/api/data-health?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      var d=await r.json();
      state.rows=d.datasets||[];state.summary=d.summary||{};
      renderSummary(d);renderFilters();renderRows();
    }catch(e){
      var banner=document.getElementById('healthBanner');
      banner.className='dh-banner bad';
      setText('bannerTitle','Telemetry unavailable');
      setText('bannerSub',e.message||String(e));
    }finally{
      btn.disabled=false;btn.textContent='Refresh now';
    }
  }

  function renderSummary(d){
    var s=d.summary||{},rows=d.datasets||[];
    setText('statTotal',s.total||0);setText('statOk',s.ok||0);setText('statGroups',(s.groups||0)+' groups');
    setText('statStale',s.stale||0);setText('statIssues',(s.partial||0)+(s.error||0));setText('statFallback',s.fallback||0);
    var oldest=rows.reduce(function(m,x){return x.age_seconds!=null?Math.max(m,x.age_seconds):m;},0);
    setText('statOldest',duration(oldest));
    setText('generatedAt','Checked '+dt(d.generated_at));
    var banner=document.getElementById('healthBanner');
    var issues=(s.partial||0)+(s.error||0),stale=s.stale||0;
    if(issues){banner.className='dh-banner bad';setText('bannerTitle',issues+' dataset issue'+(issues===1?'':'s')+' need attention');setText('bannerSub',stale+' stale · '+(s.fallback||0)+' fallback · engine cadence '+(d.engine_cadence_minutes||15)+'m');}
    else if(stale){banner.className='dh-banner warn';setText('bannerTitle',stale+' stale dataset'+(stale===1?'':'s'));setText('bannerSub','No hard errors · '+(s.ok||0)+' healthy · engine cadence '+(d.engine_cadence_minutes||15)+'m');}
    else{banner.className='dh-banner healthy';setText('bannerTitle','All production datasets healthy');setText('bannerSub',(s.ok||0)+' / '+(s.total||0)+' OK · 0 stale · 0 errors · engine cadence '+(d.engine_cadence_minutes||15)+'m');}
  }

  function renderFilters(){
    var groups=Array.from(new Set(state.rows.map(function(x){return x.dataset_group;}))).sort();
    var sel=document.getElementById('groupFilter'),current=sel.value;
    sel.innerHTML='<option value="">All domains</option>'+groups.map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join('');
    sel.value=groups.indexOf(current)>=0?current:'';
    var strip=document.getElementById('groupStrip');
    var counts={};state.rows.forEach(function(r){counts[r.dataset_group]=(counts[r.dataset_group]||0)+1;});
    strip.innerHTML='<button class="dh-chip '+(!state.group?'active':'')+'" data-group="">All '+state.rows.length+'</button>'+
      groups.map(function(g){return '<button class="dh-chip '+(state.group===g?'active':'')+'" data-group="'+esc(g)+'">'+esc(g)+' '+counts[g]+'</button>';}).join('');
    strip.querySelectorAll('[data-group]').forEach(function(b){b.onclick=function(){state.group=b.dataset.group;sel.value=state.group;renderFilters();renderRows();};});
  }

  function filtered(){
    var q=state.query.toLowerCase();
    return state.rows.filter(function(r){
      if(state.group&&r.dataset_group!==state.group)return false;
      var s=rowStatus(r);
      if(state.status&&s!==state.status)return false;
      if(q){
        var hay=[r.dataset_key,r.dataset_group,r.source,r.logic_version,r.freshness].join(' ').toLowerCase();
        if(hay.indexOf(q)<0)return false;
      }
      return true;
    }).sort(function(a,b){
      var order={error:0,partial:1,stale:2,fallback:3,ok:4};
      var da=order[rowStatus(a)],db=order[rowStatus(b)];
      return da!==db?da-db:String(a.dataset_key).localeCompare(String(b.dataset_key));
    });
  }

  function renderRows(){
    var rows=filtered(),body=document.getElementById('healthRows');
    setText('resultCount',rows.length+' shown');
    if(!rows.length){body.innerHTML='<tr><td colspan="8" class="dh-empty">No datasets match these filters.</td></tr>';return;}
    body.innerHTML=rows.map(function(r,i){
      var s=rowStatus(r),exp=r.expires_in_seconds;
      var expClass=exp<0?'dh-expired':exp<900?'dh-soon':'';
      return '<tr data-key="'+esc(r.dataset_key)+'">'+
        '<td><span class="dh-status '+s+'">'+esc(statusLabel(r))+'</span></td>'+
        '<td><div class="dh-key" title="'+esc(r.dataset_key)+'">'+esc(r.dataset_key)+'</div></td>'+
        '<td><span class="dh-mono">'+esc(r.dataset_group)+'</span></td>'+
        '<td><div class="dh-source" title="'+esc(r.source)+'">'+esc(r.source||'—')+'</div></td>'+
        '<td class="dh-mono">'+duration(r.age_seconds)+'</td>'+
        '<td class="dh-mono '+expClass+'">'+(exp<0?'expired '+duration(exp):'in '+duration(exp))+'</td>'+
        '<td class="dh-mono">'+esc(r.freshness||'—')+'</td>'+
        '<td class="dh-mono">'+esc(r.logic_version||'—')+'</td>'+
      '</tr>';
    }).join('');
    body.querySelectorAll('tr[data-key]').forEach(function(tr){tr.onclick=function(){openDrawer(tr.dataset.key);};});
  }

  function detail(label,value,mono){
    return '<div class="dh-detail"><div class="dh-detail-label">'+esc(label)+'</div><div class="dh-detail-value '+(mono?'dh-mono':'')+'">'+esc(value==null?'—':value)+'</div></div>';
  }
  function openDrawer(key){
    var r=state.rows.find(function(x){return x.dataset_key===key;});if(!r)return;
    setText('drawerTitle',r.dataset_key);
    var html='';
    html+=detail('Status',statusLabel(r),false);
    html+=detail('Domain',r.dataset_group,true);
    html+=detail('Source',r.source,false);
    html+=detail('Source timestamp',dt(r.source_timestamp),true);
    html+=detail('Fetched at',dt(r.fetched_at),true);
    html+=detail('Calculated at',dt(r.calculated_at),true);
    html+=detail('Age',duration(r.age_seconds),true);
    html+=detail('Expires at',dt(r.expires_at),true);
    html+=detail('Expires in',r.expires_in_seconds<0?'expired '+duration(r.expires_in_seconds):duration(r.expires_in_seconds),true);
    html+=detail('Freshness contract',r.freshness,true);
    html+=detail('Logic version',r.logic_version,true);
    html+=detail('Fallback',r.fallback?'Yes':'No',false);
    html+=detail('Last DB update',dt(r.updated_at),true);
    html+='<button class="wp-btn ghost dh-copy" id="copyKey" type="button">Copy dataset key</button>';
    if(r.error)html+='<div class="dh-error-box">'+esc(r.error)+'</div>';
    document.getElementById('drawerBody').innerHTML=html;
    document.getElementById('detailDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
    document.getElementById('detailDrawer').setAttribute('aria-hidden','false');
    document.getElementById('copyKey').onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(r.dataset_key);this.textContent='Copied';};
  }
  function closeDrawer(){document.getElementById('detailDrawer').classList.remove('open');document.getElementById('drawerBackdrop').classList.remove('open');document.getElementById('detailDrawer').setAttribute('aria-hidden','true');}

  document.getElementById('refreshBtn').onclick=load;
  document.getElementById('searchInput').oninput=function(){state.query=this.value.trim();renderRows();};
  document.getElementById('groupFilter').onchange=function(){state.group=this.value;renderFilters();renderRows();};
  document.getElementById('statusFilter').onchange=function(){state.status=this.value;renderRows();};
  document.getElementById('drawerClose').onclick=closeDrawer;
  document.getElementById('drawerBackdrop').onclick=closeDrawer;
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrawer();});
  document.getElementById('autoBtn').onclick=function(){
    state.auto=!state.auto;this.textContent=state.auto?'Auto-refresh · 60s':'Auto-refresh · off';
    if(state.timer)clearInterval(state.timer);
    if(state.auto)state.timer=setInterval(load,60000);
  };
  state.timer=setInterval(load,60000);
  load();
})();