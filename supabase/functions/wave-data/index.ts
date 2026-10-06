import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON=Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORE=SUPABASE_URL+"/functions/v1/wave-core";
const db=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false}});
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});

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

async function dataHealthResponse(){
  const {data,error}=await db
    .from("data_snapshots")
    .select("dataset_key,dataset_group,source,source_timestamp,fetched_at,calculated_at,expires_at,logic_version,freshness,stale,fallback,status,error,updated_at")
    .order("dataset_group",{ascending:true})
    .order("dataset_key",{ascending:true})
    .limit(1000);
  if(error) throw new Error(error.message);

  const now=Date.now();
  const rows=(data||[]).map((row:any)=>{
    const expires=row.expires_at?Date.parse(row.expires_at):0;
    const calculated=row.calculated_at?Date.parse(row.calculated_at):0;
    return {
      ...row,
      stale:Boolean(row.stale)||!expires||expires<now,
      age_seconds:calculated?Math.max(0,Math.round((now-calculated)/1000)):null,
      expires_in_seconds:expires?Math.round((expires-now)/1000):null,
    };
  });
  const summary={
    total:rows.length,
    ok:rows.filter((x:any)=>x.status==="ok").length,
    partial:rows.filter((x:any)=>x.status==="partial").length,
    error:rows.filter((x:any)=>x.status==="error").length,
    stale:rows.filter((x:any)=>x.stale).length,
    fallback:rows.filter((x:any)=>x.fallback).length,
    groups:new Set(rows.map((x:any)=>x.dataset_group)).size,
  };
  return json({
    generated_at:new Date(now).toISOString(),
    engine_cadence_minutes:60,
    summary,
    datasets:rows,
  },200,{"cache-control":"no-store"});
}


function apiSuffix(u:URL){
  const marker="/wave-data";
  const idx=u.pathname.indexOf(marker);
  return idx>=0?u.pathname.slice(idx+marker.length):u.pathname;
}

