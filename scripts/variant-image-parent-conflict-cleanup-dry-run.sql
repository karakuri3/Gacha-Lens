-- GL-049 safe parent-image cleanup dry run.
-- Read-only: recomputes the deterministic cohort and emits no writes.

WITH exact_conflicts AS MATERIALIZED (
  SELECT
    v.id AS variant_id,
    v.series_id,
    COALESCE(NULLIF(BTRIM(v.variant_type), ''), 'unknown') AS variant_type
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
safe_candidates AS MATERIALIZED (
  SELECT *
  FROM classified
  WHERE sibling_count > 1
),
candidate_payload AS (
  SELECT '[' ||
    COALESCE(STRING_AGG(TO_JSON(variant_id)::text, ',' ORDER BY variant_id COLLATE "C"), '')
    || ']' AS js_json
  FROM safe_candidates
)
SELECT
  COUNT(*) FILTER (WHERE sibling_count > 1) AS safe_candidate_count,
  COUNT(*) FILTER (WHERE sibling_count = 1) AS singleton_ambiguous,
  COUNT(*) AS exact_valid_parent_conflicts,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type = 'provisional') AS provisional,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type = 'normal') AS normal,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type = 'rare') AS rare,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type = 'secret') AS secret,
  COUNT(*) FILTER (
    WHERE sibling_count > 1
      AND variant_type NOT IN ('provisional','normal','rare','secret')
  ) AS other,
  'sha256:' || ENCODE(
    DIGEST(CONVERT_TO((SELECT js_json FROM candidate_payload), 'UTF8'), 'sha256'),
    'hex'
  ) AS candidate_sha256,
  (
    SELECT COUNT(*)::int
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'variants'
      AND t.tgisinternal = false
  ) AS variants_user_trigger_count
FROM classified;
