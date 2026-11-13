import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timerCue } from './timer-audio.mjs'
const sample = { running: true, complete: false, phase: 'work1', type: 'work', remaining: 4, at: 1000 }
test('countdown ticks once for each final second and stays silent for ordinary ticks', () => {
  for (const remaining of [3, 2, 1]) {
    const next = { ...sample, remaining, at: 1200 }
    assert.equal(timerCue({ ...sample, remaining: remaining + 1 }, next), 'tick')
    assert.equal(timerCue(next, { ...next, at: 1400 }), null)
  }
  assert.equal(timerCue(sample, { ...sample, remaining: 8 }), null)
})
test('work, rest, and completion have distinct cues', () => {
  assert.equal(timerCue(sample, { ...sample, phase: 'rest1', type: 'rest', remaining: 10, at: 1200 }), 'rest')
  assert.equal(timerCue({ ...sample, type: 'rest' }, { ...sample, phase: 'work2', at: 1200 }), 'work')
  assert.equal(timerCue(sample, { ...sample, running: false, complete: true, remaining: 0, at: 1200 }), 'complete')
})
test('mounts, pauses, resets, and background catch-up do not replay alerts', () => {
  assert.equal(timerCue(null, sample), null)
  assert.equal(timerCue(sample, { ...sample, running: false, at: 1200 }), null)
  assert.equal(timerCue(sample, { ...sample, running: false, complete: false, remaining: 30, at: 1200 }), null)
  assert.equal(timerCue(sample, { ...sample, complete: true, running: false, at: 10000 }), null)
  assert.equal(timerCue({ ...sample, running: false }, { ...sample, phase: 'work2', at: 1200 }), null)
})
