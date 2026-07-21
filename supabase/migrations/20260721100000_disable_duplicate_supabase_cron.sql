do $$
declare
  target record;
begin
  if to_regnamespace('cron') is null
    or to_regclass('cron.job') is null
    or to_regprocedure('cron.unschedule(text)') is null then
    return;
  end if;

  for target in
    select jobname
    from cron.job
    where (jobname = 'gacha-ingest-official-hourly' and schedule = '7 * * * *' and command like '%task=official%')
       or (jobname = 'gacha-ingest-market-hourly' and schedule = '17 * * * *' and command like '%task=market%')
       or (jobname = 'gacha-ingest-stock-hourly' and schedule = '37 * * * *' and command like '%task=stock%')
  loop
    perform cron.unschedule(target.jobname);
  end loop;
end
$$;
