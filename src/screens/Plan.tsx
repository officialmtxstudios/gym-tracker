import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db'
import { go } from '../router'
import type { Template, TemplateKind } from '../types'
import { BackButton, ExercisePicker, Header, NumInput, Toggle } from '../ui'

const KINDS: { key: TemplateKind; label: string }[] = [
  { key: 'upper', label: 'Upper' },
  { key: 'lower', label: 'Lower' },
  { key: 'other', label: 'Other' },
]

export default function Plan({ id }: { id?: string }) {
  return id ? <TemplateEdit id={id} /> : <TemplateList />
}

function TemplateList() {
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  if (!templates || !exercises) return <div className="page" />

  const move = async (idx: number, dir: -1 | 1) => {
    const list = [...templates]
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    ;[list[idx], list[j]] = [list[j], list[idx]]
    await db.transaction('rw', db.templates, () =>
      Promise.all(list.map((t, i) => db.templates.update(t.id, { order: i }))),
    )
  }

  const add = async () => {
    const t: Template = {
      id: newId(),
      name: 'New session',
      kind: 'other',
      order: templates.length,
      inRotation: false,
      slots: [],
    }
    await db.templates.add(t)
    go(`/plan/${t.id}`)
  }

  return (
    <div className="page">
      <Header title="Plan" />
      <section className="card">
        <div className="card-title">
          <h2>Sessions</h2>
          <span className="muted small">rotation order</span>
        </div>
        <ul className="list">
          {templates.map((t, i) => (
            <li key={t.id} className="reorder">
              <button className="row-btn" onClick={() => go(`/plan/${t.id}`)}>
                {t.name}
                <small>
                  {t.inRotation ? `#${templates.filter((x) => x.inRotation).indexOf(t) + 1} in rotation` : 'Not in rotation'} ·{' '}
                  {t.slots
                    .map((s) => exercises.find((e) => e.id === s.exerciseIds[0])?.name)
                    .filter(Boolean)
                    .join(', ') || 'no exercises'}
                </small>
              </button>
              <div className="updown">
                <button aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ▲
                </button>
                <button aria-label={`Move ${t.name} down`} disabled={i === templates.length - 1} onClick={() => move(i, 1)}>
                  ▼
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button className="btn wide" onClick={add}>
          + New session
        </button>
      </section>
      <section className="card">
        <button className="row-btn" onClick={() => go('/exercises')}>
          Exercise library ›<small>Add exercises, rename them, change weight jumps, hide old ones</small>
        </button>
      </section>
      <p className="muted small pad">
        Changes to your plan apply to future workouts. Past workouts and charts stay as they were.
      </p>
    </div>
  )
}

function TemplateEdit({ id }: { id: string }) {
  const [t, setT] = useState<Template | null | undefined>(undefined)
  const ref = useRef<Template | null>(null)
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'alt'; idx: number } | null>(null)

  useEffect(() => {
    void db.templates.get(id).then((x) => {
      ref.current = x ?? null
      setT(x ?? null)
    })
  }, [id])

  if (t === undefined) return <div className="page" />
  if (t === null)
    return (
      <div className="page">
        <Header title="Not found" left={<BackButton onClick={() => go('/plan')} label="Plan" />} />
      </div>
    )

  const update = (fn: (d: Template) => void) => {
    const next = structuredClone(ref.current!)
    fn(next)
    ref.current = next
    setT(next)
    void db.templates.put(next)
  }
  const name = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? '?'

  const remove = async () => {
    if (!confirm(`Delete “${t.name}”? Past workouts using it are kept.`)) return
    await db.templates.delete(id)
    go('/plan')
  }

  return (
    <div className="page">
      <Header title="Edit session" left={<BackButton onClick={() => go('/plan')} label="Plan" />} />
      <section className="card">
        <label className="field col">
          <span>Name</span>
          <input className="text" value={t.name} onChange={(e) => update((d) => void (d.name = e.target.value))} />
        </label>
        <p className="label">Type (for “last upper / last lower”)</p>
        <div className="seg">
          {KINDS.map((k) => (
            <button key={k.key} className={t.kind === k.key ? 'on' : ''} onClick={() => update((d) => void (d.kind = k.key))}>
              {k.label}
            </button>
          ))}
        </div>
        <Toggle label="Part of the rotation" checked={t.inRotation} onChange={(v) => update((d) => void (d.inRotation = v))} />
      </section>

      {t.slots.map((slot, idx) => {
        const isSled = exercises.find((e) => e.id === slot.exerciseIds[0])?.kind === 'sled'
        return (
          <section key={slot.id} className="card slot">
            <div className="entry-head">
              <h3>
                {idx + 1}. {name(slot.exerciseIds[0])}
              </h3>
              <div className="updown">
                <button
                  aria-label="Move up"
                  disabled={idx === 0}
                  onClick={() => update((d) => d.slots.splice(idx - 1, 0, ...d.slots.splice(idx, 1)))}
                >
                  ▲
                </button>
                <button
                  aria-label="Move down"
                  disabled={idx === t.slots.length - 1}
                  onClick={() => update((d) => d.slots.splice(idx + 1, 0, ...d.slots.splice(idx, 1)))}
                >
                  ▼
                </button>
              </div>
            </div>
            {!isSled && (
              <>
                <div className="field-row">
                  <span>Sets</span>
                  <NumInput label="Sets" decimal={false} step={1} min={1} value={slot.sets} onChange={(v) => update((d) => void (d.slots[idx].sets = v))} />
                </div>
                <div className="field-row">
                  <span>Reps</span>
                  <NumInput label="Min reps" decimal={false} step={1} min={1} value={slot.repMin} onChange={(v) => update((d) => void (d.slots[idx].repMin = v))} />
                  <span>–</span>
                  <NumInput label="Max reps" decimal={false} step={1} min={1} value={slot.repMax} onChange={(v) => update((d) => void (d.slots[idx].repMax = v))} />
                </div>
              </>
            )}
            <Toggle label="Optional (starts skipped)" checked={slot.optional} onChange={(v) => update((d) => void (d.slots[idx].optional = v))} />
            <p className="label">One-tap swaps</p>
            <div className="chips">
              {slot.exerciseIds.slice(1).map((aid) => (
                <span key={aid} className="chip">
                  <button
                    title="Make this the default"
                    onClick={() =>
                      update((d) => {
                        const ids = d.slots[idx].exerciseIds
                        d.slots[idx].exerciseIds = [aid, ...ids.filter((x) => x !== aid)]
                      })
                    }
                  >
                    {name(aid)}
                  </button>
                  <button
                    aria-label={`Remove ${name(aid)}`}
                    onClick={() => update((d) => void (d.slots[idx].exerciseIds = d.slots[idx].exerciseIds.filter((x) => x !== aid)))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button className="chip add" onClick={() => setPicker({ mode: 'alt', idx })}>
                + Add swap
              </button>
            </div>
            {slot.exerciseIds.length > 1 && <p className="muted small">Tap a swap to make it the default.</p>}
            <button
              className="btn ghost danger-text"
              onClick={() => {
                if (confirm(`Remove ${name(slot.exerciseIds[0])} from ${t.name}?`)) update((d) => void d.slots.splice(idx, 1))
              }}
            >
              Remove exercise
            </button>
          </section>
        )
      })}

      <button className="btn wide" onClick={() => setPicker({ mode: 'add' })}>
        + Add exercise
      </button>
      <button className="btn wide danger-text" onClick={remove}>
        Delete this session
      </button>

      <ExercisePicker
        open={picker !== null}
        title={picker?.mode === 'alt' ? 'Add a swap option' : 'Add exercise'}
        exclude={picker?.mode === 'alt' ? t.slots[picker.idx].exerciseIds : []}
        onClose={() => setPicker(null)}
        onPick={(ex) => {
          if (picker?.mode === 'alt') {
            const i = picker.idx
            update((d) => void d.slots[i].exerciseIds.push(ex.id))
          } else {
            update((d) =>
              void d.slots.push({
                id: newId(),
                exerciseIds: [ex.id],
                sets: ex.kind === 'sled' ? 1 : 3,
                repMin: ex.repMin,
                repMax: ex.repMax,
                optional: false,
              }),
            )
          }
          setPicker(null)
        }}
      />
    </div>
  )
}
