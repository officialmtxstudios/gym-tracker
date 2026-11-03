import Dexie, { type EntityTable } from 'dexie'
import { SEED_EXERCISES, SEED_TEMPLATES } from './seed'
import { DEFAULT_SETTINGS, type Exercise, type Session, type Settings, type Template } from './types'

export class GymDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  templates!: EntityTable<Template, 'id'>
  sessions!: EntityTable<Session, 'id'>
  settings!: EntityTable<Settings, 'key'>

  constructor(name = 'gym-tracker') {
    super(name)
    this.version(1).stores({
      exercises: 'id',
      templates: 'id, order',
      sessions: 'id, date',
      settings: 'key',
    })
    this.on('populate', (tx) => {
      tx.table('exercises').bulkAdd(SEED_EXERCISES)
      tx.table('templates').bulkAdd(SEED_TEMPLATES)
      tx.table('settings').add(DEFAULT_SETTINGS)
    })
  }
}

export const db = new GymDB()

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) }
}

export async function updateSettings(patch: Partial<Settings>) {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, key: 'settings' })
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
