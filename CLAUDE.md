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
- `static/` – Vite `publicDir` (served at site root). Holds `sample-sleep-log.xlsx` (sample data + downloadable template).
- `src/lib/sleepData.js` – pure parsing + stats (no xlsx dependency; unit tested in `sleepData.test.js`).
- `src/lib/readWorkbook.js` – reads first sheet of .xlsx/.xls/.csv via SheetJS (`xlsx`) and picks the parser by format.
- `src/lib/consultantLog.js` – parser for the Bulgarian sleep-consultant template (tested in `consultantLog.test.js`).
- `src/lib/insights.js` – weekly aggregates (wake windows, settling time, settling method) + label translations.
- `src/components/` – `FileDrop`, `StatTiles`, `DailyTotalsChart` (stacked bars), `WeeklyLineChart`, `MethodShareChart` (100% stacked),
  `SleepTimeline` (per-day 24h rows), `DailyTable`, shared `Tooltip`/`Legend`. Insight charts only render when the data has consultant fields.
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
  itself with "[name]" in notes (tested). Never add the real log or personal data to the repo (it is public).

### 2. Simple layout
Headers (case-insensitive, aliases in `HEADER_ALIASES`): `Date`, `Start`, `End`, optional `Type` (Night/Nap), optional `Notes`.
- Blank `Date` repeats the row above.
- `End` ≤ `Start` → sleep crossed midnight.
- A row's date = the evening the night began; Night rows starting before 12:00 are moved to the next calendar day.
- Missing `Type` → night if start is 18:00–05:59, else nap.
- Stats are grouped by the row's date ("sleep day"); the timeline groups by calendar day.

## Conventions
- Charts are hand-built SVG (no chart library). Colors come from CSS tokens in `src/styles.css`
  (`--series-1` night = blue, `--series-2` nap = orange, light + dark variants). Text never uses series colors.
- Every chart has a legend, hover tooltip, and the daily table serves as the table view.

## Known caveats
- `xlsx@0.18.5` from npm (the SheetJS CDN build is blocked in the cloud env). It has known advisories for malicious files; acceptable since users only parse their own files locally. Switch to the CDN tarball when possible.
