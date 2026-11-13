-- Extend routine/session validation without changing existing rep-based workouts.
begin;
create or replace function public.fitness_exercises_valid(items jsonb, is_session boolean)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; work_set jsonb; n numeric;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20 or octet_length(items::text) > 150000 then return false; end if;
  for exercise in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(exercise->'name') is distinct from 'string' or char_length(btrim(exercise->>'name')) not between 1 and 100 or exercise->>'id' is null then return false; end if;
    if coalesce(exercise->>'mode', 'reps') not in ('reps', 'timed') then return false; end if;
    if is_session then
      if jsonb_typeof(exercise->'sets') is distinct from 'array' or jsonb_array_length(exercise->'sets') not between 1 and 12 then return false; end if;
      for work_set in select value from jsonb_array_elements(exercise->'sets') loop
        if jsonb_typeof(work_set->'done') is distinct from 'boolean' or work_set->>'id' is null then return false; end if;
        if work_set->'weight' <> 'null'::jsonb then
          if jsonb_typeof(work_set->'weight') is distinct from 'number' then return false; end if;
          n := (work_set->>'weight')::numeric; if n not between 0 and 2000 then return false; end if;
        end if;
        if work_set->'reps' <> 'null'::jsonb then
          if jsonb_typeof(work_set->'reps') is distinct from 'number' then return false; end if;
          n := (work_set->>'reps')::numeric; if n not between 1 and 1000 or n <> trunc(n) then return false; end if;
        end if;
        if coalesce(exercise->>'mode', 'reps') = 'timed' then
          if work_set->'seconds' is not null and work_set->'seconds' <> 'null'::jsonb then
            if jsonb_typeof(work_set->'seconds') is distinct from 'number' then return false; end if;
            n := (work_set->>'seconds')::numeric; if n not between 1 and 86400 or n <> trunc(n) then return false; end if;
          end if;
          if (work_set->>'done')::boolean and coalesce(jsonb_typeof(work_set->'seconds'), '') <> 'number' then return false; end if;
        elsif (work_set->>'done')::boolean and (coalesce(jsonb_typeof(work_set->'weight'), '') is distinct from 'number' or coalesce(jsonb_typeof(work_set->'reps'), '') is distinct from 'number') then return false; end if;
      end loop;
    else
      if jsonb_typeof(exercise->'sets') is distinct from 'number' or jsonb_typeof(exercise->'rest') is distinct from 'number' or jsonb_typeof(exercise->'reps') is distinct from 'string' then return false; end if;
      n := (exercise->>'sets')::numeric; if n not between 1 and 12 or n <> trunc(n) then return false; end if;
      n := (exercise->>'rest')::numeric; if n not between 0 and 600 or n <> trunc(n) then return false; end if;
      if coalesce(exercise->>'mode', 'reps') = 'timed' then
        if jsonb_typeof(exercise->'seconds') is distinct from 'number' then return false; end if;
        n := (exercise->>'seconds')::numeric; if n not between 1 and 7200 or n <> trunc(n) then return false; end if;
      elsif char_length(btrim(exercise->>'reps')) not between 1 and 30 then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end $$;

notify pgrst, 'reload schema';
commit;
