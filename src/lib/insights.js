// Weekly aggregates for the consultant-log insights (settling, wake windows, how sleep started).

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

export const methodLabel = (m) => (m ? METHOD_LABELS[m.toLowerCase()] ?? OTHER_METHOD : null);
export const moodLabel = (m) => (m ? MOOD_LABELS[m.toLowerCase()] ?? m : null);

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
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
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
    avgMorningWake: clock(dayMeta.map((d) => d.morningWake)),
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
