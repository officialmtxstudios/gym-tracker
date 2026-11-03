import { describe, expect, it } from 'vitest'
import { SEED_EXERCISES, SEED_TEMPLATES } from '../seed'
import type { Entry, Session, SetLog } from '../types'
import {
  change4w, epley, fmtTime, liftHistory, liftStatus, parseTime, sessionPRs, suggest, weekStart, weekSummary,
  weeklySeries,
} from './calc'
import { nextTemplate } from './data'

const exercise = (id: string) => SEED_EXERCISES.find((e) => e.id === id)!
const sets = (weight: number, ...reps: number[]): SetLog[] => reps.map((r) => ({ weight, reps: r, rir: null, done: true }))

let n = 0
function session(date: string, entries: Partial<Entry>[], extra: Partial<Session> = {}): Session {
  n++
  return {
    id: `s${n}`,
    date: new Date(date).toISOString(),
    finishedAt: new Date(date).toISOString(),
    templateId: 'upper_a',
    templateName: 'Upper A',
    templateKind: 'upper',
    bodyweight: null,
    deload: false,
    notes: '',
    entries: entries.map((e, i) => ({
      id: `e${n}_${i}`,
      exerciseId: 'bench',
      slotId: null,
      repMin: 4,
      repMax: 6,
      notes: '',
      skipped: false,
      sets: [],
      ...e,
    })),
    ...extra,
  }
}

describe('epley', () => {
  it('matches the formula for 1–10 reps', () => {
    expect(epley(200, 1)).toBe(200)
    expect(epley(225, 5)).toBeCloseTo(262.5)
    expect(epley(100, 10)).toBeCloseTo(133.33, 1)
  })
  it('ignores sets above 10 reps or with no load', () => {
    expect(epley(100, 11)).toBeNull()
    expect(epley(0, 5)).toBeNull()
  })
})

describe('liftHistory', () => {
  it('adds bodyweight to weighted pull-ups and carries the last known bodyweight forward', () => {
    const s1 = session('2026-10-05T10:00', [{ exerciseId: 'pullup', sets: sets(25, 5) }], { bodyweight: 180 })
    const s2 = session('2026-10-12T10:00', [{ exerciseId: 'pullup', sets: sets(30, 5) }])
    const pts = liftHistory([s2, s1], exercise('pullup'))
    expect(pts.map((p) => p.e1rm)).toEqual([239.2, 245])
    expect(pts[1].volume).toBe(210 * 5)
  })
  it('skips unfinished sessions, skipped entries and unticked sets', () => {
    const inProgress = { ...session('2026-10-05T10:00', [{ sets: sets(200, 5) }]), finishedAt: null }
    const skipped = session('2026-10-06T10:00', [{ sets: sets(200, 5), skipped: true }])
    const unticked = session('2026-10-07T10:00', [{ sets: [{ weight: 200, reps: 5, rir: null, done: false }] }])
    expect(liftHistory([inProgress, skipped, unticked], exercise('bench'))).toHaveLength(0)
  })
  it('records sled weight and time', () => {
    const s = session('2026-10-05T10:00', [
      { exerciseId: 'sled', sled: { weight: 90, format: '4x25', timeSec: 150, startedAt: null, done: true } },
    ])
    const [p] = liftHistory([s], exercise('sled'))
    expect(p.top?.weight).toBe(90)
    expect(weeklySeries([p], 'time')[0].value).toBe(150)
  })
})

