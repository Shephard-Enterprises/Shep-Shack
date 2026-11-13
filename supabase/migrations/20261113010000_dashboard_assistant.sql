-- Private, bounded chat storage. Only the Edge Function can write transcripts or usage.
create table public.assistant_settings (
  id boolean primary key default true check (id),
  monthly_limit_usd numeric(10,4) not null default 5 check (monthly_limit_usd between 0 and 100)
);
insert into public.assistant_settings (id) values (true);

create table public.assistant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences text not null default '' check (octet_length(preferences) <= 4000)
);
create table public.assistant_threads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) <= 80),
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 60 and octet_length(messages::text) <= 4000000),
  updated_at timestamptz not null default now()
);
create index assistant_threads_owner on public.assistant_threads (user_id, updated_at desc);
create table public.assistant_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  created_at timestamptz not null default now(),
  month date not null default date_trunc('month', now() at time zone 'America/Los_Angeles')::date,
  amount_usd numeric(12,8) not null default 0.05 check (amount_usd between 0 and 0.05),
  finalized boolean not null default false
);
create index assistant_requests_month on public.assistant_requests (month);
create index assistant_requests_owner on public.assistant_requests (user_id, created_at desc);

alter table public.assistant_settings enable row level security;
alter table public.assistant_profiles enable row level security;
alter table public.assistant_threads enable row level security;
alter table public.assistant_requests enable row level security;
revoke all on public.assistant_settings, public.assistant_profiles, public.assistant_threads, public.assistant_requests from anon, authenticated;
grant select on public.assistant_settings, public.assistant_threads to authenticated;
grant select, insert, update on public.assistant_profiles to authenticated;
grant delete on public.assistant_threads to authenticated;
grant all on public.assistant_settings, public.assistant_profiles, public.assistant_threads, public.assistant_requests to service_role;
create policy assistant_settings_read on public.assistant_settings for select to authenticated using (public.is_household_member());
create policy assistant_profile_owner on public.assistant_profiles for all to authenticated using (auth.uid() = user_id and public.is_household_member()) with check (auth.uid() = user_id and public.is_household_member());
create policy assistant_thread_read on public.assistant_threads for select to authenticated using (auth.uid() = user_id and public.is_household_member());
create policy assistant_thread_delete on public.assistant_threads for delete to authenticated using (auth.uid() = user_id and public.is_household_member());

create function public.assistant_budget()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_household_member() then raise exception 'Household access required'; end if;
  select jsonb_build_object('limit', s.monthly_limit_usd, 'used', coalesce((
    select sum(r.amount_usd) from public.assistant_requests r
    where r.month = date_trunc('month', now() at time zone 'America/Los_Angeles')::date
  ), 0), 'month', to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM')) into result
  from public.assistant_settings s where id;
  return result;
end $$;
create function public.assistant_set_limit(p_limit numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_household_member() then raise exception 'Household access required'; end if;
  if p_limit is null or p_limit < 0 or p_limit > 100 then raise exception 'Choose a cap from $0 to $100'; end if;
  update public.assistant_settings set monthly_limit_usd = p_limit where id;
end $$;

-- Serialize reservations against one shared household cap, including concurrent devices.
-- Ambiguous API failures retain their reservation; never release potentially billed work.
create function public.assistant_reserve(p_id uuid, p_user uuid, p_thread uuid, p_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare cap numeric; used numeric;
begin
  select monthly_limit_usd into cap from public.assistant_settings where id for update;
  if not exists (select 1 from public.household_members where user_id = p_user) then raise exception 'Household access required'; end if;
  if exists (select 1 from public.assistant_requests where id = p_id) then raise exception 'This message was already submitted. Reload the conversation.'; end if;
  if exists (select 1 from public.assistant_requests where user_id = p_user and created_at > now() - interval '10 seconds')
    or exists (select 1 from public.assistant_requests where user_id = p_user and not finalized and created_at > now() - interval '2 minutes') then
    raise exception 'Please wait before sending another message';
  end if;
  select coalesce(sum(amount_usd), 0) into used from public.assistant_requests
  where month = date_trunc('month', now() at time zone 'America/Los_Angeles')::date;
  if used + 0.05 > cap then raise exception 'Monthly chat cap reached. Increase the cap in chat settings or wait until next month.'; end if;
  if exists (select 1 from public.assistant_threads where id = p_thread and user_id <> p_user) then raise exception 'Conversation unavailable'; end if;
  if not exists (select 1 from public.assistant_threads where id = p_thread) then
    if (select count(*) from public.assistant_threads where user_id = p_user) >= 30 then raise exception 'Delete an old conversation before starting another (30 maximum)'; end if;
    insert into public.assistant_threads(id, user_id, title) values (p_thread, p_user, left(p_title, 80));
  end if;
  insert into public.assistant_requests (id, user_id, thread_id) values (p_id, p_user, p_thread);
end $$;

create function public.assistant_finish(p_id uuid, p_amount numeric, p_messages jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare request public.assistant_requests;
begin
  select * into request from public.assistant_requests where id = p_id for update;
  if not found or request.finalized then return; end if;
  if p_amount is null or p_amount < 0 or p_amount > 0.05 then raise exception 'Invalid usage settlement'; end if;
  update public.assistant_requests set amount_usd = p_amount, finalized = true where id = p_id;
  if p_messages is not null then
    update public.assistant_threads set messages = p_messages, updated_at = now()
    where id = request.thread_id and user_id = request.user_id;
  end if;
end $$;
revoke all on function public.assistant_budget(), public.assistant_set_limit(numeric), public.assistant_reserve(uuid, uuid, uuid, text), public.assistant_finish(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.assistant_budget(), public.assistant_set_limit(numeric) to authenticated;
grant execute on function public.assistant_reserve(uuid, uuid, uuid, text), public.assistant_finish(uuid, numeric, jsonb) to service_role;

-- Usage for older months is no longer needed for the cap. Transcripts expire after 180 idle days.
select cron.schedule('shep-assistant-retention', '31 10 * * *', $$
  delete from public.assistant_requests where created_at < now() - interval '90 days';
  delete from public.assistant_threads where updated_at < now() - interval '180 days';
$$);
