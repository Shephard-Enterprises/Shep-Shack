create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname = 'shep-dashboard-data-retention';

select cron.schedule(
  'shep-dashboard-data-retention',
  '17 10 * * *',
  $$
    delete from public.keg_readings where recorded_at < now() - interval '90 days';
    delete from public.notification_events where created_at < now() - interval '90 days';
  $$
);
