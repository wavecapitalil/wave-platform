import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';

// In-memory PostgreSQL only: no connection string, listener, credentials or remote fetch.
const schema = await readFile(new URL('../../docs/DATA_ENGINE_SCHEMA.sql', import.meta.url), 'utf8');
const ingest = await readFile(new URL('../../supabase/functions/wave-snapshot-ingest/index.ts', import.meta.url), 'utf8');
assert.match(ingest, /from\("data_snapshots"\)\.upsert\(cleaned,\{onConflict:"dataset_key"\}\)/);
assert.match(ingest, /from\("data_snapshot_history"\)\.insert\(history\)/);
assert.match(ingest, /supabase-js@2\.57\.4/);
const grants = schema.match(/^grant .+ to service_role;$/gm);
assert.equal(grants?.length, 2);
const baseline = schema.replace(/^grant .+ to service_role;\n/gm, '');
const snapshot = {
  dataset_key: 'grant-test', dataset_group: 'test', data: { revision: 1 },
  source: 'fixture', fetched_at: '2026-10-20T00:00:00Z',
  calculated_at: '2026-10-20T00:00:00Z', expires_at: '2026-10-21T00:00:00Z',
  logic_version: 'test', status: 'ok', updated_at: '2026-10-20T00:00:00Z'
};
const history = Object.fromEntries(
  ['dataset_key', 'data', 'source', 'fetched_at', 'calculated_at', 'logic_version', 'status']
    .map(key => [key, snapshot[key]])
);

// Verify the pinned client emits merge-duplicates and no return=representation.
const requests = [];
const client = createClient('https://fixture.invalid', 'fixture-only', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (url, init) => {
    requests.push({ url: new URL(url), ...init });
    return new Response(null, { status: 201 });
  } }
});
await client.from('data_snapshots').upsert([snapshot], { onConflict: 'dataset_key' });
await client.from('data_snapshot_history').insert([history]);
assert.equal(requests.length, 2);
assert.equal(requests[0].url.searchParams.get('on_conflict'), 'dataset_key');
assert.match(new Headers(requests[0].headers).get('prefer'), /resolution=merge-duplicates/);
for (const request of requests) {
  assert.equal(request.method, 'POST');
  assert.doesNotMatch(new Headers(request.headers).get('prefer') ?? '', /return=representation/);
}
assert.equal('id' in JSON.parse(requests[1].body)[0], false);
console.log('PASS pinned client: conflict merge, minimal response, history id omitted');

const db = new PGlite();
try {
  console.log((await db.query('select version()')).rows[0].version);
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(baseline);
  // SQL equivalent of the two captured PostgREST mutations. RETURNING 1 models
  // minimal-response mutation CTEs without requesting any history columns.
  function mutation(table, row, upsert = false) {
    const keys = Object.keys(row);
    const columns = keys.map(k => `"${k}"`).join(',');
    const params = keys.map((_, i) => `$${i + 1}`).join(',');
    const conflict = upsert ? ` on conflict (dataset_key) do update set ${
      keys.map(k => `"${k}" = excluded."${k}"`).join(',')
    }` : '';
    return {
      sql: `with pgrst_source as (insert into public.${table} (${columns}) values (${params})${conflict} returning 1)
        select count(*) from pgrst_source`,
      params: Object.values(row).map(v => typeof v === 'object' ? JSON.stringify(v) : v)
    };
  }
  const upsert = (row = snapshot) => mutation('data_snapshots', row, true);
  const append = () => mutation('data_snapshot_history', history);
  async function run(role, { sql, params = [] }) {
    await db.exec(`set role ${role}`);
    try { return await db.query(sql, params); }
    finally { await db.exec('reset role'); }
  }
  async function denied(role, query) {
    await assert.rejects(run(role, query), e => e.code === '42501');
  }
  await denied('service_role', upsert());
  await denied('service_role', append());
  console.log('PASS before: both service writes fail with 42501');
  await db.exec(grants.join('\n'));
  await run('service_role', upsert());
  await run('service_role', upsert({ ...snapshot, data: { revision: 2 } }));
  await run('service_role', append());
  await run('service_role', append());
  assert.deepEqual((await db.query('select data from data_snapshots')).rows, [{ data: { revision: 2 } }]);
  assert.deepEqual((await db.query('select id from data_snapshot_history order by id')).rows.map(r => Number(r.id)), [1, 2]);
  console.log('PASS after: insert and conflicting update; history identity generates distinct ids');
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
    await db.exec(`revoke ${privilege} on data_snapshots from service_role`);
    await denied('service_role', upsert());
    await db.exec(`grant ${privilege} on data_snapshots to service_role`);
  }
  await db.exec('revoke insert on data_snapshot_history from service_role');
  await denied('service_role', append());
  await db.exec('grant insert on data_snapshot_history to service_role');
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await run(role, { sql: 'select * from data_snapshots' })).rows.length, 1);
    await denied(role, upsert());
    await denied(role, append());
    await denied(role, { sql: 'select * from data_snapshot_history' });
    await denied(role, { sql: "update data_snapshot_history set status = 'error'" });
    await denied(role, { sql: 'delete from data_snapshot_history' });
  }
  await denied('service_role', { sql: 'select * from data_snapshot_history' });
  await denied('service_role', { sql: "update data_snapshot_history set status = 'error'" });
  await denied('service_role', { sql: 'delete from data_snapshot_history' });
  await denied('service_role', { sql: 'delete from data_snapshots' });
  await denied('service_role', { sql: "select nextval('data_snapshot_history_id_seq')" });
  assert.equal((await db.query(`select count(*)::int as n from pg_class
    where oid in ('data_snapshots'::regclass, 'data_snapshot_history'::regclass)
    and relrowsecurity`)).rows[0].n, 2);
  console.log('PASS least privileges: each grant required; no sequence access; RLS retained');
  console.log('PASS anon/authenticated: snapshot reads allowed, writes and history access denied');
} finally {
  await db.close();
}
