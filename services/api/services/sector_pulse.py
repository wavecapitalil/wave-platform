"""SPDR sector-ETF regular-session moves.

The homepage pulse shows the current cash-session percent change versus the
prior completed session. Outside the session, Yahoo's regular-market price
remains the last session close, so the same read keeps that session.

Source: Yahoo Finance chart API, no key.
https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=10d&interval=1d&includePrePost=false
The chart host is unofficial and can rate-limit. It is the same public source
the rest of the terminal already uses, and it exposes the regular-session
price separately from pre/post prints.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import math

NY = ZoneInfo("America/New_York")

SECTORS = [
    ("XLK", "Technology"),
    ("XLC", "Comm. Services"),
    ("XLY", "Consumer Disc."),
    ("XLF", "Financials"),
    ("XLI", "Industrials"),
    ("XLV", "Healthcare"),
    ("XLP", "Consumer Staples"),
    ("XLB", "Materials"),
    ("XLE", "Energy"),
    ("XLRE", "Real Estate"),
    ("XLU", "Utilities"),
]

CHART_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    "?range=10d&interval=1d&includePrePost=false"
)
SOURCE = "Yahoo Finance chart API regular session"
LOGIC_VERSION = "sector_strength_v1.1"
HEADERS = {
    "User-Agent": "Mozilla/5.0 WAVE",
    "Accept": "application/json",
}


def _num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _ny_date(timestamp):
    return datetime.fromtimestamp(int(timestamp), NY).date()


def session_move(meta, timestamps, closes):
    """Regular-session price versus the prior completed session close.

    Daily bars on the live session date are ignored as the baseline so a
    partial bar cannot be compared with itself. Premarket and postmarket
    prices are not read.
    """
    if not isinstance(meta, dict):
        raise ValueError("chart meta missing")
    price = _num(meta.get("regularMarketPrice"))
    live_ts = meta.get("regularMarketTime")
    if price is None or price <= 0 or live_ts is None:
        raise ValueError("regular session price unavailable")
    live_day = _ny_date(live_ts)

    by_day = {}
    for ts, close in zip(timestamps or [], closes or []):
        value = _num(close)
        if ts is None or value is None or value <= 0:
            continue
        by_day[_ny_date(ts)] = value

    prior_days = sorted(day for day in by_day if day < live_day)
    if prior_days:
        prev_day = prior_days[-1]
        prev_close = by_day[prev_day]
    else:
        prev_close = _num(meta.get("previousClose"))
        prev_day = None
        if prev_close is None or prev_close <= 0:
            raise ValueError("prior session close unavailable")

    return {
        "price": round(price, 4),
        "pct": round((price - prev_close) / prev_close * 100, 4),
        "session": live_day.isoformat(),
        "previous_close": round(prev_close, 4),
        "previous_session": prev_day.isoformat() if prev_day else None,
    }


def _chart(symbol):
    import requests
    url = CHART_URL.format(symbol=symbol)
    last_error = None
    for _ in range(2):
        try:
            response = requests.get(url, headers=HEADERS, timeout=20)
            response.raise_for_status()
            result = response.json()["chart"]["result"][0]
            if not result:
                raise LookupError(symbol)
            return result
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"{symbol}: {last_error}")


def _one(item):
    symbol, name = item
    result = _chart(symbol)
    quote = (result.get("indicators") or {}).get("quote") or [{}]
    closes = quote[0].get("close") if quote else []
    move = session_move(result.get("meta") or {}, result.get("timestamp") or [], closes)
    return {
        "symbol": symbol,
        "name": name,
        "price": move["price"],
        "pct": move["pct"],
        "session": move["session"],
    }


def collect_sector_rows():
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(_one, SECTORS))
    if len(rows) != len(SECTORS):
        raise RuntimeError("incomplete sector set")
    session = max(row["session"] for row in rows)
    sectors = [
        {"symbol": row["symbol"], "name": row["name"], "price": row["price"], "pct": row["pct"]}
        for row in rows
    ]
    sectors.sort(key=lambda row: row["pct"], reverse=True)
    return {"sectors": sectors, "session": session}


def collect_sectors() -> dict:
    data = collect_sector_rows()
    return {
        "data": data,
        "source": SOURCE,
        "source_timestamp": datetime.now(timezone.utc).isoformat(),
        "logic_version": LOGIC_VERSION,
    }
