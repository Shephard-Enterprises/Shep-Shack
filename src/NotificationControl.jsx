import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BJ97HmDt2-WmESdjmCtOTHtX7EVTCpkU9pVHSB9rHPTNi8afjJoWRkU52lWR7btiVH4OvEHQUdCS463Fp-AYLLk'
const DEFAULT_PREFERENCES = { fire: true, earthquake: true, weather: true, emergency: true, keg: true, padres: true }
const PREFERENCE_LABELS = { fire: 'Nearby fires', earthquake: 'Noticeable earthquakes', weather: 'Weather & open-house alerts', emergency: 'County emergency notices', keg: 'Keg level & sensor', padres: 'San Diego sports start & final' }

function decodeKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

export default function NotificationControl({ userId, mode = 'inbox', onOpenSettings }) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [events, setEvents] = useState([])
  const [readKeys, setReadKeys] = useState(new Set())
  const [message, setMessage] = useState(null)
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  const loadInbox = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: notices }, { data: reads }] = await Promise.all([
      supabase.from('notification_events').select('event_key,category,title,body,url,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
      supabase.from('notification_reads').select('event_key').eq('user_id', userId),
    ])
    setEvents(notices ?? [])
    setReadKeys(new Set((reads ?? []).map(read => read.event_key)))
  }, [userId])

  useEffect(() => {
    const inboxTimer = mode === 'inbox' ? window.setTimeout(loadInbox, 0) : null
    if (!supported) return
    navigator.serviceWorker.ready.then(async registration => {
      const subscription = await registration.pushManager.getSubscription()
      setEnabled(Boolean(subscription) && Notification.permission === 'granted')
      if (subscription) {
        const { data } = await supabase.from('push_subscriptions').select('preferences').eq('endpoint', subscription.endpoint).maybeSingle()
        if (data?.preferences) setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences })
      }
    })
    return () => { if (inboxTimer) window.clearTimeout(inboxTimer) }
  }, [loadInbox, mode, supported])

  async function enableNotifications() {
    setMessage(null)
    if (!supported) { setMessage('Push notifications are not supported on this device.'); return }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') { setMessage('Notification permission was not granted.'); return }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(VAPID_PUBLIC_KEY) })
    const value = subscription.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth, preferences }, { onConflict: 'endpoint' })
    if (error) setMessage(error.message)
    else { setEnabled(true); setMessage('Notifications are on for this iPhone.') }
  }

  async function disableNotifications() {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      await subscription.unsubscribe()
    }
    setEnabled(false); setMessage('Notifications are off on this device.')
  }

  async function togglePreference(key) {
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) await supabase.from('push_subscriptions').update({ preferences: next, updated_at: new Date().toISOString() }).eq('endpoint', subscription.endpoint)
  }

  async function markRead(eventKey) {
    if (readKeys.has(eventKey)) return
    setReadKeys(current => new Set(current).add(eventKey))
    await supabase.from('notification_reads').upsert({ user_id: userId, event_key: eventKey })
  }

  async function markAllRead() {
    const unread = events.filter(event => !readKeys.has(event.event_key))
    if (!unread.length) return
    setReadKeys(new Set(events.map(event => event.event_key)))
    await supabase.from('notification_reads').upsert(unread.map(event => ({ user_id: userId, event_key: event.event_key })))
  }

  const unreadCount = events.filter(event => !readKeys.has(event.event_key)).length
  const settings = <>
    <p className="cardLabel">iPhone notifications</p>
    <h3>{enabled ? 'Notifications on' : 'Stay in the loop'}</h3>
    {!enabled ? <button className="loginButton" type="button" onClick={enableNotifications}>Enable notifications</button> : <>
      {Object.entries(PREFERENCE_LABELS).map(([key, label]) => <label className="preferenceRow" key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={() => togglePreference(key)} /></label>)}
      <button className="textButton" type="button" onClick={disableNotifications}>Turn off on this device</button>
    </>}
    {message && <p className="notificationMessage">{message}</p>}
    {!window.matchMedia('(display-mode: standalone)').matches && <p className="notificationHint">On iPhone, first add Shep Shack to your Home Screen, then open it there.</p>}
  </>

  if (mode === 'settings') return <div className="notificationSettings">{settings}</div>

  return <div className="notificationControl">
    <button className={`notificationButton ${enabled ? 'enabled' : ''}`} type="button" onClick={() => { setOpen(value => !value); loadInbox() }} aria-label={`${unreadCount} unread notifications`} aria-expanded={open}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
      {unreadCount > 0 && <span className="notificationCount">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
    {open && <div className="notificationPanel notificationInbox">
      <div className="inboxHeader"><div><p className="cardLabel">Recent activity</p><h3>Notifications</h3></div>{unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}</div>
      <div className="inboxList">{events.length ? events.map(event => <a className={`inboxItem ${readKeys.has(event.event_key) ? '' : 'unread'}`} href={`${import.meta.env.BASE_URL}${(event.url || '/').replace(/^\//, '')}`} onClick={() => markRead(event.event_key)} key={event.event_key}><span className="inboxIcon">{event.category === 'padres' ? 'SD' : event.category.slice(0, 1).toUpperCase()}</span><span><strong>{event.title}</strong><small>{event.body}</small><time>{new Date(event.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span></a>) : <p className="notificationEmpty">No notifications yet.</p>}</div>
      <button className="textButton inboxSettingsButton" type="button" onClick={() => { setOpen(false); onOpenSettings?.() }}>Notification settings</button>
    </div>}
  </div>
}
