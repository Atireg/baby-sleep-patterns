// Weekly aggregates for the consultant-log insights (settling, wake windows, how sleep started).
import { allWeeks } from './series.js';
import { countsAsSleep } from './sleepData.js';
import { MS_HOUR, MS_MIN, dateKey, keyToDate, mean, minutesBetween, shiftDay, sum } from './time.js';

/** Gaps of 8h or more aren't wake windows (e.g. missing data); they are ignored. */
export const MAX_WAKE_WINDOW = 8 * 60;
const knownWindow = (s) => (s.wakeWindow != null && s.wakeWindow < MAX_WAKE_WINDOW ? s.wakeWindow : null);

/**
 * The night wakings of one night: the gaps between its stretches (sorted), with the feed flag matched
 * from the logged wakings. Short feeds count as sleep (`countedAsSleep`).
 */
function nightGaps(pieces) {
  const details = pieces.find((p) => p.nightWakings)?.nightWakings ?? [];
  const gaps = [];
  for (let i = 1; i < pieces.length; i++) {
    const from = pieces[i - 1].end;
    const minutes = minutesBetween(from, pieces[i].start);
    if (minutes <= 0) continue;
    const feed = details.some((w) => w.feed && w.from === from.getHours() * 60 + from.getMinutes());
    gaps.push({ from, to: pieces[i].start, minutes, feed, countedAsSleep: countsAsSleep(feed, minutes) });
  }
  return gaps;
}
const awakeAtNight = (gaps) => gaps.filter((w) => !w.countedAsSleep).reduce((sum, w) => sum + w.minutes, 0);

export const METHOD_LABELS = {
  'на ръце': 'Held in arms',
  'самостоятелно': 'Independently',
  'с потупване по дупето': 'Patting',
  'с кърмене': 'Nursing',
};
export const OTHER_METHOD = 'Other';

export const MOOD_LABELS = {
  'добро': 'Good',
  'плаче': 'Crying',
  'мрънка': 'Fussy',
  'трудно го събудих': 'Hard to wake',
};

export const METHODS = [...Object.values(METHOD_LABELS), OTHER_METHOD];
export const MOODS = Object.values(MOOD_LABELS);

// Accept both the Bulgarian template values and the English labels used by the entry form / export.
const englishLabel = (labels, m) => Object.values(labels).find((l) => l.toLowerCase() === m.toLowerCase());
export const methodLabel = (m) => (m ? METHOD_LABELS[m.toLowerCase()] ?? englishLabel(METHOD_LABELS, m) ?? OTHER_METHOD : null);
export const moodLabel = (m) => (m ? MOOD_LABELS[m.toLowerCase()] ?? englishLabel(MOOD_LABELS, m) ?? m : null);

/** Monday of the week containing `day` (YYYY-MM-DD). */
export function weekKey(day) {
  return shiftDay(day, -((keyToDate(day).getDay() + 6) % 7));
}

// Each night may be split into several pieces; only the first carries bedtime details.
const firstPieces = (sessions) => {
  const seen = new Set();
  return sessions.filter((s) => {
    if (s.type !== 'night') return true;
    if (seen.has(s.day)) return false;
    seen.add(s.day);
    return true;
  });
};

function byWeek(sessions) {
  const weeks = new Map();
  for (const s of firstPieces(sessions)) {
    const w = weekKey(s.day);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(s);
  }
  const keys = [...weeks.keys()].sort();
  // Include empty weeks so charts show the gap instead of joining across it.
  return keys.length ? allWeeks(keys[0], keys.at(-1)).map((w) => [w, weeks.get(w) ?? []]) : [];
}

/** Does this data set carry the extra consultant fields? */
export const hasDetails = (sessions) => sessions.some((s) => s.method !== undefined || s.settleMinutes != null);

/** Average minutes to fall asleep per week, naps vs bedtime. */
export function settlingByWeek(sessions) {
  return byWeek(sessions).map(([week, list]) => ({
    key: week,
    values: {
      nap: mean(list.filter((s) => s.type === 'nap' && s.settleMinutes != null).map((s) => s.settleMinutes)),
      night: mean(list.filter((s) => s.type === 'night' && s.settleMinutes != null).map((s) => s.settleMinutes)),
    },
  }));
}

export const WAKE_WINDOW_SERIES = [
  { key: 1, label: 'Before nap 1' },
  { key: 2, label: 'Before nap 2' },
  { key: 3, label: 'Before nap 3' },
  { key: 'bedtime', label: 'Before bedtime' },
];

/** Average wake window per week, by position in the day. */
export function wakeWindowsByWeek(sessions) {
  return byWeek(sessions).map(([week, list]) => ({
    key: week,
    values: Object.fromEntries(
      WAKE_WINDOW_SERIES.map(({ key }) => [
        key,
        mean(list.filter((s) => s.position === key).map(knownWindow).filter((w) => w != null)),
      ]),
    ),
  }));
}

