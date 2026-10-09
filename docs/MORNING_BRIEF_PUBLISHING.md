# Morning Brief publication

The existing Terminal `#page=brief` section renders a native Hebrew newspaper.
It reads `apps/terminal/public/briefs/latest.json`, then a dated `edition.json`.
The hourly Data Engine market snapshot remains separate and cannot overwrite it.

## Publish the next edition

1. Finish and verify the morning research edition first. Read that day's actual final artifact; do not use a prior-day file, generic market snapshot, or filename alone as evidence of content date.
2. Adapt its financial content faithfully into the schema below. Preserve numbers, dates, observations, material uncertainty, headings, and source links. Export original charts at their native resolution. Keep paragraphs selectable Hebrew text. Do not render entire PDF pages as images or add a PDF/Drive iframe.
3. Exclude private account details, email addresses/messages, mailbox scan counts, internal research bookkeeping, and credentials. Do not upload an original PDF that contains such information. Do not add a global partial-edition banner; preserve specific financial coverage limitations.
4. Write `briefs/YYYY-MM-DD/edition.json` and its chart assets, then update `briefs/latest.json` to that exact date/path in the SAME commit. Never delete prior editions or relabel an older edition as today's.
5. Run `python scripts/validate_morning_brief.py`, `node scripts/brief_dom_test.cjs`, JavaScript syntax checks, and `python scripts/brief_browser_qa.py`. Verify desktop, iPad, phone, source navigation, loading failures and repeat entry.
6. Publish through the authorized repository workflow. Verify Pages deployment for the exact commit and anonymously open the site, manifest and each referenced asset before reporting success.
7. If creation or publication fails, leave the last valid edition and its original date intact. Report the specific publishing blocker; do not substitute invented content or a fresh-looking timestamp.

No recurring scheduler is added by this code. The existing morning-brief workflow should invoke publication after its final research artifact is ready. A timer in the open Brief view checks only for an already-published edition every two minutes, without replacing the user's current article unless a new date exists.

## Schema version 1

Latest manifest: `schemaVersion: 1`, `date: YYYY-MM-DD`, `path: briefs/YYYY-MM-DD/edition.json`, and `revision`: lowercase SHA-256 of the exact UTF-8 edition file bytes. A same-day correction changes this hash and refreshes open readers without relabeling the edition.

Edition fields:

- `schemaVersion: 1`, `date`, `title`, `language: he`, `editionStatus: published`
- `sections`: ordered objects with unique `id`, `kicker`, Hebrew `title`, optional `lead`, `paragraphs` (objects with `kind: text|heading` and `text`)
- Optional per-section `charts`: `src` under the same dated asset folder, descriptive `alt`, original pixel `width`, `height`; supported PNG/WebP/JPG
- Interactive chart alternative: `type: bars`, `title`, `period`, `unit`, and `rows` with `label`, exact numeric `value` (or null for missing), faithful `display`, optional six-digit hex `color`.
- Time-series charts: `type: line|stacked`, `title`, `period`, `unit`, strictly increasing `x` timestamps in milliseconds, full `labels`, compact `tickLabels`, `series` with `label`, hex `color`, and equal-length numeric/null `values`. Optional `decimals`, `zeroBaseline` and `gapAfterMs`. Missing points remain gaps. Use a real elapsed-time axis for lines; monthly stacks are ordered categories. All values must come from verified source data or explicit printed labels; never infer a historical series from pixels. Keep the original graphic if exact series cannot be recovered.
- The initial edition uses twelve interactive charts: seven bar comparisons and five time-series views (including stacked PCE components). It reproduces the original numeric ledger: 119 aligned hourly FX observations, eight COT observations, thirteen PCE months, and separate FRED rate/credit charts. Hover, touch and keyboard select existing observations without changing the historical window. No real-time prices replace the morning snapshot.
- Optional per-section `metrics`: objects with `label` and `value`, both display strings preserving precision
- Optional per-section `table`: `headers` and equal-width `rows`, all display strings
- `sources`: `{title, url}` objects, HTTPS public source URLs only
- `methodology`: readable plain text containing chart provenance, units, source dates, coverage limitations and disclaimers; registered on the final Sources & Methodology page, linked from the end of the article

The renderer uses text nodes for editorial text and restricts assets to the dated folder pattern. It does not execute markup from editions. The source PDF is a private source for editorial transformation, not a public dependency.

## Content-only daily change boundary

For a new morning, change only `apps/terminal/public/briefs/YYYY-MM-DD/edition.json`, its reviewed public chart assets if any, and `apps/terminal/public/briefs/latest.json`. Preserve the prior dated editions, especially the 8 October renderer regression fixture. The browser check reads the current manifest and verifies that edition; the DOM test intentionally uses the archived 8 October fixture. Do not edit application code, tests, the calculation catalogue, data-engine schedules, credentials, or access controls as part of routine daily publication. If the schema cannot faithfully represent new content, stop and report the specific needed change.
