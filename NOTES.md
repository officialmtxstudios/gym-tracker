# Gym Tracker – project notes

## Current status (2026-11-03)
- Version 1 is built, tested and published at https://officialmtxstudios.github.io/gym-tracker/
  (repo: https://github.com/officialmtxstudios/gym-tracker, public; GitHub Pages deploys from the
  Actions workflow on every push to `main` – first deploy passed and the live site was checked).
- Next step: Matt opens the link in Safari on his iPhone → Share → **Add to Home Screen**, then logs a
  real session. Collect any changes he wants after using it at the gym.

## What the app is
A web app saved to the iPhone home screen (a "PWA"). It works offline and stores all data on the
phone (IndexedDB in the browser). There's no server and no account. Backups are a JSON file saved via the iPhone
share sheet to iCloud Drive. The Mac can view the data by opening the same link and restoring a backup.
Chosen over a native iPhone app because that needs the $99/yr Apple Developer Program.

## Training setup (Matt's decisions)
- Goal: strength + size, prefers ~4–8 reps. Straight sets. Compound + weighted bodyweight only – no
  isolation work (don't suggest adding it).
- Rotation (not tied to weekdays, ~4 sessions/week): Upper A → Lower A → Upper B → Lower B.
  - Upper A: weighted pull-up 3×5–8, flat bench 4×4–6, barbell row 3×6–10, OHP 3×6–8, weighted dip 3×6–10
  - Upper B: weighted pull-up 3×5–8, OHP 4×4–6, barbell row 3×6–10, incline DB press 3×6–10 (swap: incline barbell), weighted dip 3×6–10
  - Lower A: sled (warm-up), back squat 4×4–6, RDL 3×6–8, calf raise 3×8–12 (standing, swap seated), tib raise 2×12–20
  - Lower B: sled, deadlift 3×4–6 (swap sumo), front squat 3×6–8, hip thrust 3×6–10 (optional), calf raise, tib raise
- Units lb. Weight jumps: +10 squat/deadlift/sumo/RDL/hip thrust, +5 everything else (per hand for DBs).
- Week starts Monday. Warm-up sets are not logged. Sled = sled weight + format + total time (stopwatch).
- All of the above is editable in the app (Plan tab → sessions; Plan → Exercise library; Settings).

## How the numbers work (src/logic/calc.ts)
- Est. 1RM = Epley, only from sets of 1–10 reps. Pull-ups/dips use bodyweight + added weight
  (bodyweight from that session, else carried forward).
- "Progress score" = same formula without the 10-rep cap; used for PRs and stall detection.
- Suggested weight: last non-deload session of that lift, **same template first** (so Upper A and
  Upper B OHP progress separately). All planned sets done at the top of the range → + weight jump,
  reps reset to bottom of range; otherwise same weight, +1 rep per set (capped at top).
- Stall: no new best for `stallWeeks` (default 3) weeks, deload sessions ignored. "Slowing" one week
  earlier. Needs stallWeeks+1 weeks of history ("Building history" before that); "Not trained
  recently" if not done within the window.

## Code map
- `src/types.ts` data shapes · `src/seed.ts` starting exercises & templates · `src/db.ts` database (Dexie)
- `src/logic/calc.ts` all calculations · `src/logic/data.ts` start session, rotation, backup/restore, file save
- `src/logic/backup.ts` backup format + CSV export
- `src/screens/` Home, Workout (also used to view/edit past sessions), Calendar (month + week review),
  Progress (charts), Plan (templates), Exercises (library), Settings
- `src/rest.ts` rest timer (stores end time, so it survives closing the app; beeps only while open)
- `src/router.ts` hash routes like `#/progress/bench`
- `design/icon-1024.png` chosen app icon (Higgsfield, option 2 of 4 in `design/icon-options/`)
- `.github/workflows/deploy.yml` tests + builds + publishes on every push to `main`

## Testing
- `npm test` – 30 logic tests (Vitest).
- `npm run e2e` – 4 click-through tests in WebKit at iPhone 15 size (Playwright): a full week of
  sessions from scratch, 6 weeks of imported history (stall flag, suggestions, charts, calendar),
  editing the plan, backup/CSV/settings. Screenshots land in `e2e/shots/` (git-ignored).
- Verified the production build works offline (service worker) in a browser.
- Not verifiable here: real iPhone home-screen install, share sheet → iCloud Drive, behaviour at the gym.

## Known limits / ideas for later
- Rest timer can't buzz a locked phone (web app limitation); it beeps if the app is open.
- No automatic Mac sync – Mac views data via Restore from backup.
- If Safari's website data is cleared, data is lost – the app nags for a backup every 7 days.
- GitHub Actions warns that checkout/setup-node/pages actions v4 run on deprecated Node 20; bump
  them to newer major versions at some point (works fine today).
