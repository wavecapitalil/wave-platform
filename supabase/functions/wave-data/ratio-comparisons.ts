import {buildValuationInputs} from './valuation-inputs.ts';
import {COMPANY_INPUT_GROUPS,DEFINITIONS,buildInputs,runMetric,calculateRatioComparison} from './calculations.ts';
export const RATIO_KEYS=['pe_trailing','pe_forward','peg_ratio','peg_historical','ps_ratio','pb_ratio','ev_ebitda','gross_margin','operating_margin','net_margin','roe','roa','debt_to_equity','current_ratio','quick_ratio','dividend_yield','payout_ratio','revenue_growth','earnings_growth'];
const numeric=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const mean=(xs:number[])=>calculateRatioComparison('ratio_sample_mean',{total:xs.reduce((a,b)=>a+b,0),count:xs.length});
const gap=(reason:string)=>({value:null,count:0,reason});
const annualKeys=['current_ratio','quick_ratio','gross_margin','operating_margin','net_margin','roe','roa','revenue_growth','earnings_growth'];
const peerKeys=['pe_trailing','gross_margin','operating_margin','net_margin','roe','revenue_growth'];
const unsupported:any={pe_forward:'Historical point-in-time matched fiscal-year forecasts are unavailable',peg_ratio:'Historical provider forecast PEG snapshots are unavailable',ev_ebitda:'Matched historical enterprise value and EBITDA are unavailable',debt_to_equity:'Historical provider debt/equity definition is not verified',dividend_yield:'Historical provider dividend-yield basis is not verified',payout_ratio:'Matched historical provider payout inputs are unavailable'};
// A conflicting newest filing poisons every older version of that period.
// Do not turn the conflict into missing rows that could select an old filing.
function cleanPeriodRows(rows:any[],today:string){
 const valid=rows.filter(r=>r.filed<=today&&['10-K','10-K/A','10-Q','10-Q/A'].includes(r.form)&&!['segment','dimensions','dim','axis','member'].some(k=>r[k]!=null&&Object.keys(Object(r[k])).length));
 const latest=new Map<string,{filed:string,values:Set<any>}>();
 for(const r of valid){const k=r.end+'|'+(r.start||''),p=latest.get(k);if(!p||r.filed>p.filed)latest.set(k,{filed:r.filed,values:new Set([numeric(r.val)?r.val:null])});else if(r.filed===p.filed)p.values.add(numeric(r.val)?r.val:null);}
 return valid.filter(r=>r.filed===latest.get(r.end+'|'+(r.start||''))!.filed).map(r=>({...r,val:latest.get(r.end+'|'+(r.start||''))!.values.size!==1||!numeric(r.val)?null:r.val}));
}
// Restated annual samples, not a point-in-time series. Never reuse a current
// quote, forecast, share count, or denominator for a past fiscal year.
export function ratioHistory(document:any,historical:any,now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),cutoff=(Number(today.slice(0,4))-5)+today.slice(4);
 const facts=document?.facts?.['us-gaap']||{};
 const dates=[...new Set(['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','EarningsPerShareDiluted'].map(k=>facts[k]).filter(Boolean).flatMap((f:any)=>Object.values(f.units||{}).flatMap((rs:any)=>rs.filter((x:any)=>['10-K','10-K/A'].includes(x.form)&&x.start&&x.end>=cutoff&&x.end<=today&&x.filed<=today&&(Date.parse(x.end)-Date.parse(x.start))/86400000>=340&&(Date.parse(x.end)-Date.parse(x.start))/86400000<=380).map((x:any)=>x.end))))].sort().slice(-5) as string[];
 const clean:any={};for(const tags of COMPANY_INPUT_GROUPS){
  const units=[...new Set(tags.flatMap(tag=>Object.keys(facts[tag]?.units||{})))];
  for(const unit of units){const rows=tags.flatMap(tag=>(facts[tag]?.units?.[unit]||[]).map((r:any)=>({...r,_tag:tag})));for(const r of cleanPeriodRows(rows,today)){clean[r._tag]||={units:{}};clean[r._tag].units[unit]||=[];clean[r._tag].units[unit].push(r);}}
 }
 const guardedShares=buildValuationInputs(historical?.symbol||'',{document},{currency:'USD'},now).history;
 const availability=historical?.meta?.price_availability;
 const samples:any={};RATIO_KEYS.forEach(k=>samples[k]=[]);
 for(const end of dates){
  const filtered:any={};for(const [tag,f] of Object.entries(clean) as any){filtered[tag]={...f,units:Object.fromEntries(Object.entries(f.units||{}).map(([u,rs]:any)=>[u,rs.filter((x:any)=>x.end<=end)]))};}
  const context=buildInputs({facts:{'us-gaap':filtered}},{currency:'USD'});
  for(const key of annualKeys){const def=DEFINITIONS.find(d=>d.key===key);let reason=null,value=null;
   const balance=['current_ratio','quick_ratio'].includes(key);
   if((balance?context.balance_date:context.fiscal_year)!==end)reason='No matching fiscal-end inputs';
   else if(!balance&&new Set(def.variables.filter((k:string)=>!k.endsWith('_previous')).map((k:string)=>context.trace[k]?.period_start).filter(Boolean)).size>1)reason='Fiscal periods do not match';
   else {value=runMetric(def,def.expression,context.inputs);if(value==null)reason='Missing input or zero denominator';}
   samples[key].push({period_end:end,value,reason,inputs:context.trace});
  }
  const obs=historical?.data?.find((x:any)=>x.period_end===end);
  samples.pe_trailing.push({period_end:end,observation:obs||null,value:obs?.pe??null,reason:obs?.reason||(!obs?'Verified fiscal-end price/EPS observation unavailable':null)});
  // Point-in-time common shares are necessary for market-cap based multiples.
  // Weighted-average diluted EPS shares are deliberately not substituted.
  const shares=guardedShares.find((x:any)=>x.period_end===end)?.shares_outstanding;
  const sharesValid=shares?.status==='ok'&&shares.period_end===end&&shares.value>0;
  const priceValid=obs?.price_basis_verified===true;
  const cap=priceValid&&sharesValid?calculateRatioComparison('ratio_historical_market_cap',{price:obs.price,shares:shares.value}):null;
  for(const key of ['ps_ratio','pb_ratio','peg_historical']){
   const def=DEFINITIONS.find(d=>d.key===key),inputs={...context.inputs,market_cap:cap,price:obs?.price??null,eps_ttm:obs?.reported_diluted_eps??null};
   const matched=context.fiscal_year===end&&(key!=='pb_ratio'||(context.balance_date===end&&context.trace.equity_latest?.period_end===end));
   const value=priceValid&&matched&&(key!=='peg_historical'||obs?.pe!=null)?runMetric(def,def.expression,inputs):null;
   samples[key].push({period_end:end,value,inputs:context.trace,price_observation:obs||null,shares:shares||null,reason:value==null?(!matched?'No exact matching fiscal-end denominator':!priceValid?(obs?.price_reason||'Verified fiscal-end price basis unavailable'):key!=='peg_historical'&&!sharesValid?(shares?.reason||'Guarded entity-wide annual share count unavailable'):(obs?.reason||'Verified fiscal inputs unavailable')):null});
  }
 }
 return Object.fromEntries(RATIO_KEYS.map(key=>{const data=samples[key],valid=data.filter((x:any)=>numeric(x.value));return [key,{value:mean(valid.map((x:any)=>x.value)),count:valid.length,eligible_count:dates.length,expected_count:5,period_start:valid[0]?.period_end??null,period_end:valid.at(-1)?.period_end??null,samples:data,basis:'Arithmetic mean of fiscal-year-end annual samples; restated SEC filings',reason:valid.length?null:(unsupported[key]||'No valid annual samples'),partial:valid.length<5,...(['pe_trailing','ps_ratio','pb_ratio','peg_historical'].includes(key)&&availability?{price_availability:availability,...(availability.status==='unavailable'?{reason:availability.label+' ('+availability.error+')'}:{})}:{})}];}));
}
// A snapshot timestamp is only its publication envelope, never acquisition evidence.
function observationTime(p:any,now:number){
 const raw=p?.acquired_at;
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))return {reason:'Original UTC acquisition timestamp unavailable (legacy or invalid observation)'};
 const ts=Date.parse(raw);
 if(!Number.isFinite(ts))return {reason:'Original UTC acquisition timestamp invalid'};
 if(ts>now||now-ts>48*3600000)return {reason:'Original acquisition timestamp is future or older than 48 hours'};
 return {ts,as_of:new Date(ts).toISOString(),reason:null};
}
function freshSnapshot(row:any,now:number){return Date.parse(row?.expires_at||'')>now;}
export function ratioComparisons(history:any,peerRow:any,symbol:string,custom:string[]=[],now=Date.now()){
 const payload=peerRow?.data?.payload||peerRow?.data,peers=payload?.peers||[];
 const fresh=freshSnapshot(peerRow,now);
 const universe=[...new Set(peers.map((p:any)=>p.symbol).filter((s:any)=>typeof s==='string'&&s!==symbol))];
 const observed=universe.map(s=>peers.find((p:any)=>p.symbol===s)).map(p=>({...p,...observationTime(p,now)}));
 const excluded=observed.filter(p=>p.reason).map(p=>({symbol:p.symbol,reason:p.reason}));
 const rows:any={};for(const key of RATIO_KEYS){
  let h=history?.[key]||gap('Historical data unavailable'),sector:any=gap('A verified whole-sector universe is not available');
  let peer:any=gap(key==='pe_forward'?'Provider forward P/E does not match the current fiscal-year consensus horizon':'Matching selected-peer inputs are not supplied');
  if(peerKeys.includes(key)){
   const valid=observed.filter(p=>!p.reason&&numeric(p[key])&&(key!=='pe_trailing'||p[key]>0));
   const dates=fresh?valid.map(p=>p.as_of).sort():[];
   peer={value:fresh?mean(valid.map(p=>p[key])):null,count:fresh?valid.length:0,eligible_count:universe.length,universe,valid_symbols:fresh?valid.map(p=>p.symbol):[],observations:fresh?valid.map(p=>({symbol:p.symbol,value:p[key],as_of:p.as_of})):[],excluded_observations:excluded,as_of_start:dates[0]||null,as_of:dates.at(-1)||null,label:(payload?.subsector||'Selected')+' peers · mean',reason:!fresh?'Selected-peer snapshot missing or expired':valid.length?null:excluded.length?'Original acquisition timestamps unavailable, invalid or stale; observations excluded':'No eligible peer values',basis:key==='pe_trailing'?'Provider trailing P/E; positive earnings only':'Provider ratio definition; same field as uncustomized current value'};
  }
  if(custom.includes(key)){h={...h,value:null,reason:'Current owner formula is customized; baseline history is incompatible'};peer={...peer,value:null,reason:'Current owner formula is customized; provider peer ratios are incompatible'};}
  rows[key]={history:h,sector,peers:peer};
 }
 return {symbol,rows,generated_at:new Date(now).toISOString(),version:'ratio-comparisons-v2',sector:payload?.sector||null,methodology:'History uses up to five annual fiscal-end samples in the trailing five calendar years, latest restated SEC filings and verified same-date price/split/currency inputs. It is not a daily/monthly average or as-known backtest. Annual margin/return history is labeled separately from current provider TTM definitions. Selected peers exclude the target and are not a whole-sector benchmark. Constituent freshness and deduplication use original provider acquisition times (maximum age 48 hours) inside unexpired snapshots; cache reuse and publication never reset acquisition time. Legacy observations without verified acquisition timestamps are excluded. No on-demand peer fan-out. Current values retain their own timestamp. Constituent timestamps identify provider response acquisition, not underlying financial reporting dates or synchronized market quotes. The provider does not supply verified per-metric fiscal dates here; fiscal ends can differ. Acquisition ranges are shown, and no premium/discount or valuation verdict is calculated.'};
}

