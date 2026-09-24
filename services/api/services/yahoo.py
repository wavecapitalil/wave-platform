"""Yahoo Finance provider wrapper used by WAVE API modules.

Keep yfinance-specific behavior here so routes can depend on a stable internal
contract. Provider failures raise exceptions; HTTP modules decide how to map
those failures to response codes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import yfinance as yf


@dataclass(frozen=True)
class Quote:
    symbol: str
    price: float
    pct: float
    market_state: str


def _ticker(symbol: str) -> yf.Ticker:
    value = symbol.strip()
    if not value:
        raise ValueError("symbol required")
    return yf.Ticker(value)


def quote(symbol: str) -> Quote:
    """Return best available Yahoo quote with a historical fallback."""
    ticker = _ticker(symbol)

    try:
        info: dict[str, Any] = ticker.info or {}
        state = str(info.get("marketState") or "REGULAR")

        if (
            state == "PRE"
            and info.get("preMarketPrice") is not None
            and info.get("preMarketChangePercent") is not None
        ):
            price = info["preMarketPrice"]
            pct = info["preMarketChangePercent"]
        elif (
            state in ("POST", "POSTPOST")
            and info.get("postMarketPrice") is not None
            and info.get("postMarketChangePercent") is not None
        ):
            price = info["postMarketPrice"]
            pct = info["postMarketChangePercent"]
        else:
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            pct = info.get("regularMarketChangePercent", 0)

        if price is not None:
            return Quote(
                symbol=symbol,
                price=float(price),
                pct=float(pct or 0),
                market_state=state,
            )
    except Exception:
        # yfinance .info is less reliable than price history. Preserve the
        # existing fallback behavior instead of failing the route here.
        pass

    hist = ticker.history(period="5d", interval="1d")
    if hist.empty:
        raise LookupError("no data")

    closes = hist["Close"].dropna().tolist()
    if not closes:
        raise LookupError("no data")

    last = float(closes[-1])
    prev = float(closes[-2]) if len(closes) >= 2 else last
    pct = ((last - prev) / prev * 100) if prev else 0.0
    return Quote(symbol=symbol, price=last, pct=pct, market_state="HISTORY")


def closes(symbol: str, *, period: str, interval: str, ffill: bool = False):
    """Return a cleaned pandas Series of closes."""
    hist = _ticker(symbol).history(period=period, interval=interval)
    if hist.empty or "Close" not in hist:
        raise LookupError("no data")

    series = hist["Close"]
    if ffill:
        series = series.ffill()
    series = series.dropna()
    if series.empty:
        raise LookupError("no data")
    return series


def intraday_closes(symbol: str) -> list[float]:
    series = closes(symbol, period="1d", interval="5m", ffill=True)
    return [float(value) for value in series.tolist()]


def daily_history(symbol: str, *, days: int) -> dict[str, list]:
    if days <= 7:
        period = "7d"
    elif days <= 30:
        period = "1mo"
    elif days <= 90:
        period = "3mo"
    elif days <= 180:
        period = "6mo"
    else:
        period = "1y"

    series = closes(symbol, period=period, interval="1d").tail(days)
    return {
        "closes": [float(value) for value in series.tolist()],
        "dates": [index.strftime("%b %d") for index in series.index],
    }


def vix_history() -> list[float]:
    series = closes("^VIX", period="7d", interval="1d")
    return [float(value) for value in series.tolist()]


def ticker_info(symbol: str) -> dict[str, Any]:
    """Return Yahoo's metadata mapping for a symbol."""
    info = _ticker(symbol).info or {}
    if not isinstance(info, dict):
        raise ValueError("unexpected Yahoo info response")
    return info


def history_frame(symbol: str, *, period: str, interval: str):
    """Return the provider history DataFrame without route-specific shaping."""
    frame = _ticker(symbol).history(period=period, interval=interval)
    if frame is None or frame.empty:
        raise LookupError("no data")
    return frame


def download_frame(symbols, *, period: str, interval: str = "1d", auto_adjust: bool = True):
    """Batch-download Yahoo data for internal analytics modules."""
    frame = yf.download(
        symbols,
        period=period,
        interval=interval,
        progress=False,
        auto_adjust=auto_adjust,
    )
    if frame is None or frame.empty:
        raise LookupError("no data")
    return frame
