// Central home for provenance, methodology, disclaimers and confidence details.
(function(){
  var entries = new Map();
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeUrl(s){try{var u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:null;}catch(e){return null;}}
  function render(){
    var host=document.getElementById('sourcesContent');if(!host)return;
    host.innerHTML=Array.from(entries.values()).map(function(e){
      return '<section class="sources-card"><h2>'+esc(e.title)+'</h2><div class="sources-body">'+esc(e.body)+'</div>'+
        (e.links.length?'<div class="sources-links">'+e.links.map(function(l){return '<a target="_blank" rel="noopener noreferrer" href="'+esc(l.url)+'">'+esc(l.title)+'</a>';}).join('')+'</div>':'')+'</section>';
    }).join('');
  }
  function record(key,title,body,links){
    var e={title:String(title||key),body:String(body||''),links:(links||[]).filter(function(l){return safeUrl(l.url);}).map(function(l){return {title:String(l.title||l.url),url:safeUrl(l.url)};})};
    if(!e.body.trim()&&!e.links.length)return;
    if(JSON.stringify(entries.get(key))===JSON.stringify(e))return;
    entries.set(key,e);
    // Keep recent per-company details bounded, while retaining the general guide.
    if(entries.size>100)entries.delete(Array.from(entries.keys()).filter(function(k){return k.indexOf('guide:')!==0;})[0]);
    try{sessionStorage.setItem('wave.sources.v1',JSON.stringify(Array.from(entries)));}catch(e){}
    render();
  }
  function html(key,title,content){
    var t=document.createElement('template');t.innerHTML=String(content||'');
    t.content.querySelectorAll('script,style,iframe').forEach(function(n){n.remove();});
    var links=Array.from(t.content.querySelectorAll('a[href]')).map(function(a){return {title:a.textContent,url:a.getAttribute('href')};});
    t.content.querySelectorAll('div,p,section,h2,h3,summary,li,br').forEach(function(n){n.appendChild(document.createTextNode('\n'));});
    record(key,title,t.content.textContent.replace(/\n\s*\n/g,'\n').trim(),links);
  }
  window.WaveSources={record:record,html:html,render:render};
  try{var saved=JSON.parse(sessionStorage.getItem('wave.sources.v1')||'[]');saved.slice(-100).forEach(function(pair){if(Array.isArray(pair)&&pair[1])record(String(pair[0]),pair[1].title,pair[1].body,Array.isArray(pair[1].links)?pair[1].links:[]);});}catch(e){}
  record('guide:forward','ניתוח חברות — תחזיות ומכפילים',
    'תחזיות EPS נאספות ממקורות זמינים ומקובצות לפי סוף שנת הכספים, מטבע ובסיס חשבונאי. המכפיל מחושב כמחיר חלקי ממוצע ה־EPS. שנת כספים אינה זהה ל־12 החודשים הבאים.\nStockAnalysis משתמש ב־S&P Global ו־Nasdaq בקונצנזוס Zacks. ההתאמות לרווח עשויות להשתנות בין הספקים. נתון ללא בסיס חשבונאי מזוהה אינו נכלל בממוצע. כל ספק נספר פעם אחת.\nמקור יחיד, פער העולה על 20% מהממוצע המוחלט, או תחזיות בעלות סימנים מנוגדים מסומנים באמינות נמוכה. התווית מתארת הסכמה וכיסוי, ולא הסתברות שהתחזית תתממש. תחזית שאינה חיובית אינה מקבלת מכפיל רווח.\nפירוט עדכני לכל חברה שנבדקה מופיע בהמשך העמוד, כולל מקורות שאינם זמינים ותאריכי עדכון.',
    [{title:'StockAnalysis',url:'https://stockanalysis.com/'},{title:'Nasdaq',url:'https://www.nasdaq.com/'},{title:'SEC EDGAR',url:'https://www.sec.gov/edgar'}]);
  function collect(){
    document.querySelectorAll('[data-wave-source]').forEach(function(el){
      if(el.closest('#page-sources'))return;
      var label=el.getAttribute('data-wave-source'),page=el.closest('.page');
      var value=el.textContent.trim();
      if(value&&!/^Loading|^Error:|^—$/.test(value))html('note:'+(page?page.id:'terminal')+':'+label,label,el.innerHTML);
    });
  }
  function init(){
    collect();render();
    var pending=false;
    new MutationObserver(function(changes){
      if(changes.every(function(m){return m.target.nodeType===1&&m.target.closest('#page-sources');}))return;
      if(pending)return;pending=true;
      setTimeout(function(){pending=false;collect();},0);
    }).observe(document.querySelector('.main')||document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
