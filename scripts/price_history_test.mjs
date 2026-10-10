import test from 'node:test';
import assert from 'node:assert/strict';
import {PRICE_HISTORY_DEFINITIONS,DEFINITIONS,calculatePriceHistory} from '../supabase/functions/wave-data/calculations.ts';
import {validatePriceRequest,strictNumber,rangeStartDate,parsePriceChart,safeArticleUrl,parsePriceNews,alignArticleSession,alignBenchmark,selectPriceEvents,collectPriceHistory} from '../supabase/functions/wave-data/price-history.ts';

const NOW=Date.parse('2026-10-09T22:00:00Z');
const dates=['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'];
function payload({symbol='TEST',ds=dates,raw=[100,104,102,97,103,101,105],adj=raw,meta={},splits={},ends=[]}={}){
 return {chart:{result:[{meta:{symbol,currency:'USD',exchangeTimezoneName:'America/New_York',exchangeName:'NMS',tradingPeriods:{regular:ends},...meta},timestamp:ds.map(d=>Date.parse(d+'T13:30:00Z')/1000),indicators:{quote:[{close:raw}],adjclose:[{adjclose:adj}]},events:{splits}}]}};
}
function chart(opts={}){return parsePriceChart(payload(opts),opts.symbol||'TEST',NOW);}
function article(overrides={}){return {id:'one',published_at:'2026-10-06T13:00:00Z',timing:'exact',title:'Verified publisher headline',summary:'Source-backed event context.',url:'https://example.com/article/one',source:'Publisher',relationship:'context',reviewed:false,...overrides};}
function providerNews(overrides={}){return {uuid:'n1',providerPublishTime:Date.parse('2026-10-06T13:00:00Z')/1000,link:'https://example.com/news/one',title:'Actual headline',publisher:'Publisher',relatedTickers:['TEST'],...overrides};}
function mockFetch({stock=payload(),spy=payload({symbol:'SPY',raw:[500,503,505,506,507,504,510]}),news={news:[]},failNews=false,failBenchmark=false,calls=[]}={}){
 return async url=>{calls.push(url);if(url.includes('/finance/search')){if(failNews)return new Response('No news',{status:429});return Response.json(news);}
 if(url.includes('/chart/SPY')){if(failBenchmark)return new Response('No benchmark',{status:503});return Response.json(spy);}return Response.json(stock);};
}

