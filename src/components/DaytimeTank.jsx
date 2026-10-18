import { useEffect, useMemo, useState } from 'react';
import { daytimeTank } from '../lib/insights.js';
import { formatDuration, formatTimer, hhmm, ordinal } from '../lib/format.js';
import { TARGET_CHOICES } from '../lib/wakeTargets.js';
import { minutesBetween } from '../lib/time.js';
import { useNow } from '../hooks/useNow.js';

const TARGET_OPTIONS = Array.from({ length: 17 }, (_, i) => 60 + i * 15); // 1h … 5h


const W = 132;
const H = 210;
const R = 22;

/** Today's naps filling a tank whose capacity is the daytime-sleep target. */
/** The parents' target wake window before each nap and before bedtime ("—" = none). */
function WakeTargets({ targets, napRows, onChange }) {
  const keys = [...Array.from({ length: napRows }, (_, i) => i + 1), 'bedtime'];
  const set = keys.filter((k) => targets[k]).length;
  return (
    <details className="wake-targets">
      <summary>🎯 Target wake windows{set ? ` · ${set} set` : ''}</summary>
      <p className="muted">How long she should be awake before each sleep. Shown in the Now card next to the usual times.</p>
      <div className="wake-targets-grid">
        {keys.map((k) => (
          <label key={k}>
            <span>{k === 'bedtime' ? 'Before bedtime' : `Before ${ordinal(k)} nap`}</span>
            <select value={targets[k] ?? ''} onChange={(e) => onChange(k, Number(e.target.value) || null)}>
              <option value="">—</option>
              {TARGET_CHOICES.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function DaytimeTank({ sessions, autoTarget, napTarget = null, onNapTarget, wakeTargets, napRows = 3, onWakeTarget }) {
  const [napping, setNapping] = useState(false);
  // Every second while a nap is in progress (live nap time), otherwise every minute.
  const now = useNow(napping ? 1000 : 60000);
  const custom = napTarget;
  const target = custom ?? (autoTarget > 0 ? Math.round(autoTarget) : 150);
  const tank = useMemo(() => daytimeTank(sessions, now, target), [sessions, now, target]);
  const ongoing = tank.naps.find((s) => s.end > now) ?? null;
  const isNapping = Boolean(ongoing);
  useEffect(() => setNapping(isNapping), [isNapping]);

  const chooseTarget = (e) => {
    onNapTarget(e.target.value === 'auto' ? null : Number(e.target.value));
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
          {tank.asleepSince && <p className="tank-now">😴 Asleep since {hhmm(tank.asleepSince)}</p>}
          {tank.awakeSince && (
            <p className="tank-now">Awake since {hhmm(tank.awakeSince)} · {formatDuration(minutesBetween(tank.awakeSince, now))}</p>
          )}

          <ul className="tank-naps">
            {tank.naps.length === 0 && <li className="muted">No naps logged today yet.</li>}
            {tank.naps.map((s, i) => (
              <li key={`${s.start.getTime()}`}>
                <span className="tank-nap-no">Nap {i + 1}</span>
                {s === ongoing ? (
                  <>
                    <span>{hhmm(s.start)}–now</span>
                    <span className="tank-live">{formatTimer(now - s.start)}</span>
                  </>
                ) : (
                  <>
                    <span>{hhmm(s.start)}–{hhmm(s.end)}</span>
                    <span className="muted">{formatDuration(s.minutes)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>

          <label className="tank-target">
            <span>Nap-time target</span>
            <select value={custom ?? 'auto'} onChange={chooseTarget}>
              <option value="auto">
                Auto{autoTarget > 0 ? ` – 5-day average (${formatDuration(autoTarget)})` : ' (2h 30m)'}
              </option>
              {TARGET_OPTIONS.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </label>
        </div>
      </div>
      {onWakeTarget && <WakeTargets targets={wakeTargets} napRows={napRows} onChange={onWakeTarget} />}
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
