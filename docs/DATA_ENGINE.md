# WAVE Data Engine v1

## Goal
Replace browser-side provider dependence with a scheduled, auditable data layer.

## Flow
GitHub Actions (every 15 minutes) -> canonical collectors/calculations -> GitHub OIDC -> Supabase Edge ingestion -> data_snapshots -> wave-data gateway -> Terminal.

No Supabase service-role key is stored in GitHub. The ingestion Edge Function validates GitHub's signed OIDC token and only accepts the WAVE repository/ref/event.

## Dataset registry

| Dataset | Key | TTL | Logic |
|---|---|---:|---|
| Core market | market:core | 15m | market_snapshot_v1.0 |
| Risk Meter | risk:composite | 15m | risk_meter_v1.0 |
| S&P sectors | sectors:sp500 | 15m | sector_strength_v1.0 |
| Rates curve | rates:curve | 15m | rates_curve_v1.1 |
| Crypto market | crypto:market | 15m | crypto_market_v1.0 |
| Gold/Silver | metals:gold-silver | 60m | gold_silver_v1.0 |
| Economic calendar | macro:calendar | 60m | econ_calendar_v1.0 |
| Seasonality per asset | seasonality:<symbol> | 24h | seasonality_v1.1 |

Seasonality assets mirror the UI: SPY, QQQ, GLD, BTC-USD, IWM, TLT, USO, EEM, DX-Y.NYB and ^TNX.

## Canonical calculation rule
Network/provider code lives in collectors.py. Deterministic finance logic lives in calculations.py. The browser is a renderer, not the source of truth.

## Risk Meter
The canonical risk composite preserves the existing WAVE formula:
- VIX level 15%
- VIX term structure 15%
- HYG vs LQD credit 20%
- RSP vs SPY breadth 15%
- risk-on vs defensive sector rotation 15%
- put/call ratio 10%
- SPY vs 200DMA 10%

Both raw evidence and the normalized component scores are stored.

## Snapshot metadata
Every snapshot includes:
- source
- source_timestamp
- fetched_at
- calculated_at
- expires_at
- freshness
- logic_version
- stale/fallback/status/error

## TTL behavior
The workflow runs every 15 minutes, but a collector only runs when its snapshot has expired. This means daily/weekly datasets are not refetched 96 times per day.

## Public API
Production frontend points to:
https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data

The gateway serves migrated snapshots and proxies still-live core routes to wave-core. This allows gradual migration without changing every frontend module.
