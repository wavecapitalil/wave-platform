-- WAVE provider caches for end-user data reliability.
-- Applied in production on 2026-10-03.

create extension if not exists http;
create extension if not exists pg_cron;

create table if not exists public.sec_ticker_map (
  ticker text primary key,
  cik text not null,
  company_name text,
  updated_at timestamptz not null default now()
);
alter table public.sec_ticker_map enable row level security;
drop policy if exists sec_ticker_map_public_read on public.sec_ticker_map;
create policy sec_ticker_map_public_read on public.sec_ticker_map
for select to anon, authenticated using (true);
revoke all on public.sec_ticker_map from anon, authenticated;
grant select on public.sec_ticker_map to anon, authenticated;

with src as (
  select content::jsonb as doc
  from extensions.http_get('https://www.sec.gov/files/company_tickers.json')
),
rows as (
  select
    upper(value->>'ticker') as ticker,
    lpad(value->>'cik_str',10,'0') as cik,
    value->>'title' as company_name
  from src, lateral jsonb_each(src.doc)
)
insert into public.sec_ticker_map(ticker,cik,company_name,updated_at)
select ticker,cik,company_name,now()
from rows
where ticker is not null and ticker <> ''
on conflict (ticker) do update
set cik=excluded.cik,company_name=excluded.company_name,updated_at=excluded.updated_at;

