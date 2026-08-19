import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabase'
import { useFireWatch } from './useFireWatch'
import { useKegStatus } from './useKegStatus'
import NotificationControl from './NotificationControl'

// Public, approximate city-center coordinates. Precise household coordinates stay server-side.
const SANTEE = { lat: 32.8384, lon: -116.9739 }
const RADIUS_MI = 5
const TIME_ZONE = 'America/Los_Angeles'

// --- Helpers ---

function degToCompass(deg) {
  if (deg == null) return '—'
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

function formatAlt(alt) {
  if (alt == null || alt === 'ground') return '—'
  return `${(Math.round(alt / 100) * 100).toLocaleString()} ft`
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function kmToMi(km) {
  return km * 0.621371
}

const AIRCRAFT_NAMES = {
  'A19N': 'Airbus A319neo', 'A20N': 'Airbus A320neo', 'A21N': 'Airbus A321neo',
  'A318': 'Airbus A318', 'A319': 'Airbus A319', 'A320': 'Airbus A320', 'A321': 'Airbus A321',
  'A332': 'Airbus A330-200', 'A333': 'Airbus A330-300', 'A338': 'Airbus A330-800neo', 'A339': 'Airbus A330-900neo',
  'A342': 'Airbus A340-200', 'A343': 'Airbus A340-300', 'A359': 'Airbus A350-900', 'A35K': 'Airbus A350-1000',
  'A388': 'Airbus A380-800',
  'B37M': 'Boeing 737 MAX 7', 'B38M': 'Boeing 737 MAX 8', 'B39M': 'Boeing 737 MAX 9', 'B3XM': 'Boeing 737 MAX 10',
  'B712': 'Boeing 717-200', 'B721': 'Boeing 727-100', 'B722': 'Boeing 727-200',
  'B732': 'Boeing 737-200', 'B733': 'Boeing 737-300', 'B734': 'Boeing 737-400', 'B735': 'Boeing 737-500',
  'B736': 'Boeing 737-600', 'B737': 'Boeing 737-700', 'B738': 'Boeing 737-800', 'B739': 'Boeing 737-900',
  'B741': 'Boeing 747-100', 'B742': 'Boeing 747-200', 'B743': 'Boeing 747-300', 'B744': 'Boeing 747-400',
  'B748': 'Boeing 747-8', 'B74F': 'Boeing 747-400F',
  'B752': 'Boeing 757-200', 'B753': 'Boeing 757-300',
  'B762': 'Boeing 767-200', 'B763': 'Boeing 767-300', 'B764': 'Boeing 767-400',
  'B772': 'Boeing 777-200', 'B77L': 'Boeing 777-200LR', 'B773': 'Boeing 777-300', 'B77W': 'Boeing 777-300ER',
  'B778': 'Boeing 777X-8', 'B779': 'Boeing 777X-9',
  'B788': 'Boeing 787-8', 'B789': 'Boeing 787-9', 'B78X': 'Boeing 787-10',
  'MD11': 'McDonnell Douglas MD-11', 'MD81': 'MD-81', 'MD82': 'MD-82', 'MD83': 'MD-83', 'MD88': 'MD-88', 'MD90': 'MD-90',
  'DC10': 'Douglas DC-10',
  'E135': 'Embraer ERJ-135', 'E145': 'Embraer ERJ-145',
  'E170': 'Embraer E170', 'E175': 'Embraer E175', 'E190': 'Embraer E190', 'E195': 'Embraer E195',
  'E75L': 'Embraer E175 (L)', 'E75S': 'Embraer E175 (S)',
  'CRJ1': 'Bombardier CRJ-100', 'CRJ2': 'Bombardier CRJ-200', 'CRJ7': 'Bombardier CRJ-700',
  'CRJ9': 'Bombardier CRJ-900', 'CRJX': 'Bombardier CRJ-1000',
  'DH8A': 'Dash 8 Q100', 'DH8B': 'Dash 8 Q200', 'DH8C': 'Dash 8 Q300', 'DH8D': 'Dash 8 Q400',
  'AT43': 'ATR 42-300', 'AT45': 'ATR 42-500', 'AT72': 'ATR 72-200', 'AT75': 'ATR 72-500', 'AT76': 'ATR 72-600',
  'SF34': 'Saab 340',
  'C172': 'Cessna 172', 'C182': 'Cessna 182', 'C208': 'Cessna 208 Caravan', 'C210': 'Cessna 210',
  'C25A': 'Citation CJ2', 'C25B': 'Citation CJ3', 'C25C': 'Citation CJ4',
  'C500': 'Citation I', 'C501': 'Citation I/SP', 'C510': 'Citation Mustang', 'C525': 'CitationJet',
  'C55B': 'Citation Bravo', 'C560': 'Citation V', 'C56X': 'Citation Excel', 'C680': 'Citation Sovereign',
  'C68A': 'Citation Latitude', 'C700': 'Citation Longitude', 'C750': 'Citation X',
  'SR20': 'Cirrus SR20', 'SR22': 'Cirrus SR22T',
  'TBM7': 'Daher TBM-700', 'TBM8': 'Daher TBM-850', 'TBM9': 'Daher TBM-930',
  'PC12': 'Pilatus PC-12', 'PC24': 'Pilatus PC-24',
  'BE20': 'King Air 200', 'BE30': 'King Air 300', 'B350': 'King Air 350', 'BE9L': 'King Air C90',
  'BE35': 'Beechcraft Bonanza', 'BE36': 'Beechcraft Bonanza G36',
  'BE55': 'Beechcraft Baron 55', 'BE58': 'Beechcraft Baron 58',
  'PA28': 'Piper Cherokee', 'PA32': 'Piper Cherokee Six', 'PA34': 'Piper Seneca', 'PA44': 'Piper Seminole',
  'DA40': 'Diamond DA40', 'DA42': 'Diamond DA42', 'DA62': 'Diamond DA62',
  'M20P': 'Mooney M20P', 'M20T': 'Mooney Acclaim',
  'GLF4': 'Gulfstream G-IV', 'GLF5': 'Gulfstream G-V', 'GLF6': 'Gulfstream G650',
  'G150': 'Gulfstream G150', 'G280': 'Gulfstream G280', 'G450': 'Gulfstream G450',
  'G500': 'Gulfstream G500', 'G550': 'Gulfstream G550', 'G600': 'Gulfstream G600',
  'G700': 'Gulfstream G700',
  'GLEX': 'Global Express', 'GL5T': 'Global 5000', 'GL7T': 'Global 7500',
  'CL30': 'Challenger 300', 'CL35': 'Challenger 350', 'CL60': 'Challenger 600', 'CL65': 'Challenger 650',
  'F2TH': 'Falcon 2000', 'FA50': 'Falcon 50', 'FA7X': 'Falcon 7X', 'F900': 'Falcon 900',
  'LJ31': 'Learjet 31', 'LJ35': 'Learjet 35', 'LJ45': 'Learjet 45', 'LJ60': 'Learjet 60', 'LJ75': 'Learjet 75',
  'H25B': 'Hawker 700', 'H25C': 'Hawker 800XP',
  'P28A': 'Piper Arrow', 'P28B': 'Piper Turbo Arrow',
  'B06': 'Bell 206', 'B06T': 'Bell 206L', 'B407': 'Bell 407', 'B429': 'Bell 429',
  'EC35': 'Airbus H135', 'EC45': 'Airbus H145', 'EC55': 'Airbus H155',
  'R44': 'Robinson R44', 'R66': 'Robinson R66',
  'S76': 'Sikorsky S-76', 'S92': 'Sikorsky S-92',
  'AS50': 'Airbus AS350', 'AS32': 'Airbus AS332 Super Puma',
  'UH60': 'Sikorsky UH-60 Black Hawk', 'CH47': 'Boeing CH-47 Chinook',
  'C17': 'Boeing C-17 Globemaster', 'C130': 'Lockheed C-130 Hercules', 'C135': 'Boeing C-135',
  'E3TF': 'Boeing E-3 Sentry', 'P8': 'Boeing P-8 Poseidon',
  'F16': 'General Dynamics F-16', 'F18': 'McDonnell Douglas F/A-18', 'F35': 'Lockheed F-35',
  'MQ9': 'General Atomics MQ-9 Reaper',
}

const routeCache = new Map()

const TEAM_ABBR = {
  'Arizona Diamondbacks': 'ARI', 'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CWS',
  'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET', 'Houston Astros': 'HOU', 'Kansas City Royals': 'KC',
  'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN', 'New York Mets': 'NYM',
  'New York Yankees': 'NYY', 'Oakland Athletics': 'OAK', 'Philadelphia Phillies': 'PHI',
  'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD', 'San Francisco Giants': 'SF',
  'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB',
  'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH',
  'Sacramento River Cats': 'SAC', 'Athletics': 'ATH',
}
function teamAbbr(name) {
  return TEAM_ABBR[name] ?? name?.split(' ').pop().slice(0, 3).toUpperCase() ?? '?'
}

// --- Hooks ---

async function fetchRoute(callsign) {
  if (routeCache.has(callsign)) return routeCache.get(callsign)
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`)
    if (!res.ok) { routeCache.set(callsign, null); return null }
    const data = await res.json()
    const fr = data.response?.flightroute
    const route = fr ? {
      originCode: fr.origin?.iata_code ?? null,
      originCity: fr.origin?.municipality ?? fr.origin?.name ?? null,
      destCode: fr.destination?.iata_code ?? null,
      destCity: fr.destination?.municipality ?? fr.destination?.name ?? null,
      airline: fr.airline?.name ?? null,
    } : null
    routeCache.set(callsign, route)
    return route
  } catch {
    routeCache.set(callsign, null)
    return null
  }
}

function useFlights() {
  const [flights, setFlights] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (document.visibilityState === 'hidden') return
      try {
        const { data, error: functionError } = await supabase.functions.invoke('flights')
        if (functionError) throw new Error(functionError.message)
        if (data?.error) throw new Error(data.error)
        const airborne = (data.ac ?? [])
          .filter(a => typeof a.alt_baro === 'number' && a.alt_baro > 0)
          .sort((a, b) => (a.dst ?? 999) - (b.dst ?? 999))

        const enriched = await Promise.all(airborne.map(async ac => {
          const callsign = ac.flight?.trim()
          const route = callsign ? await fetchRoute(callsign) : null
          return { ...ac, route }
        }))

        setFlights(enriched)
        setLastUpdated(new Date())
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  return { flights, lastUpdated, error, loading }
}

function useWeather() {
  const [weather, setWeather] = useState(null)
  const [hourly, setHourly] = useState([])
  const [daily, setDaily] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const hourlyUrl = useRef(null)
  const dailyUrl = useRef(null)

  useEffect(() => {
    async function load() {
      if (document.visibilityState === 'hidden') return
      try {
        if (!hourlyUrl.current) {
          const res = await fetch(
            `https://api.weather.gov/points/${SANTEE.lat},${SANTEE.lon}`,
            { headers: { 'User-Agent': 'ShepShackDashboard/1.0' } }
          )
          if (!res.ok) throw new Error(`NWS points HTTP ${res.status}`)
          const data = await res.json()
          hourlyUrl.current = data.properties.forecastHourly
          dailyUrl.current = data.properties.forecast
        }
        const [hRes, dRes] = await Promise.all([
          fetch(hourlyUrl.current, { headers: { 'User-Agent': 'ShepShackDashboard/1.0' } }),
          fetch(dailyUrl.current, { headers: { 'User-Agent': 'ShepShackDashboard/1.0' } }),
        ])
        if (!hRes.ok) throw new Error(`NWS hourly HTTP ${hRes.status}`)
        const hData = await hRes.json()
        const periods = hData.properties.periods
        const cur = periods[0]
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
          const uvRes = await fetch(`https://api.open-meteo.com/v1/forecast?${uvParams.toString()}`)
          if (uvRes.ok) {
            const uvData = await uvRes.json()
            uvIndex = uvData.current?.uv_index ?? null
            uvIndexMax = uvData.daily?.uv_index_max?.[0] ?? null
          }
        } catch {
          // UV is supplemental; keep the primary NWS forecast when it is unavailable.
        }
        setWeather({
          temp: cur.temperature,
          description: cur.shortForecast,
          windSpeed: cur.windSpeed,
          windDirection: cur.windDirection,
          humidity: cur.relativeHumidity?.value,
          precipChance: cur.probabilityOfPrecipitation?.value,
          uvIndex,
          uvIndexMax,
        })
        setHourly(periods.slice(0, 12).map(p => ({
          time: new Date(p.startTime).toLocaleTimeString([], { hour: 'numeric' }),
          temp: p.temperature,
          description: p.shortForecast,
          precipChance: p.probabilityOfPrecipitation?.value ?? 0,
          windSpeed: p.windSpeed,
          windDir: p.windDirection,
        })))
        if (dRes.ok) {
          const dData = await dRes.json()
        setDaily(dData.properties.periods.slice(0, 14).map(p => ({
            name: p.name,
            temp: p.temperature,
            tempUnit: p.temperatureUnit,
            isDay: p.isDaytime,
            description: p.shortForecast,
            precipChance: p.probabilityOfPrecipitation?.value ?? 0,
            windSpeed: p.windSpeed,
            windDir: p.windDirection,
          })))
        }
        setLastUpdated(new Date())
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 10 * 60_000)
    return () => clearInterval(id)
  }, [])

  return { weather, hourly, daily, error, loading, lastUpdated }
}

