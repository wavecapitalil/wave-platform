#!/usr/bin/env python3
"""WAVE Data Engine scheduled snapshot runner."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))

from collectors import (
    collect_market, collect_risk, collect_sectors, collect_rates, collect_metals,
    collect_seasonality, collect_crypto, collect_calendar, SEASONALITY_SYMBOLS
)
from flask_snapshots import route_registry
from page_snapshots import page_registry
from process_manifest import Recorder

UTC=timezone.utc
SUPABASE_URL=os.getenv("WAVE_SUPABASE_URL","https://nqmtayofbhletydmiujz.supabase.co")
PUBLISHABLE=os.getenv("WAVE_SUPABASE_PUBLISHABLE_KEY","sb_publishable_5WjaBtaWtb3q7EJ3ldUfXQ_rVKIrZZy")
MIN_REFRESH_MINUTES=60
STALE_GRACE_MINUTES=20

REGISTRY={
    "market:core":("market",60,collect_market),
    "risk:composite":("risk",60,collect_risk),
    "sectors:sp500":("sectors",60,collect_sectors),
    "rates:curve":("rates",60,collect_rates),
    "metals:gold-silver":("metals",60,collect_metals),
    "crypto:market":("crypto",60,collect_crypto),
    "macro:calendar":("macro",60,collect_calendar),
}
for symbol in SEASONALITY_SYMBOLS:
    REGISTRY[f"seasonality:{symbol}"]=("seasonality",1440,lambda s=symbol: collect_seasonality(s))

REGISTRY.update(route_registry())
REGISTRY.update(page_registry())


def iso(dt):
    return dt.astimezone(UTC).isoformat().replace("+00:00","Z")


def existing_expiries():
    try:
        r=requests.get(
            SUPABASE_URL+"/rest/v1/data_snapshots",
            params={"select":"dataset_key,calculated_at,expires_at,status"},
            headers={"apikey":PUBLISHABLE},
            timeout=15,
        )
        r.raise_for_status()
        return {x["dataset_key"]:x for x in r.json()}
    except Exception as exc:
        print(f"WARN snapshot freshness lookup failed: {exc}",file=sys.stderr)
        return {}


def effective_refresh_minutes(ttl: int) -> int:
    """GitHub schedule is hourly; sub-hour TTLs cannot be guaranteed."""
    return max(MIN_REFRESH_MINUTES, int(ttl))


def due(key,row,now,ttl,force=False):
    if force or not row or row.get("status")!="ok":
        return True
    try:
        calculated=datetime.fromisoformat(row["calculated_at"].replace("Z","+00:00"))
        return calculated + timedelta(minutes=effective_refresh_minutes(ttl)) <= now
    except Exception:
        return True


def build_snapshot(key,group,ttl,collector,now):
    # Timestamp the actual collector dispatch, not the common run/queue start.
    fetched=datetime.now(UTC)
    refresh_minutes=effective_refresh_minutes(ttl)
    result=collector()
    calculated=datetime.now(UTC)
    status=result.get("_snapshot_status","ok")
    error=result.get("_snapshot_error")
    # Refresh is due at refresh_minutes. expires_at adds a small operational
    # grace window so a normal GitHub scheduler delay does not create a false
    # stale alert. The next run still refreshes based on calculated_at.
    expiry_minutes=refresh_minutes + (STALE_GRACE_MINUTES if refresh_minutes <= 60 else 0)
    return {
        "dataset_key":key,
        "dataset_group":group,
        "data":result["data"],
        "source":result["source"],
        "source_timestamp":result.get("source_timestamp"),
        "fetched_at":iso(fetched),
        "calculated_at":iso(calculated),
        "expires_at":iso(calculated+timedelta(minutes=expiry_minutes)),
        "logic_version":result["logic_version"],
        "freshness":f"{refresh_minutes}m_snapshot",
        "stale":False,
        "fallback":False,
        "status":status,
        "error":error,
    }


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",default="artifacts/data_snapshots.json")
    ap.add_argument("--manifest", default="artifacts/process_manifest.json")
    ap.add_argument("--force",action="store_true")
    ap.add_argument("--only",action="append",default=[])
    args=ap.parse_args()

    manifest=Recorder(args.manifest)
    try:
        return execute(args, manifest)
    except BaseException:
        manifest.finish(fatal=True)
        raise


def execute(args, manifest):
    now=datetime.now(UTC)
    current=existing_expiries()
    selected=set(args.only)
    snapshots=[]; failures=[]
    due_items=[]
    for key,(group,ttl,collector) in REGISTRY.items():
        if selected and key not in selected and group not in selected:
            manifest.skip(key, "not_selected")
            continue
        if not due(key,current.get(key),now,ttl,args.force):
            manifest.skip(key, "fresh")
            print(f"SKIP {key}: fresh")
            continue
        due_items.append((key,group,ttl,collector))

    # Deterministic core collectors stay sequential. Flask/API snapshots are
    # independent HTTP contracts and can be evaluated with a small worker pool.
    core_items=[x for x in due_items if not x[0].startswith("api:")]
    api_items=[x for x in due_items if x[0].startswith("api:")]

    for key,group,ttl,collector in core_items:
        print(f"RUN  {key}")
        try:
            snapshots.append(manifest.collect(key, lambda: build_snapshot(key,group,ttl,collector,now)))
        except Exception as exc:
            failures.append({"dataset_key":key,"error":str(exc)})
            print(f"FAIL {key}: {exc}",file=sys.stderr)

    def _run(item):
        key,group,ttl,collector=item
        return key,manifest.collect(key, lambda: build_snapshot(key,group,ttl,collector,now))

    if api_items:
        workers=min(4,len(api_items))
        print(f"RUN  {len(api_items)} API snapshots with {workers} workers")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures={pool.submit(_run,item):item[0] for item in api_items}
            for fut in as_completed(futures):
                key=futures[fut]
                try:
                    _,snap=fut.result()
                    snapshots.append(snap)
                    print(f" OK  {key}")
                except Exception as exc:
                    failures.append({"dataset_key":key,"error":str(exc)})
                    print(f"FAIL {key}: {exc}",file=sys.stderr)

    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    payload={"generated_at":iso(datetime.now(UTC)),"snapshots":snapshots,"failures":failures}
    out.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False),encoding="utf-8")
    print(json.dumps({"snapshots":len(snapshots),"failures":len(failures),"output":str(out)}))
    manifest.finish()
    if failures and not snapshots:return 2
    return 0

if __name__=="__main__":
    raise SystemExit(main())
