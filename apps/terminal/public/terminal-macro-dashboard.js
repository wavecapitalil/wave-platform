/* US macro overview. Closed cards intentionally contain headline data only. */
(function(){
  'use strict';
  var state={series:[],histories:{},components:{},generation:0}, opener=null, selected=null;
  function he(){return document.documentElement.lang==='he'||localStorage.getItem('wc_lang')==='he';}
  function t(en,heb){return he()?heb:en;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(n){return typeof n==='number'&&Number.isFinite(n)?n.toLocaleString(he()?'he-IL':'en-US',{maximumFractionDigits:3}):'—';}
  function status(s){return ({latest_available:t('Latest available observation','התצפית האחרונה הזמינה'),release_overdue:t('Expected release overdue','מועד הפרסום הצפוי חלף'),schedule_unavailable:t('Release schedule unavailable','לוח פרסומים לא זמין'),fetch_failed:t('Fetch failed · retained data if available','המשיכה נכשלה · נתונים קודמים אם זמינים'),loading:t('Loading','טוען'),unavailable:t('Unavailable','לא זמין'),license_unverified:t('License unverified','רישיון לא אומת'),stale:t('Stale','לא מעודכן'),partial:t('Incomplete components','רכיבים חסרים'),unreconciled:t('Components do not reconcile','הרכיבים אינם מתיישבים'),current_vintage:t('Revised history','היסטוריה מעודכנת')})[s]||s;}
  function latest(s){return s.releases.length?s.releases[s.releases.length-1]:null;}
  var chartId=0;
  function precise(n){return typeof n==='number'&&Number.isFinite(n)?String(n):'—';}
  function readable(n,unit){
    if(typeof n!=='number'||!Number.isFinite(n))return '—';
    if(n===0)return '0';
    // Small nonzero changes must never be displayed as zero. Units remain unscaled.
    var options=Math.abs(n)<.001?{maximumSignificantDigits:3}:{maximumFractionDigits:3};
    return n.toLocaleString('en-US',options).replace('-', '−');
  }
  function chartScale(values){
    var low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
    var rough=span/4,power=Math.pow(10,Math.floor(Math.log10(rough)));
    var step=[1,2,2.5,5,10].find(function(n){return n*power>=rough;})*power;
    var first=Math.floor(low/step),last=Math.ceil(high/step);
    if(first===last)last=first+1;
    var ticks=Array.from({length:last-first+1},function(_,i){return Number(((first+i)*step).toPrecision(12));});
    return {min:ticks[0],max:ticks[ticks.length-1],ticks:ticks};
  }
  function chart(points,expanded,unit,comparison){
    if(!points.length)return '<div class="macro-empty">'+t('History unavailable','היסטוריה לא זמינה')+'</div>';
    var w=expanded?Math.max(280,Math.min(760,window.innerWidth<600?window.innerWidth-24:window.innerWidth*.94-48)):210,h=expanded?280:58,left=expanded?92:5,right=expanded?25:5,top=expanded?28:5,bottom=expanded?60:5;
    var values=points.flatMap(function(p){return [p.value,p.consensus].filter(function(v){return typeof v==='number'&&Number.isFinite(v);});});
    if(!values.length)return '<div class="macro-empty">'+t('Actual and verified consensus unavailable','נתון בפועל וצפי מאומת אינם זמינים')+'</div>';
    var scale=chartScale(values),min=scale.min,max=scale.max;
    var start=Date.parse(points[0].period),end=Date.parse(points[points.length-1].period);
    var step=points.length>1?Math.min.apply(null,points.slice(1).map(function(p,i){return Date.parse(p.period)-Date.parse(points[i].period);})):86400000;
    step=Math.max(86400000,step);
    var span=end-start+step,barWidth=Math.max(.7,Math.min(expanded?30:12,step/span*(w-left-right)*.72));
    function x(p){return left+(Date.parse(p.period)-start+step/2)/span*(w-left-right);}
    function y(v){return top+(max-v)/(max-min)*(h-top-bottom);}
    function value(v){return String(v).replace('-', '−');}
    function period(p){return p.replace(/-/g,'/');}
    var axes='';
    if(expanded){
      scale.ticks.forEach(function(v){axes+='<line data-tick="'+v+'" x1="'+left+'" x2="'+(w-right)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#334155"/><text x="'+(left-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+esc(value(v))+'</text>';});
      var tickCount=Math.min(points.length,5,Math.max(2,Math.floor((w-left-right)*(end-start)/span/(comparison?120:100))+1));
      Array.from({length:tickCount},function(_,i){return tickCount===1?0:Math.round(i*(points.length-1)/(tickCount-1));}).forEach(function(i){axes+='<text class="macro-axis-period" x="'+x(points[i])+'" y="'+(h-36)+'" text-anchor="'+(i===0?'start':i===points.length-1?'end':'middle')+'">'+period(points[i].period.slice(0,comparison?10:7))+'</text>';});
      axes+='<text x="'+left+'" y="14" text-anchor="start">'+esc(unit)+'</text><text x="'+(w/2)+'" y="'+(h-8)+'" text-anchor="middle">'+(comparison?t('Release date (YYYY/MM/DD)','תאריך פרסום (YYYY/MM/DD)'):t('Reference period (YYYY/MM)','תקופת ייחוס (YYYY/MM)'))+'</text>';
    }
    var baseline='<line class="macro-zero" x1="'+left+'" x2="'+(w-right)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="#cbd5e1" stroke-width="1.5"/>';
    var bars=points.filter(function(p){return typeof p.value==='number'&&Number.isFinite(p.value);}).map(function(p){var height=Math.abs(y(p.value)-y(0));return '<rect class="macro-column '+(p.value<0?'negative':'positive')+'" data-value="'+p.value+'" x="'+(x(p)-barWidth/2)+'" y="'+(p.value<0?y(0):y(p.value))+'" width="'+barWidth+'" height="'+height+'" fill="'+(p.value<0?'#fbbf24':'#67e8f9')+'"><title>'+esc(p.tooltip||period(p.period)+' · '+readable(p.value,unit)+' '+unit)+'</title></rect>';}).join('');
    var dots=points.filter(function(p){return typeof p.consensus==='number'&&Number.isFinite(p.consensus);}).map(function(p){return '<circle class="macro-consensus-dot" aria-label="'+esc(p.tooltip)+'" cx="'+x(p)+'" cy="'+y(p.consensus)+'" r="'+(expanded?5:3)+'" fill="#f472b6" stroke="#0b1526" stroke-width="1.5"><title>'+esc(p.tooltip)+'</title></circle>';}).join('');
    var id='macro-chart-readout-'+(++chartId);
    var readings=points.map(function(p){return {x:x(p),tip:p.tooltip||period(p.period)+' · '+readable(p.value,unit)+' '+unit};});
    var hint=t('Hover or tap to inspect. Focus and use arrow keys for observations.','עברו עם העכבר או הקישו להצגת נתון. במיקוד השתמשו בחצים למעבר בין תצפיות.');
    return '<div class="macro-chart'+(expanded?' expanded':'')+'"><svg dir="ltr" style="direction:ltr" viewBox="0 0 '+w+' '+h+'" role="group" '+(expanded?'tabindex="0" ':'')+'data-readings="'+esc(JSON.stringify(readings))+'" aria-describedby="'+id+'" aria-label="'+esc(t('Column chart','גרף עמודות')+' · '+unit+' · '+hint)+'">'+axes+baseline+bars+dots+'</svg><div id="'+id+'" class="macro-chart-readout" role="status" aria-live="polite" aria-atomic="true" data-hint="'+esc(hint)+'">'+(expanded?esc(hint):'')+'</div></div>';
  }
  function bindCharts(host){
    host.querySelectorAll('.macro-chart svg').forEach(function(svg){
      var readings=JSON.parse(svg.dataset.readings),index=0,output=svg.nextElementSibling;
      function show(i){index=Math.max(0,Math.min(readings.length-1,i));output.textContent=readings[index].tip;svg.parentElement.classList.add('inspecting');}
      function clear(){output.textContent=svg.parentElement.classList.contains('expanded')?output.dataset.hint:'';svg.parentElement.classList.remove('inspecting');}
      function inspect(e){var box=svg.getBoundingClientRect(),x=(e.clientX-box.left)/box.width*svg.viewBox.baseVal.width;var nearest=0;readings.forEach(function(p,i){if(Math.abs(p.x-x)<Math.abs(readings[nearest].x-x))nearest=i;});show(nearest);}
      svg.addEventListener('pointermove',inspect);
      svg.addEventListener('pointerdown',inspect);
      svg.addEventListener('pointerleave',function(e){if(e.pointerType!=='touch'&&document.activeElement!==svg)clear();});
      svg.addEventListener('focus',function(){show(index);});
      svg.addEventListener('blur',clear);
      svg.addEventListener('keydown',function(e){
        if(e.key==='Escape'&&svg.parentElement.classList.contains('inspecting')){e.preventDefault();clear();e.stopPropagation();return;}
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
        e.preventDefault();show(e.key==='Home'?0:e.key==='End'?readings.length-1:index+(e.key==='ArrowLeft'?-1:1));
      });
    });
  }

  function releaseTime(stamp){
    if(!stamp||!Number.isFinite(Date.parse(stamp)))return t('Unavailable','לא זמין');
    return new Intl.DateTimeFormat(he()?'he-IL':'en-GB',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(stamp));
  }
  function verifiedConsensus(r,s){
    var c=r.consensus,stamp=r.released_at||r.scheduled_at;
    return c&&c.access_verified===true&&typeof c.value==='number'&&Number.isFinite(c.value)&&c.unit===s.unit&&c.sa===s.sa&&c.period===r.period&&/^https:\/\//.test(c.source)&&Number.isFinite(Date.parse(c.captured_at))&&Date.parse(c.captured_at)<Date.parse(stamp)&&Date.parse(c.captured_at)<=Date.now()?c:null;
  }
  function events(s){
    var rows=s.releases.map(function(r){return Object.assign({},r,{scheduled_at:r.released_at});});
    (s.calendar||[]).forEach(function(r){if(!rows.some(function(x){return x.period===r.period&&x.scheduled_at===r.scheduled_at;}))rows.push(Object.assign({},r,{actual:null}));});
    return rows.sort(function(a,b){return a.scheduled_at.localeCompare(b.scheduled_at);});
  }
  function comparisonPoints(s){return events(s).map(function(r){
    var c=verifiedConsensus(r,s),actual=Date.parse(r.scheduled_at)<=Date.now()&&typeof r.actual==='number'?r.actual:null;
    var difference=actual!==null&&c?actual-c.value:null;
    var tip=t('Actual','בפועל')+': '+readable(actual,s.unit)+' '+s.unit+' · '+t('Consensus','צפי')+': '+readable(c&&c.value,s.unit)+' '+s.unit+' · '+t('Difference','הפרש')+': '+num(difference)+' '+s.unit+' · '+t('Period','תקופה')+': '+r.period+' · '+t('Release','פרסום')+': '+releaseTime(r.scheduled_at)+' · '+t('Verified source','מקור מאומת')+': '+r.source+(c?' · '+c.source+' · '+c.captured_at:'');
    return {period:r.scheduled_at.slice(0,10),value:actual,consensus:c?c.value:null,tooltip:tip,reference_period:r.period};
  });}
  function nextRelease(s,h){
    var next=(h&&h.next_release)||s.next_release;
    if(next&&Date.parse(next.scheduled_at)<=Date.now())next=null;
    return '<small class="macro-next">'+t('Next release','הפרסום הבא')+': <bdi>'+esc(next?releaseTime(next.scheduled_at):t('Schedule unavailable','לוח פרסומים לא זמין'))+'</bdi></small>';
  }
  function comparison(s,expanded){
    var points=comparisonPoints(s);
    return '<div class="macro-comparison"><div class="macro-legend"><span>▰ '+t('Actual','בפועל')+'</span>'+(points.some(function(p){return p.consensus!==null;})?'<span class="macro-consensus-key">● '+t('Verified consensus','צפי מאומת')+'</span>':'')+'</div>'+chart(points,expanded,s.unit,true)+(points.some(function(p){return p.consensus===null;})?'<small class="macro-state">'+t('Missing verified consensus is not plotted.','צפי מאומת חסר אינו מוצג כנקודה.')+'</small>':'')+'</div>';
  }
  function register(s,h){
    if(!window.WaveSources)return;
    var links=s.releases.map(function(r){return {title:r.table+' · '+r.vintage,url:r.source};});
    s.releases.forEach(function(r){if(r.component_source)links.push({title:r.table,url:r.component_source});});
    (s.calendar||[]).forEach(function(r){links.push({title:'Release calendar · '+r.scheduled_at,url:r.source});});
    events(s).forEach(function(r){var c=verifiedConsensus(r,s);if(c)links.push({title:'Pre-release consensus · '+c.captured_at,url:c.source});});
    if(s.fred)links.push({title:s.agency+' via FRED · '+s.fred,url:'https://fred.stlouisfed.org/series/'+s.fred});
    WaveSources.record('macro:'+s.id,'US Macro · '+s.name,s.detail+'\nCalculation: '+({yoy:'100 × (level / level 12 months earlier − 1)',mom:'100 × (level / previous month level − 1)',difference:'level − previous month level',level:'official published value; no extra transformation'}[s.transform]||'Unavailable')+'. Missing comparison periods stay null. Freshness compares the latest observation period with verified official release dates. No inferred age cutoff. Missing schedules are unavailable; a missed scheduled period is overdue. Failed retrieval is independent and retains previous observations. The calendar and release archive have bounded verified coverage, not automatic ingestion.\n'+s.unit+' · '+s.sa+' · '+s.frequency+'\nRelease extracts are manually verified, bounded coverage; automatic release analysis is not connected. Current FRED history is latest revised data, never first-release history. No verified pre-release consensus provider. ALFRED may lag releases and is not a realtime guarantee.\n'+s.releases.map(function(r){return r.id+' | reference '+r.period+' | released '+r.released_at+' | vintage '+r.vintage+' | verified '+r.verified_at;}).join('\n')+(h?'\nHistory retrieved '+(h.fetched_at||'unavailable')+' | '+h.status:''),links);
  }
  function card(s){
    var h=state.histories[s.id]||{status:s.status==='license_unverified'?s.status:'loading',points:[]},r=latest(s),p=h.points.length?h.points[h.points.length-1]:null;
    var useHistory=p&&(!r||p.period>r.period);
    var value=useHistory?p.value:r?r.actual:null,period=useHistory?p.period:r?r.period:null;
    var label=useHistory?status(h.status):r?t('Verified release','פרסום מאומת'):status(h.status);
    if(h.status==='fetch_failed'||h.status==='release_overdue'||h.status==='schedule_unavailable')label=status(h.status);
    var points=h.points;
    return '<button type="button" class="macro-indicator" data-macro-id="'+s.id+'" aria-haspopup="dialog"><span class="macro-indicator-name">'+esc(he()?s.he:s.name)+'</span><strong dir="ltr">'+num(value)+'</strong><span class="macro-unit" dir="ltr">'+esc(s.unit)+'</span>'+'<small class="macro-state">'+t('Revised observations','תצפיות מתוקנות')+'</small>'+chart(points,false,s.unit)+(events(s).length?comparison(s,false):'')+nextRelease(s,h)+'<span class="macro-period" dir="ltr">'+esc(period?period.slice(0,s.frequency==='weekly'?10:7):'—')+'</span><span class="macro-state">'+esc(label)+'</span></button>';
  }
  function render(){
    var host=document.getElementById('macroDashboard');if(!host)return;
    host.dir=he()?'rtl':'ltr';
    host.innerHTML=[['inflation','Inflation','אינפלציה'],['growth','Economic growth','צמיחה כלכלית'],['labour','Labour market','שוק העבודה']].map(function(g){return '<section class="macro-group"><h2>'+t(g[1],g[2])+'</h2><div class="macro-indicator-grid '+g[0]+'">'+state.series.filter(function(s){return s.group===g[0];}).map(card).join('')+'</div></section>';}).join('');
    bindCharts(host);
    host.querySelectorAll('[data-macro-id]').forEach(function(button){button.onclick=function(){open(button.dataset.macroId,button);};});
  }
  function table(headers,rows){return '<div class="macro-table-wrap"><table><thead><tr>'+headers.map(function(x){return '<th scope="col">'+esc(x)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
  function details(){
    var s=state.series.find(function(x){return x.id===selected;});if(!s)return;
    var focusId=document.activeElement&&document.activeElement.id;
    var dialog=document.getElementById('macroDialog'),body=document.getElementById('macroDetail'),h=state.histories[s.id]||{points:[],status:'loading'};
    dialog.dir=he()?'rtl':'ltr';document.getElementById('macroDialogTitle').textContent=(he()?s.he:s.name)+' · US';
    var releaseId=document.getElementById('macroReleaseSelect')&&document.getElementById('macroReleaseSelect').value;
    var r=s.releases.find(function(x){return x.id===releaseId;})||latest(s);
    var html='<p class="macro-measure" dir="ltr">'+esc(s.unit+' · '+s.sa+' · '+s.frequency)+'</p>';
    html+='<p class="macro-coverage">'+s.releases.length+' '+t('verified release snapshots','פרסומים מאומתים')+' · '+h.points.length+' '+t('revised observations','תצפיות מתוקנות')+'</p>';
    html+='<h3>'+t('Current revised history','היסטוריה לפי הנתונים המעודכנים')+'</h3><p class="macro-state">'+esc(status(h.status))+'</p>'+chart(h.points,true,s.unit)+nextRelease(s,h);
    if(h.error)html+='<p role="status">'+esc(typeof h.error==='string'?h.error:h.error.message)+'</p>';
    if(h.points.length)html+='<details><summary>'+t('Observation values','ערכי התצפיות')+'</summary>'+table([t('Reference period','תקופת ייחוס'),s.unit],h.points.map(function(p){return [p.period,precise(p.value)];}))+'</details>';
    if(h.fetched_at)html+='<p>'+t('Retrieved','נשלף')+': <bdi>'+esc(h.fetched_at)+'</bdi></p>';
    html+='<h3>'+t('Verified release snapshots','גרסאות פרסום מאומתות')+'</h3>';
    if(r){
      html+='<label for="macroReleaseSelect">'+t('Release / vintage','פרסום / גרסה')+'</label> <select id="macroReleaseSelect">'+s.releases.slice().reverse().map(function(x){return '<option value="'+x.id+'"'+(x.id===r.id?' selected':'')+'>'+x.vintage+' · '+x.period.slice(0,7)+'</option>';}).join('')+'</select>';
      html+='<div class="macro-release-metrics">'+[[t('Actual','בפועל'),r.actual],[t('Consensus','קונצנזוס'),verifiedConsensus(r,s)?r.consensus.value:null],[t('Prior reported','קודם שדווח'),r.prior],[t('Prior revised','קודם מתוקן'),r.revised_prior]].map(function(x){return '<div><span>'+x[0]+'</span><strong dir="ltr">'+num(x[1])+'</strong></div>';}).join('')+'</div>';
      html+='<p>'+t('Reference period','תקופת ייחוס')+': <bdi>'+r.period+'</bdi> · '+t('Released','פורסם')+': <bdi>'+r.released_at.replace('T',' ').replace('Z',' UTC')+'</bdi></p>';
      if(!verifiedConsensus(r,s))html+='<p class="macro-state">'+t('Consensus unavailable: no verified pre-release capture.','קונצנזוס לא זמין: אין תיעוד מאומת לפני הפרסום.')+'</p>';
      if(comparisonPoints(s).some(function(p){return p.consensus!==null;}))html+='<h3>'+t('Release actual vs consensus','פרסום בפועל מול צפי')+'</h3>'+comparison(s,true)+nextRelease(s,h);
      html+=table([t('Reference period','תקופת ייחוס'),t('Release','פרסום'),t('Actual','בפועל'),t('Consensus','צפי'),t('Difference','הפרש')],events(s).map(function(x){var c=verifiedConsensus(x,s),a=Date.parse(x.scheduled_at)<=Date.now()&&typeof x.actual==='number'?x.actual:null;return [x.period,releaseTime(x.scheduled_at),num(a),num(c&&c.value),num(a!==null&&c?a-c.value:null)];}));
      if(r.revisions.length)html+='<h3>'+t('Revisions in this release','תיקונים בפרסום זה')+'</h3>'+table([t('Period','תקופה'),t('Previously reported','דווח קודם'),t('Revised','מתוקן')],r.revisions.map(function(x){return [x.period,num(x.before),num(x.after)];}));
      if(r.components.length){
        var units=s.id==='nfp'?t('Thousand jobs · net monthly change','אלפי משרות · שינוי חודשי נטו'):s.id==='gdp'?t('Percentage points · annual GDP growth','נקודות אחוז · צמיחת תוצר שנתית'):t('Percentage-point effects · annual CPI','השפעה בנקודות אחוז · CPI שנתי');
        html+='<h3>'+t('Release decomposition','פירוק הפרסום')+'</h3><p>'+units+'</p>';
        var max=Math.max.apply(null,r.components.map(function(x){return Math.abs(x[1]);}));
        html+='<div class="macro-contributions">'+r.components.map(function(x){return '<div class="macro-contribution"><span>'+esc(x[0])+'</span><div class="macro-bar-track" dir="ltr"><i class="'+(x[1]<0?'negative':'positive')+'" style="width:'+(Math.abs(x[1])/max*49)+'%;'+(x[1]<0?'right':'left')+':50%"></i></div><b dir="ltr">'+(x[1]>0?'+':'')+num(x[1])+'</b></div>';}).join('')+'</div>';
        if(s.id==='nfp')html+='<p>'+t('Positive industry changes','שינויים חיוביים בענפים')+': +'+num(r.components.reduce(function(a,x){return a+Math.max(0,x[1]);},0))+' · '+t('Negative industry changes','שינויים שליליים בענפים')+': '+num(r.components.reduce(function(a,x){return a+Math.min(0,x[1]);},0))+'</p>';
        html+='<p>'+t('Component sum','סכום רכיבים')+': '+num(r.components.reduce(function(a,x){return a+x[1];},0))+' · '+t('Rounding residual to headline','הפרש עיגול לכותרת')+': '+num(r.residual)+'</p>';
      }else html+='<p class="macro-state">'+t('Verified decomposition unavailable for this release.','פירוק מאומת אינו זמין לפרסום זה.')+'</p>';
    }else html+='<p class="macro-state">'+t('Release snapshots unavailable.','גרסאות פרסום אינן זמינות.')+'</p>'+comparison(s,true)+nextRelease(s,h);
    html+=componentDetails(s);
    // Methodology/source details stay in the central registry per AGENTS.md.
    body.innerHTML=html;bindCharts(body);var select=document.getElementById('macroReleaseSelect');if(select)select.onchange=details;var periodSelect=document.getElementById('macroComponentPeriod');if(periodSelect)periodSelect.onchange=details;if(focusId&&body.querySelector('#'+focusId))body.querySelector('#'+focusId).focus();
  }
  function componentDetails(s){
    if(!s.breakdown)return '';
    var data=state.components[s.id]||{status:'loading',rows:[]};
    var title=s.id==='gdp'?t('GDP expenditure contributions · revised history','תרומות הוצאה לתוצר · היסטוריה מעודכנת'):t('PCE component price growth · revised history','שינוי מחירי רכיבי PCE · היסטוריה מעודכנת');
    var html='<section class="macro-component-section macro-components-'+s.id+'"><h3>'+title+'</h3><p class="macro-state">'+esc(status(data.status))+'</p>'+nextRelease(s,data);
    if(data.quality&&data.quality!=='complete')html+='<p>'+esc(status(data.quality))+'</p>';
    if(data.error)html+='<p role="status">'+esc(typeof data.error==='string'?data.error:data.error.message)+'</p>';
    if(!data.rows.length)return html+'</section>';
    var previous=document.getElementById('macroComponentPeriod');
    var row=data.rows.find(function(x){return previous&&x.period===previous.value;})||data.rows[data.rows.length-1];
    html+='<label for="macroComponentPeriod">'+t('Reference period','תקופת ייחוס')+'</label> <select id="macroComponentPeriod">'+data.rows.slice().reverse().map(function(x){return '<option value="'+x.period+'"'+(x.period===row.period?' selected':'')+'>'+x.period.slice(0,7)+'</option>';}).join('')+'</select>';
    if(s.id==='gdp'){
      html+='<p>'+t('Percentage points · annual rate · SA','נקודות אחוז · קצב שנתי · מנוכה עונתיות')+'</p>';
      html+=table([t('Component','רכיב'),t('Contribution (pp)','תרומה (נקודות אחוז)')],row.components.map(function(x){return [he()?x.he:x.name,num(x.value)];}));
      html+='<p>'+t('Real GDP growth','צמיחת תוצר ריאלי')+': '+num(row.headline)+'% · '+t('Component sum','סכום רכיבים')+': '+num(row.sum)+' pp · '+t('Difference to headline','הפרש לכותרת')+': '+num(row.residual)+' pp</p>';
      if(!row.complete||row.reconciled===false)html+='<p role="status">'+t('Complete reconciled breakdown unavailable for this period.','פירוק מלא ומתואם אינו זמין לתקופה זו.')+'</p>';
    }else{
      html+='<p>'+t('Price index 2017=100 · SA; component changes (%)','מדד מחירים 2017=100 · מנוכה עונתיות; שינוי ברכיבים (%)')+'</p>';
      html+=table([t('Component','רכיב'),t('Price index','מדד מחירים'),'% MoM','% YoY'],[[t('All PCE','PCE כולל'),num(row.headline),num(row.mom),num(row.yoy)]].concat(row.components.map(function(x){return [he()?x.he:x.name,num(x.value),num(x.mom),num(x.yoy)];})));
    }
    if(data.fetched_at)html+='<p>'+t('Retrieved','נשלף')+': <bdi>'+esc(data.fetched_at)+'</bdi></p>';
    return html+'</section>';
  }
  async function loadComponents(id){
    var s=state.series.find(function(x){return x.id===id;});if(!s||!s.breakdown||state.components[id])return;
    var generation=state.generation;state.components[id]={status:'loading',rows:[]};
    try{
      var response=await fetch(API+'/api/macro-series?series='+id+'&components=1');if(!response.ok)throw Error('Unavailable');
      var data=await response.json();if(data.id!==id||!Array.isArray(data.rows))throw Error('Invalid components');
    }catch(e){data={id:id,status:'unavailable',rows:[]};}
    if(generation!==state.generation)return;state.components[id]=data;
    if(window.WaveSources)WaveSources.record('macro-components:'+id,'US Macro · '+s.name+' components',(data.table||'')+'\n'+(data.detail||'Component retrieval unavailable.')+'\nHistory basis: latest revised; retrieval is not release time. One-hour in-memory cache; failed refresh retains the complete previous batch with an explicit fetch-failed status. No automatic vintage archive.\nRetrieved '+(data.fetched_at||'unavailable')+' | '+data.status,data.sources||[]);
    if(selected===id&&document.getElementById('macroDialog').open)details();
  }
  function open(id,button){selected=id;opener=button;details();loadComponents(id);document.getElementById('macroDialog').showModal();document.getElementById('macroDialogClose').focus();}
  window.loadMacroDashboard=async function(){
    var generation=++state.generation,host=document.getElementById('macroDashboard');
    if(document.getElementById('macroDialog').open)document.getElementById('macroDialog').close();
    host.innerHTML='<p role="status">'+t('Loading US indicators…','טוען מדדי ארה״ב…')+'</p>';
    try{
      var response=await fetch(API+'/api/macro-series');if(!response.ok)throw Error('Unavailable');
      var data=await response.json();if(!Array.isArray(data.series)||data.country!=='US')throw Error('Invalid data');
      if(generation!==state.generation)return;state.series=data.series;state.histories={};state.components={};render();
      state.series.forEach(function(s){register(s);});
      // Small concurrency limit avoids a burst of provider requests.
      var queue=state.series.filter(function(s){return s.fred;}).slice();
      async function worker(){while(queue.length){var s=queue.shift();try{var r=await fetch(API+'/api/macro-series?series='+s.id);if(!r.ok)throw Error('Unavailable');var h=await r.json();if(h.id!==s.id||!Array.isArray(h.points))throw Error('Invalid history');}catch(e){h={id:s.id,status:'unavailable',points:[]};}if(generation!==state.generation)return;state.histories[s.id]=h;register(s,h);render();if(selected===s.id&&document.getElementById('macroDialog').open)details();}}
      await Promise.all([worker(),worker(),worker()]);
    }catch(e){if(generation===state.generation)host.innerHTML='<p role="alert">'+t('Macro data unavailable. Try Refresh.','נתוני מקרו אינם זמינים. נסו לרענן.')+'</p>';}
  };
  var previousLanguageChange=window.onLangChange;window.onLangChange=function(lang){if(previousLanguageChange)previousLanguageChange(lang);if(state.series.length)render();if(selected)details();};
  document.getElementById('macroDialog').addEventListener('keydown',function(e){
    if(e.key!=='Tab')return;
    var controls=Array.from(this.querySelectorAll('button,select,summary,a[href],[tabindex="0"]')).filter(function(x){return x.getClientRects().length;});
    var first=controls[0],last=controls[controls.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  document.getElementById('macroDialogClose').onclick=function(){document.getElementById('macroDialog').close();};
  document.getElementById('macroDialog').addEventListener('close',function(){var button=document.querySelector('[data-macro-id="'+selected+'"]');selected=null;(button||opener)?.focus();});
})();
