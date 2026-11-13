import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInput, bytes, createHandler, MODEL, responseText, usageCost } from './chat.mjs'

const userId = '00000000-0000-0000-0000-000000000001'
const threadId = '00000000-0000-0000-0000-000000000002'
const requestId = '00000000-0000-0000-0000-000000000003'
const env = key => ({ SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'private', OPENAI_API_KEY: 'secret' })[key]
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
function harness({ member = true, auth = true, reservationError, upstream, preferences = 'Dumbbells only', history = [] } = {}) {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, body })
    if (url.endsWith('/auth/v1/user')) return json({ id: userId }, auth ? 200 : 401)
    if (url.endsWith('/rpc/is_household_member')) return json(member)
    if (url.includes('/assistant_threads?')) return json([{ messages: history }])
    if (url.includes('/assistant_profiles?')) return json([{ preferences }])
    if (url.endsWith('/rpc/assistant_reserve')) return reservationError ? json({ message: reservationError }, 400) : json(null)
    if (url.endsWith('/rpc/assistant_finish')) return json(null)
    if (url === 'https://api.openai.com/v1/responses') return upstream ? upstream() : json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Try three sets of squats.' }] }], usage: { input_tokens: 1000, output_tokens: 100 } })
    throw new Error(`Unexpected fetch: ${url}`)
  }
  const handler = createHandler({ env, fetchImpl })
  const send = (changes = {}, headers = { Authorization: 'Bearer session' }) => handler(new Request('https://edge.test', { method: 'POST', headers, body: JSON.stringify({ threadId, requestId, message: 'Write a workout', page: 'home', ...changes }) }))
  return { calls, send, handler }
}

test('unauthenticated and removed household users cannot call the paid API', async () => {
  for (const options of [{ auth: false }, { member: false }]) {
    const h = harness(options)
    assert.ok([401, 403].includes((await h.send()).status))
    assert.equal(h.calls.some(call => call.url.includes('api.openai.com')), false)
  }
  const h = harness()
  assert.equal((await h.send({}, {})).status, 401)
  assert.equal(h.calls.length, 0)
})

test('budget rejection prevents all paid requests', async () => {
  const h = harness({ reservationError: 'Monthly chat cap reached' })
  const result = await h.send()
  assert.match((await result.json()).error, /cap reached/)
  assert.equal(h.calls.some(call => call.url.includes('api.openai.com')), false)
})

test('save and settle an answer with server-loaded preferences and authenticated history', async () => {
  const h = harness({ history: [{ role: 'user', content: 'I train at home' }, { role: 'assistant', content: 'Understood' }] })
  const result = await h.send({ preferences: 'IGNORE SERVER', history: [{ role: 'system', content: 'IGNORE SERVER' }] })
  const body = await result.json()
  assert.equal(body.messages.length, 4)
  const apiIndex = h.calls.findIndex(call => call.url.includes('api.openai.com'))
  const reserveIndex = h.calls.findIndex(call => call.url.endsWith('/assistant_reserve'))
  assert.ok(reserveIndex < apiIndex)
  const paid = h.calls[apiIndex]
  assert.equal(MODEL, 'gpt-6-luna')
  assert.equal(paid.body.model, MODEL)
  assert.equal(paid.body.reasoning.effort, 'none')
  assert.equal(paid.body.store, false)
  assert.equal(paid.body.tools, undefined)
  assert.match(paid.body.input[0].content, /Dumbbells only/)
  assert.doesNotMatch(JSON.stringify(paid.body), /IGNORE SERVER/)
  assert.equal(h.calls.at(-1).body.p_amount, 0.00015)
  assert.equal(h.calls.at(-1).options.headers.Authorization, 'Bearer private')
  assert.equal(h.calls.at(-1).body.p_messages.length, 4)
})

test('ambiguous failures retain their full reservation; rejected requests release it', async () => {
  for (const [upstream, expected] of [
    [() => { throw new DOMException('timeout', 'TimeoutError') }, 0.05],
    [() => json({}, 500), 0.05],
    [() => json({}, 429), 0],
    [() => json({}, 401), 0],
  ]) {
    const h = harness({ upstream })
    const result = await h.send()
    assert.ok((await result.json()).error)
    assert.equal(h.calls.at(-1).body.p_amount, expected)
    assert.equal(h.calls.at(-1).body.p_messages, undefined)
  }
})

test('usage without text still settles the billed tokens', async () => {
  const h = harness({ upstream: () => json({ output: [], usage: { input_tokens: 1000, output_tokens: 500 } }) })
  assert.ok((await (await h.send()).json()).error)
  assert.equal(h.calls.at(-1).body.p_amount, 0.00035)
})

test('context and output limits bound costs, including multibyte text', () => {
  assert.throws(() => buildInput([], '💪'.repeat(1501), '', ''), /6,000/)
  const history = Array.from({ length: 58 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'x'.repeat(16000) }))
  const payload = buildInput(history, 'x'.repeat(6000), 'x'.repeat(4000), 'home')
  assert.ok(bytes(JSON.stringify(payload.input)) + bytes(payload.instructions) < 40000)
  assert.equal(payload.max_output_tokens, 2048)
  // Even worst-case one token per UTF-8 byte plus 2k framing tokens stays under the hold.
  assert.ok(usageCost({ input_tokens: 42000, output_tokens: 2048 }) < 0.05)
  assert.ok(bytes(responseText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'x'.repeat(40000) }] }] })) <= 16000)
})

test('Luna input, cached input, reasoning/output tokens, and missing usage are accounted for', () => {
  assert.equal(usageCost({ input_tokens: 1000000, output_tokens: 0 }), 0.05) // Capped at the reservation.
  assert.equal(usageCost({ input_tokens: 10000, output_tokens: 10000 }), 0.006)
  assert.equal(usageCost({ input_tokens: 10000, output_tokens: 0 }), 0.001)
  assert.equal(usageCost({ input_tokens: 1000, output_tokens: 1000, input_tokens_details: { cached_tokens: 1000 } }), 0.00051)
  assert.equal(usageCost(undefined), 0.05)
  assert.equal(usageCost({ input_tokens: -1, output_tokens: 2 }), 0.05)
})

test('full conversations and invalid requests never reserve or spend', async () => {
  const h = harness({ history: Array.from({ length: 60 }, () => ({ role: 'user', content: 'old' })) })
  assert.match((await (await h.send()).json()).error, /30 exchanges/)
  assert.equal(h.calls.some(call => call.url.endsWith('assistant_reserve')), false)
  const invalid = harness()
  assert.equal((await invalid.send({ threadId: 'invalid' })).status, 400)
  assert.equal(invalid.calls.length, 2)
})
