import { useEffect, useRef, useSyncExternalStore } from 'react'
import { playTimerSound, setTimerSoundEnabled, subscribeTimerSound, timerCue, timerSoundEnabled, unlockTimerAudio } from './timer-audio.mjs'

export default function useTimerAudio({ running, complete, phase, type = 'work', remaining, tick }) {
  const enabled = useSyncExternalStore(subscribeTimerSound, timerSoundEnabled)
  const previous = useRef(null)
  useEffect(() => {
    const current = { running, complete, phase, type, remaining, at: Date.now() }
    const cue = timerCue(previous.current, current)
    previous.current = current
    if (cue) playTimerSound(cue)
  }, [running, complete, phase, type, remaining, tick])
  function startSound(cue = 'work') { unlockTimerAudio().then(() => playTimerSound(cue)) }
  function toggleSound() {
    const ready = unlockTimerAudio()
    setTimerSoundEnabled(!enabled)
    if (!enabled) ready.then(() => playTimerSound('work'))
  }
  return { enabled, startSound, toggleSound }
}
