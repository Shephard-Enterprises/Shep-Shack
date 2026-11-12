import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function normalizeKegPercent(payload, readingAt, kegChange) {
  const rawPercent = Number(payload?.percent)
  const startingPercent = Number(kegChange?.starting_percent)
  const changedAt = kegChange?.changed_at ? new Date(kegChange.changed_at) : null

  if (
    !Number.isFinite(rawPercent) ||
    !Number.isFinite(startingPercent) ||
    startingPercent <= 0 ||
    !changedAt ||
    readingAt < changedAt
  ) return payload

  return { ...payload, percent: Math.max(0, Math.min(100, rawPercent / startingPercent * 100)) }
}

export function useKegStatus({ scaleId = 'beer', enabled = true, includeHistory = true, intervalMs = 30_000, refreshKey = 0 } = {}) {
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
        const latestRequest = supabase.from('keg_scale_readings').select('payload, recorded_at').eq('scale_id', scaleId).order('recorded_at', { ascending: false }).limit(1).maybeSingle()
        const kegChangeRequest = supabase.from('keg_scale_changes').select('id,changed_at,starting_ounces,starting_percent').eq('scale_id', scaleId).order('changed_at', { ascending: false }).limit(1).maybeSingle()
        const detailRequests = includeHistory ? [
          supabase.from('keg_scale_readings').select('payload, recorded_at').eq('scale_id', scaleId).gte('recorded_at', since24h).order('recorded_at', { ascending: true }).limit(1500),
          supabase.from('keg_scale_pours').select('id,poured_at,ounces,beer_oz_after').eq('scale_id', scaleId).gte('poured_at', since30d).order('poured_at', { ascending: false }).limit(500),
        ] : []
        const [{ data, error: dbError }, { data: kegChange, error: changeError }, ...details] = await Promise.all([latestRequest, kegChangeRequest, ...detailRequests])
        if (cancelled) return
        const failure = dbError || changeError || details.find(result => result.error)?.error
        if (failure) throw new Error(failure.message)
        if (data) {
          const readingAt = new Date(data.recorded_at)
          setKeg(normalizeKegPercent(data.payload, readingAt, kegChange)); setLastUpdated(readingAt); setError(null)
        } else { setKeg(null); setLastUpdated(null); setError(null) }
        setLatestKegChange(kegChange ? { id: kegChange.id, changedAt: new Date(kegChange.changed_at), startingOunces: Number(kegChange.starting_ounces), startingPercent: Number(kegChange.starting_percent) } : null)
        if (includeHistory) {
          const [{ data: readingHistory }, { data: pourHistory }] = details
          setHistory((readingHistory ?? []).map(reading => ({ ...reading.payload, recordedAt: new Date(reading.recorded_at) })))
          setPours((pourHistory ?? []).map(pour => ({ id: pour.id, pouredAt: new Date(pour.poured_at), ounces: Number(pour.ounces), beerOzAfter: pour.beer_oz_after == null ? null : Number(pour.beer_oz_after) })))
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setLoading(false)
        inFlight = false
      }
    }
    load()
    const id = setInterval(load, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [scaleId, enabled, includeHistory, intervalMs, refreshKey])
  return { scaleId, keg, history, pours, latestKegChange, error, loading, lastUpdated }
}
