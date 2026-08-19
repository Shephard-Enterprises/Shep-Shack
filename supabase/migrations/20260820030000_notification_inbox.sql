alter table public.notification_events
add column if not exists url text not null default '/';

update public.notification_events
set url = case category
  when 'fire' then '/?page=fire'
  when 'earthquake' then '/?page=fire'
  when 'weather' then '/?page=fire'
  when 'emergency' then '/?page=fire'
  when 'keg' then '/?page=keg'
  when 'padres' then '/?page=padres'
  else '/'
end
where url = '/';

create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null references public.notification_events(event_key) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

alter table public.notification_reads enable row level security;

create policy "users manage their notification reads"
on public.notification_reads for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.notification_events to authenticated;
grant select, insert, update, delete on public.notification_reads to authenticated;
