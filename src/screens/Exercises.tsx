import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db'
import { go } from '../router'
import type { Exercise, ExerciseKind } from '../types'
import { SLED_FORMAT } from '../seed'
import { BackButton, Header, KIND_LABEL, NumInput, Toggle } from '../ui'

export default function Exercises({ id }: { id?: string }) {
  return id ? <ExerciseEdit id={id} /> : <ExerciseList />
}

function ExerciseList() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  if (!exercises) return <div className="page" />
  const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name))
  const add = async () => {
    const ex: Exercise = { id: newId(), name: 'New exercise', kind: 'barbell', repMin: 6, repMax: 10, increment: 5, isMain: false, hidden: false }
    await db.exercises.add(ex)
    go(`/exercises/${ex.id}`)
  }
  const row = (e: Exercise) => (
    <li key={e.id}>
      <button className="row-btn" onClick={() => go(`/exercises/${e.id}`)}>
        {e.name}
        {e.isMain && <span className="badge">main</span>}
        <small>
          {KIND_LABEL[e.kind].split(' (')[0]}
          {e.kind !== 'sled' && ` · ${e.repMin}–${e.repMax} reps · +${e.increment} lb`}
        </small>
      </button>
    </li>
  )
  return (
    <div className="page">
      <Header title="Exercises" left={<BackButton onClick={() => go('/plan')} label="Plan" />} />
      <section className="card">
        <ul className="list">{sorted.filter((e) => !e.hidden).map(row)}</ul>
        <button className="btn wide" onClick={add}>
          + New exercise
        </button>
      </section>
      {sorted.some((e) => e.hidden) && (
        <section className="card">
          <p className="label">Hidden</p>
          <ul className="list">{sorted.filter((e) => e.hidden).map(row)}</ul>
        </section>
      )}
    </div>
  )
}

function ExerciseEdit({ id }: { id: string }) {
  const [ex, setEx] = useState<Exercise | null | undefined>(undefined)
  const ref = useRef<Exercise | null>(null)
  const usage = useLiveQuery(async () => {
    const [sessions, templates] = await Promise.all([db.sessions.toArray(), db.templates.toArray()])
    return {
      sessions: sessions.filter((s) => s.entries.some((e) => e.exerciseId === id)).length,
      templates: templates.filter((t) => t.slots.some((s) => s.exerciseIds.includes(id))).map((t) => t.name),
    }
  }, [id])

  useEffect(() => {
    void db.exercises.get(id).then((x) => {
      ref.current = x ?? null
      setEx(x ?? null)
    })
  }, [id])

  if (ex === undefined || !usage) return <div className="page" />
  if (ex === null)
    return (
      <div className="page">
        <Header title="Not found" left={<BackButton onClick={() => go('/exercises')} label="Exercises" />} />
      </div>
    )

  const update = (fn: (d: Exercise) => void) => {
    const next = { ...ref.current! }
    fn(next)
    ref.current = next
    setEx(next)
    void db.exercises.put(next)
  }
  const unused = usage.sessions === 0 && usage.templates.length === 0
  const remove = async () => {
    if (!confirm(`Delete ${ex.name}?`)) return
    await db.exercises.delete(id)
    go('/exercises')
  }

  return (
    <div className="page">
      <Header title="Edit exercise" left={<BackButton onClick={() => go('/exercises')} label="Exercises" />} />
      <section className="card">
        <label className="field col">
          <span>Name</span>
          <input className="text" value={ex.name} onChange={(e) => update((d) => void (d.name = e.target.value))} />
        </label>
        <label className="field col">
          <span>How weight is entered</span>
          <select
            value={ex.kind}
            disabled={usage.sessions > 0}
            onChange={(e) =>
              update((d) => {
                d.kind = e.target.value as ExerciseKind
                if (d.kind === 'sled') d.sledFormat ??= SLED_FORMAT
              })
            }
          >
            {(Object.keys(KIND_LABEL) as ExerciseKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          {usage.sessions > 0 && <small className="muted">Locked because it’s already used in logged workouts.</small>}
        </label>
        {ex.kind === 'sled' ? (
          <label className="field col">
            <span>Default format</span>
            <input className="text" value={ex.sledFormat ?? ''} onChange={(e) => update((d) => void (d.sledFormat = e.target.value))} />
          </label>
        ) : (
          <>
            <div className="field-row">
              <span>Default reps</span>
              <NumInput label="Min reps" decimal={false} step={1} min={1} value={ex.repMin} onChange={(v) => update((d) => void (d.repMin = v))} />
              <span>–</span>
              <NumInput label="Max reps" decimal={false} step={1} min={1} value={ex.repMax} onChange={(v) => update((d) => void (d.repMax = v))} />
            </div>
            <div className="field-row">
              <span>Weight jump (lb)</span>
              <NumInput label="Weight jump" step={2.5} value={ex.increment} onChange={(v) => update((d) => void (d.increment = v))} />
            </div>
            <p className="muted small">Added when you hit the top of the rep range on every set. 0 = never suggest more weight.</p>
          </>
        )}
        <Toggle label="Main lift (longer rest, listed first)" checked={ex.isMain} onChange={(v) => update((d) => void (d.isMain = v))} />
        <Toggle label="Hidden (no longer doing it)" checked={ex.hidden} onChange={(v) => update((d) => void (d.hidden = v))} />
      </section>
      <section className="card">
        <p className="muted small">
          Used in {usage.sessions} logged workout{usage.sessions === 1 ? '' : 's'}
          {usage.templates.length > 0 && ` · in ${usage.templates.join(', ')}`}.
          {' '}Session rep ranges are set per session in the Plan tab.
        </p>
        {unused ? (
          <button className="btn wide danger-text" onClick={remove}>
            Delete exercise
          </button>
        ) : (
          <p className="muted small">To keep your history, exercises that are in use can be hidden but not deleted.</p>
        )}
      </section>
    </div>
  )
}
