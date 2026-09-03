create or replace function public.apply_market_depth_r4_atomic_v1(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidates jsonb;
  v_count integer;
  v_entry jsonb;
  v_observation_key text;
  v_source_r3_run_id text;
  v_source_r3_main_sha text;
  v_source_r3_artifact_digest text;
  v_source_r3_generated_at timestamptz;
  v_candidate_key text;
  v_selection_fingerprint text;
  v_variant_id text;
  v_series_id text;
  v_provider text;
  v_source text;
  v_source_listing_id text;
  v_public_url text;
  v_listing_id text;
  v_title text;
  v_price integer;
  v_status text;
  v_observation_id text;
  v_expected_listing_id text;
  v_expected_observation_id text;
  v_expected_existing_ids text[];
  v_actual_existing_ids text[];
  v_listing_ids text[] := array[]::text[];
  v_observation_ids text[] := array[]::text[];
  v_variant text;
  v_before integer;
  v_inserted integer;
  v_after integer;
  v_target_depths jsonb := '[]'::jsonb;
begin
  if p_batch is null or jsonb_typeof(p_batch) <> 'object'
    or coalesce((p_batch->>'schema_version')::integer, 0) <> 1
    or p_batch->>'kind' <> 'market_depth_r4_atomic_v1' then
    raise exception 'market_depth_r4_invalid_batch';
  end if;

  v_candidates := p_batch->'candidates';
  v_count := case when jsonb_typeof(v_candidates) = 'array' then jsonb_array_length(v_candidates) else 0 end;
  if v_count < 1 or v_count > 10 then
    raise exception 'market_depth_r4_invalid_batch_size';
  end if;

  if coalesce(p_batch->>'head_sha', '') !~ '^[0-9a-f]{40}$'
    or coalesce(p_batch->>'batch_digest', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_batch->>'observation_key', '') !~ '^[a-z0-9][a-z0-9:_-]{0,119}$'
    or length(coalesce(p_batch->>'source_r3_run_id', '')) < 1
    or coalesce(p_batch->>'source_r3_main_sha', '') !~ '^[0-9a-f]{40}$'
    or coalesce(p_batch->>'source_r3_artifact_digest', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'market_depth_r4_invalid_identity';
  end if;

  begin
    v_source_r3_generated_at := (p_batch->>'source_r3_generated_at')::timestamptz;
  exception when others then
    raise exception 'market_depth_r4_invalid_source_time';
  end;
  if v_source_r3_generated_at is null
    or v_source_r3_generated_at > clock_timestamp() + interval '5 minutes'
    or v_source_r3_generated_at < clock_timestamp() - interval '7 days' then
    raise exception 'market_depth_r4_stale_source_evidence';
  end if;

  v_observation_key := p_batch->>'observation_key';
  v_source_r3_run_id := p_batch->>'source_r3_run_id';
  v_source_r3_main_sha := p_batch->>'source_r3_main_sha';
  v_source_r3_artifact_digest := p_batch->>'source_r3_artifact_digest';

  if exists (
    select 1
    from jsonb_array_elements(v_candidates) as e(value)
    where jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value->>'candidate_key', '') !~ '^[0-9a-f]{16}$'
      or coalesce(e.value->>'selection_fingerprint', '') !~ '^[0-9a-f]{64}$'
      or length(coalesce(e.value->>'variant_id', '')) < 1
      or length(coalesce(e.value->>'series_id', '')) < 1
      or coalesce(e.value->>'provider', '') not in ('rakuten_ichiba', 'yahoo_shopping')
      or coalesce(e.value->>'source_listing_id', '') !~ '^[A-Za-z0-9:._-]{1,300}$'
      or length(coalesce(e.value->>'public_url', '')) < 1
      or length(coalesce(e.value->>'listing_id', '')) < 1
      or length(coalesce(e.value->>'title', '')) < 1
      or coalesce((e.value->>'price')::numeric, 0) <= 0
      or (e.value->>'price')::numeric <> trunc((e.value->>'price')::numeric)
      or e.value->>'status' <> 'active'
      or jsonb_typeof(e.value->'expected_existing_listing_ids') <> 'array'
      or jsonb_array_length(e.value->'expected_existing_listing_ids') < 1
  ) then
    raise exception 'market_depth_r4_invalid_candidate';
  end if;

  if (select count(distinct e.value->>'candidate_key') from jsonb_array_elements(v_candidates) e(value)) <> v_count
    or (select count(distinct e.value->>'selection_fingerprint') from jsonb_array_elements(v_candidates) e(value)) <> v_count
    or (select count(distinct e.value->>'listing_id') from jsonb_array_elements(v_candidates) e(value)) <> v_count
    or (select count(distinct (e.value->>'provider') || ':' || (e.value->>'source_listing_id')) from jsonb_array_elements(v_candidates) e(value)) <> v_count
    or (select count(distinct e.value->>'public_url') from jsonb_array_elements(v_candidates) e(value)) <> v_count then
    raise exception 'market_depth_r4_duplicate_candidate_identity';
  end if;

  if exists (
    select 1
    from (
      select e.value->>'variant_id' as variant_id,
             count(distinct (e.value->'expected_existing_listing_ids')::text) as snapshots
      from jsonb_array_elements(v_candidates) e(value)
      group by e.value->>'variant_id'
    ) grouped
    where grouped.snapshots <> 1
  ) then
    raise exception 'market_depth_r4_inconsistent_target_snapshot';
  end if;

  lock table public.variants in share mode;
  lock table public.series in share mode;
  lock table public.import_issues in share mode;
  lock table public.market_listings in share row exclusive mode;
  lock table public.market_listing_observations in share row exclusive mode;

  -- Validate the entire frozen batch before the first insert.
  for v_entry in select value from jsonb_array_elements(v_candidates)
  loop
    v_candidate_key := v_entry->>'candidate_key';
    v_selection_fingerprint := v_entry->>'selection_fingerprint';
    v_variant_id := v_entry->>'variant_id';
    v_series_id := v_entry->>'series_id';
    v_provider := v_entry->>'provider';
    v_source_listing_id := v_entry->>'source_listing_id';
    v_public_url := v_entry->>'public_url';
    v_listing_id := v_entry->>'listing_id';
    v_title := v_entry->>'title';
    v_price := (v_entry->>'price')::integer;
    v_status := v_entry->>'status';
    v_source := case v_provider when 'rakuten_ichiba' then 'rakuten' when 'yahoo_shopping' then 'yahoo_shopping' else null end;

    if v_source is null
      or v_public_url like '%?%'
      or v_public_url like '%#%'
      or (v_provider = 'yahoo_shopping' and v_public_url !~ '^https://store\.shopping\.yahoo\.co\.jp/[^?#]+$')
      or (v_provider = 'rakuten_ichiba' and v_public_url !~ '^https://item\.rakuten\.co\.jp/[^?#]+$') then
      raise exception 'market_depth_r4_invalid_public_url';
    end if;

    v_expected_listing_id := left(trim(both '-' from regexp_replace(
      regexp_replace(lower((case v_provider when 'rakuten_ichiba' then 'rakuten' else 'yahoo' end) || '-' || v_source_listing_id), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )), 140);
    if v_listing_id <> v_expected_listing_id then
      raise exception 'market_depth_r4_listing_identity_mismatch';
    end if;

    v_expected_observation_id := 'market-depth-r4-' || substr(encode(extensions.digest(
      convert_to(concat_ws(chr(31), 'gacha-lens', 'market-depth-r4-v1', v_observation_key, v_candidate_key, v_listing_id), 'UTF8'),
      'sha256'
    ), 'hex'), 1, 32);
    v_observation_id := v_entry->>'observation_id';
    if coalesce(v_observation_id, '') <> v_expected_observation_id then
      raise exception 'market_depth_r4_observation_identity_mismatch';
    end if;

    if not exists (
      select 1
      from public.variants v
      join public.series s on s.id = v.series_id
      where v.id = v_variant_id
        and v.series_id = v_series_id
        and s.id = v_series_id
        and v.review_required is not true
        and coalesce(v.variant_type, '') <> 'provisional'
    ) then
      raise exception 'market_depth_r4_catalog_drift';
    end if;

    if exists (
      select 1
      from public.import_issues i
      where i.resolved is not true
        and ((i.table_name = 'variants' and i.record_id = v_variant_id)
          or (i.table_name = 'series' and i.record_id = v_series_id))
    ) then
      raise exception 'market_depth_r4_unresolved_catalog_issue';
    end if;

    select coalesce(array_agg(ml.id order by ml.id), array[]::text[])
      into v_actual_existing_ids
    from public.market_listings ml
    where coalesce(ml.matched_variant_id, ml.variant_id) = v_variant_id
      and ml.status = 'active'
      and ml.listing_type = 'single'
      and ml.review_required is not true
      and coalesce(ml.last_observed_at, ml.listed_at, ml.created_at) >= clock_timestamp() - interval '30 days';

    select coalesce(array_agg(x.value order by x.value), array[]::text[])
      into v_expected_existing_ids
    from jsonb_array_elements_text(v_entry->'expected_existing_listing_ids') x(value);

    if cardinality(v_expected_existing_ids) <> (
      select count(distinct x.value)
      from jsonb_array_elements_text(v_entry->'expected_existing_listing_ids') x(value)
    ) or exists (
      select 1
      from unnest(v_expected_existing_ids) expected_id
      where expected_id is null or btrim(expected_id) = ''
    ) then
      raise exception 'market_depth_r4_invalid_expected_depth_snapshot';
    end if;

    if v_actual_existing_ids is distinct from v_expected_existing_ids then
      raise exception 'market_depth_r4_existing_depth_drift';
    end if;

    if v_listing_id = any(v_expected_existing_ids) then
      raise exception 'market_depth_r4_candidate_already_expected';
    end if;

    if exists (select 1 from public.market_listings ml where ml.id = v_listing_id)
      or exists (select 1 from public.market_listing_observations mo where mo.id = v_observation_id) then
      raise exception 'market_depth_r4_id_collision';
    end if;

    if exists (
      select 1
      from public.market_listings ml
      where regexp_replace(split_part(split_part(coalesce(ml.source_url, ''), '?', 1), '#', 1), '/+$', '') =
            regexp_replace(v_public_url, '/+$', '')
    ) then
      raise exception 'market_depth_r4_public_url_collision';
    end if;

    if exists (
      with recursive raw_chain as (
        select ml.id, ml.raw as node, 0 as depth
        from public.market_listings ml
        where jsonb_typeof(ml.raw) = 'object'
        union all
        select r.id, r.node->'raw', r.depth + 1
        from raw_chain r
        where r.depth < 127 and jsonb_typeof(r.node->'raw') = 'object'
      )
      select 1
      from raw_chain r
      where lower(coalesce(r.node->>'provider', '')) = v_provider
        and (
          nullif(r.node->>'source_listing_id', '') = v_source_listing_id
          or nullif(r.node->>'listing_id', '') = v_source_listing_id
          or (v_provider = 'rakuten_ichiba' and nullif(r.node->>'itemCode', '') = v_source_listing_id)
          or (v_provider = 'yahoo_shopping' and nullif(r.node->>'code', '') = v_source_listing_id)
        )
    ) then
      raise exception 'market_depth_r4_source_identity_collision';
    end if;
  end loop;

  -- All preconditions are now frozen under table locks; insert listing + initial observation atomically.
  for v_entry in select value from jsonb_array_elements(v_candidates)
  loop
    v_candidate_key := v_entry->>'candidate_key';
    v_selection_fingerprint := v_entry->>'selection_fingerprint';
    v_variant_id := v_entry->>'variant_id';
    v_series_id := v_entry->>'series_id';
    v_provider := v_entry->>'provider';
    v_source_listing_id := v_entry->>'source_listing_id';
    v_public_url := v_entry->>'public_url';
    v_listing_id := v_entry->>'listing_id';
    v_title := v_entry->>'title';
    v_price := (v_entry->>'price')::integer;
    v_source := case v_provider when 'rakuten_ichiba' then 'rakuten' else 'yahoo_shopping' end;
    v_observation_id := v_entry->>'observation_id';

    insert into public.market_listings (
      id, variant_id, matched_variant_id, series_id, title,
      listing_type, market_review_type, classification_reason, classification_confidence, classification_details,
      price, status, source, source_type, source_url, listed_at, sold_at, last_observed_at,
      confidence, review_required, raw
    ) values (
      v_listing_id, v_variant_id, v_variant_id, v_series_id, v_title,
      'single', 'single', 'variant_and_parent_evidence_confirmed', 0.86,
      jsonb_build_object(
        'market_depth_r4', jsonb_build_object(
          'candidate_key', v_candidate_key,
          'selection_fingerprint', v_selection_fingerprint,
          'confidence_floor', 0.86,
          'confidence_semantics', 'r3_strict_selection_floor'
        )
      ),
      v_price, 'active', v_source, 'marketplace', v_public_url, v_source_r3_generated_at, null, v_source_r3_generated_at,
      0.86, false,
      jsonb_build_object(
        'provider', v_provider,
        'source_listing_id', v_source_listing_id,
        'public_url', v_public_url,
        'query_variant_id', v_variant_id,
        'query_series_id', v_series_id,
        'market_safety_assessed', true,
        'market_safety', jsonb_build_object(
          'accepted', true,
          'review_required', false,
          'reason', 'variant_and_parent_evidence_confirmed',
          'confidence_floor', 0.86,
          'variant_id', v_variant_id,
          'series_id', v_series_id,
          'listing_type', 'single'
        ),
        'market_depth_r4', jsonb_build_object(
          'observation_key', v_observation_key,
          'source_r3_run_id', v_source_r3_run_id,
          'source_r3_main_sha', v_source_r3_main_sha,
          'source_r3_artifact_digest', v_source_r3_artifact_digest,
          'source_r3_generated_at', v_source_r3_generated_at,
          'candidate_key', v_candidate_key,
          'selection_fingerprint', v_selection_fingerprint,
          'batch_digest', p_batch->>'batch_digest'
        )
      )
    );

    insert into public.market_listing_observations (
      id, listing_id, variant_id, series_id, price, status, source, observed_at, raw
    ) values (
      v_observation_id, v_listing_id, v_variant_id, v_series_id, v_price, 'active', v_source, v_source_r3_generated_at,
      jsonb_build_object(
        'market_depth_r4', jsonb_build_object(
          'observation_key', v_observation_key,
          'source_r3_run_id', v_source_r3_run_id,
          'source_r3_main_sha', v_source_r3_main_sha,
          'source_r3_artifact_digest', v_source_r3_artifact_digest,
          'source_r3_generated_at', v_source_r3_generated_at,
          'candidate_key', v_candidate_key,
          'selection_fingerprint', v_selection_fingerprint,
          'batch_digest', p_batch->>'batch_digest'
        )
      )
    );

    v_listing_ids := array_append(v_listing_ids, v_listing_id);
    v_observation_ids := array_append(v_observation_ids, v_observation_id);
  end loop;

  if (select count(*) from public.market_listings ml where ml.id = any(v_listing_ids)) <> v_count
    or (select count(*) from public.market_listing_observations mo where mo.id = any(v_observation_ids)) <> v_count then
    raise exception 'market_depth_r4_postwrite_missing_rows';
  end if;

  for v_variant in
    select distinct e.value->>'variant_id'
    from jsonb_array_elements(v_candidates) e(value)
    order by 1
  loop
    select jsonb_array_length(e.value->'expected_existing_listing_ids')
      into v_before
    from jsonb_array_elements(v_candidates) e(value)
    where e.value->>'variant_id' = v_variant
    limit 1;

    select count(*)
      into v_inserted
    from jsonb_array_elements(v_candidates) e(value)
    where e.value->>'variant_id' = v_variant;

    select count(*)
      into v_after
    from public.market_listings ml
    where coalesce(ml.matched_variant_id, ml.variant_id) = v_variant
      and ml.status = 'active'
      and ml.listing_type = 'single'
      and ml.review_required is not true
      and coalesce(ml.last_observed_at, ml.listed_at, ml.created_at) >= clock_timestamp() - interval '30 days';

    if v_after <> v_before + v_inserted then
      raise exception 'market_depth_r4_postwrite_depth_mismatch';
    end if;
    v_target_depths := v_target_depths || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant,
      'before', v_before,
      'inserted', v_inserted,
      'after', v_after
    ));
  end loop;

  return jsonb_build_object(
    'schema_version', 1,
    'kind', 'market_depth_r4_atomic_v1',
    'batch_digest', p_batch->>'batch_digest',
    'inserted_count', v_count,
    'listing_ids', to_jsonb(v_listing_ids),
    'observation_ids', to_jsonb(v_observation_ids),
    'target_depths', v_target_depths
  );
end;
$$;

revoke execute on function public.apply_market_depth_r4_atomic_v1(jsonb) from public;
revoke execute on function public.apply_market_depth_r4_atomic_v1(jsonb) from anon;
revoke execute on function public.apply_market_depth_r4_atomic_v1(jsonb) from authenticated;
grant execute on function public.apply_market_depth_r4_atomic_v1(jsonb) to service_role;
