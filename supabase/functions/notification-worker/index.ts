import webpush from 'npm:web-push@3.6.7'

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WORKER_SECRET = Deno.env.get('NOTIFICATION_WORKER_SECRET')!
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

type Notice = { key: string; category: 'fire' | 'earthquake' | 'weather' | 'emergency' | 'keg' | 'padres'; title: string; body: string; url: string }

const HOME = { lat: Number(Deno.env.get('HOME_LAT')), lon: Number(Deno.env.get('HOME_LON')) }

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(a))
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  if (!response.ok) throw new Error(`Database ${response.status}: ${await response.text()}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function collectKeg(): Promise<Notice[]> {
  const rows = await rest('keg_readings?select=id,recorded_at,payload&order=recorded_at.desc&limit=1')
  if (!rows?.length) return []
  const reading = rows[0]
  const ageMinutes = (Date.now() - new Date(reading.recorded_at).getTime()) / 60000
  const day = reading.recorded_at.slice(0, 10)
  if (ageMinutes > 10) return [{ key: `keg-stale:${day}:${new Date().getUTCHours()}`, category: 'keg', title: 'Keg sensor is offline', body: `No fresh reading for ${Math.floor(ageMinutes)} minutes.`, url: '/?page=keg' }]
  const percent = Number(reading.payload?.percent)
  if (percent <= 10) return [{ key: `keg-critical:${day}`, category: 'keg', title: 'Keg critically low', body: `Only ${Math.round(percent)}% remains. Time for a replacement.`, url: '/?page=keg' }]
  if (percent <= 20) return [{ key: `keg-low:${day}`, category: 'keg', title: 'Keg is running low', body: `${Math.round(percent)}% remains in the keg.`, url: '/?page=keg' }]
  return []
}

async function collectFire(): Promise<Notice[]> {
  const response = await fetch(`${PROJECT_URL}/functions/v1/fire-watch`, { method: 'POST', headers: { 'x-worker-secret': WORKER_SECRET } })
  if (!response.ok) return []
  const data = await response.json()
  const notices: Notice[] = (data.incidents ?? []).map((fire: any) => ({ key: `fire:${fire.name}:${fire.discovered ?? 'current'}`, category: 'fire', title: `Wildfire ${Math.round(fire.distMi)} miles away`, body: `${fire.name} · ${Math.round(fire.acres).toLocaleString()} acres${fire.containment != null ? ` · ${fire.containment}% contained` : ''}`, url: '/?page=fire' }))
  const hotspot = (data.fires ?? []).find((fire: any) => fire.distMi <= 10)
  if (hotspot) notices.push({ key: `hotspot:${hotspot.acqDate}:${hotspot.lat.toFixed(2)}:${hotspot.lon.toFixed(2)}`, category: 'fire', title: 'Nearby satellite heat detection', body: `NASA detected a hotspot about ${Math.round(hotspot.distMi)} miles from home.`, url: '/?page=fire' })
  return notices
}

async function collectEarthquakes(): Promise<Notice[]> {
  const query = new URLSearchParams({
    format: 'geojson', latitude: String(HOME.lat), longitude: String(HOME.lon),
    maxradiuskm: '160.934', minmagnitude: '2.5',
    starttime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    orderby: 'time', limit: '20',
  })
  const response = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${query}`)
  if (!response.ok) return []
  const data = await response.json()
  return (data.features ?? []).flatMap((feature: any) => {
    const [lon, lat] = feature.geometry?.coordinates ?? []
    const magnitude = Number(feature.properties?.mag)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(magnitude)) return []
    const miles = distanceMiles(HOME.lat, HOME.lon, lat, lon)
    const noticeable =
      (miles <= 25 && magnitude >= 2.5) ||
      (miles <= 50 && magnitude >= 3) ||
      (miles <= 100 && magnitude >= 4)
    if (!noticeable) return []
    return [{
      key: `earthquake:${feature.id}`,
      category: 'earthquake' as const,
      title: `M ${magnitude.toFixed(1)} earthquake nearby`,
      body: `${Math.round(miles)} miles from home · ${feature.properties?.place ?? 'Southern California'}`,
      url: '/?page=fire',
    }]
  })
}

async function collectOfficialAlerts(): Promise<Notice[]> {
  const response = await fetch(`${PROJECT_URL}/functions/v1/safety-feeds`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!response.ok) return []
  const data = await response.json()
  const weather: Notice[] = (data.weatherAlerts ?? []).map((alert: any) => ({
    key: `weather:${alert.id}`,
    category: 'weather',
    title: alert.event ?? 'Weather warning',
    body: alert.headline ?? alert.description ?? 'A weather alert affects the house.',
    url: '/?page=fire',
  }))
  const county: Notice[] = (data.countyEmergencies ?? []).map((notice: any) => ({
    key: `county:${notice.groupId ?? notice.id}:${notice.type}:${notice.date ?? 'active'}`,
    category: 'emergency',
    title: notice.type ?? 'County emergency notice',
    body: notice.label ?? notice.notes ?? 'An official San Diego County notice affects the home location.',
    url: '/?page=fire',
  }))
  return [...weather, ...county]
}

