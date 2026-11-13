begin;
-- Remove only the minimum-completed-set rule. Logged-set validation and
-- completed_at consistency still apply, including for partially finished sessions.
do $$
declare rule record;
begin
  for rule in
    select conname from pg_constraint
    where conrelid = 'public.fitness_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%fitness_has_completed_set%'
  loop
    execute format('alter table public.fitness_sessions drop constraint %I', rule.conname);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
