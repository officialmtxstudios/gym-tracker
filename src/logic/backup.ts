import type { Exercise, Session, Settings, Template } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { bodyweights, epley, fmtTime, loadFor, round1 } from './calc'

export interface BackupData {
  app: 'gym-tracker'
  version: 1
  exportedAt: string
  exercises: Exercise[]
  templates: Template[]
  sessions: Session[]
  settings: Settings
}

export function buildBackup(
  data: Omit<BackupData, 'app' | 'version' | 'exportedAt'>,
  now = new Date(),
): BackupData {
  return { app: 'gym-tracker', version: 1, exportedAt: now.toISOString(), ...data }
}

/** Parses and sanity-checks a backup file. Throws a readable error if it isn't one. */
export function parseBackup(text: string): BackupData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a Gym Tracker backup (not valid JSON).")
  }
  const d = raw as Partial<BackupData>
  if (!d || d.app !== 'gym-tracker') throw new Error("That file isn't a Gym Tracker backup.")
  if (d.version !== 1) throw new Error(`Unsupported backup version: ${String(d.version)}`)
  if (!Array.isArray(d.exercises) || !Array.isArray(d.templates) || !Array.isArray(d.sessions)) {
    throw new Error('Backup is missing exercises, templates or sessions.')
  }
  return {
    ...(d as BackupData),
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), key: 'settings' },
  }
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per set (sled: one row per block). Opens in Numbers/Excel. */
export function toCSV(sessions: Session[], exercises: Exercise[]): string {
  const header = [
    'date', 'session', 'deload', 'bodyweight', 'exercise', 'set', 'weight_lb', 'reps', 'rir',
    'load_lb', 'est_1rm', 'sled_format', 'sled_time', 'exercise_notes', 'session_notes',
  ]
  const rows = [header.join(',')]
  const done = sessions.filter((s) => s.finishedAt).sort((a, b) => a.date.localeCompare(b.date))
  const bws = bodyweights(done)
  for (const s of done) {
    const date = s.date.slice(0, 10)
    const bw = bws.get(s.id) ?? null
    for (const e of s.entries) {
      if (e.skipped) continue
      const ex = exercises.find((x) => x.id === e.exerciseId)
      const name = ex?.name ?? e.exerciseId
      const common = [date, s.templateName, s.deload ? 'yes' : '', s.bodyweight ?? '', name]
      if (ex?.kind === 'sled') {
        if (!e.sled?.done) continue
        rows.push(
          [...common, 1, e.sled.weight, '', '', e.sled.weight, '', e.sled.format,
            e.sled.timeSec ? fmtTime(e.sled.timeSec) : '', e.notes, s.notes].map(csvCell).join(','),
        )
        continue
      }
      e.sets.forEach((set, i) => {
        if (!set.done) return
        const load = loadFor(ex?.kind ?? 'barbell', set.weight, bw)
        const est = epley(load, set.reps)
        rows.push(
          [...common, i + 1, set.weight, set.reps, set.rir ?? '', round1(load), est ? round1(est) : '', '', '',
            e.notes, s.notes].map(csvCell).join(','),
        )
      })
    }
  }
  return rows.join('\n') + '\n'
}
