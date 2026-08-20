const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TEAMS = [
  { key: 'wave', name: 'San Diego Wave', shortName: 'Wave', league: 'NWSL', leagueSlug: 'usa.nwsl', teamId: '21423' },
  { key: 'sdfc', name: 'San Diego FC', shortName: 'SDFC', league: 'MLS', leagueSlug: 'usa.1', teamId: '22529' },
]

function compactDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function parseEvent(event: any, teamId: string) {
  const competition = event.competitions?.[0]
  const competitors = competition?.competitors ?? []
  const team = competitors.find((entry: any) => String(entry.team?.id) === teamId)
  const opponent = competitors.find((entry: any) => String(entry.team?.id) !== teamId)
  if (!team || !opponent) return null
  return {
    id: event.id, date: event.date,
    state: competition.status?.type?.state ?? event.status?.type?.state,
    status: competition.status?.type?.shortDetail ?? event.status?.type?.shortDetail ?? 'Scheduled',
    home: team.homeAway === 'home',
    score: team.score?.displayValue ?? team.score ?? null,
    opponentScore: opponent.score?.displayValue ?? opponent.score ?? null,
    opponent: opponent.team?.displayName ?? opponent.team?.name ?? 'Opponent',
    opponentAbbr: opponent.team?.abbreviation ?? opponent.team?.displayName?.split(' ').pop()?.slice(0, 3).toUpperCase() ?? 'OPP',
    venue: competition.venue?.fullName ?? null,
  }
}

async function loadTeam(config: typeof TEAMS[number]) {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const end = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.leagueSlug}`
  const requestInit = { headers: { 'User-Agent': 'ShepShackDashboard/1.0 (sports scores)', Accept: 'application/json' } }
  const [scheduleResponse, futureResponse] = await Promise.all([
    fetch(`${base}/teams/${config.teamId}/schedule`, requestInit),
    fetch(`${base}/scoreboard?dates=${compactDate(start)}-${compactDate(end)}&limit=100`, requestInit),
  ])
  if (!scheduleResponse.ok || !futureResponse.ok) throw new Error(`${config.league} scores unavailable (${scheduleResponse.status}/${futureResponse.status})`)
  const [schedule, future] = await Promise.all([scheduleResponse.json(), futureResponse.json()])
  const events = [...(schedule.events ?? []), ...(future.events ?? [])]
    .filter((event, index, all) => all.findIndex(item => item.id === event.id) === index)
    .map(event => parseEvent(event, config.teamId))
    .filter(Boolean)
  const live = events.find(event => event.state === 'in') ?? null
  const latest = events.filter(event => event.state === 'post').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
  const next = events.filter(event => event.state === 'pre' && new Date(event.date) >= start).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null
  return { ...config, logo: schedule.team?.logo, record: schedule.team?.recordSummary, standing: schedule.team?.standingSummary, live, latest, next }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const results = await Promise.allSettled(TEAMS.map(loadTeam))
  const teams = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason?.message ?? 'Score feed unavailable'] : [])
  return Response.json({ teams, error: errors.length ? errors.join(' · ') : null, updatedAt: new Date().toISOString() }, { headers: corsHeaders })
})