function getAqiCategory(aqi) {
  if (aqi == null) return { label: 'Unavailable', tone: 'neutral' }
  if (aqi <= 50) return { label: 'Good', tone: 'good' }
  if (aqi <= 100) return { label: 'Moderate', tone: 'info' }
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', tone: 'alert' }
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'alert' }
  if (aqi <= 300) return { label: 'Very unhealthy', tone: 'alert' }
  return { label: 'Hazardous', tone: 'alert' }
}

function useSafetyData() {
  const [airQuality, setAirQuality] = useState(null)
  const [earthquakes, setEarthquakes] = useState([])
  const [weatherAlerts, setWeatherAlerts] = useState([])
  const [countyEmergencies, setCountyEmergencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (document.visibilityState === 'hidden') return
      try {
        const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
        airUrl.search = new URLSearchParams({
          latitude: String(SANTEE.lat), longitude: String(SANTEE.lon),
          current: 'us_aqi,pm2_5,ozone', timezone: TIME_ZONE,
        })
        const quakeUrl = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query')
        quakeUrl.search = new URLSearchParams({
          format: 'geojson', latitude: String(SANTEE.lat), longitude: String(SANTEE.lon),
          maxradiuskm: '160.934', minmagnitude: '2.5', starttime: startTime, orderby: 'time', limit: '20',
        })
        const [airRes, quakeRes, feeds] = await Promise.all([fetch(airUrl), fetch(quakeUrl), supabase.functions.invoke('safety-feeds')])
        if (!airRes.ok) throw new Error(`Air quality HTTP ${airRes.status}`)
        if (!quakeRes.ok) throw new Error(`USGS HTTP ${quakeRes.status}`)
        if (feeds.error) throw new Error(feeds.error.message)
        const [air, quake] = await Promise.all([airRes.json(), quakeRes.json()])
        if (cancelled) return
        setAirQuality({
          aqi: air.current?.us_aqi ?? null,
          pm25: air.current?.pm2_5 ?? null,
          ozone: air.current?.ozone ?? null,
          observedAt: air.current?.time ? new Date(air.current.time) : null,
        })
        setEarthquakes((quake.features ?? []).map(feature => {
          const [lon, lat, depth] = feature.geometry?.coordinates ?? []
          const magnitude = feature.properties?.mag
          const distMi = kmToMi(haversineKm(SANTEE.lat, SANTEE.lon, lat, lon))
          return {
            id: feature.id, magnitude, place: feature.properties?.place,
            time: feature.properties?.time ? new Date(feature.properties.time) : null,
            url: feature.properties?.url, depth, distMi,
          }
        }).filter(quake =>
          (quake.distMi <= 25 && quake.magnitude >= 2.5) ||
          (quake.distMi <= 50 && quake.magnitude >= 3) ||
          (quake.distMi <= 100 && quake.magnitude >= 4)
        ))
        setWeatherAlerts(feeds.data?.weatherAlerts ?? [])
        setCountyEmergencies(feeds.data?.countyEmergencies ?? [])
        setError(feeds.data?.error ?? null)
        setLastUpdated(new Date())
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 10 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return { airQuality, earthquakes, weatherAlerts, countyEmergencies, loading, error, lastUpdated }
}

function useNetworkStatus() {
  const getConnection = () => {
    const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection
    return {
      online: navigator.onLine,
      effectiveType: connection?.effectiveType ?? null,
      downlink: connection?.downlink ?? null,
      rtt: connection?.rtt ?? null,
    }
  }

  const [network, setNetwork] = useState(getConnection)

  useEffect(() => {
    const update = () => setNetwork(getConnection())
    const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection

    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    connection?.addEventListener?.('change', update)

    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      connection?.removeEventListener?.('change', update)
    }
  }, [])

  return network
}


const FIRE_INCIDENT_RADIUS_MI = 30
const FIRE_INCIDENT_MIN_ACRES = 5
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
let leafletLoadPromise = null


function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatUvIndex(value) {
  if (value == null) return '—'
  const rounded = Math.round(value * 10) / 10
  const level =
    rounded >= 11 ? 'Extreme' :
    rounded >= 8 ? 'Very high' :
    rounded >= 6 ? 'High' :
    rounded >= 3 ? 'Moderate' :
    'Low'
  return `${rounded} ${level}`
}

function Freshness({ date, staleAfterMinutes = 10 }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  if (!date) return null
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60_000))
  const stale = minutes >= staleAfterMinutes
  return <span className={`freshness ${stale ? 'stale' : ''}`}><span className={`statusDot ${stale ? 'alert' : 'good'}`} />{minutes < 1 ? 'Just updated' : `${minutes}m ago`}</span>
}

