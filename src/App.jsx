import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import './Retro.css'
import { RetroHeader, RetroHome, RetroFlights, RetroKegGauge, RetroSports } from './RetroUI'
import ScreenDeck, { PagedItems } from './ScreenDeck'
import KegNameEditor from './KegNameEditor'
import { kegLevel } from './retro-model.mjs'
import { supabase } from './supabase'
import { useFireWatch } from './useFireWatch'
import { useFlights } from './useFlights'
import { useKegStatus } from './useKegStatus'
import { useNetworkStatus } from './useNetworkStatus'
import { usePadres, useSportsScores } from './useSportsData'
import { useWeather } from './useWeather'
import NotificationControl from './NotificationControl'
import AssistantWidget from './AssistantWidget'
import FitnessPage from './FitnessPage'
import { FITNESS_PROFILES } from './fitness-model.mjs'

// Public, approximate city-center coordinates. Precise household coordinates stay server-side.
const SANTEE = { lat: 32.8384, lon: -116.9739 }
const RADIUS_MI = 5
const TIME_ZONE = 'America/Los_Angeles'

// --- Helpers ---

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

function getAqiCategory(aqi) {
  if (aqi == null) return { label: 'Unavailable', tone: 'neutral' }
  if (aqi <= 50) return { label: 'Good', tone: 'good' }
  if (aqi <= 100) return { label: 'Moderate', tone: 'info' }
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', tone: 'alert' }
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'alert' }
  if (aqi <= 300) return { label: 'Very unhealthy', tone: 'alert' }
  return { label: 'Hazardous', tone: 'alert' }
}

