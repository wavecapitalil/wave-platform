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
    if len(nyc) != 12 or nyc[0]["month"] != "2025-09" or nyc[-1]["uber_trips_per_day"] != 477421:
        fail("NYC baseline rows changed")
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
