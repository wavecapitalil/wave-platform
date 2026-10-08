"""Local Terminal proxy to the shared, unit-explicit valuation adapter.

The production data gateway is the single source of truth for SEC fact selection.
No provider credentials or private formula/admin data reach the browser.
"""
import re
import requests
from flask import Blueprint, jsonify, request

bp = Blueprint("valuation", __name__)
GATEWAY = "https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data"


@bp.get("/api/valuation-inputs")
def valuation_inputs():
    symbol = request.args.get("symbol", "").strip().upper().replace(".", "-")
    if not re.fullmatch(r"[A-Z][A-Z0-9-]{0,14}", symbol):
        return jsonify({"error": "valid company symbol required"}), 400
    try:
        response = requests.get(GATEWAY + "/api/valuation-inputs", params={"symbol": symbol}, timeout=25)
        payload = response.json()
        if not response.ok or not isinstance(payload, dict) or "fields" not in payload:
            return jsonify({"error": "reported valuation data unavailable", "symbol": symbol}), 502
        return jsonify(payload)
    except (requests.RequestException, ValueError):
        return jsonify({"error": "reported valuation data unavailable", "symbol": symbol}), 502
