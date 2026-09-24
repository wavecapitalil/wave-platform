# WAVE Platform Migration Plan

## Principle

Do not rewrite the current terminal in one shot.

The migration strategy is strangler-style:
- preserve working behavior;
- create clean boundaries;
- move one domain at a time;
- keep a stable fallback until the new module is verified.

## Phase 0 — Baseline
- Store current export as reference.
- Document all pages and routes.
- Create stable migration branch.
- No production behavior changes.

## Phase 1 — Security + stabilization — COMPLETE

Delivered:
- unsafe catch-all removed and public assets allowlisted;
- local secret-file exposure removed;
- CORS constrained;
- hard-coded production localhost removed;
- Hormuz / Metals / Seasonality rebuilt to validated intent;
- legacy ad Comm Flows replaced by Cross-Asset Flows;
- Confluence rebuilt as transparent evidence overlap;
- Morning Brief made portable;
- source/freshness contract introduced.

Output:
- reproducible Terminal stabilization baseline.

## Phase 2 — Tests — COMPLETE BASELINE

Implemented:
- health/security smoke tests;
- core route smoke tests;
- live external-provider + schema checks;
- semantic checks on rebuilt research modules;
- full Flask route-surface contract;
- JavaScript/Python syntax gates;
- desktop Chromium browser workflows;
- iPad viewport browser workflows;
- responsive overflow and uncaught-JS checks.

The suite remains a migration gate and will expand with each extracted domain.

## Phase 3 — Backend split — CORE COMPLETE

Current runtime:

```
services/api/
  api.py                 # minimal process entrypoint
  app_factory.py         # composition root
  modules/               # Flask domain blueprints
  services/
    ai.py
    sec.py
  core/
    meta.py
```

All legacy HTTP routes have been moved out of the original API monolith into domain blueprints. Background schedulers now have explicit/idempotent lifecycle functions.

Remaining Phase 3 work is provider extraction, not route extraction:
- Yahoo/yfinance
- FRED
- CFTC
- Binance
- CoinGecko
- DeFiLlama
- CBOE

## Phase 4 — Data/provider layer — IN PROGRESS
- shared AI provider adapter created;
- shared SEC adapter created;
- rebuilt research endpoints use provenance/freshness metadata;
- portable application data directory introduced.

Next:
- extract remaining provider-specific HTTP/yfinance access;
- centralize cache and timeout policy;
- define provider errors/fallbacks;
- expand source + timestamp metadata to legacy endpoints;
- add internal data-health reporting.

## Phase 5 — Shared WAVE design system
Create reusable:
- colors
- typography
- spacing
- cards
- tables
- charts
- pills/badges
- navigation
- loaders
- empty/error states
- RTL rules

## Phase 6 — Frontend migration — BOUNDARY EXTRACTION IN PROGRESS

Before framework migration, the legacy bundle is being decomposed safely:
- inline CSS -> `terminal.css`;
- inline app JS -> `terminal.js`;
- rebuilt research domains -> dedicated JS modules;
- dead legacy Silver Stress code removed.

Next:
1. extract remaining Macro / Equities / Crypto / Research domains;
2. introduce shared API/loading/error helpers;
3. eliminate direct browser-to-provider calls;
4. preserve browser QA;
5. then migrate component-by-component to Next.js + React + TypeScript.

No big-bang rewrite.

## Phase 7 — WAVE Account
Shared identity across:
- Main Site
- Terminal
- University
- Products

Recommended:
- Supabase Auth
- Postgres
- user profile
- entitlements
- saved items
- watchlists

## Phase 8 — University integration
Bidirectional deep links:

```
University lesson -> Open live Terminal tool
Terminal tool -> Learn this concept
```

## Phase 9 — Main WAVE site
Main sections:
- Home
- Terminal
- University
- Products
- Research / Blog
- About

## Phase 10 — Personalization
- custom dashboard
- watchlists
- saved research
- alerts
- notification preferences

## Phase 11 — Unified search
Global command/search:

```
⌘K Search WAVE
```

Search:
- tickers
- crypto assets
- terminal tools
- research
- university lessons
- products

## Phase 12 — Intelligence layer
Central WAVE AI service:
- provider routing
- prompt versioning
- model fallback
- cost logging
- source grounding
- structured output validation

Used by:
- What's Moving
- article synthesis
- research summaries
- University tutor

## Product improvements to add after stabilization

### Data provenance
Every metric should expose source and freshness.

### Data Health
Internal status page for upstream providers and caches.

### Watchlists
User-defined asset groups with market + research context.

### Smart alerts
Not only price:
- SEC filing
- earnings revision
- insider activity
- KPI threshold
- unlock
- on-chain anomaly
- funding extreme

### Unified entity pages
A ticker/token should become a single entity page linking:
- market data
- fundamentals/on-chain
- news
- catalysts
- institutional/holder data
- related research
- related university content

### Workflow-first navigation
Prefer workflows over long flat lists.

Target top-level:
- Overview
- Macro
- Equities
- Crypto
- Research
