begin;

create table public.keg_scale_settings (
  scale_id text primary key check (scale_id in ('beer', 'sparkling-water')),
  display_name text not null check (
    char_length(display_name) between 1 and 32
    and display_name = btrim(display_name)
    and display_name !~ '[^ -~]'
  )
);
insert into public.keg_scale_settings (scale_id, display_name) values
  ('beer', 'Shep Shack Tap'), ('sparkling-water', 'Sparkling Water');

alter table public.keg_scale_settings enable row level security;
revoke all on public.keg_scale_settings from anon, authenticated;
grant select, update (display_name) on public.keg_scale_settings to authenticated;
grant all on public.keg_scale_settings to service_role;
create policy "household reads tap names" on public.keg_scale_settings
  for select to authenticated using (public.is_household_member());
create policy "household edits tap names" on public.keg_scale_settings
  for update to authenticated using (public.is_household_member())
  with check (public.is_household_member());

notify pgrst, 'reload schema';
commit;
