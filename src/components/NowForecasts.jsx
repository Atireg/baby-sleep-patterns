// Forecast lines in the Now card, each from the last few days of logged sleep.
// They recompute once a minute (keyed on the minute), not on every second of the timer.
import { useMemo } from 'react';
import {
  MAX_WAKE_WINDOW, dayAwakeTotal, expectedBedtime, expectedWakeUp, upcomingNap, upcomingWakeWindow,
} from '../lib/insights.js';
import { awakeSince as findAwakeSince, sleepDay } from '../lib/live.js';
import { formatDuration, hhmm, ordinal } from '../lib/format.js';
import { MS_MIN, dateKey, minutesBetween } from '../lib/time.js';
import { ProgressBar } from './Chips.jsx';

const minuteOf = (now) => Math.floor(now.getTime() / MS_MIN);
/** "last night" / "last 3 nights" style sample note. */
const lastN = (n, word) => `last ${n === 1 ? word : `${n} ${word}s`}`;

/** " · in 40m" / " · about now" / " · 25m past the usual time" for an expected moment. */
function Due({ minutesLeft }) {
  if (minutesLeft > 10) return <> · in <strong>{formatDuration(minutesLeft)}</strong></>;
  if (minutesLeft >= -10) return <> · <strong>about now</strong></>;
  return <> · {formatDuration(-minutesLeft)} past the usual time</>;
}

/** 🌙 Expected bedtime, until tonight's night is logged. */
export function BedtimeLine({ sessions, now }) {
  const minute = minuteOf(now);
  const bedtime = useMemo(() => {
    const at = new Date(minute * MS_MIN);
    // Once tonight's sleep has been logged, bedtime has happened.
    if (sessions.some((s) => s.type === 'night' && s.day === dateKey(at))) return null;
    const exp = expectedBedtime(sessions, at);
    return exp && { ...exp, when: new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, exp.minutes) };
  }, [sessions, minute]);
  if (!bedtime) return null;
  return (
    <p className="nap-forecast bedtime-forecast">
      🌙 Expected bedtime <strong>~{hhmm(bedtime.when)}</strong>
      <Due minutesLeft={minutesBetween(now, bedtime.when)} />
      <span className="muted"> (avg of {lastN(bedtime.samples, 'night')})</span>
    </p>
  );
}

/** ☀️ Expected morning wake-up during a night, with the night's progress. */
export function WakeUpLine({ sessions, now, asleep }) {
  const minute = minuteOf(now);
  const wakeUp = useMemo(() => expectedWakeUp(sessions, new Date(minute * MS_MIN)), [sessions, minute]);
  if (!wakeUp) return null;
  const when = new Date(asleep.getFullYear(), asleep.getMonth(), asleep.getDate(), 0, wakeUp.minutes);
  if (when <= asleep) when.setDate(when.getDate() + 1);
  return (
    <div className="nap-progress">
      <p className="nap-forecast wake-forecast">
        ☀️ Expected wake-up <strong>~{hhmm(when)}</strong>
        <Due minutesLeft={minutesBetween(now, when)} />
        <span className="muted"> (avg of {lastN(wakeUp.samples, 'night')})</span>
      </p>
      <ProgressBar className="night" label="Night so far" share={(now - asleep) / (when - asleep)} />
    </div>
  );
}

/** ⏱ Usual wake window before the next nap (or bedtime) and how far into it she is. */
export function WakeWindowLine({ sessions, now, awakeSince }) {
  const minute = minuteOf(now);
  const usual = useMemo(() => upcomingWakeWindow(sessions, new Date(minute * MS_MIN)), [sessions, minute]);
  if (!usual) return null;
  const label = usual.target === 'bedtime' ? 'bedtime' : `the ${ordinal(usual.target)} nap`;
  const awakeMin = awakeSince ? (now - awakeSince) / MS_MIN : null;
  const over = awakeMin != null && awakeMin >= usual.avgMinutes;
  return (
    <div className="nap-progress">
      <p className="nap-forecast window-forecast">
        ⏱ Wake window before {label}: usually <strong>~{formatDuration(usual.avgMinutes)}</strong>
        {awakeMin != null && !over && <> · sleepy around <strong>{hhmm(new Date(awakeSince.getTime() + usual.avgMinutes * MS_MIN))}</strong></>}
        {over && <> · <strong>{formatDuration(awakeMin - usual.avgMinutes)} over</strong> — time to settle?</>}
        <span className="muted"> ({lastN(usual.samples, 'day')})</span>
      </p>
      {awakeMin != null && (
        <ProgressBar className={`window ${over ? 'over' : ''}`} label="Awake time against the usual wake window"
          share={awakeMin / usual.avgMinutes} />
      )}
    </div>
  );
}

