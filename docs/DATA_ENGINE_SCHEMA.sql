-- WAVE Data Engine v1
-- Applied to Wave Crypto Analyst University Supabase project.

create table if not exists public.data_snapshots (
  dataset_key text primary key,
  dataset_group text not null,
  data jsonb not null default '{}'::jsonb,
  source text not null,
  source_timestamp timestamptz null,
  fetched_at timestamptz not null,
  calculated_at timestamptz not null,
  expires_at timestamptz not null,
  logic_version text not null,
  freshness text not null default 'snapshot',
  stale boolean not null default false,
  fallback boolean not null default false,
  status text not null default 'ok' check (status in ('ok','partial','error')),
  error text null,
  updated_at timestamptz not null default now()
);

create table if not exists public.data_snapshot_history (
  id bigint generated always as identity primary key,
  dataset_key text not null,
  data jsonb not null,
  source text not null,
  source_timestamp timestamptz null,
  fetched_at timestamptz not null,
  calculated_at timestamptz not null,
  logic_version text not null,
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

alter table public.data_snapshots enable row level security;
alter table public.data_snapshot_history enable row level security;

create policy data_snapshots_public_read on public.data_snapshots
for select to anon, authenticated using (true);

revoke all on public.data_snapshots from anon, authenticated;
grant select on public.data_snapshots to anon, authenticated;
revoke all on public.data_snapshot_history from anon, authenticated;

-- Explicit privileges for fresh provisioning without Supabase default grants.
-- Ingest upserts snapshots on dataset_key, then inserts history without returning rows.
grant select, insert, update on public.data_snapshots to service_role;
grant insert on public.data_snapshot_history to service_role;
-- The history id is GENERATED ALWAYS AS IDENTITY: inserting with id omitted
-- generates it internally and does not require a sequence grant.
