import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from './db'
import type { Exercise, ExerciseKind } from './types'
import type { LiftStatus } from './logic/calc'
import { fmtNum } from './logic/calc'

export function Header({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="header">
      <div className="header-side">{left}</div>
      <h1>{title}</h1>
      <div className="header-side right">{right}</div>
    </header>
  )
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button className="link" onClick={onClick}>
      ‹ {label}
    </button>
  )
}

/** Number box with − / + buttons. Typing is free-form; the value is committed as you type. */
export function NumInput({
  value,
  onChange,
  step = 5,
  min = 0,
  decimal = true,
  label,
  className = '',
  blankZero = false,
}: {
  blankZero?: boolean
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  decimal?: boolean
  label?: string
  className?: string
}) {
  const show = (v: number) => (blankZero && v === 0 ? '' : fmtNum(v))
  const [text, setText] = useState(show(value))
  useEffect(() => {
    if (Number(text) !== value) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const bump = (d: number) => onChange(Math.max(min, Math.round((value + d) * 100) / 100))
  return (
    <div className={`num ${className}`}>
      <button type="button" aria-label={`${label ?? ''} minus`} onClick={() => bump(-step)}>
        −
      </button>
      <input
        aria-label={label}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={text}
        placeholder={blankZero ? 'lb' : undefined}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.')
          setText(t)
          const n = Number(t)
          if (t !== '' && Number.isFinite(n) && n >= min) onChange(n)
        }}
        onBlur={() => setText(show(value))}
      />
      <button type="button" aria-label={`${label ?? ''} plus`} onClick={() => bump(step)}>
        +
      </button>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
    </label>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="link" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export const STATUS_LABEL: Record<LiftStatus, string> = {
  new: 'Building history',
  progressing: 'Progressing',
  watch: 'Slowing – no new best in 2 weeks',
  stalled: 'Stalled',
  idle: 'Not trained recently',
}

export function StatusDot({ status }: { status: LiftStatus }) {
  return <span className={`dot dot-${status}`} title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} />
}

export const KIND_LABEL: Record<ExerciseKind, string> = {
  barbell: 'Barbell (total weight incl. bar)',
  dumbbell: 'Dumbbell (weight per hand)',
  weighted_bw: 'Bodyweight + added weight',
  machine: 'Machine / plates loaded',
  sled: 'Sled (weight + timed block)',
}

/** Bottom sheet to choose an exercise, with search and quick-create. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  exclude = [],
  title = 'Choose exercise',
}: {
  open: boolean
  onClose: () => void
  onPick: (ex: Exercise) => void
  exclude?: string[]
  title?: string
}) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []
  const [q, setQ] = useState('')
  const list = exercises
    .filter((e) => !e.hidden && !exclude.includes(e.id) && e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const create = async () => {
    const ex: Exercise = {
      id: newId(),
      name: q.trim(),
      kind: 'barbell',
      repMin: 6,
      repMax: 10,
      increment: 5,
      isMain: false,
      hidden: false,
    }
    await db.exercises.add(ex)
    setQ('')
    onPick(ex)
  }
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input className="search" placeholder="Search or type a new name" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="list">
        {list.map((e) => (
          <li key={e.id}>
            <button
              className="row-btn"
              onClick={() => {
                setQ('')
                onPick(e)
              }}
            >
              {e.name}
              <small>{KIND_LABEL[e.kind].split(' (')[0]}</small>
            </button>
          </li>
        ))}
        {q.trim() && !exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
          <li>
            <button className="row-btn accent" onClick={create}>
              + Create “{q.trim()}”
              <small>Barbell, 6–10 reps, +5 lb – edit later in Plan → Exercises</small>
            </button>
          </li>
        )}
      </ul>
    </Sheet>
  )
}

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function fmtDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(iso).toLocaleDateString(undefined, opts)
}
