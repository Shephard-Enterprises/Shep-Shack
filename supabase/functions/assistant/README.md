# Dashboard assistant

`Ask Patty` is mounted once inside the signed-in dashboard so it is available on every destination. Conversations and account preferences are private to the signed-in household member. Fitness profiles (Justin and Rosy) and their workout logs are shared within the allowlisted household. The monthly cap is shared across the household and editable by any allowlisted household member.

## Enable

1. Apply the assistant migration, `supabase/migrations/20261113020000_fitness.sql`, `supabase/migrations/20261113030000_fitness_timed_sets.sql`, and `supabase/migrations/20261113040000_movement_library.sql`, `supabase/migrations/20261113050000_adhoc_workout_timer.sql`, and the later Fitness migrations through `20261113080000_workout_start_flow.sql` with `npx supabase db push --remote`.
2. In the Supabase project's **Edge Functions → Secrets**, add `OPENAI_API_KEY` for a funded OpenAI API project. Never put it in `.env` browser variables or any `VITE_*` setting. Supabase supplies the other runtime secrets automatically.
3. Deploy with `npx supabase functions deploy assistant` and release the frontend through the dashboard's normal deployment process.
4. Open **Ask Patty → Preferences & budget**, save the household cap, and optionally save goals, equipment, and context from a previous workout conversation. The default cap is $5/month; $0 pauses new requests.

Without the key, the widget reports that chat needs connecting; preferences and budget still work after the migration. Without the migration/function deployment, it displays a setup error instead of pretending to answer. There is no synchronization with a personal ChatGPT account. The training-profile selector is shared with Fitness; only that profile is queried for workout context. Asking about another person requires switching the active profile. Patty can create reusable routines or one-off draft sessions with rep-based or timed sets and report logged progress; she does not edit/delete existing workouts, mark them completed, or record cardio events through chat.

## Spending controls

The server uses the Responses API, structured output for validated workout saves, and the `gpt-6-luna` model with reasoning set to `none`, with no extra paid tools, web search, media, or automatic retries. A fitness reply uses one model call; saving a routine and its chat answer is an atomic database transaction. The verified standard token rates are $0.10/M input, $0.01/M cached input, and $0.50/M output. Sources: [model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna), [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create). Recheck rates before changing the model or pricing assumptions in `chat.mjs`.

Before each paid request a service-only database RPC locks the shared budget row and reserves $0.05. All devices and users share that lock. Requests stop when less than $0.05 remains; no request is sent to OpenAI before its hold succeeds. The request's month is recorded in Pacific time, so an answer finishing across a month boundary settles against its original month.

The bounded input has at most 40,000 UTF-8 bytes including instructions, with additional reservation headroom for token framing; output is limited to 2,048 tokens including reasoning. The $0.05 hold conservatively covers those limits at the configured model rates. A successful answer settles the hold to its calculated token cost. Definitively rejected requests release their hold; ambiguous failures, timeouts, missing usage, or failed settlement retain a conservative charge/hold. Retrying a request ID cannot spend twice. The server limits users to one request per 10 seconds and blocks a new request while an unresolved request is less than two minutes old. It does not retry OpenAI requests automatically.

The displayed total is an app-side estimate including outstanding holds, not an OpenAI invoice. This cap governs only this app's text requests using these pricing assumptions, not other uses of the same API key, provider price changes, taxes, or third-party charges. Use a dedicated OpenAI project/key to isolate usage.

## Storage and context

- 30 saved conversations per user, 30 exchanges each; users can delete conversations.
- Recent messages (up to 24 KB of content, or 12 KB when fitness context is included) plus up to 4 KB of explicitly saved preferences provide context. Older messages remain visible but may fall outside model context. New conversations include saved preferences, not transcripts from other chats.
- OpenAI response storage is disabled with `store: false`; this is not a claim of zero provider retention.
- Transcripts expire after 180 idle days. Usage ledger rows expire after 90 days and contain no message text. Deleting a conversation does not reduce usage charges.
- Transcript writes and usage settlement require the service role. RLS prevents cross-account chat access and checks current household membership. The function verifies the user and membership again before doing any work.

## Verification

```sh
node --test src/fitness-model.test.mjs src/movement-library.test.mjs src/workout-timer.test.mjs src/workout-session.test.mjs src/timer-audio.test.mjs supabase/functions/assistant/*.test.mjs
npm run lint
npm run build
npm audit --audit-level=high
```

The handler tests use mocked network responses: they do not incur API charges. For a deployment smoke test, verify settings and the missing-key state first, then make one small paid request after adding the key. Confirm the answer persists after reloading, another household login cannot see it, and a $0 cap blocks sends. The migration's RLS, service-only grants, shared reservation/settlement, deletion accounting, and pause path were also exercised against an embedded PostgreSQL instance during implementation; browser checks covered mobile/desktop layouts, settings, messages, thread switching/deletion, Escape, and focus restoration.

Fitness summaries compute totals across all completed sessions, then bound model context to recent sessions and a subset of movement records/routines. The prompt identifies these detail limits and treats missing history as unknown. Drafts are excluded. Invalid or incomplete structured responses do not save a routine. Profile/owner IDs come from the authenticated request and database, never from model output.

Generated exercises must resolve to an existing movement-library ID. The server validates IDs and tracking modes, and canonicalizes names before the atomic save. The same IDs group manual and AI-created sessions for progress; equipment variants stay separate. Unresolved historical names require an explicit profile-scoped link. Movement context is bounded and may omit library entries in very large catalogs.

One-off requests use `assistant_finish_adhoc`, which saves a draft session and the answer atomically without inserting a routine. It rejects another active session for that training profile. `save_as` chooses routine/adhoc, while `timer_order` and per-movement work/rest fields describe the full timeline. Actual logged completion remains user-controlled. The `status` response advertises `capabilities.adhocWorkouts`; the updated client requires this capability to avoid incompatible saves against an older deployment.

Generated one-offs are prepared drafts, with `execution_started_at` left empty. The user reviews the plan and presses Start in Fitness; generation never starts playback or checks off results. Timed sessions open their countdown on Start, while rep-only sessions open the checklist.

The structured-output schema restricts `movement_id` to the server-supplied catalog for that request. As a compatibility fallback, a missing or invalid generated ID is corrected only when its canonical name or alias matches exactly one live movement (for example, Cable triceps pushdown → `triceps-pushdown`). Unknown or ambiguous names still reject the whole save without creating movements or guessing equipment variants.

## Dashboard questions

Patty explains Weather, Safety, Flights, Sports, On Tap/Keg, and Settings as well as Fitness. A feature guide is included in every request. For relevant questions and short follow-ups, `dashboard.mjs` loads read-only, bounded snapshots from the same dashboard feeds after household authorization and spending reservation. It uses Santee city-center NWS/Open-Meteo/USGS data, the household-protected flights/fire-watch/safety/sports functions, RLS-protected tap readings/pours, and only the signed-in account's notification preferences. It can also summarize recent household notification notices. Browser network and speed-test state are not available to the server.

Live feed requests forward the household member's token, never the service-role key; public source requests use a fixed HTTPS host allowlist. Model-supplied URLs and client-supplied readings are not used. Context omits precise coordinates, raw device payloads, subscription endpoints, and push secrets. Availability, stale readings, source timestamps, and truncation are explicit. Missing or empty safety feeds never establish an all-clear. The model still makes one paid request, with the existing cap, reservation, and 40 KB input bound. When context is large, oldest conversation messages and optional dashboard detail records are removed before rejecting an oversized request. No dashboard edits or device control are enabled through chat.
