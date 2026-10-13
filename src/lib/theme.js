import { useEffect, useState } from 'react';

const TOKENS = {
  surface: '--surface-1',
  text: '--text-primary',
  textSecondary: '--text-secondary',
  muted: '--text-muted',
  grid: '--grid',
  baseline: '--baseline',
  border: '--border',
  night: '--series-1',
  nap: '--series-2',
  s1: '--series-1',
  s2: '--series-2',
  s3: '--series-3',
  s4: '--series-4',
  other: '--series-other',
};

function readTheme() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, css.getPropertyValue(v).trim()]));
}

/** Resolved CSS color tokens for Plotly; updates when the OS light/dark setting changes. */
export function useChartTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setTheme(readTheme());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return theme;
}

/** "#2a78d6" -> "rgba(42,120,214,a)" for translucent fills. */
export function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Shared Plotly layout so every chart looks like one system. */
export function baseLayout(t, overrides = {}) {
  const axis = {
    gridcolor: t.grid,
    linecolor: t.baseline,
    zeroline: false,
    tickfont: { color: t.muted, size: 11 },
    title: { font: { color: t.textSecondary, size: 12 } },
    automargin: true,
  };
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 12, color: t.textSecondary },
    margin: { l: 8, r: 8, t: 8, b: 8 },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: t.surface, bordercolor: t.grid, font: { color: t.text, size: 12 } },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', traceorder: 'normal', font: { color: t.textSecondary }, bgcolor: 'rgba(0,0,0,0)' },
    barcornerradius: 4,
    xaxis: { ...axis, showgrid: false, showline: true },
    yaxis: { ...axis, rangemode: 'tozero' },
    bargap: 0.3,
    ...overrides,
    ...(overrides.xaxis ? { xaxis: { ...axis, showgrid: false, showline: true, ...overrides.xaxis } } : {}),
    ...(overrides.yaxis ? { yaxis: { ...axis, rangemode: 'tozero', ...overrides.yaxis } } : {}),
  };
}

/** Y axis in minutes with "1h 30m"-style tick labels. */
export function durationAxis(maxMinutes, step = 30) {
  const top = Math.max(step, Math.ceil(maxMinutes / step) * step);
  const every = top / step > 8 ? step * Math.ceil(top / step / 8) : step;
  const vals = [];
  for (let v = 0; v <= top; v += every) vals.push(v);
  const label = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
  return { tickvals: vals, ticktext: vals.map(label), range: [0, top * 1.05] };
}

/** Date-range buttons for long daily charts. */
export const rangeButtons = (t) => ({
  buttons: [
    { count: 14, label: '2w', step: 'day', stepmode: 'backward' },
    { count: 1, label: '1m', step: 'month', stepmode: 'backward' },
    { step: 'all', label: 'All' },
  ],
  x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom',
  bgcolor: 'rgba(0,0,0,0)', activecolor: t.grid, bordercolor: t.grid, borderwidth: 1,
  font: { color: t.textSecondary, size: 11 },
});
