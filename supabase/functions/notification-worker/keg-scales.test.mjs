import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const originalDeno = globalThis.Deno
const originalFetch = globalThis.fetch
globalThis.Deno = { env: { get: name => name === 'SUPABASE_URL' ? 'https://backend.test' : 'test-only' }, serve: () => {} }
let code = await readFile(new URL('./index.ts', import.meta.url), 'utf8')
code = code.replace("import webpush from 'npm:web-push@3.6.7'", 'const webpush = {}')
code = code.replace('../_shared/keg-pour-policy.js', new URL('../_shared/keg-pour-policy.js', import.meta.url).href)
const worker = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(code) + '\nexport { collectKeg, collectKegPours, collectKegChanges }').toString('base64')}`)
test.after(() => { globalThis.Deno = originalDeno; globalThis.fetch = originalFetch })
const now = new Date().toISOString()
const before = new Date(Date.now() - 60_000).toISOString()
function mockRest(callback) {
  globalThis.fetch = async raw => {
    const url = new URL(raw)
    return new Response(JSON.stringify(callback(url.pathname.split('/').at(-1), url.searchParams)))
  }
}
test('each scale uses its own refill baseline and alert destination', async () => {
  mockRest((table, params) => {
    const water = params.get('scale_id') === 'eq.sparkling-water'
    return table === 'keg_scale_readings'
      ? [{ recorded_at: now, payload: { percent: water ? 10 : 25 } }]
      : [{ id: water ? 2 : 1, changed_at: before, starting_percent: water ? 100 : 50 }]
  })
  const notices = await worker.collectKeg()
  assert.equal(notices.length, 1)
  assert.match(notices[0].title, /Sparkling Water/)
  assert.equal(notices[0].url, '/?page=keg&scale=sparkling-water')
})
test('fresh water does not hide an offline beer scale', async () => {
  mockRest((table, params) => table === 'keg_scale_changes' ? [] : [{
    recorded_at: params.get('scale_id') === 'eq.beer' ? new Date(Date.now() - 20 * 60_000).toISOString() : now,
    payload: { percent: 80 },
  }])
  const notices = await worker.collectKeg()
  assert.equal(notices.length, 1)
  assert.match(notices[0].title, /Beer keg sensor is offline/)
})
test('pour and refill notifications identify water separately from beer', async () => {
  const eventTime = Date.now() - 180_000
  mockRest(table => table === 'keg_scale_readings'
    ? ['beer', 'sparkling-water'].flatMap(scale_id => [-180, -120, -60, 60, 120, 180].map(seconds => ({
      scale_id, recorded_at: new Date(eventTime + seconds * 1000).toISOString(),
      payload: { ready: true, beerOz: seconds < 0 ? 400 : 384 },
    })))
    : ['beer', 'sparkling-water'].map((scale_id, id) => ({ id, scale_id, ounces: 16, beer_oz_after: 384, poured_at: new Date(eventTime).toISOString() })))
  assert.deepEqual((await worker.collectKegPours()).map(row => row.title), ['Beer poured', 'Sparkling water poured'])
  assert.deepEqual((await worker.collectKegChanges()).map(row => row.url), ['/?page=keg&scale=beer', '/?page=keg&scale=sparkling-water'])
})

test('does not issue a pour notification when the weight rebounds', async () => {
  const eventTime = Date.now() - 3 * 60_000
  mockRest(table => table === 'keg_scale_readings'
    ? [-180, -120, -60, 60, 120, 180].map(seconds => ({ scale_id: 'beer', recorded_at: new Date(eventTime + seconds * 1000).toISOString(), payload: { ready: true, beerOz: seconds === 60 ? 384 : 400 } }))
    : [{ id: 1, scale_id: 'beer', ounces: 16, beer_oz_after: 384, poured_at: new Date(eventTime).toISOString() }])
  assert.deepEqual(await worker.collectKegPours(), [])
})
