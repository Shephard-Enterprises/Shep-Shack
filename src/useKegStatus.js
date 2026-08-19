import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useKegStatus() {
  const [keg, setKeg] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (document.visibilityState === 'hidden') return
      const { data, error: dbError } = await supabase.from('keg_readings').select('payload, recorded_at').order('recorded_at', { ascending: false }).limit(1).maybeSingle()
      if (cancelled) return
      if (data) {
        setKeg(data.payload); setLastUpdated(new Date(data.recorded_at)); setError(null)
      } else if (dbError) setError(dbError.message)

      setLoading(false)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  return { keg, error, loading, lastUpdated }
}
