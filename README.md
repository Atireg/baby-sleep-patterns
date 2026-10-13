# baby-sleep-patterns

**Live site:** https://atireg.github.io/baby-sleep-patterns/

A React website for visualising and analysing a baby's sleep patterns from an Excel sleep log.

Load an `.xlsx`, `.xls` or `.csv` file (or try the built-in sample), or add sleeps with the form on the page, to see:

- averages for the last 5 days
- night and nap hours per day with a 7-day average
- how the number of naps changes over time (e.g. 5 → 4 → 3)
- wake windows, time to fall asleep and how the baby fell asleep, per week
- a timeline of every sleep, newest day first

Charts are interactive (Plotly): hover for details, drag to zoom, double-click to reset.
Without signing in, files are processed in your browser and entries are stored only in your browser (downloadable as Excel).
Sign in with Google to keep the log in a shared Firebase database instead: import your spreadsheet once and every
device where you sign in sees the same data. Access is limited to the Google accounts listed in the Firestore rules
(see `firebase/firestore.rules.example`).

## Spreadsheet format

| Date       | Settling start | Fell asleep | Woke up | Type  | How fell asleep | Mood after | Notes |
|------------|----------------|-------------|---------|-------|-----------------|------------|-------|
| 2026-09-01 | 08:50          | 09:00       | 09:45   | Nap   | Independently   | Good       |       |
| 2026-09-01 | 19:15          | 19:30       | 02:10   | Night | Patting         |            | Feed  |
| 2026-09-01 |                | 02:30       | 06:45   | Night |                 |            |       |

Only Date, Fell asleep and Woke up are required. Use the evening's date for the whole night, including after midnight. `Type` is optional
(guessed from the start time). A template is available at `static/sample-sleep-log.xlsx`.

## Development

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

## Deployment

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(one-time setup: Settings → Pages → Source → **GitHub Actions**).
