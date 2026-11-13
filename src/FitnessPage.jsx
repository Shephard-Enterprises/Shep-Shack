import { useEffect, useRef, useState } from 'react'
import useFitness from './useFitness'
import ExerciseTimer from './ExerciseTimer'
import MovementPicker from './MovementPicker'
import { movementFor, movementIdentity, searchMovements } from '../supabase/functions/_shared/movement-library.mjs'
import { completedSets, createSession, exerciseProgress, FITNESS_PROFILES, localDate, MAX_EXERCISES, MAX_SETS, newExercise, newRoutine, normalizeSession, parseRoutineText, totalVolume } from './fitness-model.mjs'
import './FitnessPage.css'

const format = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
const storageKey = cacheId => `shep-fitness-draft:${cacheId}`
function readDraft(cacheId, server) {
  try {
    const cached = JSON.parse(localStorage.getItem(storageKey(cacheId)))
    return cached?.id === server?.id && cached?.updated_at === server?.updated_at ? { ...normalizeSession(cached), updated_at: cached.updated_at } : server
  } catch { return server }
}

export default function FitnessPage({ userId, profileId, onProfileChange }) {
  return <section className="fitness-container"><div className="fitness-profile-tabs" role="group" aria-label="Training profile">{FITNESS_PROFILES.map(profile => <button key={profile.id} aria-pressed={profileId === profile.id} onClick={() => onProfileChange(profile.id)}><span aria-hidden="true">{profile.name[0]}</span>{profile.name}</button>)}</div><FitnessTracker key={profileId} userId={userId} profileId={profileId} /></section>
}