function usePadres() {
  const [game, setGame] = useState(null)
  const [latestGame, setLatestGame] = useState(null)
  const [nextGame, setNextGame] = useState(null)
  const [standing, setStanding] = useState(null)
  const [boxScore, setBoxScore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    async function load() {
      if (document.visibilityState === 'hidden') return
      try {
        const res = await fetch(
          `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${localDateStr()}&teamId=135&hydrate=linescore`
        )
        if (!res.ok) throw new Error(`MLB HTTP ${res.status}`)
        const data = await res.json()
        const g = data.dates?.[0]?.games?.[0]

        if (g) {
          setLatestGame(null)
          setNextGame(null)
          const padresAway = g.teams.away.team.id === 135
          const padresSide = padresAway ? g.teams.away : g.teams.home
          const oppSide = padresAway ? g.teams.home : g.teams.away
          const innings = (g.linescore?.innings ?? []).map(inn => ({
            num: inn.num,
            away: inn.away?.runs ?? null,
            home: inn.home?.runs ?? null,
          }))
          setGame({
            gamePk: g.gamePk,
            state: g.status.abstractGameState,
            detailedState: g.status.detailedState,
            padresScore: padresSide.score ?? 0,
            opponentScore: oppSide.score ?? 0,
            opponent: oppSide.team.name,
            padresAway,
            padresHome: !padresAway,
            venue: g.venue?.name,
            gameDate: g.gameDate,
            inning: g.linescore?.currentInning,
            inningOrdinal: g.linescore?.currentInningOrdinal,
            inningHalf: g.linescore?.inningHalf,
            outs: g.linescore?.outs,
            wins: padresSide.leagueRecord?.wins,
            losses: padresSide.leagueRecord?.losses,
            innings,
            awayHits: g.linescore?.teams?.away?.hits,
            homeHits: g.linescore?.teams?.home?.hits,
            awayErrors: g.linescore?.teams?.away?.errors,
            homeErrors: g.linescore?.teams?.home?.errors,
          })

          try {
            const bsRes = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore`)
            if (bsRes.ok) {
              const bs = await bsRes.json()
              function parseBatters(teamData) {
                return (teamData.battingOrder ?? []).map(id => {
                  const p = teamData.players[`ID${id}`]
                  if (!p) return null
                  const bat = p.stats?.batting ?? {}
                  const name = p.person.fullName?.split(' ').slice(1).join(' ') ?? p.person.fullName ?? '?'
                  return { name, pos: p.position?.abbreviation ?? '', ab: bat.atBats ?? 0, r: bat.runs ?? 0, h: bat.hits ?? 0, rbi: bat.rbi ?? 0, bb: bat.baseOnBalls ?? 0, so: bat.strikeOuts ?? 0 }
                }).filter(Boolean)
              }
              setBoxScore({
                awayBatters: parseBatters(bs.teams.away),
                homeBatters: parseBatters(bs.teams.home),
                decisions: bs.decisions ?? null,
              })
            }
          } catch {
            // Box score details are optional; the game summary can still render.
          }

        } else {
          setGame(null)
          setBoxScore(null)
          const weekAgo = new Date()
          weekAgo.setDate(weekAgo.getDate() - 7)
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          const nextWeek = new Date()
          nextWeek.setDate(nextWeek.getDate() + 7)
          const [recentRes, nRes] = await Promise.all([
            fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&hydrate=linescore&startDate=${localDateStr(weekAgo)}&endDate=${localDateStr(yesterday)}`),
            fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&startDate=${localDateStr(tomorrow)}&endDate=${localDateStr(nextWeek)}`),
          ])
          if (recentRes.ok) {
            const recentData = await recentRes.json()
            const recentGames = (recentData.dates ?? []).flatMap(date => date.games ?? [])
            const latest = recentGames.filter(item => item.status.abstractGameState === 'Final').at(-1)
            if (latest) {
              const padresAway = latest.teams.away.team.id === 135
              const padresSide = padresAway ? latest.teams.away : latest.teams.home
              const oppSide = padresAway ? latest.teams.home : latest.teams.away
              setLatestGame({
                gamePk: latest.gamePk, state: 'Final', detailedState: latest.status.detailedState,
                padresScore: padresSide.score ?? 0, opponentScore: oppSide.score ?? 0,
                opponent: oppSide.team.name, padresAway, padresHome: !padresAway,
                venue: latest.venue?.name, gameDate: latest.gameDate,
              })
            }
          }
          if (nRes.ok) {
            const nData = await nRes.json()
            const ng = nData.dates?.[0]?.games?.[0]
            if (ng) {
              const padresAway = ng.teams.away.team.id === 135
              const padresSide = padresAway ? ng.teams.away : ng.teams.home
              const oppSide = padresAway ? ng.teams.home : ng.teams.away
              setNextGame({ gameDate: ng.gameDate, opponent: oppSide.team.name, padresHome: !padresAway, venue: ng.venue?.name, wins: padresSide.leagueRecord?.wins, losses: padresSide.leagueRecord?.losses })
            }
          }
        }
        const season = new Date().getFullYear()
        const standingsRes = await fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=${season}&standingsTypes=regularSeason`)
        if (standingsRes.ok) {
          const standingsData = await standingsRes.json()
          const padresStanding = (standingsData.records ?? []).flatMap(record => record.teamRecords ?? []).find(team => team.team?.id === 135)
          if (padresStanding) setStanding({
            divisionRank: padresStanding.divisionRank,
            leagueRank: padresStanding.leagueRank,
            wildCardRank: padresStanding.wildCardRank,
            gamesBack: padresStanding.gamesBack,
            wins: padresStanding.wins,
            losses: padresStanding.losses,
          })
        }
        const futureStart = new Date()
        futureStart.setDate(futureStart.getDate() + 1)
        const futureEnd = new Date()
        futureEnd.setDate(futureEnd.getDate() + 14)
        const futureRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=135&startDate=${localDateStr(futureStart)}&endDate=${localDateStr(futureEnd)}`)
        if (futureRes.ok) {
          const futureData = await futureRes.json()
          const upcoming = futureData.dates?.[0]?.games?.[0]
          if (upcoming) {
            const padresAway = upcoming.teams.away.team.id === 135
            const padresSide = padresAway ? upcoming.teams.away : upcoming.teams.home
            const oppSide = padresAway ? upcoming.teams.home : upcoming.teams.away
            setNextGame({ gameDate: upcoming.gameDate, opponent: oppSide.team.name, padresHome: !padresAway, venue: upcoming.venue?.name, wins: padresSide.leagueRecord?.wins, losses: padresSide.leagueRecord?.losses })
          }
        }
        setError(null)
        setLastUpdated(new Date())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  return { game, latestGame, nextGame, standing, boxScore, loading, error, lastUpdated }
}

const SOCCER_TEAMS = [
  { key: 'sdfc', name: 'San Diego FC', shortName: 'SDFC', league: 'MLS', leagueSlug: 'usa.1', teamId: '22529' },
  { key: 'wave', name: 'San Diego Wave', shortName: 'Wave', league: 'NWSL', leagueSlug: 'usa.nwsl', teamId: '21423' },
]

function compactDate(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function parseSoccerEvent(event, teamId) {
  const competition = event.competitions?.[0]
  const competitors = competition?.competitors ?? []
  const team = competitors.find(entry => String(entry.team?.id) === teamId)
  const opponent = competitors.find(entry => String(entry.team?.id) !== teamId)
  if (!team || !opponent) return null
  return {
    id: event.id,
    date: event.date,
    state: competition.status?.type?.state ?? event.status?.type?.state,
    status: competition.status?.type?.shortDetail ?? event.status?.type?.shortDetail ?? 'Scheduled',
    home: team.homeAway === 'home',
    score: team.score?.displayValue ?? team.score ?? null,
    opponentScore: opponent.score?.displayValue ?? opponent.score ?? null,
    opponent: opponent.team?.displayName ?? opponent.team?.name ?? 'Opponent',
    opponentAbbr: opponent.team?.abbreviation ?? teamAbbr(opponent.team?.displayName),
    venue: competition.venue?.fullName ?? null,
  }
}

function useSoccerScores() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    async function load() {
      if (document.visibilityState === 'hidden') return
      try {
        const start = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const end = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
        const results = await Promise.all(SOCCER_TEAMS.map(async config => {
          const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.leagueSlug}/teams/${config.teamId}/schedule`
          const futureUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.leagueSlug}/scoreboard?dates=${compactDate(start)}-${compactDate(end)}&limit=100`
          const [scheduleResponse, futureResponse] = await Promise.all([fetch(scheduleUrl), fetch(futureUrl)])
          if (!scheduleResponse.ok || !futureResponse.ok) throw new Error(`${config.league} scores unavailable`)
          const [schedule, future] = await Promise.all([scheduleResponse.json(), futureResponse.json()])
          const events = [...(schedule.events ?? []), ...(future.events ?? [])]
            .filter((event, index, all) => all.findIndex(item => item.id === event.id) === index)
            .map(event => parseSoccerEvent(event, config.teamId))
            .filter(Boolean)
          const live = events.find(event => event.state === 'in') ?? null
          const latest = events.filter(event => event.state === 'post').sort((a, b) => new Date(b.date) - new Date(a.date))[0] ?? null
          const next = events.filter(event => event.state === 'pre' && new Date(event.date) >= start).sort((a, b) => new Date(a.date) - new Date(b.date))[0] ?? null
          return { ...config, logo: schedule.team?.logo, record: schedule.team?.recordSummary, standing: schedule.team?.standingSummary, live, latest, next }
        }))
        setTeams(results)
        setError(null)
        setLastUpdated(new Date())
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  return { teams, loading, error, lastUpdated }
}

// --- App shell ---

const pages = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'weather', label: 'Weather', icon: 'weather' },
  { id: 'fire', label: 'Safety', icon: 'safety' },
  { id: 'flights', label: 'Flights', icon: 'flights' },
  { id: 'padres', label: 'Sports', icon: 'sports' },
  { id: 'keg', label: 'Keg', icon: 'keg' },
  { id: 'house', label: 'Settings', icon: 'settings' },
]

function NavIcon({ name }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
    weather: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></>,
    fire: <path d="M13.5 2.5c.5 3-1 4.5-2.2 6.1-1.1-1.3-1.5-2.6-1.1-4.2C6.7 7.2 5 10.2 5.5 13.5A6.6 6.6 0 0 0 12 21a6.6 6.6 0 0 0 6.5-7.5c-.4-2.8-2.1-5.4-5-7.6.2 2-.5 3.2-1.4 4.3"/>,
    safety: <><path d="M12 3 20 6v5c0 5-3.3 8.3-8 10-4.7-1.7-8-5-8-10V6z"/><path d="M8.5 12.5 11 15l4.8-5"/></>,
    flights: <path d="m3 11 7.2 1.4 7.3-8.1c.8-.9 2.3-.7 2.9.3.4.8.2 1.7-.5 2.3l-6.3 5.8 5 1c.9.2 1.5 1 1.3 1.9-.2.8-.9 1.3-1.7 1.2l-6.9-1.1-3.1 3H5.8l1.8-3.9L3 13.2z"/>,
    baseball: <><circle cx="12" cy="12" r="9"/><path d="M7.2 4.5c1.3 1.4 1.8 3 1.7 4.8M4.5 7.2c1.4.5 2.8 1.4 4.1 2.7M16.8 19.5c-1.3-1.4-1.8-3-1.7-4.8M19.5 16.8c-1.4-.5-2.8-1.4-4.1-2.7"/></>,
    sports: <><path d="M8 4h8v3.5a4 4 0 0 1-8 0zM10 12v3M14 12v3M8 19h8M10 15h4v4"/><path d="M8 6H4v1.5A3.5 3.5 0 0 0 7.5 11M16 6h4v1.5a3.5 3.5 0 0 1-3.5 3.5"/></>,
    keg: <><path d="M7 3h10l1 4-1 14H7L6 7z"/><path d="M6 7h12M8 11h8M9 3V1h6v2"/></>,
    settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/><circle cx="14" cy="7" r="2"/><circle cx="6" cy="17" r="2"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  }
  return <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [recoveringPassword, setRecoveringPassword] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true)
      setCheckingSession(false)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  if (checkingSession) {
    return <div className="authScreen"><div className="authLoader" aria-label="Checking session" /></div>
  }

  if (recoveringPassword && session) return <PasswordResetPage onComplete={() => setRecoveringPassword(false)} />
  if (!session) return <LoginPage />

  return <Dashboard session={session} />
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError('That email or password did not work.')
    setSubmitting(false)
  }

  async function handlePasswordReset() {
    if (!email) { setError('Enter your email first.'); return }
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href })
    if (resetError) setError(resetError.message)
    else setResetSent(true)
  }

  return (
    <main className="authScreen">
      <section className="loginCard">
        <img src={`${import.meta.env.BASE_URL}shepshack.png`} alt="Shep Shack" className="loginLogo" />
        <div className="loginIntro">
          <p className="pageEyebrow">Private household dashboard</p>
          <h1>Welcome home.</h1>
          <p>Sign in with your Shep Shack account.</p>
        </div>
        <form className="loginForm" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" inputMode="email" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          {error && <p className="loginError" role="alert">{error}</p>}
          <button className="loginButton" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <button className="textButton" type="button" onClick={handlePasswordReset}>Forgot password?</button>
        </form>
        {resetSent && <p className="resetNotice">Check your email for a secure reset link.</p>}
        <p className="loginHelp">Accounts are created by the household administrator.</p>
      </section>
    </main>
  )
}

function PasswordResetPage({ onComplete }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  async function handleSubmit(event) {
    event.preventDefault(); setSaving(true); setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) setError(updateError.message)
    else onComplete()
  }
  return (
    <main className="authScreen"><section className="loginCard">
      <img src={`${import.meta.env.BASE_URL}shepshack.png`} alt="Shep Shack" className="loginLogo" />
      <div className="loginIntro"><p className="pageEyebrow">Account recovery</p><h1>Choose a new password.</h1></div>
      <form className="loginForm" onSubmit={handleSubmit}>
        <label>New password<input type="password" minLength="8" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required /></label>
        {error && <p className="loginError" role="alert">{error}</p>}
        <button className="loginButton" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save password'}</button>
      </form>
    </section></main>
  )
}

function Dashboard({ session }) {
  const [time, setTime] = useState(new Date())
  const [headerCompact, setHeaderCompact] = useState(false)
  const [activePage, setActivePage] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('page')
    return pages.some(page => page.id === requested) ? requested : 'home'
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const network = useNetworkStatus()
  const flightData = useFlights()
  const weatherData = useWeather()
  const fireData = useFireWatch()
  const safetyData = useSafetyData()
  const padresData = usePadres()
  const soccerData = useSoccerScores()
  const kegData = useKegStatus()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 30_000)
    navigator.clearAppBadge?.()
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const updateHeader = () => setHeaderCompact(window.scrollY > 56)
    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [])

  const currentTime = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const currentDate = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const { weather } = weatherData

  return (
    <main className="dashboard">
      <section className={`heroCard ${headerCompact ? 'compact' : ''}`} aria-label="Current time and weather">
        <div className="logoPanel">
          <img src={`${import.meta.env.BASE_URL}shepshack.png`} alt="Shep Shack logo" className="houseLogo" />
        </div>

        <div className="heroInfo">
          <div className="locationBadge"><span className="liveDot" />Santee, California</div>
          <h1>{currentTime}</h1>
          <p className="date">{currentDate}</p>

          <div className="weatherPill">
            <span>{weather ? `${weather.temp}°` : '—'}</span>
            <p style={{ margin: 0 }}>{weather ? weather.description : 'Santee, CA'}</p>
          </div>
        </div>
      </section>

      <nav className="topNav">
        {pages.map(page => (
          <button
            key={page.id}
            className={`navButton ${page.id === 'house' ? 'secondaryNav' : ''} ${activePage === page.id ? 'active' : ''}`}
            onClick={() => { setActivePage(page.id); setMoreOpen(false) }}
            aria-current={activePage === page.id ? 'page' : undefined}
          >
            <NavIcon name={page.icon} />
            <span>{page.label}</span>
          </button>
        ))}
        <button className={`navButton moreNavButton ${activePage === 'house' ? 'active' : ''}`} type="button" onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen}>
          <NavIcon name="more" /><span>More</span>
        </button>
        {moreOpen && (
          <div className="moreMenu">
            {pages.filter(page => page.id === 'house').map(page => (
              <button key={page.id} type="button" onClick={() => { setActivePage(page.id); setMoreOpen(false) }}><NavIcon name={page.icon} />{page.label}</button>
            ))}
          </div>
        )}
      </nav>

      {!network.online && <div className="offlineBanner" role="status"><span className="statusDot alert" />Offline · showing the last available readings</div>}

      <header className="pageHeading">
        <div>
          <p className="pageEyebrow">Shep Shack command center</p>
          <h2>{pages.find(page => page.id === activePage)?.label}</h2>
        </div>
        <div className="headerActions">
          <div className="systemStatus"><span className="liveDot" />Live data</div>
          <NotificationControl userId={session.user.id} onOpenSettings={() => setActivePage('house')} />
        </div>
      </header>

      {activePage === 'home' && (
        <HomePage now={time} onNavigate={setActivePage} flightData={flightData} fireData={fireData} safetyData={safetyData} padresData={padresData} soccerData={soccerData} weatherData={weatherData} kegData={kegData} />
      )}
      {activePage === 'weather' && <WeatherPage weatherData={weatherData} />}
      {activePage === 'fire' && <SafetyPage fireData={fireData} safetyData={safetyData} />}
      {activePage === 'flights' && <FlightsPage flightData={flightData} />}
      {activePage === 'padres' && <SportsPage padresData={padresData} soccerData={soccerData} />}
      {activePage === 'keg' && <KegPage kegData={kegData} />}
      {activePage === 'house' && <HousePage session={session} />}
    </main>
  )
}

// --- Pages ---

function HomePage({ now, onNavigate, flightData, fireData, safetyData, padresData, soccerData, weatherData, kegData }) {
  const { flights, loading: flightsLoading } = flightData
  const { incidents, fires, loading: fireLoading } = fireData
  const { game, nextGame, loading: padresLoading } = padresData
  const { teams: soccerTeams, loading: soccerLoading } = soccerData
  const { weather, loading: weatherLoading } = weatherData
  const { keg, loading: kegLoading, error: kegError } = kegData
  const closest = flights[0]
  const flightCount = flights.length
  const nearestFire = incidents[0] ?? fires[0]
  const aqiCategory = getAqiCategory(safetyData.airQuality?.aqi)
  const recentQuake = safetyData.earthquakes.find(quake => quake.time && now.getTime() - quake.time.getTime() < 24 * 60 * 60 * 1000)
  const kegStale = kegData.lastUpdated && now.getTime() - kegData.lastUpdated.getTime() > 10 * 60 * 1000
  const attentionItems = [
    ...safetyData.countyEmergencies.slice(0, 1).map(notice => ({ title: notice.type, detail: notice.label || notice.notes || 'Official County notice affects home', page: 'fire', tone: 'alert' })),
    ...safetyData.weatherAlerts.slice(0, 1).map(alert => ({ title: alert.event, detail: alert.headline || 'Weather warning affects home', page: 'fire', tone: 'alert' })),
    ...(incidents[0] ? [{ title: 'Wildfire nearby', detail: `${incidents[0].name} · ${incidents[0].distMi.toFixed(0)} miles away`, page: 'fire', tone: 'alert' }] : []),
    ...(safetyData.airQuality?.aqi > 100 ? [{ title: 'Poor air quality', detail: `AQI ${Math.round(safetyData.airQuality.aqi)} · ${aqiCategory.label}`, page: 'fire', tone: 'alert' }] : []),
    ...(recentQuake ? [{ title: `M ${recentQuake.magnitude.toFixed(1)} earthquake`, detail: `${recentQuake.distMi.toFixed(0)} miles away`, page: 'fire', tone: 'info' }] : []),
    ...(kegError || kegStale ? [{ title: 'Keg monitor offline', detail: kegStale ? 'No fresh reading for over 10 minutes' : 'Sensor data unavailable', page: 'keg', tone: 'alert' }] : []),
    ...(!kegError && !kegStale && keg?.percent <= 20 ? [{ title: 'Keg is running low', detail: `${Math.round(keg.percent)}% remaining`, page: 'keg', tone: 'info' }] : []),
  ]

  return (
    <>
    {attentionItems.length > 0 && <section className="needsAttention" aria-labelledby="attention-title">
      <div className="attentionHeading"><div><p className="cardLabel">Live priorities</p><h2 id="attention-title">Needs attention</h2></div><span>{attentionItems.length}</span></div>
      <div className="attentionList">{attentionItems.map((item, index) => <button type="button" onClick={() => onNavigate(item.page)} key={`${item.title}-${index}`}><span className={`statusDot ${item.tone}`} /><span><strong>{item.title}</strong><small>{item.detail}</small></span><b aria-hidden="true">›</b></button>)}</div>
    </section>}
    <section className="grid homeGrid">
      <div className="card accent-fire homePriority" onClick={() => onNavigate('fire')}>
        <p className="cardLabel">Safety</p>
        <h2>
          {fireLoading
            ? 'Loading…'
            : incidents.length > 0
            ? `${incidents.length} active incident${incidents.length > 1 ? 's' : ''} nearby`
            : fires.length > 0
            ? `${fires.length} satellite hotspot${fires.length > 1 ? 's' : ''}`
            : safetyData.airQuality?.aqi > 100
            ? `Air quality: ${aqiCategory.label}`
            : 'All clear'}
        </h2>
        <div className="statusRow">
          <span>Nearest signal</span>
          <strong>
            <span className={`statusDot ${nearestFire ? 'alert' : 'good'}`} />
            {fireLoading ? '—' : nearestFire ? `${nearestFire.distMi.toFixed(0)} mi` : 'None'}
          </strong>
        </div>
        <div className="statusRow">
          <span>Air quality</span>
          <strong>
            <span className={`statusDot ${aqiCategory.tone}`} />
            {safetyData.loading ? '—' : safetyData.airQuality?.aqi != null ? `AQI ${Math.round(safetyData.airQuality.aqi)}` : 'Unavailable'}
          </strong>
        </div>
      </div>

      <div className="card accent-flights homeSecondary" onClick={() => onNavigate('flights')}>
        <p className="cardLabel">Flights</p>
        <h2>
          {flightsLoading
            ? 'Loading…'
            : flightCount === 0
            ? 'Clear skies'
            : `${flightCount} overhead`}
        </h2>
        <div className="statusRow">
          <span>Within {RADIUS_MI} mi</span>
          <strong>
            <span className={`statusDot ${flightCount > 0 ? 'info' : 'good'}`} />
            {flightsLoading ? '—' : flightCount}
          </strong>
        </div>
        <div className="statusRow">
          <span>Closest</span>
          <strong>
            {flightsLoading || !closest
              ? '—'
              : `${(closest.flight?.trim() || closest.hex).toUpperCase()} · ${(closest.dst * 1.15078).toFixed(1)} mi`}
          </strong>
        </div>
      </div>

      <div className="card accent-sport homeSecondary" onClick={() => onNavigate('padres')}>
        <p className="cardLabel">San Diego sports</p>
        <h2>
          {padresLoading
            ? 'Loading…'
            : game?.state === 'Live'
            ? `SD ${game.padresScore} · ${teamAbbr(game.opponent)} ${game.opponentScore}`
            : game?.state === 'Final'
            ? `Final · SD ${game.padresScore}–${game.opponentScore}`
            : game?.state === 'Preview'
            ? `vs ${teamAbbr(game.opponent)}`
            : nextGame
            ? `Next: vs ${teamAbbr(nextGame.opponent)}`
            : 'Off day'}
        </h2>
        <div className="statusRow">
          <span>Padres</span>
          <strong>
            <span className={`statusDot ${game?.state === 'Live' ? 'alert' : game ? 'info' : 'neutral'}`} />
            {padresLoading ? '—' : game ? game.detailedState : nextGame ? new Date(nextGame.gameDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'No game'}
          </strong>
        </div>
        {soccerLoading && <div className="statusRow"><span>Soccer</span><strong>Loading…</strong></div>}
        {!soccerLoading && soccerTeams.map(team => {
          const event = team.live ?? team.latest ?? team.next
          const summary = team.live || team.latest
            ? `${event.score}–${event.opponentScore} ${event.opponentAbbr}`
            : event ? `${event.home ? 'vs' : '@'} ${event.opponentAbbr}` : 'No match'
          return <div className="statusRow" key={team.key}><span>{team.shortName}</span><strong><span className={`statusDot ${team.live ? 'alert' : 'info'}`} />{summary}</strong></div>
        })}
      </div>

      <div className="card accent-weather homePriority homeWeather" onClick={() => onNavigate('weather')}>
        <p className="cardLabel">Weather</p>
        <h2>
          {weatherLoading ? 'Loading…' : weather ? `${weather.temp}° — ${weather.description}` : 'Unavailable'}
        </h2>
        <div className="statusRow">
          <span>Wind</span>
          <strong>{weatherLoading || !weather ? '—' : `${weather.windSpeed} ${weather.windDirection}`}</strong>
        </div>
        <div className="statusRow">
          <span>Humidity</span>
          <strong>{weatherLoading || !weather || weather.humidity == null ? '—' : `${weather.humidity}%`}</strong>
        </div>
        <div className="statusRow">
          <span>UV index</span>
          <strong>
            {weatherLoading || !weather || weather.uvIndex == null
              ? '—'
              : weather.uvIndexMax != null
              ? `${formatUvIndex(weather.uvIndex)} · max ${Math.round(weather.uvIndexMax * 10) / 10}`
              : formatUvIndex(weather.uvIndex)}
          </strong>
        </div>
      </div>

      <div className="card accent-house" onClick={() => onNavigate('house')}>
        <p className="cardLabel">Home</p>
        <h2>Network status</h2>
        <div className="statusRow">
          <span>Network</span>
          <strong><span className="statusDot info" />Available</strong>
        </div>
        <div className="statusRow">
          <span>Speed test</span>
          <strong><span className="statusDot neutral" />Manual</strong>
        </div>
        <div className="statusRow">
          <span>Dashboard</span>
          <strong><span className="statusDot info" />Online</strong>
        </div>
      </div>

      <div className="card accent-keg homePriority homeKeg" onClick={() => onNavigate('keg')}>
        <p className="cardLabel">Keg</p>
        <h2>
          {kegLoading
            ? 'Loading…'
            : kegError
            ? 'Unavailable'
            : keg
            ? `${Math.round(keg.percent ?? 0)}% full`
            : 'Unknown'}
        </h2>
        <div className="statusRow">
          <span>Tap</span>
          <strong>
            <span className={`statusDot ${keg?.ready ? 'good' : kegError ? 'alert' : 'neutral'}`} />
            {kegLoading ? '—' : keg?.ready ? 'Ready' : kegError ? 'Offline' : 'Unknown'}
          </strong>
        </div>
        <div className="statusRow">
          <span>Pints left</span>
          <strong>{keg?.pintsLeft != null ? keg.pintsLeft.toFixed(1) : '—'}</strong>
        </div>
      </div>
    </section>
    </>
  )
}

function SafetyPage({ fireData, safetyData }) {
  const { incidents, fires, error, loading, lastUpdated } = fireData
  const { airQuality, earthquakes, weatherAlerts, countyEmergencies, loading: safetyLoading, error: safetyError, lastUpdated: safetyUpdated } = safetyData
  const signalCount = incidents.length + fires.length
  const aqiCategory = getAqiCategory(airQuality?.aqi)

  function formatIncidentTime(ms) {
    if (!ms) return '—'
    return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  function formatAcres(acres) {
    if (acres == null) return '—'
    if (acres < 1) return '<1'
    return Math.round(acres).toLocaleString()
  }

  return (
    <section className="pageGrid">
      <div className={`card wideCard safetyAlertCard ${weatherAlerts.length || countyEmergencies.length ? 'active' : ''}`}>
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Official alerts for the house</p>
            <h2>{safetyLoading ? 'Checking…' : weatherAlerts.length || countyEmergencies.length ? `${weatherAlerts.length + countyEmergencies.length} active notice${weatherAlerts.length + countyEmergencies.length > 1 ? 's' : ''}` : 'No active warnings'}</h2>
          </div>
          <span className="dataSource">NWS · County OES</span>
        </div>
        {!safetyLoading && weatherAlerts.length === 0 && countyEmergencies.length === 0 && <p className="safetyVerdict"><span className="statusDot good" />Nothing currently affects the home location.</p>}
        <div className="officialAlertList">
          {countyEmergencies.map(notice => <article className="officialAlert emergency" key={`county-${notice.id}`}><strong>{notice.type}</strong><span>{notice.label || notice.notes || 'San Diego County emergency notice'}</span></article>)}
          {weatherAlerts.map(alert => <a className="officialAlert weather" href={alert.url} target="_blank" rel="noreferrer" key={alert.id}><strong>{alert.event}</strong><span>{alert.headline || alert.description}</span><time>{alert.expires ? `Until ${new Date(alert.expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : alert.severity}</time></a>)}
        </div>
      </div>

      <div className="card safetyMetric accent-air">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Air quality · Santee</p>
            <h2>{safetyLoading ? 'Loading…' : airQuality?.aqi != null ? `${Math.round(airQuality.aqi)} AQI` : 'Unavailable'}</h2>
          </div>
          {safetyUpdated && <Freshness date={safetyUpdated} />}
        </div>
        <p className="safetyVerdict"><span className={`statusDot ${aqiCategory.tone}`} />{aqiCategory.label}</p>
        <div className="statusRow"><span>Fine particles (PM2.5)</span><strong>{airQuality?.pm25 != null ? `${Math.round(airQuality.pm25)} µg/m³` : '—'}</strong></div>
        <div className="statusRow"><span>Ozone</span><strong>{airQuality?.ozone != null ? `${Math.round(airQuality.ozone)} µg/m³` : '—'}</strong></div>
      </div>

      <div className="card safetyMetric accent-quake">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Potentially noticeable earthquakes · past 7 days</p>
            <h2>{safetyLoading ? 'Loading…' : earthquakes.length ? `${earthquakes.length} detected` : 'No recent earthquakes'}</h2>
          </div>
          <span className="dataSource">USGS</span>
        </div>
        {earthquakes.length > 0 ? (
          <div className="quakeList">
            {earthquakes.slice(0, 5).map(quake => (
              <a className="quakeRow" href={quake.url} target="_blank" rel="noreferrer" key={quake.id}>
                <strong>M {quake.magnitude?.toFixed(1) ?? '—'}</strong>
                <span>{quake.distMi.toFixed(0)} mi away · {quake.place ?? 'Southern California'}</span>
                <time>{quake.time?.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</time>
              </a>
            ))}
          </div>
        ) : !safetyLoading && <p className="placeholderText">No earthquakes likely to be felt in Santee were reported nearby.</p>}
      </div>

      {safetyError && <div className="card wideCard safetyError" role="status">Safety data is temporarily unavailable: {safetyError}</div>}

      <div className="card wideCard accent-fire">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Within {FIRE_INCIDENT_RADIUS_MI} miles of Santee</p>
            <h2>
              {loading ? 'Loading…'
                : signalCount === 0 ? 'All clear nearby'
                : incidents.length > 0
                ? `${incidents.length} active wildfire incident${incidents.length > 1 ? 's' : ''}`
                : `${fires.length} satellite heat detection${fires.length > 1 ? 's' : ''}`}
            </h2>
            {!loading && signalCount > 0 && incidents.length === 0 && (
              <p className="placeholderText" style={{ marginTop: 8 }}>
                NASA heat detections are signals, not confirmed wildfire boundaries.
              </p>
            )}
          </div>
          {lastUpdated && (
            <Freshness date={lastUpdated} />
          )}
        </div>

        {error && (
          <p style={{ color: 'var(--status-alert)', fontSize: 13, marginTop: 8 }}>{error}</p>
        )}
      </div>

      <FireMap incidents={incidents} fires={fires} loading={loading} />

      {incidents.length > 0 && <div className="card wideCard accent-fire">
        <p className="cardLabel">
          Active incidents — WFIGS current · {FIRE_INCIDENT_MIN_ACRES}+ acres · within {FIRE_INCIDENT_RADIUS_MI} mi
        </p>
        <h2>
          {loading ? 'Loading…'
            : incidents.length === 0 ? 'No named incidents nearby'
            : `${incidents.length} active incident${incidents.length > 1 ? 's' : ''} nearby`}
        </h2>
        {incidents.length > 0 && (
          <div className="flightList">
            <div className="flightRow incidentRow flightHeader">
              <span>Incident</span>
              <span className="flightDistCol">Distance</span>
              <span>Acres</span>
              <span>Contained</span>
              <span>Updated</span>
            </div>
            {incidents.map((incident, i) => (
              <div key={`${incident.name}-${i}`} className="flightRow incidentRow">
                <span>
                  <span className="flightIdent" style={{ fontSize: 13 }}>{incident.name}</span>
                  <span className="flightType">{incident.county ? `${incident.county} County` : 'California'}</span>
                </span>
                <span className="flightDistCol flightDist">{incident.distMi.toFixed(0)} mi</span>
                <span>{formatAcres(incident.acres)}</span>
                <span>{incident.containment != null ? `${incident.containment}%` : '—'}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{formatIncidentTime(incident.updated)}</span>
              </div>
            ))}
          </div>
        )}
      </div>}

      {fires.length > 0 && <div className="card wideCard accent-fire">
        <p className="cardLabel">Satellite heat detections — NASA FIRMS VIIRS · last 24h</p>
        <h2>
          {loading ? 'Loading…'
            : `${fires.length} hotspot${fires.length > 1 ? 's' : ''} within ${FIRE_INCIDENT_RADIUS_MI} mi`}
        </h2>
        {fires.length > 0 && (
          <div className="flightList">
            <div className="flightRow fireRow flightHeader">
              <span>Location</span>
              <span className="flightDistCol">Distance</span>
              <span>Heat output</span>
              <span>Confidence</span>
            </div>
            {fires.map((f, i) => (
              <div key={i} className="flightRow fireRow">
                <span className="flightIdent" style={{ fontSize: 13 }}>{f.location ?? '—'}</span>
                <span className="flightDistCol flightDist">{f.distMi.toFixed(0)} mi</span>
                <span>{f.frp.toFixed(0)} MW</span>
                <span>{f.confidence === 'h' || f.confidence === 'high' ? 'High' : 'Nominal'}</span>
              </div>
            ))}
          </div>
        )}
      </div>}
    </section>
  )
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char])
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (leafletLoadPromise) return leafletLoadPromise

  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS_URL
      document.head.appendChild(link)
    }

    const script = document.createElement('script')
    script.src = LEAFLET_JS_URL
    script.async = true
    script.onload = () => resolve(window.L)
    script.onerror = () => reject(new Error('Leaflet failed to load'))
    document.head.appendChild(script)
  })

  return leafletLoadPromise
}

