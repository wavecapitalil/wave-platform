"""CNN Fear & Greed provider wrapper."""

from __future__ import annotations

import requests

_URL = "https://production.dataviz.cnn.io/index/fearandgreed/current"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Referer": "https://edition.cnn.com/markets/fear-and-greed",
    "Origin": "https://edition.cnn.com",
}


def fear_greed_current(*, timeout: int = 10) -> dict:
    response = requests.get(_URL, headers=_HEADERS, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("unexpected CNN Fear & Greed response")
    return data
