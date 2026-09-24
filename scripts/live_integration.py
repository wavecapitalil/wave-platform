#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import requests

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:5001"
REPORT = Path("live_integration_report.json")

META_KEYS = {"source","source_timestamp","fetched_at","freshness","stale","fallback"}

CASES = [
    {
        "name":"seasonality",
        "path":"/api/seasonality?symbol=SPY&years=10",
        "required":{"symbol","historical_average","current_path","meta"},
        "meta":True,
        "timeout":45,
        "critical":True,
    },
    {
        "name":"gold_silver",
        "path":"/api/commodities/gold-silver-ratio",
        "required":{"current","mean","percentile","z_score","monthly","meta"},
        "meta":True,
        "timeout":45,
        "critical":True,
    },
    {
        "name":"hormuz",
        "path":"/api/hormuz/summary",
        "required":{"risk_state","brent","wti","events","meta"},
        "meta":True,
        "timeout":45,
        "critical":True,
    },
    {
        "name":"flows_overview",
        "path":"/api/flows/overview",
        "required":{"domains","meta"},
        "meta":True,
        "timeout":20,
        "critical":True,
    },
    {
        "name":"flows_options",
        "path":"/api/flows/options?symbol=SPY",
        "required":{"symbol","expiry","call_open_interest","put_open_interest","meta"},
        "meta":True,
        "timeout":60,
        "critical":True,
    },
    {
        "name":"flows_short_interest",
        "path":"/api/flows/short-interest?symbol=AAPL",
        "required":{"symbol","short_float_pct","meta"},
        "meta":True,
        "timeout":60,
        "critical":False,
    },
    {
        "name":"flows_futures",
        "path":"/api/flows/futures?asset=gold",
        "required":{"asset","report_date","long_contracts","short_contracts","meta"},
        "meta":True,
        "timeout":90,
        "critical":False,
    },
    {
        "name":"flows_crypto",
        "path":"/api/flows/crypto?pair=BTCUSD&period=1h",
        "required":{"venue","pair","series","meta"},
        "meta":True,
        "timeout":45,
        "critical":False,
    },
    {
        "name":"confluence",
        "path":"/api/confluence?symbol=AAPL&window=30",
        "required":{"symbol","alignment","aligned_count","label","institutional","insiders","analysts","meta"},
        "meta":True,
        "timeout":180,
        "critical":False,
    },
]

results=[]
critical_failures=0

for case in CASES:
    row={"name":case["name"],"path":case["path"],"critical":case["critical"]}
    try:
        r=requests.get(BASE+case["path"],timeout=case["timeout"])
        row["status_code"]=r.status_code
        try:
            data=r.json()
        except Exception:
            data=None
        if r.status_code != 200 or not isinstance(data,dict):
            row["ok"]=False
            row["error"]=data.get("error") if isinstance(data,dict) else r.text[:300]
        else:
            missing=sorted(case["required"]-set(data.keys()))
            meta_missing=[]
            if case["meta"]:
                meta=data.get("meta")
                if isinstance(meta,dict):
                    meta_missing=sorted(META_KEYS-set(meta.keys()))
                else:
                    meta_missing=sorted(META_KEYS)
            row["missing_keys"]=missing
            row["missing_meta_keys"]=meta_missing
            row["ok"]=not missing and not meta_missing
            if not row["ok"]:
                row["error"]="schema mismatch"
    except Exception as exc:
        row["ok"]=False
        row["error"]=str(exc)

    if not row["ok"] and row["critical"]:
        critical_failures+=1

    results.append(row)
    status="PASS" if row["ok"] else ("WARN" if not row["critical"] else "FAIL")
    print(f"{status:4} {row['name']:22} {row.get('status_code','---')} {row.get('error','')}")

REPORT.write_text(json.dumps({"base":BASE,"results":results},indent=2),encoding="utf-8")

if critical_failures:
    raise SystemExit(f"{critical_failures} critical live integration check(s) failed")

print("Critical live integration checks passed.")
