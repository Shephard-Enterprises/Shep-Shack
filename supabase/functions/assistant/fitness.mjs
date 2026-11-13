import { BUILTIN_MOVEMENTS, linkExercises, movementIdentity } from '../_shared/movement-library.mjs'
import { validateRoutine } from '../_shared/fitness-policy.mjs'

export const fitnessFormat = {
  type: 'json_schema', name: 'patty_fitness_response', strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['reply', 'workout'],
    properties: {
      reply: { type: 'string' },
      workout: { anyOf: [{ type: 'null' }, {
        type: 'object', additionalProperties: false, required: ['name', 'unit', 'notes', 'exercises'],
        properties: {
          name: { type: 'string' }, unit: { type: 'string', enum: ['lb', 'kg'] }, notes: { type: 'string' },
          exercises: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['movement_id', 'name', 'sets', 'reps', 'rest', 'mode', 'seconds'], properties: { movement_id: { type: 'string' }, mode: { type: 'string', enum: ['reps', 'timed'] }, seconds: { type: ['integer', 'null'] }, name: { type: 'string' }, sets: { type: 'integer' }, reps: { type: 'string' }, rest: { type: 'integer' } } } },
        },
      }] },
    },
  },
}

export async function loadFitness(db, profileId) {
  const profiles = await db(`fitness_profiles?id=eq.${profileId}&select=id,name,preferences`)
  if (!profiles?.[0]) throw new Error('Choose a valid training profile before chatting.')
  const library = []
  for (let offset = 0; ; offset += 200) {
    const batch = await db(`fitness_movements?select=id,name,mode,aliases,category,equipment&order=id.asc&offset=${offset}&limit=200`)
    library.push(...batch)
    if (batch.length < 200) break
  }
  const routines = await db(`fitness_routines?profile_id=eq.${profileId}&select=id,name,unit,exercises&order=updated_at.desc&limit=20`)
  const sessions = []
  for (let offset = 0; ; offset += 200) {
    const batch = await db(`fitness_sessions?profile_id=eq.${profileId}&status=eq.completed&select=id,name,kind,performed_on,completed_at,unit,minutes,distance,distance_unit,notes,exercises&order=performed_on.desc,completed_at.desc,id.asc&offset=${offset}&limit=200`)
    sessions.push(...batch)
    if (batch.length < 200) break
  }
  const movements = new Map()
  for (const session of [...sessions].reverse()) {
    for (const exercise of session.exercises || []) {
      const sets = exercise.sets.filter(set => set.done)
      if (!sets.length) continue
      const key = movementIdentity(exercise, library)
      if (exercise.mode === 'timed') {
        const keyTimed = `${key}:timed`
        const old = movements.get(keyTimed)
        const longest = Math.max(...sets.map(set => Number(set.seconds || 0)))
        movements.set(keyTimed, { movement_id: exercise.movement_id || null, name: exercise.name, mode: 'timed', firstLongestSeconds: old?.firstLongestSeconds ?? longest, bestSeconds: Math.max(old?.bestSeconds || 0, longest), latestLongestSeconds: longest, latestTotalSeconds: sets.reduce((sum, set) => sum + Number(set.seconds || 0), 0), latestDate: session.performed_on })
        continue
      }
      const topLb = Math.max(...sets.map(set => Number(set.weight) * (session.unit === 'kg' ? 2.2046226218 : 1)))
      const reps = Math.max(...sets.map(set => Number(set.reps)))
      const previous = movements.get(key)
      movements.set(key, { movement_id: exercise.movement_id || null, name: exercise.name, firstTopLb: previous?.firstTopLb ?? topLb, bestTopLb: Math.max(previous?.bestTopLb || 0, topLb), latestTopLb: Math.round(topLb * 100) / 100, bestReps: Math.max(previous?.bestReps || 0, reps), latestDate: session.performed_on })
    }
  }
  const cardio = new Map()
  for (const session of [...sessions].reverse().filter(item => item.kind === 'cardio')) {
    const key = session.name.trim().toLowerCase()
    const miles = session.distance == null ? null : Number(session.distance) / (session.distance_unit === 'km' ? 1.609344 : 1)
    const pace = miles > 0 ? Math.round(Number(session.minutes) / miles * 100) / 100 : null
    const old = cardio.get(key)
    cardio.set(key, { activity: session.name, events: (old?.events || 0) + 1, totalMinutes: (old?.totalMinutes || 0) + Number(session.minutes), totalMiles: Math.round(((old?.totalMiles || 0) + (miles || 0)) * 100) / 100, firstPaceMinPerMile: old ? old.firstPaceMinPerMile : pace, latestPaceMinPerMile: pace, longestMiles: Math.max(old?.longestMiles || 0, miles || 0), latestDate: session.performed_on })
  }
  const summary = {
    profile: profiles[0], movementLibrary: library.map(({ id, name, mode }) => ({ id, name, mode })), completedWorkouts: sessions.length,
    strengthSessions: sessions.filter(session => session.kind !== 'cardio').length,
    cardioEvents: sessions.filter(session => session.kind === 'cardio').length,
    totalCardioMinutes: sessions.reduce((sum, session) => sum + Number(session.minutes || 0), 0),
    cardioProgress: [...cardio.values()].slice(0, 12),
    exerciseProgress: [...movements.values()].slice(0, 20),
    recentSessions: sessions.slice(0, 8).map(session => ({ name: session.name, kind: session.kind, date: session.performed_on, unit: session.unit, minutes: session.minutes, distance: session.distance, distanceUnit: session.distance_unit, notes: session.notes?.slice(0, 250), exercises: session.exercises.map(exercise => ({ name: exercise.name, mode: exercise.mode || 'reps', sets: exercise.sets.filter(set => set.done).slice(0, 6).map(set => ({ weight: set.weight, reps: set.reps, seconds: set.seconds })) })) })),
    savedRoutines: routines.slice(0, 10).map(routine => ({ name: routine.name, unit: routine.unit, exercises: routine.exercises.slice(0, 8).map(exercise => ({ name: exercise.name, sets: exercise.sets, mode: exercise.mode || 'reps', seconds: exercise.seconds, reps: exercise.reps })) })),
    scope: 'Totals include all completed history. Details are limited to 8 recent sessions, 20 movements, and 10 routines. Missing details are unknown, not zero. Drafts are not completed workouts. Cardio pace comparisons may reflect different distances, routes, or effort; do not treat pace alone as proof of improved fitness.',
  }
  // Trim whole records, never cut JSON or silently turn truncated details into totals.
  const size = () => new TextEncoder().encode(JSON.stringify(summary)).length
  while (size() > 12000 && summary.recentSessions.length) summary.recentSessions.pop()
  while (size() > 12000 && summary.savedRoutines.length) summary.savedRoutines.pop()
  while (size() > 12000 && summary.exerciseProgress.length) summary.exerciseProgress.pop()
  while (size() > 12000 && summary.cardioProgress.length) summary.cardioProgress.pop()
  while (size() > 12000 && summary.movementLibrary.length > 1) summary.movementLibrary.pop()
  return { profile: profiles[0], summary, library }
}

export function parseFitnessAnswer(result, text, library = BUILTIN_MOVEMENTS) {
  const refusal = (result.output || []).flatMap(item => item.content || []).find(part => part.type === 'refusal')
  if (refusal) return { reply: refusal.refusal, workout: null }
  if (result.status === 'incomplete') throw new Error('The workout answer reached its length limit and was not saved. Ask for a shorter workout.')
  let answer
  try { answer = JSON.parse(text) } catch { throw new Error('Patty’s answer could not be read. No workout was saved. Try again with a shorter request.') }
  if (typeof answer.reply !== 'string' || !answer.reply.trim()) throw new Error('No answer was returned. No workout was saved.')
  let workout = null
  if (answer.workout != null) {
    const raw = answer.workout
    workout = validateRoutine({ ...raw, exercises: (raw.exercises || []).map(exercise => ({ ...exercise, id: crypto.randomUUID() })) })
    workout = { name: workout.name, unit: workout.unit, notes: workout.notes, exercises: linkExercises(workout.exercises, library) }
  }
  return { reply: answer.reply.trim(), workout }
}
