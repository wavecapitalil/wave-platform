# WAVE Terminal Architecture

Date: 2026-09-24
Branch: migration/terminal-v2

## Runtime composition

The Flask runtime now uses an application factory:

- `services/api/api.py` — minimal process entrypoint
- `services/api/app_factory.py` — application composition, CORS, blueprint registry, optional worker startup
- `services/api/modules/` — HTTP domain modules
- `services/api/services/` — provider adapters shared across domains
- `services/api/core/` — cross-cutting response/provenance helpers

Background workers can be disabled with `WAVE_START_BACKGROUND=0` for tests or a future dedicated worker deployment.

## Backend route domains

Current blueprints include:

- market — quotes/history/VIX/Fear & Greed
- macro — macro news/calendar/FRED/yields
- earnings
- equities_core — sector detail/fundamentals/stock info/holders/sectors/news
- equities_research — insiders/13F/institutions/analysts/peers/correlation
- crypto_scanner
- crypto_dashboard — cohorts/on-chain/token detail
- market_risk — PCR/risk composite
- industries — EV research
- seasonality
- metals
- hormuz
- flows
- confluence
- brief
- content
- ticker_mover
- system
- frontend

The safe frontend catch-all blueprint is intentionally registered last.

## Provider layer

Shared adapters currently include:

- `services/ai.py` — provider configuration and Anthropic/OpenAI calls
- `services/sec.py` — ticker→CIK and company-facts retrieval/cache

Next provider extractions should target Yahoo/yfinance, FRED, CFTC, Binance, CoinGecko and DeFiLlama. Route modules should eventually contain orchestration and response shaping rather than provider-specific HTTP details.

## Persistent runtime data

Use:
- `WAVE_DATA_DIR` for SQLite caches/content/images
- `WAVE_BRIEF_DIR` for generated Morning Brief HTML

No deployed runtime feature should depend on a user-specific macOS/iCloud/Claude folder.

## Frontend

The deployable Terminal is still vanilla HTML/CSS/JS, but the monolith has been split:

- `terminal_app.html` — page structure
- `terminal.css` — legacy/base visual rules
- `wave-university-theme.css` — WAVE University-compatible visual layer
- `terminal.js` — shared app/navigation + legacy domains still awaiting extraction
- `terminal-flows.js`
- `terminal-hormuz.js`
- `terminal-metals.js`
- `terminal-confluence.js`
- `terminal-seasonality.js`

This is an intermediate architecture. It creates stable domain boundaries before any React/Next rewrite.

## Release gates

Every migration increment should preserve:
- Python syntax CI
- JavaScript syntax CI
- static frontend/API contract checks
- Flask route-surface contract
- security smoke
- core API smoke
- live provider/schema integration
- desktop Chromium browser QA
- iPad viewport browser QA

A domain is not considered migrated just because its code moved files; its route and browser workflows must remain green.
