"""DeFiLlama public API provider adapter."""

import requests

BASE = "https://api.llama.fi"
STABLE_BASE = "https://stablecoins.llama.fi"


def _get(url, *, params=None, timeout=15):
    response = requests.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    return response.json()


def chains():
    return _get(BASE + "/v2/chains", timeout=10)


def stablecoins():
    return _get(STABLE_BASE + "/stablecoins", params={"includePrices": "true"}, timeout=12)


def protocol(slug):
    return _get(BASE + f"/protocol/{slug}", timeout=12)


def summary(endpoint, slug):
    return _get(BASE + f"/summary/{endpoint}/{slug}", timeout=12)


def protocols():
    return _get(BASE + "/protocols", timeout=15)


def overview(kind):
    return _get(
        BASE + f"/overview/{kind}",
        params={
            "excludeTotalDataChart": "true",
            "excludeTotalDataChartBreakdown": "true",
        },
        timeout=15,
    )
