alter table market_listings add column if not exists last_observed_at timestamptz;

create table if not exists market_listing_observations (
  id text primary key,
  listing_id text not null references market_listings(id) on delete cascade,
  variant_id text references variants(id) on delete set null,
  series_id text references series(id) on delete set null,
  price integer,
  status text not null default 'active',
  source text not null,
  observed_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_listings_last_observed_at_idx on market_listings(last_observed_at desc);
create index if not exists market_listing_observations_listing_id_idx on market_listing_observations(listing_id, observed_at desc);
create index if not exists market_listing_observations_variant_id_idx on market_listing_observations(variant_id, observed_at desc);
create index if not exists market_listing_observations_series_id_idx on market_listing_observations(series_id, observed_at desc);
