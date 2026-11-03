import type { Exercise, Template, TemplateSlot } from './types'

const ex = (
  id: string,
  name: string,
  kind: Exercise['kind'],
  repMin: number,
  repMax: number,
  increment: number,
  isMain = false,
): Exercise => ({ id, name, kind, repMin, repMax, increment, isMain, hidden: false })

export const SLED_FORMAT = '4 × 25 m forward + 25 m back'

export const SEED_EXERCISES: Exercise[] = [
  ex('pullup', 'Weighted pull-up', 'weighted_bw', 5, 8, 5, true),
  ex('bench', 'Flat bench press', 'barbell', 4, 6, 5, true),
  ex('row', 'Barbell row', 'barbell', 6, 10, 5),
  ex('ohp', 'Overhead press', 'barbell', 4, 6, 5, true),
  ex('dip', 'Weighted dip', 'weighted_bw', 6, 10, 5),
  ex('incline_db', 'Incline DB press', 'dumbbell', 6, 10, 5),
  ex('incline_bb', 'Incline barbell press', 'barbell', 6, 10, 5),
  ex('squat', 'Back squat', 'barbell', 4, 6, 10, true),
  ex('rdl', 'RDL', 'barbell', 6, 8, 10),
  ex('front_squat', 'Front squat', 'barbell', 6, 8, 5),
  ex('deadlift', 'Deadlift', 'barbell', 4, 6, 10, true),
  ex('sumo', 'Sumo deadlift', 'barbell', 4, 6, 10, true),
  ex('hip_thrust', 'Barbell hip thrust', 'barbell', 6, 10, 10),
  ex('calf_standing', 'Standing calf raise', 'machine', 8, 12, 5),
  ex('calf_seated', 'Seated calf raise', 'machine', 8, 12, 5),
  ex('tib', 'Tib raise', 'dumbbell', 12, 20, 5),
  { ...ex('sled', 'Sled push/pull', 'sled', 0, 0, 0), sledFormat: SLED_FORMAT },
]

const slot = (
  id: string,
  exerciseIds: string[],
  sets: number,
  repMin: number,
  repMax: number,
  optional = false,
): TemplateSlot => ({ id, exerciseIds, sets, repMin, repMax, optional })

export const SEED_TEMPLATES: Template[] = [
  {
    id: 'upper_a',
    name: 'Upper A',
    kind: 'upper',
    order: 0,
    inRotation: true,
    slots: [
      slot('ua1', ['pullup'], 3, 5, 8),
      slot('ua2', ['bench'], 4, 4, 6),
      slot('ua3', ['row'], 3, 6, 10),
      slot('ua4', ['ohp'], 3, 6, 8),
      slot('ua5', ['dip'], 3, 6, 10),
    ],
  },
  {
    id: 'lower_a',
    name: 'Lower A',
    kind: 'lower',
    order: 1,
    inRotation: true,
    slots: [
      slot('la1', ['sled'], 1, 0, 0),
      slot('la2', ['squat'], 4, 4, 6),
      slot('la3', ['rdl'], 3, 6, 8),
      slot('la4', ['calf_standing', 'calf_seated'], 3, 8, 12),
      slot('la5', ['tib'], 2, 12, 20),
    ],
  },
  {
    id: 'upper_b',
    name: 'Upper B',
    kind: 'upper',
    order: 2,
    inRotation: true,
    slots: [
      slot('ub1', ['pullup'], 3, 5, 8),
      slot('ub2', ['ohp'], 4, 4, 6),
      slot('ub3', ['row'], 3, 6, 10),
      slot('ub4', ['incline_db', 'incline_bb'], 3, 6, 10),
      slot('ub5', ['dip'], 3, 6, 10),
    ],
  },
  {
    id: 'lower_b',
    name: 'Lower B',
    kind: 'lower',
    order: 3,
    inRotation: true,
    slots: [
      slot('lb1', ['sled'], 1, 0, 0),
      slot('lb2', ['deadlift', 'sumo'], 3, 4, 6),
      slot('lb3', ['front_squat'], 3, 6, 8),
      slot('lb4', ['hip_thrust'], 3, 6, 10, true),
      slot('lb5', ['calf_standing', 'calf_seated'], 3, 8, 12),
      slot('lb6', ['tib'], 2, 12, 20),
    ],
  },
]