/** Count of sleeps per week by how the baby fell asleep. */
export function methodsByWeek(sessions) {
  return byWeek(sessions).map(([week, list]) => {
    const counts = {};
    for (const s of list) {
      const label = methodLabel(s.method);
      if (label) counts[label] = (counts[label] ?? 0) + 1;
    }
    return { key: week, counts };
  });
}

/**
 * Nap count per day plus a smoothed "typical" count: the most frequent count in a
 * centred 7-day window, so one odd day doesn't register as a change.
 * Returns { points: [{ day, naps, typical }], changes: [{ day, from, to }] }.
 */
export function napCountTrend(days, window = 7) {
  const half = Math.floor(window / 2);
  const points = [];
  days.forEach((d, i) => {
    const counts = new Map();
    for (const n of days.slice(Math.max(0, i - half), i + half + 1)) counts.set(n.naps, (counts.get(n.naps) ?? 0) + 1);
    const best = Math.max(...counts.values());
    const tied = [...counts.keys()].filter((k) => counts.get(k) === best);
    // On a tie keep the previous typical count, so the line doesn't flicker.
    const prev = points.at(-1)?.typical;
    const typical = tied.includes(prev) ? prev : Math.max(...tied);
    points.push({ day: d.day, naps: d.naps, typical });
  });
  // The centred window anticipates a change by a day or two; start each new level on
  // the first day that actually has the new count.
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].typical;
    if (points[i].typical !== prev && points[i].naps !== points[i].typical) {
      const to = points[i].typical;
      let j = i;
      while (j < points.length && points[j].typical === to && points[j].naps !== to) j++;
      if (j < points.length && points[j].typical === to) for (let k = i; k < j; k++) points[k].typical = prev;
    }
  }
  const changes = points.slice(1).flatMap((p, i) =>
    p.typical !== points[i].typical ? [{ day: p.day, from: points[i].typical, to: p.typical }] : [],
  );
  return { points, changes };
}

/**
 * Today's daytime sleep against a target, for the "Daytime sleep tank".
 * Returns { naps, napMinutes, target, fill (0..1+), remaining, over, awakeSince, asleepSince }.
 */
export function daytimeTank(sessions, now, targetMinutes) {
  const today = dateKey(now);
  const naps = sessions.filter((s) => s.type === 'nap' && s.day === today).sort((a, b) => a.start - b.start);
  // A nap still in progress only counts up to now.
  const napMinutes = naps.reduce((sum, s) => sum + Math.max(0, minutesBetween(s.start, Math.min(s.end, now))), 0);
  const target = Math.max(1, Math.round(targetMinutes || 0));
  const current = sessions.find((s) => s.start <= now && s.end > now);
  const ended = sessions.filter((s) => s.end <= now).sort((a, b) => b.end - a.end)[0];
  return {
    naps,
    napMinutes,
    target,
    fill: napMinutes / target,
    remaining: Math.max(0, target - napMinutes),
    over: Math.max(0, napMinutes - target),
    asleepSince: current ? current.start : null,
    awakeSince: !current && ended && now - ended.end < 12 * MS_HOUR ? ended.end : null,
  };
}

/**
 * Last night's sleep for the tank card: the night logged under yesterday's date
 * (bedtime yesterday evening → wake-up this morning). Wakings are the gaps between its stretches.
 * Returns { bedtime, wake, sleptMinutes, wakings: [{ from, to, minutes }], awakeMinutes } or null.
 */
export function lastNight(sessions, now = new Date()) {
  const key = shiftDay(dateKey(now), -1);
  const pieces = sessions.filter((s) => s.type === 'night' && s.day === key && s.end <= now).sort((a, b) => a.start - b.start);
  if (!pieces.length) return null;
  const wakings = nightGaps(pieces);
  return {
    day: key,
    bedtime: pieces[0].start,
    wake: pieces.at(-1).end,
    sleptMinutes: pieces.reduce((sum, p) => sum + p.minutes, 0),
    wakings,
    awakeMinutes: awakeAtNight(wakings),
    feeds: wakings.filter((w) => w.feed).length,
  };
}

/**
 * Good times to meet friends, from the given calendar days (e.g. the last 5 days):
 * stretches between `from` and `to` (minutes after midnight) when she was awake on every day
 * (or all but one, if no such stretch exists) and not within `bufferBefore` minutes of falling asleep.
 * Returns up to `max` windows [{ from, to, days, of }] (minutes after midnight), longest first.
 */
