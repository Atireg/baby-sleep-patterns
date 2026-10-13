import { useMemo } from 'react';
import { formatDuration } from '../lib/sleepData.js';
import { baseLayout, rangeButtons, useChartTheme } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';
import { breakGaps, rollingMean } from '../lib/series.js';

const hours = (m) => +(m / 60).toFixed(2);

export default function DailyTotalsChart({ days }) {
  const t = useChartTheme();
  const { data, layout } = useMemo(() => {
    const x = days.map((d) => d.day);
    // 7-day rolling average of total sleep (calendar days), broken where days are missing.
    const avg = breakGaps(x, rollingMean(days, (d) => d.totalMinutes));
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
      }),
    };
  }, [days, t]);

  return (
    <PlotlyChart
      title="Sleep per day"
      subtitle="Night sleep and naps per day, with the 7-day average of total sleep. Drag to zoom, double-click to reset."
      data={data}
      layout={layout}
      height={360}
    />
  );
}