test('request allowlist rejects invalid ranges, paths, queries and long symbols',()=>{
 assert.deepEqual(validatePriceRequest(' aapl ','1y'),{symbol:'AAPL',range:'1y'});
 for(const range of ['max','2y','',null,1])assert.throws(()=>validatePriceRequest('TEST',range));
 for(const symbol of ['',null,'../../x','TEST?x=1','A'.repeat(21),'A B','💸'])assert.throws(()=>validatePriceRequest(symbol,'1mo'));
 for(const range of ['1mo','3mo','6mo','1y','5y'])assert.equal(validatePriceRequest('BRK-B',range).range,range);
});
test('strict finite values never coerce nulls, booleans or numeric strings',()=>{
 for(const value of [null,undefined,'',true,false,'42',NaN,Infinity,{raw:2}])assert.equal(strictNumber(value),null);
 assert.equal(strictNumber(0),0);assert.equal(strictNumber(-5),-5);
 assert.equal(calculatePriceHistory('price_history_return_pct',{current:2,previous:null}),null);
 assert.equal(calculatePriceHistory('price_history_return_pct',{current:2,previous:'1'}),null);
 assert.equal(calculatePriceHistory('price_history_return_pct',{current:2,previous:0}),null);
});
test('read-only research formulas do not join editable company metric definitions',()=>{
 assert.equal(PRICE_HISTORY_DEFINITIONS.length,3);assert.ok(PRICE_HISTORY_DEFINITIONS.every(d=>d.read_only));
 assert.ok(!DEFINITIONS.some(d=>d.key.startsWith('price_history_')));
 assert.equal(calculatePriceHistory('price_history_return_pct',{current:110,previous:100}).toFixed(8),'10.00000000');
 assert.equal(calculatePriceHistory('price_history_excess_pp',{stock_return:10,benchmark_return:3}),7);
});
test('lookback clamps calendar month boundaries and leap years',()=>{
 assert.equal(rangeStartDate(Date.parse('2026-03-31T17:00:00Z'),'1mo','America/New_York'),'2026-02-28');
 assert.equal(rangeStartDate(Date.parse('2024-02-29T17:00:00Z'),'1y','America/New_York'),'2023-02-28');
});
test('consistent adjusted series selected; provider raw retained unchanged',()=>{
 const c=chart({raw:[100,104,102,97,103,101,105],adj:[90,93.6,91.8,87.3,92.7,90.9,94.5]});
 assert.equal(c.basis,'dividend_and_split_adjusted_close');assert.equal(c.points[0].close,90);assert.equal(c.points[0].raw_close,100);
 assert.ok(Math.abs(c.points[1].change_pct-4)<1e-10);
});
test('partial adjusted series falls back for the entire range with explicit split-only basis',()=>{
 const c=chart({adj:[90,93.6,null,87.3,92.7,90.9,94.5]});assert.equal(c.basis,'split_adjusted_close');assert.equal(c.points[0].close,100);assert.match(c.limitations.join(' '),/cash dividends are not included/);
});
test('null and nonnumeric closes are omitted, returns spanning missing observations stay null',()=>{
 const c=chart({raw:[100,null,102,'97',103,101,105]});assert.equal(c.points.length,5);assert.equal(c.points[1].change_pct,null);assert.equal(c.points[2].change_pct,null);
 assert.ok(c.points.every(p=>Number.isFinite(p.close)));assert.throws(()=>chart({raw:[null,null,null,null,null,null,1]}),/two completed/);
});
test('Yahoo split-adjusted raw close is never adjusted twice',()=>{
 const c=chart({raw:[10,10.4,10.2,9.7,10.3,10.1,10.5],adj:[],splits:{x:{date:Date.parse('2026-10-02T13:30:00Z')/1000,numerator:10,denominator:1}}});
 assert.equal(c.points[0].close,10);assert.ok(Math.abs(c.points[1].change_pct-4)<1e-10);
});
test('unresolved provider split discontinuities are rejected instead of manufactured prices',()=>{
 assert.throws(()=>chart({raw:[100,10,10.2,9.7,10.3,10.1,10.5],adj:[],splits:{x:{date:Date.parse('2026-10-02T13:30:00Z')/1000,numerator:10,denominator:1}}}),/split discontinuity/);
});
test('incomplete current session and ten-minute close buffer are omitted',()=>{
 const p=payload({meta:{currentTradingPeriod:{regular:{start:Date.parse('2026-10-09T13:30:00Z')/1000,end:Date.parse('2026-10-09T20:00:00Z')/1000}}}});
 assert.equal(parsePriceChart(p,'TEST',Date.parse('2026-10-09T19:59:00Z')).points.at(-1).date,'2026-10-08');
 assert.equal(parsePriceChart(p,'TEST',Date.parse('2026-10-09T20:05:00Z')).points.at(-1).date,'2026-10-08');
 assert.equal(parsePriceChart(p,'TEST',Date.parse('2026-10-09T20:11:00Z')).points.at(-1).date,'2026-10-09');
});
test('invalid symbol, missing currency and unverified timezone cannot produce a chart',()=>{
 assert.throws(()=>parsePriceChart(payload(),'OTHER',NOW),/matching/);assert.throws(()=>chart({meta:{currency:null}}),/currency/);assert.throws(()=>chart({meta:{exchangeTimezoneName:'Invalid/Zone'}}),/timezone/);
});
test('exact after-close timestamp aligns to next session across the DST boundary',()=>{
 // chart fixture parser uses NOW in October; use future test time explicitly.
 const d=parsePriceChart(payload({ds:['2026-10-30','2026-11-02','2026-11-03'],raw:[100,103,99]}),'TEST',Date.parse('2026-11-04T22:00:00Z'));
 assert.equal(alignArticleSession({published_at:'2026-10-30T20:01:00Z',timing:'exact'},d).index,1);
 assert.equal(alignArticleSession({published_at:'2026-11-02T20:30:00Z',timing:'exact'},d).index,1);
 assert.equal(alignArticleSession({published_at:'2026-11-02T21:00:00Z',timing:'exact'},d).index,2);
});
test('date-only and weekend publications map conservatively to next traded date',()=>{
 const c=chart();assert.equal(alignArticleSession({published_at:'2026-10-02',timing:'date_only'},c).index,2);
 assert.equal(alignArticleSession({published_at:'2026-10-03T12:00:00Z',timing:'exact'},c).index,2);
 assert.equal(alignArticleSession({published_at:'2026-10-09',timing:'date_only'},c),null);
 assert.equal(alignArticleSession({published_at:'2026-99-99',timing:'date_only'},c),null);
 assert.equal(alignArticleSession({published_at:'2025-01-01',timing:'date_only'},c),null);
});
test('provider early-close schedule takes precedence over regular 16:00 fallback',()=>{
 const c=chart({ends:[[{start:Date.parse('2026-10-02T13:30:00Z')/1000,end:Date.parse('2026-10-02T17:00:00Z')/1000}]]});
 const a=alignArticleSession({published_at:'2026-10-02T18:00:00Z',timing:'exact'},c);assert.equal(a.index,2);assert.equal(a.rule,'after_close_next_session');
});
test('safe direct HTTPS article links only; tracking duplicates canonicalize',()=>{
 for(const url of ['javascript:alert(1)','http://example.com/a','https://localhost/a','https://127.0.0.1/a','https://[::1]/a','https://user:pass@example.com/a','https://example.com/','https://finance.yahoo.com/quote/AAPL','https://www.google.com/search?q=x'])assert.equal(safeArticleUrl(url),null);
 assert.equal(safeArticleUrl('https://example.com/a/?utm_source=x#section'),'https://example.com/a');
});
test('news requires exact ticker tag, valid time and safe URL and deduplicates URLs',()=>{
 const p=parsePriceNews({news:[providerNews(),providerNews({uuid:'duplicate',link:'https://example.com/news/one?utm_medium=abc'}),providerNews({relatedTickers:['OTHER'],link:'https://example.com/news/two'}),providerNews({relatedTickers:undefined}),providerNews({link:'javascript:alert(1)'}),providerNews({providerPublishTime:NOW/1000+1000}),providerNews({providerPublishTime:'1'})]},'TEST',NOW);
 assert.equal(p.articles.length,1);assert.equal(p.rejected,6);assert.equal(p.articles[0].relationship,'context');assert.equal(p.status,'available');
});
test('stale news and malformed unavailable news have explicit status',()=>{
 assert.equal(parsePriceNews({news:[providerNews({providerPublishTime:(NOW-50*86400000)/1000})]},'TEST',NOW).status,'stale');assert.equal(parsePriceNews({},'TEST',NOW).status,'unavailable');assert.equal(parsePriceNews({news:[]},'TEST',NOW).status,'empty');
});
test('benchmark returns align only to the same pair of exchange dates',()=>{
 const c=chart(),b=chart({symbol:'SPY',ds:['2026-10-01','2026-10-02','2026-10-06','2026-10-07','2026-10-08','2026-10-09'],raw:[500,505,510,515,520,525]});
 assert.equal(alignBenchmark(c,b).status,'available');assert.equal(c.points[2].benchmark_change_pct,null);assert.equal(c.points[3].benchmark_change_pct,null);assert.notEqual(c.points[4].benchmark_change_pct,null);assert.ok(Math.abs(c.points[1].excess_change_pp-3)<1e-9);
});
test('non-US market, currency and adjustment basis suppress incompatible benchmark',()=>{
 assert.equal(alignBenchmark(chart({meta:{currency:'EUR',exchangeTimezoneName:'Europe/Paris',exchangeName:'PAR'}}),chart({symbol:'SPY'})).status,'incompatible_market');
 assert.equal(alignBenchmark(chart(),chart({symbol:'SPY',adj:[]})).status,'incompatible_basis_or_market');assert.equal(alignBenchmark(chart(),null).status,'unavailable');
});
test('events require real articles and significant price moves; quiet or unreported charts stay empty',()=>{
 assert.deepEqual(selectPriceEvents(chart(),[],'1mo'),[]);assert.deepEqual(selectPriceEvents(chart({raw:[100,100.1,100.2,100.3,100.4,100.5,100.6]}),[article()],'1mo'),[]);
 const events=selectPriceEvents(chart(),[article()],'1mo');assert.equal(events.length,1);assert.ok(events[0].date>='2026-10-06');assert.equal(events[0].price,chart().points[events[0].index].close);
});
test('date-only reported driver is downgraded to context and cannot explain a prior move',()=>{
 const e=selectPriceEvents(chart(),[article({published_at:'2026-10-02',timing:'date_only',reviewed:true,relationship:'reported_driver'})],'1mo')[0];
 assert.equal(e.relationship,'context');assert.ok(e.date>='2026-10-05');assert.match(e.timing_label,/Publication date only/);
});
test('after-close reported driver cannot be labeled cause of the following session',()=>{
 const e=selectPriceEvents(chart(),[article({published_at:'2026-10-02T21:30:00Z',timing:'exact',reviewed:true,relationship:'reported_driver'})],'1mo')[0];assert.equal(e.relationship,'context');assert.ok(e.date>='2026-10-05');
});
test('event caps and minimum spacing are deterministic; duplicate URLs never repeated',()=>{
 const ds=[],raw=[];for(let i=0;i<110;i++){const d=new Date(Date.UTC(2026,4,1+i));if([0,6].includes(d.getUTCDay()))continue;ds.push(d.toISOString().slice(0,10));raw.push(100+(i%3)*7);}
 const c=chart({ds,raw}),articles=ds.map((d,i)=>article({id:String(i),published_at:d+'T12:00:00Z',url:`https://example.com/news/${i}`}));
 const events=selectPriceEvents(c,[...articles,articles[1]],'1y');assert.ok(events.length<=8);assert.ok(events.length>=4);assert.equal(new Set(events.map(e=>e.url)).size,events.length);for(let i=1;i<events.length;i++)assert.ok(events[i].index-events[i-1].index>=2);
 assert.ok(selectPriceEvents(c,articles,'1mo').length<=6);
});
test('collector returns real values, full contract and completed-session range summary',async()=>{
 const calls=[],r=await collectPriceHistory('test','1mo',{now:NOW,fetcher:mockFetch({calls,news:{news:[providerNews()]}}),reviewedEvents:[]});
 assert.equal(r.symbol,'TEST');assert.equal(r.points.length,7);assert.equal(r.summary.start_date,dates[0]);assert.equal(r.summary.end_date,dates.at(-1));assert.equal(r.summary.high.close,105);assert.equal(r.summary.low.close,97);assert.ok(Math.abs(r.summary.change_pct-5)<1e-10);assert.equal(r.meta.benchmark.status,'available');assert.equal(r.meta.news_coverage.historical_archive,false);assert.equal(r.meta.news_status,'available');assert.equal(calls.length,3);assert.ok(calls.find(u=>u.includes('includeAdjustedClose=true')&&u.includes('events=div%2Csplits')));
});
test('provider news and benchmark failures never block available stock prices',async()=>{
 const r=await collectPriceHistory('TEST','1mo',{now:NOW,fetcher:mockFetch({failNews:true,failBenchmark:true}),reviewedEvents:[]});assert.equal(r.points.length,7);assert.equal(r.meta.news_status,'unavailable');assert.equal(r.meta.benchmark.status,'unavailable');assert.deepEqual(r.events,[]);assert.ok(r.points.every(p=>p.benchmark_change_pct===null&&p.excess_change_pp===null));
});
test('price failure does not produce fallback fabricated chart',async()=>{
 await assert.rejects(()=>collectPriceHistory('TEST','1mo',{now:NOW,fetcher:async()=>new Response('unavailable',{status:503}),reviewedEvents:[]}),/prices are temporarily unavailable/);
});
test('international requests do not fetch SPY and disclose unsupported benchmark',async()=>{
 const calls=[],r=await collectPriceHistory('TEST','1mo',{now:NOW,fetcher:mockFetch({calls,stock:payload({meta:{currency:'EUR',exchangeTimezoneName:'Europe/Paris',exchangeName:'PAR'}})}),reviewedEvents:[]});assert.equal(calls.length,2);assert.equal(r.meta.benchmark.symbol,null);assert.equal(r.meta.benchmark.status,'incompatible_market');
});
test('range clipping preserves preceding-session return and event indices match visible points',async()=>{
 const ds=['2026-08-31','2026-09-01','2026-09-08','2026-09-09','2026-09-10','2026-10-08'],raw=[100,101,102,108,104,103];
 const r=await collectPriceHistory('TEST','1mo',{now:NOW,fetcher:mockFetch({stock:payload({ds,raw}),news:{news:[providerNews({providerPublishTime:Date.parse('2026-09-09T12:00:00Z')/1000})]}}),reviewedEvents:[]});
 assert.equal(r.points[0].date,'2026-09-09');assert.ok(r.points[0].change_pct>5);for(const e of r.events)assert.equal(r.points[e.index].date,e.date);
});

