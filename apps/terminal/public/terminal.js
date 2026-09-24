// ── GREETING ────────────────────────────────────────────────
(function(){
  var h = new Date().getHours();
  var greeting = h < 12 ? t('home.greetingMorning','Good morning') : h < 17 ? t('home.greetingAfternoon','Good afternoon') : t('home.greetingEvening','Good evening');
  document.getElementById('greeting').innerHTML = greeting + ', <span>Daniel</span> ' + (h < 17 ? '☀️' : '🌙');
  var now = new Date();
  var lang = getLang();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('greetingDate').textContent = now.toLocaleDateString(lang==='he'?'he-IL':'en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  (function updateBriefSession(){
    var ilNow = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Jerusalem'}));
    var ilH = ilNow.getHours(), ilM = ilNow.getMinutes();
    var icon, label;
    if(ilH < 16){ icon='🌅'; label='Morning Brief'; window._briefSession='morning'; }
    else if(ilH < 23 || (ilH===23 && ilM < 30)){ icon='🔔'; label='Before Open Brief'; window._briefSession='opening'; }
    else { icon='🌙'; label='End of Day Brief'; window._briefSession='eod'; }
    var timeStr = String(ilH).padStart(2,'0') + ':' + String(ilM).padStart(2,'0');
    var el;
    el = document.getElementById('briefDate');
    if(el) el.textContent = days[ilNow.getDay()] + ' · ' + months[ilNow.getMonth()] + ' ' + ilNow.getDate() + ', ' + ilNow.getFullYear() + ' · ' + timeStr + ' Israel Time';
    el = document.getElementById('briefPageTitle');
    if(el) el.textContent = label;
    el = document.getElementById('briefNavIcon');
    if(el) el.textContent = icon;
    el = document.getElementById('briefNavLabel');
    if(el) el.textContent = ' ' + label;
    el = document.getElementById('briefNavBadge');
    if(el) el.textContent = timeStr;
  })();
})();

// ── CLOCK ─────────────────────────────────────────────────
function updateClock(){
  var now = new Date();
  var h = String(now.getHours()).padStart(2,'0');
  var m = String(now.getMinutes()).padStart(2,'0');
  var s = String(now.getSeconds()).padStart(2,'0');
  document.getElementById('tickerTime').textContent = '🕐 ' + h + ':' + m + ':' + s + ' IL';
}
setInterval(updateClock, 1000);
updateClock();

// ── DEBUG: find what intercepts clicks ────────────────────
document.addEventListener('click', function(e){
  document.title = (e.target.id || e.target.className || e.target.tagName).toString().substr(0,40);
}, true);

// ── NAVIGATION ────────────────────────────────────────────
var currentPage = 'welcome';

