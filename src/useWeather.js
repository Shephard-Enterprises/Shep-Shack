import { useEffect, useRef, useState } from 'react'

const SANTEE = { lat: 32.8384, lon: -116.9739 }
const TIME_ZONE = 'America/Los_Angeles'

export function useWeather({ enabled = true, intervalMs = 2 * 60_000, refreshKey = 0 } = {}) {
  const [weather, setWeather] = useState(null)
  const [hourly, setHourly] = useState([])
  const [daily, setDaily] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const hourlyUrl = useRef(null)
  const dailyUrl = useRef(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        if (!hourlyUrl.current) {
          const pointsResponse = await fetch(`https://api.weather.gov/points/${SANTEE.lat},${SANTEE.lon}`, {
            headers: { 'User-Agent': 'ShepShackDashboard/1.0' },
          })
          if (!pointsResponse.ok) throw new Error(`NWS points HTTP ${pointsResponse.status}`)
          const points = await pointsResponse.json()
          hourlyUrl.current = points.properties.forecastHourly
          dailyUrl.current = points.properties.forecast
        }

        const [hourlyResponse, dailyResponse] = await Promise.all([
          fetch(hourlyUrl.current, { cache: 'no-store', headers: { 'User-Agent': 'ShepShackDashboard/1.0' } }),
          fetch(dailyUrl.current, { cache: 'no-store', headers: { 'User-Agent': 'ShepShackDashboard/1.0' } }),
        ])
        if (!hourlyResponse.ok) throw new Error(`NWS hourly HTTP ${hourlyResponse.status}`)
        const hourlyData = await hourlyResponse.json()
        const periods = hourlyData.properties.periods
        const current = periods[0]

        let uvIndex = null
        let uvIndexMax = null
        try {
          const uvParams = new URLSearchParams({
            latitude: String(SANTEE.lat),
            longitude: String(SANTEE.lon),
            current: 'uv_index',
            daily: 'uv_index_max',
            timezone: TIME_ZONE,
            forecast_days: '1',
          })
          const uvResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${uvParams}`, { cache: 'no-store' })
          if (uvResponse.ok) {
            const uvData = await uvResponse.json()
            uvIndex = uvData.current?.uv_index ?? null
            uvIndexMax = uvData.daily?.uv_index_max?.[0] ?? null
          }
        } catch {
          // UV is supplemental; keep the primary NWS forecast.
        }

        if (cancelled) return
        setWeather({
          temp: current.temperature,
          description: current.shortForecast,
          windSpeed: current.windSpeed,
          windDirection: current.windDirection,
          humidity: current.relativeHumidity?.value,
          precipChance: current.probabilityOfPrecipitation?.value,
          uvIndex,
          uvIndexMax,
        })
        setHourly(periods.slice(0, 12).map(period => ({
          time: new Date(period.startTime).toLocaleTimeString([], { hour: 'numeric' }),
          temp: period.temperature,
          description: period.shortForecast,
          precipChance: period.probabilityOfPrecipitation?.value ?? 0,
          windSpeed: period.windSpeed,
          windDir: period.windDirection,
        })))
        if (dailyResponse.ok) {
          const dailyData = await dailyResponse.json()
          if (cancelled) return
          setDaily(dailyData.properties.periods.slice(0, 14).map(period => ({
            name: period.name,
            temp: period.temperature,
            tempUnit: period.temperatureUnit,
            isDay: period.isDaytime,
            description: period.shortForecast,
            precipChance: period.probabilityOfPrecipitation?.value ?? 0,
            windSpeed: period.windSpeed,
            windDir: period.windDirection,
          })))
        }
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

  return { weather, hourly, daily, error, loading, lastUpdated }
}
