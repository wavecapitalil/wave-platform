from datetime import datetime
from flask import Blueprint, jsonify, request
import yfinance as yf
import pandas as pd
from core.meta import build_meta

bp = Blueprint("seasonality", __name__)


def _year_series(symbol: str, year: int):
    """Return a calendar-aligned cumulative-return path for one year.

    Daily calendar alignment is intentional: the product compares month-by-month
    seasonal paths. Weekends and market holidays carry the last available close,
    while days before the first trading session are 0%. Feb 29 is omitted so
    every completed year has the same 365 month-day keys.
    """
    start = f"{year}-01-01"
    end = f"{year + 1}-01-01"
    df = yf.download(symbol, start=start, end=end, auto_adjust=True, progress=False)
    if df is None or df.empty:
        return []
    close = df["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    close = close.dropna()
    close = close[close.index.year == year]
    if close.empty:
        return []

    cumulative = (close / float(close.iloc[0]) - 1.0) * 100.0
    last_day = close.index[-1].normalize()

    calendar = cumulative.reindex(
        pd.date_range(start=f"{year}-01-01", end=last_day, freq="D")
    )
    calendar = calendar.ffill().fillna(0.0)

    out = []
    for dt, value in calendar.items():
        if dt.strftime("%m-%d") == "02-29":
            continue
        out.append({
            "date_key": dt.strftime("%m-%d"),
            "return_pct": float(value),
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

    # Align completed years by month-day after calendar forward-fill.
    historical_maps = [
        {point["date_key"]: point["return_pct"] for point in path}
        for path in historical
    ]
    keys = sorted(set().union(*[set(m.keys()) for m in historical_maps]))
    avg = []
    for key in keys:
        vals = [m[key] for m in historical_maps if key in m]
        if len(vals) < max(3, len(historical_maps) - 1):
            continue
        avg.append({
            "date_key": key,
            "return_pct": round(sum(vals) / len(vals), 4),
            "n": len(vals),
        })

    current_points = [
        {
            "date_key": point["date_key"],
            "return_pct": round(point["return_pct"], 4),
        }
        for point in current
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
            method="Adjusted-close cumulative return from first available trading day; each year is aligned by calendar month-day with weekends/holidays forward-filled, then prior completed years are averaged.",
        ),
    })
