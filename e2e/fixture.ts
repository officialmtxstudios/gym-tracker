// Builds a 6-week backup file of fake history ending last week, for import in tests.
import { SEED_EXERCISES, SEED_TEMPLATES } from '../src/seed'
import { DEFAULT_SETTINGS, type Entry, type Session } from '../src/types'

const DAY = 86400000

function monday(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}

const straight = (exerciseId: string, weight: number, reps: number[], repMin: number, repMax: number): Entry => ({
  id: `${exerciseId}-${Math.random().toString(36).slice(2)}`,
  exerciseId,
  slotId: null,
  repMin,
  repMax,
  notes: '',
  skipped: false,
  sets: reps.map((r) => ({ weight, reps: r, rir: 2, done: true })),
})

const sled = (weight: number, timeSec: number): Entry => ({
  ...straight('sled', 0, [], 0, 0),
  sled: { weight, format: '4 × 25 m forward + 25 m back', timeSec, startedAt: null, done: true },
})

export function historyBackup(now = new Date()) {
  const thisMonday = monday(now)
  const sessions: Session[] = []
  const add = (date: Date, templateId: string, entries: Entry[]) => {
    const t = SEED_TEMPLATES.find((x) => x.id === templateId)!
    const d = new Date(date.getTime() + 17 * 3600000) // 5pm
    sessions.push({
      id: `${templateId}-${d.toISOString()}`,
      date: d.toISOString(),
      finishedAt: new Date(d.getTime() + 3600000).toISOString(),
      templateId,
      templateName: t.name,
      templateKind: t.kind,
      bodyweight: 180 + (sessions.length % 3),
      deload: false,
      notes: '',
      entries,
    })
  }
  const bench = [185, 190, 195, 200, 200, 200]
  const benchReps = [[6, 6, 6, 6], [6, 6, 6, 6], [6, 6, 6, 6], [6, 6, 6, 6], [5, 5, 5, 5], [5, 5, 5, 5]]
  for (let w = 0; w < 6; w++) {
    const mon = new Date(thisMonday.getTime() - (6 - w) * 7 * DAY)
    add(mon, 'upper_a', [
      straight('pullup', 20 + w * 5, [8, 8, 8], 5, 8),
      straight('bench', bench[w], benchReps[w], 4, 6),
      straight('row', 155 + w * 5, [10, 10, 10], 6, 10),
      straight('ohp', 105 + w * 5, [8, 8, 8], 6, 8),
      straight('dip', 25 + w * 5, [10, 10, 10], 6, 10),
    ])
    add(new Date(mon.getTime() + DAY), 'lower_a', [
      sled(90 + w * 10, 180 - w * 5),
      straight('squat', 225 + w * 10, [6, 6, 6, 6], 4, 6),
      straight('rdl', 185 + w * 10, [8, 8, 8], 6, 8),
      straight('calf_standing', 150 + w * 5, [12, 12, 12], 8, 12),
      straight('tib', 20 + w * 5, [20, 20], 12, 20),
    ])
    add(new Date(mon.getTime() + 3 * DAY), 'upper_b', [
      straight('pullup', 30 + w * 5, [6, 6, 6], 5, 8),
      straight('ohp', 125 + w * 5, [6, 6, 6, 6], 4, 6),
      straight('row', 165 + w * 5, [8, 8, 8], 6, 10),
      straight('incline_db', 55 + w * 5, [10, 10, 10], 6, 10),
      straight('dip', 35 + w * 5, [8, 8, 8], 6, 10),
    ])
    add(new Date(mon.getTime() + 4 * DAY), 'lower_b', [
      sled(90 + w * 10, 175 - w * 5),
      straight('deadlift', 315 + w * 10, [6, 6, 6], 4, 6),
      straight('front_squat', 185 + w * 5, [8, 8, 8], 6, 8),
      straight('calf_standing', 150 + w * 5, [12, 12, 12], 8, 12),
      straight('tib', 20 + w * 5, [20, 20], 12, 20),
    ])
  }
  return {
    app: 'gym-tracker',
    version: 1,
    exportedAt: now.toISOString(),
    exercises: SEED_EXERCISES,
    templates: SEED_TEMPLATES,
    sessions,
    settings: { ...DEFAULT_SETTINGS, lastBackupAt: now.toISOString() },
  }
}
