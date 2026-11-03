import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { db, getSettings } from '../db'
import { go } from '../router'
import type { Exercise } from '../types'
import {
  finished, fmtNum, fmtTime, headline, liftHistory, liftStatus, weeklySeries, weekStart, type Metric,
} from '../logic/calc'
import { BackButton, Header, STATUS_LABEL, StatusDot, fmtDate } from '../ui'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

export default function Progress({ id }: { id?: string }) {
  if (id === 'bodyweight') return <Bodyweight />
  if (id) return <LiftDetail id={id} />
  return <LiftList />
}

function LiftList() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const settings = useLiveQuery(getSettings, [])
  if (!sessions || !exercises || !settings) return <div className="page" />
  const now = new Date()
  const rows = exercises
    .filter((e) => !e.hidden)
    .map((ex) => ({ ex, pts: liftHistory(sessions, ex) }))
    .sort((a, b) => Number(b.ex.isMain) - Number(a.ex.isMain) || a.ex.name.localeCompare(b.ex.name))
  const withData = rows.filter((r) => r.pts.length > 0)
  const without = rows.filter((r) => r.pts.length === 0)
  return (
    <div className="page">
      <Header title="Progress" />
      <section className="card">
        <ul className="list">
          <li>
            <button className="row-btn lift" onClick={() => go('/progress/bodyweight')}>
              <span className="dot" />
              <span className="name">Bodyweight</span>
              <span className="val" />
            </button>
          </li>
          {withData.map(({ ex, pts }) => {
            const st = liftStatus(pts, now, settings.stallWeeks)
            const last = pts[pts.length - 1]
            const h = ex.kind === 'sled' ? last.top?.weight : headline(last)
            return (
              <li key={ex.id}>
                <button className="row-btn lift" onClick={() => go(`/progress/${ex.id}`)}>
                  <StatusDot status={st.status} />
                  <span className="name">{ex.name}</span>
                  <span className="val">{h ? `${fmtNum(Math.round(h))} lb` : '—'}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {withData.length === 0 && <p className="muted">Charts appear once you’ve logged a workout.</p>}
      </section>
      {without.length > 0 && (
        <section className="card">
          <p className="label">No data yet</p>
          <p className="muted small">{without.map((r) => r.ex.name).join(' · ')}</p>
        </section>
      )}
    </div>
  )
}

function useColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return { accent: v('--accent'), muted: v('--muted'), grid: v('--line'), text: v('--text') }
}

function LineChart({ labels, values, dim, unit, fmt }: { labels: string[]; values: number[]; dim: boolean[]; unit: string; fmt?: (n: number) => string }) {
  const c = useColors()
  return (
    <div className="chart">
      <Line
        data={{
          labels,
          datasets: [
            {
              data: values,
              borderColor: c.accent,
              backgroundColor: c.accent + '22',
              fill: true,
              cubicInterpolationMode: 'monotone',
              pointRadius: 4,
              pointBackgroundColor: dim.map((d) => (d ? c.muted : c.accent)),
              pointBorderColor: dim.map((d) => (d ? c.muted : c.accent)),
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${fmt ? fmt(ctx.parsed.y ?? 0) : fmtNum(Math.round(ctx.parsed.y ?? 0))} ${unit}${dim[ctx.dataIndex] ? ' (deload)' : ''}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: c.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
            y: {
              ticks: { color: c.muted, callback: (v) => (fmt ? fmt(Number(v)) : fmtNum(Number(v))) },
              grid: { color: c.grid },
            },
          },
        }}
      />
    </div>
  )
}

const METRICS: Record<'lift' | 'sled', { key: Metric; label: string }[]> = {
  lift: [
    { key: 'e1rm', label: 'Est. 1RM' },
    { key: 'top', label: 'Top set' },
    { key: 'volume', label: 'Volume' },
  ],
  sled: [
    { key: 'top', label: 'Weight' },
    { key: 'time', label: 'Time' },
  ],
}

function LiftDetail({ id }: { id: string }) {
  const ex = useLiveQuery(() => db.exercises.get(id), [id])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const settings = useLiveQuery(getSettings, [])
  const [metric, setMetric] = useState<Metric | null>(null)
  const [all, setAll] = useState(false)
  if (!sessions || !settings) return <div className="page" />
  if (!ex)
    return (
      <div className="page">
        <Header title="Progress" left={<BackButton onClick={() => go('/progress')} />} />
      </div>
    )

  const pts = liftHistory(sessions, ex)
  const isSled = ex.kind === 'sled'
  const metrics = METRICS[isSled ? 'sled' : 'lift']
  const hasE1rm = pts.some((p) => p.e1rm !== null)
  const m = metric ?? (isSled ? 'top' : hasE1rm ? 'e1rm' : 'top')
  const cutoff = weekStart(new Date(Date.now() - 11 * 7 * 86400000)).getTime()
  const series = weeklySeries(pts, m).filter((w) => all || w.week.getTime() >= cutoff)
  const st = liftStatus(pts, new Date(), settings.stallWeeks)
  const best = pts.reduce<{ v: number; date: Date } | null>((b, p) => {
    const v = headline(p)
    return v !== null && (!b || v > b.v) ? { v, date: p.date } : b
  }, null)

  return (
    <div className="page">
      <Header title={ex.name} left={<BackButton onClick={() => go('/progress')} label="Progress" />} />
      <section className="card">
        {!isSled && (
          <p className={`status-line ${st.status}`}>
            <StatusDot status={st.status} /> {STATUS_LABEL[st.status]}
            {st.status === 'stalled' && ` – no new best in ${st.weeksSinceBest} weeks`}
          </p>
        )}
        <div className="seg">
          {metrics.map((x) => (
            <button key={x.key} className={m === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>
              {x.label}
            </button>
          ))}
        </div>
        {series.length === 0 ? (
          <p className="muted pad">No data for this chart yet.</p>
        ) : (
          <LineChart
            labels={series.map((w) => fmtDate(w.week, { month: 'short', day: 'numeric' }))}
            values={series.map((w) => w.value)}
            dim={series.map((w) => w.deload)}
            unit={m === 'time' ? '' : 'lb'}
            fmt={m === 'time' ? fmtTime : undefined}
          />
        )}
        <div className="seg small">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>
            12 weeks
          </button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>
            All time
          </button>
        </div>
        <p className="muted small">
          One point per week (Mon–Sun). Grey points are deload weeks.
          {m === 'e1rm' && ' Estimated from sets of 1–10 reps.'}
          {ex.kind === 'weighted_bw' && ' Includes your bodyweight.'}
          {ex.kind === 'dumbbell' && ' Per-hand weight.'}
        </p>
        {best && !isSled && (
          <p>
            Best: <strong>{fmtNum(Math.round(best.v))} lb</strong> on {fmtDate(best.date)}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Sessions</h2>
        <ul className="list">
          {[...pts].reverse().map((p) => (
            <li key={p.sessionId}>
              <button className="row-btn" onClick={() => go(`/workout/${p.sessionId}`)}>
                {fmtDate(p.date)}
                {p.deload ? ' · deload' : ''}
                <small>
                  {p.sled
                    ? `${p.sled.weight} lb · ${p.sled.format}${p.sled.timeSec ? ` · ${fmtTime(p.sled.timeSec)}` : ''}`
                    : `${setsText(p.sets, ex)}${p.e1rm ? ` · est. 1RM ${fmtNum(Math.round(p.e1rm))}` : ''}`}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function setsText(sets: { weight: number; reps: number }[], ex: Exercise) {
  const weights = [...new Set(sets.map((s) => s.weight))]
  const prefix = ex.kind === 'weighted_bw' ? '+' : ''
  if (weights.length === 1) return `${prefix}${fmtNum(weights[0])} × ${sets.map((s) => s.reps).join(', ')}`
  return sets.map((s) => `${prefix}${fmtNum(s.weight)}×${s.reps}`).join(', ')
}

function Bodyweight() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  if (!sessions) return <div className="page" />
  const pts = finished(sessions).filter((s) => s.bodyweight)
  return (
    <div className="page">
      <Header title="Bodyweight" left={<BackButton onClick={() => go('/progress')} label="Progress" />} />
      <section className="card">
        {pts.length === 0 ? (
          <p className="muted">Enter your bodyweight at the top of a workout and it will show up here.</p>
        ) : (
          <LineChart
            labels={pts.map((s) => fmtDate(s.date, { month: 'short', day: 'numeric' }))}
            values={pts.map((s) => s.bodyweight!)}
            dim={pts.map(() => false)}
            unit="lb"
          />
        )}
      </section>
      <section className="card">
        <ul className="list">
          {[...pts].reverse().map((s) => (
            <li key={s.id} className="row-static">
              <span>{fmtDate(s.date)}</span>
              <strong>{fmtNum(s.bodyweight!)} lb</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
