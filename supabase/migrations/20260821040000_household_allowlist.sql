create table if not exists public.household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Preserve access for every account the household administrator has already created.
insert into public.household_members (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;

create policy "members can verify their own access"
on public.household_members for select to authenticated
using (auth.uid() = user_id);

create or replace function public.is_household_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member() from public;
grant execute on function public.is_household_member() to authenticated;

drop policy if exists "household members can read keg status" on public.keg_readings;
create policy "household members can read keg status"
on public.keg_readings for select to authenticated
using (public.is_household_member());

drop policy if exists "household members can read keg pours" on public.keg_pours;
create policy "household members can read keg pours"
on public.keg_pours for select to authenticated
using (public.is_household_member());

drop policy if exists "household members can read keg changes" on public.keg_changes;
create policy "household members can read keg changes"
on public.keg_changes for select to authenticated
using (public.is_household_member());

drop policy if exists "household members can read notification events" on public.notification_events;
create policy "household members can read notification events"
on public.notification_events for select to authenticated
using (public.is_household_member());

drop policy if exists "users manage their own push subscriptions" on public.push_subscriptions;
create policy "household members manage their own push subscriptions"
on public.push_subscriptions for all to authenticated
using (public.is_household_member() and auth.uid() = user_id)
with check (public.is_household_member() and auth.uid() = user_id);

drop policy if exists "users manage their notification reads" on public.notification_reads;
create policy "household members manage their notification reads"
on public.notification_reads for all to authenticated
using (public.is_household_member() and auth.uid() = user_id)
with check (public.is_household_member() and auth.uid() = user_id);
