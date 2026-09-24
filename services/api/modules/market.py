"""Core market-data routes extracted from the legacy API monolith.

Keep response shapes backwards-compatible with the current Terminal while
centralizing provider-specific market reads behind one blueprint.
"""

from flask import Blueprint, jsonify, request
from services.binance import spot_quote, spot_klines, ALLOWED_SPOT_INTERVALS
from services.yahoo import quote as yahoo_quote, intraday_closes, daily_history, vix_history as yahoo_vix_history
from services.cnn import fear_greed_current

bp = Blueprint("market", __name__)


@bp.get("/api/fear-greed")
def fear_greed():
    try:
        return jsonify(fear_greed_current())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@bp.get("/api/quote")
def quote():
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({"error": "symbol required"}), 400

    try:
        data = yahoo_quote(symbol)
        return jsonify({"price": data.price, "pct": data.pct, "symbol": data.symbol})
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@bp.get("/api/intraday")
def intraday():
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({"error": "symbol required"}), 400
    try:
        return jsonify({"closes": intraday_closes(symbol)})
    except LookupError:
        return jsonify({"closes": []})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@bp.get("/api/vix-history")
def vix_history():
    try:
        return jsonify({"closes": yahoo_vix_history()})
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@bp.get("/api/history")
def history():
    symbol = request.args.get("symbol", "").strip()
    try:
        days = int(request.args.get("days", 30))
    except ValueError:
        return jsonify({"error": "days must be an integer"}), 400

    if not symbol:
        return jsonify({"error": "symbol required"}), 400
    days = max(1, min(days, 366))

    try:
        return jsonify(daily_history(symbol, days=days))
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@bp.get("/api/crypto-market/quote")
def crypto_market_quote():
    symbol = request.args.get("symbol", "BTCUSDT").strip().upper()
    if not symbol.isalnum() or len(symbol) > 20:
        return jsonify({"error": "invalid symbol"}), 400
    try:
        data = spot_quote(symbol)
        return jsonify({**data, "source": "Binance Spot"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@bp.get("/api/crypto-market/klines")
def crypto_market_klines():
    symbol = request.args.get("symbol", "BTCUSDT").strip().upper()
    interval = request.args.get("interval", "30m").strip()
    try:
        limit = int(request.args.get("limit", "48"))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if not symbol.isalnum() or len(symbol) > 20:
        return jsonify({"error": "invalid symbol"}), 400
    if interval not in ALLOWED_SPOT_INTERVALS:
        return jsonify({"error": "unsupported interval"}), 400
    limit = max(2, min(limit, 1000))

    try:
        data = spot_klines(symbol, interval, limit)
        return jsonify({**data, "source": "Binance Spot"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502
