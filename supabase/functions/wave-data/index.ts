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
  const allowed=new Set(["5m","15m","30m","1h","2h","4h","6h","12h","1d"]);
  if(!allowed.has(period)) return json({error:"unsupported period"},400);
  const symbol:any=({BTCUSD:"BTCUSDT",ETHUSD:"ETHUSDT"} as any)[pair];
  if(!symbol) return json({error:"unsupported pair",supported:["BTCUSD","ETHUSD"]},400);

  const endpoints:any={
    global_accounts:"globalLongShortAccountRatio",
    top_accounts:"topLongShortAccountRatio",
    top_positions:"topLongShortPositionRatio"
  };
  const series:any={}, errors:any={};
  for(const [key,name] of Object.entries(endpoints)){
    try{
      const target="https://fapi.binance.com/futures/data/"+name+"?"+new URLSearchParams({
        symbol,period,limit:"30"
      }).toString();
      const r=await fetch(target,{headers:{"accept":"application/json","user-agent":"Mozilla/5.0"}});
      if(!r.ok) throw new Error("Binance USD-M HTTP "+r.status);
      const raw=await r.json();
      series[key]=(Array.isArray(raw)?raw:[]).map((x:any)=>({
        timestamp:Number(x.timestamp),
        long_pct:Number(x.longAccount)*100,
        short_pct:Number(x.shortAccount)*100,
        long_short_ratio:Number(x.longShortRatio)
      }));
    }catch(e){
      series[key]=[];
      errors[key]=String(e?.message||e);
    }
  }
  if(!Object.values(series).some((rows:any)=>Array.isArray(rows)&&rows.length)){
    return json({error:"crypto_positioning_unavailable",pair,period,errors},502);
  }
  return json({
    asset_class:"crypto",
    venue:"Binance USD-M Futures",
    pair,
    provider_symbol:symbol,
    period,
    series,
    errors,
    meta:{
      source:"Binance public USD-M futures market-data API",
      source_timestamp:null,
      fetched_at:new Date().toISOString(),
      freshness:"live",
      stale:false,
      fallback:true,
      note:"Positioning ratios, not blockchain exchange inflow/outflow data. WAVE uses USD-M because COIN-M endpoints can be region-blocked from cloud infrastructure."
    }
  },200,{"cache-control":"public, max-age=60","x-wave-source":"binance-usdm-live"});
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

function extractFact(facts:any,concepts:string[],form:string,minDays:number,maxDays:number,units=["USD"]){
  for(const concept of concepts){
    const raw=factUnits(facts,concept,units);
    const seen:any={};
    for(const row of raw){
      if(row?.form!==form || !row?.start || !row?.end) continue;
      const d=daysBetween(row.start,row.end);
      if(d<minDays || d>maxDays) continue;
      const end=String(row.end),filed=String(row.filed||"");
      if(!seen[end] || filed>String(seen[end].filed||"")) seen[end]=row;
    }
    const out:any={};
    for(const [end,row] of Object.entries(seen) as any[]){
      const v=Number(row.val);
      if(Number.isFinite(v)) out[end]=v;
    }
    if(Object.keys(out).length) return out;
  }
  return {};
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

  const concepts:any={
    revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet","SalesRevenueGoodsNet"],
    gross_profit:["GrossProfit"],
    operating_income:["OperatingIncomeLoss"],
    net_income:["NetIncomeLoss"],
    rd_expense:["ResearchAndDevelopmentExpense"],
    capex:["PaymentsToAcquirePropertyPlantAndEquipment"],
    ocf:["NetCashProvidedByUsedInOperatingActivities"]
  };
  const valid=new Set(["revenue","gross_profit","operating_income","net_income","eps_diluted","rd_expense","free_cash_flow","capex","gross_margin","operating_margin","net_margin","revenue_growth","op_income_growth","net_income_growth"]);
  if(!valid.has(metric)) return json({error:"unknown metric"},400);

  const rec=await secTickerRecord(symbol);
  if(!rec) return json({error:"symbol not found in SEC ticker universe",symbol},404);
  const fr=await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK"+rec.cik+".json",{headers:SEC_HEADERS});
  if(!fr.ok) return json({error:"SEC companyfacts HTTP "+fr.status,symbol},502);
  const fd=await fr.json();
  const facts=fd?.facts?.["us-gaap"]||{};
  const form=period==="quarterly"?"10-Q":"10-K";
  const minDays=period==="quarterly"?60:340;
  const maxDays=period==="quarterly"?100:380;
  const ex=(key:string)=>extractFact(facts,concepts[key]||[],form,minDays,maxDays,["USD"]);
  let raw:any={};

  if(metric==="eps_diluted"){
    raw=extractFact(facts,["EarningsPerShareDiluted"],form,minDays,maxDays,["USD/shares","USD"]);
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
      source:"SEC EDGAR companyfacts",
      cik:rec.cik,
      logic_version:"fundamentals_dynamic_sec_v2.0",
      growth_basis:metric.endsWith("_growth")?(period==="quarterly"?"same-quarter YoY":"annual YoY"):null,
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