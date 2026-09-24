#!/usr/bin/env python3
"""Verify the Flask route surface survives modular extraction."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path("services/api").resolve()))

from app_factory import create_app  # noqa: E402

app = create_app(start_background=False)

REQUIRED = {
    "/",
    "/terminal",
    "/api/health",
    "/api/fear-greed",
    "/api/quote",
    "/api/intraday",
    "/api/vix-history",
    "/api/history",
    "/api/sector-detail",
    "/api/fundamentals",
    "/api/stock-info",
    "/api/holders",
    "/api/sectors",
    "/api/news",
    "/api/crypto-scanner",
    "/api/daily-brief",
    "/api/daily-brief/refresh",
    "/api/macro-news",
    "/api/econ-calendar",
    "/api/fred",
    "/api/earnings",
    "/api/earnings/refresh",
    "/api/yields",
    "/api/insider-buying",
    "/api/insider-buying/refresh",
    "/api/insider-activity",
    "/api/correlation",
    "/api/institutions-list",
    "/api/institutions",
    "/api/analyst-estimates",
    "/api/peers",
    "/api/ev-market",
    "/api/pcr",
    "/api/risk-signals",
    "/api/crypto-global",
    "/api/cohort-performance",
    "/api/cohort-prices",
    "/api/onchain-history",
    "/api/onchain-kpi",
    "/api/token-detail",
    "/api/cohort-news",
    "/api/article",
    "/api/top-stories",
    "/api/blog/articles",
    "/api/blog/article/<int:aid>",
    "/article-images/<path:filename>",
    "/api/ticker-mover",
    "/api/seasonality",
    "/api/commodities/gold-silver-ratio",
    "/api/hormuz/summary",
    "/api/hormuz/events",
    "/api/flows/overview",
    "/api/flows/crypto",
    "/api/flows/futures",
    "/api/flows/options",
    "/api/flows/short-interest",
    "/api/confluence",
}

rules = [rule.rule for rule in app.url_map.iter_rules() if rule.endpoint != "static"]
actual = set(rules)

missing = sorted(REQUIRED - actual)
duplicates = sorted({rule for rule in rules if rules.count(rule) > 1})

print(f"Registered routes: {len(rules)}")
if missing:
    print("Missing required routes:")
    for route in missing:
        print(" -", route)
if duplicates:
    print("Duplicate route rules:")
    for route in duplicates:
        print(" -", route)

if missing or duplicates:
    raise SystemExit("Route contract check failed")

print("Route contract check passed.")
