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
