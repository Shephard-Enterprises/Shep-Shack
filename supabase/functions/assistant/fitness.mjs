import { BUILTIN_MOVEMENTS, linkExercises, movementIdentity, resolveMovement } from '../_shared/movement-library.mjs'
import { prefillSessionExercises, sessionExercises, validateRoutine } from '../_shared/fitness-policy.mjs'

export const fitnessFormat = {
  type: 'json_schema', name: 'patty_fitness_response', strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['reply', 'workout', 'target_profile_id', 'copy_routine_id', 'edit_routine_id'],
    properties: {
      reply: { type: 'string' },
      target_profile_id: { type: ['string', 'null'] },
      copy_routine_id: { type: ['string', 'null'] },
      edit_routine_id: { type: ['string', 'null'] },
      workout: { anyOf: [{ type: 'null' }, {
        type: 'object', additionalProperties: false, required: ['save_as', 'timer_order', 'name', 'unit', 'notes', 'exercises'],
        properties: {
          save_as: { type: 'string', enum: ['routine', 'adhoc'] }, timer_order: { type: 'string', enum: ['sets', 'circuit'] }, name: { type: 'string' }, unit: { type: 'string', enum: ['lb', 'kg'] }, notes: { type: 'string' },
          exercises: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['movement_id', 'name', 'sets', 'reps', 'rest', 'mode', 'seconds', 'work_seconds', 'starting_weight'], properties: { starting_weight: { type: ['number', 'null'] }, work_seconds: { type: 'null' }, movement_id: { type: 'string' }, mode: { type: 'string', enum: ['reps', 'timed'] }, seconds: { type: ['integer', 'null'] }, name: { type: 'string' }, sets: { type: 'integer' }, reps: { type: 'string' }, rest: { type: 'integer' } } } },
        },
      }] },
    },
  },
}

// Restrict generated IDs to the live catalog rather than relying on prompt text.
export function fitnessFormatFor(library = BUILTIN_MOVEMENTS, profiles = []) {
  const format = structuredClone(fitnessFormat)
  if (profiles.length) format.schema.properties.target_profile_id.enum = [null, ...profiles.map(profile => profile.id)]
  if (!library.length) {
    format.schema.properties.copy_routine_id = { type: 'null' }
    format.schema.properties.edit_routine_id = { type: 'null' }
    format.schema.properties.workout = { type: 'null' }
    return format
  }
  format.schema.properties.workout.anyOf[1].properties.exercises.items.properties.movement_id.enum = [...new Set(library.map(movement => movement.id))]
  return format
}

function linkGeneratedExercises(exercises, library) {
  const corrected = exercises.map(exercise => {
    if (library.some(movement => movement.id === exercise.movement_id)) return exercise
    // Repair only exact canonical names or unique aliases. Never infer an
    // equipment/technique variation from a fuzzy match or create a new movement.
    const movement = resolveMovement(exercise.name, library)
    if (!movement) throw new Error(`Patty suggested “${exercise.name}”, which could not be matched to your movement library. No workout was saved. Ask her to use an available movement, or add this one in Fitness.`)
    return { ...exercise, movement_id: movement.id }
  })
  return linkExercises(corrected, library)
}

