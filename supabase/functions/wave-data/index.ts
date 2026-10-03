import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON=Deno.env.get("SUPABASE_ANON_KEY")!;
const CORE=SUPABASE_URL+"/functions/v1/wave-core";
const db=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false}});

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"content-type,authorization,apikey",
  "content-type":"application/json"
};

function json(body:any,status=200,extra:Record<string,string>={}){
  return new Response(JSON.stringify(body),{status,headers:{...cors,...extra}});
}

async function snapshot(key:string){
  const {data,error}=await db.from("data_snapshots").select("*").eq("dataset_key",key).maybeSingle();
  if(error) throw new Error(error.message);
  return data;
}

function meta(row:any){
  const now=Date.now(), exp=row?.expires_at?Date.parse(row.expires_at):0;
  return {
    source:row?.source||null,
    source_timestamp:row?.source_timestamp||null,
    fetched_at:row?.fetched_at||null,
    calculated_at:row?.calculated_at||null,
    expires_at:row?.expires_at||null,
    freshness:row?.freshness||"snapshot",
    stale:!exp||exp<now,
    fallback:!!row?.fallback,
    logic_version:row?.logic_version||null
  };
}

async function snapshotResponse(key:string, transform?:(data:any,row:any)=>any){
  const row=await snapshot(key);
  if(!row) return json({error:"snapshot_not_ready",dataset_key:key},503);
  const body=transform?transform(row.data,row):{...row.data,meta:meta(row)};
  return json(body,200,{"x-wave-dataset":key,"x-wave-logic-version":row.logic_version||""});
}

async function proxyCore(req:Request){
  const u=new URL(req.url);
  const marker="/wave-data";
  const idx=u.pathname.indexOf(marker);
  const suffix=idx>=0?u.pathname.slice(idx+marker.length):u.pathname;
  const target=CORE+suffix+u.search;
  const r=await fetch(target,{method:"GET",headers:{"accept":"application/json"}});
  const text=await r.text();
  const headers={...cors,"x-wave-fallback":"wave-core"};
  return new Response(text,{status:r.status,headers});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("",{headers:cors});
  if(req.method!=="GET") return json({error:"method_not_allowed"},405);

  try{
    const u=new URL(req.url), p=u.pathname;

    if(p.endsWith("/api/health")){
      return json({ok:true,service:"wave-data",snapshot_backend:"supabase"});
    }
    if(p.endsWith("/api/risk-signals")){
      return await snapshotResponse("risk:composite");
    }
    if(p.endsWith("/api/sectors")){
      return await snapshotResponse("sectors:sp500");
    }
    if(p.endsWith("/api/yields")){
      return await snapshotResponse("rates:curve");
    }
    if(p.endsWith("/api/commodities/gold-silver-ratio")){
      return await snapshotResponse("metals:gold-silver");
    }
    if(p.endsWith("/api/seasonality")){
      const symbol=(u.searchParams.get("symbol")||"SPY").trim().toUpperCase();
      return await snapshotResponse("seasonality:"+symbol);
    }
    if(p.endsWith("/api/econ-calendar")){
      return await snapshotResponse("macro:calendar",(d)=>Array.isArray(d?.events)?d.events:[]);
    }
    if(p.endsWith("/api/quote")){
      const symbol=(u.searchParams.get("symbol")||"").trim().toUpperCase();
      const row=await snapshot("market:core");
      if(row?.data?.quotes){
        const values=Object.values(row.data.quotes) as any[];
        const q=values.find((x:any)=>String(x.symbol||"").toUpperCase()===symbol);
        if(q) return json({symbol:q.symbol,price:q.price,pct:q.pct,meta:meta(row)});
      }
      return await proxyCore(req);
    }
    if(p.endsWith("/api/crypto-market/quote")){
      const symbol=(u.searchParams.get("symbol")||"BTCUSDT").trim().toUpperCase();
      const row=await snapshot("crypto:market");
      const x=row?.data?.assets?.[symbol];
      if(x) return json({symbol,price:x.price,pct:x.pct_24h,source:"Binance Spot",meta:meta(row)});
      return await proxyCore(req);
    }

    // Intraday/history and any route not yet migrated keep the existing live edge fallback.
    return await proxyCore(req);
  }catch(e){
    return json({error:String(e?.message||e)},502);
  }
});