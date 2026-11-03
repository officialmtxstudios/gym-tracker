import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, updateSettings } from '../db'
import { daysBetween } from '../logic/calc'
import { exportBackup, exportCSV, importBackup, markBackedUp, saveFile } from '../logic/data'
import { Header, NumInput, Toggle, fmtDate } from '../ui'

export default function SettingsScreen() {
  const settings = useLiveQuery(getSettings, [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])
  if (!settings) return <div className="page" />

  const stamp = new Date().toISOString().slice(0, 10)
  const backup = async () => {
    const r = await saveFile(`gym-tracker-backup-${stamp}.json`, JSON.stringify(await exportBackup()), 'application/json')
    if (r !== 'cancelled') {
      await markBackedUp()
      setMsg('Backup saved.')
    }
  }
  const csv = async () => {
    await saveFile(`gym-tracker-sets-${stamp}.csv`, await exportCSV(), 'text/csv')
  }
  const restore = async (file: File | undefined) => {
    if (!file) return
    if (!confirm('Restore this backup? It REPLACES everything currently in the app.')) return
    try {
      const data = await importBackup(await file.text())
      setMsg(`Restored ${data.sessions.length} workouts from ${fmtDate(data.exportedAt)}.`)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const lastDays = settings.lastBackupAt ? daysBetween(new Date(settings.lastBackupAt), new Date()) : null

  return (
    <div className="page">
      <Header title="Settings" />
      <section className="card">
        <h2>Backup & export</h2>
        <p className="muted small">
          Last backup: {lastDays === null ? 'never' : lastDays === 0 ? 'today' : `${lastDays} days ago`}
        </p>
        <div className="btn-col">
          <button className="btn primary" onClick={backup}>
            Back up (full file)
          </button>
          <button className="btn" onClick={csv}>
            Export spreadsheet (CSV)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restore from backup…
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        </div>
        {msg && <p className="tip">{msg}</p>}
        <p className="muted small">
          On iPhone, choose <b>Save to Files → iCloud Drive</b>. To see your data on your Mac, open the app’s link in a
          browser there and use <b>Restore from backup</b> with the latest file.
        </p>
      </section>

      <section className="card">
        <h2>Rest timer</h2>
        <Toggle label="Start automatically when a set is ticked" checked={settings.restTimerOn} onChange={(v) => updateSettings({ restTimerOn: v })} />
        <div className="field-row">
          <span>Main lifts (sec)</span>
          <NumInput label="Main lift rest" decimal={false} step={15} min={15} value={settings.restMainSec} onChange={(v) => updateSettings({ restMainSec: v })} />
        </div>
        <div className="field-row">
          <span>Other lifts (sec)</span>
          <NumInput label="Other rest" decimal={false} step={15} min={15} value={settings.restOtherSec} onChange={(v) => updateSettings({ restOtherSec: v })} />
        </div>
      </section>

      <section className="card">
        <h2>Goals & alerts</h2>
        <div className="field-row">
          <span>Sessions per week</span>
          <NumInput label="Weekly target" decimal={false} step={1} min={1} value={settings.weeklyTarget} onChange={(v) => updateSettings({ weeklyTarget: v })} />
        </div>
        <div className="field-row">
          <span>Stalled after (weeks)</span>
          <NumInput label="Stall weeks" decimal={false} step={1} min={2} value={settings.stallWeeks} onChange={(v) => updateSettings({ stallWeeks: v })} />
        </div>
        <p className="muted small">A lift is flagged when it has no new best for this many weeks (deload sessions ignored).</p>
      </section>

      <section className="card">
        <h2>About</h2>
        <p className="muted small">
          Your data is stored only on this device{persisted === false ? ' (the browser may clear it if storage runs low – keep backups)' : ''}. Estimated 1RM uses the Epley formula on sets of 1–10 reps.
        </p>
      </section>
    </div>
  )
}
