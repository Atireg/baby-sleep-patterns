import { useState } from 'react';
import { formatDay } from '../lib/sleepData.js';
import { useWidth } from '../lib/useWidth.js';
import Tooltip from './Tooltip.jsx';

// Fixed entity -> color mapping, stacked in categorical slot order.
export const METHOD_SERIES = [
  { key: 'Held in arms', color: 'var(--series-1)' },
  { key: 'Patting', color: 'var(--series-2)' },
  { key: 'Independently', color: 'var(--series-3)' },
  { key: 'Nursing', color: 'var(--series-4)' },
  { key: 'Other', color: 'var(--series-other)' },
];

const HEIGHT = 240;
const M = { top: 12, right: 8, bottom: 28, left: 44 };
const GAP = 2;

export default function MethodShareChart({ weeks }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const step = plotW / weeks.length;
  const barW = Math.min(36, step * 0.7);
  const labelEvery = Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 64)));
  const present = METHOD_SERIES.filter((s) => weeks.some((w) => w.counts[s.key]));

  const show = (w, e) => {
    const total = Object.values(w.counts).reduce((a, b) => a + b, 0);
    const box = ref.current.getBoundingClientRect();
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      title: `Week of ${formatDay(w.key)}`,
      rows: total
        ? present.filter((s) => w.counts[s.key]).map((s) => ({
            label: s.key,
            value: `${Math.round((w.counts[s.key] / total) * 100)}% (${w.counts[s.key]})`,
            color: s.color,
          }))
        : [{ label: 'Not recorded', value: '' }],
    });
  };

  return (
    <figure className="card">
      <figcaption>
        <h2>How she fell asleep</h2>
        <p className="subtitle">Share of naps and bedtimes by settling method, per week</p>
      </figcaption>
      <ul className="legend">
        {present.map((s) => (
          <li key={s.key}><span className="swatch" style={{ background: s.color }} />{s.key}</li>
        ))}
      </ul>
      <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label="Stacked bars of settling methods per week">
          <g transform={`translate(${M.left},${M.top})`}>
            {[0, 25, 50, 75, 100].map((t) => (
              <g key={t} transform={`translate(0,${plotH - (t / 100) * plotH})`}>
                <line x2={plotW} className={t === 0 ? 'baseline' : 'grid'} />
                <text x={-8} dy="0.32em" className="tick" textAnchor="end">{t}%</text>
              </g>
            ))}
            {weeks.map((w, i) => {
              const total = Object.values(w.counts).reduce((a, b) => a + b, 0);
              const cx = step * i + step / 2;
              let top = plotH;
              return (
                <g key={w.key}>
                  {total > 0 && present.map((s) => {
                    const h = ((w.counts[s.key] ?? 0) / total) * plotH;
                    if (!h) return null;
                    top -= h;
                    return <rect key={s.key} x={cx - barW / 2} y={top} width={barW} height={Math.max(1, h - GAP)} fill={s.color} />;
                  })}
                  {total === 0 && <text x={cx} y={plotH - 6} className="tick" textAnchor="middle">–</text>}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={plotH + 18} className="tick" textAnchor="middle">
                      {formatDay(w.key, { day: 'numeric', month: 'short' })}
                    </text>
                  )}
                  <rect x={step * i} width={step} height={plotH} fill="transparent" onMouseMove={(e) => show(w, e)} />
                </g>
              );
            })}
          </g>
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </figure>
  );
}
