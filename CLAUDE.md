# CLAUDE.md

Project notes for Claude. **Keep this file clean and current: update it after every fix or feature** (remove stale notes, don't just append).

## Project
**Nap Nap Hooray** ("Every snooze, celebrated.") — website (React + Vite) for logging and visualising a baby's sleep.
The repo/URL keep the old name `baby-sleep-patterns`.
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
- `src/lib/sleepData.js` – simple-layout parser, `parseRanges`, `parseWakings` (feed marks), `splitNight` (night → stretches
  around wakings; stretches carry `nightWakings` with feed flags),
  `annotateSessions` (nap position + wake window), daily stats. No xlsx dependency.
- `src/lib/consultantLog.js` – parser for the Bulgarian sleep-consultant template.
- `src/lib/readWorkbook.js` – reads the first sheet via SheetJS (`xlsx`) and picks the parser by format.
- `src/lib/entries.js` – sleeps entered on the site: validation (`makeEntry(values, id?)`, `checkWakings`), `replaceEntry` (edit by
  id, refuses duplicates), `entryToValues`, localStorage (`baby-sleep-entries-v1`), conversion, Excel export rows.
  Entry shape: `{ id, day, type, settle, asleep, woke, method, mood, notes, wakings: [{ from, to, feed }] }` (HH:MM; wakings nights only).
- `src/lib/cloud.js` – Firebase wrapper (sign-in, live `watchEntries`, `addEntries`, `updateEntry` (moves between month docs
  in one transaction), `deleteEntry`, `watchLive`/`setLive`, `describeError`);
  `src/lib/cloudData.js` – pure helpers (month grouping, merge/dedupe, `sessionsToEntries` for importing a file).
- `src/lib/live.js` – live tracking ("Now" card): local storage `baby-sleep-live-v1`, `sleepDay` (night after midnight → previous
  date), `liveToEntry`, `atTime` (tapped-late times never in the future), `formatTimer`, `awakeSince` (later of last sleep end
  and `live.awakeFrom`; null while asleep or if >16h).
- `src/lib/insights.js` – weekly aggregates (wake windows, settling, method), `napCountTrend`, `daytimeTank`, `awakeStats`,
  `lastNight` (yesterday-dated night; wakings = gaps between its stretches, `feed` matched from `nightWakings`; `feeds` count),
  `friendsWindows`, `upcomingNap` (avg length of nap #N over the last 3 days with naps before today), `expectedBedtime`
  (avg first-stretch bedtime of the last 3 nights; after-midnight counts as +24h), `expectedWakeUp` (avg end of the last 3
  completed nights), label translations (BG + EN).
- `src/lib/series.js` – gap handling: `breakGaps`, `segments`, `rollingMean` (calendar days), `allWeeks`.
- `src/lib/theme.js` – resolves CSS color tokens for Plotly (`useChartTheme`), `baseLayout`, `durationAxis`, `rangeButtons`.
- `src/components/` – `PlotlyChart` (lazy-loads Plotly, card wrapper), `DailyTotalsChart`, `NapCountChart`, `WeeklyLineChart`,
  `MethodShareChart`, `SleepTimeline`, `StatTiles`, `FileDrop`, `EntryForm`, `CloudBar` (sign-in status),
  `DaytimeTank` (custom SVG, not Plotly), `LastNightCard`, `LiveTracker` ("Now" card).
- Tests: `src/lib/*.test.js` (Vitest).
- `scripts/make-sample.mjs` – deterministic sample data generator.

## Excel formats
Excel **upload is hidden for now** (user request): `SHOW_FILE_UPLOAD = false` in `App.jsx` hides `FileDrop`; parsers stay.
"Download as Excel" of entries still works.
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
`Settling start`, `How fell asleep`, `Mood after`, `Notes`, `Night wakings` ("01:10-01:45 feed, 04:30-04:40"; splits the night;
"feed"/"fed"/"хран"/"кърм"/🍼 after a range marks a feed).
- Blank `Date` repeats the row above.
- `End` ≤ `Start` → sleep crossed midnight.
- A row's date = the evening the night began; Night rows starting before 12:00 are moved to the next calendar day.
- Missing `Type` → night if start is 18:00–05:59, else nap.
- Stats are grouped by the row's date ("sleep day"); the timeline groups by calendar day.

## Conventions
- Page order: CloudBar → **Now** card → **Daytime sleep tank** → **Last night** card → **Sleep timeline** → (upload, hidden) → entry form
  → "Last 5 days" tiles → charts.
- Charts use Plotly (`plotly.js-cartesian-dist-min@3.7.0`, lazy-loaded chunk ~476 kB gzip) via `PlotlyChart`. Colors always come
  from CSS tokens in `src/styles.css` through `useChartTheme` (night = `--series-1` blue, nap = `--series-2` orange, light + dark).
- Lines must break across missing days/weeks (`connectgaps: false`, `breakGaps`); area fills are drawn per `segments`.
- "Last 5 days": the 5 most recent days with data **before today** (`RECENT_DAYS` in `App.jsx`). Used by the summary tiles
  (incl. "Avg. awake time / day" = sum of the day's wake windows, complete days only, and "Avg. wake window"; `awakeStats`,
  windows ≥ 8h = missing data), the sleep timeline, the friends windows and the Sleep per day reference line.
- Sleep per day: shaded last-5 days + dashed 5-day average line with label; dotted 7-day rolling average excludes today.
- "Now" card (mobile-first): big running awake timer when idle (from the last sleep's end, or "Start awake timer"/"reset" →
  `live.awakeFrom`). States: idle → settling → asleep → (nights) nightawake ↔ asleep → finish (confirm time, mood, notes) → Save
  as a normal entry. Nights: "Night waking" / "Back asleep" record `live.wakings` (with "🍼 Mark as a feed" → `live.wakingFeed`);
  "Up for the day" ends the night at the waking time. Type auto by clock (18:00–05:59 = night), switchable. "Tapped late?" time field. "Edit times or type". Method chips.
  The sleep in progress counts in the tank (`tankSessions`) but not in charts until saved.
  Nap forecast (naps only): idle/settling "💤 Next: Nth nap · usually ~X"; during a nap "may wake around HH:MM" + progress bar
  (or "already X longer than usual"); N = today's saved naps + 1, from `upcomingNap`.
  Bedtime line (idle, and while settling a night): "🌙 Expected bedtime ~HH:MM · in X / about now (±10m) / X past the usual
  time"; hidden once tonight's night is logged.
  Wake-up line (night asleep / night waking): "☀️ Expected wake-up ~HH:MM · in X / about now / X past" + night progress bar
  (bedtime → expected wake-up), from `expectedWakeUp`.
- Editing: each listed entry has ✎ (loads it into the form → "Save changes"/"Cancel edit") and × (delete). "Show day" filter.
  The form has "Night wakings" rows (Woke at / Back asleep at / 🍼 Feed) for nights; list durations subtract wakings.
- Daytime sleep tank: today's naps (`daytimeTank`; a nap in progress counts up to now) vs target = 5-day average nap time (auto)
  or a fixed choice (localStorage `baby-sleep-nap-target`); "awake/asleep since"; refreshes every minute.
- Last night card (`LastNightCard`, after the tank): tiles Asleep / **Awake during the night** (highlighted amber) / Wakings /
  Feeds 🍼; bedtime → morning bar (blue asleep, amber awake, 🍼 feeds); numbered waking list; "Notes about last night" saved into
  that night's entry `notes` (via the same update path as editing; disabled when the night isn't a saved entry).
- Sleep timeline: the last-5 days, newest first, calendar-day rows (`dayKeys`); green bands + tip = good times to meet friends
  (`friendsWindows`: 07:00–19:00, awake and not within 30 min of a sleep on all days, else all-but-one; ≥ 60 min; top 2).
- Charts use saved entries (local, or the cloud log when signed in) + a loaded file (when upload is enabled), not double-counted.
- The daily breakdown table was removed at the user's request — don't re-add it.

## Known caveats
- `xlsx@0.18.5` from npm (the SheetJS CDN build is blocked in the cloud env). It has known advisories for malicious files; acceptable since users only parse their own files locally. Switch to the CDN tarball when possible.
