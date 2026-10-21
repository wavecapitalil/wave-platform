# Macro coverage correction — 21 October 2026

Base: main 6a0a3b28b4f6a66cb4c777350b020fbc556391e2. The intervening browser QA repair is separate and unchanged.

## Diagnosis

`terminal-macro-dashboard.js` selected release points whenever the latest saved release period equalled or exceeded the history period, then suppressed charts with fewer than two points. This hid CPI/Core CPI history even though the public `/api/macro-series?series=cpi` response contained 60 observations (checked 2026-10-21T13:24:34.949Z). The SVG renderer explicitly used a polyline. The modal's release selector faithfully showed the sparse archive: `macro-releases.ts` contained only five manually extracted records. There is no database ingestion/archive behind this path. Flask proxies the Edge endpoint; the Edge history adapter independently fetches FRED CSV. No evidence of an API truncation to one observation.

The fix uses columns from zero, separates the card's revised observation chart from the headline release, retains single-point charts, exposes observation tables by default and reports both coverage counts. Column tooltips include the exact date, value and unit. Historical release selection still selects release-specific components and revisions, never current revised components.

## Source-backed coverage

Read-only `scripts/macro_live_check.mjs` completed 2026-10-21T13:23:41Z. All 11 enabled FRED headline series returned 60 transformed observations; GDP and PCE component batches returned 60 and 48 periods. These are bounded latest-revised observations, not 60 archived releases. No pre-release consensus is available for any indicator.

| Indicator | Official origin / FRED series | Observation meaning | Archived releases after fix | Remaining gap |
|---|---|---|---|---|
| CPI | BLS / CPIAUCNS | NSA annual change, matching 12-month lag | June–September 2026, four releases | Earlier vintages; Table 7 effects only September |
| Core CPI | BLS / CPILFENS | Ex food/energy, NSA annual change | June–September 2026, four releases | Earlier vintages; no core-specific contribution partition |
| PCE | BEA / PCEPI | SA annual price change | None | Vintage ingestion; component growth rates are not contributions |
| Industrial production | Federal Reserve / INDPRO | SA monthly volume change | None | Vintage ingestion |
| Real GDP | BEA / A191RL1Q225SBEA | SA quarterly growth at annual rate | None | Advance/second/third vintages; revised expenditure contributions available |
| Retail sales | Census / RSAFS | SA nominal monthly change | None | Vintage ingestion; not real consumption |
| ISM Manufacturing | ISM | Monthly index | None | Archive/chart redistribution entitlement unverified; intentionally no fetch |
| ISM Services | ISM | Monthly index | None | Same licensing gap, separate indicator |
| NFP | BLS CES / PAYEMS | SA monthly difference, thousand jobs | August and September 2026 | Broader archive and industry partitions |
| Unemployment | BLS CPS / UNRATE | SA percent | September 2026 | Broader archive; household survey, not CES decomposition |
| Claims | DOL / ICSA | SA weekly claims, week-ending date | None | Weekly release/revision archive |
| JOLTS | BLS / JTSJOL | SA thousand job openings | None | Vintage archive; stock rather than payroll flow |
| Wages | BLS CES / CES0500000003 | SA annual average-hourly-earnings growth | None | Vintage archive; composition effects remain |

Each FRED series has a direct source link in Sources & Methodology. Existing transformations preserve native monthly/quarterly/weekly dates and missing comparison periods. No values are interpolated. The current bounded observation path already works; it is preserved rather than duplicating revised observations as release rows.

## Bounded official archive backfill

Six new rows come from the annual NSA column of Table A and each page's embargo timestamp (08:30 ET = 12:30 UTC on these dates):

- https://www.bls.gov/news.release/archives/cpi_07142026.htm — June: headline 3.5%, core 2.6%.
- https://www.bls.gov/news.release/archives/cpi_08122026.htm — July: headline 3.4%, core 2.5%; June values repeated as 3.5% / 2.6%.
- https://www.bls.gov/news.release/archives/cpi_09112026.htm — August: headline 3.4%, core 2.4%; July repeated as 3.4% / 2.5%.
- https://www.bls.gov/news.release/archives/cpi_10142026.htm — September's existing 3.7% / 2.6% headline records now link to the dated archive rather than the rolling page.

The existing September actual values/components are preserved. Its prior and revised-prior annual values (3.4% CPI, 2.4% core) are now filled from the August archive and September narrative; original verification time is retained separately and the updated record has the new verification time. July/August prior values reference the independently captured preceding releases, while revised_prior is the preceding period repeated in that specific release. June prior stays null because May was outside this verified backfill. Components and consensus stay empty for the new rows. September Table 7 effects were rechecked in its dated archive (food 0.338, energy 1.353, ex-food/energy 2.046 percentage points); the component source now links there. These are annual effects on All Items, not component growth rates or core CPI contributions.

The BLS archive index returned 403 to a direct command-line request. No retries with altered identity or access bypass were made. The ordinary web research tool could read dated official archives. This permits a bounded reviewed backfill; it does not establish a reliable automatic ingestion contract for every agency. Broader multi-agency archived-release adapters remain unimplemented and are not claimed complete.

## Freshness and rights

The request-driven adapter fetches on page load with three concurrent requests and caches for one hour per warm Edge process; each upstream request times out after 12 seconds. Cache state is not durable and disappears on cold start. FRED publication lag, request timing, network failure and this cache contribute to actual latency. There is no release trigger or ingestion schedule. Public availability is not an instant-refresh guarantee.

PCE's latest retrieved observation was August 2026 (3.419% calculated YoY). It crossed the existing 50-day period-end heuristic on October 21, hence `stale`; this is not evidence of a newer missing release. The same age rule applies independently of the official calendar. Stale cached data after fetch failure and age-based stale data must not be interpreted as live release status. ISM rights remain unverified; no access restrictions or paid services were bypassed. No schedules, credentials, security configuration, database grants or production resources changed.

## Candidate validation

- 13 Macro test groups passed, including native-frequency arithmetic, duplicate/missing periods, signed component reconciliation, cache failures, consensus provenance and the new dated archive assertions.
- Full Terminal Macro click tests passed at 1440/en, 1024/he, 375/he and 320/en with captured official responses, then passed again with synthetic history/outage fixtures. Tested columns on CPI/Core cards, four CPI releases, historical selection, separate 60-row revised history, NFP negative contributions, GDP/PCE components, ISM empty state, keyboard containment/Escape/focus return, Sources & Methodology and fetch failure. Screenshots reviewed at phone widths.
- Static contracts, JavaScript syntax, Python syntax and git whitespace checks passed. Generated private source catalogue refreshed.
- No candidate deployment or hosted candidate API validation. Broad repository CI is a separate review gate. The direct-source checks are a read-only snapshot, not a durable ingestion guarantee.
