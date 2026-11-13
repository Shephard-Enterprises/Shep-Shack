import { useEffect, useRef, useState } from 'react'
import WorkoutTimer from './WorkoutTimer'
import { completedSets, localDate } from './fitness-model.mjs'
import { isTimedWorkout } from './workout-session.mjs'

export default function WorkoutSession({ draft, busy, dirty, error, onStart, onChange, onSave, onFinish, onDiscard }) {
  const started = Boolean(draft.execution_started_at)
  const timedWorkout = isTimedWorkout(draft)
  const [timerOpen, setTimerOpen] = useState(started && timedWorkout)
  const timerDialog = useRef(null)
  const timerButton = useRef(null)
  const count = completedSets(draft).length
  const total = draft.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  useEffect(() => {
    const dialog = timerDialog.current
    if (timerOpen && dialog && !dialog.open) dialog.showModal()
    else if (!timerOpen && dialog?.open) dialog.close()
  }, [timerOpen])
  function updateSet(exerciseId, setId, patch) {
    onChange({ ...draft, exercises: draft.exercises.map(exercise => exercise.id !== exerciseId ? exercise : { ...exercise, sets: exercise.sets.map(set => set.id === setId ? { ...set, ...patch } : set) }) })
  }
  function closeTimer() { setTimerOpen(false); timerButton.current?.focus() }
  function logSet(setId) {
    setTimerOpen(false)
    requestAnimationFrame(() => {
      const node = document.getElementById(`fitness-set-${setId}`)
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node?.querySelector('input')?.focus({ preventScroll: true })
    })
  }
  return <div className="fitness-workout fitness-session">
    <header className="fitness-session-header">
      <div><p>{started ? 'YOUR WORKOUT' : 'READY WHEN YOU ARE'}</p><h3>{draft.name}</h3><span>{started ? `${count} of ${total} sets checked` : `${draft.exercises.length} ${draft.exercises.length === 1 ? 'movement' : 'movements'} · ${total} sets · ${timedWorkout ? 'Timed workout' : 'Reps & weight'}`}</span></div>
      {started && <button className="fitness-primary" disabled={busy} onClick={onFinish}>{busy ? 'Saving…' : 'Finish workout ✓'}</button>}
    </header>
    {!started ? <section className="fitness-panel fitness-start-card">
      <ol className="fitness-plan-list">{draft.exercises.map(exercise => <li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.sets.length} × {exercise.mode === 'timed' ? `${exercise.target_seconds}s` : `${exercise.target} reps`}</span></li>)}</ol>
      <p className="fitness-muted">{timedWorkout ? 'Start opens your timer. Work and rest follow your plan; you can return to your sets at any time.' : 'Start opens your set checklist. Log what you do, check it off, and finish whenever you’re done.'}</p>
      <button type="button" className="fitness-primary fitness-start-button" disabled={busy} onClick={onStart}>{busy ? 'Starting…' : 'Start workout →'}</button>
    </section> : <>
      {timedWorkout && <button ref={timerButton} type="button" className="fitness-open-timer" onClick={() => setTimerOpen(true)}>Open workout timer →</button>}
      <p className="fitness-session-guide">{timedWorkout ? 'Enter the time or reps you actually completed, then check each set.' : 'Your targets are below. Enter your reps and check each set.'} Weights in lbs; leave weight blank for bodyweight.</p>
      {draft.exercises.map((exercise, index) => {
        const timed = exercise.mode === 'timed'
        return <section className="fitness-panel fitness-log-exercise" key={exercise.id}>
          <div className="fitness-session-movement"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{exercise.name}</h3><p>{exercise.sets.length} sets · {timed ? `${exercise.target_seconds} seconds` : `${exercise.target} reps`}{exercise.rest > 0 ? ` · ${exercise.rest}s rest` : ''}</p></div></div>
          <div className="fitness-set-head" aria-hidden="true"><span>SET</span><span>WEIGHT (LBS)</span><span>{timed ? 'SECONDS' : 'REPS'}</span><span>DONE</span></div>
          {exercise.sets.map((set, setIndex) => {
            const actual = timed ? set.seconds : set.reps
            const validActual = Number.isInteger(Number(actual)) && Number(actual) > 0 && Number(actual) <= (timed ? 86400 : 1000)
            const validWeight = set.weight == null || set.weight === '' || Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0 && Number(set.weight) <= 2000
            return <div id={`fitness-set-${set.id}`} className={`fitness-set-row ${set.done ? 'is-done' : ''}`} key={set.id}>
              <strong>{setIndex + 1}</strong>
              <input aria-label={`${exercise.name} set ${setIndex + 1} weight`} type="number" inputMode="decimal" min="0" max="2000" step="0.5" placeholder="Optional" disabled={busy} value={set.weight ?? ''} onChange={event => updateSet(exercise.id, set.id, { weight: event.target.value, done: false })} />
              <input aria-label={`${exercise.name} set ${setIndex + 1} ${timed ? 'seconds' : 'reps'}`} type="number" inputMode="numeric" min="1" max={timed ? 86400 : 1000} step="1" placeholder={timed ? String(exercise.target_seconds) : exercise.target} disabled={busy} value={actual ?? ''} onChange={event => updateSet(exercise.id, set.id, { [timed ? 'seconds' : 'reps']: event.target.value, done: false })} />
              <label className="fitness-set-check"><input aria-label={`${exercise.name} set ${setIndex + 1} done`} type="checkbox" checked={set.done} disabled={busy || !set.done && (!validActual || !validWeight)} onChange={event => updateSet(exercise.id, set.id, { done: event.target.checked, ...(!timed && event.target.checked && (set.weight === '' || set.weight == null) ? { weight: 0 } : {}), timer: null })} /><span aria-hidden="true">✓</span></label>
            </div>
          })}
        </section>
      })}
    </>}
    <details className="fitness-panel fitness-session-details"><summary>Workout details</summary>
      <label>Workout date<input type="date" value={draft.performed_on} max={localDate()} disabled={busy} onChange={event => onChange({ ...draft, performed_on: event.target.value })} /></label>
      <label>Session notes<textarea rows={3} maxLength={2000} value={draft.notes} disabled={busy} onChange={event => onChange({ ...draft, notes: event.target.value })} /></label>
      <p className="fitness-draft-status" role="status">{dirty ? 'Changes kept on this device. Save draft to sync.' : 'Saved to your account.'}</p>
      <div className="fitness-actions"><button disabled={busy} onClick={onSave}>Save draft</button><button className="fitness-text-button" disabled={busy} onClick={onDiscard}>Discard workout</button>{!started && <button disabled={busy} onClick={onFinish}>Finish without starting</button>}</div>
    </details>
    {started && timedWorkout && <dialog ref={timerDialog} className="fitness-timer-dialog" aria-label="Workout timer" onCancel={event => { event.preventDefault(); closeTimer() }} onClose={() => setTimerOpen(false)}>
      <div className="fitness-timer-dialog-header"><span>{draft.name}</span><button type="button" onClick={closeTimer}>Back to sets ×</button></div>
      {error && <p className="fitness-error" role="alert">{error}</p>}
      <WorkoutTimer workout={draft} disabled={busy} onChange={timer_state => onChange({ ...draft, timer_state })} onLogSet={logSet} />
      <button type="button" className="fitness-primary" disabled={busy} onClick={onFinish}>Finish workout ✓</button>
    </dialog>}
  </div>
}
