import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convertWeight, createSession, exerciseKey, exerciseProgress, normalizeSession, parseRoutineText, totalVolume, validateRoutine } from './fitness-model.mjs'
const routine = { id: crypto.randomUUID(), name: 'Upper A', unit: 'lb', notes: '', exercises: [{ id: 'bench', name: 'Bench Press', sets: 2, reps: '8–12', rest: 90 }] }
function done(weight, reps) { return { id: crypto.randomUUID(), weight, reps, done: true } }
function session(unit = 'lb') { return { ...createSession(routine), status: 'completed', unit, performed_on: '2026-01-01', exercises: [{ id: 'bench', name: ' Bench   Press ', sets: [done(100, 8), done(110, 6)] }] } }

test('routine paste preserves rep ranges and rejects malformed or excessive plans', () => {
  const exercises = parseRoutineText('Bench press | 3 | 8–12 | 90\nSeated row | 4 | 10')
  assert.equal(exercises[0].reps, '8–12'); assert.equal(exercises[1].rest, 90)
  assert.throws(() => parseRoutineText('Bench press 3x10'), /Line 1/)
  assert.throws(() => parseRoutineText('Squat | 13 | 10 | 90'), /1–12/)
  assert.throws(() => parseRoutineText('Squat | 3 | 10 | 90 | unexpected'), /Line 1/)
  assert.throws(() => validateRoutine({ ...routine, name: ' ' }), /name/)
})
test('new workout uses prior weights across units without checking off old work', () => {
  const next = createSession({ ...routine, unit: 'kg' }, session('kg'))
  assert.equal(next.unit, 'lb')
  assert.equal(next.exercises[0].sets[0].weight, 220.46)
  assert.equal(next.exercises[0].sets[0].reps, '')
  assert.equal(next.exercises[0].sets[0].done, false)
})
test('completion allows zero or partial sets, validates checked sets, and ignores unfinished sets in totals', () => {
  const draft = createSession(routine)
  const empty = normalizeSession(draft, true)
  assert.equal(empty.status, 'completed')
  assert.ok(empty.completed_at)
  assert.ok(empty.exercises[0].sets.every(set => !set.done))
  assert.equal(totalVolume(empty), 0)
  assert.deepEqual(exerciseProgress([empty], 'legacy:bench press'), [])
  draft.exercises[0].sets = [done(0, 15), { ...done(100, 10), done: false }]
  assert.equal(normalizeSession(draft, true).status, 'completed')
  assert.equal(totalVolume(draft), 0)
  draft.exercises[0].sets[0].reps = ''
  assert.throws(() => normalizeSession(draft, true), /before marking/)
  draft.exercises[0].sets[0] = done(50, 2.5)
  assert.throws(() => normalizeSession(draft), /whole reps/)
})
test('progress combines matching movement names and units, only for completed sessions', () => {
  const first = session('lb'), second = { ...session('kg'), id: crypto.randomUUID(), performed_on: '2026-01-02' }
  const points = exerciseProgress([second, { ...first, status: 'draft' }, first], exerciseKey('Bench Press'), 'lb')
  assert.equal(points.length, 2); assert.equal(points[0].weight, 110)
  assert.equal(points[0].volume, 1460)
  assert.equal(points[1].weight, 242.51)
  assert.ok(Math.abs(convertWeight(convertWeight(100, 'lb', 'kg'), 'kg', 'lb') - 100) < 0.0001)
})
test('cardio saves separately with optional distance and validates calendar dates', () => {
  const cardio = { ...createSession(routine), kind: 'cardio', name: 'Run', minutes: '30', distance: '', distance_unit: 'mi', exercises: [] }
  const saved = normalizeSession(cardio, true)
  assert.equal(saved.minutes, 30); assert.equal(saved.distance, null); assert.deepEqual(saved.exercises, [])
  assert.throws(() => normalizeSession({ ...cardio, minutes: 0 }, true), /duration/)
  assert.throws(() => normalizeSession({ ...cardio, performed_on: '2026-02-30' }, true), /valid workout date/)
})

test('timed routines save countdown targets and completed time independently from lifting reps', () => {
  const timed = validateRoutine({ ...routine, exercises: [{ id: 'plank', name: 'Plank', mode: 'timed', seconds: 45, reps: '', sets: 2, rest: 30 }] })
  const workout = createSession(timed)
  assert.equal(workout.exercises[0].target_seconds, 45)
  assert.equal(workout.exercises[0].mode, 'timed')
  workout.exercises[0].sets[0] = { id: 'hold1', weight: '', reps: '', seconds: '', done: true }
  assert.throws(() => normalizeSession(workout, true), /seconds completed/)
  workout.exercises[0].sets[0].seconds = 40
  workout.exercises[0].sets[0].timer = { duration: 45, remaining: 5 }
  const saved = normalizeSession(workout, true)
  assert.equal(saved.exercises[0].sets[0].weight, null)
  assert.equal(saved.exercises[0].sets[0].reps, null)
  assert.equal(saved.exercises[0].sets[0].timer, undefined)
  assert.equal(totalVolume(saved), 0)
  const points = exerciseProgress([saved], 'plank')
  assert.equal(points[0].seconds, 40)
  assert.equal(points[0].duration, 40)
  assert.equal(parseRoutineText('Plank | 3 | 45s | 30')[0].mode, 'timed')
  assert.throws(() => validateRoutine({ ...timed, exercises: [{ ...timed.exercises[0], seconds: 0 }] }), /1–7,200/)
})

test('countdowns use absolute time, resume from pauses, and never count below zero', async () => {
  const { timerRemaining } = await import('./fitness-model.mjs')
  const timer = { duration: 45, endAt: 55000, remaining: 45 }
  assert.equal(timerRemaining(timer, 10000), 45)
  assert.equal(timerRemaining(timer, 20500), 35)
  assert.equal(timerRemaining(timer, 80000), 0)
  assert.equal(timerRemaining({ ...timer, endAt: null, remaining: 12 }, 100000), 12)
})