function navigate(page){
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  var el = document.getElementById('page-' + page);
  if(el) el.classList.add('active');

  document.querySelectorAll('.icon-btn').forEach(function(b){ b.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(b){ b.classList.remove('active'); });
  var activeNav = document.querySelector('.nav-item[data-page="' + page + '"]');
  if(activeNav) activeNav.classList.add('active');

  // Load Risk Meter when navigating to that page
  if(page === 'risk'){
    setTimeout(loadRiskMeter, 50);
  }

  // Load Sector Strength + Breadth Gauge when navigating to that page
  if(page === 'sectors'){
    setTimeout(loadSectors, 50);
  }

  if(page === 'breadth'){
    setTimeout(loadBreadthPage, 50);
  }

  if(page === 'research'){
    setTimeout(function(){ document.getElementById('researchInput').focus(); }, 100);
  }

  if(page === 'institutions'){
    setTimeout(loadInstitutionsList, 50);
  }

  if(page === 'comm-flows'){
    setTimeout(loadCommFlows, 50);
  }

  if(page === 'mover'){
    setTimeout(function(){ var i=document.getElementById('moverInput'); if(i) i.focus(); }, 100);
  }

  if(page === 'fundchart'){
    setTimeout(function(){ document.getElementById('fcTicker1').focus(); }, 100);
  }

  // Draw BTC/Gold charts when navigating to that page
  if(page === 'btcgold'){
    setTimeout(function(){
      if(nrgDataCache && nrgDataCache.btcPrices){
        drawNrgCharts(nrgDataCache.btcPrices, nrgDataCache.goldPrices);
      } else {
        loadBtcGoldPage();
      }
    }, 60);
  }

  if(page === 'home') { loadNews(); loadSectorPulse(); loadCalendar(); }
  if(page === 'pcr') loadPcrSection();
  if(page === 'housing') setTimeout(loadHousingGauge, 50);
  if(page === 'seasonality') setTimeout(function(){ seasLoad('SPY','S&P 500', document.querySelector('.seas-asset-btn')); }, 50);
  if(page === 'ev')  loadEvPage();

  // Load scanner data when navigating to scanner page
  if(page === 'scanner'){
    if(!scannerData || scannerData.length < 2) loadScannerData();
    else renderScannerTable();
  }

  if(page === 'crypto') loadCryptoDash();
  if(page === 'commodities'){ loadCommodities(); }
  if(page === 'hormuz')     loadHormuz();
  if(page === 'rates') loadRatesPage();
  if(page === 'macro') loadMacroScanner();
  if(page === 'confluence') loadConfluence();
  if(page === 'earnings'){ loadEarningsPage(); earnSetTab(_earnTab); }
  if(page === 'correlation' && !window._corrLoadedOnce){ window._corrLoadedOnce = true; runCorrelation(); }

  // Load brief iframe — pulls from iCloud Trading Briefings folder via Flask
  if(page === 'brief'){
    var frame = document.getElementById('briefFrame');
    frame.src = '';
    frame.src = API + '/api/daily-brief?t=' + Date.now();
    // Auto-refresh every 2 minutes while on this page
    clearInterval(window._briefRefreshTimer);
    window._briefRefreshTimer = setInterval(function(){
      if(currentPage === 'brief'){
        frame.src = API + '/api/daily-brief?t=' + Date.now();
      } else {
        clearInterval(window._briefRefreshTimer);
      }
    }, 2 * 60 * 1000);
  } else {
    clearInterval(window._briefRefreshTimer);
  }

  currentPage = page;
}

// ── WHAT'S MOVING (catalyst deep-dive) ────────────────────
function loadMover(){
  var inp = document.getElementById('moverInput');
  var sym = (inp.value||'').trim().toUpperCase();
  var body = document.getElementById('moverBody');
  if(!sym){ inp.focus(); return; }
  body.innerHTML = '<div style="padding:50px 0;text-align:center;color:#64748b">'
    + '<div class="ar-loading-spinner" style="margin:0 auto 14px"></div>'
    + 'Pulling price, news, SEC filings, Reddit &amp; StockTwits for <b style="color:#e2e8f0">'+sym+'</b>…'
    + '<div style="font-size:11px;margin-top:6px">The AI deep-dive can take 10–20s.</div></div>';
  fetch(API + '/api/ticker-mover?symbol=' + encodeURIComponent(sym))
    .then(function(r){ return r.json(); })
    .then(renderMover)
    .catch(function(e){ body.innerHTML = '<div style="color:#ef4444;padding:24px 0">Failed to analyze: '+e.message+'</div>'; });
}

function _moverSrcTag(t){
  var m = {news:{l:'NEWS',c:'#4a9eff'}, sec_8k:{l:'SEC 8-K',c:'#22c55e'}, reddit:{l:'REDDIT',c:'#fb923c'}, stocktwits:{l:'STOCKTWITS',c:'#a78bfa'}};
  var x = m[t] || {l:(t||'SRC').toUpperCase(),c:'#64748b'};
  return '<span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:'+x.c+';border:1px solid '+x.c+'55;padding:2px 6px;border-radius:5px">'+x.l+'</span>';
}

function renderMover(d){
  var body = document.getElementById('moverBody');
  if(!body) return;
  var html = '';

  // Price header
  if(d.price){
    var up = d.price.pct >= 0, col = up ? '#22c55e' : '#ef4444', sign = up ? '+' : '';
    html += '<div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;border:1px solid #1e293b;background:#0b1120;border-radius:14px;padding:18px 22px;margin-bottom:18px">'
      + '<div style="font-size:30px;font-weight:800;color:#e2e8f0">'+d.symbol+'</div>'
      + '<div style="font-size:26px;font-weight:700;color:#e2e8f0">$'+d.price.price+'</div>'
      + '<div style="font-size:20px;font-weight:700;color:'+col+'">'+sign+d.price.pct+'% <span style="font-size:13px;color:#64748b">today</span></div>'
      + '<div style="font-size:14px;color:'+(d.price.pct_5d>=0?'#22c55e':'#ef4444')+'">'+(d.price.pct_5d>=0?'+':'')+d.price.pct_5d+'% <span style="color:#64748b">5d</span></div>'
      + '<div style="margin-left:auto;font-size:11px;color:#475569">as of '+d.price.asof+'</div>'
      + '</div>';
  } else {
    html += '<div style="color:#f59e0b;border:1px solid #f59e0b44;border-radius:12px;padding:14px 18px;margin-bottom:18px">Couldn\'t confirm a live price for '+(d.symbol||'this ticker')+'. Showing catalysts only.</div>';
  }

  if(d.error){
    html += '<div style="color:#f59e0b;font-size:13px;margin-bottom:16px">'+d.error+'</div>';
  }

  var a = d.analysis || {};
  if(a.lead){
    html += '<div style="font-size:17px;line-height:1.5;color:#e2e8f0;font-weight:600;border-left:3px solid #4a9eff;padding-left:14px;margin-bottom:18px">'+a.lead+'</div>';
  }

  // Ranked catalysts
  if(a.catalysts && a.catalysts.length){
    html += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;margin-bottom:10px">LIKELY CATALYSTS</div>';
    a.catalysts.forEach(function(c){
      var cc = {high:'#22c55e',medium:'#f59e0b',low:'#64748b'}[c.confidence]||'#64748b';
      html += '<div style="border:1px solid #1e293b;background:#0b1120;border-radius:12px;padding:14px 16px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
        + _moverSrcTag(c.source_type)
        + '<span style="font-weight:700;color:#e2e8f0;font-size:14px">'+(c.title||'')+'</span>'
        + '<span style="margin-left:auto;font-size:10px;font-weight:700;color:'+cc+'">'+(c.confidence||'').toUpperCase()+'</span>'
        + '</div>'
        + '<div style="color:#94a3b8;font-size:13px;line-height:1.5">'+(c.why||'')+'</div>'
        + '</div>';
    });
  }

  // Context body
  if(a.body){
    var content = a.body.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n\n/g,'</p><p>');
    html += '<div style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:16px 0"><p>'+content+'</p></div>';
  }

  // Sentiment
  if(d.sentiment && (d.sentiment.bullish || d.sentiment.bearish)){
    html += '<div style="font-size:13px;color:#94a3b8;margin:14px 0">StockTwits tagged sentiment: '
      + '<span style="color:#22c55e;font-weight:700">'+d.sentiment.bullish+' bullish</span> / '
      + '<span style="color:#ef4444;font-weight:700">'+d.sentiment.bearish+' bearish</span>'
      + (a.sentiment_note ? ' — '+a.sentiment_note : '') + '</div>';
  }

  // Sources
  if(d.sources && d.sources.length){
    html += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;margin:22px 0 10px">SOURCES ('+d.sources.length+')</div>';
    d.sources.forEach(function(s){
      html += '<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #131a2a">'
        + _moverSrcTag(s.source_type)
        + '<a href="'+s.url+'" target="_blank" style="color:#93c5fd;font-size:13px;text-decoration:none;flex:1">'+s.title+'</a>'
        + (s.date?'<span style="font-size:10px;color:#475569">'+s.date+'</span>':'')
        + '</div>';
    });
  }

  if(d.disclaimer){
    html += '<div style="font-size:11px;color:#475569;margin-top:18px;font-style:italic">'+d.disclaimer+'</div>';
  }

  body.innerHTML = html || '<div style="color:#64748b;padding:24px 0">No data returned.</div>';
}

