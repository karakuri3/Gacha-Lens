create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references public.variants(id) on delete cascade,
  series_id text not null references public.series(id) on delete cascade,
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

create index if not exists community_reports_status_created_at_idx on public.community_reports(status, created_at desc);
create index if not exists community_reports_variant_id_idx on public.community_reports(variant_id, created_at desc);
create index if not exists community_reports_submitter_hash_idx on public.community_reports(submitter_hash, created_at desc);

alter table public.community_reports enable row level security;

insert into public.source_weights (source_type, weight, label)
values ('user_report', 0.48, 'Reviewed user report')
on conflict (source_type) do update set weight = excluded.weight, label = excluded.label, updated_at = now();