function useSafetyData({ enabled = true, intervalMs = 10 * 60_000, refreshKey = 0 } = {}) {
  const [airQuality, setAirQuality] = useState(null)
  const [earthquakes, setEarthquakes] = useState([])
  const [weatherAlerts, setWeatherAlerts] = useState([])
  const [countyEmergencies, setCountyEmergencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    async function load() {
      if (!enabled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
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
        inFlight = false
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, intervalMs, refreshKey])

  return { airQuality, earthquakes, weatherAlerts, countyEmergencies, loading, error, lastUpdated }
}

const FIRE_INCIDENT_RADIUS_MI = 25
const FIRE_INCIDENT_MIN_ACRES = 5

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

// --- App shell ---

const pages = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'weather', label: 'Weather', icon: 'weather' },
  { id: 'fire', label: 'Safety', icon: 'safety' },
  { id: 'flights', label: 'Flights', icon: 'flights' },
  { id: 'sports', label: 'Sports', icon: 'sports' },
  { id: 'keg', label: 'Keg', icon: 'keg' },
  { id: 'fitness', label: 'Fitness', icon: 'fitness' },
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
    fitness: <><path d="m6 5-3 3 13 13 3-3M3 5l2-2 16 16-2 2M14 3l7 7M3 14l7 7"/><path d="m8 15 7-7"/></>,
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

  return <Dashboard key={session.user.id} session={session} />
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
  const [openedFitnessRoutine, setOpenedFitnessRoutine] = useState(null)
  const [fitnessProfileId, setFitnessProfileId] = useState(() => {
    try { const saved = localStorage.getItem(`shep-fitness-profile:${session.user.id}`); return FITNESS_PROFILES.some(profile => profile.id === saved) ? saved : FITNESS_PROFILES[0].id }
    catch { return FITNESS_PROFILES[0].id }
  })
  const changeFitnessProfile = id => {
    if (!FITNESS_PROFILES.some(profile => profile.id === id)) return
    setFitnessProfileId(id)
    try { localStorage.setItem(`shep-fitness-profile:${session.user.id}`, id) } catch { /* Profile selection still works for this visit. */ }
  }

  const [time, setTime] = useState(new Date())
  const [headerCompact, setHeaderCompact] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const pullStart = useRef(null)
  const pullDistanceRef = useRef(0)
  const [activePage, setActivePage] = useState(() => {
    const requestedPage = new URLSearchParams(window.location.search).get('page')
    const requested = requestedPage === 'padres' ? 'sports' : requestedPage
    return pages.some(page => page.id === requested) ? requested : 'home'
  })
  const [selectedScale, setSelectedScale] = useState(() => new URLSearchParams(window.location.search).get('scale') === 'sparkling-water' ? 'sparkling-water' : 'beer')
  const [moreOpen, setMoreOpen] = useState(false)
  const network = useNetworkStatus()
  const onHome = activePage === 'home'
  const flightData = useFlights({ enabled: onHome || activePage === 'flights', intervalMs: onHome ? 5 * 60_000 : 60_000, refreshKey })
  const weatherData = useWeather({ enabled: onHome || activePage === 'weather', intervalMs: onHome ? 5 * 60_000 : 2 * 60_000, refreshKey })
  const fireData = useFireWatch({ enabled: onHome || activePage === 'fire', intervalMs: onHome ? 10 * 60_000 : 5 * 60_000, refreshKey })
  const safetyData = useSafetyData({ enabled: onHome || activePage === 'fire', intervalMs: 10 * 60_000, refreshKey })
  const padresData = usePadres({ enabled: onHome || activePage === 'sports', intervalMs: onHome ? 10 * 60_000 : 60_000, refreshKey })
  const sportsData = useSportsScores({ enabled: onHome || activePage === 'sports', intervalMs: onHome ? 10 * 60_000 : 60_000, refreshKey })
  const kegData = useKegStatus({ scaleId: 'beer', enabled: onHome || activePage === 'keg', includeHistory: activePage === 'keg', intervalMs: onHome ? 60_000 : 30_000, refreshKey })

  const waterKegData = useKegStatus({ scaleId: 'sparkling-water', enabled: onHome || activePage === 'keg', includeHistory: activePage === 'keg', intervalMs: onHome ? 60_000 : 30_000, refreshKey })

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 30_000)
    const clearBadge = () => navigator.clearAppBadge?.()
    const clearBadgeWhenVisible = () => { if (document.visibilityState === 'visible') clearBadge() }
    clearBadge()
    window.addEventListener('focus', clearBadge)
    document.addEventListener('visibilitychange', clearBadgeWhenVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', clearBadge)
      document.removeEventListener('visibilitychange', clearBadgeWhenVisible)
    }
  }, [])

  useEffect(() => {
    const updateHeader = () => setHeaderCompact(current => current ? window.scrollY > 20 : window.scrollY > 90)
    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [])

  useEffect(() => {
    const startPull = event => {
      if (event.target.closest?.('button,input,select,a,dialog,.leaflet-container,.screen-paged-items')) return
      if (window.scrollY <= 0 && event.touches.length === 1) pullStart.current = event.touches[0].clientY
    }
    const movePull = event => {
      if (pullStart.current == null || window.scrollY > 0) return
      const rawDistance = event.touches[0].clientY - pullStart.current
      const distance = rawDistance > 14 ? Math.min(110, (rawDistance - 14) * 0.5) : 0
      pullDistanceRef.current = distance
      setPullDistance(distance)
      if (rawDistance > 14) event.preventDefault()
    }
    const finishPull = () => {
      if (pullDistanceRef.current >= 68) {
        setRefreshing(true)
        setPullDistance(68)
        setRefreshKey(key => key + 1)
        window.setTimeout(() => {
          pullDistanceRef.current = 0
          setPullDistance(0)
          setRefreshing(false)
        }, 700)
      } else {
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
      pullStart.current = null
    }
    window.addEventListener('touchstart', startPull, { passive: true })
    window.addEventListener('touchmove', movePull, { passive: false })
    window.addEventListener('touchend', finishPull)
    window.addEventListener('touchcancel', finishPull)
    return () => {
      window.removeEventListener('touchstart', startPull)
      window.removeEventListener('touchmove', movePull)
      window.removeEventListener('touchend', finishPull)
      window.removeEventListener('touchcancel', finishPull)
    }
  }, [])

  function navigate(page, scaleId) {
    if (!pages.some(item=>item.id===page)) return
    setActivePage(page); setMoreOpen(false)
    const url=new URL(window.location.href); url.searchParams.set('page',page)
    if (scaleId) { setSelectedScale(scaleId); url.searchParams.set('scale',scaleId) }
    window.history.pushState({page},'',url)
    window.scrollTo({top:0,behavior:'instant'})
  }
  useEffect(()=>{
    const restore=()=>{const params=new URLSearchParams(window.location.search);setSelectedScale(params.get('scale')==='sparkling-water'?'sparkling-water':'beer');const page=params.get('page');setActivePage(pages.some(item=>item.id===page)?page:'home')}
    window.addEventListener('popstate',restore)
    return ()=>window.removeEventListener('popstate',restore)
  },[])
  const { weather } = weatherData

  return (
    <main className={`dashboard retro-app retro-page-${activePage}`} style={{'--retro-scene': `url(${import.meta.env.BASE_URL}retro/coastal-sunset.jpg)`}}>
      <div className={`pullRefresh ${pullDistance > 0 ? 'visible' : ''} ${pullDistance >= 68 || refreshing ? 'ready' : ''} ${refreshing ? 'refreshing' : ''}`} style={{ '--pull-distance': `${pullDistance}px` }} aria-hidden="true">
        <span>↻</span><strong>{refreshing ? 'Refreshing…' : pullDistance >= 68 ? 'Release to refresh' : 'Pull to refresh'}</strong>
      </div>
      <RetroHeader now={time} activePage={activePage} title={activePage==='flights'?'Flight Radar':activePage==='keg'?'On Tap':pages.find(page=>page.id===activePage)?.label} weather={weather} compact={headerCompact} navigate={navigate} />

      <nav className="topNav">
        {pages.map(page => (
          <button
            key={page.id}
            className={`navButton ${page.id === 'house' ? 'secondaryNav' : ''} ${activePage === page.id ? 'active' : ''}`}
            onClick={() => navigate(page.id)}
            aria-current={activePage === page.id ? 'page' : undefined}
          >
            <NavIcon name={page.icon} />
            <span>{page.label}</span>
          </button>
        ))}
        <button className={`navButton moreNavButton ${activePage === 'house' ? 'active' : ''}`} type="button" onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen}>
          <NavIcon name="more" /><span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="moreMenu">
          {pages.filter(page => page.id === 'house').map(page => (
            <button key={page.id} type="button" onClick={() => navigate(page.id)}><NavIcon name={page.icon} />{page.label}</button>
          ))}
        </div>
      )}

      {!network.online && <div className="offlineBanner" role="status"><span className="statusDot alert" />Offline · showing the last available readings</div>}

      <header className="pageHeading retro-page-heading">
        <div>
          <p className="pageEyebrow">Shep Shack command center</p>
          <h2>{pages.find(page => page.id === activePage)?.label}</h2>
        </div>
        <div className="headerActions">
          <div className="systemStatus"><span className="liveDot" />{!network.online ? 'Offline' : [flightData,weatherData,fireData,safetyData,padresData,sportsData,kegData,waterKegData].some(feed=>feed.error) ? 'Some feeds unavailable' : 'Connected'}</div><button type="button" className="retro-refresh" onClick={()=>setRefreshKey(key=>key+1)} aria-label="Refresh dashboard readings">↻</button>
          <NotificationControl userId={session.user.id} onOpenSettings={() => navigate('house')} />
        </div>
      </header>

      <div className="retro-screen-content">
      {activePage === 'home' && (
        <HomePage now={time} onNavigate={navigate} flightData={flightData} fireData={fireData} safetyData={safetyData} padresData={padresData} sportsData={sportsData} weatherData={weatherData} kegData={kegData} waterKegData={waterKegData} />
      )}
      {activePage === 'weather' && <WeatherPage weatherData={weatherData} />}
      {activePage === 'fire' && <SafetyPage fireData={fireData} safetyData={safetyData} />}
      {activePage === 'flights' && <FlightsPage flightData={flightData} />}
      {activePage === 'sports' && <SportsPage padresData={padresData} sportsData={sportsData} now={time} />}
      {activePage === 'keg' && <><div className="keg-scale-selector" role="group" aria-label="Select tap"><button aria-pressed={selectedScale==='sparkling-water'} onClick={()=>navigate('keg','sparkling-water')}>Sparkling Water</button><button aria-pressed={selectedScale==='beer'} onClick={()=>navigate('keg','beer')}>Beer</button></div><KegPage key={selectedScale} kegData={selectedScale==='beer'?kegData:waterKegData} /></>}
      {activePage === 'fitness' && <FitnessPage key={openedFitnessRoutine || 'fitness'} userId={session.user.id} profileId={fitnessProfileId} onProfileChange={changeFitnessProfile} />}
      {activePage === 'house' && <HousePage session={session} />}
      </div>
      <AssistantWidget key={session.user.id} userId={session.user.id} page={activePage} profileId={fitnessProfileId} onProfileChange={changeFitnessProfile} onOpenFitness={(id, routineId) => { changeFitnessProfile(id); setOpenedFitnessRoutine(routineId); navigate('fitness') }} />
    </main>
  )
}

