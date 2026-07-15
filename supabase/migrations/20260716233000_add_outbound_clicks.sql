create table if not exists outbound_clicks (
  id uuid primary key default gen_random_uuid(),
  variant_id text references variants(id) on delete set null,
  provider text not null check (provider in ('mercari', 'yahoo', 'rakuten', 'amazon', 'official')),
  page_path text,
  clicked_at timestamptz not null default now()
);

create index if not exists outbound_clicks_provider_clicked_at_idx
  on outbound_clicks(provider, clicked_at desc);

create index if not exists outbound_clicks_variant_id_clicked_at_idx
  on outbound_clicks(variant_id, clicked_at desc);

alter table outbound_clicks enable row level security;
