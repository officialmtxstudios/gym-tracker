import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db'
import { go } from '../router'
import type { Template } from '../types'
import { change4w, daysBetween, fmtNum, headline, liftHistory, liftStatus, weekSummary } from '../logic/calc'
import { exportBackup, markBackedUp, nextTemplate, saveFile, startSession } from '../logic/data'
import { Header, Sheet, StatusDot, useNow } from '../ui'

export default function Home() {
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const settings = useLiveQuery(getSettings, [])
  const [choose, setChoose] = useState(false)
  useNow(60000)

  if (!templates || !sessions || !exercises || !settings) return <div className="page" />

  const now = new Date()
  const active = sessions.find((s) => !s.finishedAt)
  const next = nextTemplate(templates, sessions)
  const finishedCount = sessions.filter((s) => s.finishedAt).length
  const week = weekSummary(sessions, exercises, now, settings.weeklyTarget)
  const lastBackupDays = settings.lastBackupAt ? daysBetween(new Date(settings.lastBackupAt), now) : null
  const needBackup = finishedCount > 0 && (lastBackupDays === null || lastBackupDays >= 7)

  const lifts = exercises
    .filter((e) => !e.hidden)
    .map((ex) => {
      const pts = liftHistory(sessions, ex)
      return { ex, pts, status: liftStatus(pts, now, settings.stallWeeks), delta: change4w(pts, now) }
    })
    .filter((l) => l.pts.length > 0)
    .sort((a, b) => Number(b.ex.isMain) - Number(a.ex.isMain) || a.ex.name.localeCompare(b.ex.name))
  const attention = lifts.filter((l) => l.status.status === 'stalled' || l.status.status === 'watch')

  const start = async (t: Template | null) => {
    const s = await startSession(t)
    go(`/workout/${s.id}`)
  }

  const backup = async () => {
    const data = await exportBackup()
    const r = await saveFile(`gym-tracker-backup-${now.toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json')
    if (r !== 'cancelled') await markBackedUp()
  }

  const since = (d: number | null) => (d === null ? '—' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`)

  return (
    <div className="page">
      <Header title="Gym Tracker" />

      {active ? (
        <section className="card hero">
          <p className="label">Workout in progress</p>
          <h2>{active.templateName}</h2>
          <button className="btn wide primary big" onClick={() => go(`/workout/${active.id}`)}>
            Resume
          </button>
        </section>
      ) : (
        <section className="card hero">
          <p className="label">Next up</p>
          {next ? (
            <>
              <h2>{next.name}</h2>
              <p className="muted small">
                {next.slots
                  .map((sl) => exercises.find((e) => e.id === sl.exerciseIds[0])?.name)
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <button className="btn wide primary big" onClick={() => start(next)}>
                Start {next.name}
              </button>
            </>
          ) : (
            <p className="muted">No sessions in your rotation. Add one in the Plan tab.</p>
          )}
          <button className="link center" onClick={() => setChoose(true)}>
            Do a different session
          </button>
        </section>
      )}

      {needBackup && (
        <section className="card banner">
          <span>
            {lastBackupDays === null ? 'You haven’t backed up yet.' : `Last backup ${lastBackupDays} days ago.`}
          </span>
          <button className="btn small" onClick={backup}>
            Back up now
          </button>
        </section>
      )}

      <section className="card" onClick={() => go('/calendar')} role="link">
        <div className="card-title">
          <h2>This week</h2>
          <span className="link">Calendar ›</span>
        </div>
        <div className="week-dots" aria-label={`${week.done} of ${week.target} sessions`}>
          {Array.from({ length: Math.max(week.target, week.done) }, (_, i) => (
            <span key={i} className={i < week.done ? 'on' : ''} />
          ))}
          <strong>
            {week.done} / {week.target} sessions
          </strong>
        </div>
        <div className="stats">
          <div>
            <small>New bests</small>
            <strong>{week.prs}</strong>
          </div>
          <div>
            <small>Last upper</small>
            <strong>{since(week.daysSince.upper)}</strong>
          </div>
          <div>
            <small>Last lower</small>
            <strong>{since(week.daysSince.lower)}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Lifts</h2>
          <span className="muted small">est. 1RM · 4-week change</span>
        </div>
        {attention.length > 0 && (
          <div className="attention">
            {attention.map((l) => (
              <button key={l.ex.id} className={`chip ${l.status.status}`} onClick={() => go(`/progress/${l.ex.id}`)}>
                {l.status.status === 'stalled' ? 'Stalled' : 'Slowing'}: {l.ex.name} ({l.status.weeksSinceBest} wks)
              </button>
            ))}
          </div>
        )}
        {lifts.length === 0 ? (
          <p className="muted">Your lifts will appear here after your first workout.</p>
        ) : (
          <ul className="list">
            {lifts.map(({ ex, pts, status, delta }) => {
              const last = pts[pts.length - 1]
              const h = ex.kind === 'sled' ? last.top?.weight : headline(last)
              return (
                <li key={ex.id}>
                  <button className="row-btn lift" onClick={() => go(`/progress/${ex.id}`)}>
                    <StatusDot status={status.status} />
                    <span className="name">{ex.name}</span>
                    <span className="val">{h !== null && h !== undefined ? `${fmtNum(Math.round(h))} lb` : '—'}</span>
                    <span className={`delta ${delta === null ? '' : delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}`}>
                      {delta === null ? '' : `${delta > 0 ? '+' : ''}${fmtNum(Math.round(delta))}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Sheet open={choose} onClose={() => setChoose(false)} title="Start a session">
        <div className="btn-col">
          {templates.map((t) => (
            <button key={t.id} className="btn" onClick={() => start(t)}>
              {t.name}
              {!t.inRotation && <small className="muted"> (not in rotation)</small>}
            </button>
          ))}
          <button className="btn ghost" onClick={() => start(null)}>
            Empty workout (add exercises as you go)
          </button>
        </div>
      </Sheet>
    </div>
  )
}
