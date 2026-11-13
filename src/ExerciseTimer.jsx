import { useEffect, useState } from 'react'
import useTimerAudio from './useTimerAudio'
import { formatSeconds, timerRemaining } from './fitness-model.mjs'

export default function ExerciseTimer({ name, setNumber, target, timer, disabled, onChange, onRecord }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer?.endAt) return
    const interval = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(interval)
  }, [timer?.endAt])
  const remaining = timer ? timerRemaining(timer, Math.max(now, timer.startedAt || 0)) : target
  const elapsed = timer ? Math.max(0, timer.duration - remaining) : 0
  const running = Boolean(timer?.endAt) && remaining > 0
  const audio = useTimerAudio({ running, complete: Boolean(timer) && remaining === 0, phase: timer?.endAt, remaining, tick: now })
  function start() {
    audio.startSound()
    const start = Date.now()
    const seconds = remaining > 0 ? remaining : target
    onChange({ duration: timer && remaining > 0 ? timer.duration : target, remaining: seconds, startedAt: start, endAt: start + seconds * 1000 })
  }
  return <div className={`fitness-exercise-timer ${timer && remaining === 0 ? 'complete' : ''}`}>
    <div><small>SET {setNumber} TIMER</small><strong role="timer" aria-label={`${name} set ${setNumber} countdown`}>{formatSeconds(remaining)}</strong>{timer && remaining === 0 && <span role="status">Time’s up · Record your time, then check the set.</span>}</div>
    <div className="fitness-actions">
      {running ? <button type="button" disabled={disabled} onClick={() => onChange({ ...timer, endAt: null, remaining: timerRemaining(timer) })}>Pause</button> : <button type="button" disabled={disabled} onClick={start}>{timer && remaining > 0 ? 'Resume timer' : 'Start timer'}</button>}
      {timer && <button type="button" disabled={disabled} onClick={() => onChange(null)}>Reset</button>}
      {elapsed > 0 && <button className="fitness-primary" type="button" disabled={disabled} onClick={() => { onRecord(elapsed, { ...timer, endAt: null, remaining }); }}>Record {formatSeconds(elapsed)}</button>}
    </div>
  </div>
}
