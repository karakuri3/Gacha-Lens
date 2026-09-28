-- GL-050 deterministic provisional singleton parent-image cleanup.
-- One purpose only: clear variants.image for synthetic official lineup placeholders
-- that exactly duplicate their parent series image.
--
-- Persistent schema/RLS changes: none.
-- Persistent field writes: public.variants.image only.
-- updated_at is intentionally untouched and asserted stable.
-- Batches: 250 rows inside one SERIALIZABLE transaction.
-- Re-run after a fully successful cleanup is an idempotent no-op.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _gl050_exact_conflicts ON COMMIT DROP AS
SELECT
  v.id AS variant_id,
  v.series_id,
  v.name AS variant_name,
  v.variant_type,
  v.source_type,
  v.image AS expected_parent_image,
  v.raw AS variant_raw,
  v.updated_at AS expected_updated_at,
  s.name AS series_name,
  s.brand AS series_brand
FROM public.variants v
JOIN public.series s ON s.id = v.series_id
WHERE v.source_type = 'official_site'
  AND v.image IS NOT NULL
  AND s.image_url IS NOT NULL
  AND v.image ~* '^https?://[^[:space:]/]+'
  AND s.image_url ~* '^https?://[^[:space:]/]+'
  AND v.image = s.image_url
  AND COALESCE(v.raw->>'image_scope', '') <> 'variant';

CREATE TEMP TABLE _gl050_conflict_series ON COMMIT DROP AS
SELECT DISTINCT series_id FROM _gl050_exact_conflicts;

CREATE TEMP TABLE _gl050_sibling_counts ON COMMIT DROP AS
SELECT v.series_id, COUNT(*)::int AS sibling_count
FROM public.variants v
JOIN _gl050_conflict_series c ON c.series_id = v.series_id
GROUP BY v.series_id;

CREATE TEMP TABLE _gl050_candidates ON COMMIT DROP AS
SELECT
  ROW_NUMBER() OVER (ORDER BY e.variant_id COLLATE "C")::int AS seq,
  e.variant_id,
  e.series_id,
  e.expected_parent_image,
  e.expected_updated_at,
  e.series_brand
FROM _gl050_exact_conflicts e
JOIN _gl050_sibling_counts sc ON sc.series_id = e.series_id
WHERE sc.sibling_count = 1
  AND e.variant_type = 'provisional'
  AND COALESCE(e.variant_raw->>'provisional', 'false') = 'true'
  AND e.variant_raw->>'reason' = 'official_lineup_not_fetched_yet'
  AND e.variant_name = e.series_name
  AND e.source_type = 'official_site'
  AND COALESCE(e.variant_raw->>'image_scope', '') <> 'variant'
ORDER BY e.variant_id COLLATE "C";

CREATE UNIQUE INDEX _gl050_candidates_variant_id ON _gl050_candidates (variant_id);
CREATE UNIQUE INDEX _gl050_candidates_seq ON _gl050_candidates (seq);

DO $gl050_pre$
DECLARE
  v_exact int;
  v_singleton int;
  v_multi int;
  v_candidates int;
  v_bandai int;
  v_tta int;
  v_other int;
  v_digest text;
  v_payload text;
  v_user_triggers int;