describe('suggest (double progression)', () => {
  const target = { sets: 4, repMin: 4, repMax: 6 }
  it('leaves weight blank on the very first session', () => {
    const s = suggest(exercise('bench'), target, 'upper_a', [])
    expect(s.sets).toHaveLength(4)
    expect(s.sets.every((x) => x.weight === 0 && x.reps === 4)).toBe(true)
  })
  it('adds the weight jump when every set hit the top of the range', () => {
    const h = liftHistory([session('2026-10-05T10:00', [{ sets: sets(205, 6, 6, 6, 6) }])], exercise('bench'))
    const s = suggest(exercise('bench'), target, 'upper_a', h)
    expect(s.increased).toBe(true)
    expect(s.sets.map((x) => [x.weight, x.reps])).toEqual([[210, 4], [210, 4], [210, 4], [210, 4]])
  })
  it('uses +10 lb for squats', () => {
    const h = liftHistory([session('2026-10-05T10:00', [{ exerciseId: 'squat', sets: sets(275, 6, 6, 6, 6) }])], exercise('squat'))
    expect(suggest(exercise('squat'), target, 'upper_a', h).sets[0].weight).toBe(285)
  })
  it('keeps the weight and adds one rep (capped at the top) when not all sets hit the top', () => {
    const h = liftHistory([session('2026-10-05T10:00', [{ sets: sets(205, 6, 6, 5, 4) }])], exercise('bench'))
    const s = suggest(exercise('bench'), target, 'upper_a', h)
    expect(s.increased).toBe(false)
    expect(s.sets.map((x) => [x.weight, x.reps])).toEqual([[205, 6], [205, 6], [205, 6], [205, 5]])
  })
  it('does not progress if a planned set was missed', () => {
    const missed = session('2026-10-05T10:00', [
      { sets: [...sets(205, 6, 6, 6), { weight: 205, reps: 0, rir: null, done: false }] },
    ])
    expect(suggest(exercise('bench'), target, 'upper_a', liftHistory([missed], exercise('bench'))).increased).toBe(false)
  })
  it('prefers the same template so Upper A and Upper B progress separately', () => {
    const a = session('2026-10-05T10:00', [{ exerciseId: 'ohp', repMin: 6, repMax: 8, sets: sets(115, 8, 7, 7) }])
    const b = session('2026-10-07T10:00', [{ exerciseId: 'ohp', sets: sets(135, 5, 5, 5, 4) }], { templateId: 'upper_b' })
    const h = liftHistory([a, b], exercise('ohp'))
    expect(suggest(exercise('ohp'), { sets: 3, repMin: 6, repMax: 8 }, 'upper_a', h).sets[0].weight).toBe(115)
    expect(suggest(exercise('ohp'), target, 'upper_b', h).sets[0].weight).toBe(135)
  })
  it('ignores deload sessions when suggesting', () => {
    const real = session('2026-10-05T10:00', [{ sets: sets(205, 5, 5, 5, 5) }])
    const deload = session('2026-10-12T10:00', [{ sets: sets(155, 5, 5, 5) }], { deload: true })
    const h = liftHistory([real, deload], exercise('bench'))
    expect(suggest(exercise('bench'), target, 'upper_a', h).sets[0].weight).toBe(205)
  })
  it('prefills sled weight and format from last time', () => {
    const s = session('2026-10-05T10:00', [
      { exerciseId: 'sled', sled: { weight: 90, format: '4x25', timeSec: 150, startedAt: null, done: true } },
    ])
    const sug = suggest(exercise('sled'), { sets: 1, repMin: 0, repMax: 0 }, 'lower_a', liftHistory([s], exercise('sled')))
    expect(sug.sled).toMatchObject({ weight: 90, format: '4x25', timeSec: null, done: false })
  })
})

describe('liftStatus (stall detection, 3 weeks)', () => {
  const weekly = (weights: number[], start = '2026-09-07T10:00', deloadIdx: number[] = []) =>
    weights.map((w, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i * 7)
      return session(d.toISOString(), [{ sets: sets(w, 5, 5, 5) }], { deload: deloadIdx.includes(i) })
    })
  const statusAfter = (sessions: Session[], daysAfterLast = 1) => {
    const h = liftHistory(sessions, exercise('bench'))
    const now = new Date(h[h.length - 1].date.getTime() + daysAfterLast * 86400000)
    return liftStatus(h, now, 3).status
  }

  it('is "new" without enough history', () => {
    expect(statusAfter(weekly([200, 200]))).toBe('new')
  })
  it('is progressing when weights keep going up', () => {
    expect(statusAfter(weekly([200, 205, 210, 215, 220]))).toBe('progressing')
  })
  it('flags "watch" at 2 weeks and "stalled" at 3 weeks without a new best', () => {
    expect(statusAfter(weekly([200, 205, 210, 210, 210]))).toBe('watch')
    expect(statusAfter(weekly([200, 205, 210, 210, 210, 210]))).toBe('stalled')
  })
  it('counts an extra rep at the same weight as progress', () => {
    const s = weekly([200, 205, 210, 210, 210, 210])
    s[s.length - 1].entries[0].sets = sets(210, 6, 5, 5)
    expect(statusAfter(s)).toBe('progressing')
  })
  it('ignores deload weeks', () => {
    // A light deload week neither resets nor counts toward the stall.
    expect(statusAfter(weekly([200, 205, 210, 150, 210], undefined, [3]))).toBe('watch')
  })
  it('is "idle" if the lift has not been trained for over 3 weeks', () => {
    expect(statusAfter(weekly([200, 205, 210, 215]), 30)).toBe('idle')
  })
})

