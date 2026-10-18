// Forecast lines in the Now card, each from the last few days of logged sleep.
// They recompute once a minute (keyed on the minute), not on every second of the timer.
import { useMemo } from 'react';
import {
  MAX_WAKE_WINDOW, dayAwakeTotal, expectedWakeUp, napsDoneToday, upcomingNap, upcomingWakeWindow,
} from '../lib/insights.js';
import { awakeSince as findAwakeSince, nightAwakeMs, sleepDay } from '../lib/live.js';
import { formatDuration, hhmm, ordinal } from '../lib/format.js';
import { MS_MIN, minutesBetween } from '../lib/time.js';
import { targetFor } from '../lib/wakeTargets.js';
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

/**
 * ☀️ Expected morning wake-up during a night: bedtime + (5-day average total sleep − today's naps),
 * later by the time she has been awake tonight; with the night's progress.
 */
export function WakeUpLine({ sessions, now, live, avgTotal }) {
  const asleep = new Date(live.asleep);
  // Whole minutes, so the estimate only recomputes when they change.
  const awakeMinutes = Math.round(nightAwakeMs(live, now) / MS_MIN);
  const wakeUp = useMemo(
    () => expectedWakeUp(sessions, sleepDay('night', asleep), asleep, avgTotal, awakeMinutes),
    [sessions, live.asleep, avgTotal, awakeMinutes],
  );
  if (!wakeUp) return null;
  const { when } = wakeUp;
  return (
    <div className="nap-progress">
      <p className="nap-forecast wake-forecast">
        ☀️ Expected wake-up <strong>~{hhmm(when)}</strong>
        <Due minutesLeft={minutesBetween(now, when)} />
        <span className="muted">
          {' '}(5-day avg sleep {formatDuration(avgTotal)}
          {wakeUp.napMinutes > 0 && ` − ${formatDuration(wakeUp.napMinutes)} of naps today`} = {formatDuration(wakeUp.nightMinutes)} tonight
          {awakeMinutes > 0 && ` + ${formatDuration(awakeMinutes)} awake`})
        </span>
      </p>
      <ProgressBar className="night" label="Night so far" share={(now - asleep) / (when - asleep)} />
    </div>
  );
}

/** Go in to start settling this many minutes before the target wake window ends. */
const ENTER_ROOM_EARLY = 10;
const sleepLabel = (key) => (key === 'bedtime' ? 'bedtime' : `the ${ordinal(key)} nap`);

/**
 * ⏱ Wake window before the next nap (or bedtime): the usual one (last 5 days) and the parents' target,
 * with the time each is reached and a bar of the time awake so far (against the target when set).
 */
export function WakeWindowLine({ sessions, now, awakeSince, targets }) {
  const minute = minuteOf(now);
  const usual = useMemo(() => upcomingWakeWindow(sessions, new Date(minute * MS_MIN)), [sessions, minute]);
  const next = napsDoneToday(sessions, now) + 1;
  // Which sleep is next: from the recent days, else the first one with a target set.
  const key = usual?.target ?? (targetFor(targets, next) ? next : targetFor(targets, 'bedtime') ? 'bedtime' : null);
  const target = targetFor(targets, key);
  if (!usual && !target) return null;
  const goal = target ?? usual.avgMinutes;
  const awakeMin = awakeSince ? (now - awakeSince) / MS_MIN : null;
  const at = (minutes) => hhmm(new Date(awakeSince.getTime() + minutes * MS_MIN));
  const over = awakeMin != null && awakeMin >= goal;
  return (
    <div className="nap-progress">
      <p className="nap-forecast window-forecast">
        ⏱ Wake window before {sleepLabel(key)}:
        {usual && <> usually <strong>~{formatDuration(usual.avgMinutes)}</strong>{awakeMin != null && awakeMin < usual.avgMinutes && <> (sleepy around <strong>{at(usual.avgMinutes)}</strong>)</>}</>}
        {usual && target && ' ·'}
        {target && <> 🎯 target <strong>{formatDuration(target)}</strong>{awakeMin != null && awakeMin < target && (
          <> — asleep by <strong>{at(target)}</strong> · enter the room at <strong>{at(target - ENTER_ROOM_EARLY)}</strong></>
        )}</>}
        {over && <> · <strong>{formatDuration(awakeMin - goal)} over</strong> — time to settle?</>}
        {usual && <span className="muted"> ({lastN(usual.samples, 'day')})</span>}
      </p>
      {awakeMin != null && (
        <ProgressBar className={`window ${over ? 'over' : ''}`} share={awakeMin / goal}
          label={target ? 'Awake time against the target wake window' : 'Awake time against the usual wake window'} />
      )}
    </div>
  );
}

/** 🎯 While she is awake: all the target wake windows, the next one highlighted. */
export function WakeTargetsRow({ sessions, now, targets }) {
  const minute = minuteOf(now);
  const usual = useMemo(() => upcomingWakeWindow(sessions, new Date(minute * MS_MIN)), [sessions, minute]);
  const keys = Object.keys(targets ?? {})
    .filter((k) => targetFor(targets, k))
    .sort((a, b) => (a === 'bedtime') - (b === 'bedtime') || a - b);
  if (!keys.length) return null;
  const next = napsDoneToday(sessions, now) + 1;
  const nextKey = String(usual?.target ?? (targetFor(targets, next) ? next : 'bedtime'));
  return (
    <p className="wake-targets-row" aria-label="Target wake windows">
      <span>🎯 Targets:</span>
      {keys.map((k) => (
        <span key={k} className={`target-chip ${k === nextKey ? 'next' : ''}`}>
          {k === 'bedtime' ? 'bedtime' : `${ordinal(Number(k))} nap`} {formatDuration(targets[k])}
        </span>
      ))}
    </p>
  );
}

/** ⏱ After she falls asleep: how long she was awake before it, and the usual for that nap / bedtime. */
export function WindowBeforeLine({ sessions, live, targets }) {
  const info = useMemo(() => {
    const asleepAt = new Date(live.asleep);
    const from = findAwakeSince(sessions, { awakeFrom: live.awakeFrom ?? null }, asleepAt);
    const minutes = from ? minutesBetween(from, asleepAt) : null;
    if (minutes == null || minutes <= 0 || minutes >= MAX_WAKE_WINDOW) return null;
    const usual = upcomingWakeWindow(sessions, asleepAt);
    // Only compare with the same kind of sleep (the usual before a nap vs before bedtime).
    const matches = usual && (usual.target === 'bedtime') === (live.type === 'night');
    const key = live.type === 'night' ? 'bedtime' : napsDoneToday(sessions, asleepAt) + 1;
    return { from, minutes, asleepAt, usual: matches ? usual : null, target: targetFor(targets, key) };
  }, [sessions, live.asleep, live.awakeFrom, live.type, targets]);
  if (!info) return null;
  return (
    <p className="nap-forecast window-before">
      ⏱ Wake window before {live.type === 'night' ? 'bedtime' : 'this nap'}: <strong>{formatDuration(info.minutes)}</strong>
      <span className="muted">
        {' '}({hhmm(info.from)} → {hhmm(info.asleepAt)})
        {info.usual && ` · usually ~${formatDuration(info.usual.avgMinutes)}`}
        {info.target && ` · 🎯 target ${formatDuration(info.target)}`}
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
