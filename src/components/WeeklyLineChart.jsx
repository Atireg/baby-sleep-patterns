import { useState } from 'react';
import { formatDay } from '../lib/sleepData.js';
import { useWidth } from '../lib/useWidth.js';
import Tooltip from './Tooltip.jsx';

const HEIGHT = 240;
const M = { top: 12, right: 104, bottom: 28, left: 48 };

/** Line chart over weeks. rows: [{ key: 'YYYY-MM-DD' (Monday), values: { [seriesKey]: number|null } }] */
export default function WeeklyLineChart({ title, subtitle, rows, series, format, step = 30 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const all = rows.flatMap((r) => series.map((s) => r.values[s.key])).filter((v) => v != null);
  const maxY = Math.max(step, Math.ceil(Math.max(...all) / step) * step);
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (i) => (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const y = (v) => plotH - (v / maxY) * plotH;
  const tickCount = Math.min(6, maxY / step);
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxY / tickCount) * i));
  const labelEvery = Math.ceil(rows.length / Math.max(1, Math.floor(plotW / 64)));

  // Direct labels at the last value of each line, nudged apart so they don't collide.
  const ends = series
    .map((s) => {
      const i = rows.findLastIndex((r) => r.values[s.key] != null);
      return i < 0 ? null : { ...s, y: y(rows[i].values[s.key]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13; });

  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const px = e.clientX - box.left - M.left;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round((px / plotW) * (rows.length - 1))));
    setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const tip = hover && {
    x: hover.x,
    y: hover.y,
    title: `Week of ${formatDay(rows[hover.i].key)}`,
    rows: series.map((s) => ({
      label: s.label,
      value: rows[hover.i].values[s.key] == null ? '–' : format(rows[hover.i].values[s.key]),
      color: s.color,
    })),
  };

  return (
    <figure className="card">
      <figcaption>
        <h2>{title}</h2>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </figcaption>
      <ul className="legend">
        {series.map((s) => (
          <li key={s.key}><span className="swatch" style={{ background: s.color }} />{s.label}</li>
        ))}
      </ul>
      <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={title}>
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={plotW} className={t === 0 ? 'baseline' : 'grid'} />
                <text x={-8} dy="0.32em" className="tick" textAnchor="end">{format(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => i % labelEvery === 0 && (
              <text key={r.key} x={x(i)} y={plotH + 18} className="tick" textAnchor="middle">
                {formatDay(r.key, { day: 'numeric', month: 'short' })}
              </text>
            ))}
            {hover && <line x1={x(hover.i)} x2={x(hover.i)} y2={plotH} className="crosshair" />}
            {series.map((s) => {
              // Break the line where a week has no value.
              const segments = [];
              let current = [];
              rows.forEach((r, i) => {
                const v = r.values[s.key];
                if (v == null) { if (current.length) segments.push(current); current = []; }
                else current.push(`${x(i)},${y(v)}`);
              });
              if (current.length) segments.push(current);
              return (
                <g key={s.key}>
                  {segments.map((pts, j) => (
                    <polyline key={j} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
                  ))}
                  {hover && rows[hover.i].values[s.key] != null && (
                    <circle cx={x(hover.i)} cy={y(rows[hover.i].values[s.key])} r={4} fill={s.color} className="marker" />
                  )}
                </g>
              );
            })}
            {ends.map((e) => (
              <g key={e.key} transform={`translate(${plotW + 8},${e.y})`}>
                <circle r={3} fill={e.color} />
                <text x={8} dy="0.32em" className="direct-label">{e.label}</text>
              </g>
            ))}
            <rect width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} />
          </g>
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </figure>
  );
}
