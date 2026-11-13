import { useEffect, useState } from 'react'
import useTimerAudio from './useTimerAudio'
import { formatSeconds } from './fitness-model.mjs'
import { freshWorkoutTimer, nextWorkoutPhase, pauseWorkoutTimer, resolveWorkoutTimer, startWorkoutTimer, workoutPhases } from './workout-timer.mjs'

export default function WorkoutTimer({ workout, disabled, onChange, onLogSet }) {
  const phases = workoutPhases(workout)
  const [now, setNow] = useState(() => Date.now())
  const clock = Math.max(now, workout.timer_state?.updatedAt || 0)
  const state = resolveWorkoutTimer(workout.timer_state, phases, clock)
  useEffect(() => {
    if (state.status !== 'running') return
    const interval = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(interval)
  }, [state.status])
  const phase = phases[state.phaseIndex]
  const remaining = phase?.seconds == null ? null : Math.max(0, Math.ceil(phase.seconds - state.phaseElapsedMs / 1000))
  const audio = useTimerAudio({ running: state.status === 'running', complete: state.status === 'complete', phase: phase?.id, type: phase?.type, remaining, tick: now })
  const nextPhase = phases[state.phaseIndex + 1]
  function logSet() {
    if (onLogSet) { onLogSet(phase.setId); return }
    document.getElementById(`fitness-set-${phase.setId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return <section className={`fitness-workout-timer ${phase?.type === 'rest' ? 'resting' : ''}`} aria-label="Whole-workout timer">
    <div className="fitness-timer-focus">
      <p className="fitness-timer-phase">{state.status === 'complete' ? 'SESSION TIMER' : state.status === 'paused' ? 'PAUSED' : phase?.type === 'rest' ? 'REST' : 'WORK'}</p>
      <h3 aria-live="polite">{state.status === 'complete' ? 'Timer complete' : phase?.type === 'rest' ? 'Rest & recover' : phase?.name}</h3>
      <strong role="timer" aria-label="Workout phase time">{state.status === 'complete' ? '✓' : remaining == null ? formatSeconds(Math.floor(state.phaseElapsedMs / 1000)) : formatSeconds(remaining)}</strong>
      <p>{state.status === 'complete' ? 'Check your logged sets, then finish whenever you’re ready.' : `Set ${phase?.setNumber}${phase?.mode === 'reps' && phase?.type === 'work' ? ` · ${phase.reps} reps` : ''}`}</p>
      {nextPhase && <small>Up next · {nextPhase.type === 'rest' ? 'Rest' : nextPhase.name}{nextPhase.seconds ? ` · ${formatSeconds(nextPhase.seconds)}` : ''}</small>}
    </div>
    {state.changed && <p className="fitness-muted" role="status">The plan changed. Restart the timer to use the updated sequence.</p>}
    <div className="fitness-actions fitness-timer-main-actions">
      {state.status === 'running' ? <button type="button" className="fitness-primary" disabled={disabled} onClick={() => onChange(pauseWorkoutTimer(workout.timer_state, phases))}>Pause workout timer</button> : <button type="button" className="fitness-primary" disabled={disabled} onClick={() => { audio.startSound(phase?.type === 'rest' ? 'rest' : 'work'); onChange(startWorkoutTimer(workout.timer_state, phases)) }}>{state.status === 'paused' ? 'Resume workout timer' : state.status === 'complete' ? 'Restart workout timer' : 'Start workout timer'}</button>}
      {phase && ['running', 'paused'].includes(state.status) && <button type="button" disabled={disabled} onClick={() => onChange(nextWorkoutPhase(workout.timer_state, phases, Date.now(), phase.id))}>{phase.type === 'rest' ? 'Skip rest →' : phase.seconds == null ? 'Set finished → next phase' : 'Next →'}</button>}
      {phase?.type === 'work' && state.status !== 'complete' && <button type="button" disabled={disabled} onClick={logSet}>Log this set</button>}
    </div>
    <details className="fitness-timer-options"><summary>Sound & timer options</summary>
      <div className="fitness-actions"><button type="button" aria-pressed={audio.enabled} onClick={audio.toggleSound}>Timer sounds {audio.enabled ? 'on' : 'off'}</button>{audio.enabled && <button type="button" onClick={() => audio.startSound('complete')}>Test sound</button>}<button type="button" disabled={disabled} onClick={() => onChange(freshWorkoutTimer(phases))}>Reset timer</button></div>
      <p>Timed work and rest advance automatically. Rep sets without a time window wait for Next. Check off the sets you actually complete.</p>
      <p>After reloading, use Test sound or resume the timer to enable audio. Keep the app visible for cues.</p>
      <ol>{phases.map((item, index) => <li key={item.id} aria-current={index === state.phaseIndex ? 'step' : undefined}><span>{item.type === 'rest' ? 'Rest' : item.name} · Set {item.setNumber}</span><b>{item.seconds == null ? `${item.reps} reps` : formatSeconds(item.seconds)}</b></li>)}</ol>
    </details>
  </section>
}
