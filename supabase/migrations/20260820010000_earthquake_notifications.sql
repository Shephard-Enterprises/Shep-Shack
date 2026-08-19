alter table public.push_subscriptions
alter column preferences set default '{"fire":true,"earthquake":true,"keg":true,"padres":true}'::jsonb;

update public.push_subscriptions
set preferences = preferences || '{"earthquake":true}'::jsonb,
    updated_at = now()
where not (preferences ? 'earthquake');
