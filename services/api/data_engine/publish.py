#!/usr/bin/env python3
"""Publish WAVE snapshots to the Supabase ingestion edge in bounded batches."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import requests

DEFAULT_URL = "https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-snapshot-ingest"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("payload")
    ap.add_argument("--batch-size", type=int, default=25)
    ap.add_argument("--url", default=DEFAULT_URL)
    args = ap.parse_args()

    token = os.environ.get("OIDC_TOKEN", "").strip()
    if not token:
        raise SystemExit("OIDC_TOKEN is required")

    src = json.loads(Path(args.payload).read_text(encoding="utf-8"))
    snapshots = list(src.get("snapshots") or [])
    size = max(1, min(50, args.batch_size))
    total = 0

    for i in range(0, len(snapshots), size):
        batch = {
            "generated_at": src.get("generated_at"),
            "snapshots": snapshots[i:i + size],
            "failures": src.get("failures") or [],
        }
        r = requests.post(
            args.url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=batch,
            timeout=60,
        )
        if not r.ok:
            raise SystemExit(f"batch {i//size + 1} failed: HTTP {r.status_code} {r.text[:1000]}")
        body = r.json()
        count = int(body.get("upserted") or 0)
        total += count
        print(f"batch {i//size + 1}: upserted={count} history={body.get('history', 0)}")

    print(f"published snapshots={total} batches={(len(snapshots)+size-1)//size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
