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

/** The time zone this device is set to (IANA name, e.g. "Europe/Berlin"). */
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const canonical = new Map();
/** The standard name of a time zone ("America/Argentina/Buenos_Aires" and "America/Buenos_Aires" are one zone), or null. */
function canonicalZone(tz) {
  if (!tz) return null;
  if (!canonical.has(tz)) {
    try {
      canonical.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone);
    } catch {
      canonical.set(tz, null); // unknown name
    }
  }
  return canonical.get(tz);
}

/** Whether two time zone names mean the same zone. */
export const sameZone = (a, b) => canonicalZone(a) === canonicalZone(b);

/** A time zone other than this device's, or null (no zone, this device's, or an unknown name). */
function otherZone(tz) {
  const zone = canonicalZone(tz);
  return zone && zone !== canonicalZone(localZone()) ? zone : null;
}

const formats = new Map();
function zoneFormat(tz) {
  if (!formats.has(tz)) {
    formats.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return formats.get(tz);
}

/** What a clock in time zone `tz` shows at `date`: { y, m (0-based), d, h, min }. */
function partsIn(date, tz) {
  const p = Object.fromEntries(zoneFormat(tz).formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month - 1, d: p.day, h: p.hour % 24, min: p.minute, s: p.second };
}

/** How far the clock in `tz` is ahead of UTC at `ms` (in ms). */
function offsetAt(ms, tz) {
  const p = partsIn(new Date(ms), tz);
  return Date.UTC(p.y, p.m, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The moment the clock shows `minutes` after midnight on date y-m-d (month 0-based; minutes past 1440
 * fall on the next day), on this device's clock or, given `tz`, on that time zone's clock. Built from
 * the calendar, not by adding minutes to midnight, so it stays right on the days the clocks change
 * (23 or 25 hours long).
 */
export function atClock(y, m, d, minutes, tz) {
  const zone = otherZone(tz);
  if (!zone) return new Date(y, m, d, 0, minutes);
  const wall = Date.UTC(y, m, d, 0, minutes);
  let t = wall - offsetAt(wall, zone);
  const again = wall - offsetAt(t, zone); // the offset can differ by then (daylight saving)
  if (again !== t) t = again;
  return new Date(t);
}

/** "HH:MM" that a clock shows at `date`: this device's clock, or the clock in time zone `tz`. */
export function clockIn(date, tz) {
  const zone = otherZone(tz);
  if (!zone) return hhmm(date);
  const p = partsIn(date, zone);
  return `${pad(p.h)}:${pad(p.min)}`;
}

/** "Buenos Aires" for "America/Argentina/Buenos_Aires": a short name for a time zone. */
export const zoneCity = (tz) => String(tz ?? '').split('/').pop().replace(/_/g, ' ');

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

/**
 * The first moment at or after `after` whose clock shows `minutes` after midnight (within 24h):
 * this device's clock, or the clock in time zone `tz`.
 */
export function atOrAfter(after, minutes, tz) {
  const zone = otherZone(tz);
  if (zone) {
    const p = partsIn(after, zone);
    const d = atClock(p.y, p.m, p.d, minutes, zone);
    return d < after ? atClock(p.y, p.m, p.d + 1, minutes, zone) : d;
  }
  const d = new Date(after);
  d.setHours(0, minutes, 0, 0);
  if (d < after) d.setDate(d.getDate() + 1);
  return d;
}

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
/** Mean of the numbers, or null for an empty list. */
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
