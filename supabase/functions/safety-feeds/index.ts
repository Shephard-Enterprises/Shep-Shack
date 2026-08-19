const HOME = { lat: Number(Deno.env.get('HOME_LAT')), lon: Number(Deno.env.get('HOME_LON')) }
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function weatherAlerts() {
  const response = await fetch(`https://api.weather.gov/alerts/active?point=${HOME.lat},${HOME.lon}`, { headers: { 'User-Agent': 'ShepShackDashboard/1.0' } })
  if (!response.ok) throw new Error(`NWS ${response.status}`)
  const data = await response.json()
  return (data.features ?? []).map((feature: any) => ({
    id: feature.id, event: feature.properties?.event, headline: feature.properties?.headline,
    severity: feature.properties?.severity, urgency: feature.properties?.urgency,
    instruction: feature.properties?.instruction, description: feature.properties?.description,
    effective: feature.properties?.effective, expires: feature.properties?.expires,
    url: feature.id,
  }))
}

async function countyEmergencies() {
  const params = new URLSearchParams({
    where: "RELEASE_STATUS='PUBLIC'", geometry: `${HOME.lon},${HOME.lat}`,
    geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OBJECTID,GROUP_ID,NOTIFICATION_TYPE,LABEL,NOTES,DATE_', returnGeometry: 'false', f: 'json',
  })
  const response = await fetch(`https://services1.arcgis.com/1vIhDJwtG5eNmiqX/ArcGIS/rest/services/public_features/FeatureServer/5/query?${params}`)
  if (!response.ok) throw new Error(`County OES ${response.status}`)
  const data = await response.json()
  const labels: Record<number, string> = { 1: 'Evacuation order', 2: 'Evacuation warning', 3: 'General emergency', 4: 'Repopulation notice' }
  return (data.features ?? []).map((feature: any) => ({
    id: feature.attributes.OBJECTID, groupId: feature.attributes.GROUP_ID,
    type: labels[feature.attributes.NOTIFICATION_TYPE] ?? 'Emergency notice',
    label: feature.attributes.LABEL, notes: feature.attributes.NOTES,
    date: feature.attributes.DATE_ ? new Date(feature.attributes.DATE_).toISOString() : null,
  }))
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const results = await Promise.allSettled([weatherAlerts(), countyEmergencies()])
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason?.message ?? 'Feed unavailable'] : [])
  return Response.json({
    weatherAlerts: results[0].status === 'fulfilled' ? results[0].value : [],
    countyEmergencies: results[1].status === 'fulfilled' ? results[1].value : [],
    error: errors.length ? errors.join(' · ') : null, updatedAt: new Date().toISOString(),
  }, { headers: corsHeaders })
})
