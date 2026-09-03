-- The R4 writer deliberately runs with an empty search_path. The existing
-- market_listing_observation_links_trigger calls sync_market_observation_links(),
-- whose historical body referenced market_listing_observations without a schema.
-- Once R4 reaches INSERT, that trigger therefore inherits the empty search_path
-- and cannot resolve the table. Preserve the trigger semantics while qualifying
-- exactly that one relation reference, then make the trigger function itself
-- search_path-independent.

DO $market_observation_trigger_repair$
DECLARE
  v_definition text;
  v_broken_reference constant text := 'update market_listing_observations';
  v_repaired_reference constant text := 'update public.market_listing_observations';
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef('public.sync_market_observation_links()'::regprocedure)
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'market_observation_trigger_repair_missing_function';
  END IF;

  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_broken_reference, '')))
    / length(v_broken_reference);

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'market_observation_trigger_repair_unexpected_reference_count:%', v_occurrences;
  END IF;

  v_definition := replace(v_definition, v_broken_reference, v_repaired_reference);

  IF position(v_broken_reference IN v_definition) > 0
    OR position(v_repaired_reference IN v_definition) = 0 THEN
    RAISE EXCEPTION 'market_observation_trigger_repair_rewrite_failed';
  END IF;

  EXECUTE v_definition;
END
$market_observation_trigger_repair$;

ALTER FUNCTION public.sync_market_observation_links() SECURITY INVOKER;
ALTER FUNCTION public.sync_market_observation_links() SET search_path TO '';
