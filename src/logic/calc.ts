import type { Entry, Exercise, ExerciseKind, Session, SetLog, SledLog, TemplateKind } from '../types'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const EPS = 0.01

// ---------- Basic formulas ----------

/** Estimated 1-rep max (Epley). Only trusted for 1–10 reps. */
export function epley(load: number, reps: number): number | null {
  if (load <= 0 || reps < 1 || reps > 10) return null
  return reps === 1 ? load : load * (1 + reps / 30)
}

/** Progress score used for PRs and stall checks: same formula, but no rep cap so high-rep work counts too. */
export function setScore(load: number, reps: number): number {
  if (reps < 1) return 0
  return load * (1 + reps / 30) + reps * 0.001
}

/** Actual load moved: pull-ups and dips add your bodyweight. */
export function loadFor(kind: ExerciseKind, weight: number, bodyweight: number | null): number {
  return kind === 'weighted_bw' ? weight + (bodyweight ?? 0) : weight
}

export const round1 = (n: number) => Math.round(n * 10) / 10

// ---------- Dates ----------

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Monday 00:00 (local) of the week containing d. */
export function weekStart(d: Date): Date {
  const s = startOfDay(d)
  const offset = (s.getDay() + 6) % 7
  s.setDate(s.getDate() - offset)
  return s
}

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function daysBetween(earlier: Date, later: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY)
}

// ---------- Per-lift history ----------

export interface LiftPoint {
  sessionId: string
  date: Date
  deload: boolean
  templateId: string | null
  e1rm: number | null
  score: number
  top: { weight: number; reps: number } | null
  volume: number
  sets: SetLog[] // done sets only
  plannedSets: number
  repMax: number
  sled?: SledLog
}

export const finished = (sessions: Session[]) =>
  sessions.filter((s) => s.finishedAt).sort((a, b) => a.date.localeCompare(b.date))

/** Bodyweight for each session: its own entry, else the most recent earlier one, else the first known. */
export function bodyweights(sessions: Session[]): Map<string, number | null> {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  const firstKnown = sorted.find((s) => s.bodyweight)?.bodyweight ?? null
  const out = new Map<string, number | null>()
  let last: number | null = null
  for (const s of sorted) {
    if (s.bodyweight) last = s.bodyweight
    out.set(s.id, last ?? firstKnown)
  }
  return out
}

function pointFor(entry: Entry, kind: ExerciseKind, session: Session, bw: number | null): LiftPoint | null {
  const base = {
    sessionId: session.id,
    date: new Date(session.date),
    deload: session.deload,
    templateId: session.templateId,
    plannedSets: entry.sets.length,
    repMax: entry.repMax,
  }
  if (kind === 'sled') {
    if (!entry.sled?.done) return null
    return {
      ...base,
      e1rm: null,
      score: entry.sled.weight,
      top: { weight: entry.sled.weight, reps: 0 },
      volume: 0,
      sets: [],
      sled: entry.sled,
    }
  }
  const done = entry.sets.filter((s) => s.done && s.reps > 0)
  if (done.length === 0) return null
  let e1rm: number | null = null
  let score = 0
  let volume = 0
  let top: LiftPoint['top'] = null
  for (const s of done) {
    const load = loadFor(kind, s.weight, bw)
    const e = epley(load, s.reps)
    if (e !== null && (e1rm === null || e > e1rm)) e1rm = e
    score = Math.max(score, setScore(load, s.reps))
    volume += load * s.reps
    if (!top || s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps)) {
      top = { weight: s.weight, reps: s.reps }
    }
  }
  return { ...base, e1rm: e1rm === null ? null : round1(e1rm), score, top, volume: Math.round(volume), sets: done }
}

/** Every finished session's result for one exercise, oldest first. */
export function liftHistory(sessions: Session[], exercise: Exercise): LiftPoint[] {
  const fin = finished(sessions)
  const bws = bodyweights(fin)
  const points: LiftPoint[] = []
  for (const s of fin) {
    for (const e of s.entries) {
      if (e.exerciseId !== exercise.id || e.skipped) continue
      const p = pointFor(e, exercise.kind, s, bws.get(s.id) ?? null)
      if (p) points.push(p)
    }
  }
  return points
}

