import { useMemo } from 'react';
import { nightBefore, upcomingWakeWindow, wakeWindowGrid } from '../lib/insights.js';
import { formatDay, formatDuration, ordinal } from '../lib/format.js';
import { mean } from '../lib/time.js';

/**
 * Actual wake windows before each nap / bedtime on the last 5 days (newest first),
 * with today's upcoming nap or bedtime highlighted as "next". The first row is the night before
 * each day: hours asleep, plus any night wakings that weren't feeds. The last rows are the day's totals:
 * awake during the day and total sleep (from `dayDetails`), with their average under the label.
 */
export default function WakeWindowsCard({ sessions, dayKeys, details = [] }) {
  const keys = useMemo(() => [...dayKeys].reverse(), [dayKeys]);
  const rows = useMemo(() => wakeWindowGrid(sessions, keys), [sessions, keys]);
  const nextKey = useMemo(() => upcomingWakeWindow(sessions)?.target ?? null, [sessions]);
  const nights = useMemo(() => keys.map((d) => nightBefore(sessions, d)), [sessions, keys]);
  const byDay = useMemo(() => new Map(details.map((d) => [d.day, d])), [details]);
  const totals = [
    { label: 'Awake during the day', value: (d) => d?.awakeMinutes },
    { label: 'Total sleep', value: (d) => d?.totalMinutes },
  ].map((row) => {
    const values = keys.map((k) => row.value(byDay.get(k)) ?? null);
    return { ...row, values, avg: mean(values.filter((v) => v != null)) };
  });
  if (!rows.length) return null;
  return (
    <section className="card ww-card" aria-label="Wake and sleep windows">
      <div>
        <h2>⏱ Wake and sleep windows</h2>
        <p className="subtitle">Sleep the night before, awake time before each nap and bedtime, then the day's totals, on the last {keys.length} days (newest first).</p>
      </div>
      <div className="recent-table-wrap">
        <table className="recent-table compact">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Before</span></th>
              {keys.map((d) => (
                <th scope="col" key={d}>{formatDay(d, { weekday: 'short' })}<small>{formatDay(d, { day: 'numeric', month: 'short' })}</small></th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="night-before-row">
              <th scope="row">Night before</th>
              {nights.map((n, i) => (
                <td key={keys[i]}>
                  {n ? formatDuration(n.minutes) : '–'}
                  {n?.wakings > 0 && <small>{n.wakings}× awake, {formatDuration(n.awakeMinutes)}</small>}
                </td>
              ))}
            </tr>
            {rows.map((row) => (
              <tr key={row.key} className={row.key === nextKey ? 'next-row' : ''}>
                <th scope="row">{row.key === 'bedtime' ? 'Bedtime' : `${ordinal(row.key)} nap`}{row.key === nextKey && <small>next</small>}</th>
                {row.values.map((v, i) => <td key={keys[i]}>{v == null ? '–' : formatDuration(v)}</td>)}
              </tr>
            ))}
            {totals.map((row, n) => (
              <tr key={row.label} className={`day-total-row ${n === 0 ? 'first' : ''}`}>
                <th scope="row">{row.label}{row.avg != null && <small>avg {formatDuration(row.avg)}</small>}</th>
                {row.values.map((v, i) => <td key={keys[i]}>{v == null ? '–' : formatDuration(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
