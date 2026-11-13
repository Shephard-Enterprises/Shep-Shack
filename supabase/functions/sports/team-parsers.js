export function parseSportsEvent(event, teamId) {
  const score = value => {
    const raw = value?.displayValue ?? value?.value ?? value
    return typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw)) ? raw : null
  }
  const competition = event.competitions?.[0]
  const competitors = competition?.competitors ?? []
  const team = competitors.find(entry => String(entry.team?.id) === teamId)
  const opponent = competitors.find(entry => String(entry.team?.id) !== teamId)
  if (!team || !opponent) return null
  const status = competition.status?.type ?? event.status?.type ?? {}
  return {
    id: event.id, date: event.date, state: status.state,
    status: status.shortDetail ?? 'Scheduled', home: team.homeAway === 'home',
    score: score(team.score),
    opponentScore: score(opponent.score),
    opponent: opponent.team?.displayName ?? opponent.team?.name ?? 'Opponent',
    opponentAbbr: opponent.team?.abbreviation ?? opponent.team?.displayName?.split(' ').pop()?.slice(0, 3).toUpperCase() ?? 'OPP',
    venue: competition.venue?.fullName ?? null,
    timeTbd: event.timeValid === false || competition.timeValid === false,
    seasonYear: event.season?.year ?? null,
    competition: event.seasonType?.name ?? null,
    regularSeason: event.seasonType?.name === 'Regular Season',
    cancelled: /cancel|postpon/i.test(`${status.name ?? ''} ${status.description ?? ''}`),
  }
}

export function decodeText(value = '') {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' }
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, code) => {
      if (code.startsWith('#')) {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
      }
      return entities[code.toLowerCase()] ?? original
    }).replace(/\s+/g, ' ').trim()
}

export function safeSourceUrl(value, base, hosts) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' && hosts.includes(url.hostname) ? url.href : null
  } catch { return null }
}

export function parseNewsXml(xml, source, base, now = Date.now()) {
  const hosts = [new URL(base).hostname]
  const tag = (item, name) => item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? ''
  const articles = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(([, item]) => {
    const title = decodeText(tag(item, 'title'))
    const url = safeSourceUrl(decodeText(tag(item, 'link')), base, hosts)
    const at = Date.parse(decodeText(tag(item, 'pubDate') || tag(item, 'dc:date')))
    if (!title || !url || !Number.isFinite(at) || at > now || now - at > 120 * 86400_000) return []
    return [{ title, url, publishedAt: new Date(at).toISOString(), source }]
  })
  return [...new Map(articles.map(item => [item.url, item])).values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 6)
}

export function parseClubNewsHtml(html, base) {
  const attribute = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1]
  const articles = [...html.matchAll(/<a\b([^>]*class="[^"]*\bfm-card-wrap\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(([, attrs, body]) => {
    const title = decodeText(attribute(attrs, 'title') ?? body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1])
    const url = safeSourceUrl(decodeText(attribute(attrs, 'href') ?? ''), base, [new URL(base).hostname])
    return title && url && new URL(url).pathname.startsWith('/news/') ? [{ title, url, publishedAt: null, source: 'San Diego FC' }] : []
  })
  return [...new Map(articles.map(item => [item.url, item])).values()].slice(0, 6)
}

export function parseStandings(data, teamId, seasonYear, hockey = false) {
  const matches = []
  function visit(node, depth = 0) {
    const table = node.standings
    if (table && Number(table.season) === Number(seasonYear)) {
      const entry = table.entries?.find(row => String(row.team?.id) === teamId)
      if (entry) matches.push({ entry, group: node.name ?? data.name, depth })
    }
    for (const child of node.children ?? []) visit(child, depth + 1)
  }
  visit(data)
  const match = matches.sort((a, b) => b.depth - a.depth)[0]
  if (!match) return null
  const stats = Object.fromEntries((match.entry.stats ?? []).map(stat => [stat.name, stat.displayValue ?? String(stat.value ?? '')]))
  const wins = stats.wins, losses = stats.losses
  if (wins == null || losses == null) return null
  const third = hockey ? stats.overtimeLosses ?? stats.otLosses : stats.ties
  return {
    label: hockey ? 'W–L–OT' : 'W–D–L',
    value: hockey ? `${wins}–${losses}–${third ?? '—'}` : `${wins}–${third ?? '—'}–${losses}`,
    standing: stats.rank ? `#${stats.rank} · ${match.group}` : match.group,
    points: stats.points ?? null, goalsFor: stats.pointsFor ?? stats.goalsFor ?? null,
    goalsAgainst: stats.pointsAgainst ?? stats.goalsAgainst ?? null, source: 'ESPN · Regular season',
  }
}

export function parseMlbEvent(game) {
  const away = game.teams?.away?.team?.id === 135
  const ours = away ? game.teams?.away : game.teams?.home
  const opponent = away ? game.teams?.home : game.teams?.away
  if (!ours || !opponent) return null
  return { id: String(game.gamePk), date: game.gameDate, state: game.status?.abstractGameState === 'Final' ? 'post' : game.status?.abstractGameState === 'Live' ? 'in' : 'pre',
    status: game.status?.detailedState, home: !away, score: ours.score ?? null, opponentScore: opponent.score ?? null,
    opponent: opponent.team?.name, venue: game.venue?.name, timeTbd: game.status?.startTimeTBD === true,
    cancelled: /cancel|postpon/i.test(game.status?.detailedState ?? ''), seasonYear: Number(game.season),
    competition: ({ R: 'Regular season', S: 'Spring training', F: 'Wild Card', D: 'Division Series', L: 'Championship Series', W: 'World Series' })[game.gameType] ?? 'MLB',
    regularSeason: game.gameType === 'R' }
}
