# Research Monitor: private persistence contract

This migration is staged source, not an applied hosted database change. Public editorial research is untouched. Apply through the normal reviewed deployment process before enabling cloud persistence.

## Authenticated browser contract

Use the existing Supabase Auth access token with the publishable key. Never use a service key in the browser.

- `wave_research_monitors`: owner-only SELECT; INSERT only `title`, `hypothesis`, `template_key`, `status`; UPDATE only `title`, `hypothesis`, `status`. Omit `user_id`, `id`, and timestamps: database defaults set them. No browser DELETE.
- `template_key = 'custom'` allows multiple entries. Other template keys are unique per account, including `BTC_BB_LOWER_TOUCH_7D_v1`.
- Ownership and template keys cannot be changed by browser callers. Descriptive hypothesis text is not an executable or versioned strategy definition.
- `status` is `active` or `paused`. It expresses user intent, not proof that a scheduler is running.
- `wave_research_monitor_snapshots`: owner-only SELECT through the parent monitor; writes only by trusted `service_role`. A row contains `observed_at`, nullable `rolling_sharpe`, `sample_count`, `window_days`, and additional object `metrics`. Null Sharpe must remain unavailable, not be rendered as zero.
- Anonymous users have no access. Authenticated users with no valid UID see no rows and cannot insert.

## Refresh boundary

No daily scheduler, executable custom strategies, or snapshot ingestor is included here. Historical BTC evidence must not be labeled as forward/live performance. A future trusted worker must resolve the frozen versioned strategy, validate its inputs and costs, calculate metrics, then write snapshots. Browser clients cannot forge server snapshots.

## Offline verification

Install the pinned test-only dependency without changing the application's dependencies:

```sh
npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14
node scripts/research_monitor_rls_test.mjs
```

This runs the migration on embedded PostgreSQL, with local Supabase-compatible `auth.uid()` and roles. It verifies defaults, two-account isolation, duplicate template rejection, custom-entry coexistence, forbidden ownership/template/timestamp changes, own status updates, server-write/client-read snapshot boundaries, anonymous denial, and missing-UID denial. It does not test hosted PostgREST, JWT issuance, project default grants, or a deployed Supabase stack. Run normal staging integration checks before rollout.

## MVP browser behavior

The new route is `terminal_app.html#page=research-monitor`. Signed-out visitors see an account gate. Private rows are fetched with the signed-in account's token and are not persisted in browser storage. Switching accounts first clears the panel; a response from the old account is ignored. Creating a custom study saves the question only, without claiming there is a connected metric.

The optional BTC example is created only by the signed-in user, then uses the existing public research data, never another client's rows. On open or manual refresh, it checks closed UTC daily candles against the frozen Binance dataset. It displays the 90-day rolling gap against the same-date-cohort baseline, not Sharpe. Where episodes are not yet measurable it labels the all-touch alternative; overlapping touch observations are not independent. If a complete refresh fails, the explicitly dated published snapshot displays individual completed event returns instead. There is no unattended refresh or notification schedule in this MVP.

Release gates: apply the migration to a staging project, exercise two real test accounts and PostgREST, verify desktop, tablet and mobile browser flows, then apply the migration before publishing the UI. No production migration, release, or client onboarding is implied by this branch.
