import { useId, useRef, useState } from 'react'

export default function KegNameEditor({ data }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const inputId = useId()
  const dialog = useRef(null)
  const name = data.displayName ?? data.keg?.kegName ?? ''
  const fresh = data.lastUpdated && data.checkedAt - data.lastUpdated.getTime() < 120_000
  const synced = fresh && data.deviceName === data.displayName

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await data.saveName(draft)
      dialog.current.close()
      setSaved(true)
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }

  return <div className="keg-name-editor">
    <button type="button" onClick={() => {
      setDraft(name); setEditing(true); setError(null); setSaved(false); dialog.current.showModal()
    }}>Edit name</button>
    <dialog className="keg-name-dialog" ref={dialog} aria-labelledby={`${inputId}-title`}
      onClose={() => setEditing(false)} onCancel={event => { if (saving) event.preventDefault() }}>
    <h2 id={`${inputId}-title`}>Edit {data.scaleId === 'beer' ? 'beer' : 'water'} name</h2>
    <form onSubmit={submit}>
      <label htmlFor={inputId}>{data.scaleId === 'beer' ? 'Beer name' : 'Water name'}</label>
      <input id={inputId} value={draft} onChange={event => setDraft(event.target.value)}
        maxLength={32} required disabled={saving} autoFocus aria-describedby={`${inputId}-hint`}/>
      <small id={`${inputId}-hint`}>Up to 32 characters. Letters, numbers, spaces, and basic punctuation.</small>
      <div className="keg-name-actions">
        <button type="submit" disabled={saving || !draft.trim()}>{saving ? 'Saving…' : 'Save name'}</button>
        <button type="button" disabled={saving} onClick={() => { dialog.current.close(); setError(null) }}>Cancel</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    </dialog>
    {data.nameError && <p role="alert">{data.nameError}</p>}
    {!editing && data.displayName && <p role="status">
      {synced ? 'Display name synced' : saved ? 'Name saved. Waiting for the display to sync…' : 'Waiting for the display to sync…'}
      {!synced && <small>The display checks about once a minute while online.</small>}
    </p>}
  </div>
}
