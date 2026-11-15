import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftSync } from './draft-sync.mjs'
const draft = { id: 'workout', updated_at: 'v1', reps: 8 }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('edits made during a cloud save survive and use the returned version', async () => {
  const first = deferred(), writes = [], acknowledgements = []
  const sync = createDraftSync({ delayMs: 60000, save: async value => {
    writes.push(value)
    if (writes.length === 1) await first.promise
    return { ...value, updated_at: `v${writes.length + 1}` }
  }, onSaved: value => acknowledgements.push(value) })
  sync.queue(draft)
  const saving = sync.flush()
  sync.queue({ ...draft, reps: 12 })
  const finishing = sync.flush()
  first.resolve()
  const latest = await finishing
  await saving
  assert.deepEqual(writes.map(value => [value.reps, value.updated_at]), [[8, 'v1'], [12, 'v2']])
  assert.equal(latest.reps, 12)
  assert.equal(latest.updated_at, 'v3')
  assert.deepEqual(acknowledgements.map(value => value.clean), [false, true])
})

test('multiple quick edits produce one debounced cloud write', async () => {
  const saved = deferred(), writes = []
  const sync = createDraftSync({ delayMs: 5, save: async value => { writes.push(value); saved.resolve(); return value } })
  for (const reps of [1, 10, 12]) sync.queue({ ...draft, reps })
  await saved.promise
  await sync.flush()
  assert.deepEqual(writes.map(value => value.reps), [12])
})

test('offline changes can retry without losing their values', async () => {
  let online = false
  const writes = [], states = []
  const sync = createDraftSync({ online: () => online, delayMs: 60000, onState: value => states.push(value), save: async value => { writes.push(value); return value } })
  sync.queue({ ...draft, reps: 15 })
  await assert.rejects(sync.flush(), /offline/)
  assert.equal(writes.length, 0)
  online = true
  assert.equal((await sync.flush()).reps, 15)
  assert.equal(states.at(-1), 'saved')
})

test('a version conflict blocks retries instead of overwriting another device', async () => {
  let writes = 0
  const sync = createDraftSync({ delayMs: 60000, save: async () => { writes++; const error = new Error('conflict'); error.code = 'FITNESS_CONFLICT'; throw error } })
  sync.queue(draft)
  await assert.rejects(sync.flush(), /conflict/)
  sync.queue({ ...draft, reps: 14 })
  await assert.rejects(sync.flush(), /another device/)
  assert.equal(writes, 1)
})

test('finishing or discarding clears the old session before another workout', async () => {
  const sync = createDraftSync({ delayMs: 60000, save: async value => ({ ...value, updated_at: 'saved' }) })
  sync.queue(draft)
  await sync.flush()
  sync.reset()
  assert.equal(await sync.flush(), null)
  sync.queue({ id: 'next-workout', updated_at: 'next-v1', reps: 10 })
  assert.equal((await sync.flush()).id, 'next-workout')
})
