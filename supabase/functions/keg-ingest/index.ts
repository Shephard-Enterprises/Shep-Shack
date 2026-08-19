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
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ payload }),
  })
  return response.ok ? json({ ok: true }, 201) : json({ error: 'Could not save reading' }, 502)
})
