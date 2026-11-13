import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshWorkoutTimer, nextWorkoutPhase, pauseWorkoutTimer, resolveWorkoutTimer, startWorkoutTimer, workoutPhases } from './workout-timer.mjs'
import { createAdhocSession, normalizeSession } from './fitness-model.mjs'
const plan = { id: 'plan', name: 'Just today', unit: 'lb', notes: '', timer_order: 'sets', exercises: [
  { id: 'plank', movement_id: 'plank', name: 'Plank', mode: 'timed', seconds: 30, sets: 2, reps: '', rest: 10 },
  { id: 'curl', movement_id: 'dumbbell-curl', name: 'Dumbbell curl', mode: 'reps', work_seconds: 20, sets: 2, reps: '8–12', rest: 5 },
] }
test('one-off workout has no routine reference and uses the same movement IDs', () => {
  const session = createAdhocSession(plan)
  assert.equal(session.routine_id, null); assert.equal(session.is_adhoc, true)
  assert.equal(session.status, 'draft'); assert.equal(session.exercises[1].movement_id, 'dumbbell-curl')
  assert.equal(session.exercises[1].work_seconds, 20)
  assert.ok(session.exercises.every(item => item.sets.every(set => !set.done)))
})
test('sequence runs each work/rest phase and omits a trailing rest', () => {
  const phases = workoutPhases(createAdhocSession(plan))
  assert.deepEqual(phases.map(item => [item.type,item.name,item.seconds]), [['work','Plank',30],['rest','Plank',10],['work','Plank',30],['rest','Plank',10],['work','Dumbbell curl',null],['rest','Dumbbell curl',5],['work','Dumbbell curl',null]])
})
test('circuit alternates movements by round, including uneven set counts', () => {
  const session = createAdhocSession({ ...plan, timer_order: 'circuit' })
  session.exercises[1].sets.pop()
  assert.deepEqual(workoutPhases(session).filter(item => item.type==='work').map(item=>item.name), ['Plank','Dumbbell curl','Plank'])
})
test('wall-clock catch-up crosses several timed phases and stops at the end', () => {
  const timedPlan = { ...plan, exercises: plan.exercises.map(exercise => exercise.mode === 'timed' ? exercise : { ...exercise, mode: 'timed', seconds: 20 }) }
  const phases = workoutPhases(createAdhocSession(timedPlan))
  const started = startWorkoutTimer(null,phases,1000)
  const rest = resolveWorkoutTimer(started,phases,36000)
  assert.equal(rest.phaseIndex,1); assert.equal(rest.phaseElapsedMs,5000)
  const later = resolveWorkoutTimer(started,phases,86000)
  assert.equal(later.phaseIndex,4); assert.equal(later.phaseElapsedMs,5000)
  const complete = resolveWorkoutTimer(started,phases,200000)
  assert.equal(complete.status,'complete'); assert.equal(complete.elapsedMs,125000)
  assert.equal(resolveWorkoutTimer(complete,phases,500000).elapsedMs,125000)
})
test('pause/resume does not count paused time; JSON round-trip preserves the clock', () => {
  const phases = workoutPhases(createAdhocSession(plan))
  const paused = pauseWorkoutTimer(startWorkoutTimer(null,phases,1000),phases,11000)
  assert.equal(resolveWorkoutTimer(paused,phases,100000).phaseElapsedMs,10000)
  const resumed = startWorkoutTimer(JSON.parse(JSON.stringify(paused)),phases,100000)
  assert.equal(resolveWorkoutTimer(resumed,phases,105000).phaseElapsedMs,15000)
})
test('untimed reps wait for explicit Next, and skipping never alters logged sets', () => {
  const workout = createAdhocSession({ ...plan, exercises: [{ ...plan.exercises[1], work_seconds:null }] })
  const phases = workoutPhases(workout)
  const started = startWorkoutTimer(null,phases,1000)
  const waited = resolveWorkoutTimer(started,phases,100000)
  assert.equal(waited.phaseIndex,0); assert.equal(waited.phaseElapsedMs,99000)
  assert.equal(nextWorkoutPhase(waited,phases,100000).phaseIndex,1)
  assert.ok(workout.exercises.every(item=>item.sets.every(set=>!set.done)))
})
test('a stale Next click at a phase boundary does not skip a second phase', () => {
  const phases = workoutPhases(createAdhocSession(plan))
  const started = startWorkoutTimer(null,phases,1000)
  assert.equal(nextWorkoutPhase(started,phases,31000,phases[0].id).phaseIndex,1)
})
test('editing a sequence requires an explicit restart and does not invent completed work', () => {
  const workout = createAdhocSession(plan), phases=workoutPhases(workout)
  const started=startWorkoutTimer(null,phases,1000)
  workout.exercises[0].sets.pop()
  const changed=resolveWorkoutTimer(started,workoutPhases(workout),9000)
  assert.equal(changed.changed,true); assert.equal(changed.status,'ready')
  const finished = normalizeSession(workout, true)
  assert.equal(finished.status, 'completed')
  assert.ok(finished.exercises.every(item => item.sets.every(set => !set.done)))
})
test('finishing a workout pauses a running timeline while preserving logged results', () => {
  const workout=createAdhocSession(plan), phases=workoutPhases(workout)
  workout.timer_state=startWorkoutTimer(null,phases,Date.now())
  Object.assign(workout.exercises[0].sets[0],{seconds:30,done:true})
  const saved=normalizeSession(workout,true)
  assert.equal(saved.timer_state.status,'paused')
  assert.equal(saved.exercises[0].sets[0].seconds,30)
})

test('an incompatible or corrupted saved timer resets safely', () => {
  const phases=workoutPhases(createAdhocSession(plan))
  const corrupted={...startWorkoutTimer(null,phases,1000),phaseElapsedMs:'bad'}
  assert.equal(resolveWorkoutTimer(corrupted,phases,5000).status,'ready')
  assert.equal(resolveWorkoutTimer(corrupted,phases,5000).changed,true)
})
