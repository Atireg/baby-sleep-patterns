import { useMemo } from 'react';
import { formatDuration } from '../lib/format.js';
import { baseLayout, durationAxis, useChartTheme, withAlpha } from '../lib/theme.js';
import PlotlyChart from './PlotlyChart.jsx';
import { segments } from '../lib/series.js';

/**
 * Smooth weekly line chart in minutes.
 * rows: [{ key: Monday 'YYYY-MM-DD', values: { [seriesKey]: number|null } }]
 * series: [{ key, label, color: theme key (e.g. 's1') }]
 */
export default function WeeklyLineChart({ title, subtitle, rows, series, step = 30, area = false, height = 320 }) {
  const t = useChartTheme();
  const { data, layout } = useMemo(() => {
    const x = rows.map((r) => r.key);
    const max = Math.max(...rows.flatMap((r) => series.map((s) => r.values[s.key] ?? 0)));
    return {
      data: series.flatMap((s) => {
        const y = rows.map((r) => (r.values[s.key] == null ? null : Math.round(r.values[s.key])));
        const line = {
          type: 'scatter', mode: 'lines+markers', name: s.label, x, y,
          customdata: y.map((v) => (v == null ? '–' : formatDuration(v))),
          line: { color: t[s.color], width: 3, shape: 'spline', smoothing: 0.9 },
          marker: { size: 7, color: t[s.color], line: { color: t.surface, width: 1.5 } },
          connectgaps: false,
          legendgroup: s.key,
          hovertemplate: `${s.label}: %{customdata}<extra></extra>`,
        };
        if (!area) return [line];
        // Shaded area drawn per run of weeks with data, so it doesn't span gaps.
        const fills = segments(x, y).map((seg) => ({
          type: 'scatter', mode: 'lines', x: seg.x, y: seg.y, legendgroup: s.key, showlegend: false, hoverinfo: 'skip',
          line: { width: 0, shape: 'spline', smoothing: 0.9 }, fill: 'tozeroy', fillcolor: withAlpha(t[s.color], 0.1),
        }));
        return [...fills, line];
      }),
      layout: baseLayout(t, {
        xaxis: { type: 'date', hoverformat: 'Week of %-d %b', dtick: 7 * 24 * 3600 * 1000 * (rows.length > 10 ? 2 : 1), tickformat: '%-d %b' },
        yaxis: durationAxis(max, step),
      }),
    };
  }, [rows, series, step, area, t]);

  return <PlotlyChart title={title} subtitle={subtitle} data={data} layout={layout} height={height} />;
}
