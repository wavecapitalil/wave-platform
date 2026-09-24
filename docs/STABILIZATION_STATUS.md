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

- [ ] Reconcile Hormuz routes from legacy backend
- [ ] Reconcile Commodities routes from legacy backend
- [ ] Reconcile Seasonality route from legacy backend
- [ ] Restore full Comm Flows module
- [ ] Restore Confluence module

## Next

1. Bring required legacy modules into the branch.
2. Diff each legacy route against the current backend.
3. Restore only required code paths.
4. Run security and API smoke tests.
5. Add response/freshness metadata contract.
6. Make Morning Brief storage portable.
7. Only then begin backend modularization.
