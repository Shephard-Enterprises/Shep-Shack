alter table public.push_subscriptions
alter column preferences set default '{"fire":true,"earthquake":true,"weather":true,"emergency":true,"keg":true,"padres":true}'::jsonb;

update public.push_subscriptions
set preferences = preferences || '{"weather":true,"emergency":true}'::jsonb,
    updated_at = now()
where not (preferences ? 'weather') or not (preferences ? 'emergency');
