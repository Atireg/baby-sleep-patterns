import { useEffect, useMemo, useState } from 'react';
import { daytimeAwake } from '../lib/insights.js';
import { formatDuration, formatTimer, hhmm, ordinal } from '../lib/format.js';
import { targetsTotal } from '../lib/wakeTargets.js';
import { useNow } from '../hooks/useNow.js';
import Tank from './Tank.jsx';

const windowLabel = (w) => (w.before === 'bedtime' ? 'Before bed' : w.before ? `Before ${ordinal(w.before)} nap` : 'Now');

/**
 * Today's time awake filling a tank whose capacity is the day's target wake windows added up
 * (else the 5-day average awake time). Ticks every second while she's awake.
 * awakeFrom: a manually started awake timer (Date), used when this morning's wake-up isn't logged.
 */
export default function AwakeTank({ sessions, wakeTargets, awakeAvg = null, awakeFrom = null }) {
  const [awake, setAwake] = useState(true);
  const now = useNow(awake ? 1000 : 60000);
  const day = useMemo(() => daytimeAwake(sessions, now, awakeFrom), [sessions, now, awakeFrom]);
  const isAwake = Boolean(day && !day.asleepSince);
  useEffect(() => setAwake(isAwake), [isAwake]);

  const fromTargets = day ? targetsTotal(wakeTargets, day.windows.filter((w) => typeof w.before === 'number').length) : null;
  const target = fromTargets ?? (awakeAvg > 0 ? Math.round(awakeAvg) : null);

  if (!day) {
    return (
      <section className="card tank-card awake-tank" aria-label="Awake today">
        <h2>Awake today</h2>
        <p className="subtitle">Log this morning’s wake-up (when last night ended) to start today’s awake tank.</p>
      </section>
    );
  }
  const fill = target ? day.minutes / target : 0;
  const ongoing = day.windows.find((w) => w.ongoing);
  return (
    <section className="card tank-card awake-tank" aria-label="Awake today">
      <div>
        <h2>Awake today</h2>
        <p className="subtitle">Time awake since this morning’s wake-up, naps left out.</p>
      </div>
      <div className="tank-body">
        <Tank id="awake-tank" fill={fill} color="var(--series-4)"
          label={`Awake today ${formatDuration(day.minutes)}${target ? ` of ${formatDuration(target)}, ${Math.round(fill * 100)}%` : ''}`} />
        <div className="tank-info">
          <div className="tank-big">
            <strong>{formatDuration(day.minutes)}</strong>
            {target && <span> of {formatDuration(target)}</span>}
          </div>
          <p className="muted tank-basis">
            {fromTargets ? 'Your target wake windows added up' : target ? '5-day average awake time' : 'No target wake windows or recent days yet'}
          </p>
          {day.bedtime ? (
            <p className="tank-status full">Day done · bedtime {hhmm(day.bedtime)}</p>
          ) : target && (
            <p className={`tank-status ${day.minutes >= target ? 'over' : ''}`}>
              {day.minutes >= target ? `${formatDuration(day.minutes - target)} over — time for bed?` : `~${formatDuration(target - day.minutes)} of awake time left today`}
            </p>
          )}
          <p className="tank-now">
            ☀️ Woke at {hhmm(day.wake)}
            {day.asleepSince && !day.bedtime && <> · 😴 asleep since {hhmm(day.asleepSince)}</>}
          </p>
          <ul className="tank-naps">
            {day.windows.map((w) => (
              <li key={w.from.getTime()}>
                <span className="tank-nap-no awake">{windowLabel(w)}</span>
                {w.ongoing ? (
                  <>
                    <span>{hhmm(w.from)}–now</span>
                    <span className="tank-live awake">{formatTimer(now - w.from)}</span>
                  </>
                ) : (
                  <>
                    <span>{hhmm(w.from)}–{hhmm(w.to)}</span>
                    <span className="muted">{formatDuration(w.minutes)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!ongoing && !day.bedtime && <p className="muted tank-basis">Paused while she naps.</p>}
        </div>
      </div>
    </section>
  );
}
