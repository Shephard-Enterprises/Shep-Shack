import { parseSportsEvent, parseMlbEvent, parseStandings, parseNewsXml, parseClubNewsHtml, safeSourceUrl } from './team-parsers.js'

export const DETAIL_TEAMS: Record<string, any> = {
  padres: { key: 'padres', name: 'San Diego Padres', league: 'MLB', official: 'https://www.mlb.com/padres', news: 'https://www.mlb.com/padres/news', rss: 'https://www.mlb.com/padres/feeds/news/rss.xml', schedule: 'https://www.mlb.com/padres/schedule', roster: 'https://www.mlb.com/padres/roster' },
  wave: { key: 'wave', name: 'San Diego Wave', league: 'NWSL', sport: 'soccer', slug: 'usa.nwsl', id: '21423', official: 'https://sandiegowavefc.com', news: 'https://sandiegowavefc.com/news/', rss: 'https://sandiegowavefc.com/feed/', schedule: 'https://sandiegowavefc.com/schedule/', roster: 'https://sandiegowavefc.com/roster/' },
  sdfc: { key: 'sdfc', name: 'San Diego FC', league: 'MLS', sport: 'soccer', slug: 'usa.1', id: '22529', official: 'https://www.sandiegofc.com', news: 'https://www.sandiegofc.com/news/', schedule: 'https://www.sandiegofc.com/schedule/', roster: 'https://www.sandiegofc.com/roster/' },
  ducks: { key: 'ducks', name: 'Anaheim Ducks', league: 'NHL', sport: 'hockey', slug: 'nhl', id: '25', official: 'https://www.nhl.com/ducks', news: 'https://www.nhl.com/ducks/news', schedule: 'https://www.nhl.com/ducks/schedule', roster: 'https://www.nhl.com/ducks/roster' },
  gulls: { key: 'gulls', name: 'San Diego Gulls', league: 'AHL', official: 'https://www.sandiegogulls.com', news: 'https://www.sandiegogulls.com/news', rss: 'https://www.sandiegogulls.com/news/rss', schedule: 'https://www.sandiegogulls.com/schedule', roster: 'https://www.sandiegogulls.com/team/roster' },
}

async function text(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'ShepShackDashboard/1.0 (team coverage)', Accept: 'application/json, application/rss+xml, text/html' } })
  if (!response.ok) throw new Error(`Source unavailable (${response.status})`)
  const value = await response.text()
  if (value.length > 3_000_000) throw new Error('Source response too large')
  return value
}
const json = async (url: string) => JSON.parse(await text(url))
const stamp = (event: any) => Date.parse(event.date)
const finals = (events: any[]) => events.filter(event => !event.cancelled && event.state === 'post' && event.score != null && event.opponentScore != null).sort((a, b) => stamp(b) - stamp(a))
const future = (events: any[], now: number) => events.filter(event => !event.cancelled && event.state === 'pre' && Number.isFinite(stamp(event)) && stamp(event) > now).sort((a, b) => stamp(a) - stamp(b))

async function espnSchedule(config: any, now: number) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.slug}/teams/${config.id}/schedule`
  let schedule = await json(base)
  let events = (schedule.events ?? []).map((item: any) => parseSportsEvent(item, config.id)).filter(Boolean)
  let year = Number(schedule.season?.year) || new Date(now).getUTCFullYear()
  if (!events.length) {
    const previous = await json(`${base}?season=${year - 1}`)
    const previousEvents = (previous.events ?? []).map((item: any) => parseSportsEvent(item, config.id)).filter(Boolean)
    if (previousEvents.length) { schedule = previous; events = previousEvents; year = Number(previous.season?.year) || year - 1 }
  }
  let scheduleNote = null
  if (!future(events, now).length) {
    try {
      const nextSeason = await json(`${base}?season=${year + 1}`)
      const nextEvents = (nextSeason.events ?? []).map((item: any) => parseSportsEvent(item, config.id)).filter(Boolean)
      events = [...new Map([...events, ...nextEvents].map(event => [event.id, event])).values()]
    } catch { scheduleNote = 'Next-season feed could not be checked. The official schedule may have more games.' }
  }
  return { events, year, label: schedule.season?.displayName ?? String(year), scheduleNote }
}

async function mlbSchedule(now: number) {
  const start = new Date(now - 365 * 86400_000).toISOString().slice(0, 10)
  const end = new Date(now + 400 * 86400_000).toISOString().slice(0, 10)
  const data = await json(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&startDate=${start}&endDate=${end}`)
  const events = (data.dates ?? []).flatMap((date: any) => date.games ?? []).map(parseMlbEvent).filter(Boolean)
  const latest = finals(events)[0]
  const year = latest?.seasonYear || new Date(now).getUTCFullYear()
  return { events, year, label: `${year} MLB`, scheduleNote: null }
}

