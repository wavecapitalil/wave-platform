"""Core market-data routes extracted from the legacy API monolith.

Keep response shapes backwards-compatible with the current Terminal while
centralizing provider-specific market reads behind one blueprint.
"""

from flask import Blueprint, jsonify, request
import requests
import yfinance as yf
from services.binance import spot_quote, spot_klines, ALLOWED_SPOT_INTERVALS

bp = Blueprint("market", __name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
}


@bp.get("/api/fear-greed")
def fear_greed():
    try:
        r = requests.get(
            "https://production.dataviz.cnn.io/index/fearandgreed/current",
            headers={
                **HEADERS,
                "Referer": "https://edition.cnn.com/markets/fear-and-greed",
                "Origin": "https://edition.cnn.com",
            },
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.get("/api/quote")
def quote():
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({"error": "symbol required"}), 400

    try:
        info = yf.Ticker(symbol).info
        state = info.get("marketState", "REGULAR")
        if state == "PRE" and info.get("preMarketPrice") and info.get("preMarketChangePercent") is not None:
            price = info["preMarketPrice"]
            pct = info["preMarketChangePercent"]
        elif state in ("POST", "POSTPOST") and info.get("postMarketPrice") and info.get("postMarketChangePercent") is not None:
            price = info["postMarketPrice"]
            pct = info["postMarketChangePercent"]
        else:
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            pct = info.get("regularMarketChangePercent", 0)
        if price is None:
            raise ValueError("no price in info")
        return jsonify({"price": price, "pct": pct, "symbol": symbol})
    except Exception:
        pass

    try:
        hist = yf.Ticker(symbol).history(period="5d", interval="1d")
        if hist.empty:
            return jsonify({"error": "no data"}), 404
        closes = hist["Close"].dropna().tolist()
        last = closes[-1]
        prev = closes[-2] if len(closes) >= 2 else last
        pct = (last - prev) / prev * 100
        return jsonify({"price": last, "pct": pct, "symbol": symbol})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.get("/api/intraday")
def intraday():
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({"error": "symbol required"}), 400
    try:
        hist = yf.Ticker(symbol).history(period="1d", interval="5m")
        if hist.empty:
            return jsonify({"closes": []})
        closes = hist["Close"].ffill().dropna().tolist()
        return jsonify({"closes": closes})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.get("/api/vix-history")
def vix_history():
    try:
        hist = yf.Ticker("^VIX").history(period="7d", interval="1d")
        if hist.empty:
            return jsonify({"error": "no data"}), 404
        closes = hist["Close"].dropna().tolist()
        return jsonify({"closes": closes})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


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
        if days <= 7:
            period = "7d"
        elif days <= 30:
            period = "1mo"
        elif days <= 90:
            period = "3mo"
        elif days <= 180:
            period = "6mo"
        else:
            period = "1y"

        hist = yf.Ticker(symbol).history(period=period, interval="1d")
        if hist.empty:
            return jsonify({"error": "no data"}), 404
        closes = hist["Close"].dropna().tail(days)
        dates = [d.strftime("%b %d") for d in closes.index]
        return jsonify({"closes": closes.tolist(), "dates": dates})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500



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