function FireMap({ incidents, fires, loading }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markerLayer = useRef(null)
  const rangeCircleRef = useRef(null)
  const [mapError, setMapError] = useState(null)
  const markers = useMemo(() => [
    ...incidents.map((incident, i) => ({
      id: `incident-${incident.name}-${i}`,
      type: 'incident',
      label: incident.name,
      meta: `${incident.distMi.toFixed(0)} mi · ${Math.round(incident.acres).toLocaleString()} acres`,
      lat: incident.lat,
      lon: incident.lon,
    })),
    ...fires.map((fire, i) => ({
      id: `heat-${i}`,
      type: 'heat',
      label: fire.location ?? 'Heat detection',
      meta: `${fire.distMi.toFixed(0)} mi · satellite heat detection`,
      lat: fire.lat,
      lon: fire.lon,
    })),
  ].filter(marker => marker.lat != null && marker.lon != null), [incidents, fires])

  useEffect(() => () => {
    mapInstance.current?.remove()
    mapInstance.current = null
    markerLayer.current = null
    rangeCircleRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    loadLeaflet().then(L => {
      setMapError(null)
      if (cancelled || !mapRef.current) return

      if (!mapInstance.current) {
        const map = L.map(mapRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          touchZoom: false,
        })
        map.setView([SANTEE.lat, SANTEE.lon], 8)

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: 'OpenStreetMap',
        }).addTo(map)

        L.control.attribution({ prefix: false }).addTo(map)

        const rangeCircle = L.circle([SANTEE.lat, SANTEE.lon], {
          radius: FIRE_INCIDENT_RADIUS_MI * 1609.344,
          color: '#e0584f',
          weight: 1,
          opacity: 0.6,
          fillColor: '#e0584f',
          fillOpacity: 0.05,
        }).addTo(map)
        rangeCircleRef.current = rangeCircle

        L.circleMarker([SANTEE.lat, SANTEE.lon], {
          radius: 5,
          color: '#f0a93c',
          weight: 2,
          fillColor: '#111416',
          fillOpacity: 1,
        }).bindPopup('<strong>Santee</strong>', {
          closeButton: false,
          autoPan: false,
          className: 'fireMapTooltip home',
        }).addTo(map)

        markerLayer.current = L.layerGroup().addTo(map)
        mapInstance.current = map

      }

      const settleMap = () => {
        const map = mapInstance.current
        const rangeCircle = rangeCircleRef.current
        if (!map || !rangeCircle) return
        map.invalidateSize()
        map.fitBounds(rangeCircle.getBounds(), { padding: [4, 4], animate: false })
        map.setZoom(map.getZoom() + 1, { animate: false })
      }
      requestAnimationFrame(settleMap)
      setTimeout(settleMap, 250)

      markerLayer.current.clearLayers()
      markers.forEach(marker => {
        const isIncident = marker.type === 'incident'
        L.circleMarker([marker.lat, marker.lon], {
          radius: isIncident ? 7 : 5,
          color: isIncident ? '#e0584f' : '#f0a93c',
          weight: 2,
          fillColor: isIncident ? '#e0584f' : '#f0a93c',
          fillOpacity: 0.88,
        }).bindPopup(
          `<strong>${escapeHtml(marker.label)}</strong><br>${escapeHtml(marker.meta)}`,
          {
            closeButton: false,
            autoPan: false,
            className: `fireMapTooltip ${marker.type}`,
          }
        ).addTo(markerLayer.current)
      })
    }).catch(e => {
      if (!cancelled) setMapError(e.message)
    })

    return () => {
      cancelled = true
    }
  }, [markers])

  return (
    <div className="card wideCard accent-fire compactFireMapCard">
      <div className="cardHeaderRow">
        <div>
          <p className="cardLabel">Nearby fire map — {FIRE_INCIDENT_RADIUS_MI} mi radius</p>
          <h2>
            {loading
              ? 'Loading…'
              : markers.length === 0
              ? 'No incidents or hotspots nearby'
              : `${markers.length} nearby signal${markers.length > 1 ? 's' : ''}`}
          </h2>
        </div>
        <div className="fireMapLegend">
          <span><span className="fireMapKey incident" />Incident</span>
          <span><span className="fireMapKey heat" />NASA hotspot</span>
        </div>
      </div>

      <div ref={mapRef} className="fireMap">
        {mapError && (
          <div className="fireMapFallback">
            Map unavailable: {mapError}
          </div>
        )}
      </div>
    </div>
  )
}

