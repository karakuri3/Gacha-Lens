#!/usr/bin/env bash
set -Eeuo pipefail
set +x

log() { printf '[pg-net-isolated] %s\n' "$*"; }
fail() { printf '[pg-net-isolated] ERROR: %s\n' "$*" >&2; exit 1; }
psql_local() { psql -X --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

command -v psql >/dev/null 2>&1 || fail 'psql is required'

available="$(psql_local -qAt -c "select count(*) from pg_available_extensions where name='pg_net';" | tr -d '[:space:]')"
[[ "$available" == '1' ]] || fail 'pg_net is not available in disposable Supabase'

# Reproduce the Production extension-placement warning locally. No app data is
# copied and no Production credentials are present.
psql_local -q >/dev/null <<'SQL'
drop extension if exists pg_net;
drop schema if exists net cascade;
create extension pg_net schema public;
SQL

pre_contract="$(psql_local -qAt -c "select concat_ws('|', n.nspname, e.extversion, e.extrelocatable::text, to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is not null, to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_net';" | tr -d '[:space:]')"
[[ "$pre_contract" == public\|*\|false\|true\|true ]] || fail "failed to reproduce Production-like pg_net placement: $pre_contract"

queue_before="$(psql_local -qAt -c "select count(*) from net.http_request_queue;" | tr -d '[:space:]')"
[[ "$queue_before" == '0' ]] || fail 'disposable pg_net queue unexpectedly non-empty before rehearsal'
log "Production-like placement reproduced locally: $pre_contract"

# Rehearse the Supabase-documented non-relocatable recovery path transactionally:
# drop extension + net schema, recreate pg_net with the extensions namespace.
psql_local -q >/dev/null <<'SQL'
begin;
drop extension pg_net;
drop schema if exists net cascade;
create extension pg_net schema extensions;
do $block$
declare
  v_schema text;
  v_relocatable boolean;
begin
  select n.nspname, e.extrelocatable
  into v_schema, v_relocatable
  from pg_extension e
  join pg_namespace n on n.oid=e.extnamespace
  where e.extname='pg_net';

  if v_schema <> 'extensions' or v_relocatable then
    raise exception 'unexpected relocated pg_net catalog contract: schema=%, relocatable=%', v_schema, v_relocatable;
  end if;

  if to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'pg_net HTTP functions missing after relocation rehearsal';
  end if;
end
$block$;
rollback;
SQL

rollback_contract="$(psql_local -qAt -c "select concat_ws('|', n.nspname, e.extversion, e.extrelocatable::text, to_regnamespace('net') is not null) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_net';" | tr -d '[:space:]')"
[[ "$rollback_contract" == public\|*\|false\|true ]] || fail "transaction rollback did not restore Production-like placement: $rollback_contract"
log 'ROLLBACK PASS: transactional rehearsal restored original public placement'

# Reapply the candidate in the disposable database and commit it, then verify
# extension catalog, required net functions, queue state, and zero app dependency.
psql_local -q >/dev/null <<'SQL'
begin;
drop extension pg_net;
drop schema if exists net cascade;
create extension pg_net schema extensions;
commit;
SQL

post_contract="$(psql_local -qAt -c "select concat_ws('|', n.nspname, e.extversion, e.extrelocatable::text, to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is not null, to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_net';" | tr -d '[:space:]')"
[[ "$post_contract" == extensions\|*\|false\|true\|true ]] || fail "reapply contract failed: $post_contract"

queue_after="$(psql_local -qAt -c "select count(*) from net.http_request_queue;" | tr -d '[:space:]')"
[[ "$queue_after" == '0' ]] || fail 'relocation rehearsal unexpectedly queued HTTP requests'

app_deps="$(psql_local -qAt -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and n.nspname not in ('net','extensions','pg_catalog','information_schema') and pg_get_functiondef(p.oid) ilike '%net.%';" | tr -d '[:space:]')"
[[ "$app_deps" == '0' ]] || fail "application-owned functions reference net.* after relocation: $app_deps"

# Prove the operational reverse procedure too, then reapply the desired state.
psql_local -q >/dev/null <<'SQL'
drop extension pg_net;
drop schema if exists net cascade;
create extension pg_net schema public;
SQL
reverse_contract="$(psql_local -qAt -c "select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_net';" | tr -d '[:space:]')"
[[ "$reverse_contract" == 'public' ]] || fail 'reverse procedure did not restore public placement'

psql_local -q >/dev/null <<'SQL'
drop extension pg_net;
drop schema if exists net cascade;
create extension pg_net schema extensions;
SQL
final_contract="$(psql_local -qAt -c "select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_net';" | tr -d '[:space:]')"
[[ "$final_contract" == 'extensions' ]] || fail 'final candidate reapply failed'

log 'PASS: public reproduction -> relocation -> regression -> transactional rollback -> reverse procedure -> reapply verified on disposable Supabase'
