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
  function sessionTable(){
    var rows=Array.from(entries.values());
    if(!rows.length) return '<p class="data-log-empty">'+esc(text('datalog.empty','No visit notes yet. Open a market or research screen and the metric notes appear here.'))+'</p>';
    var heads=[['datalog.col.section','Section'],['datalog.col.metric','Metric'],['datalog.col.source','Source'],['datalog.col.pulled','Last pull'],['datalog.col.coverage','Coverage'],['datalog.col.notes','Notes']];
    return '<div class="data-log-scroll"><table class="data-log-table"><thead><tr>'+
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

  /* Feed inventory. Timestamps are filled by open() from a live file, payload, or workflow run.
     Rows stay on this page: they are not copied into WaveSources. */
  var GH='https://api.github.com/repos/wavecapitalil/wave-platform/actions/workflows/';
  var ENGINE='writer .github/workflows/data-engine.yml cron 7 * * * * (hourly, minimum refresh 60m)';
  var FEEDS=[
    {id:'home-strip',he:'בית · פס שוק וסרגל טיקרים',en:'Home · Market strip and ticker bar',provider:'Yahoo Finance',endpoint:'GET /api/quote?symbol=SPY|QQQ|^VIX|GC=F|DX-Y.NYB|^TNX|CL=F|GLD · snapshot market:core',frequency:'Browser every 5 min · '+ENGINE,mode:'datasets',match:'one',keys:['market:core'],notes:'loadTickerData. Sparkline symbols use the intraday feed below. FXE is separate.'},
    {id:'home-eur',he:'בית · כרטיס אירו',en:'Home · Euro card',provider:'Yahoo Finance',endpoint:'GET /api/quote?symbol=FXE · wave-core fallback, not in market:core',frequency:'Browser every 5 min, inside loadTickerData',mode:'probe',probes:['/api/quote?symbol=FXE']},
    {id:'home-btc',he:'בית · ביטקוין',en:'Home · Bitcoin',provider:'Binance Spot',endpoint:'GET /api/crypto-market/quote?symbol=BTCUSDT · https://data-api.binance.vision/api/v3/ticker/24hr · snapshot crypto:market',frequency:'Browser every 5 min · '+ENGINE,mode:'datasets',match:'one',keys:['crypto:market']},
    {id:'home-spark',he:'בית · קווי מגמה',en:'Home · Sparklines',provider:'Binance klines and Yahoo intraday',endpoint:'GET /api/crypto-market/klines?symbol=BTCUSDT&interval=5m · GET /api/intraday?symbol=SPY|QQQ|GLD|USO|^VIX|^TNX|FXE',frequency:'With the 5 min ticker poll · live wave-core, not a snapshot',mode:'probe',probes:['/api/crypto-market/klines?symbol=BTCUSDT&interval=5m&limit=5','/api/intraday?symbol=SPY']},
    {id:'home-news',he:'בית · כתבות',en:'Home · Articles',provider:'Top stories, then Bloomberg, CNBC, FT, MarketWatch, Yahoo Finance RSS',endpoint:'GET /api/top-stories, else GET /api/news · opening a story calls GET /api/blog/article/{id} or GET /api/article',frequency:'Browser every 10 min · route TTL 15m, engine minimum 60m',mode:'datasets',match:'ok',keys:['api:/api/top-stories','api:/api/news'],notes:'Homepage carousel, first five stories.'},
    {id:'home-sectors',he:'פעימת סקטורים וחוזק סקטורים',en:'Home sector pulse and Sector Strength',provider:'Yahoo Finance sector ETFs',endpoint:'GET /api/sectors · snapshot sectors:sp500 · XLK XLC XLY XLF XLI XLV XLP XLB XLE XLRE XLU',frequency:'Browser every 5 min, and when the Sectors page opens · '+ENGINE,mode:'datasets',match:'one',keys:['sectors:sp500'],notes:'Same payload for loadSectorPulse and loadSectors. Source is Yahoo Finance via yfinance.'},
    {id:'home-calendar',he:'בית · לוח כלכלי',en:'Home · Economic calendar',provider:'Fair Economy',endpoint:'GET /api/econ-calendar · https://nfs.faireconomy.media/ff_calendar_thisweek.json · snapshot macro:calendar',frequency:'On load and when returning Home · '+ENGINE,mode:'datasets',match:'one',keys:['macro:calendar']},
    {id:'breadth',he:'רוחב שוק',en:'Market breadth',provider:'Yahoo Finance',endpoint:'GET /api/quote?symbol=SPY|QQQ|IWM|RSP|MDY',frequency:'When the Breadth page opens',mode:'blend'},
    {id:'crypto-scanner',he:'סורק קריפטו',en:'Crypto scanner',provider:'Crypto scanner route',endpoint:'GET /api/crypto-scanner',frequency:'Browser every 10 min · route TTL 15m, engine minimum 60m',mode:'datasets',match:'one',keys:['api:/api/crypto-scanner']},
    {id:'crypto-dash',he:'לוח קריפטו',en:'Crypto dashboard',provider:'Crypto cohort, news and on-chain routes',endpoint:'GET /api/crypto-global · /api/cohort-performance · /api/cohort-prices · /api/cohort-news · /api/token-detail · /api/onchain-kpi · /api/onchain-history',frequency:'When the Crypto page opens · engine hourly',mode:'datasets',match:'all',keys:['api:/api/crypto-global','api:/api/cohort-performance?period=24h'],optional:['api:/api/onchain-kpi?kpi=tvl']},
    {id:'earnings',he:'לוח דוחות',en:'Earnings calendar',provider:'Earnings route',endpoint:'GET /api/earnings',frequency:'Warmup on load · the Earnings page re-reads every 5s · route TTL 6h, checked hourly',mode:'datasets',match:'one',keys:['api:/api/earnings'],notes:'The 5s timer re-reads the snapshot. It does not pull the provider every 5s.'},
    {id:'risk',he:'מד סיכון',en:'Risk meter',provider:'Yahoo Finance and CBOE',endpoint:'GET /api/risk-signals · snapshot risk:composite · https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json',frequency:'When the Risk page opens · '+ENGINE,mode:'datasets',match:'one',keys:['risk:composite']},
    {id:'pcr',he:'יחס פוט/קול',en:'Put/call ratio',provider:'CBOE',endpoint:'GET /api/pcr',frequency:'When the PCR page opens · route TTL 60m',mode:'datasets',match:'one',keys:['api:/api/pcr']},
    {id:'housing',he:'מד דיור',en:'Housing gauge',provider:'Yahoo Finance history and FRED',endpoint:'GET /api/history?symbol=WOOD|GLD|COPX|XHB|SPY|^VIX|DX-Y.NYB · GET /api/fred?series=BAMLH0A0HYM2|T10Y2Y|NFCI',frequency:'When the Housing page opens · live wave-core',mode:'probe',probes:['/api/fred?series=T10Y2Y','/api/history?symbol=SPY&days=5']},
    {id:'rates',he:'ריביות ותשואות',en:'Rates and yields',provider:'Yahoo Finance',endpoint:'GET /api/yields · snapshot rates:curve · ^IRX 2YY=F ^FVX ^TNX ^TYX',frequency:'When the Rates page opens · '+ENGINE,mode:'datasets',match:'one',keys:['rates:curve']},
    {id:'metals',he:'יחס זהב/כסף',en:'Gold/silver ratio',provider:'Yahoo Finance futures',endpoint:'GET /api/commodities/gold-silver-ratio · snapshot metals:gold-silver · GC=F and SI=F',frequency:'When Commodities opens · '+ENGINE,mode:'datasets',match:'one',keys:['metals:gold-silver']},
    {id:'gold-file',he:'ציפיות הבנקים המרכזיים לזהב',en:'Central-bank gold expectations',provider:'World Gold Council',endpoint:'data/gold-expectations.json · gold-expectations-qa.yml checks pull requests and does not rewrite the file',frequency:'Annual survey file, read when the chart opens',mode:'file',file:'data/gold-expectations.json',pick:'asOf',maxAge:450*24*60,notes:'Annual survey vintage. A date inside the last 450 days is current.'},
    {id:'hormuz',he:'מצר הורמוז',en:'Strait of Hormuz',provider:'Hormuz summary route',endpoint:'GET /api/hormuz/summary',frequency:'When the page opens · route TTL 15m, engine minimum 60m',mode:'datasets',match:'one',keys:['api:/api/hormuz/summary']},
    {id:'ev',he:'שוק רכב חשמלי',en:'EV market',provider:'EV market route',endpoint:'GET /api/ev-market',frequency:'When the page opens · route TTL 24h',mode:'datasets',match:'one',keys:['api:/api/ev-market']},
    {id:'flows-crypto',he:'תזרימים · פוזיציות קריפטו',en:'Flows · Crypto positioning',provider:'Binance USD-M futures',endpoint:'GET /api/flows/crypto?pair=BTCUSD|ETHUSD&period=1h|4h|1d',frequency:'When the flows tab opens · cache marked stale after 90 min',mode:'probe',probes:['/api/flows/crypto?pair=BTCUSD&period=1h']},
    {id:'flows-futures',he:'תזרימים · חוזים',en:'Flows · Futures',provider:'Futures positioning route',endpoint:'GET /api/flows/futures?asset=gold|silver|oil|natgas|sp500|nasdaq|dow',frequency:'When the tab opens · route TTL 7d',mode:'datasets',match:'all',prefixes:['api:/api/flows/futures?']},
    {id:'flows-options',he:'תזרימים · אופציות',en:'Flows · Options',provider:'Options flow route',endpoint:'GET /api/flows/options?symbol=SPY|QQQ|AAPL|NVDA|TSLA',frequency:'When the tab opens · route TTL 60m',mode:'datasets',match:'all',prefixes:['api:/api/flows/options?']},
    {id:'flows-short',he:'תזרימים · שורט',en:'Flows · Short interest',provider:'Short-interest route',endpoint:'GET /api/flows/short-interest?symbol=SPY|QQQ|AAPL|NVDA|TSLA',frequency:'When the tab opens · route TTL 24h',mode:'datasets',match:'all',prefixes:['api:/api/flows/short-interest?']},
    {id:'macro',he:'לוח מאקרו ארה״ב',en:'US macro dashboard',provider:'FRED',endpoint:'GET /api/macro-series · GET /api/macro-series?series={id} · https://fred.stlouisfed.org/graph/fredgraph.csv?id= · macro.yml is a pull-request check, not a writer',frequency:'When the Macro page opens · one-hour memory cache',mode:'probe',probes:['/api/macro-series?series=cpi']},
    {id:'macro-news',he:'כותרות מאקרו',en:'Macro headlines',provider:'Macro news route',endpoint:'GET /api/macro-news',frequency:'When the Macro page opens · route TTL 15m, engine minimum 60m',mode:'datasets',match:'one',keys:['api:/api/macro-news']},
    {id:'seasonality',he:'גרף עונתיות',en:'Seasonality chart',provider:'Yahoo Finance',endpoint:'GET /api/seasonality?symbol=&years=10 · snapshots seasonality:SPY|QQQ|GLD|BTC-USD|IWM|TLT|USO|EEM|DX-Y.NYB|^TNX',frequency:'When the Seasonality page opens · TTL 24h',mode:'datasets',match:'all',prefixes:['seasonality:']},
    {id:'research-seasonality',he:'עונתיות במחקר',en:'Research seasonality',provider:'Yahoo Finance daily chart',endpoint:'GET /api/research-seasonality?symbol= · https://query1.finance.yahoo.com/v8/finance/chart/',frequency:'When a research seasonality panel opens · response cache 1h',mode:'probe',probes:['/api/research-seasonality?symbol=SPY']},
    {id:'tape',he:'סרט שוק במחקר',en:'Research market tape',provider:'Yahoo Finance daily chart',endpoint:'GET /api/research-tape?symbol=SPY|QQQ|^VIX|BTC-USD|GC=F|DX-Y.NYB|^TNX|CL=F · https://query1.finance.yahoo.com/v8/finance/chart/',frequency:'Browser every 5 min · response cache 5 min',mode:'probe',probes:['/api/research-tape?symbol=SPY']},
    {id:'sector-research',he:'מחקר סקטור',en:'Sector research',provider:'State Street daily holdings, Yahoo Finance fallback',endpoint:'GET /api/etf-holdings?symbol= · default SOXX · wave-core cache 15 min',frequency:'When Sector Research opens',mode:'probe',probes:['/api/etf-holdings?symbol=SOXX']},
    {id:'sector-detail',he:'פירוט סקטור',en:'Sector drill-down',provider:'Sector detail and universe routes',endpoint:'GET /api/sector-detail?sector=&period=1d|1w|1m|3m · GET /api/sector-universe?sector=',frequency:'When a sector is opened · 1d TTL 15m, 1w 60m, 1m 4h, 3m and universe 24h',mode:'datasets',match:'all',prefixes:['api:/api/sector-detail?','api:/api/sector-universe?']},
    {id:'catalysts',he:'לוח קטליזטורים',en:'Catalyst calendar',provider:'SEC EDGAR, SEC full text, openFDA, Yahoo earnings and headlines',endpoint:'GET /api/catalysts?symbol= · https://query1.finance.yahoo.com/v8/finance/chart/ · https://data.sec.gov/submissions/ · https://efts.sec.gov/LATEST/search-index · https://api.fda.gov/drug/drugsfda.json',frequency:'When the Catalyst page opens · response cache 5 min',mode:'probe',probes:['/api/catalysts?symbol=AAPL']},
    {id:'stock-info',he:'מחקר חברה',en:'Company research',provider:'Yahoo Finance, SEC EDGAR, StockAnalysis, Nasdaq',endpoint:'GET /api/stock-info?symbol= · forward consensus is attached on each request · forward-consensus.yml is a pull-request check',frequency:'When a company is opened · snapshot TTL 6h for the cached universe',mode:'datasets',match:'all',prefixes:['api:/api/stock-info?'],notes:'The scheduled snapshot is the body. Each request still refreshes the price numerator from Yahoo.'},
    {id:'fundamentals',he:'גרפים פונדמנטליים',en:'Fundamental charts',provider:'SEC filings',endpoint:'GET /api/fundamentals?symbol=&metric=&period=annual|quarterly',frequency:'When a chart is drawn · snapshot TTL 24h',mode:'datasets',match:'all',prefixes:['api:/api/fundamentals?']},
    {id:'statements',he:'דוחות כספיים',en:'Financial statements',provider:'SEC companyfacts',endpoint:'GET /api/research-statements?symbol=&metric=&period=',frequency:'When a statement chart is drawn · live, not a snapshot',mode:'probe',probes:['/api/research-statements?symbol=AAPL&metric=assets&period=annual']},
    {id:'holders',he:'מחזיקים',en:'Holders',provider:'Holders route',endpoint:'GET /api/holders?symbol=',frequency:'When the holders panel opens · snapshot TTL 24h',mode:'datasets',match:'all',prefixes:['api:/api/holders?']},
    {id:'estimates',he:'הערכות אנליסטים',en:'Analyst estimates',provider:'Analyst estimates route',endpoint:'GET /api/analyst-estimates?symbol=',frequency:'When the analysts panel opens · snapshot TTL 6h',mode:'datasets',match:'all',prefixes:['api:/api/analyst-estimates?']},
    {id:'insiders',he:'פעילות בעלי עניין',en:'Insider activity',provider:'Insider activity route',endpoint:'GET /api/insider-activity?symbol=',frequency:'When the insiders panel opens · snapshot TTL 12h',mode:'datasets',match:'all',prefixes:['api:/api/insider-activity?']},
    {id:'peers',he:'סל חברות להשוואה',en:'Peer basket',provider:'Peer route',endpoint:'GET /api/peers?symbol=',frequency:'When peers are opened · snapshot TTL 24h',mode:'datasets',match:'all',prefixes:['api:/api/peers?']},
    {id:'correlation',he:'מתאם',en:'Correlation',provider:'Daily returns',endpoint:'GET /api/correlation?symbol=&benchmark=SPY',frequency:'When correlation is run · snapshot TTL 60m',mode:'datasets',match:'all',prefixes:['api:/api/correlation?']},
    {id:'institutions',he:'מוסדות 13F',en:'13F institutions',provider:'Institution holdings route',endpoint:'GET /api/institutions-list · GET /api/institutions?cik=',frequency:'When the Institutions page opens · TTL 7d',mode:'datasets',match:'all',keys:['api:/api/institutions-list'],prefixes:['api:/api/institutions?']},
    {id:'confluence',he:'מפגש אותות',en:'Confluence',provider:'Confluence route',endpoint:'GET /api/confluence?symbol=&window=7|30|90',frequency:'When the page opens · snapshot TTL 6h',mode:'datasets',match:'all',prefixes:['api:/api/confluence?']},
    {id:'mover',he:'מה זז',en:'What is moving',provider:'Quote, news, SEC, Reddit, StockTwits',endpoint:'GET /api/ticker-mover?symbol=',frequency:'When a ticker is searched · snapshot TTL 30m, engine minimum 60m',mode:'datasets',match:'all',prefixes:['api:/api/ticker-mover?']},
    {id:'valuation',he:'נתוני שווי',en:'Valuation inputs',provider:'SEC companyfacts and Yahoo chart',endpoint:'GET /api/valuation-inputs?symbol=',frequency:'When the valuation panel opens · response cache 15 min',mode:'probe',probes:['/api/valuation-inputs?symbol=AAPL']},
    {id:'price-history',he:'היסטוריית מחיר ואירועים',en:'Price history and events',provider:'Yahoo Finance chart, SEC submissions, company newsrooms',endpoint:'GET /api/price-history?symbol=&range= · https://query1.finance.yahoo.com/v8/finance/chart/ · price-history.yml is a pull-request check',frequency:'When the price panel opens · response cache 5 min',mode:'probe',probes:['/api/price-history?symbol=AAPL&range=1mo']},
    {id:'ratios',he:'השוואת מכפילים',en:'Ratio comparisons',provider:'SEC filings, Yahoo closes, peer snapshots',endpoint:'GET /api/research-ratio-comparisons?symbol=',frequency:'When the ratios panel opens',mode:'probe',probes:['/api/research-ratio-comparisons?symbol=AAPL']},
    {id:'historical-pe',he:'מכפיל רווח היסטורי',en:'Historical P/E',provider:'SEC annual diluted EPS and Yahoo daily close',endpoint:'GET /api/research-historical-pe?symbol=',frequency:'When the historical panel opens',mode:'probe',probes:['/api/research-historical-pe?symbol=AAPL']},
    {id:'filings',he:'טפסי 4',en:'SEC Form 4 filings',provider:'SEC submissions',endpoint:'GET /api/research-insider-filings?symbol=',frequency:'When the insiders panel opens',mode:'probe',probes:['/api/research-insider-filings?symbol=AAPL']},
    {id:'brief',he:'תדריך בוקר',en:'Morning brief',provider:'Committed editorial edition',endpoint:'briefs/latest.json then briefs/{date}/edition.json · morning-brief-qa.yml checks pull requests and does not publish an edition',frequency:'While the Morning Brief page is open, re-read every 2 min · no schedule writes the file',mode:'file',file:'briefs/latest.json',pick:'date',maxAge:4*24*60},
    {id:'uber',he:'מעקב אובר',en:'Uber tracker',provider:'NYC TLC, LAWA, SEC and other public pages',endpoint:'data/uber-tracker/bundle.json · written by .github/workflows/uber-tracker.yml',frequency:'Page read on open · cron 0 6, 0 10, 30 15, 0 21 UTC daily, plus 0 7 UTC Mondays',mode:'file',file:'data/uber-tracker/bundle.json',pick:'generated_at',maxAge:36*60,workflow:'uber-tracker.yml'},
    {id:'btc-bb',he:'מחקר בולינגר לביטקוין',en:'BTC Bollinger research',provider:'Binance Vision BTCUSDT daily (frozen study)',endpoint:'assets/research/btc-bb/daily.json · assets/research/btc-bb/trades-10d.json',frequency:'Static files, no schedule · read when the research page opens',mode:'head',files:['assets/research/btc-bb/daily.json','assets/research/btc-bb/trades-10d.json']},
    {id:'portfolios',he:'קבצי מחקר תיקים',en:'Portfolio research files',provider:'Yahoo adjusted prices, FRED CPI and DFF, as described on the research page',endpoint:'research/data/seven-portfolios-results.json · research/data/portfolio-full-analytics.json',frequency:'Static files, no schedule · read by the portfolio research page',mode:'head',files:['research/data/seven-portfolios-results.json','research/data/portfolio-full-analytics.json']},
    {id:'blog',he:'רשימת מאמרים',en:'Research article list',provider:'Blog articles route',endpoint:'GET /api/blog/articles?limit=12&offset=0',frequency:'When the research index loads · scheduled snapshot is limit=50',mode:'datasets',match:'ok',keys:['api:/api/blog/articles?limit=12&offset=0','api:/api/blog/articles?limit=50&offset=0']},
    {id:'health',he:'מוניטור בריאות נתונים',en:'Data health monitor',provider:'Supabase data_snapshots',endpoint:'GET /api/data-health',frequency:'data-health.html re-reads every 60s',mode:'health'},
    {id:'engine',he:'פרסום מנוע הנתונים',en:'Data Engine publish',provider:'GitHub Actions',endpoint:'.github/workflows/data-engine.yml · publishes snapshots to Supabase',frequency:'cron 7 * * * * (hourly at minute 7 UTC)',mode:'workflow',workflow:'data-engine.yml',maxAge:180}
  ];
  var feedById={};
  FEEDS.forEach(function(feed){feedById[feed.id]=feed;});
  var feedState={rows:[],checkedAt:'',loading:false,ready:false,error:''};
  var refreshing=false;

  function he(){return typeof getLang==='function'&&getLang()==='he';}
  function featureOf(feed){return he()&&feed.he?feed.he:feed.en;}
  function showStamp(v){
    if(v==null||v==='')return '—';
    if(typeof v==='number'&&isFinite(v))v=new Date(v).toISOString();
    var s=String(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    var d=new Date(s);
    if(isNaN(d.getTime()))return s;
    return d.toLocaleString(he()?'he-IL':'en-GB',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  }
  function minutesOld(v){
    if(typeof v==='number'&&isFinite(v))v=new Date(v).toISOString();
    var t=Date.parse(v);
    if(!isFinite(t))return null;
    return (Date.now()-t)/60000;
  }
  function apiBase(){
    if(typeof window.WAVE_DATA_API==='string'&&window.WAVE_DATA_API)return window.WAVE_DATA_API.replace(/\/$/,'');
    if(typeof API==='string'&&API)return API.replace(/\/$/,'');
    var host=location.hostname;
    if(host==='localhost'||host==='127.0.0.1')return 'http://localhost:5001';
    return 'https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data';
  }
  function withTimeout(ms){
    var controller=new AbortController();
    var timerId=setTimeout(function(){controller.abort();},ms);
    return {signal:controller.signal,done:function(){clearTimeout(timerId);}};
  }
  function grab(promise){return promise.then(function(v){return v;},function(e){return {error:String(e&&e.message||e)};});}
  function stampOf(data){
    if(!data||typeof data!=='object')return '';
    var keys=['fetched_at','generated_at','source_timestamp','calculated_at','asOf','as_of','generatedAt','updated_at','price_timestamp'];
    for(var i=0;i<keys.length;i++){if(typeof data[keys[i]]==='string'&&data[keys[i]])return data[keys[i]];}
    if(data.meta){var nested=stampOf(data.meta);if(nested)return nested;}
    if(data.log){var logged=stampOf(data.log);if(logged)return logged;}
    return '';
  }
  function ageStatus(stamp,maxAge,fresh,stale){
    var age=minutesOld(stamp);
    if(age==null)return 'unstamped';
    return age>maxAge?stale:fresh;
  }
  function datasetRows(feed,map){
    var rows=[],seen={};
    function add(row,key){if(!row||seen[key])return;seen[key]=1;rows.push(row);}
    (feed.keys||[]).forEach(function(key){add(map[key],key);});
    (feed.optional||[]).forEach(function(key){add(map[key],key);});
    (feed.prefixes||[]).forEach(function(prefix){
      Object.keys(map).forEach(function(key){if(key.indexOf(prefix)===0)add(map[key],key);});
    });
    return rows;
  }
  function newest(rows){
    return rows.filter(function(row){return row.fetched_at||row.source_timestamp||row.calculated_at;}).sort(function(a,b){
      return Date.parse(b.fetched_at||b.source_timestamp||b.calculated_at||0)-Date.parse(a.fetched_at||a.source_timestamp||a.calculated_at||0);
    })[0]||null;
  }
  function resolveDatasets(feed,ctx){
    if(ctx.healthError)return {status:'unavailable',pulledAt:'',note:ctx.healthError};
    var map=ctx.map||{};
    if(feed.match==='one'||feed.match==='ok'){
      var ordered=[];
      (feed.keys||[]).forEach(function(key){if(map[key])ordered.push(map[key]);});
      if(!ordered.length)return {status:'broken',pulledAt:'',note:'No snapshot for '+(feed.keys||[]).join(', ')};
      var chosen=feed.match==='ok'?(ordered.filter(function(row){return row.status==='ok'&&!row.stale;})[0]||ordered[0]):ordered[0];
      var status=chosen.status==='error'?'broken':chosen.status==='partial'?'partial':chosen.stale?'stale':'current';
      var note=chosen.source?('Snapshot source: '+chosen.source):'';
      if(chosen.source_timestamp&&chosen.source_timestamp!==chosen.fetched_at)note+=(note?' · ':'')+'as of '+chosen.source_timestamp;
      if(chosen.error)note+=(note?' · ':'')+chosen.error;
      if(feed.id==='blog'&&!map['api:/api/blog/articles?limit=12&offset=0']){
        if(status==='current')status='partial';
        note+=' The research index requests limit=12. The scheduled snapshot is limit=50, so the page can miss it.';
      }
      if(ctx.health&&ctx.health.engine_cadence_minutes)note+=(note?' · ':'')+'Engine cadence '+ctx.health.engine_cadence_minutes+'m';
      return {status:status,pulledAt:chosen.fetched_at||chosen.source_timestamp||chosen.calculated_at||'',note:note};
    }
    var rows=datasetRows(feed,map);
    var missing=(feed.keys||[]).filter(function(key){return !map[key];});
    if(!rows.length)return {status:'broken',pulledAt:'',note:'No snapshots for this feed.'};
    var errors=rows.filter(function(row){return row.status==='error';}).length;
    var statusAll=errors===rows.length?'broken':rows.some(function(row){return row.stale;})?'stale':(errors||rows.some(function(row){return row.status==='partial';})||missing.length)?'partial':'current';
    var top=newest(rows);
    var note=rows.length+' snapshots';
    if(missing.length)note+=' · missing '+missing.join(', ');
    if(top&&top.source_timestamp)note+=' · as of '+top.source_timestamp;
    if(ctx.health&&ctx.health.engine_cadence_minutes)note+=' · engine cadence '+ctx.health.engine_cadence_minutes+'m';
    return {status:statusAll,pulledAt:top?(top.fetched_at||top.source_timestamp||top.calculated_at||''):'',note:note};
  }
  function workflowOf(file,ctx){
    var item=ctx.workflows[file];
    if(!item||item.error)return {status:'unavailable',pulledAt:'',note:item&&item.error?item.error:'GitHub Actions did not return a run.'};
    var success=item.success,latest=item.latest;
    var pulled=success?(success.updated_at||success.run_started_at||''):'';
    var note=latest?('Latest run '+(latest.conclusion||latest.status||'unknown')):'No runs';
    if(!success)return {status:'broken',pulledAt:'',note:note};
    var failedLatest=latest&&latest.conclusion&&latest.conclusion!=='success'&&latest.id!==success.id;
    var status=failedLatest?'broken':ageStatus(pulled,180,'current','stale');
    if(status==='unstamped')status='unavailable';
    return {status:status,pulledAt:pulled,note:note};
  }
  function resolveFile(feed,ctx){
    var file=ctx.files[feed.file];
    if(!file||file.error)return {status:'broken',pulledAt:'',note:file&&file.error?file.error:'File unavailable'};
    var data=file.data||{};
    var stamp=feed.pick==='generated_at'?data.generated_at:data[feed.pick];
    if(!stamp&&file.lastModified)stamp=file.lastModified;
    var status=ageStatus(stamp,feed.maxAge,'current','stale');
    var note='';
    if(feed.workflow){
      var run=workflowOf(feed.workflow,ctx);
      note='Last successful '+feed.workflow+' run: '+(run.pulledAt?showStamp(run.pulledAt):'none')+(run.note?(' · '+run.note):'');
      if(run.status==='broken'&&status==='current')status='partial';
      if(!stamp&&run.pulledAt){stamp=run.pulledAt;status=run.status;}
    }
    return {status:status,pulledAt:stamp||'',note:note};
  }
  function resolveHead(feed,ctx){
    var stamps=[],failed=[];
    (feed.files||[]).forEach(function(path){
      var item=ctx.heads[path];
      if(!item||item.error||!item.ok)failed.push(path);
      else if(item.lastModified)stamps.push(item.lastModified);
    });
    if(failed.length===(feed.files||[]).length)return {status:'broken',pulledAt:'',note:'Could not read '+failed.join(', ')};
    var oldest=stamps.slice().sort(function(a,b){return Date.parse(a)-Date.parse(b);})[0]||'';
    return {status:failed.length?'partial':'static',pulledAt:oldest,note:failed.length?('Missing Last-Modified or file: '+failed.join(', ')):'Last-Modified of the static file. No schedule rewrites it.'};
  }
  function jsonProbe(ctx,path){
    var item=ctx.probes[path];
    if(!item)return {ok:false,error:'Not requested'};
    if(item.error)return {ok:false,error:item.error};
    if(!item.ok)return {ok:false,error:'HTTP '+(item.status||'')+(item.json&&item.json.error?(' '+item.json.error):'')};
    return {ok:true,json:item.json,text:item.text};
  }
  function resolveProbe(feed,ctx){
    var id=feed.id;
    if(id==='home-eur'){
      var quote=jsonProbe(ctx,feed.probes[0]);
      if(!quote.ok||!quote.json||quote.json.error||quote.json.price==null)return {status:'broken',pulledAt:'',note:quote.error||'FXE quote unavailable'};
      var quoteStamp=stampOf(quote.json);
      return quoteStamp?{status:'current',pulledAt:quoteStamp,note:''}:{status:'unstamped',pulledAt:'',note:'The FXE quote response has price and percent and no as-of field.'};
    }
    if(id==='home-spark'){
      var klines=jsonProbe(ctx,feed.probes[0]);
      var intra=jsonProbe(ctx,feed.probes[1]);
      var ts=klines.ok&&klines.json&&Array.isArray(klines.json.timestamps)?klines.json.timestamps:null;
      var last=ts&&ts.length?ts[ts.length-1]:'';
      var note='Equity intraday closes have no timestamp. Bitcoin klines carry candle open times.';
      if(!klines.ok&&!intra.ok)return {status:'broken',pulledAt:'',note:(klines.error||'')+' '+(intra.error||'')};
      if(!klines.ok||!intra.ok)return {status:'partial',pulledAt:last,note:note+' '+(klines.error||intra.error||'')};
      return {status:last?'current':'unstamped',pulledAt:last,note:note};
    }
    if(id==='housing'){
      var fred=ctx.probes[feed.probes[0]]||{};
      var hist=jsonProbe(ctx,feed.probes[1]);
      var fredDate='';
      if(fred.ok&&fred.text){
        var lines=String(fred.text).trim().split(/\r?\n/).filter(Boolean);
        var cell=lines.length?lines[lines.length-1].split(',')[0].trim():'';
        if(/^\d{4}-\d{2}-\d{2}$/.test(cell))fredDate=cell;
      }
      var histDate=hist.ok&&hist.json&&Array.isArray(hist.json.dates)&&hist.json.dates.length?hist.json.dates[hist.json.dates.length-1]:'';
      if((!fred.ok&&fred.error)||!fredDate){
        if(!hist.ok)return {status:'broken',pulledAt:'',note:(fred.error||'FRED CSV had no observation date')+' · '+(hist.error||'')};
      }
      var fredNote=fred.ok?'':('FRED HTTP '+(fred.status||'')+' '+((fred.json&&(fred.json.error||fred.json.route))||fred.error||'unavailable'));
      var status=fredDate?ageStatus(fredDate,10*24*60,'current','stale'):'partial';
      if(!hist.ok)status=status==='current'?'partial':status;
      return {status:status,pulledAt:fredDate,note:[fredDate?'FRED T10Y2Y last observation '+fredDate:fredNote, histDate?'SPY history last bar '+histDate:(hist.error||'SPY history unavailable')].filter(Boolean).join(' · ')};
    }
    if(id==='flows-crypto'){
      var flow=jsonProbe(ctx,feed.probes[0]);
      if(!flow.ok)return {status:'broken',pulledAt:'',note:flow.error||'Positioning cache unavailable'};
      var meta=flow.json.meta||{};
      var pulled=meta.fetched_at||meta.source_timestamp||'';
      return {status:meta.stale?'stale':'current',pulledAt:pulled,note:meta.note||meta.source||''};
    }
    if(id==='macro'){
      var series=jsonProbe(ctx,feed.probes[0]);
      if(!series.ok)return {status:'broken',pulledAt:'',note:series.error||'FRED series unavailable'};
      var body=series.json||{};
      if(body.fetch_status==='failed'||body.status==='fetch_failed')return {status:'broken',pulledAt:body.fetched_at||body.attempted_at||'',note:(body.error&&(body.error.message||body.error.code))||'FRED fetch failed'};
      if(body.status==='license_unverified')return {status:'partial',pulledAt:body.fetched_at||'',note:'Series has no verified FRED source.'};
      var macroStamp=body.fetched_at||'';
      return {status:ageStatus(macroStamp,120,'current','stale'),pulledAt:macroStamp,note:body.source||'FRED'};
    }
    if(id==='tape'){
      var tape=jsonProbe(ctx,feed.probes[0]);
      if(!tape.ok||!tape.json||tape.json.error)return {status:'broken',pulledAt:'',note:tape.error||(tape.json&&tape.json.error)||'Tape unavailable'};
      var session=tape.json.session_date||'';
      var staleSession=session&&minutesOld(session)>5*24*60;
      return {status:staleSession?'stale':'current',pulledAt:tape.json.fetched_at||'',note:(tape.json.performance_basis||'')+(session?' · session '+session:'')};
    }
    if(id==='sector-research'){
      var etf=jsonProbe(ctx,feed.probes[0]);
      if(!etf.ok||!etf.json||etf.json.error)return {status:'broken',pulledAt:'',note:etf.error||'Holdings unavailable'};
      var blob=(etf.json.log&&etf.json.log.fields||[]).map(function(field){return field&&field.note||'';}).join(' ');
      var match=/as of (\d{4}-\d{2}-\d{2})/.exec(blob);
      var asOf=match?match[1]:'';
      var pulled=asOf||(etf.json.log&&etf.json.log.fetched_at)||'';
      var source=(etf.json.log&&etf.json.log.fields||[]).map(function(field){return field&&field.source;}).filter(Boolean)[0]||'';
      return {status:asOf?ageStatus(asOf,5*24*60,'current','stale'):'partial',pulledAt:pulled,note:source||'Holdings as-of was not in the payload.'};
    }
    var live=jsonProbe(ctx,feed.probes[0]);
    if(!live.ok||!live.json||live.json.error){
      var failed=live.error||(live.json&&live.json.error)||'Request failed';
      return {status:/HTTP \d+/.test(failed)?'broken':'unavailable',pulledAt:'',note:failed};
    }
    if(id==='statements'&&Array.isArray(live.json.data)&&live.json.data.length){
      var periods=live.json.data.map(function(row){return row&&row.date||'';}).filter(Boolean).sort();
      var filed=live.json.data.map(function(row){return row&&row.filed||'';}).filter(Boolean).sort();
      var latest=periods[periods.length-1]||'';
      return {status:latest?'current':'unstamped',pulledAt:latest,note:latest?('Latest reported period'+(filed.length?' · latest filing '+filed[filed.length-1]:'')):'Statement rows had no period date.'};
    }
    var liveStamp=stampOf(live.json);
    var end=live.json.summary&&live.json.summary.end_date;
    var oldBar=end&&minutesOld(end)>5*24*60;
    if(id==='price-history'&&end)return {status:oldBar?'stale':'current',pulledAt:liveStamp||end,note:'Last bar '+end};
    if(!liveStamp)return {status:'unstamped',pulledAt:'',note:'The response had no as-of or fetched_at field.'};
    return {status:'current',pulledAt:liveStamp,note:''};
  }
  function resolveFeed(feed,ctx){
    var result;
    if(feed.mode==='datasets')result=resolveDatasets(feed,ctx);
    else if(feed.mode==='file')result=resolveFile(feed,ctx);
    else if(feed.mode==='head')result=resolveHead(feed,ctx);
    else if(feed.mode==='probe')result=resolveProbe(feed,ctx);
    else if(feed.mode==='workflow')result=workflowOf(feed.workflow,ctx);
    else if(feed.mode==='health'){
      if(ctx.healthError)result={status:'unavailable',pulledAt:'',note:ctx.healthError};
      else {
        var summary=ctx.health.summary||{};
        result={status:'current',pulledAt:ctx.health.generated_at||'',note:[summary.total+' datasets',summary.ok+' ok',summary.stale+' stale',summary.error+' error',summary.partial+' partial'].join(' · ')};
      }
    }else if(feed.id==='breadth'){
      var core=resolveDatasets({match:'one',keys:['market:core']},ctx);
      var rsp=jsonProbe(ctx,'/api/quote?symbol=RSP');
      var note='SPY, QQQ and IWM come from market:core. RSP and MDY are requested live.';
      if(core.status==='unavailable')result={status:'unavailable',pulledAt:'',note:core.note};
      else if(!rsp.ok)result={status:core.status==='current'?'partial':'broken',pulledAt:core.pulledAt,note:note+' '+((rsp.error)||'RSP quote failed')};
      else result={status:core.status,pulledAt:core.pulledAt,note:note+(stampOf(rsp.json)?'':' RSP quote has no as-of.')};
    }else result={status:'unavailable',pulledAt:'',note:'No reader for this feed.'};
    if(feed.notes)result.note=[result.note,feed.notes].filter(Boolean).join(' ');
    result.id=feed.id;
    return result;
  }
  function viewRows(){
    if(feedState.loading&&!feedState.ready)return FEEDS.map(function(feed){return {id:feed.id,status:'reading',pulledAt:'',note:''};});
    if(feedState.rows.length)return feedState.rows;
    return FEEDS.map(function(feed){return {id:feed.id,status:'',pulledAt:'',note:''};});
  }
  function feedsTable(){
    var rows=viewRows();
    var heads=[['datalog.col.feature','Feature'],['datalog.col.provider','Provider'],['datalog.col.endpoint','Endpoint'],['datalog.col.frequency','Frequency'],['datalog.col.updated','Last updated'],['datalog.col.status','Status']];
    var lead;
    if(feedState.loading&&!feedState.ready)lead=text('datalog.reading','Reading live timestamps…');
    else if(feedState.ready){
      var counts={};
      rows.forEach(function(row){counts[row.status]=(counts[row.status]||0)+1;});
      var bits=[];
      if(feedState.checkedAt)bits.push(text('datalog.read','Read')+' '+showStamp(feedState.checkedAt));
      bits.push(rows.length+' '+text('datalog.feeds','Feeds').toLowerCase());
      ['stale','broken','unavailable','partial','unstamped'].forEach(function(status){if(counts[status])bits.push(counts[status]+' '+text('datalog.status.'+status,status));});
      lead=bits.join(' · ');
    }else lead=text('datalog.reading','Reading live timestamps…');
    return '<div class="data-log-block"><div class="data-log-head"><h2>'+esc(text('datalog.feeds','Feeds'))+'</h2><button type="button" class="data-log-refresh" data-log-refresh>'+esc(text('datalog.refresh','Refresh'))+'</button></div><p class="data-log-lead">'+esc(lead)+'</p><div class="data-log-scroll"><table class="data-log-table data-log-feeds"><thead><tr>'+
      heads.map(function(c){return '<th>'+esc(text(c[0],c[1]))+'</th>';}).join('')+
      '</tr></thead><tbody>'+rows.map(function(row){
        var feed=feedById[row.id]||{en:row.id,provider:'',endpoint:'',frequency:''};
        var status=row.status||'';
        return '<tr class="'+(status?'data-log-row-'+esc(status):'')+'" data-feed-id="'+esc(row.id)+'" data-feed-status="'+esc(status)+'">'+
          '<td>'+esc(featureOf(feed))+'</td><td>'+esc(feed.provider)+'</td><td class="data-log-endpoint">'+esc(feed.endpoint)+'</td><td>'+esc(feed.frequency)+'</td>'+
          '<td title="'+esc(row.pulledAt||'')+'">'+esc(showStamp(row.pulledAt))+'</td><td>'+(status?('<span class="data-log-pill '+esc(status)+'">'+esc(text('datalog.status.'+status,status))+'</span>'):'—')+
          (row.note?'<div class="data-log-notes">'+esc(row.note)+'</div>':'')+'</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  }
  function render(){
    var host=document.getElementById('dataLogContent');if(!host)return;
    host.innerHTML=feedsTable()+'<div class="data-log-block"><h2>'+esc(text('datalog.session','Notes from this visit'))+'</h2>'+sessionTable()+'</div>';
    var button=host.querySelector('[data-log-refresh]');
    if(button){
      button.disabled=!!feedState.loading;
      button.addEventListener('click',function(){open();});
    }
  }
  function collectProbes(){
    var paths={'/api/quote?symbol=RSP':1};
    FEEDS.forEach(function(feed){(feed.probes||[]).forEach(function(path){paths[path]=1;});});
    return Object.keys(paths);
  }
  function loadProbe(path){
    var timeout=withTimeout(22000);
    return fetch(apiBase()+path,{cache:'no-store',signal:timeout.signal}).then(function(response){
      return response.text().then(function(text){
        var json=null;
        try{json=JSON.parse(text);}catch(e){json=null;}
        return {ok:response.ok,status:response.status,text:text,json:json};
      });
    }).then(function(result){timeout.done();return result;},function(error){timeout.done();throw error;});
  }
  function refreshFeeds(){
    var probes={},files={},heads={},workflows={};
    var paths=collectProbes();
    var fileFeeds=FEEDS.filter(function(feed){return feed.file;});
    var headFiles=[];
    FEEDS.forEach(function(feed){(feed.files||[]).forEach(function(path){if(headFiles.indexOf(path)<0)headFiles.push(path);});});
    var workflowFiles=[];
    FEEDS.forEach(function(feed){if(feed.workflow&&workflowFiles.indexOf(feed.workflow)<0)workflowFiles.push(feed.workflow);});
    return Promise.all([
      grab(fetch(apiBase()+'/api/data-health?ts='+Date.now(),{cache:'no-store'}).then(function(response){if(!response.ok)throw new Error('HTTP '+response.status);return response.json();})),
      Promise.all(paths.map(function(path){return grab(loadProbe(path)).then(function(result){probes[path]=result;});})),
      Promise.all(fileFeeds.map(function(feed){
        return grab(fetch(feed.file,{cache:'no-store'}).then(function(response){
          if(!response.ok)throw new Error(feed.file+' HTTP '+response.status);
          return response.json().then(function(data){return {ok:true,data:data,lastModified:response.headers.get('last-modified')||''};});
        })).then(function(result){files[feed.file]=result;});
      })),
      Promise.all(headFiles.map(function(path){
        return grab(fetch(path,{method:'HEAD',cache:'no-store'}).then(function(response){
          if(!response.ok)throw new Error(path+' HTTP '+response.status);
          return {ok:true,lastModified:response.headers.get('last-modified')||''};
        })).then(function(result){heads[path]=result;});
      })),
      Promise.all(workflowFiles.map(function(file){
        return grab(fetch(GH+encodeURIComponent(file)+'/runs?branch=main&per_page=5',{headers:{Accept:'application/vnd.github+json'}}).then(function(response){
          if(!response.ok)throw new Error('GitHub HTTP '+response.status);
          return response.json().then(function(data){
            var runs=data.workflow_runs||[];
            return {latest:runs[0]||null,success:runs.filter(function(run){return run.conclusion==='success';})[0]||null};
          });
        })).then(function(result){workflows[file]=result;});
      }))
    ]).then(function(results){
      var health=results[0]&&!results[0].error?results[0]:null;
      var map={};
      if(health&&Array.isArray(health.datasets))health.datasets.forEach(function(row){if(row&&row.dataset_key)map[row.dataset_key]=row;});
      var ctx={map:map,health:health,healthError:health?'' :(results[0]&&results[0].error?results[0].error:'data-health unavailable'),files:files,heads:heads,probes:probes,workflows:workflows};
      return {rows:FEEDS.map(function(feed){return resolveFeed(feed,ctx);}),checkedAt:health&&health.generated_at?health.generated_at:''};
    });
  }
  function open(){
    if(refreshing)return;
    refreshing=true;
    feedState.loading=true;
    render();
    refreshFeeds().then(function(next){
      feedState.rows=next.rows;
      feedState.checkedAt=next.checkedAt;
      feedState.ready=true;
      feedState.error='';
    },function(error){
      feedState.error=String(error&&error.message||error);
      feedState.rows=FEEDS.map(function(feed){return {id:feed.id,status:'unavailable',pulledAt:'',note:feedState.error};});
      feedState.ready=true;
    }).then(function(){
      feedState.loading=false;
      refreshing=false;
      render();
    });
  }
  window.WaveDataLog={record:record,render:render,list:list,open:open,feeds:function(){return feedState.rows.slice();}};
  try{
    JSON.parse(sessionStorage.getItem('wave.datalog.v1')||'[]').slice(-180).forEach(function(pair){
      if(Array.isArray(pair)&&pair[1])record(String(pair[0]),Object.assign({},pair[1],{skipSources:true}));
    });
  }catch(e){}
  var previousLang=window.onLangChange;
  window.onLangChange=function(lang){if(typeof previousLang==='function')previousLang(lang);render();};
})();
