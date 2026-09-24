"""Frontend asset serving for the Terminal.

Only an explicit public allowlist is exposed. This module must never become a
generic filesystem catch-all.
"""

import os
from flask import Blueprint, jsonify, send_from_directory

bp = Blueprint("frontend", __name__)

MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(MODULE_DIR, "..", "..", ".."))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "apps", "terminal", "public")

PUBLIC_FILES = {
    "terminal_app.html",
    "terminal.html",
    "index.html",
    "blog.html",
    "products.html",
    "i18n.js",
    "wave-university-theme.css",
    "terminal.css",
    "terminal.js",
    "terminal-flows.js",
    "terminal-hormuz.js",
    "terminal-metals.js",
    "terminal-confluence.js",
    "terminal-seasonality.js",    "terminal-equities.js",
    "terminal-risk.js",
    "terminal-crypto.js",
    "terminal-rates.js",
    "terminal-industries.js",
    "terminal-macro.js",
    "terminal-earnings.js",

}


@bp.get("/")
@bp.get("/terminal")
def serve_terminal():
    return send_from_directory(PUBLIC_DIR, "terminal_app.html")


@bp.get("/<path:filename>")
def serve_public_file(filename):
    if filename not in PUBLIC_FILES:
        return jsonify({"error": "not found"}), 404
    return send_from_directory(PUBLIC_DIR, filename)
