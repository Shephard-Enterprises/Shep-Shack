begin;

-- Validate bounded routine/session JSON on the server as well as in the UI.
create function public.fitness_exercises_valid(items jsonb, is_session boolean)
returns boolean language plpgsql immutable set search_path = '' as $$
declare exercise jsonb; work_set jsonb; n numeric;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20 or octet_length(items::text) > 150000 then return false; end if;
  for exercise in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(exercise->'name') is distinct from 'string' or char_length(btrim(exercise->>'name')) not between 1 and 100 or exercise->>'id' is null then return false; end if;
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
        if (work_set->>'done')::boolean and (coalesce(jsonb_typeof(work_set->'weight'), '') is distinct from 'number' or coalesce(jsonb_typeof(work_set->'reps'), '') is distinct from 'number') then return false; end if;
      end loop;
    else
      if jsonb_typeof(exercise->'sets') is distinct from 'number' or jsonb_typeof(exercise->'rest') is distinct from 'number' or jsonb_typeof(exercise->'reps') is distinct from 'string' then return false; end if;
      n := (exercise->>'sets')::numeric; if n not between 1 and 12 or n <> trunc(n) then return false; end if;
      n := (exercise->>'rest')::numeric; if n not between 0 and 600 or n <> trunc(n) then return false; end if;
      if char_length(btrim(exercise->>'reps')) not between 1 and 30 then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create function public.fitness_has_completed_set(items jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(items) e,
    jsonb_array_elements(e->'sets') s where s->>'done' = 'true');
$$;

create table public.fitness_profiles (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 80),
  preferences text not null default '' check (char_length(preferences) <= 2000)
);
insert into public.fitness_profiles (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Justin'),
  ('22222222-2222-4222-8222-222222222222', 'Rosy');
alter table public.fitness_profiles enable row level security;
revoke all on public.fitness_profiles from anon, authenticated;
grant select, update (preferences) on public.fitness_profiles to authenticated;
grant all on public.fitness_profiles to service_role;
create policy fitness_profile_household on public.fitness_profiles for select to authenticated using (public.is_household_member());
create policy fitness_profile_notes on public.fitness_profiles for update to authenticated using (public.is_household_member()) with check (public.is_household_member());

create table public.fitness_routines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fitness_profiles(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  notes text not null default '' check (char_length(notes) <= 2000),
  exercises jsonb not null check (public.fitness_exercises_valid(exercises, false)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.fitness_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fitness_profiles(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid references public.fitness_routines(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  kind text not null default 'strength' check (kind in ('strength', 'cardio')),
  minutes numeric check (minutes > 0 and minutes <= 1440),
  distance numeric check (distance >= 0 and distance <= 2000),
  distance_unit text not null default 'mi' check (distance_unit in ('mi', 'km')),
  performed_on date not null default (now() at time zone 'America/Los_Angeles')::date,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  notes text not null default '' check (char_length(notes) <= 2000),
  exercises jsonb not null check ((kind = 'strength' and public.fitness_exercises_valid(exercises, true)) or (kind = 'cardio' and exercises = '[]'::jsonb)),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  check (kind <> 'cardio' or (status = 'completed' and minutes is not null)),
  check (status <> 'completed' or kind = 'cardio' or public.fitness_has_completed_set(exercises))
);
create index fitness_routines_owner on public.fitness_routines(profile_id, updated_at desc);
create index fitness_sessions_owner on public.fitness_sessions(profile_id, performed_on desc);
create unique index fitness_one_active_workout on public.fitness_sessions(profile_id) where status = 'draft';

create function public.fitness_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    if new.profile_id <> old.profile_id then raise exception 'Moving records between training profiles is not supported'; end if;
  elsif auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'Creator must match the signed-in account';
  end if;
  if tg_table_name = 'fitness_sessions' then
    if new.performed_on > (now() at time zone 'America/Los_Angeles')::date then raise exception 'Workout date cannot be in the future'; end if;
    if new.routine_id is not null and not exists (select 1 from public.fitness_routines where id = new.routine_id and profile_id = new.profile_id) then raise exception 'Routine does not belong to this account'; end if;
  end if;
  return new;
end $$;
create trigger fitness_routine_write before insert or update on public.fitness_routines for each row execute function public.fitness_before_write();
create trigger fitness_session_write before insert or update on public.fitness_sessions for each row execute function public.fitness_before_write();

alter table public.fitness_routines enable row level security;
alter table public.fitness_sessions enable row level security;
revoke all on public.fitness_routines, public.fitness_sessions from anon, authenticated;
grant select, insert, update, delete on public.fitness_routines, public.fitness_sessions to authenticated;
grant all on public.fitness_routines, public.fitness_sessions to service_role;
create policy fitness_routine_owner on public.fitness_routines for all to authenticated
  using (public.is_household_member())
  with check (public.is_household_member());
create policy fitness_session_owner on public.fitness_sessions for all to authenticated
  using (public.is_household_member())
  with check (public.is_household_member());

notify pgrst, 'reload schema';

-- Save a generated routine and its chat answer in one transaction. The model cannot
-- select another owner or profile; those IDs come from the authenticated request.
create function public.assistant_finish_fitness(p_id uuid, p_amount numeric, p_messages jsonb, p_profile uuid, p_routine jsonb default null)
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
    insert into public.fitness_routines(id, user_id, profile_id, name, unit, notes, exercises)
    values (p_id, request.user_id, p_profile, p_routine->>'name', p_routine->>'unit', coalesce(p_routine->>'notes',''), p_routine->'exercises');
    saved_id := p_id;
  end if;
  perform public.assistant_finish(p_id, p_amount, p_messages);
  return saved_id;
end $$;
revoke all on function public.assistant_finish_fitness(uuid, numeric, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.assistant_finish_fitness(uuid, numeric, jsonb, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';

commit;
