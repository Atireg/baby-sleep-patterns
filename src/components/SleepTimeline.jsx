import { useMemo } from 'react';
import { formatDay, formatDuration, hhmm } from '../lib/format.js';
import { clockMinutesFrom, dateKey, minutesBetween, minutesToClock } from '../lib/time.js';
import { methodLabel, moodLabel } from '../lib/insights.js';
import { baseLayout, useChartTheme, withAlpha } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';

const nextMidnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/**
 * Split sessions at midnight so each piece sits on its own calendar-day row, placed by clock time
 * (hours 0–24, so the days the clocks change line up with the others).
 */
export function toPieces(sessions) {
  const pieces = [];
  for (const s of sessions) {
    let from = s.start;
    while (from < s.end) {
      const to = s.end < nextMidnight(from) ? s.end : nextMidnight(from);
      const row = dateKey(from);
      pieces.push({ session: s, row, from: clockMinutesFrom(row, from) / 60, to: clockMinutesFrom(row, to) / 60 });
      from = to;
    }
  }
  return pieces;
}

function hoverText(s) {
  const lines = [
    `<b>${s.type === 'night' ? 'Night sleep' : 'Nap'}</b> · ${formatDay(s.day)}`,
    `${hhmm(s.start)} – ${hhmm(s.end)} (${formatDuration(minutesBetween(s.start, s.end))})`,
  ];
  if (s.wakeWindow != null) lines.push(`Awake before: ${formatDuration(s.wakeWindow)}`);
  if (s.settleMinutes != null) lines.push(`Took to fall asleep: ${formatDuration(s.settleMinutes)}`);
  if (s.method) lines.push(`Fell asleep: ${methodLabel(s.method) === 'Other' ? s.method : methodLabel(s.method)}`);
  if (s.mood) lines.push(`Mood after: ${moodLabel(s.mood)}`);
  return lines.join('<br>');
}

/** dayKeys: the calendar days to show as rows (shown newest first). */

/** friends: suggested windows [{ from, to, days, of }] in minutes after midnight (see friendsWindows). */
export default function SleepTimeline({ sessions, dayKeys, friends = [] }) {
  const t = useChartTheme();
  // Fewer hour labels on phones so they don't overlap.
  const narrow = window.innerWidth < 600;
  const hourTicks = narrow ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const { data, layout, rows } = useMemo(() => {
    const rowKeys = [...dayKeys].sort().reverse();
    const shown = new Set(rowKeys);
    const pieces = toPieces(sessions).filter((p) => shown.has(p.row));
    const label = (k) => formatDay(k, { weekday: 'short', day: 'numeric', month: 'short' });
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
        // Good times to meet friends: shaded columns across all rows.
        shapes: friends.map((w) => ({
          type: 'rect', xref: 'x', yref: 'paper', layer: 'below', x0: w.from / 60, x1: w.to / 60, y0: 0, y1: 1,
          fillcolor: withAlpha(t.s3, 0.16), line: { color: withAlpha(t.s3, 0.6), width: 1, dash: 'dot' },
        })),
        annotations: friends.map((w) => ({
          xref: 'x', yref: 'paper', x: (w.from + w.to) / 120, y: 0, yanchor: 'top', yshift: -4, showarrow: false,
          // Phones: just the 👋 (the times are in the subtitle; side by side they'd overlap).
          text: narrow ? '👋' : `👋 ${minutesToClock(w.from)}–${minutesToClock(w.to)}`, font: { size: 11, color: t.text },
        })),
        xaxis: {
          range: [0, 24], tickvals: hourTicks, ticktext: hourTicks.map((h) => minutesToClock(h * 60)),
          showgrid: true, side: 'top', fixedrange: true,
        },
        yaxis: {
          type: 'category', categoryorder: 'array', categoryarray: rowKeys.map(label),
          autorange: 'reversed', showgrid: false, rangemode: 'normal',
        },
        // Below the 👋 labels of the friends bands (about 22px, as a share of the rows' height).
        legend: { orientation: 'h', x: 0, y: friends.length ? -22 / (rowKeys.length * 44) : -0.02, yanchor: 'top' },
      }),
    };
  }, [sessions, dayKeys, friends, t, narrow]);

  return (
    <PlotlyChart
      title="Sleep timeline"
      subtitle={<>
        Last 5 days (excluding today), newest first. Each row is a calendar day, midnight to midnight; hover a bar for details.
        <span className="friends-tip">
          {friends.length
            ? <>👋 <strong>Good time to meet friends:</strong> {friends.map((w) => `${minutesToClock(w.from)}–${minutesToClock(w.to)}`).join(' or ')}
              {' '}— she was awake and not due for a nap {friends[0].days === friends[0].of ? `on all ${friends[0].of} days` : `on ${friends[0].days} of ${friends[0].of} days`} (green band).</>
            : '👋 No reliable awake stretch of an hour or more in the last few days — try right after a nap.'}
        </span>
      </>}
      data={data}
      layout={layout}
      height={110 + rows * 44}
    />
  );
}
