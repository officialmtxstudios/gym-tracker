// How weight is entered for an exercise:
// barbell = total incl. bar, dumbbell = per hand, weighted_bw = added weight on top of bodyweight,
// machine = whatever number you load (stack number or plates), sled = sled load + timed block.
export type ExerciseKind = 'barbell' | 'dumbbell' | 'weighted_bw' | 'machine' | 'sled'

export interface Exercise {
  id: string
  name: string
  kind: ExerciseKind
  repMin: number // defaults used when adding this exercise to a template / workout
  repMax: number
  increment: number // lb added when every set hits the top of the rep range
  isMain: boolean // main lift: longer rest, listed first
  hidden: boolean
  sledFormat?: string
}

export interface TemplateSlot {
  id: string
  exerciseIds: string[] // first is the default; the rest are one-tap swaps
  sets: number
  repMin: number
  repMax: number
  optional: boolean
}

export type TemplateKind = 'upper' | 'lower' | 'other'

export interface Template {
  id: string
  name: string
  kind: TemplateKind
  order: number // position in the rotation
  inRotation: boolean
  slots: TemplateSlot[]
}

export interface SetLog {
  weight: number
  reps: number
  rir: number | null // 4 means "4+"
  done: boolean
}

export interface SledLog {
  weight: number
  format: string
  timeSec: number | null
  startedAt: number | null // stopwatch running since (ms epoch)
  done: boolean
}

export interface Entry {
  id: string
  exerciseId: string
  slotId: string | null
  repMin: number
  repMax: number
  notes: string
  skipped: boolean
  sets: SetLog[]
  sled?: SledLog
}

export interface Session {
  id: string
  date: string // ISO start time
  finishedAt: string | null // null = workout in progress
  templateId: string | null
  templateName: string
  templateKind: TemplateKind
  bodyweight: number | null
  deload: boolean
  notes: string
  entries: Entry[]
}

export interface Settings {
  key: 'settings'
  restTimerOn: boolean
  restMainSec: number
  restOtherSec: number
  weeklyTarget: number
  stallWeeks: number
  lastBackupAt: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  restTimerOn: true,
  restMainSec: 180,
  restOtherSec: 120,
  weeklyTarget: 4,
  stallWeeks: 3,
  lastBackupAt: null,
}
