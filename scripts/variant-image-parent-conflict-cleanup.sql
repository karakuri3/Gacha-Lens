-- GL-049 safe parent-image cleanup executor.
-- One purpose only: clear historical parent-series artwork from variants.image
-- for the deterministic 5,885-row multi-sibling safe cohort.
--
-- Persistent schema/RLS changes: none.
-- Persistent field writes: public.variants.image only.
-- Batches: 250 rows, inside one SERIALIZABLE transaction.
-- Re-run after a fully successful cleanup is an idempotent no-op.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _gl_exact_parent_conflicts ON COMMIT DROP AS
SELECT
  v.id AS variant_id,
  v.series_id,
  COALESCE(NULLIF(BTRIM(v.variant_type), ''), 'unknown') AS variant_type,
  v.image AS expected_parent_image
FROM public.variants v
JOIN public.series s ON s.id = v.series_id
WHERE v.source_type = 'official_site'
  AND v.image IS NOT NULL
  AND s.image_url IS NOT NULL
  AND v.image ~* '^https?://[^[:space:]/]+'
  AND s.image_url ~* '^https?://[^[:space:]/]+'
  AND v.image = s.image_url
  AND COALESCE(v.raw->>'image_scope', '') <> 'variant';

CREATE TEMP TABLE _gl_conflict_series ON COMMIT DROP AS
SELECT DISTINCT series_id
FROM _gl_exact_parent_conflicts;

CREATE TEMP TABLE _gl_sibling_counts ON COMMIT DROP AS
SELECT v.series_id, COUNT(*)::int AS sibling_count
FROM public.variants v
JOIN _gl_conflict_series c ON c.series_id = v.series_id
GROUP BY v.series_id;

CREATE TEMP TABLE _gl_cleanup_candidates ON COMMIT DROP AS
SELECT
  ROW_NUMBER() OVER (ORDER BY e.variant_id COLLATE "C")::int AS seq,
  e.variant_id,
  e.series_id,
  e.variant_type,
  e.expected_parent_image,
  sc.sibling_count
FROM _gl_exact_parent_conflicts e
JOIN _gl_sibling_counts sc ON sc.series_id = e.series_id
WHERE sc.sibling_count > 1
ORDER BY e.variant_id COLLATE "C";

CREATE UNIQUE INDEX _gl_cleanup_candidates_variant_id
  ON _gl_cleanup_candidates (variant_id);
CREATE UNIQUE INDEX _gl_cleanup_candidates_seq
  ON _gl_cleanup_candidates (seq);

DO $$
DECLARE
  v_exact int;
  v_safe int;
  v_singleton int;
  v_provisional int;
  v_normal int;
  v_rare int;
  v_secret int;
  v_other int;
  v_digest text;
  v_payload text;
  v_user_triggers int;
BEGIN
  SELECT COUNT(*)::int INTO v_exact FROM _gl_exact_parent_conflicts;
  SELECT COUNT(*)::int INTO v_safe FROM _gl_cleanup_candidates;
  SELECT COUNT(*)::int INTO v_singleton
    FROM _gl_exact_parent_conflicts e
    JOIN _gl_sibling_counts sc ON sc.series_id = e.series_id
    WHERE sc.sibling_count = 1;

  SELECT
    COUNT(*) FILTER (WHERE variant_type='provisional')::int,
    COUNT(*) FILTER (WHERE variant_type='normal')::int,
    COUNT(*) FILTER (WHERE variant_type='rare')::int,
    COUNT(*) FILTER (WHERE variant_type='secret')::int,
    COUNT(*) FILTER (WHERE variant_type NOT IN ('provisional','normal','rare','secret'))::int
  INTO v_provisional, v_normal, v_rare, v_secret, v_other
  FROM _gl_cleanup_candidates;

  SELECT '[' ||
    COALESCE(STRING_AGG(TO_JSON(variant_id)::text, ',' ORDER BY variant_id COLLATE "C"), '')
    || ']'
  INTO v_payload
  FROM _gl_cleanup_candidates;

  v_digest := 'sha256:' || ENCODE(DIGEST(CONVERT_TO(v_payload, 'UTF8'), 'sha256'), 'hex');

  SELECT COUNT(*)::int INTO v_user_triggers
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'variants'
    AND t.tgisinternal = false;

  IF v_safe = 0 AND v_exact = 1187 AND v_singleton = 1187 THEN
    RETURN;
  END IF;

  IF v_exact <> 7072
    OR v_safe <> 5885
    OR v_singleton <> 1187
    OR v_provisional <> 2383
    OR v_normal <> 3492
    OR v_rare <> 5
    OR v_secret <> 5
    OR v_other <> 0
    OR v_digest <> 'sha256:5f5ce212e4e8518df554b16c3342a3cea6fa154c35238e344586715f14fdf4c9'
    OR v_user_triggers <> 0
  THEN
    RAISE EXCEPTION 'variant_parent_image_cleanup_precondition_mismatch';
  END IF;
