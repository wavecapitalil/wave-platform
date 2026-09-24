"""WAVE Flask application factory.

All HTTP domains are registered here. Background workers are explicit so tests
and future multi-worker deployments can disable them safely.
"""

import os

from flask import Flask
from flask_cors import CORS

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


BLUEPRINTS = (
    seasonality_bp,
    metals_bp,
    hormuz_bp,
    flows_bp,
    confluence_bp,
    market_bp,
    system_bp,
    macro_bp,
    earnings_bp,
    equities_core_bp,
    crypto_scanner_bp,
    equities_research_bp,
    market_risk_bp,
    industries_bp,
    crypto_dashboard_bp,
    brief_bp,
    content_bp,
    ticker_mover_bp,
    # Keep the catch-all frontend blueprint last.
    frontend_bp,
)


def create_app(*, start_background=True):
    app = Flask(__name__)

    allowed_origins = [
        origin.strip()
        for origin in os.getenv(
            "WAVE_ALLOWED_ORIGINS",
            "http://localhost:5001,http://127.0.0.1:5001",
        ).split(",")
        if origin.strip()
    ]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)

    if start_background:
        start_brief_scheduler()
        start_content_scheduler()

    return app
