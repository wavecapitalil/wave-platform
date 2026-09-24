# Expert QA Audit — Stabilization v1

Date: 2026-09-24
Branch: migration/terminal-v2

## Overall assessment

The architecture direction is correct, but the branch is not yet integration-ready. The largest risk is not backend logic; it is contract drift between newly rebuilt API modules and the still-legacy frontend.

## P0 — Must fix before calling Stabilization v1 complete

### 1. Seasonality frontend/backend contract mismatch
Backend now returns:
- historical_average
- current_path
- lookback_years
- years_used

Legacy frontend still expects:
- monthly
- all_years
- monthly month statistics / heatmap

Result: current Seasonality page will fail after receiving the new API response.

Action:
Replace the legacy monthly-bar/heatmap UI with the validated two-line cumulative-return chart.

### 2. Cross-Asset Flows backend has no matching frontend
New /api/flows/* endpoints exist, but the visible Terminal page still renders the old Digital Advertising Commercial Flows product and calls /api/comm-flows/*.

Action:
Replace the Commercial Flows page and loader completely. Do not preserve the old ad-intelligence page as the primary flows module.

### 3. Confluence backend has no matching frontend
New /api/confluence?symbol=...&window=... endpoint exists, but the visible page is still the old Insider Buying screen and loadInsiderBuying() flow.

Action:
Replace UI with ticker search + 7D/30D/90D selector + transparent 3/3 evidence cards.

### 4. Metals frontend contradicts validated product intent
New backend exposes 10Y percentile and z-score, but current UI does not show percentile and still contains strong directional language such as:
- STRONGLY FAVORS SILVER/GOLD
- mean-reversion outcome statements
- claims that one metal "would need to rally" for ratio reversion

Action:
Remove directional verdict language. Show current ratio, 10Y mean, percentile, z-score, gold, silver and a descriptive relative-cheapness note only.

## P1 — Reliability / methodology

### 5. Hormuz UI still contains dead legacy functions
The active load flow now uses the new macro summary, but legacy functions/endpoints for watchlists and agent controls remain in the file.

Risk:
Dead controls may reappear through regression or partial rendering.

Action:
Remove legacy stock-sensitivity and agent UI/functions after the new macro view is fully wired.

### 6. Smoke tests currently validate status codes only
A 200 response can still have the wrong schema.

Action:
Add contract assertions for required JSON keys and basic type validation.

### 7. No CI gate yet
The branch has smoke scripts but no automatic syntax/static-contract gate on every push.

Action:
Add GitHub Actions for:
- Python py_compile
- static frontend/API contract checks
- secret-file denylist checks

### 8. Data freshness is inconsistent
Some new endpoints have meta.generated_at/source/note; much of the legacy API does not.

Action:
Standardize:
- source
- source_timestamp when available
- fetched_at
- freshness
- stale flag
- fallback flag

## P2 — Architecture / maintainability

### 9. api.py is still a monolith
New blueprints are a good start, but most old routes still live inside the ~3,400-line file.

Action:
Continue extraction only after P0 integration is closed.

### 10. CSS compatibility layer is useful but temporary
The University theme successfully aligns visual language, but many legacy inline styles override the design system.

Action:
During page rewrites, move styling into reusable WAVE components/tokens rather than adding more inline CSS.

## Release gate for Stabilization v1

Do not mark Stabilization v1 complete until:
- Seasonality uses the new contract and two-line chart.
- Metals uses the validated descriptive 10Y view.
- Cross-Asset Flows UI calls /api/flows/*.
- Confluence UI calls /api/confluence with 7D/30D/90D.
- Hormuz has no visible legacy stock-ranking/agent controls.
- security and API contract checks pass automatically.
- Morning Brief no longer depends on hard-coded local paths for production.
