-- Worker A: deterministic near-equivalent parent-artwork provenance audit.
-- Read-only. A row is safe only when BOTH the synthetic provisional contract and
-- provider-specific same-asset/same-frame size-derivative identity are proven.

WITH base AS MATERIALIZED (
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
    AND v.image <> s.image_url
),
semantic AS MATERIALIZED (
  SELECT *
  FROM base
  WHERE COALESCE(variant_raw->>'provisional', 'false') = 'true'
    AND variant_raw->>'reason' = 'official_lineup_not_fetched_yet'
    AND variant_name = series_name
    AND source_type = 'official_site'
    AND review_required = true
    AND COALESCE(variant_raw->>'image_scope', '') <> 'variant'
),
classified AS MATERIALIZED (
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
  FROM semantic
),
candidates AS MATERIALIZED (
  SELECT
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
  FROM classified
  WHERE provider_reason IN (
    'bandai_exact_asset_size_derivative',
    'tarts_exact_asset_size_derivative'
  )
),
candidate_payload AS (
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
  ) AS payload
  FROM candidates
),
rejected AS MATERIALIZED (
  SELECT
    b.variant_id,
    b.series_id,
    b.variant_name,
    b.series_name,
    b.before_url,
    b.parent_url,
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
  FROM base b
  LEFT JOIN classified c ON c.variant_id = b.variant_id
  LEFT JOIN candidates safe ON safe.variant_id = b.variant_id
  WHERE safe.variant_id IS NULL
)
SELECT
  (SELECT COUNT(*)::int FROM base) AS provisional_non_null_cohort,
  (SELECT COUNT(*)::int FROM semantic) AS provisional_semantic_match,
  (SELECT COUNT(*)::int FROM candidates) AS provider_safe_candidate_count,
  (SELECT COUNT(*)::int FROM candidates WHERE provider = 'bandai') AS bandai_safe,
  (SELECT COUNT(*)::int FROM candidates WHERE provider = 'takaratomy_arts') AS takaratomy_arts_safe,
  (SELECT COUNT(*)::int FROM rejected) AS rejected_or_ambiguous,
  (SELECT COUNT(*)::int FROM rejected WHERE reason = 'same_asset_different_frame') AS same_asset_different_frame,
  (SELECT COUNT(*)::int FROM rejected WHERE reason = 'different_asset_id') AS different_asset_id,
  (SELECT COUNT(*)::int FROM rejected WHERE reason = 'provisional_contract_mismatch') AS provisional_contract_mismatch,
  'sha256:' || ENCODE(
    DIGEST(CONVERT_TO(COALESCE((SELECT payload FROM candidate_payload), ''), 'UTF8'),
    'sha256'),
    'hex'
  ) AS candidate_sha256,
  (SELECT COUNT(*)::int
    FROM public.variants v
    JOIN public.series s ON s.id = v.series_id
    WHERE v.image IS NOT NULL AND s.image_url IS NOT NULL AND v.image = s.image_url) AS exact_parent_conflicts,
  (SELECT COUNT(*)::int FROM public.variants WHERE image IS NULL) AS raw_variant_image_missing,
  (SELECT COUNT(*)::int FROM public.series WHERE image_url IS NULL) AS series_image_missing,
  (SELECT COUNT(*)::int
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'variants'
      AND t.tgisinternal = false) AS variants_user_trigger_count;
