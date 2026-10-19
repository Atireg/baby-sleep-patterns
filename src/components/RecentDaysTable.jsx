import { formatDay, formatDuration } from '../lib/format.js';

const dur = (m) => (m == null ? '–' : formatDuration(m));

// One row per measure about the naps; each cell is one day's actual value (user request: naps only).
const ROWS = [
  { label: 'Naps', strong: true, value: (d) => (d.naps ? <>{d.naps}<small>{d.napLengths.map(formatDuration).join(' · ')}</small></> : '0') },
  { label: 'Nap time', value: (d) => dur(d.napMinutes) },
  { label: 'Naps extended', value: (d) => (d.napsAnswered ? `${d.extendedNaps} of ${d.napsAnswered}` : '–') },
  { label: 'Time to fall asleep', value: (d) => (d.napSettle.some((m) => m != null) ? d.napSettle.map(dur).join(' · ') : '–') },
  { label: 'Fell asleep on her own', value: (d) => (d.napsWithMethod ? `${d.napsIndependent} of ${d.napsWithMethod}` : '–') },
];

/** "Naps history": the naps of the last 5 days as a day-by-day table of actual numbers, newest day first. */
export default function RecentDaysTable({ days, title }) {
  const cols = [...days].reverse();
  return (
    <section className="card recent-days" aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p className="subtitle">The naps of the last {cols.length} days (excluding today), newest first. “–” means not logged.
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
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className={row.strong ? 'strong' : ''}>
                <th scope="row">{row.label}</th>
                {cols.map((d) => <td key={d.day}>{row.value(d)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
