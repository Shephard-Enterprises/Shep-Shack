import assert from 'node:assert/strict'
import test from 'node:test'
import { isRecordedPour, isConfirmedPour } from './keg-pour-policy.js'

test('ignores drift-sized events from older firmware', () => {
  for (const ounces of [0, 2.5, 3, 3.4, 4.9]) assert.equal(isRecordedPour(ounces), false)
})

const eventTime = Date.parse('2026-11-12T18:00:00Z')
const pour = { scale_id: 'beer', poured_at: new Date(eventTime).toISOString(), ounces: 16, beer_oz_after: 384 }
function reading(seconds, level, scale = 'beer') {
  return { scale_id: scale, recorded_at: new Date(eventTime + seconds * 1000).toISOString(), payload: { ready: true, beerOz: level } }
}
const baseline = [-180, -120, -60].map(seconds => reading(seconds, 400))
const settled = [60, 120, 180].map(seconds => reading(seconds, 384))

test('confirms a sustained pour despite small measurement variation', () => {
  assert.equal(isConfirmedPour(pour, [...baseline, ...settled, reading(210, 385)]), true)
})

test('requires three independent minutes of stable follow-up readings', () => {
  assert.equal(isConfirmedPour(pour, [...baseline, reading(0, 384), reading(59, 384)]), false)
  assert.equal(isConfirmedPour(pour, [...baseline, reading(60, 385)]), false)
  assert.equal(isConfirmedPour(pour, [...baseline, reading(60, 385), reading(120, 384)]), false)
  assert.equal(isConfirmedPour(pour, [...baseline, ...settled]), true)
})

test('rejects rebound observed within the first minute', () => {
  assert.equal(isConfirmedPour(pour, [...baseline, reading(60, 395)]), false)
  assert.equal(isConfirmedPour(pour, [...baseline, reading(30, 400), reading(60, 384)]), false)
})

test('rejects a swaying dip that returns toward the original weight', () => {
  assert.equal(isConfirmedPour(pour, [...baseline, reading(60, 384), reading(120, 395), reading(180, 400)]), false)
})

test('rejects an elevated starting weight unsupported by earlier readings', () => {
  assert.equal(isConfirmedPour({ ...pour, beer_oz_after: 400 }, [...baseline, ...[60, 120, 180].map(seconds => reading(seconds, 400))]), false)
})

test('waits for independent readings, ignoring the event upload and other scales', () => {
  for (const readings of [
    [...baseline, reading(0, 384)],
    [...baseline, reading(30, 384), reading(31, 384), reading(32, 384)],
    [...baseline, ...settled.map(row => ({ ...row, scale_id: 'sparkling-water' }))],
    [...baseline.slice(1), ...settled],
    [...baseline, ...settled.map(row => ({ ...row, payload: { ready: false, beerOz: 384 } }))],
  ]) assert.equal(isConfirmedPour(pour, readings), false)
})

test('fails closed on missing levels and refill readings', () => {
  assert.equal(isConfirmedPour({ ...pour, beer_oz_after: null }, [...baseline, ...settled]), false)
  assert.equal(isConfirmedPour(pour, [...baseline, ...settled.map(row => ({ ...row, payload: { ...row.payload, eventType: 'freshKeg' } }))]), false)
})

test('keeps normal pours and rejects invalid amounts', () => {
  for (const ounces of [5, 8, 12, 16, 32, 64]) assert.equal(isRecordedPour(ounces), true)
  for (const ounces of [-1, 65, NaN, Infinity, undefined, null]) assert.equal(isRecordedPour(ounces), false)
})

test('regression: November 12 false Beer pour keeps drifting downward after the event', () => {
  const time = Date.parse('2026-11-13T03:07:45.891468Z')
  const event = { scale_id: 'beer', poured_at: new Date(time).toISOString(), ounces: 5.9, beer_oz_after: 237 }
  const samples = [
    ['2026-11-13T03:05:02.826227Z', 243],
    ['2026-11-13T03:06:02.866351Z', 242],
    ['2026-11-13T03:07:02.855613Z', 243],
    ['2026-11-13T03:07:45.641338Z', 237],
    ['2026-11-13T03:08:46.503876Z', 234],
    ['2026-11-13T03:09:46.908156Z', 233],
    ['2026-11-13T03:10:18.291498Z', 232],
    ['2026-11-13T03:11:18.637505Z', 231],
  ].map(([recorded_at, beerOz]) => ({ scale_id: 'beer', recorded_at, payload: { ready: true, beerOz } }))
  assert.equal(isConfirmedPour(event, samples.slice(0, 5)), false)
  assert.equal(isConfirmedPour(event, samples), false)
})

test('rejects a slow decline, unstable starting weight, and late continued decline', () => {
  for (const samples of [
    [...baseline, reading(60, 383), reading(120, 382), reading(180, 381)],
    [reading(-180, 406), reading(-120, 400), reading(-60, 400), ...settled],
    [...baseline, ...settled, reading(230, 380)],
  ]) assert.equal(isConfirmedPour(pour, samples), false)
})

test('duplicates, event uploads, and a missing minute do not confirm a pour', () => {
  for (const samples of [
    [...baseline, reading(60, 384), reading(61, 384), reading(180, 384)],
    [...baseline, reading(60, 384), reading(120, 384), { ...reading(180, 384), payload: { ready: true, beerOz: 384, eventType: 'pour' } }],
    [...baseline, reading(30, 384), reading(90, 384), reading(200, 384)],
  ]) assert.equal(isConfirmedPour(pour, samples), false)
})

test('a reboot, sensor interruption, or refill invalidates confirmation', () => {
  const withUptime = [...baseline, ...settled].map((row, i) => ({ ...row, payload: { ...row.payload, lastUpdateMs: i === 4 ? 100 : (i + 1) * 60000 } }))
  assert.equal(isConfirmedPour(pour, withUptime), false)
  assert.equal(isConfirmedPour(pour, [...baseline, ...settled, { ...reading(100, 384), payload: { ready: false, beerOz: 384 } }]), false)
  assert.equal(isConfirmedPour(pour, [...baseline, ...settled, { ...reading(0, 384), payload: { ready: true, beerOz: 384, eventType: 'freshKeg' } }]), false)
})

test('matching initial event is allowed but cannot count as independent confirmation', () => {
  const event = { ...reading(0, 384), payload: { ready: true, beerOz: 384, eventType: 'pour' } }
  assert.equal(isConfirmedPour(pour, [...baseline, event, ...settled]), true)
  assert.equal(isConfirmedPour(pour, [...baseline, event, reading(60, 384), reading(120, 384)]), false)
})
