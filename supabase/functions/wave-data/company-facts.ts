// Per-isolate load reduction only. The database remains the source of truth.
// No stale/error response is retained, and provider freshness is never extended.
export function createCompanyFactsLoader(fetchFacts:(symbol:string)=>PromiseLike<any>,
  {now=Date.now,ttlMs=30_000,maxEntries=4,maxBytes=12*1024*1024}:{now?:()=>number,ttlMs?:number,maxEntries?:number,maxBytes?:number}={}){
  const cached=new Map<string,{result:any,until:number,bytes:number}>();
  const pending=new Map<string,Promise<any>>();
  let retainedBytes=0;
  function remove(symbol:string){const hit=cached.get(symbol);if(hit)retainedBytes-=hit.bytes;cached.delete(symbol);}
  return function companyFacts(symbol:string):Promise<any>{
    symbol=symbol.trim().toUpperCase();
    const hit=cached.get(symbol);
    if(hit&&hit.until>now()){
      cached.delete(symbol);cached.set(symbol,hit);
      return Promise.resolve(hit.result);
    }
    remove(symbol);
    const underway=pending.get(symbol);
    if(underway)return underway;
    const request=Promise.resolve().then(()=>fetchFacts(symbol)).then(result=>{
      const fetched=Date.parse(result?.data?.fetched_at||'');
      const until=Math.min(now()+ttlMs,fetched+24*60*60*1000);
      if(!result?.error&&result?.data?.document&&!result.data.stale_fallback&&until>now()&&maxEntries>0){
        const bytes=new TextEncoder().encode(JSON.stringify(result)).byteLength;
        if(bytes<=maxBytes){
          while(cached.size>=maxEntries||retainedBytes+bytes>maxBytes)remove(cached.keys().next().value!);
          cached.set(symbol,{result,until,bytes});retainedBytes+=bytes;
        }
      }
      return result;
    }).finally(()=>pending.delete(symbol));
    pending.set(symbol,request);
    return request;
  };
}
