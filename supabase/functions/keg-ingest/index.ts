const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-keg-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const expected = Deno.env.get('KEG_INGEST_SECRET')
  if (!expected || request.headers.get('x-keg-secret') !== expected) return json({ error: 'Unauthorized' }, 401)

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return json({ error: 'Invalid reading' }, 400)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Server configuration error' }, 500)

  const response = await fetch(`${url}/rest/v1/keg_readings`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ payload }),
  })
  if (!response.ok) return json({ error: 'Could not save reading' }, 502)

  const [reading] = await response.json()
  const pourOz = Number((payload as Record<string, unknown>).pourOz)
  if (Number.isFinite(pourOz) && pourOz >= 1 && pourOz <= 64) {
    const pourResponse = await fetch(`${url}/rest/v1/keg_pours`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ reading_id: reading.id, ounces: pourOz, beer_oz_after: Number((payload as Record<string, unknown>).beerOz) || null }),
    })
    if (!pourResponse.ok) return json({ error: 'Reading saved, but pour event failed' }, 502)
  }

  return json({ ok: true, pourRecorded: Number.isFinite(pourOz) && pourOz >= 1 && pourOz <= 64 }, 201)
})