async function collectOpenHouse(): Promise<Notice[]> {
  const query = new URLSearchParams({
    latitude: String(HOME.lat), longitude: String(HOME.lon),
    current: 'temperature_2m', hourly: 'temperature_2m',
    temperature_unit: 'fahrenheit', timezone: 'America/Los_Angeles', forecast_days: '1',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`)
  if (!response.ok) return []
  const data = await response.json()
  const currentTemp = Number(data.current?.temperature_2m)
  const currentTime = String(data.current?.time ?? '')
  if (!Number.isFinite(currentTemp) || !currentTime) return []
  const localHour = Number(currentTime.slice(11, 13))
  if (localHour < 17 || currentTemp >= 79) return []
  const temperatures = (data.hourly?.time ?? []).flatMap((time: string, index: number) =>
    time <= currentTime ? [Number(data.hourly?.temperature_2m?.[index])] : []
  ).filter(Number.isFinite)
  if (!temperatures.some((temperature: number) => temperature > 82)) return []
  return [{
    key: `open-house:${currentTime.slice(0, 10)}`,
    category: 'weather',
    title: 'You can open the house',
    body: `It is now ${Math.round(currentTemp)}°F outside after a hot day.`,
    url: '/?page=weather',
  }]
}

async function collectPadres(): Promise<Notice[]> {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&teamId=135&hydrate=linescore`)
  if (!response.ok) return []
  const game = (await response.json()).dates?.[0]?.games?.[0]
  if (!game) return []
  const padresAway = game.teams.away.team.id === 135
  const padres = padresAway ? game.teams.away : game.teams.home
  const opponent = padresAway ? game.teams.home : game.teams.away
  if (game.status.abstractGameState === 'Live') return [{ key: `padres:${game.gamePk}:start`, category: 'padres', title: 'Padres game started', body: `SD ${padres.score ?? 0} · ${opponent.team.name} ${opponent.score ?? 0}`, url: '/?page=sports' }]
  if (game.status.abstractGameState === 'Final') return [{ key: `padres:${game.gamePk}:final`, category: 'padres', title: 'Padres final', body: `Padres ${padres.score ?? 0}, ${opponent.team.name} ${opponent.score ?? 0}`, url: '/?page=sports' }]
  return []
}

async function collectSoccer(team: { id: string; league: string; key: string; name: string }): Promise<Notice[]> {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '')
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${team.league}/scoreboard?dates=${date}&limit=100`)
  if (!response.ok) return []
  const event = (await response.json()).events?.find((candidate: any) =>
    candidate.competitions?.[0]?.competitors?.some((competitor: any) => String(competitor.team?.id) === team.id)
  )
  if (!event) return []
  const competition = event.competitions?.[0]
  const ours = competition?.competitors?.find((competitor: any) => String(competitor.team?.id) === team.id)
  const opponent = competition?.competitors?.find((competitor: any) => String(competitor.team?.id) !== team.id)
  if (!ours || !opponent) return []
  const state = competition.status?.type?.state ?? event.status?.type?.state
  const score = ours.score?.displayValue ?? ours.score ?? 0
  const opponentScore = opponent.score?.displayValue ?? opponent.score ?? 0
  const opponentName = opponent.team?.displayName ?? opponent.team?.name ?? 'Opponent'
  if (state === 'in') return [{ key: `${team.key}:${event.id}:start`, category: 'padres', title: `${team.name} match started`, body: `${team.name} ${score} · ${opponentName} ${opponentScore}`, url: '/?page=sports' }]
  if (state === 'post') return [{ key: `${team.key}:${event.id}:final`, category: 'padres', title: `${team.name} final`, body: `${team.name} ${score}, ${opponentName} ${opponentScore}`, url: '/?page=sports' }]
  return []
}

async function send(notice: Notice) {
  await rest('notification_events?on_conflict=event_key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ event_key: notice.key, category: notice.category, title: notice.title, body: notice.body, url: notice.url }) })
  const subscriptions = await rest(`push_subscriptions?select=id,endpoint,p256dh,auth,preferences&preferences->>${notice.category}=eq.true`)
  let sent = 0
  await Promise.all((subscriptions ?? []).map(async (subscription: any) => {
    const claimed = await rest('notification_deliveries?on_conflict=event_key,subscription_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ event_key: notice.key, subscription_id: subscription.id }),
    })
    if (!claimed?.length) return
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: notice.title, body: notice.body, tag: notice.key, url: notice.url }))
      sent++
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await rest(`push_subscriptions?id=eq.${subscription.id}`, { method: 'DELETE' })
      else {
        await rest(`notification_deliveries?event_key=eq.${encodeURIComponent(notice.key)}&subscription_id=eq.${subscription.id}`, { method: 'DELETE' })
        console.error('Push failed', error)
      }
    }
  }))
  return sent
}

Deno.serve(async request => {
  if (request.headers.get('x-worker-secret') !== WORKER_SECRET) return new Response('Unauthorized', { status: 401 })
  webpush.setVapidDetails('mailto:shepshack@localhost', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const groups = await Promise.allSettled([
    collectKeg(), collectFire(), collectEarthquakes(), collectOfficialAlerts(), collectOpenHouse(), collectPadres(),
    collectSoccer({ id: '22529', league: 'usa.1', key: 'sdfc', name: 'San Diego FC' }),
    collectSoccer({ id: '21423', league: 'usa.nwsl', key: 'wave', name: 'San Diego Wave' }),
  ])
  const notices = groups.flatMap(group => group.status === 'fulfilled' ? group.value : [])
  const sent = (await Promise.all(notices.map(send))).reduce((total, count) => total + count, 0)
  return Response.json({ checked: notices.length, sent })
})
