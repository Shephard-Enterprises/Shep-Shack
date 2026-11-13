import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardSections, loadDashboard } from './dashboard.mjs'
import { BUILTIN_MOVEMENTS } from '../_shared/movement-library.mjs'
import { buildInput, bytes, createHandler } from './chat.mjs'
const now = Date.parse('2026-11-14T02:00:00Z') // Friday evening, Pacific time.
const missing = async () => { throw new Error('private provider error') }
const deps = overrides => ({ now, userId: '00000000-0000-0000-0000-000000000001', message: '', db: missing, invoke: missing, fetchJson: missing, ...overrides })

test('questions select relevant dashboard features, keep follow-ups, and leave workouts alone', () => {
  assert.deepEqual(dashboardSections('How much beer is left?', 'fitness'), ['taps'])
  assert.deepEqual(dashboardSections('Weather and Padres score?', 'home'), ['weather', 'sports'])
  assert.deepEqual(dashboardSections('What about tomorrow?', 'home', [{ role: 'user', content: 'Will it rain?' }]), ['weather'])
  assert.deepEqual(dashboardSections('Write my next workout', 'weather'), [])
  assert.deepEqual(dashboardSections('What does this show?', 'flights'), ['flights'])
  assert.equal(dashboardSections('Explain all dashboard features', 'home').length, 6)
})
test('tap context uses saved names, current keg normalization, Pacific days, and stale timestamps', async () => {
  const paths = []
  const data = await loadDashboard(deps({ db: async path => {
    paths.push(path)
    if (path.startsWith('keg_scale_settings')) return [{ scale_id: 'beer', display_name: 'Test IPA' }]
    if (path.startsWith('keg_scale_readings')) return [{ recorded_at: '2026-11-14T01:40:00Z', payload: { beerOz: 320, pintsLeft: 20, percent: 40, totalWeightLb: 30, password: 'SECRET', lat: 33, lon: -118 } }]
    if (path.startsWith('keg_scale_changes')) return [{ changed_at: '2026-11-10T00:00:00Z', starting_percent: 80 }]
    return [{ poured_at: '2026-11-14T01:00:00Z', ounces: 12 }, { poured_at: '2026-11-13T01:00:00Z', ounces: 8 }, { poured_at: '2026-11-09T00:00:00Z', ounces: 50 }]
  } }), ['taps'])
  const beer = data.sections.taps.taps[0]
  assert.equal(beer.name, 'Test IPA')
  assert.equal(beer.status, 'stale')
  assert.equal(beer.percentRemaining, 50)
  assert.equal(beer.ouncesPouredToday, 12)
  assert.equal(beer.ouncesPouredLastSevenDays, 20)
  assert.equal(beer.ouncesRemaining, 320)
  assert.ok(paths.some(path => path.includes('scale_id=eq.sparkling-water')))
  assert.doesNotMatch(JSON.stringify(data), /SECRET|password|"lat"|"lon"/)
})
test('weather uses NWS periods and supplemental UV, never follows an arbitrary forecast URL', async () => {
  const urls = []
  const result = await loadDashboard(deps({ fetchJson: async url => {
    urls.push(url)
    if (url.includes('/points/')) return { properties: { forecastHourly: 'https://api.weather.gov/hourly', forecast: 'https://evil.test/steal' } }
    if (url.includes('/hourly')) return { properties: { updated: '2026-11-14T01:00:00Z', periods: [{ startTime: '2026-11-14T02:00:00Z', temperature: 65, temperatureUnit: 'F', shortForecast: 'Clear', probabilityOfPrecipitation: { value: 10 } }] } }
    return { current: { uv_index: 0 }, daily: { uv_index_max: [4] } }
  } }), ['weather'])
  assert.equal(result.sections.weather.currentForecast.temperature, 65)
  assert.equal(result.sections.weather.currentForecast.rainChancePercent, 10)
  assert.equal(result.sections.weather.uvIndex, 0)
  assert.equal(result.sections.weather.status, 'partial')
  assert.equal(result.sections.weather.forecast, null)
  assert.ok(urls.every(url => !url.includes('evil.test')))
})
test('partial safety failures remain unknown and no matching quakes is never an all-clear', async () => {
  const result = await loadDashboard(deps({ invoke: async name => {
    if (name === 'fire-watch') throw new Error('SECRET')
    return { weatherAlerts: [{ event: 'Wind Advisory', instruction: 'Read official instructions', url: 'https://api.weather.gov/alerts/123' }], countyEmergencies: [], updatedAt: new Date(now).toISOString() }
  }, fetchJson: async url => url.includes('usgs.gov') ? { features: [] } : { current: { time: '2026-11-13T18:00', us_aqi: 34 } } }), ['safety'])
  assert.equal(result.sections.safety.status, 'partial')
  assert.equal(result.sections.safety.fires.status, 'unavailable')
  assert.equal(result.sections.safety.alerts.weather[0].event, 'Wind Advisory')
  assert.equal(result.sections.safety.airQuality.usAqi, 34)
  assert.deepEqual(result.sections.safety.earthquakes.events, [])
  assert.match(result.sections.safety.note, /not an all-clear/)
  assert.doesNotMatch(JSON.stringify(result), /SECRET/)
})
test('aircraft context includes airborne readings and routes but strips coordinates', async () => {
  const result = await loadDashboard(deps({ invoke: async () => ({ source: 'adsb.lol', now: now / 1000, ac: [{ flight: ' TEST123 ', t: 'B738', alt_baro: 8000, lat: 33, lon: -118, gs: 210, dst: 2 }, { flight: 'GROUND', alt_baro: 'ground' }] }), fetchJson: async () => ({ response: { flightroute: { origin: { iata_code: 'SAN', municipality: 'San Diego' }, destination: { iata_code: 'SFO', municipality: 'San Francisco' }, airline: { name: 'Example Air' } } } }) }), ['flights'])
  const flights = result.sections.flights
  assert.equal(flights.airborneCount, 1)
  assert.equal(flights.aircraft[0].callsign, 'TEST123')
  assert.equal(flights.aircraft[0].route.destinationCode, 'SFO')
  assert.equal(flights.observedAt, new Date(now).toISOString())
  assert.doesNotMatch(JSON.stringify(flights), /"lat"|"lon"|GROUND/)
})
test('sports context preserves game states and undated Gulls labels', async () => {
  const calls = []
  const result = await loadDashboard(deps({ message: 'When do the Gulls play?', invoke: async (name, body) => {
    calls.push({ name, body })
    if (!body) return { teams: [{ name: 'San Diego Gulls', next: { state: 'pre', dateLabel: 'Saturday · 7 PM', opponent: 'Test club' } }] }
    return { team: { name: 'San Diego Gulls' }, recent: [], upcoming: [{ state: 'pre', dateLabel: 'Saturday · 7 PM' }], news: [], errors: {} }
  } }), ['sports'])
  assert.equal(calls[1].body.teamKey, 'gulls')
  assert.equal(result.sections.sports.details[0].upcoming[0].date, null)
  assert.equal(result.sections.sports.details[0].upcoming[0].dateLabel, 'Saturday · 7 PM')
})
test('settings reads only the signed-in account preferences and strips push credentials', async () => {
  const queries = []
  const result = await loadDashboard(deps({ db: async path => {
    queries.push(path)
    return [{ preferences: { fire: true, earthquake: false, emergency: true, injected: 'SECRET' }, endpoint: 'SECRET', auth: 'SECRET' }]
  } }), ['settings'])
  assert.match(queries[0], /user_id=eq\.00000000-0000-0000-0000-000000000001/)
  assert.match(queries[0], /select=preferences/)
  assert.match(queries[1], /notification_events\?select=category,title,body,created_at/)
  assert.deepEqual(result.sections.settings.devicePreferences, [{ fire: true, earthquake: false, emergency: true }])
  assert.doesNotMatch(JSON.stringify(result), /SECRET|endpoint|"auth"/)
})
test('missing feeds do not block chat and snapshots stay bounded as complete JSON', async () => {
  const unavailable = await loadDashboard(deps(), ['weather', 'safety', 'flights', 'sports', 'taps', 'settings'])
  assert.equal(unavailable.sections.taps.status, 'unavailable')
  assert.equal(unavailable.sections.weather.status, 'unavailable')
  const oversized = await loadDashboard(deps({ invoke: async () => ({ weatherAlerts: Array.from({ length: 100 }, () => ({ headline: '💪'.repeat(180), instruction: '🔥'.repeat(1000) })), countyEmergencies: Array.from({ length: 100 }, () => ({ label: '💪'.repeat(180), notes: '🔥'.repeat(1000) })), incidents: [], fires: [] }), fetchJson: async () => ({ features: [] }) }), ['safety'])
  assert.ok(bytes(JSON.stringify(oversized)) <= 10000)
  assert.equal(oversized.detailsTruncated, true)
  const payload = buildInput(Array.from({ length: 30 }, () => ({ role: 'user', content: 'x'.repeat(3000) })), 'What is happening?', 'preferences', 'home', null, oversized)
  assert.ok(bytes(JSON.stringify(payload)) <= 40000)
  assert.match(payload.instructions, /no general web browser/)
  assert.match(payload.input[0].content, /dashboard snapshot/)
  assert.equal(payload.input.at(-1).content, 'What is happening?')
})

