-- Run against a disposable database with migrations applied. Every fixture rolls back.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.household_members(user_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into public.assistant_threads(id, user_id, title) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), 'Test edits');
insert into public.assistant_requests(id, user_id, thread_id)
select id::uuid, auth.uid(), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' from unnest(array[
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff', '99999999-9999-4999-8999-999999999999'
]) id;

create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'TEST FAILED: %', message; end if; end $$;

do $$
declare routine jsonb := '{"name":"Test routine","unit":"lb","notes":"original","timer_order":"sets","exercises":[{"id":"row","movement_id":"dumbbell-row","name":"Dumbbell row","mode":"reps","sets":3,"reps":"8–12","rest":90}]}';
  created uuid; edited uuid; original public.fitness_routines; result jsonb;
begin
  created := public.assistant_finish_routine('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 0.001,
    '[{"role":"assistant","content":"Saved","changeId":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}]',
    '11111111-1111-4111-8111-111111111111', routine);
  perform pg_temp.assert(created = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Create returns routine ID');
  select * into original from public.fitness_routines where id = created;
  perform pg_temp.assert((select count(*) = 1 from public.assistant_routine_changes where id = created), 'Create records undo snapshot');
  edited := public.assistant_finish_routine('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 0.001,
    '[{"role":"assistant","content":"Updated","changeId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}]',
    original.profile_id, jsonb_set(routine, '{exercises,0,sets}', '4'), created, original.updated_at);
  perform pg_temp.assert(edited = created, 'Edit retains identity');
  perform pg_temp.assert((select exercises->0->>'sets' = '4' and user_id = original.user_id from public.fitness_routines where id = created), 'Edit changes sets and preserves creator');
  perform pg_temp.assert(public.assistant_finish_routine('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 0.001, '[]', original.profile_id, routine, created, original.updated_at) = created, 'Retry is idempotent');
  -- Outstanding reservations prevent undo until they settle.
  begin
    perform public.assistant_undo_routine('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    raise exception 'TEST FAILED: pending answer allowed undo';
  exception when others then if sqlerrm not like 'Wait for Patty%' then raise; end if; end;
  perform public.assistant_finish('ffffffff-ffff-4fff-8fff-ffffffffffff', 0, null);
  perform public.assistant_finish('99999999-9999-4999-8999-999999999999', 0, null);
  -- Other household accounts cannot undo this account's actions.
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
  begin
    perform public.assistant_undo_routine('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    raise exception 'TEST FAILED: another account undid the change';
  exception when others then if sqlerrm not like 'That routine change%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  result := public.assistant_undo_routine('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  perform pg_temp.assert(result->>'removed' = 'false', 'Undo edit restores instead of deleting');
  perform pg_temp.assert((select exercises = original.exercises and notes = original.notes from public.fitness_routines where id = created), 'Undo restores exact prescription');
  perform public.assistant_undo_routine('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  perform pg_temp.assert((select messages->0->>'changeUndone' = 'true' from public.assistant_threads where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'Undo status is persisted');
  update public.assistant_threads set messages = '[{"role":"assistant","changeId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","content":"stale response"}]' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  perform pg_temp.assert((select messages->0->>'changeUndone' = 'true' from public.assistant_threads where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'A stale response cannot erase undo status');
  -- Restore a pending request to exercise optimistic concurrency.
  update public.assistant_requests set finalized = false where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  begin
    perform public.assistant_finish_routine('ffffffff-ffff-4fff-8fff-ffffffffffff', 0, '[]', original.profile_id, routine, created, original.updated_at - interval '1 second');
    raise exception 'TEST FAILED: stale edit overwrote a routine';
  exception when others then if sqlerrm not like 'This routine changed%' then raise; end if; end;
  perform pg_temp.assert((select exercises = original.exercises from public.fitness_routines where id = created), 'Stale edit leaves original untouched');
  perform public.assistant_finish('ffffffff-ffff-4fff-8fff-ffffffffffff', 0, null);
  -- A later manual edit blocks undoing the original creation.
  update public.fitness_routines set notes = 'newer manual change' where id = created;
  begin
    perform public.assistant_undo_routine('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'TEST FAILED: undo erased a newer manual change';
  exception when others then if sqlerrm not like 'This routine has changed%' then raise; end if; end;
  update public.fitness_routines set notes = original.notes where id = created;
  -- Existing sessions prevent undoing a creation; completed history is never deleted.
  insert into public.fitness_sessions(user_id, profile_id, routine_id, name, kind, minutes, status, completed_at, exercises)
    values(auth.uid(), original.profile_id, created, 'Walk', 'cardio', 20, 'completed', now(), '[]');
  begin
    perform public.assistant_undo_routine('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'TEST FAILED: undo removed a routine already used';
  exception when others then if sqlerrm not like 'This routine has already been used%' then raise; end if; end;
  perform pg_temp.assert((select count(*) = 1 from public.fitness_sessions where routine_id = created), 'Completed history is intact');
  delete from public.fitness_sessions where routine_id = created;
  result := public.assistant_undo_routine('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  perform pg_temp.assert(result->>'removed' = 'true' and not exists(select 1 from public.fitness_routines where id = created), 'Undo creation removes only the new routine');
end $$;
-- Execute permissions and RLS prevent direct client writes and cross-account access.
select pg_temp.assert(not has_function_privilege('authenticated', 'public.assistant_finish_routine(uuid,numeric,jsonb,uuid,jsonb,uuid,timestamptz)', 'execute'), 'Clients cannot bypass chat settlement');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.assistant_routine_changes', 'update'), 'Clients cannot alter snapshots');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select pg_temp.assert((select count(*) = 0 from public.assistant_routine_changes), 'RLS hides another account snapshots');
reset role;
rollback;