// ── NAV PANEL TOGGLE ──────────────────────────────────────
var navVisible = true;
function toggleNav(){
  var panel  = document.getElementById('navPanel');
  var reopen = document.getElementById('navReopen');
  navVisible = !navVisible;
  panel.classList.toggle('collapsed', !navVisible);
  reopen.classList.toggle('visible', !navVisible);
}

// ── SECTION COLLAPSE ─────────────────────────────────────
function toggleSection(id){
  var items = document.getElementById('items-' + id);
  var caret = document.getElementById('caret-' + id);
  var isOpen = items.style.display !== 'none';
  items.style.display = isOpen ? 'none' : 'block';
  if(caret) caret.textContent = isOpen ? '▸' : '▾';
}

// ── TOPIC → VERIFIED UNSPLASH PHOTO ──────────────────────
var PHOTOS = {
  housing:    ['1560518883-ce09059eeffa','1568605114967-8130f3a36994','1512917774080-9991f1c4c750'],
  fed:        ['1554768804-50c1e2b50a6e','1590283603385-17ffb3a7f29f'],
  trade:      ['1558618666-fcd25c85cd64','1494412519320-cd0b0f10c05a'],
  oil:        ['1504711434969-e33886168f5c','1578662996442-48f60103fc96'],
  gold:       ['1610375461246-83df859d849d'],
  crypto:     ['1518546305927-5a555bb7020d'],
  tech:       ['1526374965328-7f61d4dc18c5'],
  jobs:       ['1521737604893-d14cc237f11d','1497366216548-37526070297c'],
  geo:        ['1451187580459-43490279c0fa','1559027615-cd4628902d4a'],
  stocks:     ['1611974789855-9c2a0a7236a3','1590283603385-17ffb3a7f29f'],
};