test('handler uses authenticated server feeds, ignores spoofed client readings, and keeps dashboard replies read-only', async () => {
  const calls = []
  const handler = createHandler({ env: key => ({ SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private', OPENAI_API_KEY: 'secret' })[key], fetchImpl: async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null })
    const json = value => new Response(JSON.stringify(value))
    if (url.endsWith('/auth/v1/user')) return json({ id: '00000000-0000-0000-0000-000000000001' })
    if (url.endsWith('/rpc/is_household_member')) return json(true)
    if (url.includes('/assistant_threads?')) return json([{ messages: [] }])
    if (url.includes('/assistant_profiles?')) return json([])
    if (url.includes('/rpc/assistant_')) return json(null)
    if (url.includes('/functions/v1/flights')) return json({ ac: [{ flight: 'TRUSTED123', alt_baro: 5000 }], source: 'test' })
    if (url.includes('api.adsbdb.com')) return json({ response: {} })
    if (url === 'https://api.openai.com/v1/responses') return json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'The feed shows TRUSTED123 at 5,000 feet.' }] }], usage: { input_tokens: 1000, output_tokens: 100 } })
    throw new Error('Unexpected source')
  } })
  const response = await handler(new Request('https://edge.test', { method: 'POST', headers: { Authorization: 'Bearer household-session' }, body: JSON.stringify({ threadId: '00000000-0000-0000-0000-000000000002', requestId: '00000000-0000-0000-0000-000000000003', page: 'flights', message: 'What aircraft is overhead?', dashboard: { callsign: 'SPOOFED_DATA' } }) }))
  assert.equal(response.status, 200)
  const paid = calls.find(call => call.url === 'https://api.openai.com/v1/responses')
  assert.match(JSON.stringify(paid.body.input), /TRUSTED123/)
  assert.doesNotMatch(JSON.stringify(paid.body.input), /SPOOFED_DATA/)
  assert.equal(calls.find(call => call.url.includes('/functions/v1/flights')).options.headers.Authorization, 'Bearer household-session')
  assert.ok(calls.findIndex(call => call.url.endsWith('/assistant_reserve')) < calls.findIndex(call => call.url.includes('/functions/v1/flights')))
  assert.equal(calls.filter(call => /assistant_finish_(fitness|adhoc)/.test(call.url)).length, 0)
  assert.equal(paid.body.tools, undefined)
})


