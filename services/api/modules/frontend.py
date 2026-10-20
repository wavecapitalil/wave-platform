"""Frontend asset serving for the Terminal.

Only an explicit public allowlist is exposed. This module must never become a
generic filesystem catch-all.
"""

import os
import re
from flask import Blueprint, jsonify, send_from_directory

bp = Blueprint("frontend", __name__)

MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(MODULE_DIR, "..", "..", ".."))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "apps", "terminal", "public")

# Imported public homepage resources only; never allow a directory or suffix glob.
HOME_PUBLIC_FILES = {
    'wave-back.js',
    'wave-legal.js',
    'privacy.html',
    'terms.html',
    'accessibility.html',
    'assets/css/legal.css',
    'assets/film/wc-0918-d-fast.mp4',
    'assets/film/wc-0918-d-hq.mp4',
    'assets/film/wc-0918-last.jpg',
    'assets/film/wc-0918-poster.jpg',
    'assets/film/wc-0918-still-l.webp',
    'assets/film/wc-1010b-poster-p.jpg',
    'assets/film/wc-1010b-still-p.webp',
    'assets/film/wc-1010c-m-fast.mp4',
    'assets/film/wc-1010c-m-hq.mp4',
    'assets/img/wc-logo-0918b.webp',
    'assets/img/yogiweb-logo-dark.webp',
    'assets/img/yogiweb-logo-light.webp',
    'assets/js/a11y.js',
    'assets/js/company.js',
    'assets/js/film-engine.js',
    'assets/js/film-tiers.js',
    'assets/js/lang.js',
    'assets/js/orbit.js',
    'assets/js/site.js',
    'assets/js/theme.js',
    'vendor/ScrollTrigger.min.js',
    'vendor/gsap.min.js',
    'vendor/lenis.min.js',
}

PUBLIC_FILES = HOME_PUBLIC_FILES | {
    "terminal_app.html",
    "account.html",
    "account.js",
    "data-health.html",
    "data-health.css",
    "data-health.js",
    "university.html",
    "university.js",
    "platform.css",
    "platform.js",
    "platform-cloud.js",
    "platform-search.js",
    "ai-tutor.js",
    "ai-tutor.css",
    "research-save.js",
    "supabase-config.js",
    "terminal.html",
    "index.html",
    "blog.html",
    "products.html",
    "i18n.js",
    "wave-university-theme.css",
    "terminal.css",
    "terminal.js",
    "terminal-brief.js",
    "terminal-brief.css",
    "terminal-sources.js",
    "terminal-price-history.js",
    "terminal-research.js",
    "terminal-research-markets.js",
    "terminal-research.css",
    "terminal-price-history.css",
    "terminal-sources.css",
    "forward-consensus-ui.js",
    "equity-workbook-model.js",
    "terminal-valuation.js",
    "terminal-valuation.css",
    "terminal-market.js",
    "terminal-content.js",
    "terminal-flows.js",
    "terminal-hormuz.js",
    "terminal-metals.js",
    "terminal-gold-expectations.js",
    "terminal-gold-expectations.css",
    "data/gold-expectations.json",
    "terminal-confluence.js",
    "terminal-seasonality.js",    "terminal-equities.js",
    "fundamental-chart-model.js",
    "terminal-chart-export.js",
    "terminal-risk.js",
    "terminal-crypto.js",
    "terminal-rates.js",
    "terminal-industries.js",
    "terminal-macro.js",
    "terminal-earnings.js",

}


@bp.get("/")
def serve_home():
    return send_from_directory(PUBLIC_DIR, "index.html")


@bp.get("/products")
def serve_products():
    return send_from_directory(PUBLIC_DIR, "products.html")


@bp.get("/terminal")
def serve_terminal():
    return send_from_directory(PUBLIC_DIR, "terminal_app.html")


@bp.get("/account")
def serve_account():
    return send_from_directory(PUBLIC_DIR, "account.html")


@bp.get("/university")
def serve_university():
    return send_from_directory(PUBLIC_DIR, "university.html")


@bp.get("/data-health")
def serve_data_health():
    return send_from_directory(PUBLIC_DIR, "data-health.html")


@bp.get("/<path:filename>")
def serve_public_file(filename):
    published_brief = filename == 'briefs/latest.json' or bool(re.fullmatch(
        r'briefs/\d{4}-\d{2}-\d{2}/(?:edition\.json|[A-Za-z0-9_-]+\.(?:png|webp|jpg))', filename))
    if filename not in PUBLIC_FILES and not published_brief:
        return jsonify({"error": "not found"}), 404
    return send_from_directory(PUBLIC_DIR, filename)
