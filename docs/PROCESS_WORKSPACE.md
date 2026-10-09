# Process workspace, bounded phase 1

The existing private owner workspace now has a responsive sidebar for Morning Brief, the complete current terminal page list, Data Engine, Full Validation, and Presentations. This is an expansion of the current owner admin, not a second identity system.

## What actually works

- Existing Company Research 14-formula editing retains server preview, reason, revision lock and publication. No formula semantics or grants changed. A legacy backend or failed process-registry read falls back to the existing formula editor. A 401/403 invalidates the whole pending load and remains fail-closed; optional process reads have an eight-second timeout.
- Each process has human-readable source/flow definitions and code references. General process rules can be edited, compared, saved as versioned **in-memory tab drafts**, restored and exported. They are **not consumed by a runtime**. Reload/logout discards them. The UI never calls draft text a deployed configuration.
- Owner-authorized GET `api/admin/calculations?view=processes` returns code definitions and an explicit disconnected run store. Unauthorized/revoked/non-owner access is rejected by the same check as existing formulas; responses are no-store.
- A local manifest file can be inspected without upload or persistent browser storage. The file is not server-attested. Imports are bounded and structurally checked, read as text, and never executed. A clearly marked synthetic example demonstrates stale maps, cutoff gaps and missing selection reasons. No private source artifact is in fixtures.
- The owned runner emits `artifacts/process_manifest.json` and an fsync'd append-only `process_manifest.jsonl` journal. GitHub Actions uploads these sanitized files with `if: always()` and **7-day retention**, including when every collector fails. This is bounded artifact persistence, not an indefinite queryable database history.

## Measurement boundaries

The versioned `wave.process-run/1` contract records an observed run/attempt/commit; ordered stages; fresh skips; collector errors (class only); partial outcomes; source timestamps as collector-reported; output hashes; transformation versions; and explicit input/output links. The JSONL event identity is stable for `(run ID, step, stage)`; duplicate delivery must be deduplicated. Each GitHub retry attempt has a separate run ID. Importing a run twice replaces only the in-memory display.

The observed fetch window begins at actual collector dispatch and ends when that collector returns. `fetched_at` no longer uses the shared queue/run start. These are **collector-boundary timings**, not individual upstream HTTP timings. Yfinance, nested Flask calls and internal caches are not fully instrumented: cache is explicitly `unknown`; source document date, metric-level units and period may be `not_recorded`. A wrapper timestamp is never asserted to be the original publication time. Aggregate payload hashes do not imply metric-by-metric trace completeness.

Telemetry is fail-open at the runner boundary: initialization, journal or save failures emit only a sanitized exception-class warning and never discard or rerun an already-successful collector. Recoverable manifest writes mark `telemetry_status: incomplete`; when no manifest can be written, the warning and missing artifact are the explicit limit. A manifest output means **collected**, not published. Publication remains `not_attempted` in these pre-publication manifests. Existing snapshot publishing, last-good behavior, provider fallbacks and schedules are unchanged. No new telemetry is sent to the existing public snapshot ingestion endpoint. A publication acknowledgement adapter and transaction-aware private ingestion are future work.

## Provenance gates

Schema-valid is not verified. The inspector checks run/output identity, transformation inputs, output digests, collection timing, cutoff coverage, sources after cutoff, missing source dates, and inherited manifest dates. A dated source can be appropriate for a historical period; `dated_source_review` is a review flag, not a claim the value is wrong. An inherited map is not cleared merely by relabeling it. Exact artifact/claim/chart evidence must be recorded by the producing process. Missing editorial decisions remain `not_recorded`; no historical omission reason is invented.

Morning Brief's external research generator and presentation producer are **not connected**. Brief publication is a distinct process from generation, and currently accepts an already-final artifact. No generator scheduler or new editorial rewrite is introduced. Full Validation currently maps existing workflows; it is not a remote job-launch button.

## Future private ingestion gate

`process-ingestion-contract.ts` prepares validated records for a verified GitHub producer identity. It performs no writes and exposes no endpoint. `PROCESS_OBSERVABILITY_SCHEMA.sql` is a rollback-only review sketch outside migrations, with private-schema RLS and no grants/policies. The deployment/database state, exposed schemas and owner role remain unverified live. Before enabling a store, review explicit approval for the schema, authenticated producer binding, exact owner read API, transaction/idempotency behavior, retention and access tests. Do not create credentials or expand permissions as part of this PR. Do not import Drive/mailbox/presentation private data without approval for the exact data and destination.

Future ingestion must commit run + events atomically; repeated ID + same canonical digest is an acknowledgement; repeated ID + a different digest is a conflict. Never overwrite an immutable run to hide a retry. Bind producer ID, attempt and commit to verified identity, not request JSON. External producers need their own explicitly authorized contract and boundary. No retrospective invented history.

## Verification

Python: `cd services/api/data_engine && python -m unittest -v test_process_manifest.py`.
Node: `node --test scripts/process-workspace.test.mjs scripts/calculation-access-link.test.mjs scripts/calculations.test.mjs`.
Browser: `python scripts/process_workspace_browser_qa.py` (local fixture server; no credentials or live actions).
Regenerate the private code catalogue after changes: `python scripts/build-calculation-catalog.py`.
The browser contract copy must exactly match `supabase/functions/wave-data/process-contract.js`.