/** ⏱ After she falls asleep: how long she was awake before it, and the usual for that nap / bedtime. */
export function WindowBeforeLine({ sessions, live }) {
  const info = useMemo(() => {
    const asleepAt = new Date(live.asleep);
    const from = findAwakeSince(sessions, { awakeFrom: live.awakeFrom ?? null }, asleepAt);
    const minutes = from ? minutesBetween(from, asleepAt) : null;
    if (minutes == null || minutes <= 0 || minutes >= MAX_WAKE_WINDOW) return null;
    const usual = upcomingWakeWindow(sessions, asleepAt);
    // Only compare with the same kind of sleep (the usual before a nap vs before bedtime).
    const matches = usual && (usual.target === 'bedtime') === (live.type === 'night');
    return { from, minutes, asleepAt, usual: matches ? usual : null };
  }, [sessions, live.asleep, live.awakeFrom, live.type]);
  if (!info) return null;
  return (
    <p className="nap-forecast window-before">
      ⏱ Wake window before {live.type === 'night' ? 'bedtime' : 'this nap'}: <strong>{formatDuration(info.minutes)}</strong>
      <span className="muted">
        {' '}({hhmm(info.from)} → {hhmm(info.asleepAt)})
        {info.usual && ` · usually ~${formatDuration(info.usual.avgMinutes)}`}
      </span>
    </p>
  );
}

/** 🌤 During the night: time awake during the day that just ended (wake-up → bedtime, minus naps). */
export function DayAwakeLine({ sessions, asleep, awakeAvg }) {
  const dayAwake = useMemo(() => dayAwakeTotal(sessions, sleepDay('night', asleep), asleep), [sessions, asleep]);
  if (!dayAwake) return null;
  return (
    <p className="nap-forecast day-awake">
      🌤 Awake today: <strong>{formatDuration(dayAwake.minutes)}</strong>
      <span className="muted">
        {' '}({hhmm(dayAwake.wake)} → {hhmm(dayAwake.bedtime)}{dayAwake.napMinutes ? `, minus ${formatDuration(dayAwake.napMinutes)} of naps` : ''})
        {awakeAvg != null && ` · 5-day avg ${formatDuration(awakeAvg)}`}
      </span>
    </p>
  );
}

/** How long nap N usually lasts (N = today's naps + 1), from the last 3 days. */
export function useUpcomingNap(sessions, now) {
  const minute = minuteOf(now);
  return useMemo(() => upcomingNap(sessions, new Date(minute * MS_MIN)), [sessions, minute]);
}

/** 💤 Before a nap: which nap is next and how long it usually lasts. */
export function NapForecast({ nap }) {
  const nth = ordinal(nap.position);
  return (
    <p className="nap-forecast">
      💤 Next: <strong>{nth} nap</strong>
      {nap.avgMinutes != null
        ? <> · usually <strong>~{formatDuration(nap.avgMinutes)}</strong> <span className="muted">({lastN(nap.samples, 'day')} with a {nth} nap)</span></>
        : <span className="muted"> · no {nth} nap in the last {nap.days || 3} days — maybe bedtime is next?</span>}
    </p>
  );
}

/** 💤 During a nap: when she may wake, with progress against the usual length. */
export function NapProgress({ nap, now, asleep }) {
  if (nap.avgMinutes == null) return null;
  const elapsed = (now - asleep) / MS_MIN;
  return (
    <div className="nap-progress">
      <p className="nap-forecast">
        💤 {ordinal(nap.position)} nap usually lasts <strong>~{formatDuration(nap.avgMinutes)}</strong>
        {elapsed < nap.avgMinutes
          ? <> · she may wake around <strong>{hhmm(new Date(asleep.getTime() + nap.avgMinutes * MS_MIN))}</strong></>
          : <> · already {formatDuration(elapsed - nap.avgMinutes)} longer than usual 🎉</>}
      </p>
      <ProgressBar share={elapsed / nap.avgMinutes} />
    </div>
  );
}