// --- Pages ---

function HomePage(props) { return <RetroHome {...props} aircraftName={aircraftName} flightDistanceMi={flightDistanceMi} /> }

function SafetyPage({ fireData, safetyData }) {
  const { incidents, fires, error, loading, lastUpdated } = fireData
  const { airQuality, earthquakes, weatherAlerts, countyEmergencies, loading: safetyLoading, error: safetyError, lastUpdated: safetyUpdated } = safetyData
  const notices = [...countyEmergencies, ...weatherAlerts]
  const category = getAqiCategory(airQuality?.aqi)
  const [detail, setDetail] = useState(null)
  const detailDialog = useRef(null)
  const openDetail = (kind, data) => { setDetail({ kind, data }); detailDialog.current.showModal() }
  const distance = value => Number.isFinite(value) ? `${Math.round(value)} mi` : '—'
  const acres = value => Number.isFinite(value) ? `${Math.round(value).toLocaleString()} acres` : 'Acres unavailable'
  const updated = value => value ? new Date(value).toLocaleString('en-US', { timeZone: TIME_ZONE, month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'Not supplied'

  return <section className="safety-overview" aria-label="Safety overview">
    <section className="safety-notices" aria-label="Official notices">
      <div className="safety-section-heading"><p className="cardLabel">OFFICIAL NOTICES · NWS / COUNTY OES</p><span>{safetyLoading?'Checking…':safetyError?'Unavailable':`${notices.length} active`}</span></div>
      {notices.length>0 ? <PagedItems items={notices} size={1} label="Official notices">{(notice,index)=><button key={notice.id||index} className="safety-notice" onClick={()=>openDetail('notice',notice)}><strong>{notice.event||notice.type}</strong><span>{notice.headline||notice.label||notice.notes||notice.description}</span></button>}</PagedItems> : <p className="safety-empty">{safetyLoading?'Checking official notices…':safetyError?'Official notices unavailable':'No active weather or county notices.'}</p>}
      {safetyError && <span className="safety-feed-error" title={safetyError} role="status">Safety feed update unavailable.</span>}
    </section>
    <section className="safety-air" aria-label="Air quality">
      <div className="safety-section-heading"><p className="cardLabel">AIR QUALITY · SANTEE</p>{safetyUpdated&&<Freshness date={safetyUpdated}/>}</div>
      <div className="safety-aqi"><strong>{safetyLoading?'…':safetyError?'—':airQuality?.aqi!=null?Math.round(airQuality.aqi):'—'}</strong><span>AQI · {safetyError?'Unavailable':category.label}</span></div>
      <div className="safety-air-readings"><span>PM2.5 <b>{airQuality?.pm25!=null?`${Math.round(airQuality.pm25)} µg/m³`:'—'}</b></span><span>Ozone <b>{airQuality?.ozone!=null?`${Math.round(airQuality.ozone)} µg/m³`:'—'}</b></span></div>
    </section>
    <section className="safety-quakes" aria-label="Earthquakes">
      <div className="safety-section-heading"><p className="cardLabel">EARTHQUAKES · 7 DAYS</p><span>USGS · {earthquakes.length}</span></div>
      {earthquakes.length>0 ? <PagedItems items={earthquakes} size={1} label="Earthquakes">{quake=><a key={quake.id} className="safety-quake" href={quake.url} target="_blank" rel="noreferrer"><strong>M {quake.magnitude?.toFixed(1)??'—'}</strong><span title={quake.place}>{distance(quake.distMi)} · {quake.place||'Southern California'}</span><time>{quake.time?.toLocaleString('en-US',{timeZone:TIME_ZONE,weekday:'short',hour:'numeric',minute:'2-digit'})}</time></a>}</PagedItems> : <p className="safety-empty">{safetyLoading?'Checking…':safetyError?'Earthquake feed unavailable':'No recent noticeable earthquakes.'}</p>}
    </section>
    <section className="safety-map" aria-label="Nearby fire map">
      <FireMap incidents={incidents} fires={fires} loading={loading} error={error}/>
      <div className="safety-map-footer"><span>NASA hotspots are heat signals, not confirmed wildfires.</span>{lastUpdated&&<Freshness date={lastUpdated}/>}</div>
      {error&&<p className="safety-feed-error" title={error} role="status">Fire feed update unavailable.</p>}
    </section>
    <section className="safety-incidents" aria-label="Wildfire incidents">
      <div className="safety-section-heading"><p className="cardLabel">WILDFIRES · {FIRE_INCIDENT_RADIUS_MI} MI</p><span>WFIGS · {incidents.length}</span></div>
      <p className="safety-source">Current incidents · {FIRE_INCIDENT_MIN_ACRES}+ acres</p>
      {incidents.length>0 ? <PagedItems items={incidents} size={1} label="Incidents">{(incident,index)=><button key={`${incident.name}-${index}`} className="safety-report" onClick={()=>openDetail('incident',incident)}><strong>{incident.name}</strong><span>{distance(incident.distMi)} · {acres(incident.acres)}</span><span>{incident.containment!=null?`${incident.containment}% contained`:'Containment unavailable'} <b>DETAILS ↗</b></span></button>}</PagedItems> : <p className="safety-empty">{loading?'Checking incidents…':error?'Incident feed unavailable':'No named incidents nearby.'}</p>}
    </section>
    <section className="safety-heat" aria-label="Satellite heat detections">
      <div className="safety-section-heading"><p className="cardLabel">HEAT DETECTIONS · 24H</p><span>NASA · {fires.length}</span></div>
      <p className="safety-source">VIIRS satellite · {FIRE_INCIDENT_RADIUS_MI} mi radius</p>
      {fires.length>0 ? <PagedItems items={fires} size={1} label="Heat detections">{(fire,index)=><button key={index} className="safety-report" onClick={()=>openDetail('heat',fire)}><strong>{fire.location||`${hotspotDirection(fire.lat,fire.lon)} of Santee`}</strong><span>{distance(fire.distMi)} · {Number.isFinite(fire.frp)?`${Math.round(fire.frp)} MW`:'Heat unavailable'}</span><span>{['h','high'].includes(fire.confidence)?'High':'Nominal'} confidence <b>DETAILS ↗</b></span></button>}</PagedItems> : <p className="safety-empty">{loading?'Checking satellites…':error?'Heat feed unavailable':'No satellite heat detections nearby.'}</p>}
    </section>
    <dialog ref={detailDialog} className="retro-art-dialog safety-detail-dialog" aria-label="Safety report details"><button className="retro-dialog-close" onClick={()=>detailDialog.current.close()} aria-label="Close safety details">×</button>{detail&&<>
      <p className="cardLabel">{detail.kind==='notice'?'OFFICIAL NOTICE':detail.kind==='incident'?'WFIGS WILDFIRE INCIDENT':'NASA SATELLITE HEAT DETECTION'}</p>
      <h2>{detail.kind==='notice'?(detail.data.event||detail.data.type):detail.kind==='incident'?detail.data.name:(detail.data.location||'Satellite heat detection')}</h2>
      {detail.kind==='notice'?<><p>{detail.data.headline||detail.data.label||detail.data.notes}</p><p className="safety-notice-description">{detail.data.description}</p>{detail.data.expires&&<p>Expires {updated(detail.data.expires)}</p>}{detail.data.severity&&<p>Severity: {detail.data.severity}</p>}{detail.data.url&&<a href={detail.data.url} target="_blank" rel="noreferrer">Open official notice ↗</a>}</>:<dl>
        <div><dt>Distance</dt><dd>{distance(detail.data.distMi)}</dd></div>
        {detail.kind==='incident'?<><div><dt>Area</dt><dd>{acres(detail.data.acres)}</dd></div><div><dt>Contained</dt><dd>{detail.data.containment!=null?`${detail.data.containment}%`:'Not supplied'}</dd></div><div><dt>County</dt><dd>{detail.data.county||'California'}</dd></div><div><dt>Updated</dt><dd>{updated(detail.data.updated)}</dd></div></>:<><div><dt>Heat output</dt><dd>{detail.data.frp!=null?`${Math.round(detail.data.frp)} MW`:'Not supplied'}</dd></div><div><dt>Confidence</dt><dd>{['h','high'].includes(detail.data.confidence)?'High':'Nominal'}</dd></div><div><dt>Coordinates</dt><dd>{detail.data.lat.toFixed(4)}, {detail.data.lon.toFixed(4)}</dd></div><a href={`https://www.google.com/maps/search/?api=1&query=${detail.data.lat},${detail.data.lon}`} target="_blank" rel="noreferrer">View location ↗</a></>}
      </dl>}
    </>}</dialog>
  </section>
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

function hotspotDirection(lat, lon) {
  const toRadians = degrees => degrees * Math.PI / 180
  const toDegrees = radians => radians * 180 / Math.PI
  const dLon = toRadians(lon - SANTEE.lon)
  const homeLat = toRadians(SANTEE.lat)
  const hotspotLat = toRadians(lat)
  const bearing = (toDegrees(Math.atan2(
    Math.sin(dLon) * Math.cos(hotspotLat),
    Math.cos(homeLat) * Math.sin(hotspotLat) - Math.sin(homeLat) * Math.cos(hotspotLat) * Math.cos(dLon),
  )) + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8]
}

function loadLeaflet() {
  return Promise.resolve(L)
}

function FireMap({ incidents, fires, loading, error }) {
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
          zoomSnap: 0.5,
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
        map.fitBounds(rangeCircle.getBounds(), { padding: [8, 8], animate: false })
        map.setZoom(map.getZoom() + 1.5, { animate: false })
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
              : error ? 'Fire data unavailable'
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

function FlightsPage({ flightData }) {
  return <RetroFlights flightData={flightData} aircraftName={aircraftName} flightDistanceMi={flightDistanceMi} flightRoute={flightRoute} flightIdent={flightIdent} radiusMiles={RADIUS_MI} />
}

function TeamScoreCard({ team }) {
  const event = team.live ?? team.latest ?? team.next
  const hasScore = event && event.state !== 'pre'
  const gameDate = event?.date ? new Date(event.date) : null
  const goals = team.live ? team.live.scorers ?? [] : team.latest?.scorers ?? []
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
      {hasScore && goals.length > 0 && <div className="sportsScorers"><span>Goals</span><strong>{goals.map(goal => goal.name).join(' · ')}</strong></div>}
      {hasScore && goals.length === 0 && team.latest?.recap && <a className="sportsScorers" href={team.latest.recap} target="_blank" rel="noreferrer"><span>Goal recap</span><strong>View game recap ↗</strong></a>}
      {hasScore && goals.length === 0 && !team.latest?.recap && team.scorerError && <div className="sportsScorers"><span>Goals</span><strong>Details temporarily unavailable</strong></div>}
      {event && !hasScore && (
        <div className="soccerNext">
          <span>Next match</span>
          <strong>{event.home ? 'vs' : '@'} {event.opponent}</strong>
        </div>
      )}
      {event && (gameDate || event.dateLabel) && <div className="statusRow"><span>{hasScore ? 'Played' : 'Kickoff'}</span><strong>{event.dateLabel ?? `${gameDate.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', weekday: 'short', month: 'short', day: 'numeric' })} · ${gameDate.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}`}</strong></div>}
      <div className="statusRow"><span>Record</span><strong>{team.record ?? '—'}</strong></div>
      {team.standing && <div className="statusRow"><span>Standing</span><strong>{team.standing}</strong></div>}
      {team.next && hasScore && <div className="soccerUpcoming"><span>Up next</span><strong>{team.next.home ? 'vs' : '@'} {team.next.opponentAbbr}{team.next.dateLabel ? ` · ${team.next.dateLabel}` : team.next.date ? ` · ${new Date(team.next.date).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' })} · ${new Date(team.next.date).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}` : ''}</strong></div>}
      {!team.next && team.latest && <div className="soccerUpcoming"><span>Next game</span><strong>No upcoming game in this feed</strong></div>}
    </div>
  )
}

function PadresScoreCard({ padresData }) {
  const { game, latestGame, nextGame, standing, loading, error } = padresData
  const scoreGame = game && game.state !== 'Preview' ? game : latestGame
  const event = scoreGame ?? game ?? nextGame
  const upcomingGame = game?.state === 'Preview' ? game : nextGame
  const isLive = game?.state === 'Live'
  const hasScore = Boolean(scoreGame)
  const gameDate = event?.gameDate ? new Date(event.gameDate) : null
  const previousGame = latestGame && latestGame.gamePk !== scoreGame?.gamePk ? latestGame : null
  return (
    <div className={`card accent-sport soccerCard ${isLive ? 'isLive' : ''}`}>
      <div className="soccerTeamHeader">
        <img src={`${import.meta.env.BASE_URL}padres.svg`} alt="" className="soccerLogo" />
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
      {event && gameDate && <div className="statusRow"><span>{hasScore ? 'Played' : 'First pitch'}</span><strong>{gameDate.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', weekday: 'short', month: 'short', day: 'numeric' })} · {gameDate.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}</strong></div>}
      <div className="statusRow"><span>Record</span><strong>{standing ? `${standing.wins}–${standing.losses}` : '—'}</strong></div>
      <div className="statusRow"><span>NL West</span><strong>{standing?.divisionRank ? `#${standing.divisionRank}${standing.gamesBack && standing.gamesBack !== '-' ? ` · ${standing.gamesBack} GB` : ''}` : '—'}</strong></div>
      <div className="statusRow"><span>National League</span><strong>{standing?.leagueRank ? `#${standing.leagueRank}` : '—'}</strong></div>
      {standing?.wildCardRank && <div className="statusRow"><span>Wild Card</span><strong>#{standing.wildCardRank}</strong></div>}
      {previousGame && <div className="sportsPreviousResult">
        <span>Previous · {new Date(previousGame.gameDate).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        <strong>SD {previousGame.padresScore}–{previousGame.opponentScore} {teamAbbr(previousGame.opponent)}</strong>
      </div>}
      {upcomingGame && <div className="soccerUpcoming"><span>Next game</span><strong>{upcomingGame.padresHome ? 'vs' : '@'} {teamAbbr(upcomingGame.opponent)} · {new Date(upcomingGame.gameDate).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' })} · {new Date(upcomingGame.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}</strong></div>}
    </div>
  )
}

function SportsPage({ padresData, sportsData, now }) {
  return <RetroSports padresData={padresData} sportsData={sportsData} now={now} renderDetails={row=>row.key==='padres'?<PadresScoreCard padresData={padresData}/>:<TeamScoreCard team={row}/>} />
}

function WeatherRadar({ hourly }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const radarLayer = useRef(null)
  const [frames, setFrames] = useState([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [radarError, setRadarError] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [inView, setInView] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== 'hidden')

  useEffect(() => {
    const element = mapRef.current
    if (!element) return undefined
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: '240px 0px',
      threshold: 0.01,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (!inView || !documentVisible) return undefined
    let cancelled = false
    async function loadFrames() {
      try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json')
        if (!response.ok) throw new Error(`Radar HTTP ${response.status}`)
        const data = await response.json()
        const recentFrames = (data.radar?.past ?? []).slice(-12).map(frame => ({ ...frame, host: data.host }))
        if (!recentFrames.length) throw new Error('No radar frames available')
        if (!cancelled) {
          setFrames(recentFrames)
          setFrameIndex(recentFrames.length - 1)
          setRadarError(null)
        }
      } catch (error) {
        if (!cancelled) setRadarError(error.message)
      }
    }
    loadFrames()
    const refreshId = setInterval(loadFrames, 5 * 60_000)
    return () => { cancelled = true; clearInterval(refreshId) }
  }, [inView, documentVisible])

  useEffect(() => {
    if (!inView || !documentVisible) return undefined
    let cancelled = false
    loadLeaflet().then(L => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        minZoom: 6,
        maxZoom: 7,
      }).setView([SANTEE.lat, SANTEE.lon], 7)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'radarBaseTiles',
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      L.circleMarker([SANTEE.lat, SANTEE.lon], {
        radius: 5,
        color: '#f4f2ec',
        weight: 2,
        fillColor: '#e0584f',
        fillOpacity: 1,
      }).bindTooltip('Santee', { permanent: true, direction: 'right', offset: [7, 0], className: 'radarHomeLabel' }).addTo(map)
      L.control.attribution({ prefix: false }).addTo(map)
      mapInstance.current = map
      setMapReady(true)
      requestAnimationFrame(() => map.invalidateSize())
      setTimeout(() => map.invalidateSize(), 250)
    }).catch(error => {
      if (!cancelled) setRadarError(error.message)
    })
    return () => { cancelled = true }
  }, [inView, documentVisible])

  useEffect(() => () => {
    mapInstance.current?.remove()
    mapInstance.current = null
    radarLayer.current = null
  }, [])

  useEffect(() => {
    if (!playing || !inView || !documentVisible || frames.length < 2) return undefined
    const animationId = setInterval(() => setFrameIndex(index => (index + 1) % frames.length), 850)
    return () => clearInterval(animationId)
  }, [playing, inView, documentVisible, frames.length])

  useEffect(() => {
    const map = mapInstance.current
    const frame = frames[frameIndex]
    if (!map || !frame) return
    if (radarLayer.current) radarLayer.current.remove()
    radarLayer.current = L.tileLayer(`${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      tileSize: 256,
      opacity: 0.72,
      maxNativeZoom: 7,
      maxZoom: 7,
      attribution: 'Radar: <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
    }).addTo(map)
  }, [frames, frameIndex, mapReady])

  const activeFrame = frames[frameIndex]
  const frameTime = activeFrame ? new Date(activeFrame.time * 1000) : null
  const upcomingRain = hourly.find(period => period.precipChance >= 50)

  return (
    <div className="card wideCard accent-weather weatherRadarCard">
      <div className="cardHeaderRow">
        <div><p className="cardLabel">Near-real-time Doppler</p><h2>Regional rain radar</h2></div>
        {frameTime && <span className="cardMeta">{frameIndex === frames.length - 1 ? 'Latest · ' : ''}{frameTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
      </div>
      <div ref={mapRef} className="fireMap radarMap">
        {!inView && !mapReady && <div className="radarIdleState">Preparing radar…</div>}
        {radarError && <div className="fireMapFallback radarFallback">Radar temporarily unavailable: {radarError}</div>}
      </div>
      <div className="radarControls">
        <button type="button" className="radarPlayButton" onClick={() => setPlaying(value => !value)} disabled={frames.length < 2}>{playing && inView && documentVisible ? 'Pause' : 'Play'} radar</button>
        <div className="radarTimeline" aria-label="Radar timeline">
          {frames.map((frame, index) => <button type="button" className={index === frameIndex ? 'active' : ''} aria-label={new Date(frame.time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} onClick={() => { setPlaying(false); setFrameIndex(index) }} key={frame.time} />)}
        </div>
        <span>{frames.length ? inView && documentVisible ? 'Past 2 hours' : 'Paused offscreen' : inView ? 'Loading radar…' : 'Preparing radar…'}</span>
      </div>
      <div className="radarForecastStatus">
        <span className={`statusDot ${upcomingRain ? 'info' : 'good'}`} />
        <span>{upcomingRain ? `Rain chance reaches ${upcomingRain.precipChance}% around ${upcomingRain.time}` : 'No likely rain in the next 12 hours'}</span>
      </div>
      <p className="radarNote">Radar refreshes every five minutes. Forecast timing—not radar alone—drives rain notifications.</p>
    </div>
  )
}

function WeatherPage({ weatherData }) {
  const { weather, hourly, daily, error, loading, lastUpdated } = weatherData
  const dailyForecast = groupDailyForecast(daily)
  const [selectedHour, setSelectedHour] = useState(null)
  const hourDialog = useRef(null)

  return <section className="weather-overview" aria-label="Weather overview">
    <section className="weather-current" aria-label="Current conditions">
      <div className="weather-current-top"><p className="cardLabel">SANTEE · CURRENT CONDITIONS</p><span className="weather-feed-state">{error?<span className="weather-feed-error" title={error} role="status">Update unavailable</span>:<Freshness date={lastUpdated} staleAfterMinutes={20}/>}</span></div>
      <div className="weather-current-body"><strong className="weather-temperature">{loading ? '—' : weather ? `${weather.temp}°` : '—'}</strong><div><h2>{weather?.description || (loading ? 'Loading weather…' : 'Weather unavailable')}</h2><div className="weather-current-metrics"><span>Wind <b>{weather?.windSpeed ?? '—'} {weather?.windDirection}</b></span><span>Humidity <b>{weather?.humidity != null ? `${weather.humidity}%` : '—'}</b></span><span>Rain <b>{weather?.precipChance != null ? `${weather.precipChance}%` : '—'}</b></span><span>UV <b>{formatUvIndex(weather?.uvIndex)}</b></span></div></div></div>
    </section>
    <section className="weather-hours" aria-label="Hourly forecast">
      <div className="weather-section-label"><p className="cardLabel">NEXT 12 HOURS</p><span>Select an hour for details</span></div>
      <div className="weather-hour-grid">{hourly.slice(0,12).map((hour,index)=><button key={index} className="weather-hour" onClick={()=>{setSelectedHour(hour);hourDialog.current.showModal()}} aria-label={`${hour.time}, ${hour.temp} degrees, ${hour.description}, ${hour.precipChance}% rain chance`}><time>{hour.time}</time><strong>{hour.temp}°</strong><span className="weather-hour-description">{hour.description}</span><small className={hour.precipChance>0?'has-rain':''}>{hour.precipChance}%</small></button>)}</div>
      {!hourly.length && <p className="retro-message">{loading?'Loading hourly forecast…':'Hourly forecast unavailable.'}</p>}
    </section>
    <section className="weather-week" aria-label="Seven-day forecast">
      <p className="cardLabel">7-DAY FORECAST</p>
      <div className="weather-week-heading"><span>Day</span><span>High / Low</span><span>Conditions</span><span>Rain</span><span>Wind mph</span></div>
      <div className="weather-week-rows">{dailyForecast.map((day,index)=><div key={index} className="weather-day"><strong title={day.name}>{day.name.replace('This Afternoon','Today').replace('This Morning','Today').replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/g,name=>name.slice(0,3))}</strong><b>{day.high ?? '—'}° / {day.low ?? '—'}°</b><span className="weather-day-description" title={day.description}>{day.description}</span><span className={day.precipChance>0?'has-rain':''}>{day.precipChance}%</span><span title={`${day.windSpeed} ${day.windDir}`}>{day.windSpeed?.replace(' to ','–').replace(' mph','')} {day.windDir}</span></div>)}</div>
      {!dailyForecast.length && <p className="retro-message">{loading?'Loading daily forecast…':'Daily forecast unavailable.'}</p>}
    </section>
    <div className="weather-map"><WeatherRadar hourly={hourly}/></div>
    <dialog ref={hourDialog} className="retro-art-dialog weather-hour-dialog" aria-label="Hourly weather details"><button className="retro-dialog-close" onClick={()=>hourDialog.current.close()} aria-label="Close hourly details">×</button>{selectedHour&&<><p className="cardLabel">HOURLY FORECAST · {selectedHour.time}</p><h2>{selectedHour.temp}° · {selectedHour.description}</h2><p>Rain chance: {selectedHour.precipChance}%</p><p>Wind: {selectedHour.windSpeed ?? '—'} {selectedHour.windDir}</p></>}</dialog>
  </section>
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

function KegHistory({ history, pours, currentBeerOz, latestKegChange }) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const activePours = latestKegChange ? pours.filter(pour => pour.pouredAt >= latestKegChange.changedAt) : pours
  const activeHistory = latestKegChange ? history.filter(point => point.recordedAt >= latestKegChange.changedAt) : history
  const todaysPours = activePours.filter(pour => pour.pouredAt >= startOfToday)
  const ouncesToday = todaysPours.reduce((total, pour) => total + pour.ounces, 0)
  const averagePour = activePours.length ? activePours.reduce((total, pour) => total + pour.ounces, 0) / activePours.length : null
  const daysObserved = latestKegChange ? Math.max(1, (now - latestKegChange.changedAt) / (24 * 60 * 60 * 1000)) : 7
  const sevenDayRate = activePours.length ? activePours.reduce((total, pour) => total + pour.ounces, 0) / daysObserved : 0
  const daysLeft = sevenDayRate > 0 && currentBeerOz > 0 ? currentBeerOz / sevenDayRate : null
  const points = activeHistory.filter(point => Number.isFinite(Number(point.beerOz)))
  const width = 640
  const height = 180
  const padding = 18
  const values = points.map(point => Number(point.beerOz))
  const minValue = values.length ? Math.max(0, Math.min(...values) - 8) : 0
  const maxValue = values.length ? Math.max(...values) + 8 : 640
  const range = Math.max(1, maxValue - minValue)
  const line = points.map((point, index) => {
    const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2)
    const y = height - padding - ((Number(point.beerOz) - minValue) / range) * (height - padding * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const activityByDay = dayNames.map((label, day) => ({
    label,
    ounces: pours.filter(pour => pour.pouredAt.getDay() === day).reduce((total, pour) => total + pour.ounces, 0),
    pours: pours.filter(pour => pour.pouredAt.getDay() === day).length,
  }))
  const activityByWindow = Array.from({ length: 8 }, (_, index) => {
    const startHour = index * 3
    const matchingPours = pours.filter(pour => Math.floor(pour.pouredAt.getHours() / 3) === index)
    return {
      startHour,
      ounces: matchingPours.reduce((total, pour) => total + pour.ounces, 0),
      pours: matchingPours.length,
    }
  })
  const busiestDay = activityByDay.reduce((best, day) => day.ounces > best.ounces ? day : best, activityByDay[0])
  const busiestWindow = activityByWindow.reduce((best, window) => window.ounces > best.ounces ? window : best, activityByWindow[0])
  const maxDayOunces = Math.max(...activityByDay.map(day => day.ounces), 1)
  const formatHour = hour => hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`
  const busiestWindowLabel = `${formatHour(busiestWindow.startHour)}–${formatHour((busiestWindow.startHour + 3) % 24)}`

  return <ScreenDeck className="kegAnalytics">
    <div className="card wideCard accent-keg kegHistoryCard" data-screen-label="Level history">
      <div className="cardHeaderRow"><div><p className="cardLabel">Last 24 hours</p><h2>Keg level history</h2></div><span className="cardMeta">{points.length} readings</span></div>
      {points.length > 1 ? <>
        <svg className="kegChart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Liquid remaining over the last 24 hours">
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} className="kegChartGrid" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="kegChartGrid" />
          <polyline points={line} className="kegChartLine" />
        </svg>
        <div className="kegChartLabels"><span>24 hours ago</span><strong>{Math.round(currentBeerOz ?? values.at(-1))} oz now</strong><span>Now</span></div>
      </> : <p className="placeholderText">History will appear after more readings arrive.</p>}
    </div>

    <div className="card accent-keg" data-screen-label="Today">
      <p className="cardLabel">Today at the tap</p>
      <h2>{todaysPours.length ? `${ouncesToday.toFixed(1)} oz poured` : 'No pours yet'}</h2>
      <div className="statusRow"><span>Pours</span><strong>{todaysPours.length}</strong></div>
      <div className="statusRow"><span>Average pour</span><strong>{averagePour == null ? '—' : `${averagePour.toFixed(1)} oz`}</strong></div>
      <div className="statusRow"><span>Last pour</span><strong>{activePours[0] ? `${activePours[0].ounces.toFixed(1)} oz · ${activePours[0].pouredAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '—'}</strong></div>
      <div className="statusRow"><span>Estimated supply</span><strong>{daysLeft == null ? 'Learning…' : `${daysLeft.toFixed(1)} days`}</strong></div>
      <div className="statusRow"><span>Current keg</span><strong>{latestKegChange ? `Since ${latestKegChange.changedAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Original keg'}</strong></div>
    </div>

    <div className="card accent-keg" data-screen-label="Recent pours">
      <p className="cardLabel">Recent pours</p>
      <h2>{activePours.length ? `${activePours.length} from this keg` : 'Waiting for first pour'}</h2>
      {activePours.slice(0, 5).map(pour => <div className="statusRow" key={pour.id}><span>{pour.pouredAt.toLocaleDateString([], { weekday: 'short' })} · {pour.pouredAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><strong>{pour.ounces.toFixed(1)} oz</strong></div>)}
      {!activePours.length && <p className="placeholderText">New ESP32 pour events will show here.</p>}
    </div>

    <div className="card wideCard accent-keg drinkingTimesCard" data-screen-label="Drinking times">
      <div className="cardHeaderRow">
        <div><p className="cardLabel">Last 30 days</p><h2>Busiest drinking times</h2></div>
        <span className="cardMeta">{pours.length} recorded {pours.length === 1 ? 'pour' : 'pours'}</span>
      </div>
      {pours.length ? <>
        <div className="drinkingHighlights">
          <div><span>Busiest day</span><strong>{busiestDay.label}</strong><small>{busiestDay.pours} {busiestDay.pours === 1 ? 'pour' : 'pours'} · {busiestDay.ounces.toFixed(1)} oz</small></div>
          <div><span>Prime time</span><strong>{busiestWindowLabel}</strong><small>{busiestWindow.pours} {busiestWindow.pours === 1 ? 'pour' : 'pours'} · {busiestWindow.ounces.toFixed(1)} oz</small></div>
        </div>
        <div className="drinkingWeek" role="img" aria-label="Ounces poured by day of week over the last 30 days">
          {activityByDay.map(day => <div className="drinkingDay" key={day.label} title={`${day.label}: ${day.ounces.toFixed(1)} oz`}>
            <span>{day.ounces ? `${Math.round(day.ounces)}` : ''}</span>
            <div className="drinkingBarTrack"><div className="drinkingBar" style={{ height: `${Math.max(day.ounces ? 8 : 0, (day.ounces / maxDayOunces) * 100)}%` }} /></div>
            <strong>{day.label}</strong>
          </div>)}
        </div>
        {pours.length < 5 && <p className="placeholderText drinkingLearning">Early trend—this gets more useful after a few more pours.</p>}
      </> : <p className="placeholderText">No pour history yet. This chart will start learning automatically with the next keg.</p>}
    </div>
  </ScreenDeck>
}

function KegPage({ kegData }) {
  const isWater = kegData.scaleId === 'sparkling-water'
  const { keg, history, pours, latestKegChange, error, loading, lastUpdated } = kegData
  const percent = keg?.percent ?? 0
  const pintsLeft = keg?.pintsLeft ?? 0
  const verdict =
    loading ? 'Loading keg status…'
    : error ? 'Keg sensor unavailable'
    : !keg ? 'No keg reading available.'
    : percent >= 65 ? 'Keg level is high.'
    : percent >= 30 ? 'Keg level is moderate.'
    : percent >= 10 ? 'Keg is running low.'
    : 'Keg is nearly empty.'
  const pintWord = isWater ? (pintsLeft === 1 ? 'pour' : 'pours') : (pintsLeft === 1 ? 'pint' : 'pints')
  const partyMath =
    pintsLeft >= 24 ? 'Enough for a proper evening.'
    : pintsLeft >= 12 ? 'Enough, if everyone behaves.'
    : pintsLeft > 0 ? 'Enough for a very selective guest list.'
    : 'The tap is giving thoughts and prayers.'

  return (
    <ScreenDeck className="kegPage" groups={[{label:'On tap',classes:['kegHero','kegStats']},{label:'Analytics',types:[KegHistory]}]}>
      <div className="card wideCard accent-keg kegHero">
        <div className="cardHeaderRow">
          <div>
            <p className="cardLabel">Keg command</p>
            <h2>
              {kegData.displayName ?? (loading
                ? 'Loading…'
                : error
                ? 'Unavailable'
                : keg?.kegName ?? (isWater ? 'Sparkling Water' : 'Shep Shack Tap'))}
            </h2>
          </div>
          {lastUpdated && (
            <Freshness date={lastUpdated} staleAfterMinutes={2} />
          )}
        </div>

        <KegNameEditor data={kegData} />
        <div className="kegHeroBody">
          <div className="retro-keg-hero-gauge"><RetroKegGauge level={loading||error?null:kegLevel(keg)} liquid={isWater?'water':'beer'}/><strong>{loading||error||kegLevel(keg)===null?'—':`${kegLevel(keg)}%`}</strong></div>

          <div className="kegReadout">
            <p className="kegVerdict">{verdict}</p>
            <p className="kegPints">
              {loading || error ? '—' : pintsLeft.toFixed(1)}
              <span>{pintWord} left</span>
            </p>
            <p className="placeholderText">{isWater?'Sparkling water · 16 oz pours':partyMath}</p>
          </div>
        </div>
      </div>

      <div className="card accent-keg kegStats">
        <p className="cardLabel">{isWater?'Water supply':'Beer math'}</p>
        <h2>{loading || error ? 'Awaiting pour data' : `${Math.round(keg?.beerOz ?? 0)} oz on board`}</h2>
        <div className="statusRow">
          <span>Level</span>
          <strong>
            <span className={`statusDot ${percent > 20 ? 'good' : percent > 8 ? 'info' : keg ? 'alert' : 'neutral'}`} />
            {keg?.percent != null ? `${Math.round(keg.percent)}%` : '—'}
          </strong>
        </div>
        <div className="statusRow">
          <span>{isWater?'16 oz pours left':'Pints left'}</span>
          <strong>{keg?.pintsLeft != null ? keg.pintsLeft.toFixed(1) : '—'}</strong>
        </div>
        <div className="statusRow">
          <span>{isWater?'Water':'Beer'}</span>
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
            {keg?.hxReady && keg?.hasSavedTare ? (isWater?'Sensor ready':'Sober enough') : (isWater?'Needs attention':'Questionable')}
          </strong>
        </div>
        {error && (
          <p className="placeholderText" style={{ color: 'var(--status-alert)', marginTop: 8 }}>
            Keg sensor unavailable: {error}
          </p>
        )}
      </div>

      <KegHistory history={history} pours={pours} currentBeerOz={keg?.beerOz} latestKegChange={latestKegChange} />
    </ScreenDeck>
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
    <ScreenDeck className="housePage">

      <div className="card accent-house accountCard" data-screen-label="Account">
        <p className="cardLabel">Household account</p>
        <h2>{session.user.email}</h2>
        <div className="statusRow"><span>Access</span><strong><span className="statusDot good" />Household member</strong></div>
        <div className="statusRow"><span>App mode</span><strong>{window.matchMedia('(display-mode: standalone)').matches ? 'Installed' : 'Browser'}</strong></div>
        <button className="signOutButton accountSignOut" type="button" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Sign out</button>
      </div>

      <div className="card accent-house notificationSettingsCard" data-screen-label="Notifications">
        <NotificationControl userId={session.user.id} mode="settings" />
      </div>

      <div className="card accent-house" data-screen-label="Network">
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

      <div className="card accent-house" data-screen-label="Speed test">
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

      <div className="card accent-house" data-screen-label="System">
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
    </ScreenDeck>
  )
}

export default App

export { HomePage, SafetyPage, SportsPage, FlightsPage, KegPage, WeatherPage }