function headlineToPhoto(headline){
  var h = headline.toLowerCase();
  var key =
    /hous|real estate|mortgage|home price|propert/.test(h) ? 'housing' :
    /fed|federal reserve|fomc|interest rate|powell/.test(h) ? 'fed' :
    /tariff|trade war|import|export|customs|shipping/.test(h) ? 'trade' :
    /oil|energy|opec|crude|wti|brent/.test(h)  ? 'oil' :
    /gold|silver|precious/.test(h)              ? 'gold' :
    /bitcoin|crypto|ethereum|blockchain/.test(h)? 'crypto' :
    /tech|chip|semiconductor|ai|software/.test(h)? 'tech' :
    /job|employ|payroll|labor/.test(h)          ? 'jobs' :
    /geopolit|war|conflict|sanction/.test(h)    ? 'geo' : 'stocks';
  var arr = PHOTOS[key];
  var id  = arr[Math.floor(Math.random() * arr.length)];
  return 'https://images.unsplash.com/photo-' + id + '?w=880&h=380&fit=crop&crop=entropy&q=85';
}

function _hashStr(s){
  var h=0; for(var i=0;i<s.length;i++){h=(Math.imul(31,h)+s.charCodeAt(i))|0;} return h;
}

// Returns the best available image for a story:
// 1. og:image scraped from the article page (exact publisher image)
// 2. Loremflickr keyword image (topic-relevant)
// 3. Hardcoded Unsplash fallback by category
function storyImageUrl(story){
  // Prefer publisher's own og:image
  if(story.image_url && story.image_url.startsWith('http')){
    return story.image_url;
  }
  // Loremflickr with extracted keywords
  var q = (story.image_query || '').trim() || 'stock market finance';
  var keywords = q.split(/\s+/).slice(0, 4).join(',');
  var lock = Math.abs(_hashStr(story.title||''));
  return 'https://loremflickr.com/1200/630/' + keywords + '?lock=' + lock;
}

// ── CATALYST IMAGE ────────────────────────────────────────
function loadCatalystImage(topic){
  var imgEl    = document.getElementById('catalystImg');
  var genBadge = document.getElementById('catalystGenerating');

  imgEl.onload = null;
  imgEl.onerror = null;
  imgEl.classList.remove('loaded');

  var url = headlineToPhoto(topic);

  imgEl.onload  = function(){ imgEl.classList.add('loaded'); genBadge.classList.add('hidden'); };
  imgEl.onerror = function(){ genBadge.classList.add('hidden'); };
  genBadge.classList.remove('hidden');
  imgEl.src = url;
}

// ── LOAD NEWS ─────────────────────────────────────────────
// ── SIDEBAR: Economic Calendar ────────────────────────────────────────────────
async function loadCalendar(){
  try{
    var r = await fetch(API + '/api/econ-calendar');
    var events = await r.json();
    var ilNow = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jerusalem'}));
    var today = ilNow.toISOString().slice(0,10);
    document.getElementById('calDate').textContent = ilNow.toLocaleDateString('en-GB',{day:'numeric',month:'short'});

    var todayEvents = events.filter(function(e){
      return e.date && e.date.slice(0,10) === today && (e.impact==='High'||e.impact==='Medium');
    });
    if(!todayEvents.length){
      todayEvents = events.filter(function(e){ return e.date && e.date.slice(0,10) === today; }).slice(0,6);
    }
    if(!todayEvents.length){
      document.getElementById('calList').innerHTML = '<div style="color:#334155;font-size:11px;padding:4px 0">No major events today</div>';
      return;
    }
    todayEvents.sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); });
    document.getElementById('calList').innerHTML = todayEvents.slice(0,7).map(function(e){
      var imp = (e.impact||'').toLowerCase();
      var t = e.date ? new Date(e.date).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jerusalem'}) : '—';
      var actual = e.actual ? '<span style="color:#22c55e;font-size:10px;font-weight:700">'+e.actual+'</span>' : '';
      return '<div class="cal-row">'
        +'<div class="cal-impact '+imp+'"></div>'
        +'<div class="cal-time">'+t+'</div>'
        +'<div class="cal-title">'+e.title+'</div>'
        +(actual?'<div class="cal-actual">'+e.actual+'</div>':'')
        +'</div>';
    }).join('');
  }catch(e){}
}

