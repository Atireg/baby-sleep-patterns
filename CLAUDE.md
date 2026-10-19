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
- Firestore: family settings `settings/wakeTargets` = `{ targets }` and `settings/napTarget` = `{ minutes }` (null = Auto);
  never deleted, so a cleared setting stays cleared (`watchSetting` gives undefined only when never saved).
- Firestore: collection `months`, one doc per month (`2026-10`) with `{ entries: [...] }` (same entry shape as the form) —
  ~12 reads per year of data. Writes are per-month transactions; duplicates skipped by `entryKey` (day|type|asleep).
- Security rules: allow-list of family emails, kept only in the console (template: `firebase/firestore.rules.example`).
- SDK `firebase@12.19.0`, loaded lazily with a persistent local cache (offline + fewer reads).
- **Backups**: private repo `Atireg/baby-sleep-backups` (never copy its data here — this repo is public). GitHub Actions
  there: *Backup* nightly 01:17 UTC + manual → `data/months/*.json`, `data/settings.json`, `data/live.json`,
  `data/sleep-log.csv` (same columns as `EXPORT_HEADERS`, readable by the site), committed per night; fails (email) if entries
  drop to ≤ half. *Restore* (manual, dry run by default, optional backup date) only adds missing entries (by `entryKey`) and
  missing settings, never deletes. Uses firebase-admin with secret `FIREBASE_SERVICE_ACCOUNT` (service-account key, in that
  repo's secrets only). If the Firestore layout or entry shape changes, update its `scripts/` too.
- Testing: Firebase emulators (firebase-tools, installed outside the repo) + `VITE_FIREBASE_EMULATOR=1` build, which connects
  to 127.0.0.1:9099/8080 and exposes `window.__testSignIn(email)` (Google's pop-up can't load in the sandbox). Not in prod builds.
- Setup status (verified from outside via public endpoints): Google provider enabled, `atireg.github.io` authorized,
  Firestore DB exists and refuses unauthenticated reads/writes. The allow-list itself can only be verified by signing in.

## Layout
- `static/` – Vite `publicDir` (served at site root): `sample-sleep-log.xlsx` (demo data + template, 5→4→3 naps), `favicon.svg`.
- `src/lib/time.js` – shared date/clock maths (local time): `MS_MIN/HOUR/DAY`, `pad`, `dateKey`, `keyToDate`, `shiftDay`, `hhmm`,
  `clockMinutes`, `clockSpan`, `minutesToClock`, `minutesBetween`, `atOrAfter`, `sum`, `mean`. Use these, don't re-inline them.
- `src/lib/format.js` – display text: `formatDuration`, `formatDay`, `formatTimer`, `ordinal` (+ re-exports `hhmm`).
- `src/lib/storage.js` – `readStored`/`writeStored`: localStorage that never throws (all local persistence goes through it).
- `src/lib/sleepData.js` – simple-layout parser, `parseRanges`, `parseWakings` (feed marks), `splitNight` (night → stretches
  around wakings; stretches carry `nightWakings` with feed flags),
  **short feeds count as sleep** (user rule): a feed waking < `SHORT_FEED_MINUTES` (25) is still split off, but its minutes are
  added to the stretch before it (`countsAsSleep`); `lastNight`/`dayDetails` leave it out of the awake time (still counted as a
  waking + feed, Last night list says "counted as sleep"), as do the log list durations and the Now card's "slept so far".
  Timeline tooltips show the clock span, not `minutes`.
  `annotateSessions` (nap position + wake window), daily stats. No xlsx dependency.
- `src/lib/consultantLog.js` – parser for the Bulgarian sleep-consultant template.
- `src/lib/readWorkbook.js` – reads the first sheet via SheetJS (`xlsx`) and picks the parser by format.
- `src/lib/entries.js` – sleeps entered on the site: validation (`makeEntry(values, id?)`, `checkWakings`), `replaceEntry` (edit by
  id, refuses duplicates), `entryToValues`, localStorage (`baby-sleep-entries-v1`), conversion, Excel export rows.
  Entry shape: `{ id, day, type, settle, asleep, woke, method, mood, notes, wakings: [{ from, to, feed }], extended }` (HH:MM;
  wakings nights only; `extended` = "Was the nap extended?" true/false/null, naps only; `toYesNo`).
- `src/lib/cloud.js` – Firebase wrapper (sign-in, live `watchEntries`, `addEntries`, `updateEntry` (moves between month docs
  in one transaction), `deleteEntry`, `watchLive`/`setLive` (via `watchField`/`setField`), `watchSetting`/`saveSetting`, `describeError`);
  `src/lib/cloudData.js` – pure helpers (month grouping, merge/dedupe, `sessionsToEntries` for importing a file).
- `src/lib/live.js` – live tracking ("Now" card): local storage `baby-sleep-live-v1`, `sleepDay` (night after midnight → previous
  date), `liveToEntry`, `atTime` (tapped-late times never in the future), `resolveWakings` (edited night wakings → ISO), `liveAfterLogEdit` (log add/edit/delete drops a manual awake timer and finishes a
  tracked sleep the entry covers), `editAwakeSince` (edited "awake since" → that logged sleep's new wake-up time, dropping
  later night wakings, or a moved manual timer), `nightAwakeMs` (awake time of a tracked night, short feeds excluded), `awakeSince` (later of last sleep end
  and `live.awakeFrom`; null while asleep or if >16h).
- `src/lib/insights.js` – weekly aggregates (wake windows, settling, method), `napCountTrend`, `daytimeTank`,
  `lastNight` (yesterday-dated night; wakings from `nightGaps` = gaps between its stretches, `feed` matched from `nightWakings`),
  `MAX_WAKE_WINDOW` (8h; longer gaps aren't wake windows, `knownWindow`),
  `friendsWindows`, `dayDetails` (one day's actual numbers, incl. `napsIndependent`/`napsWithMethod`), `upcomingNap` (avg length of nap #N over the last 3 days with naps before today),
  `napsDoneToday`, `expectedWakeUp` (bedtime + (5-day avg total sleep − that day's naps) + awake time at night so far), `upcomingWakeWindow` (avg wake window before nap N, else before bedtime, over the last 5 days),
  `dayAwakeTotal` (morning wake-up → bedtime minus naps for one day), `nightBefore` (night logged under the previous date:
  sleep minutes + non-feed wakings count/minutes + feeds count), `wakeWindowGrid` (actual wake window per nap N / bedtime
  per day),
  label translations (BG + EN).
- `src/lib/wakeTargets.js` – parents' **target wake windows** `{ 1: 120, 2: 150, bedtime: 210 }` (minutes): `loadWakeTargets` /
  `saveLocalWakeTargets` (localStorage `baby-sleep-wake-targets`), `withWakeTarget`, `targetFor`, `TARGET_CHOICES` (30m–6h,
  5-minute steps); the tank's **nap-time target** `loadNapTarget`/`saveLocalNapTarget` (`baby-sleep-nap-target`, null = Auto).
  Both sync through `src/hooks/useSyncedSetting.js` (`useWakeTargets`, `useNapTarget` in `hooks/useWakeTargets.js`): signed in →
  Firestore `settings/*` (watched live, mirrored to the device; if the cloud has no value yet, the device's is uploaded),
  signed out → device only.
- `src/lib/autoUpdate.js` – prod only (`main.jsx`): when the page regains focus/visibility (max once a minute) it fetches
  `index.html` and reloads if the `assets/index-*.js` name changed (skipped while typing in a field). Phones keep the tab open
  for days, so fixes would otherwise not load.
- `src/lib/series.js` – gap handling: `breakGaps`, `segments`, `rollingMean` (calendar days), `allWeeks`.
- `src/lib/theme.js` – resolves CSS color tokens for Plotly (`useChartTheme`), `baseLayout`, `durationAxis`, `rangeButtons`.
- `src/hooks/useSleepLog.js` – all log/cloud/live state and actions (local vs Firebase, `addEntry`/`editEntry`/`removeEntry` with
  `syncLive`, `editAwake`, sign-in, `run` for busy/error handling); `App.jsx` only derives stats and lays out the cards.
  `src/hooks/useNow.js` – `useNow(intervalMs)` ticking clock.
- `src/components/` – `PlotlyChart` (lazy-loads Plotly, card wrapper), `DailyTotalsChart`, `NapCountChart`, `WeeklyLineChart`,
  `MethodShareChart`, `SleepTimeline`, `RecentDaysTable`, `FileDrop`, `EntryForm`, `CloudBar` (sign-in status),
  `DaytimeTank` (custom SVG, not Plotly), `LastNightCard`, `WakeWindowsCard`, `LiveTracker` ("Now" card: states + actions) with
  `NowForecasts` (each forecast line as a component, recomputed per minute), `LiveEditPanel` ("Edit times or type").
  Shared bits: `Chips` (`Chips`, `YesNoChips`, `TypeSwitch`, `ProgressBar`), `WakingRows` (night-waking rows, used by the form
  and the edit panel).
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
`Settling start`, `How fell asleep`, `Mood after`, `Notes`, `Night wakings`, `Nap extended` (Yes/No/да/не; consultant
"доприспиване" maps to it) ("01:10-01:45 feed, 04:30-04:40"; splits the night;
"feed"/"fed"/"хран"/"кърм"/🍼 after a range marks a feed).
- Blank `Date` repeats the row above.
- `End` ≤ `Start` → sleep crossed midnight.
- A row's date = the evening the night began; Night rows starting before 12:00 are moved to the next calendar day.
- Missing `Type` → night if start is 18:00–05:59, else nap.
- Stats are grouped by the row's date ("sleep day"); the timeline groups by calendar day.

## Conventions
- Page order: CloudBar → **Now** card → **Daytime sleep tank** → **Last night** card → **Wake and sleep windows** card →
  **Naps history** → **Sleep timeline** → (upload, hidden) → entry form → charts.
- Charts use Plotly (`plotly.js-cartesian-dist-min@3.7.0`, lazy-loaded chunk ~476 kB gzip) via `PlotlyChart`. Colors always come
  from CSS tokens in `src/styles.css` through `useChartTheme` (night = `--series-1` blue, nap = `--series-2` orange, light + dark).
- Charts are view-only (user request: zoom was awkward on phones): `dragmode: false`, `fixedrange` axes in `baseLayout`, and no
  mode bar / scroll zoom / double-click in `PlotlyChart`. Hover/tap tooltips and the Sleep per day 2w/1m/All buttons remain.
- Lines must break across missing days/weeks (`connectgaps: false`, `breakGaps`); area fills are drawn per `segments`.
- "Last 5 days" = the 5 most recent days with data **before today** (`RECENT_DAYS`, `recentDays` in `App.jsx`). The card for
  them is **💤 Naps history** (`RecentDaysTable`, user request: naps only, no averages): day-by-day actual numbers, newest first,
  rows = naps (+ lengths), nap time, naps extended (x of y answered), time to fall asleep (each nap), fell asleep on her own
  (naps, x of y) — from `dayDetails`. Sticky first column; scrolls sideways on phones. Night/total/awake numbers live in the
  Wake and sleep windows and Last night cards.
  The same 5 days drive the sleep timeline, the friends windows and the Sleep per day reference line.
- Sleep per day: shaded last-5 days + dashed 5-day average line with label; dotted 7-day rolling average excludes today.
- "Now" card (mobile-first): big running awake timer when idle (from the last sleep's end, or "Start awake timer"/"reset" →
  `live.awakeFrom`); "awake since HH:MM · edit · reset" — edit changes the wake-up time of the logged sleep the timer runs
  from (via `editEntry`, so the log and Now card stay in step) or moves the manual timer. States: idle → settling → asleep → (nights) nightawake ↔ asleep → finish (confirm time, mood, notes) → Save
  as a normal entry. Nights: "Night waking" / "Back asleep" record `live.wakings` (with "🍼 Mark as a feed" → `live.wakingFeed`);
  "Up for the day" ends the night at the waking time. Type auto by clock (18:00–05:59 = night), switchable. "Tapped late?" time field. "Edit times or type" (nights: "…or night wakings" — edit/add/remove
  wakings with 🍼 feed and the current "woke at"; `resolveWakings` reads HH:MM forward from bedtime, rejects bad order/future). Method chips.
  The sleep in progress counts in the tank (`tankSessions`) but not in charts until saved.
  The sleep log wins: adding/editing/deleting in the entry form calls `syncLive` in App (`liveAfterLogEdit`), so the Now card
  follows the log (Last-night notes edits don't trigger it).
  No expected-bedtime line (removed at the user's request).
  Wake-window lines (idle): first "🎯 Target wake window before the Nth nap/bedtime: Y — enter the room at HH:MM · asleep by
  HH:MM" (target end − `ENTER_ROOM_EARLY` = 10 min; only when a target is set), then "⏱ Average wake window: ~X · sleepy around
  HH:MM (last N days)" from `upcomingWakeWindow`; when over: "X over the target/usual — time to settle?"; bar of awake time vs the
  target (else the average). No target chips (removed at the user's request). `.card` uses `grid-template-columns: minmax(0, 1fr)` so wide tables
  scroll inside cards instead of stretching them.
  Wake window just before (asleep state): "⏱ Wake window before this nap/bedtime: X (HH:MM → HH:MM) · usually ~Y" — from the last
  logged sleep's end (or a manual timer; `fellAsleep` keeps `live.awakeFrom`) to `live.asleep`; hidden if unknown or ≥ 8h;
  "usually" only when `upcomingWakeWindow`'s target matches (nap vs bedtime); "· 🎯 target Y" when one is set.
  Nap forecast (naps only): idle/settling "💤 Next: Nth nap · usually ~X"; during a nap "may wake around HH:MM" + progress bar
  (or "already X longer than usual"); N = today's saved naps + 1, from `upcomingNap`.
  Wake-up line (night asleep / night waking): "☀️ Expected wake-up ~HH:MM · in X (5-day avg sleep A − N of naps today = T tonight
  + M awake)" + night progress bar (bedtime → expected wake-up), from `expectedWakeUp` (user rule). The average (`nightAvgTotal`
  in App) uses the 5 days before the night's own day, so after midnight the half-logged evening doesn't count. Below it (night asleep / night waking): "🌤 Awake today: X (wake → bedtime,
  minus naps) · 5-day avg Y" (`dayAwakeTotal`; avg = mean of the last 5 days' awake-during-the-day values, passed as `awakeAvg`).
- Editing: each listed entry has ✎ (loads it into the form → "Save changes"/"Cancel edit") and × (delete). "Show day" filter.
  The form has "Night wakings" rows (Woke at / Back asleep at / 🍼 Feed) for nights; list durations subtract wakings.
  Naps have "Was the nap extended?" Yes/No (form chips; Now card finish step for naps); list shows "extended"/"not extended".
- Daytime sleep tank: today's naps (`daytimeTank`; a nap in progress counts up to now) vs target = 5-day average nap time (auto)
  or a fixed choice (`useNapTarget`, synced when signed in); "awake/asleep since"; refreshes every second while a nap is in
  progress (the nap row shows "HH:MM–now" + running timer), otherwise every minute. Below it a collapsible "🎯 Target wake
  windows" editor (Before 1st nap … / Before bedtime selects; rows = max(3, naps seen in the last 5 days, today's naps + 1)).
- Last night card (`LastNightCard`, after the tank): tiles Asleep / **Awake during the night** (highlighted amber) / Wakings /
  Feeds 🍼; bedtime → morning bar (blue asleep, amber awake, 🍼 feeds); numbered waking list; "✎ Edit night wakings" (`WakingRows`
  prefilled from **all** the card's wakings, i.e. the gaps between the night's stretches; save → `mergeNight` (entries.js) joins
  a night saved as several entries into the first one, validated like the form, then the other parts are deleted); "Notes about last night" saved into
  that night's entry `notes` (via the same update path as editing). Both need the night to be a saved entry.
- **Wake and sleep windows** card (`WakeWindowsCard`, before the timeline; renamed from "Wake windows"): first row "Night before" (sleep the night before each day, blue;
  "N× awake, X" under it for night wakings that weren't feeds, then "🍼 N feeds", from `nightBefore`), then rows 1st nap … / Bedtime, columns = the Last-5 days newest
  first, actual values from `wakeWindowGrid`; today's upcoming row (`upcomingWakeWindow` target) highlighted "next"; last rows
  **Awake during the day** and **Total sleep** (from `recentDetails`/`dayDetails`, passed as `details`), with "avg X" under the label.
- Sleep timeline: the last-5 days, newest first, calendar-day rows (`dayKeys`); green bands + tip = good times to meet friends
  (`friendsWindows`: 07:00–19:00, awake and not within 30 min of a sleep on all days, else all-but-one; ≥ 60 min; top 2).
- Charts use saved entries (local, or the cloud log when signed in) + a loaded file (when upload is enabled), not double-counted.
- The old full-history daily breakdown table was removed at the user's request — don't re-add it (Naps history is separate).

## Known caveats
- `xlsx@0.18.5` from npm (the SheetJS CDN build is blocked in the cloud env). It has known advisories for malicious files; acceptable since users only parse their own files locally. Switch to the CDN tarball when possible.
