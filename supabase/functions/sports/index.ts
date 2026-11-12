import { isHouseholdMember } from '../_shared/household-auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TEAMS = [
  { key: 'wave', name: 'San Diego Wave', shortName: 'Wave', league: 'NWSL', sportPath: 'soccer', leagueSlug: 'usa.nwsl', teamId: '21423' },
  { key: 'sdfc', name: 'San Diego FC', shortName: 'SDFC', league: 'MLS', sportPath: 'soccer', leagueSlug: 'usa.1', teamId: '22529' },
  { key: 'ducks', name: 'Anaheim Ducks', shortName: 'Ducks', league: 'NHL', sportPath: 'hockey', leagueSlug: 'nhl', teamId: '25' },
]

const CACHE_TTL_MS = 60_000
let cachedPayload: Record<string, unknown> | null = null
let cachedAt = 0

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

function parseGoalScorers(summary: any, teamId: string) {
  const plays = summary.keyEvents ?? summary.plays ?? []
  return plays
    .filter((play: any) => play.scoringPlay && String(play.team?.id) === teamId)
    .map((play: any) => {
      const scorer = play.participants?.find((participant: any) => participant.type === 'scorer') ?? play.participants?.[0]
      const name = scorer?.athlete?.shortName ?? scorer?.athlete?.displayName
      return name ? { name, clock: play.clock?.displayValue ?? '' } : null
    })
    .filter(Boolean)
}

async function addGoalScorers(config: typeof TEAMS[number], event: any) {
  if (!event) return null
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${config.sportPath}/${config.leagueSlug}/summary?event=${event.id}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) throw new Error(`${config.league} game details unavailable (${response.status})`)
  return parseGoalScorers(await response.json(), config.teamId)
}

