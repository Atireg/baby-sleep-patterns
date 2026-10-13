import { useMemo } from 'react';
import { formatClock, formatDay, formatDuration } from '../lib/sleepData.js';
import { methodLabel, moodLabel } from '../lib/insights.js';
import { baseLayout, useChartTheme } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';

const MS_DAY = 24 * 60 * 60 * 1000;
const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const keyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Split sessions at midnight so each piece sits on its own calendar-day row (hours 0–24). */
export function toPieces(sessions) {
  const pieces = [];
  for (const s of sessions) {
    let from = s.start.getTime();
    while (from < s.end.getTime()) {
      const dayStart = midnight(new Date(from)).getTime();
      const to = Math.min(s.end.getTime(), dayStart + MS_DAY);
      pieces.push({ session: s, row: keyOf(new Date(from)), from: (from - dayStart) / 3.6e6, to: (to - dayStart) / 3.6e6 });
      from = to;
    }
  }
  return pieces;
}

function hoverText(s) {
  const lines = [
    `<b>${s.type === 'night' ? 'Night sleep' : 'Nap'}</b> · ${formatDay(s.day)}`,
    `${formatClock(s.start)} – ${formatClock(s.end)} (${formatDuration(s.minutes)})`,
  ];
  if (s.wakeWindow != null) lines.push(`Awake before: ${formatDuration(s.wakeWindow)}`);
  if (s.settleMinutes != null) lines.push(`Took to fall asleep: ${formatDuration(s.settleMinutes)}`);
  if (s.method) lines.push(`Fell asleep: ${methodLabel(s.method) === 'Other' ? s.method : methodLabel(s.method)}`);
  if (s.mood) lines.push(`Mood after: ${moodLabel(s.mood)}`);
  return lines.join('<br>');
}

export default function SleepTimeline({ sessions }) {
  const t = useChartTheme();
  // Fewer hour labels on phones so they don't overlap.
  const hourTicks = window.innerWidth < 600 ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const { data, layout, rows } = useMemo(() => {
    const pieces = toPieces(sessions);
    // One row per calendar day from the first entry up to today (empty days included), newest first.
    const todayKey = keyOf(new Date());
    const first = [...pieces.map((p) => p.row)].sort()[0];
    const last = [...pieces.map((p) => p.row), todayKey].sort().at(-1);
    const rowKeys = [];
    for (let d = new Date(`${first}T00:00`); keyOf(d) <= last; d.setDate(d.getDate() + 1)) rowKeys.push(keyOf(d));
    rowKeys.reverse();
    const label = (k) => (k === todayKey ? 'Today' : formatDay(k, { weekday: 'short', day: 'numeric', month: 'short' }));
    const trace = (type, name, color) => {
      const list = pieces.filter((p) => p.session.type === type);
      return {
        type: 'bar', orientation: 'h', name,
        y: list.map((p) => label(p.row)), base: list.map((p) => p.from), x: list.map((p) => p.to - p.from),
        text: list.map((p) => hoverText(p.session)), hovertemplate: '%{text}<extra></extra>', textposition: 'none',
        marker: { color, line: { width: 0 }, cornerradius: 3 },
      };
    };
    return {
      rows: rowKeys.length,
      data: [
        // Invisible bars so every day (including empty ones) gets a row.
        { type: 'bar', orientation: 'h', y: rowKeys.map(label), x: rowKeys.map(() => 0), showlegend: false, hoverinfo: 'skip', marker: { color: 'rgba(0,0,0,0)' } },
        trace('night', 'Night sleep', t.night),
        trace('nap', 'Naps', t.nap),
      ],
      layout: baseLayout(t, {
        barmode: 'overlay',
        bargap: 0.25,
        hovermode: 'closest',
        xaxis: {
          range: [0, 24], tickvals: hourTicks, ticktext: hourTicks.map((h) => `${String(h).padStart(2, '0')}:00`),
          showgrid: true, side: 'top', fixedrange: true,
        },
        yaxis: {
          type: 'category', categoryorder: 'array', categoryarray: rowKeys.map(label),
          autorange: 'reversed', showgrid: false, rangemode: 'normal',
        },
        legend: { orientation: 'h', x: 0, y: -0.02, yanchor: 'top' },
      }),
    };
  }, [sessions, t, hourTicks.length]);

  return (
    <PlotlyChart
      title="Sleep timeline"
      subtitle="Newest first: each row is a calendar day, midnight to midnight. Hover a bar for details; drag up/down to zoom into dates."
      data={data}
      layout={layout}
      height={Math.min(2400, 90 + rows * 16)}
    />
  );
}
