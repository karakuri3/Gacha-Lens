-- Foundation objects required before the existing Gacha Lens migrations run.

create extension if not exists pgcrypto with schema extensions;

create table public.source_weights (
  source_type text primary key,
  weight numeric not null check (weight >= 0 and weight <= 1),
  label text not null,
  updated_at timestamptz not null default now()
);

create table public.series (
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

create table public.variants (
  id text primary key,
  slug text not null unique,
  series_id text not null references public.series(id) on delete cascade,
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
  tags text[] not null default '{}'::text[],
  source_type text not null default 'official_site',
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_listings (
  id text primary key,
  variant_id text references public.variants(id) on delete set null,
  series_id text references public.series(id) on delete set null,
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
  updated_at timestamptz not null default now(),
  matched_variant_id text references public.variants(id) on delete set null
);

create table public.x_reactions (
  id text primary key,
  variant_id text references public.variants(id) on delete set null,
  series_id text references public.series(id) on delete set null,
  source_type text not null default 'user_x',
  author_type text not null default 'user',
  text text not null,
  url text,
  posted_at timestamptz,
  reposts integer not null default 0,
  likes integer not null default 0,
  quotes integer not null default 0,
  intent_tags text[] not null default '{}'::text[],
  intent_labels text[] not null default '{}'::text[],
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  matched_variant_id text references public.variants(id) on delete set null
);

create table public.restock_events (
  id text primary key,
  variant_id text references public.variants(id) on delete set null,
  series_id text references public.series(id) on delete set null,
  source_type text not null default 'user_x',
  source_weight numeric not null default 0.48,
  event_type text not null default 'unknown',
  event_label text,
  classification_reason text,
  classification_keywords text[] not null default '{}'::text[],
  text text,
  region text,
  shop_name text,
  source_url text,
  reported_at timestamptz,
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  matched_variant_id text references public.variants(id) on delete set null
);

create table public.stock_reports (
  id text primary key,
  variant_id text references public.variants(id) on delete set null,
  series_id text references public.series(id) on delete set null,
  source_type text not null default 'user_x',
  source_weight numeric not null default 0.48,
  status text not null default 'unknown',
  status_label text,
  classification_reason text,
  classification_keywords text[] not null default '{}'::text[],
  text text,
  region text,
  shop_name text,
  source_url text,
  reported_at timestamptz,
  confidence numeric not null default 0.25,
  review_required boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  matched_variant_id text references public.variants(id) on delete set null
);

create table public.import_issues (
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

create index variants_series_id_idx on public.variants(series_id);
create index market_listings_variant_id_idx on public.market_listings(variant_id);
create index market_listings_matched_variant_id_idx on public.market_listings(matched_variant_id);
create index market_listings_review_required_idx on public.market_listings(review_required);
create index x_reactions_variant_id_idx on public.x_reactions(variant_id);
create index x_reactions_matched_variant_id_idx on public.x_reactions(matched_variant_id);
create index restock_events_variant_id_idx on public.restock_events(variant_id);
create index restock_events_matched_variant_id_idx on public.restock_events(matched_variant_id);
create index stock_reports_variant_id_idx on public.stock_reports(variant_id);
create index stock_reports_matched_variant_id_idx on public.stock_reports(matched_variant_id);
create index import_issues_resolved_idx on public.import_issues(resolved);

alter table public.source_weights enable row level security;
alter table public.series enable row level security;
alter table public.variants enable row level security;
alter table public.market_listings enable row level security;
alter table public.x_reactions enable row level security;
alter table public.restock_events enable row level security;
alter table public.stock_reports enable row level security;
alter table public.import_issues enable row level security;

revoke all privileges on table public.source_weights from anon, authenticated;
revoke all privileges on table public.series from anon, authenticated;
revoke all privileges on table public.variants from anon, authenticated;
revoke all privileges on table public.market_listings from anon, authenticated;
revoke all privileges on table public.x_reactions from anon, authenticated;
revoke all privileges on table public.restock_events from anon, authenticated;
revoke all privileges on table public.stock_reports from anon, authenticated;
revoke all privileges on table public.import_issues from anon, authenticated;
