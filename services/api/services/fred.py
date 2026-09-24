"""FRED CSV provider adapter with in-process cache and curl fallback."""

import subprocess
import time
import requests

_CACHE = {}
_TTL_SECONDS = 3600


def get_series_csv(series, *, timeout=15):
    cached = _CACHE.get(series)
    now = time.time()
    if cached and now - cached["ts"] < _TTL_SECONDS:
        return cached["text"], True

    url = "https://fred.stlouisfed.org/graph/fredgraph.csv"
    try:
        response = requests.get(url, params={"id": series}, timeout=timeout)
        response.raise_for_status()
        text = response.text
        if not text.strip():
            raise RuntimeError("empty FRED response")
        _CACHE[series] = {"text": text, "ts": now}
        return text, False
    except Exception as requests_error:
        try:
            process = subprocess.run(
                [
                    "curl", "-s", "-f", "--max-time", str(timeout),
                    f"{url}?id={series}",
                ],
                capture_output=True,
                text=True,
                timeout=timeout + 5,
            )
            if process.returncode != 0 or not process.stdout.strip():
                raise RuntimeError(process.stderr.strip() or "curl FRED request failed")
            _CACHE[series] = {"text": process.stdout, "ts": now}
            return process.stdout, False
        except Exception:
            if cached:
                return cached["text"], True
            raise requests_error
