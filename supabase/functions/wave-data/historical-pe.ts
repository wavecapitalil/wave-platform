import {parsePriceChart,exchangeDate} from './price-history.ts';
import {calculateStatement} from './calculations.ts';
const DAY=86400000;
const date=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
// Annual observations, explicitly not a daily TTM estimate. Each denominator
// covers the actual reported 12-month fiscal period ending beside that price.
export function annualHistoricalPE(cache:any,payload:any,symbol:string,now=Date.now()) {
 const chart=parsePriceChart(payload,symbol,now),raw=payload.chart.result[0],today=new Date(now).toISOString().slice(0,10);
 const splits=Object.values(raw.events?.splits||{}).map((s:any)=>exchangeDate(Number(s.date)*1000,chart.timezone));
 const year=Number(today.slice(0,4)),cutoff=(year-5)+today.slice(4);
 const facts=(cache?.document?.facts?.['us-gaap']?.EarningsPerShareDiluted?.units?.['USD/shares']||[]).filter((r:any)=>
  typeof r.val==='number'&&Number.isFinite(r.val)&&date(r.start)&&date(r.end)&&date(r.filed)&&r.end<=today&&r.filed<=today
  &&['10-K','10-K/A'].includes(r.form)&&typeof r.accn==='string'&&r.accn&&(Date.parse(r.end)-Date.parse(r.start))/DAY>=340&&(Date.parse(r.end)-Date.parse(r.start))/DAY<=380&&r.end>=cutoff);
 const groups=new Map<string,any[]>();facts.forEach((r:any)=>groups.set(r.end,[...(groups.get(r.end)||[]),r]));
 const data=[...groups].sort().map(([end,rs])=>{
  const filed=rs.map(r=>r.filed).sort().at(-1),latest=rs.filter(r=>r.filed===filed),r=latest[0];
  const price=chart.points.filter(p=>p.date<=end).at(-1);let reason:string|null=null;
  if(new Set(latest.map(r=>r.start+'|'+r.val)).size!==1)reason='Conflicting reported annual EPS contexts';
  else if(chart.currency!=='USD')reason='Price and SEC EPS currencies do not match';
  else if(!price||(Date.parse(end)-Date.parse(price.date))/DAY>7)reason='No completed price session near fiscal year-end';
  else if(splits.some(d=>d>=r.start))reason='A split during or after this earnings period requires separately verified EPS rebasing';
  else if(r.val<=0)reason='P/E not meaningful with non-positive annual diluted EPS';
  return {period_start:r.start,period_end:end,price_date:price?.date||null,price:price?.raw_close??null,currency:chart.currency,
   reported_diluted_eps:r.val,eps_filed:r.filed,eps_accession:r.accn,pe:reason?null:calculateStatement('statement_historical_pe',{price:price!.raw_close,eps:r.val}),reason,
   source_url:cache?.cik?'https://www.sec.gov/Archives/edgar/data/'+Number(cache.cik)+'/'+r.accn.replace(/-/g,'')+'/':null};
 });
 return {symbol,data,basis:'Fiscal-year-end P/E using the latest reported annual diluted EPS; restated history, not an as-known investment backtest',forward_pe_history:null,meta:{source:'SEC EDGAR annual diluted EPS and Yahoo completed daily close',price_basis:'Provider split-adjusted close, excluding dividend adjustment',earnings_basis:'Reported full fiscal-year diluted EPS; latest filing version, which may postdate the price',split_guard:'Observation withheld for any split during or after its earnings period. No unverified EPS rebasing.',fetched_at:new Date(now).toISOString(),forward_limitation:'Historical point-in-time analyst forecast snapshots are not supplied by the current providers'}};
}
export async function collectHistoricalPE(cache:any,symbol:string,now=Date.now(),fetcher=fetch) {
 if(!/^[A-Z0-9][A-Z0-9.=-]{0,19}$/.test(symbol))throw Error('Invalid symbol');
 const start=Date.UTC(new Date(now).getUTCFullYear()-7,0,1);
 const r=await fetcher('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({period1:String(start/1000),period2:String(Math.floor(now/1000)),interval:'1d',events:'div,splits',includeAdjustedClose:'true'}),{headers:{'User-Agent':'WaveResearch/1.0'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Historical price provider unavailable');return annualHistoricalPE(cache,await r.json(),symbol,now);
}
