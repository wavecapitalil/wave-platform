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

function latestValue(map:any){
  const keys=Object.keys(map||{}).sort();
  if(!keys.length)return null;
  const v=Number(map[keys[keys.length-1]]);
  return Number.isFinite(v)?v:null;
}

function previousValue(map:any){
  const keys=Object.keys(map||{}).sort();
  if(keys.length<2)return null;
  const v=Number(map[keys[keys.length-2]]);
  return Number.isFinite(v)?v:null;
}

function ratioPct(num:any,den:any){
  const n=Number(num),d=Number(den);
  return Number.isFinite(n)&&Number.isFinite(d)&&d!==0 ? n/d*100 : null;
}

function pctGrowth(curr:any,prev:any){
  const c=Number(curr),p=Number(prev);
  return Number.isFinite(c)&&Number.isFinite(p)&&p!==0 ? (c-p)/Math.abs(p)*100 : null;
}

function extractInstantFact(facts:any,concepts:string[],forms:string|string[],units=["USD"]){
  const allowed=new Set(Array.isArray(forms)?forms:[forms]);
  const seen:any={};
  for(const concept of concepts){
    for(const row of factUnits(facts,concept,units)){
      if(!allowed.has(String(row?.form||"")) || !row?.end)continue;
      const end=String(row.end),filed=String(row.filed||"");
      if(!seen[end] || filed>String(seen[end].filed||""))seen[end]=row;
    }
  }
  const dates=Object.keys(seen).sort();
  if(!dates.length)return null;
  const v=Number(seen[dates[dates.length-1]].val);
  return Number.isFinite(v)?v:null;
}

async function yahooSearch(symbol:string){
  const r=await fetch("https://query1.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(symbol)+"&quotesCount=5&newsCount=0",{
    headers:{"accept":"application/json","user-agent":"Mozilla/5.0 WAVE"}
  });
  if(!r.ok)return null;
  const d=await r.json();
  return (d?.quotes||[]).find((x:any)=>String(x?.symbol||"").toUpperCase()===symbol)||null;
}

async function yahooChartMeta(symbol:string){
  const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=1y&interval=1d",{
    headers:{"accept":"application/json","user-agent":"Mozilla/5.0 WAVE"}
  });
  if(!r.ok)return null;
  const d=await r.json();
  const result=d?.chart?.result?.[0];
  if(!result)return null;
  const meta=result.meta||{};
  const closes=(result.indicators?.quote?.[0]?.close||[]).filter((x:any)=>Number.isFinite(Number(x))).map(Number);
  return {
    price:Number.isFinite(Number(meta.regularMarketPrice))?Number(meta.regularMarketPrice):(closes.length?closes[closes.length-1]:null),
    previous_close:Number.isFinite(Number(meta.chartPreviousClose))?Number(meta.chartPreviousClose):null,
    fifty_two_low:closes.length?Math.min(...closes):null,
    fifty_two_high:closes.length?Math.max(...closes):null,
    exchange:meta.fullExchangeName||meta.exchangeName||null,
    currency:meta.currency||null,
  };
}

async function yahooFundamentalTimeseries(symbol:string){
  const types=[
    "trailingMarketCap","trailingPeRatio","forwardPeRatio","pegRatio",
    "priceToSalesTrailing12Months","priceToBook","enterpriseToEbitda",
    "trailingEps","forwardEps","dividendYield","payoutRatio","beta",
    "averageDailyVolume3Month"
  ];
  const p2=Math.floor(Date.now()/1000)+86400;
  const p1=p2-3*365*86400;
  const url="https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"+encodeURIComponent(symbol)+
    "?symbol="+encodeURIComponent(symbol)+"&type="+types.join(",")+"&merge=false&period1="+p1+"&period2="+p2;
  const r=await fetch(url,{headers:{"accept":"application/json","user-agent":"Mozilla/5.0 WAVE"}});
  if(!r.ok)return {};
  const d=await r.json();
  const out:any={};
  for(const series of d?.timeseries?.result||[]){
    const type=String(series?.meta?.type?.[0]||"");
    const arr=Array.isArray(series?.[type])?series[type]:[];
    if(!type||!arr.length)continue;
    const sorted=arr.slice().sort((a:any,b:any)=>String(a?.asOfDate||"").localeCompare(String(b?.asOfDate||"")));
    const raw=Number(sorted[sorted.length-1]?.reportedValue?.raw);
    if(Number.isFinite(raw))out[type]=raw;
  }
  return out;
}

