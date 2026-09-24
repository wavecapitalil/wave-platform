from datetime import datetime, timezone
from core.meta import build_meta
from services.binance import coinm_positioning
from services.cftc import get_annual_frame

import pandas as pd
import requests
import yfinance as yf
from flask import Blueprint, jsonify, request

bp = Blueprint("flows", __name__)


CFTC_MARKETS = {
    "gold": ("disagg", ["GOLD - COMMODITY EXCHANGE INC.", "GOLD"]),
    "silver": ("disagg", ["SILVER - COMMODITY EXCHANGE INC.", "SILVER"]),
    "oil": ("disagg", ["CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE", "CRUDE OIL, LIGHT SWEET"]),
    "natgas": ("disagg", ["NATURAL GAS - NEW YORK MERCANTILE EXCHANGE", "NATURAL GAS"]),
    "sp500": ("financial", ["E-MINI S&P 500", "S&P 500"]),
    "nasdaq": ("financial", ["NASDAQ-100 STOCK INDEX", "NASDAQ-100"]),
    "dow": ("financial", ["DJIA", "DOW JONES"]),
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _float(v):
    try:
        return float(v)
    except Exception:
        return None


@bp.get("/api/flows/crypto")
def crypto_positioning():
    pair = request.args.get("pair", "BTCUSD").strip().upper()
    period = request.args.get("period", "1h").strip()

    allowed_periods = {"5m","15m","30m","1h","2h","4h","6h","12h","1d"}
    if period not in allowed_periods:
        return jsonify({"error": "unsupported period"}), 400

    raw_series, errors = coinm_positioning(pair, period, limit=30)
    out = {}
    for key, raw in raw_series.items():
        rows = []
        for x in raw:
            long_v = _float(x.get("longAccount"))
            short_v = _float(x.get("shortAccount"))
            rows.append({
                "timestamp": x.get("timestamp"),
                "long_pct": round(long_v * 100, 3) if long_v is not None else None,
                "short_pct": round(short_v * 100, 3) if short_v is not None else None,
                "long_short_ratio": _float(x.get("longShortRatio")),
            })
        out[key] = rows

    return jsonify({
        "asset_class": "crypto",
        "venue": "Binance COIN-M Futures",
        "pair": pair,
        "period": period,
        "series": out,
        "errors": errors,
        "meta": build_meta(
            "Binance public futures market-data API",
            freshness="live",
            note="These are positioning ratios, not blockchain exchange inflow/outflow data.",
        )
    })


def _option_snapshot(symbol):
    t = yf.Ticker(symbol)
    expiries = list(t.options or [])
    if not expiries:
        return {"symbol": symbol, "error": "no listed options found"}

    expiry = expiries[0]
    chain = t.option_chain(expiry)

    def oi(df):
        if df is None or df.empty or "openInterest" not in df:
            return 0
        return int(pd.to_numeric(df["openInterest"], errors="coerce").fillna(0).sum())

    def vol(df):
        if df is None or df.empty or "volume" not in df:
            return 0
        return int(pd.to_numeric(df["volume"], errors="coerce").fillna(0).sum())

    call_oi, put_oi = oi(chain.calls), oi(chain.puts)
    call_vol, put_vol = vol(chain.calls), vol(chain.puts)

    return {
        "symbol": symbol,
        "expiry": expiry,
        "call_open_interest": call_oi,
        "put_open_interest": put_oi,
        "put_call_oi_ratio": round(put_oi / call_oi, 4) if call_oi else None,
        "call_volume": call_vol,
        "put_volume": put_vol,
        "put_call_volume_ratio": round(put_vol / call_vol, 4) if call_vol else None,
    }


@bp.get("/api/flows/options")
def options_positioning():
    symbol = request.args.get("symbol", "SPY").strip().upper()
    try:
        data = _option_snapshot(symbol)
        data["asset_class"] = "options"
        data["meta"] = build_meta(
            "Yahoo Finance via yfinance",
            freshness="snapshot",
            note="Nearest listed expiry snapshot. Open interest is positioning, not directional trade flow.",
        )
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": str(exc), "symbol": symbol}), 502


@bp.get("/api/flows/short-interest")
def short_interest():
    symbol = request.args.get("symbol", "SPY").strip().upper()
    try:
        info = yf.Ticker(symbol).info
        short_float = info.get("shortPercentOfFloat")
        short_outstanding = info.get("sharesPercentSharesOut")
        shares_short = info.get("sharesShort")
        shares_short_prior = info.get("sharesShortPriorMonth")
        return jsonify({
            "asset_class": "equity_or_etf",
            "symbol": symbol,
            "short_float_pct": round(short_float * 100, 3) if isinstance(short_float, (int,float)) else None,
            "short_outstanding_pct": round(short_outstanding * 100, 3) if isinstance(short_outstanding, (int,float)) else None,
            "shares_short": shares_short,
            "shares_short_prior_month": shares_short_prior,
            "shares_short_change_pct": (
                round((shares_short / shares_short_prior - 1) * 100, 3)
                if isinstance(shares_short, (int,float)) and isinstance(shares_short_prior, (int,float)) and shares_short_prior
                else None
            ),
            "meta": build_meta(
                "Yahoo Finance via yfinance",
                freshness="reported_with_lag",
                stale=False,
                note="Short-interest data is reported with publication lag and should not be treated as live positioning.",
            )
        })
    except Exception as exc:
        return jsonify({"error": str(exc), "symbol": symbol}), 502


def _pick_col(cols, *needles):
    lower = {str(c).lower(): c for c in cols}
    for needle in needles:
        for lc, orig in lower.items():
            if needle.lower() in lc:
                return orig
    return None


@bp.get("/api/flows/futures")
def futures_positioning():
    asset = request.args.get("asset", "gold").strip().lower()
    if asset not in CFTC_MARKETS:
        return jsonify({"error": "unsupported asset", "supported": sorted(CFTC_MARKETS)}), 400

    report_type, aliases = CFTC_MARKETS[asset]
    year = datetime.now(timezone.utc).year
    try:
        df = get_annual_frame(report_type, year)
        market_col = _pick_col(df.columns, "market_and_exchange_names", "market and exchange names")
        date_col = _pick_col(df.columns, "report_date_as", "report date")
        if market_col is None or date_col is None:
            raise ValueError("CFTC columns not recognized")

        mask = pd.Series(False, index=df.index)
        names = df[market_col].astype(str).str.upper()
        for alias in aliases:
            mask = mask | names.str.contains(alias.upper(), regex=False, na=False)
        rows = df[mask].copy()
        if rows.empty:
            return jsonify({"error": "market not found in current CFTC report", "asset": asset}), 404

        rows[date_col] = pd.to_datetime(rows[date_col], errors="coerce")
        rows = rows.sort_values(date_col)
        row = rows.iloc[-1]

        if report_type == "financial":
            long_col = _pick_col(df.columns, "asset_mgr_positions_long", "asset manager long")
            short_col = _pick_col(df.columns, "asset_mgr_positions_short", "asset manager short")
            label = "asset_manager"
        else:
            long_col = _pick_col(df.columns, "money_mgr_positions_long", "money manager long")
            short_col = _pick_col(df.columns, "money_mgr_positions_short", "money manager short")
            label = "money_manager"

        oi_col = _pick_col(df.columns, "open_interest_all", "open interest")
        long_v = _float(row.get(long_col)) if long_col else None
        short_v = _float(row.get(short_col)) if short_col else None
        oi_v = _float(row.get(oi_col)) if oi_col else None
        net_v = long_v - short_v if long_v is not None and short_v is not None else None

        return jsonify({
            "asset_class": "futures",
            "asset": asset,
            "market": row.get(market_col),
            "report_date": str(row.get(date_col).date()) if pd.notna(row.get(date_col)) else None,
            "trader_group": label,
            "long_contracts": long_v,
            "short_contracts": short_v,
            "net_contracts": net_v,
            "open_interest": oi_v,
            "short_share_of_group_pct": (
                round(short_v / (long_v + short_v) * 100, 3)
                if long_v is not None and short_v is not None and (long_v + short_v)
                else None
            ),
            "meta": build_meta(
                "CFTC Commitments of Traders annual compressed report",
                source_timestamp=str(row.get(date_col).date()) if pd.notna(row.get(date_col)) else None,
                freshness="weekly_report",
                note="Weekly COT positioning; report date differs from release date and is not live flow.",
            )
        })
    except Exception as exc:
        return jsonify({"error": str(exc), "asset": asset}), 502


@bp.get("/api/flows/overview")
def flows_overview():
    return jsonify({
        "domains": [
            {
                "name": "Crypto venue positioning",
                "endpoint": "/api/flows/crypto",
                "measures": ["global long/short accounts", "top-trader accounts", "top-trader positions"],
                "live": True,
            },
            {
                "name": "Futures positioning",
                "endpoint": "/api/flows/futures",
                "measures": ["CFTC long contracts", "short contracts", "net contracts", "short share"],
                "live": False,
            },
            {
                "name": "Options positioning",
                "endpoint": "/api/flows/options",
                "measures": ["call OI", "put OI", "put/call OI", "volume ratio"],
                "live": False,
            },
            {
                "name": "Short interest",
                "endpoint": "/api/flows/short-interest",
                "measures": ["short % float", "short % shares outstanding", "month-over-month change"],
                "live": False,
            },
        ],
        "meta": build_meta(
            "WAVE configuration",
            freshness="static",
            principle="Do not combine heterogeneous positioning and flow measures into a single synthetic money-flow score.",
        )
    })