function flightIdent(ac) {
  return (ac?.flight?.trim() || ac?.hex || '???').toUpperCase()
}

function aircraftName(ac) {
  return AIRCRAFT_NAMES[ac?.t] ?? ac?.desc ?? ac?.t ?? '—'
}

function flightRoute(ac) {
  const { originCode, originCity, destCode, destCity } = ac?.route ?? {}
  return (originCity ?? originCode) && (destCity ?? destCode)
    ? `${originCity ?? originCode} → ${destCity ?? destCode}`
    : (originCity ?? originCode) ? `From ${originCity ?? originCode}`
    : (destCity ?? destCode) ? `To ${destCity ?? destCode}` : '—'
}

function flightDistanceMi(ac) {
  if (ac?.lat != null && ac?.lon != null) {
    return kmToMi(haversineKm(SANTEE.lat, SANTEE.lon, ac.lat, ac.lon))
  }
  return ac?.dst != null ? ac.dst * 1.15078 : null
}

function radarPosition(ac) {
  if (ac?.lat == null || ac?.lon == null) return null
  const milesPerLat = 69
  const milesPerLon = Math.cos((SANTEE.lat * Math.PI) / 180) * milesPerLat
  const xMi = (ac.lon - SANTEE.lon) * milesPerLon
  const yMi = (ac.lat - SANTEE.lat) * milesPerLat
  const distMi = Math.sqrt(xMi ** 2 + yMi ** 2)
  if (distMi > RADIUS_MI) return null
  return {
    left: 50 + (xMi / RADIUS_MI) * 50,
    top: 50 - (yMi / RADIUS_MI) * 50,
    distMi,
  }
}

