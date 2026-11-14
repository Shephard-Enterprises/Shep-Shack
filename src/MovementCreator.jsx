import { useState } from 'react'
import { resolveMovement } from '../supabase/functions/_shared/movement-library.mjs'

export default function MovementCreator({ library, disabled, onSave, onCancel }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState('reps')
  const [category, setCategory] = useState('Custom')
  const [equipment, setEquipment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const existing = resolveMovement(name, library)
  async function save(event) {
    event.preventDefault()
    if (saving || disabled || existing || !name.trim()) return
    setSaving(true); setError('')
    try { await onSave(name, mode, { category, equipment }) }
    catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  return <form className="fitness-new-movement" onSubmit={save} aria-label="Add movement to library">
    <h3>New movement</h3>
    <p className="fitness-muted">Add it once for both profiles. Reps or Time is a default—you can change tracking in each workout.</p>
    <fieldset disabled={disabled || saving}>
      <div className="fitness-new-movement-fields">
        <label>Movement name<input autoFocus required maxLength={100} value={name} placeholder="e.g. Seated cable lateral raise" onChange={event => { setName(event.target.value); setError('') }} /></label>
        <label>Default tracking<select aria-label="Default tracking" value={mode} onChange={event => setMode(event.target.value)}><option value="reps">Reps</option><option value="timed">Time</option></select></label>
        <label>Muscle group<select aria-label="Muscle group" value={category} onChange={event => setCategory(event.target.value)}>{['Custom', 'Arms', 'Back', 'Chest', 'Core', 'Full body', 'Legs', 'Shoulders'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Equipment (optional)<input maxLength={60} value={equipment} placeholder="e.g. Cable, dumbbells, bodyweight" onChange={event => setEquipment(event.target.value)} /></label>
      </div>
      {existing && <p className="fitness-muted" role="status">Already in your library: <strong>{existing.name}</strong>. Use that entry to keep its history together.</p>}
      {error && <p className="fitness-error" role="alert">{error}</p>}
      <div className="fitness-actions"><button type="submit" className="fitness-primary" disabled={Boolean(existing) || !name.trim()}>{saving ? 'Saving…' : 'Save movement'}</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>
}
