-- Worker A deterministic near-equivalent parent-artwork cleanup.
-- Persistent schema/RLS changes: none.
-- Persistent write: public.variants.image only.
-- Batches: 250 rows inside one SERIALIZABLE transaction.
-- Re-run after success is an idempotent no-op.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _glne_base ON COMMIT DROP AS
SELECT
  v.id AS variant_id,
  v.series_id,
  v.name AS variant_name,
  v.variant_type,
  v.source_type,
  v.review_required,
  v.image AS before_url,
  v.raw AS variant_raw,
  v.updated_at AS expected_updated_at,
  s.name AS series_name,
  s.brand AS series_brand,
  s.image_url AS parent_url,
  s.updated_at AS parent_updated_at,
  REGEXP_MATCH(v.image, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS variant_bandai,
  REGEXP_MATCH(s.image_url, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS parent_bandai,
  REGEXP_MATCH(v.image, '^https://www[.]takaratomy-arts[.]co[.]jp/upfiles/products/([^/?]+)_([sb])[.]jpg$') AS variant_tta,
  REGEXP_MATCH(s.image_url, '^https://www[.]takaratomy-arts[.]co[.]jp/upfiles/products/([^/?]+)_([sb])[.]jpg$') AS parent_tta
FROM public.variants v
JOIN public.series s ON s.id = v.series_id
WHERE v.variant_type = 'provisional'
  AND NULLIF(TRIM(v.image), '') IS NOT NULL
  AND NULLIF(TRIM(s.image_url), '') IS NOT NULL
  AND v.image <> s.image_url;

CREATE TEMP TABLE _glne_semantic ON COMMIT DROP AS
SELECT *
FROM _glne_base
WHERE COALESCE(variant_raw->>'provisional', 'false') = 'true'
  AND variant_raw->>'reason' = 'official_lineup_not_fetched_yet'
  AND variant_name = series_name
  AND source_type = 'official_site'
  AND review_required = true
  AND COALESCE(variant_raw->>'image_scope', '') <> 'variant';

CREATE TEMP TABLE _glne_classified ON COMMIT DROP AS
SELECT
  *,
  CASE
    WHEN variant_bandai IS NOT NULL AND parent_bandai IS NOT NULL
      AND variant_bandai[2] = parent_bandai[2]
      AND variant_bandai[3] = parent_bandai[3]
      AND variant_bandai[1] <> parent_bandai[1]
      THEN 'bandai_exact_asset_size_derivative'
    WHEN variant_bandai IS NOT NULL AND parent_bandai IS NOT NULL
      AND variant_bandai[2] = parent_bandai[2]
      AND variant_bandai[3] <> parent_bandai[3]
      THEN 'same_asset_different_frame'
    WHEN variant_bandai IS NOT NULL AND parent_bandai IS NOT NULL
      AND variant_bandai[2] <> parent_bandai[2]
      THEN 'different_asset_id'
    WHEN variant_tta IS NOT NULL AND parent_tta IS NOT NULL
      AND variant_tta[1] = parent_tta[1]
      AND variant_tta[2] <> parent_tta[2]
      THEN 'tarts_exact_asset_size_derivative'
    WHEN variant_tta IS NOT NULL AND parent_tta IS NOT NULL
      AND variant_tta[1] <> parent_tta[1]
      THEN 'different_product_code'
    ELSE 'unrecognized_provider_pattern'
  END AS provider_reason
FROM _glne_semantic;

CREATE TEMP TABLE _glne_candidates ON COMMIT DROP AS
SELECT
  ROW_NUMBER() OVER (ORDER BY variant_id COLLATE "C")::int AS seq,
  variant_id,
  series_id,
  before_url,
  parent_url,
  expected_updated_at,
  parent_updated_at,
  CASE provider_reason
    WHEN 'bandai_exact_asset_size_derivative' THEN 'bandai'
    WHEN 'tarts_exact_asset_size_derivative' THEN 'takaratomy_arts'
  END AS provider,
  provider_reason AS reason,
  CASE provider_reason
    WHEN 'bandai_exact_asset_size_derivative'
      THEN 'bandai|bandai-a.akamaihd.net|bc/img/model|' || variant_bandai[2] || '|' || variant_bandai[3] || '|jpg'
    WHEN 'tarts_exact_asset_size_derivative'
      THEN 'takaratomy_arts|www.takaratomy-arts.co.jp|upfiles/products|' || variant_tta[1] || '|jpg'
  END AS canonical_asset_identity
FROM _glne_classified
WHERE provider_reason IN (
  'bandai_exact_asset_size_derivative',
  'tarts_exact_asset_size_derivative'
)
ORDER BY variant_id COLLATE "C";

CREATE UNIQUE INDEX _glne_candidates_variant_id ON _glne_candidates (variant_id);
CREATE UNIQUE INDEX _glne_candidates_seq ON _glne_candidates (seq);

CREATE TEMP TABLE _glne_rejected ON COMMIT DROP AS
SELECT
  b.variant_id,
  CASE
    WHEN NOT (
      COALESCE(b.variant_raw->>'provisional', 'false') = 'true'
      AND b.variant_raw->>'reason' = 'official_lineup_not_fetched_yet'
      AND b.variant_name = b.series_name
      AND b.source_type = 'official_site'
      AND b.review_required = true
      AND COALESCE(b.variant_raw->>'image_scope', '') <> 'variant'
    ) THEN 'provisional_contract_mismatch'
    ELSE COALESCE(c.provider_reason, 'unrecognized_provider_pattern')
  END AS reason
FROM _glne_base b
LEFT JOIN _glne_classified c ON c.variant_id = b.variant_id
LEFT JOIN _glne_candidates safe ON safe.variant_id = b.variant_id
WHERE safe.variant_id IS NULL;

DO $glne_pre$
DECLARE
  v_base int;
  v_semantic int;
  v_candidates int;
  v_bandai int;
  v_tta int;
  v_rejected int;
  v_diff_frame int;
  v_diff_asset int;
  v_contract_mismatch int;
  v_digest text;
  v_payload text;
  v_raw_missing int;
  v_series_missing int;
  v_exact int;
  v_formal_near int;
  v_user_triggers int;
BEGIN
  SELECT COUNT(*)::int INTO v_base FROM _glne_base;
  SELECT COUNT(*)::int INTO v_semantic FROM _glne_semantic;
  SELECT COUNT(*)::int INTO v_candidates FROM _glne_candidates;
  SELECT COUNT(*) FILTER (WHERE provider = 'bandai')::int,
         COUNT(*) FILTER (WHERE provider = 'takaratomy_arts')::int
    INTO v_bandai, v_tta
  FROM _glne_candidates;
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE reason = 'same_asset_different_frame')::int,
         COUNT(*) FILTER (WHERE reason = 'different_asset_id')::int,
         COUNT(*) FILTER (WHERE reason = 'provisional_contract_mismatch')::int
    INTO v_rejected, v_diff_frame, v_diff_asset, v_contract_mismatch
  FROM _glne_rejected;

  SELECT STRING_AGG(
    JSONB_BUILD_OBJECT(
      'variant_id', variant_id,
      'provider', provider,
      'reason', reason,
      'before_url', before_url,
      'parent_url', parent_url,
      'canonical_asset_identity', canonical_asset_identity
    )::text,
    E'\n'
    ORDER BY variant_id COLLATE "C"
  ) INTO v_payload
  FROM _glne_candidates;
  v_digest := 'sha256:' || ENCODE(
    DIGEST(CONVERT_TO(COALESCE(v_payload, ''), 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT COUNT(*)::int INTO v_raw_missing FROM public.variants WHERE image IS NULL;
  SELECT COUNT(*)::int INTO v_series_missing FROM public.series WHERE image_url IS NULL;
  SELECT COUNT(*)::int INTO v_exact
  FROM public.variants v
  JOIN public.series s ON s.id = v.series_id
  WHERE v.image IS NOT NULL AND s.image_url IS NOT NULL AND v.image = s.image_url;

  SELECT COUNT(*)::int INTO v_formal_near
  FROM (
    SELECT
      v.image AS variant_image,
      s.image_url AS parent_image,
      REGEXP_MATCH(v.image, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS vb,
      REGEXP_MATCH(s.image_url, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS pb
    FROM public.variants v
    JOIN public.series s ON s.id = v.series_id
    WHERE v.variant_type <> 'provisional'
      AND v.image IS NOT NULL
      AND s.image_url IS NOT NULL
      AND v.image <> s.image_url
  ) formal
  WHERE vb IS NOT NULL
    AND pb IS NOT NULL
    AND vb[2] = pb[2]
    AND vb[3] = pb[3];

  SELECT COUNT(*)::int INTO v_user_triggers
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'variants'
    AND t.tgisinternal = false;

  IF v_candidates = 0 THEN
    IF v_base <> 3
      OR v_semantic <> 2
      OR v_rejected <> 3
      OR v_diff_frame <> 2
      OR v_diff_asset <> 0
      OR v_contract_mismatch <> 1
      OR v_raw_missing <> 11054
      OR v_series_missing <> 0
      OR v_exact <> 0
      OR v_formal_near <> 9
      OR v_user_triggers <> 0
    THEN
      RAISE EXCEPTION 'near_equivalent_cleanup_idempotent_precondition_mismatch';
    END IF;
    RETURN;
  END IF;

  IF v_base <> 3985
    OR v_semantic <> 3984
    OR v_candidates <> 3982
    OR v_bandai <> 3931
    OR v_tta <> 51
    OR v_rejected <> 3
    OR v_diff_frame <> 2
    OR v_diff_asset <> 0
    OR v_contract_mismatch <> 1
    OR v_digest <> 'sha256:69eddb0b502ef4febcc2d0e56dcbd4da188b026255c827c700b44fa7261bcd5c'
    OR v_raw_missing <> 7072
    OR v_series_missing <> 0
    OR v_exact <> 0
    OR v_formal_near <> 9
    OR v_user_triggers <> 0
  THEN
    RAISE EXCEPTION 'near_equivalent_cleanup_precondition_mismatch';
  END IF;
END
$glne_pre$;

DO $glne_lock$
BEGIN
  PERFORM 1
  FROM public.series s
  JOIN (SELECT DISTINCT series_id FROM _glne_candidates) c ON c.series_id = s.id
  ORDER BY s.id COLLATE "C"
  FOR UPDATE OF s;

  PERFORM 1
  FROM public.variants v
  JOIN _glne_candidates c ON c.variant_id = v.id
  ORDER BY v.id COLLATE "C"
  FOR UPDATE OF v;
END
$glne_lock$;

DO $glne_drift$
DECLARE
  v_drift int;
BEGIN
  SELECT COUNT(*)::int INTO v_drift
  FROM _glne_candidates c
  LEFT JOIN public.variants v ON v.id = c.variant_id
  LEFT JOIN public.series s ON s.id = c.series_id
  WHERE v.id IS NULL
    OR s.id IS NULL
    OR v.series_id IS DISTINCT FROM c.series_id
    OR v.image IS DISTINCT FROM c.before_url
    OR v.updated_at IS DISTINCT FROM c.expected_updated_at
    OR s.image_url IS DISTINCT FROM c.parent_url
    OR s.updated_at IS DISTINCT FROM c.parent_updated_at
    OR v.variant_type IS DISTINCT FROM 'provisional'
    OR v.source_type IS DISTINCT FROM 'official_site'
    OR v.review_required IS DISTINCT FROM true
    OR COALESCE(v.raw->>'provisional', 'false') <> 'true'
    OR v.raw->>'reason' IS DISTINCT FROM 'official_lineup_not_fetched_yet'
    OR COALESCE(v.raw->>'image_scope', '') = 'variant'
    OR v.name IS DISTINCT FROM s.name;

  IF v_drift <> 0 THEN
    RAISE EXCEPTION 'near_equivalent_cleanup_concurrent_drift';
  END IF;
END
$glne_drift$;

DO $glne_write$
DECLARE
  v_candidate_count int;
  v_batch_start int;
  v_expected int;
  v_affected int;
  v_total int := 0;
BEGIN
  SELECT COUNT(*)::int INTO v_candidate_count FROM _glne_candidates;
  IF v_candidate_count = 0 THEN
    RETURN;
  END IF;

  FOR v_batch_start IN 1..v_candidate_count BY 250 LOOP
    v_expected := LEAST(250, v_candidate_count - v_batch_start + 1);

    WITH batch AS (
      SELECT *
      FROM _glne_candidates
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
      AND v.review_required = true
      AND v.image = b.before_url
      AND v.updated_at IS NOT DISTINCT FROM b.expected_updated_at
      AND COALESCE(v.raw->>'provisional', 'false') = 'true'
      AND v.raw->>'reason' = 'official_lineup_not_fetched_yet'
      AND COALESCE(v.raw->>'image_scope', '') <> 'variant'
      AND EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.id = b.series_id
          AND s.name = v.name
          AND s.image_url = b.parent_url
          AND s.updated_at IS NOT DISTINCT FROM b.parent_updated_at
      );

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> v_expected THEN
      RAISE EXCEPTION 'near_equivalent_cleanup_batch_drift at %, expected %, got %',
        v_batch_start, v_expected, v_affected;
    END IF;
    v_total := v_total + v_affected;
  END LOOP;

  IF v_total <> 3982 THEN
    RAISE EXCEPTION 'near_equivalent_cleanup_total_mismatch expected 3982 got %', v_total;
  END IF;
END
$glne_write$;

DO $glne_post$
DECLARE
  v_candidate_count int;
  v_target_null int;
  v_updated_at_drift int;
  v_parent_drift int;
  v_remaining_safe int;
  v_remaining_non_null_provisional int;
  v_exact int;
  v_formal_near int;
  v_raw_missing int;
  v_series_missing int;
BEGIN
  SELECT COUNT(*)::int INTO v_candidate_count FROM _glne_candidates;

  SELECT COUNT(*)::int INTO v_target_null
  FROM public.variants v
  JOIN _glne_candidates c ON c.variant_id = v.id
  WHERE v.image IS NULL;

  SELECT COUNT(*)::int INTO v_updated_at_drift
  FROM public.variants v
  JOIN _glne_candidates c ON c.variant_id = v.id
  WHERE v.updated_at IS DISTINCT FROM c.expected_updated_at;

  SELECT COUNT(*)::int INTO v_parent_drift
  FROM public.series s
  JOIN (
    SELECT DISTINCT series_id, parent_url, parent_updated_at
    FROM _glne_candidates
  ) c ON c.series_id = s.id
  WHERE s.image_url IS DISTINCT FROM c.parent_url
    OR s.updated_at IS DISTINCT FROM c.parent_updated_at;

  WITH live AS MATERIALIZED (
    SELECT
      v.*,
      s.name AS series_name,
      s.image_url AS parent_url,
      REGEXP_MATCH(v.image, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS vb,
      REGEXP_MATCH(s.image_url, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS pb,
      REGEXP_MATCH(v.image, '^https://www[.]takaratomy-arts[.]co[.]jp/upfiles/products/([^/?]+)_([sb])[.]jpg$') AS vt,
      REGEXP_MATCH(s.image_url, '^https://www[.]takaratomy-arts[.]co[.]jp/upfiles/products/([^/?]+)_([sb])[.]jpg$') AS pt
    FROM public.variants v
    JOIN public.series s ON s.id = v.series_id
    WHERE v.variant_type = 'provisional'
      AND v.image IS NOT NULL
      AND s.image_url IS NOT NULL
      AND v.image <> s.image_url
      AND COALESCE(v.raw->>'provisional', 'false') = 'true'
      AND v.raw->>'reason' = 'official_lineup_not_fetched_yet'
      AND v.name = s.name
      AND v.source_type = 'official_site'
      AND v.review_required = true
      AND COALESCE(v.raw->>'image_scope', '') <> 'variant'
  )
  SELECT COUNT(*)::int INTO v_remaining_safe
  FROM live
  WHERE (
    vb IS NOT NULL AND pb IS NOT NULL
    AND vb[2] = pb[2] AND vb[3] = pb[3] AND vb[1] <> pb[1]
  ) OR (
    vt IS NOT NULL AND pt IS NOT NULL
    AND vt[1] = pt[1] AND vt[2] <> pt[2]
  );

  SELECT COUNT(*)::int INTO v_remaining_non_null_provisional
  FROM public.variants v
  JOIN public.series s ON s.id = v.series_id
  WHERE v.variant_type = 'provisional'
    AND v.image IS NOT NULL
    AND s.image_url IS NOT NULL
    AND v.image <> s.image_url;

  SELECT COUNT(*)::int INTO v_exact
  FROM public.variants v
  JOIN public.series s ON s.id = v.series_id
  WHERE v.image IS NOT NULL AND s.image_url IS NOT NULL AND v.image = s.image_url;

  SELECT COUNT(*)::int INTO v_formal_near
  FROM (
    SELECT
      v.image AS variant_image,
      s.image_url AS parent_image,
      REGEXP_MATCH(v.image, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS vb,
      REGEXP_MATCH(s.image_url, '^https://bandai-a[.]akamaihd[.]net/bc/img/model/(b|xl)/([0-9]+)_([0-9]+)[.]jpg$') AS pb
    FROM public.variants v
    JOIN public.series s ON s.id = v.series_id
    WHERE v.variant_type <> 'provisional'
      AND v.image IS NOT NULL
      AND s.image_url IS NOT NULL
      AND v.image <> s.image_url
  ) formal
  WHERE vb IS NOT NULL
    AND pb IS NOT NULL
    AND vb[2] = pb[2]
    AND vb[3] = pb[3];

  SELECT COUNT(*)::int INTO v_raw_missing FROM public.variants WHERE image IS NULL;
  SELECT COUNT(*)::int INTO v_series_missing FROM public.series WHERE image_url IS NULL;

  IF v_candidate_count = 0 THEN
    IF v_target_null <> 0
      OR v_updated_at_drift <> 0
      OR v_parent_drift <> 0
      OR v_remaining_safe <> 0
      OR v_remaining_non_null_provisional <> 3
      OR v_exact <> 0
      OR v_formal_near <> 9
      OR v_raw_missing <> 11054
      OR v_series_missing <> 0
    THEN
      RAISE EXCEPTION 'near_equivalent_cleanup_idempotent_postcondition_mismatch';
    END IF;
    RETURN;
  END IF;

  IF v_candidate_count <> 3982
    OR v_target_null <> 3982
    OR v_updated_at_drift <> 0
    OR v_parent_drift <> 0
    OR v_remaining_safe <> 0
    OR v_remaining_non_null_provisional <> 3
    OR v_exact <> 0
    OR v_formal_near <> 9
    OR v_raw_missing <> 11054
    OR v_series_missing <> 0
  THEN
    RAISE EXCEPTION 'near_equivalent_cleanup_postcondition_mismatch';
  END IF;
END
$glne_post$;

COMMIT;

SELECT
  (SELECT COUNT(*)::int FROM public.variants WHERE image IS NULL) AS raw_variant_image_missing_after,
  (SELECT COUNT(*)::int FROM public.series WHERE image_url IS NULL) AS series_image_missing_after,
  (SELECT COUNT(*)::int
    FROM public.variants v
    JOIN public.series s ON s.id = v.series_id
    WHERE v.image IS NOT NULL AND s.image_url IS NOT NULL AND v.image = s.image_url) AS exact_parent_conflicts_after;
