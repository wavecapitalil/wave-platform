# Browser QA Report — Stabilization v1

Date: 2026-09-24
Branch: migration/terminal-v2
Latest validated head: 414364609a94a7e4e5c7bd79e3c45aea645b9bdd

## Test coverage

Headless Chromium against a running Flask API with live provider access.

Viewports:
- Desktop: 1440 × 1000
- iPad: 1024 × 1366

Pages exercised:
- Seasonality
- Metals
- Cross-Asset Flows
- Confluence
- Hormuz

Assertions include:
- page visibility
- no horizontal overflow
- no uncaught JavaScript page errors
- live data renders
- rebuilt pages use the new API contracts
- old product copy/routes are absent
- key controls work
- desktop and iPad screenshots are captured as CI artifacts

## Issues found and fixed during QA

### Seasonality
- Removed the original frontend/backend contract mismatch.
- Replaced monthly-bar legacy view with current-year vs 10Y average cumulative path.
- Fixed historical alignment artifacts that produced a saw-tooth average.
- Fixed end-of-year sample distortion by calendar month-day alignment with weekend/holiday forward-fill.
- Browser QA now waits for rendered data rather than only DOM presence.

### Metals
- Removed strong directional verdict language.
- Locked the stabilized product to the validated 10-year relative-value view.
- Removed/hid the broken legacy Silver Stress panel from the stabilized screen.
- Default view now emphasizes current ratio, 10Y mean, percentile, z-score, gold and silver prices.

### Cross-Asset Flows
- Removed the old Digital Advertising Commercial Flows product from the primary Terminal path.
- Verified Crypto / Futures / Options / Short Interest navigation and rendering.
- Confirmed responsive cards on iPad.

### Confluence
- Replaced standalone Insider Buying screen with transparent 3-way evidence overlap.
- 7D / 30D / 90D controls verified.
- Ticker keyboard workflow improved and exercised in Browser QA.
- Analyst revision classification tightened so neutral/reiterated ratings are not automatically treated as positive.

### Hormuz
- Removed stock-sensitivity/watchlist/agent UI from the core screen.
- Risk state made more recency-aware and directionally tied to oil confirmation.
- Verified desktop/iPad rendering and recent-event list.

### Design / responsive
- Navigation labels updated in EN/HE.
- Rebuilt research pages use the University visual language.
- Responsive grid rules added for iPad/mobile.
- Page canvas kept consistently dark.

## CI status at validated head

- Stabilization CI: PASS
- Live Integration: PASS
- Browser QA: PASS
- Security smoke: PASS
- Desktop pages: 5/5 PASS
- iPad pages: 5/5 PASS
- Uncaught browser JS errors: 0

## Remaining product caveats

These are not blockers for Stabilization v1, but should guide the next phase:

1. Cross-Asset Flows currently has stronger coverage for positioning than true cash-flow data. Multi-venue exchange-flow coverage should expand before calling it a complete flows terminal.
2. Institutional Confluence uses 13F data and is inherently quarterly/lagged.
3. Legacy API routes outside the rebuilt modules still need gradual extraction and metadata standardization.
4. Full mobile-phone UX is not yet a release target; current QA covers desktop and iPad.
