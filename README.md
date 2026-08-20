# Shep Shack Dashboard

Private, iPhone-first household dashboard built with React, Vite, Supabase, and an ESP32 keg scale.

## Local development

Create `.env` in the project root with the public browser configuration:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_VAPID_PUBLIC_KEY=your-public-vapid-key
```

Then run:

```sh
npm install
npm run dev
```

Before releasing a change:

```sh
npm run lint
npm run build
npm audit
```

## Household access

Database access and household Edge Functions require an entry in `public.household_members`. The allowlist migration automatically adds every Auth user that exists when it is first applied.

After creating another user in Supabase Auth, add that account with the SQL editor:

```sql
insert into public.household_members (user_id)
select id from auth.users where email = 'person@example.com'
on conflict (user_id) do nothing;
```

Removing that row immediately removes the account's dashboard data access without deleting its Auth account.

## Supabase deployment

The repository contains migrations and Edge Functions under `supabase/`. Apply migrations before deploying functions that depend on them:

```sh
npx supabase db push
npx supabase functions deploy
```

Private Edge Function secrets belong in Supabase project secrets. ESP32 Wi-Fi and ingestion credentials belong in `secrets.h`; neither should be committed.

## Data retention

Raw keg readings and notification events are retained for 90 days. Pour and keg-change records remain available for long-term dashboard analytics.
