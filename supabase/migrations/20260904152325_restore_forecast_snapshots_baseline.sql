-- Repository migration-chain backfill for a Production-existing table that was omitted
-- from the original foundation migration. This version intentionally sorts immediately
-- before 20260904152326_final_revoke_server_only_api_grants.sql so fresh database
-- replay can reach that already-applied hardening migration.
--
-- Production already has the matching table. Applying or repairing migration history
-- on Production remains a separate approval-bound operation under #219/#238.

create table if not exists public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references public.variants(id) on delete cascade,
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

alter table public.forecast_snapshots enable row level security;

revoke all privileges on table public.forecast_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.forecast_snapshots to service_role;

comment on table public.forecast_snapshots is
  'Server-only forecast snapshots restored to the reproducible migration baseline; Production schema pre-existed this repository backfill.';
