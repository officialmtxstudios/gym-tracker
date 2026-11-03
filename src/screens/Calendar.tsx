import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db'
import { go } from '../router'
import type { Session, Template } from '../types'
import { dayKey, sessionPRs, weekStart, weekSummary } from '../logic/calc'
import { startSession } from '../logic/data'
import { Header, Sheet, fmtDate } from '../ui'

const abbrev = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

export default function Calendar() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
  const settings = useLiveQuery(getSettings, [])
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(dayKey(today))
  const [logPast, setLogPast] = useState(false)

  if (!sessions || !exercises || !templates || !settings) return <div className="page" />

  const done = sessions.filter((s) => s.finishedAt)
  const byDay = new Map<string, Session[]>()
  for (const s of done) {
    const k = dayKey(new Date(s.date))
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }

  const gridStart = weekStart(month)
  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, d) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d))
    if (w > 0 && row[0].getMonth() !== month.getMonth()) break
    weeks.push(row)
  }

  const selDate = new Date(`${selected}T12:00`)
  const daySessions = byDay.get(selected) ?? []
  const wk = weekSummary(sessions, exercises, today, settings.weeklyTarget, selDate)
  const wkStart = weekStart(selDate)
  const wkEnd = new Date(wkStart.getFullYear(), wkStart.getMonth(), wkStart.getDate() + 6)
  const wkSessions = done
    .filter((s) => weekStart(new Date(s.date)).getTime() === wkStart.getTime())
    .sort((a, b) => a.date.localeCompare(b.date))

  const logOn = async (t: Template | null) => {
    const s = await startSession(t)
    const dt = new Date(`${selected}T12:00`)
    await db.sessions.update(s.id, { date: dt.toISOString(), finishedAt: dt.toISOString() })
    go(`/workout/${s.id}`)
  }

  return (
    <div className="page">
      <Header title="Calendar" />
      <section className="card">
        <div className="month-nav">
          <button className="btn ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            ‹
          </button>
          <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button className="btn ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            ›
          </button>
        </div>
        <div className="cal">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="cal-head">
              {d}
            </span>
          ))}
          {weeks.flat().map((d) => {
            const k = dayKey(d)
            const ss = byDay.get(k) ?? []
            return (
              <button
                key={k}
                className={[
                  'cal-day',
                  d.getMonth() !== month.getMonth() ? 'out' : '',
                  k === dayKey(today) ? 'today' : '',
                  k === selected ? 'sel' : '',
                ].join(' ')}
                onClick={() => setSelected(k)}
              >
                <span>{d.getDate()}</span>
                {ss.map((s) => (
                  <i key={s.id} className={`tag ${s.templateKind}${s.deload ? ' deload' : ''}`}>
                    {abbrev(s.templateName)}
                  </i>
                ))}
              </button>
            )
          })}
        </div>
      </section>

      <section className="card">
        <h2>{fmtDate(selDate, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        {daySessions.length === 0 ? (
          <p className="muted">No workout logged.</p>
        ) : (
          <ul className="list">
            {daySessions.map((s) => (
              <li key={s.id}>
                <button className="row-btn" onClick={() => go(`/workout/${s.id}`)}>
                  {s.templateName}
                  {s.deload ? ' (deload)' : ''}
                  <small>{s.entries.filter((e) => !e.skipped).length} exercises · tap to view or edit</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selDate <= today && (
          <button className="link" onClick={() => setLogPast(true)}>
            + Log a workout on this day
          </button>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <h2>
            Week of {fmtDate(wkStart, { month: 'short', day: 'numeric' })} – {fmtDate(wkEnd, { month: 'short', day: 'numeric' })}
          </h2>
        </div>
        <div className="stats">
          <div>
            <small>Sessions</small>
            <strong>
              {wk.done} / {wk.target}
            </strong>
          </div>
          <div>
            <small>New bests</small>
            <strong>{wk.prs}</strong>
          </div>
          <div>
            <small>Sets</small>
            <strong>{wkSessions.reduce((n, s) => n + s.entries.reduce((m, e) => m + (e.skipped ? 0 : e.sets.filter((x) => x.done).length), 0), 0)}</strong>
          </div>
        </div>
        <ul className="list">
          {wkSessions.map((s) => {
            const prs = sessionPRs(s, sessions, exercises)
            return (
              <li key={s.id}>
                <button className="row-btn" onClick={() => go(`/workout/${s.id}`)}>
                  {fmtDate(s.date, { weekday: 'short' })} · {s.templateName}
                  <small>
                    {prs.length
                      ? `New best: ${prs.map((id) => exercises.find((e) => e.id === id)?.name).join(', ')}`
                      : 'No new bests'}
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <Sheet open={logPast} onClose={() => setLogPast(false)} title={`Log for ${fmtDate(selDate)}`}>
        <div className="btn-col">
          {templates.map((t) => (
            <button key={t.id} className="btn" onClick={() => logOn(t)}>
              {t.name}
            </button>
          ))}
          <button className="btn ghost" onClick={() => logOn(null)}>
            Empty workout
          </button>
        </div>
      </Sheet>
    </div>
  )
}
