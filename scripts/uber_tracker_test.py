#!/usr/bin/env python3
"""Invariants for the Uber tracker baseline. Empty series stay empty."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import uber_tracker_build as build  # noqa: E402

EMPTY = ("drive_quotes", "eats_customer", "eats_basket", "eats_merchant")
CHARTS = (
    "drive_price_index", "drive_eta", "drive_surge", "drive_tightness",
    "eats_coverage", "eats_eta", "eats_cost", "eats_promo",
    "eats_expansion", "eats_coverage_vs_eta",
)


def fail(message: str):
    raise SystemExit(message)


def main():
    bundle = build.build()
    if bundle["inference"]["kind"] != "inference":
        fail("proxy read must be marked inference")
    if bundle["inference"]["label"] not in ("improving", "stable", "deteriorating"):
        fail("proxy read label missing")
    if bundle["inference"]["label"] != "stable":
        fail(f"baseline proxy read changed: {bundle['inference']['label']}")
    if "SEC" not in " ".join(bundle["inference"]["excluded"]):
        fail("SEC print must stay out of the proxy score")
    if bundle["consensus"]["mobility"] is not None or bundle["consensus"]["delivery"] is not None:
        fail("consensus was not in the baseline")
    if bundle["consensus"]["mobility_score"] != "unscored" or bundle["consensus"]["delivery_score"] != "unscored":
        fail("missing consensus must stay unscored")
    if build.consensus_score(10, 7) != "hot" or build.consensus_score(10, 9) != "in-line" or build.consensus_score(10, 13) != "cold":
        fail("consensus bands drifted")
    if build.consensus_score(18, None) != "unscored":
        fail("official growth must not be scored against a missing consensus")
    if build.basket_index([10, None, 2]) is not None or build.basket_index([]) is not None:
        fail("partial basket became a number")
    if build.basket_index([10, 2.5, 1]) != 13.5:
        fail("complete basket did not sum")
    if build.promo_share(None, 10) is not None:
        fail("missing promo count became a share")

    for key in EMPTY:
        if bundle["series"][key]["observations"]:
            fail(f"{key} has observations")
    for key in CHARTS:
        if bundle["charts"][key]["points"]:
            fail(f"{key} plotted an empty series")
    nyc = bundle["series"]["nyc_hvfhv"]["observations"]
    if len(nyc) != 13 or nyc[0]["month"] != "2025-09":
        fail("NYC month coverage changed")
    sep = nyc[-1]
    if sep["month"] != "2026-09" or sep["uber_month_est"] != 15412555 or sep["lyft_month_est"] != 5575126:
        fail("September 2026 raw TLC totals drifted")
    if abs(sep["uber_trips_per_day"] - 15412555 / 30) > 1e-9 or abs(sep["lyft_trips_per_day"] - 5575126 / 30) > 1e-9:
        fail("September 2026 daily average is not raw ÷ 30")
    if sep["uber_month_est"] == round(sep["uber_trips_per_day"]) * 30:
        fail("September 2026 monthly total was rebuilt from a rounded daily average")
    if nyc[0]["uber_month_est"] != 14047040:
        fail("September 2025 raw TLC total drifted")
    if sep["uber_share_pct"] != 73.4 or sep["uber_yoy_pct"] != 9.7:
        fail(f"September 2026 share or year-over-year drifted: {sep['uber_share_pct']} {sep['uber_yoy_pct']}")
    if nyc[0]["uber_yoy_pct"] is not None:
        fail("September 2025 year-over-year was filled without a prior September")
    if not any("fhvhv_tripdata_2026-09.parquet" in url for url in sep["source_urls"]):
        fail("September 2026 lost the TLC parquet URL")
    if not str(sep["collected_at"]).startswith("2026-11-06T") or not str(sep["collected_at"]).endswith("+02:00") or sep["collected_timezone"] != "Asia/Jerusalem":
        fail("September 2026 collection timestamp missing")
    if sep["kind"] != "fact":
        fail("September 2026 must stay a fact")
    if any(row["uber_trips_per_day"] in (None, 0) for row in nyc):
        fail("NYC trip cell blank or zero")
    lax = bundle["series"]["lax_tnc"]["observations"]
    june_2025 = next(row for row in lax if row["month"] == "2025-06")
    if june_2025["yoy_pct"] is not None or june_2025["ytd_yoy_pct"] is not None:
        fail("LAX June 2025 year-over-year was filled in")
    if len(bundle["route_basket"]) != 46 or len(bundle["cities"]) != 15:
        fail("route basket shape changed")
    if any(row["address_label"] is not None or row["status"] != "unobserved" for row in bundle["address_plan"]):
        fail("an Eats address was invented")
    if bundle["dish_basket"]["dishes_named"] != 0 or bundle["dish_basket"]["points"]:
        fail("dish basket is not empty")
    sec = {row["metric"]: row for row in bundle["sec_print"]}
    if sec["Trips_millions"]["q3_2026"] != 4061 or sec["Mobility_GB_USD_m"]["cc_yoy_pct"] != 17:
        fail("SEC metrics drifted from the CSV")
    if sec["Gross_Bookings_USD_m"]["cc_yoy_pct"] != 20 or sec["Delivery_GB_USD_m"]["yoy_pct"] != 22:
        fail("SEC growth rates drifted")
    guide = bundle["q4_guide"]
    if guide["low_usd_b"] != 63.25 or guide["high_usd_b"] != 65.25 or guide["kind"] != "fact":
        fail("Q4 guide drifted")
    if not guide["source_url"].startswith("https://www.sec.gov/"):
        fail("Q4 guide lost its filing URL")
    if any(row["kind"] != "fact" for row in bundle["series"]["driver_bonuses"]["observations"]):
        fail("driver ads must stay facts")
    page = (ROOT / "apps/terminal/public/terminal-uber-tracker.js").read_text(encoding="utf-8")
    method_ids = [item["id"] for item in bundle["methodology"]]
    for key in ("sec-q3", "q4-guide", "nyc", "lax", "driver-ads", "routes", "proxy", "empty"):
        if key not in method_ids:
            fail(f"methodology missing {key}")
    nyc_note = next(item for item in bundle["methodology"] if item["id"] == "nyc")
    joined = json.dumps(nyc_note, ensure_ascii=False)
    if "fhvhv_tripdata_2026-09.parquet" not in joined or "fhvhv_tripdata_2025-09.parquet" not in joined:
        fail("NYC methodology lost a parquet source that is in the data file")
    if "ut-method" not in page:
        fail("tracker page does not render the methodology section")
    if "bdi" not in page or "rtl" not in page:
        fail("tracker page lost rtl/bdi number handling")
    if "real-time" in page.lower() or "realtime" in page.lower():
        fail("tracker copy claims real time")
    html = (ROOT / "apps/terminal/public/terminal_app.html").read_text(encoding="utf-8")
    if 'data-page="uber-tracker"' not in html or 'id="page-uber-tracker"' not in html:
        fail("terminal section is not wired")
    workflow = (ROOT / ".github/workflows/uber-tracker.yml").read_text(encoding="utf-8")
    for cron in ('"0 6 * * *"', '"0 10 * * *"', '"30 15 * * *"', '"0 21 * * *"'):
        if cron not in workflow:
            fail(f"missing cron {cron}")
    print("uber tracker invariants passed")


if __name__ == "__main__":
    main()