export function sectorComparisons(universe:any,snapshotRows:any[],symbol:string,custom:string[]=[],now=Date.now()){
 const membership=universe?.members||[],members=membership.filter((s:string)=>s!==symbol);
 const age=now-Date.parse(universe?.as_of||'');
 const universeOK=membership.includes(symbol)&&age>=0&&age<=7*86400000;
 const observations=new Map<string,any>(),excluded=new Map<string,any>();let target:any=null;
 for(const row of snapshotRows){if(!freshSnapshot(row,now))continue;
  for(const p of (row.data?.payload||row.data)?.peers||[]){
   if(p.symbol!==symbol&&!members.includes(p.symbol))continue;
   const time=observationTime(p,now);
   if(time.reason){if(p.symbol!==symbol)excluded.set(p.symbol,{symbol:p.symbol,reason:time.reason});continue;}
   if(p.symbol===symbol){if(!target||time.ts!>target.ts)target={...p,...time};continue;}
   const prev=observations.get(p.symbol);if(!prev||time.ts!>prev.ts)observations.set(p.symbol,{...p,...time});
  }
 }
 for(const s of observations.keys())excluded.delete(s);
 return Object.fromEntries(RATIO_KEYS.map(key=>{
  const valid=[...observations.values()].filter(p=>numeric(p[key])&&(key!=='pe_trailing'||p[key]>0));
  const supported=peerKeys.includes(key),eligible=universeOK&&supported&&!custom.includes(key);
  const dates=eligible?valid.map(p=>p.as_of).sort():[];
  return [key,{value:eligible?mean(valid.map(p=>p[key])):null,count:eligible?valid.length:0,eligible_count:members.length,universe:members,valid_symbols:eligible?valid.map(p=>p.symbol):[],observations:eligible?valid.map(p=>({symbol:p.symbol,value:p[key],as_of:p.as_of})):[],excluded_observations:[...excluded.values()],target_snapshot_value:eligible&&numeric(target?.[key])&&dates.length&&dates.every(d=>d===target.as_of)?target[key]:null,holdings_as_of:universe?.as_of||null,source_url:universe?.source_url||null,as_of_start:dates[0]||null,as_of:dates.at(-1)||null,label:(universe?.fund||'Sector')+' covered-constituent mean',partial:valid.length<members.length,
   reason:!universeOK?'No current official sector-fund membership for this ticker':custom.includes(key)?'Current owner formula is incompatible with provider constituent ratios':!supported?(key==='pe_forward'?'Constituent forecasts do not match the current fiscal-year horizon':'Matching constituent inputs are not present in the scheduled cache'):!valid.length?(excluded.size?'Original acquisition timestamps unavailable, invalid or stale; observations excluded':'No fresh compatible constituent observations in the scheduled cache'):null,
   basis:'Equal-weight arithmetic mean of available official sector-fund equity constituents, excluding target. Incomplete coverage is not the full sector mean. Positive earnings required for trailing P/E; no fund-level forward or harmonic multiple reused. Original provider acquisition times govern freshness and deduplication; publication timestamps do not rejuvenate cached values.'}];
 }));
}
