#!/usr/bin/env bash
set -Eeuo pipefail
set +x

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANDIDATE="$REPO_ROOT/supabase/verification/20260904_service_role_only_candidate.sql"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/gacha-supabase-hardening-isolated"
TARGETS=(
  community_reports
  forecast_snapshots
  import_issues
  ingestion_runs
  market_listing_observations
  market_listings
  outbound_clicks
  restock_events
  series
  source_weights
  stock_reports
  variants
  x_reactions
)
TARGET_LIST="'community_reports','forecast_snapshots','import_issues','ingestion_runs','market_listing_observations','market_listings','outbound_clicks','restock_events','series','source_weights','stock_reports','variants','x_reactions'"
EXCLUDED_LIST="'series_lineup','series_price_history','series_restock_info','series_stock_reports'"

log() { printf '[gacha-supabase-hardening-isolated] %s\n' "$*"; }
fail() { printf '[gacha-supabase-hardening-isolated] ERROR: %s\n' "$*" >&2; exit 1; }
psql_local() { psql -X --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

command -v psql >/dev/null 2>&1 || fail 'psql is required'
[[ -s "$CANDIDATE" ]] || fail 'isolated candidate SQL is missing'
mkdir -p "$WORK_ROOT"

# Production contains forecast_snapshots, but the canonical fresh migration chain
# intentionally defers it. Recreate only that exact Production table shape in this
# disposable database so the rehearsal covers the real Production hardening set.
# The shape below is both source-documented in supabase/schema.sql and re-verified
# read-only against Production on 2026-09-04.
if [[ "$(psql_local -qAt -c "select to_regclass('public.forecast_snapshots') is null;")" == 't' ]]; then
  psql_local -q >/dev/null <<'SQL'
create table public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references public.variants(id) on delete cascade,
  total integer not null,
  complete integer not null default 0,
  ace integer not null default 0,
  compatibility integer not null default 0,
  limited integer not null default 0,
  preorder integer not null default 0,
  x integer not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);
alter table public.forecast_snapshots enable row level security;
grant select, insert, update, delete on table public.forecast_snapshots to service_role;
SQL
  log 'recreated deferred Production forecast_snapshots shape in disposable DB only'
fi

present_count="$(psql_local -qAt -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ($TARGET_LIST);" | tr -d '[:space:]')"
[[ "$present_count" == "${#TARGETS[@]}" ]] || fail "isolated Production target set incomplete: $present_count/${#TARGETS[@]}"

# Candidate must never touch the intentionally public-policy tables.
for excluded in series_lineup series_price_history series_restock_info series_stock_reports; do
  if grep -Eq "public\.${excluded}([^a-zA-Z0-9_]|$)" "$CANDIDATE"; then
    fail "candidate unexpectedly references intentional public table: $excluded"
  fi
done

# Confirm the isolated target set matches the Production classification boundary:
# every target is RLS-enabled and intentionally has zero policies.
policy_findings="$(psql_local -qAt -c "
  select relname
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ($TARGET_LIST)
    and (not c.relrowsecurity or exists (
      select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname
    ))
  order by relname;
")"
[[ -z "$policy_findings" ]] || fail "target classification drifted; expected RLS + zero policies: $policy_findings"

excluded_before="$(psql_local -qAt -c "
  select string_agg(concat(c.relname, ':', r.rolname, ':', x.privilege_type), ',' order by c.relname, r.rolname, x.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid=x.grantee
  where n.nspname='public'
    and c.relname in ($EXCLUDED_LIST)
    and r.rolname in ('anon','authenticated','service_role');
")"

# Reproduce the exact observed Production table ACL shape only inside this disposable database.
# Read-only Production inspection on 2026-09-04 confirmed all 13 targets explicitly grant
# table ALL to anon, authenticated, and service_role.
for table in "${TARGETS[@]}"; do
  psql_local -q -c "grant all privileges on table public.\"$table\" to anon, authenticated, service_role;" >/dev/null
done

broad_count="$(psql_local -qAt -c "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ($TARGET_LIST)
    and has_table_privilege('anon', c.oid, 'SELECT')
    and has_table_privilege('authenticated', c.oid, 'SELECT')
    and has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE');
" | tr -d '[:space:]')"
[[ "$broad_count" == "${#TARGETS[@]}" ]] || fail "failed to reproduce exact Production ACL shape: $broad_count/${#TARGETS[@]}"
log 'Exact Production anon/authenticated/service_role ACL shape reproduced on all 13 isolated targets'

# With grants present but no RLS policies, anon can resolve/query the relation but sees no rows.
pre_hardening_anon="$(psql_local -qAt <<'SQL' | tail -n 1 | tr -d '[:space:]'
set role anon;
select count(*) from public.series;
SQL
)"
[[ "$pre_hardening_anon" == '0' ]] || fail "unexpected anon pre-hardening RLS result: $pre_hardening_anon"

