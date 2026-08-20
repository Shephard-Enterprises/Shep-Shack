import webpush from 'npm:web-push@3.6.7'

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function userIdFromRequest(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const encoded = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
    return JSON.parse(atob(encoded)).sub as string
  } catch {
    return null
  }
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  if (!response.ok) throw new Error(`Database ${response.status}: ${await response.text()}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const userId = userIdFromRequest(request)
  if (!userId) return Response.json({ error: 'No authenticated user.' }, { status: 401, headers: corsHeaders })
  const subscriptions = await rest(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${userId}`)
  if (!subscriptions?.length) return Response.json({ error: 'This account has no registered phone.' }, { status: 404, headers: corsHeaders })

  webpush.setVapidDetails('mailto:shepshack@localhost', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const results = await Promise.all(subscriptions.map(async (subscription: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title: 'Shep Shack test', body: 'Phone notifications are working.', tag: `test-${Date.now()}`, url: '/?page=home' }),
      )
      return { sent: true }
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await rest(`push_subscriptions?id=eq.${subscription.id}`, { method: 'DELETE' })
      return { sent: false, error: `Push service ${error?.statusCode ?? 'error'}: ${error?.body ?? error?.message ?? 'Delivery failed'}` }
    }
  }))
  const sent = results.filter(result => result.sent).length
  const errors = results.flatMap(result => result.error ? [result.error] : [])
  return Response.json({ sent, error: errors.length ? errors.join(' · ') : null }, { status: sent ? 200 : 502, headers: corsHeaders })
})