// ---------- Weekly chart series ----------

export type Metric = 'e1rm' | 'top' | 'volume' | 'time'

export interface WeekValue {
  week: Date
  value: number
  deload: boolean
}

export function weeklySeries(points: LiftPoint[], metric: Metric): WeekValue[] {
  const byWeek = new Map<number, LiftPoint[]>()
  for (const p of points) {
    const k = weekStart(p.date).getTime()
    byWeek.set(k, [...(byWeek.get(k) ?? []), p])
  }
  const out: WeekValue[] = []
  for (const [k, ps] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    let value: number | null = null
    if (metric === 'e1rm') {
      const vals = ps.map((p) => p.e1rm).filter((v): v is number => v !== null)
      value = vals.length ? Math.max(...vals) : null
    } else if (metric === 'top') {
      value = Math.max(...ps.map((p) => p.top?.weight ?? 0))
    } else if (metric === 'volume') {
      value = ps.reduce((sum, p) => sum + p.volume, 0)
    } else {
      const times = ps.map((p) => p.sled?.timeSec).filter((v): v is number => !!v)
      value = times.length ? Math.min(...times) : null
    }
    if (value !== null) out.push({ week: new Date(k), value, deload: ps.every((p) => p.deload) })
  }
  return out
}

// ---------- Stall detection ----------

export type LiftStatus = 'new' | 'progressing' | 'watch' | 'stalled' | 'idle'

export interface StatusInfo {
  status: LiftStatus
  weeksSinceBest: number | null
}

/**
 * Stalled = no new best (by progress score) for `stallWeeks` weeks, ignoring deload sessions.
 * "watch" is one week before that. Needs stallWeeks+1 weeks of history; lifts not trained
 * within the window are "idle" rather than stalled.
 */
export function liftStatus(points: LiftPoint[], now: Date, stallWeeks: number): StatusInfo {
  const real = points.filter((p) => !p.deload)
  if (real.length === 0) return { status: 'new', weeksSinceBest: null }
  let best = -Infinity
  let bestDate = real[0].date
  for (const p of real) {
    if (p.score > best + EPS) {
      best = p.score
      bestDate = p.date
    }
  }
  const weeksSinceBest = Math.floor((now.getTime() - bestDate.getTime()) / WEEK)
  const first = real[0].date
  const last = real[real.length - 1].date
  if (now.getTime() - first.getTime() < (stallWeeks + 1) * WEEK - DAY) return { status: 'new', weeksSinceBest }
  if (now.getTime() - last.getTime() > stallWeeks * WEEK) return { status: 'idle', weeksSinceBest }
  if (weeksSinceBest >= stallWeeks) return { status: 'stalled', weeksSinceBest }
  if (stallWeeks >= 2 && weeksSinceBest >= stallWeeks - 1) return { status: 'watch', weeksSinceBest }
  return { status: 'progressing', weeksSinceBest }
}

/** Headline number for a lift: estimated 1RM if available, otherwise top-set weight. */
export function headline(p: LiftPoint): number | null {
  return p.e1rm ?? p.top?.weight ?? null
}

/** Change in the headline number vs. the last session at least 4 weeks ago. */
export function change4w(points: LiftPoint[], now: Date): number | null {
  const real = points.filter((p) => !p.deload)
  if (real.length < 2) return null
  const cutoff = now.getTime() - 4 * WEEK
  const before = [...real].reverse().find((p) => p.date.getTime() <= cutoff)
  const latest = real[real.length - 1]
  if (!before || before === latest) return null
  const a = headline(before)
  const b = headline(latest)
  return a === null || b === null ? null : round1(b - a)
}

