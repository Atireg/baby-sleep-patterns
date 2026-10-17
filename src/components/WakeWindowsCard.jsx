import { useMemo } from 'react';
import { nightBefore, upcomingWakeWindow, wakeWindowGrid } from '../lib/insights.js';
import { formatDay, formatDuration, ordinal } from '../lib/format.js';

/**
 * Actual wake windows before each nap / bedtime on the last 5 days (newest first),
 * with today's upcoming nap or bedtime highlighted as "next". The first row is the night before
 * each day: hours asleep, plus any night wakings that weren't feeds.
 */
export default function WakeWindowsCard({ sessions, dayKeys }) {
  const keys = useMemo(() => [...dayKeys].reverse(), [dayKeys]);
  const rows = useMemo(() => wakeWindowGrid(sessions, keys), [sessions, keys]);
  const nextKey = useMemo(() => upcomingWakeWindow(sessions)?.target ?? null, [sessions]);
  const nights = useMemo(() => keys.map((d) => nightBefore(sessions, d)), [sessions, keys]);
  if (!rows.length) return null;
  return (
    <section className="card ww-card" aria-label="Wake windows">
      <div>
        <h2>⏱ Wake windows</h2>
        <p className="subtitle">Sleep the night before, then awake time before each nap and bedtime, on the last {keys.length} days (newest first).</p>
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
          </tbody>
        </table>
      </div>
    </section>
  );
}
