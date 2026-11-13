# Team coverage

`POST {}` preserves the existing score-summary response. `POST { "teamKey": "wave" }` loads a team hub; supported keys are `padres`, `wave`, `sdfc`, `ducks`, and `gulls`. Both paths require the existing household membership check. Request-supplied URLs are never fetched. Successful detail payloads cache for ten minutes by team; partially failed payloads retry after a minute. Summary caching remains one minute. The client checks open hubs periodically and when returning to the tab.

The hub contains Season overview, Schedule & results, and Club news views. The default Home layout and its sports ordering are retained. The Sports page prioritizes live games and games within fourteen days, then latest results. Existing individual-game details remain in each hub.

## Sources and limits

- Padres: MLB schedule, standings and regular-season hitting leaders; official MLB Padres RSS headlines. Schedule searches extend 400 days ahead instead of fourteen, and offseason standings retain the last played season's year.
- Wave and SDFC: ESPN schedules, season-specific regular-season standings, and team-specific goals/assist leaders. Wave news uses its official RSS feed; SDFC news comes from the official club news index, with team-tagged ESPN articles as a fallback.
- Ducks: ESPN schedule/standings and team-tagged news; NHL regular-season player statistics for scoring leaders.
- Gulls: official team schedule and RSS news. Source date labels are preserved because the summary does not supply complete timestamps. The app does not invent a season record, player leaders, or a countdown for these labeled dates.

A feed without future games is not proof that a club has not announced its schedule. The interface states the feed gap and links to the official schedule. Exact countdowns require an actual timestamp; source-marked TBD times remain TBD. Postponed/cancelled games are excluded from upcoming/final lists. Future-season requests cannot overwrite the displayed season label with an empty or mislabeled response.

News shows headlines, source labels, available publication dates and external article links, never copied article bodies. RSS dates support both pubDate and dc:date; known-dated articles outside the past 120 days or in the future are omitted. Undated official SDFC index headlines retain source ordering without fabricated publication dates. Links are restricted to the expected source hosts and rendered as text, not HTML. News, schedule, record and leaders failures remain independent.

## Validation

```sh
node --test supabase/functions/sports/*.test.mjs src/sports-team-model.test.mjs
npm run lint
npm run build
npm audit --audit-level=high
```

Tests cover household authorization before cache access, unknown keys, summary compatibility, partial source failures, season rollover, TBD dates, cancellation flags, numeric/zero scores, source links, RSS dates, standings record ordering, and sports-only prioritization. Live source checks cover all five teams. Desktop and 390px/320px UI checks cover hub entry/back navigation, season snapshots, news links and schedule/result tabs. Temporary source snapshots and preview entry files are removed before release.
