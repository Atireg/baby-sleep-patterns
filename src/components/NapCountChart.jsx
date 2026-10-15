import { useMemo } from 'react';
import { formatDay } from '../lib/format.js';
import { napCountTrend } from '../lib/insights.js';
import { baseLayout, useChartTheme, withAlpha } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';
import { breakGaps, segments } from '../lib/series.js';

const short = (day) => formatDay(day, { day: 'numeric', month: 'short' });
const plural = (n) => `${n} nap${n === 1 ? '' : 's'}`;

/** Daily nap counts with the typical count as a filled step line and labelled transitions. */
export default function NapCountChart({ days }) {
  const t = useChartTheme();
  const { points, changes } = useMemo(() => napCountTrend(days), [days]);
  const summary = changes.length
    ? `${plural(points[0].typical)} → ${changes.map((c) => c.to).join(' → ')}`
    : `Steady at ${plural(points[0].typical)}`;

  const { data, layout } = useMemo(() => {
    const x = points.map((p) => p.day);
    const typical = breakGaps(x, points.map((p) => p.typical));
    const maxY = Math.max(3, ...points.map((p) => p.naps));
    return {
      data: [
        // One trace per run of consecutive days so the shaded area doesn't span gaps.
        ...segments(typical.x, typical.y).map((seg, i) => ({
          type: 'scatter', mode: 'lines', name: 'Typical (most common over 7 days)', x: seg.x, y: seg.y,
          legendgroup: 'typical', showlegend: i === 0,
          line: { color: t.nap, width: 3, shape: 'hv' }, fill: 'tozeroy', fillcolor: withAlpha(t.nap, 0.12),
          hovertemplate: 'Typical: %{y}<extra></extra>',
        })),
        {
          type: 'scatter', mode: 'markers', name: 'Naps that day', x, y: points.map((p) => p.naps),
          marker: {
            size: 9, color: points.map((p) => (p.naps === p.typical ? t.surface : t.text)),
            line: { color: t.text, width: 1.5 },
          },
          hovertemplate: 'That day: %{y}<extra></extra>',
        },
      ],
      layout: baseLayout(t, {
        xaxis: { type: 'date', hoverformat: '%a %-d %b' },
        yaxis: { title: { text: 'Naps' }, dtick: 1, range: [0, maxY + 0.8] },
        shapes: changes.map((c) => ({
          type: 'line', xref: 'x', yref: 'paper', x0: c.day, x1: c.day, y0: 0, y1: 1,
          line: { color: t.muted, width: 1, dash: 'dot' },
        })),
        annotations: changes.map((c) => ({
          x: c.day, y: c.to + 0.5, xref: 'x', yref: 'y', xanchor: 'left', yanchor: 'bottom',
          text: `<b>${c.from} → ${c.to} naps</b><br>${short(c.day)}`, showarrow: false,
          font: { color: t.text, size: 11 }, align: 'left',
          bgcolor: t.surface, bordercolor: t.grid, borderpad: 4,
        })),
      }),
    };
  }, [points, changes, t]);

  return (
    <PlotlyChart
      title="Number of naps"
      subtitle={summary}
      data={data}
      layout={layout}
      height={300}
      ariaLabel={`Number of naps per day: ${summary}`}
    />
  );
}
