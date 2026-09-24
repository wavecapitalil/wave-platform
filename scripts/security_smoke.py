#!/usr/bin/env python3
import sys
import requests

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:5001"

CASES = [
    ("/api/health", 200),
    ("/", 200),
    ("/api.py", 404),
    ("/wave_secrets.env", 404),
    ("/.env", 404),
    ("/wave_cache.db", 404),
]

failed = 0
for path, expected in CASES:
    try:
        r = requests.get(BASE + path, timeout=10)
        ok = r.status_code == expected
        print(f"{'PASS' if ok else 'FAIL'} {path:24} expected={expected} got={r.status_code}")
        failed += 0 if ok else 1
    except Exception as exc:
        failed += 1
        print(f"FAIL {path:24} {exc}")

if failed:
    raise SystemExit(f"{failed} security smoke test(s) failed")

print("All security smoke tests passed.")
