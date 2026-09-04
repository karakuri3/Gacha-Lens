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
EXCLUDED_PUBLIC=(
  series_lineup
  series_price_history
  series_restock_info
  series_stock_reports
)

log() { printf '[gacha-supabase-hardening-isolated] %s\n' "$*"; }
fail() { printf '[gacha-supabase-hardening-isolated] ERROR: %s\n' "$*" >&2; exit 1; }

command -v psql >/dev/null 2>&1 || fail 'psql is required'
[[ -s "$CANDIDATE" ]] || fail 'isolated candidate SQL is missing'
mkdir -p "$WORK_ROOT"

csv_targets="$(IFS=,; printf "'%s'" "${TARGETS[*]// /','}")"
# The shell join above is intentionally avoided for SQL correctness; build a literal list safely from fixed identifiers.
TARGET_LIST="'community_reports','forecast_snapshots','import_issues','ingestion_runs','market_listing_observations','market_listings','outbound_clicks','restock_events','series','source_weights','stock_reports','variants','x_reactions'"
EXCLUDED_LIST="'series_lineup','series_price_history','series_restock_info','series_stock_reports'"

# Confirm the isolated schema matches the Production classification boundary.
policy_findings="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
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

excluded_before="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
  select string_agg(concat(c.relname, ':', r.rolname, ':', x.privilege_type), ',' order by c.relname, r.rolname, x.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid=x.grantee
  where n.nspname='public'
    and c.relname in ($EXCLUDED_LIST)
    and r.rolname in ('anon','authenticated','service_role');
")"

# Reproduce the observed Production grant drift only inside this disposable database.
for table in "${TARGETS[@]}"; do
  psql -X --no-psqlrc -q -v ON_ERROR_STOP=1 -c "grant all privileges on table public.\"$table\" to anon, authenticated;" >/dev/null
done

broad_count="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ($TARGET_LIST)
    and has_table_privilege('anon', c.oid, 'SELECT')
    and has_table_privilege('authenticated', c.oid, 'SELECT');
" | tr -d '[:space:]')"
[[ "$broad_count" == "${#TARGETS[@]}" ]] || fail "failed to reproduce Production grant drift: $broad_count/${#TARGETS[@]}"
log 'Production-like anon/authenticated grant drift reproduced on isolated tables'

# With grants present but no RLS policies, anon can resolve/query the relation but sees no rows.
pre_hardening_anon="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 <<'SQL' | tail -n 1 | tr -d '[:space:]'
set role anon;
select count(*) from public.series;
SQL
)"
[[ "$pre_hardening_anon" == '0' ]] || fail "unexpected anon pre-hardening RLS result: $pre_hardening_anon"

psql -X --no-psqlrc -q -v ON_ERROR_STOP=1 -f "$CANDIDATE" >/dev/null

remaining_api_privileges="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
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

service_contract="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ($TARGET_LIST)
    and has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE');
" | tr -d '[:space:]')"
[[ "$service_contract" == "${#TARGETS[@]}" ]] || fail "service_role CRUD contract drifted: $service_contract/${#TARGETS[@]}"

excluded_after="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
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
if psql -X --no-psqlrc -v ON_ERROR_STOP=1 >"$anon_log" 2>&1 <<'SQL'
set role anon;
select count(*) from public.series;
SQL
then
  fail 'anon unexpectedly retained direct SELECT on hardened target'
fi
grep -Eq 'permission denied for table series|permission denied' "$anon_log" || fail 'anon failed for an unexpected reason after hardening'

# Representative service-role functional smoke, fully rolled back.
psql -X --no-psqlrc -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
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
residue="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.series where id='isolated-hardening-series';" | tr -d '[:space:]')"
[[ "$residue" == '0' ]] || fail 'service-role smoke left residue after rollback'
log 'target revokes, intentional-public exclusions, service-role CRUD, anon denial, and rollback smoke passed'

# Roll back to the exact broad table-grant shape observed in Production, then reapply.
for table in "${TARGETS[@]}"; do
  psql -X --no-psqlrc -q -v ON_ERROR_STOP=1 -c "grant all privileges on table public.\"$table\" to anon, authenticated;" >/dev/null
done
rollback_count="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ($TARGET_LIST)
    and has_table_privilege('anon', c.oid, 'SELECT')
    and has_table_privilege('authenticated', c.oid, 'SELECT');
" | tr -d '[:space:]')"
[[ "$rollback_count" == "${#TARGETS[@]}" ]] || fail 'rollback did not restore Production-like grants'
log 'rollback to Production-like grant shape passed'

psql -X --no-psqlrc -q -v ON_ERROR_STOP=1 -f "$CANDIDATE" >/dev/null
final_remaining="$(psql -X --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "
  select count(*)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid=x.grantee
  where n.nspname='public' and c.relname in ($TARGET_LIST)
    and r.rolname in ('anon','authenticated');
" | tr -d '[:space:]')"
[[ "$final_remaining" == '0' ]] || fail 'reapply left API-role table privileges'

log 'PASS: reproduce Production drift -> harden -> regression -> rollback -> reapply verified on isolated Supabase'
