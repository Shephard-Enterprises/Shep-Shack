-- Preserve the original Beer-only API while adding separately identified scales.
begin;

alter table public.keg_readings rename to keg_scale_readings;
alter table public.keg_pours rename to keg_scale_pours;
alter table public.keg_changes rename to keg_scale_changes;

alter table public.keg_scale_readings add column scale_id text not null default 'beer'
  check (scale_id in ('beer', 'sparkling-water'));
alter table public.keg_scale_pours add column scale_id text not null default 'beer'
  check (scale_id in ('beer', 'sparkling-water'));
alter table public.keg_scale_changes add column scale_id text not null default 'beer'
  check (scale_id in ('beer', 'sparkling-water'));

update public.keg_scale_readings set scale_id = 'sparkling-water'
where payload->>'scaleId' = 'sparkling-water'
   or lower(trim(payload->>'kegName')) = 'sparkling water';
update public.keg_scale_pours p set scale_id = r.scale_id
from public.keg_scale_readings r where p.reading_id = r.id;
update public.keg_scale_changes c set scale_id = r.scale_id
from public.keg_scale_readings r where c.reading_id = r.id;

create index keg_scale_readings_scale_time_idx on public.keg_scale_readings(scale_id, recorded_at desc);
create index keg_scale_pours_scale_time_idx on public.keg_scale_pours(scale_id, poured_at desc);
create index keg_scale_changes_scale_time_idx on public.keg_scale_changes(scale_id, changed_at desc);

-- Existing household RLS policies and foreign keys move with the renamed tables.
-- Security-invoker views retain that RLS for the old app and old functions.
create view public.keg_readings with (security_invoker = true) as
  select id, recorded_at, payload from public.keg_scale_readings where scale_id = 'beer'
  with local check option;
create view public.keg_pours with (security_invoker = true) as
  select id, reading_id, poured_at, ounces, beer_oz_after from public.keg_scale_pours where scale_id = 'beer'
  with local check option;
create view public.keg_changes with (security_invoker = true) as
  select id, reading_id, changed_at, starting_ounces, starting_percent from public.keg_scale_changes where scale_id = 'beer'
  with local check option;
grant select on public.keg_readings, public.keg_pours, public.keg_changes to authenticated;
grant all on public.keg_readings, public.keg_pours, public.keg_changes to service_role;

-- Retain both scales' readings for the existing 90-day window.
select cron.unschedule(jobid) from cron.job where jobname = 'shep-dashboard-data-retention';
select cron.schedule('shep-dashboard-data-retention', '17 10 * * *', $$
  delete from public.keg_scale_readings where recorded_at < now() - interval '90 days';
  delete from public.notification_events where created_at < now() - interval '90 days';
$$);
notify pgrst, 'reload schema';
commit;
