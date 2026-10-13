# baby-sleep-patterns

A React website for visualising and analysing a baby's sleep patterns from an Excel sleep log.

Load an `.xlsx`, `.xls` or `.csv` file (or try the built-in sample) to see:

- summary tiles: average total, night and nap sleep, naps per day, longest stretch
- a stacked bar chart of night and nap hours per day
- a 24-hour timeline of every sleep session
- a day-by-day breakdown table

Files are processed entirely in your browser.

## Spreadsheet format

| Date       | Start | End   | Type  | Notes |
|------------|-------|-------|-------|-------|
| 2026-09-01 | 09:00 | 09:45 | Nap   |       |
| 2026-09-01 | 19:30 | 02:10 | Night | Feed  |
| 2026-09-01 | 02:30 | 06:45 | Night |       |

Use the evening's date for the whole night, including after midnight. `Type` is optional
(guessed from the start time). A template is available at `static/sample-sleep-log.xlsx`.

## Development

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```
