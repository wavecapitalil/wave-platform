from datetime import datetime
from flask import Blueprint, jsonify, request
import yfinance as yf
from core.meta import build_meta

bp = Blueprint("seasonality", __name__)


def _year_path(symbol: str, year: int):
    start = f"{year}-01-01"
    end = f"{year + 1}-01-10"
    df = yf.download(symbol, start=start, end=end, auto_adjust=True, progress=False)
    if df is None or df.empty:
        return {}
    close = df["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    close = close.dropna()
    if close.empty:
        return {}
    base = float(close.iloc[0])
    path = {}
    for dt, value in close.items():
        key = dt.strftime("%m-%d")
        path[key] = (float(value) / base - 1.0) * 100.0
    return path


@bp.get("/api/seasonality")
def seasonality():
    symbol = request.args.get("symbol", "SPY").strip().upper()
    try:
        lookback = int(request.args.get("years", "10"))
    except ValueError:
        return jsonify({"error": "years must be an integer"}), 400
    lookback = max(3, min(20, lookback))

    now = datetime.utcnow()
    current_year = now.year

    historical = []
    used_years = []
    for year in range(current_year - lookback, current_year):
        p = _year_path(symbol, year)
        if p:
            historical.append(p)
            used_years.append(year)

    current = _year_path(symbol, current_year)
    if not historical:
        return jsonify({"error": "insufficient historical data", "symbol": symbol}), 404

    keys = sorted(set().union(*[set(p.keys()) for p in historical]))
    avg = []
    for key in keys:
        vals = [p[key] for p in historical if key in p]
        if vals:
            avg.append({"date_key": key, "return_pct": round(sum(vals) / len(vals), 4), "n": len(vals)})

    current_points = [
        {"date_key": key, "return_pct": round(value, 4)}
        for key, value in sorted(current.items())
    ]

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
            method="Adjusted-close cumulative return from first available trading day of each year; prior-year paths averaged by calendar month-day.",
        ),
    })
