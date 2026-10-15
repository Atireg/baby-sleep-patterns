// Text formatting for durations, dates and timers.
import { keyToDate, pad } from './time.js';

export { hhmm } from './time.js';

/** 95 → "1h 35m", 40 → "40m". */
export function formatDuration(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${pad(m % 60)}m` : `${m % 60}m`;
}

/** "YYYY-MM-DD" → "Wed, Oct 14" (or other toLocaleDateString options). */
export const formatDay = (day, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  keyToDate(day).toLocaleDateString(undefined, opts);

/** "1:05:09" / "12:03" style running timer. */
export function formatTimer(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export const ordinal = (n) =>
  `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
