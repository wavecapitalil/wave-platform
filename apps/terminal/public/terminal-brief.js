/* Published editorial editions are immutable, dated assets. The hourly market
 * snapshot is deliberately separate and can never replace this newspaper. */
(function () {
  'use strict';
  var loadedDate = null, loadedVersion = null, pending = null, timer = null, observers = [];
  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function button(label, action, cls) {
    var el = node('button', cls, label); el.type = 'button';
    el.addEventListener('click', action); return el;
  }
  function sources() { if (typeof navigate === 'function') navigate('sources'); }
  function dateText(date) {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('he-IL', {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jerusalem'});
  }
  function asset(path, kind) {
    var extension = kind === 'edition' ? 'edition\\.json' : '[a-zA-Z0-9_-]+\\.(?:png|webp|jpg)';
    if (typeof path !== 'string' || !(new RegExp('^briefs/\\d{4}-\\d{2}-\\d{2}/' + extension + '$')).test(path)) throw new Error('Invalid brief asset');
    return path;
  }
  async function read(path) {
    var controller = new AbortController(), timeout = setTimeout(function(){controller.abort();}, 15000);
    try {
      var result = await fetch(path, {cache:'no-store',signal:controller.signal});
      if (!result.ok) throw new Error('Brief unavailable');
      return await result.json();
    } finally {clearTimeout(timeout);}
  }
  function appendParagraph(parent, item) {
    var p = node(item.kind === 'heading' ? 'h3' : 'p', '', item.text);
    p.dir = 'rtl'; parent.appendChild(p);
  }
  function periodLine(c) {
    var line=node('p','brief-chart-period');
    (c.period+' · '+c.unit).split(' · ').forEach(function(part,i){
      if(i)line.appendChild(node('span','',' · '));
      var text=node('bdi','',part);text.dir=/[\u0590-\u05ff]/.test(part)?'rtl':'ltr';line.appendChild(text);
    });
    return line;
  }
  function interactiveChart(c) {
    var figure=node('figure','brief-chart brief-interactive');
    figure.appendChild(node('h4','',c.title));
    figure.appendChild(periodLine(c));
    var values=c.rows.filter(function(r){return typeof r.value==='number'&&Number.isFinite(r.value);}).map(function(r){return r.value;});
    var low=Math.min.apply(null,[0].concat(values)),high=Math.max.apply(null,[0].concat(values));
    if(low===high)high=low+1;
    var range=high-low,zero=(0-low)/range*100;
    var plot=node('div','brief-bar-plot');plot.dir='ltr';
    var detail=node('div','brief-chart-detail','בחרו עמודה להצגת הערך והתאריך');detail.setAttribute('role','status');
    c.rows.forEach(function(r){
      var known=typeof r.value==='number'&&Number.isFinite(r.value);
      var row=button('',function(){select();},'brief-bar-row');
      var formatted=r.display||(known?String(r.value):'לא זמין');
      row.setAttribute('aria-label',r.label+': '+formatted+'; '+c.period);
      row.appendChild(node('span','brief-bar-label',r.label));
      var track=node('span','brief-bar-track'),axis=node('span','brief-bar-zero');axis.style.left=zero+'%';track.appendChild(axis);
      if(known){
        var bar=node('span','brief-bar');bar.style.left=((Math.min(0,r.value)-low)/range*100)+'%';
        bar.style.width=(Math.abs(r.value)/range*100)+'%';bar.style.background=r.color||(r.value<0?'#bd443b':'#237760');track.appendChild(bar);
      }
      row.appendChild(track);row.appendChild(node('span','brief-bar-value',formatted));
      function select(){
        plot.querySelectorAll('.brief-bar-row').forEach(function(el){el.classList.remove('selected');});row.classList.add('selected');
        detail.textContent=r.label+' · '+formatted+' · '+c.period;
      }
      row.addEventListener('mouseenter',select);row.addEventListener('focus',select);plot.appendChild(row);
    });
    figure.appendChild(plot);figure.appendChild(detail);return figure;
  }
  function timeChart(c) {
    var figure=node('figure','brief-chart brief-interactive brief-time-series');
    figure.appendChild(node('h4','',c.title));
    figure.appendChild(periodLine(c));
    var legend=node('div','brief-chart-legend');legend.dir='ltr';
    c.series.forEach(function(s){var label=node('span','',s.label),swatch=node('i');swatch.style.background=s.color;label.prepend(swatch);legend.appendChild(label);});
    figure.appendChild(legend);
    var ns='http://www.w3.org/2000/svg';
    function svgNode(tag,attrs,text){var e=document.createElementNS(ns,tag);Object.keys(attrs||{}).forEach(function(k){e.setAttribute(k,String(attrs[k]));});if(text!=null)e.textContent=text;return e;}
    var svg=svgNode('svg',{'role':'img','aria-label':c.title+' · '+c.period,'class':'brief-series-svg'});figure.appendChild(svg);
    var slider=node('input','brief-chart-slider');slider.type='range';slider.min='0';slider.max=String(c.labels.length-1);slider.step='1';slider.value=slider.max;
    slider.setAttribute('aria-label','בחירת תצפית · '+c.title);figure.appendChild(slider);
    var detail=node('div','brief-chart-detail brief-series-detail');detail.setAttribute('role','status');figure.appendChild(detail);
    var cursor=null,geometry=null,selected=c.labels.length-1;
    function fmt(v){return v==null?'לא זמין':Number(v).toLocaleString('en-US',{minimumFractionDigits:c.decimals==null?2:c.decimals,maximumFractionDigits:c.decimals==null?2:c.decimals});}
    function select(index){
      selected=Math.max(0,Math.min(c.labels.length-1,index));slider.value=String(selected);
      detail.replaceChildren(node('strong','',c.labels[selected]));
      c.series.forEach(function(s){var value=node('span','',s.label+': '+fmt(s.values[selected])+' '+c.unit);value.dir='auto';detail.appendChild(value);});
      slider.setAttribute('aria-valuetext',c.labels[selected]+': '+c.series.map(function(s){return s.label+' '+fmt(s.values[selected]);}).join(', '));
      if(cursor&&geometry){var x=geometry.x(selected);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
    }
    function draw(){
      if(!figure.isConnected||figure.clientWidth<100)return;
      var width=figure.clientWidth-32,height=width<520?270:330,L=55,R=14,T=14,B=40,plotW=width-L-R,plotH=height-T-B;
      var x0=c.x[0],x1=c.x[c.x.length-1],span=x1-x0||1;
      var vals=[];
      if(c.type==='stacked')c.labels.forEach(function(_,i){vals.push(c.series.reduce(function(sum,s){return sum+Math.max(0,s.values[i]||0);},0));vals.push(c.series.reduce(function(sum,s){return sum+Math.min(0,s.values[i]||0);},0));});
      else c.series.forEach(function(s){s.values.forEach(function(v){if(v!=null&&Number.isFinite(v))vals.push(v);});});
      var min=c.zeroBaseline?0:Math.min.apply(null,vals),max=Math.max.apply(null,vals);
      var pad=(max-min||1)*.08;if(!c.zeroBaseline&&c.type!=='stacked')min-=pad;max+=pad;
      function x(i){return c.type==='stacked'?L+(i+.5)/c.labels.length*plotW:L+(c.x[i]-x0)/span*plotW;}
      function y(v){return T+(max-v)/(max-min)*plotH;}
      geometry={x:x,width:width,L:L,R:R,span:span,x0:x0};
      svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.style.height=height+'px';svg.replaceChildren();
      for(var tick=0;tick<=4;tick++){
        var v=min+(max-min)*tick/4,yy=y(v);
        svg.appendChild(svgNode('line',{x1:L,x2:width-R,y1:yy,y2:yy,stroke:'#d7ded3','stroke-width':1}));
        svg.appendChild(svgNode('text',{x:L-8,y:yy+4,'text-anchor':'end',fill:'#56695c','font-size':11},fmt(v)));
      }
      var ticks=width<450?[0,c.labels.length-1]:[0,Math.floor((c.labels.length-1)/2),c.labels.length-1];
      ticks.forEach(function(i,n){svg.appendChild(svgNode('text',{x:x(i),y:height-12,'text-anchor':n===0?'start':n===ticks.length-1?'end':'middle',fill:'#56695c','font-size':11},c.tickLabels[i]));});
      if(c.type==='stacked'){
        var barW=Math.min(38,plotW/c.labels.length*.64);
        c.labels.forEach(function(_,i){var positive=0,negative=0;c.series.forEach(function(s){var value=s.values[i];if(value!=null){var base=value>=0?positive:negative;svg.appendChild(svgNode('rect',{x:x(i)-barW/2,y:y(Math.max(base,base+value)),width:barW,height:Math.abs(y(base)-y(base+value)),fill:s.color}));if(value>=0)positive+=value;else negative+=value;}});});
      }else{
        c.series.forEach(function(s,si){var d='',previous=null;s.values.forEach(function(v,i){
          if(v==null||!Number.isFinite(v)){previous=null;return;}
          var connected=previous!=null&&(!c.gapAfterMs||c.x[i]-c.x[previous]<=c.gapAfterMs);
          d+=(connected?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)+' ';previous=i;
        });svg.appendChild(svgNode('path',{d:d,fill:'none',stroke:s.color,'stroke-width':2.2,'stroke-linejoin':'round','stroke-dasharray':si>4?'5 3':'none'}));});
      }
      cursor=svgNode('line',{x1:x(selected),x2:x(selected),y1:T,y2:height-B,stroke:'#233f30','stroke-width':1,'stroke-dasharray':'3 3'});svg.appendChild(cursor);select(selected);
    }
    function nearest(event){if(!geometry)return;var rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)*geometry.width/rect.width;
      var best=0;for(var i=1;i<c.x.length;i++)if(Math.abs(geometry.x(i)-px)<Math.abs(geometry.x(best)-px))best=i;select(best);}
    svg.addEventListener('pointermove',nearest);svg.addEventListener('pointerdown',nearest);
    slider.addEventListener('input',function(){select(Number(slider.value));});
    requestAnimationFrame(function(){if(!figure.isConnected)return;draw();var ro=new ResizeObserver(draw);ro.observe(figure);observers.push(ro);});
    return figure;
  }
  function render(data) {
    if (data.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Array.isArray(data.sections) || !data.sections.length) throw new Error('Invalid edition');
    observers.forEach(function(o){o.disconnect();});observers=[];
    var article = node('article', 'brief-paper'); article.lang = 'he'; article.dir = 'rtl';
    article.setAttribute('aria-label', 'בריף הבוקר · ' + dateText(data.date));
    var masthead = node('header', 'brief-masthead');
    masthead.appendChild(node('div', 'brief-brand', 'WAVE CAPITAL · MORNING BRIEFING'));
    masthead.appendChild(node('div', 'brief-edition-line', 'בריף הבוקר · ' + dateText(data.date)));
    article.appendChild(masthead);
    var contents = node('nav', 'brief-contents'); contents.setAttribute('aria-label','מדורי המהדורה');
    data.sections.forEach(function(s, i) {
      contents.appendChild(button(s.kicker, function(){
        var target=document.getElementById('brief-story-'+i);
        if(target) {target.scrollIntoView({behavior:'smooth',block:'start'});target.focus({preventScroll:true});}
      }));
    });
    article.appendChild(contents);
    data.sections.forEach(function(s, i) {
      var section=node('section','brief-story'+(i===0?' brief-lead-story':''));
      section.id='brief-story-'+i; section.tabIndex=-1;
      var header=node('header','brief-story-header');
      header.appendChild(node('div','brief-kicker',s.kicker));
      header.appendChild(node(i===0?'h1':'h2','',s.title));
      if(s.lead)header.appendChild(node('p','brief-deck',s.lead));
      section.appendChild(header);
      (s.charts||[]).forEach(function(c){
        if(c.type==='bars'){section.appendChild(interactiveChart(c));return;}
        if(c.type==='line'||c.type==='stacked'){section.appendChild(timeChart(c));return;}
        var figure=node('figure','brief-chart'), img=node('img');
        img.src=asset(c.src,'image');img.alt=c.alt||s.title;
        img.width=c.width;img.height=c.height;img.loading=i===0?'eager':'lazy';img.decoding='async';
        var link=node('a');link.href=img.src;link.target='_blank';link.rel='noopener';
        link.setAttribute('aria-label',(c.alt||s.title)+' · פתיחת גרף בגודל מלא');link.appendChild(img);
        figure.appendChild(link);section.appendChild(figure);
      });
      if(s.metrics){
        var metrics=node('dl','brief-metrics');metrics.dir='ltr';
        s.metrics.forEach(function(m){var pair=node('div');pair.appendChild(node('dt','',m.label));pair.appendChild(node('dd','',m.value));metrics.appendChild(pair);});
        section.appendChild(metrics);
      }
      if(s.table){
        var wrap=node('div','brief-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',s.title+' · טבלה');
        var table=node('table'),thead=node('thead'),tr=node('tr');
        s.table.headers.forEach(function(h){var th=node('th','',h);th.scope='col';tr.appendChild(th);});thead.appendChild(tr);table.appendChild(thead);
        var tbody=node('tbody');s.table.rows.forEach(function(row){var r=node('tr');row.forEach(function(value){var td=node('td','',value);td.dir='auto';r.appendChild(td);});tbody.appendChild(r);});
        table.appendChild(tbody);wrap.appendChild(table);section.appendChild(wrap);
      }
      var body=node('div','brief-story-body');(s.paragraphs||[]).forEach(function(p){appendParagraph(body,p);});section.appendChild(body);article.appendChild(section);
    });
    var footer=node('footer','brief-paper-footer');
    footer.appendChild(button('מקורות, שיטות ומגבלות הכיסוי',sources,'brief-source-link'));
    footer.appendChild(node('span','',dateText(data.date)));article.appendChild(footer);
    var host=document.getElementById('briefArticle');host.replaceChildren(article);
    document.getElementById('briefDate').textContent='מהדורת '+dateText(data.date);
    document.getElementById('briefPageTitle').textContent='בריף הבוקר';
    document.getElementById('briefNavIcon').textContent='🌅';
    document.getElementById('briefNavBadge').textContent=data.date.slice(8)+'.'+data.date.slice(5,7);
    if(window.WaveSources)WaveSources.record('brief:published','בריף הבוקר · '+dateText(data.date),data.methodology||'',data.sources||[]);
    loadedDate=data.date;
  }
  async function load() {
    if(pending)return pending;
    var status=document.getElementById('briefStatus');
    if(!loadedDate)status.textContent='טוען את מהדורת הבוקר…';
    pending=(async function(){
      try{
        var latest=await read('briefs/latest.json');
        if(latest.schemaVersion!==1||!/^\d{4}-\d{2}-\d{2}$/.test(latest.date)||latest.path!=='briefs/'+latest.date+'/edition.json')throw new Error('Invalid latest edition');
        if(!/^[a-f0-9]{64}$/.test(latest.revision||''))throw new Error('Invalid edition revision');
        if(latest.date+'@'+latest.revision!==loadedVersion){
          var data=await read(asset(latest.path,'edition'));
          if(data.date!==latest.date)throw new Error('Edition date mismatch');
          render(data);
          loadedVersion=latest.date+'@'+latest.revision;
        }
        status.replaceChildren();
      }catch(error){
        status.replaceChildren(node('span','',loadedDate?'לא ניתן לבדוק אם פורסמה מהדורה חדשה. המהדורה המוצגת נשמרה עם התאריך המקורי.':'לא ניתן לטעון כרגע את בריף הבוקר.'));
        status.appendChild(button('ניסיון נוסף',load));
      }finally{pending=null;}
    })();return pending;
  }
  window.WaveBrief={open:function(){load();clearInterval(timer);timer=setInterval(function(){if(!document.hidden)load();},120000);},close:function(){clearInterval(timer);timer=null;},reload:load};
})();
