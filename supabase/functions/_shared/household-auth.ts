export async function isHouseholdMember(request: Request) {
  const authorization = request.headers.get('Authorization')
  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !projectUrl || !anonKey) return false

  const response = await fetch(`${projectUrl}/rest/v1/rpc/is_household_member`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  return response.ok && await response.json() === true
}
