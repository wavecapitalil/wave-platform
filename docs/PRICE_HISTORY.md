# Company Research price history and linked events

## Scope

The Company Research view includes a daily-close price chart for the selected ticker with 1M, 3M, 6M, 1Y and 5Y windows. The existing company header is retained. Numbered chart markers and keyboard/touch-operable event cards link directly to the original publication.

`GET /api/price-history?symbol=AAPL&range=1y` is handled by the Supabase `wave-data` service. A Flask proxy preserves the local application route. No account, paid provider, additional secret, database table, or permission change is required.

## Honest coverage

- Prices: Yahoo Finance public daily history, including its adjusted-close series when consistently available. The provider may rate-limit or discontinue its undocumented endpoint; failures produce an unavailable state, never synthetic data.
- News: Yahoo's current rolling search sample, strictly filtered for exact `relatedTickers` membership and publications no older than 45 days. This is **not a historical news archive** and does not promise 45 days of complete coverage.
- Historical context: 16 manually source-reviewed releases/articles dated 2024–2026, covering eight companies plus two US market-wide events. This is a limited supplemental catalog. Other tickers still receive their genuine available price history and current tagged news; zero qualifying events is a valid result.
- Qualifying markers require both a sourced event and a significant daily move or sufficiently prominent local high/low. Markers are capped at six for 1M and eight otherwise, with minimum session spacing. The chart does not manufacture an explanation for every extremum.
- Event cards distinguish context from a source's explicit reported driver. Temporal proximity is never presented as proof of causation. Date-only, shifted and unreviewed events are context only.

All detailed provenance, coverage, caveats, formulas and alignment methodology are registered on the Terminal's existing Sources & Methodology page. The chart itself retains daily-close basis/currency, dates, primary event content and loading/error/empty states.

## Session and price semantics

All plotted dates are exchange-local completed sessions. A current daily bar is withheld until ten minutes after the available regular-session close. Exact after-close news maps to the next trading date; date-only publications conservatively map to the next trading date. Provider session schedules take precedence; the fallback US schedule is conservative around possible early closes and has disclosed limitations. An event may qualify on its first eligible session or immediately following session. Intraday publications do not establish the direction or cause of an entire day's move.

A complete adjusted-close series is preferred. If any valid price lacks adjusted close, the entire range uses Yahoo's split-adjusted close and explicitly excludes cash-dividend adjustment. Split ratios are not applied twice. An unresolved split discontinuity is rejected. Invalid/missing observations are omitted and returns spanning missing observations remain null.

For eligible USD/New York US listings only, SPY is matched on the same pair of dates and adjustment basis. Daily stock change, daily SPY change and their percentage-point difference are returned by the server. They are context, not a causal model. Foreign-market, missing or incompatible benchmark values remain null.

Arithmetic is declared in the read-only `PRICE_HISTORY_DEFINITIONS` registry in `calculations.ts` and evaluated server-side. It does not join the owner-editable company metric definitions. The generated owner-only source catalog includes the new code.

## Safety and UX

- Symbol/range allowlists, bounded provider timeouts and response sizes, short bounded server cache
- Exact-symbol checks, finite positive price checks and safe HTTPS article links
- No source HTML is rendered; text is escaped
- Abort plus generation guards for repeated ticker/range selection; stale research headers, ownership, peers, analyst and insider responses cannot overwrite a newer selection
- Retry and no-event paths retain explicit states; no last-ticker chart is silently substituted
- Chart.js is already a pinned dependency in the Terminal shell; no additional runtime package

## Validation

`node --test scripts/price_history_test.mjs` covers request validation, strict null behavior, split adjustment, incomplete sessions, timezone/DST/weekend/date-only/early-close alignment, direct links, duplicates, ticker filtering, stale/unavailable news, benchmark compatibility, marker selection/spacing/caps and range clipping.

`python scripts/price_history_browser_qa.py` is a deterministic full-shell Chromium suite using clearly isolated test fixtures. It covers desktop, iPad landscape/portrait and phone, marker/card selection, keyboard, range switching, repeated stock requests, late responses, failed prices/retry, empty events, mismatched ticker rejection and centralized Sources navigation. The GitHub workflow installs Chromium and publishes screenshots/report.

Local Chromium may be blocked by sandbox Unix-socket restrictions; this is a never-run browser stage rather than a pass. Complete CI before rollout. Live provider checks are separate from synthetic-fixture UI tests.

## Rollout

This work is staged as a draft feature change. Deploy the updated `wave-data` function before publishing the chart frontend to avoid an unsupported route. Main merge and backend/frontend deployment require explicit authorization. The existing database/auth/owner boundary must remain unchanged. Rebase over other active Terminal changes and regenerate `calculation-catalog.ts` before rollout.
