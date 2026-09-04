#!/usr/bin/env bash
set -Eeuo pipefail
set +x

log() { printf '[market-series-index-isolated] %s\n' "$*"; }
fail() { printf '[market-series-index-isolated] ERROR: %s\n' "$*" >&2; exit 1; }
psql_local() { psql -X --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

command -v psql >/dev/null 2>&1 || fail 'psql is required'

existing="$(psql_local -qAt -c "select count(*) from pg_indexes where schemaname='public' and tablename='market_listings' and indexname='market_listings_series_id_idx';" | tr -d '[:space:]')"
[[ "$existing" == '0' ]] || fail 'market_listings_series_id_idx already exists; rehearsal baseline changed'

# Synthetic scale only. No Production rows or credentials are copied into this DB.
psql_local -q >/dev/null <<'SQL'
insert into public.series(id, slug, name)
select 'idx-series-' || g::text, 'idx-series-' || g::text, 'Index Series ' || g::text
from generate_series(1, 200) g;

insert into public.market_listings(id, series_id, title, status, source)
select
  'idx-listing-' || g::text,
  'idx-series-' || (((g - 1) % 200) + 1)::text,
  'Synthetic listing ' || g::text,
  'active',
  'isolated'
from generate_series(1, 100000) g;

analyze public.market_listings;
SQL

rows="$(psql_local -qAt -c "select count(*) from public.market_listings;" | tr -d '[:space:]')"
[[ "$rows" == '100000' ]] || fail "synthetic fixture row count drifted: $rows"

before_plan="$(mktemp)"
after_plan="$(mktemp)"
trap 'rm -f "$before_plan" "$after_plan"' EXIT

psql_local -qAt -c "explain (format json) select id, series_id, title from public.market_listings where series_id = any(array['idx-series-7','idx-series-19']) limit 100;" > "$before_plan"
node - "$before_plan" <<'NODE'
const fs = require('fs');
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = doc[0]?.Plan;
if (!root) throw new Error('missing pre-index plan');
let nodes = [];
(function walk(n){ nodes.push(n); for (const c of n.Plans ?? []) walk(c); })(root);
if (nodes.some((n) => String(n['Index Name'] ?? '').includes('market_listings_series_id_idx'))) throw new Error('pre-index plan unexpectedly references candidate index');
console.log('[market-series-index-isolated] PRE PLAN:', nodes.map((n) => n['Node Type']).join(' -> '));
NODE

# Candidate applies only to this disposable local database.
psql_local -q -c 'create index market_listings_series_id_idx on public.market_listings(series_id);' >/dev/null
psql_local -q -c 'analyze public.market_listings;' >/dev/null
contract="$(psql_local -qAt -c "select indexdef from pg_indexes where schemaname='public' and tablename='market_listings' and indexname='market_listings_series_id_idx';" | tr -s '[:space:]' ' ')"
[[ "$contract" == *'USING btree (series_id)'* ]] || fail "candidate index contract unexpected: $contract"

psql_local -qAt -c "explain (format json) select id, series_id, title from public.market_listings where series_id = any(array['idx-series-7','idx-series-19']) limit 100;" > "$after_plan"
node - "$after_plan" <<'NODE'
const fs = require('fs');
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = doc[0]?.Plan;
if (!root) throw new Error('missing post-index plan');
let nodes = [];
(function walk(n){ nodes.push(n); for (const c of n.Plans ?? []) walk(c); })(root);
const candidate = nodes.find((n) => n['Index Name'] === 'market_listings_series_id_idx');
if (!candidate) throw new Error(`planner did not select market_listings_series_id_idx; nodes=${nodes.map((n) => n['Node Type']).join(' -> ')}`);
console.log('[market-series-index-isolated] POST PLAN:', nodes.map((n) => `${n['Node Type']}${n['Index Name'] ? `(${n['Index Name']})` : ''}`).join(' -> '));
NODE

# Prove FK ON DELETE SET NULL remains correct and rolls back cleanly.
psql_local -q >/dev/null <<'SQL'
begin;
delete from public.series where id='idx-series-7';
do $block$
declare v_nulls integer;
begin
  select count(*) into v_nulls from public.market_listings where id like 'idx-listing-%' and series_id is null;
  if v_nulls <> 500 then raise exception 'unexpected ON DELETE SET NULL count: %', v_nulls; end if;
end
$block$;
rollback;
SQL
nulls_after="$(psql_local -qAt -c "select count(*) from public.market_listings where series_id is null;" | tr -d '[:space:]')"
[[ "$nulls_after" == '0' ]] || fail 'rollback left FK-maintenance residue'

# Prove rollback/reapply of the candidate itself.
psql_local -q -c 'drop index public.market_listings_series_id_idx;' >/dev/null
[[ "$(psql_local -qAt -c "select count(*) from pg_indexes where schemaname='public' and indexname='market_listings_series_id_idx';" | tr -d '[:space:]')" == '0' ]] || fail 'index rollback failed'
log 'ROLLBACK PASS: candidate index removed cleanly'

psql_local -q -c 'create index market_listings_series_id_idx on public.market_listings(series_id);' >/dev/null
[[ "$(psql_local -qAt -c "select count(*) from pg_indexes where schemaname='public' and indexname='market_listings_series_id_idx';" | tr -d '[:space:]')" == '1' ]] || fail 'candidate index reapply failed'

log 'PASS: synthetic scale -> planner selection -> FK maintenance rollback -> index rollback/reapply verified'
