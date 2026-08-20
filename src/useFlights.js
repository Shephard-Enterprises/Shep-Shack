import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const routeCache = new Map()

async function fetchRoute(callsign) {
  if (routeCache.has(callsign)) return routeCache.get(callsign)
  try {
    const response = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`)
    if (!response.ok) {
      routeCache.set(callsign, null)
      return null
    }
    const data = await response.json()
    const flightRoute = data.response?.flightroute
    const route = flightRoute ? {
      originCode: flightRoute.origin?.iata_code ?? null,
      originCity: flightRoute.origin?.municipality ?? flightRoute.origin?.name ?? null,
      destCode: flightRoute.destination?.iata_code ?? null,
      destCity: flightRoute.destination?.municipality ?? flightRoute.destination?.name ?? null,
      airline: flightRoute.airline?.name ?? null,
    } : null
    routeCache.set(callsign, route)
    return route
  } catch {
    routeCache.set(callsign, null)
    return null
  }
}

export function useFlights({ enabled = true, intervalMs = 60_000, refreshKey = 0 } = {}) {
  const [flights, setFlights] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const { data, error: functionError } = await supabase.functions.invoke('flights')
        if (functionError) throw new Error(functionError.message)
        if (data?.error) throw new Error(data.error)
        const airborne = (data.ac ?? [])
          .filter(aircraft => typeof aircraft.alt_baro === 'number' && aircraft.alt_baro > 0)
          .sort((a, b) => (a.dst ?? 999) - (b.dst ?? 999))
        const enriched = await Promise.all(airborne.map(async aircraft => {
          const callsign = aircraft.flight?.trim()
          const route = callsign ? await fetchRoute(callsign) : null
          return { ...aircraft, route }
        }))
        if (cancelled) return
        setFlights(enriched)
        setLastUpdated(new Date())
        setError(null)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        inFlight = false
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs, refreshKey])

  return { flights, lastUpdated, error, loading }
}
