from datetime import datetime
from flask import Blueprint, jsonify, request
import yfinance as yf
from core.meta import build_meta

bp = Blueprint("seasonality", __name__)


def _year_series(symbol: str, year: int):
    start = f"{year}-01-01"
    end = f"{year + 1}-01-10"
    df = yf.download(symbol, start=start, end=end, auto_adjust=True, progress=False)
    if df is None or df.empty:
        return []
    close = df["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    close = close.dropna()
    if close.empty:
        return []

    base = float(close.iloc[0])
    out = []
    for dt, value in close.items():
        out.append({
            "date_key": dt.strftime("%m-%d"),
            "return_pct": (float(value) / base - 1.0) * 100.0,
        })
    return out


@bp.get("/api/seasonality")
def seasonality():
    symbol = request.args.get("symbol", "SPY").strip().upper()
    try:
        lookback = int(request.args.get("years", "10"))
    except ValueError:
        return jsonify({"error": "years must be an integer"}), 400
    lookback = max(3, min(20, lookback))

    current_year = datetime.utcnow().year

    historical = []
    used_years = []
    for year in range(current_year - lookback, current_year):
        p = _year_series(symbol, year)
        if p:
            historical.append(p)
            used_years.append(year)

    current = _year_series(symbol, current_year)
    if not historical:
        return jsonify({"error": "insufficient historical data", "symbol": symbol}), 404

    # Align by trading-session ordinal rather than calendar date.
    # This avoids weekend/holiday discontinuities when averaging different years.
    reference = historical[-1]
    max_len = max(len(p) for p in historical)
    avg = []
    for idx in range(max_len):
        vals = [p[idx]["return_pct"] for p in historical if idx < len(p)]
        if not vals:
            continue
        label = reference[idx]["date_key"] if idx < len(reference) else f"T{idx+1}"
        avg.append({
            "date_key": label,
            "return_pct": round(sum(vals) / len(vals), 4),
            "n": len(vals),
            "session_index": idx + 1,
        })

    current_points = []
    for idx, point in enumerate(current):
        label = reference[idx]["date_key"] if idx < len(reference) else point["date_key"]
        current_points.append({
            "date_key": label,
            "return_pct": round(point["return_pct"], 4),
            "session_index": idx + 1,
        })

    return jsonify({
        "symbol": symbol,
        "lookback_years": lookback,
        "years_used": used_years,
        "historical_average": avg,
        "current_year": current_year,
        "current_path": current_points,
        "meta": build_meta(
            "Yahoo Finance via yfinance",
            freshness="historical_daily",
            method="Adjusted-close cumulative return from first available trading day; prior completed years aligned by trading-session ordinal and averaged.",
        ),
    })
