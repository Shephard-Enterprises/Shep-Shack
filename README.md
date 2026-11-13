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

## App-wide assistant

The signed-in dashboard includes an **Ask Patty** chat widget with private conversations, saved preferences, and a household monthly spending cap (default $5; $0 pauses chat). It needs an OpenAI API key stored in Supabase secrets, the assistant migration, and the `assistant` Edge Function deployment. See [assistant setup and spending controls](supabase/functions/assistant/README.md).

## Fitness

The **Fitness** destination has Justin and Rosy profile tabs. Each profile has its own training preferences, routines, active workout, completed strength sessions, cardio events, and progress. Save goals, equipment, and schedule in the training-preferences panel so Patty can tailor generated routines for that person. Household members can view and manage both profiles; these are training profiles inside the household, not separate sign-in accounts.

Apply `supabase/migrations/20261113020000_fitness.sql` before using Fitness. The section works independently of the AI key. Routines can be entered manually or pasted in the explicit `Exercise | sets | rep target | rest seconds` format. Start a routine, log weight and reps, check completed sets, and finish the session. Unsynced draft changes are kept on that device; **Save draft** syncs them to Supabase. Drafts are excluded from progress. Cardio records duration, optional distance, units, notes, and derived pace.

Patty uses the same selected profile shown in Fitness. Asking her to write a workout can save a validated strength routine directly into that profile. She receives server-generated summaries of that profile's completed strength/cardio history to answer progress questions. AI generation requires the assistant function, both migrations, and the OpenAI key described above. Her workout save and chat answer commit together. Generated routines are plans, never completed sessions. Cardio events are entered in the Cardio view.

Progress compares top weight, most reps, and total weight × reps per movement, converting lb/kg for comparisons. Exercise names are matched after ignoring capitalization and extra spaces; use consistent movement names for useful charts. It displays all-history tables and the last 24 session points in each chart. No body-weight measurements or wearable synchronization are included in this version.

Timed exercises use **Time** tracking with a target in seconds. Each set has a countdown with pause/resume/reset; **Record** fills actual seconds, and the user explicitly checks the set complete. Weight is optional for timed sets. Timer deadlines are saved with workout drafts so elapsed time stays accurate when returning to the page; they do not provide background notifications. History and progress show completed duration separately from lifting reps/volume. Pasted routines accept targets such as `Plank | 3 | 45s | 30`. Apply `20261113030000_fitness_timed_sets.sql` alongside the earlier Fitness migrations. Patty can generate timed sets and includes an **Open in Fitness** button on saved workouts.

### Shared movement library

Manual and Patty-created plans select the same stable movement IDs. The **Movements** view includes 50 built-in movements, searchable by name, alias, muscle group, or equipment. Add a custom movement directly from the manual routine builder. **Save & start workout** begins logging immediately; the AI key is not needed for manual tracking.

Progress and previous-weight suggestions follow the movement across different routines within the selected training profile. For example, `DB curls` and `Dumbbell curl` link to **Dumbbell curl**; **Barbell curl** and **Dumbbell hammer curl** have separate histories. Pounds and kilograms are converted for comparison. For dumbbell exercises, log the weight of one dumbbell consistently.

Apply `20261113040000_movement_library.sql` after the earlier Fitness migrations. It backfills unambiguous historical names and aliases. Generic names such as `curls` remain unlinked rather than guessing equipment; use **Movements → Link older movement names** to choose the correct variation for that profile. Finish or discard an active workout before linking older history. Custom library entries are shared across household profiles, while workout results and charts remain scoped to Justin or Rosy. Patty receives the available IDs and validates generated exercises against this same library before saving.