describe('change4w', () => {
  it('compares the latest estimate to the last session at least 4 weeks ago', () => {
    // Sep 7, 14, 21, 28, Oct 5
    const s = [200, 205, 210, 215, 220].map((w, i) =>
      session(new Date(2026, 8, 7 + i * 7, 10).toISOString(), [{ sets: sets(w, 5) }]),
    )
    const h = liftHistory(s, exercise('bench'))
    expect(change4w(h, new Date('2026-10-06T10:00'))).toBeCloseTo(20 * (1 + 5 / 30), 0)
  })
})

describe('PRs and weekly summary', () => {
  const s1 = session('2026-10-26T10:00', [{ sets: sets(200, 5) }]) // Mon, previous week
  const s2 = session('2026-11-02T10:00', [{ sets: sets(205, 5) }]) // Mon, this week: PR
  const s3 = session('2026-11-03T10:00', [{ exerciseId: 'squat', sets: sets(300, 5) }], {
    templateId: 'lower_a', templateName: 'Lower A', templateKind: 'lower',
  }) // first squat ever: not a PR
  const all = [s1, s2, s3]

  it('counts a PR only when beating earlier history', () => {
    expect(sessionPRs(s1, all, SEED_EXERCISES)).toEqual([])
    expect(sessionPRs(s2, all, SEED_EXERCISES)).toEqual(['bench'])
    expect(sessionPRs(s3, all, SEED_EXERCISES)).toEqual([])
  })
  it('summarises the Monday-to-Sunday week', () => {
    const w = weekSummary(all, SEED_EXERCISES, new Date('2026-11-05T12:00'), 4)
    expect(w).toEqual({ done: 2, target: 4, prs: 1, daysSince: { upper: 3, lower: 2, other: null } })
  })
  it('weeks start on Monday', () => {
    expect(weekStart(new Date('2026-11-08T23:00')).getDate()).toBe(2) // Sunday → Mon 2 Nov
    expect(weekStart(new Date('2026-11-09T00:30')).getDate()).toBe(9)
  })
})

describe('rotation', () => {
  it('goes Upper A → Lower A → Upper B → Lower B → Upper A', () => {
    const order = ['upper_a', 'lower_a', 'upper_b', 'lower_b']
    expect(nextTemplate(SEED_TEMPLATES, [])?.id).toBe('upper_a')
    order.forEach((id, i) => {
      const s = session(`2026-10-0${i + 1}T10:00`, [], { templateId: id })
      expect(nextTemplate(SEED_TEMPLATES, [s])?.id).toBe(order[(i + 1) % 4])
    })
  })
  it('ignores free workouts and skips templates taken out of the rotation', () => {
    const t = SEED_TEMPLATES.map((x) => (x.id === 'lower_a' ? { ...x, inRotation: false } : x))
    const s = [session('2026-10-01T10:00', [], { templateId: 'upper_a' }), session('2026-10-02T10:00', [], { templateId: null })]
    expect(nextTemplate(t, s)?.id).toBe('upper_b')
  })
})

describe('time helpers', () => {
  it('formats and parses m:ss', () => {
    expect(fmtTime(150)).toBe('2:30')
    expect(parseTime('2:30')).toBe(150)
    expect(parseTime('95')).toBe(95)
    expect(parseTime('')).toBeNull()
  })
})
