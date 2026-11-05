"""Catalyst calendar route. Collection stays in services.catalysts."""

import re

from flask import Blueprint, jsonify, request

from services.catalysts import load_catalysts

bp = Blueprint("catalysts", __name__)
SYMBOL = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")


@bp.get("/api/catalysts")
def catalysts():
    symbol = request.args.get("symbol", "").strip().upper()
    if not SYMBOL.fullmatch(symbol):
        return jsonify({"error": "valid symbol required"}), 400
    try:
        return jsonify(load_catalysts(symbol))
    except ValueError:
        return jsonify({"error": "valid symbol required"}), 400
    except LookupError:
        return jsonify({"error": "price history unavailable", "symbol": symbol}), 502
