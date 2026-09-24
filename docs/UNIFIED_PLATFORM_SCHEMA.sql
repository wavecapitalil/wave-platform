-- WAVE unified platform cloud state
-- Applied to Supabase project: Wave Crypto Analyst University
-- Date: 2026-09-24
-- Existing profiles and student_progress tables are intentionally reused and unchanged.

create table if not exists public.watchlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 160),
  title text not null default '',
  item_type text not null default 'research',
  href text not null default '',
  saved_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 20),
  condition text not null check (char_length(condition) between 1 and 160),
  enabled boolean not null default true,
  mode text not null default 'saved_rule' check (mode in ('saved_rule','cloud_watch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.watchlist_items enable row level security;
alter table public.saved_items enable row level security;
alter table public.alert_rules enable row level security;

create policy watchlist_select_own on public.watchlist_items for select to authenticated using ((select auth.uid()) = user_id);
create policy watchlist_insert_own on public.watchlist_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy watchlist_delete_own on public.watchlist_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy saved_select_own on public.saved_items for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_insert_own on public.saved_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saved_update_own on public.saved_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_delete_own on public.saved_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy alerts_select_own on public.alert_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy alerts_insert_own on public.alert_rules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy alerts_update_own on public.alert_rules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy alerts_delete_own on public.alert_rules for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.watchlist_items from anon;
revoke all on public.saved_items from anon;
revoke all on public.alert_rules from anon;
grant select, insert, delete on public.watchlist_items to authenticated;
grant select, insert, update, delete on public.saved_items to authenticated;
grant select, insert, update, delete on public.alert_rules to authenticated;
