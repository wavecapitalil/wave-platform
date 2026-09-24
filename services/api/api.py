"""
Wave Capital — Data API
Runs on http://localhost:5001
Serves all market data to terminal_app.html (no CORS/proxy issues)
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import re
import requests
import yfinance as yf
import xml.etree.ElementTree as ET
import email.utils
from datetime import datetime, timezone
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)

# CORS is limited to configured origins. In production prefer same-origin requests.
_ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    'WAVE_ALLOWED_ORIGINS',
    'http://localhost:5001,http://127.0.0.1:5001'
).split(',') if o.strip()]
CORS(app, resources={r"/api/*": {"origins": _ALLOWED_ORIGINS}})

# Stabilization modules validated against current product intent.
from modules.seasonality import bp as seasonality_bp
from modules.metals import bp as metals_bp
from modules.hormuz import bp as hormuz_bp
from modules.flows import bp as flows_bp
from modules.confluence import bp as confluence_bp
from modules.market import bp as market_bp
from modules.frontend import bp as frontend_bp
from modules.system import bp as system_bp
from modules.macro import bp as macro_bp
from modules.earnings import bp as earnings_bp
from modules.equities_core import bp as equities_core_bp
from modules.crypto_scanner import bp as crypto_scanner_bp
from modules.equities_research import bp as equities_research_bp
from modules.market_risk import bp as market_risk_bp
from modules.industries import bp as industries_bp
from modules.crypto_dashboard import bp as crypto_dashboard_bp
from modules.brief import bp as brief_bp, start_brief_scheduler
from modules.content import bp as content_bp, start_content_scheduler
from modules.ticker_mover import bp as ticker_mover_bp

app.register_blueprint(seasonality_bp)
app.register_blueprint(metals_bp)
app.register_blueprint(hormuz_bp)
app.register_blueprint(flows_bp)
app.register_blueprint(confluence_bp)
app.register_blueprint(market_bp)
app.register_blueprint(frontend_bp)
app.register_blueprint(system_bp)
app.register_blueprint(macro_bp)
app.register_blueprint(earnings_bp)
app.register_blueprint(equities_core_bp)
app.register_blueprint(crypto_scanner_bp)
app.register_blueprint(equities_research_bp)
app.register_blueprint(market_risk_bp)
app.register_blueprint(industries_bp)
app.register_blueprint(crypto_dashboard_bp)
app.register_blueprint(brief_bp)
start_brief_scheduler()
app.register_blueprint(content_bp)
start_content_scheduler()
app.register_blueprint(ticker_mover_bp)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
}

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
