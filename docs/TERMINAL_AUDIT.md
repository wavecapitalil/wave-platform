# WAVE Terminal Audit v1

Date: 2026-09-24

## Executive summary

The current WAVE Terminal is functional and feature-rich, but structurally it is still a prototype that has grown into a product:

- Frontend: one ~9,900-line `terminal_app.html` containing CSS, HTML and JavaScript.
- Backend: one ~3,390-line Flask `api.py` serving static files and ~55 JSON routes.
- Data sources include Yahoo Finance, FRED, SEC EDGAR, CBOE, Nasdaq, CNN Fear & Greed, CoinGecko, DeFiLlama, Binance, Reddit, StockTwits, Google News/RSS and others.
- Several frontend features are ahead of the live backend.
- There is a deployment-blocking security issue in the current static file catch-all.

The goal is not to rewrite everything at once. The recommended path is:
1. Stabilize
2. Secure
3. Test
4. Refactor backend
5. Refactor frontend
6. Add shared WAVE platform services
7. Integrate University, Research and Products

## Current architecture

```
Browser
  |
  +-- terminal_app.html
  |     +-- inline CSS
  |     +-- inline HTML
  |     +-- inline JS
  |     +-- some direct provider calls
  |
  +-- Flask api.py
        +-- static file serving
        +-- market routes
        +-- macro routes
        +-- equities routes
        +-- crypto routes
        +-- news / research routes
        +-- AI routes
        +-- SQLite cache
```

## Critical findings

### P0 — Security
The current catch-all Flask static route can serve arbitrary files from the project directory. This must be fixed before any public deployment.

Required:
- Remove catch-all file serving.
- Serve only an explicit `public/` or `static/` directory.
- Never expose `.env`, `.py`, `.db`, logs or internal config files.
- Restrict CORS in production.
- Move secrets to environment variables / secret manager.
- Add request validation and rate limiting.

### P0 — Frontend/backend mismatch
Frontend calls routes that are missing from the live backend:
- Hormuz Oil Desk routes
- Commodities metal-intel
- Commodities gold-silver-ratio
- Seasonality

The legacy backend contains versions of these routes and must be reconciled selectively, not copied wholesale.

### P0 — Broken / incomplete features
- Comm Flows root module is a stub.
- Confluence routes fail because the live module is missing.
- Morning Brief depends on local Mac/iCloud/Claude-session paths.

### P1 — Maintainability
- `terminal_app.html` is too large for safe ongoing development.
- `api.py` mixes routing, provider integrations, business logic, AI logic, storage and static serving.
- No central API client in the frontend.
- Some browser code talks directly to external providers.

### P1 — Reliability
The product currently lacks a standardized data-health layer.

Required for each displayed metric:
- source
- source timestamp
- fetch timestamp
- freshness state
- fallback state
- error state

### P1 — Product architecture
Current navigation is feature-oriented. The future WAVE Platform should be workflow-oriented:

- Overview
- Macro
- Equities
- Crypto
- Research

Shared platform:
- WAVE Account
- Watchlists
- Saved research
- Alerts
- Search
- University links
- Product access

## KEEP / FIX / REFACTOR / REMOVE

### KEEP
- Current visual direction and dark WAVE identity
- Market overview
- Macro scanner
- Risk meter
- Rates / yields
- Sector strength
- Company research
- What's Moving concept
- Institutional holdings
- Earnings
- Correlation
- Crypto dashboard
- Crypto scanner
- Put/Call Ratio
- BTC/Gold
- Existing EN/HE direction

### FIX
- Hormuz
- Commodities routes
- Seasonality
- Comm Flows
- Confluence
- Morning Brief portability
- hard-coded localhost API base
- static file exposure
- missing dependencies
- inconsistent error states

### REFACTOR
- `terminal_app.html` into components/modules
- `api.py` into route + service modules
- direct browser provider calls behind WAVE API
- AI calls behind a single AI service
- local storage/state into user/account-aware storage
- hard-coded user name
- duplicated formatting / chart helper logic

### REMOVE / AVOID
- catch-all static serving
- project secrets file accessible to web server
- deployment dependence on local Mac paths
- provider-specific logic scattered through UI code
- one-shot full rewrite

## Target architecture

```
WAVE Platform
|
+-- Main Site
|   +-- Home
|   +-- Research
|   +-- Products
|   +-- About
|
+-- WAVE Terminal
|
+-- WAVE University
|
+-- WAVE Account
    +-- Profile
    +-- Access
    +-- Watchlists
    +-- Saved items
    +-- Progress
    +-- Alerts

Shared:
- Design System
- Auth
- API client
- Data provenance
- Search
- AI service
```

## Recommended implementation order

1. Freeze current local snapshot.
2. Security remediation.
3. Repair broken features.
4. Add smoke tests for all API routes.
5. Split backend by domain.
6. Add common provider service layer.
7. Introduce frontend API client.
8. Migrate frontend module-by-module.
9. Add shared WAVE account/auth.
10. Connect University deep links.
11. Add personalized dashboard/watchlists.
12. Add alerts and unified search.

## Definition of done for Phase 1

Phase 1 is complete when:
- every current terminal page is catalogued;
- every frontend API call has a matching backend status;
- broken pages are classified;
- security blockers are listed;
- migration priority is documented;
- no production refactor has started without a stable baseline.
