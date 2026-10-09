-- DESIGN REVIEW ONLY. Not in supabase/migrations; never applied by phase 1.
-- No policies, browser grants, RPCs, credentials, or exposed-schema changes.
-- A future approved migration must verify current ownership/API settings first.
-- ROLLBACK intentionally prevents accidentally committing this design sketch.
BEGIN;
CREATE SCHEMA IF NOT EXISTS wave_process_private;
CREATE TABLE wave_process_private.runs (
  id text PRIMARY KEY,
  process_id text NOT NULL,
  process_version text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wave_process_private.events (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES wave_process_private.runs(id),
  step_id text NOT NULL,
  stage text NOT NULL,
  event jsonb NOT NULL,
  UNIQUE (run_id, step_id, stage)
);
ALTER TABLE wave_process_private.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wave_process_private.runs FORCE ROW LEVEL SECURITY;
ALTER TABLE wave_process_private.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wave_process_private.events FORCE ROW LEVEL SECURITY;
-- Future ingestion: one atomic transaction; insert immutable run + events.
-- Same ID + same canonical digest: idempotent acknowledgement.
-- Same ID + different digest: conflict, never overwrite prior evidence.
-- New workflow attempt: new run ID. No retroactive event timestamps.
-- No browser role receives access; read through the existing owner check only.
-- Do not use public data_snapshots for telemetry or private source material.
ROLLBACK;
