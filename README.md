# Gym Tracker

A personal workout tracker for a 4-day upper/lower split. It runs as a web app saved to the iPhone
home screen, works offline, and keeps all data on the device (backups go to iCloud Drive).

Live: https://officialmtxstudios.github.io/gym-tracker/

## Commands

```bash
npm install          # first time only
npm run dev          # run locally at http://localhost:5173
npm test             # logic tests (estimated 1RM, suggestions, stall flags, backups)
npm run e2e          # click-through tests in Safari's engine at iPhone size
npm run build        # production build into dist/
```

Pushing to `main` runs the tests, builds, and publishes to GitHub Pages automatically.

See `NOTES.md` for how the app works, current status and next steps.
