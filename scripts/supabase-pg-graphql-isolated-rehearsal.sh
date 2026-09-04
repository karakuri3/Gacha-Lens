#!/usr/bin/env bash
set -Eeuo pipefail
set +x

log() { printf '[pg-graphql-isolated] %s\n' "$*"; }
fail() { printf '[pg-graphql-isolated] ERROR: %s\n' "$*" >&2; exit 1; }
psql_local() { psql -X --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

command -v psql >/dev/null 2>&1 || fail 'psql is required'

runtime_hits="$(grep -RIlE '/graphql/v1|graphql\.resolve|pg_graphql' \
  "$PWD/app" "$PWD/lib" "$PWD/components" "$PWD/scripts" \
  --exclude='supabase-pg-graphql-isolated-rehearsal.sh' 2>/dev/null || true)"
[[ -z "$runtime_hits" ]] || fail "runtime GraphQL dependency found: $runtime_hits"

pre="$(psql_local -qAt -c "select concat_ws('|', e.extversion, n.nspname, e.extrelocatable::text, (to_regnamespace('graphql') is not null)::text) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_graphql';" | tr -d '[:space:]')"
[[ -n "$pre" ]] || fail 'pg_graphql is not installed in disposable Supabase'
log "installed pg_graphql contract: $pre"

app_db_refs="$(psql_local -qAt -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and n.nspname not in ('graphql','graphql_public','extensions','pg_catalog','information_schema') and pg_get_functiondef(p.oid) ilike '%graphql.%';" | tr -d '[:space:]')"
[[ "$app_db_refs" == '0' ]] || fail "application-owned DB function references graphql.*: $app_db_refs"

# Prove a normal Postgres/Data-API privilege contract is independent from pg_graphql.
psql_local -q >/dev/null <<'SQL'
create table public.__graphql_isolated_probe (
  id integer primary key,
  value text not null
);
alter table public.__graphql_isolated_probe enable row level security;
create policy "isolated anon read" on public.__graphql_isolated_probe for select to anon using (true);
grant select on public.__graphql_isolated_probe to anon;
insert into public.__graphql_isolated_probe(id, value) values (1, 'ok');
SQL
pre_read="$(psql_local -qAt <<'SQL' | tail -n 1 | tr -d '[:space:]'
set role anon;
select value from public.__graphql_isolated_probe where id=1;
SQL
)"
[[ "$pre_read" == 'ok' ]] || fail 'pre-drop anon table contract failed'

# Forward candidate: disable unused pg_graphql. Plain DROP is intentional; if a
# dependency exists, the rehearsal must fail rather than using CASCADE.
psql_local -q -c 'drop extension pg_graphql;' >/dev/null
remaining="$(psql_local -qAt -c "select count(*) from pg_extension where extname='pg_graphql';" | tr -d '[:space:]')"
[[ "$remaining" == '0' ]] || fail 'pg_graphql remained installed after drop'
[[ "$(psql_local -qAt -c "select to_regnamespace('graphql') is null;" | tr -d '[:space:]')" == 't' ]] || fail 'graphql namespace unexpectedly remains after extension drop'

post_drop_read="$(psql_local -qAt <<'SQL' | tail -n 1 | tr -d '[:space:]'
set role anon;
select value from public.__graphql_isolated_probe where id=1;
SQL
)"
[[ "$post_drop_read" == 'ok' ]] || fail 'normal anon/RLS table access regressed after pg_graphql drop'

service_smoke="$(psql_local -qAt <<'SQL' | tail -n 1 | tr -d '[:space:]'
begin;
set local role service_role;
insert into public.series(id, slug, name) values ('isolated-graphql-series','isolated-graphql-series','Isolated GraphQL Series');
select count(*) from public.series where id='isolated-graphql-series';
rollback;
SQL
)"
[[ "$service_smoke" == '1' ]] || fail 'service-role application table path regressed after pg_graphql drop'
residue="$(psql_local -qAt -c "select count(*) from public.series where id='isolated-graphql-series';" | tr -d '[:space:]')"
[[ "$residue" == '0' ]] || fail 'service-role smoke left residue'
log 'FORWARD PASS: pg_graphql disabled while RLS/table/service-role contracts remain functional'

# Rehearse rollback without CASCADE or data changes.
psql_local -q -c 'create extension pg_graphql;' >/dev/null
restored="$(psql_local -qAt -c "select concat_ws('|', e.extversion, n.nspname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_graphql';" | tr -d '[:space:]')"
[[ -n "$restored" ]] || fail 'rollback failed to recreate pg_graphql'
log "ROLLBACK PASS: pg_graphql recreated as $restored"

# Reapply desired isolated end state.
psql_local -q -c 'drop extension pg_graphql;' >/dev/null
final_count="$(psql_local -qAt -c "select count(*) from pg_extension where extname='pg_graphql';" | tr -d '[:space:]')"
[[ "$final_count" == '0' ]] || fail 'final pg_graphql reapply failed'

# Remove only the disposable probe created by this script.
psql_local -q -c 'drop table public.__graphql_isolated_probe;' >/dev/null
log 'PASS: dependency gate -> drop -> regression -> rollback -> reapply verified on disposable Supabase'