/** Exercises in this session that set a new all-time best (needs earlier history). */
export function sessionPRs(session: Session, sessions: Session[], exercises: Exercise[]): string[] {
  const out: string[] = []
  // Treat this session as finished even if it's still in progress (used for the finish summary).
  const asFinished = [
    ...sessions.filter((s) => s.id !== session.id),
    { ...session, finishedAt: session.finishedAt ?? session.date },
  ]
  for (const id of new Set(session.entries.map((e) => e.exerciseId))) {
    const ex = exercises.find((e) => e.id === id)
    if (!ex || ex.kind === 'sled') continue
    const pts = liftHistory(asFinished, ex)
    const idx = pts.findIndex((p) => p.sessionId === session.id)
    if (idx <= 0) continue
    const prevBest = Math.max(...pts.slice(0, idx).map((p) => p.score))
    if (pts[idx].score > prevBest + EPS) out.push(id)
  }
  return out
}

// ---------- Suggested weight (double progression) ----------

export interface Suggestion {
  sets: SetLog[]
  sled?: SledLog
  note: string | null
  increased: boolean
  last: LiftPoint | null
}

/**
 * Looks at your last non-deload session of this lift (same template first, so Upper A and
 * Upper B overhead press progress separately). Every set at the top of the range → add the
 * weight jump; otherwise same weight, one more rep per set.
 */
export function suggest(
  exercise: Exercise,
  target: { sets: number; repMin: number; repMax: number },
  templateId: string | null,
  history: LiftPoint[],
): Suggestion {
  const real = history.filter((p) => !p.deload)
  const last =
    [...real].reverse().find((p) => templateId && p.templateId === templateId) ?? real[real.length - 1] ?? null

  if (exercise.kind === 'sled') {
    const prev = [...history].reverse().find((p) => p.sled)?.sled
    return {
      sets: [],
      sled: {
        weight: prev?.weight ?? 0,
        format: prev?.format ?? exercise.sledFormat ?? '',
        timeSec: null,
        startedAt: null,
        done: false,
      },
      note: prev?.timeSec ? `Last: ${prev.weight} lb in ${fmtTime(prev.timeSec)}` : null,
      increased: false,
      last,
    }
  }

  const blank = (reps: number, weight = 0): SetLog => ({ weight, reps, rir: null, done: false })
  if (!last || last.sets.length === 0) {
    return { sets: Array.from({ length: target.sets }, () => blank(target.repMin)), note: null, increased: false, last }
  }

  const workWeight = Math.max(...last.sets.map((s) => s.weight))
  const allHitTop =
    last.sets.length >= last.plannedSets &&
    last.sets.every((s) => s.weight === workWeight && s.reps >= last.repMax)

  if (allHitTop && exercise.increment > 0) {
    return {
      sets: Array.from({ length: target.sets }, () => blank(target.repMin, workWeight + exercise.increment)),
      note: `Hit ${last.repMax}+ on every set last time → +${exercise.increment} lb`,
      increased: true,
      last,
    }
  }
  const sets = Array.from({ length: target.sets }, (_, i) => {
    const prevReps = (last.sets[i] ?? last.sets[last.sets.length - 1]).reps
    return blank(Math.max(1, Math.min(target.repMax, prevReps + 1)), workWeight)
  })
  return { sets, note: 'Same weight — aim for one more rep', increased: false, last }
}

// ---------- Weekly summary ----------

export interface WeekSummary {
  done: number
  target: number
  prs: number
  daysSince: Record<TemplateKind, number | null>
}

export function weekSummary(
  sessions: Session[],
  exercises: Exercise[],
  now: Date,
  weeklyTarget: number,
  weekOf: Date = now,
): WeekSummary {
  const fin = finished(sessions)
  const ws = weekStart(weekOf).getTime()
  const inWeek = fin.filter((s) => {
    const t = new Date(s.date).getTime()
    return t >= ws && t < ws + WEEK
  })
  const prs = inWeek.reduce((n, s) => n + sessionPRs(s, fin, exercises).length, 0)
  const daysSince: WeekSummary['daysSince'] = { upper: null, lower: null, other: null }
  for (const kind of ['upper', 'lower', 'other'] as const) {
    const lastOfKind = [...fin].reverse().find((s) => s.templateKind === kind)
    daysSince[kind] = lastOfKind ? daysBetween(new Date(lastOfKind.date), now) : null
  }
  return { done: inWeek.length, target: weeklyTarget, prs, daysSince }
}

// ---------- Formatting ----------

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function parseTime(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':').map(Number)
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
