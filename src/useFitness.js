import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { normalizeSession, validateRoutine } from './fitness-model.mjs'
import { linkExercises, resolveMovement } from '../supabase/functions/_shared/movement-library.mjs'

const check = result => { if (result.error) throw result.error; return result.data }
const sessionFields = session => Object.fromEntries(['id', 'routine_id', 'name', 'unit', 'performed_on', 'started_at', 'completed_at', 'status', 'kind', 'minutes', 'distance', 'distance_unit', 'notes', 'exercises'].map(field => [field, session[field]]))
export default function useFitness(userId, profileId) {
  const [routines, setRoutines] = useState([])
  const [sessions, setSessions] = useState([])
  const [movements, setMovements] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const [nextRoutines, nextSessions, nextProfile, nextMovements] = await Promise.all([
      supabase.from('fitness_routines').select('*').eq('profile_id', profileId).order('updated_at', { ascending: false }).then(check),
      (async () => {
        const all = []
        for (let offset = 0; ; offset += 200) {
          const batch = check(await supabase.from('fitness_sessions').select('*').eq('profile_id', profileId).order('performed_on', { ascending: false }).order('completed_at', { ascending: false }).order('id').range(offset, offset + 199))
          all.push(...batch)
          if (batch.length < 200) return all
        }
      })(),
      supabase.from('fitness_profiles').select('id,name,preferences').eq('id', profileId).single().then(check),
      supabase.from('fitness_movements').select('*').order('name').then(check),
    ])
    setRoutines(nextRoutines); setSessions(nextSessions); setProfile(nextProfile); setMovements(nextMovements); setError('')
    return { routines: nextRoutines, sessions: nextSessions }
  }, [profileId])
  useEffect(() => {
    let active = true
    Promise.resolve().then(reload).catch(failure => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])
  useEffect(() => {
    const refresh = event => { if (event.detail?.profileId === profileId) reload().catch(failure => setError(failure.message)) }
    window.addEventListener('fitness-updated', refresh)
    return () => window.removeEventListener('fitness-updated', refresh)
  }, [profileId, reload])
  async function saveRoutine(raw) {
    const routine = validateRoutine(raw)
    const fields = { id: routine.id, user_id: userId, profile_id: profileId, name: routine.name, unit: routine.unit, notes: routine.notes, exercises: linkExercises(routine.exercises, movements) }
    const existing = routines.find(item => item.id === routine.id)
    const query = existing ? supabase.from('fitness_routines').update(fields).eq('id', routine.id).eq('profile_id', profileId).eq('updated_at', existing.updated_at) : supabase.from('fitness_routines').insert(fields)
    const saved = check(await query.select().single())
    setRoutines(current => [saved, ...current.filter(item => item.id !== saved.id)])
    return saved
  }
  async function saveSession(raw, complete = false) {
    const session = normalizeSession(raw, complete)
    const fields = { ...sessionFields(session), user_id: userId, profile_id: profileId }
    const query = session.updated_at ? supabase.from('fitness_sessions').update(fields).eq('id', session.id).eq('profile_id', profileId).eq('updated_at', session.updated_at) : supabase.from('fitness_sessions').insert(fields)
    const result = await query.select().single()
    if (result.error?.code === 'PGRST116') throw new Error('This workout changed on another device. Reload Fitness before saving again.')
    if (result.error?.code === '23505') throw new Error('A workout is already in progress. Reload Fitness to resume it.')
    const saved = check(result)
    setSessions(current => [saved, ...current.filter(item => item.id !== saved.id)].sort((a, b) => b.performed_on.localeCompare(a.performed_on) || (b.completed_at || b.started_at).localeCompare(a.completed_at || a.started_at)))
    return saved
  }
  async function remove(kind, id) {
    const table = kind === 'routine' ? 'fitness_routines' : 'fitness_sessions'
    check(await supabase.from(table).delete().eq('id', id).eq('profile_id', profileId))
    if (kind === 'routine') {
      setRoutines(current => current.filter(item => item.id !== id))
      setSessions(current => current.map(item => item.routine_id === id ? { ...item, routine_id: null } : item))
    } else setSessions(current => current.filter(item => item.id !== id))
  }
  async function savePreferences(preferences) {
    if (preferences.length > 2000) throw new Error('Keep training notes under 2,000 characters.')
    const saved = check(await supabase.from('fitness_profiles').update({ preferences }).eq('id', profileId).select().single())
    setProfile(saved)
  }
  async function createMovement(name, mode) {
    const existing = resolveMovement(name, movements)
    if (existing) return existing
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100) throw new Error('Enter a movement name up to 100 characters.')
    const result = await supabase.from('fitness_movements').insert({ id: `custom-${crypto.randomUUID()}`, name: trimmed, mode, category: 'Custom', equipment: 'Other', aliases: [], created_by: userId }).select().single()
    if (result.error?.code === '23505') {
      const library = check(await supabase.from('fitness_movements').select('*').order('name'))
      setMovements(library)
      const found = resolveMovement(trimmed, library)
      if (found) return found
    }
    const saved = check(result)
    setMovements(current => [...current, saved])
    return saved
  }
  async function linkHistory(name, movementId) {
    check(await supabase.rpc('fitness_link_history', { p_profile: profileId, p_name: name, p_movement: movementId }))
    await reload()
  }
  return { routines, sessions, profile, movements, createMovement, linkHistory, loading, error, reload, saveRoutine, saveSession, savePreferences, remove }
}
