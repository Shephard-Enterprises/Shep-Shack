const storageKey = 'shep-fitness-timer-sound'
let enabled = true
try { enabled = localStorage.getItem(storageKey) !== 'off' } catch { /* Use the default when storage is unavailable. */ }
const listeners = new Set()
let context
export const timerSoundEnabled = () => enabled
export const subscribeTimerSound = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export function setTimerSoundEnabled(value) {
  enabled = value
  try { localStorage.setItem(storageKey, value ? 'on' : 'off') } catch { /* Sound still works for this visit. */ }
  listeners.forEach(listener => listener())
}
export function unlockTimerAudio() {
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!Audio) return Promise.resolve()
    context ||= new Audio()
    return context.resume().catch(() => {})
  } catch { return Promise.resolve() }
}
export function playTimerSound(cue) {
  if (!enabled || !context || context.state !== 'running' || document.visibilityState === 'hidden') return
  const notes = { tick: [660], work: [660, 880], rest: [440, 330], complete: [523, 659, 784] }[cue]
  if (!notes) return
  try {
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain()
      const start = context.currentTime + index * 0.16
      oscillator.type = 'sine'; oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.16, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13)
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      oscillator.start(start); oscillator.stop(start + 0.15)
    })
  } catch { /* Keep the timer usable if audio is unavailable. */ }
}
// Announce only live transitions, never replay phases missed while away.
export function timerCue(previous, current) {
  if (!previous || current.at - previous.at > 2000 || current.at < previous.at) return null
  if (previous.running && current.complete && !previous.complete) return 'complete'
  if (!current.running) return null
  if (previous.running && previous.phase !== current.phase) return current.type === 'rest' ? 'rest' : 'work'
  if (current.remaining >= 1 && current.remaining <= 3 && previous.remaining !== current.remaining) return 'tick'
  return null
}