function canonicalApiKey(u:URL){
  const suffix=apiSuffix(u);
  const ignored=new Set(["t","_","cacheBust","cache_bust"]);
  const pairs=Array.from(u.searchParams.entries()).filter(([k])=>!ignored.has(k)).sort((a,b)=>{
    if(a[0]===b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });
  const qs=new URLSearchParams();
  for(const [k,v] of pairs) qs.append(k,v);
  const encoded=qs.toString();
  return "api:"+suffix+(encoded?"?"+encoded:"");
}

async function genericApiSnapshot(u:URL){
  const key=canonicalApiKey(u);
  const row=await snapshot(key);
  if(!row || row.status!=="ok") return null;
  const d=row.data||{};
  const headers={"x-wave-dataset":key,"x-wave-logic-version":row.logic_version||"","x-wave-source":"scheduled-flask"};
  if(d._response_type==="text"){
    return new Response(String(d.payload??""),{
      status:Number(d._status_code||200),
      headers:{...cors,...headers,"content-type":String(d._content_type||"text/plain")}
    });
  }
  if(d._response_type==="json"){
    return json(d.payload,Number(d._status_code||200),headers);
  }
  return json(d,200,headers);
}

async function proxyCore(req:Request){
  const u=new URL(req.url);
  const suffix=apiSuffix(u);
  const target=CORE+suffix+u.search;
  const r=await fetch(target,{method:"GET",headers:{"accept":"application/json"}});
  const text=await r.text();
  const headers={...cors,"x-wave-fallback":"wave-core"};
  return new Response(text,{status:r.status,headers});
}

async function liveCryptoPositioning(u:URL){
  const pair=String(u.searchParams.get("pair")||"BTCUSD").trim().toUpperCase();
  const period=String(u.searchParams.get("period")||"1h").trim();
  const allowed=new Set(["1h","4h","1d"]);
  if(!allowed.has(period)) return json({error:"unsupported period",supported:["1h","4h","1d"]},400);
  if(!["BTCUSD","ETHUSD"].includes(pair)) return json({error:"unsupported pair",supported:["BTCUSD","ETHUSD"]},400);

  const {data:cached,error}=await db
    .from("crypto_positioning_cache")
    .select("data,source,fetched_at,status,error")
    .eq("pair",pair)
    .eq("period",period)
    .maybeSingle();

  if(!error && cached?.status==="ok" && cached?.data){
    const ageMs=Date.now()-Date.parse(cached.fetched_at);
    const payload={...cached.data};
    payload.meta={
      source:cached.source||"Binance public USD-M futures market-data API",
      source_timestamp:cached.fetched_at,
      fetched_at:cached.fetched_at,
      freshness:"hourly_cache",
      stale:ageMs>90*60*1000,
      fallback:true,
      note:"Positioning ratios, not blockchain exchange inflow/outflow data. WAVE caches Binance USD-M data in Supabase because cloud egress to Binance can be region-dependent."
    };
    return json(payload,200,{"cache-control":"public, max-age=60","x-wave-source":"supabase-crypto-positioning-cache"});
  }

  return json({
    error:"crypto_positioning_cache_unavailable",
    pair,period,
    detail:error?.message||cached?.error||"no cached observation"
  },503);
}

const SEC_HEADERS={
  "user-agent":"WaveCapital research@wavecapital.com",
  "accept-encoding":"gzip, deflate",
  "accept":"application/json"
};
let secTickerCache:any=null;
let secTickerCacheAt=0;

async function secTickerRecord(symbol:string){
  const normalized=String(symbol||"").trim().toUpperCase();
  if(!normalized) return null;

  // Persistent SEC ticker cache in Supabase avoids repeated downloads of the
  // 10k+ ticker mapping on Edge cold starts and prevents SEC 429s.
  const {data:cached,error}=await db
    .from("sec_ticker_map")
    .select("ticker,cik,company_name")
    .eq("ticker",normalized)
    .maybeSingle();
  if(!error && cached){
    return {cik:String(cached.cik).padStart(10,"0"),name:String(cached.company_name||normalized)};
  }

  // Safety fallback for a brand-new ticker not yet present in the persisted map.
  const now=Date.now();
  if(!secTickerCache || now-secTickerCacheAt>24*60*60*1000){
    const r=await fetch("https://www.sec.gov/files/company_tickers.json",{headers:SEC_HEADERS});
    if(!r.ok) throw new Error("SEC ticker map HTTP "+r.status);
    secTickerCache=await r.json();
    secTickerCacheAt=now;
  }
  for(const item of Object.values(secTickerCache||{}) as any[]){
    if(String(item?.ticker||"").toUpperCase()===normalized){
      return {cik:String(item.cik_str).padStart(10,"0"),name:String(item.title||normalized)};
    }
  }
  return null;
}

function daysBetween(a:string,b:string){
  return Math.round((Date.parse(b)-Date.parse(a))/86400000);
}

function factUnits(facts:any,concept:string,unitNames:string[]){
  const units=facts?.[concept]?.units||{};
  for(const unit of unitNames){
    if(Array.isArray(units[unit]) && units[unit].length) return units[unit];
  }
  return [];
}

function extractFact(facts:any,concepts:string[],forms:string|string[],minDays:number,maxDays:number,units=["USD"]){
  const allowedForms=new Set(Array.isArray(forms)?forms:[forms]);
  const merged:any={};
  for(const concept of concepts){
    const raw=factUnits(facts,concept,units);
    const seen:any={};
    for(const row of raw){
      if(!allowedForms.has(String(row?.form||"")) || !row?.start || !row?.end) continue;
      const d=daysBetween(row.start,row.end);
      if(d<minDays || d>maxDays) continue;
      const end=String(row.end),filed=String(row.filed||"");
      if(!seen[end] || filed>String(seen[end].filed||"")) seen[end]=row;
    }
    for(const [end,row] of Object.entries(seen) as any[]){
      if(end in merged) continue;
      const v=Number(row.val);
      if(Number.isFinite(v)) merged[end]=v;
    }
  }
  return merged;
}

function growthMap(raw:any,lag:number){
  const dates=Object.keys(raw).sort(),out:any={};
  for(let i=lag;i<dates.length;i++){
    const prev=Number(raw[dates[i-lag]]),curr=Number(raw[dates[i]]);
    if(Number.isFinite(prev)&&prev!==0&&Number.isFinite(curr)){
      out[dates[i]]=Math.round(((curr-prev)/Math.abs(prev)*100)*100)/100;
    }
  }
  return out;
}

async function dynamicFundamentals(u:URL){
  const symbol=String(u.searchParams.get("symbol")||"").trim().toUpperCase();
  const metric=String(u.searchParams.get("metric")||"revenue").trim();
  const period=String(u.searchParams.get("period")||"annual").trim();
  if(!symbol) return json({error:"symbol required"},400);
  if(!["annual","quarterly"].includes(period)) return json({error:"period must be annual or quarterly"},400);

  const usGaapConcepts:any={
    revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet","SalesRevenueGoodsNet"],
    gross_profit:["GrossProfit"],
    operating_income:["OperatingIncomeLoss"],
    net_income:["NetIncomeLoss"],
    rd_expense:["ResearchAndDevelopmentExpense"],
    capex:["PaymentsToAcquirePropertyPlantAndEquipment"],
    ocf:["NetCashProvidedByUsedInOperatingActivities"],
    eps:["EarningsPerShareDiluted"]
  };
  const ifrsConcepts:any={
    revenue:["Revenue","RevenueFromContractsWithCustomers","SalesRevenue"],
    gross_profit:["GrossProfit"],
    operating_income:["ProfitLossFromOperatingActivities","OperatingProfitLoss"],
    net_income:["ProfitLoss","ProfitLossAttributableToOwnersOfParent"],
    rd_expense:["ResearchAndDevelopmentExpense"],
    capex:["PurchaseOfPropertyPlantAndEquipment","PaymentsToAcquirePropertyPlantAndEquipment"],
    ocf:["CashFlowsFromUsedInOperatingActivities","NetCashFlowsFromUsedInOperatingActivities"],
    eps:["DilutedEarningsLossPerShare","BasicAndDilutedEarningsLossPerShare"]
  };
  const valid=new Set(["revenue","gross_profit","operating_income","net_income","eps_diluted","rd_expense","free_cash_flow","capex","gross_margin","operating_margin","net_margin","revenue_growth","op_income_growth","net_income_growth"]);
  if(!valid.has(metric)) return json({error:"unknown metric"},400);

  const {data:cachedFacts,error:factsError}=await admin.rpc("wave_get_companyfacts",{
    p_ticker:symbol,
    p_force:false
  });
  if(factsError || !cachedFacts?.document){
    return json({error:factsError?.message||"SEC companyfacts cache unavailable",symbol},502);
  }
  const rec={
    cik:String(cachedFacts.cik||"").padStart(10,"0"),
    name:String(cachedFacts.company_name||symbol)
  };
  const fd=cachedFacts.document;
  const hasUs=Boolean(fd?.facts?.["us-gaap"] && Object.keys(fd.facts["us-gaap"]).length);
  const taxonomy=hasUs?"us-gaap":"ifrs-full";
  const facts=fd?.facts?.[taxonomy]||{};
  const concepts=taxonomy==="us-gaap"?usGaapConcepts:ifrsConcepts;
  const forms=period==="quarterly"
    ? (taxonomy==="us-gaap"?["10-Q"]:["6-K","20-F"])
    : (taxonomy==="us-gaap"?["10-K"]:["20-F"]);
  const minDays=period==="quarterly"?60:340;
  const maxDays=period==="quarterly"?100:380;
  const ex=(key:string)=>extractFact(facts,concepts[key]||[],forms,minDays,maxDays,["USD","USDm","EUR","DKK","GBP","CHF","JPY"]);
  let raw:any={};

  if(metric==="eps_diluted"){
    raw=extractFact(facts,concepts.eps||[],forms,minDays,maxDays,["USD/shares","EUR/shares","DKK/shares","GBP/shares","CHF/shares","shares"]);
  }else if(metric==="free_cash_flow"){
    const ocf=ex("ocf"),capex=ex("capex");
    for(const d of Object.keys(ocf)) raw[d]=Number(ocf[d])-Math.abs(Number(capex[d]||0));
  }else if(["gross_margin","operating_margin","net_margin"].includes(metric)){
    const rev=ex("revenue");
    const key=metric==="gross_margin"?"gross_profit":metric==="operating_margin"?"operating_income":"net_income";
    const num=ex(key);
    for(const d of Object.keys(rev)){
      if(num[d]!=null && Number(rev[d])!==0) raw[d]=Math.round((Number(num[d])/Number(rev[d])*100)*100)/100;
    }
  }else if(["revenue_growth","op_income_growth","net_income_growth"].includes(metric)){
    const key=metric==="revenue_growth"?"revenue":metric==="op_income_growth"?"operating_income":"net_income";
    raw=growthMap(ex(key),period==="quarterly"?3:1);
  }else if(metric==="capex"){
    const capex=ex("capex");
    for(const d of Object.keys(capex)) raw[d]=-Math.abs(Number(capex[d]));
  }else{
    raw=ex(metric);
  }

  const data=Object.keys(raw).sort().map(date=>({date,value:raw[date]}));
  if(!data.length) return json({error:"metric unavailable from SEC companyfacts",symbol,metric,period,source:"SEC EDGAR"},404);
  return json({
    symbol,
    name:String(fd?.entityName||rec.name||symbol),
    metric,
    period,
    data,
    meta:{
      source:"SEC EDGAR companyfacts via Supabase cache",
      cik:rec.cik,
      logic_version:"fundamentals_dynamic_sec_v2.2",
      taxonomy,
      forms,
      growth_basis:metric.endsWith("_growth")?(period==="quarterly"?"same-quarter YoY":"annual YoY"):null,
      provider_fetched_at:cachedFacts.fetched_at||null,
      cached:Boolean(cachedFacts.cached),
      stale_fallback:Boolean(cachedFacts.stale_fallback),
      fetched_at:new Date().toISOString()
    }
  },200,{"x-wave-source":"sec-dynamic","cache-control":"public, max-age=900"});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("",{headers:cors});

  try{
    const u=new URL(req.url), p=u.pathname;

    if(req.method==="POST"){
      if(p.endsWith("/api/earnings/refresh") || p.endsWith("/api/insider-buying/refresh") || p.endsWith("/api/daily-brief/refresh")){
        return json({
          status:"managed",
          refresh_mode:"scheduled_data_engine",
          cadence:"60m",
          note:"The public Terminal is snapshot-backed; the next eligible hourly GitHub Data Engine run refreshes this dataset."
        },202,{"x-wave-refresh-mode":"scheduled"});
      }
      return json({error:"method_not_allowed"},405);
    }
    if(req.method!=="GET") return json({error:"method_not_allowed"},405);

    if(p.endsWith("/api/health")){
      return json({ok:true,service:"wave-data",snapshot_backend:"supabase"});
    }
    if(p.endsWith("/api/data-health")){
      return await dataHealthResponse();
    }
    if(p.endsWith("/api/flows/crypto")){
      return await liveCryptoPositioning(u);
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

    if(p.endsWith("/api/fundamentals")){
      const cached=await genericApiSnapshot(u);
      if(cached) return cached;
      return await dynamicFundamentals(u);
    }

    // Any Flask route that has a scheduled snapshot is served generically with
    // the exact original payload shape. Uncached/dynamic requests fall through.
    const generic=await genericApiSnapshot(u);
    if(generic) return generic;

    // Intraday/history and any route not yet cached keep the live edge fallback.
    return await proxyCore(req);
  }catch(e){
    return json({error:String(e?.message||e)},502);
  }
});