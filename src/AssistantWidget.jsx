import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import './AssistantWidget.css'
import pattyAvatar from './assets/patty.png'
import { FITNESS_PROFILES } from './fitness-model.mjs'
import { hasFitnessIntent } from '../supabase/functions/_shared/assistant-intent.mjs'

const AssistantMarkdown = lazy(() => import('./AssistantMarkdown'))

const pagePrompts = {
  home: ['Give me a household summary', 'What can you help me with?'],
  weather: ['What is the forecast today?', 'Will it rain soon?'],
  fire: ['Summarize current safety alerts', 'How is the air quality?'],
  flights: ['What aircraft is overhead?', 'Explain the flight radar'],
  sports: ['What are the latest scores?', 'Who plays next?'],
  keg: ['How much beer is left?', 'How many pours today?'],
  fitness: ['Write a one-off workout for today', 'How is my training progressing?'],
  house: ['How do I enable notifications?', 'Explain the dashboard settings'],
}

const money = value => `$${Number(value || 0).toFixed(3)}`
const check = result => { if (result.error) throw result.error; return result.data }

async function assistant(body) {
  const { data, error } = await supabase.functions.invoke('assistant', { body })
  if (error) {
    const details = await error.context?.json?.().catch(() => null)
    throw new Error(details?.error || 'Chat is unavailable. Check that the assistant function is deployed and try again.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function AssistantWidget({ userId, page, profileId, onProfileChange, onOpenFitness }) {
  const dialog = useRef(null)
  const launcher = useRef(null)
  const bottom = useRef(null)
  const input = useRef(null)
  // Ignore replies and history loads belonging to a conversation that was closed.
  const conversationVersion = useRef(0)
  const [view, setView] = useState('chat')
  const [threads, setThreads] = useState([])
  const [threadId, setThreadId] = useState(() => crypto.randomUUID())
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [saveAs, setSaveAs] = useState('auto')
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [workoutsReady, setWorkoutsReady] = useState(false)
  const [budget, setBudget] = useState(null)
  const [cap, setCap] = useState('5')
  const [preferences, setPreferences] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [workoutOptions, setWorkoutOptions] = useState(null)
  const showTraining = workoutOptions ?? (page === 'fitness' || hasFitnessIntent(draft))

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])

  async function refreshBudget() {
    const next = check(await supabase.rpc('assistant_budget'))
    setBudget(next)
    return next
  }
  async function refreshThreads() {
    const next = check(await supabase.from('assistant_threads').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(30))
    setThreads(next)
    return next
  }
  async function loadThread(id, version) {
    const thread = check(await supabase.from('assistant_threads').select('messages').eq('id', id).single())
    if (version !== conversationVersion.current) return
    setThreadId(id)
    setMessages(thread.messages)
    setDraft('')
  }
  async function openChat() {
    newChat()
    const version = conversationVersion.current
    dialog.current.showModal()
    setLoading(true)
    setError('')
    try {
      const [nextBudget, profile, , status] = await Promise.all([
        refreshBudget(),
        supabase.from('assistant_profiles').select('preferences').eq('user_id', userId).maybeSingle().then(check),
        refreshThreads(),
        assistant({ action: 'status' }),
      ])
      if (version !== conversationVersion.current) return
      setCap(String(nextBudget.limit))
      setPreferences(profile?.preferences || '')
      setConfigured(status.configured)
      setWorkoutsReady(Boolean(status.capabilities?.adhocWorkouts && status.capabilities?.routineEditing && status.capabilities?.routineUndo))
    } catch (failure) {
      if (version === conversationVersion.current) setError(failure.message)
    } finally {
      if (version === conversationVersion.current) setLoading(false)
    }
  }
  function newChat() {
    conversationVersion.current += 1
    setPending('')
    setBusy(false)
    setLoading(false)
    setSaveAs('auto')
    setThreadId(crypto.randomUUID())
    setMessages([])
    setDraft('')
    setError('')
    setNotice('')
    setView('chat')
    setWorkoutOptions(null)
    if (dialog.current?.open) input.current?.focus()
  }
  function closeChat() {
    newChat()
    launcher.current?.focus()
  }
  async function selectThread(id) {
    if (!id) { newChat(); return }
    setLoading(true)
    setError('')
    setNotice('')
    const version = ++conversationVersion.current
    try { await loadThread(id, version) } catch (failure) {
      if (version === conversationVersion.current) setError(failure.message)
    } finally {
      if (version === conversationVersion.current) setLoading(false)
    }
  }
  async function removeThread() {
    const version = conversationVersion.current
    setBusy(true)
    setError('')
    try {
      check(await supabase.from('assistant_threads').delete().eq('id', threadId))
      await refreshThreads()
      if (version !== conversationVersion.current) return
      newChat()
      setNotice('Conversation deleted.')
    } catch (failure) { if (version === conversationVersion.current) setError(failure.message) }
    finally { if (version === conversationVersion.current) setBusy(false) }
  }
  async function send(event) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || busy || loading) return
    if (new TextEncoder().encode(message).length > 6000) { setError('Please keep your message under 6,000 bytes.'); return }
    setBusy(true)
    setError('')
    setNotice('')
    setPending(message)
    const version = conversationVersion.current
    try {
      const result = await assistant({ threadId, requestId: crypto.randomUUID(), message, page, profileId, saveAs: showTraining ? saveAs : 'auto' })
      if (result.savedRoutineId || result.savedSessionId) window.dispatchEvent(new CustomEvent('fitness-updated', { detail: { profileId: result.fitnessProfileId } }))
      if (version !== conversationVersion.current) return
      setMessages(result.messages)
      setDraft('')
      if (result.truncated) setNotice('The answer reached its length limit. Ask a follow-up to continue.')
    } catch (failure) {
      if (version === conversationVersion.current) setError(failure.message)
    } finally {
      try { await Promise.all([refreshBudget(), refreshThreads()]) } catch {
        if (version === conversationVersion.current) setNotice('Could not refresh usage. Reopen chat to update it.')
      }
      if (version === conversationVersion.current) {
        setPending('')
        setBusy(false)
        input.current?.focus()
      }
    }
  }
  async function undoRoutine(message) {
    const version = conversationVersion.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await assistant({ action: 'undoRoutine', changeId: message.changeId })
      window.dispatchEvent(new CustomEvent('fitness-updated', { detail: { profileId: result.fitnessProfileId } }))
      if (version !== conversationVersion.current) return
      setMessages(current => current.map(item => item.changeId === message.changeId ? { ...item, changeUndone: true } : item))
      setNotice(result.removed ? 'Removed the routine Patty created.' : 'Restored the routine to its previous version.')
    } catch (failure) {
      if (version === conversationVersion.current) setError(failure.message)
    } finally {
      if (version === conversationVersion.current) setBusy(false)
    }
  }
  async function savePreferences(event) {
    event.preventDefault()
    const version = conversationVersion.current
    setBusy(true); setError(''); setNotice('')
    try {
      if (new TextEncoder().encode(preferences).length > 4000) throw new Error('Keep your saved preferences under 4,000 bytes.')
      check(await supabase.from('assistant_profiles').upsert({ user_id: userId, preferences }))
      if (version !== conversationVersion.current) return
      setNotice('Saved. These preferences will be included in every chat.')
    } catch (failure) { if (version === conversationVersion.current) setError(failure.message) }
    finally { if (version === conversationVersion.current) setBusy(false) }
  }
  async function saveCap(event) {
    event.preventDefault()
    const version = conversationVersion.current
    setBusy(true); setError(''); setNotice('')
    try {
      const amount = Number(cap)
      if (!cap.trim() || !Number.isFinite(amount) || amount < 0 || amount > 100) throw new Error('Choose a monthly cap from $0 to $100.')
      check(await supabase.rpc('assistant_set_limit', { p_limit: amount }))
      await refreshBudget()
      if (version !== conversationVersion.current) return
      setNotice('Household monthly cap saved.')
    } catch (failure) { if (version === conversationVersion.current) setError(failure.message) }
    finally { if (version === conversationVersion.current) setBusy(false) }
  }
  const locked = busy || loading
  const atCap = budget && Number(budget.limit) - Number(budget.used) < 0.05
  const exists = threads.some(thread => thread.id === threadId)

  return <>
    <button ref={launcher} className="assistant-launcher" type="button" onClick={openChat} aria-label="Open Patty assistant" aria-haspopup="dialog">
      <img className="assistant-avatar" src={pattyAvatar} alt="" width="42" height="42" /><span>Ask Patty</span>
    </button>
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby="assistant-title" onClose={closeChat}>
      <div className="assistant-shell">
        <header className="assistant-header">
          <div className="assistant-brand"><img className="assistant-avatar" src={pattyAvatar} alt="" width="48" height="48" /><div><small>YOUR EVERYDAY ASSISTANT</small><h2 id="assistant-title">Ask Patty</h2></div></div>
          <button type="button" aria-label="Close assistant" onClick={() => dialog.current.close()}>×</button>
        </header>
        <div className="assistant-tabs" role="group" aria-label="Assistant views">
          <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>Chat</button>
          <button type="button" aria-pressed={view === 'settings'} onClick={() => setView('settings')}>Preferences & budget</button>
          <button type="button" onClick={newChat} disabled={locked}>+ New</button>
        </div>
        {view === 'settings' && <div className="assistant-budget" aria-live="polite">{budget ? `${money(budget.used)} / $${Number(budget.limit).toFixed(2)} this month · household` : 'Loading monthly budget…'}</div>}
        {loading && <p className="assistant-notice" role="status">Loading your assistant…</p>}
        {configured && !workoutsReady && !loading && <p className="assistant-notice">Patty’s updated workout service needs deployment before this version can send messages.</p>}
        {!configured && !loading && <p className="assistant-notice">Chat needs to be connected before it can answer. Your preferences and budget can still be saved.</p>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
        {notice && <p className="assistant-notice" role="status">{notice}</p>}
        {view === 'chat' ? <>
          <button className="assistant-workout-toggle" type="button" aria-expanded={showTraining} aria-controls="assistant-workout-options" onClick={() => setWorkoutOptions(!showTraining)}>Workout options{showTraining ? ' −' : ' +'}</button>
          {showTraining && <div id="assistant-workout-options"><div className="assistant-training-profile"><label htmlFor="assistant-training-profile">Default profile</label><select id="assistant-training-profile" value={profileId} disabled={locked} onChange={event => onProfileChange(event.target.value)}>{FITNESS_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><span>Or ask Patty to use another profile</span></div>
          <div className="assistant-training-profile"><label htmlFor="assistant-save-as">Save workouts as</label><select id="assistant-save-as" value={saveAs} disabled={locked} onChange={event => setSaveAs(event.target.value)}><option value="auto">Follow my request</option><option value="adhoc">One-off workout</option><option value="routine">Reusable routine</option></select></div>
          </div>}
          <details className="assistant-conversations"><summary>Conversations{threads.length ? ` (${threads.length})` : ''}</summary><div className="assistant-history">
            <label htmlFor="assistant-thread">Conversation</label>
            <select id="assistant-thread" value={exists ? threadId : ''} disabled={locked} onChange={event => selectThread(event.target.value)}>
              <option value="">New conversation</option>
              {threads.map(thread => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
            </select>
            {exists && <button type="button" disabled={locked} onClick={removeThread} aria-label="Delete selected conversation">Delete</button>}
          </div></details>
          <div className="assistant-quick-prompts" aria-label="Suggested questions">{(pagePrompts[page] || pagePrompts.home).map(prompt => <button key={prompt} type="button" disabled={locked} onClick={() => { setWorkoutOptions(null); setDraft(prompt); input.current?.focus() }}>{prompt}</button>)}</div>
          <div className="assistant-messages" role="log" aria-label="Conversation messages" aria-busy={busy}>
            {!messages.length && !pending && <div className="assistant-welcome"><img className="assistant-avatar" src={pattyAvatar} alt="Patty" width="96" height="96" /><h3>What’s on your mind?</h3><p>{page === 'fitness' ? 'Plan a workout or ask about your progress. Review any saved workout in Fitness, then hit Start.' : 'Ask about this dashboard, plan a workout, or get help with your day.'}</p></div>}
            {messages.map((message, index) => <article key={index} className={`assistant-message ${message.role}`}><small>{message.role === 'user' ? 'YOU' : 'PATTY'}</small>{message.role === 'assistant' ? <Suspense fallback={<div>{message.content}</div>}><AssistantMarkdown>{message.content}</AssistantMarkdown></Suspense> : <div>{message.content}</div>}{message.changeId && <div className="assistant-routine-change"><strong>{message.profileName} · {message.routineName}</strong>{message.changeUndone ? <p role="status">Change undone</p> : <><ul>{message.changeSummary?.map((change, i) => <li key={i}>{change}</li>)}</ul><button type="button" disabled={locked} onClick={() => undoRoutine(message)}>Undo routine change</button></>}</div>}{message.workoutId && !message.changeUndone && <button className="assistant-open-workout" type="button" disabled={locked} onClick={() => { onOpenFitness(message.fitnessProfileId, message.workoutId); dialog.current.close() }}>Open in Fitness →</button>}</article>)}
            {pending && <><article className="assistant-message user"><small>YOU</small><div>{pending}</div></article><p className="assistant-thinking" role="status">Patty is thinking…</p></>}
            <div ref={bottom} />
          </div>
          {atCap && <p className="assistant-notice">Monthly cap reached. Adjust it in Preferences & budget to continue.</p>}
          <form className="assistant-compose" onSubmit={send}>
            <label className="assistant-sr-only" htmlFor="assistant-message">Message Patty</label>
            <textarea ref={input} id="assistant-message" placeholder="Ask anything…" value={draft} maxLength={6000} disabled={locked} onChange={event => setDraft(event.target.value)} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) { event.preventDefault(); event.currentTarget.form.requestSubmit() } }} />
            <button type="submit" disabled={locked || !configured || !workoutsReady || !draft.trim() || atCap}>{busy ? 'Thinking…' : 'Send ↑'}</button>
          </form>
          <p className="assistant-footnote">Powered by OpenAI · Chats saved to your account · Recent messages provide context</p>
        </> : <div className="assistant-settings">
          <form onSubmit={savePreferences}>
            <h3>What should Patty know?</h3><p>Your goals, available equipment, preferences, or a summary from your old workout chat. Included in every new conversation.</p>
            <label htmlFor="assistant-preferences">About you</label>
            <textarea id="assistant-preferences" rows={6} maxLength={4000} value={preferences} disabled={locked} onChange={event => setPreferences(event.target.value)} placeholder="I train 3 days a week. My goal is strength. I have…" />
            <button type="submit" disabled={locked}>Save preferences</button>
          </form>
          <form onSubmit={saveCap}>
            <h3>Monthly spending cap</h3><p>Shared across the household. Resets on the first of each month, Pacific time. Set $0 to pause chat.</p>
            <label htmlFor="assistant-cap">Monthly cap (USD)</label>
            <input id="assistant-cap" type="number" min="0" max="100" step="0.01" required value={cap} disabled={locked} onChange={event => setCap(event.target.value)} />
            <button type="submit" disabled={locked}>Save cap</button>
            <p className="assistant-setting-note">Each answer temporarily holds up to $0.05, then counts its estimated token cost. Uncertain charges keep the hold. This cap covers this app’s chat only.</p>
          </form>
          <p className="assistant-setting-note">Your chats are private to your login. Up to 30 conversations are saved, with 30 exchanges each. Inactive chats expire after 180 days. This assistant has its own history and saved preferences.</p>
        </div>}
      </div>
    </dialog>
  </>
}