END $$;

-- Lock all parents first, then all candidate variants, in deterministic order.
-- Parent row locks also prevent FK-backed concurrent inserts from changing sibling cardinality.
SELECT s.id
FROM public.series s
JOIN (SELECT DISTINCT series_id FROM _gl_cleanup_candidates) c ON c.series_id = s.id
ORDER BY s.id COLLATE "C"
FOR UPDATE OF s;

SELECT v.id
FROM public.variants v
JOIN _gl_cleanup_candidates c ON c.variant_id = v.id
ORDER BY v.id COLLATE "C"
FOR UPDATE OF v;

DO $$
DECLARE
  v_safe int;
  v_exact int;
  v_singleton int;
  v_batch_start int;
  v_expected int;
  v_affected int;
  v_total int := 0;
BEGIN
  SELECT COUNT(*)::int INTO v_safe FROM _gl_cleanup_candidates;
  SELECT COUNT(*)::int INTO v_exact FROM _gl_exact_parent_conflicts;
  SELECT COUNT(*)::int INTO v_singleton
    FROM _gl_exact_parent_conflicts e
    JOIN _gl_sibling_counts sc ON sc.series_id = e.series_id
    WHERE sc.sibling_count = 1;

  IF v_safe = 0 AND v_exact = 1187 AND v_singleton = 1187 THEN
    RETURN;
  END IF;

  FOR v_batch_start IN 1..5885 BY 250 LOOP
    v_expected := LEAST(250, 5885 - v_batch_start + 1);

    WITH batch AS (
      SELECT *
      FROM _gl_cleanup_candidates
      WHERE seq BETWEEN v_batch_start AND v_batch_start + 249
      ORDER BY seq
    )
    UPDATE public.variants v
    SET image = NULL
    FROM batch b
    WHERE v.id = b.variant_id
      AND v.series_id = b.series_id
      AND v.source_type = 'official_site'
      AND v.image = b.expected_parent_image
      AND COALESCE(v.raw->>'image_scope', '') <> 'variant'
      AND b.sibling_count > 1
      AND EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.id = b.series_id
          AND s.image_url = b.expected_parent_image
      )
      AND (
        SELECT COUNT(*)
        FROM public.variants sibling
        WHERE sibling.series_id = b.series_id
      ) > 1;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> v_expected THEN
      RAISE EXCEPTION 'variant_parent_image_cleanup_batch_drift at %, expected %, got %',
        v_batch_start, v_expected, v_affected;
    END IF;
    v_total := v_total + v_affected;
  END LOOP;

  IF v_total <> 5885 THEN
    RAISE EXCEPTION 'variant_parent_image_cleanup_total_mismatch expected 5885 got %', v_total;
  END IF;
END $$;

DO $
DECLARE
  v_candidate_count int;
  v_target_null int;
  v_parent_drift int;
  v_exact_after int;
  v_safe_after int;
  v_singleton_after int;
  v_provisional_after int;
  v_normal_after int;
  v_rare_after int;
  v_secret_after int;
