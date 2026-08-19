const HOME = { lat: Number(Deno.env.get('HOME_LAT')), lon: Number(Deno.env.get('HOME_LON')) }
const RADIUS_NM = 4.3

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20' },
  })
}

function boundingBox(lat: number, lon: number, radiusNm: number) {
  const latDelta = radiusNm / 60
  const lonDelta = radiusNm / (60 * Math.cos(lat * Math.PI / 180))
  return {
    lamin: lat - latDelta,
    lomin: lon - lonDelta,
    lamax: lat + latDelta,
    lomax: lon + lonDelta,
  }
}

async function fetchAdsbLol() {
  const url = `https://api.adsb.lol/v2/point/${HOME.lat}/${HOME.lon}/${RADIUS_NM}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`ADSB.lol returned ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data.ac)) throw new Error('ADSB.lol returned an invalid response')
  return { ...data, source: 'adsb.lol' }
}

async function fetchOpenSky() {
  const box = boundingBox(HOME.lat, HOME.lon, RADIUS_NM)
  const params = new URLSearchParams(Object.entries(box).map(([key, value]) => [key, String(value)]))
  const response = await fetch(`https://opensky-network.org/api/states/all?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`OpenSky returned ${response.status}`)
  const data = await response.json()
  const ac = (data.states ?? []).map((state: unknown[]) => ({
    hex: state[0],
    flight: state[1],
    lon: state[5],
    lat: state[6],
    alt_baro: typeof state[7] === 'number' ? state[7] * 3.28084 : state[8] ? 'ground' : null,
    gs: typeof state[9] === 'number' ? state[9] * 1.94384 : null,
    track: state[10],
    baro_rate: typeof state[11] === 'number' ? state[11] * 196.8504 : null,
    squawk: state[14],
    category: state[17],
  }))
  return { ac, total: ac.length, now: data.time, source: 'opensky' }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !supabaseUrl || !anonKey) return json({ error: 'Authentication required.' }, 401)

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  })
  if (!authResponse.ok) return json({ error: 'Authentication required.' }, 401)

  const failures: string[] = []
  for (const provider of [fetchAdsbLol, fetchOpenSky]) {
    try {
      return json(await provider())
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  console.error('All aircraft providers failed:', failures)
  return json({ error: 'Live aircraft data is temporarily unavailable.' }, 502)
})
