import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db'
import { back, go } from '../router'
import type { Entry, Exercise, Session, SetLog, Settings } from '../types'
import { dayKey, fmtNum, fmtTime, liftHistory, parseTime, sessionPRs, suggest } from '../logic/calc'
import { buildEntry } from '../logic/data'
import { startRest, stopRest } from '../rest'
import { BackButton, ExercisePicker, Header, NumInput, Sheet, Toggle, fmtDate, useNow } from '../ui'

const WEIGHT_LABEL: Record<Exercise['kind'], string> = {
  barbell: 'lb',
  dumbbell: 'lb / hand',
  weighted_bw: '+ lb added',
  machine: 'lb / stack',
  sled: 'lb',
}

export default function Workout({ id }: { id: string }) {
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const ref = useRef<Session | null>(null)
  useEffect(() => {
    void db.sessions.get(id).then((x) => {
      ref.current = x ?? null
      setS(x ?? null)
    })
  }, [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [])
  const template = useLiveQuery(
    async () => (s?.templateId ? ((await db.templates.get(s.templateId)) ?? null) : null),
    [s?.templateId],
  )
  const settings = useLiveQuery(getSettings, [])
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; idx: number } | null>(null)
  const [menuIdx, setMenuIdx] = useState<number | null>(null)
  const [summary, setSummary] = useState<{ prs: string[]; minutes: number; sets: number } | null>(null)

  // Sessions before this one: used for "last time" and suggestions.
  const prior = useMemo(
    () => (allSessions ?? []).filter((x) => x.id !== id && s && x.date < s.date),
    [allSessions, id, s],
  )

  if (s === undefined || !allSessions) return <div className="page" />
  if (s === null)
    return (
      <div className="page">
        <Header title="Not found" left={<BackButton onClick={() => go('/')} label="Home" />} />
        <p className="muted pad">This workout no longer exists.</p>
      </div>
    )

  const live = !s.finishedAt
  const exById = (eid: string) => exercises.find((e) => e.id === eid)

  /** All edits go through here: copy, change, save immediately. */
  const update = (fn: (draft: Session) => void) => {
    if (!ref.current) return
    const next = structuredClone(ref.current)
    fn(next)
    ref.current = next
    setS(next)
    void db.sessions.put(next)
  }
  const updateEntry = (idx: number, fn: (e: Entry) => void) => update((d) => fn(d.entries[idx]))

  const targetFor = (old: Entry | null, ex: Exercise) =>
    ex.kind !== 'sled' && old && old.repMax > 0
      ? { sets: Math.max(1, old.sets.length || 3), repMin: old.repMin, repMax: old.repMax }
      : { sets: ex.kind === 'sled' ? 1 : 3, repMin: ex.repMin, repMax: ex.repMax }

  const swap = (idx: number, ex: Exercise) => {
    const old = s.entries[idx]
    if ((old.sets.some((x) => x.done) || old.sled?.done) && !confirm('Replace the sets you already logged for this exercise?'))
      return
    const fresh = buildEntry(ex, targetFor(old, ex), null, s.templateId, prior)
    updateEntry(idx, (e) => Object.assign(e, { ...fresh, id: old.id, slotId: old.slotId, notes: old.notes }))
  }

  const addExercise = (ex: Exercise) => {
    const entry = buildEntry(ex, targetFor(null, ex), null, s.templateId, prior)
    update((d) => d.entries.push(entry))
  }

  const finish = () => {
    const sets = s.entries.reduce((n, e) => n + (e.skipped ? 0 : e.sets.filter((x) => x.done).length), 0)
    if (sets === 0 && !s.entries.some((e) => e.sled?.done) && !confirm('No sets ticked yet. Finish anyway?')) return
    update((d) => {
      d.finishedAt = new Date().toISOString()
    })
    stopRest()
    const prs = sessionPRs(ref.current!, allSessions, exercises)
    setSummary({ prs, sets, minutes: Math.round((Date.now() - new Date(s.date).getTime()) / 60000) })
  }

  const remove = async () => {
    if (!confirm(live ? 'Discard this workout? Nothing from it will be saved.' : 'Delete this session permanently?')) return
    stopRest()
    await db.sessions.delete(id)
    go(live ? '/' : '/calendar')
  }

  const menuEntry = menuIdx !== null ? s.entries[menuIdx] : null
  const menuEx = menuEntry ? exById(menuEntry.exerciseId) : undefined
  const alternatives = (e: Entry) =>
    (template?.slots.find((sl) => sl.id === e.slotId)?.exerciseIds ?? []).filter((x) => x !== e.exerciseId)

  return (
    <div className="page workout">
      <Header
        title={s.templateName}
        left={<BackButton onClick={() => (live ? go('/') : back('/calendar'))} label={live ? 'Home' : 'Back'} />}
        right={
          live ? (
            <button className="btn small primary" onClick={finish}>
              Finish
            </button>
          ) : null
        }
      />

      <section className="card">
        {live ? (
          <Elapsed since={s.date} />
        ) : (
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={dayKey(new Date(s.date))}
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, d] = e.target.value.split('-').map(Number)
                update((draft) => {
                  const dt = new Date(draft.date)
                  dt.setFullYear(y, m - 1, d)
                  draft.date = dt.toISOString()
                })
              }}
            />
          </label>
        )}
        <div className="field-row">
          <span>Bodyweight (lb)</span>
          <NumInput
            label="Bodyweight"
            blankZero
            value={s.bodyweight ?? 0}
            step={1}
            onChange={(v) => update((d) => void (d.bodyweight = v || null))}
          />
        </div>
        <Toggle label="Deload session" checked={s.deload} onChange={(v) => update((d) => void (d.deload = v))} />
      </section>

      {s.entries.map((entry, idx) => {
        const ex = exById(entry.exerciseId)
        if (!ex) return null
        if (entry.skipped)
          return (
            <section key={entry.id} className="card skipped">
              <div className="entry-head">
                <h3>{ex.name}</h3>
                <span className="muted">optional</span>
              </div>
              <div className="btn-row">
                <button className="btn" onClick={() => updateEntry(idx, (e) => void (e.skipped = false))}>
                  Add to today
                </button>
                <button className="btn ghost" onClick={() => setMenuIdx(idx)}>
                  ⋯
                </button>
              </div>
            </section>
          )
        return (
          <EntryCard
            key={entry.id}
            entry={entry}
            ex={ex}
            prior={prior}
            templateId={s.templateId}
            live={live}
            settings={settings}
            onChange={(fn) => updateEntry(idx, fn)}
            onMenu={() => setMenuIdx(idx)}
            hasAlternatives={alternatives(entry).length > 0}
          />
        )
      })}

      <button className="btn wide" onClick={() => setPicker({ mode: 'add' })}>
        + Add exercise
      </button>

      <section className="card">
        <label className="field col">
          <span>Session notes</span>
          <textarea
            rows={3}
            value={s.notes}
            placeholder="How did it go?"
            onChange={(e) => update((d) => void (d.notes = e.target.value))}
          />
        </label>
      </section>

      {live ? (
        <button className="btn wide primary big" onClick={finish}>
          Finish workout
        </button>
      ) : (
        <button className="btn wide primary" onClick={() => back('/calendar')}>
          Done
        </button>
      )}
      <button className="btn wide danger-text" onClick={remove}>
        {live ? 'Discard workout' : 'Delete session'}
      </button>

      <ExercisePicker
        open={picker !== null}
        title={picker?.mode === 'swap' ? 'Swap to…' : 'Add exercise'}
        onClose={() => setPicker(null)}
        onPick={(ex) => {
          if (picker?.mode === 'swap') swap(picker.idx, ex)
          else addExercise(ex)
          setPicker(null)
        }}
      />

      <Sheet open={menuEntry !== null} onClose={() => setMenuIdx(null)} title={menuEx?.name ?? ''}>
        {menuEntry && menuIdx !== null && (
          <>
            {alternatives(menuEntry).length > 0 && (
              <>
                <p className="label">Swap to</p>
                <div className="btn-col">
                  {alternatives(menuEntry).map((aid) => {
                    const alt = exById(aid)
                    return alt ? (
                      <button
                        key={aid}
                        className="btn"
                        onClick={() => {
                          swap(menuIdx, alt)
                          setMenuIdx(null)
                        }}
                      >
                        {alt.name}
                      </button>
                    ) : null
                  })}
                </div>
              </>
            )}
            <div className="btn-col">
              <button
                className="btn"
                onClick={() => {
                  setPicker({ mode: 'swap', idx: menuIdx })
                  setMenuIdx(null)
                }}
              >
                Swap to another exercise…
              </button>
            </div>
            {menuEx?.kind !== 'sled' && (
              <>
                <p className="label">Rep range today</p>
                <div className="field-row">
                  <NumInput
                    label="Min reps"
                    decimal={false}
                    step={1}
                    min={1}
                    value={menuEntry.repMin}
                    onChange={(v) => updateEntry(menuIdx, (e) => void (e.repMin = v))}
                  />
                  <span>to</span>
                  <NumInput
                    label="Max reps"
                    decimal={false}
                    step={1}
                    min={1}
                    value={menuEntry.repMax}
                    onChange={(v) => updateEntry(menuIdx, (e) => void (e.repMax = v))}
                  />
                </div>
                <div className="btn-row">
                  <button
                    className="btn"
                    disabled={menuEntry.sets.length <= 1}
                    onClick={() => updateEntry(menuIdx, (e) => void e.sets.pop())}
                  >
                    − Remove last set
                  </button>
                </div>
              </>
            )}
            <div className="btn-row">
              <button
                className="btn"
                disabled={menuIdx === 0}
                onClick={() => {
                  update((d) => d.entries.splice(menuIdx - 1, 0, ...d.entries.splice(menuIdx, 1)))
                  setMenuIdx(menuIdx - 1)
                }}
              >
                ↑ Move up
              </button>
              <button
                className="btn"
                disabled={menuIdx === s.entries.length - 1}
                onClick={() => {
                  update((d) => d.entries.splice(menuIdx + 1, 0, ...d.entries.splice(menuIdx, 1)))
                  setMenuIdx(menuIdx + 1)
                }}
              >
                ↓ Move down
              </button>
            </div>
            <div className="btn-col">
              {!menuEntry.skipped && (
                <button
                  className="btn"
                  onClick={() => {
                    updateEntry(menuIdx, (e) => void (e.skipped = true))
                    setMenuIdx(null)
                  }}
                >
                  Skip today
                </button>
              )}
              <button
                className="btn danger-text"
                onClick={() => {
                  update((d) => void d.entries.splice(menuIdx, 1))
                  setMenuIdx(null)
                }}
              >
                Remove from this workout
              </button>
            </div>
            <p className="muted small">Changes here only affect this workout. Edit the plan in the Plan tab.</p>
          </>
        )}
      </Sheet>

      <Sheet open={summary !== null} onClose={() => go('/')} title="Workout saved">
        {summary && (
          <div className="summary">
            <p className="big-num">{summary.minutes} min</p>
            <p>{summary.sets} working sets logged</p>
            {summary.prs.length > 0 ? (
              <>
                <p className="label">New bests 🎉</p>
                <ul className="plain">
                  {summary.prs.map((pid) => (
                    <li key={pid}>{exById(pid)?.name}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No new bests this time.</p>
            )}
            <button className="btn wide primary" onClick={() => go('/')}>
              Done
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function Elapsed({ since }: { since: string }) {
  const now = useNow(15000)
  const min = Math.max(0, Math.round((now - new Date(since).getTime()) / 60000))
  return (
    <p className="muted">
      {fmtDate(since)} · {min} min in
    </p>
  )
}

function EntryCard({
  entry,
  ex,
  prior,
  templateId,
  live,
  settings,
  onChange,
  onMenu,
  hasAlternatives,
}: {
  entry: Entry
  ex: Exercise
  prior: Session[]
  templateId: string | null
  live: boolean
  settings: Settings | undefined
  onChange: (fn: (e: Entry) => void) => void
  onMenu: () => void
  hasAlternatives: boolean
}) {
  const [showNotes, setShowNotes] = useState(!!entry.notes)
  const hist = useMemo(() => liftHistory(prior, ex), [prior, ex])
  const last =
    [...hist].reverse().find((p) => !p.deload && templateId && p.templateId === templateId) ??
    [...hist].reverse().find((p) => !p.deload)
  const tip = useMemo(
    () => suggest(ex, { sets: entry.sets.length, repMin: entry.repMin, repMax: entry.repMax }, templateId, hist),
    [ex, entry.sets.length, entry.repMin, entry.repMax, templateId, hist],
  )

  const tick = (i: number) => {
    const turningOn = !entry.sets[i].done
    onChange((e) => void (e.sets[i].done = turningOn))
    if (turningOn && live && settings?.restTimerOn) startRest(ex.isMain ? settings.restMainSec : settings.restOtherSec)
  }
  const setWeight = (i: number, v: number) =>
    onChange((e) => {
      const old = e.sets[i].weight
      e.sets[i].weight = v
      // Straight sets: carry the new weight to the following sets that haven't been done yet.
      for (let j = i + 1; j < e.sets.length; j++) if (!e.sets[j].done && e.sets[j].weight === old) e.sets[j].weight = v
    })

  return (
    <section className="card entry">
      <div className="entry-head">
        <button className="entry-name" onClick={onMenu}>
          <h3>
            {ex.name}
            {hasAlternatives && <span className="swap-hint" aria-hidden> ⇄</span>}
          </h3>
        </button>
        <span className="muted small">
          {ex.kind === 'sled' ? '' : `${entry.repMin}–${entry.repMax} reps`}
        </span>
      </div>
      {last && ex.kind !== 'sled' && (
        <p className="muted small">
          Last ({fmtDate(last.date, { month: 'short', day: 'numeric' })}):{' '}
          {fmtNum(Math.max(...last.sets.map((x) => x.weight)))} × {last.sets.map((x) => x.reps).join(', ')}
        </p>
      )}
      {tip.note && live && <p className={`tip ${tip.increased ? 'up' : ''}`}>{tip.note}</p>}

      {ex.kind === 'sled' && entry.sled ? (
        <SledBlock sled={entry.sled} onChange={(fn) => onChange((e) => fn(e.sled!))} />
      ) : (
        <>
          <div className="set-grid head">
            <span>{WEIGHT_LABEL[ex.kind]}</span>
            <span>reps</span>
            <span>RIR</span>
            <span />
          </div>
          {entry.sets.map((set, i) => (
            <SetRow
              key={i}
              n={i + 1}
              set={set}
              blankZero={ex.kind !== 'weighted_bw'}
              onWeight={(v) => setWeight(i, v)}
              onReps={(v) => onChange((e) => void (e.sets[i].reps = v))}
              onRir={(v) => onChange((e) => void (e.sets[i].rir = v))}
              onTick={() => tick(i)}
            />
          ))}
        </>
      )}

      {showNotes && (
        <textarea
          rows={2}
          placeholder="Notes for this exercise"
          value={entry.notes}
          onChange={(e) => onChange((x) => void (x.notes = e.target.value))}
        />
      )}
      <div className="btn-row">
        {ex.kind !== 'sled' && (
          <button
            className="btn ghost"
            onClick={() =>
              onChange((e) => {
                const prev = e.sets[e.sets.length - 1]
                e.sets.push({ weight: prev?.weight ?? 0, reps: prev?.reps ?? e.repMin, rir: null, done: false })
              })
            }
          >
            + Set
          </button>
        )}
        <button className="btn ghost" onClick={() => setShowNotes((v) => !v)}>
          {showNotes ? 'Hide notes' : 'Notes'}
        </button>
        <button className="btn ghost" onClick={onMenu} aria-label="More options">
          ⋯
        </button>
      </div>
    </section>
  )
}

function SetRow({
  n,
  set,
  blankZero,
  onWeight,
  onReps,
  onRir,
  onTick,
}: {
  n: number
  set: SetLog
  blankZero: boolean
  onWeight: (v: number) => void
  onReps: (v: number) => void
  onRir: (v: number | null) => void
  onTick: () => void
}) {
  const nextRir = set.rir === null ? 0 : set.rir >= 4 ? null : set.rir + 1
  return (
    <div className={`set-grid ${set.done ? 'done' : ''}`}>
      <NumInput label={`Set ${n} weight`} value={set.weight} step={5} onChange={onWeight} blankZero={blankZero} />
      <NumInput label={`Set ${n} reps`} value={set.reps} step={1} decimal={false} onChange={onReps} className="reps" />
      <button className={`rir ${set.rir === null ? 'empty' : ''}`} aria-label={`Set ${n} RIR`} onClick={() => onRir(nextRir)}>
        {set.rir === null ? '·' : set.rir >= 4 ? '4+' : set.rir}
      </button>
      <button className={`tick ${set.done ? 'on' : ''}`} aria-label={`Set ${n} done`} aria-pressed={set.done} onClick={onTick}>
        {set.done ? '✓' : n}
      </button>
    </div>
  )
}

function SledBlock({ sled, onChange }: { sled: NonNullable<Entry['sled']>; onChange: (fn: (s: NonNullable<Entry['sled']>) => void) => void }) {
  const now = useNow(sled.startedAt ? 250 : 60000)
  const running = sled.startedAt !== null
  const shown = running ? (now - sled.startedAt!) / 1000 : (sled.timeSec ?? 0)
  const [timeText, setTimeText] = useState<string | null>(null)
  return (
    <div className="sled">
      <div className="field-row">
        <span>Sled weight (lb)</span>
        <NumInput label="Sled weight" value={sled.weight} step={10} onChange={(v) => onChange((s) => void (s.weight = v))} />
      </div>
      <input
        className="text"
        aria-label="Sled format"
        value={sled.format}
        onChange={(e) => onChange((s) => void (s.format = e.target.value))}
      />
      <div className="stopwatch">
        {running ? (
          <span className="big-num">{fmtTime(shown)}</span>
        ) : (
          <input
            className="big-num time-input"
            aria-label="Total time"
            inputMode="numeric"
            placeholder="0:00"
            value={timeText ?? (sled.timeSec ? fmtTime(sled.timeSec) : '')}
            onFocus={() => setTimeText(sled.timeSec ? fmtTime(sled.timeSec) : '')}
            onChange={(e) => setTimeText(e.target.value)}
            onBlur={() => {
              const v = parseTime(timeText ?? '')
              onChange((s) => {
                s.timeSec = v
                if (v) s.done = true
              })
              setTimeText(null)
            }}
          />
        )}
        {running ? (
          <button
            className="btn primary"
            onClick={() =>
              onChange((s) => {
                s.timeSec = Math.round((Date.now() - s.startedAt!) / 1000)
                s.startedAt = null
                s.done = true
              })
            }
          >
            Stop
          </button>
        ) : (
          <button
            className="btn primary"
            onClick={() =>
              onChange((s) => {
                s.startedAt = Date.now()
                s.timeSec = null
                s.done = false
              })
            }
          >
            {sled.timeSec ? 'Restart' : 'Start'}
          </button>
        )}
      </div>
      <Toggle label="Done" checked={sled.done} onChange={(v) => onChange((s) => void (s.done = v))} />
    </div>
  )
}

