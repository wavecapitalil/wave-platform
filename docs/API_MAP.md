# WAVE Terminal API Map v1

This document tracks the current terminal contract between frontend and backend.

## Core market
- `GET /api/quote` — live/current quote
- `GET /api/intraday` — intraday closes
- `GET /api/history` — historical data
- `GET /api/vix-history`
- `GET /api/fear-greed`
- `GET /api/yields`
- `GET /api/fred`
- `GET /api/pcr`
- `GET /api/risk-signals`

Status: mostly live

## Equities
- `GET /api/sectors`
- `GET /api/sector-detail`
- `GET /api/fundamentals`
- `GET /api/stock-info`
- `GET /api/holders`
- `GET /api/analyst-estimates`
- `GET /api/peers`
- `GET /api/correlation`
- `GET /api/ticker-mover`
- `GET /api/ev-market`

Status: live, requires contract tests

## Filings / flows
- `GET /api/insider-buying`
- `POST/GET /api/insider-buying/refresh`
- `GET /api/insider-activity`
- `GET /api/institutions`
- `GET /api/institutions-list`
- `GET /api/earnings`
- `POST/GET /api/earnings/refresh`

Status: live, verify freshness and provider error handling

## News / research
- `GET /api/news`
- `GET /api/macro-news`
- `GET /api/econ-calendar`
- `GET /api/top-stories`
- `GET /api/article`
- `GET /api/blog/articles`
- `GET /api/blog/article/<id>`

Status: live, AI-backed features require optional model key

## Crypto
- `GET /api/crypto-scanner`
- `GET /api/crypto-global`
- `GET /api/cohort-performance`
- `GET /api/cohort-prices`
- `GET /api/cohort-news`
- `GET /api/onchain-history`
- `GET /api/onchain-kpi`
- `GET /api/token-detail`

Status: live, move direct browser provider calls behind backend later

## Morning Brief
- `GET /api/daily-brief`
- `POST/GET /api/daily-brief/refresh`

Status: functionally local-only. Current implementation depends on Daniel's local iCloud / Claude session paths.

## Comm Flows
- `GET /api/comm-flows/latest`
- `GET /api/comm-flows/history`
- `GET /api/comm-flows/breakdown`
- `GET /api/comm-flows/trends`
- `POST/GET /api/comm-flows/update`
- `GET /api/update-status`

Status: BROKEN/EMPTY in live build because root `comm_flows.py` is a stub.

Action: reconcile legacy module and database assumptions before enabling.

## Confluence
- `GET /api/confluence`
- `POST/GET /api/confluence/run`

Status: BROKEN in live build because `confluence.py` is missing.

Action: reconcile legacy module and database assumptions.

## Missing in live backend but called by frontend

### Hormuz
- `/api/hormuz/summary`
- `/api/hormuz/watchlist`
- `/api/hormuz/events`
- `/api/hormuz/agent-log`
- `/api/hormuz/agent-start`

Status: 404 live; implementations exist in legacy backend.

### Commodities
- `/api/commodities/metal-intel`
- `/api/commodities/gold-silver-ratio`

Status: 404 live; implementations exist in legacy backend.

### Seasonality
- `/api/seasonality`

Status: 404 live; implementation exists in legacy backend.

## Health
- `GET /api/health`

Status: live

## Contract-testing requirement

For every route we will add:
- expected status code
- response schema
- timeout
- stale/fallback behavior
- provider dependency
- auth requirement
- caching policy
- freshness metadata

Target response envelope for data routes:

```json
{
  "data": {},
  "meta": {
    "source": "FRED",
    "source_timestamp": "2026-09-24T10:00:00Z",
    "fetched_at": "2026-09-24T10:01:00Z",
    "freshness": "live",
    "fallback": false
  },
  "error": null
}
```
