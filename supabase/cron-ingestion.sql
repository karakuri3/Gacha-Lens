-- Supabase Cron templates for high-frequency ingestion.
-- Project ref confirmed by deploy: ihcudkfspzuixsqsvoku
-- Replace only <PASTE_CRON_SHARED_SECRET_HERE> with the same value set on the ingest Edge Function.
-- These jobs call the Edge Function, which forwards to /api/ingest/:task on the app.

create extension if not exists pg_cron;
create extension if not exists pg_net;

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
  'gacha-ingest-market-15min',
  '*/15 * * * *',
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
  'gacha-ingest-x-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ihcudkfspzuixsqsvoku.functions.supabase.co/ingest?task=x',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<PASTE_CRON_SHARED_SECRET_HERE>'
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
    url := 'https://ihcudkfspzuixsqsvoku.functions.supabase.co/ingest?task=stock',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<PASTE_CRON_SHARED_SECRET_HERE>'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'task', 'stock')
  );
  $$
);
