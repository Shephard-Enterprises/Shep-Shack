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

Timed exercises use **Time** tracking with a target in seconds. Starting a timed workout opens its work/rest countdown with pause/resume. Enter actual completed seconds in the set checklist and check the sets you performed. Weight is optional for timed sets. Workout timer deadlines are saved with drafts so elapsed time stays accurate when returning to the page; they do not provide background notifications. History and progress show completed duration separately from lifting reps/volume. Pasted routines accept targets such as `Plank | 3 | 45s | 30`. Apply `20261113030000_fitness_timed_sets.sql` alongside the earlier Fitness migrations. Patty can generate timed sets and includes an **Open in Fitness** button on saved workouts.

### Shared movement library

Manual and Patty-created plans select the same stable movement IDs. The **Movements** view includes 50 built-in movements, searchable by name, alias, muscle group, or equipment. Add a custom movement directly from the manual routine builder. **Save & review** shows the plan before you press **Start workout**; the AI key is not needed for manual tracking.

Progress and previous-weight suggestions follow the movement across different routines within the selected training profile. For example, `DB curls` and `Dumbbell curl` link to **Dumbbell curl**; **Barbell curl** and **Dumbbell hammer curl** have separate histories. Pounds and kilograms are converted for comparison. For dumbbell exercises, log the weight of one dumbbell consistently.

Apply `20261113040000_movement_library.sql` after the earlier Fitness migrations. It backfills unambiguous historical names and aliases. Generic names such as `curls` remain unlinked rather than guessing equipment; use **Movements → Link older movement names** to choose the correct variation for that profile. Finish or discard an active workout before linking older history. Custom library entries are shared across household profiles, while workout results and charts remain scoped to Justin or Rosy. Patty receives the available IDs and validates generated exercises against this same library before saving.

### One-off workouts and the whole-workout timer

Use **+ One-off workout** for an ad hoc session. Build it with the same movement library, then save and review the workout; it is saved as a prepared session with no routine reference and never appears in My routines. Completed results remain in History and contribute to movement progress. One active workout is allowed per training profile, so finish or discard it before starting another.

In Patty, ask for a “one-off workout” or choose **Save workouts as → One-off workout**. Generated one-offs prepare a session for review and Start, with its chat answer committed in the same transaction. The reusable-routine option remains available. An explicit destination selection takes precedence over the generated save mode.

Set **Workout order** to movement sets or circuit rounds. Timed movements use their seconds target; rep-based movements use a checklist and have no work timer. Rest is inserted after each set except the final set of the workout. **Start workout** opens the timer and runs the full sequence for timed sessions, automatically advancing timed work/rest phases. Untimed rep sets wait for **Set finished → next phase**. Pause, resume, skip, and reset are available. The timeline follows elapsed wall-clock time across background tabs and reloads. The timer scrolls with the workout so exercise inputs stay unobstructed; date, notes, and save/discard controls are available under the workout-details disclosure.

The timer guides the session; users explicitly enter actual weights/reps/seconds and check completed sets. A completed timer alone does not finish the workout or add completed sets. Starting/pausing a timer is kept in the local draft; **Save draft** syncs the state across devices. Keep the app open for live cues; background alarms are not provided.

Apply `20261113050000_adhoc_workout_timer.sql` after the earlier migrations, then deploy the updated assistant. It adds one-off provenance, workout order, validated timeline state, and an atomic assistant session-save RPC. The client checks the backend capability version before enabling chat so an older backend cannot silently save a requested one-off as a routine. The one-off/timer and flexible-tracking database migrations were applied to the linked Shep-Shack project on November 13, 2026. The matching assistant function was also deployed on November 13, 2026. The frontend release includes these changes, with service-worker cache v25.

Movement library tracking types are defaults: choose **Time** or **Reps** independently for each exercise in a routine or one-off workout. Time and rep progress and previous-weight suggestions stay separate for the same movement. New workouts and Patty plans use pounds; weight-unit selectors are removed. Apply `20261113060000_flexible_movement_tracking.sql` so the database accepts either mode for a linked movement.

Timer sounds are enabled by default on this device. **Timer sounds on/off** in the whole-workout timer controls the whole-workout, individual set, and standalone rest timers. Gentle beeps mark the final three seconds; distinct tones mark work, rest, and completion. Starting a timer, enabling sound, or using **Test sound** unlocks browser audio. After reloading a running timer, tap **Test sound** or pause/resume to enable audio again. Keep the app visible and device volume audible; sounds are not background alarms. The mute preference stays on the device.

**Finish workout** is available at any time, even with zero checked sets. Finishing saves the session to History and stops its timers; unchecked sets stay unchecked and do not contribute to movement progress or volume. Apply `20261113070000_finish_workout_anytime.sql` to remove the old database minimum-set rule.

### Setup → Start → workout

Manual plans use **Save & review**. Patty-created one-offs open the same review screen. Press **Start workout** once: only explicitly timed movements open a dismissible countdown; rep-only workouts open the set checklist without a timer. Rep work windows saved by older versions and between-set rest never open a rep-workout timer. **Back to sets** closes the timer without pausing it; **Open workout timer** returns to it. Sound and sequence settings live under timer options. Date, notes, save, and discard live under Workout details. Finish remains available with zero or partial results.

The `20261113080000_workout_start_flow.sql` saved-start migration and matching assistant update were applied to Shep-Shack on November 13, 2026. The updated interface is included in the GitHub Pages frontend release. Existing workouts with logged results or timer state remain in progress; unstarted plans wait for Start. This state is shared across devices.
