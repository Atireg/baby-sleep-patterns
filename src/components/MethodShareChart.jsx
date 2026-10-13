import { useMemo } from 'react';
import { baseLayout, useChartTheme } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';

// Fixed entity -> color mapping, stacked in categorical slot order.
const METHOD_SERIES = [
  { key: 'Held in arms', color: 's1' },
  { key: 'Patting', color: 's2' },
  { key: 'Independently', color: 's3' },
  { key: 'Nursing', color: 's4' },
  { key: 'Other', color: 'other' },
];

export default function MethodShareChart({ weeks }) {
  const t = useChartTheme();
  const { data, layout } = useMemo(() => {
    const x = weeks.map((w) => w.key);
    const totals = weeks.map((w) => Object.values(w.counts).reduce((a, b) => a + b, 0));
    return {
      data: METHOD_SERIES.filter((s) => weeks.some((w) => w.counts[s.key])).map((s) => ({
        type: 'bar', name: s.key, x,
        y: weeks.map((w, i) => (totals[i] ? (100 * (w.counts[s.key] ?? 0)) / totals[i] : 0)),
        customdata: weeks.map((w) => w.counts[s.key] ?? 0),
        marker: { color: t[s.color], line: { color: t.surface, width: 1 } },
        hovertemplate: `${s.key}: %{y:.0f}% (%{customdata})<extra></extra>`,
      })),
      layout: baseLayout(t, {
        barmode: 'stack',
        bargap: 0.25,
        xaxis: { type: 'date', hoverformat: 'Week of %-d %b', tickformat: '%-d %b' },
        yaxis: { ticksuffix: '%', range: [0, 100], dtick: 25 },
      }),
    };
  }, [weeks, t]);

  return (
    <PlotlyChart
      title="How she fell asleep"
      subtitle="Share of naps and bedtimes by settling method, per week"
      data={data}
      layout={layout}
    />
  );
}
