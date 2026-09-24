"""CoinGecko public API provider adapter."""

import time
import requests

BASE = "https://api.coingecko.com/api/v3"
HEADERS = {"User-Agent": "WaveCapital/1.0"}


def _get(path, *, params=None, timeout=15, retry_429=True):
    response = requests.get(BASE + path, params=params, headers=HEADERS, timeout=timeout)
    if response.status_code == 429 and retry_429:
        time.sleep(2)
        response = requests.get(BASE + path, params=params, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def global_market():
    return _get("/global", timeout=12).get("data", {})


def markets(ids, *, vs_currency="usd", price_change_percentage=None, per_page=250, order="market_cap_desc", timeout=20):
    params = {
        "vs_currency": vs_currency,
        "ids": ",".join(ids) if isinstance(ids, (list, tuple, set)) else ids,
        "per_page": per_page,
        "order": order,
        "sparkline": "false",
    }
    if price_change_percentage:
        params["price_change_percentage"] = price_change_percentage
    return _get("/coins/markets", params=params, timeout=timeout)


def market_chart(coin_id, *, days, vs_currency="usd", interval="daily", timeout=12):
    return _get(
        f"/coins/{coin_id}/market_chart",
        params={"vs_currency": vs_currency, "days": days, "interval": interval},
        timeout=timeout,
    )


def coin_detail(coin_id, *, timeout=12):
    return _get(
        f"/coins/{coin_id}",
        params={
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "true",
            "developer_data": "true",
            "sparkline": "false",
        },
        timeout=timeout,
    )
