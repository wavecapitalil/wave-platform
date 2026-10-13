"""Local proxy to the shared server-side price and dated-event adapter."""
import re
import requests
from flask import Blueprint, jsonify, request

bp = Blueprint("price_history", __name__)
GATEWAY = "https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data"
RANGES = {"1mo", "3mo", "6mo", "1y", "5y"}


@bp.get("/api/price-history")
def price_history():
    symbol = request.args.get("symbol", "").strip().upper()
    selected_range = request.args.get("range", "1y")
    if not re.fullmatch(r"[A-Z0-9^][A-Z0-9.^=-]{0,19}", symbol):
        return jsonify({"error": "valid symbol required"}), 400
    if selected_range not in RANGES:
        return jsonify({"error": "unsupported range"}), 400
    try:
        response = requests.get(GATEWAY + "/api/price-history", params={"symbol": symbol, "range": selected_range}, timeout=28)
        payload = response.json()
        if not response.ok or not isinstance(payload, dict) or not isinstance(payload.get("points"), list):
            return jsonify({"error": "price history unavailable", "symbol": symbol}), 502
        return jsonify(payload)
    except (requests.RequestException, ValueError):
        return jsonify({"error": "price history unavailable", "symbol": symbol}), 502


@bp.get("/api/research-insider-filings")
@bp.get("/api/research-historical-pe")
@bp.get("/api/research-seasonality")
@bp.get("/api/research-statements")
@bp.get("/api/research-tape")
def research_adapter():
    symbol = request.args.get("symbol", "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9^][A-Z0-9.^=-]{0,19}", symbol):
        return jsonify({"error": "valid symbol required"}), 400
    params = {"symbol": symbol}
    if request.path.endswith("research-statements"):
        params.update(metric=request.args.get("metric", "assets"), period=request.args.get("period", "annual"))
    try:
        response = requests.get(GATEWAY + request.path, params=params, timeout=28)
        return jsonify(response.json()), response.status_code
    except (requests.RequestException, ValueError):
        return jsonify({"error": "research data unavailable", "symbol": symbol}), 502
