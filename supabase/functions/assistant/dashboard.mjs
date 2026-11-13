// Read-only context from the same feeds as the dashboard. No client-supplied
// readings, private coordinates, push credentials, or arbitrary model URLs.
export const dashboardGuide = `Dashboard features you can explain:
Home summarizes the household feeds. Pull down or use Refresh to update readings. Offline mode can show older cached information.
Weather shows Santee NWS conditions, hourly and seven-day forecasts, rain chances, wind, humidity, UV, and rain radar. Tap an hour for details. Rain radar shows recent precipitation, not a guaranteed forecast; UV is supplemental Open-Meteo data.
Safety shows nearby official wildfire incidents, NASA thermal hotspots, local weather alerts, county emergency notices, air quality, and recent earthquakes. A thermal hotspot is not a confirmed wildfire. Empty, stale, partial, or unavailable feeds cannot establish that an area is safe. Use linked official notices for emergency instructions.
Flights shows nearby airborne aircraft (about five miles), aircraft details, and available callsign route lookups. Missing route data is unknown; map coverage does not include every aircraft. No supplied routes means you cannot name an origin or destination.
Sports covers Padres, Wave, San Diego FC, Ducks, and Gulls: live/latest/next games and Team Hubs with records, leaders, recent/upcoming games, headlines, and official links. Published schedules may be empty between seasons; this does not mean no schedule has been announced. Gulls dates may be labels without a known year or countdown.
On Tap (the Keg destination) has separate Beer and Sparkling Water taps, editable tap names, estimated liquid remaining, pints/ounces, scale weight, last reading, level history, recent pours, and usage trends. Measurements and depletion estimates are approximate; never invent pours. Tap name edits sync to supported displays. New-keg setup is done at the device; do not claim chat can reset/calibrate a scale or change a keg.
Settings (or More → Settings where shown) includes account/sign-out, notification preferences and device enable/disable, the notification inbox/bell, network status, and a manual 5 MB download speed test. iPhone push requires installing the app to the Home Screen and granting notification permission. Subscription records are per device and do not prove this browser has notification permission. Browser network/speed-test results are unavailable to the server unless explicitly supplied by the user. Patty preferences and the household monthly spending cap are under Ask Patty > Preferences & budget.
You can answer questions and explain navigation; you cannot change tap names, calibration, notifications, account/network settings, delete records, run a browser speed test, control hardware, or acknowledge emergency notices through chat. Workout creation is your only write action. Never imply that you performed another dashboard action.`

