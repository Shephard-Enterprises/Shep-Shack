import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_MOVEMENTS, linkExercises, movementIdentity, resolveMovement, searchMovements } from '../supabase/functions/_shared/movement-library.mjs'
import { createSession, exerciseProgress } from './fitness-model.mjs'
import { parseFitnessAnswer } from '../supabase/functions/assistant/fitness.mjs'
const exercise = (name, movement_id) => ({ id: crypto.randomUUID(), name, movement_id, mode: 'reps', reps: '8–12', rest: 60, sets: 2 })
function routine(name, exercises) { return { id: crypto.randomUUID(), name, unit: 'lb', notes: '', exercises } }
function logged(plan, weight, date) {
  const session = createSession(plan)
  return { ...session, status: 'completed', performed_on: date, exercises: session.exercises.map(item => ({ ...item, sets: [{ id: crypto.randomUUID(), weight, reps: 10, done: true }] })) }
}

test('curl search offers real variations; aliases resolve, generic curls never silently merge', () => {
  assert.ok(searchMovements('curls').some(item => item.id === 'dumbbell-curl'))
  assert.ok(searchMovements('curls').some(item => item.id === 'barbell-curl'))
  assert.equal(resolveMovement('  DB   CURLS ').id, 'dumbbell-curl')
  assert.equal(resolveMovement('curls'), null)
  assert.equal(resolveMovement('hammer curl').id, 'hammer-curl')
  assert.throws(() => linkExercises([exercise('Curls')]), /specific movement/)
  assert.equal(new Set(BUILTIN_MOVEMENTS.map(item => item.id)).size, BUILTIN_MOVEMENTS.length)
})
test('manual and Patty curls share one progress history; barbell curls stay separate', () => {
  const manual = routine('My arm workout', linkExercises([exercise('DB curls')]))
  const ai = parseFitnessAnswer({}, JSON.stringify({ reply: 'Here is your workout.', workout: routine('Patty arms', [exercise('Dumbbell curl', 'dumbbell-curl')]) })).workout
  const sessions = [logged(manual, 20, '2026-01-01'), logged(ai, 25, '2026-01-02'), logged(routine('Barbell day', linkExercises([exercise('Barbell curl')])), 60, '2026-01-03')]
  const points = exerciseProgress(sessions, 'dumbbell-curl')
  assert.equal(points.length, 2)
  assert.deepEqual(points.map(point => point.weight), [20, 25])
  assert.equal(exerciseProgress(sessions, 'barbell-curl')[0].weight, 60)
})
test('a different routine reuses the last weight for the same movement', () => {
  const manual = routine('Manual day', linkExercises([exercise('DB curls')]))
  const old = logged(manual, 25, '2026-01-01')
  const ai = routine('Entirely new plan', linkExercises([exercise('Dumbbell curls')]))
  const next = createSession(ai, [old])
  assert.notEqual(next.routine_id, old.routine_id)
  assert.equal(next.exercises[0].sets[0].weight, 25)
  assert.equal(next.exercises[0].sets[0].done, false)
  assert.equal(next.exercises[0].movement_id, 'dumbbell-curl')
})
test('custom movements have stable IDs and legacy modes are not misclassified', () => {
  const custom = { id: 'custom-a', name: 'My band curl', mode: 'reps', aliases: [], category: 'Custom', equipment: 'Other' }
  const library = [...BUILTIN_MOVEMENTS, custom]
  const linked = linkExercises([exercise('My band curl')], library)
  assert.equal(linked[0].movement_id, 'custom-a')
  const old = logged(routine('Old', [exercise('My band curl')]), 10, '2026-01-01')
  const next = createSession(routine('New', linked), [old], undefined, library)
  assert.equal(next.exercises[0].sets[0].weight, 10)
  assert.equal(exerciseProgress([old], 'custom-a', 'lb', library).length, 1)
  assert.equal(movementIdentity({ name: 'Plank', mode: 'reps' }), 'legacy:plank')
  assert.equal(movementIdentity({ name: 'Plank', mode: 'timed' }), 'plank')
  assert.throws(() => linkExercises([exercise('Dumbbell curl', 'nonexistent')]), /specific movement/)
})
