begin;
create table public.fitness_movements (
  id text primary key check (char_length(id) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null default 'Custom' check (char_length(category) between 1 and 50),
  equipment text not null default 'Other' check (char_length(equipment) between 1 and 60),
  mode text not null default 'reps' check (mode in ('reps','timed')),
  aliases text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  check (cardinality(aliases) <= 20)
);
create unique index fitness_movement_names on public.fitness_movements(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
insert into public.fitness_movements(id,name,category,equipment,mode,aliases) values
('dumbbell-curl','Dumbbell curl','Arms','Dumbbells','reps',array['DB curl','DB curls','Dumbbell curls']::text[]),
('barbell-curl','Barbell curl','Arms','Barbell','reps',array['Barbell curls','BB curl']::text[]),
('hammer-curl','Dumbbell hammer curl','Arms','Dumbbells','reps',array['Hammer curl','Hammer curls','Dumbbell hammer curls']::text[]),
('ez-bar-curl','EZ-bar curl','Arms','EZ bar','reps',array['EZ bar curl','EZ bar curls']::text[]),
('cable-curl','Cable curl','Arms','Cable','reps',array['Cable curls']::text[]),
('incline-dumbbell-curl','Incline dumbbell curl','Arms','Dumbbells','reps',array['Incline DB curl']::text[]),
('triceps-pushdown','Cable triceps pushdown','Arms','Cable','reps',array['Triceps pushdown','Tricep pushdown','Rope pushdown']::text[]),
('overhead-triceps-extension','Dumbbell overhead triceps extension','Arms','Dumbbells','reps',array['Overhead dumbbell triceps extension']::text[]),
('barbell-bench-press','Barbell bench press','Chest','Barbell','reps',array['Bench press','Barbell bench','BB bench press']::text[]),
('dumbbell-bench-press','Dumbbell bench press','Chest','Dumbbells','reps',array['DB bench press','DB bench']::text[]),
('incline-dumbbell-press','Incline dumbbell bench press','Chest','Dumbbells','reps',array['Incline dumbbell press','Incline DB press']::text[]),
('incline-barbell-press','Incline barbell bench press','Chest','Barbell','reps',array['Incline barbell press']::text[]),
('push-up','Push-up','Chest','Bodyweight','reps',array['Push up','Push ups','Push-ups']::text[]),
('dumbbell-fly','Dumbbell fly','Chest','Dumbbells','reps',array['Dumbbell flyes','DB fly']::text[]),
('cable-fly','Cable fly','Chest','Cable','reps',array['Cable flyes']::text[]),
('chest-press-machine','Machine chest press','Chest','Machine','reps',array['Chest press machine']::text[]),
('dumbbell-row','Dumbbell row','Back','Dumbbells','reps',array['DB row','DB rows','Dumbbell rows','One-arm dumbbell row']::text[]),
('barbell-row','Barbell row','Back','Barbell','reps',array['Bent-over barbell row','Bent over barbell row']::text[]),
('seated-cable-row','Seated cable row','Back','Cable','reps',array['Seated row','Cable row']::text[]),
('lat-pulldown','Lat pulldown','Back','Cable','reps',array['Lat pull-down','Lat pull down']::text[]),
('pull-up','Pull-up','Back','Bodyweight','reps',array['Pull up','Pull ups','Pull-ups']::text[]),
('chin-up','Chin-up','Back','Bodyweight','reps',array['Chin up','Chin ups','Chin-ups']::text[]),
('face-pull','Cable face pull','Back','Cable','reps',array['Face pull','Face pulls']::text[]),
('barbell-overhead-press','Barbell overhead press','Shoulders','Barbell','reps',array['Overhead press','Military press','OHP']::text[]),
('dumbbell-shoulder-press','Dumbbell shoulder press','Shoulders','Dumbbells','reps',array['DB shoulder press','Dumbbell overhead press']::text[]),
('dumbbell-lateral-raise','Dumbbell lateral raise','Shoulders','Dumbbells','reps',array['Lateral raise','Lateral raises','DB lateral raise']::text[]),
('rear-delt-fly','Dumbbell rear delt fly','Shoulders','Dumbbells','reps',array['Rear delt fly','Reverse dumbbell fly']::text[]),
('barbell-back-squat','Barbell back squat','Legs','Barbell','reps',array['Back squat','Barbell squat']::text[]),
('barbell-front-squat','Barbell front squat','Legs','Barbell','reps',array['Front squat']::text[]),
('goblet-squat','Goblet squat','Legs','Dumbbell / kettlebell','reps',array['Goblet squats']::text[]),
('bodyweight-squat','Bodyweight squat','Legs','Bodyweight','reps',array['Air squat','Air squats']::text[]),
('leg-press','Leg press','Legs','Machine','reps',array[]::text[]),
('leg-extension','Leg extension','Legs','Machine','reps',array['Leg extensions']::text[]),
('seated-leg-curl','Seated leg curl','Legs','Machine','reps',array['Seated hamstring curl']::text[]),
('lying-leg-curl','Lying leg curl','Legs','Machine','reps',array['Lying hamstring curl']::text[]),
('barbell-deadlift','Barbell deadlift','Legs','Barbell','reps',array['Deadlift','Conventional deadlift']::text[]),
('barbell-rdl','Barbell Romanian deadlift','Legs','Barbell','reps',array['Barbell RDL']::text[]),
('dumbbell-rdl','Dumbbell Romanian deadlift','Legs','Dumbbells','reps',array['Dumbbell RDL','DB RDL']::text[]),
('dumbbell-lunge','Dumbbell lunge','Legs','Dumbbells','reps',array['Dumbbell lunges','DB lunge']::text[]),
('bulgarian-split-squat','Dumbbell Bulgarian split squat','Legs','Dumbbells','reps',array['Bulgarian split squat']::text[]),
('barbell-hip-thrust','Barbell hip thrust','Legs','Barbell','reps',array['Hip thrust','Barbell hip thrusts']::text[]),
('standing-calf-raise','Standing calf raise','Legs','Machine / bodyweight','reps',array['Standing calf raises']::text[]),
('seated-calf-raise','Seated calf raise','Legs','Machine','reps',array['Seated calf raises']::text[]),
('crunch','Crunch','Core','Bodyweight','reps',array['Crunches']::text[]),
('hanging-knee-raise','Hanging knee raise','Core','Bodyweight','reps',array['Hanging knee raises']::text[]),
('dead-bug','Dead bug','Core','Bodyweight','reps',array['Dead bugs']::text[]),
('plank','Plank','Core','Bodyweight','timed',array['Front plank']::text[]),
('side-plank','Side plank','Core','Bodyweight','timed',array['Side planks']::text[]),
('wall-sit','Wall sit','Legs','Bodyweight','timed',array['Wall sits']::text[]),
('farmers-carry','Dumbbell farmer carry','Full body','Dumbbells','timed',array['Farmers carry','Farmer''s carry','Farmer carry']::text[]);
alter table public.fitness_movements enable row level security;
revoke all on public.fitness_movements from anon, authenticated;
grant select, insert on public.fitness_movements to authenticated;
grant all on public.fitness_movements to service_role;
create policy movement_read on public.fitness_movements for select to authenticated using (public.is_household_member());
create policy movement_create on public.fitness_movements for insert to authenticated with check (
  public.is_household_member() and created_by = auth.uid() and id ~ '^custom-[0-9a-f-]{36}$' and cardinality(aliases) = 0
);

create function public.fitness_resolve_movement(p_name text)
returns text language sql stable set search_path = '' as $$
  select case when count(*) = 1 then min(id) else null end from public.fitness_movements m
  where lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g')) = any (
    select lower(regexp_replace(btrim(v), '\s+', ' ', 'g')) from unnest(array[m.name] || m.aliases) v
  );
$$;

create function public.fitness_new_movement()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(830134);
  if public.fitness_resolve_movement(new.name) is not null then raise exception using errcode = '23505', message = 'This movement is already in the library'; end if;
  new.name := btrim(new.name);
  return new;
end $$;
create trigger fitness_movement_insert before insert on public.fitness_movements for each row execute function public.fitness_new_movement();

create function public.fitness_link_movements()
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
    if coalesce(item->>'mode','reps') <> movement.mode then
      if tg_op = 'UPDATE' and nullif(item->>'movement_id','') is null then linked := linked || jsonb_build_array(item); continue; end if;
      raise exception 'Movement tracking type does not match %', movement.name;
    end if;
    linked := linked || jsonb_build_array(item || jsonb_build_object('movement_id',movement.id,'name',movement.name));
  end loop;
  new.exercises := linked;
  return new;
end $$;
create trigger fitness_link_movement_routine before insert or update on public.fitness_routines for each row execute function public.fitness_link_movements();
create trigger fitness_link_movement_session before insert or update on public.fitness_sessions for each row execute function public.fitness_link_movements();

-- Backfill only exact, unambiguous names/aliases. Generic names such as "curls"
-- remain unlinked so barbell, dumbbell, and cable variations are not mixed.
update public.fitness_routines set exercises = exercises;
update public.fitness_sessions set exercises = exercises;

create function public.fitness_link_history(p_profile uuid, p_name text, p_movement text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.fitness_movements;
begin
  if not public.is_household_member() then raise exception 'Household access required'; end if;
  select * into target from public.fitness_movements where id = p_movement;
  if not found then raise exception 'Movement unavailable'; end if;
  update public.fitness_routines r set exercises = (
    select jsonb_agg(case when nullif(e->>'movement_id','') is null and lower(regexp_replace(btrim(e->>'name'),'\s+',' ','g')) = lower(regexp_replace(btrim(p_name),'\s+',' ','g')) and coalesce(e->>'mode','reps') = target.mode
      then e || jsonb_build_object('movement_id',target.id,'name',target.name) else e end order by n)
    from jsonb_array_elements(r.exercises) with ordinality x(e,n)
  ) where r.profile_id = p_profile and exists (select 1 from jsonb_array_elements(r.exercises) e where nullif(e->>'movement_id','') is null and lower(regexp_replace(btrim(e->>'name'),'\s+',' ','g')) = lower(regexp_replace(btrim(p_name),'\s+',' ','g')));
  update public.fitness_sessions r set exercises = (
    select jsonb_agg(case when nullif(e->>'movement_id','') is null and lower(regexp_replace(btrim(e->>'name'),'\s+',' ','g')) = lower(regexp_replace(btrim(p_name),'\s+',' ','g')) and coalesce(e->>'mode','reps') = target.mode
      then e || jsonb_build_object('movement_id',target.id,'name',target.name) else e end order by n)
    from jsonb_array_elements(r.exercises) with ordinality x(e,n)
  ) where r.profile_id = p_profile and jsonb_array_length(r.exercises) > 0 and exists (select 1 from jsonb_array_elements(r.exercises) e where nullif(e->>'movement_id','') is null and lower(regexp_replace(btrim(e->>'name'),'\s+',' ','g')) = lower(regexp_replace(btrim(p_name),'\s+',' ','g')));
end $$;
revoke all on function public.fitness_link_history(uuid,text,text) from public, anon, authenticated;
grant execute on function public.fitness_link_history(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
