import test from 'node:test'
import assert from 'node:assert/strict'
import { nextGameLabel, orderSportsTeams } from './sports-team-model.js'
const now = Date.parse('2026-11-12T20:00:00Z')

test('far-future games include the year; TBD games do not get a false countdown', () => {
  assert.match(nextGameLabel({ date: '2027-03-10T20:00:00Z' }, now), /2027/)
  assert.match(nextGameLabel({ date: '2026-11-12T20:30:00Z', timeTbd: true }, now), /Time TBD/)
  assert.equal(nextGameLabel({ date: '2026-11-12T20:30:00Z' }, now), 'In 30 min')
  assert.equal(nextGameLabel(null, now), 'No upcoming games in feed')
  assert.equal(nextGameLabel({ dateLabel: 'Fri, Nov 13 · 7 PM' }, now), 'Fri, Nov 13 · 7 PM')
})
test('sports prioritizes live and imminent games without mutating Home order', () => {
  const rows = [{ key: 'offseason', gameDate: '2026-11-11' }, { key: 'next', next: { date: '2026-11-13T20:00:00Z' } }, { key: 'live', isLive: true }, { key: 'gulls', next: { dateLabel: 'Fri, Nov 13' } }]
  assert.deepEqual(orderSportsTeams(rows, now).map(row => row.key), ['live', 'next', 'gulls', 'offseason'])
  assert.deepEqual(rows.map(row => row.key), ['offseason', 'next', 'live', 'gulls'])
})
