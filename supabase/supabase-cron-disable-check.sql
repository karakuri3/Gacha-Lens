-- Run before and after deployment. After deployment, every target should be absent.
-- Compare other_job_count before and after; it must not change.
-- GitHub Actions, Edge Functions, and Vercel APIs are external to PostgreSQL and
-- must be checked separately without changing their configuration.
with expected(task, jobname, schedule) as (
  values
    ('official', 'gacha-ingest-official-hourly', '7 * * * *'),
    ('market', 'gacha-ingest-market-hourly', '17 * * * *'),
    ('stock', 'gacha-ingest-stock-hourly', '37 * * * *')
),
target_status as (
  select
    expected.task,
    expected.jobname,
    expected.schedule,
    job.jobid,
    job.active
  from expected
  left join cron.job job
    on job.jobname = expected.jobname
   and job.schedule = expected.schedule
),
other_jobs as (
  select count(*)::integer as job_count
  from cron.job
  where not exists (
    select 1
    from expected
    where expected.jobname = cron.job.jobname
      and expected.schedule = cron.job.schedule
  )
),
extensions as (
  select
    exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_present,
    exists (select 1 from pg_extension where extname = 'pg_net') as pg_net_present
)
select
  target_status.task,
  target_status.jobname,
  target_status.schedule,
  target_status.jobid,
  target_status.active,
  target_status.jobid is null as target_absent,
  other_jobs.job_count as other_job_count,
  extensions.pg_cron_present,
  extensions.pg_net_present
from target_status
cross join other_jobs
cross join extensions
order by target_status.task;