test('unknown early-close calendar never admits a possibly incomplete afternoon session',()=>{
 const p=payload({ds:['2026-12-21','2026-12-22','2026-12-23'],raw:[100,101,102]});
 const c=parsePriceChart(p,'TEST',Date.parse('2026-12-23T19:00:00Z'));
 assert.equal(c.points.at(-1).date,'2026-12-22');
});
test('non-US exact timestamp without verified close uses the next session',()=>{
 const c=chart({meta:{currency:'EUR',exchangeTimezoneName:'Europe/Paris',exchangeName:'PAR'}});
 const a=alignArticleSession({published_at:'2026-10-02T08:00:00Z',timing:'exact'},c);
 assert.equal(a.index,2);assert.equal(a.rule,'unknown_close_next_session');
});


test('range clipping never moves an earlier trading-day article onto the first visible session',async()=>{
 const ds=['2026-09-03','2026-09-04','2026-09-08','2026-09-09','2026-09-10','2026-10-08'],raw=[100,101,102,115,114,113];
 const old=providerNews({providerPublishTime:Date.parse('2026-09-04T12:00:00Z')/1000});
 const r=await collectPriceHistory('TEST','1mo',{now:NOW,fetcher:mockFetch({stock:payload({ds,raw}),news:{news:[old]}}),reviewedEvents:[]});
 assert.equal(r.points[0].date,'2026-09-09');assert.ok(r.points[0].change_pct>10);assert.deepEqual(r.events,[]);
});
test('an after-close article before the range retains its true next-session alignment',async()=>{
 const ds=['2026-09-03','2026-09-04','2026-09-08','2026-09-09','2026-09-10','2026-10-08'],raw=[100,101,102,115,114,113];
 const old=providerNews({providerPublishTime:Date.parse('2026-09-08T21:00:00Z')/1000});
 const r=await collectPriceHistory('TEST','1mo',{now:NOW,fetcher:mockFetch({stock:payload({ds,raw}),news:{news:[old]}}),reviewedEvents:[]});
 assert.equal(r.events.length,1);assert.equal(r.events[0].index,0);assert.equal(r.events[0].date,'2026-09-09');assert.equal(r.events[0].alignment_rule,'after_close_next_session');
});
