-- Gacha Lens Supabase schema
-- Single variant is the primary UI entity. Series remains the parent master.

create table if not exists source_weights (
  source_type text primary key,
  weight numeric not null check (weight >= 0 and weight <= 1),
  label text not null,
  updated_at timestamptz not null default now()
);

insert into source_weights (source_type, weight, label) values
  ('official_site', 1.00, 'Official site'),
  ('official', 1.00, 'Official'),
  ('official_x', 0.92, 'Official X'),
  ('shop_x', 0.76, 'Shop X'),
  ('user_x', 0.48, 'User X'),
  ('marketplace', 0.62, 'Marketplace'),
  ('user_report', 0.48, 'Reviewed user report')
on conflict (source_type) do update set
  weight = excluded.weight,
  label = excluded.label,
  updated_at = now();

create table if not exists series (
  id text primary key,
  slug text not null unique,
  name text not null,
  franchise text,
  brand text,
  category text,
  release_month text,
  release_week text,
  release_date date,
  price integer,
  image_url text,
  official_url text,
  is_released boolean not null default false,
  source_type text not null default 'official_site',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists variants (
  id text primary key,
  slug text not null unique,
  series_id text not null references series(id) on delete cascade,
  name text not null,
  variant_type text not null default 'normal',
  rarity text,
  role text,
  image text,
  released boolean not null default false,
  price integer,
  brand text,
  release_month text,
  release_week text,
  release_date date,
  official_url text,
  axes jsonb not null default '{}'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  source_type text not null default 'official_site',
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market_listings (
  id text primary key,
  variant_id text references variants(id) on delete set null,
  matched_variant_id text references variants(id) on delete set null,
  series_id text references series(id) on delete set null,
  title text not null,
  listing_type text not null default 'unknown',
  market_review_type text not null default 'unknown',
  classification_reason text,
  classification_confidence numeric,
  classification_details jsonb not null default '{}'::jsonb,
  price integer,
  status text not null default 'active',
  source text not null default 'mercari',
  source_type text not null default 'marketplace',
  source_url text,
  listed_at timestamptz,
  sold_at timestamptz,
  last_observed_at timestamptz,
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists x_reactions (
  id text primary key,
  variant_id text references variants(id) on delete set null,
  matched_variant_id text references variants(id) on delete set null,
  series_id text references series(id) on delete set null,
  source_type text not null default 'user_x',
  author_type text not null default 'user',
  text text not null,
  url text,
  posted_at timestamptz,
  reposts integer not null default 0,
  likes integer not null default 0,
  quotes integer not null default 0,
  intent_tags text[] not null default '{}',
  intent_labels text[] not null default '{}',
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restock_events (
  id text primary key,
  variant_id text references variants(id) on delete set null,
  matched_variant_id text references variants(id) on delete set null,
  series_id text references series(id) on delete set null,
  source_type text not null default 'user_x',
  source_weight numeric not null default 0.48,
  event_type text not null default 'unknown',
  event_label text,
  classification_reason text,
  classification_keywords text[] not null default '{}',
  text text,
  region text,
  shop_name text,
  source_url text,
  reported_at timestamptz,
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_reports (
  id text primary key,
  variant_id text references variants(id) on delete set null,
  matched_variant_id text references variants(id) on delete set null,
  series_id text references series(id) on delete set null,
  source_type text not null default 'user_x',
  source_weight numeric not null default 0.48,
  status text not null default 'unknown',
  status_label text,
  classification_reason text,
  classification_keywords text[] not null default '{}',
  text text,
  region text,
  shop_name text,
  source_url text,
  reported_at timestamptz,
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists import_issues (
  id text primary key,
  issue_type text not null,
  table_name text not null,
  record_id text,
  source text,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  note text,
  assignee text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  task text not null check (task in ('official', 'market', 'x', 'stock')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  trigger_source text not null default 'manual',
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references variants(id) on delete cascade,
  series_id text not null references series(id) on delete cascade,
  report_type text not null check (report_type in ('sold_price', 'asking_price', 'buyback_price', 'in_stock', 'low_stock', 'sold_out', 'restocked')),
  price integer check (price is null or price between 1 and 1000000),
  shop_name text,
  region text,
  source_url text,
  note text,
  occurred_at timestamptz not null default now(),
  submitter_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  confidence numeric not null default 0.25 check (confidence >= 0 and confidence <= 1),
  review_required boolean not null default true,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists outbound_clicks (
  id uuid primary key default gen_random_uuid(),
  variant_id text references variants(id) on delete set null,
  provider text not null check (provider in ('mercari', 'yahoo', 'rakuten', 'amazon', 'official')),
  page_path text,
  clicked_at timestamptz not null default now()
);

create table if not exists forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references variants(id) on delete cascade,
  total integer not null,
  complete integer not null default 0,
  ace integer not null default 0,
  compatibility integer not null default 0,
  limited integer not null default 0,
  preorder integer not null default 0,
  x integer not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

alter table market_listings add column if not exists matched_variant_id text references variants(id) on delete set null;
alter table market_listings add column if not exists last_observed_at timestamptz;
alter table x_reactions add column if not exists matched_variant_id text references variants(id) on delete set null;
alter table restock_events add column if not exists matched_variant_id text references variants(id) on delete set null;
alter table stock_reports add column if not exists matched_variant_id text references variants(id) on delete set null;

create index if not exists variants_series_id_idx on variants(series_id);
create index if not exists market_listings_variant_id_idx on market_listings(variant_id);
create index if not exists market_listings_matched_variant_id_idx on market_listings(matched_variant_id);
create index if not exists market_listings_review_required_idx on market_listings(review_required);
create index if not exists market_listings_last_observed_at_idx on market_listings(last_observed_at desc);
create index if not exists market_listing_observations_listing_id_idx on market_listing_observations(listing_id, observed_at desc);
create index if not exists market_listing_observations_variant_id_idx on market_listing_observations(variant_id, observed_at desc);
create index if not exists market_listing_observations_series_id_idx on market_listing_observations(series_id, observed_at desc);

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
create index if not exists x_reactions_variant_id_idx on x_reactions(variant_id);
create index if not exists x_reactions_matched_variant_id_idx on x_reactions(matched_variant_id);
create index if not exists restock_events_variant_id_idx on restock_events(variant_id);
create index if not exists restock_events_matched_variant_id_idx on restock_events(matched_variant_id);
create index if not exists stock_reports_variant_id_idx on stock_reports(variant_id);
create index if not exists stock_reports_matched_variant_id_idx on stock_reports(matched_variant_id);
create index if not exists import_issues_resolved_idx on import_issues(resolved);
create index if not exists ingestion_runs_task_started_at_idx on ingestion_runs(task, started_at desc);
create index if not exists ingestion_runs_status_started_at_idx on ingestion_runs(status, started_at desc);
create index if not exists community_reports_status_created_at_idx on community_reports(status, created_at desc);
create index if not exists community_reports_variant_id_idx on community_reports(variant_id, created_at desc);
create index if not exists community_reports_submitter_hash_idx on community_reports(submitter_hash, created_at desc);
create index if not exists outbound_clicks_provider_clicked_at_idx on outbound_clicks(provider, clicked_at desc);
create index if not exists outbound_clicks_variant_id_clicked_at_idx on outbound_clicks(variant_id, clicked_at desc);

alter table community_reports enable row level security;
alter table outbound_clicks enable row level security;

-- Market observations are server-only data accessed through the service role.
alter table public.market_listing_observations enable row level security;
revoke all privileges on table public.market_listing_observations from anon, authenticated;
