import { formatDay, formatDuration, hhmm } from '../lib/format.js';
import { mean } from '../lib/time.js';

const dur = (m) => (m == null ? '–' : formatDuration(m));
const average = (xs) => mean(xs.filter((x) => x != null));
const clock = (d) => (d ? hhmm(d) : '–');

// One row per measure; each cell is one day's actual value (no averages).
// `avg` marks the only row that also gets an average at the end (user request). "Awake during the day" moved to the
// Wake windows card.
const ROWS = [
  { label: 'Total sleep', strong: true, value: (d) => dur(d.totalMinutes), avg: (d) => d.totalMinutes },
  { label: 'Night sleep', value: (d) => dur(d.nightMinutes) },
  { label: 'Naps', value: (d) => (d.naps ? <>{d.naps}<small>{d.napLengths.map(formatDuration).join(' · ')}</small></> : '0') },
  { label: 'Nap time', value: (d) => dur(d.napMinutes) },
  { label: 'Naps extended', value: (d) => (d.napsAnswered ? `${d.extendedNaps} of ${d.napsAnswered}` : '–') },
  { section: 'Time to fall asleep' },
  { label: 'Each nap', value: (d) => (d.napSettle.length ? d.napSettle.map(dur).join(' · ') : '–') },
  { label: 'Bedtime', value: (d) => dur(d.bedSettle) },
  { label: 'Total that day', strong: true, value: (d) => dur(d.settleTotal) },
  { section: 'Night' },
  { label: 'Morning wake-up', value: (d) => clock(d.morningWake) },
  { label: 'Bedtime (asleep)', value: (d) => clock(d.bedtime) },
  {
    label: 'Night wakings',
    value: (d) => (d.nightWakings
      ? <>{d.nightWakings}<small>{formatDuration(d.nightAwakeMinutes)} awake{d.nightFeeds ? ` · 🍼 ${d.nightFeeds}` : ''}</small></>
      : (d.bedtime ? '0' : '–')),
  },
  { label: 'Fell asleep on her own', value: (d) => (d.withMethod ? `${d.independent} of ${d.withMethod}` : '–') },
];

/** "Last 5 days" as a day-by-day table of actual numbers, newest day first. */
export default function RecentDaysTable({ days, title }) {
  const cols = [...days].reverse();
  return (
    <section className="card recent-days" aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p className="subtitle">The actual numbers for each day, newest first; an average only for total sleep. “–” means not logged.
          <span className="scroll-hint"> Swipe the table sideways to see all days →</span>
        </p>
      </div>
      <div className="recent-table-wrap">
        <table className="recent-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Measure</span></th>
              {cols.map((d) => (
                <th scope="col" key={d.day}>
                  {formatDay(d.day, { weekday: 'short' })}
                  <small>{formatDay(d.day, { day: 'numeric', month: 'short' })}</small>
                </th>
              ))}
              <th scope="col" className="avg-col">Average<small>{cols.length} days</small></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (row.section ? (
              <tr key={row.section} className="section-row"><th scope="rowgroup" colSpan={cols.length + 2}>{row.section}</th></tr>
            ) : (
              <tr key={row.label} className={row.strong ? 'strong' : ''}>
                <th scope="row">{row.label}</th>
                {cols.map((d) => <td key={d.day}>{row.value(d)}</td>)}
                <td className="avg-col">{row.avg ? dur(average(cols.map(row.avg))) : ''}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
