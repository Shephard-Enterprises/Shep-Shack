import { pauseWorkoutTimer, workoutPhases } from './workout-timer.mjs'
import { BUILTIN_MOVEMENTS, movementIdentity, movementFor, resolveMovement } from '../supabase/functions/_shared/movement-library.mjs'
export { movementIdentity }
import { MAX_EXERCISES, MAX_SETS, sessionExercises, validateRoutine } from '../supabase/functions/_shared/fitness-policy.mjs'
export { MAX_EXERCISES, MAX_SETS, validateRoutine }
export const exerciseKey = name => name.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
export const localDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export const newExercise = () => ({ id: crypto.randomUUID(), name: '', sets: 3, reps: '8–12', rest: 90, mode: 'reps', seconds: 30, work_seconds: null })
export const newRoutine = () => ({ id: crypto.randomUUID(), name: '', unit: 'lb', notes: '', timer_order: 'sets', exercises: [newExercise()] })

// Explicit, reviewable paste format: Exercise | sets | rep target | rest seconds.
// This parser never guesses at an arbitrary AI response or silently drops a line.
export function parseRoutineText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  if (!lines.length || lines.length > MAX_EXERCISES) throw new Error('Paste 1–20 exercise lines.')
  return lines.map((line, index) => {
    const [name, count, reps, rest = '90', ...extra] = line.split('|').map(value => value.trim())
    if (!name || !/^\d+$/.test(count || '') || !reps || !/^\d+$/.test(rest) || extra.length) throw new Error(`Line ${index + 1}: use Exercise | sets | rep target | rest seconds.`)
    const timed = /^(\d+)\s*s(?:ec(?:onds?)?)?$/i.exec(reps)
    const exercise = { id: crypto.randomUUID(), name, sets: Number(count), reps: timed ? '' : reps, rest: Number(rest), mode: timed ? 'timed' : 'reps', seconds: timed ? Number(timed[1]) : null }
    validateRoutine({ name: 'Import', unit: 'lb', exercises: [exercise] })
    return exercise
  })
}

