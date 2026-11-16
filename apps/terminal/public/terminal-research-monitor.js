(function(root){
  'use strict';
  var BTC='BTC_BB_LOWER_TOUCH_7D_v1';
  var state={open:false,owner:'',generation:0,rows:[],loading:false,error:false,metric:null,metricLoading:false,selection:null,point:null,form:false,sessionChanging:false};
  var labels={ title:['כותרת','Title'],hypothesis:['מה אתה רוצה לבדוק?','What do you want to test?'],add:['מחקר חדש','New research'],save:['שמור מחקר','Save study'], cancel:['ביטול','Cancel'],details:['פרטים','Details'],close:['סגור פרטים','Close details'], date:['תאריך','Date']};
  function he(){return !root.getLang||root.getLang()==='he';}
  function L(h,e){return he()?h:e;}
  function lbl(k){return L.apply(null,labels[k]);}
  function el(tag,cls,s){var a=document.createElement(tag);if(cls)a.className=cls;if(s!=null)a.textContent=s;return a;}
  function btn(label,fn){var b=el('button','rm-btn',label);b.type='button';b.addEventListener('click',fn);return b;}
  function link(label,href){var a=el('a','rm-btn',label);a.href=href;return a;}
  function bdi(x){var b=el('bdi',null,x);b.dir='ltr';return b;}
  function node(){return document.getElementById('rm-content');}
  function status(){return root.WaveCloud?root.WaveCloud.getStatus():{ready:true,signedIn:false};}
  function wipe(){state.generation++;state.owner='';state.rows=[];state.error=false;state.loading=false;state.selection=null;state.point=null;state.form=false;state.metric=null;state.metricLoading=false;}
  function valid(g,owner){return state.open&&!state.sessionChanging&&state.generation===g&&state.owner===owner&&status().userId===owner;}
  function pct(x){if(x==null||!Number.isFinite(x))return '—';return (x>0?'+':x<0?'−':'')+Math.abs(x).toFixed(2)+' pp';}
  function field(label,value){var x=el('span',null,label+' ');x.append(bdi(value));return x;}
  function callout(heading,body,action){var s=el('div','rm-state');s.append(el('h2',null,heading),el('p','rm-muted',body));if(action)s.append(action);return s;}
  async function db(owner,method,payload,g){
    var cfg=root.WAVE_SUPABASE_CONFIG;
    if(!cfg||!root.WaveCloud)throw Error('cloud unavailable');
    var token=await root.WaveCloud.getAccessToken(owner);
    if(!token||!valid(g,owner))throw Error('session changed');
    var url=new URL('/rest/v1/wave_research_monitors',cfg.url);
    var headers={'apikey':cfg.publishableKey,Authorization:'Bearer '+token,Accept:'application/json'};
    if(method==='GET'){
      url.searchParams.set('select','id,title,hypothesis,template_key,status,created_at,updated_at');
      url.searchParams.set('order','created_at.desc');
    }else{
      headers['Content-Type']='application/json';headers.Prefer='return=minimal';
    }
    var r=await fetch(url,{method:method,headers:headers,cache:'no-store',redirect:'error',...(payload?{body:JSON.stringify(payload)}:{})});
    if(!r.ok){var e=Error('data unavailable');e.conflict=r.status===409;e.rejected=true;throw e;}
    if(method==='GET'){var rows=await r.json();if(!Array.isArray(rows))throw Error('invalid data');return rows;}
  }
  async function load(owner){
    var g=state.generation;state.loading=true;state.error=false;render();
    try{
      var rows=await db(owner,'GET',null,g);
      if(!valid(g,owner))return;
      state.rows=rows;state.loading=false;render();if(rows.some(function(r){return r.template_key===BTC;}))loadMetric();
    }catch(e){if(valid(g,owner)){state.error=true;state.loading=false;render();}}
  }
  async function save(data,b,error){
    var g=state.generation,owner=state.owner;b.disabled=true;error.textContent='';
    try{
      await db(owner,'POST',data,g);
      if(valid(g,owner)){state.form=false;await load(owner);}
    }catch(e){
      if(!valid(g,owner))return;
      if(e.conflict&&data.template_key===BTC){await load(owner);return;}
      error.textContent=e.rejected?L('לא ניתן לשמור את המחקר כרגע.','This study could not be saved.'):L('השמירה לא אומתה. רענן את הרשימה לפני ניסיון נוסף.','Save could not be confirmed. Refresh the list before trying again.');
      if(e.rejected)b.disabled=false;
    }
  }
  async function loadMetric(force){
    if(!state.owner||state.metricLoading||state.metric&&!force)return;
    var g=state.generation,owner=state.owner;state.metricLoading=true;render();
    try{
      var r=await fetch('assets/research/btc-bb/daily.json',{cache:'no-cache'});
      if(!r.ok)throw Error('study unavailable');
      var data=await r.json(), m=root.WaveResearchMetrics;
      if(!m)throw Error('metric unavailable');
      var result=await m.refresh(data,{fetch:root.fetch.bind(root),now:Date.now()});
      if(valid(g,owner)){
        state.metric=result;
        if(root.WaveSources)root.WaveSources.record('research-monitor:btc-bollinger','Research Monitor · BTC Bollinger',
          'Frozen study BTC_BB_LOWER_TOUCH_7D_v1. Binance Vision BTCUSDT 1D, closed UTC candles only. A forward outcome enters the 90-calendar-day rolling window on its 7-day exit date. The benchmark uses unconditional forward outcomes over the same completion window. Episode starts exclude touches in the previous 7 days; the all-touch view can include overlapping observations. Values are percentage-point gaps, not Sharpe or executable strategy performance. On refresh failure the published November 15 snapshot shows individual outcomes by completion date, not a reconstructed time series.',
          [{title:'Binance Vision BTCUSDT 1D',url:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d'}]);
      }
    }catch(_err){if(valid(g,owner))state.metric={unavailable:true};}
    if(valid(g,owner)){state.metricLoading=false;render();}
  }
  function svg(tag,attrs){var e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs).forEach(function(k){e.setAttribute(k,attrs[k]);});return e;}
  function spark(points,metricName,onPick){
    var out=el('div','rm-chart-wrap');
    if(!points.some(function(p){return p.value!=null;})){
      out.append(el('span','rm-muted',state.metricLoading?L('בודק ימי מסחר שהושלמו…','Checking completed days…'):L('אין מספיק תצפיות להצגת גרף','Not enough observations to chart')));
      return out;
    }
    var vals=points.map(function(p){return p.value;}).filter(Number.isFinite);
    var min=Math.min(0,...vals),max=Math.max(0,...vals),scale=max-min||1;
    var chart=svg('svg',{class:'rm-chart',viewBox:'0 0 300 64',role:'img','aria-label':metricName});
    var xx=function(i){return points.length===1?150:8+284*i/(points.length-1);};
    var yy=function(v){return 54-44*(v-min)/scale;};
    chart.append(svg('line',{x1:8,x2:292,y1:yy(0),y2:yy(0),stroke:'#56718b','stroke-dasharray':'4 5'}));
    var d='',on=false,li=-1;
    points.forEach(function(p,i){if(!Number.isFinite(p.value)){on=false;return;}d+=(on?'L':'M')+xx(i)+' '+yy(p.value)+' ';on=true;li=i;});
    chart.append(svg('path',{d:d,fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round'}));
    if(li>=0)chart.append(svg('circle',{cx:xx(li),cy:yy(points[li].value),r:3.5,fill:'currentColor'}));
    if(onPick){
      chart.style.cursor='pointer';
      chart.addEventListener('click',function(ev){
        var bounds=chart.getBoundingClientRect();
        var target=300*(ev.clientX-bounds.left)/bounds.width;
        var pick=null, dist=Infinity;
        points.forEach(function(p,i){var dx=Math.abs(xx(i)-target);if(Number.isFinite(p.value)&&dx<dist){pick=p.date;dist=dx;}});
        if(pick)onPick(pick);
      });
    }
    out.append(chart);return out;
  }
  // Adapt the pure BTC calculation to a display-only chart. Custom research never substitutes price data.
  function viewMetric(){
    var e=state.metric,a=e&&e.result;if(!a)return {points:[]};
    if(!e.refreshed&&e.snapshot){
      var snap=e.snapshot;
      return {mode:'snapshot',asOf:snap.asOf,points:snap.eventReturns.map(function(p){
        return {date:p.date,value:p.value*100,count:snap.completedTouches};
      })};
    }
    var raw=a.series, mode=raw.some(function(p){return Number.isFinite(p.value);})?'episode':'touch';
    var pts=raw.map(function(p){
      var value=mode==='episode'?p.value:p.touchGap;
      return {date:p.date,value:value==null?null:value*100,count:mode==='episode'?p.count:p.touchCount,baselineCount:p.baselineCount};
    });
    return {points:pts,mode:mode,asOf:a.asOf,events:a.events,windowDays:a.windowDays};
  }
  function displayValue(p,m){var s=pct(p&&p.value);return m.mode==='snapshot'?s.replace(' pp','%'):s;}
  function metricTitle(m){
    if(m.mode==='snapshot')return L('תשואת אירוע ל־7 ימים · צילום מצב','7-day event return · snapshot');
    return m.mode==='episode'?L('פער ל־7 ימים מול בסיס · אירועים לא חופפים','7-day gap vs benchmark · episodes'):L('פער ל־7 ימים מול בסיס · כל הנגיעות','7-day gap vs benchmark · all touches');
  }
  function card(r){
    var c=el('article','rm-card');var isBTC=r.template_key===BTC;
    c.append(el('span','rm-badge',isBTC?'BTC / 7D':L('מחקר אישי','Private study')),el('h2',null,r.title));
    if(isBTC){
      var m=viewMetric(),p=m.points[m.points.length-1], title=metricTitle(m);
      var number=el('strong','rm-value',displayValue(p,m));
      c.append(el('span','rm-label',title),number,spark(m.points.slice(-30),title,function(date){state.selection=r.id;state.point=date;render(true);}));
      var meta=el('div','rm-meta');meta.append(field(L('נתונים עד','Data through'),m.asOf||'—'),p?field(L('תצפיות','Observations'),String(p.count)):el('span',null,L('חסר נתון','Data unavailable')));c.append(meta);
    }else{
      c.append(el('p','rm-muted',L('ההשערה נשמרה. עדיין לא מחובר מדד.','Hypothesis saved. No metric connected yet.')));
    }
    var d=btn(lbl('details'),function(){state.selection=r.id;state.point=null;render(true);});d.dataset.rmCard=r.id;c.append(d);return c;
  }
  function detail(r){
    var d=el('section','rm-detail');d.tabIndex=-1;d.dataset.rmDetail='1';
    d.append(el('h2',null,r.title),el('pre',null,r.hypothesis||''));var close=btn(lbl('close'),function(){var id=r.id;state.selection=null;state.point=null;render();Array.from(node().querySelectorAll('[data-rm-card]')).find(function(b){return b.dataset.rmCard===id;})?.focus();});d.append(close);
    if(r.template_key!==BTC)return d;
    var m=viewMetric(), pts=m.points.slice(-30), selected=pts.find(function(p){return p.date===state.point;})||pts[pts.length-1];
    d.append(el('p','rm-muted',L('תוצאה היסטורית: לא נמצא יתרון. המעקב קדימה אינו משנה את המחקר המקורי.','Historical verdict: no edge found. Forward tracking does not revise the original study.')));
    if(pts.length){
      var choice=el('div','rm-points');choice.setAttribute('role','group');choice.setAttribute('aria-label',L('בחר תצפית לפי תאריך','Select an observation date'));
      pts.forEach(function(p){var b=btn(p.date,function(){state.point=p.date;render();Array.from(node().querySelectorAll('[data-rm-point]')).find(function(x){return x.dataset.rmPoint===p.date;})?.focus();});b.classList.add('rm-point');b.dataset.rmPoint=p.date;b.setAttribute('aria-pressed',String(p.date===selected.date));choice.append(b);});
      d.append(choice,el('p',null,selected.date+' · '+displayValue(selected,m)));
      if(m.mode==='snapshot'){
        d.append(el('p','rm-muted',L('זהו צילום המצב שפורסם, לא גרף מתגלגל. לא ניתן לאמת כרגע עדכון מלא ממקור המחירים.','This is the published snapshot, not a rolling series. A complete refresh could not be verified.')));
      }else{
        d.append(el('p','rm-muted',L('תצפיות בחלון: ','Observations in window: ')+selected.count+' · '+L('תצפיות בסיס: ','Benchmark observations: ')+selected.baselineCount));
        var entered=m.events.filter(function(e){return e.exitDate===selected.date&&e.return7d!=null&&(m.mode!=='episode'||e.episode);});
        var expiry=new Date(Date.parse(selected.date+'T00:00:00Z')-m.windowDays*86400000).toISOString().slice(0,10);
        var expired=m.events.filter(function(e){return e.exitDate===expiry&&e.return7d!=null&&(m.mode!=='episode'||e.episode);});
        function describe(es){return es.map(function(e){return e.date+' ('+pct(e.return7d*100).replace(' pp','%')+')';}).join(', ')||'—';}
        d.append(el('p',null,L('נכנסו לחלון: ','Entered window: ')+describe(entered)),el('p',null,L('יצאו מהחלון: ','Left window: ')+describe(expired)));
      }
    }
    d.append(link(L('למחקר המקורי','Open the original study'),'terminal_app.html#page=btc-bb-research'));
    return d;
  }
  function makeForm(){
    var f=el('form','rm-form');var title=el('input'),hyp=el('textarea');title.required=true;title.maxLength=120;hyp.required=true;hyp.maxLength=1600;
    var l=el('label',null,lbl('title'));l.append(title);var h=el('label',null,lbl('hypothesis'));h.append(hyp);
    var buttons=el('div','rm-actions'), err=el('p','rm-muted');err.setAttribute('role','status');
    var saveButton=el('button','rm-btn',lbl('save'));saveButton.type='submit';buttons.append(saveButton,btn(lbl('cancel'),function(){state.form=false;render();}));
    f.append(l,h,buttons,err);f.addEventListener('submit',function(ev){ev.preventDefault();if(!title.value.trim()||!hyp.value.trim()){err.textContent=L('מלא כותרת והשערה.','Enter a title and hypothesis.');return;}save({title:title.value.trim(),hypothesis:hyp.value.trim(),template_key:'custom'},saveButton,err);});return f;
  }
  function render(focus){
    var host=node();if(!host||!state.open)return;
    var auth=status();host.replaceChildren();host.setAttribute('aria-busy',String(state.sessionChanging||!auth.ready||state.loading));
    if(state.sessionChanging||!auth.ready){host.append(callout(L('טוען סביבת עבודה…','Loading workspace…'),''));return;}
    if(!state.owner||!auth.signedIn){host.append(callout(L('המחקרים שלך, בחשבון שלך','Your research, in your account'),L('התחבר כדי לפתוח את סביבת המחקר הפרטית שלך.','Sign in to open your private research workspace.'),link(L('להתחברות','Sign in'),'account.html')));return;}
    if(state.loading){host.append(callout(L('טוען את המחקרים שלך…','Loading your studies…'),''));return;}
    if(state.error){host.append(callout(L('המחקרים לא נטענו','Studies could not be loaded'),L('לא מוצגים נתונים מחשבון אחר או עותק מהמכשיר.','No cached or cross-account data is shown.'),btn(L('נסה שוב','Try again'),function(){load(state.owner);})));return;}
    var toolbar=el('div','rm-toolbar'),actions=el('div','rm-actions'),err=el('span','rm-muted');err.setAttribute('role','status');
    toolbar.append(el('strong',null,L('המחקרים שלי','My studies')),actions);
    actions.append(btn(lbl('add'),function(){state.form=true;render();host.querySelector('.rm-form input')?.focus();}));
    if(!state.rows.some(function(r){return r.template_key===BTC;})){
      var add=btn(L('הוסף דוגמת BTC','Add BTC example'),function(){save({title:'BTC · Bollinger Lower Touch',hypothesis:'After a lower Bollinger Band touch, does BTC differ from the 7-day benchmark?',template_key:BTC},add,err);});
      actions.append(add);
    }
    actions.append(btn(L('רענן','Refresh'),function(){state.metric=null;load(state.owner);}));
    host.append(toolbar,err);
    if(state.form)host.append(makeForm());
    if(!state.rows.length){host.append(callout(L('אין כאן מחקרים עדיין','No studies yet'),L('שמור השערה משלך או הוסף את דוגמת הבולינגר כדי להתחיל. שום דבר לא מתפרסם לציבור.','Save a hypothesis or add the Bollinger example. Nothing is published to the public research section.')));return;}
    var grid=el('div','rm-grid');state.rows.forEach(function(r){grid.append(card(r));});host.append(grid);
    var selected=state.rows.find(function(r){return r.id===state.selection;});if(selected){var panel=detail(selected);host.append(panel);if(focus)panel.focus();}
  }
  function sync(){
    if(!state.open||state.sessionChanging)return;var a=status(),id=a.ready&&a.signedIn?a.userId:'';
    if(id!==state.owner){wipe();state.owner=id;if(id){load(id);return;}}
    render();
  }
  root.addEventListener('wave-cloud-session-changing',function(){state.sessionChanging=true;wipe();render();});
  root.addEventListener('wave-cloud-auth',function(){state.sessionChanging=false;sync();});
  if(root.MutationObserver)new MutationObserver(function(){render();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.WaveResearchMonitor={
    open:function(){state.open=true;sync();},
    close:function(){if(!state.open)return;state.open=false;wipe();var h=node();if(h)h.replaceChildren();}
  };
})(window);