async function loadTeam(config: typeof TEAMS[number]) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${config.sportPath}/${config.leagueSlug}`
  const scheduleResponse = await fetch(`${base}/teams/${config.teamId}/schedule`, {
    headers: { 'User-Agent': 'ShepShackDashboard/1.0 (sports scores)', Accept: 'application/json' },
  })
  if (!scheduleResponse.ok) throw new Error(`${config.league} schedule unavailable (${scheduleResponse.status})`)
  const schedule = await scheduleResponse.json()
  const events = (schedule.events ?? [])
    .map((event: any) => parseEvent(event, config.teamId))
    .filter(Boolean)
  const live = events.find(event => event.state === 'in') ?? null
  const latest = events.filter(event => event.state === 'post').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
  const next = events.filter(event => event.state === 'pre' && new Date(event.date) >= new Date()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null
  const scoringEvent = live ?? latest
  let scorers = null
  let scorerError = null
  if (scoringEvent) {
    try {
      scorers = await addGoalScorers(config, scoringEvent)
    } catch (error) {
      scorerError = error instanceof Error ? error.message : String(error)
    }
  }
  return {
    ...config,
    logo: schedule.team?.logo ?? schedule.team?.logos?.[0]?.href ?? null,
    record: schedule.team?.recordSummary,
    standing: schedule.team?.standingSummary,
    live: live ? { ...live, scorers } : null,
    latest: latest ? { ...latest, scorers: live ? undefined : scorers } : null,
    scorerError,
    next,
  }
}

function getGullsFinalScore(markup: string) {
  const finalScore = markup.match(/<div class="score final_score[^"]*">(?:\s*<div class="abbr"[^>]*>[\s\S]*?<\/div>)?\s*(\d+)\s*<\/div>/i)?.[1]
  return finalScore ? Number(finalScore) : null
}

async function loadGulls() {
  const response = await fetch('https://www.sandiegogulls.com/schedule', {
    headers: { 'User-Agent': 'ShepShackDashboard/1.0 (sports scores)', Accept: 'text/html' },
  })
  if (!response.ok) throw new Error(`AHL schedule unavailable (${response.status})`)
  const page = await response.text()
  const latestBlock = page.match(/<div class="entry latest_game[\s\S]*?(?=<div class="upcoming_games)/i)?.[0]
  if (!latestBlock) throw new Error('AHL latest result unavailable')
  const homeStart = latestBlock.indexOf('<div class="hometeam')
  const awayStart = latestBlock.indexOf('<div class="awayteam')
  if (homeStart < 0 || awayStart < 0) throw new Error('AHL team scores unavailable')
  const homeMarkup = latestBlock.slice(homeStart, awayStart)
  const awayMarkup = latestBlock.slice(awayStart)
  const homeName = homeMarkup.match(/<img[^>]+alt="([^"]+)"/i)?.[1]
  const awayName = awayMarkup.match(/<img[^>]+alt="([^"]+)"/i)?.[1]
  const homeScore = getGullsFinalScore(homeMarkup)
  const awayScore = getGullsFinalScore(awayMarkup)
  const gullsHome = homeName?.toLowerCase().includes('san diego gulls')
  if (!homeName || !awayName || homeScore == null || awayScore == null || gullsHome == null) {
    throw new Error('AHL latest result could not be parsed')
  }
  const latest = {
    state: 'post',
    status: 'Final',
    home: gullsHome,
    score: gullsHome ? homeScore : awayScore,
    opponentScore: gullsHome ? awayScore : homeScore,
    opponent: gullsHome ? awayName : homeName,
    opponentAbbr: (gullsHome ? awayName : homeName).split(' ').pop()?.slice(0, 3).toUpperCase() ?? 'OPP',
    dateLabel: latestBlock.match(/<div class="date">\s*([^<]+)/i)?.[1]?.trim() ?? '',
    recap: latestBlock.match(/<a href="([^"]+)" class="emphasized_link"[^>]*>\s*Game Recap/i)?.[1] ?? null,
  }

  const upcomingStart = page.indexOf('<div class="upcoming_games')
  const upcomingBlock = upcomingStart >= 0 ? page.slice(upcomingStart) : ''
  const upcomingEntry = upcomingBlock.match(/<div class="entry">([\s\S]*?)(?=<div class="entry">|$)/i)?.[1]
  let next = null
  if (upcomingEntry) {
    const opponent = upcomingEntry.match(/<img[^>]+alt="([^"]+)"/i)?.[1]
    const venueLabel = upcomingEntry.match(/<div class="abbr">\s*(Home|Away)\s*<\/div>/i)?.[1]
    const dateLabel = upcomingEntry.match(/<span class="time">\s*([^<]+)/i)?.[1]?.trim()
    const timeLabel = upcomingEntry.match(/<span class="hour">\s*([^<]+)/i)?.[1]?.trim()
    if (opponent && venueLabel && dateLabel) {
      next = {
        home: venueLabel.toLowerCase() === 'home',
        opponent,
        opponentAbbr: opponent.split(' ').pop()?.slice(0, 3).toUpperCase() ?? 'OPP',
        dateLabel: `${dateLabel}${timeLabel ? ` · ${timeLabel}` : ''}`,
      }
    }
  }

  return {
    key: 'gulls',
    name: 'San Diego Gulls',
    shortName: 'Gulls',
    league: 'AHL',
    logo: 'https://www.sandiegogulls.com/assets/img/gulls_logo-1e5fe8eb8a.png',
    latest,
    next,
    live: null,
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  if (!(await isHouseholdMember(request))) return Response.json({ error: 'Household access required.' }, { status: 403, headers: corsHeaders })
  if (cachedPayload && Date.now() - cachedAt < CACHE_TTL_MS) {
    return Response.json(cachedPayload, { headers: { ...corsHeaders, 'Cache-Control': 'private, max-age=60' } })
  }
  const results = await Promise.allSettled([...TEAMS.map(loadTeam), loadGulls()])
  const teams = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason?.message ?? 'Score feed unavailable'] : [])
  cachedPayload = { teams, error: errors.length ? errors.join(' · ') : null, updatedAt: new Date().toISOString() }
  cachedAt = Date.now()
  return Response.json(cachedPayload, { headers: { ...corsHeaders, 'Cache-Control': 'private, max-age=60' } })
})
