import { isHouseholdMember } from '../_shared/household-auth.ts'

const HOME = { lat: Number(Deno.env.get('HOME_LAT')), lon: Number(Deno.env.get('HOME_LON')) }
const RADIUS_MI = 30
const MIN_ACRES = 5
const FIRMS_BBOX = '-120,31,-114,35'
const WFIGS_URL = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' } })
}

async function isAuthenticated(request: Request) {
  const workerSecret = Deno.env.get('NOTIFICATION_WORKER_SECRET')
  if (workerSecret && request.headers.get('x-worker-secret') === workerSecret) return true
  return isHouseholdMember(request)
}

function distanceMi(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(a))
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function getIncidents() {
  const params = new URLSearchParams({
    where: "POOState='US-CA' AND IncidentTypeKind='FI' AND IncidentTypeCategory='WF'",
    outFields: 'IncidentName,IncidentSize,PercentContained,POOCounty,FireDiscoveryDateTime,ModifiedOnDateTime_dt,InitialLatitude,InitialLongitude',
    returnGeometry: 'true', orderByFields: 'ModifiedOnDateTime_dt DESC', resultRecordCount: '200', f: 'json',
  })
  const response = await fetch(`${WFIGS_URL}?${params}`)
  if (!response.ok) throw new Error(`WFIGS ${response.status}`)
  const data = await response.json()
  return (data.features ?? []).map((feature: Record<string, any>) => {
    const a = feature.attributes ?? {}
    const lat = a.InitialLatitude ?? feature.geometry?.y
    const lon = a.InitialLongitude ?? feature.geometry?.x
    return { name: a.IncidentName ?? 'Unnamed incident', acres: a.IncidentSize, containment: a.PercentContained, county: a.POOCounty, discovered: a.FireDiscoveryDateTime, updated: a.ModifiedOnDateTime_dt, lat, lon, distMi: typeof lat === 'number' && typeof lon === 'number' ? distanceMi(HOME.lat, HOME.lon, lat, lon) : 999 }
  }).filter((item: Record<string, any>) => item.acres >= MIN_ACRES && item.distMi <= RADIUS_MI).sort((a: Record<string, any>, b: Record<string, any>) => a.distMi - b.distMi)
}

async function getHotspots() {
  const key = Deno.env.get('FIRMS_MAP_KEY')
  if (!key) throw new Error('NASA FIRMS key is not configured')
  const url = `https://firms.modaps.eosdis.nasa.gov/usfs/api/area/csv/${key}/VIIRS_SNPP_NRT/${FIRMS_BBOX}/1/${localDate()}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`FIRMS ${response.status}`)
  const [header = '', ...rows] = (await response.text()).trim().split('\n')
  const columns = header.split(',')
  const at = (name: string) => columns.indexOf(name)
  const clusters: Record<string, any> = {}
  for (const row of rows) {
    const cells = row.split(',')
    const confidence = (cells[at('confidence')] ?? '').toLowerCase()
    if (confidence === 'l' || confidence === 'low') continue
    const lat = Number(cells[at('latitude')]); const lon = Number(cells[at('longitude')])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const distMi = distanceMi(HOME.lat, HOME.lon, lat, lon)
    if (distMi > RADIUS_MI) continue
    const id = `${Math.round(lat * 10)},${Math.round(lon * 10)}`
    const frp = Number(cells[at('frp')]) || 0
    if (!clusters[id]) clusters[id] = { lat, lon, distMi, frp, confidence, detections: 1, acqDate: cells[at('acq_date')] }
    else { clusters[id].frp += frp; clusters[id].detections += 1; clusters[id].distMi = Math.min(clusters[id].distMi, distMi); if (confidence === 'h' || confidence === 'high') clusters[id].confidence = confidence }
  }
  return Object.values(clusters).sort((a: any, b: any) => a.distMi - b.distMi)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!(await isAuthenticated(request))) return json({ error: 'Authentication required.' }, 401)
  const results = await Promise.allSettled([getIncidents(), getHotspots()])
  const incidents = results[0].status === 'fulfilled' ? results[0].value : []
  const fires = results[1].status === 'fulfilled' ? results[1].value : []
  const errors = results.filter(result => result.status === 'rejected').map((result: any) => result.reason?.message ?? String(result.reason))
  return json({ incidents, fires, error: errors.length ? errors.join(' · ') : null, updatedAt: new Date().toISOString() })
})
