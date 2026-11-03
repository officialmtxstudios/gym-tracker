import { useEffect } from 'react'
import { go, useRoute } from './router'
import { addRest, stopRest, useRest } from './rest'
import { fmtTime } from './logic/calc'
import { useNow } from './ui'
import Home from './screens/Home'
import Workout from './screens/Workout'
import Calendar from './screens/Calendar'
import Progress from './screens/Progress'
import Plan from './screens/Plan'
import Exercises from './screens/Exercises'
import SettingsScreen from './screens/Settings'

const TABS = [
  { path: '', label: 'Home', icon: '⌂' },
  { path: 'calendar', label: 'Calendar', icon: '▦' },
  { path: 'progress', label: 'Progress', icon: '↗' },
  { path: 'plan', label: 'Plan', icon: '☰' },
  { path: 'settings', label: 'Settings', icon: '⚙' },
]

export default function App() {
  const [section = '', param] = useRoute()
  let screen
  switch (section) {
    case 'workout':
      screen = <Workout key={param} id={param} />
      break
    case 'calendar':
      screen = <Calendar />
      break
    case 'progress':
      screen = <Progress key={param} id={param} />
      break
    case 'plan':
      screen = <Plan key={param} id={param} />
      break
    case 'exercises':
      screen = <Exercises key={param} id={param} />
      break
    case 'settings':
      screen = <SettingsScreen />
      break
    default:
      screen = <Home />
  }
  const activeTab = section === 'exercises' ? 'plan' : section
  return (
    <>
      <main>{screen}</main>
      <RestBar />
      {section !== 'workout' && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.label} className={activeTab === t.path ? 'on' : ''} onClick={() => go(`/${t.path}`)}>
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}

function RestBar() {
  const { endsAt, total } = useRest()
  useNow(250)
  const left = endsAt ? Math.min(total || Infinity, Math.ceil((endsAt - Date.now()) / 1000)) : 0
  // Hide the "rest over" bar automatically after 10 seconds.
  useEffect(() => {
    if (endsAt && left <= -10) stopRest()
  }, [endsAt, left])
  if (!endsAt || left <= -10) return null
  const done = left <= 0
  return (
    <div className={`restbar ${done ? 'done' : ''}`} role="timer">
      <div className="restbar-fill" style={{ width: `${total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0}%` }} />
      <span className="restbar-time">{done ? 'Rest over – go!' : `Rest ${fmtTime(left)}`}</span>
      {!done && (
        <button className="btn small" onClick={() => addRest(30)}>
          +30s
        </button>
      )}
      <button className="btn small" onClick={stopRest}>
        {done ? 'OK' : 'Skip'}
      </button>
    </div>
  )
}
