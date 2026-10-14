import { useMemo } from 'react';
import { upcomingWakeWindow, wakeWindowGrid } from '../lib/insights.js';
import { formatDay, formatDuration } from '../lib/sleepData.js';

const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/**
 * Actual wake windows before each nap / bedtime on the last 5 days (newest first),
 * with today's upcoming nap or bedtime highlighted as "next".
 */
export default function WakeWindowsCard({ sessions, dayKeys }) {
  const keys = useMemo(() => [...dayKeys].reverse(), [dayKeys]);
  const rows = useMemo(() => wakeWindowGrid(sessions, keys), [sessions, keys]);
  const nextKey = useMemo(() => upcomingWakeWindow(sessions)?.target ?? null, [sessions]);
  if (!rows.length) return null;
  return (
    <section className="card ww-card" aria-label="Wake windows">
      <div>
        <h2>⏱ Wake windows</h2>
        <p className="subtitle">Awake time before each nap and bedtime on the last {keys.length} days (newest first).</p>
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
