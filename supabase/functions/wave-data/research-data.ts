// Display adapters: reuse cached SEC facts and the validated price parser.
// Read-only research derivations; owner-editable company definitions unchanged.
import {parsePriceChart,exchangeDate} from './price-history.ts';
import {calculatePriceHistory,calculateStatement} from './calculations.ts';
const DAY=86400000;
const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const fields:Record<string,{concepts:string[],unit:string,instant?:boolean}>={
 assets:{concepts:['Assets'],unit:'USD',instant:true},liabilities:{concepts:['Liabilities'],unit:'USD',instant:true},equity:{concepts:['StockholdersEquity'],unit:'USD',instant:true},cash:{concepts:['CashAndCashEquivalentsAtCarryingValue'],unit:'USD',instant:true},
 capex:{concepts:['PaymentsToAcquirePropertyPlantAndEquipment'],unit:'USD'},free_cash_flow:{concepts:[],unit:'USD'},
 operating_cash_flow:{concepts:['NetCashProvidedByUsedInOperatingActivities'],unit:'USD'},repurchased_shares:{concepts:['StockRepurchasedAndRetiredDuringPeriodShares'],unit:'shares'},shares_outstanding:{concepts:['CommonStockSharesOutstanding'],unit:'shares',instant:true},stock_compensation:{concepts:['ShareBasedCompensation'],unit:'USD'}
};
// Additive cash-flow durations only. Fiscal-year labels on comparative SEC rows
// describe the filing, so matching uses exact start/end dates and concept/unit.
export function standaloneCashFlow(cache:any,concept:string,unit:string,now=Date.now()) {
 const today=new Date(now).toISOString().slice(0,10);
 const rows=(cache?.document?.facts?.['us-gaap']?.[concept]?.units?.[unit]||[]).filter((r:any)=>
  finite(r.val)&&typeof r.accn==='string'&&r.accn&&validDate(r.start)&&validDate(r.end)&&validDate(r.filed)
  &&r.start<r.end&&r.end<=today&&r.filed<=today&&['10-Q','10-Q/A','10-K','10-K/A'].includes(r.form));
 const days=(r:any)=>(Date.parse(r.end)-Date.parse(r.start))/DAY+1;
 const quarter=(r:any)=>{const d=days(r);return d>=60&&d<=105?1:d>=150&&d<=200?2:d>=240&&d<=300?3:d>=340&&d<=380?4:0;};
 const latest=(rs:any[])=>{if(!rs.length)return null;const filed=rs.map(r=>r.filed).sort().at(-1);const group=rs.filter(r=>r.filed===filed);return new Set(group.map(r=>r.val+'|'+r.start+'|'+r.end)).size===1?group.sort((a,b)=>a.accn.localeCompare(b.accn))[0]:null;};
 const url=(r:any)=>cache?.cik?'https://www.sec.gov/Archives/edgar/data/'+Number(cache.cik)+'/'+r.accn.replace(/-/g,'')+'/':null;
 const output=new Map<string,any>();const unavailable:any[]=[];
 const contexts=new Map<string,any[]>();rows.forEach((r:any)=>{const key=r.start+'|'+r.end;contexts.set(key,[...(contexts.get(key)||[]),r]);});
 // A direct three-month fact is authoritative; a cumulative fact never replaces it.
 for(const group of contexts.values()) {const r=latest(group);if(!r||quarter(r)!==1)continue;
  const item={statement_period:true,date:r.end,value:r.val,period_start:r.start,period_end:r.end,filed:r.filed,source_url:url(r),derived:false,calculation:null,source_periods:[{start:r.start,end:r.end,filed:r.filed,accession:r.accn,value:r.val,concept,unit}]};
  const existing=output.get(r.end);if(!existing||existing.filed<r.filed)output.set(r.end,item);else if(existing.filed===r.filed&&(existing.value!==r.val||existing.period_start!==r.start))output.delete(r.end);
 }
 for(const group of contexts.values()) {const current=latest(group);if(!current){unavailable.push({period_end:group[0].end,reason:'Conflicting cumulative values in the latest filing'});continue;}const q=quarter(current);if(q<2)continue;
  if(q===4&&!current.form.startsWith('10-K'))continue;
  if(new Set(rows.filter((r:any)=>r.end===current.end&&quarter(r)>=2).map((r:any)=>r.start)).size!==1){if(!output.has(current.end))unavailable.push({period_end:current.end,reason:'Ambiguous fiscal-year start'});continue;}
  const candidates=rows.filter((r:any)=>r.start===current.start&&r.end<current.end&&quarter(r)===q-1&&r.filed<=current.filed
   &&(Date.parse(current.end)-Date.parse(r.end))/DAY>=60&&(Date.parse(current.end)-Date.parse(r.end))/DAY<=105);
  const ends=[...new Set(candidates.map((r:any)=>r.end))];
  if(ends.length!==1){if(!output.has(current.end))unavailable.push({period_end:current.end,reason:'Missing or ambiguous preceding cumulative period'});continue;}
  const sameFiling=candidates.filter((r:any)=>r.accn===current.accn);const prior=latest(sameFiling.length?sameFiling:candidates);
  // Changed historical contexts indicate a restatement. Cross-filing subtraction
  // is withheld unless both cumulative amounts appear together in one filing.
  const priorVersions=rows.filter((r:any)=>r.start===current.start&&r.end===ends[0]);
  if(!prior||(!sameFiling.length&&(new Set(priorVersions.map((r:any)=>r.val)).size>1||new Set(group.map(r=>r.val)).size>1))){
   if(!output.has(current.end))unavailable.push({period_end:current.end,reason:'Conflicting or restated cumulative facts require a common filing'});continue;
  }
  const start=new Date(Date.parse(prior.end)+DAY).toISOString().slice(0,10);
  if(output.has(current.end))continue;
  output.set(current.end,{statement_period:true,date:current.end,value:calculateStatement('statement_quarter_difference',{cumulative:current.val,previous_cumulative:prior.val}),period_start:start,period_end:current.end,filed:current.filed,
   source_url:url(current),derived:true,derived_quarter:q,calculation:'statement_quarter_difference',source_periods:[current,prior].map(r=>({start:r.start,end:r.end,filed:r.filed,accession:r.accn,value:r.val,concept,unit,source_url:url(r)}))});
 }
 const gaps=[...new Map(unavailable.filter(r=>!output.has(r.period_end)).map(r=>[r.period_end,r])).values()];
 const data=[...output.values(),...gaps.map(r=>({statement_period:true,date:r.period_end,period_end:r.period_end,period_start:null,filed:null,value:null,status:'unavailable',reason:r.reason,derived:false,source_periods:[]}))].sort((a,b)=>a.date.localeCompare(b.date));
 return {data,unavailable:gaps};
}

