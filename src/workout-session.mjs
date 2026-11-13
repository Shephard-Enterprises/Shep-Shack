import { startWorkoutTimer, workoutPhases } from './workout-timer.mjs'

// Only explicit Time tracking opens the timer. Legacy rep work windows and rest are ignored.
export const isTimedWorkout = workout => (workout.exercises || []).some(exercise => exercise.mode === 'timed')
export function beginWorkoutSession(workout, now = Date.now()) {
  if (workout.execution_started_at) return workout
  const startedAt = new Date(now).toISOString()
  return { ...workout, execution_started_at: startedAt, started_at: startedAt, timer_state: isTimedWorkout(workout) ? startWorkoutTimer(null, workoutPhases(workout), now) : null }
}