psql_local -q -f "$CANDIDATE" >/dev/null

remaining_api_privileges="$(psql_local -qAt -c "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid=x.grantee
  where n.nspname='public'
    and c.relname in ($TARGET_LIST)
    and r.rolname in ('anon','authenticated');
" | tr -d '[:space:]')"
[[ "$remaining_api_privileges" == '0' ]] || fail "anon/authenticated privileges remain after candidate: $remaining_api_privileges"

service_contract="$(psql_local -qAt -c "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ($TARGET_LIST)
    and has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE');
" | tr -d '[:space:]')"
[[ "$service_contract" == "${#TARGETS[@]}" ]] || fail "service_role CRUD contract drifted: $service_contract/${#TARGETS[@]}"

excluded_after="$(psql_local -qAt -c "
  select string_agg(concat(c.relname, ':', r.rolname, ':', x.privilege_type), ',' order by c.relname, r.rolname, x.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid=x.grantee
  where n.nspname='public'
    and c.relname in ($EXCLUDED_LIST)
    and r.rolname in ('anon','authenticated','service_role');
")"
[[ "$excluded_before" == "$excluded_after" ]] || fail 'intentional public-policy table grants changed unexpectedly'

anon_log="$WORK_ROOT/anon-denial.log"
if psql_local >"$anon_log" 2>&1 <<'SQL'
set role anon;
select count(*) from public.series;
SQL
then
  fail 'anon unexpectedly retained direct SELECT on hardened target'
fi
grep -Eq 'permission denied for table series|permission denied' "$anon_log" || fail 'anon failed for an unexpected reason after hardening'

# Representative service-role functional smoke, fully rolled back.
psql_local -q >/dev/null <<'SQL'
begin;
set local role service_role;
insert into public.series (id, slug, name)
values ('isolated-hardening-series', 'isolated-hardening-series', 'Isolated Hardening Series');
insert into public.variants (id, slug, series_id, name)
values ('isolated-hardening-variant', 'isolated-hardening-variant', 'isolated-hardening-series', 'Isolated Hardening Variant');
update public.series set name='Isolated Hardening Series Updated' where id='isolated-hardening-series';
delete from public.variants where id='isolated-hardening-variant';
rollback;
SQL
residue="$(psql_local -qAt -c "select count(*) from public.series where id='isolated-hardening-series';" | tr -d '[:space:]')"
[[ "$residue" == '0' ]] || fail 'service-role smoke left residue after rollback'
log 'hardening contract, service-role CRUD, anon denial, exclusions, and transactional zero-residue smoke passed'

# Roll back to the exact broad table-grant shape observed in Production, then reapply.
for table in "${TARGETS[@]}"; do
  psql_local -q -c "grant all privileges on table public.\"$table\" to anon, authenticated, service_role;" >/dev/null
done
rollback_count="$(psql_local -qAt -c "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ($TARGET_LIST)
    and has_table_privilege('anon', c.oid, 'SELECT')
    and has_table_privilege('authenticated', c.oid, 'SELECT')
    and has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE');
" | tr -d '[:space:]')"
[[ "$rollback_count" == "${#TARGETS[@]}" ]] || fail 'rollback did not restore exact Production ACLs'
log 'ROLLBACK PASS: exact Production ACL shape restored on all 13 targets'

psql_local -q -f "$CANDIDATE" >/dev/null
final_remaining="$(psql_local -qAt -c "
  select count(*)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid=x.grantee
  where n.nspname='public' and c.relname in ($TARGET_LIST)
    and r.rolname in ('anon','authenticated');
" | tr -d '[:space:]')"
[[ "$final_remaining" == '0' ]] || fail 'reapply left API-role table privileges'

final_service_contract="$(psql_local -qAt -c "
  select count(*)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ($TARGET_LIST)
    and has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE');
" | tr -d '[:space:]')"
[[ "$final_service_contract" == "${#TARGETS[@]}" ]] || fail "final reapply damaged service_role CRUD: $final_service_contract/${#TARGETS[@]}"

log 'PASS: reproduce exact Production ACLs -> harden -> regression -> rollback -> reapply verified on isolated Supabase'
