// Company Research price history. Provider matching/calculations stay server-side.
(function(){
  'use strict';
  var state={symbol:'',range:'1y',request:0,controller:null,chart:null,data:null,selected:null,interval:'daily'};
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
    host.innerHTML='<div class="ph-header"><div><h2>'+text('Price & key events','מחיר ואירועים מרכזיים')+'</h2><div id="ph-period" class="ph-period"></div></div><div id="ph-ranges" class="ph-ranges" role="group" aria-label="'+text('Price history timeframe','טווח גרף המחיר')+'">'+ranges.map(function(r){return '<button type="button" data-ph-range="'+r[0]+'" aria-pressed="'+(r[0]===state.range)+'">'+r[1]+'</button>';}).join('')+'</div><div class="ph-interval" role="group" aria-label="Candle interval"><button type="button" data-ph-interval="daily" aria-pressed="true">Daily</button><button type="button" data-ph-interval="weekly" aria-pressed="false">Weekly</button></div></div><div id="ph-status" class="ph-status" role="status" aria-live="polite"></div><div id="ph-body" hidden><div class="ph-summary"><div><span id="ph-latest"></span><span id="ph-change"></span></div><div id="ph-basis"></div></div><div class="ph-layout"><div class="ph-market"><div id="ph-marker-rail" class="ph-marker-rail" aria-label="Dated event markers"></div><div class="ph-chart-wrap"><canvas id="ph-chart" role="img" aria-label="'+text('Daily closing price and numbered news events. Event details follow below.','מחיר סגירה יומי ואירועים ממוספרים. פירוט האירועים בהמשך.')+'"></canvas></div><div id="ph-extrema" class="ph-extrema"></div></div><aside class="ph-callouts"><div class="ph-event-header"><h3>'+text('Events near notable moves','אירועים סמוך לתנועות בולטות')+'</h3><button type="button" id="ph-sources">'+text('Sources & methodology','מקורות ומתודולוגיה')+'</button></div><div id="ph-events" class="ph-events"></div><div id="ph-detail" class="ph-detail" aria-live="polite"></div></aside></div></div>';
    host.addEventListener('click',function(event){
      var interval=event.target.closest('[data-ph-interval]');if(interval){state.interval=interval.dataset.phInterval;if(state.data)render(state.data);return;}
      var r=event.target.closest('[data-ph-range]');if(r){if(r.dataset.phRange!==state.range){state.range=r.dataset.phRange;load(state.symbol);}return;}
      var b=event.target.closest('[data-ph-event],[data-ph-marker]');if(b){select(b.dataset.phEvent||b.dataset.phMarker,false);return;}
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
    document.querySelectorAll('#ph-marker-rail [data-ph-marker]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phMarker===state.selected));});
    if(focus){var button=document.querySelector('#ph-events [data-ph-event="'+CSS.escape(String(event.id))+'"]');if(button){button.focus({preventScroll:true});button.scrollIntoView({behavior:'smooth',block:'nearest'});}}
  }
  function render(data){
    state.data=data;data.events=(data.events||[]).filter(function(e){return url(e.url)&&Number.isInteger(e.index)&&data.points[e.index]&&finite(e.price);}).slice(0,8);
    var points=state.interval==='weekly'?(data.weekly_candles||[]):data.points,s=data.summary||{},last=data.points[data.points.length-1];
    document.querySelectorAll('[data-ph-interval]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phInterval===state.interval));});
    if(!points.length){el('ph-status').textContent='Weekly candles unavailable from this backend. Select Daily.';return;}
    var hasCandles=points.every(function(p){return finite(p.open)&&finite(p.high)&&finite(p.low);});
    el('ph-status').textContent='';el('ph-body').hidden=false;el('ph-chart').setAttribute('aria-label',data.symbol+' '+state.interval+' '+(hasCandles?'candlestick chart':'closing-price chart')+'. Dated event controls and article details follow alongside.');
    el('ph-period').textContent=data.symbol+' · '+date(points[0].date)+' – '+date(last.date);
    el('ph-latest').textContent=money(last.close);
    el('ph-change').textContent=pct(s.change_pct)+' '+text('in period','בתקופה');el('ph-change').className=finite(s.change_pct)?s.change_pct>=0?'ph-positive':'ph-negative':'';
    el('ph-basis').textContent=(hasCandles?(state.interval==='weekly'?'Weekly OHLC · last week may be partial':'Daily OHLC'):'Closing-price line · OHLC unavailable')+' · '+(data.currency||'')+' · '+(data.price_basis==='dividend_and_split_adjusted_close'?text('Split & dividend adjusted','מותאם לפיצולים ולדיבידנדים'):data.price_basis==='split_adjusted_close'?text('Split adjusted','מותאם לפיצולים'):String(data.price_basis||''));
    el('ph-extrema').textContent=text('Period high','שיא בתקופה')+' '+money(typeof s.high==='object'?s.high.close:s.high)+(s.high&&s.high.date?' ('+date(s.high.date)+')':'')+'  ·  '+text('Period low','שפל בתקופה')+' '+money(typeof s.low==='object'?s.low.close:s.low)+(s.low&&s.low.date?' ('+date(s.low.date)+')':'');
    var events=data.events;
    el('ph-events').innerHTML=events.length?events.map(function(e,i){return '<button type="button" data-ph-event="'+esc(e.id)+'" aria-pressed="false" aria-controls="ph-detail"><span class="ph-number">'+(i+1)+'</span><span><small>'+date(e.date)+' · '+esc(String(e.reason||'event').replace(/_/g,' '))+'</small><span>'+esc(e.title)+'</span></span><strong class="'+(finite(e.change_pct)&&e.change_pct>=0?'ph-positive':'ph-negative')+'">'+pct(e.change_pct)+'</strong></button>';}).join(''):'<div class="ph-empty">'+text('No sourced events matched notable moves in this period. Try a different timeframe.','לא נמצאו אירועים עם מקור סמוך לתנועות בולטות בתקופה הזו. אפשר לבחור טווח אחר.')+'</div>';
    el('ph-detail').replaceChildren();register(data);destroy();
    if(typeof Chart==='undefined'){el('ph-status').textContent=text('Chart library unavailable. Reload to try again.','ספריית הגרפים אינה זמינה. יש לטעון מחדש.');return;}
    // Event controls occupy their own lane and side column; never cover candles.
    el('ph-marker-rail').innerHTML=events.map(function(e,i){return '<button type="button" data-ph-marker="'+esc(e.id)+'" aria-controls="ph-detail" title="'+esc(e.date+' · '+e.title)+'">'+(i+1)+' <small>'+esc(e.date.slice(5))+'</small></button>';}).join('');
    var candles={id:'waveCandlesticks',afterDatasetsDraw:function(chart){if(!hasCandles)return;var ctx=chart.ctx,x=chart.scales.x,y=chart.scales.y,w=Math.max(1,Math.min(13,chart.chartArea.width/points.length*.65));ctx.save();ctx.beginPath();ctx.rect(chart.chartArea.left,chart.chartArea.top,chart.chartArea.width,chart.chartArea.height);ctx.clip();points.forEach(function(p,i){if(!finite(p.open)||!finite(p.high)||!finite(p.low))return;var px=x.getPixelForValue(i),oy=y.getPixelForValue(p.open),cy=y.getPixelForValue(p.close);ctx.strokeStyle=ctx.fillStyle=p.close>=p.open?'#60d5b0':'#ef8590';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,y.getPixelForValue(p.high));ctx.lineTo(px,y.getPixelForValue(p.low));ctx.stroke();ctx.fillRect(px-w/2,Math.min(oy,cy),w,Math.max(1,Math.abs(cy-oy)));});ctx.restore();}};
    var lows=points.filter(function(p){return finite(p.low);}).map(function(p){return p.low;}),highs=points.filter(function(p){return finite(p.high);}).map(function(p){return p.high;});
    state.chart=new Chart(el('ph-chart'),{type:'line',data:{labels:points.map(function(p){return p.date;}),datasets:[{label:data.symbol,data:points.map(function(p){return p.close;}),borderColor:'#63b3ff',borderWidth:hasCandles?0:2,pointRadius:0,pointHitRadius:12,fill:false,tension:0}]},plugins:[candles],options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:function(items){var p=points[items[0].dataIndex];return date(p.date)+(p.end_date?' – '+date(p.end_date):'');},label:function(item){var p=points[item.dataIndex];return hasCandles?['Open '+money(p.open),'High '+money(p.high),'Low '+money(p.low),'Close '+money(p.close)]:data.symbol+': '+money(p.close);}}}},scales:{x:{type:'category',grid:{display:false},ticks:{color:'#9cacc2',maxTicksLimit:6,maxRotation:0}},y:{suggestedMin:lows.length?Math.min.apply(null,lows):undefined,suggestedMax:highs.length?Math.max.apply(null,highs):undefined,grid:{color:'rgba(148,163,184,.09)'},ticks:{color:'#9cacc2',maxTicksLimit:6,callback:function(value){return money(value);}}}}}});
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
