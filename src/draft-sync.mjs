// Serialize cloud writes and rebase edits made while a save is in flight.
export function createDraftSync({ save, onState, onSaved, onError, online = () => true, delayMs = 1200 }) {
  let latest = null, revision = 0, savedRevision = 0, timer = null, running = null, conflict = false
  const state = value => onState?.(value)
  function queue(draft) {
    latest = latest?.id === draft.id ? { ...draft, updated_at: latest.updated_at } : draft
    revision++
    clearTimeout(timer)
    state(conflict ? 'conflict' : online() ? 'pending' : 'offline')
    if (!conflict && online()) timer = setTimeout(() => { flush().catch(() => {}) }, delayMs)
    return latest
  }
  function flush() {
    clearTimeout(timer)
    if (running) return running
    if (conflict) return Promise.reject(new Error('This workout changed on another device. Reload Fitness before saving again.'))
    running = (async () => {
      while (latest && savedRevision < revision) {
        if (!online()) {
          state('offline')
          throw new Error('You’re offline. Your workout is saved on this device and will sync when connected.')
        }
        const sent = latest, savingRevision = revision
        state('saving')
        try {
          const saved = await save(sent)
          const clean = savingRevision === revision
          latest = clean ? saved : { ...latest, updated_at: saved.updated_at }
          savedRevision = savingRevision
          onSaved?.({ sent, latest, clean })
        } catch (error) {
          conflict = error.code === 'FITNESS_CONFLICT'
          state(conflict ? 'conflict' : online() ? 'error' : 'offline')
          onError?.(error)
          throw error
        }
      }
      if (latest) state('saved')
      return latest
    })().finally(() => { running = null })
    return running
  }
  function reset() {
    clearTimeout(timer)
    latest = null; revision = 0; savedRevision = 0; conflict = false
    state('saved')
  }
  return { queue, flush, reset }
}
