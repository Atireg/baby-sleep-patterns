import { useMemo, useState } from 'react';
import { formatDay } from '../lib/sleepData.js';
import { napCountTrend } from '../lib/insights.js';
import { useWidth } from '../lib/useWidth.js';
import Tooltip from './Tooltip.jsx';

const HEIGHT = 240;
const M = { top: 28, right: 12, bottom: 28, left: 36 };
const short = (day) => formatDay(day, { day: 'numeric', month: 'short' });
const plural = (n) => `${n} nap${n === 1 ? '' : 's'}`;

/** Daily nap counts (dots) with the typical count as a step line and labelled transitions. */
export default function NapCountChart({ days }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const { points, changes } = useMemo(() => napCountTrend(days), [days]);

  const maxY = Math.max(3, ...points.map((p) => p.naps));
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const step = plotW / points.length;
  const x = (i) => step * i + step / 2;
  const y = (v) => plotH - (v / maxY) * plotH;
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56)));
  const index = new Map(points.map((p, i) => [p.day, i]));

  // Step line: horizontal at each day's typical count, vertical where it changes.
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${i ? x(i) - step / 2 : 0},${y(p.typical)}H${i === points.length - 1 ? plotW : x(i) + step / 2}`)
    .join('');

  const summary = changes.length
    ? `${plural(points[0].typical)} → ${changes.map((c) => c.to).join(' → ')}`
    : `Steady at ${plural(points[0].typical)}`;

  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const i = Math.max(0, Math.min(points.length - 1, Math.floor((e.clientX - box.left - M.left) / step)));
    setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const p = hover && points[hover.i];
  const tip = p && {
    x: hover.x,
    y: hover.y,
    title: formatDay(p.day),
    rows: [
      { label: 'Naps that day', value: String(p.naps) },
      { label: 'Typical that week', value: String(p.typical), color: 'var(--series-2)' },
    ],
  };

  return (
    <figure className="card">
      <figcaption>
        <h2>Number of naps</h2>
        <p className="subtitle">{summary}</p>
      </figcaption>
      <ul className="legend">
        <li><span className="swatch dot" style={{ background: 'var(--text-muted)' }} />Naps that day</li>
        <li><span className="swatch line" style={{ background: 'var(--series-2)' }} />Typical (most common over 7 days)</li>
      </ul>
      <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={`Number of naps per day: ${summary}`}>
          <g transform={`translate(${M.left},${M.top})`}>
            {Array.from({ length: maxY + 1 }, (_, n) => (
              <g key={n} transform={`translate(0,${y(n)})`}>
                <line x2={plotW} className={n === 0 ? 'baseline' : 'grid'} />
                <text x={-8} dy="0.32em" className="tick" textAnchor="end">{n}</text>
              </g>
            ))}
            {points.map((pt, i) => i % labelEvery === 0 && (
              <text key={pt.day} x={x(i)} y={plotH + 18} className="tick" textAnchor="middle">{short(pt.day)}</text>
            ))}
            {changes.map((c) => {
              const cx = x(index.get(c.day)) - step / 2;
              return (
                <g key={c.day} transform={`translate(${cx},0)`}>
                  <line y1={-6} y2={plotH} className="annotation-line" />
                  <text y={-12} className="annotation" textAnchor={cx > plotW - 80 ? 'end' : 'middle'}>
                    {c.from} → {c.to} · {short(c.day)}
                  </text>
                </g>
              );
            })}
            <path d={path} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
            {points.map((pt, i) => (
              <circle
                key={pt.day}
                cx={x(i)}
                cy={y(pt.naps)}
                r={hover?.i === i ? 5 : 3}
                className={`nap-dot ${pt.naps !== pt.typical ? 'off-trend' : ''}`}
              />
            ))}
            <rect width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} />
          </g>
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </figure>
  );
}
