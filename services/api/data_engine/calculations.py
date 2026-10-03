"""Pure WAVE data-engine calculations.

No network access belongs in this module. Every function receives normalized
inputs and returns deterministic outputs so the same logic can be unit-tested
and reused by Flask, GitHub Actions and future workers.
"""
from __future__ import annotations

from math import isfinite
from statistics import fmean, pstdev


RISK_LOGIC_VERSION = "risk_meter_v1.0"
GSR_LOGIC_VERSION = "gold_silver_v1.0"
SEASONALITY_LOGIC_VERSION = "seasonality_v1.0"


def _clip(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def score_risk_signals(data: dict) -> dict:
    """Port of the original Terminal seven-factor Risk Meter.

    The weights and normalization bands intentionally match terminal-risk.js.
    Output preserves every component so the score stays auditable.
    """
    signals = {}

    vix = float(data["vix"]["current"])
    if vix <= 12:
        vs = 100
    elif vix <= 15:
        vs = round(100 - (vix - 12) / 3 * 20)
    elif vix <= 20:
        vs = round(80 - (vix - 15) / 5 * 30)
    elif vix <= 25:
        vs = round(50 - (vix - 20) / 5 * 25)
    elif vix <= 30:
        vs = round(25 - (vix - 25) / 5 * 20)
    else:
        vs = max(0, round(5 - (vix - 30) * 1.5))
    signals["vix_level"] = {"score": vs, "weight": 0.15}

    vxv = float(data.get("vxv") or vix)
    ratio = vix / vxv if vxv > 0 else 1.0
    if ratio < 0.85:
        ts = 100
    elif ratio < 0.92:
        ts = round(100 - (ratio - 0.85) / 0.07 * 25)
    elif ratio < 0.97:
        ts = round(75 - (ratio - 0.92) / 0.05 * 20)
    elif ratio < 1.02:
        ts = round(55 - (ratio - 0.97) / 0.05 * 25)
    elif ratio < 1.10:
        ts = round(30 - (ratio - 1.02) / 0.08 * 25)
    else:
        ts = max(0, round(5 - (ratio - 1.10) * 20))
    signals["vix_term_structure"] = {
        "score": ts, "weight": 0.15, "ratio": round(ratio, 4)
    }

    hyg = float(data["credit"]["hyg_pct"])
    lqd = float(data["credit"]["lqd_pct"])
    credit_spread = hyg - lqd
    cs = round(_clip(50 + credit_spread / 0.5 * 50))
    signals["credit"] = {
        "score": cs, "weight": 0.20, "spread_pct": round(credit_spread, 4)
    }

    spy = float(data["breadth"]["spy_pct"])
    rsp = float(data["breadth"]["rsp_pct"])
    breadth_spread = rsp - spy
    bs = round(_clip(50 + breadth_spread / 0.5 * 50))
    signals["breadth"] = {
        "score": bs, "weight": 0.15, "spread_pct": round(breadth_spread, 4)
    }

    rotation = data["sector_rotation"]
    rotation_spread = float(rotation["spread"])
    ss = round(_clip(50 + rotation_spread / 2.0 * 50))
    signals["sector_rotation"] = {
        "score": ss, "weight": 0.15, "spread_pct": round(rotation_spread, 4)
    }

    pcr = float(data.get("pcr") or 1.0)
    ps = round(_clip((1.3 - pcr) / (1.3 - 0.5) * 100))
    signals["put_call"] = {"score": ps, "weight": 0.10, "ratio": round(pcr, 4)}

    pa = float(data["spy_200dma"]["pct_above"])
    if pa > 8:
        ds = 100
    elif pa > 5:
        ds = round(85 + (pa - 5) / 3 * 15)
    elif pa > 2:
        ds = round(65 + (pa - 2) / 3 * 20)
    elif pa > 0:
        ds = round(55 + pa / 2 * 10)
    elif pa > -2:
        ds = round(35 + (pa + 2) / 2 * 20)
    elif pa > -5:
        ds = round(10 + (pa + 5) / 3 * 25)
    else:
        ds = max(0, round(10 + (pa + 5) * 3))
    signals["spy_200dma"] = {"score": ds, "weight": 0.10, "pct_above": round(pa, 4)}

    total = sum(x["score"] * x["weight"] for x in signals.values())
    weight = sum(x["weight"] for x in signals.values())
    composite = round(_clip(total / weight))

    return {
        "composite": composite,
        "signals": signals,
        "logic_version": RISK_LOGIC_VERSION,
    }


def gold_silver_stats(ratios: list[float]) -> dict:
    clean = [float(x) for x in ratios if x is not None and isfinite(float(x))]
    if not clean:
        raise ValueError("no valid gold/silver observations")
    current = clean[-1]
    mean = fmean(clean)
    std = pstdev(clean)
    percentile = sum(1 for x in clean if x <= current) / len(clean) * 100.0
    z = (current - mean) / std if std > 0 else 0.0
    return {
        "current": round(current, 4),
        "mean": round(mean, 4),
        "std": round(std, 4),
        "z_score": round(z, 4),
        "percentile": round(percentile, 2),
        "logic_version": GSR_LOGIC_VERSION,
    }


def cumulative_return_path(values: list[tuple[str, float]]) -> list[dict]:
    if not values:
        return []
    base = float(values[0][1])
    if base == 0:
        raise ValueError("zero base value")
    return [
        {"date_key": date_key, "return_pct": round((float(value) / base - 1.0) * 100.0, 4)}
        for date_key, value in values
    ]


def average_seasonal_paths(paths: list[list[dict]], min_samples: int = 3) -> list[dict]:
    maps = [{p["date_key"]: float(p["return_pct"]) for p in path} for path in paths]
    keys = sorted(set().union(*(set(m) for m in maps))) if maps else []
    out = []
    for key in keys:
        vals = [m[key] for m in maps if key in m]
        if len(vals) < min_samples:
            continue
        out.append({"date_key": key, "return_pct": round(fmean(vals), 4), "n": len(vals)})
    return out
