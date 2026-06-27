-- Supabase Cron templates for free-operation ingestion.
-- Project ref confirmed by deploy: ihcudkfspzuixsqsvoku
-- Replace only <PASTE_CRON_SHARED_SECRET_HERE> with the same value set on the ingest Edge Function.
-- These jobs call the Edge Function, which forwards to /api/ingest/:task on the app.
-- X API ingestion is intentionally not registered here. Run task=x manually or add a low-frequency job only when X_BEARER_TOKEN is available.

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
    url := 'https://ihcudkfspzuixsqsvoku.functions.supabase.co/ingest?task=official',
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
    url := 'https://ihcudkfspzuixsqsvoku.functions.supabase.co/ingest?task=market',
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
    url := 'https://ihcudkfspzuixsqsvoku.functions.supabase.co/ingest?task=stock',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<PASTE_CRON_SHARED_SECRET_HERE>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'stock')
  );
  $$
);
