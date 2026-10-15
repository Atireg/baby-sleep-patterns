// Weekly aggregates for the consultant-log insights (settling, wake windows, how sleep started).
import { allWeeks } from './series.js';
import { countsAsSleep } from './sleepData.js';

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
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

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
        mean(list.filter((s) => s.position === key && s.wakeWindow != null && s.wakeWindow < 8 * 60).map((s) => s.wakeWindow)),
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

// Without a morning-wake column, use when each night's last stretch ended.
function morningWakes(sessions) {
  const lastEnd = new Map();
  for (const s of sessions) if (s.type === 'night') lastEnd.set(s.day, s.end);
  return [...lastEnd.values()].map((d) => d.getHours() * 60 + d.getMinutes());
}

/** Overall shares for the headline numbers. */
export function detailSummary(sessions, dayMeta = []) {
  const firsts = firstPieces(sessions);
  const withMethod = firsts.filter((s) => s.method);
  const naps = firsts.filter((s) => s.type === 'nap' && s.mood);
  const clock = (xs) => mean(xs.filter((x) => x != null));
  return {
    independentShare: withMethod.length ? withMethod.filter((s) => methodLabel(s.method) === 'Independently').length / withMethod.length : null,
    cryingAfterNapShare: naps.length ? naps.filter((s) => ['Crying', 'Fussy'].includes(moodLabel(s.mood))).length / naps.length : null,
    avgBedtime: clock(firsts.filter((s) => s.type === 'night').map((s) => s.start.getHours() * 60 + s.start.getMinutes())),
    avgMorningWake: dayMeta.some((d) => d.morningWake != null)
      ? clock(dayMeta.map((d) => d.morningWake))
      : clock(morningWakes(sessions)),
  };
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
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const naps = sessions.filter((s) => s.type === 'nap' && s.day === today).sort((a, b) => a.start - b.start);
  // A nap still in progress only counts up to now.
  const napMinutes = naps.reduce((sum, s) => sum + Math.max(0, Math.round((Math.min(s.end, now) - s.start) / 60000)), 0);
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
    awakeSince: !current && ended && now - ended.end < 12 * 3600000 ? ended.end : null,
  };
}

/**
 * Awake-time averages for the summary tiles.
 * - avgWakeWindow: mean time awake before each nap and before bedtime.
 * - avgAwakePerDay: mean total awake time from morning wake-up to falling asleep for the night,
 *   counted only for days where every wake window of the day is known (naps + bedtime).
 */
export function awakeStats(sessions) {
  const windows = [];
  const byDay = new Map();
  for (const s of sessions) {
    if (s.position === undefined || s.position === null) continue; // later night stretches aren't daytime
    // 8h+ "windows" mean a missing entry, not a real wake window.
    const w = s.wakeWindow != null && s.wakeWindow < 8 * 60 ? s.wakeWindow : null;
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day).push({ ...s, wakeWindow: w });
    if (w != null) windows.push(w);
  }
  const dayTotals = [];
  for (const list of byDay.values()) {
    const complete = list.some((s) => s.position === 'bedtime') && list.every((s) => s.wakeWindow != null);
    if (complete) dayTotals.push(list.reduce((sum, s) => sum + s.wakeWindow, 0));
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { avgWakeWindow: mean(windows), avgAwakePerDay: mean(dayTotals), days: dayTotals.length };
}

/**
 * Last night's sleep for the tank card: the night logged under yesterday's date
 * (bedtime yesterday evening → wake-up this morning). Wakings are the gaps between its stretches.
 * Returns { bedtime, wake, sleptMinutes, wakings: [{ from, to, minutes }], awakeMinutes } or null.
 */
