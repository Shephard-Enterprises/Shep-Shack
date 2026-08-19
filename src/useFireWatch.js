import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useFireWatch() {
  const [incidents, setIncidents] = useState([])
  const [fires, setFires] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (document.visibilityState === 'hidden') return
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
    }

    load()
    const id = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return { incidents, fires, error, loading, lastUpdated }
}
