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

## Phase 1 — Security + stabilization
Priority: P0

Tasks:
- replace unsafe catch-all file serving;
- remove local secret-file exposure;
- restrict CORS;
- add input validation;
- reconcile missing Hormuz / Commodities / Seasonality routes;
- restore Comm Flows;
- restore Confluence;
- fix dependency list;
- replace hard-coded `http://localhost:5001`;
- standardize errors.

Output:
- Terminal v1 Stable.

## Phase 2 — Tests
Add:
- health test
- route smoke tests
- schema tests
- stale-data tests
- provider-failure tests
- basic browser navigation test

No large refactor before this safety net exists.

## Phase 3 — Backend split

Target:

```
backend/
  app.py
  routes/
    market.py
    macro.py
    equities.py
    crypto.py
    news.py
    research.py
    brief.py
  services/
    yahoo.py
    fred.py
    sec.py
    cboe.py
    coingecko.py
    defillama.py
    binance.py
    ai.py
  core/
    config.py
    cache.py
    logging.py
    errors.py
```

## Phase 4 — Data layer
Create a provider abstraction and response metadata.

Goals:
- one place per provider;
- cache centrally;
- fallback providers where possible;
- source + timestamp on every metric;
- data health dashboard.

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

## Phase 6 — Frontend migration

Recommended target:
- Next.js
- React
- TypeScript

Migrate in this order:
1. App shell
2. Overview
3. Macro
4. Equities
5. Crypto
6. Research
7. Tools

Each migrated module must match current behavior before enhancements are added.

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
