-- Read-only assertions for a fresh database after all repository migrations run.
-- A healthy schema returns zero rows. Each returned row is a CI failure.
with
foundation_tables(table_name) as (
  values
    ('source_weights'),
    ('series'),
    ('variants'),
    ('market_listings'),
    ('x_reactions'),
    ('restock_events'),
    ('stock_reports'),
    ('import_issues')
),
expected_columns(table_name, ordinal_position, column_name, udt_name, is_nullable, column_default) as (
  values
    ('source_weights', 1, 'source_type', 'text', 'NO', null),
    ('source_weights', 2, 'weight', 'numeric', 'NO', null),
    ('source_weights', 3, 'label', 'text', 'NO', null),
    ('source_weights', 4, 'updated_at', 'timestamptz', 'NO', 'now()'),

    ('series', 1, 'id', 'text', 'NO', null),
    ('series', 2, 'slug', 'text', 'NO', null),
    ('series', 3, 'name', 'text', 'NO', null),
    ('series', 4, 'franchise', 'text', 'YES', null),
    ('series', 5, 'brand', 'text', 'YES', null),
    ('series', 6, 'category', 'text', 'YES', null),
    ('series', 7, 'release_month', 'text', 'YES', null),
    ('series', 8, 'release_week', 'text', 'YES', null),
    ('series', 9, 'release_date', 'date', 'YES', null),
    ('series', 10, 'price', 'int4', 'YES', null),
    ('series', 11, 'image_url', 'text', 'YES', null),
    ('series', 12, 'official_url', 'text', 'YES', null),
    ('series', 13, 'is_released', 'bool', 'NO', 'false'),
    ('series', 14, 'source_type', 'text', 'NO', '''official_site''::text'),
    ('series', 15, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('series', 16, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('series', 17, 'updated_at', 'timestamptz', 'NO', 'now()'),

    ('variants', 1, 'id', 'text', 'NO', null),
    ('variants', 2, 'slug', 'text', 'NO', null),
    ('variants', 3, 'series_id', 'text', 'NO', null),
    ('variants', 4, 'name', 'text', 'NO', null),
    ('variants', 5, 'variant_type', 'text', 'NO', '''normal''::text'),
    ('variants', 6, 'rarity', 'text', 'YES', null),
    ('variants', 7, 'role', 'text', 'YES', null),
    ('variants', 8, 'image', 'text', 'YES', null),
    ('variants', 9, 'released', 'bool', 'NO', 'false'),
    ('variants', 10, 'price', 'int4', 'YES', null),
    ('variants', 11, 'brand', 'text', 'YES', null),
    ('variants', 12, 'release_month', 'text', 'YES', null),
    ('variants', 13, 'release_week', 'text', 'YES', null),
    ('variants', 14, 'release_date', 'date', 'YES', null),
    ('variants', 15, 'official_url', 'text', 'YES', null),
    ('variants', 16, 'axes', 'jsonb', 'NO', '''{}''::jsonb'),
    ('variants', 17, 'signals', 'jsonb', 'NO', '''{}''::jsonb'),
    ('variants', 18, 'tags', '_text', 'NO', '''{}''::text[]'),
    ('variants', 19, 'source_type', 'text', 'NO', '''official_site''::text'),
    ('variants', 20, 'review_required', 'bool', 'NO', 'false'),
    ('variants', 21, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('variants', 22, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('variants', 23, 'updated_at', 'timestamptz', 'NO', 'now()'),

    ('market_listings', 1, 'id', 'text', 'NO', null),
    ('market_listings', 2, 'variant_id', 'text', 'YES', null),
    ('market_listings', 3, 'series_id', 'text', 'YES', null),
    ('market_listings', 4, 'title', 'text', 'NO', null),
    ('market_listings', 5, 'listing_type', 'text', 'NO', '''unknown''::text'),
    ('market_listings', 6, 'market_review_type', 'text', 'NO', '''unknown''::text'),
    ('market_listings', 7, 'classification_reason', 'text', 'YES', null),
    ('market_listings', 8, 'classification_confidence', 'numeric', 'YES', null),
    ('market_listings', 9, 'classification_details', 'jsonb', 'NO', '''{}''::jsonb'),
    ('market_listings', 10, 'price', 'int4', 'YES', null),
    ('market_listings', 11, 'status', 'text', 'NO', '''active''::text'),
    ('market_listings', 12, 'source', 'text', 'NO', '''mercari''::text'),
    ('market_listings', 13, 'source_type', 'text', 'NO', '''marketplace''::text'),
    ('market_listings', 14, 'source_url', 'text', 'YES', null),
    ('market_listings', 15, 'listed_at', 'timestamptz', 'YES', null),
    ('market_listings', 16, 'sold_at', 'timestamptz', 'YES', null),
    ('market_listings', 17, 'confidence', 'numeric', 'NO', '0.25'),
    ('market_listings', 18, 'review_required', 'bool', 'NO', 'false'),
    ('market_listings', 19, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('market_listings', 20, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('market_listings', 21, 'updated_at', 'timestamptz', 'NO', 'now()'),
    ('market_listings', 22, 'matched_variant_id', 'text', 'YES', null),
    ('market_listings', 23, 'last_observed_at', 'timestamptz', 'YES', null),

    ('x_reactions', 1, 'id', 'text', 'NO', null),
    ('x_reactions', 2, 'variant_id', 'text', 'YES', null),
    ('x_reactions', 3, 'series_id', 'text', 'YES', null),
    ('x_reactions', 4, 'source_type', 'text', 'NO', '''user_x''::text'),
    ('x_reactions', 5, 'author_type', 'text', 'NO', '''user''::text'),
    ('x_reactions', 6, 'text', 'text', 'NO', null),
    ('x_reactions', 7, 'url', 'text', 'YES', null),
    ('x_reactions', 8, 'posted_at', 'timestamptz', 'YES', null),
    ('x_reactions', 9, 'reposts', 'int4', 'NO', '0'),
    ('x_reactions', 10, 'likes', 'int4', 'NO', '0'),
    ('x_reactions', 11, 'quotes', 'int4', 'NO', '0'),
    ('x_reactions', 12, 'intent_tags', '_text', 'NO', '''{}''::text[]'),
    ('x_reactions', 13, 'intent_labels', '_text', 'NO', '''{}''::text[]'),
    ('x_reactions', 14, 'confidence', 'numeric', 'NO', '0.25'),
    ('x_reactions', 15, 'review_required', 'bool', 'NO', 'false'),
    ('x_reactions', 16, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('x_reactions', 17, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('x_reactions', 18, 'updated_at', 'timestamptz', 'NO', 'now()'),
    ('x_reactions', 19, 'matched_variant_id', 'text', 'YES', null),

    ('restock_events', 1, 'id', 'text', 'NO', null),
    ('restock_events', 2, 'variant_id', 'text', 'YES', null),
    ('restock_events', 3, 'series_id', 'text', 'YES', null),
    ('restock_events', 4, 'source_type', 'text', 'NO', '''user_x''::text'),
    ('restock_events', 5, 'source_weight', 'numeric', 'NO', '0.48'),
    ('restock_events', 6, 'event_type', 'text', 'NO', '''unknown''::text'),
    ('restock_events', 7, 'event_label', 'text', 'YES', null),
    ('restock_events', 8, 'classification_reason', 'text', 'YES', null),
    ('restock_events', 9, 'classification_keywords', '_text', 'NO', '''{}''::text[]'),
    ('restock_events', 10, 'text', 'text', 'YES', null),
    ('restock_events', 11, 'region', 'text', 'YES', null),
    ('restock_events', 12, 'shop_name', 'text', 'YES', null),
    ('restock_events', 13, 'source_url', 'text', 'YES', null),
    ('restock_events', 14, 'reported_at', 'timestamptz', 'YES', null),
    ('restock_events', 15, 'confidence', 'numeric', 'NO', '0.25'),
    ('restock_events', 16, 'review_required', 'bool', 'NO', 'false'),
    ('restock_events', 17, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('restock_events', 18, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('restock_events', 19, 'updated_at', 'timestamptz', 'NO', 'now()'),
    ('restock_events', 20, 'matched_variant_id', 'text', 'YES', null),

    ('stock_reports', 1, 'id', 'text', 'NO', null),
    ('stock_reports', 2, 'variant_id', 'text', 'YES', null),
    ('stock_reports', 3, 'series_id', 'text', 'YES', null),
    ('stock_reports', 4, 'source_type', 'text', 'NO', '''user_x''::text'),
    ('stock_reports', 5, 'source_weight', 'numeric', 'NO', '0.48'),
    ('stock_reports', 6, 'status', 'text', 'NO', '''unknown''::text'),
    ('stock_reports', 7, 'status_label', 'text', 'YES', null),
    ('stock_reports', 8, 'classification_reason', 'text', 'YES', null),
    ('stock_reports', 9, 'classification_keywords', '_text', 'NO', '''{}''::text[]'),
    ('stock_reports', 10, 'text', 'text', 'YES', null),
    ('stock_reports', 11, 'region', 'text', 'YES', null),
    ('stock_reports', 12, 'shop_name', 'text', 'YES', null),
    ('stock_reports', 13, 'source_url', 'text', 'YES', null),
    ('stock_reports', 14, 'reported_at', 'timestamptz', 'YES', null),
    ('stock_reports', 15, 'confidence', 'numeric', 'NO', '0.25'),
    ('stock_reports', 16, 'review_required', 'bool', 'NO', 'false'),
    ('stock_reports', 17, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('stock_reports', 18, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('stock_reports', 19, 'updated_at', 'timestamptz', 'NO', 'now()'),
    ('stock_reports', 20, 'matched_variant_id', 'text', 'YES', null),

    ('import_issues', 1, 'id', 'text', 'NO', null),
    ('import_issues', 2, 'issue_type', 'text', 'NO', null),
    ('import_issues', 3, 'table_name', 'text', 'NO', null),
    ('import_issues', 4, 'record_id', 'text', 'YES', null),
    ('import_issues', 5, 'source', 'text', 'YES', null),
    ('import_issues', 6, 'source_url', 'text', 'YES', null),
    ('import_issues', 7, 'raw', 'jsonb', 'NO', '''{}''::jsonb'),
    ('import_issues', 8, 'resolved', 'bool', 'NO', 'false'),
    ('import_issues', 9, 'note', 'text', 'YES', null),
    ('import_issues', 10, 'assignee', 'text', 'YES', null),
    ('import_issues', 11, 'resolved_at', 'timestamptz', 'YES', null),
    ('import_issues', 12, 'created_at', 'timestamptz', 'NO', 'now()'),
    ('import_issues', 13, 'updated_at', 'timestamptz', 'NO', 'now()')
),
expected_constraints(table_name, constraint_name, constraint_type) as (
  values
    ('source_weights', 'source_weights_pkey', 'p'),
    ('source_weights', 'source_weights_weight_check', 'c'),
    ('series', 'series_pkey', 'p'),
    ('series', 'series_slug_key', 'u'),
    ('variants', 'variants_pkey', 'p'),
    ('variants', 'variants_slug_key', 'u'),
    ('variants', 'variants_series_id_fkey', 'f'),
    ('market_listings', 'market_listings_pkey', 'p'),
    ('market_listings', 'market_listings_variant_id_fkey', 'f'),
    ('market_listings', 'market_listings_series_id_fkey', 'f'),
    ('market_listings', 'market_listings_matched_variant_id_fkey', 'f'),
    ('x_reactions', 'x_reactions_pkey', 'p'),
    ('x_reactions', 'x_reactions_variant_id_fkey', 'f'),
    ('x_reactions', 'x_reactions_series_id_fkey', 'f'),
    ('x_reactions', 'x_reactions_matched_variant_id_fkey', 'f'),
    ('restock_events', 'restock_events_pkey', 'p'),
    ('restock_events', 'restock_events_variant_id_fkey', 'f'),
    ('restock_events', 'restock_events_series_id_fkey', 'f'),
    ('restock_events', 'restock_events_matched_variant_id_fkey', 'f'),
    ('stock_reports', 'stock_reports_pkey', 'p'),
    ('stock_reports', 'stock_reports_variant_id_fkey', 'f'),
    ('stock_reports', 'stock_reports_series_id_fkey', 'f'),
    ('stock_reports', 'stock_reports_matched_variant_id_fkey', 'f'),
    ('import_issues', 'import_issues_pkey', 'p')
),
expected_indexes(index_name) as (
  values
    ('variants_series_id_idx'),
    ('market_listings_variant_id_idx'),
    ('market_listings_matched_variant_id_idx'),
    ('market_listings_review_required_idx'),
    ('market_listings_last_observed_at_idx'),
    ('x_reactions_variant_id_idx'),
    ('x_reactions_matched_variant_id_idx'),
    ('restock_events_variant_id_idx'),
    ('restock_events_matched_variant_id_idx'),
    ('stock_reports_variant_id_idx'),
    ('stock_reports_matched_variant_id_idx'),
    ('import_issues_resolved_idx')
),
later_owned_objects(object_name, object_kind) as (
  values
    ('ingestion_runs', 'table'),
    ('market_listing_observations', 'table'),
    ('community_reports', 'table'),
    ('outbound_clicks', 'table'),
    ('sync_market_observation_links', 'function'),
    ('market_listing_observation_links_trigger', 'trigger')
),
legacy_tables(table_name) as (
  values
    ('series_lineup'),
    ('series_price_history'),
    ('series_restock_info'),
    ('series_stock_reports')
),
actual_columns as (
  select
    columns.table_name,
    columns.ordinal_position,
    columns.column_name,
    columns.udt_name,
    columns.is_nullable,
    columns.column_default
  from information_schema.columns columns
  join foundation_tables expected using (table_name)
  where columns.table_schema = 'public'
),
findings as (
  select
    'missing_table'::text as issue_type,
    expected.table_name::text as object_name,
    'required Foundation table is absent'::text as detail
  from foundation_tables expected
  where to_regclass(format('public.%I', expected.table_name)) is null

  union all

  select
    'missing_or_mismatched_column',
    format('%s.%s', expected.table_name, expected.column_name),
    format(
      'expected ordinal=%s type=%s nullable=%s default=%s',
      expected.ordinal_position,
      expected.udt_name,
      expected.is_nullable,
      coalesce(expected.column_default, '<none>')
    )
  from expected_columns expected
  left join actual_columns actual
    on actual.table_name = expected.table_name
   and actual.column_name = expected.column_name
  where actual.column_name is null
     or actual.ordinal_position <> expected.ordinal_position
     or actual.udt_name <> expected.udt_name
     or actual.is_nullable <> expected.is_nullable
     or coalesce(actual.column_default, '') <> coalesce(expected.column_default, '')

  union all

  select
    'unexpected_column',
    format('%s.%s', actual.table_name, actual.column_name),
    'column is not part of the reviewed final schema'
  from actual_columns actual
  left join expected_columns expected
    on expected.table_name = actual.table_name
   and expected.column_name = actual.column_name
  where expected.column_name is null

  union all

  select
    'missing_constraint',
    format('%s.%s', expected.table_name, expected.constraint_name),
    format('required constraint type %s is absent', expected.constraint_type)
  from expected_constraints expected
  where not exists (
    select 1
    from pg_constraint constraints
    join pg_class relations on relations.oid = constraints.conrelid
    join pg_namespace namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'public'
      and relations.relname = expected.table_name
      and constraints.conname = expected.constraint_name
      and constraints.contype::text = expected.constraint_type
  )

  union all

  select
    'missing_index',
    expected.index_name,
    'required index is absent'
  from expected_indexes expected
  where not exists (
    select 1 from pg_indexes indexes
    where indexes.schemaname = 'public'
      and indexes.indexname = expected.index_name
  )

  union all

  select
    'rls_mismatch',
    expected.table_name,
    case
      when not relations.relrowsecurity then 'RLS is disabled'
      else 'FORCE RLS must remain disabled'
    end
  from foundation_tables expected
  join pg_class relations on relations.relname = expected.table_name
  join pg_namespace namespaces
    on namespaces.oid = relations.relnamespace
   and namespaces.nspname = 'public'
  where not relations.relrowsecurity or relations.relforcerowsecurity

  union all

  select
    'unexpected_policy',
    format('%s.%s', policies.tablename, policies.policyname),
    'Foundation tables must not expose data through a policy'
  from pg_policies policies
  join foundation_tables expected on expected.table_name = policies.tablename
  where policies.schemaname = 'public'

  union all

  select
    'unexpected_client_grant',
    format('%s:%s', expected.table_name, roles.role_name),
    'anon/authenticated retains a table privilege'
  from foundation_tables expected
  cross join (values ('anon'), ('authenticated')) roles(role_name)
  where has_table_privilege(
    roles.role_name,
    format('public.%I', expected.table_name),
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )

  union all

  select
    'missing_service_role_grant',
    expected.table_name,
    'service_role requires SELECT, INSERT, UPDATE and DELETE'
  from foundation_tables expected
  where not has_table_privilege(
    'service_role',
    format('public.%I', expected.table_name),
    'SELECT,INSERT,UPDATE,DELETE'
  )

  union all

  select
    'missing_extension',
    'pgcrypto',
    'pgcrypto must exist in the extensions schema'
  where not exists (
    select 1
    from pg_extension extensions
    join pg_namespace namespaces on namespaces.oid = extensions.extnamespace
    where extensions.extname = 'pgcrypto'
      and namespaces.nspname = 'extensions'
  )

  union all

  select
    'missing_later_object',
    expected.object_name,
    format('required later-owned %s is absent', expected.object_kind)
  from later_owned_objects expected
  where (expected.object_kind = 'table' and to_regclass(format('public.%I', expected.object_name)) is null)
     or (expected.object_kind = 'function' and to_regprocedure(format('public.%I()', expected.object_name)) is null)
     or (
       expected.object_kind = 'trigger'
       and not exists (
         select 1
         from pg_trigger triggers
         join pg_class relations on relations.oid = triggers.tgrelid
         join pg_namespace namespaces on namespaces.oid = relations.relnamespace
         where namespaces.nspname = 'public'
           and relations.relname = 'market_listings'
           and triggers.tgname = expected.object_name
           and not triggers.tgisinternal
       )
     )

  union all

  select
    'legacy_table_present',
    legacy.table_name,
    'legacy series table must not be created on a fresh database'
  from legacy_tables legacy
  where to_regclass(format('public.%I', legacy.table_name)) is not null

  union all

  select
    'deferred_table_present',
    'forecast_snapshots',
    'forecast_snapshots is intentionally deferred'
  where to_regclass('public.forecast_snapshots') is not null

  union all

  select
    'unexpected_cron_job',
    jobs.jobname,
    format('schedule=%s', jobs.schedule)
  from cron.job jobs
  where jobs.jobname in (
    'gacha-ingest-official-hourly',
    'gacha-ingest-market-hourly',
    'gacha-ingest-stock-hourly'
  )
)
select issue_type, object_name, detail
from findings
order by issue_type, object_name;
