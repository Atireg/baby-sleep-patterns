// Date and clock arithmetic shared by the parsers, insights and components (all local time).

export const MS_MIN = 60 * 1000;
export const MS_HOUR = 60 * MS_MIN;
export const MS_DAY = 24 * MS_HOUR;

export const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" key for a Date. */
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Local midnight of a "YYYY-MM-DD" key. */
export function keyToDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The key `n` days after `day` (negative = before). */
export function shiftDay(day, n) {
  const date = keyToDate(day);
  date.setDate(date.getDate() + n);
  return dateKey(date);
}

/**
 * The moment the clock shows `minutes` after midnight on date y-m-d (month 0-based; minutes past 1440
 * fall on the next day). Built from the calendar, not by adding minutes to midnight, so it stays right
 * on the days the clocks change (23 or 25 hours long).
 */
export const atClock = (y, m, d, minutes) => new Date(y, m, d, 0, minutes);

/**
 * What `date`'s clock shows, in minutes after the midnight that starts `day` ("YYYY-MM-DD"): negative
 * the day before, past 1440 on later days. Clock time, so it is right on daylight-saving days too.
 */
export function clockMinutesFrom(day, date) {
  const [y, m, d] = day.split('-').map(Number);
  const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / MS_DAY);
  return days * 1440 + date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / MS_MIN;
}

/** "HH:MM" for a Date. */
export const hhmm = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** "HH:MM" for minutes after midnight. */
export const minutesToClock = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Minutes after midnight for "HH:MM". */
export function clockMinutes(text) {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes from "HH:MM" `from` to "HH:MM" `to`, going forward past midnight if needed. */
export const clockSpan = (from, to) => (clockMinutes(to) - clockMinutes(from) + 1440) % 1440;

/** Whole minutes from `a` to `b` (Dates or timestamps). */
export const minutesBetween = (a, b) => Math.round((b - a) / MS_MIN);

/** The first moment at or after `after` whose clock shows `minutes` after midnight (within 24h). */
export function atOrAfter(after, minutes) {
  const d = new Date(after);
  d.setHours(0, minutes, 0, 0);
  if (d < after) d.setDate(d.getDate() + 1);
  return d;
}

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
/** Mean of the numbers, or null for an empty list. */
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
