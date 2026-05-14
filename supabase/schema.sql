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
  ('marketplace', 0.62, 'Marketplace')
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
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists x_reactions (
  id text primary key,
  variant_id text references variants(id) on delete set null,
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

create index if not exists variants_series_id_idx on variants(series_id);
create index if not exists market_listings_variant_id_idx on market_listings(variant_id);
create index if not exists market_listings_review_required_idx on market_listings(review_required);
create index if not exists x_reactions_variant_id_idx on x_reactions(variant_id);
create index if not exists restock_events_variant_id_idx on restock_events(variant_id);
create index if not exists stock_reports_variant_id_idx on stock_reports(variant_id);
create index if not exists import_issues_resolved_idx on import_issues(resolved);