// ── SIDEBAR: Sector Pulse ─────────────────────────────────────────────────────
async function loadSectorPulse(){
  try{
    var r = await fetch(API+'/api/sectors');
    var d = await r.json();
    var secs = (d.sectors||[]).slice(0,8);
    var maxAbs = Math.max(...secs.map(function(s){return Math.abs(s.pct||0)}), 0.1);
    var SECTOR_NAMES = {XLK:'Technology',XLV:'Healthcare',XLF:'Financials',XLY:'Cons. Discr.',XLP:'Cons. Staples',XLE:'Energy',XLI:'Industrials',XLB:'Materials',XLRE:'Real Estate',XLU:'Utilities',XLC:'Comm. Services'};
    document.getElementById('sectorPulse').innerHTML = secs.map(function(s){
      var pct = s.pct||0;
      var w   = Math.round(Math.abs(pct)/maxAbs*100);
      var col = pct>=0?'#22c55e':'#ef4444';
      var sym = SECTOR_NAMES[s.symbol] || s.symbol;
      return '<div class="sector-bar-row">'
        +'<div class="sector-bar-label">'+sym+'</div>'
        +'<div class="sector-bar-track"><div class="sector-bar-fill" style="width:'+w+'%;background:'+col+'"></div></div>'
        +'<div class="sector-bar-pct" style="color:'+col+'">'+(pct>=0?'+':'')+pct.toFixed(1)+'%</div>'
        +'</div>';
    }).join('');
  }catch(e){}
}

// ── News Carousel ──────────────────────────────────────────
var _carouselStories=[],_carouselIdx=0,_carouselTimer=null,_carouselProgRAF=null,_carouselProgStart=0;

function _carouselGrad(cat){
  var G={
    'MACRO':'linear-gradient(140deg,rgba(37,99,235,.28) 0%,rgba(10,18,50,.75) 100%)',
    'MARKETS':'linear-gradient(140deg,rgba(22,163,74,.24) 0%,rgba(5,28,16,.8) 100%)',
    'EARNINGS':'linear-gradient(140deg,rgba(124,58,237,.26) 0%,rgba(28,8,60,.8) 100%)',
    'CRYPTO':'linear-gradient(140deg,rgba(234,88,12,.26) 0%,rgba(60,18,4,.8) 100%)',
    'GEO':'linear-gradient(140deg,rgba(220,38,38,.26) 0%,rgba(55,8,8,.8) 100%)',
    'TECH':'linear-gradient(140deg,rgba(14,165,233,.26) 0%,rgba(4,22,45,.8) 100%)',
    'ENERGY':'linear-gradient(140deg,rgba(245,158,11,.26) 0%,rgba(55,28,4,.8) 100%)'
  };
  return G[cat]||G['MARKETS'];
}

