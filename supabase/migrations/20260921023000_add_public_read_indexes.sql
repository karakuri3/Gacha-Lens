-- Reduce public catalog read amplification on the current Supabase primary.
-- Prepared from read-only EXPLAIN/pg_stat evidence; applying this migration remains a separate Production gate.

create index if not exists series_category_release_order_idx
  on public.series (
    category,
    release_date desc nulls last,
    updated_at desc,
    id asc
  );

create index if not exists variants_public_series_id_idx
  on public.variants (series_id)
  where (
    (variant_type is null or variant_type <> 'provisional')
    and series_id is not null
    and slug is not null
    and slug <> ''
    and name is not null
    and name <> ''
  );