export async function loadFitness(db, profileId, sharedLibrary = null) {
  const profiles = await db(`fitness_profiles?id=eq.${profileId}&select=id,name,preferences`)
  if (!profiles?.[0]) throw new Error('Choose a valid training profile before chatting.')
  const library = sharedLibrary || []
  for (let offset = 0; !sharedLibrary; offset += 200) {
    const batch = await db(`fitness_movements?select=id,name,mode,aliases,category,equipment&order=id.asc&offset=${offset}&limit=200`)
    library.push(...batch)
    if (batch.length < 200) break
  }
  const routines = await db(`fitness_routines?profile_id=eq.${profileId}&select=id,name,unit,notes,exercises,timer_order,updated_at&order=updated_at.desc&limit=20`)
  const sessions = []
  for (let offset = 0; ; offset += 200) {
    const batch = await db(`fitness_sessions?profile_id=eq.${profileId}&status=eq.completed&select=id,profile_id,status,name,kind,performed_on,completed_at,is_adhoc,unit,minutes,distance,distance_unit,notes,exercises&order=performed_on.desc,completed_at.desc,id.asc&offset=${offset}&limit=200`)
    sessions.push(...batch)
    if (batch.length < 200) break
  }
  const drafts = await db(`fitness_sessions?profile_id=eq.${profileId}&status=eq.draft&select=id,name,is_adhoc&limit=1`)
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
    profile: profiles[0], activeWorkout: drafts[0] || null, movementLibrary: library.map(({ id, name, mode }) => ({ id, name, mode })), completedWorkouts: sessions.length,
    strengthSessions: sessions.filter(session => session.kind !== 'cardio').length,
    cardioEvents: sessions.filter(session => session.kind === 'cardio').length,
    totalCardioMinutes: sessions.reduce((sum, session) => sum + Number(session.minutes || 0), 0),
    cardioProgress: [...cardio.values()].slice(0, 12),
    exerciseProgress: [...movements.values()].slice(0, 20),
    recentSessions: sessions.slice(0, 8).map(session => ({ name: session.name, kind: session.kind, date: session.performed_on, unit: session.unit, minutes: session.minutes, distance: session.distance, distanceUnit: session.distance_unit, notes: session.notes?.slice(0, 250), exercises: session.exercises.map(exercise => ({ name: exercise.name, mode: exercise.mode || 'reps', sets: exercise.sets.filter(set => set.done).slice(0, 6).map(set => ({ weight: set.weight, reps: set.reps, seconds: set.seconds })) })) })),
    savedRoutines: routines.slice(0, 10).map(routine => ({ id: routine.id, updated_at: routine.updated_at, name: routine.name, unit: routine.unit, notes: routine.notes, timer_order: routine.timer_order || 'sets', exercises: routine.exercises.map(exercise => ({ movement_id: exercise.movement_id, name: exercise.name, sets: exercise.sets, rest: exercise.rest, starting_weight: exercise.starting_weight, mode: exercise.mode || 'reps', seconds: exercise.seconds, work_seconds: exercise.work_seconds, reps: exercise.reps })) })),
    scope: 'Totals include all completed history. Details are limited to 8 recent sessions, 20 movements, and 10 routines. Missing details are unknown, not zero. Drafts are not completed workouts. Cardio pace comparisons may reflect different distances, routes, or effort; do not treat pace alone as proof of improved fitness.',
  }
  // Trim whole records, never cut JSON or silently turn truncated details into totals.
  const size = () => new TextEncoder().encode(JSON.stringify(summary)).length
  while (size() > 12000 && summary.recentSessions.length) summary.recentSessions.pop()
  while (size() > 12000 && summary.savedRoutines.length) summary.savedRoutines.pop()
  while (size() > 12000 && summary.exerciseProgress.length) summary.exerciseProgress.pop()
  while (size() > 12000 && summary.cardioProgress.length) summary.cardioProgress.pop()
  while (size() > 12000 && summary.movementLibrary.length > 1) summary.movementLibrary.pop()
  return { profile: profiles[0], summary, library, sessions, routines }
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
    if (raw.save_as && !['routine','adhoc'].includes(raw.save_as)) throw new Error('Invalid workout destination. No workout was saved.')
    workout = validateRoutine({ ...raw, unit: answer.edit_routine_id ? raw.unit : 'lb', exercises: (raw.exercises || []).map(exercise => ({ ...exercise, id: crypto.randomUUID() })) })
    workout = { save_as: raw.save_as || 'routine', timer_order: workout.timer_order, name: workout.name, unit: workout.unit, notes: workout.notes, exercises: linkGeneratedExercises(workout.exercises, library) }
  }
  if (answer.copy_routine_id != null && (typeof answer.copy_routine_id !== 'string' || workout)) throw new Error('Choose one workout action. No workout was saved.')
  if (answer.edit_routine_id != null && (typeof answer.edit_routine_id !== 'string' || !workout || answer.copy_routine_id != null)) throw new Error('Choose one existing routine to edit. No workout was saved.')
  return { reply: answer.reply.trim(), workout, editRoutineId: answer.edit_routine_id ?? null, targetProfileId: answer.target_profile_id ?? null, copyRoutineId: answer.copy_routine_id ?? null }
}

export function adhocPayload(workout, previous = [], library = BUILTIN_MOVEMENTS) {
  return { name: workout.name, unit: workout.unit, notes: workout.notes, timer_order: workout.timer_order || 'sets', exercises: prefillSessionExercises(sessionExercises(workout.exercises), previous, workout.unit, library) }
}

