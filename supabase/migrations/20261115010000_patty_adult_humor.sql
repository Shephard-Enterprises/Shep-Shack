alter table public.assistant_profiles add column adult_humor boolean not null default false;

-- Change only this preference, preserving About you edits from other devices.
create function public.assistant_set_adult_humor(p_enabled boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_enabled is null then raise exception 'Choose on or off'; end if;
  insert into public.assistant_profiles(user_id, adult_humor)
    values(auth.uid(), p_enabled)
    on conflict(user_id) do update set adult_humor = excluded.adult_humor;
  return p_enabled;
end $$;
revoke all on function public.assistant_set_adult_humor(boolean) from public, anon;
grant execute on function public.assistant_set_adult_humor(boolean) to authenticated;
notify pgrst, 'reload schema';
