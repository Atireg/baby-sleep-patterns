import { useEffect, useMemo, useState } from 'react';
import { daytimeTank } from '../lib/insights.js';
import { formatTimer } from '../lib/live.js';
import { formatClock, formatDuration } from '../lib/sleepData.js';

const TARGET_KEY = 'baby-sleep-nap-target';
const TARGET_OPTIONS = Array.from({ length: 17 }, (_, i) => 60 + i * 15); // 1h … 5h

function loadTarget() {
  try {
    const v = Number(localStorage.getItem(TARGET_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Re-render every second while a nap is in progress (live nap time), otherwise every minute. */
function useNow(fast) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), fast ? 1000 : 60000);
    return () => clearInterval(id);
  }, [fast]);
  return now;
}

const W = 132;
const H = 210;
const R = 22;

/** Today's naps filling a tank whose capacity is the daytime-sleep target. */
export default function DaytimeTank({ sessions, autoTarget }) {
  const [napping, setNapping] = useState(false);
  const now = useNow(napping);
  const [custom, setCustom] = useState(loadTarget);
  const target = custom ?? (autoTarget > 0 ? Math.round(autoTarget) : 150);
  const tank = useMemo(() => daytimeTank(sessions, now, target), [sessions, now, target]);
  const ongoing = tank.naps.find((s) => s.end > now) ?? null;
  const isNapping = Boolean(ongoing);
  useEffect(() => setNapping(isNapping), [isNapping]);

  const chooseTarget = (e) => {
    const v = e.target.value === 'auto' ? null : Number(e.target.value);
    setCustom(v);
    try {
      if (v) localStorage.setItem(TARGET_KEY, String(v));
      else localStorage.removeItem(TARGET_KEY);
    } catch { /* storage blocked: keep for this visit only */ }
  };

  const level = Math.min(1, tank.fill);
  const liquidTop = H * (1 - level);
  const pct = Math.round(tank.fill * 100);
  const full = tank.fill >= 1;

  return (
    <section className="card tank-card" aria-label="Daytime sleep tank">
      <div>
        <h2>Daytime sleep tank</h2>
        <p className="subtitle">Today’s naps filling up towards the daytime-sleep target.</p>
      </div>

      <div className="tank-body">
        <svg className="tank" width={W + 40} height={H + 16} viewBox={`-28 -8 ${W + 40} ${H + 16}`} role="img"
          aria-label={`Daytime sleep ${formatDuration(tank.napMinutes)} of ${formatDuration(tank.target)}, ${pct}%`}>
          <defs>
            <clipPath id="tank-clip"><rect width={W} height={H} rx={R} /></clipPath>
            <linearGradient id="tank-liquid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series-2)" stopOpacity="0.75" />
              <stop offset="1" stopColor="var(--series-2)" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} rx={R} className="tank-glass" />
          <g clipPath="url(#tank-clip)">
            <g className="tank-liquid" style={{ transform: `translateY(${liquidTop}px)` }}>
              {level > 0 && (
                <>
                  <path className="tank-wave" d={wavePath(W)} fill="url(#tank-liquid)" />
                  <rect y={6} width={W * 3} x={-W} height={H} fill="url(#tank-liquid)" />
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

        <div className="tank-info">
          <div className="tank-big">
            <strong>{formatDuration(tank.napMinutes)}</strong> <span>of {formatDuration(tank.target)}</span>
          </div>
          <p className={`tank-status ${full ? 'full' : ''}`}>
            {full
              ? (tank.over > 0 ? `Tank full · ${formatDuration(tank.over)} over target` : 'Tank full')
              : `${formatDuration(tank.remaining)} left to fill`}
          </p>
          {tank.asleepSince && <p className="tank-now">😴 Asleep since {formatClock(tank.asleepSince)}</p>}
          {tank.awakeSince && (
            <p className="tank-now">Awake since {formatClock(tank.awakeSince)} · {formatDuration((now - tank.awakeSince) / 60000)}</p>
          )}

          <ul className="tank-naps">
            {tank.naps.length === 0 && <li className="muted">No naps logged today yet.</li>}
            {tank.naps.map((s, i) => (
              <li key={`${s.start.getTime()}`}>
                <span className="tank-nap-no">Nap {i + 1}</span>
                {s === ongoing ? (
                  <>
                    <span>{formatClock(s.start)}–now</span>
                    <span className="tank-live">{formatTimer(now - s.start)}</span>
                  </>
                ) : (
                  <>
                    <span>{formatClock(s.start)}–{formatClock(s.end)}</span>
                    <span className="muted">{formatDuration(s.minutes)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>

          <label className="tank-target">
            <span>Target</span>
            <select value={custom ?? 'auto'} onChange={chooseTarget}>
              <option value="auto">
                Auto{autoTarget > 0 ? ` – 5-day average (${formatDuration(autoTarget)})` : ' (2h 30m)'}
              </option>
              {TARGET_OPTIONS.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

// A gentle wave three tank-widths wide; CSS slides it sideways.
function wavePath(w) {
  const amp = 5;
  let d = `M${-w},6`;
  for (let x = -w; x < w * 2; x += w / 2) d += ` q${w / 8},${-amp} ${w / 4},0 t${w / 4},0`;
  return `${d} V${H + 20} H${-w} Z`;
}