create table if not exists public.sec_companyfacts_cache (
  ticker text primary key,
  cik text not null,
  company_name text,
  document jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.sec_companyfacts_cache enable row level security;
revoke all on public.sec_companyfacts_cache from anon, authenticated;

create table if not exists public.crypto_positioning_cache (
  pair text not null,
  period text not null,
  data jsonb not null default '{}'::jsonb,
  source text not null default 'Binance public USD-M futures market-data API',
  fetched_at timestamptz not null default now(),
  status text not null default 'ok' check (status in ('ok','partial','error')),
  error text,
  primary key(pair,period)
);
alter table public.crypto_positioning_cache enable row level security;
drop policy if exists crypto_positioning_public_read on public.crypto_positioning_cache;
create policy crypto_positioning_public_read on public.crypto_positioning_cache
for select to anon, authenticated using (true);
revoke all on public.crypto_positioning_cache from anon, authenticated;
grant select on public.crypto_positioning_cache to anon, authenticated;

create or replace function public.wave_get_companyfacts(p_ticker text,p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_ticker text:=upper(trim(p_ticker));
  v_cik text; v_name text; v_doc jsonb;
  v_fetched timestamptz; v_expires timestamptz;
  v_status integer; v_content text;
begin
  if v_ticker is null or v_ticker='' then raise exception 'ticker required'; end if;
  select cik,company_name into v_cik,v_name from public.sec_ticker_map where ticker=v_ticker;
  if v_cik is null then raise exception 'ticker not found in SEC map: %',v_ticker; end if;

  select document,fetched_at,expires_at into v_doc,v_fetched,v_expires
  from public.sec_companyfacts_cache where ticker=v_ticker;

  if not p_force and v_doc is not null and v_expires>now() then
    return jsonb_build_object('ticker',v_ticker,'cik',v_cik,'company_name',coalesce(v_name,v_ticker),
      'document',v_doc,'fetched_at',v_fetched,'cached',true);
  end if;

  select status,content into v_status,v_content
  from extensions.http_get('https://data.sec.gov/api/xbrl/companyfacts/CIK'||lpad(v_cik,10,'0')||'.json');

  if v_status<>200 then
    if v_doc is not null then
      return jsonb_build_object('ticker',v_ticker,'cik',v_cik,'company_name',coalesce(v_name,v_ticker),
        'document',v_doc,'fetched_at',v_fetched,'cached',true,'stale_fallback',true,'provider_status',v_status);
    end if;
    raise exception 'SEC companyfacts HTTP %',v_status;
  end if;

  v_doc:=v_content::jsonb;
  insert into public.sec_companyfacts_cache(ticker,cik,company_name,document,fetched_at,expires_at,updated_at)
  values(v_ticker,lpad(v_cik,10,'0'),coalesce(v_doc->>'entityName',v_name,v_ticker),
    v_doc,now(),now()+interval '24 hours',now())
  on conflict(ticker) do update
  set cik=excluded.cik,company_name=excluded.company_name,document=excluded.document,
      fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at;

  return jsonb_build_object('ticker',v_ticker,'cik',lpad(v_cik,10,'0'),
    'company_name',coalesce(v_doc->>'entityName',v_name,v_ticker),
    'document',v_doc,'fetched_at',now(),'cached',false);
end;
$$;

create or replace function public.wave_refresh_crypto_positioning()
returns integer
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_pair text; v_symbol text; v_period text;
  v_status integer; v_content text;
  v_global jsonb; v_top_accounts jsonb; v_top_positions jsonb;
  v_count integer:=0; v_error text;
begin
  foreach v_pair in array array['BTCUSD','ETHUSD'] loop
    v_symbol:=case when v_pair='BTCUSD' then 'BTCUSDT' else 'ETHUSDT' end;
    foreach v_period in array array['1h','4h','1d'] loop
      begin
        select status,content into v_status,v_content from extensions.http_get(
          'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol='||v_symbol||'&period='||v_period||'&limit=30');
        if v_status<>200 then raise exception 'global HTTP %',v_status; end if;
        select coalesce(jsonb_agg(jsonb_build_object(
          'timestamp',(x->>'timestamp')::bigint,'long_pct',round((x->>'longAccount')::numeric*100,3),
          'short_pct',round((x->>'shortAccount')::numeric*100,3),'long_short_ratio',(x->>'longShortRatio')::numeric)
          order by (x->>'timestamp')::bigint),'[]'::jsonb)
        into v_global from jsonb_array_elements(v_content::jsonb)x;

        select status,content into v_status,v_content from extensions.http_get(
          'https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol='||v_symbol||'&period='||v_period||'&limit=30');
        if v_status<>200 then raise exception 'top accounts HTTP %',v_status; end if;
        select coalesce(jsonb_agg(jsonb_build_object(
          'timestamp',(x->>'timestamp')::bigint,'long_pct',round((x->>'longAccount')::numeric*100,3),
          'short_pct',round((x->>'shortAccount')::numeric*100,3),'long_short_ratio',(x->>'longShortRatio')::numeric)
          order by (x->>'timestamp')::bigint),'[]'::jsonb)
        into v_top_accounts from jsonb_array_elements(v_content::jsonb)x;

        select status,content into v_status,v_content from extensions.http_get(
          'https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol='||v_symbol||'&period='||v_period||'&limit=30');
        if v_status<>200 then raise exception 'top positions HTTP %',v_status; end if;
        select coalesce(jsonb_agg(jsonb_build_object(
          'timestamp',(x->>'timestamp')::bigint,'long_pct',round((x->>'longAccount')::numeric*100,3),
          'short_pct',round((x->>'shortAccount')::numeric*100,3),'long_short_ratio',(x->>'longShortRatio')::numeric)
          order by (x->>'timestamp')::bigint),'[]'::jsonb)
        into v_top_positions from jsonb_array_elements(v_content::jsonb)x;

        insert into public.crypto_positioning_cache(pair,period,data,source,fetched_at,status,error)
        values(v_pair,v_period,jsonb_build_object(
          'asset_class','crypto','venue','Binance USD-M Futures','pair',v_pair,'provider_symbol',v_symbol,
          'period',v_period,'series',jsonb_build_object(
            'global_accounts',v_global,'top_accounts',v_top_accounts,'top_positions',v_top_positions),
          'errors','{}'::jsonb),
          'Binance public USD-M futures market-data API',now(),'ok',null)
        on conflict(pair,period) do update
        set data=excluded.data,source=excluded.source,fetched_at=excluded.fetched_at,status='ok',error=null;
        v_count:=v_count+1;
      exception when others then
        v_error:=sqlerrm;
        insert into public.crypto_positioning_cache(pair,period,data,source,fetched_at,status,error)
        values(v_pair,v_period,'{}'::jsonb,'Binance public USD-M futures market-data API',now(),'error',v_error)
        on conflict(pair,period) do update
        set fetched_at=excluded.fetched_at,status='error',error=v_error;
      end;
    end loop;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.wave_refresh_crypto_positioning() from public,anon,authenticated;
revoke all on function public.wave_get_companyfacts(text,boolean) from public,anon,authenticated;
grant execute on function public.wave_refresh_crypto_positioning() to service_role;
grant execute on function public.wave_get_companyfacts(text,boolean) to service_role;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='wave-crypto-positioning-hourly' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select cron.schedule('wave-crypto-positioning-hourly','12 * * * *','select public.wave_refresh_crypto_positioning();');