async function loadNews(config: any, now: number) {
  if (config.rss) {
    const xml = await text(config.rss)
    if (!/<rss\b|<feed\b/i.test(xml)) throw new Error('News feed format unavailable')
    return parseNewsXml(xml, config.name, config.official, now)
  }
  if (config.key === 'sdfc') {
    try {
      const articles = parseClubNewsHtml(await text(config.news), config.official)
      if (articles.length) return articles
    } catch { /* Fall back to team-tagged ESPN coverage. */ }
  }
  const data = await json(`https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.slug}/news?team=${config.id}&limit=12`)
  return (data.articles ?? []).flatMap((article: any) => {
    const teamTagged = article.categories?.some((category: any) => category.type === 'team' && String(category.teamId ?? category.team?.id) === config.id)
    const url = safeSourceUrl(article.links?.web?.href, 'https://www.espn.com', ['www.espn.com', 'www.espn.com.au', 'www.espn.co.uk'])
    const at = Date.parse(article.published)
    if (!teamTagged || !url || !article.headline || !Number.isFinite(at) || at > now || now - at > 120 * 86400_000) return []
    return [{ title: article.headline, url, publishedAt: new Date(at).toISOString(), source: 'ESPN' }]
  }).slice(0, 6)
}

async function loadRecord(config: any, year: number) {
  if (config.key === 'padres') {
    const data = await json(`https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=${year}&standingsTypes=regularSeason`)
    const entry = (data.records ?? []).flatMap((item: any) => item.teamRecords ?? []).find((team: any) => team.team?.id === 135)
    return entry ? { label: 'W–L', value: `${entry.wins}–${entry.losses}`, standing: entry.divisionRank ? `#${entry.divisionRank} · NL West` : null, points: null, goalsFor: null, goalsAgainst: null, source: 'MLB · Regular season' } : null
  }
  if (!config.sport) return null
  const data = await json(`https://site.api.espn.com/apis/v2/sports/${config.sport}/${config.slug}/standings?season=${year}`)
  return parseStandings(data, config.id, year, config.sport === 'hockey')
}

