// Keep small tastes and load-cell drift out of pour history and notifications.
export const MIN_POUR_OZ = 5

export function isRecordedPour(ounces) {
  return Number.isFinite(ounces) && ounces >= MIN_POUR_OZ && ounces <= 64
}

// Require a stable step, rather than merely an absence of an upward rebound.
// A slowly falling load-cell reading must not confirm its own false pour.
export function isConfirmedPour(pour, readings) {
  const time = Date.parse(pour.poured_at)
  const ounces = Number(pour.ounces)
  const after = pour.beer_oz_after
  if (!isRecordedPour(ounces) || !Number.isFinite(time) ||
      typeof after !== 'number' || !Number.isFinite(after)) return false

  const samples = readings.flatMap(reading => {
    const at = Date.parse(reading.recorded_at)
    if (reading.scale_id !== pour.scale_id || !Number.isFinite(at) ||
        at < time - 4 * 60_000 || at > time + 4 * 60_000) return []
    return [{ at, level: reading.payload?.beerOz, ready: reading.payload?.ready,
      event: reading.payload?.eventType, uptime: reading.payload?.lastUpdateMs }]
  }).sort((a, b) => a.at - b.at)
  const valid = sample => sample.ready === true && typeof sample.level === 'number' && Number.isFinite(sample.level)
  const periodic = samples.filter(sample => valid(sample) && !sample.event)
  // Event-triggered uploads cannot stand in for independent minute readings.
  function independent(rows) {
    const selected = []
    for (const row of [...rows].reverse()) {
      if (!selected.length || selected.at(-1).at - row.at >= 45_000) selected.push(row)
    }
    return selected.reverse()
  }
  const before = independent(periodic.filter(sample => sample.at < time)).slice(-3)
  const later = samples.filter(sample => sample.at >= time + 30_000)
  const following = samples.filter(sample => sample.at >= time)
  const settled = independent(later.filter(sample => valid(sample) && !sample.event))
  if (before.length < 3 || before[2].at - before[0].at < 90_000 ||
      settled.length < 3 || settled.at(-1).at < time + 180_000 ||
      settled.at(-1).at - settled[0].at < 120_000) return false

  // Refills, sensor interruptions, another pour, and reboots invalidate the
  // confirmation window. Never bridge an OTA restart into a historical pour.
  if (following.some(sample => !valid(sample) ||
      (sample.event && !(sample.event === 'pour' && sample.at - time <= 1000)))) return false
  const window = samples.filter(sample => sample.at >= before[0].at)
  for (let i = 1; i < window.length; ++i) {
    const previous = window[i - 1], current = window[i]
    if (typeof previous.uptime === 'number' && typeof current.uptime === 'number' &&
        current.uptime < previous.uptime) return false
  }
  for (let i = 1; i < settled.length; ++i) {
    if (settled[i].at - settled[i - 1].at > 90_000) return false
  }
  const baseline = [...before].sort((a, b) => a.level - b.level)[1].level
  const tolerance = Math.min(2, Math.max(1, ounces * 0.1))
  const range = rows => Math.max(...rows.map(row => row.level)) - Math.min(...rows.map(row => row.level))
  return range(before) <= 2 && range(settled) <= 2 &&
    Math.abs(baseline - (after + ounces)) <= tolerance &&
    following.every(sample => valid(sample) && baseline - sample.level >= MIN_POUR_OZ &&
      Math.abs(sample.level - after) <= tolerance)
}