async function dynamicStockInfo(u:URL){
  const symbol=String(u.searchParams.get("symbol")||"").trim().toUpperCase();
  if(!symbol)return json({error:"symbol required"},400);

  const [search,chart,yts]=await Promise.all([
    yahooSearch(symbol).catch(()=>null),
    yahooChartMeta(symbol).catch(()=>null),
    yahooFundamentalTimeseries(symbol).catch(()=>({}))
  ]);

  let cachedRes:any={data:null,error:null};
  try{
    cachedRes=await admin.rpc("wave_get_companyfacts",{p_ticker:symbol,p_force:false});
  }catch(_e){
    cachedRes={data:null,error:null};
  }

  const cached:any=cachedRes?.data;
  const fd=cached?.document||null;
  const hasUs=Boolean(fd?.facts?.["us-gaap"] && Object.keys(fd.facts["us-gaap"]).length);
  const taxonomy=hasUs?"us-gaap":"ifrs-full";
  const facts=fd?.facts?.[taxonomy]||{};
  const annualForms=taxonomy==="us-gaap"?["10-K"]:["20-F"];
  const moneyUnits=["USD","EUR","DKK","GBP","CHF","JPY"];

  const concepts=taxonomy==="us-gaap" ? {
    revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet","SalesRevenueGoodsNet"],
    gross:["GrossProfit"],
    op:["OperatingIncomeLoss"],
    net:["NetIncomeLoss"],
    assets:["Assets"],
    equity:["StockholdersEquity","StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    current_assets:["AssetsCurrent"],
    current_liab:["LiabilitiesCurrent"],
    liabilities:["Liabilities"],
    debt:["LongTermDebtAndFinanceLeaseObligationsCurrent","LongTermDebtCurrent","LongTermDebtNoncurrent","LongTermDebt"],
  } : {
    revenue:["Revenue","RevenueFromContractsWithCustomers","SalesRevenue"],
    gross:["GrossProfit"],
    op:["ProfitLossFromOperatingActivities","OperatingProfitLoss"],
    net:["ProfitLoss","ProfitLossAttributableToOwnersOfParent"],
    assets:["Assets"],
    equity:["Equity","EquityAttributableToOwnersOfParent"],
    current_assets:["CurrentAssets"],
    current_liab:["CurrentLiabilities"],
    liabilities:["Liabilities"],
    debt:["NoncurrentBorrowings","CurrentBorrowings","Borrowings"],
  };

  const duration=(key:string)=>extractFact(facts,(concepts as any)[key]||[],annualForms,330,390,moneyUnits);
  const revenueMap=duration("revenue");
  const grossMap=duration("gross");
  const opMap=duration("op");
  const netMap=duration("net");
  const revenue=latestValue(revenueMap);
  const gross=latestValue(grossMap);
  const op=latestValue(opMap);
  const net=latestValue(netMap);
  const prevRevenue=previousValue(revenueMap);
  const prevNet=previousValue(netMap);

  const assets=extractInstantFact(facts,(concepts as any).assets||[],annualForms,moneyUnits);
  const equity=extractInstantFact(facts,(concepts as any).equity||[],annualForms,moneyUnits);
  const currentAssets=extractInstantFact(facts,(concepts as any).current_assets||[],annualForms,moneyUnits);
  const currentLiab=extractInstantFact(facts,(concepts as any).current_liab||[],annualForms,moneyUnits);
  const liabilities=extractInstantFact(facts,(concepts as any).liabilities||[],annualForms,moneyUnits);
  const debt=extractInstantFact(facts,(concepts as any).debt||[],annualForms,moneyUnits);

  const y:any=yts||{};
  const pct100=(v:any)=>Number.isFinite(Number(v)) ? (Math.abs(Number(v))<=2?Number(v)*100:Number(v)) : null;
  const price=chart?.price??null;
  const marketCap=y.trailingMarketCap??null;

  const body:any={
    symbol,
    name:search?.longname||search?.shortname||fd?.entityName||cached?.company_name||symbol,
    sector:search?.sector||search?.sectorDisp||null,
    industry:search?.industry||search?.industryDisp||null,
    exchange:search?.exchDisp||chart?.exchange||null,
    price,
    market_cap:marketCap,
    beta:y.beta??null,
    avg_volume:y.averageDailyVolume3Month??null,
    fifty_two_low:chart?.fifty_two_low??null,
    fifty_two_high:chart?.fifty_two_high??null,

    pe_trailing:y.trailingPeRatio??null,
    pe_forward:y.forwardPeRatio??null,
    peg_ratio:y.pegRatio??null,
    ps_ratio:y.priceToSalesTrailing12Months??null,
    pb_ratio:y.priceToBook??null,
    ev_ebitda:y.enterpriseToEbitda??null,
    eps_trailing:y.trailingEps??null,
    eps_forward:y.forwardEps??null,

    revenue_growth:pctGrowth(revenue,prevRevenue),
    earnings_growth:pctGrowth(net,prevNet),
    gross_margin:ratioPct(gross,revenue),
    operating_margin:ratioPct(op,revenue),
    net_margin:ratioPct(net,revenue),
    roe:ratioPct(net,equity),
    roa:ratioPct(net,assets),

    debt_to_equity:(debt!=null&&equity)?debt/equity*100:null,
    current_ratio:(currentAssets!=null&&currentLiab)?currentAssets/currentLiab:null,
    quick_ratio:null,
    dividend_yield:pct100(y.dividendYield),
    payout_ratio:pct100(y.payoutRatio),
    total_revenue:revenue,

    description:null,
    website:null,
    ceo:null,
    employees:null,

    meta:{
      source:["Yahoo Finance public search/chart/timeseries",fd?"SEC EDGAR CompanyFacts via Supabase cache":null].filter(Boolean).join(" + "),
      taxonomy:fd?taxonomy:null,
      logic_version:"stock_info_dynamic_v1.0",
      fetched_at:new Date().toISOString(),
      sec_cached:Boolean(cached?.cached),
      fields_may_be_null:true
    }
  };

  if(!search && !fd && price==null && marketCap==null){
    return json({error:"symbol data unavailable from public sources",symbol},404);
  }
  return json(body,200,{"x-wave-source":"dynamic-company-research","cache-control":"public, max-age=900"});
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
    if(p.endsWith("/api/stock-info")){
      const cached=await genericApiSnapshot(u);
      if(cached) return cached;
      return await dynamicStockInfo(u);
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