test('combined dashboard and training context preserves the newest question within the spending bound', async () => {
  const snapshot = await loadDashboard(deps({ invoke: async () => ({ weatherAlerts: Array.from({ length: 4 }, () => ({ headline: '💪'.repeat(180), instruction: '🔥'.repeat(1000) })), countyEmergencies: Array.from({ length: 4 }, () => ({ label: '💪'.repeat(180), notes: '🔥'.repeat(1000) })), incidents: [], fires: [] }), fetchJson: async () => ({ features: [] }) }), ['safety'])
  const original = JSON.stringify(snapshot)
  const fitness = { summary: { profile: { name: 'Rosy', preferences: 'x'.repeat(2000) }, movementLibrary: BUILTIN_MOVEMENTS.map(({ id, name, mode }) => ({ id, name, mode })), recentSessions: Array.from({ length: 30 }, () => ({ name: 'x'.repeat(180) })) } }
  const question = 'Is it safe to train outdoors? ' + 'x'.repeat(5900)
  const payload = buildInput([], question, 'x'.repeat(4000), 'fitness', fitness, snapshot)
  assert.ok(bytes(JSON.stringify(payload)) <= 40000)
  assert.equal(payload.input.at(-1).content, question)
  assert.match(payload.input[0].content, /Rosy/)
  assert.equal(JSON.stringify(snapshot), original)
})


test('Padres today includes live scores from the same MLB source as the dashboard', async () => {
  const result = await loadDashboard(deps({ message: 'Padres score?', invoke: async (name, body) => body ? { team: { name: 'Padres' }, errors: {} } : { teams: [] }, fetchJson: async url => {
    assert.match(url, /statsapi.mlb.com/)
    assert.match(url, /date=2026-11-13/)
    return { dates: [{ games: [{ gameDate: '2026-11-14T01:00:00Z', status: { abstractGameState: 'Live', detailedState: 'In Progress' }, teams: { home: { team: { id: 135, name: 'San Diego Padres' }, score: 3 }, away: { team: { id: 119, name: 'Los Angeles Dodgers' }, score: 2 } } }] }] }
  } }), ['sports'])
  assert.equal(result.sections.sports.padresToday[0].state, 'Live')
  assert.equal(result.sections.sports.padresToday[0].score, 3)
  assert.equal(result.sections.sports.padresToday[0].opponentScore, 2)
})
