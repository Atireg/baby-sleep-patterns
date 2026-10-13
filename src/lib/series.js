// Helpers for time series with missing days.

const MS_DAY = 24 * 60 * 60 * 1000;
const toTime = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const toDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Insert a null point after any jump longer than `maxGapDays`, so Plotly breaks the line
 * there instead of drawing across days with no data. xs are 'YYYY-MM-DD' strings in order.
 */
export function breakGaps(xs, ys, maxGapDays = 1) {
  const x = [];
  const y = [];
  xs.forEach((day, i) => {
    if (i && toTime(day) - toTime(xs[i - 1]) > maxGapDays * MS_DAY + 3.6e6) {
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
  for (let t = toTime(firstWeek); t <= toTime(lastWeek) + 3.6e6; t += 7 * MS_DAY) weeks.push(toDay(t));
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
