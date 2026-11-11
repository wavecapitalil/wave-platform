#!/usr/bin/env python3
"""Check public Uber sources and rebuild the bundle.

Does not log into Uber, Lyft, or Eats, and does not add a quote, ETA,
restaurant count, promo, or trip row from an unparsed page.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import uber_tracker_build as build  # noqa: E402

DATA = build.DATA
JERUSALEM = ZoneInfo("Asia/Jerusalem")
UA = "WaveCapitalResearch/1.0 (public dataset check)"


def public_urls() -> list[dict]:
    urls = [
        {"id": "tlc-trip-records", "url": "https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page", "expects": "page"},
        {"id": "tlc-help-aggregation", "url": "https://tlchelp.io/stats/uber-vs-lyft-market-share-nyc", "expects": "page"},
        {"id": "sec-exhibit-99-1", "url": build.SEC_URL, "expects": "page"},
    ]
    for row in build.read_csv("lax_tnc_monthly.csv"):
        urls.append({"id": f"lawa-{row['month']}", "url": row["source_url"], "expects": "pdf"})
    for row in build.read_csv("driver_signup_bonuses.csv"):
        urls.append({"id": f"driver-ad-{row['city']}", "url": row["source_url"], "expects": "page"})
    return urls


def probe(url: str) -> dict:
    request = Request(url, headers={"User-Agent": UA})
    try:
        with urlopen(request, timeout=25) as response:
            sample = response.read(64)
            return {
                "status": getattr(response, "status", 200),
                "content_type": response.headers.get("content-type", ""),
                "sample_bytes": len(sample),
                "error": None,
            }
    except HTTPError as exc:
        return {"status": exc.code, "content_type": "", "sample_bytes": 0, "error": str(exc)}
    except (URLError, TimeoutError, OSError) as exc:
        return {"status": None, "content_type": "", "sample_bytes": 0, "error": str(exc)}


def main():
    now = datetime.now(JERUSALEM).replace(microsecond=0)
    eats_window = now.weekday() == 0 and now.hour == 9
    checks = []
    for item in public_urls():
        result = probe(item["url"])
        checks.append({**item, **result})
        print(f"{result['status']} {item['id']}")
    reachable = sum(1 for row in checks if row["status"] == 200)
    entry = {
        "at": now.isoformat(),
        "timezone": "Asia/Jerusalem",
        "utc_offset": now.strftime("%z")[:3] + ":" + now.strftime("%z")[3:],
        "clock_time_logged": True,
        "action": "public_source_check",
        "eats_basket_window": eats_window,
        "quotes_collected": 0,
        "new_observations": 0,
        "reachable": reachable,
        "checked": len(checks),
        "skip_reason": "In-app Uber, Lyft, and Eats quotes need an authenticated session. This job does not log in and does not parse new trip or order figures from HTML or PDF.",
        "checks": checks,
    }
    log = DATA / "fetch_log.jsonl"
    with log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    build.main()
    print(f"attempt {entry['at']} reachable {reachable}/{len(checks)} new_observations 0")


if __name__ == "__main__":
    main()
