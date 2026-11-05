import {parsePriceChart} from './price-history.ts';
export const HISTORY_FRESH_MS=3600000,HISTORY_RETAIN_MS=86400000;
const iso=(n:number)=>new Date(n).toISOString();
export class HistoricalPriceError extends Error {
 code:string;status:number|null;retryMs:number;
 constructor(code:string,status:number|null=null,retryMs=60000){super(code);this.code=code;this.status=status;this.retryMs=retryMs;}
}
// One bounded request, including body consumption. Retrying occurs only after
// the shared cooldown, on a later request; never immediately after HTTP 429.
export async function fetchHistoricalPrices(symbol:string,now=Date.now(),fetcher=fetch){
 const start=Date.UTC(new Date(now).getUTCFullYear()-7,0,1);
 const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+new URLSearchParams({period1:String(start/1000),period2:String(Math.floor(now/1000)),interval:'1d',events:'div,splits',includeAdjustedClose:'true'});
 const controller=new AbortController();let timer:any;
 try{
  return await Promise.race([(async()=>{
   const r=await fetcher(url,{headers:{'User-Agent':'WaveResearch/1.0'},signal:controller.signal});
   if(!r.ok){const raw=r.headers.get('retry-after'),seconds=raw&&/^\d+$/.test(raw)?Number(raw)*1000:raw?Date.parse(raw)-now:0;
    throw new HistoricalPriceError(r.status===429?'provider_rate_limited':'provider_http_error',r.status,Math.min(3600000,Math.max(r.status===429?300000:60000,Number.isFinite(seconds)?seconds:0)));}
   let payload;try{payload=await r.json();}catch{throw new HistoricalPriceError('provider_invalid_json');}
   try{parsePriceChart(payload,symbol,now);}catch{throw new HistoricalPriceError('provider_invalid_price_series');}
   return payload;
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new HistoricalPriceError('provider_timeout'));},8000);})]);
 }catch(e){if(e instanceof HistoricalPriceError)throw e;throw new HistoricalPriceError('provider_network_error');}
 finally{clearTimeout(timer);}
}
// Store only validated raw prices, never null-derived calculated histories.
// Persistence uses existing snapshots; a failed attempt cannot overwrite success.
export function createHistoricalPriceLoader({read,write,fetchPrices=fetchHistoricalPrices,clock=Date.now}:any){
 const memory=new Map<string,any>(),pending=new Map<string,Promise<any>>();let active=0;
 const put=(key:string,value:any)=>{if(memory.size>=200&&!memory.has(key))memory.delete(memory.keys().next().value!);memory.set(key,value);};
 async function load(key:string){try{const value=await read(key);if(value){if(value.payload)parsePriceChart(value.payload,key.slice('history-price-v1:'.length),clock());put(key,value);}}catch{/* Local verified cache remains usable. */}return memory.get(key);}
 async function save(key:string,value:any){put(key,value);try{await write(key,value);}catch{/* Acquisition timestamp remains unchanged even if persistence fails. */}}
 function result(good:any,failure:any){const now=clock(),acquired=Date.parse(good?.acquired_at||''),age=now-acquired;
  const usable=good?.version===1&&good?.payload&&age>=0&&age<=HISTORY_RETAIN_MS;
  const freshness=usable?(age<=HISTORY_FRESH_MS?'fresh':'retained'):'unavailable';
  return {payload:usable?good.payload:null,availability:{status:freshness,acquired_at:usable?good.acquired_at:null,last_success_at:good?.acquired_at||null,fresh_until:usable?iso(acquired+HISTORY_FRESH_MS):null,retain_until:usable?iso(acquired+HISTORY_RETAIN_MS):null,checked_at:iso(now),error:failure?.error||null,http_status:failure?.http_status||null,retry_at:failure?.retry_at||null,source:'Yahoo completed daily prices',label:freshness==='retained'?'Retained price history — refresh temporarily unavailable':freshness==='unavailable'?'Historical prices temporarily unavailable':'Verified price history',coverage:'Acquisition time is not a market quote or fiscal date. Split/event coverage ends at acquisition; retained history is not a refreshed observation.'}};
 }
 async function run(symbol:string){const key='history-price-v1:'+symbol;
  let good=memory.get(key);if(good&&result(good,null).availability.status==='fresh')return result(good,null);
  const loaded=await Promise.all([load(key),load(key+':failure'),load('history-price-v1:provider-backoff')]);good=loaded[0];
  if(result(good,null).availability.status==='fresh')return result(good,null);
  const now=clock(),failure=loaded.slice(1).filter(f=>Date.parse(f?.retry_at||'')>now).sort((a,b)=>Date.parse(b.retry_at)-Date.parse(a.retry_at))[0];
  if(failure)return result(good,failure);
  if(active>=2)return result(good,{error:'collector_busy',retry_at:iso(now+5000)});
  active++;
  try{
   const payload=await fetchPrices(symbol,now);parsePriceChart(payload,symbol,clock());
   good={version:1,payload,acquired_at:iso(clock())};await save(key,good);return result(good,null);
  }catch(e){const err=e instanceof HistoricalPriceError?e:new HistoricalPriceError('provider_invalid_price_series');
   const failed={error:err.code,http_status:err.status,attempted_at:iso(clock()),retry_at:iso(clock()+err.retryMs)};
   await save(key+':failure',failed);if(err.status===429)await save('history-price-v1:provider-backoff',failed);
   return result(good,failed);
  }finally{active--;}
 }
 return function(symbol:string){if(!/^[A-Z0-9][A-Z0-9.=-]{0,19}$/.test(symbol))return Promise.reject(Error('Invalid symbol'));
  if(pending.has(symbol))return pending.get(symbol)!;
  if(pending.size>=64)return Promise.resolve(result(null,{error:'collector_busy',retry_at:iso(clock()+5000)}));
  const request=run(symbol).finally(()=>pending.delete(symbol));pending.set(symbol,request);return request;
 };
}
