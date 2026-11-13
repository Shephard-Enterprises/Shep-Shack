import { useId, useState } from 'react'
import { resolveMovement, searchMovements } from '../supabase/functions/_shared/movement-library.mjs'

export default function MovementPicker({ exercise, library, disabled, onSelect, onCreate, label = 'Movement' }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const options = searchMovements(exercise.name, library).slice(0, 8)
  const linked = library.find(item => item.id === exercise.movement_id) || resolveMovement(exercise.name, library)
  function select(movement) {
    onSelect({ name: movement.name, movement_id: movement.id, mode: movement.mode, ...(movement.mode === 'timed' ? { seconds: exercise.seconds || 30 } : { reps: exercise.reps || '8–12' }) })
    setOpen(false); setActive(-1); setError('')
  }
  async function create() {
    setCreating(true); setError('')
    try { select(await onCreate(exercise.name, exercise.mode || 'reps')) }
    catch (failure) { setError(failure.message) }
    finally { setCreating(false) }
  }
  const createButton = onCreate && exercise.name.trim() && !linked ? <button type="button" className="fitness-add-movement" disabled={disabled || creating} onClick={create}>{creating ? 'Adding…' : `+ Add “${exercise.name.trim()}” as a custom movement`}</button> : null
  return <div className="fitness-movement-picker fitness-exercise-name" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" autoComplete="off" required maxLength={100} value={exercise.name} disabled={disabled || creating} placeholder="Search movements, e.g. curls" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 && options[active] ? `${id}-option-${active}` : undefined} aria-describedby={`${id}-hint`} onFocus={() => setOpen(true)} onChange={event => {
      const name = event.target.value
      const match = resolveMovement(name, library)
      if (match) { select(match); setOpen(true) } else { onSelect({ name, movement_id: null }); setOpen(true) }
      setActive(-1)
    }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(-1, index - 1)) }
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
      if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && options[active]) select(options[active]); else if (linked) select(linked) }
    }} />
    {open && options.length > 0 && <ul id={`${id}-options`} role="listbox" aria-label={`${label} matches`} className="fitness-movement-options">
      {options.map((movement, index) => <li key={movement.id} role="option" id={`${id}-option-${index}`} aria-selected={active === index}><button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => select(movement)}><strong>{movement.name}</strong><span>{movement.category} · {movement.equipment}{movement.mode === 'timed' ? ' · timed' : ''}</span></button></li>)}
      {createButton && <li role="presentation">{createButton}</li>}
    </ul>}
    <small id={`${id}-hint`}>{linked ? `Shared tracking: ${linked.name}` : 'Choose a specific variation so its progress stays together.'}</small>
    {(!open || !options.length) && createButton}
    {error && <small className="fitness-error" role="alert">{error}</small>}
  </div>
}
