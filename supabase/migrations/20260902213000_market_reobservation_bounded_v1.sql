-- Reusable bounded re-observation persistence lane.
-- Repository-only prerequisite for Issue #196. Production application/execution remains separately approval-bound.

create or replace function public.apply_market_reobservation_bounded_v1(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_listing public.market_listings%rowtype;
  v_listing_id text;
  v_observation_id text;
  v_provider text;
  v_native_id text;
  v_public_url text;
  v_expected_source_url text;
  v_expected_raw_provider text;
  v_expected_raw_native_id text;
  v_expected_raw_public_url text;
  v_variant_id text;
  v_series_id text;
  v_source text;
  v_observation_key text;
  v_shared_observation_key text := null;
  v_observed_at timestamptz;
  v_price integer;
  v_status text;
  v_expected_price integer;
  v_expected_status text;
  v_expected_last_observed_at timestamptz;
  v_expected_prior_observation_count integer;
  v_actual_prior_observation_count integer;
  v_post_observation_count integer;
  v_identity_json text;
  v_expected_observation_id text;
  v_outcome text;
  v_batch_size integer;
  v_newly_reobserved_delta integer := 0;
  v_listing_ids text[] := array[]::text[];
  v_observation_ids text[] := array[]::text[];
begin
  if p_batch is null or jsonb_typeof(p_batch) <> 'array' then
    raise exception using errcode = '22023', message = 'reobs_bounded_invalid_batch';
  end if;

  v_batch_size := jsonb_array_length(p_batch);
  if v_batch_size < 1 or v_batch_size > 10 then
    raise exception using errcode = '22023', message = 'reobs_bounded_invalid_batch_size';
  end if;

  if (
    select count(distinct entry->>'listing_id')
    from jsonb_array_elements(p_batch) as batch(entry)
  ) <> v_batch_size or (
    select count(distinct entry->>'observation_id')
    from jsonb_array_elements(p_batch) as batch(entry)
  ) <> v_batch_size then
    raise exception using errcode = '22023', message = 'reobs_bounded_duplicate_batch_identity';
  end if;

  lock table public.market_listing_observations in share row exclusive mode;

  for v_item in
    select entry
    from jsonb_array_elements(p_batch) as batch(entry)
    order by entry->>'listing_id'
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'reobs_bounded_invalid_entry';
    end if;

    v_listing_id := btrim(coalesce(v_item->>'listing_id', ''));
    v_observation_id := btrim(coalesce(v_item->>'observation_id', ''));
    v_provider := btrim(coalesce(v_item->>'provider', ''));
    v_native_id := btrim(coalesce(v_item->>'source_listing_id', ''));
    v_public_url := btrim(coalesce(v_item->>'public_url', ''));
    v_expected_source_url := btrim(coalesce(v_item->>'expected_source_url', ''));
    v_expected_raw_provider := btrim(coalesce(v_item->>'expected_raw_provider', ''));
    v_expected_raw_native_id := btrim(coalesce(v_item->>'expected_raw_source_listing_id', ''));
    v_expected_raw_public_url := btrim(coalesce(v_item->>'expected_raw_public_url', ''));
    v_variant_id := btrim(coalesce(v_item->>'variant_id', ''));
    v_series_id := btrim(coalesce(v_item->>'series_id', ''));
    v_source := btrim(coalesce(v_item->>'source', ''));
    v_observation_key := btrim(coalesce(v_item->>'observation_key', ''));
    v_status := btrim(coalesce(v_item->>'status', ''));
    v_expected_status := btrim(coalesce(v_item->>'expected_status', ''));

    if v_listing_id = ''
      or v_observation_id !~ '^market-reobservation-[0-9a-f]{32}$'
      or v_provider not in ('rakuten_ichiba', 'yahoo_shopping')
      or not (
        (v_provider = 'rakuten_ichiba' and v_source = 'rakuten')
        or (v_provider = 'yahoo_shopping' and v_source = 'yahoo_shopping')
      )
      or v_native_id = ''
      or v_public_url = ''
      or v_expected_source_url = ''
      or v_expected_raw_provider <> v_provider
      or v_expected_raw_native_id <> v_native_id
      or v_expected_raw_public_url = ''
      or v_variant_id = ''
      or v_series_id = ''
      or v_observation_key !~ '^[A-Za-z0-9._:-]{1,120}$'
      or v_status not in ('active', 'sold_out')
      or v_expected_status not in ('active', 'sold_out') then
      raise exception using errcode = '22023', message = 'reobs_bounded_invalid_entry_contract';
    end if;

    if v_shared_observation_key is null then
      v_shared_observation_key := v_observation_key;
    elsif v_observation_key <> v_shared_observation_key then
      raise exception using errcode = '22023', message = 'reobs_bounded_observation_key_mismatch';
    end if;

    begin
      v_observed_at := (v_item->>'observed_at')::timestamptz;
      v_expected_last_observed_at := (v_item->>'expected_last_observed_at')::timestamptz;
      if v_observed_at is null or v_expected_last_observed_at is null then
        raise exception using errcode = '22023', message = 'reobs_bounded_invalid_timestamp';
      end if;
      if coalesce(v_item->>'price', '') !~ '^[1-9][0-9]*$'
        or coalesce(v_item->>'expected_price', '') !~ '^[1-9][0-9]*$'
        or coalesce(v_item->>'expected_prior_observation_count', '') !~ '^[1-9][0-9]*$' then
        raise exception using errcode = '22023', message = 'reobs_bounded_invalid_positive_integer';
      end if;
      v_price := (v_item->>'price')::integer;
      v_expected_price := (v_item->>'expected_price')::integer;
      v_expected_prior_observation_count := (v_item->>'expected_prior_observation_count')::integer;
    exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'reobs_bounded_invalid_scalar';
    end;

    select *
    into v_listing
    from public.market_listings
    where id = v_listing_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_listing_missing';
    end if;

    if v_listing.listing_type is distinct from 'single'
      or v_listing.market_review_type is distinct from 'single'
      or coalesce(v_listing.review_required, false) is not false
      or v_listing.status not in ('active', 'sold_out')
      or v_listing.sold_at is not null
      or v_listing.variant_id is distinct from v_variant_id
      or v_listing.matched_variant_id is distinct from v_variant_id
      or v_listing.series_id is distinct from v_series_id
      or v_listing.source is distinct from v_source
      or v_listing.source_type is distinct from 'marketplace'
      or v_listing.source_url is distinct from v_expected_source_url
      or coalesce(v_listing.raw->>'provider', '') is distinct from v_expected_raw_provider
      or coalesce(v_listing.raw->>'source_listing_id', '') is distinct from v_expected_raw_native_id
      or coalesce(v_listing.raw->>'public_url', '') is distinct from v_expected_raw_public_url then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_listing_identity_or_scope_changed';
    end if;

    if v_listing.price is distinct from v_expected_price
      or v_listing.status is distinct from v_expected_status
      or v_listing.last_observed_at is distinct from v_expected_last_observed_at then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_listing_snapshot_changed';
    end if;

    if v_listing.last_observed_at is null or v_observed_at <= v_listing.last_observed_at then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_observation_time_not_newer';
    end if;

    if exists (
      select 1
      from public.import_issues ii
      where ii.table_name = 'market_listings'
        and ii.record_id = v_listing_id
        and coalesce(ii.resolved, false) = false
    ) then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_unresolved_import_issue';
    end if;

    select count(*)::integer
    into v_actual_prior_observation_count
    from public.market_listing_observations o
    where o.listing_id = v_listing_id;

    if v_actual_prior_observation_count <> v_expected_prior_observation_count then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_prior_observation_count_changed';
    end if;

    if exists (
      select 1 from public.market_listing_observations o where o.id = v_observation_id
    ) then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_observation_id_collision';
    end if;

    v_identity_json := '["gacha-lens","market-reobservation-v1",'
      || pg_catalog.to_json(v_listing_id)::text || ','
      || pg_catalog.to_json(v_provider)::text || ','
      || pg_catalog.to_json(v_observation_key)::text || ']';
    v_expected_observation_id := 'market-reobservation-'
      || left(encode(extensions.digest(v_identity_json, 'sha256'), 'hex'), 32);

    if v_observation_id <> v_expected_observation_id then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_observation_id_mismatch';
    end if;

    v_outcome := case
      when v_listing.status is distinct from v_status then 'status_changed'
      when v_listing.price is distinct from v_price then 'price_changed'
      else 'unchanged'
    end;

    insert into public.market_listing_observations (
      id, listing_id, variant_id, series_id, price, status, source, observed_at, raw
    ) values (
      v_observation_id,
      v_listing.id,
      v_listing.variant_id,
      v_listing.series_id,
      v_price,
      v_status,
      v_listing.source,
      v_observed_at,
      jsonb_build_object(
        'market_reobservation', jsonb_build_object(
          'provider', v_provider,
          'source_listing_id', v_native_id,
          'observation_key', v_observation_key,
          'outcome', v_outcome
        )
      )
    );

    update public.market_listings
    set price = v_price,
        status = v_status,
        last_observed_at = v_observed_at,
        updated_at = v_observed_at
    where id = v_listing.id;

    select count(*)::integer
    into v_post_observation_count
    from public.market_listing_observations o
    where o.listing_id = v_listing_id;

    if v_post_observation_count <> v_expected_prior_observation_count + 1 then
      raise exception using errcode = 'P0001', message = 'reobs_bounded_postwrite_observation_count_mismatch';
    end if;

    if v_expected_prior_observation_count = 1 then
      v_newly_reobserved_delta := v_newly_reobserved_delta + 1;
    end if;

    v_listing_ids := array_append(v_listing_ids, v_listing.id);
    v_observation_ids := array_append(v_observation_ids, v_observation_id);
  end loop;

  if cardinality(v_listing_ids) <> v_batch_size or cardinality(v_observation_ids) <> v_batch_size then
    raise exception using errcode = 'P0001', message = 'reobs_bounded_atomic_apply_incomplete';
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'kind', 'market_reobservation_bounded_atomic_v1',
    'applied_count', v_batch_size,
    'observation_key', v_shared_observation_key,
    'listing_ids', to_jsonb(v_listing_ids),
    'observation_ids', to_jsonb(v_observation_ids),
    'market_listing_delta', 0,
    'observation_delta', v_batch_size,
    'newly_reobserved_delta', v_newly_reobserved_delta,
    'completed_sold_delta', 0
  );
end;
$$;

revoke execute on function public.apply_market_reobservation_bounded_v1(jsonb) from public;
revoke execute on function public.apply_market_reobservation_bounded_v1(jsonb) from anon;
revoke execute on function public.apply_market_reobservation_bounded_v1(jsonb) from authenticated;
grant execute on function public.apply_market_reobservation_bounded_v1(jsonb) to service_role;

comment on function public.apply_market_reobservation_bounded_v1(jsonb) is
  'Reusable bounded 1-10 listing exact-market re-observation persistence contract for Issue #196. SECURITY INVOKER; service_role only; Production application/execution separately approval-bound.';
