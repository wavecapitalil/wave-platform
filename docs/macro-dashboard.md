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
- GDP/PCE latest-revised component ingestion is connected as documented below. Broader immutable release history and automated first-release capture remain unimplemented. Industry GDP does not belong to the advance estimate; no industry GDP is presented.
- CPI history currently has one recorded release, so its release trend is unavailable. Current revised FRED history is a separate section.
- No forced additive breakdown for unemployment, JOLTS, claims or wages. CPS differs from CES, JOLTS gross flows differ from net payroll changes, and retail sales are labelled nominal.
- Production edge/runtime behavior and provider availability remain unverified until a separately approved deployment. This task does not merge or deploy.

All provenance and methodology are registered centrally through WaveSources, per AGENTS.md. Units, periods, release states and actual/prior/revised values stay beside the relevant metric.

## Verification

- `node --test scripts/macro_test.mjs`: 12 test groups cover release invariants, signed reconciliation, CPI effects, nulls, malformed and duplicate periods, native monthly/annual transformations, no ISM fetch, provider failure and stale-cache retrieval timestamps.
- Macro, calculation-access and valuation regression tests: 81 passed, one pre-existing skip across the combined 82-test run.
- Static contracts and Flask route contract passed (71 registered routes).
- `scripts/macro_browser_qa.py`: full Terminal shell, 1440 English, 1024 Hebrew, 375 Hebrew and 320 English. Checks three inflation cards in a row, touch target dimensions, no horizontal overflow, keyboard modal containment and return, release selection, CPI/NFP decomposition, ISM missing state, central source registry and API failure.
- Browser fixtures contain synthetic history only in the test harness. Screenshots in `/tmp/wave-macro-qa` are QA evidence, not live market data.
- A pull-request-only Macro workflow runs these checks. It does not create a new schedule.


## Official component ingestion (PR44 continuation)

`GET /api/macro-series?series=gdp&components=1` and the corresponding `pce` request fetch a single allowlisted FRED CSV containing the headline and five BEA component series. Each response is explicitly latest-revised history. Retrieval time is not a release date or proof of an immutable vintage. The same response provides all comparison-period inputs. GDP retains 60 quarters; PCE retains 48 months, after computing lags from the full source data.

GDP uses BEA NIPA 1.1.2: DPCERY2Q224SBEA (consumption), A006RY2Q224SBEA (gross private domestic investment), A020RY2Q224SBEA (exports), A021RY2Q224SBEA (imports), A822RY2Q224SBEA (government). These are published percentage-point contributions at annual rates. Imports already have the contribution sign. The 2026-Q2 downloaded values sum to 2.22 pp against a 2.2% headline, leaving −0.02 pp. The reconciliation bound is 0.075 pp: five values rounded to two decimals plus a headline rounded to one decimal. Missing components yield null totals; inconsistent sums are explicitly unreconciled. The check does not establish historical release-vintage alignment.

PCE uses BEA NIPA 2.8.4 price indices: DDURRG3M086SBEA, DNDGRG3M086SBEA, DSERRG3M086SBEA, DFXARG3M086SBEA and DNRGRG3M086SBEA. They are seasonally adjusted indices, 2017=100. Growth is `100 × (current index / same-series lagged index − 1)` with exact one-month and twelve-month lags. Food and energy are supplementary overlapping categories. No sum, weight approximation, inflation contribution, or real-consumption growth is implied. Nonpositive price levels are rejected. Full series source links and calculation descriptions appear in Sources & Methodology.

Requests have a 12-second provider timeout and separate one-hour process-local headline/component caches. A component failure does not prevent loading the headline. A failed refresh retains the previous entire component batch with its original retrieval time and a stale label; a cold failure returns unavailable with no fabricated values. Cache does not survive an edge-worker restart. On reopening, component data is reused within the current page; Refresh clears page state and requests again (subject to the one-hour server cache). No new scheduled task, credential, database schema, deployment, or first-release archive is introduced.

Monthly and quarterly stale-age heuristics run from the period end (50 and 130 days); weekly uses the observed week-ending date (21 days). These are explicit heuristics, not release calendars. Newer-period observations can replace an older archived release on overview cards; a same-period verified release keeps its officially rounded headline and its label, while revised data remains separately accessible.

## Source verification and repeatability

Run `node scripts/macro_live_check.mjs /tmp/wave-macro-live` for an explicit read-only live check. It writes exact returned CSVs, SHA-256 hashes, parsed responses, reference dates, series mappings, units, and statuses. `docs/macro-live-verification.json` records the final local run. All 11 public headline series and both component batches succeeded. ISM Manufacturing/Services remain license-unverified; pre-release consensus remains unavailable. These gaps do not stop the public data requests. GDP and PCE component history is updated on demand; NFP/CPI release decomposition remains the bounded official release extracts described above.

Browser QA now includes GDP and PCE period selectors and tables at 1440px English, 1024px Hebrew, 375px Hebrew, and 320px English, alongside existing NFP/CPI, modal keyboard, overflow, missing-state and three-inflation-card tests. Its injected histories are synthetic QA fixtures, never user-facing market evidence. The separate live check has real source data. Production edge execution remains untested because this task does not deploy.

The final browser pass also ran against freshly captured official responses (`WAVE_MACRO_REAL_DATA=/tmp/macro-official-verification/responses.json`), without synthetic history. All four viewport/language checks passed. Component tables wrap on small phones so all four PCE columns remain visible.
