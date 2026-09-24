// ── MACRO SCANNER ─────────────────────────────────────────────────────────────
var _macroStories   = [];
var _macroTopics    = {};
var _macroActive    = {};  // {CAT: true} — all active by default
var _macroCountries = {};  // {CODE: true} — all active by default

var _MACRO_COUNTRIES = {
  'US':     { flag: '🇺🇸', label: 'USA' },
  'EU':     { flag: '🇪🇺', label: 'Europe' },
  'CN':     { flag: '🇨🇳', label: 'China' },
  'UK':     { flag: '🇬🇧', label: 'UK' },
  'JP':     { flag: '🇯🇵', label: 'Japan' },
  'IL':     { flag: '🇮🇱', label: 'Israel' },
  'GLOBAL': { flag: '🌍', label: 'Global' },
};

function loadMacroScanner(){
  document.getElementById('macroCount').textContent = 'Loading...';
  fetch(API + '/api/macro-news')
    .then(function(r){ return r.json(); })
    .then(function(d){
      _macroStories = d.stories || [];
      _macroTopics  = d.topics  || {};
      if(!Object.keys(_macroActive).length){
        Object.keys(_macroTopics).forEach(function(k){ _macroActive[k] = true; });
      }
      if(!Object.keys(_macroCountries).length){
        Object.keys(_MACRO_COUNTRIES).forEach(function(k){ _macroCountries[k] = true; });
      }
      macroRenderPills();
      macroRenderCountryPills();
      macroRenderGrid();
    }).catch(function(){
      document.getElementById('macroGrid').innerHTML = '<div style="color:#334155;font-size:13px;padding:40px 0;text-align:center">Failed to load — check connection</div>';
    });
}

function macroRenderPills(){
  var counts = {};
  _macroStories.forEach(function(s){ counts[s.category] = (counts[s.category]||0)+1; });
  var html = Object.keys(_macroTopics).map(function(cat){
    var cfg   = _macroStories.find(function(s){return s.category===cat;});
    var color = cfg ? cfg.color : '#475569';
    var emoji = cfg ? cfg.emoji : '';
    var cnt   = counts[cat] || 0;
    var active = _macroActive[cat];
    return '<div class="macro-topic-pill'+(active?' active':'')+'" '
      + 'style="background:'+color+'22;color:'+color+';border-color:'+color+'44" '
      + 'onclick="macroToggle(\''+cat+'\')">'
      + emoji + ' ' + _macroTopics[cat]
      + ' <span style="opacity:.6;font-size:10px">' + cnt + '</span>'
      + '</div>';
  }).join('');
  document.getElementById('macroTopics').innerHTML = html;
}

function macroRenderCountryPills(){
  var counts = {};
  _macroStories.forEach(function(s){ var c = s.country||'US'; counts[c]=(counts[c]||0)+1; });
  var html = Object.keys(_MACRO_COUNTRIES).map(function(code){
    var cfg    = _MACRO_COUNTRIES[code];
    var cnt    = counts[code] || 0;
    var active = _macroCountries[code];
    var baseCls = 'macro-topic-pill' + (active ? ' active' : '');
    return '<div class="'+baseCls+'" '
      + 'style="background:rgba(148,163,184,0.1);color:#94a3b8;border-color:rgba(148,163,184,0.2)" '
      + 'onclick="macroCountryToggle(\''+code+'\')" title="Toggle '+cfg.label+' news">'
      + cfg.flag + ' ' + cfg.label
      + ' <span style="opacity:.5;font-size:10px">'+cnt+'</span>'
      + '</div>';
  }).join('');
  var el = document.getElementById('macroCountryPills');
  if(el) el.innerHTML = html;
}

function macroToggle(cat){
  _macroActive[cat] = !_macroActive[cat];
  macroRenderPills();
  macroRenderGrid();
}

function macroCountryToggle(code){
  _macroCountries[code] = !_macroCountries[code];
  macroRenderCountryPills();
  macroRenderGrid();
}

function macroRenderGrid(){
  var visible = _macroStories.filter(function(s){
    return _macroActive[s.category] && _macroCountries[s.country||'US'];
  });
  var activeCntries = Object.keys(_macroCountries).filter(function(k){ return _macroCountries[k]; }).length;
  document.getElementById('macroCount').textContent = visible.length + ' stories · ' + Object.values(_macroActive).filter(Boolean).length + ' topics · ' + activeCntries + ' regions';
  if(!visible.length){
    document.getElementById('macroGrid').innerHTML = '<div style="color:#334155;font-size:13px;padding:40px 0;text-align:center">No stories match selected topics</div>';
    return;
  }
  var cards = visible.map(function(s){
    var t = s.pub ? _newsTimeAgo(s.pub) : '';
    return '<div class="macro-card" style="border-left-color:'+s.color+'" onclick="window.open(\''+s.link.replace(/'/g,"\\'") +'\',\'_blank\')">'
      + '<div class="macro-card-top">'
      +   '<span class="macro-card-emoji">'+s.emoji+'</span>'
      +   '<span class="macro-card-label" style="color:'+s.color+'">'+s.label+'</span>'
      +   '<span class="macro-card-src">'+s.source+'</span>'
      +   (t?'<span class="macro-card-time" style="color:#334155">'+t+'</span>':'')
      + '</div>'
      + '<div class="macro-card-headline">'+s.title+'</div>'
      + (s.desc?'<div class="macro-card-desc">'+s.desc+'</div>':'')
      + '</div>';
  }).join('');
  document.getElementById('macroGrid').innerHTML = '<div class="macro-grid">'+cards+'</div>';
}

