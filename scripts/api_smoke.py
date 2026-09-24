#!/usr/bin/env python3
"""WAVE API smoke test.

Run against a local stabilization server:
    python scripts/api_smoke.py

This is intentionally a smoke test, not a correctness backtest.
"""

import sys
import requests

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:5001"

CASES = [
    ("health", "/api/health"),
    ("quote", "/api/quote?symbol=SPY"),
    ("intraday", "/api/intraday?symbol=SPY"),
    ("vix", "/api/vix-history"),
    ("fear_greed", "/api/fear-greed"),
    ("sectors", "/api/sectors"),
    ("crypto_global", "/api/crypto-global"),
    ("pcr", "/api/pcr"),
    ("seasonality", "/api/seasonality?symbol=SPY&years=10"),
    ("gold_silver", "/api/commodities/gold-silver-ratio"),
    ("hormuz", "/api/hormuz/summary"),
    ("flows_overview", "/api/flows/overview"),
    ("flows_options", "/api/flows/options?symbol=SPY"),
    ("flows_short", "/api/flows/short-interest?symbol=AAPL"),
    ("confluence", "/api/confluence?symbol=AAPL&window=30"),
]

failed = 0

for name, path in CASES:
    try:
        r = requests.get(BASE + path, timeout=25)
        ok = 200 <= r.status_code < 300
        print(f"{'PASS' if ok else 'FAIL'} {name:16} {r.status_code:3} {path}")
        if not ok:
            failed += 1
    except Exception as exc:
        failed += 1
        print(f"FAIL {name:16} --- {path} :: {exc}")

if failed:
    raise SystemExit(f"{failed} API smoke test(s) failed")

print("Core API smoke tests passed.")
