create table if not exists public.notification_deliveries (
  event_key text not null references public.notification_events(event_key) on delete cascade,
  subscription_id bigint not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (event_key, subscription_id)
);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
