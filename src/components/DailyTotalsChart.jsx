import { useState } from 'react';
import { formatDay, formatDuration } from '../lib/sleepData.js';
import { useWidth } from '../lib/useWidth.js';
import Legend, { SERIES } from './Legend.jsx';
import Tooltip from './Tooltip.jsx';

const HEIGHT = 260;
const M = { top: 12, right: 8, bottom: 28, left: 36 };
const GAP = 2; // surface gap between stacked segments

// Path for a bar whose top corners are rounded (data end) and bottom is square (baseline).
function topRoundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export default function DailyTotalsChart({ days }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const [hover, setHover] = useState(null);

  const maxHours = Math.max(2, Math.ceil(Math.max(...days.map((d) => d.totalMinutes)) / 60 / 2) * 2);
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const step = plotW / days.length;
  const barW = Math.max(4, Math.min(28, step * 0.6));
  const y = (min) => (min / 60 / maxHours) * plotH;
  const ticks = Array.from({ length: maxHours / 2 + 1 }, (_, i) => i * 2);
  const labelEvery = Math.ceil(days.length / Math.max(1, Math.floor(plotW / 56)));

  const show = (d, i, e) => {
    const box = ref.current.getBoundingClientRect();
    setHover(i);
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      title: formatDay(d.day),
      rows: [
        { label: 'Night', value: formatDuration(d.nightMinutes), color: SERIES[0].color },
        { label: `Naps (${d.naps})`, value: formatDuration(d.napMinutes), color: SERIES[1].color },
        { label: 'Total', value: formatDuration(d.totalMinutes) },
      ],
    });
  };

  return (
    <figure className="card">
      <figcaption>
        <h2>Sleep per day</h2>
        <p className="subtitle">Hours of night sleep and naps, by day</p>
      </figcaption>
      <Legend />
      <div className="chart" ref={ref} onMouseLeave={() => { setTip(null); setHover(null); }}>
        <svg width={width} height={HEIGHT} role="img" aria-label="Stacked bar chart of night and nap hours per day">
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${plotH - y(t * 60)})`}>
                <line x2={plotW} className={t === 0 ? 'baseline' : 'grid'} />
                <text x={-8} dy="0.32em" className="tick" textAnchor="end">{t}h</text>
              </g>
            ))}
            {days.map((d, i) => {
              const cx = step * i + step / 2;
              const nightH = y(d.nightMinutes);
              const napH = y(d.napMinutes);
              const dim = hover !== null && hover !== i;
              return (
                <g key={d.day} opacity={dim ? 0.45 : 1}>
                  {nightH > 0 && (
                    <path d={topRoundedRect(cx - barW / 2, plotH - nightH, barW, nightH, napH > 0 ? 0 : 4)} fill={SERIES[0].color} />
                  )}
                  {napH > GAP && (
                    <path d={topRoundedRect(cx - barW / 2, plotH - nightH - napH, barW, napH - GAP, 4)} fill={SERIES[1].color} />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={plotH + 18} className="tick" textAnchor="middle">
                      {formatDay(d.day, { day: 'numeric', month: 'short' })}
                    </text>
                  )}
                  {/* Hit target spans the full column, larger than the bar itself. */}
                  <rect
                    x={step * i} y={0} width={step} height={plotH} fill="transparent"
                    onMouseMove={(e) => show(d, i, e)}
                  />
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
