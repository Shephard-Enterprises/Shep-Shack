import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdhocSession } from './fitness-model.mjs'
import { beginWorkoutSession, isTimedWorkout } from './workout-session.mjs'
import { resolveWorkoutTimer, workoutPhases } from './workout-timer.mjs'
const plan = { name: 'Today', unit: 'lb', timer_order: 'sets', exercises: [{ id: 'curl', name: 'Dumbbell curl', movement_id: 'dumbbell-curl', mode: 'reps', reps: '8–12', sets: 2, rest: 90 }] }
test('a prepared workout waits for Start; ordinary rep rest does not open a timer', () => {
  const ready = createAdhocSession(plan)
  assert.equal(ready.execution_started_at, null)
  assert.equal(ready.timer_state, null)
  assert.equal(isTimedWorkout(ready), false)
  const started = beginWorkoutSession(ready, 1000)
  assert.equal(started.execution_started_at, '1970-01-01T00:00:01.000Z')
  assert.equal(started.timer_state, null)
  assert.ok(started.exercises.every(exercise => exercise.sets.every(set => !set.done)))
  assert.equal(beginWorkoutSession(started, 9000), started)
})
test('legacy or Patty-provided work windows never open a rep workout timer', () => {
  const ready = createAdhocSession({ ...plan, exercises: [{ ...plan.exercises[0], work_seconds: 30 }] })
  assert.equal(isTimedWorkout(ready), false)
  const started = beginWorkoutSession(ready, 1000)
  assert.equal(started.timer_state, null)
  assert.ok(workoutPhases(started).filter(phase => phase.type === 'work').every(phase => phase.seconds === null))
})
test('Start automatically runs explicitly timed workouts without logging results', () => {
  const ready = createAdhocSession({ ...plan, exercises: [{ ...plan.exercises[0], mode: 'timed', seconds: 30 }] })
  assert.equal(isTimedWorkout(ready), true)
  const started = beginWorkoutSession(ready, 1000)
  assert.equal(started.timer_state.status, 'running')
  assert.equal(resolveWorkoutTimer(started.timer_state, workoutPhases(started), 6000).phaseElapsedMs, 5000)
  assert.ok(started.exercises[0].sets.every(set => !set.done))
  assert.equal(ready.timer_state, null)
})
