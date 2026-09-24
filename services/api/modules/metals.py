from datetime import datetime
from flask import Blueprint, jsonify
import math
import yfinance as yf

bp = Blueprint("metals", __name__)


def _close_series(symbol, period="10y", interval="1mo"):
    df = yf.download(symbol, period=period, interval=interval, auto_adjust=True, progress=False)
    if df is None or df.empty:
        return None
    close = df["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    return close.dropna()


@bp.get("/api/commodities/gold-silver-ratio")
def gold_silver_ratio():
    gold = _close_series("GC=F")
    silver = _close_series("SI=F")
    if gold is None or silver is None:
        return jsonify({"error": "gold or silver history unavailable"}), 503

    joined = gold.to_frame("gold").join(silver.to_frame("silver"), how="inner").dropna()
    joined = joined[joined["silver"] > 0]
    if joined.empty:
        return jsonify({"error": "no overlapping history"}), 503

    ratio = joined["gold"] / joined["silver"]
    current = float(ratio.iloc[-1])
    mean = float(ratio.mean())
    std = float(ratio.std(ddof=0))
    percentile = float((ratio <= current).mean() * 100.0)
    z = (current - mean) / std if std > 0 else 0.0

    monthly = [
        {"date": idx.strftime("%Y-%m-%d"), "ratio": round(float(value), 4)}
        for idx, value in ratio.items()
    ]

    interpretation = "near historical center"
    if percentile >= 80:
        interpretation = "silver relatively cheap versus gold compared with most observations in the 10-year sample"
    elif percentile <= 20:
        interpretation = "gold relatively cheap versus silver compared with most observations in the 10-year sample"

    return jsonify({
        "current": round(current, 4),
        "mean": round(mean, 4),
        "std": round(std, 4),
        "z_score": round(z, 4),
        "percentile": round(percentile, 2),
        "n_years": 10,
        "start_date": joined.index[0].strftime("%Y-%m-%d"),
        "end_date": joined.index[-1].strftime("%Y-%m-%d"),
        "gold_price": round(float(joined["gold"].iloc[-1]), 4),
        "silver_price": round(float(joined["silver"].iloc[-1]), 4),
        "monthly": monthly,
        "interpretation": interpretation,
        "meta": {
            "source": "Yahoo Finance futures continuous contracts via yfinance",
            "gold_symbol": "GC=F",
            "silver_symbol": "SI=F",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "note": "Descriptive relative valuation context, not a trading signal."
        }
    })
