begin;
alter table public.fitness_routines add column timer_order text not null default 'sets' check (timer_order in ('sets','circuit'));
alter table public.fitness_sessions
  add column is_adhoc boolean not null default false,
  add column timer_order text not null default 'sets' check (timer_order in ('sets','circuit')),
  add column timer_state jsonb,
  add constraint fitness_adhoc_without_routine check (not is_adhoc or routine_id is null);

create function public.fitness_timer_valid(timer jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare key text; n numeric;
begin
  if timer is null then return true; end if;
  if jsonb_typeof(timer) is distinct from 'object' or octet_length(timer::text) > 100000 then return false; end if;
  if timer->>'version' is distinct from '1' or coalesce(timer->>'status','') not in ('ready','running','paused','complete') then return false; end if;
  if jsonb_typeof(timer->'signature') is distinct from 'string' or char_length(timer->>'signature') > 80000 then return false; end if;
  foreach key in array array['phaseIndex','phaseElapsedMs','elapsedMs','updatedAt'] loop
    if jsonb_typeof(timer->key) is distinct from 'number' then return false; end if;
    n := (timer->>key)::numeric;
    if n < 0 or n <> trunc(n) then return false; end if;
    if key = 'phaseIndex' and n > 480 then return false; end if;
    if key in ('phaseElapsedMs','elapsedMs') and n > 31536000000 then return false; end if;
    if key = 'updatedAt' and n > 9999999999999 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
alter table public.fitness_sessions add constraint fitness_timer_state_valid check (public.fitness_timer_valid(timer_state));

create or replace function public.fitness_exercises_valid(items jsonb, is_session boolean)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; work_set jsonb; n numeric;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20 or octet_length(items::text) > 150000 then return false; end if;
  for exercise in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(exercise->'name') is distinct from 'string' or char_length(btrim(exercise->>'name')) not between 1 and 100 or exercise->>'id' is null then return false; end if;
    if coalesce(exercise->>'mode', 'reps') not in ('reps', 'timed') then return false; end if;
    if exercise->'rest' is not null then
      if jsonb_typeof(exercise->'rest') is distinct from 'number' then return false; end if;
      n := (exercise->>'rest')::numeric; if n not between 0 and 600 or n <> trunc(n) then return false; end if;
    end if;
    if is_session and coalesce(exercise->>'mode','reps') = 'timed' and exercise->'target_seconds' is not null and exercise->'target_seconds' <> 'null'::jsonb then
      if jsonb_typeof(exercise->'target_seconds') is distinct from 'number' then return false; end if;
      n := (exercise->>'target_seconds')::numeric; if n not between 1 and 7200 or n <> trunc(n) then return false; end if;
    end if;
    if exercise->'work_seconds' is not null and exercise->'work_seconds' <> 'null'::jsonb then
      if jsonb_typeof(exercise->'work_seconds') is distinct from 'number' then return false; end if;
      n := (exercise->>'work_seconds')::numeric; if n not between 1 and 7200 or n <> trunc(n) then return false; end if;
    end if;
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

create or replace function public.assistant_finish_fitness(p_id uuid, p_amount numeric, p_messages jsonb, p_profile uuid, p_routine jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request public.assistant_requests; saved_id uuid;
begin
  select * into request from public.assistant_requests where id = p_id for update;
  if not found then raise exception 'Chat request not found'; end if;
  if request.finalized then
    select id into saved_id from public.fitness_routines where id = p_id and profile_id = p_profile;
    return saved_id;
  end if;
  if not exists (select 1 from public.household_members where user_id = request.user_id) then raise exception 'Household access required'; end if;
  if not exists (select 1 from public.fitness_profiles where id = p_profile) then raise exception 'Training profile unavailable'; end if;
  if p_routine is not null then
    insert into public.fitness_routines(id, user_id, profile_id, name, unit, notes, exercises, timer_order)
    values (p_id, request.user_id, p_profile, p_routine->>'name', p_routine->>'unit', coalesce(p_routine->>'notes',''), p_routine->'exercises', coalesce(p_routine->>'timer_order','sets'));
    saved_id := p_id;
  end if;
  perform public.assistant_finish(p_id, p_amount, p_messages);
  return saved_id;
end $$;

create function public.assistant_finish_adhoc(p_id uuid, p_amount numeric, p_messages jsonb, p_profile uuid, p_session jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request public.assistant_requests; saved_id uuid;
begin
  select * into request from public.assistant_requests where id = p_id for update;
  if not found then raise exception 'Chat request not found'; end if;
  if request.finalized then
    select id into saved_id from public.fitness_sessions where id = p_id and profile_id = p_profile;
    return saved_id;
  end if;
  if not exists (select 1 from public.household_members where user_id = request.user_id) then raise exception 'Household access required'; end if;
  if not exists (select 1 from public.fitness_profiles where id = p_profile) then raise exception 'Training profile unavailable'; end if;
  if exists (select 1 from public.fitness_sessions where profile_id = p_profile and status = 'draft') then
    raise exception 'Finish or discard the active workout before creating a one-off workout.';
  end if;
  insert into public.fitness_sessions(id, user_id, profile_id, routine_id, is_adhoc, name, unit, notes, exercises, timer_order, status)
  values (p_id, request.user_id, p_profile, null, true, p_session->>'name', p_session->>'unit', coalesce(p_session->>'notes',''), p_session->'exercises', coalesce(p_session->>'timer_order','sets'), 'draft');
  perform public.assistant_finish(p_id, p_amount, p_messages);
  return p_id;
end $$;
revoke all on function public.assistant_finish_adhoc(uuid,numeric,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.assistant_finish_adhoc(uuid,numeric,jsonb,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
