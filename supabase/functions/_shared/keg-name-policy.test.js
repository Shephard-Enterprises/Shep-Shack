import test from 'node:test'
import assert from 'node:assert/strict'
import { validKegName } from './keg-name-policy.js'

test('display-safe names accept punctuation and the full 32-character boundary', () => {
  for (const value of ['House IPA', '"West Coast" IPA', 'Beer \\ Batch 2', 'A'.repeat(32)]) {
    assert.equal(validKegName(value), true, value)
  }
})
test('rejects empty, untrimmed, oversized, control and unsupported font characters', () => {
  for (const value of ['', ' ', ' IPA', 'IPA ', 'A'.repeat(33), 'IPA\n', 'Bad\rheader', 'Bad\tname', 'Café', null]) {
    assert.equal(validKegName(value), false, String(value))
  }
})