// All reads use the caller's JWT and household RLS, never service-role access.
export async function loadHouseholdFitness(db, profileId) {
  const active = await loadFitness(db, profileId)
  const profiles = await db('fitness_profiles?select=id,name,preferences&order=id.asc')
  const household = [active]
  for (const profile of profiles) {
    if (profile.id !== active.profile.id) household.push(await loadFitness(db, profile.id, active.library))
  }
  active.household = household
  active.summary.householdProfiles = household.filter(item => item !== active).map(item => {
    const summary = structuredClone(item.summary)
    delete summary.movementLibrary
    return summary
  })
  // Keep the combined household context within the existing request budget.
  const summaries = [active.summary, ...active.summary.householdProfiles]
  const size = () => new TextEncoder().encode(JSON.stringify(active.summary)).length
  for (const field of ['recentSessions', 'exerciseProgress', 'cardioProgress', 'savedRoutines']) {
    while (size() > 12000 && summaries.some(summary => summary[field].length)) {
      for (const summary of summaries) if (summary[field].length) summary[field].pop()
    }
  }
  return active
}

export async function copyRoutine(db, routineId, household) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routineId)) throw new Error('Choose a saved routine to copy. No workout was saved.')
  const rows = await db(`fitness_routines?id=eq.${routineId}&select=id,profile_id,name,unit,notes,exercises,timer_order`)
  const source = rows?.[0]
  if (!source || !household.some(item => item.profile.id === source.profile_id)) throw new Error('The source routine is unavailable. No workout was saved.')
  // Copy stored prescription, including weights and intervals, without model reconstruction.
  const routine = validateRoutine({ name: source.name, unit: source.unit, notes: source.notes, timer_order: source.timer_order, exercises: source.exercises.map(exercise => ({ ...exercise, id: crypto.randomUUID() })) })
  return { ...routine, save_as: 'routine' }
}

export function resolveRoutineEdit(fitness, parsed) {
  const owner = fitness.household.find(item => item.summary.savedRoutines.some(routine => routine.id === parsed.editRoutineId))
  const source = owner?.routines.find(routine => routine.id === parsed.editRoutineId)
  if (!source?.updated_at || parsed.targetProfileId && parsed.targetProfileId !== owner.profile.id) throw new Error('Choose an existing routine in its original profile. No workout was saved.')
  // Reuse identity for retained movements; replacing a movement gets a new ID.
  const remaining = [...source.exercises]
  parsed.workout.exercises = parsed.workout.exercises.map(exercise => {
    const index = remaining.findIndex(old => movementIdentity(old, fitness.library) === movementIdentity(exercise, fitness.library) && (old.mode || 'reps') === exercise.mode)
    const old = index < 0 ? null : remaining.splice(index, 1)[0]
    return { ...exercise, id: old?.id || exercise.id }
  })
  return { destination: owner, source }
}

export function routineChanges(before, after) {
  if (!before) return after.exercises.map(exercise => `${exercise.name}: ${exercise.sets} × ${exercise.mode === 'timed' ? `${exercise.seconds}s` : exercise.reps}`)
  const changes = []
  for (const [field, label] of [['name', 'Name'], ['unit', 'Weight unit'], ['notes', 'Notes'], ['timer_order', 'Workout order']]) {
    if ((before[field] || (field === 'timer_order' ? 'sets' : '')) !== after[field]) changes.push(`${label}: ${after[field] || '(cleared)'}`)
  }
  const fields = ['name', 'movement_id', 'sets', 'reps', 'rest', 'mode', 'seconds', 'work_seconds', 'starting_weight']
  const ids = new Set(after.exercises.map(exercise => exercise.id))
  for (const old of before.exercises) if (!ids.has(old.id)) changes.push(`Removed ${old.name}`)
  for (const exercise of after.exercises) {
    const old = before.exercises.find(item => item.id === exercise.id)
    const prescription = `${exercise.sets} × ${exercise.mode === 'timed' ? `${exercise.seconds}s` : exercise.reps}, rest ${exercise.rest}s${exercise.starting_weight == null ? '' : `, starting weight ${exercise.starting_weight} ${after.unit}`}`
    if (!old) changes.push(`Added ${exercise.name}: ${prescription}`)
    else if (fields.some(field => (old[field] ?? null) !== (exercise[field] ?? null))) changes.push(`${exercise.name}: ${prescription}`)
  }
  if (before.exercises.filter(exercise => ids.has(exercise.id)).map(exercise => exercise.id).join() !== after.exercises.filter(exercise => before.exercises.some(old => old.id === exercise.id)).map(exercise => exercise.id).join()) changes.push('Reordered exercises')
  return changes.length ? changes : ['Routine saved without prescription changes']
}
