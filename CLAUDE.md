# CLAUDE.md

Project notes for Claude. **Keep this file clean and current: update it after every fix or feature** (remove stale notes, don't just append).

## Project
Website (React + Vite) that visualises and analyses baby sleep patterns from an Excel sleep log.
Runs in the browser. Signed out: files and form entries stay on the device. Signed in with Google: entries live in
a shared Firebase (Firestore) log so the file only has to be imported once and every device sees the same data.

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

## Firebase (shared cloud log)
- Project `baby-sleep-pattern`, Spark (free) plan — never enable Blaze/billing. Config in `src/lib/firebaseConfig.js` (public by design).
- Auth: Google sign-in; `atireg.github.io` must be in Authentication → Authorized domains.
- Firestore: doc `live/current` = `{ live }`, the sleep being tracked right now, or just `{ awakeFrom }` for a manually started
  awake timer (shared between devices; deleted when a sleep is saved).
- Firestore: collection `months`, one doc per month (`2026-10`) with `{ entries: [...] }` (same entry shape as the form) —
  ~12 reads per year of data. Writes are per-month transactions; duplicates skipped by `entryKey` (day|type|asleep).
- Security rules: allow-list of family emails, kept only in the console (template: `firebase/firestore.rules.example`).
- SDK `firebase@12.19.0`, loaded lazily with a persistent local cache (offline + fewer reads).
- Testing: Firebase emulators (firebase-tools, installed outside the repo) + `VITE_FIREBASE_EMULATOR=1` build, which connects
  to 127.0.0.1:9099/8080 and exposes `window.__testSignIn(email)` (Google's pop-up can't load in the sandbox). Not in prod builds.
- Setup status (verified from outside via public endpoints): Google provider enabled, `atireg.github.io` authorized,
  Firestore DB exists and refuses unauthenticated reads/writes. The allow-list itself can only be verified by signing in.

## Layout
- `static/` – Vite `publicDir` (served at site root): `sample-sleep-log.xlsx` (demo data + template, 5→4→3 naps), `favicon.svg`.
- `src/lib/sleepData.js` – simple-layout parser, `annotateSessions` (nap position + wake window), daily stats. No xlsx dependency.
- `src/lib/consultantLog.js` – parser for the Bulgarian sleep-consultant template.
- `src/lib/readWorkbook.js` – reads the first sheet via SheetJS (`xlsx`) and picks the parser by format.
- `src/lib/entries.js` – sleeps entered on the site: validation (`makeEntry(values, id?)`), `replaceEntry` (edit by id, refuses
  duplicates), `entryToValues`, localStorage (`baby-sleep-entries-v1`), conversion, Excel export rows.
- `src/lib/cloud.js` – Firebase wrapper (sign-in, live `watchEntries`, `addEntries`, `updateEntry` (moves between month docs
  in one transaction), `deleteEntry`, `watchLive`/`setLive`, `describeError`);
  `src/lib/cloudData.js` – pure helpers (month grouping, merge/dedupe, `sessionsToEntries` for importing a file).
- `src/lib/live.js` – live tracking ("Now" card): local storage `baby-sleep-live-v1`, `sleepDay` (night after midnight → previous
  date), `liveToEntry`, `atTime` (tapped-late times never in the future), `formatTimer`, `awakeSince` (later of last sleep end
  and `live.awakeFrom`; null while asleep or if >16h).
- `src/lib/insights.js` – weekly aggregates (wake windows, settling, method), `napCountTrend`, label translations (BG + EN accepted).
- `src/lib/series.js` – gap handling: `breakGaps`, `segments`, `rollingMean` (calendar days), `allWeeks`.
- `src/lib/theme.js` – resolves CSS color tokens for Plotly (`useChartTheme`), `baseLayout`, `durationAxis`, `rangeButtons`.
- `src/components/` – `PlotlyChart` (lazy-loads Plotly, card wrapper), `DailyTotalsChart`, `NapCountChart`, `WeeklyLineChart`,
  `MethodShareChart`, `SleepTimeline`, `StatTiles`, `FileDrop`, `EntryForm`, `CloudBar` (sign-in status),
  `DaytimeTank` (custom SVG, not Plotly), `LiveTracker` ("Now" card).
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
- Summary tiles average the last 5 days with data **before today** (today is incomplete; `RECENT_DAYS` in `App.jsx`),
  heading shows the date range; hidden if there's no earlier data. Charts show everything, including today.
  Includes "Avg. awake time / day" (sum of the day's wake windows, morning wake → bedtime; only complete days) and
  "Avg. wake window" (`awakeStats` in insights.js; windows ≥ 8h treated as missing data).
- "Now" card (top of page, mobile-first): big running awake timer when idle (from the last sleep's end, or "Start awake timer"
  / "reset" → `live.awakeFrom`); live states: idle (no settle/asleep), settling, asleep. Start settling → Fell asleep (running timer) → Woke up (confirm time, mood, notes) → Save
  as a normal entry. Type auto by clock (18:00–05:59 = night), switchable. "Tapped late?" time field. Method chips while settling/asleep.
  Unedited wake time uses the exact tap time. The sleep in progress counts in the tank (`tankSessions`) but not in charts until saved.
- Editing: each listed entry has ✎ (loads it into the form → "Save changes"/"Cancel edit") and × (delete). "Show day" date filter
  finds older entries. The Now card has "Edit times or type" for the sleep in progress.
- "Daytime sleep tank" (below the summary tiles): today's naps (`daytimeTank` in insights.js; a nap in progress counts up to now)
  vs a target = 5-day average nap time (auto) or a fixed choice saved in localStorage `baby-sleep-nap-target`.
  Also shows "awake since" / "asleep since"; refreshes every minute.
- Sleep timeline: only the same 5 days as the summary tiles (last 5 days with data, excluding today), newest first,
  one row per calendar day (`dayKeys` prop); pieces of sleeps on other calendar days (e.g. after midnight into today) are not shown.
- Charts use a loaded file + saved entries (local, or the cloud log when signed in) combined; file sleeps already saved are
  not double-counted. Signed in, a loaded file shows a "Save to shared log" prompt; local entries can be moved to the cloud.
- Importing the consultant log to the cloud keeps times, settling, method and mood but not the free-text day notes. The daily breakdown table was removed at the user's request — don't re-add it.

## Known caveats
- `xlsx@0.18.5` from npm (the SheetJS CDN build is blocked in the cloud env). It has known advisories for malicious files; acceptable since users only parse their own files locally. Switch to the CDN tarball when possible.
