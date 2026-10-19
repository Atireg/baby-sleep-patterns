# Nap Nap Hooray

*Every snooze, celebrated.*

**Live site:** https://atireg.github.io/baby-sleep-patterns/

A mobile-friendly website for logging and understanding a baby's sleep. Parents track each sleep live on their phone
(settling → asleep → night wakings and feeds → wake-up) and the site turns the log into practical guidance:

- **Now:** a running awake/asleep timer, the target wake window before the next nap with the time to "enter the room",
  the usual wake window, the expected nap length and the expected morning wake-up.
- **Daytime sleep tank:** today's naps filling up towards the daily nap-time target.
- **Last night:** hours asleep, time awake at night, wakings and feeds, with editable wakings and notes.
- **Wake and sleep windows** and **Naps history:** the actual numbers for the last 5 days.
- **Sleep timeline:** the last 5 days, with the best times to meet friends.
- **Charts:** sleep per day, the change in nap count over time, weekly trends.

Every sleep can be edited afterwards, and both parents see the same log live on their own phones.

## Tech

- **Frontend:** React 18 + Vite 5 with plain CSS (light and dark themes). Plotly charts are view-only for phones and
  lazy-loaded; the sleep tank is custom SVG.
- **Data:** Firebase. Google sign-in, plus Firestore holding the shared log, the sleep in progress and the family
  settings, all synced live between devices. Access is limited to an allow-list of family accounts (see
  `firebase/firestore.rules.example`). It works offline and runs on the free Spark plan. Without signing in, everything
  stays on the device.
- **Rules built in:** night feeds under 25 minutes count as sleep; a night belongs to the evening it started; forecasts
  use the averages of the last 3–5 days.
- **Import/export:** Excel export of the log. Excel parsers for the simple layout and for a sleep-consultant template;
  upload is currently hidden.
- **Quality:** Vitest unit tests for all the calculations. Changes are also checked in a real browser at phone width
  (Playwright) and against the Firebase emulator with two simulated phones.
- **Hosting:** GitHub Pages, deployed by GitHub Actions on every merge to `main`. Open tabs reload themselves when a
  new version is released.
- **Backups:** a nightly GitHub Actions job in a separate private repository copies the whole log (JSON + CSV, with
  history). It emails an alert if the data suddenly shrinks; a manual "Restore" job only adds missing data.
- **Privacy:** this repository is public. No personal data or keys are stored in it (the Firebase web config is
  public by design).

## Development

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests
npm run build   # production build in dist/
```

Project notes for contributors (layout, data model, conventions) are in `CLAUDE.md`.
