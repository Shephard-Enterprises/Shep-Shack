import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useKegStatus() {
  const [keg, setKeg] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [history, setHistory] = useState([])
  const [pours, setPours] = useState([])
  const [latestKegChange, setLatestKegChange] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (document.visibilityState === 'hidden') return
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [{ data, error: dbError }, { data: readingHistory }, { data: pourHistory }, { data: kegChange }] = await Promise.all([
        supabase.from('keg_readings').select('payload, recorded_at').order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('keg_readings').select('payload, recorded_at').gte('recorded_at', since24h).order('recorded_at', { ascending: true }).limit(1500),
        supabase.from('keg_pours').select('id,poured_at,ounces,beer_oz_after').gte('poured_at', since7d).order('poured_at', { ascending: false }).limit(200),
        supabase.from('keg_changes').select('id,changed_at,starting_ounces,starting_percent').order('changed_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (cancelled) return
      if (data) {
        setKeg(data.payload); setLastUpdated(new Date(data.recorded_at)); setError(null)
      } else if (dbError) setError(dbError.message)
      setHistory((readingHistory ?? []).map(reading => ({ ...reading.payload, recordedAt: new Date(reading.recorded_at) })))
      setPours((pourHistory ?? []).map(pour => ({ id: pour.id, pouredAt: new Date(pour.poured_at), ounces: Number(pour.ounces), beerOzAfter: pour.beer_oz_after == null ? null : Number(pour.beer_oz_after) })))
      setLatestKegChange(kegChange ? { id: kegChange.id, changedAt: new Date(kegChange.changed_at), startingOunces: Number(kegChange.starting_ounces), startingPercent: Number(kegChange.starting_percent) } : null)

      setLoading(false)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  return { keg, history, pours, latestKegChange, error, loading, lastUpdated }
}
