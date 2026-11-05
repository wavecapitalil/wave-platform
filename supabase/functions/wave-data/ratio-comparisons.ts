import {DEFINITIONS,buildInputs,runMetric,calculateRatioComparison} from './calculations.ts';
export const RATIO_KEYS=['pe_trailing','pe_forward','peg_ratio','peg_historical','ps_ratio','pb_ratio','ev_ebitda','gross_margin','operating_margin','net_margin','roe','roa','debt_to_equity','current_ratio','quick_ratio','dividend_yield','payout_ratio','revenue_growth','earnings_growth'];
const numeric=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const mean=(xs:number[])=>calculateRatioComparison('ratio_sample_mean',{total:xs.reduce((a,b)=>a+b,0),count:xs.length});
const gap=(reason:string)=>({value:null,count:0,reason});
const annualKeys=['current_ratio','quick_ratio','gross_margin','operating_margin','net_margin','roe','roa','revenue_growth','earnings_growth'];
const peerKeys=['pe_trailing','gross_margin','operating_margin','net_margin','roe','revenue_growth'];
const unsupported:any={pe_forward:'Historical point-in-time matched fiscal-year forecasts are unavailable',peg_ratio:'Historical provider forecast PEG snapshots are unavailable',ev_ebitda:'Matched historical enterprise value and EBITDA are unavailable',debt_to_equity:'Historical provider debt/equity definition is not verified',dividend_yield:'Historical provider dividend-yield basis is not verified',payout_ratio:'Matched historical provider payout inputs are unavailable'};
// Restated annual samples, not a point-in-time series. Never reuse a current
// quote, forecast, share count, or denominator for a past fiscal year.
export function ratioHistory(document:any,historical:any,now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),cutoff=(Number(today.slice(0,4))-5)+today.slice(4);
 const facts=document?.facts?.['us-gaap']||{};
 const dates=[...new Set(['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','EarningsPerShareDiluted'].map(k=>facts[k]).filter(Boolean).flatMap((f:any)=>Object.values(f.units||{}).flatMap((rs:any)=>rs.filter((x:any)=>['10-K','10-K/A'].includes(x.form)&&x.start&&x.end>=cutoff&&x.end<=today&&x.filed<=today&&(Date.parse(x.end)-Date.parse(x.start))/86400000>=340&&(Date.parse(x.end)-Date.parse(x.start))/86400000<=380).map((x:any)=>x.end))))].sort().slice(-5) as string[];
 const samples:any={};RATIO_KEYS.forEach(k=>samples[k]=[]);
 for(const end of dates){
  const filtered:any={};for(const [tag,f] of Object.entries(facts) as any){filtered[tag]={...f,units:Object.fromEntries(Object.entries(f.units||{}).map(([u,rs]:any)=>[u,rs.filter((x:any)=>x.end<=end&&x.filed<=today).map((x:any)=>({...x,val:rs.some((y:any)=>y.end===x.end&&y.start===x.start&&y.filed===x.filed&&y.val!==x.val)?null:x.val}))]))};}
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
  const shareRows=(filtered.CommonStockSharesOutstanding?.units?.shares||[]).filter((x:any)=>!x.start&&x.end===end).sort((a:any,b:any)=>b.filed.localeCompare(a.filed));
  const shares=shareRows[0],same=shareRows.filter((x:any)=>x.filed===shares?.filed);
  const sharesValid=shares&&new Set(same.map((x:any)=>x.val)).size===1&&shares.val>0;
  const multipleClasses=Object.keys(facts).some(k=>/Class[AB].*SharesOutstanding|SharesOutstanding.*Class[AB]/i.test(k));
  const cap=obs?.pe!=null&&sharesValid&&!multipleClasses?calculateRatioComparison('ratio_historical_market_cap',{price:obs.price,shares:shares.val}):null;
  for(const key of ['ps_ratio','pb_ratio','peg_historical']){
   const def=DEFINITIONS.find(d=>d.key===key),inputs={...context.inputs,market_cap:cap,price:obs?.price??null,eps_ttm:obs?.reported_diluted_eps??null};
   const value=obs?.pe!=null&&context.fiscal_year===end?runMetric(def,def.expression,inputs):null;
   samples[key].push({period_end:end,value,inputs:context.trace,price_observation:obs||null,shares:sharesValid?shares:null,reason:value==null?(obs?.reason||'Verified same-date price, common shares or fiscal inputs unavailable'):null});
  }
 }
 return Object.fromEntries(RATIO_KEYS.map(key=>{const data=samples[key],valid=data.filter((x:any)=>numeric(x.value));return [key,{value:mean(valid.map((x:any)=>x.value)),count:valid.length,eligible_count:dates.length,expected_count:5,period_start:valid[0]?.period_end??null,period_end:valid.at(-1)?.period_end??null,samples:data,basis:'Arithmetic mean of fiscal-year-end annual samples; restated SEC filings',reason:valid.length?null:(unsupported[key]||'No valid annual samples'),partial:valid.length<5}];}));
}
export function ratioComparisons(history:any,peerRow:any,symbol:string,custom:string[]=[],now=Date.now()){
 const payload=peerRow?.data?.payload||peerRow?.data,peers=payload?.peers||[];
 const age=now-Date.parse(peerRow?.fetched_at||''),fresh=age>=0&&age<=48*3600000&&Date.parse(peerRow?.expires_at||'')>now;
 const universe=[...new Set(peers.map((p:any)=>p.symbol).filter((s:any)=>typeof s==='string'&&s!==symbol))];
 const rows:any={};for(const key of RATIO_KEYS){
  let h=history?.[key]||gap('Historical data unavailable'),sector:any=gap('A verified whole-sector universe is not available');
  let peer:any=gap(key==='pe_forward'?'Provider forward P/E does not match the current fiscal-year consensus horizon':'Matching selected-peer inputs are not supplied');
  if(peerKeys.includes(key)){
   const valid=universe.map(s=>peers.find((p:any)=>p.symbol===s)).filter((p:any)=>numeric(p[key])&&(key!=='pe_trailing'||p[key]>0));
   peer={value:fresh?mean(valid.map((p:any)=>p[key])):null,count:fresh?valid.length:0,eligible_count:universe.length,universe,valid_symbols:fresh?valid.map((p:any)=>p.symbol):[],as_of:peerRow?.fetched_at||null,label:(payload?.subsector||'Selected')+' peers · mean',reason:!fresh?'Selected-peer snapshot missing or stale':valid.length?null:'No eligible peer values',basis:key==='pe_trailing'?'Provider trailing P/E; positive earnings only':'Provider ratio definition; same field as uncustomized current value'};
  }
  if(custom.includes(key)){h={...h,value:null,reason:'Current owner formula is customized; baseline history is incompatible'};peer={...peer,value:null,reason:'Current owner formula is customized; provider peer ratios are incompatible'};}
  rows[key]={history:h,sector,peers:peer};
 }
 return {symbol,rows,generated_at:new Date(now).toISOString(),version:'ratio-comparisons-v1',sector:payload?.sector||null,methodology:'History uses up to five annual fiscal-end samples in the trailing five calendar years, latest restated SEC filings and verified same-date price/split/currency inputs. It is not a daily/monthly average or as-known backtest. Annual margin/return history is labeled separately from current provider TTM definitions. Selected peers exclude the target and are not a whole-sector benchmark. Peer means use one stored snapshot (maximum age 48 hours, unexpired); no on-demand peer fan-out. Current values retain their own timestamp.'};
}

