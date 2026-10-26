// The glass tank drawn by the Daytime sleep tank and Awake today cards: liquid up to `fill`
// (0–1, more is shown as full) with a gentle wave, 25/50/75% ticks and the percentage.

const W = 132;
const H = 210;
const R = 22;

/** id: unique per tank (SVG clip/gradient ids); color: CSS color of the liquid; label: for screen readers. */
export default function Tank({ id, fill, color, label }) {
  const level = Math.min(1, Math.max(0, fill));
  const pct = Math.round(fill * 100);
  return (
    <svg className="tank" width={W + 40} height={H + 16} viewBox={`-28 -8 ${W + 40} ${H + 16}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={`${id}-clip`}><rect width={W} height={H} rx={R} /></clipPath>
        <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.75" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} rx={R} className="tank-glass" />
      <g clipPath={`url(#${id}-clip)`}>
        <g className="tank-liquid" style={{ transform: `translateY(${H * (1 - level)}px)` }}>
          {level > 0 && (
            <>
              <path className="tank-wave" d={wavePath(W)} fill={`url(#${id}-liquid)`} />
              <rect y={6} width={W * 3} x={-W} height={H} fill={`url(#${id}-liquid)`} />
            </>
          )}
        </g>
      </g>
      {[0.25, 0.5, 0.75].map((f) => (
        <g key={f}>
          <line x1={-6} x2={0} y1={H * (1 - f)} y2={H * (1 - f)} className="tank-tick" />
          <text x={-10} y={H * (1 - f)} dy="0.32em" textAnchor="end" className="tank-tick-label">{f * 100}%</text>
        </g>
      ))}
      <rect width={W} height={H} rx={R} className="tank-outline" />
      <text x={W / 2} y={H / 2} dy="0.35em" textAnchor="middle" className={`tank-pct ${level > 0.55 ? 'on-liquid' : ''}`}>
        {pct}%
      </text>
    </svg>
  );
}

// A gentle wave three tank-widths wide; CSS slides it sideways.
function wavePath(w) {
  const amp = 5;
  let d = `M${-w},6`;
  for (let x = -w; x < w * 2; x += w / 2) d += ` q${w / 8},${-amp} ${w / 4},0 t${w / 4},0`;
  return `${d} V${H + 20} H${-w} Z`;
}
