// Company Research price history. Provider matching/calculations stay server-side.
(function(){
  'use strict';
  var state={symbol:'',range:'1y',request:0,controller:null,chart:null,data:null,selected:null,interval:'daily',category:'all',clusters:[]};
  var ranges=[['1mo','1M'],['3mo','3M'],['6mo','6M'],['1y','1Y'],['5y','5Y']];
  function el(id){return document.getElementById(id);}
  function text(en,he){return typeof getLang==='function'&&getLang()==='he'?he:en;}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function finite(v){return typeof v==='number'&&Number.isFinite(v);}
  function pct(v){return finite(v)?(v>0?'+':'')+v.toFixed(2)+'%':'—';}
  function formatPrice(v,currency){
    if(!finite(v))return '—';
    // Provider subunits must never be silently uppercased into major ISO units.
    var subunits={'GBp':'GBp (pence)','GBX':'GBX (pence)','ZAc':'ZAc (cents)','ILA':'ILA (agorot)'};
    if(subunits[currency]||!currency||!/^([A-Z]{3})$/.test(currency))return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+(currency?' '+(subunits[currency]||currency):'');
    try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency,maximumFractionDigits:2}).format(v);}catch(e){return v.toFixed(2)+' '+currency;}
  }
  function money(v){return formatPrice(v,state.data&&state.data.currency);}
  function date(value){var s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '—';return new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
  function url(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch(e){return null;}}
  function destroy(){if(state.chart){state.chart.destroy();state.chart=null;}}
  function setup(){
    var host=el('resPriceHistory');if(!host)return false;
    if(el('ph-ranges'))return true;
    host.innerHTML='<div class="ph-header"><div><h2>'+text('Price & key events','מחיר ואירועים מרכזיים')+'</h2><div id="ph-period" class="ph-period"></div></div><div id="ph-ranges" class="ph-ranges" role="group" aria-label="'+text('Price history timeframe','טווח גרף המחיר')+'">'+ranges.map(function(r){return '<button type="button" data-ph-range="'+r[0]+'" aria-pressed="'+(r[0]===state.range)+'">'+r[1]+'</button>';}).join('')+'</div><div class="ph-interval" role="group" aria-label="Candle interval"><button type="button" data-ph-interval="daily" aria-pressed="true">Daily</button><button type="button" data-ph-interval="weekly" aria-pressed="false">Weekly</button></div></div><div id="ph-status" class="ph-status" role="status" aria-live="polite"></div><div id="ph-body" hidden><div class="ph-summary"><div><span id="ph-latest"></span><span id="ph-change"></span></div><div id="ph-basis"></div></div><div class="ph-layout"><div class="ph-market"><div id="ph-marker-rail" class="ph-marker-rail" aria-label="Dated event markers"></div><div id="ph-coverage" class="ph-coverage"></div><div class="ph-chart-wrap"><div id="ph-plot-markers" class="ph-plot-markers" aria-label="Material company event bubbles"></div><canvas id="ph-chart" role="img" aria-label="'+text('Daily closing price and numbered news events. Event details follow below.','מחיר סגירה יומי ואירועים ממוספרים. פירוט האירועים בהמשך.')+'"></canvas></div></div><aside class="ph-callouts"><div class="ph-event-header"><h3>'+text('Company events','אירועי חברה')+'</h3><button type="button" id="ph-sources">'+text('Sources & methodology','מקורות ומתודולוגיה')+'</button></div><label class="ph-filter">Event category <select id="ph-category"><option value="all">All material events</option></select></label><div id="ph-cluster-label" class="ph-coverage"></div><div id="ph-events" class="ph-events"></div><div id="ph-detail" class="ph-detail" aria-live="polite"></div></aside></div></div>';
    host.addEventListener('click',function(event){
      var interval=event.target.closest('[data-ph-interval]');if(interval){state.interval=interval.dataset.phInterval;if(state.data)render(state.data);return;}
      var r=event.target.closest('[data-ph-range]');if(r){if(r.dataset.phRange!==state.range){state.range=r.dataset.phRange;load(state.symbol);}return;}
      var cluster=event.target.closest('[data-ph-cluster]');if(cluster){openCluster(Number(cluster.dataset.phCluster));return;}
      var b=event.target.closest('[data-ph-event],[data-ph-marker]');if(b){select(b.dataset.phEvent||b.dataset.phMarker,false);return;}
      if(event.target.closest('#ph-retry')){load(state.symbol);return;}
      if(event.target.closest('#ph-sources')&&typeof navigate==='function')navigate('sources');
    });
    host.addEventListener('focusin',function(e){var c=e.target.closest('[data-ph-cluster]');if(c)openCluster(Number(c.dataset.phCluster));else{var b=e.target.closest('[data-ph-event]');if(b)select(b.dataset.phEvent,false);}});
    host.addEventListener('change',function(e){if(e.target.id==='ph-category'){state.category=e.target.value;render(state.data);}});return true;
  }
  function eventList(events){el('ph-events').innerHTML=events.length?events.map(function(e){return '<button type="button" data-ph-event="'+esc(e.id)+'" aria-pressed="false" aria-controls="ph-detail"><span class="ph-sentiment ph-'+esc(e.sentiment||'neutral')+'" aria-label="'+esc(e.sentiment||'neutral')+'"></span><span><small>'+(e.date?date(e.date):'Awaiting session')+' · '+esc(e.category||e.reason||'event')+'</small><span>'+esc(e.title)+'</span></span></button>';}).join(''):'<div class="ph-empty">No verified material events available for this filter and period. Coverage gaps are listed above.</div>';}
  function openCluster(index){var c=state.clusters[index];if(!c)return;eventList(c.events);el('ph-cluster-label').textContent=c.events.length+' event(s) · '+date(c.events[0].date)+' – '+date(c.events[c.events.length-1].date)+' · use the list to inspect each source';select(c.events[0].id,false);}
  function reset(symbol){
    state.symbol=String(symbol||'').trim().toUpperCase();state.request++;if(state.controller)state.controller.abort();state.controller=null;state.data=null;state.selected=null;destroy();
    if(!setup())return;
    el('resPriceHistory').hidden=!state.symbol;
    el('ph-body').hidden=true;el('ph-period').textContent=state.symbol;el('ph-status').textContent=text('Loading daily prices…','טוען מחירים יומיים…');el('ph-events').replaceChildren();el('ph-detail').replaceChildren();
  }
  function register(data){
    if(!window.WaveSources)return;
    var m=data.meta||{};
    var lines=[
      'Price source: '+(m.price_source||'Yahoo Finance daily chart')+'. Retrieved: '+(m.fetched_at||'unavailable')+'.',
      'Displayed range: '+(data.summary&&data.summary.start_date||'—')+' to '+(data.summary&&data.summary.end_date||'—')+'. Requested range: '+data.range+'.',
      'Price basis: '+(data.price_basis||'unavailable')+'. Exchange timezone: '+(data.exchange_timezone||'unavailable')+'.',
      'News source: '+(m.news_source||'Yahoo Finance ticker-tagged news and reviewed company releases')+'. Status: '+(m.news_status||'unavailable')+'. Coverage: '+(typeof m.news_coverage==='object'?JSON.stringify(m.news_coverage):m.news_coverage||'Recent provider feed only; no complete historical archive')+'.',
      'Material company events are selected independently of price movement. Bubbles cluster nearby dates for readability; category filters and the event list retain access to each event. Gaps do not imply no company activity.',
      'A linked event is temporal context unless its source explicitly reports a price driver. Even a reported driver is an attribution, not proof of causation. Company releases verify the announcement, not its effect on price.',
      'Timestamped after-hours news is assigned to the next trading session. Date-only news is conservatively assigned to the next session. Intraday news shares a daily bar that may include price changes before publication; this is labeled in the event.',
      'Daily performance and SPY comparison are calculated on the server using aligned sessions and the disclosed adjustment basis. Excess return is stock daily change minus SPY daily change in percentage points, not a causal model.',
      'Benchmark: '+(typeof m.benchmark==='object'?JSON.stringify(m.benchmark):m.benchmark||'unavailable')+'. Selection and calculations are read-only research logic; this chart does not modify owner formulas.'
    ].concat(m.limitations||[]);
    WaveSources.record('price-history:'+data.symbol,'Price history & events · '+data.symbol,lines.join('\n'),(data.events||[]).filter(function(e){return url(e.url);}).map(function(e){return {title:e.source+' · '+e.title,url:e.url};}));
  }
  function select(id,focus){
    if(!state.data)return;var event=state.data.events.concat(state.data.pending_events||[]).find(function(e){return String(e.id)===String(id);});if(!event)return;
    state.selected=String(id);
    document.querySelectorAll('#ph-events [data-ph-event]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phEvent===state.selected));});
    var index=state.data.events.indexOf(event),safe=url(event.url),published=event.published_at||'';
    var sourceDate=published.length===10?date(published):published.replace('T',' ').replace(/\.\d+Z$/,' UTC').replace(/Z$/,' UTC');
    var relationship=(event.category||'Company event')+' · '+(event.sentiment||'neutral');
    var timing=event.timing_label||(typeof event.timing==='string'?event.timing.replace(/_/g,' '):'');
    var html='<div class="ph-detail-top"><span class="ph-sentiment ph-'+esc(event.sentiment||'neutral')+'"></span><div><span class="ph-tag">'+esc(relationship)+'</span><h4>'+esc(event.title)+'</h4></div></div><p>'+esc(event.summary||'')+'</p><div class="ph-event-meta">'+esc(event.source)+' · '+esc(event.timestamp_kind||'Publication')+': '+esc(sourceDate)+'</div><div class="ph-event-meta">'+(event.event_date?'Reported event date: '+esc(event.event_date)+' (may precede publication). ':'')+(event.effective_date?'Effective: '+esc(event.effective_date)+'. ':'')+esc(event.sentiment_basis||'Direction uncertain; not a causal explanation.')+'</div><div class="ph-session">'+text('Chart session','יום מסחר בגרף')+': '+date(event.date)+(timing?' · '+esc(timing):'')+'</div><div class="ph-performance"><span>'+esc(state.symbol)+': <strong>'+pct(event.change_pct)+'</strong></span>';
    if(finite(event.benchmark_change_pct))html+='<span>SPY: <strong>'+pct(event.benchmark_change_pct)+'</strong></span>';
    if(finite(event.excess_change_pp))html+='<span>'+text('vs. SPY','מול SPY')+': <strong>'+(event.excess_change_pp>0?'+':'')+event.excess_change_pp.toFixed(2)+' '+text('pp','נק׳ אחוז')+'</strong></span>';
    html+='</div>'+(event.related_sources||[]).filter(function(x){return url(x.url);}).map(function(x){return '<p><a class="ph-article" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+' · '+esc(x.published_at)+'</a></p>';}).join('')+(safe?'<a class="ph-article" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+text('Read original article','לכתבה המקורית')+' ↗</a>':'');
    el('ph-detail').innerHTML=html;
    if(state.chart){state.chart.update('none');}
    document.querySelectorAll('#resPriceHistory [data-ph-marker]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phMarker===state.selected));});
    if(focus){var button=document.querySelector('#ph-events [data-ph-event="'+CSS.escape(String(event.id))+'"]');if(button){button.focus({preventScroll:true});button.scrollIntoView({behavior:'smooth',block:'nearest'});}}
  }
  function render(data){
    state.data=data;data.events=(data.events||[]).filter(function(e){return url(e.url)&&Number.isInteger(e.index)&&data.points[e.index]&&finite(e.price);});
    var points=state.interval==='weekly'?(data.weekly_candles||[]):data.points,s=data.summary||{},last=data.points[data.points.length-1];
    document.querySelectorAll('[data-ph-interval]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phInterval===state.interval));});
    if(!points.length){el('ph-status').textContent='Weekly candles unavailable from this backend. Select Daily.';return;}
    var hasCandles=points.every(function(p){return finite(p.open)&&finite(p.high)&&finite(p.low);});
    el('ph-status').textContent='';el('ph-body').hidden=false;el('ph-chart').setAttribute('aria-label',data.symbol+' '+state.interval+' '+(hasCandles?'candlestick chart':'closing-price chart')+'. Dated event controls and article details follow alongside.');
    el('ph-period').textContent=data.symbol+' · '+date(points[0].date)+' – '+date(last.date);
    el('ph-latest').textContent=money(last.close);
    el('ph-change').textContent=pct(s.change_pct)+' '+text('in period','בתקופה');el('ph-change').className=finite(s.change_pct)?s.change_pct>=0?'ph-positive':'ph-negative':'';
    el('ph-basis').textContent=(hasCandles?(state.interval==='weekly'?'Weekly OHLC · last week may be partial':'Daily OHLC'):'Closing-price line · OHLC unavailable')+' · '+(data.currency||'')+' · '+(data.price_basis==='dividend_and_split_adjusted_close'?text('Split & dividend adjusted','מותאם לפיצולים ולדיבידנדים'):data.price_basis==='split_adjusted_close'?text('Split adjusted','מותאם לפיצולים'):String(data.price_basis||''));
    var allEvents=data.events,awaiting=(data.pending_events||[]).filter(function(e){return url(e.url);}),categories=Array.from(new Set(allEvents.concat(awaiting).map(function(e){return e.category||e.reason||'event';}))).sort();
    if(state.category!=='all'&&!categories.includes(state.category))state.category='all';
    el('ph-category').innerHTML='<option value="all">All material events</option>'+categories.map(function(c){return '<option value="'+esc(c)+'">'+esc(c.replace(/_/g,' '))+'</option>';}).join('');el('ph-category').value=state.category;
    var events=allEvents.filter(function(e){return state.category==='all'||(e.category||e.reason)===state.category;});eventList(events.concat(awaiting.filter(function(e){return state.category==='all'||e.category===state.category;})));el('ph-cluster-label').textContent='';
    el('ph-detail').replaceChildren();register(data);destroy();
    if(typeof Chart==='undefined'){el('ph-status').textContent=text('Chart library unavailable. Reload to try again.','ספריית הגרפים אינה זמינה. יש לטעון מחדש.');return;}
    el('ph-marker-rail').replaceChildren();
    var coverage=data.meta&&data.meta.news_coverage||{},sources=coverage.sources||[];
    var gaps=sources.filter(function(c){return !['available','empty'].includes(c.status);}).length;
    el('ph-coverage').textContent=allEvents.length+' plotted events'+(awaiting.length?' · '+awaiting.length+' awaiting a completed session':'')+' · Partial archive: newsroom history has gaps'+(gaps?' · '+gaps+' source gap(s)':'')+'. Source windows and details: Sources & methodology. Gray means uncertain sentiment.';

    var plotted={id:'waveEventPositions',afterDraw:function(chart){
      var area=chart.chartArea,slots=Math.max(3,Math.floor(area.width/60)),groups=new Map();
      events.forEach(function(e){var index=points.findIndex(function(p){return p.date===e.date||(p.end_date&&p.date<=e.date&&p.end_date>=e.date);});if(index<0)return;var slot=Math.min(slots-1,Math.floor(index/Math.max(1,points.length)*slots));if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push(e);});
      state.clusters=Array.from(groups.entries()).map(function(pair){var list=pair[1],sentiments=Array.from(new Set(list.map(function(e){return e.sentiment||'neutral';})));return {slot:pair[0],events:list,sentiment:sentiments.length===1?sentiments[0]:'neutral'};});
      var signature=state.clusters.map(function(c){return c.slot+':'+c.sentiment+':'+c.events.map(function(e){return e.id;}).join(',');}).join('|');
      if(el('ph-plot-markers').dataset.signature!==signature){el('ph-plot-markers').dataset.signature=signature;el('ph-plot-markers').innerHTML=state.clusters.map(function(c,i){return '<button type="button" class="ph-plot-marker ph-'+esc(c.sentiment)+'" data-ph-cluster="'+i+'" aria-controls="ph-detail" aria-label="'+esc(c.events.length+' '+c.sentiment+' event(s), '+c.events[0].date+' to '+c.events[c.events.length-1].date+'. '+c.events[0].title)+'"><span>'+ (c.events.length>1?c.events.length:'•')+'</span></button>';}).join('');}
      state.clusters.forEach(function(c,i){var b=el('ph-plot-markers').children[i];b.style.left=(area.left+c.slot*area.width/slots+(area.width/slots-44)/2)+'px';b.style.top=(area.top-50)+'px';b.setAttribute('aria-pressed',String(c.events.some(function(e){return e.id===state.selected;})));});
      var selected=events.find(function(e){return e.id===state.selected;});if(selected){var index=points.findIndex(function(p){return p.date===selected.date||(p.end_date&&p.date<=selected.date&&p.end_date>=selected.date);});if(index>=0){var x=chart.scales.x.getPixelForValue(index),y=chart.scales.y.getPixelForValue(selected.price),ctx=chart.ctx;ctx.save();ctx.strokeStyle=selected.sentiment==='positive'?'#60d5b0':selected.sentiment==='negative'?'#ef8590':'#a6b3c3';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,area.top);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.restore();}}
    }};
    var candles={id:'waveCandlesticks',afterDatasetsDraw:function(chart){if(!hasCandles)return;var ctx=chart.ctx,x=chart.scales.x,y=chart.scales.y,w=Math.max(1,Math.min(13,chart.chartArea.width/points.length*.65));ctx.save();ctx.beginPath();ctx.rect(chart.chartArea.left,chart.chartArea.top,chart.chartArea.width,chart.chartArea.height);ctx.clip();points.forEach(function(p,i){if(!finite(p.open)||!finite(p.high)||!finite(p.low))return;var px=x.getPixelForValue(i),oy=y.getPixelForValue(p.open),cy=y.getPixelForValue(p.close);ctx.strokeStyle=ctx.fillStyle=p.close>=p.open?'#60d5b0':'#ef8590';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,y.getPixelForValue(p.high));ctx.lineTo(px,y.getPixelForValue(p.low));ctx.stroke();ctx.fillRect(px-w/2,Math.min(oy,cy),w,Math.max(1,Math.abs(cy-oy)));});ctx.restore();}};
    var lows=points.filter(function(p){return finite(p.low);}).map(function(p){return p.low;}),highs=points.filter(function(p){return finite(p.high);}).map(function(p){return p.high;});
    state.chart=new Chart(el('ph-chart'),{type:'line',data:{labels:points.map(function(p){return p.date;}),datasets:[{label:data.symbol,data:points.map(function(p){return p.close;}),borderColor:'#63b3ff',borderWidth:hasCandles?0:2,pointRadius:0,pointHitRadius:12,fill:false,tension:0}]},plugins:[candles,plotted],options:{layout:{padding:{top:55}},responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:function(items){var p=points[items[0].dataIndex];return date(p.date)+(p.end_date?' – '+date(p.end_date):'');},label:function(item){var p=points[item.dataIndex];return hasCandles?['Open '+money(p.open),'High '+money(p.high),'Low '+money(p.low),'Close '+money(p.close)]:data.symbol+': '+money(p.close);}}}},scales:{x:{type:'category',grid:{display:false},ticks:{color:'#9cacc2',maxTicksLimit:6,maxRotation:0}},y:{suggestedMin:lows.length?Math.min.apply(null,lows):undefined,suggestedMax:highs.length?Math.max.apply(null,highs):undefined,grid:{color:'rgba(148,163,184,.09)'},ticks:{color:'#9cacc2',maxTicksLimit:6,callback:function(value){return money(value);}}}}}});
    if(events.length)select(events[0].id,false);
  }
  async function load(symbol){
    reset(symbol);if(!state.symbol||!el('resPriceHistory'))return;
    var id=state.request,selected=state.symbol,range=state.range;
    document.querySelectorAll('[data-ph-range]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phRange===range));});
    state.controller=new AbortController();var controller=state.controller,timer=setTimeout(function(){controller.abort();},30000);
    try{
      var response=await fetch(API+'/api/price-history?symbol='+encodeURIComponent(selected)+'&range='+encodeURIComponent(range),{signal:controller.signal});
      var data=await response.json();if(id!==state.request)return;
      if(!response.ok||data.error)throw new Error(data.error||'Price history unavailable');
      if(data.symbol!==selected||data.range!==range||!Array.isArray(data.points)||data.points.length<2||data.points.some(function(p){return !p||!finite(p.close)||p.close<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date);}))throw new Error('Price history is incomplete');
      render(data);
    }catch(error){if(id!==state.request)return;destroy();el('ph-body').hidden=true;el('ph-status').innerHTML=esc(text('Price history unavailable.','היסטוריית המחיר אינה זמינה.'))+' <button type="button" id="ph-retry">'+text('Retry','ניסיון נוסף')+'</button>';
      if(window.WaveSources)WaveSources.record('price-history:'+selected,'Price history & events · '+selected,'Request failed: '+String(error.message||error)+'. No cached or synthetic prices were substituted.');
    }finally{clearTimeout(timer);if(id===state.request)state.controller=null;}
  }
  window.WavePriceHistory={load:load,reset:reset,formatPrice:formatPrice,snapshot:function(symbol){return state.data&&state.symbol===symbol?JSON.parse(JSON.stringify(state.data)):null;}};
})();
