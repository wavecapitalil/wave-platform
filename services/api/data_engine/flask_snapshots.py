"""Snapshot existing Flask routes without duplicating their business logic.

The scheduled runner imports the real WAVE Flask app, calls the same HTTP
contracts used by the browser, and stores the JSON result under a canonical
URL-derived dataset key.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import sys
from urllib.parse import urlencode

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app_factory import create_app
from modules.crypto_dashboard import COHORT_COINS, COHORT_REP
from modules.equities_core import SECTOR_DETAIL, FUNDAMENTAL_METRICS
from modules.equities_research import INSTITUTIONS

UTC = timezone.utc

COMMON_EQUITIES = ["AAPL","MSFT","NVDA","META","AMZN","GOOGL","TSLA","JPM","HOOD","SOFI"]
RESEARCH_EQUITIES = ["AAPL","NVDA","META","JPM"]
FLOW_EQUITIES = ["SPY","QQQ","AAPL","NVDA","TSLA"]
FUNDAMENTAL_EQUITIES = ["AAPL","NVDA","META"]
FUNDAMENTAL_METRIC_KEYS = list(FUNDAMENTAL_METRICS.keys())


@dataclass(frozen=True)
class RouteSpec:
    path: str
    query: tuple[tuple[str, str], ...] = ()
    group: str = "api"
    ttl_minutes: int = 60
    logic_version: str = "flask_route_v1.0"
    optional: bool = False

    @property
    def query_dict(self):
        return dict(self.query)

    @property
    def key(self):
        if not self.query:
            return "api:" + self.path
        ordered = sorted(self.query)
        return "api:" + self.path + "?" + urlencode(ordered)


_APP = None


def _app():
    global _APP
    if _APP is None:
        _APP = create_app(start_background=False)
        _APP.config.update(TESTING=True)
    return _APP


def _spec(path, query=None, group="api", ttl=60, version="flask_route_v1.0", optional=False):
    q = tuple(sorted((str(k), str(v)) for k, v in (query or {}).items()))
    return RouteSpec(path, q, group, ttl, version, optional)


def route_specs():
    specs = [
        _spec("/api/fear-greed", group="market", ttl=15),
        _spec("/api/pcr", group="risk", ttl=60),
        _spec("/api/news", group="news", ttl=15),
        _spec("/api/macro-news", group="macro", ttl=15),
        _spec("/api/hormuz/summary", group="hormuz", ttl=15),
        _spec("/api/hormuz/events", group="hormuz", ttl=15),
        _spec("/api/ev-market", group="industries", ttl=1440),
        _spec("/api/flows/overview", group="flows", ttl=10080),
        _spec("/api/crypto-global", group="crypto", ttl=15),
        _spec("/api/crypto-scanner", group="crypto", ttl=15),
        _spec("/api/earnings", group="earnings", ttl=360),
        _spec("/api/insider-buying", group="insiders", ttl=720),
        _spec("/api/institutions-list", group="institutions", ttl=10080),
        _spec("/api/top-stories", group="content", ttl=60, optional=True),
        _spec("/api/blog/articles", {"limit":50,"offset":0}, group="content", ttl=60, optional=True),
    ]

    # Crypto cohort and on-chain states exposed by the current UI.
    for period in ("24h","7d","30d","1y"):
        specs.append(_spec("/api/cohort-performance", {"period":period}, "crypto", 15))
    for days in (7,30,90,365):
        specs.append(_spec("/api/cohort-prices", {"days":days}, "crypto", 30))
    for kpi in ("tvl","dex_volume","fees","revenue"):
        specs.append(_spec("/api/onchain-kpi", {"kpi":kpi}, "crypto_onchain", 60))
        for days in (7,30,90,365):
            specs.append(_spec("/api/onchain-history", {"kpi":kpi,"days":days}, "crypto_onchain", 60))

    # Cache each cohort's news and representative token detail.
    for cohort in sorted(COHORT_COINS):
        specs.append(_spec("/api/cohort-news", {"cohort":cohort}, "crypto_news", 30, optional=True))
    for coin_id in sorted(set(COHORT_REP.values())):
        specs.append(_spec("/api/token-detail", {"id":coin_id}, "crypto", 60, optional=True))

    # Cross-asset flows.
    for pair in ("BTCUSD","ETHUSD"):
        for period in ("1h","4h","1d"):
            specs.append(_spec("/api/flows/crypto", {"pair":pair,"period":period}, "flows", 15))
    for asset in ("gold","silver","oil","natgas","sp500","nasdaq","dow"):
        specs.append(_spec("/api/flows/futures", {"asset":asset}, "flows", 10080))
    for symbol in FLOW_EQUITIES:
        specs.append(_spec("/api/flows/options", {"symbol":symbol}, "flows", 60, optional=True))
        specs.append(_spec("/api/flows/short-interest", {"symbol":symbol}, "flows", 1440, optional=True))

    # Sector drill-down for every UI sector and every UI period.
    for sector in sorted(SECTOR_DETAIL):
        for period, ttl in (("1d",15),("1w",60),("1m",240),("3m",1440)):
            specs.append(_spec("/api/sector-detail", {"sector":sector,"period":period}, "sectors", ttl))

    # Seven 13F institutions shown by the page.
    for inst in INSTITUTIONS:
        specs.append(_spec("/api/institutions", {"cik":inst["cik"]}, "institutions", 10080, optional=True))

    # Default/current research interactions. Arbitrary symbols still fall through
    # to the dynamic gateway; these cached names make the current UI instant.
    for symbol in COMMON_EQUITIES:
        specs.append(_spec("/api/stock-info", {"symbol":symbol}, "equity_research", 360, optional=True))
        specs.append(_spec("/api/holders", {"symbol":symbol}, "equity_research", 1440, optional=True))
        specs.append(_spec("/api/analyst-estimates", {"symbol":symbol}, "equity_research", 360, optional=True))
        specs.append(_spec("/api/insider-activity", {"symbol":symbol}, "equity_research", 720, optional=True))
        specs.append(_spec("/api/correlation", {"symbol":symbol,"benchmark":"SPY"}, "equity_research", 60, optional=True))
        specs.append(_spec("/api/peers", {"symbol":symbol}, "equity_research", 1440, optional=True))

    # Ticker Mover search has no fixed default; cache the most-used research universe.
    for symbol in COMMON_EQUITIES:
        specs.append(_spec("/api/ticker-mover", {"symbol":symbol}, "ticker_mover", 30, optional=True))

    # Confluence UI defaults to AAPL and supports 7/30/90-day windows.
    for symbol in RESEARCH_EQUITIES:
        for window in (7,30,90):
            specs.append(_spec("/api/confluence", {"symbol":symbol,"window":window}, "confluence", 360, optional=True))

    # Fundamental comparison: cache the most-used research names. The calculation
    # remains the existing EDGAR/yfinance implementation.
    for symbol in FUNDAMENTAL_EQUITIES:
        for metric in FUNDAMENTAL_METRIC_KEYS:
            for period in ("annual","quarterly"):
                specs.append(_spec(
                    "/api/fundamentals",
                    {"symbol":symbol,"metric":metric,"period":period},
                    "fundamentals",
                    1440,
                    optional=True,
                ))

    # Default correlation page is JPM vs SPY.
    specs.append(_spec("/api/correlation", {"symbol":"JPM","benchmark":"SPY"}, "correlation", 60, optional=True))

    return specs


def _warm_for(spec: RouteSpec):
    """Populate only the background cache required by the requested route."""
    if spec.path == "/api/earnings":
        try:
            from modules.earnings import _fetch_earnings_universe
            _fetch_earnings_universe()
        except Exception as exc:
            print(f"WARN earnings warmup: {exc}", file=sys.stderr)
    elif spec.path == "/api/insider-buying":
        try:
            from modules.equities_research import _fetch_insider_buying
            _fetch_insider_buying()
        except Exception as exc:
            print(f"WARN insider warmup: {exc}", file=sys.stderr)

def collect_flask_route(spec: RouteSpec):
    _warm_for(spec)
    app = _app()
    with app.test_client() as client:
        response = client.get(spec.path, query_string=spec.query_dict)

    status = int(response.status_code)
    content_type = response.content_type or ""
    if status < 200 or status >= 300:
        detail = response.get_data(as_text=True)[:500]
        if spec.optional:
            return {
                "data": {
                    "_snapshot_optional_error": True,
                    "_status_code": status,
                    "_route": spec.path,
                    "_query": spec.query_dict,
                    "_detail": detail,
                },
                "source": f"WAVE Flask route {spec.path}",
                "source_timestamp": datetime.now(UTC).isoformat(),
                "logic_version": spec.logic_version,
                "_snapshot_status": "partial",
            }
        raise RuntimeError(f"{spec.path} returned HTTP {status}: {detail}")

    if response.is_json:
        payload = response.get_json()
        data = {
            "_response_type": "json",
            "_status_code": status,
            "_route": spec.path,
            "_query": spec.query_dict,
            "payload": payload,
        }
    else:
        data = {
            "_response_type": "text",
            "_content_type": content_type,
            "_status_code": status,
            "_route": spec.path,
            "_query": spec.query_dict,
            "payload": response.get_data(as_text=True),
        }

    return {
        "data": data,
        "source": f"WAVE Flask route {spec.path}",
        "source_timestamp": datetime.now(UTC).isoformat(),
        "logic_version": spec.logic_version,
        "_snapshot_status": "ok",
    }


def route_registry():
    return {
        spec.key: (
            spec.group,
            spec.ttl_minutes,
            (lambda s=spec: collect_flask_route(s)),
        )
        for spec in route_specs()
    }
