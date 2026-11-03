// Database-level actions shared by the screens.
import { db, getSettings, newId, updateSettings } from '../db'
import type { Entry, Exercise, Session, Template, TemplateSlot } from '../types'
import { buildBackup, parseBackup, toCSV, type BackupData } from './backup'
import { liftHistory, suggest } from './calc'

export async function activeSession(): Promise<Session | undefined> {
  const all = await db.sessions.toArray()
  return all.find((s) => !s.finishedAt)
}

/** Next template in the rotation after the most recent finished session. */
export function nextTemplate(templates: Template[], sessions: Session[]): Template | undefined {
  const rotation = templates.filter((t) => t.inRotation).sort((a, b) => a.order - b.order)
  if (rotation.length === 0) return undefined
  const last = sessions
    .filter((s) => s.finishedAt && s.templateId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((s) => rotation.some((t) => t.id === s.templateId))
  if (!last) return rotation[0]
  const idx = rotation.findIndex((t) => t.id === last.templateId)
  return rotation[(idx + 1) % rotation.length]
}

export function buildEntry(
  exercise: Exercise,
  target: { sets: number; repMin: number; repMax: number },
  slot: TemplateSlot | null,
  templateId: string | null,
  sessions: Session[],
): Entry {
  const s = suggest(exercise, target, templateId, liftHistory(sessions, exercise))
  return {
    id: newId(),
    exerciseId: exercise.id,
    slotId: slot?.id ?? null,
    repMin: target.repMin,
    repMax: target.repMax,
    notes: '',
    skipped: slot?.optional ?? false,
    sets: s.sets,
    sled: s.sled,
  }
}

export async function startSession(template: Template | null): Promise<Session> {
  const [exercises, sessions] = await Promise.all([db.exercises.toArray(), db.sessions.toArray()])
  const lastBw = sessions
    .filter((s) => s.bodyweight)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.bodyweight ?? null
  const entries: Entry[] = []
  for (const slot of template?.slots ?? []) {
    const ex = exercises.find((e) => e.id === slot.exerciseIds[0])
    if (ex) entries.push(buildEntry(ex, slot, slot, template?.id ?? null, sessions))
  }
  const session: Session = {
    id: newId(),
    date: new Date().toISOString(),
    finishedAt: null,
    templateId: template?.id ?? null,
    templateName: template?.name ?? 'Free workout',
    templateKind: template?.kind ?? 'other',
    bodyweight: lastBw,
    deload: false,
    notes: '',
    entries,
  }
  await db.sessions.add(session)
  return session
}

export async function exportBackup(): Promise<BackupData> {
  const [exercises, templates, sessions, settings] = await Promise.all([
    db.exercises.toArray(),
    db.templates.toArray(),
    db.sessions.toArray(),
    getSettings(),
  ])
  return buildBackup({ exercises, templates, sessions, settings })
}

export async function exportCSV(): Promise<string> {
  const [exercises, sessions] = await Promise.all([db.exercises.toArray(), db.sessions.toArray()])
  return toCSV(sessions, exercises)
}

/** Replaces everything in the app with the backup's contents. */
export async function importBackup(text: string): Promise<BackupData> {
  const data = parseBackup(text)
  await db.transaction('rw', [db.exercises, db.templates, db.sessions, db.settings], async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear(), db.sessions.clear(), db.settings.clear()])
    await db.exercises.bulkAdd(data.exercises)
    await db.templates.bulkAdd(data.templates)
    await db.sessions.bulkAdd(data.sessions)
    await db.settings.put(data.settings)
  })
  return data
}

/** Saves a file: iPhone share sheet (→ Save to Files / iCloud Drive) when available, else a download. */
export async function saveFile(name: string, text: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], name, { type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  // Phones get the share sheet (→ Save to Files); computers get a normal download.
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export async function markBackedUp() {
  await updateSettings({ lastBackupAt: new Date().toISOString() })
}
