import { calculatePriceHistory } from './calculations.ts';
import { REVIEWED_PRICE_EVENTS } from './reviewed-price-events.ts';

export const PRICE_RANGES = ['1mo','3mo','6mo','1y','5y'] as const;
export type PriceRange = typeof PRICE_RANGES[number];
type Fetcher = typeof fetch;
export type ReviewedEvent = {id:string;symbols:string[];published_at:string;timing:'exact'|'date_only';title:string;summary:string;url:string;source:string;relationship:'reported_driver'|'context';reviewed_at:string};
type Article = {id:string;published_at:string;timing:'exact'|'date_only';title:string;summary:string;url:string;source:string;relationship:'reported_driver'|'context';reviewed:boolean};
export type PricePoint = {date:string;close:number;raw_close:number|null;change_pct:number|null;benchmark_change_pct:number|null;excess_change_pp:number|null};
type ParsedChart = {symbol:string;currency:string;timezone:string;basis:string;points:PricePoint[];sessionEnds:Map<string,number>;isUS:boolean;limitations:string[];dropped:number};
export class PriceHistoryError extends Error {status:number;constructor(message:string,status=502){super(message);this.name='PriceHistoryError';this.status=status;}}
const DAY=86400000, NEWS_MAX_AGE=45*DAY, CACHE_TTL=5*60000, MAX_CACHE=96;
const cache=new Map<string,{at:number,value:any}>(), inflight=new Map<string,Promise<any>>();
const US_EXCHANGES=new Set(['NMS','NGM','NCM','NYQ','ASE','PCX','BATS','BTS','PNK','OQX','OQB','OEM','NAS','NYS','NYSE','NASDAQ','NYE','CBOE','SNP','DJI']);
export function strictNumber(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
export function validatePriceRequest(symbol:unknown,range:unknown):{symbol:string,range:PriceRange}{
 if(typeof symbol!=='string'||typeof range!=='string')throw new PriceHistoryError('A valid symbol and range are required',400);
 const clean=symbol.trim().toUpperCase();
 if(!/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(clean))throw new PriceHistoryError('Invalid symbol',400);
 if(!PRICE_RANGES.includes(range as PriceRange))throw new PriceHistoryError('Range must be 1mo, 3mo, 6mo, 1y or 5y',400);
 return {symbol:clean,range:range as PriceRange};
}
function validTimezone(value:unknown):value is string{if(typeof value!=='string')return false;try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}}
export function exchangeDate(epoch:number,timezone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(epoch));
 const read=(key:string)=>parts.find(p=>p.type===key)?.value||'';return `${read('year')}-${read('month')}-${read('day')}`;
}
function localMinutes(epoch:number,timezone:string):number{const p=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch));return Number(p.find(x=>x.type==='hour')?.value)*60+Number(p.find(x=>x.type==='minute')?.value);}
export function rangeStartDate(now:number,range:PriceRange,timezone:string):string{
 const d=new Date(exchangeDate(now,timezone)+'T12:00:00Z'),day=d.getUTCDate();
 const months=({ '1mo':1,'3mo':3,'6mo':6,'1y':12,'5y':60 })[range];
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);
}
function usEarlyClose(date:string):boolean{
 const d=new Date(date+'T12:00:00Z'),month=d.getUTCMonth()+1,day=d.getUTCDate(),weekday=d.getUTCDay();
 // Conservative around the July/Christmas holiday boundary. Exchange-provided
 // session ends always take precedence over this incomplete fallback calendar.
 return (month===7&&(day===2||day===3))||(month===12&&(day===23||day===24))||(month===11&&weekday===5&&day>=23&&day<=29);
}
function addSessionEnds(value:any,timezone:string,out:Map<string,number>){
 if(Array.isArray(value)){for(const v of value)addSessionEnds(v,timezone,out);return;}
 if(!value||typeof value!=='object')return;
 const start=strictNumber(value.start),end=strictNumber(value.end);
 if(start!=null&&end!=null&&end>start&&end-start<=24*3600)out.set(exchangeDate(start*1000,timezone),end*1000);
}
export function parsePriceChart(payload:any,symbol:string,now=Date.now()):ParsedChart{
 const r=payload?.chart?.result?.[0],meta=r?.meta;
 if(!r||!meta||String(meta.symbol||'').toUpperCase()!==symbol)throw new PriceHistoryError('No matching historical price data returned');
 const timezone=meta.exchangeTimezoneName;
 if(!validTimezone(timezone))throw new PriceHistoryError('Exchange timezone unavailable; session dates cannot be verified');
 const currency=typeof meta.currency==='string'&&/^[A-Za-z]{3}$/.test(meta.currency)?meta.currency:null;
 if(!currency)throw new PriceHistoryError('Price currency unavailable');
 const isUS=currency==='USD'&&timezone==='America/New_York'&&US_EXCHANGES.has(String(meta.exchangeName||meta.exchange||'').toUpperCase());
 const times=Array.isArray(r.timestamp)?r.timestamp:[],raw=r.indicators?.quote?.[0]?.close,adj=r.indicators?.adjclose?.[0]?.adjclose;
 if(!Array.isArray(raw)||times.length>15000)throw new PriceHistoryError('Historical price response is unavailable or too large');
 const ends=new Map<string,number>();addSessionEnds(meta.tradingPeriods?.regular||r.tradingPeriods?.regular,timezone,ends);addSessionEnds(meta.currentTradingPeriod?.regular,timezone,ends);
 const today=exchangeDate(now,timezone),limitations:string[]=[];let dropped=0;
 const records:{date:string;raw:number;adjusted:number|null;original:number}[]=[];
 for(let i=0;i<times.length;i++){
  const t=strictNumber(times[i]),close=strictNumber(raw[i]);
  if(t==null||close==null||close<=0||t*1000>now){dropped++;continue;}
  const date=exchangeDate(t*1000,timezone);if(date>today){dropped++;continue;}
  if(date===today){const end=ends.get(date),fallbackComplete=isUS&&localMinutes(now,timezone)>=16*60+10;if(end!=null?now<end+10*60000:!fallbackComplete){dropped++;continue;}}
  const adjusted=Array.isArray(adj)?strictNumber(adj[i]):null;
  records.push({date,raw:close,adjusted:adjusted!=null&&adjusted>0?adjusted:null,original:i});
 }
 records.sort((a,b)=>a.date.localeCompare(b.date));
 const unique=records.filter((row,index)=>index===0||row.date!==records[index-1].date);
 if(unique.length<2)throw new PriceHistoryError('At least two completed trading sessions are required');
 const adjusted=unique.every(x=>x.adjusted!=null),basis=adjusted?'dividend_and_split_adjusted_close':'split_adjusted_close';
 if(!adjusted)limitations.push('Consistent dividend-adjusted closes were unavailable. Yahoo raw close is already split-adjusted; cash dividends are not included and split ratios are never applied twice.');
 const splitDates=new Map<string,number>();
 for(const split of Object.values(r.events?.splits||{}) as any[]){const t=strictNumber(split?.date),a=strictNumber(split?.numerator),b=strictNumber(split?.denominator);if(t!=null&&a!=null&&b!=null&&a>0&&b>0)splitDates.set(exchangeDate(t*1000,timezone),a/b);}
 const points:PricePoint[]=unique.map((row,i)=>{
  const close=adjusted?row.adjusted!:row.raw,previous=i>0?(adjusted?unique[i-1].adjusted!:unique[i-1].raw):null;
  const split=splitDates.get(row.date);
  // A raw Yahoo series normally has no split discontinuity. Reject a response
  // contradicting its own split metadata instead of manufacturing adjusted data.
  if(split!=null&&previous!=null&&(split>=1.5||split<=2/3)&&Math.abs((close/previous)*split-1)<0.12)throw new PriceHistoryError('Historical price series contains an unresolved split discontinuity');
  return {date:row.date,close,raw_close:row.raw,change_pct:i>0&&row.original===unique[i-1].original+1?calculatePriceHistory('price_history_return_pct',{current:close,previous}):null,benchmark_change_pct:null,excess_change_pp:null};
 });
 if(dropped)limitations.push(`${dropped} missing, invalid, future or incomplete provider observations were excluded; returns across missing observations remain unavailable.`);
 limitations.push('Daily completed-session observations only. The current session is withheld until ten minutes after the available session close.');
 limitations.push(isUS?'Event alignment uses provider session ends where supplied, otherwise a conservative New York close schedule (13:00 around potential early-close holidays; 16:00 otherwise). Historical exchange exceptions may not be covered.':'Without a provider session end, exact-time news is conservatively assigned to the next trading date. No cross-market benchmark is substituted.');
 return {symbol,currency,timezone,basis,points,sessionEnds:ends,isUS,limitations,dropped};
}
export function safeArticleUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2500)return null;
 try{const u=new URL(value),host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||/^[\d.]+$/.test(host)||host.includes(':'))return null;
  if(host==='search.yahoo.com'||host==='www.google.com'||host==='google.com'||host==='bing.com'||host==='www.bing.com')return null;
  if((host==='finance.yahoo.com'||host==='www.finance.yahoo.com')&&!/^\/(news|m|video)\//.test(u.pathname))return null;
  if(u.pathname==='/'||!u.pathname)return null;
  u.hash='';for(const key of [...u.searchParams.keys()])if(/^(utm_|guccounter$|guce_referrer|ncid$|ocid$|ref$|fbclid$|gclid$)/i.test(key))u.searchParams.delete(key);
  u.pathname=u.pathname.replace(/\/$/,'');return u.toString();
 }catch{return null;}
}
function cleanText(value:unknown,max:number):string{return typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';}
function exactTimestamp(value:unknown):number|null{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const n=Date.parse(value);return Number.isFinite(n)?n:null;
}
function validDate(value:unknown):value is string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const epoch=Date.parse(value+'T12:00:00Z');return Number.isFinite(epoch)&&new Date(epoch).toISOString().slice(0,10)===value;}
export function parsePriceNews(payload:any,symbol:string,now=Date.now()):{articles:Article[];status:string;rejected:number}{
 if(!payload||!Array.isArray(payload.news))return {articles:[],status:'unavailable',rejected:0};
 const articles:Article[]=[],seen=new Set<string>();let rejected=0,stale=0;
 for(const n of payload.news.slice(0,100)){
  if(!Array.isArray(n.relatedTickers)||!n.relatedTickers.some((t:unknown)=>typeof t==='string'&&t.toUpperCase()===symbol)){rejected++;continue;}
  const epoch=strictNumber(n.providerPublishTime),url=safeArticleUrl(n.link),title=cleanText(n.title,240),source=cleanText(n.publisher,100);
  if(epoch==null||epoch<=0||epoch*1000>now||!url||!title||!source){rejected++;continue;}
  if(now-epoch*1000>NEWS_MAX_AGE){stale++;rejected++;continue;}
  if(seen.has(url)){rejected++;continue;}seen.add(url);
  articles.push({id:cleanText(n.uuid,100)||`news:${epoch}:${articles.length}`,published_at:new Date(epoch*1000).toISOString(),timing:'exact',title,summary:cleanText(n.summary,600)||'Ticker-tagged publisher headline; offered as dated context, without a verified causal claim.',url,source,relationship:'context',reviewed:false});
 }
 return {articles,status:articles.length?'available':stale?'stale':'empty',rejected};
}
function reviewedArticles(input:unknown,symbol:string,now:number,isUS:boolean):Article[]{
 if(!Array.isArray(input))return [];
 return input.flatMap((e:any)=>{
  if(!Array.isArray(e.symbols)||!e.symbols.some((s:unknown)=>s===symbol||(s==='*'&&isUS)))return [];
  const pub=e.timing==='date_only'&&validDate(e.published_at)?Date.parse(e.published_at+'T23:59:59Z'):e.timing==='exact'?exactTimestamp(e.published_at):null;
  const review=exactTimestamp(e.reviewed_at)??(validDate(e.reviewed_at)?Date.parse(e.reviewed_at+'T00:00:00Z'):null);
  const url=safeArticleUrl(e.url),title=cleanText(e.title,240),source=cleanText(e.source,100);
  if(pub==null||pub>now||review==null||review>now||!url||!title||!source||!['context','reported_driver'].includes(e.relationship))return [];
  return [{id:cleanText(e.id,100)||url,published_at:e.published_at,timing:e.timing,title,summary:cleanText(e.summary,700),url,source,relationship:e.relationship,reviewed:true}];
 });
}
export function alignArticleSession(article:{published_at:string;timing:string},chart:Pick<ParsedChart,'points'|'timezone'|'sessionEnds'|'isUS'>):{index:number;rule:string;shifted:boolean}|null{
 const exact=article.timing==='exact'?exactTimestamp(article.published_at):null;
 const date=article.timing==='date_only'&&validDate(article.published_at)?article.published_at:exact!=null?exchangeDate(exact,chart.timezone):null;
 if(!date)return null;
 let next=article.timing==='date_only',rule=next?'date_only_next_session':'same_session_before_close';
 if(exact!=null){const end=chart.sessionEnds.get(date);if(end!=null)next=exact>=end;else if(chart.isUS)next=localMinutes(exact,chart.timezone)>=(usEarlyClose(date)?13*60:16*60);else{next=true;rule='unknown_close_next_session';}if(next&&rule==='same_session_before_close')rule='after_close_next_session';}
 const index=chart.points.findIndex(p=>next?p.date>date:p.date>=date);
 if(index<0)return null;
 // Do not attach a very old publication to the start of a newer chart window.
 if(Date.parse(chart.points[index].date)-Date.parse(date)>7*DAY)return null;
 const shifted=chart.points[index].date!==date;
 if(shifted&&!next)rule='nontrading_day_next_session';return {index,rule,shifted};
}
export function alignBenchmark(stock:ParsedChart,benchmark:ParsedChart|null):{status:string;matched:number}{
 if(!stock.isUS)return {status:'incompatible_market',matched:0};
 if(!benchmark)return {status:'unavailable',matched:0};
 if(benchmark.currency!==stock.currency||benchmark.timezone!==stock.timezone||benchmark.basis!==stock.basis||!benchmark.isUS)return {status:'incompatible_basis_or_market',matched:0};
 const map=new Map(benchmark.points.map((p,i)=>[p.date,{point:p,previous:i>0?benchmark.points[i-1].date:null}]));let matched=0;
 for(let i=1;i<stock.points.length;i++){const p=stock.points[i],b=map.get(p.date);if(p.change_pct==null||!b||b.previous!==stock.points[i-1].date||b.point.change_pct==null)continue;p.benchmark_change_pct=b.point.change_pct;p.excess_change_pp=calculatePriceHistory('price_history_excess_pp',{stock_return:p.change_pct,benchmark_return:b.point.change_pct});matched++;}
 return {status:matched?'available':'no_aligned_sessions',matched};
}
export function selectPriceEvents(chart:ParsedChart,articles:Article[],range:PriceRange,visibleStartIndex=0):any[]{
 const points=chart.points,n=points.length,window=range==='1mo'?2:range==='5y'?10:4;
 const candidates=new Map<number,{reason:string;score:number}>();
 for(let i=visibleStartIndex;i<n;i++){
  const p=points[i],move=p.change_pct==null?0:Math.abs(p.change_pct);
  if(move>=2.5)candidates.set(i,{reason:'large_move',score:move});
  if(i<window||i>=n-window)continue;
  const before=points.slice(i-window,i).map(x=>x.close),after=points.slice(i+1,i+window+1).map(x=>x.close);
  const high=p.close>Math.max(...before,...after),low=p.close<Math.min(...before,...after);if(!high&&!low)continue;
  const a=calculatePriceHistory('price_history_prominence_pct',{extreme:p.close,reference:high?Math.min(...before):Math.max(...before)}),b=calculatePriceHistory('price_history_prominence_pct',{extreme:p.close,reference:high?Math.min(...after):Math.max(...after)});
  const prominence=a==null||b==null?0:Math.min(a,b);
  if(prominence>=2&&prominence>(candidates.get(i)?.score||0))candidates.set(i,{reason:high?'local_high':'local_low',score:prominence});
 }
 const pool:any[]=[],seen=new Set<string>();
 for(const article of [...articles].sort((a,b)=>Number(b.reviewed)-Number(a.reviewed)||a.published_at.localeCompare(b.published_at))){
  if(seen.has(article.url))continue;seen.add(article.url);
  const aligned=alignArticleSession(article,chart);if(!aligned)continue;
  // Only the first eligible session or the immediately following session can be
  // linked. A move before publication is never selected as that article's event.
  const choices=[aligned.index,aligned.index+1].filter(i=>i>=visibleStartIndex&&i<n&&candidates.has(i));
  if(!choices.length)continue;
  const index=choices.sort((a,b)=>(candidates.get(b)!.score-(b===aligned.index?0:1))-(candidates.get(a)!.score-(a===aligned.index?0:1)))[0],p=points[index],candidate=candidates.get(index)!;
  const relationship=article.reviewed&&article.relationship==='reported_driver'&&!aligned.shifted&&article.timing==='exact'&&index===aligned.index?'reported_driver':'context';
  pool.push({id:article.id,date:p.date,index,price:p.close,title:article.title,summary:article.summary,url:article.url,source:article.source,published_at:article.published_at,relationship,reason:candidate.reason,change_pct:p.change_pct,benchmark_change_pct:p.benchmark_change_pct,excess_change_pp:p.excess_change_pp,timing:article.timing,timing_label:article.timing==='date_only'?'Publication date only; next session or later':aligned.rule==='after_close_next_session'?'Published after close; next session or later':aligned.rule==='unknown_close_next_session'?'Close unverified; next session or later':aligned.rule==='nontrading_day_next_session'?'Published on a non-trading day; next session or later':index>aligned.index?'Session after first eligible session':'Published before session close; daily change may include moves before publication',alignment_rule:aligned.rule,reviewed:article.reviewed,_score:candidate.score+(article.reviewed?1:0)});
 }
 const max=range==='1mo'?6:8,spacing=Math.max(2,Math.min(10,Math.floor((n-visibleStartIndex)/35))),selected:any[]=[];
 for(const event of pool.sort((a,b)=>b._score-a._score||a.index-b.index||a.url.localeCompare(b.url))){if(selected.length>=max)break;if(selected.some(s=>Math.abs(s.index-event.index)<spacing))continue;const {_score,...result}=event;selected.push(result);}
 return selected.sort((a,b)=>a.index-b.index);
}
async function fetchJson(url:string,fetcher:Fetcher):Promise<any>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 try{const response=await fetcher(url,{signal:controller.signal,headers:{'accept':'application/json','user-agent':'Wave-Research/1.0'}});if(!response.ok)throw new Error(`Provider HTTP ${response.status}`);const text=await response.text();if(text.length>4_000_000)throw new Error('Provider response exceeds size limit');return JSON.parse(text);}finally{clearTimeout(timer);}
}
function chartUrl(symbol:string,range:PriceRange,now:number):string{
 // Fetch a preceding buffer for first-visible-day returns and local alignment.
 const start=Date.parse(rangeStartDate(now,range,'America/New_York')+'T00:00:00Z')-12*DAY;
 const params=new URLSearchParams({period1:String(Math.floor(start/1000)),period2:String(Math.floor(now/1000)),interval:'1d',includeAdjustedClose:'true',events:'div,splits',includePrePost:'false'});
 return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
}
export async function collectPriceHistory(symbolInput:string,rangeInput:string,opts:{now?:number;fetcher?:Fetcher;reviewedEvents?:ReviewedEvent[];bypassCache?:boolean}={}):Promise<any>{
 const {symbol,range}=validatePriceRequest(symbolInput,rangeInput),now=opts.now??Date.now();if(!Number.isFinite(now))throw new PriceHistoryError('Invalid request time',400);
 const useCache=!opts.fetcher&&!opts.reviewedEvents&&!opts.bypassCache&&opts.now===undefined,key=`${symbol}:${range}`;
 if(useCache){const hit=cache.get(key);if(hit&&now-hit.at<CACHE_TTL)return hit.value;const pending=inflight.get(key);if(pending)return await pending;}
 const run=async()=>{
  const fetcher=opts.fetcher||fetch;
  const newsPromise=fetchJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=50`,fetcher).then(data=>parsePriceNews(data,symbol,now)).catch(()=>({articles:[],status:'unavailable',rejected:0}));
  let chart:ParsedChart;
  try{chart=parsePriceChart(await fetchJson(chartUrl(symbol,range,now),fetcher),symbol,now);}catch(error){await newsPromise;throw error instanceof PriceHistoryError?error:new PriceHistoryError('Historical prices are temporarily unavailable from Yahoo Finance');}
  let benchmark:ParsedChart|null=null;
  if(chart.isUS){try{benchmark=symbol==='SPY'?{...chart,points:chart.points.map(p=>({...p}))}:parsePriceChart(await fetchJson(chartUrl('SPY',range,now),fetcher),'SPY',now);}catch{/* A benchmark failure must not remove valid stock prices. */}}
  const benchmarkResult=alignBenchmark(chart,benchmark),news=await newsPromise;
  const start=rangeStartDate(now,range,chart.timezone),visibleStartIndex=chart.points.findIndex(p=>p.date>=start);
  if(visibleStartIndex<0||chart.points.length-visibleStartIndex<2)throw new PriceHistoryError('Not enough completed sessions in the requested range');
  const reviewed=reviewedArticles(opts.reviewedEvents??REVIEWED_PRICE_EVENTS,symbol,now,chart.isUS),articles=[...reviewed,...news.articles];
  // Resolve publication timing against the full fetched session buffer. Clipping
  // first could turn an earlier trading day into an apparent non-trading day and
  // incorrectly attach its article to the first visible session.
  const events=selectPriceEvents(chart,articles,range,visibleStartIndex).map(e=>({...e,index:e.index-visibleStartIndex}));
  const coveredReviewed=reviewed.filter(e=>{const aligned=alignArticleSession(e,chart);return aligned!=null&&aligned.index+1>=visibleStartIndex;});
  chart.points=chart.points.slice(visibleStartIndex);
  benchmarkResult.matched=chart.points.filter(p=>p.benchmark_change_pct!=null).length;
  if(benchmarkResult.status==='available'&&!benchmarkResult.matched)benchmarkResult.status='no_aligned_sessions';
  const first=chart.points[0],last=chart.points.at(-1)!,high=chart.points.reduce((a,b)=>a.close>b.close?a:b),low=chart.points.reduce((a,b)=>a.close<b.close?a:b);
  const limitations=[...chart.limitations,'Yahoo search supplies a rolling recent headline sample (eligible publications within 45 days), not a historical news archive. Reviewed historical events are a limited sample and do not cover every ticker or move.','Annotations are dated context near large moves or local extrema; temporal proximity does not establish causation. Date-only publications are conservatively placed on the next trading session or later.'];
  if(benchmarkResult.status!=='available')limitations.push(`SPY comparison unavailable (${benchmarkResult.status}); no benchmark return or excess return is inferred.`);
  if(news.status!=='available')limitations.push(`Recent ticker-tagged news is ${news.status}; valid historical prices remain available.`);
  if(chart.basis==='dividend_and_split_adjusted_close')limitations.push('Adjusted close is the provider’s dividend-and-split-adjusted series, not the originally traded price. Raw close is provider split-adjusted close. Range high/low are closing-price extrema, not intraday highs/lows.');
  else limitations.push('Range high/low are closing-price extrema, not intraday highs/lows.');
  return {symbol,range,currency:chart.currency,exchange_timezone:chart.timezone,price_basis:chart.basis,points:chart.points,events,summary:{start_date:first.date,end_date:last.date,change_pct:calculatePriceHistory('price_history_return_pct',{current:last.close,previous:first.close}),high:{date:high.date,close:high.close},low:{date:low.date,close:low.close}},meta:{fetched_at:new Date(now).toISOString(),price_source:'Yahoo Finance chart daily',price_url:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,news_source:'Yahoo Finance ticker-tagged recent search + reviewed primary-source sample',news_status:news.status,news_coverage:{type:'recent_sample_plus_reviewed_history',recent_max_age_days:45,recent_valid_articles:news.articles.length,recent_rejected_articles:news.rejected,historical_archive:false,range_coverage:'partial',reviewed_articles_in_range:coveredReviewed.length},reviewed_event_count:coveredReviewed.length,selected_event_count:events.length,benchmark:{symbol:chart.isUS?'SPY':null,...benchmarkResult,currency:chart.isUS?'USD':null,price_basis:benchmark?.basis??null},cache_ttl_seconds:CACHE_TTL/1000,limitations}};
 };
 const promise=run();if(useCache)inflight.set(key,promise);
 try{const value=await promise;if(useCache){if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value!);cache.set(key,{at:now,value});}return value;}finally{if(useCache)inflight.delete(key);}
}