function FlightsPage({ flightData }) {
  const { flights, lastUpdated, error, loading } = flightData
  const closest = flights[0]
  const [selectedHex, setSelectedHex] = useState(null)
  const selectedFlight = flights.find(ac => ac.hex === selectedHex) ?? closest
  const radarFlights = flights
    .map(ac => ({ ac, pos: radarPosition(ac) }))
    .filter(item => item.pos)

  return (
    <section className="pageGrid">
      <div className="card wideCard accent-flights">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Flights</p>
            <h2>
              {loading
                ? 'Loading…'
                : error
                ? 'Data unavailable'
                : flights.length === 0
                ? 'Clear skies'
                : `${flights.length} aircraft within ${RADIUS_MI} mi`}
            </h2>
          </div>
          {lastUpdated && (
            <span className="cardMeta">
              Updated{' '}
              {lastUpdated.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
        </div>

        {error && (
          <p className="placeholderText" style={{ color: 'var(--status-alert)' }}>{error}</p>
        )}

        {!loading && !error && flights.length === 0 && (
          <p className="placeholderText">
            No airborne aircraft detected within {RADIUS_MI} miles of home.
          </p>
        )}

        {!error && (
          <div className="radarLayout">
            <div className="radarScope" aria-label={`Aircraft radar within ${RADIUS_MI} miles of home`}>
              <div className="radarSweep" />
              <div className="radarHome">
                <span />
              </div>
              <div className="radarAxis radarAxisVertical" />
              <div className="radarAxis radarAxisHorizontal" />
              <span className="radarRange radarRangeNorth">N</span>
              <span className="radarRange radarRangeEast">E</span>
              <span className="radarRange radarRangeSouth">S</span>
              <span className="radarRange radarRangeWest">W</span>
              {radarFlights.map(({ ac, pos }) => {
                const ident = flightIdent(ac)
                const isSelected = selectedFlight?.hex === ac.hex
                return (
                  <button
                    key={ac.hex}
                    type="button"
                    className={`radarPlane ${isSelected ? 'selected' : ''}`}
                    style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                    onClick={() => setSelectedHex(ac.hex)}
                    aria-label={`${ident}, ${pos.distMi.toFixed(1)} miles away`}
                  >
                    <span
                      className="radarPlaneIcon"
                      style={{ transform: `rotate(${ac.track ?? 0}deg)` }}
                    />
                    <span className="radarPlaneLabel">{ident}</span>
                  </button>
                )
              })}
            </div>

            <div className="radarDetails">
              <p className="cardLabel">Selected aircraft</p>
              {!selectedFlight ? (
                <h2>None</h2>
              ) : (
                <>
                  <h2>{flightIdent(selectedFlight)}</h2>
                  <p className="placeholderText">{aircraftName(selectedFlight)}</p>
                  <div className="statusRow">
                    <span>Route</span>
                    <strong>{flightRoute(selectedFlight)}</strong>
                  </div>
                  <div className="statusRow">
                    <span>Distance</span>
                    <strong>
                      {flightDistanceMi(selectedFlight) != null
                        ? `${flightDistanceMi(selectedFlight).toFixed(1)} mi`
                        : '—'}
                    </strong>
                  </div>
                  <div className="statusRow">
                    <span>Altitude</span>
                    <strong>{formatAlt(selectedFlight.alt_baro)}</strong>
                  </div>
                  <div className="statusRow">
                    <span>Speed</span>
                    <strong>{selectedFlight.gs != null ? `${Math.round(selectedFlight.gs)} kt` : '—'}</strong>
                  </div>
                  <div className="statusRow">
                    <span>Heading</span>
                    <strong>{degToCompass(selectedFlight.track)}</strong>
                  </div>
                  {selectedFlight.r && (
                    <div className="statusRow">
                      <span>Reg</span>
                      <strong>{selectedFlight.r}</strong>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {flights.length > 0 && (
          <div className="flightList">
            <div className="flightRow flightHeader">
              <span>Flight</span>
              <span>Aircraft</span>
              <span>Route</span>
              <span>Altitude</span>
              <span className="flightDistCol">Distance</span>
            </div>
            {flights.map(ac => {
              const distanceMi = flightDistanceMi(ac)
              return (
                <div key={ac.hex} className="flightRow">
                  <span className="flightIdent">{flightIdent(ac)}</span>
                  <span className="flightType" style={{ fontSize: 12 }}>{aircraftName(ac)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{flightRoute(ac)}</span>
                  <span>{formatAlt(ac.alt_baro)}</span>
                  <span className="flightDistCol flightDist">
                    {distanceMi != null ? `${distanceMi.toFixed(1)} mi` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card accent-flights">
        <p className="cardLabel">Closest aircraft</p>
        {!closest ? (
          <h2>None</h2>
        ) : (
          <>
            <h2>{flightIdent(closest)}</h2>
            {closest.t && (
              <p className="placeholderText" style={{ marginBottom: 12 }}>
                {aircraftName(closest)}
              </p>
            )}
            {closest.route?.originCode && closest.route?.destCode && (
              <div className="statusRow">
                <span>Route</span>
                <strong style={{ fontSize: 12, textAlign: 'right', maxWidth: 160 }}>
                  {closest.route.originCity ?? closest.route.originCode} →{' '}
                  {closest.route.destCity ?? closest.route.destCode}
                </strong>
              </div>
            )}
            {closest.route?.airline && (
              <div className="statusRow">
                <span>Airline</span>
                <strong style={{ fontSize: 12 }}>{closest.route.airline}</strong>
              </div>
            )}
            <div className="statusRow">
              <span>Distance</span>
              <strong>
                {flightDistanceMi(closest) != null ? `${flightDistanceMi(closest).toFixed(1)} mi` : '—'}
              </strong>
            </div>
            <div className="statusRow">
              <span>Altitude</span>
              <strong>{formatAlt(closest.alt_baro)}</strong>
            </div>
            <div className="statusRow">
              <span>Speed</span>
              <strong>{closest.gs != null ? `${Math.round(closest.gs)} kt` : '—'}</strong>
            </div>
            <div className="statusRow">
              <span>Heading</span>
              <strong>{degToCompass(closest.track)}</strong>
            </div>
            {closest.r && (
              <div className="statusRow">
                <span>Reg</span>
                <strong>{closest.r}</strong>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function SoccerScoreCard({ team }) {
  const event = team.live ?? team.latest ?? team.next
  const hasScore = event && event.state !== 'pre'
  const gameDate = event ? new Date(event.date) : null
  return (
    <div className={`card accent-sport soccerCard ${team.live ? 'isLive' : ''}`}>
      <div className="soccerTeamHeader">
        {team.logo && <img src={team.logo} alt="" className="soccerLogo" />}
        <div><p className="cardLabel">{team.league}</p><h2>{team.name}</h2></div>
        {team.live && <span className="gameStatePill live">Live</span>}
      </div>
      {!event && <p className="placeholderText">No match information available.</p>}
      {event && hasScore && (
        <div className="soccerScore">
          <div><span>{team.shortName}</span><strong>{event.score}</strong></div>
          <span className="soccerScoreStatus">{team.live ? event.status : 'Final'}</span>
          <div><span>{event.opponentAbbr}</span><strong>{event.opponentScore}</strong></div>
        </div>
      )}
      {event && !hasScore && (
        <div className="soccerNext">
          <span>Next match</span>
          <strong>{event.home ? 'vs' : '@'} {event.opponent}</strong>
        </div>
      )}
      {event && <div className="statusRow"><span>{hasScore ? 'Played' : 'Kickoff'}</span><strong>{gameDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {gameDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div>}
      <div className="statusRow"><span>Record</span><strong>{team.record ?? '—'}</strong></div>
      {team.standing && <div className="statusRow"><span>Standing</span><strong>{team.standing}</strong></div>}
      {team.next && hasScore && <div className="soccerUpcoming"><span>Up next</span><strong>{team.next.home ? 'vs' : '@'} {team.next.opponentAbbr} · {new Date(team.next.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</strong></div>}
    </div>
  )
}

function PadresScoreCard({ padresData }) {
  const { game, latestGame, nextGame, standing, loading, error } = padresData
  const scoreGame = game?.state !== 'Preview' ? game : latestGame
  const event = scoreGame ?? game ?? nextGame
  const upcomingGame = game?.state === 'Preview' ? game : nextGame
  const isLive = game?.state === 'Live'
  const hasScore = Boolean(scoreGame)
  const gameDate = event?.gameDate ? new Date(event.gameDate) : null
  return (
    <div className={`card accent-sport soccerCard ${isLive ? 'isLive' : ''}`}>
      <div className="soccerTeamHeader">
        <div className="sportsMonogram" aria-hidden="true">SD</div>
        <div><p className="cardLabel">MLB</p><h2>San Diego Padres</h2></div>
        {isLive && <span className="gameStatePill live">Live</span>}
      </div>
      {loading && <p className="placeholderText">Loading Padres…</p>}
      {error && <p className="placeholderText" style={{ color: 'var(--status-alert)' }}>Padres scores are temporarily unavailable.</p>}
      {!loading && !error && !event && <p className="placeholderText">No game information available.</p>}
      {hasScore && (
        <div className="soccerScore">
          <div><span>SD</span><strong>{scoreGame.padresScore}</strong></div>
          <span className="soccerScoreStatus">{isLive ? scoreGame.detailedState : 'Final'}</span>
          <div><span>{teamAbbr(scoreGame.opponent)}</span><strong>{scoreGame.opponentScore}</strong></div>
        </div>
      )}
      {event && !hasScore && (
        <div className="soccerNext"><span>Next game</span><strong>{event.padresHome ? 'vs' : '@'} {event.opponent}</strong></div>
      )}
      {event && <div className="statusRow"><span>{hasScore ? 'Played' : 'First pitch'}</span><strong>{gameDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {gameDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div>}
      <div className="statusRow"><span>Record</span><strong>{standing ? `${standing.wins}–${standing.losses}` : '—'}</strong></div>
      <div className="statusRow"><span>NL West</span><strong>{standing?.divisionRank ? `#${standing.divisionRank}${standing.gamesBack && standing.gamesBack !== '-' ? ` · ${standing.gamesBack} GB` : ''}` : '—'}</strong></div>
      <div className="statusRow"><span>National League</span><strong>{standing?.leagueRank ? `#${standing.leagueRank}` : '—'}</strong></div>
      {standing?.wildCardRank && <div className="statusRow"><span>Wild Card</span><strong>#{standing.wildCardRank}</strong></div>}
      {upcomingGame && <div className="soccerUpcoming"><span>Next game</span><strong>{upcomingGame.padresHome ? 'vs' : '@'} {teamAbbr(upcomingGame.opponent)} · {new Date(upcomingGame.gameDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {new Date(upcomingGame.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div>}
    </div>
  )
}

function SportsPage({ padresData, soccerData }) {
  const { teams, loading, error, lastUpdated } = soccerData
  return (
    <section className="pageGrid">
      <div className="card wideCard sportsIntro">
        <div><p className="cardLabel">San Diego teams</p><h2>Sports scoreboard</h2><p className="placeholderText">Padres, San Diego FC, and Wave scores in one place.</p></div>
        <Freshness date={lastUpdated ?? padresData.lastUpdated} staleAfterMinutes={5} />
      </div>
      <PadresScoreCard padresData={padresData} />
      {loading && SOCCER_TEAMS.map(team => <div className="card accent-sport soccerCard" key={team.key}><p className="cardLabel">{team.league}</p><h2>Loading {team.shortName}…</h2></div>)}
      {!loading && teams.map(team => <SoccerScoreCard team={team} key={team.key} />)}
      {error && <div className="card wideCard"><p className="placeholderText" style={{ color: 'var(--status-alert)' }}>Soccer scores are temporarily unavailable: {error}</p></div>}
    </section>
  )
}

export function PadresDetails({ padresData }) {
  const { game, nextGame, boxScore, loading, error, lastUpdated } = padresData
  const isLive = game?.state === 'Live'
  const isFinal = game?.state === 'Final'
  const isPreview = game?.state === 'Preview'
  const padresAhead = game && game.padresScore > game.opponentScore
  const padresBehind = game && game.padresScore < game.opponentScore
  const record = game ?? nextGame
  const gameTime = game?.gameDate
    ? new Date(game.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const padresBatters = game ? (game.padresAway ? boxScore?.awayBatters : boxScore?.homeBatters) : null
  const oppBatters = game ? (game.padresAway ? boxScore?.homeBatters : boxScore?.awayBatters) : null

  return (
    <section className="pageGrid">
      {/* Main game / score card */}
      <div className="card wideCard accent-sport padresCard">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">San Diego Padres</p>
            <h2 className="padresTitle">
              {loading ? 'Loading…'
                : error ? 'Unavailable'
                : !game && !nextGame ? 'Off day'
                : isPreview ? `${game.padresHome ? 'vs' : '@'} ${game.opponent}`
                : isLive ? `Live — ${game.inningHalf === 'Bottom' ? '▾' : '▴'} ${game.inningOrdinal}`
                : isFinal ? `Final — SD ${game.padresScore}, ${teamAbbr(game.opponent)} ${game.opponentScore}`
                : `Next: vs ${nextGame.opponent}`}
            </h2>
          </div>
          {lastUpdated && (
            <span className="cardMeta">
              Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {game && !isPreview && (
          <div className="scoreBoard">
            <div className={`scoreTeam ${padresAhead ? 'leading' : ''}`}>
              <span className="scoreTeamCity">San Diego</span>
              <span className="scoreTeamName">Padres</span>
              <span className={`scoreRun ${padresAhead ? 'scoreWin' : ''}`}>{game.padresScore}</span>
            </div>
            <div className="scoreDivider">
              <span className={`gameStatePill ${isLive ? 'live' : ''}`}>{isLive ? 'Live' : 'Final'}</span>
              <strong>{isLive ? `${game.inningHalf === 'Bottom' ? 'Bottom' : 'Top'} ${game.inningOrdinal}` : 'Final'}</strong>
              {isLive && <span>{game.outs} out{game.outs !== 1 ? 's' : ''}</span>}
            </div>
            <div className={`scoreTeam ${padresBehind ? 'leading' : ''}`}>
              <span className="scoreTeamCity">{game.opponent}</span>
              <span className="scoreTeamName">{teamAbbr(game.opponent)}</span>
              <span className={`scoreRun ${padresBehind ? 'scoreWin' : ''}`}>{game.opponentScore}</span>
            </div>
          </div>
        )}

        {game && isPreview && (
          <div className="pregameBoard">
            <div>
              <span className="scoreTeamCity">{game.padresHome ? game.opponent : 'San Diego Padres'}</span>
              <strong>{game.padresHome ? teamAbbr(game.opponent) : 'SD'}</strong>
            </div>
            <span className="gameStatePill">First pitch {gameTime}</span>
            <div>
              <span className="scoreTeamCity">{game.padresHome ? 'San Diego Padres' : game.opponent}</span>
              <strong>{game.padresHome ? 'SD' : teamAbbr(game.opponent)}</strong>
            </div>
          </div>
        )}

        {/* Line score */}
        {game && !isPreview && game.innings?.length > 0 && (
          <div className="lineScore">
            <div className="lineScoreRow lineScoreHeader">
              <span className="lineScoreTeam" />
              {game.innings.map(i => <span key={i.num} className="lineScoreCell">{i.num}</span>)}
              <span className="lineScoreCell lineScoreStat">R</span>
              <span className="lineScoreCell lineScoreStat">H</span>
              <span className="lineScoreCell lineScoreStat">E</span>
            </div>
            <div className="lineScoreRow">
              <span className="lineScoreTeam">{teamAbbr(game.opponent)}</span>
              {game.innings.map(i => <span key={i.num} className="lineScoreCell">{i.away ?? '—'}</span>)}
              <span className="lineScoreCell lineScoreStat">{game.opponentScore}</span>
              <span className="lineScoreCell lineScoreStat">{game.padresAway ? game.homeHits ?? '—' : game.awayHits ?? '—'}</span>
              <span className="lineScoreCell lineScoreStat">{game.padresAway ? game.homeErrors ?? '—' : game.awayErrors ?? '—'}</span>
            </div>
            <div className="lineScoreRow">
              <span className="lineScoreTeam">SD</span>
              {game.innings.map((i, idx) => (
                <span key={i.num} className="lineScoreCell">
                  {i.home === null && idx === game.innings.length - 1 && isFinal ? 'x' : i.home ?? '—'}
                </span>
              ))}
              <span className="lineScoreCell lineScoreStat">{game.padresScore}</span>
              <span className="lineScoreCell lineScoreStat">{game.padresAway ? game.awayHits ?? '—' : game.homeHits ?? '—'}</span>
              <span className="lineScoreCell lineScoreStat">{game.padresAway ? game.awayErrors ?? '—' : game.homeErrors ?? '—'}</span>
            </div>
          </div>
        )}

        {game && isLive && (
          <div className="statusRow" style={{ marginTop: 8 }}>
            <span>Situation</span>
            <strong>{game.inningHalf} of {game.inningOrdinal} · {game.outs} out{game.outs !== 1 ? 's' : ''}</strong>
          </div>
        )}
        {game && isPreview && (
          <div className="statusRow">
            <span>First pitch</span>
            <strong>{gameTime}</strong>
          </div>
        )}
        {game && (
          <div className="statusRow">
            <span>Venue</span>
            <strong>{game.padresHome ? 'Petco Park · San Diego' : game.venue}</strong>
          </div>
        )}
        {boxScore?.decisions && (
          <div className="statusRow">
            <span>Decisions</span>
            <strong style={{ fontSize: 12, gap: 12, display: 'inline-flex', flexWrap: 'wrap' }}>
              {boxScore.decisions.winner && <span>W: {boxScore.decisions.winner.fullName}</span>}
              {boxScore.decisions.loser && <span>L: {boxScore.decisions.loser.fullName}</span>}
              {boxScore.decisions.save && <span>SV: {boxScore.decisions.save.fullName}</span>}
            </strong>
          </div>
        )}
        {!game && nextGame && (
          <>
            <div className="statusRow">
              <span>Next game</span>
              <strong>
                {new Date(nextGame.gameDate).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                {' · '}
                {new Date(nextGame.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </strong>
            </div>
            <div className="statusRow">
              <span>Opponent</span>
              <strong>{nextGame.padresHome ? 'vs' : '@'} {nextGame.opponent}</strong>
            </div>
            <div className="statusRow">
              <span>Venue</span>
              <strong>{nextGame.padresHome ? 'Petco Park · San Diego' : nextGame.venue}</strong>
            </div>
          </>
        )}
      </div>

      {/* SD box score */}
      {padresBatters && padresBatters.length > 0 && (
        <div className="card wideCard accent-sport">
          <p className="cardLabel">SD Padres — batting</p>
          <h2 style={{ marginBottom: 4 }}>Box score</h2>
          <div className="flightList">
            <div className="flightRow boxRow flightHeader">
              <span>Batter</span>
              <span className="boxNum">AB</span>
              <span className="boxNum">R</span>
              <span className="boxNum">H</span>
              <span className="boxNum">RBI</span>
              <span className="boxNum">BB</span>
              <span className="boxNum">SO</span>
            </div>
            {padresBatters.map((b, i) => (
              <div key={i} className="flightRow boxRow">
                <span className="flightIdent">{b.name} <span className="flightType">{b.pos}</span></span>
                <span className="boxNum">{b.ab}</span>
                <span className="boxNum">{b.r}</span>
                <span className="boxNum">{b.h}</span>
                <span className="boxNum">{b.rbi}</span>
                <span className="boxNum">{b.bb}</span>
                <span className="boxNum">{b.so}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opponent box score */}
      {oppBatters && oppBatters.length > 0 && (
        <div className="card wideCard accent-sport">
          <p className="cardLabel">{game.opponent} — batting</p>
          <h2 style={{ marginBottom: 4 }}>Box score</h2>
          <div className="flightList">
            <div className="flightRow boxRow flightHeader">
              <span>Batter</span>
              <span className="boxNum">AB</span>
              <span className="boxNum">R</span>
              <span className="boxNum">H</span>
              <span className="boxNum">RBI</span>
              <span className="boxNum">BB</span>
              <span className="boxNum">SO</span>
            </div>
            {oppBatters.map((b, i) => (
              <div key={i} className="flightRow boxRow">
                <span className="flightIdent">{b.name} <span className="flightType">{b.pos}</span></span>
                <span className="boxNum">{b.ab}</span>
                <span className="boxNum">{b.r}</span>
                <span className="boxNum">{b.h}</span>
                <span className="boxNum">{b.rbi}</span>
                <span className="boxNum">{b.bb}</span>
                <span className="boxNum">{b.so}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card accent-sport">
        <p className="cardLabel">Season record</p>
        <h2>{record?.wins != null ? `${record.wins}–${record.losses}` : '—'}</h2>
        {record?.wins != null && (
          <div className="statusRow">
            <span>Win %</span>
            <strong>{((record.wins / (record.wins + record.losses)) * 100).toFixed(1)}%</strong>
          </div>
        )}
        <div className="statusRow"><span>Division</span><strong>NL West</strong></div>
      </div>

      <div className="card accent-sport">
        <p className="cardLabel">Today</p>
        <h2>{loading ? '—' : !game ? 'Off day' : game.detailedState}</h2>
        {game && (
          <>
            <div className="statusRow">
              <span>SD Padres</span>
              <strong>
                <span className={`statusDot ${isFinal && padresAhead ? 'good' : isFinal && padresBehind ? 'alert' : isLive && padresAhead ? 'good' : isLive && padresBehind ? 'alert' : 'neutral'}`} />
                {game.padresScore}
              </strong>
            </div>
            <div className="statusRow">
              <span>{teamAbbr(game.opponent)}</span>
              <strong>
                <span className={`statusDot ${isFinal && padresBehind ? 'good' : isFinal && padresAhead ? 'alert' : isLive && padresBehind ? 'good' : isLive && padresAhead ? 'alert' : 'neutral'}`} />
                {game.opponentScore}
              </strong>
            </div>
          </>
        )}
        {!game && !loading && (
          <p className="placeholderText" style={{ marginTop: 8 }}>
            {nextGame ? 'Next game coming up.' : 'No game scheduled.'}
          </p>
        )}
        {error && <p className="placeholderText" style={{ color: 'var(--status-alert)', marginTop: 8 }}>{error}</p>}
      </div>
    </section>
  )
}

function WeatherPage({ weatherData }) {
  const { weather, hourly, daily, error, loading, lastUpdated } = weatherData
  const dailyForecast = groupDailyForecast(daily)

  return (
    <section className="pageGrid">
      <div className="card wideCard accent-weather">
        <div className="cardHeaderRow"><p className="cardLabel">Santee, CA — current conditions</p><Freshness date={lastUpdated} staleAfterMinutes={20} /></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '16px 0 4px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 80, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
            {loading ? '—' : weather ? `${weather.temp}°` : '—'}
          </span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'var(--text)' }}>
              {weather?.description ?? ''}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {weather?.windSpeed && <span>Wind {weather.windSpeed} {weather.windDirection}</span>}
              {weather?.humidity != null && <span>{weather.humidity}% humidity</span>}
              {weather?.precipChance != null && <span>{weather.precipChance}% precip</span>}
              {weather?.uvIndex != null && <span>UV {formatUvIndex(weather.uvIndex)}</span>}
            </div>
          </div>
        </div>
        {error && <p style={{ color: 'var(--status-alert)', fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>

      {hourly.length > 0 && (
        <div className="card wideCard accent-weather">
          <p className="cardLabel">Hourly forecast</p>
          <div className="hourlyStrip">
            {hourly.map((h, i) => (
              <div key={i} className="hourlyCell">
                <span className="hourlyTime">{h.time}</span>
                <span className="hourlyTemp">{h.temp}°</span>
                <span className="hourlyDesc">{h.description}</span>
                {h.precipChance > 0 && <span className="hourlyPrecip">{h.precipChance}%</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {dailyForecast.length > 0 && (
        <div className="card wideCard accent-weather">
          <p className="cardLabel">7-day forecast</p>
          <div className="flightList">
            <div className="flightRow dailyRow flightHeader">
              <span>Day</span>
              <span>High / Low</span>
              <span>Conditions</span>
              <span>Precip</span>
              <span>Wind</span>
            </div>
            {dailyForecast.map((d, i) => (
              <div key={i} className="flightRow dailyRow">
                <span className="flightIdent">{d.name}</span>
                <span className="dailyTemp">
                  {d.high != null && d.low != null
                    ? `${d.high}° / ${d.low}°`
                    : d.high != null
                    ? `${d.high}° / —`
                    : `— / ${d.low}°`}
                </span>
                <span className="dailyCondition">{d.description}</span>
                <span style={{ color: d.precipChance > 0 ? 'var(--status-info)' : 'var(--text-faint)' }}>
                  {d.precipChance > 0 ? `${d.precipChance}%` : '—'}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{d.windSpeed} {d.windDir}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function groupDailyForecast(periods) {
  const days = []

  for (const period of periods) {
    if (period.isDay) {
      days.push({
        name: period.name,
        high: period.temp,
        low: null,
        description: period.description,
        precipChance: period.precipChance,
        windSpeed: period.windSpeed,
        windDir: period.windDir,
      })
      continue
    }

    const day = days[days.length - 1]
    if (day && day.low == null) {
      day.low = period.temp
      day.precipChance = Math.max(day.precipChance ?? 0, period.precipChance ?? 0)
    } else {
      days.push({
        name: period.name.replace(/ Night$/, ''),
        high: null,
        low: period.temp,
        description: period.description,
        precipChance: period.precipChance,
        windSpeed: period.windSpeed,
        windDir: period.windDir,
      })
    }
  }

  return days.slice(0, 7)
}

function KegPage({ kegData }) {
  const { keg, error, loading, lastUpdated } = kegData
  const percent = keg?.percent ?? 0
  const pintsLeft = keg?.pintsLeft ?? 0
  const verdict =
    loading ? 'Consulting the sacred scale…'
    : error ? 'The taproom oracle is not answering'
    : percent >= 65 ? 'Morale is high. Foam discipline remains essential.'
    : percent >= 30 ? 'Respectable reserves. Nobody panic.'
    : percent >= 10 ? 'The keg has entered the danger zone.'
    : 'This is not a drill. Invite fewer people.'
  const pintWord = pintsLeft === 1 ? 'pint' : 'pints'
  const partyMath =
    pintsLeft >= 24 ? 'Enough for a proper evening.'
    : pintsLeft >= 12 ? 'Enough, if everyone behaves.'
    : pintsLeft > 0 ? 'Enough for a very selective guest list.'
    : 'The tap is giving thoughts and prayers.'

  return (
    <section className="pageGrid kegPage">
      <div className="card wideCard accent-keg kegHero">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Keg command</p>
            <h2>
              {loading
                ? 'Loading…'
                : error
                ? 'Unavailable'
                : keg?.kegName ?? 'Shep Shack Tap'}
            </h2>
          </div>
          {lastUpdated && (
            <Freshness date={lastUpdated} staleAfterMinutes={2} />
          )}
        </div>

        <div className="kegHeroBody">
          <div className="kegGauge" style={{ '--keg-level': `${Math.max(0, Math.min(100, percent))}%` }}>
            <div className="kegGlass">
              <div className="kegBeer" />
              <div className="kegFoam" />
            </div>
            <span>{loading || error ? '—' : `${Math.round(percent)}%`}</span>
          </div>

          <div className="kegReadout">
            <p className="kegVerdict">{verdict}</p>
            <p className="kegPints">
              {loading || error ? '—' : pintsLeft.toFixed(1)}
              <span>{pintWord} left</span>
            </p>
            <p className="placeholderText">{partyMath}</p>
          </div>
        </div>
      </div>

      <div className="card accent-keg">
        <p className="cardLabel">Beer math</p>
        <h2>{loading || error ? 'Awaiting pour data' : `${Math.round(keg.beerOz ?? 0)} oz on board`}</h2>
        <div className="statusRow">
          <span>Level</span>
          <strong>
            <span className={`statusDot ${percent > 20 ? 'good' : percent > 8 ? 'info' : keg ? 'alert' : 'neutral'}`} />
            {keg?.percent != null ? `${Math.round(keg.percent)}%` : '—'}
          </strong>
        </div>
        <div className="statusRow">
          <span>Pints left</span>
          <strong>{keg?.pintsLeft != null ? keg.pintsLeft.toFixed(1) : '—'}</strong>
        </div>
        <div className="statusRow">
          <span>Beer</span>
          <strong>{keg?.beerOz != null ? `${Math.round(keg.beerOz)} oz` : '—'}</strong>
        </div>
        <div className="statusRow">
          <span>Total weight</span>
          <strong>{keg?.totalWeightLb != null ? `${keg.totalWeightLb.toFixed(1)} lb` : '—'}</strong>
        </div>
        <div className="statusRow">
          <span>Scale</span>
          <strong>
            <span className={`statusDot ${keg?.hxReady && keg?.hasSavedTare ? 'good' : 'neutral'}`} />
            {keg?.hxReady && keg?.hasSavedTare ? 'Sober enough' : 'Questionable'}
          </strong>
        </div>
        {error && (
          <p className="placeholderText" style={{ color: 'var(--status-alert)', marginTop: 8 }}>
            Keg sensor unavailable: {error}
          </p>
        )}
      </div>

      <div className="card accent-keg">
        <p className="cardLabel">Taproom nonsense</p>
        <h2>{loading ? 'Loading…' : error ? 'Closed for mysteries' : keg?.ready ? 'Open for business' : 'Tap says no'}</h2>
        <div className="statusRow">
          <span>Official status</span>
          <strong><span className={`statusDot ${keg?.ready ? 'good' : error ? 'alert' : 'neutral'}`} />{keg?.ready ? 'Ready' : error ? 'Offline' : 'Unknown'}</strong>
        </div>
        <div className="statusRow">
          <span>Optimism</span>
          <strong>{percent >= 50 ? 'Abundant' : percent >= 20 ? 'Measured' : percent > 0 ? 'Fragile' : 'Gone'}</strong>
        </div>
        <div className="statusRow">
          <span>Next move</span>
          <strong>{percent >= 20 ? 'Pour responsibly' : 'Text the supplier'}</strong>
        </div>
      </div>
    </section>
  )
}

function HousePage({ session }) {
  const network = useNetworkStatus()
  const [speedTest, setSpeedTest] = useState({
    running: false,
    downloadMbps: null,
    durationMs: null,
    checkedAt: null,
    error: null,
  })

  async function runSpeedTest() {
    setSpeedTest(current => ({ ...current, running: true, error: null }))
    const bytes = 5_000_000
    const started = performance.now()

    try {
      const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&cachebust=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const durationMs = performance.now() - started
      const downloadMbps = (blob.size * 8) / (durationMs / 1000) / 1_000_000
      setSpeedTest({
        running: false,
        downloadMbps,
        durationMs,
        checkedAt: new Date(),
        error: null,
      })
    } catch (e) {
      setSpeedTest({
        running: false,
        downloadMbps: null,
        durationMs: null,
        checkedAt: new Date(),
        error: e.message,
      })
    }
  }

  return (
    <section className="pageGrid">

      <div className="card accent-house accountCard">
        <p className="cardLabel">Household account</p>
        <h2>{session.user.email}</h2>
        <div className="statusRow"><span>Access</span><strong><span className="statusDot good" />Household member</strong></div>
        <div className="statusRow"><span>App mode</span><strong>{window.matchMedia('(display-mode: standalone)').matches ? 'Installed' : 'Browser'}</strong></div>
        <button className="signOutButton accountSignOut" type="button" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Sign out</button>
      </div>

      <div className="card accent-house notificationSettingsCard">
        <NotificationControl userId={session.user.id} mode="settings" />
      </div>

      <div className="card accent-house">
        <p className="cardLabel">Network</p>
        <h2>{network.online ? 'Online' : 'Offline'}</h2>
        <div className="statusRow">
          <span>Browser status</span>
          <strong><span className={`statusDot ${network.online ? 'good' : 'alert'}`} />{network.online ? 'Connected' : 'Disconnected'}</strong>
        </div>
        <div className="statusRow">
          <span>Connection</span>
          <strong>{network.effectiveType ? network.effectiveType.toUpperCase() : 'Unknown'}</strong>
        </div>
        <div className="statusRow">
          <span>Estimated downlink</span>
          <strong>{network.downlink != null ? `${network.downlink} Mbps` : '—'}</strong>
        </div>
        <div className="statusRow">
          <span>Estimated latency</span>
          <strong>{network.rtt != null ? `${network.rtt} ms` : '—'}</strong>
        </div>
      </div>

      <div className="card accent-house">
        <p className="cardLabel">Speed test</p>
        <h2>
          {speedTest.running
            ? 'Testing…'
            : speedTest.downloadMbps != null
            ? `${speedTest.downloadMbps.toFixed(1)} Mbps`
            : 'Not run'}
        </h2>
        <div className="statusRow">
          <span>Download</span>
          <strong>
            <span className={`statusDot ${speedTest.downloadMbps == null ? 'neutral' : speedTest.downloadMbps >= 50 ? 'good' : speedTest.downloadMbps >= 15 ? 'info' : 'alert'}`} />
            {speedTest.downloadMbps != null ? `${speedTest.downloadMbps.toFixed(1)} Mbps` : '—'}
          </strong>
        </div>
        <div className="statusRow">
          <span>Test size</span>
          <strong>5 MB</strong>
        </div>
        {speedTest.durationMs != null && (
          <div className="statusRow">
            <span>Duration</span>
            <strong>{(speedTest.durationMs / 1000).toFixed(1)} sec</strong>
          </div>
        )}
        {speedTest.checkedAt && (
          <div className="statusRow">
            <span>Checked</span>
            <strong>{speedTest.checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
          </div>
        )}
        {speedTest.error && (
          <p className="placeholderText" style={{ color: 'var(--status-alert)', marginTop: 8 }}>
            Speed test unavailable: {speedTest.error}
          </p>
        )}
        <button className="primaryAction" type="button" onClick={runSpeedTest} disabled={speedTest.running}>
          {speedTest.running ? 'Running test' : 'Run speed test'}
        </button>
      </div>

      <div className="card accent-house">
        <p className="cardLabel">System</p>
        <h2>Dashboard</h2>
        <div className="statusRow">
          <span>Status</span>
          <strong><span className="statusDot info" />Online</strong>
        </div>
        <div className="statusRow">
          <span>App</span>
          <strong><span className="statusDot good" />Running</strong>
        </div>
        <div className="statusRow">
          <span>Data refresh</span>
          <strong>Automatic</strong>
        </div>
      </div>
    </section>
  )
}

export default App