export function statementSeries(cache:any,metric:string,period:string,now=Date.now()):any{
 const def=fields[metric];if(!def||!['annual','quarterly'].includes(period))throw Error('Unsupported statement metric or period');
 if(metric==='free_cash_flow'){
  const operating=statementSeries(cache,'operating_cash_flow',period,now),capex=statementSeries(cache,'capex',period,now);
  const ends=[...new Set([...operating.data,...capex.data].map((r:any)=>r.date))].sort();
  const data=ends.map(date=>{const a=operating.data.find((r:any)=>r.date===date),b=capex.data.find((r:any)=>r.date===date);
   const compatible=a&&b&&finite(a.value)&&finite(b.value)&&validDate(a.period_start)&&a.period_start===b.period_start&&a.filed&&a.filed===b.filed;
   return {date,period_end:date,period_start:compatible?a.period_start:null,filed:compatible?a.filed:null,statement_period:period==='quarterly',derived:true,calculation:'statement_free_cash_flow',
    value:compatible?calculateStatement('statement_free_cash_flow',{operating_cash_flow:a.value,capital_expenditure:b.value}):null,reason:compatible?null:'Operating cash flow and CapEx require matching period bounds and filing versions',source_url:a?.source_url||b?.source_url||null,source_periods:compatible?[...(a.source_periods||[a]),...(b.source_periods||[b])]:[]};});
  return {symbol:cache?.ticker,metric,period,currency:'USD',unit:'USD',data,meta:{source:'SEC EDGAR companyfacts via existing cache',provider_fetched_at:cache?.fetched_at||null,method:'Operating cash flow minus payments to acquire property, plant and equipment; same period and filing version required. This is a defined cash-flow measure, not a reported GAAP line item.'}};
 }

 if(period==='quarterly'&&['operating_cash_flow','stock_compensation','capex'].includes(metric)){const result=standaloneCashFlow(cache,def.concepts[0],def.unit,now);return {symbol:cache?.ticker,metric,period,currency:'USD',unit:def.unit,...result,meta:{source:'SEC EDGAR companyfacts via existing cache',provider_fetched_at:cache?.fetched_at||null,stale_fallback:!!cache?.stale_fallback,method:'Direct three-month facts take precedence. Q2/Q3 are compatible consecutive YTD differences; Q4 is annual minus nine months. Exact fiscal starts, concept, unit and contiguous quarter length are required. Restated cross-filing pairs remain unavailable.',derived_count:result.data.filter(r=>r.derived).length}};}
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
 const r=await fetcher(url,{headers:{'accept':'application/json','user-agent':'Wave-Research/1.0'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Tape provider unavailable (HTTP '+r.status+')');const chart=parsePriceChart(await r.json(),symbol,now);const last=chart.points.at(-1)!,previous=chart.points.at(-2)!;
 return {symbol,price:last.raw_close,currency:chart.currency,change_pct:last.change_pct,session_date:last.date,previous_session_date:previous.date,exchange_timezone:chart.timezone,basis:chart.basis,price_basis:'provider split-adjusted close',performance_basis:'completed exchange session versus preceding completed session',fetched_at:new Date(now).toISOString()};
}

// Filing-level evidence is separate from provider transaction rows: matching a
// person, date or share count heuristically must not invent a transaction link.
export function insiderFilingLinks(document:any,cik:string,now=Date.now()) {
 if(!/^\d{1,10}$/.test(String(cik))||Number(document?.cik)!==Number(cik))return [];
 const r=document?.filings?.recent,today=new Date(now).toISOString().slice(0,10);if(!Array.isArray(r?.form))return [];
 return r.form.flatMap((form:any,i:number)=>{
  const accession=r.accessionNumber?.[i],primary=r.primaryDocument?.[i],filed=r.filingDate?.[i],period=r.reportDate?.[i];
  if(!['4','4/A'].includes(form)||typeof accession!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(accession)||typeof primary!=='string'||!/^[A-Za-z0-9_./-]+$/.test(primary)||primary.includes('..')||primary.startsWith('/')||!validDate(filed)||filed>today)return [];
  return [{form,accession,filed,reported_period:validDate(period)?period:null,source_url:'https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/'+accession.replace(/-/g,'')+'/'+primary}];
 }).sort((a:any,b:any)=>b.filed.localeCompare(a.filed)||b.accession.localeCompare(a.accession)).slice(0,20);
}
