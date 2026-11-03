import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../db'
import { SEED_EXERCISES } from '../seed'
import type { Session } from '../types'
import { parseBackup, toCSV } from './backup'
import { exportBackup, importBackup, startSession } from './data'

const benchSession: Session = {
  id: 's1',
  date: '2026-11-02T15:00:00.000Z',
  finishedAt: '2026-11-02T16:00:00.000Z',
  templateId: 'upper_a',
  templateName: 'Upper A',
  templateKind: 'upper',
  bodyweight: 180,
  deload: false,
  notes: 'felt good, "strong"',
  entries: [
    {
      id: 'e1', exerciseId: 'bench', slotId: null, repMin: 4, repMax: 6, notes: '', skipped: false,
      sets: [
        { weight: 205, reps: 6, rir: 2, done: true },
        { weight: 205, reps: 5, rir: null, done: false },
      ],
    },
    {
      id: 'e2', exerciseId: 'pullup', slotId: null, repMin: 5, repMax: 8, notes: '', skipped: false,
      sets: [{ weight: 25, reps: 5, rir: null, done: true }],
    },
  ],
}

describe('CSV export', () => {
  it('writes one row per completed set with load and estimated 1RM', () => {
    const lines = toCSV([benchSession], SEED_EXERCISES).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-11-02,Upper A,,180,Flat bench press,1,205,6,2,205,246,,,,"felt good, ""strong"""')
    expect(lines[2]).toContain('Weighted pull-up,1,25,5,,205,239.2')
  })
})

describe('backup file', () => {
  it('rejects files that are not backups', () => {
    expect(() => parseBackup('hello')).toThrow(/not valid JSON/)
    expect(() => parseBackup('{"app":"other"}')).toThrow(/isn't a Gym Tracker backup/)
  })

  it('round-trips everything through export → import', async () => {
    await db.open()
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length) // seeded on first open
    await db.sessions.add(benchSession)
    const backup = await exportBackup()
    const text = JSON.stringify(backup)

    await db.sessions.clear()
    await db.exercises.update('bench', { name: 'Renamed' })
    await importBackup(text)

    expect(await db.sessions.get('s1')).toEqual(benchSession)
    expect((await db.exercises.get('bench'))?.name).toBe('Flat bench press')
  })

  it('starts a session from a template with suggestions and last bodyweight', async () => {
    const t = (await db.templates.get('upper_a'))!
    const s = await startSession(t)
    expect(s.bodyweight).toBe(180)
    expect(s.entries.map((e) => e.exerciseId)).toEqual(['pullup', 'bench', 'row', 'ohp', 'dip'])
    // Last bench: 1 of 2 sets done → no increase, same 205
    expect(s.entries[1].sets.map((x) => x.weight)).toEqual([205, 205, 205, 205])
  })
})
