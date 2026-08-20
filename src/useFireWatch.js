import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useFireWatch({ enabled = true, intervalMs = 5 * 60_000, refreshKey = 0 } = {}) {
  const [incidents, setIncidents] = useState([])
  const [fires, setFires] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const { data, error: functionError } = await supabase.functions.invoke('fire-watch')
        if (cancelled) return
        if (functionError || data?.error) setError(functionError?.message ?? data.error)
        else setError(null)
        if (data) {
          setIncidents(data.incidents ?? [])
          setFires(data.fires ?? [])
          setLastUpdated(data.updatedAt ? new Date(data.updatedAt) : new Date())
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
  }, [enabled, intervalMs, refreshKey])

  return { incidents, fires, error, loading, lastUpdated }
}
