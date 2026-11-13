export function nextGameLabel(event, now) {
  const raw = event?.date ?? event?.gameDate
  const at = raw ? Date.parse(raw) : NaN
  if (!Number.isFinite(at)) return event?.dateLabel || 'No upcoming games in feed'
  const date = new Date(at)
  const day = date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' })
  if (event.timeTbd) return `${day} · Time TBD`
  const minutes = Math.ceil((at - Number(now)) / 60_000)
  if (minutes > 0 && minutes <= 60) return `In ${minutes} min`
  if (minutes > 60 && minutes <= 1440) return `In ${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return `${day} · ${date.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })} PT`
}

export function orderSportsTeams(rows, now) {
  const nextAt = row => Date.parse(row.next?.date ?? row.next?.gameDate ?? '')
  const soon = row => { const at = nextAt(row); return Number.isFinite(at) && at >= Number(now) && at - Number(now) < 14 * 86400_000 }
  return [...rows].sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
    if (soon(a) !== soon(b)) return soon(a) ? -1 : 1
    if (soon(a) && soon(b)) return nextAt(a) - nextAt(b)
    return (Date.parse(b.gameDate) || 0) - (Date.parse(a.gameDate) || 0)
  })
}
