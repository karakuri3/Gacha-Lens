create table if not exists public.ingestion_runs (
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

create index if not exists ingestion_runs_task_started_at_idx
  on public.ingestion_runs(task, started_at desc);
create index if not exists ingestion_runs_status_started_at_idx
  on public.ingestion_runs(status, started_at desc);

alter table public.ingestion_runs enable row level security;
