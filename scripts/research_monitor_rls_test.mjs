/** Offline real-Postgres RLS tests. Install test dependency with:
 * npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14
 * node scripts/research_monitor_rls_test.mjs
 * No Supabase credentials or network database are used.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let checks = 0;
const rows = async (q) => (await db.query(q)).rows;
async function denied(sql, code='42501') {
  await assert.rejects(db.query(sql), e => e.code === code, sql); checks++;
}
async function asUser(id) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
}
try {
  // Minimal local Auth contract; production auth.uid() is supplied by Supabase.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    insert into auth.users values ('${A}'), ('${B}');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261116124531_research_monitor.sql', import.meta.url), 'utf8'));
  await asUser(A);
  const [a] = await rows(`insert into public.wave_research_monitors(title,template_key) values ('BTC A','BTC_BB_LOWER_TOUCH_7D_v1') returning *`);
  assert.equal(a.user_id,A); checks++;
  await denied(`insert into public.wave_research_monitors(title,template_key) values ('Duplicate','BTC_BB_LOWER_TOUCH_7D_v1')`, '23505');
  await db.exec(`insert into public.wave_research_monitors(title) values ('Custom A1'), ('Custom A2')`);
  await denied(`insert into public.wave_research_monitors(title,user_id) values ('Spoof','${B}')`);
  await denied(`update public.wave_research_monitors set user_id='${B}' where id='${a.id}'`);
  await denied(`update public.wave_research_monitors set template_key='rewritten' where id='${a.id}'`);
  await denied(`update public.wave_research_monitors set created_at=now()`);
  await db.exec(`update public.wave_research_monitors set status='paused', title='Renamed' where id='${a.id}'`);
  assert.equal((await rows(`select status from public.wave_research_monitors where id='${a.id}'`))[0].status,'paused'); checks++;
  await asUser(B);
  assert.equal((await rows(`select * from public.wave_research_monitors`)).length,0); checks++;
  assert.equal((await db.query(`update public.wave_research_monitors set title='attack' where id='${a.id}'`)).affectedRows,0); checks++;
  await db.exec(`insert into public.wave_research_monitors(title,template_key) values ('BTC B','BTC_BB_LOWER_TOUCH_7D_v1')`);
  await denied(`delete from public.wave_research_monitors where id='${a.id}'`);
  await db.exec(`reset role; set role service_role;
    insert into public.wave_research_monitor_snapshots(monitor_id,observed_at,rolling_sharpe,sample_count,window_days) values ('${a.id}',now(),null,0,30)`);
  await asUser(B);
  assert.equal((await rows(`select * from public.wave_research_monitor_snapshots`)).length,0); checks++;
  await asUser(A);
  assert.equal((await rows(`select * from public.wave_research_monitor_snapshots`)).length,1); checks++;
  await denied(`insert into public.wave_research_monitor_snapshots(monitor_id,observed_at,sample_count,window_days) values ('${a.id}',now(),2,7)`);
  await denied(`update public.wave_research_monitor_snapshots set rolling_sharpe=20`);
  await denied(`delete from public.wave_research_monitor_snapshots`);
  await denied(`delete from public.wave_research_monitors where id='${a.id}'`);
  await asUser('');
  assert.equal((await rows(`select * from public.wave_research_monitors`)).length,0); checks++;
  await denied(`insert into public.wave_research_monitors(title) values ('No uid')`);
  await db.exec(`reset role; set role anon`);
  await denied(`select * from public.wave_research_monitors`);
  await denied(`select * from public.wave_research_monitor_snapshots`);
  await denied(`insert into public.wave_research_monitors(title) values ('Anonymous')`);
  console.log(`Research Monitor PostgreSQL ownership checks passed (${checks})`);
} finally { await db.close(); }
