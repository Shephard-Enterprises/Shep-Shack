import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from './chat.mjs'
const changeId = '11111111-1111-4111-8111-111111111111'
function harness({ member = true, failure = null } = {}) {
  const calls = []
  const handler = createHandler({ env: key => ({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'})[key], fetchImpl: async (url, options) => {
    calls.push({url,options})
    const json = (body, status = 200) => new Response(JSON.stringify(body), {status})
    if (url.endsWith('/auth/v1/user')) return json({id:'current-user'})
    if (url.endsWith('/rpc/is_household_member')) return json(member)
    if (url.endsWith('/rpc/assistant_undo_routine')) return failure ? json({message:failure},400) : json({fitnessProfileId:changeId,routineId:changeId,removed:false})
    throw new Error(`Unexpected request ${url}`)
  } })
  return {calls, send: (body = {action:'undoRoutine',changeId}, authorization = 'Bearer user-session') => handler(new Request('https://edge.test',{method:'POST',headers: authorization ? {Authorization:authorization} : {},body:JSON.stringify(body)}))}
}
test('undo uses the caller’s JWT without a model call, spending reservation, or API key', async () => {
  const h = harness()
  const result = await (await h.send()).json()
  assert.equal(result.removed,false)
  const call = h.calls.find(call => call.url.endsWith('/rpc/assistant_undo_routine'))
  assert.equal(call.options.headers.Authorization,'Bearer user-session')
  assert.equal(call.options.headers.apikey,'public')
  assert.deepEqual(JSON.parse(call.options.body),{p_change:changeId})
  assert.equal(h.calls.length,3)
})
test('undo rejects unauthenticated users, removed household members, and invalid change IDs', async () => {
  const missing = harness()
  assert.equal((await missing.send(undefined, null)).status,401)
  assert.equal(missing.calls.length,0)
  const removed = harness({member:false})
  assert.equal((await removed.send()).status,403)
  assert.equal(removed.calls.some(call => call.url.includes('assistant_undo')),false)
  const invalid = harness()
  assert.equal((await invalid.send({action:'undoRoutine',changeId:'invalid'})).status,400)
  assert.equal(invalid.calls.some(call => call.url.includes('assistant_undo')),false)
})
test('undo conflicts return the database explanation without claiming success', async () => {
  const h = harness({failure:'This routine has changed since then. Undo would overwrite newer changes.'})
  const response = await h.send()
  assert.equal(response.status,400)
  const result = await response.json()
  assert.match(result.error,/newer changes/)
  assert.equal(result.removed,undefined)
})
