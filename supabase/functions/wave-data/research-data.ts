// Display adapters: reuse cached SEC facts and the validated price parser.
// No financial-value backfill, no changes to company calculation definitions.
import {parsePriceChart,exchangeDate} from './price-history.ts';
import {calculatePriceHistory} from './calculations.ts';
const DAY=86400000;
const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const fields:Record<string,{concepts:string[],unit:string,instant?:boolean}>={
 assets:{concepts:['Assets'],unit:'USD',instant:true},liabilities:{concepts:['Liabilities'],unit:'USD',instant:true},equity:{concepts:['StockholdersEquity'],unit:'USD',instant:true},cash:{concepts:['CashAndCashEquivalentsAtCarryingValue'],unit:'USD',instant:true},
 operating_cash_flow:{concepts:['NetCashProvidedByUsedInOperatingActivities'],unit:'USD'},repurchased_shares:{concepts:['StockRepurchasedAndRetiredDuringPeriodShares'],unit:'shares'},shares_outstanding:{concepts:['CommonStockSharesOutstanding'],unit:'shares',instant:true},stock_compensation:{concepts:['ShareBasedCompensation'],unit:'USD'}
};
export function statementSeries(cache:any,metric:string,period:string,now=Date.now()){
 const def=fields[metric];if(!def||!['annual','quarterly'].includes(period))throw Error('Unsupported statement metric or period');
 const facts=cache?.document?.facts?.['us-gaap'];const today=new Date(now).toISOString().slice(0,10);const buckets=new Map<string,any[]>();
 const annualEnds=new Set<string>();
 for(const item of Object.values(facts||{}) as any[])for(const rows of Object.values(item?.units||{}) as any[])for(const r of rows){const days=(Date.parse(r.end)-Date.parse(r.start))/DAY;if(['10-K','10-K/A'].includes(r.form)&&days>=340&&days<=380&&validDate(r.filed)&&r.filed<=today)annualEnds.add(r.end);}
 for(const concept of def.concepts)for(const row of facts?.[concept]?.units?.[def.unit]||[]){
  const days=(Date.parse(row.end)-Date.parse(row.start))/DAY;
  if(!finite(row.val)||!row.accn||!validDate(row.end)||!validDate(row.filed)||row.filed>today||row.end>today)continue;
  if(period==='annual'?!['10-K','10-K/A'].includes(row.form):!['10-Q','10-Q/A','10-K','10-K/A'].includes(row.form))continue;
  if(def.instant&&period==='annual'&&!annualEnds.has(row.end))continue;
  if(!def.instant&&(!validDate(row.start)||!Number.isFinite(days)))continue;
  if(!def.instant&&(period==='annual'?days<340||days>380:days<60||days>100))continue;
  // SEC fy/fp belongs to the filing and may describe comparative rows. Preserve
  // calendar period ends; never use filing fiscal-year labels for old values.
  buckets.set(row.end,[...(buckets.get(row.end)||[]),{...row,concept}]);
 }
 const data=[...buckets.entries()].sort().flatMap(([date,rows])=>{const latest=rows.sort((a,b)=>b.filed.localeCompare(a.filed))[0];const peers=rows.filter(r=>r.filed===latest.filed);if(new Set(peers.map(r=>r.val)).size!==1)return [];return [{date,value:latest.val,filed:latest.filed,period_start:latest.start||null,period_end:date,source_url:cache?.cik?'https://www.sec.gov/Archives/edgar/data/'+Number(cache.cik)+'/'+latest.accn.replace(/-/g,'')+'/':null}];});
 return {symbol:cache?.ticker,metric,period,currency:def.unit==='USD'?'USD':null,unit:def.unit,data,meta:{split_basis:def.unit==='shares'?'As reported; split comparability unverified':null,source:'SEC EDGAR companyfacts via existing cache',provider_fetched_at:cache?.fetched_at||null,stale_fallback:!!cache?.stale_fallback,method:def.instant?'Reported period-end balances; latest available filing, no annual-to-quarter conversion.':'Direct reported duration facts only. Quarterly YTD cash flows are not converted or backfilled; missing standalone quarters remain unavailable.'}};
}
export async function collectResearchSeasonality(symbol:string,now=Date.now(),fetcher=fetch){
 if(!/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol))throw Error('Invalid symbol');
 const year=new Date(now).getUTCFullYear();const start=Date.UTC(year-10,0,1);
 const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({period1:String(start/1000),period2:String(Math.floor(now/1000)),interval:'1d',events:'div,splits',includeAdjustedClose:'true',includePrePost:'false'});
 const r=await fetcher(url,{headers:{'User-Agent':'WaveResearch/1.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Seasonality provider unavailable');
 const chart=parsePriceChart(await r.json(),symbol,now);return seasonalityFromPoints(chart.points,symbol,chart.timezone,now,chart.basis);
}
export function seasonalityFromPoints(points:any[],symbol:string,timezone:string,now:number,basis:string){
 const currentYear=Number(exchangeDate(now,timezone).slice(0,4));const years=new Map<number,any[]>();for(const p of points){const y=Number(p.date.slice(0,4));years.set(y,[...(years.get(y)||[]),p]);}
 const used:number[]=[],paths=new Map<number,Map<string,number>>(),missing:number[]=[];
 for(let y=currentYear-10;y<=currentYear;y++){
  const rows=(years.get(y)||[]).filter(p=>finite(p.close)&&p.close>0).sort((a,b)=>a.date.localeCompare(b.date));
  // Exclude partial listing years and major history gaps from the mean.
  const maxGap=rows.reduce((v,p,i)=>i?Math.max(v,(Date.parse(p.date)-Date.parse(rows[i-1].date))/DAY):v,0);
  if(!rows.length||rows[0].date>y+'-01-15'||(y<currentYear&&(rows.at(-1).date<y+'-12-15'||rows.length<180||maxGap>10))){if(y<currentYear)missing.push(y);continue;}
  const map=new Map<string,number>();let i=0;const end=y<currentYear?Date.UTC(y,11,31):Date.parse(rows.at(-1).date+'T00:00:00Z');
  for(let d=Date.UTC(y,0,1);d<=end;d+=DAY){const date=new Date(d).toISOString().slice(0,10);while(i+1<rows.length&&rows[i+1].date<=date)i++;if(date.slice(5)==='02-29')continue;map.set(date.slice(5),calculatePriceHistory('price_history_return_pct',{current:rows[i].close,previous:rows[0].close})!);}
  paths.set(y,map);if(y<currentYear)used.push(y);
 }
 const keys=[...new Set(used.flatMap(y=>[...paths.get(y)!.keys()]))].sort();const historical=keys.map(date_key=>{const vals=used.map(y=>paths.get(y)!.get(date_key)).filter(finite) as number[];return {date_key,return_pct:vals.length>=3?calculatePriceHistory('price_history_seasonal_mean',{total:vals.reduce((a,b)=>a+b,0),count:vals.length}):null,n:vals.length};});
 return {symbol,current_year:currentYear,years_used:used,missing_years:missing,lookback_years:10,historical_average:historical,current_path:[...(paths.get(currentYear)||new Map())].map(([date_key,return_pct])=>({date_key,return_pct})),price_basis:basis,meta:{fetched_at:new Date(now).toISOString(),source:'Yahoo Finance daily chart',method:'Previous ten completed calendar years only; each year starts at first completed session = 0%. Calendar dates carry preceding close. Partial years, fewer than 180 sessions, or gaps over ten days excluded. At least three years per historical point required. Current year ends at latest completed session.'}};
}
export async function collectDailyTape(symbol:string,now=Date.now(),fetcher=fetch){
 if(!['SPY','QQQ','^VIX','BTC-USD','GC=F','DX-Y.NYB','^TNX','CL=F'].includes(symbol))throw Error('Unsupported tape symbol');
 const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({period1:String(Math.floor((now-14*DAY)/1000)),period2:String(Math.floor(now/1000)),interval:'1d',includeAdjustedClose:'true',events:'div,splits',includePrePost:'false'});
 const r=await fetcher(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Tape provider unavailable');const chart=parsePriceChart(await r.json(),symbol,now);const last=chart.points.at(-1)!,previous=chart.points.at(-2)!;
 return {symbol,price:last.raw_close,currency:chart.currency,change_pct:last.change_pct,session_date:last.date,previous_session_date:previous.date,exchange_timezone:chart.timezone,basis:chart.basis,price_basis:'provider split-adjusted close',performance_basis:'completed exchange session versus preceding completed session',fetched_at:new Date(now).toISOString()};
}