const topics = {
  weather: /\b(weather|forecast|rain|raining|temperature|wind|humidity|uv|radar|sunny|outside)\b/i,
  safety: /\b(safety|fire|fires|wildfire|wildfires|smoke|hotspot|hotspots|earthquake|earthquakes|quake|quakes|aqi|air quality|evacuation|emergency|emergencies|alerts?)\b/i,
  flights: /\b(flight|flights|plane|planes|aircraft|airplane|airplanes|overhead|callsign|airline|airlines|airplane route)\b/i,
  sports: /\b(sports|score|scores|game|games|won|winning|playing|kickoff|baseball|soccer|hockey|padres|wave|sdfc|san diego fc|ducks|gulls|standings|roster|scorer|scorers)\b/i,
  taps: /\b(beer|beers|water|keg|kegs|tap|taps|pour|pours|poured|pints?|ounces?|sparkling|seltzer|scale)\b/i,
  settings: /\b(notifications?|inbox|bell|unread|settings|subscription|subscriptions|network|speed test|wifi|wi-fi)\b/i,
}
const pageSection = { weather: 'weather', fire: 'safety', flights: 'flights', sports: 'sports', keg: 'taps', house: 'settings' }
export function dashboardSections(message, page, history = []) {
  const selected = Object.entries(topics).filter(([, pattern]) => pattern.test(message)).map(([key]) => key)
  if (selected.length) return selected
  if (/\b(workouts?|exercises?|reps?|sets?|fitness|routines?|training)\b/i.test(message)) return []
  if (/\b(dashboard|everything|all (the )?features|what.s happening|household summary)\b/i.test(message)) return Object.keys(topics)
  // A short follow-up such as "and tomorrow?" keeps the previous question's topic.
  const previous = [...history].reverse().find(item => item.role === 'user')?.content || ''
  const followup = Object.entries(topics).filter(([, pattern]) => pattern.test(previous)).map(([key]) => key)
  if (followup.length && /^(and\b|what about\b|how about\b|when\b|why\b|is it\b|are they\b|tomorrow\b)/i.test(message.trim())) return followup
  return pageSection[page] ? [pageSection[page]] : []
}
const text = (value, length = 180) => typeof value === 'string' ? value.slice(0, length) : null
const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
const iso = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const datePacific = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
const list = value => Array.isArray(value) ? value : []
const failed = () => ({ status: 'unavailable', note: 'This feed could not be read. Its current state is unknown.' })
const status = value => value?.error || Object.keys(value?.errors || {}).length ? 'partial' : 'available'
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href.slice(0, 500) : null } catch { return null }
}
const pick = (value, fields) => Object.fromEntries(fields.map(key => [key, typeof value?.[key] === 'string' ? text(value[key]) : typeof value?.[key] === 'boolean' ? value[key] : number(value?.[key])]))
const game = value => value ? { ...pick(value, ['date', 'dateLabel', 'state', 'status', 'opponent', 'score', 'opponentScore', 'home', 'venue', 'timeTbd']), scorers: list(value.scorers).slice(0, 4).map(item => pick(item, ['name', 'clock'])) } : null

