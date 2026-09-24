"""SEC EDGAR provider helpers shared across equity research routes."""

import time
import requests

SEC_HEADERS = {
    "User-Agent": "WaveCapital research@wavecapital.com",
    "Accept-Encoding": "gzip, deflate",
}

_CIK_CACHE = {}
_FACTS_CACHE = {}
_FACTS_TTL_SECONDS = 86400


def get_cik(ticker):
    ticker = (ticker or "").strip().upper()
    if not ticker:
        return None

    if ticker in _CIK_CACHE:
        return _CIK_CACHE[ticker]

    response = requests.get(
        "https://www.sec.gov/files/company_tickers.json",
        headers=SEC_HEADERS,
        timeout=10,
    )
    response.raise_for_status()
    mapping = response.json()
    for value in mapping.values():
        symbol = str(value.get("ticker", "")).upper()
        if symbol:
            _CIK_CACHE[symbol] = str(value["cik_str"]).zfill(10)

    return _CIK_CACHE.get(ticker)


def get_company_facts(cik):
    cik = str(cik).zfill(10)
    now = time.time()

    cached = _FACTS_CACHE.get(cik)
    if cached:
        timestamp, facts = cached
        if now - timestamp < _FACTS_TTL_SECONDS:
            return facts

    response = requests.get(
        f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
        headers=SEC_HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    facts = response.json().get("facts", {}).get("us-gaap", {})
    _FACTS_CACHE[cik] = (now, facts)
    return facts
