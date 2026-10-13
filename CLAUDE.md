# CLAUDE.md

Project notes for Claude. **Keep this file clean and current: update it after every fix or feature** (remove stale notes, don't just append).

## Project
Website (React + Vite) that visualises and analyses baby sleep patterns from an Excel sleep log.
Everything runs in the browser; uploaded files are never sent anywhere.

## Commands
- `npm install` – install deps
- `npm run dev` – dev server (http://localhost:5173)
- `npm test` – unit tests (Vitest)
- `npm run build` / `npm run preview` – production build in `dist/`
- `npm run sample` – regenerate `static/sample-sleep-log.xlsx`

## Deployment
GitHub Pages via `.github/workflows/deploy.yml`: on push to `main` (or manual run) it tests, builds and deploys `dist/`.
Pages is enabled (Source = "GitHub Actions"). Site URL: https://atireg.github.io/baby-sleep-patterns/
`vite.config.js` uses `base: './'` so assets and the sample file resolve under the Pages sub-path — keep all in-app URLs relative (no leading `/`).

## Layout
- `static/` – Vite `publicDir` (served at site root): `sample-sleep-log.xlsx` (demo data + template, 5→4→3 naps), `favicon.svg`.
- `src/lib/sleepData.js` – simple-layout parser, `annotateSessions` (nap position + wake window), daily stats. No xlsx dependency.
- `src/lib/consultantLog.js` – parser for the Bulgarian sleep-consultant template.
- `src/lib/readWorkbook.js` – reads the first sheet via SheetJS (`xlsx`) and picks the parser by format.
- `src/lib/entries.js` – sleeps entered on the site: validation, localStorage (`baby-sleep-entries-v1`), conversion, Excel export rows.
- `src/lib/insights.js` – weekly aggregates (wake windows, settling, method), `napCountTrend`, label translations (BG + EN accepted).
- `src/lib/series.js` – gap handling: `breakGaps`, `segments`, `rollingMean` (calendar days), `allWeeks`.
- `src/lib/theme.js` – resolves CSS color tokens for Plotly (`useChartTheme`), `baseLayout`, `durationAxis`, `rangeButtons`.
- `src/components/` – `PlotlyChart` (lazy-loads Plotly, card wrapper), `DailyTotalsChart`, `NapCountChart`, `WeeklyLineChart`,
  `MethodShareChart`, `SleepTimeline`, `StatTiles`, `FileDrop`, `EntryForm`.
- Tests: `src/lib/*.test.js` (Vitest).
- `scripts/make-sample.mjs` – deterministic sample data generator.

## Excel formats
Two layouts are auto-detected (`isConsultantLog` = column A contains "Сутрешно събуждане:").

### 1. Consultant template (the user's real log, sheet "Таблица сън")
- Blocks of 5 days side by side, 8 columns per day starting at column B; block = date row, "Сутрешно събуждане:" (morning wake),
  header row, nap rows "1".."5", "Вечерно заспиване" (bedtime), then summary/free-text rows. Rows are found by label, not offset.
- Per sleep: settling start, asleep, woke, wake window, duration, how fell asleep, mood after, re-settled (да/не).
- Duration/wake window are recomputed from times (sheet formulas ignored). "/" or text in a time cell = unknown.
- "Детето будува ли през нощта?" text ranges ("4:04 - 5:12", 24:xx allowed) split the night into separate night sessions.
- Template placeholders starting with "Например" are dropped from notes.
- Privacy: the child's name / birth date / age rows are never returned or displayed; the name is only used to replace
  itself with "[name]" in notes (tested; notes currently only surface via `days` meta, not displayed). Never add the real log or personal data to the repo (it is public).

### 2. Simple layout (also the entry-form export format)
Headers (case-insensitive, aliases in `HEADER_ALIASES`): `Date`, `Fell asleep`/`Start`, `Woke up`/`End`, optional `Type` (Night/Nap),
`Settling start`, `How fell asleep`, `Mood after`, `Notes`.
- Blank `Date` repeats the row above.
- `End` ≤ `Start` → sleep crossed midnight.
- A row's date = the evening the night began; Night rows starting before 12:00 are moved to the next calendar day.
- Missing `Type` → night if start is 18:00–05:59, else nap.
- Stats are grouped by the row's date ("sleep day"); the timeline groups by calendar day.

## Conventions
- Charts use Plotly (`plotly.js-cartesian-dist-min@3.7.0`, lazy-loaded chunk ~476 kB gzip) via `PlotlyChart`. Colors always come
  from CSS tokens in `src/styles.css` through `useChartTheme` (night = `--series-1` blue, nap = `--series-2` orange, light + dark).
- Lines must break across missing days/weeks (`connectgaps: false`, `breakGaps`); area fills are drawn per `segments`.
- Summary tiles cover only the last 5 days with data (`RECENT_DAYS` in `App.jsx`); charts show everything.
- Sleep timeline: newest first, today on top labelled "Today", one row per calendar day incl. empty days.
- Charts use the uploaded file + entries from the form combined. The daily breakdown table was removed at the user's request — don't re-add it.

## Known caveats
- `xlsx@0.18.5` from npm (the SheetJS CDN build is blocked in the cloud env). It has known advisories for malicious files; acceptable since users only parse their own files locally. Switch to the CDN tarball when possible.
