#!/usr/bin/env python3
"""End-user production logic QA for WAVE.

This suite talks to the public wave-data gateway and validates semantics, not
only HTTP availability. It is intentionally provider-aware so source mistakes
and calculation drift become release failures.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from urllib.parse import urlparse

import requests

BASE=os.getenv("WAVE_GATEWAY","https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data").rstrip("/")
OUT=Path("end_user_qa_report.json")
session=requests.Session()
session.headers.update({"Accept":"application/json","User-Agent":"WAVE-EndUser-QA/1.0"})

results=[]
failures=[]

def record(name,ok,detail=None,data=None):
    row={"name":name,"ok":bool(ok)}
    if detail is not None: row["detail"]=detail
    if data is not None: row["data"]=data
    results.append(row)
    print(("PASS" if ok else "FAIL").ljust(5),name,detail or "")
    if not ok: failures.append(row)

def get(path,timeout=90,expect_json=True):
    r=session.get(BASE+path,timeout=timeout)
    if r.status_code!=200:
        raise AssertionError(f"HTTP {r.status_code}: {r.text[:500]}")
    if expect_json:
        return r.json()
    return r.text

def approx(a,b,tol=0.03):
    return a is not None and b is not None and abs(float(a)-float(b))<=tol

# 1) Data-health contract
try:
    health=get("/api/data-health",30)
    s=health.get("summary") or {}
    ok=(s.get("total",0)>=300 and s.get("error",0)==0 and s.get("partial",0)==0)
    record("data_health",ok,f"{s.get('ok')}/{s.get('total')} ok · stale={s.get('stale')} · errors={s.get('error')}",s)
except Exception as e:
    record("data_health",False,str(e))

# 2) Canonical Risk Meter mathematics and provenance
try:
    d=get("/api/risk-signals",45)
    score=d.get("score") or {}
    sig=score.get("signals") or {}
    expected={"vix_level","vix_term_structure","credit","breadth","sector_rotation","put_call","spy_200dma"}
    if set(sig)!=expected:
        raise AssertionError(f"signal set mismatch: {sorted(sig)}")
    weight=sum(float(x["weight"]) for x in sig.values())
    weighted=sum(float(x["score"])*float(x["weight"]) for x in sig.values())/weight
    recomputed=round(weighted)
    if not math.isclose(weight,1.0,abs_tol=1e-9):
        raise AssertionError(f"weights sum to {weight}")
    if int(score.get("composite"))!=recomputed:
        raise AssertionError(f"composite {score.get('composite')} != recomputed {recomputed}")
    meta=d.get("meta") or {}
    source=(meta.get("source") or "")
    if "Yahoo Finance" not in source or "CBOE" not in source:
        raise AssertionError(f"unexpected risk source: {source}")
    record("risk_meter_logic",True,f"composite={recomputed} · 7 signals · source={source}",{
        "composite":recomputed,"weights":weight,"logic_version":meta.get("logic_version")
    })
except Exception as e:
    record("risk_meter_logic",False,str(e))

# 3) Hormuz rule semantics + provenance
try:
    d=get("/api/hormuz/summary",45)
    counts=d.get("event_counts") or {}
    high=int(counts.get("high") or 0)
    med=int(counts.get("medium") or 0)
    oil=float(d.get("oil_average_daily_pct") or 0)
    confirm=bool(d.get("price_confirmation"))
    expected_state="RED" if high>=1 and confirm else ("YELLOW" if high>=1 or med>=2 or oil>=2.0 else "GREEN")
    if d.get("risk_state")!=expected_state:
        raise AssertionError(f"state {d.get('risk_state')} != expected {expected_state}")
    events=d.get("events") or []
    pubs=[x.get("published") or "" for x in events]
    if pubs!=sorted(pubs,reverse=True):
        raise AssertionError("events are not newest-first")
    meta=d.get("meta") or {}
    if "Google News RSS" not in str(meta.get("news_source") or meta.get("source")):
        raise AssertionError("Hormuz news source is not explicit")
    if "Yahoo Finance" not in str(meta.get("market_source") or meta.get("source")):
        raise AssertionError("Hormuz market source is not explicit")
    record("hormuz_logic",True,f"{expected_state} · high={high} · medium={med} · oil avg={oil:.3f}% · confirmation={confirm}")
except Exception as e:
    record("hormuz_logic",False,str(e))

# 4) Arbitrary/new ticker fundamentals must not depend on pre-warmed snapshots
try:
    msft=get("/api/fundamentals?symbol=MSFT&metric=revenue&period=annual",60)
    meta=msft.get("meta") or {}
    rows=msft.get("data") or []
    if len(rows)<5: raise AssertionError(f"only {len(rows)} annual observations")
    if "SEC EDGAR" not in str(meta.get("source")):
        raise AssertionError(f"dynamic source not SEC: {meta.get('source')}")
    if rows[-1].get("value") is None or float(rows[-1]["value"])<=0:
        raise AssertionError("latest revenue missing")
    record("fundamentals_new_ticker",True,f"MSFT · {len(rows)} annual revenue points · {meta.get('source')}")
except Exception as e:
    record("fundamentals_new_ticker",False,str(e))

# 5) Quarterly growth must mean same-quarter YoY, not QoQ
try:
    rev=get("/api/fundamentals?symbol=MSFT&metric=revenue&period=quarterly",60)
    gro=get("/api/fundamentals?symbol=MSFT&metric=revenue_growth&period=quarterly",60)
    rev_map={x["date"]:float(x["value"]) for x in rev.get("data") or []}
    checks=0
    for row in gro.get("data") or []:
        d=row["date"]
        y,m,day=d.split("-")
        prev=f"{int(y)-1:04d}-{m}-{day}"
        if prev not in rev_map or d not in rev_map: continue
        expected=(rev_map[d]-rev_map[prev])/abs(rev_map[prev])*100
        if not approx(float(row["value"]),expected,0.03):
            raise AssertionError(f"{d}: {row['value']} != YoY {expected:.2f}")
        checks+=1
    if checks<6: raise AssertionError(f"only {checks} comparable YoY quarters")
    if (gro.get("meta") or {}).get("growth_basis")!="same-quarter YoY":
        raise AssertionError("growth_basis metadata missing/incorrect")
    record("fundamentals_quarterly_yoy",True,f"{checks} quarterly YoY observations independently recomputed")
except Exception as e:
    record("fundamentals_quarterly_yoy",False,str(e))

# 6) Cross-company fundamental comparison availability
try:
    aapl=get("/api/fundamentals?symbol=AAPL&metric=revenue&period=annual",60)
    msft=get("/api/fundamentals?symbol=MSFT&metric=revenue&period=annual",60)
    a={str(x["date"])[:4] for x in aapl.get("data") or []}
    m={str(x["date"])[:4] for x in msft.get("data") or []}
    common=sorted(a&m)
    if len(common)<3: raise AssertionError(f"only {len(common)} common fiscal years")
    record("fundamentals_comparison",True,f"AAPL vs MSFT · {len(common)} comparable fiscal years")
except Exception as e:
    record("fundamentals_comparison",False,str(e))

# 7) Second uncached-style ticker
try:
    hood=get("/api/fundamentals?symbol=HOOD&metric=revenue&period=annual",60)
    if len(hood.get("data") or [])<3: raise AssertionError("HOOD annual series too short")
    record("fundamentals_hood",True,f"{len(hood.get('data') or [])} annual observations")
except Exception as e:
    record("fundamentals_hood",False,str(e))

# 8) Home story feed must have summary + source + navigable reference
try:
    news=get("/api/news",45)
    stories=news.get("stories") or []
    usable=next((x for x in stories if x.get("title") and x.get("desc") and x.get("source") and x.get("link")),None)
    if not usable: raise AssertionError("no story with title + desc + source + link")
    u=urlparse(usable["link"])
    if u.scheme!="https" or not u.netloc: raise AssertionError("story source link is not HTTPS")
    record("home_story_source",True,f"{usable['source']} · {usable['title'][:90]}",{
        "source":usable["source"],"link":usable["link"],"summary_chars":len(usable["desc"])
    })
except Exception as e:
    record("home_story_source",False,str(e))

# 9) Foreign SEC filer annual fundamentals should work via IFRS/20-F when available
try:
    nvo=get("/api/fundamentals?symbol=NVO&metric=revenue&period=annual",60)
    nmeta=nvo.get("meta") or {}
    if len(nvo.get("data") or [])<5:
        raise AssertionError("NVO annual series too short")
    if nmeta.get("taxonomy")!="ifrs-full":
        raise AssertionError(f"unexpected taxonomy: {nmeta.get('taxonomy')}")
    if "20-F" not in (nmeta.get("forms") or []):
        raise AssertionError(f"unexpected forms: {nmeta.get('forms')}")
    record("fundamentals_foreign_ifrs",True,f"NVO · {len(nvo.get('data') or [])} annual periods · IFRS/20-F")
except Exception as e:
    record("fundamentals_foreign_ifrs",False,str(e))

# 10) Crypto positioning must contain real public-market observations
try:
    flows=get("/api/flows/crypto?pair=BTCUSD&period=1h",45)
    series=flows.get("series") or {}
    for key in ("global_accounts","top_accounts","top_positions"):
        rows=series.get(key) or []
        if not rows:
            raise AssertionError(f"{key} has no observations")
        last=rows[-1]
        if last.get("long_pct") is None or last.get("short_pct") is None or last.get("long_short_ratio") is None:
            raise AssertionError(f"{key} latest observation incomplete")
    source=str((flows.get("meta") or {}).get("source") or "")
    if "Binance" not in source:
        raise AssertionError(f"unexpected crypto positioning source: {source}")
    record("crypto_positioning",True,f"{flows.get('venue')} · 3 populated ratios · {source}")
except Exception as e:
    record("crypto_positioning",False,str(e))

# 11) Company Research must work for arbitrary non-prewarmed SEC tickers
for ticker in ("BE","CEG"):
    try:
        d=get(f"/api/stock-info?symbol={ticker}",60)
        required=["symbol","name","price","market_cap","sector","industry","revenue_growth","operating_margin","net_margin"]
        missing=[k for k in required if d.get(k) is None]
        if d.get("symbol")!=ticker:
            raise AssertionError(f"symbol mismatch: {d.get('symbol')}")
        if missing:
            raise AssertionError(f"missing key data: {missing}")
        record(f"company_research_dynamic_{ticker}",True,f"{d.get('name')} · {d.get('sector')} · price={d.get('price')}")
    except Exception as e:
        record(f"company_research_dynamic_{ticker}",False,str(e))

# 12) End-user feature endpoint availability
endpoint_cases={
    "market_quote":"/api/quote?symbol=SPY",
    "rates":"/api/yields",
    "sectors":"/api/sectors",
    "gold_silver":"/api/commodities/gold-silver-ratio",
    "seasonality":"/api/seasonality?symbol=SPY",
    "earnings":"/api/earnings",
    "institutions":"/api/institutions-list",
    "confluence":"/api/confluence?symbol=AAPL&window=30",
    "futures_flows":"/api/flows/futures?asset=gold",
    "crypto_global":"/api/crypto-global",
    "crypto_scanner":"/api/crypto-scanner",
    "sector_detail":"/api/sector-detail?period=1d&sector=XLK",
    "stock_info":"/api/stock-info?symbol=MSFT",
    "peers":"/api/peers?symbol=MSFT",
    "correlation":"/api/correlation?symbol=MSFT&benchmark=SPY",
    "pcr":"/api/pcr",
}
for name,path in endpoint_cases.items():
    try:
        data=get(path,90)
        if isinstance(data,dict) and data.get("error"):
            raise AssertionError(str(data["error"]))
        record("endpoint_"+name,True,"200")
    except Exception as e:
        record("endpoint_"+name,False,str(e))

payload={"gateway":BASE,"summary":{"total":len(results),"passed":sum(1 for x in results if x["ok"]),"failed":len(failures)},"results":results}
OUT.write_text(json.dumps(payload,indent=2,ensure_ascii=False),encoding="utf-8")
print(json.dumps(payload["summary"]))

if failures:
    raise SystemExit(f"{len(failures)} end-user QA check(s) failed")
