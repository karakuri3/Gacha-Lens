import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const DB_AVAILABLE = Boolean(process.env.PGHOST && process.env.PGPORT && process.env.PGDATABASE && process.env.PGUSER);

const BACKFILL = new URL("../supabase/migrations/20260904152325_restore_forecast_snapshots_baseline.sql", import.meta.url);
const HARDENING = new URL("../supabase/migrations/20260904152326_final_revoke_server_only_api_grants.sql", import.meta.url);
const SCHEMA = new URL("../supabase/schema.sql", import.meta.url);

const EXPECTED_COLUMNS = [
  ["id", "uuid", "NO", "gen_random_uuid()"],
  ["variant_id", "text", "NO", null],
  ["total", "int4", "NO", null],
  ["complete", "int4", "NO", "0"],
  ["ace", "int4", "NO", "0"],
  ["compatibility", "int4", "NO", "0"],
  ["limited", "int4", "NO", "0"],
  ["preorder", "int4", "NO", "0"],
  ["x", "int4", "NO", "0"],
  ["breakdown", "jsonb", "NO", "'{}'::jsonb"],
  ["calculated_at", "timestamptz", "NO", "now()"],
];

test("forecast snapshot backfill is ordered before the hardening migration and preserves server-only access", async () => {
  assert.ok(BACKFILL.pathname < HARDENING.pathname, "backfill must sort before the hardening migration");

  const [backfill, hardening, schema] = await Promise.all([
    readFile(BACKFILL, "utf8"),
    readFile(HARDENING, "utf8"),
    readFile(SCHEMA, "utf8"),
  ]);

  assert.match(backfill, /create table if not exists public\.forecast_snapshots/i);
  assert.match(backfill, /variant_id text not null references public\.variants\(id\) on delete cascade/i);
  assert.match(backfill, /alter table public\.forecast_snapshots enable row level security/i);
  assert.match(backfill, /revoke all privileges on table public\.forecast_snapshots from anon, authenticated/i);
  assert.match(backfill, /grant select, insert, update, delete on table public\.forecast_snapshots to service_role/i);
  assert.doesNotMatch(backfill, /create policy|grant .* to anon|grant .* to authenticated/i);

  assert.match(hardening, /revoke all privileges on table public\.forecast_snapshots from anon, authenticated/i);
  assert.match(schema, /create table if not exists forecast_snapshots \(/i);
  for (const column of ["id", "variant_id", "total", "complete", "ace", "compatibility", "limited", "preorder", "x", "breakdown", "calculated_at"]) {
    assert.match(backfill, new RegExp(`\\b${column}\\b`, "i"));
  }
});

test("fresh disposable Supabase matches the Production-observed forecast_snapshots contract", { skip: !DB_AVAILABLE }, async () => {
  const client = new Client();
  await client.connect();
  try {
    const columns = await client.query(`
      select column_name, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'forecast_snapshots'
      order by ordinal_position
    `);
    assert.deepEqual(
      columns.rows.map((row) => [row.column_name, row.udt_name, row.is_nullable, row.column_default]),
      EXPECTED_COLUMNS,
    );

    const constraints = await client.query(`
      select con.conname, pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public' and rel.relname = 'forecast_snapshots'
      order by con.conname
    `);
    assert.deepEqual(constraints.rows, [
      { conname: "forecast_snapshots_pkey", definition: "PRIMARY KEY (id)" },
      { conname: "forecast_snapshots_variant_id_fkey", definition: "FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE" },
    ]);

    const rls = await client.query(`
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'forecast_snapshots'
    `);
    assert.deepEqual(rls.rows, [{ relrowsecurity: true }]);

    const exposedGrants = await client.query(`
      select grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'forecast_snapshots'
        and grantee in ('anon', 'authenticated')
      order by grantee, privilege_type
    `);
    assert.deepEqual(exposedGrants.rows, []);

    const serviceGrants = await client.query(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'forecast_snapshots'
        and grantee = 'service_role'
      order by privilege_type
    `);
    for (const privilege of ["DELETE", "INSERT", "SELECT", "UPDATE"]) {
      assert.ok(serviceGrants.rows.some((row) => row.privilege_type === privilege), `service_role missing ${privilege}`);
    }

    const migrations = await client.query(`
      select version
      from supabase_migrations.schema_migrations
      where version in ('20260904152325', '20260904152326')
      order by version
    `);
    assert.deepEqual(migrations.rows, [
      { version: "20260904152325" },
      { version: "20260904152326" },
    ]);
  } finally {
    await client.end();
  }
});
