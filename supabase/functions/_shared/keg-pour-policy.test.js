import assert from 'node:assert/strict'
import test from 'node:test'
import { isRecordedPour } from './keg-pour-policy.js'

test('ignores drift-sized events from older firmware', () => {
  for (const ounces of [0, 2.5, 3, 3.4, 4.9]) assert.equal(isRecordedPour(ounces), false)
})

test('keeps normal pours and rejects invalid amounts', () => {
  for (const ounces of [5, 8, 12, 16, 32, 64]) assert.equal(isRecordedPour(ounces), true)
  for (const ounces of [-1, 65, NaN, Infinity, undefined, null]) assert.equal(isRecordedPour(ounces), false)
})
