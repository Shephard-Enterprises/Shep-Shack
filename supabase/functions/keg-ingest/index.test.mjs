import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { resolveScaleId } from '../_shared/keg-scale-policy.js'

let handler
const originalFetch = globalThis.fetch
const originalDeno = globalThis.Deno
globalThis.Deno = {
  env: { get: name => ({ KEG_INGEST_SECRET: 'test-only', SUPABASE_URL: 'https://backend.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key' })[name] },
  serve: callback => { handler = callback },
}
let code = stripTypeScriptTypes(await readFile(new URL('./index.ts', import.meta.url), 'utf8'))
for (const filename of ['keg-scale-policy.js', 'keg-pour-policy.js']) {
  code = code.replace(`../_shared/${filename}`, new URL(`../_shared/${filename}`, import.meta.url).href)
}
await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
test.after(() => { globalThis.fetch = originalFetch; globalThis.Deno = originalDeno })

async function upload(payload, secret = 'test-only') {
  const writes = []
  globalThis.fetch = async (url, init) => {
    writes.push({ table: new URL(url).pathname.split('/').at(-1), body: JSON.parse(init.body) })
    return new Response(JSON.stringify(writes.length === 1 ? [{ id: 101 }] : null), { status: 201 })
  }
  const response = await handler(new Request('https://ingest.test', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-keg-secret': secret }, body: JSON.stringify(payload),
  }))
  return { response, writes }
}

test('legacy names resolve; permanent identity survives a beverage rename', () => {
  assert.equal(resolveScaleId({ kegName: 'Shep Shack Tap' }), 'beer')
  assert.equal(resolveScaleId({ kegName: ' Sparkling Water ' }), 'sparkling-water')
  assert.equal(resolveScaleId({ scaleId: 'sparkling-water', kegName: 'Lemon water' }), 'sparkling-water')
  assert.equal(resolveScaleId({ scaleId: 'unknown' }), null)
})
for (const [name, payload, id] of [
  ['legacy beer', { kegName: 'Shep Shack Tap' }, 'beer'],
  ['legacy water', { kegName: 'Sparkling Water' }, 'sparkling-water'],
  ['identified water', { kegName: 'Lemon water', scaleId: 'sparkling-water' }, 'sparkling-water'],
]) {
  test(`${name}: reading and pour stay on the same scale`, async () => {
    const { response, writes } = await upload({ ...payload, beerOz: 0, pourOz: 16 })
    assert.equal(response.status, 201)
    assert.deepEqual(writes.map(write => write.table), ['keg_scale_readings', 'keg_scale_pours'])
    assert.equal(writes[0].body.scale_id, id)
    assert.equal(writes[0].body.payload.scaleId, id)
    assert.equal(writes[1].body.scale_id, id)
    assert.equal(writes[1].body.reading_id, 101)
    assert.equal(writes[1].body.beer_oz_after, 0)
  })
}
test('water refill is separate from beer refill', async () => {
  const { response, writes } = await upload({ scaleId: 'sparkling-water', eventType: 'freshKeg', beerOz: 640, percent: 100 })
  assert.equal(response.status, 201)
  assert.equal(writes[1].table, 'keg_scale_changes')
  assert.equal(writes[1].body.scale_id, 'sparkling-water')
  assert.equal(writes[1].body.starting_ounces, 640)
})
test('bad credentials, unknown scales and arrays cannot write readings', async () => {
  for (const [payload, secret, status] of [[{}, 'wrong', 401], [{ scaleId: 'unknown' }, 'test-only', 400], [[], 'test-only', 400]]) {
    const { response, writes } = await upload(payload, secret)
    assert.equal(response.status, status)
    assert.equal(writes.length, 0)
  }
})
