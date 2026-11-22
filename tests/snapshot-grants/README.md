# Snapshot provisioning grant regression

Run with Node.js 22 or newer:

```sh
npm ci --prefix tests/snapshot-grants
npm test --prefix tests/snapshot-grants
```

The pinned PGlite dependency runs PostgreSQL 17.5 in memory. The test creates
disposable `anon`, `authenticated`, and `service_role` roles with no automatic
table or sequence grants. It loads `docs/DATA_ENGINE_SCHEMA.sql` with the two
service grants removed, demonstrates both writes failing with SQLSTATE 42501,
then applies those exact grants and verifies:

- Snapshot insertion and conflict update succeed; removing any of SELECT,
  INSERT, or UPDATE makes the upsert fail.
- History INSERT succeeds with generated, distinct identity IDs, without
  sequence privileges. Direct sequence access remains denied.
- Both public roles can read snapshots, but cannot write snapshots or read,
  insert, update, or delete history.
- Service-role history reads, updates, and deletes, and snapshot deletes,
  remain denied in this fresh-provisioning fixture.
- RLS remains enabled on both tables.

The same supabase-js version as the ingest function (2.57.4) is exercised with a
stub fetch to check merge-duplicate upsert semantics, the conflict key, history
ID omission, and absence of `return=representation`. SQL equivalents exercise
PostgreSQL permission enforcement, including minimal-response mutation CTEs.

This is not an end-to-end hosted Supabase/PostgREST or Edge Function test: it
does not validate JWT handling, schema-cache refresh, or deployed configuration.
It never connects to a database server or makes HTTP requests during the test.
Package installation requires npm access. The in-memory database is closed at
the end, including on failure.

## Scope and rationale

The fix is in the existing fresh-provisioning schema, not a live migration.
Supabase's [default-grant change](https://github.com/orgs/supabase/discussions/45329)
affects future objects; existing objects retain their grants. These additive
statements do not revoke broader service-role permissions on existing objects.
The existing schema's policy creation is not idempotent, so this change does not
recommend rerunning the whole schema against an existing database.

PostgreSQL [INSERT documentation](https://www.postgresql.org/docs/17/sql-insert.html)
describes the SELECT requirements for columns read by ON CONFLICT DO UPDATE.
History is append-only in the current ingest path and requests no returned
columns, so it does not need SELECT. Its GENERATED ALWAYS AS IDENTITY column
generates values internally when omitted; no blanket sequence grant is added.

Validated against main commit `e7a23babcb1e4a02608f42270d0eb7f230f9e191`.