export function lastNight(sessions, now = new Date()) {
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const key = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  const pieces = sessions.filter((s) => s.type === 'night' && s.day === key && s.end <= now).sort((a, b) => a.start - b.start);
  if (!pieces.length) return null;
  const details = pieces.find((p) => p.nightWakings)?.nightWakings ?? [];
  const clockMin = (d) => d.getHours() * 60 + d.getMinutes();
  const wakings = [];
  for (let i = 1; i < pieces.length; i++) {
    const minutes = Math.round((pieces[i].start - pieces[i - 1].end) / 60000);
    if (minutes <= 0) continue;
    const from = pieces[i - 1].end;
    const feed = details.some((w) => w.feed && w.from === clockMin(from));
    wakings.push({ from, to: pieces[i].start, minutes, feed, countedAsSleep: countsAsSleep(feed, minutes) });
  }
  return {
    day: key,
    bedtime: pieces[0].start,
    wake: pieces.at(-1).end,
    sleptMinutes: pieces.reduce((sum, p) => sum + p.minutes, 0),
    wakings,
    // Short feeds count as sleep, not as time awake.
    awakeMinutes: wakings.filter((w) => !w.countedAsSleep).reduce((sum, w) => sum + w.minutes, 0),
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
    const [y, m, d] = key.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d).getTime();
    const busy = new Array(to - from).fill(false);
    for (const s of sessions) {
      // Minutes of this calendar day covered by the sleep, plus the wind-down before it.
      const a = Math.floor((s.start.getTime() - dayStart) / 60000) - bufferBefore;
      const b = Math.ceil((s.end.getTime() - dayStart) / 60000);
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
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
    avgMinutes: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
    samples: lengths.length,
    days: previous.length,
  };
}

/**
 * Expected bedtime: the average time she fell asleep for the night over the last `days` nights
 * before today (first stretch of each night). Times after midnight count as late evening.
 * Returns { minutes (after midnight, may exceed 1440), samples } or null.
 */
export function expectedBedtime(sessions, now = new Date(), days = 3) {
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const firstByDay = new Map();
  for (const s of sessions) {
    if (s.type !== 'night' || s.day >= today) continue;
    const cur = firstByDay.get(s.day);
    if (!cur || s.start < cur.start) firstByDay.set(s.day, s);
  }
  const nights = [...firstByDay.keys()].sort().slice(-days).map((d) => firstByDay.get(d));
  if (!nights.length) return null;
  const mins = nights.map((s) => {
    const m = s.start.getHours() * 60 + s.start.getMinutes();
    return m < 12 * 60 ? m + 1440 : m;
  });
  return { minutes: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length), samples: mins.length };
}

/**
 * Expected morning wake-up: the average time the last `days` completed nights ended
 * (last stretch of each night). Returns { minutes (after midnight), samples } or null.
 */
export function expectedWakeUp(sessions, now = new Date(), days = 3) {
  const lastByDay = new Map();
  for (const s of sessions) {
    if (s.type !== 'night' || s.end > now) continue;
    const cur = lastByDay.get(s.day);
    if (!cur || s.end > cur.end) lastByDay.set(s.day, s);
  }
  const nights = [...lastByDay.keys()].sort().slice(-days).map((d) => lastByDay.get(d));
  if (!nights.length) return null;
  // Morning times; a (rare) wake-up after noon counts as the previous evening.
  const mins = nights.map((s) => {
    const m = s.end.getHours() * 60 + s.end.getMinutes();
    return m > 12 * 60 ? m - 1440 : m;
  });
  return { minutes: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length), samples: mins.length };
}

/**
 * Usual wake window before the next sleep, from the last `days` days before today:
 * the average time awake before nap N (N = today's saved naps + 1), or before bedtime when
 * those days had no nap N. Returns { target: N | 'bedtime', avgMinutes, samples } or null.
 */
export function upcomingWakeWindow(sessions, now = new Date(), days = 5) {
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const napsToday = sessions.filter((s) => s.type === 'nap' && s.day === today && s.end <= now).length;
  const previous = [...new Set(sessions.filter((s) => s.day < today).map((s) => s.day))].sort().slice(-days);
  const windowsFor = (position) => previous
    .map((d) => sessions.find((s) => s.day === d && s.position === position))
    .filter((s) => s && s.wakeWindow != null && s.wakeWindow < 8 * 60)
    .map((s) => s.wakeWindow);
  for (const target of [napsToday + 1, 'bedtime']) {
    const w = windowsFor(target);
    if (w.length) return { target, avgMinutes: w.reduce((a, b) => a + b, 0) / w.length, samples: w.length };
  }
  return null;
}

/**
 * Time to fall asleep (from "started settling" to asleep) for the summary tiles.
 * - avgPerNap: mean settling time over naps with a settling time.
 * - avgPerDay: mean of each day's total settling time (naps + bedtime), over days with any settling time.
 * Night stretches after a waking have no settling time, so they don't count.
 */
