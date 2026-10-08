
create table public.wave_calculation_owners(user_id uuid primary key references auth.users(id));
create table public.wave_calculation_settings(id integer primary key check(id=1), revision integer not null default 1, formulas jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id));
insert into public.wave_calculation_settings(id) values(1);
create table public.wave_calculation_history(revision integer primary key, formulas jsonb not null, changed_at timestamptz not null default now(), changed_by uuid references auth.users(id), reason text not null);
insert into public.wave_calculation_history(revision,formulas,reason) values(1,'{}','Initial defaults');
alter table public.wave_calculation_owners enable row level security;
alter table public.wave_calculation_settings enable row level security;
alter table public.wave_calculation_history enable row level security;
revoke all on public.wave_calculation_owners,public.wave_calculation_settings,public.wave_calculation_history from public,anon,authenticated;
grant all on public.wave_calculation_owners,public.wave_calculation_settings,public.wave_calculation_history to service_role;
create function public.wave_publish_calculations(p_actor uuid,p_expected integer,p_formulas jsonb,p_reason text)
returns integer language plpgsql security invoker set search_path='' as $$
declare v integer;
begin
 if not exists(select 1 from public.wave_calculation_owners where user_id=p_actor) then raise exception 'not authorized'; end if;
 if jsonb_typeof(p_formulas)<>'object' or length(p_formulas::text)>16000 or length(trim(p_reason))<3 then raise exception 'invalid settings';end if;
 select revision into v from public.wave_calculation_settings where id=1 for update;
 if v<>p_expected then raise exception 'revision conflict';end if;
 update public.wave_calculation_settings set revision=v+1,formulas=p_formulas,updated_by=p_actor,updated_at=now() where id=1;
 insert into public.wave_calculation_history(revision,formulas,changed_by,reason) values(v+1,p_formulas,p_actor,left(p_reason,500));
 return v+1;
end $$;
revoke all on function public.wave_publish_calculations(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.wave_publish_calculations(uuid,integer,jsonb,text) to service_role;
