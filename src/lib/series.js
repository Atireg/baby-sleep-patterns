// Helpers for time series with missing days. Day steps get +1h slack (DST days are 23h or 25h long).
import { MS_DAY, MS_HOUR, dateKey, keyToDate } from './time.js';

const toTime = (day) => keyToDate(day).getTime();
const toDay = (t) => dateKey(new Date(t));

/**
 * Insert a null point after any jump longer than `maxGapDays`, so Plotly breaks the line
 * there instead of drawing across days with no data. xs are 'YYYY-MM-DD' strings in order.
 */
export function breakGaps(xs, ys, maxGapDays = 1) {
  const x = [];
  const y = [];
  xs.forEach((day, i) => {
    if (i && toTime(day) - toTime(xs[i - 1]) > maxGapDays * MS_DAY + MS_HOUR) {
      x.push(toDay(toTime(xs[i - 1]) + MS_DAY));
      y.push(null);
    }
    x.push(day);
    y.push(ys[i]);
  });
  return { x, y };
}

/** Rolling mean over the previous `window` calendar days (not records), null where no data. */
export function rollingMean(days, value, window = 7) {
  return days.map((d) => {
    const end = toTime(d.day);
    const inWindow = days.filter((o) => toTime(o.day) <= end && toTime(o.day) > end - window * MS_DAY);
    return inWindow.reduce((s, o) => s + value(o), 0) / inWindow.length;
  });
}

/** Every Monday from the first to the last week key, inclusive. */
export function allWeeks(firstWeek, lastWeek) {
  const weeks = [];
  for (let t = toTime(firstWeek); t <= toTime(lastWeek) + MS_HOUR; t += 7 * MS_DAY) weeks.push(toDay(t));
  return weeks;
}

/** Split x/y (with nulls as breaks) into contiguous segments, for area fills that must not span gaps. */
export function segments(xs, ys) {
  const out = [];
  let cur = null;
  xs.forEach((x, i) => {
    if (ys[i] == null) { cur = null; return; }
    if (!cur) out.push((cur = { x: [], y: [] }));
    cur.x.push(x);
    cur.y.push(ys[i]);
  });
  return out;
}
