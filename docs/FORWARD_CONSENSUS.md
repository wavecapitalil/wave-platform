# Company Research forward consensus

Implemented 2026-10-07 in the live `wave-data` stock-info route and both research views.

EPS observations are collected concurrently from public StockAnalysis/S&P Global annual forecast fields, Nasdaq/Zacks annual forecast JSON, and Yahoo earningsTrend when available. No paywall-only table values are decoded. Yahoo responses without a declared accounting basis are shown separately and excluded from the adjusted blend. HTTP errors or schema changes yield an explicit unavailable-source status, never fabricated estimates.

The blend groups by exact fiscal period end, currency, and GAAP/adjusted category. Within a group, each upstream provider contributes once; source-average EPS is equally weighted, not weighted by overlapping analyst counts. P/E is the current quote divided by that mean. The nearest fiscal year with multiple verified sources is preferred; a single-source fallback is explicitly labeled. Fiscal-year EPS is never called NTM. Non-positive EPS produces no P/E. Stale dated sources older than 45 days are excluded; unspecified update dates are disclosed rather than replaced with fetch dates. Quote timestamps are returned, including for snapshot-backed tickers.

Adjusted EPS definitions may still differ among providers. This is disclosed beside the range and in each source note. Confidence is an agreement/coverage label, not an accuracy probability: never higher than medium, low for one provider, mixed signs, an undefined near-zero spread, or range/absolute mean above 20%. A 15-minute in-process cache stores observations, while P/E is recalculated for each current quote; cache storage is capped at 200 symbols.

## Verification

- `node --test scripts/forward_consensus_test.mjs`: 17 tests cover null/zero, EPS averaging, fiscal periods, accounting/currency grouping, duplicate providers, stale dates, negative EPS, source failures, parser safety, escaped UI content and the cached stock-info route.
- Syntax checks for both TypeScript modules and the two JavaScript UI files.
- Public source fetches on 2026-10-07: PLTR, NVDA, AAPL, JPM, FSLR and MU all yielded annual EPS from StockAnalysis and Nasdaq. Fiscal periods matched for each selected blend, including January, August and September year ends. PLTR's provider spread triggered low confidence. Yahoo returned HTTP 401 and was excluded.
- CI runs the deterministic checks on relevant changes. Provider availability remains runtime-dependent; two working sources in this test do not guarantee future availability.
