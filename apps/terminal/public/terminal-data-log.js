/* Shared provenance registry. Metric modules call WaveDataLog.record; this page renders it.
   Sources & Methodology stays the sidebar page and receives a mirrored copy unless skipSources is set.
   Sector Research passes { page, title, symbol, fetchedAt, fields: [...] }; that shape is normalized here. */
(function(){
  var entries=new Map();
  var timer=null;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeUrl(s){try{var u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:null;}catch(e){return null;}}
  function text(key,fallback){return typeof t==='function'?t(key,fallback):fallback;}
  function clean(v){return String(v==null?'':v).trim();}
  function linksOf(list){return (list||[]).filter(function(l){return l&&safeUrl(l.url);}).map(function(l){return {title:clean(l.title)||safeUrl(l.url),url:safeUrl(l.url)};});}
  function persist(){try{sessionStorage.setItem('wave.datalog.v1',JSON.stringify(Array.from(entries)));}catch(e){}}
  function cell(v){return esc(clean(v)||'—');}
  function fromFields(key,entry){
    var fields=entry.fields||[];
    var links=[];
    fields.forEach(function(field){(field.links||[]).forEach(function(link){if(link)links.push(link);});});
    var notes=fields.map(function(field){
      return [field.label, field.display!=null?field.display:field.value, field.unit, field.source, field.note].filter(function(part){return part!=null&&String(part).trim()!=='';}).join(' · ');
    }).filter(Boolean).join('\n');
    var source=fields.map(function(field){return field.source;}).filter(Boolean)[0]||'';
    return {
      section: entry.page==='sector-research'?'Sector Research':clean(entry.section||entry.page),
      metric: clean(entry.title||entry.symbol||entry.metric)||clean(key),
      source: source,
      pulledAt: clean(entry.fetchedAt||entry.pulledAt),
      coverage: clean(entry.coverage),
      notes: notes,
      links: linksOf(links),
      skipSources: true
    };
  }
  function render(){
    var host=document.getElementById('dataLogContent');if(!host)return;
    var rows=Array.from(entries.values());
    if(!rows.length){host.innerHTML='<p class="data-log-empty">'+esc(text('datalog.empty','No provenance recorded yet. Open a market or research screen to pull data.'))+'</p>';return;}
    var heads=[['datalog.col.section','Section'],['datalog.col.metric','Metric'],['datalog.col.source','Source'],['datalog.col.pulled','Last pull'],['datalog.col.coverage','Coverage'],['datalog.col.notes','Notes']];
    host.innerHTML='<div class="data-log-scroll"><table class="data-log-table"><thead><tr>'+
      heads.map(function(c){return '<th>'+esc(text(c[0],c[1]))+'</th>';}).join('')+
      '</tr></thead><tbody>'+rows.map(function(e){
        var noteBody=e.notes.length>420?'<details><summary>'+esc(e.notes.slice(0,160))+'…</summary>'+esc(e.notes)+'</details>':esc(e.notes);
        var notes=noteBody+(e.links.length?'<div class="data-log-links">'+e.links.map(function(l){return '<a target="_blank" rel="noopener noreferrer" href="'+esc(l.url)+'">'+esc(l.title)+'</a>';}).join('')+'</div>':'');
        return '<tr><td>'+cell(e.section)+'</td><td>'+cell(e.metric)+'</td><td>'+cell(e.source)+'</td><td>'+cell(e.pulledAt)+'</td><td>'+cell(e.coverage)+'</td><td class="data-log-notes">'+notes+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  function schedule(){if(timer)return;timer=setTimeout(function(){timer=null;render();},0);}
  function record(key,entry){
    entry=entry||{};
    var skipSources=!!entry.skipSources;
    if(Array.isArray(entry.fields)){
      var adapted=fromFields(key,entry);
      skipSources=true;
      entry=adapted;
    }
    var e={
      section:clean(entry.section),
      metric:clean(entry.metric)||clean(key),
      source:clean(entry.source),
      pulledAt:clean(entry.pulledAt),
      coverage:clean(entry.coverage),
      notes:clean(entry.notes),
      links:linksOf(entry.links)
    };
    if(!e.metric&&!e.notes&&!e.source&&!e.coverage)return;
    key=String(key);
    var prev=entries.get(key);
    if(prev&&JSON.stringify(prev)===JSON.stringify(e))return;
    entries.set(key,e);
    if(entries.size>180){
      var drop=Array.from(entries.keys()).find(function(k){return k.indexOf('src:')===0;})||entries.keys().next().value;
      if(drop&&drop!==key)entries.delete(drop);
    }
    persist();
    if(!skipSources&&window.WaveSources){
      var body=['Source: '+(e.source||'—'),'Last pull: '+(e.pulledAt||'—'),'Coverage: '+(e.coverage||'—'),e.notes].filter(Boolean).join('\n');
      WaveSources.record('datalog:'+key,(e.section?e.section+' · ':'')+e.metric,body,e.links);
    }
    schedule();
  }
  function list(){return Array.from(entries.values());}
  window.WaveDataLog={record:record,render:render,list:list};
  try{
    JSON.parse(sessionStorage.getItem('wave.datalog.v1')||'[]').slice(-180).forEach(function(pair){
      if(Array.isArray(pair)&&pair[1])record(String(pair[0]),Object.assign({},pair[1],{skipSources:true}));
    });
  }catch(e){}
  var previousLang=window.onLangChange;
  window.onLangChange=function(lang){if(typeof previousLang==='function')previousLang(lang);render();};
})();
