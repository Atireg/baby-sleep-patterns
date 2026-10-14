import { useMemo } from 'react';
import { formatDay, formatDuration } from '../lib/sleepData.js';
import { baseLayout, rangeButtons, useChartTheme } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';
import { breakGaps, rollingMean } from '../lib/series.js';

const hours = (m) => +(m / 60).toFixed(2);
// 'YYYY-MM-DD' shifted by a fraction of a day, as a Plotly date string (for shading around bars).
const shiftDay = (day, offset) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d, 12).getTime() + offset * 864e5 - 12 * 36e5;
  const x = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

/** recent: { avgMinutes, from, to } — average total sleep over the last 5 days before today (optional). */
export default function DailyTotalsChart({ days, recent }) {
  const t = useChartTheme();
  const { data, layout } = useMemo(() => {
    const x = days.map((d) => d.day);
    // 7-day rolling average of total sleep (calendar days), broken where days are missing.
    // Today is still in progress, so it isn't part of the rolling average.
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const avg = breakGaps(x, rollingMean(days, (d) => d.totalMinutes).map((v, i) => (days[i].day === todayKey ? null : v)));
    const bar = (key, name, color) => ({
      type: 'bar', name, x, y: days.map((d) => hours(d[key])),
      customdata: days.map((d) => formatDuration(d[key])),
      marker: { color, line: { width: 0 } },
      hovertemplate: `${name}: %{customdata}<extra></extra>`,
    });
    return {
      data: [
        bar('nightMinutes', 'Night sleep', t.night),
        bar('napMinutes', 'Naps', t.nap),
        {
          type: 'scatter', mode: 'lines', name: '7-day average (total)', x: avg.x, y: avg.y.map((v) => (v == null ? null : hours(v))),
          customdata: avg.y.map((v) => (v == null ? '' : formatDuration(v))), connectgaps: false,
          line: { color: t.text, width: 2, shape: 'spline', smoothing: 0.8, dash: 'dot' },
          hovertemplate: 'Total, 7-day avg: %{customdata}<extra></extra>',
        },
      ],
      layout: baseLayout(t, {
        barmode: 'stack',
        bargap: 0.2,
        xaxis: { type: 'date', rangeselector: rangeButtons(t), hoverformat: '%a %-d %b' },
        yaxis: { title: { text: 'Hours' }, ticksuffix: 'h' },
        ...(recent ? {
          // Shade the 5 days that the average covers and draw the average across the chart.
          shapes: [
            {
              type: 'rect', xref: 'x', yref: 'paper', layer: 'below', line: { width: 0 }, fillcolor: t.grid, opacity: 0.6,
              x0: shiftDay(recent.from, -0.5), x1: shiftDay(recent.to, 0.5), y0: 0, y1: 1,
            },
            {
              type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: hours(recent.avgMinutes), y1: hours(recent.avgMinutes),
              line: { color: t.night, width: 2, dash: 'dash' },
            },
          ],
          annotations: [{
            xref: 'paper', yref: 'y', x: 0, y: hours(recent.avgMinutes), xanchor: 'left', yanchor: 'bottom', showarrow: false,
            text: `<b>5-day avg ${formatDuration(recent.avgMinutes)}</b>`, font: { color: t.text, size: 11 },
            bgcolor: t.surface, borderpad: 3,
          }],
        } : {}),
      }),
    };
  }, [days, recent, t]);

  return (
    <PlotlyChart
      title="Sleep per day"
      subtitle={recent
        ? `Average over the last 5 days (${formatDay(recent.from, { day: 'numeric', month: 'short' })} – ${formatDay(recent.to, { day: 'numeric', month: 'short' })}, excluding today): ${formatDuration(recent.avgMinutes)} of sleep a day (dashed line, shaded days). Drag to zoom, double-click to reset.`
        : 'Night sleep and naps per day, with the 7-day average of total sleep. Drag to zoom, double-click to reset.'}
      data={data}
      layout={layout}
      height={360}
    />
  );
}
