// Company Research price history. Provider matching/calculations stay server-side.
(function(){
  'use strict';
  var state={symbol:'',range:'1y',request:0,controller:null,chart:null,data:null,selected:null};
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
    host.innerHTML='<div class="ph-header"><div><h2>'+text('Price & key events','מחיר ואירועים מרכזיים')+'</h2><div id="ph-period" class="ph-period"></div></div><div id="ph-ranges" class="ph-ranges" role="group" aria-label="'+text('Price history timeframe','טווח גרף המחיר')+'">'+ranges.map(function(r){return '<button type="button" data-ph-range="'+r[0]+'" aria-pressed="'+(r[0]===state.range)+'">'+r[1]+'</button>';}).join('')+'</div></div><div id="ph-status" class="ph-status" role="status" aria-live="polite"></div><div id="ph-body" hidden><div class="ph-summary"><div><span id="ph-latest"></span><span id="ph-change"></span></div><div id="ph-basis"></div></div><div class="ph-chart-wrap"><canvas id="ph-chart" role="img" aria-label="'+text('Daily closing price and numbered news events. Event details follow below.','מחיר סגירה יומי ואירועים ממוספרים. פירוט האירועים בהמשך.')+'"></canvas></div><div id="ph-extrema" class="ph-extrema"></div><div class="ph-event-header"><h3>'+text('Events near notable moves','אירועים סמוך לתנועות בולטות')+'</h3><button type="button" id="ph-sources">'+text('Sources & methodology','מקורות ומתודולוגיה')+'</button></div><div id="ph-events" class="ph-events"></div><div id="ph-detail" class="ph-detail" aria-live="polite"></div></div>';
    host.addEventListener('click',function(event){
      var r=event.target.closest('[data-ph-range]');if(r){if(r.dataset.phRange!==state.range){state.range=r.dataset.phRange;load(state.symbol);}return;}
      var b=event.target.closest('[data-ph-event]');if(b){select(b.dataset.phEvent,false);return;}
      if(event.target.closest('#ph-retry')){load(state.symbol);return;}
      if(event.target.closest('#ph-sources')&&typeof navigate==='function')navigate('sources');
    });return true;
  }
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
      'Markers are a bounded selection of sourced events near notable daily moves or local extrema. Gaps do not mean no news occurred. Historical coverage is sparse; there is no automatic explanation for every high or low.',
      'A linked event is temporal context unless its source explicitly reports a price driver. Even a reported driver is an attribution, not proof of causation. Company releases verify the announcement, not its effect on price.',
      'Timestamped after-hours news is assigned to the next trading session. Date-only news is conservatively assigned to the next session. Intraday news shares a daily bar that may include price changes before publication; this is labeled in the event.',
      'Daily performance and SPY comparison are calculated on the server using aligned sessions and the disclosed adjustment basis. Excess return is stock daily change minus SPY daily change in percentage points, not a causal model.',
      'Benchmark: '+(typeof m.benchmark==='object'?JSON.stringify(m.benchmark):m.benchmark||'unavailable')+'. Selection and calculations are read-only research logic; this chart does not modify owner formulas.'
    ].concat(m.limitations||[]);
    WaveSources.record('price-history:'+data.symbol,'Price history & events · '+data.symbol,lines.join('\n'),(data.events||[]).filter(function(e){return url(e.url);}).map(function(e){return {title:e.source+' · '+e.title,url:e.url};}));
  }
  function select(id,focus){
    if(!state.data)return;var event=state.data.events.find(function(e){return String(e.id)===String(id);});if(!event)return;
    state.selected=String(id);
    document.querySelectorAll('#ph-events [data-ph-event]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phEvent===state.selected));});
    var index=state.data.events.indexOf(event),safe=url(event.url),published=event.published_at||'';
    var sourceDate=published.length===10?date(published):published.replace('T',' ').replace(/\.\d+Z$/,' UTC').replace(/Z$/,' UTC');
    var relationship=event.relationship==='reported_driver'?text('Reported driver','גורם שדווח במקור'):text('Related context','אירוע סמוך בזמן');
    var timing=event.timing_label||(typeof event.timing==='string'?event.timing.replace(/_/g,' '):'');
    var html='<div class="ph-detail-top"><span class="ph-number">'+(index+1)+'</span><div><span class="ph-tag">'+esc(relationship)+'</span><h4>'+esc(event.title)+'</h4></div></div><p>'+esc(event.summary||'')+'</p><div class="ph-event-meta">'+esc(event.source)+' · '+esc(sourceDate)+'</div><div class="ph-session">'+text('Chart session','יום מסחר בגרף')+': '+date(event.date)+(timing?' · '+esc(timing):'')+'</div><div class="ph-performance"><span>'+esc(state.symbol)+': <strong>'+pct(event.change_pct)+'</strong></span>';
    if(finite(event.benchmark_change_pct))html+='<span>SPY: <strong>'+pct(event.benchmark_change_pct)+'</strong></span>';
    if(finite(event.excess_change_pp))html+='<span>'+text('vs. SPY','מול SPY')+': <strong>'+(event.excess_change_pp>0?'+':'')+event.excess_change_pp.toFixed(2)+' '+text('pp','נק׳ אחוז')+'</strong></span>';
    html+='</div>'+(safe?'<a class="ph-article" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+text('Read original article','לכתבה המקורית')+' ↗</a>':'');
    el('ph-detail').innerHTML=html;
    if(state.chart){state.chart.update('none');}
    if(focus){var button=document.querySelector('#ph-events [data-ph-event="'+CSS.escape(String(event.id))+'"]');if(button){button.focus({preventScroll:true});button.scrollIntoView({behavior:'smooth',block:'nearest'});}}
  }
  function render(data){
    state.data=data;data.events=(data.events||[]).filter(function(e){return url(e.url)&&Number.isInteger(e.index)&&data.points[e.index]&&finite(e.price);}).slice(0,8);
    var points=data.points,s=data.summary||{},last=points[points.length-1];
    el('ph-status').textContent='';el('ph-body').hidden=false;
    el('ph-period').textContent=data.symbol+' · '+date(points[0].date)+' – '+date(last.date);
    el('ph-latest').textContent=money(last.close);
    el('ph-change').textContent=pct(s.change_pct)+' '+text('in period','בתקופה');el('ph-change').className=finite(s.change_pct)?s.change_pct>=0?'ph-positive':'ph-negative':'';
    el('ph-basis').textContent=text('Daily close','סגירה יומית')+' · '+(data.currency||'')+' · '+(data.price_basis==='dividend_and_split_adjusted_close'?text('Split & dividend adjusted','מותאם לפיצולים ולדיבידנדים'):data.price_basis==='split_adjusted_close'?text('Split adjusted','מותאם לפיצולים'):String(data.price_basis||''));
    el('ph-extrema').textContent=text('Period high','שיא בתקופה')+' '+money(typeof s.high==='object'?s.high.close:s.high)+(s.high&&s.high.date?' ('+date(s.high.date)+')':'')+'  ·  '+text('Period low','שפל בתקופה')+' '+money(typeof s.low==='object'?s.low.close:s.low)+(s.low&&s.low.date?' ('+date(s.low.date)+')':'');
    var events=data.events;
    el('ph-events').innerHTML=events.length?events.map(function(e,i){return '<button type="button" data-ph-event="'+esc(e.id)+'" aria-pressed="false" aria-controls="ph-detail"><span class="ph-number">'+(i+1)+'</span><span><small>'+date(e.date)+' · '+esc(String(e.reason||'event').replace(/_/g,' '))+'</small><span>'+esc(e.title)+'</span></span><strong class="'+(finite(e.change_pct)&&e.change_pct>=0?'ph-positive':'ph-negative')+'">'+pct(e.change_pct)+'</strong></button>';}).join(''):'<div class="ph-empty">'+text('No sourced events matched notable moves in this period. Try a different timeframe.','לא נמצאו אירועים עם מקור סמוך לתנועות בולטות בתקופה הזו. אפשר לבחור טווח אחר.')+'</div>';
    el('ph-detail').replaceChildren();register(data);destroy();
    if(typeof Chart==='undefined'){el('ph-status').textContent=text('Chart library unavailable. Reload to try again.','ספריית הגרפים אינה זמינה. יש לטעון מחדש.');return;}
    var markers={id:'wavePriceEventLabels',afterDatasetsDraw:function(chart){var ctx=chart.ctx;chart.getDatasetMeta(1).data.forEach(function(point,i){ctx.save();ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#08111f';ctx.fillText(String(i+1),point.x,point.y);ctx.restore();});}};
    state.chart=new Chart(el('ph-chart'),{type:'line',data:{labels:points.map(function(p){return p.date;}),datasets:[{label:data.symbol,data:points.map(function(p){return p.close;}),borderColor:'#63b3ff',backgroundColor:'rgba(74,158,255,.08)',fill:true,tension:0,pointRadius:0,pointHitRadius:8,borderWidth:2,spanGaps:false},{type:'scatter',label:text('Key events','אירועים'),data:events.map(function(e){return {x:points[e.index].date,y:e.price};}),backgroundColor:function(ctx){var e=events[ctx.dataIndex];return e&&String(e.id)===state.selected?'#f8ce73':'#8fcbff';},borderColor:'#0d1524',borderWidth:2,pointRadius:11,pointHoverRadius:13,pointHitRadius:14}]},plugins:[markers],options:{responsive:true,maintainAspectRatio:false,animation:false,layout:{padding:{top:18,right:12}},interaction:{mode:'nearest',intersect:false},onClick:function(event){var hits=state.chart.getElementsAtEventForMode(event,'nearest',{intersect:true},true);var hit=hits.find(function(h){return h.datasetIndex===1;});if(hit&&events[hit.index])select(events[hit.index].id,true);},plugins:{legend:{display:false},tooltip:{filter:function(item){return item.datasetIndex===0;},callbacks:{title:function(items){return items.length?date(points[items[0].dataIndex].date):'';},label:function(item){var p=points[item.dataIndex];return data.symbol+': '+money(p.close)+' · '+pct(p.change_pct);}}}},scales:{x:{type:'category',grid:{display:false},ticks:{color:'#8294ac',maxTicksLimit:6,maxRotation:0,callback:function(value){var p=points[value];return p?(state.range==='1mo'||state.range==='3mo'?p.date.slice(5):p.date.slice(0,7)):'';}}},y:{grid:{color:'rgba(148,163,184,.09)'},ticks:{color:'#8294ac',maxTicksLimit:5,callback:function(value){return money(value);}}}}}});
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
  window.WavePriceHistory={load:load,reset:reset,formatPrice:formatPrice};
})();
