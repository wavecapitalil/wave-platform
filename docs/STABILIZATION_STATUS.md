# Stabilization Status

Branch: `migration/terminal-v2`

## Completed

### Baseline and security
- [x] Repository initialized and migration branch created
- [x] Immutable Terminal v1 snapshot stored under `legacy/terminal-v1`
- [x] Deployable Terminal baseline under `apps/terminal/public`
- [x] Secured backend under `services/api`
- [x] Arbitrary static catch-all removed
- [x] Explicit public-asset allowlist
- [x] Configured CORS
- [x] Production frontend no longer hard-codes localhost
- [x] Security smoke tests

### Rebuilt research modules
- [x] Hormuz rebuilt as macro energy/supply-risk monitor
- [x] Gold/Silver Ratio rebuilt around 10Y historical context
- [x] Seasonality rebuilt as current-year path vs prior-10Y average
- [x] Legacy ad Comm Flows replaced by Cross-Asset Flows
- [x] Confluence rebuilt as transparent institutional + insider + analyst overlap
- [x] Research intent documented in `RESEARCH_MODULE_SPECS.md`

### Data and portability
- [x] Provenance/freshness contract introduced for rebuilt modules
- [x] Morning Brief moved to portable `WAVE_BRIEF_DIR`
- [x] Embedded Morning Brief charts use same-origin WAVE API
- [x] Runtime app data moved toward portable `WAVE_DATA_DIR`
- [x] AI credentials read from process environment, not a local secret file
- [x] Background worker startup can be disabled with `WAVE_START_BACKGROUND=0`

### QA
- [x] Python syntax CI
- [x] JavaScript syntax CI
- [x] Static frontend/API contract checks
- [x] Full Flask route-surface contract
- [x] Core API smoke suite
- [x] Live external-provider/schema integration
- [x] Desktop Chromium browser QA
- [x] iPad viewport browser QA
- [x] Responsive overflow checks
- [x] Rebuilt product control workflows exercised in browser QA

### Backend architecture
- [x] `api.py` reduced to minimal entrypoint
- [x] Flask application factory added
- [x] Legacy route monolith split into domain blueprints
- [x] Safe frontend blueprint registered last
- [x] Morning Brief scheduler lifecycle made explicit/idempotent
- [x] Content scheduler lifecycle made explicit/idempotent
- [x] Shared AI provider service introduced
- [x] Shared SEC provider service introduced
- [x] Yahoo/yfinance service layer introduced for core quote/history/VIX routes

### Frontend architecture
- [x] Inline CSS extracted to `terminal.css`
- [x] Inline JS extracted to `terminal.js`
- [x] Cross-Asset Flows JS extracted to domain module
- [x] Hormuz JS extracted and old stock-sensitivity UI code removed
- [x] Metals JS extracted
- [x] Confluence JS extracted
- [x] Seasonality JS extracted
- [x] Dead Silver Stress client code removed
- [x] University visual compatibility layer retained

## Current phase

The Terminal has moved from stabilization into controlled architecture migration while preserving the working v1 behavior.

## Next

1. Continue provider/service extraction: Yahoo/yfinance core market routes are now centralized; remaining yfinance usage in equities/fundamentals still needs migration. FRED, CFTC, Binance, CoinGecko and DeFiLlama already have service modules but legacy call sites still need consolidation.
2. Extract remaining large legacy frontend domains from `terminal.js`.
3. Introduce shared frontend helpers for API calls, loading/error states and data provenance.
4. Remove provider calls made directly from the browser where a WAVE API route can own them.
5. Add central cache/error/logging primitives before production deployment.
6. Decide deployment target and production persistence for `WAVE_DATA_DIR` / `WAVE_BRIEF_DIR`.
7. Only after the modular vanilla baseline is clean, begin component-by-component React/Next migration.
