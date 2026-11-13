import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import './AssistantWidget.css'
import pattyAvatar from './assets/patty.png'
import { FITNESS_PROFILES } from './fitness-model.mjs'

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
  async function loadThread(id) {
    const thread = check(await supabase.from('assistant_threads').select('messages').eq('id', id).single())
    setThreadId(id)
    setMessages(thread.messages)
    setDraft('')
  }
  async function openChat() {
    dialog.current.showModal()
    setLoading(true)
    setError('')
    try {
      const [nextBudget, profile, nextThreads, status] = await Promise.all([
        refreshBudget(),
        supabase.from('assistant_profiles').select('preferences').eq('user_id', userId).maybeSingle().then(check),
        refreshThreads(),
        assistant({ action: 'status' }),
      ])
      setCap(String(nextBudget.limit))
      setPreferences(profile?.preferences || '')
      setConfigured(status.configured)
      setWorkoutsReady(Boolean(status.capabilities?.adhocWorkouts))
      if (!busy) {
        const active = nextThreads.find(thread => thread.id === threadId) || nextThreads[0]
        if (active) await loadThread(active.id)
        else setMessages([])
      }
    } catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }
  function newChat() {
    setThreadId(crypto.randomUUID())
    setMessages([])
    setDraft('')
    setError('')
    setNotice('')
    setView('chat')
    input.current?.focus()
  }
  async function selectThread(id) {
    if (!id) { newChat(); return }
    setLoading(true)
    setError('')
    setNotice('')
    try { await loadThread(id) } catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }
  async function removeThread() {
    setBusy(true)
    setError('')
    try {
      check(await supabase.from('assistant_threads').delete().eq('id', threadId))
      await refreshThreads()
      newChat()
      setNotice('Conversation deleted.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
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
    try {
      const result = await assistant({ threadId, requestId: crypto.randomUUID(), message, page, profileId, saveAs })
      setMessages(result.messages)
      if (result.savedRoutineId || result.savedSessionId) window.dispatchEvent(new CustomEvent('fitness-updated', { detail: { profileId: result.fitnessProfileId } }))
      setDraft('')
      if (result.truncated) setNotice('The answer reached its length limit. Ask a follow-up to continue.')
    } catch (failure) { setError(failure.message) }
    finally {
      setPending('')
      try { await Promise.all([refreshBudget(), refreshThreads()]) } catch { setNotice('Could not refresh usage. Reopen chat to update it.') }
      setBusy(false)
      input.current?.focus()
    }
  }
  async function savePreferences(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      if (new TextEncoder().encode(preferences).length > 4000) throw new Error('Keep your saved preferences under 4,000 bytes.')
      check(await supabase.from('assistant_profiles').upsert({ user_id: userId, preferences }))
      setNotice('Saved. These preferences will be included in every chat.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  async function saveCap(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const amount = Number(cap)
      if (!cap.trim() || !Number.isFinite(amount) || amount < 0 || amount > 100) throw new Error('Choose a monthly cap from $0 to $100.')
      check(await supabase.rpc('assistant_set_limit', { p_limit: amount }))
      await refreshBudget()
      setNotice('Household monthly cap saved.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  const locked = busy || loading
  const atCap = budget && Number(budget.limit) - Number(budget.used) < 0.05
  const exists = threads.some(thread => thread.id === threadId)

  return <>
    <button ref={launcher} className="assistant-launcher" type="button" onClick={openChat} aria-label="Open Patty assistant" aria-haspopup="dialog">
      <img className="assistant-avatar" src={pattyAvatar} alt="" width="42" height="42" /><span>Ask Patty</span>
    </button>
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby="assistant-title" onClose={() => launcher.current?.focus()}>
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
        <div className="assistant-budget" aria-live="polite">{budget ? `${money(budget.used)} / $${Number(budget.limit).toFixed(2)} this month · household` : 'Loading monthly budget…'}</div>
        {loading && <p className="assistant-notice" role="status">Loading your assistant…</p>}
        {configured && !workoutsReady && !loading && <p className="assistant-notice">Patty’s updated workout service needs deployment before this version can send messages.</p>}
        {!configured && !loading && <p className="assistant-notice">Chat needs to be connected before it can answer. Your preferences and budget can still be saved.</p>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
        {notice && <p className="assistant-notice" role="status">{notice}</p>}
        {view === 'chat' ? <>
          <div className="assistant-training-profile"><label htmlFor="assistant-training-profile">Training for</label><select id="assistant-training-profile" value={profileId} disabled={locked} onChange={event => onProfileChange(event.target.value)}>{FITNESS_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><span>Workouts save here</span></div>
          <div className="assistant-training-profile"><label htmlFor="assistant-save-as">Save workouts as</label><select id="assistant-save-as" value={saveAs} disabled={locked} onChange={event => setSaveAs(event.target.value)}><option value="auto">Follow my request</option><option value="adhoc">One-off workout</option><option value="routine">Reusable routine</option></select></div>
          <div className="assistant-history">
            <label htmlFor="assistant-thread">Conversation</label>
            <select id="assistant-thread" value={exists ? threadId : ''} disabled={locked} onChange={event => selectThread(event.target.value)}>
              <option value="">New conversation</option>
              {threads.map(thread => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
            </select>
            {exists && <button type="button" disabled={locked} onClick={removeThread} aria-label="Delete selected conversation">Delete</button>}
          </div>
          <div className="assistant-messages" role="log" aria-label="Conversation messages" aria-busy={busy}>
            {!messages.length && !pending && <div className="assistant-welcome"><img className="assistant-avatar" src={pattyAvatar} alt="Patty" width="96" height="96" /><h3>What’s on your mind?</h3><p>Plan a workout, ask about a movement, or get help with your day.</p><p>Select a training profile above. I can set up your workout there. Open Fitness to review it and hit Start.</p><div>{['Write a one-off workout for today', 'How is my training progressing?'].map(prompt => <button key={prompt} type="button" disabled={locked} onClick={() => { setDraft(prompt); input.current?.focus() }}>{prompt} ↗</button>)}</div></div>}
            {messages.map((message, index) => <article key={index} className={`assistant-message ${message.role}`}><small>{message.role === 'user' ? 'YOU' : 'PATTY'}</small><div>{message.content}</div>{message.workoutId && <button className="assistant-open-workout" type="button" disabled={locked} onClick={() => { onOpenFitness(message.fitnessProfileId, message.workoutId); dialog.current.close() }}>Open in Fitness →</button>}</article>)}
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