export function settlingStats(sessions) {
  const naps = sessions.filter((s) => s.type === 'nap' && s.settleMinutes != null);
  const perDay = new Map();
  for (const s of sessions) {
    if (s.settleMinutes == null) continue;
    perDay.set(s.day, (perDay.get(s.day) ?? 0) + s.settleMinutes);
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { avgPerNap: mean(naps.map((s) => s.settleMinutes)), avgPerDay: mean([...perDay.values()]), days: perDay.size };
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
  const [y, m, d] = day.day.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  const prevNight = sessions.filter((s) => s.type === 'night' && s.day === prevKey).sort((a, b) => a.end - b.end).at(-1);
  // Awake time: the day's wake windows (before each nap and before bedtime), only if all are known.
  const windows = [...naps, ...(bed ? [bed] : [])].map((s) => (s.wakeWindow != null && s.wakeWindow < 8 * 60 ? s.wakeWindow : null));
  const settles = naps.map((s) => s.settleMinutes ?? null);
  const known = [...settles, bed?.settleMinutes ?? null].filter((v) => v != null);
  const details = nightPieces.find((p) => p.nightWakings)?.nightWakings ?? [];
  const wakings = [];
  for (let i = 1; i < nightPieces.length; i++) {
    const from = nightPieces[i - 1].end;
    const minutes = Math.round((nightPieces[i].start - from) / 60000);
    const feed = details.some((w) => w.feed && w.from === from.getHours() * 60 + from.getMinutes());
    wakings.push({ minutes, asSleep: countsAsSleep(feed, minutes) });
  }
  const firsts = [...naps, ...(bed ? [bed] : [])];
  return {
    day: day.day,
    totalMinutes: day.totalMinutes,
    nightMinutes: day.nightMinutes,
    naps: naps.length,
    napMinutes: day.napMinutes,
    napLengths: naps.map((s) => s.minutes),
    awakeMinutes: bed && windows.length && windows.every((w) => w != null) ? windows.reduce((a, b) => a + b, 0) : null,
    napSettle: settles,
    bedSettle: bed?.settleMinutes ?? null,
    settleTotal: known.length ? known.reduce((a, b) => a + b, 0) : null,
    bedtime: bed?.start ?? null,
    morningWake: prevNight?.end ?? null,
    nightWakings: wakings.length,
    nightAwakeMinutes: wakings.filter((w) => !w.asSleep).reduce((a, w) => a + w.minutes, 0),
    nightFeeds: details.filter((w) => w.feed).length,
    extendedNaps: naps.filter((s) => s.extended === true).length,
    napsAnswered: naps.filter((s) => s.extended != null).length,
    independent: firsts.filter((s) => methodLabel(s.method) === 'Independently').length,
    withMethod: firsts.filter((s) => s.method).length,
  };
}

/**
 * Total time awake during a day, for the night view of the Now card:
 * morning wake-up (end of the previous date's night) → bedtime, minus that day's naps.
 * Returns { minutes, wake, bedtime, napMinutes } or null when the morning wake-up isn't logged.
 */
export function dayAwakeTotal(sessions, day, bedtime) {
  const [y, m, d] = day.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  const wake = sessions.filter((s) => s.type === 'night' && s.day === prevKey).reduce((w, s) => (!w || s.end > w ? s.end : w), null);
  if (!wake || bedtime <= wake) return null;
  const napMinutes = sessions
    .filter((s) => s.type === 'nap' && s.day === day && s.start >= wake && s.end <= bedtime)
    .reduce((sum, s) => sum + s.minutes, 0);
  return { minutes: Math.round((bedtime - wake) / 60000) - napMinutes, wake, bedtime, napMinutes };
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
    byKey.set(`${s.day}|${s.position}`, s.wakeWindow != null && s.wakeWindow < 8 * 60 ? s.wakeWindow : null);
    if (typeof s.position === 'number') maxNap = Math.max(maxNap, s.position);
  }
  const keys = [...Array.from({ length: maxNap }, (_, i) => i + 1), 'bedtime'];
  return keys.map((key) => ({ key, values: dayKeys.map((d) => byKey.get(`${d}|${key}`) ?? null) }))
    .filter((row) => row.key !== 'bedtime' || row.values.some((v) => v != null));
}
