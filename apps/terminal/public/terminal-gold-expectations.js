/* Annual survey expectations only. No purchase-volume or price inference. */
(function(root){
  'use strict';
  var host, loading=null, saved=null, selected=null, resizeTimer=null;
  var NS='http://www.w3.org/2000/svg';
  var categories=[['increase','Increase','#47bd96'],['unchanged','Unchanged','#e6b65c'],['decrease','Decrease','#dc737a'],['dontKnow','Don’t know','#8996a9']];
  function node(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
  function svg(tag,attrs,text){var e=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){e.setAttribute(k,attrs[k]);});if(text!=null)e.textContent=text;return e;}
  function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value));}
  function safeUrl(value){try{var u=new URL(value);return u.protocol==='https:'?u.href:null;}catch(e){return null;}}
  function validate(data){
    if(!data||data.schemaVersion!==1||!Array.isArray(data.rows))throw new Error('Invalid survey dataset');
    var seen={};
    data.rows.forEach(function(r){
      if(!Number.isInteger(r.year)||r.year<2018||r.year>2100||seen[r.year])throw new Error('Invalid or duplicate survey year');seen[r.year]=true;
      if(!r.shares)throw new Error('Missing answer distribution');
      if(r.notOffered&&(!Array.isArray(r.notOffered)||new Set(r.notOffered).size!==r.notOffered.length))throw new Error('Invalid response options');
      if(r.notOffered&&!r.notOffered.every(function(k){return categories.some(function(c){return c[0]===k&&r.shares[k]===null;});}))throw new Error('Invalid response option');
      var total=0,known=0;categories.forEach(function(c){var v=r.shares[c[0]];if(v!==null&&(!Number.isFinite(v)||v<0||v>100))throw new Error('Invalid percentage');if(v!==null){total+=v;known++;}});
      if(total>102||(known+(r.notOffered||[]).length===4&&Math.abs(total-100)>2))throw new Error('Invalid distribution total');
      if(known>0&&(!safeUrl(r.sourceUrl)||!validDate(r.publishedAt)))throw new Error('Missing survey provenance');
      if(r.questionRespondents!==null&&(!Number.isInteger(r.questionRespondents)||r.questionRespondents<=0))throw new Error('Invalid question sample');
      if(r.totalRespondents!==null&&(!Number.isInteger(r.totalRespondents)||r.totalRespondents<=0))throw new Error('Invalid total sample');
      if(r.questionRespondents!==null&&r.totalRespondents!==null&&r.questionRespondents>r.totalRespondents)throw new Error('Question sample exceeds total');
      if(known+(r.notOffered||[]).length<4&&!r.missingReason)throw new Error('Missing value requires reason');
    });
    return data;
  }
  function register(data){
    if(!root.WaveSources)return;
    var text='World Gold Council annual Central Bank Gold Reserves Survey. Aggregated, anonymized answers about each respondent’s OWN institution: whether its gold reserves will increase, remain unchanged, decrease or don’t know over the next 12 months. These are percentages of answers, not tonnes or forecasts of aggregate demand. This series is not the separate question about expected global central-bank reserves. Each bar is indexed by survey year. The forecast horizon begins at the response date, not January 1. Respondents and question bases can change between surveys. Category labels are kept as published, including rounding. For complete distributions only, bar segment heights are divided by the published total so each full bar is 100% high. Raw totals of 99% or 101% reflect published rounding. Missing shares are never derived as residuals; incomplete bars are not normalized. Partially verified bars show only verified categories, with missing categories explicitly marked in the year detail. No purchase, price or causal comparison is provided.';
    if(data.asOf)text+=' Dataset checked: '+data.asOf+'.';
    if(data.comparabilityNote)text+=' '+data.comparabilityNote;
    if(data.statusText)text+=' '+data.statusText;
    data.rows.forEach(function(r){text+='\n'+r.year+': published '+(r.publishedAt||'unverified')+'; fieldwork '+(r.fieldworkStart||'unverified')+' to '+(r.fieldworkEnd||'unverified')+'; question n='+(r.questionRespondents==null?'unverified':r.questionRespondents)+'; total survey n='+(r.totalRespondents==null?'unverified':r.totalRespondents)+'. '+(r.note||'');});
    root.WaveSources.record('metals:central-bank-expectations','Central-bank gold expectations · World Gold Council',text,data.rows.flatMap(function(r){var links=[];if(safeUrl(r.sourceUrl))links.push({title:r.year+' · WGC survey',url:r.sourceUrl});if(safeUrl(r.distributionSourceUrl)&&r.distributionSourceUrl!==r.sourceUrl)links.push({title:r.year+' · Distribution evidence',url:r.distributionSourceUrl});return links;}));
  }
  function render(data){
    validate(data);host=document.getElementById('goldExpectationsPanel');if(!host)return;
    saved=data;register(data);host.replaceChildren();
    var head=node('div',null,'gold-expectations-heading');
    head.appendChild(node('h2','Central-bank gold expectations'));
    head.appendChild(node('span','World Gold Council / YouGov · Annual survey','gold-expectations-attribution'));host.appendChild(head);
    host.appendChild(node('p','How respondents expect their own institution’s gold reserves to change over the next 12 months (% of respondents)','gold-expectations-label'));
    var rows=data.rows.slice().sort(function(a,b){return a.year-b.year;});
    if(!rows.length){host.appendChild(node('p',data.statusText||'Historical survey series is not available yet.','gold-expectations-status'));return;}
    var wrap=node('div',null,'gold-expectations-chart');
    var compact=(host.clientWidth||900)<650,chartWidth=compact?600:900;
    var chart=svg('svg',{viewBox:'0 0 '+chartWidth+' 300',role:'group','aria-label':'Own-institution gold reserve expectations by survey year. Stacked response shares. Percentage scale 0 to 100.'});
    var left=compact?52:62,width=chartWidth-left-28,step=width/rows.length,base=244,height=200;
    var defs=svg('defs');categories.forEach(function(c){var g=svg('linearGradient',{id:'gold-expectations-'+c[0],x1:'0%',y1:'0%',x2:'100%',y2:'0%'});g.appendChild(svg('stop',{offset:'0%','stop-color':c[2],'stop-opacity':'.72'}));g.appendChild(svg('stop',{offset:'25%','stop-color':c[2]}));g.appendChild(svg('stop',{offset:'78%','stop-color':c[2]}));g.appendChild(svg('stop',{offset:'100%','stop-color':c[2],'stop-opacity':'.76'}));defs.appendChild(g);});chart.appendChild(defs);
    [0,25,50,75,100].forEach(function(t){var y=base-t*height/100;chart.appendChild(svg('line',{x1:left,y1:y,x2:chartWidth-28,y2:y,class:'gold-expectations-grid'}));chart.appendChild(svg('text',{x:left-10,y:y+4,'text-anchor':'end',class:'gold-expectations-axis'},t+'%'));});
    var breakIndex=rows.findIndex(function(r){return (r.notOffered||[]).indexOf('dontKnow')>=0;});
    if(breakIndex>0){var bx=left+breakIndex*step;chart.appendChild(svg('line',{x1:bx,y1:28,x2:bx,y2:base,class:'gold-expectations-break'}));chart.appendChild(svg('text',{x:bx+7,y:18,class:'gold-expectations-axis'},compact?String(rows[breakIndex].year):rows[breakIndex].year+' · “Don’t know” removed'));}
    var legend=node('div',null,'gold-expectations-legend');categories.forEach(function(c){var item=node('span',c[1]);item.style.color=c[2];legend.appendChild(item);});host.appendChild(legend);if(compact&&breakIndex>0)host.appendChild(node('p',rows[breakIndex].year+' · “Don’t know” removed','gold-expectations-break-note'));
    var controls=node('div',null,'gold-expectations-years');controls.setAttribute('aria-label','Select survey year');
    var detail=node('div',null,'gold-expectations-detail');detail.setAttribute('aria-live','polite');
    var buttons=[];
    function select(r){selected=r.year;buttons.forEach(function(b){b.setAttribute('aria-pressed',String(Number(b.dataset.year)===selected));});detail.replaceChildren();
      detail.appendChild(node('strong',r.year+' · Own-institution expectations'));
      categories.forEach(function(c){var answer=node('div',null,'gold-expectations-response');answer.appendChild(node('span',c[1]));var value=node('strong',r.shares[c[0]]==null?((r.notOffered||[]).indexOf(c[0])>=0?'Not offered':'Not verified'):r.shares[c[0]]+'%');value.style.color=c[2];answer.appendChild(value);detail.appendChild(answer);});
      detail.appendChild(node('span','Published '+(r.publishedAt||'date unverified')+' · Next 12 months from survey response'));
      if(r.fieldworkStart&&r.fieldworkEnd)detail.appendChild(node('span','Fieldwork '+r.fieldworkStart+' to '+r.fieldworkEnd));
      detail.appendChild(node('span','Question n = '+(r.questionRespondents==null?'not verified':r.questionRespondents)+' · Total survey n = '+(r.totalRespondents==null?'not verified':r.totalRespondents)));
      if(r.missingReason)detail.appendChild(node('span',r.missingReason));
      var rawTotal=categories.reduce(function(v,c){return v+(r.shares[c[0]]||0);},0);if(categories.every(function(c){return r.shares[c[0]]!=null||(r.notOffered||[]).includes(c[0]);}))detail.appendChild(node('span','Published total: '+rawTotal+'%'+(rawTotal!==100?' · Segment heights scaled to 100% for display only.':'')));
      if(r.note)detail.appendChild(node('span',r.note));
    }
    rows.forEach(function(r,i){var group=svg('g',{role:'button',tabindex:'0','aria-label':r.year+' survey; select to read all response shares'});group.appendChild(svg('title',{},r.year+' · '+categories.map(function(c){return c[1]+': '+(r.shares[c[0]]==null?((r.notOffered||[]).includes(c[0])?'not offered':'not verified'):r.shares[c[0]]+'%');}).join(' · ')+' · World Gold Council / YouGov · '+r.sourceUrl));group.addEventListener('click',function(){select(r);});group.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();select(r);}});chart.appendChild(group);var x=left+step*(i+.5),barWidth=Math.min(54,step*.58);
      var complete=categories.every(function(c){return r.shares[c[0]]!=null||(r.notOffered||[]).includes(c[0]);}),sum=categories.reduce(function(v,c){return v+(r.shares[c[0]]||0);},0),scale=complete&&sum?100/sum:1;
      var cumulative=0;categories.forEach(function(c){var value=r.shares[c[0]];if(value==null)return;var y=base-(cumulative+value)*scale*height/100;group.appendChild(svg('rect',{x:x-barWidth/2,y:y,width:barWidth,height:value*scale*height/100,fill:'url(#gold-expectations-'+c[0]+')',class:'gold-expectations-segment'}));if(value>=8)group.appendChild(svg('text',{x:x,y:y+value*scale*height/200+4,'text-anchor':'middle',class:'gold-expectations-segment-value'},value+'%'));cumulative+=value;});
      if(categories.some(function(c){return r.shares[c[0]]==null&&(r.notOffered||[]).indexOf(c[0])<0;}))group.appendChild(svg('text',{x:x,y:base-cumulative*height/100-10,'text-anchor':'middle',class:'gold-expectations-axis'},'Partial'));
      group.appendChild(svg('text',{x:x,y:base+25,'text-anchor':'middle',class:'gold-expectations-axis'},r.year));
      var b=node('button',r.year);b.type='button';b.dataset.year=r.year;b.addEventListener('click',function(){select(r);});buttons.push(b);controls.appendChild(b);
    });
    wrap.appendChild(chart);host.appendChild(wrap);
    if(rows.some(function(r){var sum=categories.reduce(function(v,c){return v+(r.shares[c[0]]||0);},0);return sum>=98&&sum<=102&&sum!==100;}))host.appendChild(node('p','Complete bars are scaled to 100% height; labels keep the published percentages. Rounding: 2020 totals 101%, 2023 totals 99%. Partial bars are not scaled.','gold-expectations-rounding'));
    host.appendChild(controls);host.appendChild(detail);
    select(rows.find(function(r){return r.year===selected;})||rows[rows.length-1]);
  }
  function load(){
    host=document.getElementById('goldExpectationsPanel');if(!host)return Promise.resolve();
    if(saved){render(saved);return Promise.resolve();}if(loading)return loading;
    host.textContent='Loading annual central-bank expectations…';
    loading=fetch('data/gold-expectations.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error('Unavailable');return r.json();}).then(render).catch(function(){host.replaceChildren(node('h2','Central-bank gold expectations'),node('p','The annual survey series could not be loaded.','gold-expectations-status'));var retry=node('button','Retry');retry.type='button';retry.addEventListener('click',load);host.appendChild(retry);}).finally(function(){loading=null;});return loading;
  }
  if(root.addEventListener)root.addEventListener('resize',function(){clearTimeout(resizeTimer);resizeTimer=setTimeout(function(){if(saved&&host&&host.clientWidth)render(saved);},120);});
  root.WaveGoldExpectations={load:load,render:render,validate:validate};
})(typeof window!=='undefined'?window:globalThis);
