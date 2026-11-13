export const MAX_EXERCISES = 20
export const MAX_SETS = 12
export function validateRoutine(routine) {
  if (!routine.name?.trim() || routine.name.trim().length > 80) throw new Error('Give your routine a name up to 80 characters.')
  if (routine.timer_order && !['sets', 'circuit'].includes(routine.timer_order)) throw new Error('Choose a valid workout order.')
  if (!['lb', 'kg'].includes(routine.unit)) throw new Error('Choose lb or kg.')
  if ((routine.notes || '').length > 2000) throw new Error('Keep routine notes under 2,000 characters.')
  if (!Array.isArray(routine.exercises) || !routine.exercises.length || routine.exercises.length > MAX_EXERCISES) throw new Error('Add between 1 and 20 exercises.')
  for (const exercise of routine.exercises) {
    if (!exercise.name?.trim() || exercise.name.trim().length > 100) throw new Error('Each exercise needs a name up to 100 characters.')
    if (!Number.isInteger(Number(exercise.sets)) || exercise.sets < 1 || exercise.sets > MAX_SETS) throw new Error('Choose 1–12 sets for each exercise.')
    const mode = exercise.mode || 'reps'
    if (!['reps', 'timed'].includes(mode)) throw new Error('Choose reps or timed for each exercise.')
    if (mode === 'timed') {
      if (!Number.isInteger(Number(exercise.seconds)) || exercise.seconds < 1 || exercise.seconds > 7200) throw new Error('Timed exercises need a target from 1–7,200 seconds.')
    } else if (!exercise.reps?.trim() || exercise.reps.length > 30) throw new Error('Add a rep target, such as 8–12, for every exercise.')
    if (exercise.work_seconds != null && exercise.work_seconds !== '' && (!Number.isInteger(Number(exercise.work_seconds)) || Number(exercise.work_seconds) < 1 || Number(exercise.work_seconds) > 7200)) throw new Error('Work windows must be whole seconds from 1–7,200, or left blank.')
    if (!Number.isInteger(Number(exercise.rest)) || exercise.rest < 0 || exercise.rest > 600) throw new Error('Rest should be 0–600 seconds.')
  }
  return { ...routine, timer_order: routine.timer_order || 'sets', name: routine.name.trim(), notes: (routine.notes || '').trim(), exercises: routine.exercises.map(exercise => ({ ...exercise, name: exercise.name.trim(), sets: Number(exercise.sets), rest: Number(exercise.rest), mode: exercise.mode || 'reps', work_seconds: exercise.work_seconds ? Number(exercise.work_seconds) : null, seconds: exercise.mode === 'timed' ? Number(exercise.seconds) : null, reps: exercise.mode === 'timed' ? '' : exercise.reps.trim() })) }
}


export function sessionExercises(exercises) {
  return exercises.map(exercise => ({
    id: exercise.id || crypto.randomUUID(), movement_id: exercise.movement_id || null,
    name: exercise.name, mode: exercise.mode || 'reps', target: exercise.reps,
    target_seconds: exercise.mode === 'timed' ? Number(exercise.seconds) : null,
    work_seconds: exercise.mode === 'timed' ? null : exercise.work_seconds ? Number(exercise.work_seconds) : null,
    rest: Number(exercise.rest),
    sets: Array.from({ length: Number(exercise.sets) }, () => ({ id: crypto.randomUUID(), weight: null, reps: null, seconds: null, done: false })),
  }))
}
