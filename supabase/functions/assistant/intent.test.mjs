import test from 'node:test'
import assert from 'node:assert/strict'
import { needsFitnessContext } from '../_shared/assistant-intent.mjs'

test('dashboard and everyday questions skip fitness despite a selected profile', () => {
  assert.equal(needsFitnessContext('Will it rain?', 'fitness', [], ['weather']), false)
  assert.equal(needsFitnessContext('Tell me a joke', 'home'), false)
  assert.equal(needsFitnessContext('How much beer is left?', 'keg', [], ['taps']), false)
})
test('workout requests and follow-ups retain relevant training context', () => {
  assert.equal(needsFitnessContext('Write a workout', 'weather', [], ['weather']), true)
  assert.equal(needsFitnessContext('How am I doing?', 'fitness'), true)
  assert.equal(needsFitnessContext('Make it easier', 'home', [{ role: 'user', content: 'Write a workout' }]), true)
  assert.equal(needsFitnessContext('And tomorrow?', 'home', [{ role: 'user', content: 'Will it rain?' }], ['weather']), false)
})