function _buildCarouselSlide(s,idx,total){
  var cat=s.category||'MARKETS',t=s.pub?_newsTimeAgo(s.pub):'';
  var imgUrl=storyImageUrl(s);
  var safeTitle=s.title.replace(/'/g,'&apos;').replace(/"/g,'&quot;');
  var safeLink=(s.link||'').replace(/'/g,"\\'");
  var dots='';
  for(var i=0;i<total;i++)
    dots+='<div class="car-dot'+(i===idx?' active':'')+'" onclick="event.stopPropagation();goCarousel('+i+')"></div>';
  return '<div class="car-card" style="background:'+_carouselGrad(cat)+'" onclick="_openStoryArticle('+idx+')">'
    +'<img class="car-bg-img" src="'+imgUrl+'" alt="" onload="this.classList.add(\'loaded\')" onerror="this.style.display=\'none\'">'
    +'<div class="car-overlay"></div>'
    +'<div class="car-content">'
      +'<span class="car-cat wsj-cat wsj-cat-'+cat+'">'+cat+'</span>'
      +'<div class="car-headline">'+s.title+'</div>'
      +(s.desc?'<div class="car-excerpt">'+s.desc+'</div>':'')
      +'<div class="car-foot"><span class="wsj-src">'+s.source+'</span>'+(t?'<span class="wsj-dot"></span><span class="wsj-time">'+t+'</span>':'')+'</div>'
      +'<div class="car-bottom">'
        +'<div class="car-arrows"><button class="car-btn" onclick="event.stopPropagation();stepCarousel(-1)">&#8249;</button></div>'
        +'<div class="car-dots">'+dots+'</div>'
        +'<div class="car-arrows"><button class="car-btn" onclick="event.stopPropagation();stepCarousel(1)">&#8250;</button></div>'
      +'</div>'
      +'<div class="car-progress"><div class="car-progress-fill" id="carProgressFill"></div></div>'
    +'</div>'
    +'</div>';
}

function goCarousel(idx){
  var max=Math.min(_carouselStories.length,5);
  if(!max)return;
  _carouselIdx=((idx%max)+max)%max;
  clearTimeout(_carouselTimer);
  if(_carouselProgRAF)cancelAnimationFrame(_carouselProgRAF);
  var el=document.getElementById('newsCarousel');
  if(!el)return;
  el.innerHTML=_buildCarouselSlide(_carouselStories[_carouselIdx],_carouselIdx,max);
  _carouselProgStart=Date.now();
  (function tick(){
    var f=document.getElementById('carProgressFill');
    if(!f)return;
    var pct=Math.min(100,(Date.now()-_carouselProgStart)/60000*100);
    f.style.width=pct+'%';
    if(pct<100)_carouselProgRAF=requestAnimationFrame(tick);
  })();
  _carouselTimer=setTimeout(function(){goCarousel(_carouselIdx+1);},60000);
}
function stepCarousel(dir){goCarousel(_carouselIdx+dir);}

async function loadNews(){
  try{
    var r=await fetch(API+'/api/top-stories');
    var d=await r.json();
    if(!d.stories||!d.stories.length){
      // Curated archive not populated yet (first run after a fresh install
      // takes a few minutes to write+illustrate the first batch) — fall
      // back to the raw wire feed so the home page isn't empty meanwhile.
      r=await fetch(API+'/api/news');
      d=await r.json();
    }
    var stories=d.stories||[];
    if(!stories.length)return;
    // Keep all 9 (carousel only cycles the first 5 — see goCarousel's
    // Math.min(...,5) — but the secondary grid below opens stories at
    // indices 5-8 via openArticleReader, which reads this same array).
    _carouselStories=stories.slice(0,9);
    _carouselIdx=0;
    var el=document.getElementById('newsList');
    if(!el)return;
    el.innerHTML='<div id="newsCarousel"></div><div class="news-secondary-grid" id="newsSecondary"></div>';
    goCarousel(0);
    var sec=stories.slice(5,9);
    document.getElementById('newsSecondary').innerHTML=sec.map(function(s,i){
      var cat=s.category||'MARKETS',t=s.pub?_newsTimeAgo(s.pub):'';
      var realIdx=i+5;
      return '<div class="news-sec-card" onclick="openArticleReader('+realIdx+')">'
        +'<div class="news-sec-meta"><span class="wsj-cat wsj-cat-'+cat+'">'+cat+'</span>'+(t?'<span class="wsj-dot"></span><span class="wsj-time">'+t+'</span>':'')+'</div>'
        +'<div class="news-sec-headline">'+s.title+'</div>'
        +'</div>';
    }).join('');
  }catch(e){console.error('loadNews:',e);}
}

// ── Wave + Tilt ─────────────────────────────────────────────
function initHeroWave(){
  var canvas=document.getElementById('heroWaveCanvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  function resize(){
    var p=canvas.parentElement||document.body;
    canvas.width=p.offsetWidth||window.innerWidth;
    canvas.height=p.offsetHeight||window.innerHeight;
  }
  resize();
  window.addEventListener('resize',resize);
  var t=0;
  var layers=[
    {amp:26,fA:0.005,fB:0.013,sA:1.1,sB:0.7,a:0.055,r:74,g:158,b:255},
    {amp:16,fA:0.008,fB:0.019,sA:0.85,sB:1.25,a:0.032,r:139,g:92,b:246},
    {amp:38,fA:0.003,fB:0.008,sA:0.55,sB:0.45,a:0.022,r:74,g:158,b:255}
  ];
  (function draw(){
    var w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    layers.forEach(function(l,i){
      ctx.beginPath();
      var base=h*(0.36+i*0.09);
      ctx.moveTo(0,base);
      for(var x=0;x<=w;x+=3){
        var y=base+Math.sin(x*l.fA+t*l.sA)*l.amp+Math.sin(x*l.fB+t*l.sB)*l.amp*0.4;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
      ctx.fillStyle='rgba('+l.r+','+l.g+','+l.b+','+l.a+')';
      ctx.fill();
    });
    t+=0.016;
    requestAnimationFrame(draw);
  })();
}

function initTiltCards(){
  document.querySelectorAll('[data-tilt]').forEach(function(card){
    card.style.transition='transform .12s ease';
    card.addEventListener('mousemove',function(e){
      var r=card.getBoundingClientRect();
      var x=((e.clientX-r.left)/r.width-0.5)*2;
      var y=((e.clientY-r.top)/r.height-0.5)*2;
      card.style.transform='perspective(500px) rotateX('+(-y*6)+'deg) rotateY('+(x*6)+'deg) translateZ(5px)';
    });
    card.addEventListener('mouseleave',function(){card.style.transform='';});
  });
}

function _newsTimeAgo(pubStr){
  try{
    var diff = Math.floor((Date.now() - new Date(pubStr)) / 60000);
    if(diff < 1)   return 'Just now';
    if(diff < 60)  return diff + 'm ago';
    if(diff < 1440) return Math.floor(diff/60) + 'h ago';
    return Math.floor(diff/1440) + 'd ago';
  }catch(e){ return ''; }
}

// ── ARTICLE READER ───────────────────────────────────────
var _arStoryIndex = null;

function _openStoryArticle(idx){
  openArticleReader(idx);
}

function openArticleFromStory(story){
  // Open article reader from any story object — not tied to _carouselStories
  document.getElementById('articleOverlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  var arContent = document.getElementById('arContent');
  var cat = story.category || 'MARKETS';
  var catColor = {MACRO:'#f59e0b',MARKETS:'#4a9eff',EARNINGS:'#22c55e',CRYPTO:'#a78bfa',GEO:'#fb923c',TECH:'#38bdf8',ENERGY:'#f59e0b'}[cat]||'#4a9eff';
  arContent.innerHTML =
    '<div style="width:100%;overflow:hidden;border-radius:0 0 16px 16px;position:relative">'
    +'<img id="arHeroImg" style="width:100%;height:420px;object-fit:cover;display:block;filter:brightness(.75) saturate(1.1)" src="'+storyImageUrl(story)+'" alt="" onerror="this.style.height=\'120px\'">'
    +'<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(2,4,16,1) 0%,transparent 60%)"></div>'
    +'</div>'
    +'<div class="ar-body">'
    +'<span class="ar-cat-pill wsj-cat wsj-cat-'+cat+'" style="margin-bottom:14px">'+cat+'</span>'
    +'<div class="ar-headline">'+story.title+'</div>'
    +'<div class="ar-meta">'
    +'<span class="ar-byline">Wave Capital Intelligence</span>'
    +'<span class="ar-meta-sep">·</span>'
    +'<span>'+(story.source||'News')+'</span>'
    +'</div>'
    +'<div id="arArticleBody">'
    +'<div class="ar-loading"><div class="ar-loading-spinner"></div><div style="font-size:13px">Generating article…</div><div style="font-size:10px;margin-top:6px;color:#1e293b">Gathering sources across Bloomberg, CNBC, Reuters</div></div>'
    +'</div>'
    +'</div>';
  _fetchArticle(story);
}

function openArticleReader(idx){
  _arStoryIndex = idx;
  var s = _carouselStories[idx];
  if(!s) return;
  document.getElementById('articleOverlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  var arContent = document.getElementById('arContent');
  var cat = s.category || 'MARKETS';
  var catColor = {MACRO:'#f59e0b',MARKETS:'#4a9eff',EARNINGS:'#22c55e',CRYPTO:'#a78bfa',GEO:'#fb923c',TECH:'#38bdf8',ENERGY:'#f59e0b'}[cat]||'#4a9eff';
  arContent.innerHTML =
    '<div style="width:100%;overflow:hidden;border-radius:0 0 16px 16px;position:relative">'
    +'<img id="arHeroImg" style="width:100%;height:420px;object-fit:cover;display:block;filter:brightness(.75) saturate(1.1)" src="'+storyImageUrl(s)+'" alt="" onerror="this.style.height=\'120px\'">'
    +'<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(2,4,16,1) 0%,transparent 60%)"></div>'
    +'</div>'
    +'<div class="ar-body">'
    +'<span class="ar-cat-pill wsj-cat wsj-cat-'+cat+'" style="margin-bottom:14px">'+cat+'</span>'
    +'<div class="ar-headline">'+s.title+'</div>'
    +'<div class="ar-meta">'
    +'<span class="ar-byline">Wave Capital Intelligence</span>'
    +'<span class="ar-meta-sep">·</span>'
    +'<span>'+_newsTimeAgo(s.pub)+'</span>'
    +'<span class="ar-meta-sep">·</span>'
    +'<span>'+s.source+'</span>'
    +'</div>'
    +'<div id="arArticleBody">'
    +'<div class="ar-loading"><div class="ar-loading-spinner"></div><div style="font-size:13px">Generating article…</div><div style="font-size:10px;margin-top:6px;color:#1e293b">Gathering sources across Bloomberg, CNBC, Reuters</div></div>'
    +'</div>'
    +'</div>';
  // Fetch generated article
  _fetchArticle(s);
}

function closeArticleReader(){
  document.getElementById('articleOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

async function _fetchArticle(s){
  var body = document.getElementById('arArticleBody');
  if(!body) return;
  try{
    var d;
    if(s.id){
      // Pre-generated top story — read the already-written article + image
      // from the archive instead of paying for a second LLM call.
      var r = await fetch(API+'/api/blog/article/'+s.id);
      d = await r.json();
    } else {
      var params = new URLSearchParams({url: s.link||'', title: s.title||'', source: s.source||'', desc: s.desc||''});
      var r2 = await fetch(API+'/api/article?'+params.toString());
      d = await r2.json();
    }
    if(d.error){
      body.innerHTML = '<div style="padding:24px 0;color:#ef4444;font-size:13px">'+d.error+'</div>';
      return;
    }
    _renderArticle(d, !!(s.id || s.image_url));
  }catch(e){
    if(body) body.innerHTML = '<div style="padding:24px 0;color:#ef4444;font-size:13px">Failed to generate article. '+e.message+'</div>';
  }
}

function _renderArticle(d, keepImage){
  var body = document.getElementById('arArticleBody');
  if(!body) return;
  // Only fall back to a keyword photo search if we don't already have a
  // real image showing (the story's generated/scraped image, or one the
  // caller told us to keep) — this used to unconditionally clobber a good
  // hero image with an unrelated loremflickr keyword match once the
  // article text loaded, which is the "photo doesn't match" bug.
  if(!keepImage && d.image_query){
    var hero = document.getElementById('arHeroImg');
    if(hero){
      var kw = d.image_query.split(/\s+/).slice(0,4).join(',');
      hero.src = 'https://loremflickr.com/1200/630/' + kw;
    }
  }
  var refsHtml = '';
  if(d.sources && d.sources.length){
    refsHtml = '<div class="ar-refs">'
      +'<div class="ar-refs-title">Sources & References</div>'
      +d.sources.map(function(ref, i){
        return '<div class="ar-ref-item">'
          +'<span class="ar-ref-num">['+(i+1)+']</span>'
          +'<a class="ar-ref-link" href="'+ref.url+'" target="_blank">'+ref.title+'</a>'
          +'<span class="ar-ref-src">'+ref.source+'</span>'
          +'</div>';
      }).join('')
      +'</div>';
  }
  // Convert simple markdown to HTML
  var content = (d.body||'').replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h3>$1</h3>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n\n/g,'</p><p>').replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');
  body.innerHTML =
    (d.lead ? '<div class="ar-lead">'+d.lead+'</div>' : '')
    +'<div class="ar-content"><p>'+content+'</p></div>'
    +refsHtml;
}

// ── INIT ─────────────────────────────────────────────────
window.addEventListener('load', function(){
  initHeroWave();
  initTiltCards();
  loadTickerData();
  loadNews();
  loadScannerData();
  loadCalendar();
  loadSectorPulse();
  fetch(API+'/api/earnings').catch(function(){});  // warm up cache on load
  setInterval(loadTickerData, 5 * 60 * 1000);
  setInterval(loadNews, 10 * 60 * 1000);
  setInterval(loadScannerData, 10 * 60 * 1000);
  setInterval(loadSectorPulse, 5 * 60 * 1000);
});

