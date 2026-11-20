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


test('routine edits and cross-profile follow-ups retain context across multiple turns', () => {
  const history = [{ role: 'user', content: 'Write a workout' }, { role: 'assistant', content: 'Saved your plan', workoutId: 'saved-routine' }, { role: 'user', content: 'Make it easier' }, { role: 'assistant', content: 'Updated' }]
  for (const message of ['Do the same for Rosy', 'Do that for Justin', 'Swap rows for pulldowns', 'Add another round', 'Copy it to Rosy', 'For Rosy']) assert.equal(needsFitnessContext(message, 'home', history), true, message)
  assert.equal(needsFitnessContext('Do the same for Rosy', 'home', []), false)
  assert.equal(needsFitnessContext('And the weather?', 'home', history, ['weather']), false)
})