BEGIN
  SELECT COUNT(*)::int INTO v_exact FROM _gl050_exact_conflicts;
  SELECT COUNT(*)::int INTO v_singleton
  FROM _gl050_exact_conflicts e
  JOIN _gl050_sibling_counts sc ON sc.series_id = e.series_id
  WHERE sc.sibling_count = 1;
  SELECT COUNT(*)::int INTO v_multi
  FROM _gl050_exact_conflicts e
  JOIN _gl050_sibling_counts sc ON sc.series_id = e.series_id
  WHERE sc.sibling_count > 1;
  SELECT COUNT(*)::int INTO v_candidates FROM _gl050_candidates;
  SELECT COUNT(*) FILTER (WHERE series_brand = 'バンダイ')::int,
         COUNT(*) FILTER (WHERE series_brand = 'タカラトミーアーツ')::int,
         COUNT(*) FILTER (WHERE series_brand NOT IN ('バンダイ','タカラトミーアーツ') OR series_brand IS NULL)::int
    INTO v_bandai, v_tta, v_other
  FROM _gl050_candidates;

  SELECT '[' ||
    COALESCE(STRING_AGG(TO_JSON(variant_id)::text, ',' ORDER BY variant_id COLLATE "C"), '')
    || ']'
  INTO v_payload
  FROM _gl050_candidates;
  v_digest := 'sha256:' || ENCODE(DIGEST(CONVERT_TO(v_payload, 'UTF8'), 'sha256'), 'hex');

  SELECT COUNT(*)::int INTO v_user_triggers
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'variants'
    AND t.tgisinternal = false;

  IF v_candidates = 0 AND v_exact = 0 AND v_singleton = 0 AND v_multi = 0 THEN
    RETURN;
  END IF;

  IF v_exact <> 1187
    OR v_singleton <> 1187
    OR v_multi <> 0
    OR v_candidates <> 1187
    OR v_bandai <> 983
    OR v_tta <> 204
    OR v_other <> 0
    OR v_digest <> 'sha256:c94cee7575ed3383c6a03e95c3b1440976e25af1a28803337236dae4a226d9b3'
    OR v_user_triggers <> 0
  THEN
    RAISE EXCEPTION 'gl050_provisional_singleton_precondition_mismatch';
  END IF;
END
$gl050_pre$;

-- Lock parent rows first. FK-backed inserts for the same series cannot change
-- singleton cardinality while these locks are held.
SELECT s.id
FROM public.series s
JOIN (SELECT DISTINCT series_id FROM _gl050_candidates) c ON c.series_id = s.id
ORDER BY s.id COLLATE "C"
FOR UPDATE OF s;

SELECT v.id
FROM public.variants v
JOIN _gl050_candidates c ON c.variant_id = v.id
ORDER BY v.id COLLATE "C"
FOR UPDATE OF v;

DO $gl050_write$
DECLARE
  v_candidate_count int;
  v_batch_start int;
  v_expected int;
  v_affected int;
  v_total int := 0;
BEGIN
  SELECT COUNT(*)::int INTO v_candidate_count FROM _gl050_candidates;
  IF v_candidate_count = 0 THEN
    RETURN;
  END IF;

  FOR v_batch_start IN 1..v_candidate_count BY 250 LOOP
    v_expected := LEAST(250, v_candidate_count - v_batch_start + 1);

    WITH batch AS (
      SELECT *
      FROM _gl050_candidates
      WHERE seq BETWEEN v_batch_start AND v_batch_start + 249
      ORDER BY seq
    )
    UPDATE public.variants v
    SET image = NULL
    FROM batch b
    WHERE v.id = b.variant_id
      AND v.series_id = b.series_id
      AND v.variant_type = 'provisional'
      AND v.source_type = 'official_site'
      AND v.image = b.expected_parent_image
      AND COALESCE(v.raw->>'provisional', 'false') = 'true'
      AND v.raw->>'reason' = 'official_lineup_not_fetched_yet'
      AND COALESCE(v.raw->>'image_scope', '') <> 'variant'
      AND EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.id = b.series_id
          AND s.name = v.name
          AND s.image_url = b.expected_parent_image
      )
      AND (
        SELECT COUNT(*)
        FROM public.variants sibling
        WHERE sibling.series_id = b.series_id
      ) = 1;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> v_expected THEN
      RAISE EXCEPTION 'gl050_provisional_singleton_batch_drift at %, expected %, got %',
        v_batch_start, v_expected, v_affected;
    END IF;
    v_total := v_total + v_affected;
  END LOOP;

  IF v_total <> 1187 THEN
    RAISE EXCEPTION 'gl050_provisional_singleton_total_mismatch expected 1187 got %', v_total;
  END IF;
