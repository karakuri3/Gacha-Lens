-- Supabase Cron templates for free-operation ingestion.
-- Never commit the real CRON_SHARED_SECRET. Replace the placeholders only in the
-- SQL editor immediately before execution, then discard the edited copy.
-- X ingestion is optional and intentionally not scheduled here.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'gacha-ingest-official-hourly',
  'gacha-ingest-market-15min',
  'gacha-ingest-market-hourly',
  'gacha-ingest-x-10min',
  'gacha-ingest-stock-15min',
  'gacha-ingest-stock-hourly'
);

select cron.schedule(
  'gacha-ingest-official-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=official',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<PASTE_CRON_SHARED_SECRET_HERE>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'official')
  );
  $$
);

select cron.schedule(
  'gacha-ingest-market-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=market',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<PASTE_CRON_SHARED_SECRET_HERE>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'market')
  );
  $$
);

select cron.schedule(
  'gacha-ingest-stock-hourly',
  '37 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/ingest?task=stock',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<PASTE_CRON_SHARED_SECRET_HERE>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'stock')
  );
  $$
);
