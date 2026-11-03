import { useSyncExternalStore } from 'react'

// Rest timer: stores the end time (not a countdown), so it stays correct if the app is
// closed and reopened. Beeps at the end while the app is open (iPhone can't buzz a locked
// phone from a web app).
const KEY = 'restEndsAt'
let [endsAt, total] = read()
const listeners = new Set<() => void>()
let audio: AudioContext | null = null
let beep: OscillatorNode | null = null

function read(): [number | null, number] {
  try {
    const [end, tot] = (localStorage.getItem(KEY) ?? '').split('|').map(Number)
    return end > Date.now() ? [end, tot || 0] : [null, 0]
  } catch {
    return [null, 0]
  }
}

function set(v: number | null) {
  endsAt = v
  try {
    if (v) localStorage.setItem(KEY, `${v}|${total}`)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  scheduleBeep()
  listeners.forEach((l) => l())
}

function scheduleBeep() {
  try {
    beep?.stop()
  } catch {
    /* already stopped */
  }
  beep = null
  if (!endsAt) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    const delay = Math.max(0, (endsAt - Date.now()) / 1000)
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.25
    osc.connect(gain).connect(audio.destination)
    const t = audio.currentTime + delay
    gain.gain.setValueAtTime(0.25, t)
    gain.gain.setValueAtTime(0, t + 0.15)
    gain.gain.setValueAtTime(0.25, t + 0.3)
    gain.gain.setValueAtTime(0, t + 0.45)
    osc.start(t)
    osc.stop(t + 0.5)
    beep = osc
  } catch {
    /* no audio available */
  }
}

export function startRest(seconds: number) {
  total = seconds
  set(Date.now() + seconds * 1000)
}

export function addRest(seconds: number) {
  if (endsAt) {
    total += seconds
    set(endsAt + seconds * 1000)
  }
}

export function stopRest() {
  set(null)
}

export function useRest(): { endsAt: number | null; total: number } {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => endsAt,
  )
  return { endsAt: v, total }
}
