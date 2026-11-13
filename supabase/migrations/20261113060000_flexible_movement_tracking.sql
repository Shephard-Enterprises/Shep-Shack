begin;
create or replace function public.fitness_link_movements()
returns trigger language plpgsql set search_path = '' as $$
declare item jsonb; linked jsonb := '[]'; movement public.fitness_movements; movement_id text; old_items jsonb;
begin
  for item in select value from jsonb_array_elements(new.exercises) loop
    movement_id := coalesce(nullif(item->>'movement_id',''), public.fitness_resolve_movement(item->>'name'));
    if movement_id is null then
      -- Preserve an unresolved historical entry until the user explicitly links it.
      if tg_op = 'UPDATE' and exists (select 1 from jsonb_array_elements(old.exercises) e where e->>'id' = item->>'id' and e->>'name' = item->>'name' and nullif(e->>'movement_id','') is null) then
        linked := linked || jsonb_build_array(item); continue;
      end if;
      raise exception 'Choose a movement from the library or create a custom movement: %', item->>'name';
    end if;
    select * into movement from public.fitness_movements where id = movement_id;
    if not found then raise exception 'Unknown movement: %', movement_id; end if;
    -- Keep unresolved historical tracking variations unchanged. Explicitly linked
    -- movements can use either tracking mode for each workout.
    if tg_op = 'UPDATE' and nullif(item->>'movement_id','') is null and coalesce(item->>'mode','reps') <> movement.mode then
      linked := linked || jsonb_build_array(item); continue;
    end if;
    linked := linked || jsonb_build_array(item || jsonb_build_object('movement_id',movement.id,'name',movement.name));
  end loop;
  new.exercises := linked;
  return new;
end $$;
notify pgrst, 'reload schema';
commit;