export function friendsWindows(sessions, dayKeys, { from = 7 * 60, to = 19 * 60, minMinutes = 60, bufferBefore = 30, max = 2 } = {}) {
  const n = dayKeys.length;
  if (!n) return [];
  const goodDays = new Array(to - from).fill(0);
  for (const key of dayKeys) {
    const dayStart = keyToDate(key).getTime();
    const busy = new Array(to - from).fill(false);
    for (const s of sessions) {
      // Minutes of this calendar day covered by the sleep, plus the wind-down before it.
      const a = Math.floor((s.start.getTime() - dayStart) / MS_MIN) - bufferBefore;
      const b = Math.ceil((s.end.getTime() - dayStart) / MS_MIN);
      for (let t = Math.max(a, from); t < Math.min(b, to); t++) busy[t - from] = true;
    }
    busy.forEach((isBusy, i) => { if (!isBusy) goodDays[i] += 1; });
  }
  for (const need of n > 1 ? [n, n - 1] : [n]) {
    const windows = [];
    let start = null;
    for (let i = 0; i <= goodDays.length; i++) {
      const ok = i < goodDays.length && goodDays[i] >= need;
      if (ok && start === null) start = i;
      if (!ok && start !== null) {
        // Round inwards to 5 minutes so the suggestion reads nicely and stays inside the window.
        const a = Math.ceil((from + start) / 5) * 5;
        const b = Math.floor((from + i) / 5) * 5;
        if (b - a >= minMinutes) windows.push({ from: a, to: b, days: need, of: n });
        start = null;
      }
    }
    if (windows.length) return windows.sort((p, q) => (q.to - q.from) - (p.to - p.from)).slice(0, max).sort((p, q) => p.from - q.from);
  }
  return [];
}

/**
 * Forecast for the next (or current) nap: how long nap number N usually lasts, averaged over the
 * last `days` days with naps before today. N = today's saved naps + 1.
 * Returns { position, avgMinutes (null if those days had no nap N), samples, days }.
 */
export function upcomingNap(sessions, now = new Date(), days = 3) {
  const today = dateKey(now);
  const napsByDay = new Map();
  for (const s of sessions) {
    if (s.type !== 'nap' || s.end > now) continue;
    if (!napsByDay.has(s.day)) napsByDay.set(s.day, []);
    napsByDay.get(s.day).push(s);
  }
  const position = (napsByDay.get(today)?.length ?? 0) + 1;
  const previous = [...napsByDay.keys()].filter((d) => d < today).sort().slice(-days);
  const lengths = previous
    .map((d) => napsByDay.get(d).sort((a, b) => a.start - b.start)[position - 1])
    .filter(Boolean)
    .map((s) => s.minutes);
  return {
    position,
    avgMinutes: mean(lengths),
    samples: lengths.length,
    days: previous.length,
  };
}

/**
 * Expected morning wake-up for a night in progress: the 5-day average total sleep minus that day's
 * naps is the sleep still due tonight; time awake during the night so far pushes the wake-up later.
 * day: the night's sleep day; asleep: bedtime (Date). Returns { when, nightMinutes, napMinutes } or null.
 */
export function expectedWakeUp(sessions, day, asleep, avgTotalMinutes, awakeMinutes = 0) {
  if (!(avgTotalMinutes > 0)) return null;
  const napMinutes = sum(sessions.filter((s) => s.type === 'nap' && s.day === day && s.end <= asleep).map((s) => s.minutes));
  const nightMinutes = avgTotalMinutes - napMinutes;
  if (nightMinutes <= 0) return null;
  return { when: new Date(asleep.getTime() + (nightMinutes + awakeMinutes) * MS_MIN), nightMinutes, napMinutes };
}

/** How many naps today have ended by `now`. */
export const napsDoneToday = (sessions, now = new Date()) =>
  sessions.filter((s) => s.type === 'nap' && s.day === dateKey(now) && s.end <= now).length;

/**
 * Usual wake window before the next sleep, from the last `days` days before today:
 * the average time awake before nap N (N = today's saved naps + 1), or before bedtime when
 * those days had no nap N. Returns { target: N | 'bedtime', avgMinutes, samples } or null.
 */
export function upcomingWakeWindow(sessions, now = new Date(), days = 5) {
  const today = dateKey(now);
  const napsToday = napsDoneToday(sessions, now);
  const previous = [...new Set(sessions.filter((s) => s.day < today).map((s) => s.day))].sort().slice(-days);
  const windowsFor = (position) => previous
    .map((d) => sessions.find((s) => s.day === d && s.position === position))
    .map((s) => s && knownWindow(s))
    .filter((w) => w != null);
  for (const target of [napsToday + 1, 'bedtime']) {
    const w = windowsFor(target);
    if (w.length) return { target, avgMinutes: mean(w), samples: w.length };
  }
  return null;
}

/**
 * Actual numbers for one sleep day (no averages), for the "Last 5 days" table.
 * day: a dailyStats() record; sessions: all sessions (needed for the morning wake-up from the night before).
 */
