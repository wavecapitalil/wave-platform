-- Account-private research. This does not alter the public editorial research feed.
-- No scheduler is provisioned here: only trusted server jobs may publish observations.
create table public.wave_research_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  hypothesis text not null default '' check (length(hypothesis) <= 4000),
  template_key text not null default 'custom' check (length(template_key) between 1 and 100),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wave_research_monitors_owner_idx on public.wave_research_monitors(user_id, created_at desc);
create unique index wave_research_monitors_template_idx on public.wave_research_monitors(user_id, template_key) where template_key <> 'custom';

create table public.wave_research_monitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.wave_research_monitors(id) on delete cascade,
  observed_at timestamptz not null,
  rolling_sharpe double precision check (rolling_sharpe > '-Infinity'::double precision and rolling_sharpe < 'Infinity'::double precision),
  sample_count integer not null check (sample_count >= 0),
  window_days integer not null check (window_days > 0),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now(),
  unique (monitor_id, observed_at, window_days)
);

alter table public.wave_research_monitors enable row level security;
alter table public.wave_research_monitor_snapshots enable row level security;
revoke all on public.wave_research_monitors, public.wave_research_monitor_snapshots from public, anon, authenticated;
grant select on public.wave_research_monitors, public.wave_research_monitor_snapshots to authenticated;
-- The browser cannot provide identity, timestamps, or alter a frozen template.
grant insert (title, hypothesis, template_key, status) on public.wave_research_monitors to authenticated;
grant update (title, hypothesis, status) on public.wave_research_monitors to authenticated;
grant all on public.wave_research_monitors, public.wave_research_monitor_snapshots to service_role;

create policy research_monitors_select_own on public.wave_research_monitors for select to authenticated using ((select auth.uid()) = user_id);
create policy research_monitors_insert_own on public.wave_research_monitors for insert to authenticated with check ((select auth.uid()) = user_id);
create policy research_monitors_update_own on public.wave_research_monitors for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy research_snapshots_select_own on public.wave_research_monitor_snapshots for select to authenticated using (
  exists (select 1 from public.wave_research_monitors m where m.id = monitor_id and m.user_id = (select auth.uid()))
);

create function public.wave_research_monitor_touch() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.wave_research_monitor_touch() from public, anon, authenticated;
create trigger wave_research_monitor_touch before update on public.wave_research_monitors for each row execute function public.wave_research_monitor_touch();
