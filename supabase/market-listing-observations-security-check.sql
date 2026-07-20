-- Run as a read-only post-deployment check. Every boolean should be true.
select
  c.relrowsecurity as rls_enabled,
  not has_table_privilege('anon', c.oid, 'select') as anon_select_revoked,
  not has_table_privilege('anon', c.oid, 'insert') as anon_insert_revoked,
  not has_table_privilege('anon', c.oid, 'update') as anon_update_revoked,
  not has_table_privilege('anon', c.oid, 'delete') as anon_delete_revoked,
  not has_table_privilege('authenticated', c.oid, 'select') as authenticated_select_revoked,
  not has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert_revoked,
  not has_table_privilege('authenticated', c.oid, 'update') as authenticated_update_revoked,
  not has_table_privilege('authenticated', c.oid, 'delete') as authenticated_delete_revoked,
  has_table_privilege('service_role', c.oid, 'select') as service_role_select_preserved,
  has_table_privilege('service_role', c.oid, 'insert') as service_role_insert_preserved,
  has_table_privilege('service_role', c.oid, 'update') as service_role_update_preserved,
  not exists (
    select 1
    from pg_policy p
    where p.polrelid = c.oid
      and (
        p.polroles = '{0}'::oid[]
        or to_regrole('anon')::oid = any (p.polroles)
        or to_regrole('authenticated')::oid = any (p.polroles)
      )
  ) as no_public_anon_or_authenticated_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'market_listing_observations'
  and c.relkind = 'r';
