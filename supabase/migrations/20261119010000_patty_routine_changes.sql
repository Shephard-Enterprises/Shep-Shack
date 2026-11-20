begin;

-- Before/after snapshots make Patty's writes reversible without touching workout history.
create table public.assistant_routine_changes (
  id uuid primary key references public.assistant_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  routine_id uuid not null,
  profile_id uuid not null references public.fitness_profiles(id),
  before_routine jsonb,
  after_routine jsonb not null,
  undone_at timestamptz
);
alter table public.assistant_routine_changes enable row level security;
revoke all on public.assistant_routine_changes from public, anon, authenticated;
grant select on public.assistant_routine_changes to authenticated;
grant all on public.assistant_routine_changes to service_role;
create policy assistant_changes_owner on public.assistant_routine_changes for select to authenticated
  using (user_id = auth.uid() and public.is_household_member());

create function public.assistant_finish_routine(
  p_id uuid, p_amount numeric, p_messages jsonb, p_profile uuid,
  p_routine jsonb, p_edit_id uuid default null, p_expected_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare request public.assistant_requests; before_row public.fitness_routines; after_row public.fitness_routines; saved_id uuid;
begin
  select * into request from public.assistant_requests where id = p_id for update;
  if not found then raise exception 'Chat request not found'; end if;
  if request.finalized then
    select routine_id into saved_id from public.assistant_routine_changes where id = p_id;
    return saved_id;
  end if;
  if not exists (select 1 from public.household_members where user_id = request.user_id) then raise exception 'Household access required'; end if;
  if p_edit_id is null then
    saved_id := public.assistant_finish_fitness(p_id, p_amount, p_messages, p_profile, p_routine);
  else
    if p_routine is null then raise exception 'An edited routine is required'; end if;
    select * into before_row from public.fitness_routines where id = p_edit_id and profile_id = p_profile for update;
    if not found then raise exception 'The routine is no longer available. Nothing was changed.'; end if;
    if p_expected_at is null or before_row.updated_at <> p_expected_at then
      raise exception 'This routine changed while Patty was answering. Ask her to retry with the latest version.';
    end if;
    update public.fitness_routines set name = p_routine->>'name', unit = p_routine->>'unit',
      notes = coalesce(p_routine->>'notes', ''), exercises = p_routine->'exercises',
      timer_order = coalesce(p_routine->>'timer_order', 'sets')
      where id = p_edit_id returning id into saved_id;
    perform public.assistant_finish(p_id, p_amount, p_messages);
  end if;
  if saved_id is not null then
    select * into after_row from public.fitness_routines where id = saved_id;
    insert into public.assistant_routine_changes(id, user_id, thread_id, routine_id, profile_id, before_routine, after_routine)
      values (p_id, request.user_id, request.thread_id, saved_id, p_profile,
        case when p_edit_id is null then null else to_jsonb(before_row) end, to_jsonb(after_row));
  end if;
  return saved_id;
end $$;
revoke all on function public.assistant_finish_routine(uuid, numeric, jsonb, uuid, jsonb, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.assistant_finish_routine(uuid, numeric, jsonb, uuid, jsonb, uuid, timestamptz) to service_role;

create function public.assistant_undo_routine(p_change uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare change public.assistant_routine_changes; current_row public.fitness_routines;
begin
  if not public.is_household_member() then raise exception 'Household access required'; end if;
  select * into change from public.assistant_routine_changes where id = p_change and user_id = auth.uid() for update;
  if not found then raise exception 'That routine change is unavailable to this account.'; end if;
  if change.undone_at is null then
    -- Serialize with chat settlement so undo markers cannot be overwritten by an in-flight answer.
    perform 1 from public.assistant_threads where id = change.thread_id for update;
    if exists (select 1 from public.assistant_requests where thread_id = change.thread_id and not finalized) then
      raise exception 'Wait for Patty to finish answering before undoing this change.';
    end if;
    select * into current_row from public.fitness_routines where id = change.routine_id for update;
    if not found or to_jsonb(current_row) is distinct from change.after_routine then
      raise exception 'This routine has changed since then. Undo would overwrite newer changes.';
    end if;
    if change.before_routine is null then
      if exists (select 1 from public.fitness_sessions where routine_id = change.routine_id) then
        raise exception 'This routine has already been used for a workout. Remove it from Fitness if needed.';
      end if;
      delete from public.fitness_routines where id = change.routine_id;
    else
      update public.fitness_routines set name = change.before_routine->>'name', unit = change.before_routine->>'unit',
        notes = change.before_routine->>'notes', exercises = change.before_routine->'exercises',
        timer_order = change.before_routine->>'timer_order' where id = change.routine_id;
    end if;
    update public.assistant_routine_changes set undone_at = now() where id = p_change;
    update public.assistant_threads set messages = (
      select jsonb_agg(case when message->>'changeId' = p_change::text then message || '{"changeUndone":true}'::jsonb else message end order by ordinal)
      from jsonb_array_elements(messages) with ordinality as entries(message, ordinal)
    ), updated_at = now() where id = change.thread_id;
  end if;
  return jsonb_build_object('fitnessProfileId', change.profile_id, 'routineId', change.routine_id, 'removed', change.before_routine is null);
end $$;
revoke all on function public.assistant_undo_routine(uuid) from public, anon;
grant execute on function public.assistant_undo_routine(uuid) to authenticated;
-- A response that started before an undo must not erase its persisted status.
create function public.assistant_preserve_undo_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from jsonb_array_elements(old.messages) m where m->>'changeUndone' = 'true') then
    new.messages := (select coalesce(jsonb_agg(
      case when exists (select 1 from jsonb_array_elements(old.messages) previous
        where previous->>'changeId' = message->>'changeId' and previous->>'changeUndone' = 'true')
      then message || '{"changeUndone":true}'::jsonb else message end order by ordinal
    ), '[]'::jsonb) from jsonb_array_elements(new.messages) with ordinality as entries(message, ordinal));
  end if;
  return new;
end $$;
create trigger assistant_thread_undo_status before update of messages on public.assistant_threads
  for each row execute function public.assistant_preserve_undo_status();
notify pgrst, 'reload schema';
commit;