async function loadLeaders(config: any, year: number) {
  if (config.sport === 'soccer') {
    const base = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${config.slug}/seasons/${year}`
    const data = await json(`${base}/types/1/teams/${config.id}/leaders`)
    const entries = (data.categories ?? []).filter((category: any) => ['goalsLeaders', 'assistsLeaders'].includes(category.name)).flatMap((category: any) => {
      const leaders = (category.leaders ?? []).filter((entry: any) => Number.isFinite(entry.value))
      const highest = Math.max(...leaders.map((entry: any) => entry.value))
      return leaders.filter((entry: any) => entry.value === highest).slice(0, 2).map((entry: any) => ({ ...entry, label: category.name === 'goalsLeaders' ? 'Goals' : 'Assists' }))
    })
    return (await Promise.all(entries.map(async (entry: any) => {
      // Rebuild bounded official API URLs; never follow arbitrary feed refs.
      const ref = String(entry.athlete?.$ref ?? '')
      const athleteId = ref.match(/\/athletes\/(\d+)(?:\?|$)/)?.[1]
      if (!athleteId || !String(entry.team?.$ref ?? '').includes(`/teams/${config.id}?`)) return null
      const athlete = await json(`${base}/athletes/${athleteId}?lang=en&region=us`)
      return athlete.displayName ? { label: entry.label, name: athlete.displayName, value: String(entry.value) } : null
    }))).filter(Boolean)
  }
  if (config.key === 'padres') {
    const data = await json(`https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns,runsBattedIn&statGroup=hitting&teamId=135&season=${year}&gameType=R&limit=1`)
    return (data.leagueLeaders ?? []).flatMap((category: any) => (category.leaders ?? []).map((leader: any) => ({ label: category.leaderCategory === 'homeRuns' ? 'Home runs' : 'Runs batted in', name: leader.person?.fullName, value: leader.value }))).filter((entry: any) => entry.name)
  }
  if (config.key === 'ducks') {
    const season = `${year - 1}${year}`
    const data = await json(`https://api-web.nhle.com/v1/club-stats/ANA/${season}/2`)
    const skaters = data.skaters ?? []
    return ['goals', 'assists', 'points'].flatMap(stat => {
      const sorted = [...skaters].filter((entry: any) => Number.isFinite(entry[stat])).sort((a: any, b: any) => b[stat] - a[stat])
      if (!sorted.length) return []
      const top = sorted[0][stat]
      return sorted.filter((entry: any) => entry[stat] === top).slice(0, 3).map((entry: any) => ({ label: stat[0].toUpperCase() + stat.slice(1), name: `${entry.firstName?.default ?? ''} ${entry.lastName?.default ?? ''}`.trim(), value: String(top) }))
    })
  }
  return []
}

export async function loadTeamDetails(key: string, gullsLoader: () => Promise<any>, now = Date.now()) {
  const config = DETAIL_TEAMS[key]
  if (!config) throw new Error('Unknown team')
  const errors: Record<string, string> = {}
  const [scheduleResult, newsResult] = await Promise.allSettled([
    key === 'padres' ? mlbSchedule(now) : key === 'gulls' ? gullsLoader().then(team => ({ events: [team.latest, team.next].filter(Boolean), year: null, label: 'Latest published games', scheduleNote: null })) : espnSchedule(config, now),
    loadNews(config, now),
  ])
  const schedule = scheduleResult.status === 'fulfilled' ? scheduleResult.value : null
  if (!schedule) errors.schedule = 'Schedule feed unavailable. Check the official team schedule.'
  if (newsResult.status === 'rejected') errors.news = 'Headlines are temporarily unavailable. Official team news is still linked below.'
  const [recordResult, leadersResult] = schedule?.year ? await Promise.allSettled([loadRecord(config, schedule.year), loadLeaders(config, schedule.year)]) : []
  if (recordResult?.status === 'rejected') errors.record = 'Season standings are temporarily unavailable.'
  if (leadersResult?.status === 'rejected') errors.leaders = 'Season leaders are temporarily unavailable.'
  const events = schedule?.events ?? []
  // Gulls' official feed currently gives labeled dates, not machine-readable
  // timestamps. Retain those labels without inventing a year or countdown.
  const recent = key === 'gulls' ? events.filter((event: any) => event.state === 'post') : finals(events).slice(0, 5)
  const upcoming = key === 'gulls' ? events.filter((event: any) => event.state === 'pre') : future(events, now).slice(0, 10)
  return {
    team: { key, name: config.name, league: config.league },
    season: schedule ? { year: schedule.year, label: schedule.label } : null,
    record: recordResult?.status === 'fulfilled' ? recordResult.value : null,
    leaders: leadersResult?.status === 'fulfilled' ? leadersResult.value : [],
    leadersSource: key === 'padres' ? 'MLB' : key === 'ducks' ? 'NHL' : 'ESPN',
    recent, upcoming, news: newsResult.status === 'fulfilled' ? newsResult.value : [],
    scheduleNote: schedule?.scheduleNote ?? null, errors,
    sources: { schedule: config.schedule, news: config.news, roster: config.roster },
    updatedAt: new Date(now).toISOString(),
  }
}
