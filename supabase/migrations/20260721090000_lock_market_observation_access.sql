alter table public.market_listing_observations
enable row level security;

revoke all privileges
on table public.market_listing_observations
from anon, authenticated;
