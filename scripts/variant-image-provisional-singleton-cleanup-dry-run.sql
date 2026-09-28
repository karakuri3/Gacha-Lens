-- GL-050 provisional singleton parent-image cleanup dry run.
-- Read-only: classifies only synthetic official lineup placeholders.

WITH exact_conflicts AS MATERIALIZED (
  SELECT
    v.id AS variant_id,
    v.series_id,
    v.name AS variant_name,
    v.variant_type,
    v.source_type,
    v.image AS variant_image,
    v.raw AS variant_raw,
    s.name AS series_name,
    s.brand AS series_brand,
    s.image_url AS series_image
  FROM public.variants v
  JOIN public.series s ON s.id = v.series_id
  WHERE v.source_type = 'official_site'
    AND v.image IS NOT NULL
    AND s.image_url IS NOT NULL
    AND v.image ~* '^https?://[^[:space:]/]+'
    AND s.image_url ~* '^https?://[^[:space:]/]+'
    AND v.image = s.image_url
    AND COALESCE(v.raw->>'image_scope', '') <> 'variant'
),
conflict_series AS MATERIALIZED (
  SELECT DISTINCT series_id FROM exact_conflicts
),
sibling_counts AS MATERIALIZED (
  SELECT v.series_id, COUNT(*)::int AS sibling_count
  FROM public.variants v
  JOIN conflict_series c ON c.series_id = v.series_id
  GROUP BY v.series_id
),
classified AS MATERIALIZED (
  SELECT e.*, sc.sibling_count
  FROM exact_conflicts e
  JOIN sibling_counts sc ON sc.series_id = e.series_id
),
candidates AS MATERIALIZED (
  SELECT *
  FROM classified
  WHERE sibling_count = 1
    AND variant_type = 'provisional'
    AND COALESCE(variant_raw->>'provisional', 'false') = 'true'
    AND variant_raw->>'reason' = 'official_lineup_not_fetched_yet'
    AND variant_name = series_name
    AND source_type = 'official_site'
    AND variant_image = series_image
    AND COALESCE(variant_raw->>'image_scope', '') <> 'variant'
),
candidate_payload AS (
  SELECT '[' ||
    COALESCE(STRING_AGG(TO_JSON(variant_id)::text, ',' ORDER BY variant_id COLLATE "C"), '')
    || ']' AS js_json
  FROM candidates
)
SELECT
  (SELECT COUNT(*)::int FROM exact_conflicts) AS exact_valid_parent_conflicts,
  (SELECT COUNT(*)::int FROM classified WHERE sibling_count = 1) AS singleton_conflicts,
  (SELECT COUNT(*)::int FROM classified WHERE sibling_count > 1) AS multi_sibling_conflicts,
  (SELECT COUNT(*)::int FROM candidates) AS candidate_count,
  (SELECT COUNT(*)::int FROM candidates WHERE series_brand = 'バンダイ') AS bandai,
  (SELECT COUNT(*)::int FROM candidates WHERE series_brand = 'タカラトミーアーツ') AS takaratomy_arts,
  (SELECT COUNT(*)::int FROM candidates WHERE series_brand NOT IN ('バンダイ','タカラトミーアーツ') OR series_brand IS NULL) AS other_provider,
  (SELECT COUNT(*)::int FROM candidates WHERE COALESCE(variant_raw->>'provisional', 'false') = 'true') AS raw_provisional_true,
  (SELECT COUNT(*)::int FROM candidates WHERE variant_raw->>'reason' = 'official_lineup_not_fetched_yet') AS reason_match,
  (SELECT COUNT(*)::int FROM candidates WHERE variant_name = series_name) AS name_equals_series,
  'sha256:' || ENCODE(
    DIGEST(CONVERT_TO((SELECT js_json FROM candidate_payload), 'UTF8'), 'sha256'),
    'hex'
  ) AS candidate_sha256,
  (SELECT COUNT(*)::int
   FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'variants'
     AND t.tgisinternal = false) AS variants_user_trigger_count,
  (SELECT COUNT(*)::int FROM public.variants WHERE image IS NULL) AS raw_variant_image_missing,
  (SELECT COUNT(*)::int FROM public.series WHERE image_url IS NULL) AS series_image_missing;
