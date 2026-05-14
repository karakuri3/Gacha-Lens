-- Supabase Cron templates for high-frequency ingestion.
-- Replace <PROJECT_REF>, <SUPABASE_CRON_SECRET>, and deploy supabase/functions/ingest first.
-- These jobs call the Edge Function, which forwards to /api/ingest/:task on the app.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'gacha-ingest-official-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=official',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<SUPABASE_CRON_SECRET>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'official')
  );
  $$
);

select cron.schedule(
  'gacha-ingest-market-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=market',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<SUPABASE_CRON_SECRET>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'market')
  );
  $$
);

select cron.schedule(
  'gacha-ingest-x-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=x',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<SUPABASE_CRON_SECRET>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'x')
  );
  $$
);

select cron.schedule(
  'gacha-ingest-stock-15min',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=stock',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<SUPABASE_CRON_SECRET>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'stock')
  );
  $$
);
