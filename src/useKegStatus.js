import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useKegStatus({ enabled = true, includeHistory = true, intervalMs = 30_000, refreshKey = 0 } = {}) {
  const [keg, setKeg] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [history, setHistory] = useState([])
  const [pours, setPours] = useState([])
  const [latestKegChange, setLatestKegChange] = useState(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      try {
        const latestRequest = supabase.from('keg_readings').select('payload, recorded_at').order('recorded_at', { ascending: false }).limit(1).maybeSingle()
        const detailRequests = includeHistory ? [
          supabase.from('keg_readings').select('payload, recorded_at').gte('recorded_at', since24h).order('recorded_at', { ascending: true }).limit(1500),
          supabase.from('keg_pours').select('id,poured_at,ounces,beer_oz_after').gte('poured_at', since30d).order('poured_at', { ascending: false }).limit(500),
          supabase.from('keg_changes').select('id,changed_at,starting_ounces,starting_percent').order('changed_at', { ascending: false }).limit(1).maybeSingle(),
        ] : []
        const [{ data, error: dbError }, ...details] = await Promise.all([latestRequest, ...detailRequests])
        if (cancelled) return
        if (data) {
          setKeg(data.payload); setLastUpdated(new Date(data.recorded_at)); setError(null)
        } else if (dbError) setError(dbError.message)
        if (includeHistory) {
          const [{ data: readingHistory }, { data: pourHistory }, { data: kegChange }] = details
          setHistory((readingHistory ?? []).map(reading => ({ ...reading.payload, recordedAt: new Date(reading.recorded_at) })))
          setPours((pourHistory ?? []).map(pour => ({ id: pour.id, pouredAt: new Date(pour.poured_at), ounces: Number(pour.ounces), beerOzAfter: pour.beer_oz_after == null ? null : Number(pour.beer_oz_after) })))
          setLatestKegChange(kegChange ? { id: kegChange.id, changedAt: new Date(kegChange.changed_at), startingOunces: Number(kegChange.starting_ounces), startingPercent: Number(kegChange.starting_percent) } : null)
        }
        setLoading(false)
      } finally {
        inFlight = false
      }
    }
    load()
    const id = setInterval(load, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, includeHistory, intervalMs, refreshKey])
  return { keg, history, pours, latestKegChange, error, loading, lastUpdated }
}
