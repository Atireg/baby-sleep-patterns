import { useMemo, useState } from 'react';
import { formatClock, formatDay, formatDuration } from '../lib/sleepData.js';
import { useWidth } from '../lib/useWidth.js';
import Legend, { SERIES } from './Legend.jsx';
import Tooltip from './Tooltip.jsx';
import { methodLabel, moodLabel } from '../lib/insights.js';

const M = { top: 24, right: 8, bottom: 8, left: 64 };
const MS_DAY = 24 * 60 * 60 * 1000;
const COLOR = Object.fromEntries(SERIES.map((s) => [s.key, s.color]));

const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const keyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Split sessions at midnight so each piece sits on its own calendar-day row. */
function toRows(sessions) {
  const first = midnight(sessions[0].start);
  const last = midnight(new Date(Math.max(...sessions.map((s) => s.end.getTime())) - 1));
  const rows = [];
  for (let d = first; d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    rows.push({ key: keyOf(d), start: d.getTime(), pieces: [] });
  }
  const index = new Map(rows.map((r, i) => [r.key, i]));
  for (const s of sessions) {
    let from = s.start.getTime();
    while (from < s.end.getTime()) {
      const dayStart = midnight(new Date(from)).getTime();
      const to = Math.min(s.end.getTime(), dayStart + MS_DAY);
      rows[index.get(keyOf(new Date(from)))].pieces.push({
        session: s,
        startFrac: (from - dayStart) / MS_DAY,
        endFrac: (to - dayStart) / MS_DAY,
      });
      from = to;
    }
  }
  return rows;
}

export default function SleepTimeline({ sessions }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const rows = useMemo(() => toRows(sessions), [sessions]);

  // Tighter rows for long logs so the chart stays scannable.
  const ROW = rows.length > 40 ? 12 : 18;
  const plotW = width - M.left - M.right;
  const height = M.top + rows.length * ROW + M.bottom;
  const hours = plotW < 480 ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];

  const show = (s, e) => {
    const box = ref.current.getBoundingClientRect();
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      title: `${s.type === 'night' ? 'Night sleep' : 'Nap'} · ${formatDay(s.day)}`,
      rows: [
        { label: 'From', value: formatClock(s.start) },
        { label: 'To', value: formatClock(s.end) },
        { label: 'Duration', value: formatDuration(s.minutes), color: COLOR[s.type] },
        ...(s.wakeWindow != null ? [{ label: 'Awake before', value: formatDuration(s.wakeWindow) }] : []),
        ...(s.settleMinutes != null ? [{ label: 'Took to fall asleep', value: formatDuration(s.settleMinutes) }] : []),
        ...(s.method ? [{ label: 'Fell asleep', value: methodLabel(s.method) === 'Other' ? s.method : methodLabel(s.method) }] : []),
        ...(s.mood ? [{ label: 'Mood after', value: moodLabel(s.mood) }] : []),
        ...(s.resettled ? [{ label: 'Re-settled', value: 'yes' }] : []),
        ...(s.notes ? [{ label: 'Notes', value: s.notes }] : []),
      ],
    });
  };

  return (
    <figure className="card">
      <figcaption>
        <h2>Sleep timeline</h2>
        <p className="subtitle">Each row is a calendar day, midnight to midnight</p>
      </figcaption>
      <Legend />
      <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
        <svg width={width} height={height} role="img" aria-label="Timeline of sleep sessions for each day">
          <g transform={`translate(${M.left},${M.top})`}>
            {hours.map((h) => (
              <g key={h} transform={`translate(${(h / 24) * plotW},0)`}>
                <line y2={rows.length * ROW} className="grid" />
                <text y={-8} className="tick" textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}>
                  {String(h % 24).padStart(2, '0')}:00
                </text>
              </g>
            ))}
            {rows.map((r, i) => (
              <g key={r.key} transform={`translate(0,${i * ROW})`}>
                {(ROW > 12 || i % 7 === 0) && (
                  <text x={-8} y={ROW / 2} dy="0.32em" className="tick" textAnchor="end">
                    {formatDay(r.key, { day: 'numeric', month: 'short' })}
                  </text>
                )}
                {r.pieces.map((p, j) => (
                  <rect
                    key={j}
                    x={p.startFrac * plotW + 1}
                    width={Math.max(2, (p.endFrac - p.startFrac) * plotW - 2)}
                    y={ROW > 12 ? 3 : 2}
                    height={ROW > 12 ? ROW - 6 : ROW - 4}
                    rx={3}
                    fill={COLOR[p.session.type]}
                    className="session"
                    onMouseMove={(e) => show(p.session, e)}
                  />
                ))}
              </g>
            ))}
          </g>
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </figure>
  );
}
