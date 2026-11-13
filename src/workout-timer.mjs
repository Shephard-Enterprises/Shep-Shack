// Timeline state uses wall-clock timestamps so background throttling and reloads
// do not stretch intervals. A rep set without a work window waits for Next.
export function workoutPhases(workout) {
  const movements = workout.exercises || []
  const work = workout.timer_order === 'circuit'
    ? Array.from({ length: Math.max(0, ...movements.map(item => item.sets.length)) }, (_, round) => movements.filter(item => item.sets[round]).map(item => ({ exercise: item, set: item.sets[round], setNumber: round + 1 }))).flat()
    : movements.flatMap(exercise => exercise.sets.map((set, index) => ({ exercise, set, setNumber: index + 1 })))
  return work.flatMap(({ exercise, set, setNumber }, index) => {
    const base = { exerciseId: exercise.id, setId: set.id, name: exercise.name, setNumber, reps: exercise.target, mode: exercise.mode || 'reps' }
    const duration = exercise.mode === 'timed' ? exercise.target_seconds : null
    const phases = [{ ...base, id: `${exercise.id}:${set.id}:work`, type: 'work', seconds: duration ? Number(duration) : null }]
    if (index < work.length - 1 && Number(exercise.rest) > 0) phases.push({ ...base, id: `${exercise.id}:${set.id}:rest`, type: 'rest', seconds: Number(exercise.rest) })
    return phases
  })
}
export const phaseSignature = phases => JSON.stringify(phases.map(phase => [phase.id, phase.seconds]))
export function freshWorkoutTimer(phases, now = Date.now()) {
  return { version: 1, signature: phaseSignature(phases), status: 'ready', phaseIndex: 0, phaseElapsedMs: 0, elapsedMs: 0, updatedAt: now }
}
export function resolveWorkoutTimer(state, phases, now = Date.now()) {
  if (!state) return freshWorkoutTimer(phases, now)
  if (state.version !== 1 || !['ready','running','paused','complete'].includes(state.status) || typeof state.signature !== 'string' || !['phaseIndex','phaseElapsedMs','elapsedMs','updatedAt'].every(key => Number.isSafeInteger(state[key]) && state[key] >= 0) || state.phaseIndex > phases.length) return { ...freshWorkoutTimer(phases, now), changed: true }
  if (state.signature !== phaseSignature(phases)) return { ...freshWorkoutTimer(phases, now), changed: true }
  const next = { ...state, updatedAt: now }
  if (state.status !== 'running') return next
  let delta = Math.max(0, now - state.updatedAt)
  while (next.phaseIndex < phases.length) {
    const phase = phases[next.phaseIndex]
    if (phase.seconds == null) {
      next.phaseElapsedMs += delta; next.elapsedMs += delta
      return next
    }
    const left = Math.max(0, phase.seconds * 1000 - next.phaseElapsedMs)
    if (delta < left) { next.phaseElapsedMs += delta; next.elapsedMs += delta; return next }
    delta -= left; next.elapsedMs += left; next.phaseIndex++; next.phaseElapsedMs = 0
    if (delta === 0 && next.phaseIndex < phases.length) return next
  }
  return { ...next, phaseIndex: phases.length, status: 'complete' }
}
export function startWorkoutTimer(state, phases, now = Date.now()) {
  const current = resolveWorkoutTimer(state, phases, now)
  return { ...(current.status === 'complete' || current.changed ? freshWorkoutTimer(phases, now) : current), status: phases.length ? 'running' : 'complete', updatedAt: now }
}
export function pauseWorkoutTimer(state, phases, now = Date.now()) {
  const current = resolveWorkoutTimer(state, phases, now)
  return { ...current, status: current.status === 'complete' ? 'complete' : 'paused' }
}
export function nextWorkoutPhase(state, phases, now = Date.now(), expectedPhaseId = null) {
  const current = resolveWorkoutTimer(state, phases, now)
  if (current.phaseIndex >= phases.length || expectedPhaseId && phases[current.phaseIndex]?.id !== expectedPhaseId) return current
  const phaseIndex = current.phaseIndex + 1
  return { ...current, phaseIndex, phaseElapsedMs: 0, status: phaseIndex === phases.length ? 'complete' : current.status === 'paused' ? 'paused' : 'running', updatedAt: now }
}
