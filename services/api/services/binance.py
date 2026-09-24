"""Binance public market-data provider adapter."""

import requests

SPOT_BASES = (
    "https://api.binance.com/api/v3",
    "https://data-api.binance.vision/api/v3",
)
COINM_BASE = "https://dapi.binance.com"

ALLOWED_SPOT_INTERVALS = {
    "1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w"
}


def _spot_get(path, params, *, timeout):
    """Read public Spot market data with an official market-data fallback."""
    last_exc = None
    for base in SPOT_BASES:
        try:
            response = requests.get(base + path, params=params, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("no Binance Spot endpoint configured")


def spot_quote(symbol, *, timeout=10):
    data = _spot_get(
        "/ticker/24hr",
        {"symbol": symbol},
        timeout=timeout,
    )
    return {
        "symbol": symbol,
        "price": float(data["lastPrice"]),
        "pct": float(data["priceChangePercent"]),
    }


def spot_klines(symbol, interval, limit, *, timeout=12):
    if interval not in ALLOWED_SPOT_INTERVALS:
        raise ValueError("unsupported interval")
    raw = _spot_get(
        "/klines",
        {"symbol": symbol, "interval": interval, "limit": limit},
        timeout=timeout,
    )
    return {
        "symbol": symbol,
        "interval": interval,
        "closes": [float(row[4]) for row in raw],
        "timestamps": [int(row[0]) for row in raw],
    }


def coinm_positioning(pair, period, *, limit=30, timeout=10):
    params = {
        "pair": pair,
        "period": period,
        "contractType": "PERPETUAL",
        "limit": limit,
    }
    endpoints = {
        "global_accounts": "/futures/data/globalLongShortAccountRatio",
        "top_accounts": "/futures/data/topLongShortAccountRatio",
        "top_positions": "/futures/data/topLongShortPositionRatio",
    }

    output = {}
    errors = {}
    for key, path in endpoints.items():
        try:
            response = requests.get(
                COINM_BASE + path,
                params=params,
                timeout=timeout,
            )
            response.raise_for_status()
            output[key] = response.json()
        except Exception as exc:
            output[key] = []
            errors[key] = str(exc)

    return output, errors
