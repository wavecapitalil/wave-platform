# US Macro dashboard — review boundary

The Macro page adds 13 indicators across inflation, growth and labour. Desktop grids use three or four columns; CPI, PCE and Core CPI retain three columns at 320px and 375px. Other phone groups use two columns. Closed cards have headline values, units, reference periods, state and a small trend only when history is available. Native dialogs expand to fullscreen on phones and provide keyboard containment, Escape and focus return. The existing news scanner remains in a disclosure.

## Data boundary

`GET /api/macro-series` returns the catalogue and bounded, manually verified BLS release extracts. `?series=<id>` requests public FRED history with a strict series allowlist. The shared edge adapter owns this contract; local Flask proxies it. No database schema, account access, subscription, production deployment or data schedule is changed.

The initial release extracts cover August and September 2026 NFP, September CPI and Core CPI, and September unemployment. They are public official data, not fixtures. Each records reference period, release timestamp, vintage, source/table and verification timestamp. Future releases must be appended and verified; this PR does not claim an operating ingestion or analysis pipeline. FRED history is explicitly **latest revised history**, not first-release observations; retrieval time is not represented as release time. ALFRED is a possible history helper, not a realtime guarantee.

NFP: September's 11 mutually exclusive published industry groups sum to +29 thousand, including negative industries. The August release's +162 thousand remains immutable while October's revised August +133 thousand is separate. July's revision from +21 to −10 thousand is also retained. Official sources:

- https://www.bls.gov/news.release/archives/empsit_09042026.htm
- https://www.bls.gov/news.release/archives/empsit_10022026.htm (B-1 and release summary)

CPI: September's annual NSA headline is 3.7%. Table 7 publishes Food 0.338, Energy 1.353, and All Items Less Food and Energy 2.046 percentage-point effects. Their 3.737 sum differs from the rounded headline by −0.037; the UI displays this rounding residual. These are effects, not component inflation percentages. Core CPI's 2.6% is separate and does not receive an All Items contribution decomposition.

- https://www.bls.gov/news.release/cpi.nr0.htm
- https://www.bls.gov/news.release/cpi.t07.htm

These current CPI URLs were verified 2026-10-14; they are mutable publisher URLs. The checked-in extract retains that vintage. BLS direct HTTP retrieval returned 403 in this execution environment; values were checked through the web research tool. A public FRED PCE CSV request succeeded and parsed into 60 observations, latest reference period 2026-08.

## Remaining coverage gaps

- No verified pre-release consensus provider or capture timestamp: consensus stays null, never replaced by a model forecast.
- ISM Manufacturing and Services are separate unavailable/license-unverified slots; no entitlement was found or presumed.
- GDP/PCE contribution ingestion and broader immutable release history remain unimplemented. GDP expenditure decomposition must use NIPA 1.1.2/1.5.2 with estimate/vintage matching; industry GDP does not belong to the advance estimate.
- CPI history currently has one recorded release, so its release trend is unavailable. Current revised FRED history is a separate section.
- No forced additive breakdown for unemployment, JOLTS, claims or wages. CPS differs from CES, JOLTS gross flows differ from net payroll changes, and retail sales are labelled nominal.
- Production edge/runtime behavior and provider availability remain unverified until a separately approved deployment. This task does not merge or deploy.

All provenance and methodology are registered centrally through WaveSources, per AGENTS.md. Units, periods, release states and actual/prior/revised values stay beside the relevant metric.

## Verification

- `node --test scripts/macro_test.mjs`: seven test groups cover release invariants, signed reconciliation, CPI effects, nulls, malformed and duplicate periods, native monthly/annual transformations, no ISM fetch, provider failure and stale-cache retrieval timestamps.
- Valuation regression tests: 63 passed, one pre-existing skip across the combined 64-test run.
- Static contracts and Flask route contract passed (71 registered routes).
- `scripts/macro_browser_qa.py`: full Terminal shell, 1440 English, 1024 Hebrew, 375 Hebrew and 320 English. Checks three inflation cards in a row, touch target dimensions, no horizontal overflow, keyboard modal containment and return, release selection, CPI/NFP decomposition, ISM missing state, central source registry and API failure.
- Browser fixtures contain synthetic history only in the test harness. Screenshots in `/tmp/wave-macro-qa` are QA evidence, not live market data.
- A pull-request-only Macro workflow runs these checks. It does not create a new schedule.