BEGIN
  SELECT COUNT(*)::int INTO v_candidate_count FROM _gl_cleanup_candidates;

  SELECT COUNT(*)::int INTO v_target_null
  FROM public.variants v
  JOIN _gl_cleanup_candidates c ON c.variant_id = v.id
  WHERE v.image IS NULL;

  SELECT COUNT(*)::int INTO v_parent_drift
  FROM public.series s
  JOIN (
    SELECT DISTINCT series_id, expected_parent_image
    FROM _gl_cleanup_candidates
  ) c ON c.series_id = s.id
  WHERE s.image_url IS DISTINCT FROM c.expected_parent_image;

  WITH exact_after AS MATERIALIZED (
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
  conflict_series_after AS MATERIALIZED (
    SELECT DISTINCT series_id FROM exact_after
  ),
  sibling_counts_after AS MATERIALIZED (
    SELECT v.series_id, COUNT(*)::int AS sibling_count
    FROM public.variants v
    JOIN conflict_series_after c ON c.series_id = v.series_id
    GROUP BY v.series_id
  ),
  classified_after AS MATERIALIZED (
    SELECT e.*, sc.sibling_count
    FROM exact_after e
    JOIN sibling_counts_after sc ON sc.series_id = e.series_id
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE sibling_count > 1)::int,
    COUNT(*) FILTER (WHERE sibling_count = 1)::int,
    COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='provisional')::int,
    COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='normal')::int,
    COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='rare')::int,
    COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='secret')::int
  INTO
    v_exact_after,
    v_safe_after,
    v_singleton_after,
    v_provisional_after,
    v_normal_after,
    v_rare_after,
    v_secret_after
  FROM classified_after;

  IF v_candidate_count = 0 THEN
    IF v_target_null <> 0
      OR v_parent_drift <> 0
      OR v_exact_after <> 1187
      OR v_safe_after <> 0
      OR v_singleton_after <> 1187
      OR v_provisional_after <> 0
      OR v_normal_after <> 0
      OR v_rare_after <> 0
      OR v_secret_after <> 0
    THEN
      RAISE EXCEPTION 'variant_parent_image_cleanup_idempotent_postcondition_mismatch';
    END IF;
    RETURN;
  END IF;

  IF v_candidate_count <> 5885
    OR v_target_null <> 5885
    OR v_parent_drift <> 0
    OR v_exact_after <> 1187
    OR v_safe_after <> 0
    OR v_singleton_after <> 1187
    OR v_provisional_after <> 0
    OR v_normal_after <> 0
    OR v_rare_after <> 0
    OR v_secret_after <> 0
  THEN
    RAISE EXCEPTION 'variant_parent_image_cleanup_postcondition_mismatch';
  END IF;
END $$;

COMMIT;

WITH exact_after AS MATERIALIZED (
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
conflict_series_after AS MATERIALIZED (
  SELECT DISTINCT series_id FROM exact_after
),
sibling_counts_after AS MATERIALIZED (
  SELECT v.series_id, COUNT(*)::int AS sibling_count
  FROM public.variants v
  JOIN conflict_series_after c ON c.series_id = v.series_id
  GROUP BY v.series_id
),
classified_after AS (
  SELECT e.*, sc.sibling_count
  FROM exact_after e
  JOIN sibling_counts_after sc ON sc.series_id = e.series_id
)
SELECT
  COUNT(*)::int AS exact_valid_parent_conflicts_after,
  COUNT(*) FILTER (WHERE sibling_count > 1)::int AS safe_candidate_count_after,
  COUNT(*) FILTER (WHERE sibling_count = 1)::int AS singleton_ambiguous_after,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='provisional')::int AS provisional_safe_after,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='normal')::int AS normal_safe_after,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='rare')::int AS rare_safe_after,
  COUNT(*) FILTER (WHERE sibling_count > 1 AND variant_type='secret')::int AS secret_safe_after
FROM classified_after;
