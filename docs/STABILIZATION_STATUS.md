# Stabilization Status

Branch: `migration/terminal-v2`

## Completed

- [x] Repository initialized
- [x] Migration branch created
- [x] Immutable Terminal v1 snapshot started under `legacy/terminal-v1`
- [x] Main v1 frontend snapshot uploaded
- [x] Main v1 backend snapshot uploaded
- [x] Public site assets copied to `apps/terminal/public`
- [x] Production frontend API base no longer hard-codes localhost
- [x] Secured backend baseline created under `services/api`
- [x] Arbitrary catch-all static serving removed from secured baseline
- [x] Public-file allowlist added
- [x] API CORS restricted to configured origins
- [x] Security smoke test added
- [x] Core API smoke test added
- [x] Architecture audit documented
- [x] API map documented
- [x] Migration plan documented

## In progress

- [x] Replace legacy Hormuz core with validated macro energy-risk monitor
- [x] Add 10Y Gold/Silver Ratio endpoint aligned to validated metals spec
- [x] Add 10Y seasonality endpoint with historical-average and current-year paths
- [ ] Restore full Comm Flows module
- [ ] Restore Confluence module

## Next

1. Redesign the Seasonality UI around the validated two-line view.
2. Simplify Metals UI to emphasize ratio / mean / percentile / z-distance.
3. Build the new Cross-Asset Flows module from scratch; do not restore legacy Digital Ad Comm Flows.
4. Rebuild Confluence around 7D / 30D / 90D institutional + insider + analyst alignment.
5. Run security and API smoke tests in a networked runtime.
6. Add consistent response/freshness metadata contract.
7. Make Morning Brief storage portable.
8. Continue backend modularization only after stabilization.