async function weather({ fetchJson }) {
  const points = await fetchJson('https://api.weather.gov/points/32.8384,-116.9739')
  const fetchForecast = async value => {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'api.weather.gov') throw new Error('Invalid forecast source')
    const data = await fetchJson(url.href)
    return { updatedAt: iso(data.properties?.updated || data.properties?.updateTime), periods: list(data.properties?.periods) }
  }
  const results = await Promise.allSettled([
    fetchForecast(points.properties?.forecastHourly), fetchForecast(points.properties?.forecast),
    fetchJson('https://api.open-meteo.com/v1/forecast?latitude=32.8384&longitude=-116.9739&current=uv_index&daily=uv_index_max&timezone=America%2FLos_Angeles&forecast_days=1'),
  ])
  const hourly = results[0].status === 'fulfilled' ? results[0].value : null
  const daily = results[1].status === 'fulfilled' ? results[1].value : null
  const uv = results[2].status === 'fulfilled' ? results[2].value : null
  const period = item => ({ ...pick(item, ['name', 'startTime', 'temperature', 'temperatureUnit', 'shortForecast', 'windSpeed', 'windDirection']), rainChancePercent: number(item.probabilityOfPrecipitation?.value), humidityPercent: number(item.relativeHumidity?.value) })
  return { status: results.every(result => result.status === 'fulfilled') ? 'available' : 'partial', source: 'NWS; UV: Open-Meteo', location: 'Santee city center', updatedAt: hourly?.updatedAt, currentForecast: hourly?.periods[0] ? period(hourly.periods[0]) : null, nextHours: hourly ? hourly.periods.slice(1, 7).map(period) : null, forecast: daily ? daily.periods.slice(0, 14).map(period) : null, uvIndex: number(uv?.current?.uv_index), maxUvToday: number(uv?.daily?.uv_index_max?.[0]) }
}
function distanceMi(lat, lon) {
  const rad = value => value * Math.PI / 180
  const a = Math.sin(rad(lat - 32.8384) / 2) ** 2 + Math.cos(rad(32.8384)) * Math.cos(rad(lat)) * Math.sin(rad(lon + 116.9739) / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(a))
}
async function safety({ invoke, fetchJson, now }) {
  const start = new Date(now - 7 * 86400000).toISOString()
  const results = await Promise.allSettled([
    invoke('fire-watch'), invoke('safety-feeds'),
    fetchJson('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=32.8384&longitude=-116.9739&current=us_aqi,pm2_5,ozone&timezone=America%2FLos_Angeles'),
    fetchJson(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=32.8384&longitude=-116.9739&maxradiuskm=160.934&minmagnitude=2.5&starttime=${encodeURIComponent(start)}&orderby=time&limit=20`),
  ])
  const [fire, notices, air, quakes] = results.map(result => result.status === 'fulfilled' ? result.value : null)
  const earthquakes = quakes ? list(quakes.features).flatMap(item => {
    const [lon, lat] = item.geometry?.coordinates || []
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    const distance = distanceMi(lat, lon), magnitude = number(item.properties?.mag)
    if (magnitude == null || !(distance <= 25 && magnitude >= 2.5 || distance <= 50 && magnitude >= 3 || distance <= 100 && magnitude >= 4)) return []
    return [{ magnitude, place: text(item.properties?.place), at: item.properties?.time ? new Date(item.properties.time).toISOString() : null, distanceMilesFromSantee: Math.round(distance * 10) / 10, sourceUrl: safeUrl(item.properties?.url) }]
  }).slice(0, 5) : null
  return {
    status: results.every(result => result.status === 'fulfilled') && !fire?.error && !notices?.error ? 'available' : 'partial',
    fires: fire ? { status: status(fire), updatedAt: iso(fire.updatedAt), incidents: list(fire.incidents).slice(0, 5).map(item => pick(item, ['name', 'acres', 'containment', 'county', 'distMi', 'updated'])), thermalHotspots: list(fire.fires).slice(0, 5).map(item => pick(item, ['distMi', 'detections', 'confidence', 'acqDate'])), scope: 'Official incidents at least 5 acres within 25 miles; satellite hotspots are not confirmed fires.' } : failed(),
    alerts: notices ? { status: status(notices), updatedAt: iso(notices.updatedAt), weather: list(notices.weatherAlerts).slice(0, 4).map(item => ({ ...pick(item, ['event', 'headline', 'severity', 'urgency', 'effective', 'expires']), instructionExcerpt: text(item.instruction, 600), sourceUrl: safeUrl(item.url) })), county: list(notices.countyEmergencies).slice(0, 4).map(item => ({ ...pick(item, ['type', 'label', 'date']), notesExcerpt: text(item.notes, 500) })) } : failed(),
    airQuality: air ? { status: 'available', observedLocalTime: text(air.current?.time), usAqi: number(air.current?.us_aqi), pm25: number(air.current?.pm2_5), ozone: number(air.current?.ozone), source: 'Open-Meteo, Santee city center' } : failed(),
    earthquakes: quakes ? { status: 'available', scope: 'Last seven days; dashboard distance/magnitude filters, distances from Santee city center', events: earthquakes } : failed(),
    note: 'An empty list means no matching entries were returned, not an all-clear. Alert instructions are excerpts; check official notices for full instructions.',
  }
}
async function flights({ invoke, fetchJson, now }) {
  const data = await invoke('flights')
  const airborne = list(data.ac).filter(item => typeof item.alt_baro === 'number' && item.alt_baro > 0).sort((a, b) => (a.dst ?? 999) - (b.dst ?? 999))
  const aircraft = await Promise.all(airborne.slice(0, 8).map(async item => {
    const callsign = text(item.flight?.trim(), 20)
    let route = null
    if (callsign) {
      try {
        const data = await fetchJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`)
        const value = data.response?.flightroute
        if (value) route = { airline: text(value.airline?.name), originCode: text(value.origin?.iata_code), originCity: text(value.origin?.municipality), destinationCode: text(value.destination?.iata_code), destinationCity: text(value.destination?.municipality) }
      } catch { /* Route lookup is optional. */ }
    }
    return { callsign, aircraftType: text(item.t), registration: text(item.r), altitudeFeet: number(item.alt_baro), groundSpeedKnots: number(item.gs), distanceNauticalMiles: number(item.dst), route }
  }))
  const timestamp = number(data.now)
  return { status: status(data), source: text(data.source), observedAt: timestamp ? new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toISOString() : new Date(now).toISOString(), airborneCount: airborne.length, aircraft, scope: 'Up to eight nearest airborne aircraft from the household flight feed. Route lookups may be unavailable. Coverage is incomplete.' }
}
async function sports({ invoke, fetchJson, message, now }) {
  const configs = [['padres', /padres/i], ['wave', /\bwave\b/i], ['sdfc', /\bsdfc\b|san diego fc/i], ['ducks', /ducks/i], ['gulls', /gulls/i]]
  const requested = configs.filter(([, pattern]) => pattern.test(message)).map(([key]) => key)
  const keys = requested.length ? requested : ['padres']
  const results = await Promise.allSettled([invoke('sports'), ...keys.map(teamKey => invoke('sports', { teamKey }))])
  let padresToday = null
  if (keys.includes('padres')) {
    try {
      const data = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&date=${datePacific(now)}`)
      padresToday = list(data.dates).flatMap(day => list(day.games)).slice(0, 2).map(item => {
        const away = item.teams?.away, home = item.teams?.home
        const padresHome = home?.team?.id === 135
        const team = padresHome ? home : away, opponent = padresHome ? away : home
        return { date: iso(item.gameDate), state: text(item.status?.abstractGameState), status: text(item.status?.detailedState), home: padresHome, score: number(team?.score), opponentScore: number(opponent?.score), opponent: text(opponent?.team?.name), venue: text(item.venue?.name) }
      })
    } catch { /* The other team feeds can still be used. */ }
  }
  const overview = results[0].status === 'fulfilled' ? results[0].value : null
  const details = results.slice(1).map((result, index) => result.status === 'fulfilled' ? {
    team: text(result.value.team?.name), updatedAt: iso(result.value.updatedAt), status: status(result.value), season: pick(result.value.season, ['year', 'label']), record: pick(result.value.record, ['label', 'value', 'standing', 'points']), recent: list(result.value.recent).slice(0, 2).map(game), upcoming: list(result.value.upcoming).slice(0, 3).map(game), news: list(result.value.news).slice(0, 3).map(item => ({ title: text(item.title), publishedAt: iso(item.publishedAt), sourceUrl: safeUrl(item.url) })), leaders: list(result.value.leaders).slice(0, 3).map(item => pick(item, ['name', 'category', 'value', 'label'])), scheduleNote: text(result.value.scheduleNote), sourceUrls: { schedule: safeUrl(result.value.sources?.schedule), news: safeUrl(result.value.sources?.news), roster: safeUrl(result.value.sources?.roster) },
  } : { team: keys[index], ...failed() })
  return { status: results.every(result => result.status === 'fulfilled') && (!keys.includes('padres') || padresToday !== null) && !overview?.error && details.every(item => item.status === 'available') ? 'available' : 'partial', updatedAt: iso(overview?.updatedAt), padresToday, padresTodayStatus: keys.includes('padres') ? padresToday == null ? 'unavailable' : 'available' : 'not_requested', teams: overview ? list(overview.teams).slice(0, 4).map(item => ({ ...pick(item, ['name', 'league', 'record', 'standing']), live: game(item.live), latest: game(item.latest), next: game(item.next) })) : null, details, scope: 'Dashboard team coverage only; use dates and game states, not assumptions about the current season. Detail lists are bounded.' }
}
async function taps({ db, now }) {
  const settings = await db('keg_scale_settings?select=scale_id,display_name')
  const since = new Date(now - 30 * 86400000).toISOString()
  return { status: 'available', taps: await Promise.all(['beer', 'sparkling-water'].map(async scaleId => {
    try {
      const [readings, changes, records] = await Promise.all([
        db(`keg_scale_readings?scale_id=eq.${scaleId}&select=payload,recorded_at&order=recorded_at.desc&limit=1`),
        db(`keg_scale_changes?scale_id=eq.${scaleId}&select=changed_at,starting_ounces,starting_percent&order=changed_at.desc&limit=1`),
        db(`keg_scale_pours?scale_id=eq.${scaleId}&poured_at=gte.${encodeURIComponent(since)}&select=poured_at,ounces&order=poured_at.desc&limit=501`),
      ])
      const reading = readings[0], change = changes[0], payload = reading?.payload
      const at = iso(reading?.recorded_at), startingPercent = number(change?.starting_percent)
      const rawPercent = number(payload?.percent)
      const percent = rawPercent == null ? null : startingPercent > 0 && at && at >= iso(change?.changed_at) ? Math.max(0, Math.min(100, rawPercent / startingPercent * 100)) : rawPercent
      const pours = list(records).slice(0, 500)
      const active = change?.changed_at ? pours.filter(item => item.poured_at >= change.changed_at) : pours
      const today = active.filter(item => datePacific(item.poured_at) === datePacific(now))
      const week = active.filter(item => Date.parse(item.poured_at) >= now - 7 * 86400000)
      const ounces = items => Math.round(items.reduce((sum, item) => sum + (number(item.ounces) || 0), 0) * 10) / 10
      return { scaleId, name: text(settings.find(item => item.scale_id === scaleId)?.display_name), status: at ? now - Date.parse(at) > 5 * 60000 ? 'stale' : 'available' : 'unavailable', observedAt: at, ouncesRemaining: number(payload?.beerOz), pintsRemaining: number(payload?.pintsLeft), percentRemaining: percent, totalWeightPounds: number(payload?.totalWeightLb), kegChangedAt: iso(change?.changed_at), ouncesPouredToday: ounces(today), poursToday: today.length, ouncesPouredLastSevenDays: ounces(week), recentPours: active.slice(0, 5).map(item => ({ at: iso(item.poured_at), ounces: number(item.ounces) })), historyTruncated: records.length > 500, scope: 'At most 500 recorded pours in the last 30 days, restricted to the current keg for totals. Missing recordings are not proof of no use.' }
    } catch { return { scaleId, ...failed() } }
  })) }
}
async function settings({ db, userId }) {
  const [subscriptions, notices] = await Promise.all([
    db(`push_subscriptions?user_id=eq.${userId}&select=preferences&limit=8`),
    db('notification_events?select=category,title,body,created_at&order=created_at.desc&limit=6'),
  ])
  const allowed = ['fire', 'earthquake', 'weather', 'emergency', 'keg', 'padres']
  return { status: 'available', recentNotices: list(notices).slice(0, 6).map(item => ({ category: text(item.category), title: text(item.title), bodyExcerpt: text(item.body, 400), createdAt: iso(item.created_at) })), subscriptionRecords: subscriptions.length, devicePreferences: subscriptions.map(item => Object.fromEntries(allowed.filter(key => typeof item.preferences?.[key] === 'boolean').map(key => [key, item.preferences[key]]))), scope: 'Only this signed-in account, at most eight subscription records. These records do not establish permission on the current device. No browser speed-test or network measurement is available.' }
}

// Drop detail records rather than truncating serialized JSON. Preserve availability
// and source times even when the model context must be reduced.
export function boundDashboardContext(context, maxBytes = 10000) {
  const size = () => new TextEncoder().encode(JSON.stringify(context)).length
  const arrays = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        if (!['taps', 'devicePreferences'].includes(key)) arrays.push(value)
        value.forEach(visit)
      } else visit(value)
    }
  }
  visit(context.sections)
  while (size() > maxBytes) {
    const largest = arrays.filter(items => items.length).sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0]
    if (!largest) break
    largest.pop(); context.detailsTruncated = true
  }
  return context
}
export async function loadDashboard(deps, sections) {
  const loaders = { weather, safety, flights, sports, taps, settings }
  const results = await Promise.all(sections.map(async key => {
    try { return [key, await loaders[key](deps)] } catch { return [key, failed()] }
  }))
  return boundDashboardContext({ fetchedAt: new Date(deps.now).toISOString(), timeZone: 'America/Los_Angeles', sections: Object.fromEntries(results), detailsTruncated: false })
}
