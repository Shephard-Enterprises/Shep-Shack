export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
export const asset = file => `${(import.meta.env?.BASE_URL??'/')}retro/${file}`
export function kegLevel(keg) {
  const value = number(keg?.percent)
  return value === null ? null : Math.round(Math.max(0, Math.min(100, value)))
}
export function scoreNumber(value) {
  return typeof value==='string' && /^\d+$/.test(value) ? Number(value) : number(value)
}
export function summarySports(padres = {}, sports = {}) {
  const pg = ['Live', 'Final'].includes(padres.game?.state) ? padres.game : padres.latestGame
  const next = padres.game?.state === 'Preview' ? padres.game : padres.nextGame
  const rows = [{ key:'padres', name:'San Diego Padres', shortName:'PADRES', league:'MLB', logo:`${(import.meta.env?.BASE_URL??'/')}padres.svg`, score:pg?.padresScore, opponentScore:pg?.opponentScore, opponent:pg?.opponent, status:padres.game?.state==='Live'?padres.game.detailedState:pg?'Final':padres.loading?'Loading…':padres.error?'Unavailable':'No result', next, gameDate:pg?.gameDate, isLive:padres.game?.state==='Live', error:padres.error }]
  for (const team of sports.teams ?? []) {
    const event = team.live ?? team.latest
    rows.push({ ...team, logo:team.key==='gulls'?asset('gulls.svg'):team.logo, shortName:team.shortName ?? team.name, score:scoreNumber(event?.score), opponentScore:scoreNumber(event?.opponentScore), opponent:event?.opponentAbbr ?? event?.opponent, status:team.live?(event.status||'Live'):event?'Final':'No result', gameDate:event?.date, gameDateLabel:event?.dateLabel, isLive:Boolean(team.live), error:sports.error||team.error })
  }
  return rows.sort((a,b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
    const aHasResult = number(a.score)!==null
    const bHasResult = number(b.score)!==null
    if (aHasResult !== bHasResult) return aHasResult ? -1 : 1
    // Unstamped results remain available after results whose recency is known.
    const stamp = row => row.gameDate ? Date.parse(row.gameDate) || 0 : 0
    return stamp(b)-stamp(a)
  })
}
export function environmentalStatus(safety = {}, fire = {}) {
  const notices=(safety.weatherAlerts?.length ?? 0)+(safety.countyEmergencies?.length ?? 0)
  const signals=(fire.incidents?.length ?? 0)+(fire.fires?.length ?? 0)
  if (notices) return { title:`${notices} active notice${notices===1?'':'s'}`, tone:'alert' }
  if (fire.incidents?.length) return { title:'Wildfire nearby', tone:'alert' }
  if (signals) return { title:'Heat detected', tone:'info' }
  if (number(safety.airQuality?.aqi)>100) return { title:'Air quality', tone:'alert' }
  if (safety.error||fire.error) return { title:'Data unavailable',tone:'unknown' }
  if (safety.loading||fire.loading) return { title:'Checking…',tone:'unknown' }
  return { title:'No active notices',tone:'good' }
}
export function flightPosition(ac, radiusMiles=5) {
  if (number(ac.lat)===null||number(ac.lon)===null) return null
  const x=(ac.lon+116.9739)*69*Math.cos(32.8384*Math.PI/180)
  const y=(ac.lat-32.8384)*69
  if (Math.hypot(x,y)>radiusMiles) return null
  return {left:50+x/radiusMiles*42,top:50-y/radiusMiles*42}
}