export function createSession(routine, previous, date = localDate(), library = BUILTIN_MOVEMENTS) {
  const priorSessions = (Array.isArray(previous) ? previous : [previous]).filter(Boolean)
  return {
    id: crypto.randomUUID(), routine_id: routine.id, is_adhoc: false, timer_order: routine.timer_order || 'sets', timer_state: null, execution_started_at: null, name: routine.name, unit: 'lb',
    performed_on: date, started_at: new Date().toISOString(), completed_at: null, status: 'draft', kind: 'strength', notes: routine.notes || '',
    exercises: sessionExercises(routine.exercises).map(exercise => {
      const lastSession = priorSessions.find(session => session.exercises.some(item => movementIdentity(item, library) === movementIdentity(exercise, library) && (item.mode || 'reps') === exercise.mode))
      const lastExercise = lastSession?.exercises.find(item => movementIdentity(item, library) === movementIdentity(exercise, library) && (item.mode || 'reps') === exercise.mode)
      const movement = movementFor(exercise, library)
      return { ...exercise, movement_id: exercise.movement_id || movement?.id || null, name: movement?.name || exercise.name, sets: exercise.sets.map((set, index) => {
        const last = lastExercise?.sets.filter(item => item.done)[index]
        return { ...set, reps: '', seconds: '', weight: last?.weight == null ? '' : round(convertWeight(last.weight, lastSession.unit, 'lb')) }
      }) }
    }),
  }
}
const round = value => Math.round(value * 100) / 100
export function convertWeight(value, from, to) {
  if (from === to) return Number(value)
  return from === 'kg' ? Number(value) * 2.2046226218 : Number(value) / 2.2046226218
}
export function normalizeSession(session, complete = false) {
  if (!session.name?.trim() || session.name.length > 80 || !['lb', 'kg'].includes(session.unit)) throw new Error('Workout name or unit is invalid.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session.performed_on) || Number.isNaN(Date.parse(session.performed_on)) || new Date(`${session.performed_on}T12:00:00Z`).toISOString().slice(0, 10) !== session.performed_on || session.performed_on > localDate()) throw new Error('Choose a valid workout date, today or earlier.')
  if (session.kind === 'cardio') {
    const minutes = Number(session.minutes)
    const distance = session.distance === '' || session.distance == null ? null : Number(session.distance)
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Enter a duration from 1 to 1,440 minutes.')
    if (distance != null && (!Number.isFinite(distance) || distance < 0 || distance > 2000)) throw new Error('Check your distance (0–2,000).')
    if (!['mi', 'km'].includes(session.distance_unit)) throw new Error('Choose miles or kilometers.')
    if ((session.notes || '').length > 2000) throw new Error('Keep notes under 2,000 characters.')
    return { ...session, minutes, distance, exercises: [], status: 'completed', completed_at: session.completed_at || new Date().toISOString() }
  }
  if (session.timer_order && !['sets', 'circuit'].includes(session.timer_order)) throw new Error('Choose a valid workout order.')
  if (!Array.isArray(session.exercises) || !session.exercises.length || session.exercises.length > MAX_EXERCISES) throw new Error('A workout needs 1–20 exercises.')
  if ((session.notes || '').length > 2000) throw new Error('Keep workout notes under 2,000 characters.')
  const exercises = session.exercises.map(exercise => {
    if (!exercise.name?.trim() || exercise.name.length > 100 || !exercise.sets.length || exercise.sets.length > MAX_SETS) throw new Error('Check exercise names and set counts (1–12).')
    if (exercise.work_seconds != null && (!Number.isInteger(Number(exercise.work_seconds)) || exercise.work_seconds < 1 || exercise.work_seconds > 7200)) throw new Error('Check the movement work time (1–7,200 seconds).')
    return { ...exercise, sets: exercise.sets.map((set, index) => {
      const weight = set.weight === '' || set.weight == null ? null : Number(set.weight)
      const reps = set.reps === '' || set.reps == null ? null : Number(set.reps)
      if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > 2000) || reps != null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) throw new Error(`${exercise.name}, set ${index + 1}: enter weight from 0–2,000 and whole reps from 1–1,000.`)
      const seconds = set.seconds === '' || set.seconds == null ? null : Number(set.seconds)
      if (seconds != null && (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400)) throw new Error(`${exercise.name}, set ${index + 1}: enter whole seconds from 1–86,400.`)
      if (exercise.mode === 'timed' && set.done && seconds == null) throw new Error(`${exercise.name}, set ${index + 1}: record the seconds completed before checking it off.`)
      if (exercise.mode !== 'timed' && set.done && (weight == null || reps == null)) throw new Error(`${exercise.name}, set ${index + 1}: enter weight and reps before marking it done. Use 0 for bodyweight.`)
      const { timer, ...rest } = set
      return { ...rest, ...(timer && !complete ? { timer } : {}), weight, reps: exercise.mode === 'timed' ? null : reps, seconds: exercise.mode === 'timed' ? seconds : null, done: Boolean(set.done) }
    }) }
  })
  return { ...session, exercises, timer_state: complete && session.timer_state ? pauseWorkoutTimer(session.timer_state, workoutPhases(session)) : session.timer_state || null, status: complete ? 'completed' : 'draft', completed_at: complete ? new Date().toISOString() : null }
}
export const completedSets = session => (session.exercises || []).flatMap(exercise => exercise.sets.filter(set => set.done))
export const totalVolume = (session, unit = session.unit) => round((session.exercises || []).filter(exercise => exercise.mode !== 'timed').flatMap(exercise => exercise.sets.filter(set => set.done)).reduce((sum, set) => sum + convertWeight(set.weight, session.unit, unit) * set.reps, 0))
export function exerciseProgress(sessions, key, unit = 'lb', library = BUILTIN_MOVEMENTS, mode = null) {
  const identity = resolveMovement(key, library)?.id || key
  return sessions.filter(session => session.status === 'completed').map(session => {
    const sets = session.exercises.filter(exercise => (!mode || (exercise.mode || 'reps') === mode) && (movementIdentity(exercise, library) === identity || (!exercise.movement_id && exerciseKey(exercise.name) === identity))).flatMap(exercise => exercise.sets.filter(set => set.done))
    if (!sets.length) return null
    return { id: session.id, date: session.performed_on, stamp: session.completed_at || session.started_at || '', name: session.name, weight: round(Math.max(...sets.map(set => convertWeight(set.weight, session.unit, unit)))), reps: Math.max(...sets.map(set => set.reps)), seconds: Math.max(0, ...sets.map(set => Number(set.seconds || 0))), duration: sets.reduce((sum, set) => sum + Number(set.seconds || 0), 0), volume: round(sets.reduce((sum, set) => sum + (set.seconds ? 0 : convertWeight(set.weight, session.unit, unit) * set.reps), 0)) }
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.stamp.localeCompare(b.stamp) || a.id.localeCompare(b.id))
}

export const FITNESS_PROFILES = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Justin' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Rosy' }]

export const formatSeconds = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
export const timerRemaining = (timer, now = Date.now()) => !timer ? null : timer.endAt ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : timer.remaining

export function createAdhocSession(plan, previous, date, library) {
  return { ...createSession({ ...plan, id: null }, previous, date, library), routine_id: null, is_adhoc: true }
}
