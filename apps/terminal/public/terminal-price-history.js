// Company Research price history. Provider matching/calculations stay server-side.
(function(){
  'use strict';
  var state={symbol:'',request:0,controller:null,chart:null,data:null,category:'all',interval:'daily',clusters:[],selected:null};
  var RANGE='3y';
  function el(id){return document.getElementById(id);}
  function text(en,he){return typeof getLang==='function'&&getLang()==='he'?he:en;}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function finite(v){return typeof v==='number'&&Number.isFinite(v);}
  function pct(v){return finite(v)?(v>0?'+':'')+v.toFixed(2)+'%':'—';}
  function formatPrice(v,currency){
    if(!finite(v))return '—';
    var subunits={'GBp':'GBp (pence)','GBX':'GBX (pence)','ZAc':'ZAc (cents)','ILA':'ILA (agorot)'};
    if(subunits[currency]||!currency||!/^([A-Z]{3})$/.test(currency))return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+(currency?' '+(subunits[currency]||currency):'');
    try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency,maximumFractionDigits:2}).format(v);}catch(e){return v.toFixed(2)+' '+currency;}
  }
  function money(v){return formatPrice(v,state.data&&state.data.currency);}
  function date(value){var s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '—';return new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
  function url(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch(e){return null;}}
  function destroy(){if(window.WaveCatalystChart)WaveCatalystChart.hideTip();if(state.chart){state.chart.destroy();state.chart=null;}}
  function setup(){
    var host=el('resPriceHistory');if(!host)return false;
    if(el('ph-chart'))return true;
    host.innerHTML='<div class="ph-header"><div><h2>'+text('Price','מחיר')+'</h2><div id="ph-period" class="ph-period"></div></div><div class="ph-interval" role="group" aria-label="Candle interval"><button type="button" data-ph-interval="daily" aria-pressed="true">Daily</button><button type="button" data-ph-interval="weekly" aria-pressed="false">Weekly</button></div></div><div id="ph-status" class="ph-status" role="status" aria-live="polite"></div><div id="ph-body" hidden><div class="ph-summary"><div><span id="ph-latest"></span><span id="ph-change"></span></div><div id="ph-basis"></div></div><label class="ph-filter">'+text('Event category','סוג אירוע')+' <select id="ph-category"><option value="all">'+text('All','הכל')+'</option></select></label><div class="ph-chart-wrap"><div id="ph-plot-markers" class="ph-plot-markers"></div><canvas id="ph-chart" role="img" aria-label="'+text('Price chart','גרף מחיר')+'"></canvas></div><div id="ph-events" class="ph-events"></div><div id="ph-detail" class="ph-detail"></div></div>';
    host.addEventListener('click',function(event){
      if(event.target.closest('#ph-retry')){load(state.symbol);return;}
      var interval=event.target.closest('[data-ph-interval]');
      if(interval){state.interval=interval.dataset.phInterval;render(state.data);return;}
      var cluster=event.target.closest('[data-ph-cluster]');
      if(cluster){openCluster(Number(cluster.dataset.phCluster));return;}
      var item=event.target.closest('[data-ph-event]');
      if(item){showEvent(item.dataset.phEvent);return;}
    });
    host.addEventListener('keydown',function(event){
      if(event.key!=='Enter')return;
      var cluster=event.target.closest('[data-ph-cluster]');
      if(cluster){event.preventDefault();openCluster(Number(cluster.dataset.phCluster));}
    });
    host.addEventListener('change',function(e){if(e.target.id==='ph-category'){state.category=e.target.value;render(state.data);}});return true;
  }
  function reset(symbol){
    state.symbol=String(symbol||'').trim().toUpperCase();state.request++;if(state.controller)state.controller.abort();state.controller=null;state.data=null;destroy();
    if(!setup())return;
    el('resPriceHistory').hidden=!state.symbol;
    el('ph-body').hidden=true;el('ph-period').textContent=state.symbol;el('ph-status').textContent=text('Loading daily prices…','טוען מחירים יומיים…');
  }
  function toneFor(event, daily){
    if(!event.date||!Number.isInteger(event.index)||!daily)return 'neutral';
    var prior=daily[event.index-1], after=daily[event.index+3];
    if(!prior||!after||!finite(prior.close)||!finite(after.close)||prior.close<=0)return 'neutral';
    var change=after.close/prior.close-1;
    if(change>0.01)return 'positive';
    if(change<-0.01)return 'negative';
    return 'neutral';
  }
  function barIndex(points, event){
    if(event.date){
      var index=points.findIndex(function(p){return p.date===event.date||(p.end_date&&p.date<=event.date&&p.end_date>=event.date);});
      if(index>=0)return index;
    }
    return points.length?points.length-1:-1;
  }
  function register(data, events){
    var m=data.meta||{};
    var lines=[
      'Price source: '+(m.price_source||'Yahoo Finance daily chart')+'. Retrieved: '+(m.fetched_at||'unavailable')+'.',
      'Displayed range: '+(data.summary&&data.summary.start_date||'—')+' to '+(data.summary&&data.summary.end_date||'—')+'. Requested range: '+data.range+'.',
      'Price basis: '+(data.price_basis||'unavailable')+'. Exchange timezone: '+(data.exchange_timezone||'unavailable')+'.',
      'News source: '+(m.news_source||'Yahoo Finance ticker-tagged news and reviewed company releases')+'. Status: '+(m.news_status||'unavailable')+'. Coverage: '+(typeof m.news_coverage==='object'?JSON.stringify(m.news_coverage):m.news_coverage||'Recent provider feed only; no complete historical archive')+'.',
      'Each event with a verified link is a dot on the close of its session. The one-line description is the event title and is shown only while the dot is hovered or tapped.',
      'Dot color uses the daily closes in this response: percent change from the close before the event session to the close three trading sessions after it. Above +1.0% is green. Below -1.0% is red. Inside ±1.0%, an unfinished window, or an event that does not yet have a completed session is gray. The figure is an observed price change, not a claim that the event caused the move.',
      'Timestamped after-hours news is assigned to the next trading session. Date-only news is conservatively assigned to the next session.',
      'Benchmark: '+(typeof m.benchmark==='object'?JSON.stringify(m.benchmark):m.benchmark||'unavailable')+'.'
    ].concat(m.limitations||[]);
    var links=(events||[]).filter(function(e){return url(e.url);}).map(function(e){return {title:(e.source||'')+' · '+(e.title||''),url:e.url};});
    if(window.WaveDataLog)WaveDataLog.record('price-history:'+data.symbol,{section:'Equity Research · Price',metric:data.symbol+' · Price',source:m.price_source||'Yahoo Finance',pulledAt:m.fetched_at||'',coverage:(data.summary&&data.summary.start_date||'')+' – '+(data.summary&&data.summary.end_date||''),notes:lines.join('\n'),links:links,skipSources:true});
    if(window.WaveSources)WaveSources.record('price-history:'+data.symbol,'Price history & events · '+data.symbol,lines.join('\n'),links);
  }
  function render(data){
    state.data=data;
    var daily=data.points||[];
    data.events=(data.events||[]).filter(function(e){return url(e.url)&&e.title&&Number.isInteger(e.index)&&daily[e.index]&&finite(e.price);});
    var pending=(data.pending_events||[]).filter(function(e){return url(e.url)&&e.title;});
    var points=state.interval==='weekly'&&(data.weekly_candles||[]).length?data.weekly_candles:daily,s=data.summary||{},last=daily[daily.length-1];
    document.querySelectorAll('[data-ph-interval]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phInterval===state.interval));});
    if(!points.length){el('ph-status').textContent=text('Price history unavailable.','היסטוריית המחיר אינה זמינה.');return;}
    var hasCandles=points.every(function(p){return finite(p.open)&&finite(p.high)&&finite(p.low);});
    el('ph-status').textContent='';el('ph-body').hidden=false;
    el('ph-chart').setAttribute('aria-label',data.symbol+' daily price');
    el('ph-period').textContent=data.symbol;
    el('ph-latest').textContent=money(last.close);
    el('ph-change').textContent=pct(s.change_pct)+' '+text('in period','בתקופה');el('ph-change').className=finite(s.change_pct)?s.change_pct>=0?'ph-positive':'ph-negative':'';
    el('ph-basis').textContent=data.currency||'';
    var categories=Array.from(new Set(data.events.concat(pending).map(function(e){return e.category||e.reason||'event';}))).sort();
    if(state.category!=='all'&&!categories.includes(state.category))state.category='all';
    el('ph-category').innerHTML='<option value="all">'+text('All','הכל')+'</option>'+categories.map(function(c){return '<option value="'+esc(c)+'">'+esc(String(c).replace(/_/g,' '))+'</option>';}).join('');
    el('ph-category').value=state.category;
    var events=data.events.concat(pending).filter(function(e){return state.category==='all'||(e.category||e.reason)===state.category;});
    register(data, events);destroy();
    if(typeof Chart==='undefined'){el('ph-status').textContent=text('Chart library unavailable. Reload to try again.','ספריית הגרפים אינה זמינה. יש לטעון מחדש.');return;}
    var candles={id:'waveCandlesticks',afterDatasetsDraw:function(chart){if(!hasCandles)return;var ctx=chart.ctx,x=chart.scales.x,y=chart.scales.y,w=Math.max(1,Math.min(13,chart.chartArea.width/points.length*.65));ctx.save();ctx.beginPath();ctx.rect(chart.chartArea.left,chart.chartArea.top,chart.chartArea.width,chart.chartArea.height);ctx.clip();points.forEach(function(p,i){if(!finite(p.open)||!finite(p.high)||!finite(p.low))return;var px=x.getPixelForValue(i),oy=y.getPixelForValue(p.open),cy=y.getPixelForValue(p.close);ctx.strokeStyle=ctx.fillStyle=p.close>=p.open?'#60d5b0':'#ef8590';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,y.getPixelForValue(p.high));ctx.lineTo(px,y.getPixelForValue(p.low));ctx.stroke();ctx.fillRect(px-w/2,Math.min(oy,cy),w,Math.max(1,Math.abs(cy-oy)));});ctx.restore();}};
    var dots={id:'waveResearchDots',afterDatasetsDraw:function(chart){
      var area=chart.chartArea,stacks={},positions=[];
      events.forEach(function(event){
        var index=barIndex(points, event);if(index<0)return;
        var stack=stacks[index]||0;stacks[index]=stack+1;
        var close=finite(points[index].close)?points[index].close:(finite(event.price)?event.price:null);
        if(!finite(close))return;
        var tone=toneFor(event, daily);
        var px=chart.scales.x.getPixelForValue(index), py=chart.scales.y.getPixelForValue(close*(1+0.012*stack));
        var visible=Number.isFinite(px)&&Number.isFinite(py)&&px>=area.left-8&&px<=area.right+8&&py>=area.top-16&&py<=area.bottom+8;
        if(visible&&window.WaveCatalystChart)WaveCatalystChart.drawDot(chart.ctx,px,py,tone,{radius:5,ring:true});
        positions.push({px:px,py:py,visible:visible,row:{line:event.title,outcome:tone}});
      });
      chart.$dotPositions=positions;
    }};
    var lows=points.filter(function(p){return finite(p.low);}).map(function(p){return p.low;}),highs=points.filter(function(p){return finite(p.high);}).map(function(p){return p.high;});
    var canvas=el('ph-chart');
    state.chart=new Chart(canvas,{type:'line',data:{labels:points.map(function(p){return p.date;}),datasets:[{label:data.symbol,data:points.map(function(p){return p.close;}),borderColor:'#63b3ff',borderWidth:hasCandles?0:2,pointRadius:0,pointHitRadius:0,fill:false,tension:0}]},plugins:[candles,dots],options:{layout:{padding:{top:18}},responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{type:'category',grid:{display:false},ticks:{color:'#9cacc2',maxTicksLimit:6,maxRotation:0,autoSkipPadding:18,callback:function(value){var label=this.getLabelForValue(value);return /^\d{4}-\d{2}-\d{2}$/.test(String(label||''))?new Date(label+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'}):label;}}},y:{suggestedMin:lows.length?Math.min.apply(null,lows):undefined,suggestedMax:highs.length?Math.max.apply(null,highs):undefined,grid:{color:'rgba(148,163,184,.09)'},ticks:{color:'#9cacc2',maxTicksLimit:6,callback:function(value){return money(value);}}}}}});
    if(window.WaveCatalystChart)WaveCatalystChart.bindPointer(canvas, state.chart);
    paintMarkers(events, points);
  }
  function showEvent(id){
    var event=(state.data.events||[]).concat(state.data.pending_events||[]).find(function(item){return item.id===id;});
    if(!event)return;
    state.selected=id;
    var detail=el('ph-detail');
    detail.innerHTML='<h4>'+esc(event.title)+'</h4><p>'+esc(event.summary||'')+'</p>'+(url(event.url)?'<a href="'+esc(url(event.url))+'" target="_blank" rel="noopener noreferrer">'+esc(event.source||event.url)+'</a>':'');
  }
  function openCluster(index){
    var cluster=state.clusters[index];
    if(!cluster)return;
    showEvent(cluster.events[0].id);
  }
  function paintMarkers(events, points){
    var host=el('ph-plot-markers');
    if(!host)return;
    var slots=Math.max(events.length,3),groups=new Map();
    events.forEach(function(event){
      var index=barIndex(points, event);
      if(index<0)return;
      var slot=Math.min(slots-1,Math.floor(index/Math.max(1,points.length)*slots));
      if(!groups.has(slot))groups.set(slot,[]);
      groups.get(slot).push(event);
    });
    state.clusters=Array.from(groups.entries()).map(function(pair){return {slot:pair[0],events:pair[1],sentiment:'neutral'};});
    host.innerHTML=state.clusters.map(function(cluster,i){
      var first=cluster.events[0],last=cluster.events[cluster.events.length-1];
      return '<button type="button" class="ph-plot-marker ph-neutral" data-ph-cluster="'+i+'" aria-controls="ph-detail" aria-label="'+esc(cluster.events.length+' event(s), '+first.date+' to '+last.date+'. '+first.title)+'"><span>'+(cluster.events.length>1?cluster.events.length:'•')+'</span></button>';
    }).join('');
    var list=el('ph-events');
    if(list)list.innerHTML=events.map(function(event){return '<button type="button" data-ph-event="'+esc(event.id)+'"><span>'+esc(event.date)+'</span><span>'+esc(event.title)+'</span></button>';}).join('');
  }
  function clipToThreeYears(data){
    var points=data.points||[];
    if(points.length<2)return data;
    var end=Date.parse(points[points.length-1].date+'T12:00:00Z');
    var cutoff=new Date(end);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-3);
    var cutoffDate=cutoff.toISOString().slice(0,10);
    var start=points.findIndex(function(p){return p.date>=cutoffDate;});
    if(start<=0)return Object.assign({},data,{range:RANGE});
    var sliced=points.slice(start);
    var first=sliced[0],last=sliced[sliced.length-1];
    var events=(data.events||[]).filter(function(e){return e.index>=start;}).map(function(e){var copy=Object.assign({},e);copy.index=e.index-start;return copy;});
    var summary=Object.assign({},data.summary||{},{start_date:first.date,end_date:last.date,change_pct:first.close>0?(last.close/first.close-1)*100:null});
    return Object.assign({},data,{points:sliced,events:events,summary:summary,range:RANGE});
  }
  async function readHistory(symbol,range,signal){
    var response=await fetch(API+'/api/price-history?symbol='+encodeURIComponent(symbol)+'&range='+encodeURIComponent(range),{signal:signal});
    var data={};try{data=await response.json();}catch(e){data={error:'Price history unavailable'};}
    return {ok:response.ok,status:response.status,data:data};
  }
  async function load(symbol){
    reset(symbol);if(!state.symbol||!el('resPriceHistory'))return;
    var id=state.request,selected=state.symbol;
    state.controller=new AbortController();var controller=state.controller,timer=setTimeout(function(){controller.abort();},30000);
    try{
      var result=await readHistory(selected,RANGE,controller.signal);
      if(id!==state.request)return;
      if(!result.ok&&result.status===400)result=await readHistory(selected,'5y',controller.signal);
      if(id!==state.request)return;
      var data=result.data||{};
      if(!result.ok||data.error)throw new Error(data.error||'Price history unavailable');
      if(data.range!==RANGE)data=clipToThreeYears(data);
      if(data.symbol!==selected||!Array.isArray(data.points)||data.points.length<2||data.points.some(function(p){return !p||!finite(p.close)||p.close<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date);}))throw new Error('Price history is incomplete');
      render(data);
    }catch(error){if(id!==state.request)return;destroy();el('ph-body').hidden=true;el('ph-status').innerHTML=esc(text('Price history unavailable.','היסטוריית המחיר אינה זמינה.'))+' <button type="button" id="ph-retry">'+text('Retry','ניסיון נוסף')+'</button>';
      if(window.WaveSources)WaveSources.record('price-history:'+selected,'Price history & events · '+selected,'Request failed: '+String(error.message||error)+'. No cached or synthetic prices were substituted.');
    }finally{clearTimeout(timer);if(id===state.request)state.controller=null;}
  }
  window.WavePriceHistory={load:load,reset:reset,formatPrice:formatPrice,snapshot:function(symbol){return state.data&&state.symbol===symbol?JSON.parse(JSON.stringify(state.data)):null;}};
})();
