-- Repair the R4 source_listing_id validator without rewriting the already-applied
-- 20260903033000 migration. The original JavaScript 1..300 contract is preserved
-- as explicit SQL length validation plus a PostgreSQL-safe ASCII allowlist regex.

DO $r4_repair$
DECLARE
  v_definition text;
  v_broken_guard constant text :=
    'or coalesce(e.value->>''source_listing_id'', '''') !~ ''^[A-Za-z0-9:._-]{1,300}$''';
  v_repaired_guard constant text :=
    'or length(coalesce(e.value->>''source_listing_id'', '''')) not between 1 and 300
      or coalesce(e.value->>''source_listing_id'', '''') !~ ''^[A-Za-z0-9:._-]+$''';
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef('public.apply_market_depth_r4_atomic_v1(jsonb)'::regprocedure)
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'market_depth_r4_repair_missing_function';
  END IF;

  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_broken_guard, '')))
    / length(v_broken_guard);

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'market_depth_r4_repair_unexpected_source_guard_count:%', v_occurrences;
  END IF;

  v_definition := replace(v_definition, v_broken_guard, v_repaired_guard);

  IF position(v_broken_guard IN v_definition) > 0
    OR position(v_repaired_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'market_depth_r4_repair_rewrite_failed';
  END IF;

  EXECUTE v_definition;
END
$r4_repair$;

-- Reassert the reviewed callable-surface contract after CREATE OR REPLACE.
ALTER FUNCTION public.apply_market_depth_r4_atomic_v1(jsonb) SECURITY INVOKER;
ALTER FUNCTION public.apply_market_depth_r4_atomic_v1(jsonb) SET search_path TO '';
REVOKE EXECUTE ON FUNCTION public.apply_market_depth_r4_atomic_v1(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_market_depth_r4_atomic_v1(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_market_depth_r4_atomic_v1(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_market_depth_r4_atomic_v1(jsonb) TO service_role;

-- Runtime proof. This intentionally invokes the repaired function with a real valid
-- batch inside a PL/pgSQL exception subtransaction. A sentinel exception is raised
-- only after all success assertions pass; PostgreSQL rolls every fixture/write from
-- the inner block back before the handler swallows that one sentinel. Any function
-- error or assertion error is re-raised and fails the migration. The actual R4 call
-- runs under service_role so SECURITY INVOKER table privileges are exercised too.
-- This makes a fresh disposable `db reset` cover the callable path static migration
-- creation checks previously missed, while leaving zero durable fixture rows.
DO $r4_runtime_proof$
DECLARE
  v_series_id constant text := '__ci_r4_217_series__';
  v_variant_id constant text := '__ci_r4_217_variant__';
  v_existing_listing_id constant text := '__ci_r4_217_existing__';
  v_candidate_source_id constant text := 'ci_r4_runtime_candidate';
  v_candidate_listing_id constant text := 'yahoo-ci-r4-runtime-candidate';
  v_candidate_key constant text := '0123456789abcdef';
  v_observation_key constant text := 'depth-r4-runtime-proof-217';
  v_existing_url constant text := 'https://store.shopping.yahoo.co.jp/ci-r4-runtime/existing.html';
  v_candidate_url constant text := 'https://store.shopping.yahoo.co.jp/ci-r4-runtime/candidate.html';
  v_source_time timestamptz := clock_timestamp();
  v_observation_id text;
  v_batch jsonb;
  v_result jsonb;
  v_depth integer;
  v_security_definer boolean;
  v_empty_search_path boolean;
  v_public_execute boolean;
BEGIN
  SELECT
    p.prosecdef,
    coalesce(p.proconfig, '{}'::text[]) @> ARRAY['search_path=""']::text[],
    EXISTS (
      SELECT 1
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
  INTO v_security_definer, v_empty_search_path, v_public_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'apply_market_depth_r4_atomic_v1'
    AND pg_get_function_identity_arguments(p.oid) = 'p_batch jsonb';

  IF v_security_definer IS DISTINCT FROM false
    OR v_empty_search_path IS DISTINCT FROM true
    OR v_public_execute IS DISTINCT FROM false
    OR has_function_privilege('anon', 'public.apply_market_depth_r4_atomic_v1(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.apply_market_depth_r4_atomic_v1(jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.apply_market_depth_r4_atomic_v1(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'market_depth_r4_runtime_proof_security_contract_mismatch';
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM public.series WHERE id = v_series_id)
      OR EXISTS (SELECT 1 FROM public.variants WHERE id = v_variant_id)
      OR EXISTS (
        SELECT 1
        FROM public.market_listings
        WHERE id IN (v_existing_listing_id, v_candidate_listing_id)
      ) THEN
      RAISE EXCEPTION 'market_depth_r4_runtime_proof_fixture_collision';
    END IF;

    INSERT INTO public.series (id, slug, name, raw)
    VALUES (v_series_id, '__ci-r4-217-series__', 'CI R4 217 Series', '{}'::jsonb);

    INSERT INTO public.variants (
      id, slug, series_id, name, variant_type, review_required, raw
    ) VALUES (
      v_variant_id,
      '__ci-r4-217-variant__',
      v_series_id,
      'CI R4 217 Variant',
      'normal',
      false,
      '{}'::jsonb
    );

    INSERT INTO public.market_listings (
      id, variant_id, matched_variant_id, series_id, title,
      listing_type, market_review_type, price, status,
      source, source_type, source_url, listed_at, last_observed_at,
      review_required, raw
    ) VALUES (
      v_existing_listing_id,
      v_variant_id,
      v_variant_id,
      v_series_id,
      'CI R4 217 Existing Listing',
      'single',
      'single',
      1500,
      'active',
      'yahoo_shopping',
      'marketplace',
      v_existing_url,
      v_source_time,
      v_source_time,
      false,
      jsonb_build_object(
        'provider', 'yahoo_shopping',
        'source_listing_id', 'ci_r4_runtime_existing',
        'public_url', v_existing_url
      )
    );

    v_observation_id := 'market-depth-r4-' || substr(encode(extensions.digest(
      convert_to(concat_ws(chr(31),
        'gacha-lens',
        'market-depth-r4-v1',
        v_observation_key,
        v_candidate_key,
        v_candidate_listing_id
      ), 'UTF8'),
      'sha256'
    ), 'hex'), 1, 32);

    v_batch := jsonb_build_object(
      'schema_version', 1,
      'kind', 'market_depth_r4_atomic_v1',
      'head_sha', repeat('a', 40),
      'batch_digest', repeat('b', 64),
      'observation_key', v_observation_key,
      'source_r3_run_id', 'ci-r4-runtime-proof-217',
      'source_r3_main_sha', repeat('c', 40),
      'source_r3_artifact_digest', repeat('d', 64),
      'source_r3_generated_at', v_source_time,
      'candidates', jsonb_build_array(jsonb_build_object(
        'candidate_key', v_candidate_key,
        'selection_fingerprint', repeat('e', 64),
        'variant_id', v_variant_id,
        'series_id', v_series_id,
        'provider', 'yahoo_shopping',
        'source_listing_id', v_candidate_source_id,
        'public_url', v_candidate_url,
        'listing_id', v_candidate_listing_id,
        'title', 'CI R4 217 Candidate Listing',
        'price', 980,
        'status', 'active',
        'expected_existing_listing_ids', jsonb_build_array(v_existing_listing_id),
        'observation_id', v_observation_id
      ))
    );

    -- SET LOCAL is part of this inner subtransaction and is automatically restored
    -- when the sentinel exception rolls the proof block back.
    SET LOCAL ROLE service_role;
    v_result := public.apply_market_depth_r4_atomic_v1(v_batch);

    IF v_result->>'kind' IS DISTINCT FROM 'market_depth_r4_atomic_v1'
      OR coalesce((v_result->>'inserted_count')::integer, -1) <> 1
      OR v_result->'listing_ids' IS DISTINCT FROM jsonb_build_array(v_candidate_listing_id)
      OR v_result->'observation_ids' IS DISTINCT FROM jsonb_build_array(v_observation_id)
      OR v_result->'target_depths' IS DISTINCT FROM jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant_id,
        'before', 1,
        'inserted', 1,
        'after', 2
      )) THEN
      RAISE EXCEPTION 'market_depth_r4_runtime_proof_result_mismatch:%', v_result;
    END IF;

    IF (SELECT count(*) FROM public.market_listings WHERE id = v_candidate_listing_id) <> 1
      OR (SELECT count(*) FROM public.market_listing_observations WHERE id = v_observation_id) <> 1
      OR EXISTS (
        SELECT 1
        FROM public.market_listings
        WHERE id = v_candidate_listing_id
          AND (status <> 'active' OR sold_at IS NOT NULL OR review_required IS TRUE)
      ) THEN
      RAISE EXCEPTION 'market_depth_r4_runtime_proof_insert_mismatch';
    END IF;

    SELECT count(*)
      INTO v_depth
    FROM public.market_listings ml
    WHERE coalesce(ml.matched_variant_id, ml.variant_id) = v_variant_id
      AND ml.status = 'active'
      AND ml.listing_type = 'single'
      AND ml.review_required IS NOT TRUE
      AND coalesce(ml.last_observed_at, ml.listed_at, ml.created_at) >= clock_timestamp() - interval '30 days';

    IF v_depth <> 2 THEN
      RAISE EXCEPTION 'market_depth_r4_runtime_proof_depth_mismatch:%', v_depth;
    END IF;

    RAISE EXCEPTION 'market_depth_r4_runtime_proof_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM = 'market_depth_r4_runtime_proof_rollback' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
  END;

  IF current_user <> session_user THEN
    RAISE EXCEPTION 'market_depth_r4_runtime_proof_role_not_restored:%:%', current_user, session_user;
  END IF;

  IF EXISTS (SELECT 1 FROM public.series WHERE id = v_series_id)
    OR EXISTS (SELECT 1 FROM public.variants WHERE id = v_variant_id)
    OR EXISTS (
      SELECT 1
      FROM public.market_listings
      WHERE id IN (v_existing_listing_id, v_candidate_listing_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.market_listing_observations
      WHERE id = v_observation_id
    ) THEN
    RAISE EXCEPTION 'market_depth_r4_runtime_proof_residue';
  END IF;

  -- Length > 300 must fail closed as an ordinary candidate validation failure,
  -- not as a PostgreSQL regex-compilation/runtime error.
  v_batch := jsonb_build_object(
    'schema_version', 1,
    'kind', 'market_depth_r4_atomic_v1',
    'head_sha', repeat('a', 40),
    'batch_digest', repeat('b', 64),
    'observation_key', 'depth-r4-runtime-invalid-length-217',
    'source_r3_run_id', 'ci-r4-runtime-proof-217',
    'source_r3_main_sha', repeat('c', 40),
    'source_r3_artifact_digest', repeat('d', 64),
    'source_r3_generated_at', v_source_time,
    'candidates', jsonb_build_array(jsonb_build_object(
      'candidate_key', 'fedcba9876543210',
      'selection_fingerprint', repeat('e', 64),
      'variant_id', '__ci_missing_variant__',
      'series_id', '__ci_missing_series__',
      'provider', 'yahoo_shopping',
      'source_listing_id', repeat('a', 301),
      'public_url', 'https://store.shopping.yahoo.co.jp/ci-r4-runtime/invalid-length.html',
      'listing_id', 'yahoo-ci-r4-invalid-length',
      'title', 'CI R4 Invalid Length',
      'price', 1,
      'status', 'active',
      'expected_existing_listing_ids', jsonb_build_array('__ci_missing_existing__'),
      'observation_id', 'market-depth-r4-00000000000000000000000000000000'
    ))
  );

  BEGIN
    PERFORM public.apply_market_depth_r4_atomic_v1(v_batch);
    RAISE EXCEPTION 'market_depth_r4_runtime_proof_accepted_invalid_length';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'market_depth_r4_invalid_candidate' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
  END;

  -- An otherwise short ID containing a disallowed character must also fail closed.
  v_batch := jsonb_set(
    v_batch,
    '{candidates,0,source_listing_id}',
    to_jsonb('bad/source'::text),
    false
  );

  BEGIN
    PERFORM public.apply_market_depth_r4_atomic_v1(v_batch);
    RAISE EXCEPTION 'market_depth_r4_runtime_proof_accepted_invalid_character';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'market_depth_r4_invalid_candidate' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
  END;
END
$r4_runtime_proof$;
