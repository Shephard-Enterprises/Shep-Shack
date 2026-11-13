begin;
alter table public.fitness_sessions add column execution_started_at timestamptz;
-- Keep existing logged or timed sessions in progress. Unstarted plans open in review.
update public.fitness_sessions set execution_started_at = started_at
where kind = 'strength' and (status = 'completed' or timer_state is not null or public.fitness_has_completed_set(exercises));
notify pgrst, 'reload schema';
commit;