END
$gl050_write$;

DO $gl050_post$
DECLARE
  v_candidate_count int;
  v_target_null int;
  v_updated_at_drift int;
  v_parent_drift int;
  v_remaining_target_conflicts int;
  v_exact_after int;
  v_raw_missing int;
  v_series_missing int;
BEGIN
  SELECT COUNT(*)::int INTO v_candidate_count FROM _gl050_candidates;

  SELECT COUNT(*)::int INTO v_target_null
  FROM public.variants v
  JOIN _gl050_candidates c ON c.variant_id = v.id
  WHERE v.image IS NULL;

  SELECT COUNT(*)::int INTO v_updated_at_drift
  FROM public.variants v
  JOIN _gl050_candidates c ON c.variant_id = v.id
  WHERE v.updated_at IS DISTINCT FROM c.expected_updated_at;

  SELECT COUNT(*)::int INTO v_parent_drift
  FROM public.series s
  JOIN (
    SELECT DISTINCT series_id, expected_parent_image
    FROM _gl050_candidates
  ) c ON c.series_id = s.id
  WHERE s.image_url IS DISTINCT FROM c.expected_parent_image;

  SELECT COUNT(*)::int INTO v_remaining_target_conflicts
  FROM public.variants v
  JOIN _gl050_candidates c ON c.variant_id = v.id
  JOIN public.series s ON s.id = v.series_id
  WHERE v.image = s.image_url;

  SELECT COUNT(*)::int INTO v_exact_after
  FROM public.variants v
  JOIN public.series s ON s.id = v.series_id
  WHERE v.source_type = 'official_site'
    AND v.image IS NOT NULL
    AND s.image_url IS NOT NULL
    AND v.image ~* '^https?://[^[:space:]/]+'
    AND s.image_url ~* '^https?://[^[:space:]/]+'
    AND v.image = s.image_url
    AND COALESCE(v.raw->>'image_scope', '') <> 'variant';

  SELECT COUNT(*)::int INTO v_raw_missing FROM public.variants WHERE image IS NULL;
  SELECT COUNT(*)::int INTO v_series_missing FROM public.series WHERE image_url IS NULL;

  IF v_candidate_count = 0 THEN
    IF v_target_null <> 0
      OR v_updated_at_drift <> 0
      OR v_parent_drift <> 0
      OR v_remaining_target_conflicts <> 0
      OR v_exact_after <> 0
      OR v_raw_missing <> 7072
      OR v_series_missing <> 0
    THEN
      RAISE EXCEPTION 'gl050_provisional_singleton_idempotent_postcondition_mismatch';
    END IF;
    RETURN;
  END IF;

  IF v_candidate_count <> 1187
    OR v_target_null <> 1187
    OR v_updated_at_drift <> 0
    OR v_parent_drift <> 0
    OR v_remaining_target_conflicts <> 0
    OR v_exact_after <> 0
    OR v_raw_missing <> 7072
    OR v_series_missing <> 0
  THEN
    RAISE EXCEPTION 'gl050_provisional_singleton_postcondition_mismatch';
  END IF;
END
$gl050_post$;

COMMIT;

SELECT
  (SELECT COUNT(*)::int FROM public.variants WHERE image IS NULL) AS raw_variant_image_missing_after,
  (SELECT COUNT(*)::int FROM public.series WHERE image_url IS NULL) AS series_image_missing_after,
  (SELECT COUNT(*)::int
   FROM public.variants v
   JOIN public.series s ON s.id = v.series_id
   WHERE v.source_type = 'official_site'
     AND v.image IS NOT NULL
     AND s.image_url IS NOT NULL
     AND v.image ~* '^https?://[^[:space:]/]+'
     AND s.image_url ~* '^https?://[^[:space:]/]+'
     AND v.image = s.image_url
     AND COALESCE(v.raw->>'image_scope', '') <> 'variant') AS exact_valid_parent_conflicts_after;
