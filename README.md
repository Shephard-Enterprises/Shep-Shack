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

## Sports data

The Sports page loads Padres data from MLB Stats API and Wave, San Diego FC, and Ducks schedules and goal summaries from ESPN through the household-protected `sports` Edge Function. The Gulls' latest result and next game come from the official team schedule; its recap link provides goal details. Schedule feeds can have no upcoming game listed between seasons.

Each team has a Team Hub with a season snapshot, available scoring leaders, recent results, published upcoming games, and club headlines. Official club feeds supply Padres, Wave, SDFC, and Gulls news; Ducks coverage and SDFC fallback news use team-tagged ESPN articles. Details load when a hub opens and are cached independently from the score feed. Dates and countdowns use Pacific time; missing feed dates never imply that a club has not announced its schedule. See [Sports coverage](supabase/functions/sports/README.md) for source and validation details.

## Supabase deployment

The repository contains migrations and Edge Functions under `supabase/`. Apply migrations before deploying functions that depend on them:

```sh
npx supabase db push
npx supabase functions deploy
```

Private Edge Function secrets belong in Supabase project secrets. ESP32 Wi-Fi and ingestion credentials belong in `secrets.h`; neither should be committed.

## Data retention

Raw keg readings and notification events are retained for 90 days. Pour and keg-change records remain available for long-term dashboard analytics.