export function dayDetails(day, sessions) {
  const naps = day.sessions.filter((s) => s.type === 'nap').sort((a, b) => a.start - b.start);
  const nightPieces = day.sessions.filter((s) => s.type === 'night').sort((a, b) => a.start - b.start);
  const bed = nightPieces[0] ?? null;
  // Morning wake-up = end of the night that was logged under the previous date.
  const prevKey = shiftDay(day.day, -1);
  const prevNight = sessions.filter((s) => s.type === 'night' && s.day === prevKey).sort((a, b) => a.end - b.end).at(-1);
  // Awake time: the day's wake windows (before each nap and before bedtime), only if all are known.
  const windows = [...naps, ...(bed ? [bed] : [])].map(knownWindow);
  const settles = naps.map((s) => s.settleMinutes ?? null);
  const known = [...settles, bed?.settleMinutes ?? null].filter((v) => v != null);
  const wakings = nightGaps(nightPieces);
  const firsts = [...naps, ...(bed ? [bed] : [])];
  return {
    day: day.day,
    totalMinutes: day.totalMinutes,
    nightMinutes: day.nightMinutes,
    naps: naps.length,
    napMinutes: day.napMinutes,
    napLengths: naps.map((s) => s.minutes),
    awakeMinutes: bed && windows.length && windows.every((w) => w != null) ? sum(windows) : null,
    napSettle: settles,
    bedSettle: bed?.settleMinutes ?? null,
    settleTotal: known.length ? sum(known) : null,
    bedtime: bed?.start ?? null,
    morningWake: prevNight?.end ?? null,
    nightWakings: wakings.length,
    nightAwakeMinutes: awakeAtNight(wakings),
    nightFeeds: wakings.filter((w) => w.feed).length,
    extendedNaps: naps.filter((s) => s.extended === true).length,
    napsAnswered: naps.filter((s) => s.extended != null).length,
    independent: firsts.filter((s) => methodLabel(s.method) === 'Independently').length,
    withMethod: firsts.filter((s) => s.method).length,
    napsIndependent: naps.filter((s) => methodLabel(s.method) === 'Independently').length,
    napsWithMethod: naps.filter((s) => s.method).length,
  };
}

/**
 * Total time awake during a day, for the night view of the Now card:
 * morning wake-up (end of the previous date's night) → bedtime, minus that day's naps.
 * Returns { minutes, wake, bedtime, napMinutes } or null when the morning wake-up isn't logged.
 */
export function dayAwakeTotal(sessions, day, bedtime) {
  const prevKey = shiftDay(day, -1);
  const wake = sessions.filter((s) => s.type === 'night' && s.day === prevKey).reduce((w, s) => (!w || s.end > w ? s.end : w), null);
  if (!wake || bedtime <= wake) return null;
  const napMinutes = sessions
    .filter((s) => s.type === 'nap' && s.day === day && s.start >= wake && s.end <= bedtime)
    .reduce((sum, s) => sum + s.minutes, 0);
  return { minutes: minutesBetween(wake, bedtime) - napMinutes, wake, bedtime, napMinutes };
}

/**
 * The night before a day (logged under the previous date): hours asleep and the night wakings that
 * weren't feeds, plus the number of feeds. Returns { minutes, wakings, awakeMinutes, feeds } or null
 * when that night isn't logged.
 */
export function nightBefore(sessions, day) {
  const prev = shiftDay(day, -1);
  const pieces = sessions.filter((s) => s.type === 'night' && s.day === prev).sort((a, b) => a.start - b.start);
  if (!pieces.length) return null;
  const gaps = nightGaps(pieces);
  const awake = gaps.filter((w) => !w.feed);
  return {
    minutes: sum(pieces.map((p) => p.minutes)),
    wakings: awake.length,
    awakeMinutes: sum(awake.map((w) => w.minutes)),
    feeds: gaps.length - awake.length,
  };
}

/**
 * Actual wake windows for the given days (no averages): one row per nap number plus bedtime,
 * one value per day (minutes, or null when not known). Rows only for naps that occurred.
 * Returns [{ key: 1 | 2 | … | 'bedtime', values: [minutes|null per day] }].
 */
export function wakeWindowGrid(sessions, dayKeys) {
  const byKey = new Map();
  let maxNap = 0;
  for (const s of sessions) {
    if (!dayKeys.includes(s.day) || s.position == null) continue;
    byKey.set(`${s.day}|${s.position}`, knownWindow(s));
    if (typeof s.position === 'number') maxNap = Math.max(maxNap, s.position);
  }
  const keys = [...Array.from({ length: maxNap }, (_, i) => i + 1), 'bedtime'];
  return keys.map((key) => ({ key, values: dayKeys.map((d) => byKey.get(`${d}|${key}`) ?? null) }))
    .filter((row) => row.key !== 'bedtime' || row.values.some((v) => v != null));
}
