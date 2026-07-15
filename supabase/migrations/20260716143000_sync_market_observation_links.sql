create or replace function sync_market_observation_links()
returns trigger
language plpgsql
as $$
begin
  update market_listing_observations
  set variant_id = new.variant_id,
      series_id = new.series_id
  where listing_id = new.id
    and (variant_id is distinct from new.variant_id or series_id is distinct from new.series_id);
  return new;
end;
$$;

drop trigger if exists market_listing_observation_links_trigger on market_listings;
create trigger market_listing_observation_links_trigger
after insert or update of variant_id, series_id on market_listings
for each row execute function sync_market_observation_links();

update market_listing_observations observation
set variant_id = listing.variant_id,
    series_id = listing.series_id
from market_listings listing
where observation.listing_id = listing.id
  and (observation.variant_id is distinct from listing.variant_id or observation.series_id is distinct from listing.series_id);