export function sectorComparisons(universe:any,snapshotRows:any[],symbol:string,custom:string[]=[],now=Date.now()){
 const membership=universe?.members||[],members=membership.filter((s:string)=>s!==symbol);
 const age=now-Date.parse(universe?.as_of||'');
 const universeOK=membership.includes(symbol)&&age>=0&&age<=7*86400000;
 const observations=new Map<string,any>();let target:any=null;
 for(const row of snapshotRows){const ts=Date.parse(row.fetched_at||'');if(!(now-ts>=0&&now-ts<=48*3600000&&Date.parse(row.expires_at||'')>now))continue;
  for(const p of (row.data?.payload||row.data)?.peers||[]){if(p.symbol===symbol&&(!target||ts>target.ts))target={...p,ts,as_of:row.fetched_at};if(!members.includes(p.symbol))continue;const prev=observations.get(p.symbol);if(!prev||ts>prev.ts)observations.set(p.symbol,{...p,ts,as_of:row.fetched_at});}
 }
 return Object.fromEntries(RATIO_KEYS.map(key=>{
  const valid=[...observations.values()].filter(p=>numeric(p[key])&&(key!=='pe_trailing'||p[key]>0));
  const supported=peerKeys.includes(key),eligible=universeOK&&supported&&!custom.includes(key);
  const dates=valid.map(p=>p.as_of).sort();
  return [key,{value:eligible?mean(valid.map(p=>p[key])):null,count:eligible?valid.length:0,eligible_count:members.length,universe:members,valid_symbols:eligible?valid.map(p=>p.symbol):[],target_snapshot_value:eligible&&numeric(target?.[key])&&dates.length&&dates.every(d=>d===target.as_of)?target[key]:null,holdings_as_of:universe?.as_of||null,source_url:universe?.source_url||null,as_of_start:dates[0]||null,as_of:dates.at(-1)||null,label:(universe?.fund||'Sector')+' constituent mean',partial:valid.length<members.length,
   reason:!universeOK?'No current official sector-fund membership for this ticker':custom.includes(key)?'Current owner formula is incompatible with provider constituent ratios':!supported?(key==='pe_forward'?'Constituent forecasts do not match the current fiscal-year horizon':'Matching constituent inputs are not present in the scheduled cache'):!valid.length?'No fresh compatible constituent observations in the scheduled cache':null,
   basis:'Equal-weight arithmetic mean of available official sector-fund equity constituents, excluding target. Incomplete coverage is not the full sector mean. Positive earnings required for trailing P/E; no fund-level forward or harmonic multiple reused.'}];
 }));
}