function FitnessTracker({ userId, profileId }) {
  const data = useFitness(userId, profileId)
  const cacheId = `${userId}:${profileId}`
  const [tab, setTab] = useState('routines')
  const [editor, setEditor] = useState(null)
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [cardio, setCardio] = useState(false)
  const restored = useRef(false)
  const completed = data.sessions.filter(session => session.status === 'completed')
  const active = draft || data.sessions.find(session => session.status === 'draft')

  useEffect(() => {
    if (data.loading || restored.current) return
    restored.current = true
    // Restore after the async load; defer state updates to the microtask queue.
    queueMicrotask(() => {
      const server = data.sessions.find(session => session.status === 'draft')
      const next = readDraft(cacheId, server)
      if (next) { setDraft(next); setTab('workout'); setDirty(next !== server) }
    })
  }, [data.loading, data.sessions, cacheId])

  function remember(next) {
    setDraft(next); setDirty(true); setNotice('')
    try { localStorage.setItem(storageKey(cacheId), JSON.stringify(next)) }
    catch { setError('Device storage is full or unavailable. Use Save draft to protect your changes.') }
  }
  function forget() {
    try { localStorage.removeItem(storageKey(cacheId)) } catch { /* Cloud save remains intact. */ }
    setDirty(false)
  }
  async function action(work) {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  function chooseTab(value) { setTab(value); setError(''); setNotice('') }
  async function start(routine) {
    if (active) { setDraft(readDraft(cacheId, active)); setTab('workout'); return }
    await action(async () => {
      const saved = await data.saveSession(createSession(routine, completed, undefined, data.movements))
      setDraft(saved); setTab('workout'); forget()
      setNotice('Workout started. Previous weights are filled in; log today’s reps and check each completed set.')
    })
  }
  async function saveDraft(finish = false) {
    await action(async () => {
      const saved = await data.saveSession(active, finish)
      forget()
      if (finish) { setDraft(null); setTab('history'); setNotice('Workout complete. Your progress is updated.') }
      else { setDraft(saved); setNotice('Draft synced. You can resume on another device.') }
    })
  }
  async function removeConfirmed() {
    const target = confirm
    setConfirm(null)
    await action(async () => {
      await data.remove(target.kind, target.id)
      if (target.kind === 'routine' && active?.routine_id === target.id) remember({ ...active, routine_id: null })
      if (target.id === active?.id) { setDraft(null); forget(); setTab('routines') }
      setNotice(target.kind === 'routine' ? 'Routine deleted. Completed workouts are kept.' : 'Workout deleted.')
    })
  }
  const recent = completed.filter(session => {
    const end = new Date(`${localDate()}T12:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 27)
    return session.performed_on >= end.toISOString().slice(0, 10)
  })
  return <section className="fitness-page" aria-label="Fitness">
    <header className="fitness-heading"><div><p>YOUR TRAINING LOG</p><h2>Show up. Get stronger.</h2><span>Your routines, your numbers, your progress.</span></div><button className="fitness-primary" disabled={busy || data.loading || Boolean(data.error)} onClick={() => { setEditor(newRoutine()); chooseTab('routines') }}>+ New routine</button></header>
    <div className="fitness-stats"><div><strong>{recent.length}</strong><span>Workouts · last 28 days</span></div><div><strong>{recent.reduce((sum, session) => sum + completedSets(session).length, 0)}</strong><span>Completed sets · 28 days</span></div><div><strong>{data.routines.length}</strong><span>Saved routines</span></div></div>
    <nav className="fitness-tabs" aria-label="Fitness views">{[['routines', 'My routines'], ['workout', active ? 'Workout in progress' : 'Log workout'], ['cardio', 'Cardio'], ['history', 'History'], ['progress', 'Progress'], ['movements', 'Movements']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => chooseTab(value)}>{label}{value === 'workout' && active && <i />}</button>)}</nav>
    {data.loading && <p className="fitness-message" role="status">Loading your training log…</p>}
    {data.error && <div className="fitness-message fitness-error" role="alert"><p>Could not load Fitness. {data.error}</p><p>If this section is new, its database migration needs to be applied first.</p><button disabled={busy} onClick={() => action(() => data.reload())}>Try again</button></div>}
    {error && <p className="fitness-message fitness-error" role="alert">{error}</p>}
    {notice && <p className="fitness-message" role="status">{notice}</p>}
    {!data.loading && !data.error && <>
      {tab === 'routines' && <TrainingPreferences key={`${profileId}:${data.profile?.preferences || ''}`} name={FITNESS_PROFILES.find(profile => profile.id === profileId)?.name} value={data.profile?.preferences || ''} busy={busy} onSave={preferences => action(async () => { await data.savePreferences(preferences); setNotice('Training preferences saved for this profile. Patty will use them for future workouts.'); })} />}
      {tab === 'routines' && (editor ? <RoutineEditor key={editor.id} initial={editor} movements={data.movements} onCreateMovement={data.createMovement} canStart={!active} busy={busy} onCancel={() => setEditor(null)} onSave={(routine, startNow) => action(async () => { const saved = await data.saveRoutine(routine); setEditor(null); if (startNow) { const session = await data.saveSession(createSession(saved, completed, undefined, data.movements)); setDraft(session); forget(); setTab('workout'); setNotice('Workout started. Log your sets below.'); } else setNotice('Routine saved. Ready when you are.'); })} /> : <>
        {active && <div className="fitness-resume"><div><small>PICK UP WHERE YOU LEFT OFF</small><strong>{active.name}</strong><span>{completedSets(active).length} sets done · {dateLabel(active.performed_on)}</span></div><button className="fitness-primary" onClick={() => { setDraft(readDraft(cacheId, active)); setTab('workout') }}>Resume →</button></div>}
        {data.routines.length ? <div className="fitness-routine-grid">{data.routines.map(routine => {
          const previous = completed.find(session => session.kind !== 'cardio' && session.routine_id === routine.id)
          return <article className="fitness-panel fitness-routine" key={routine.id}><div className="fitness-panel-top"><p>{routine.exercises.length} {routine.exercises.length === 1 ? 'EXERCISE' : 'EXERCISES'} · {routine.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)} SETS</p><span>{routine.unit}</span></div><h3>{routine.name}</h3><ul>{routine.exercises.slice(0, 4).map(exercise => <li key={exercise.id}><span>{exercise.name}</span><b>{exercise.sets} × {exercise.mode === 'timed' ? `${exercise.seconds}s` : exercise.reps}</b></li>)}</ul>{routine.exercises.length > 4 && <small>+ {routine.exercises.length - 4} more exercises</small>}<p className="fitness-muted">{previous ? `Last trained ${dateLabel(previous.performed_on)}` : 'Your first session is waiting.'}</p><div className="fitness-actions"><button className="fitness-primary" disabled={busy} onClick={() => start(routine)}>{active ? 'Resume workout' : 'Start workout'} →</button><button disabled={busy} onClick={() => setEditor(structuredClone(routine))}>Edit</button><button className="fitness-text-button" disabled={busy || active?.routine_id === routine.id} title={active?.routine_id === routine.id ? 'Finish or discard the active workout before deleting its routine.' : undefined} aria-label={`Delete ${routine.name} routine`} onClick={() => setConfirm({ kind: 'routine', id: routine.id, name: routine.name })}>Delete</button></div></article>
        })}</div> : <div className="fitness-empty"><span>↗</span><h3>Build your starting lineup.</h3><p>Add the workouts you already follow. Set your exercises and rep targets once, then log each session as you go.</p><button className="fitness-primary" onClick={() => setEditor(newRoutine())}>Create your first routine</button></div>}
      </>)}
      {tab === 'workout' && (active ? <WorkoutLog key={active.id} draft={active} busy={busy} dirty={dirty} previous={completed} movements={data.movements} onChange={remember} onSave={() => saveDraft()} onFinish={() => saveDraft(true)} onDiscard={() => setConfirm({ kind: 'session', id: active.id, name: active.name })} /> : <div className="fitness-empty"><span>＋</span><h3>Ready for your next session?</h3><p>Choose a saved routine to start logging. You can also create a one-off routine for today.</p><button className="fitness-primary" onClick={() => chooseTab('routines')}>Choose a routine →</button></div>)}
      {tab === 'cardio' && <><div className="fitness-section-title"><div><h3>Go the distance.</h3><p className="fitness-muted">Walks, runs, rides, swims, and everything in between.</p></div><button className="fitness-primary" disabled={busy} onClick={() => setCardio(true)}>+ Log cardio</button></div>{cardio && <CardioForm busy={busy} onCancel={() => setCardio(false)} onSave={session => action(async () => { await data.saveSession(session, true); setCardio(false); setNotice('Cardio saved.'); })} />}<CardioSummary sessions={completed.filter(session => session.kind === 'cardio')} /></>}
      {tab === 'history' && <History sessions={completed} onDelete={session => setConfirm({ kind: 'session', id: session.id, name: session.name })} busy={busy} />}
      {tab === 'progress' && <Progress sessions={completed} movements={data.movements} />}
      {tab === 'movements' && <MovementLibrary movements={data.movements} routines={data.routines} sessions={data.sessions} busy={busy} onLink={(name, id) => action(async () => { await data.linkHistory(name, id); setNotice('Movement history linked. Progress now uses the same movement across workouts.'); })} />}

    </>}
    {confirm && <DeleteDialog target={confirm} onCancel={() => setConfirm(null)} onDelete={removeConfirmed} />}
  </section>
}

function RoutineEditor({ initial, movements, onCreateMovement, canStart, busy, onSave, onCancel }) {
  const [routine, setRoutine] = useState(initial)
  const [paste, setPaste] = useState('')
  const [pasteError, setPasteError] = useState('')
  function updateExercise(id, patch) { setRoutine(current => ({ ...current, exercises: current.exercises.map(exercise => exercise.id === id ? { ...exercise, ...patch } : exercise) })) }
  function importText() {
    try { const exercises = parseRoutineText(paste); setRoutine(current => ({ ...current, exercises })); setPasteError(''); setPaste('') }
    catch (failure) { setPasteError(failure.message) }
  }
  return <form className="fitness-panel fitness-editor" onSubmit={event => { event.preventDefault(); onSave(routine, event.nativeEvent.submitter?.value === 'start') }}>
    <div className="fitness-section-title"><div><p>BUILD YOUR ROUTINE</p><h3>{initial.name ? 'Edit routine' : 'Make it yours.'}</h3></div><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    <div className="fitness-editor-heading"><label>Routine name<input required maxLength={80} value={routine.name} disabled={busy} placeholder="e.g. Upper body A" onChange={event => setRoutine({ ...routine, name: event.target.value })} /></label><label>Weight unit<select value={routine.unit} disabled={busy} onChange={event => setRoutine({ ...routine, unit: event.target.value })}><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label></div>
    <details className="fitness-import"><summary>Paste exercises from an existing plan</summary><p>One exercise per line: name | sets | rep target or duration | rest in seconds. Use 45s for a timed movement. Review the fields below before saving. Pasting replaces the current exercise list.</p><label>Exercises to import<textarea rows={4} value={paste} disabled={busy} onChange={event => setPaste(event.target.value)} placeholder={'Bench press | 3 | 8–12 | 90\nPlank | 3 | 45s | 60'} /></label><button type="button" disabled={busy || !paste.trim()} onClick={importText}>Use these exercises</button>{pasteError && <p className="fitness-error" role="alert">{pasteError}</p>}</details>
    <div className="fitness-editor-exercises">{routine.exercises.map((exercise, index) => <fieldset key={exercise.id} disabled={busy}><legend>Exercise {index + 1}</legend><div className="fitness-exercise-edit"><MovementPicker exercise={exercise} library={movements} disabled={busy} onSelect={patch => updateExercise(exercise.id, patch)} onCreate={onCreateMovement} /><label>Sets<input required type="number" min="1" max={MAX_SETS} value={exercise.sets} onChange={event => updateExercise(exercise.id, { sets: event.target.value })} /></label><label>Track<select aria-label={`Exercise ${index + 1} tracking`} value={exercise.mode || 'reps'} disabled={Boolean(exercise.movement_id)} onChange={event => updateExercise(exercise.id, { mode: event.target.value, seconds: exercise.seconds || 30 })}><option value="reps">Reps</option><option value="timed">Time</option></select></label>{exercise.mode === 'timed' ? <label>Seconds<input required type="number" min="1" max="7200" value={exercise.seconds ?? 30} onChange={event => updateExercise(exercise.id, { seconds: event.target.value })} /></label> : <label>Rep target<input required maxLength={30} value={exercise.reps} onChange={event => updateExercise(exercise.id, { reps: event.target.value })} /></label>}<label>Rest (sec)<input required type="number" min="0" max="600" value={exercise.rest} onChange={event => updateExercise(exercise.id, { rest: event.target.value })} /></label><button type="button" aria-label={`Remove exercise ${index + 1}`} disabled={routine.exercises.length === 1} onClick={() => setRoutine({ ...routine, exercises: routine.exercises.filter(item => item.id !== exercise.id) })}>Remove</button></div></fieldset>)}</div>
    <button type="button" disabled={busy || routine.exercises.length >= MAX_EXERCISES} onClick={() => setRoutine({ ...routine, exercises: [...routine.exercises, newExercise()] })}>+ Add exercise</button>
    <label>Routine notes<textarea rows={3} maxLength={2000} value={routine.notes} disabled={busy} placeholder="Warm-up, technique cues, or other reminders…" onChange={event => setRoutine({ ...routine, notes: event.target.value })} /></label>
    <div className="fitness-actions"><button className="fitness-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save routine'}</button>{canStart && <button type="submit" value="start" disabled={busy}>Save & start workout →</button>}<span>{routine.exercises.length} / 20 exercises</span></div>
  </form>
}

function RestTimer() {
  const [end, setEnd] = useState(null)
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!end) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [end])
  const remaining = end ? Math.max(0, Math.ceil((end - now) / 1000)) : null
  return <div className="fitness-rest"><div><small>REST TIMER</small><strong role="timer" aria-label="Rest time remaining">{remaining == null ? 'Ready?' : remaining === 0 ? 'Rest complete' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</strong></div><div className="fitness-actions">{[60, 90, 120].map(seconds => <button key={seconds} type="button" onClick={() => { const start = Date.now(); setNow(start); setEnd(start + seconds * 1000) }}>{seconds}s</button>)}{end && <button type="button" onClick={() => setEnd(null)}>Clear</button>}</div></div>
}

function WorkoutLog({ draft, previous, movements, busy, dirty, onChange, onSave, onFinish, onDiscard }) {
  function updateSet(exerciseId, setId, patch) {
    onChange({ ...draft, exercises: draft.exercises.map(exercise => exercise.id !== exerciseId ? exercise : { ...exercise, sets: exercise.sets.map(set => set.id === setId ? { ...set, ...patch } : set) }) })
  }
  const count = completedSets(draft).length
  const total = draft.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  return <div className="fitness-workout"><section className="fitness-panel"><div className="fitness-section-title"><div><p>ONE SET AT A TIME</p><h3>{draft.name}</h3></div><span className="fitness-completed-badge">{count} / {total} sets</span></div><div className="fitness-workout-meta"><label>Workout date<input type="date" value={draft.performed_on} max={localDate()} disabled={busy} onChange={event => onChange({ ...draft, performed_on: event.target.value })} /></label><span>Weights in {draft.unit} · Use 0 for bodyweight. Log one dumbbell’s weight for dumbbell movements.</span></div><progress max={total} value={count} aria-label="Workout completed sets" /><RestTimer /></section>
    {draft.exercises.map((exercise, index) => {
      const lastSession = previous.find(session => session.exercises.some(item => movementIdentity(item, movements) === movementIdentity(exercise, movements)))
      const lastExercise = lastSession?.exercises.find(item => movementIdentity(item, movements) === movementIdentity(exercise, movements))
      const lastSets = lastExercise?.sets.filter(set => set.done) || []
      const timed = exercise.mode === 'timed'
      return <section className="fitness-panel fitness-log-exercise" key={exercise.id}><div className="fitness-section-title"><div><p>MOVEMENT {index + 1}</p><h3>{exercise.name}</h3></div><span>{timed ? `${exercise.target_seconds}s per set` : `${exercise.target} reps`} · {exercise.rest}s rest</span></div>{lastSets.length > 0 && <p className="fitness-previous">Last time · {dateLabel(lastSession.performed_on)} · {lastSets.map(set => lastExercise.mode === 'timed' ? `${set.seconds}s${set.weight ? ` · ${format(set.weight)} ${lastSession.unit}` : ''}` : `${format(set.weight)} ${lastSession.unit} × ${set.reps}`).join(' / ')}</p>}
        {timed && <p className="fitness-muted">Run the countdown or enter your completed seconds. Weight is optional for timed movements.</p>}
        <div className="fitness-set-head" aria-hidden="true"><span>SET</span><span>WEIGHT ({draft.unit})</span><span>{timed ? 'SECONDS' : 'REPS'}</span><span>DONE</span></div>
        {exercise.sets.map((set, setIndex) => <div key={set.id}>
          <div className={`fitness-set-row ${set.done ? 'is-done' : ''}`}><strong>{setIndex + 1}</strong><input aria-label={`${exercise.name} set ${setIndex + 1} weight`} type="number" inputMode="decimal" min="0" max="2000" step="0.5" placeholder={timed ? 'Optional' : '—'} disabled={busy} value={set.weight ?? ''} onChange={event => updateSet(exercise.id, set.id, { weight: event.target.value, done: false })} />
          <input aria-label={`${exercise.name} set ${setIndex + 1} ${timed ? 'seconds' : 'reps'}`} type="number" inputMode="numeric" min="1" max={timed ? 86400 : 1000} step="1" placeholder={timed ? String(exercise.target_seconds) : exercise.target} disabled={busy} value={(timed ? set.seconds : set.reps) ?? ''} onChange={event => updateSet(exercise.id, set.id, { [timed ? 'seconds' : 'reps']: event.target.value, done: false })} />
          <label className="fitness-set-check"><input aria-label={`${exercise.name} set ${setIndex + 1} done`} type="checkbox" checked={set.done} disabled={busy || (timed ? !Number(set.seconds) : set.weight === '' || set.weight == null || !Number(set.reps)) || Number(set.weight) < 0} onChange={event => updateSet(exercise.id, set.id, { done: event.target.checked, ...(event.target.checked && set.timer ? { timer: null } : {}) })} /><span aria-hidden="true">✓</span></label></div>
          {timed && !set.done && <ExerciseTimer name={exercise.name} setNumber={setIndex + 1} target={exercise.target_seconds || 30} timer={set.timer} disabled={busy} onChange={timer => updateSet(exercise.id, set.id, { timer })} onRecord={(seconds, timer) => updateSet(exercise.id, set.id, { seconds, timer, done: false })} />}
        </div>)}
        <div className="fitness-actions"><button type="button" disabled={busy || exercise.sets.length >= MAX_SETS} onClick={() => onChange({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, sets: [...item.sets, { id: crypto.randomUUID(), weight: '', reps: '', seconds: '', done: false }] } : item) })}>+ Add set</button>{exercise.sets.length > 1 && !exercise.sets.at(-1).done && <button type="button" disabled={busy} onClick={() => onChange({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, sets: item.sets.slice(0, -1) } : item) })}>Remove last set</button>}</div>
      </section>
    })}
    <section className="fitness-panel"><label>Session notes<textarea rows={3} maxLength={2000} value={draft.notes} disabled={busy} placeholder="How did it feel? Anything to change next time?" onChange={event => onChange({ ...draft, notes: event.target.value })} /></label><p className="fitness-draft-status" role="status">{dirty ? 'Changes kept on this device. Save draft to sync across devices.' : 'Draft synced to your account.'}</p><div className="fitness-actions"><button className="fitness-primary" disabled={busy || !count} onClick={onFinish}>{busy ? 'Saving…' : 'Finish workout ✓'}</button><button disabled={busy} onClick={onSave}>Save draft</button><button className="fitness-text-button" disabled={busy} onClick={onDiscard}>Discard workout</button></div></section>
  </div>
}

function History({ sessions, onDelete, busy }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(sessions.length / 8))
  const current = Math.min(page, pages - 1)
  if (!sessions.length) return <div className="fitness-empty"><span>◷</span><h3>Your training story starts here.</h3><p>Finish a workout to see your completed sets, notes, and session totals.</p></div>
  return <div className="fitness-history"><div className="fitness-section-title"><h3>Every session counts.</h3><span>{sessions.length} workouts logged</span></div>{sessions.slice(current * 8, current * 8 + 8).map(session => <article className="fitness-panel" key={session.id}><div className="fitness-section-title"><div><p>{dateLabel(session.performed_on)}</p><h3>{session.name}</h3></div><span>{session.kind === 'cardio' ? `${format(session.minutes)} min${session.distance != null ? ` · ${format(session.distance)} ${session.distance_unit}` : ''}` : `${completedSets(session).length} sets · ${format(totalVolume(session))} ${session.unit} volume`}</span></div><details><summary>{session.kind === 'cardio' ? 'View cardio notes' : 'View exercises & notes'}</summary>{session.exercises.map(exercise => <div className="fitness-history-exercise" key={exercise.id}><strong>{exercise.name}</strong><p>{exercise.sets.filter(set => set.done).map(set => exercise.mode === 'timed' ? `${set.seconds}s${set.weight ? ` · ${format(set.weight)} ${session.unit}` : ''}` : `${format(set.weight)} ${session.unit} × ${set.reps}`).join(' · ') || 'No completed sets'}</p></div>)}{session.notes && <p className="fitness-notes">{session.notes}</p>}<button className="fitness-text-button" disabled={busy} onClick={() => onDelete(session)}>Delete workout</button></details></article>)}{pages > 1 && <div className="fitness-pagination"><button disabled={!current} onClick={() => setPage(current - 1)}>← Previous</button><span>{current + 1} / {pages}</span><button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Next →</button></div>}</div>
}

function Progress({ sessions, movements }) {
  const names = new Map()
  sessions.forEach(session => session.exercises.forEach(exercise => { if (exercise.sets.some(set => set.done)) names.set(movementIdentity(exercise, movements), movementFor(exercise, movements)?.name || `${exercise.name} (unlinked)`) }))
  const options = [...names].sort((a, b) => a[1].localeCompare(b[1]))
  const [selected, setSelected] = useState('')
  const [unit, setUnit] = useState('lb')
  const [metric, setMetric] = useState('weight')
  const key = names.has(selected) ? selected : options[0]?.[0]
  const points = key ? exerciseProgress(sessions, key, unit, movements) : []
  if (!points.length) return <div className="fitness-empty"><span>↗</span><h3>Watch your work add up.</h3><p>Log completed sets to chart your strength and volume by exercise. Your numbers will appear here after your first workout.</p></div>
  const timed = sessions.some(session => session.exercises.some(exercise => movementIdentity(exercise, movements) === key && exercise.mode === 'timed'))
  const activeMetric = timed ? (['seconds', 'duration'].includes(metric) ? metric : 'seconds') : (['weight', 'volume', 'reps'].includes(metric) ? metric : 'weight')
  const labels = timed ? { seconds: 'Longest set (seconds)', duration: 'Total time (seconds)' } : { weight: `Top weight (${unit})`, volume: `Total volume (${unit})`, reps: 'Most reps in a set' }
  const best = Math.max(...points.map(point => point[activeMetric]))
  const latest = points.at(-1)[activeMetric]
  const first = points[0][activeMetric]
  return <div className="fitness-progress"><section className="fitness-panel"><div className="fitness-progress-controls"><label>Exercise<select aria-label="Exercise" value={key} onChange={event => setSelected(event.target.value)}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label>Track<select aria-label="Track" value={activeMetric} onChange={event => setMetric(event.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Unit{timed ? <input aria-label="Progress unit" readOnly value="sec" /> : <select aria-label="Progress unit" value={unit} onChange={event => setUnit(event.target.value)}><option value="lb">lb</option><option value="kg">kg</option></select>}</label></div><div className="fitness-progress-numbers"><div><span>Personal best</span><strong>{format(best)}<small>{timed ? ' sec' : activeMetric === 'reps' ? ' reps' : ` ${unit}`}</small></strong></div><div><span>Latest session</span><strong>{format(latest)}</strong></div><div><span>Since first session</span><strong>{latest - first > 0 ? '+' : ''}{format(latest - first)}</strong></div></div><ProgressChart points={points} metric={activeMetric} label={labels[activeMetric]} /><p className="fitness-muted">{timed ? 'Completed timed sets only. Longest set shows the most seconds in one set; total time sums completed sets for that session.' : 'Completed sets only. Volume = weight × reps, summed per session. Different units are converted for comparison. For bodyweight movements, track reps.'}</p></section><section className="fitness-panel"><h3>Behind the numbers</h3><div className="fitness-progress-table"><table><thead><tr><th>Date</th><th>Workout</th><th>{labels[activeMetric]}</th></tr></thead><tbody>{[...points].reverse().map(point => <tr key={point.id}><td>{dateLabel(point.date)}</td><td>{point.name}</td><td>{format(point[activeMetric])}</td></tr>)}</tbody></table></div></section></div>
}

function ProgressChart({ points, metric, label }) {
  const recent = points.slice(-24)
  const ceiling = Math.max(1, ...recent.map(point => point[metric])) * 1.1
  const x = index => recent.length === 1 ? 300 : 46 + index / (recent.length - 1) * 530
  const y = value => 180 - value / ceiling * 150
  return <figure className="fitness-chart"><figcaption>{label} · {recent.length === 1 ? 'First session logged' : `Last ${recent.length} sessions`}</figcaption><svg viewBox="0 0 600 225" role="img" aria-label={`${label} across ${recent.length} sessions; exact values are in the table below.`}>{[0, .5, 1].map(step => <g key={step}><line x1="46" x2="576" y1={y(ceiling * step)} y2={y(ceiling * step)} stroke="#d7bc8b28" /><text x="37" y={y(ceiling * step) + 4} textAnchor="end">{format(ceiling * step)}</text></g>)}<polyline points={recent.map((point, index) => `${x(index)},${y(point[metric])}`).join(' ')} fill="none" stroke="#69d6be" strokeWidth="3" strokeLinejoin="round" />{recent.map((point, index) => <circle key={point.id} cx={x(index)} cy={y(point[metric])} r="4.5" fill="#ff9854"><title>{dateLabel(point.date)}: {format(point[metric])}</title></circle>)}<text x="46" y="210">{dateLabel(recent[0].date)}</text><text x="576" y="210" textAnchor="end">{recent.length > 1 ? dateLabel(recent.at(-1).date) : ''}</text></svg></figure>
}

function DeleteDialog({ target, onCancel, onDelete }) {
  const dialog = useRef(null)
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close() }, [])
  return <dialog className="fitness-confirm" ref={dialog} onCancel={onCancel} aria-labelledby="fitness-confirm-title"><h3 id="fitness-confirm-title">Delete “{target.name}”?</h3><p>{target.kind === 'routine' ? 'Completed workouts stay in your history.' : 'This removes the workout and its results from progress.'}</p><div className="fitness-actions"><button autoFocus onClick={onCancel}>Keep it</button><button className="fitness-danger" onClick={onDelete}>Delete {target.kind === 'routine' ? 'routine' : 'workout'}</button></div></dialog>
}

function CardioForm({ busy, onCancel, onSave }) {
  const [session, setSession] = useState(() => ({ id: crypto.randomUUID(), name: 'Run', kind: 'cardio', unit: 'lb', performed_on: localDate(), started_at: new Date().toISOString(), completed_at: null, status: 'completed', routine_id: null, exercises: [], notes: '', minutes: '', distance: '', distance_unit: 'mi' }))
  return <form className="fitness-panel fitness-editor" onSubmit={event => { event.preventDefault(); onSave(session) }}><div className="fitness-section-title"><h3>Log a cardio event</h3><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div><div className="fitness-cardio-fields"><label>Activity<input list="fitness-cardio-activities" required maxLength={80} value={session.name} onChange={event => setSession({ ...session, name: event.target.value })} /><datalist id="fitness-cardio-activities">{['Run', 'Walk', 'Bike ride', 'Swim', 'Hike', 'Row', 'Elliptical'].map(name => <option key={name} value={name} />)}</datalist></label><label>Date<input type="date" required value={session.performed_on} max={localDate()} onChange={event => setSession({ ...session, performed_on: event.target.value })} /></label><label>Duration (minutes)<input required type="number" min="0.1" max="1440" step="0.1" value={session.minutes} onChange={event => setSession({ ...session, minutes: event.target.value })} /></label><label>Distance (optional)<input type="number" min="0" max="2000" step="0.01" value={session.distance} onChange={event => setSession({ ...session, distance: event.target.value })} /></label><label>Distance unit<select value={session.distance_unit} onChange={event => setSession({ ...session, distance_unit: event.target.value })}><option value="mi">Miles</option><option value="km">Kilometers</option></select></label></div><label>Notes<textarea rows={3} maxLength={2000} value={session.notes} placeholder="Route, effort, intervals, or how it felt…" onChange={event => setSession({ ...session, notes: event.target.value })} /></label><button className="fitness-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save cardio event'}</button></form>
}
function CardioSummary({ sessions }) {
  const minutes = sessions.reduce((sum, session) => sum + Number(session.minutes), 0)
  return <section className="fitness-panel"><div className="fitness-section-title"><h3>Cardio log</h3><span>{sessions.length} events · {format(minutes)} minutes total</span></div>{!sessions.length ? <p className="fitness-muted">Log your first event to start building a cardio history.</p> : <div className="fitness-progress-table"><table><thead><tr><th>Date</th><th>Activity</th><th>Time</th><th>Distance</th><th>Pace</th></tr></thead><tbody>{sessions.map(session => { const pace = session.distance > 0 ? Number(session.minutes) / Number(session.distance) : null; return <tr key={session.id}><td>{dateLabel(session.performed_on)}</td><td>{session.name}</td><td>{format(session.minutes)} min</td><td>{session.distance == null ? '—' : `${format(session.distance)} ${session.distance_unit}`}</td><td>{pace == null ? '—' : `${Math.floor(Math.round(pace * 60) / 60)}:${String(Math.round(pace * 60) % 60).padStart(2, '0')} / ${session.distance_unit}`}</td></tr> })}</tbody></table></div>}</section>
}

function TrainingPreferences({ name, value, busy, onSave }) {
  const [preferences, setPreferences] = useState(value)
  return <details className="fitness-training-notes"><summary>Training preferences for {name}{value ? ' · saved' : ''}</summary><form onSubmit={event => { event.preventDefault(); onSave(preferences) }}><label>Goals, equipment & schedule<textarea rows={3} maxLength={2000} value={preferences} disabled={busy} placeholder="My goals, equipment, available days, and movements I prefer…" onChange={event => setPreferences(event.target.value)} /></label><button type="submit" disabled={busy}>Save training preferences</button><p>These notes belong to {name} and help Patty tailor workouts for this profile.</p></form></details>
}

function MovementLibrary({ movements, routines, sessions, busy, onLink }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const filtered = searchMovements(query, movements, category)
  const unresolved = new Map()
  for (const record of [...routines, ...sessions]) for (const exercise of record.exercises) {
    if (!movementFor(exercise, movements)) unresolved.set(`${exercise.name}:${exercise.mode || 'reps'}`, exercise)
  }
  const active = sessions.some(session => session.status === 'draft')
  return <div className="fitness-library"><section className="fitness-panel"><div className="fitness-section-title"><div><p>ONE MOVEMENT. ONE HISTORY.</p><h3>Your movement library</h3></div><span>{movements.length} movements</span></div><p className="fitness-muted">Manual workouts and Patty use this same library. Equipment variations stay separate; Justin and Rosy keep their own progress. Add custom movements while building a routine.</p><div className="fitness-library-search"><label>Search movements<input value={query} placeholder="Search curls, dumbbells, legs…" onChange={event => setQuery(event.target.value)} /></label><label>Muscle group<select aria-label="Movement category" value={category} onChange={event => setCategory(event.target.value)}>{['All', ...new Set(movements.map(item => item.category).sort())].map(value => <option key={value}>{value}</option>)}</select></label></div><div className="fitness-library-list">{filtered.map(movement => <article key={movement.id}><div><strong>{movement.name}</strong><span>{movement.category} · {movement.equipment}</span></div><small>{movement.mode === 'timed' ? 'Time' : 'Reps & weight'}</small></article>)}{!filtered.length && <p className="fitness-muted">No movements match this search.</p>}</div></section>
    {unresolved.size > 0 && <section className="fitness-panel"><h3>Link older movement names</h3><p className="fitness-muted">Names such as “curls” need a specific variation. Choose what you actually performed to join its history. This updates only this training profile.</p>{active && <p className="fitness-muted">Finish or discard your active workout before linking older entries.</p>}{[...unresolved].map(([key, exercise]) => <LegacyMovement key={key} exercise={exercise} movements={movements} disabled={busy || active} onLink={onLink} />)}</section>}
  </div>
}
function LegacyMovement({ exercise, movements, disabled, onLink }) {
  const [selection, setSelection] = useState({ ...exercise, movement_id: null })
  return <div className="fitness-legacy-movement"><p>Previously logged as <strong>{exercise.name}</strong></p><MovementPicker label={`Link ${exercise.name} to`} exercise={selection} library={movements.filter(item => item.mode === (exercise.mode || 'reps'))} disabled={disabled} onSelect={patch => setSelection({ ...selection, ...patch })} /><button type="button" disabled={disabled || !selection.movement_id} onClick={() => onLink(exercise.name, selection.movement_id)}>Link history</button></div>
}
