// The sleep currently being tracked live ("Now" card): settling → asleep → woke up.
// Shape: { type: 'nap'|'night', settle: ISO|null, asleep: ISO|null, method: string }
import { countsAsSleep, inferType } from './sleepData.js';
import { checkWakings, entriesToSessions, newId, toYesNo } from './entries.js';
import { readStored, writeStored } from './storage.js';
import { MS_HOUR, MS_MIN, atOrAfter, clockMinutes, dateKey, hhmm, minutesBetween } from './time.js';

const LOCAL_KEY = 'baby-sleep-live-v1';
/** Longer than this can't be one sleep (or one awake stretch); used to catch mistyped times. */
const MAX_SPAN = 16 * MS_HOUR;

export const loadLocalLive = () => readStored(LOCAL_KEY);
/** Storage blocked: the state lasts for this visit only. */
export const saveLocalLive = (live) => writeStored(LOCAL_KEY, live || null);

/** Nap or night from the clock time (night = 18:00–05:59). */
export const typeAt = (date) => inferType(date.getHours() * 60 + date.getMinutes());

/**
 * The log date for a sleep: naps use their own date; a night uses the evening it began,
 * so a night sleep starting after midnight (before noon) belongs to the previous date.
 */
export function sleepDay(type, asleep) {
  if (type === 'night' && asleep.getHours() < 12) {
    const prev = new Date(asleep);
    prev.setDate(prev.getDate() - 1);
    return dateKey(prev);
  }
  return dateKey(asleep);
}

/** Replace the time of `base` with "HH:MM", choosing the latest such moment not after `notAfter`. */
export function atTime(hhmmText, notAfter) {
  const d = new Date(notAfter);
  d.setHours(0, clockMinutes(hhmmText), 0, 0);
  if (d > notAfter) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Turn a finished live sleep into a form entry, or { error }.
 * extra: { mood, notes }
 */
export function liveToEntry(live, woke, extra = {}) {
  if (!live?.asleep) return { error: 'Tap “Fell asleep” first.' };
  const asleep = new Date(live.asleep);
  if (woke <= asleep) return { error: 'Wake-up time must be after she fell asleep.' };
  if (hhmm(woke) === hhmm(asleep) && woke - asleep < MS_MIN) return { error: 'That sleep was shorter than a minute — tap Cancel to discard it.' };
  if (woke - asleep > MAX_SPAN) return { error: 'That would be a sleep of more than 16 hours — check the times.' };
  const settle = live.settle ? new Date(live.settle) : null;
  // Night wakings that ended before she got up for the day.
  const wakings = (live.wakings ?? [])
    .filter((w) => new Date(w.to) < woke)
    .map((w) => ({ from: hhmm(new Date(w.from)), to: hhmm(new Date(w.to)), feed: Boolean(w.feed) }));
  const checked = live.type === 'night' ? checkWakings(hhmm(asleep), hhmm(woke), wakings) : { wakings: [] };
  if (checked.error) return { error: checked.error };
  return {
    entry: {
      id: newId(),
      day: sleepDay(live.type, asleep),
      type: live.type,
      settle: settle && settle <= asleep ? hhmm(settle) : '',
      asleep: hhmm(asleep),
      woke: hhmm(woke),
      method: live.method || '',
      mood: extra.mood || '',
      notes: (extra.notes || '').trim(),
      wakings: checked.wakings,
      extended: live.type === 'nap' ? toYesNo(extra.extended) : null,
    },
  };
}

/**
 * Time awake during a tracked night up to `until` (ms): the wakings that ended by then (short feeds
 * count as sleep) plus the waking in progress.
 */
export function nightAwakeMs(live, until) {
  let ms = 0;
  for (const w of live?.wakings ?? []) {
    const from = new Date(w.from);
    const to = new Date(w.to);
    if (to <= until && !countsAsSleep(w.feed, minutesBetween(from, to))) ms += to - from;
  }
  if (live?.wakingFrom) ms += Math.max(0, until - new Date(live.wakingFrom));
  return ms;
}

/**
 * When the current awake period began: the later of the last logged sleep's end and a
 * manually started awake timer (live.awakeFrom). Null while asleep or when unknown
 * (nothing in the last 16 hours).
 */
export function awakeSince(sessions, live, now = new Date()) {
  if (live?.asleep) return null;
  let latest = null;
  for (const s of sessions) if (s.end <= now && (!latest || s.end > latest)) latest = s.end;
  const manual = live?.awakeFrom ? new Date(live.awakeFrom) : null;
  if (manual && manual <= now && (!latest || manual > latest)) latest = manual;
  return latest && now - latest < MAX_SPAN ? latest : null;
}

/** The first moment at or after `after` whose clock reads "HH:MM". */
const atOrAfterClock = (hhmmText, after) => atOrAfter(after, clockMinutes(hhmmText));

/**
 * Night wakings edited in the Now card ("HH:MM" rows) back to absolute times, read forward from
 * `asleep`. `wakingFrom` is the waking in progress ("" when she is asleep). Returns
 * { wakings: [{ from, to, feed }] (ISO), wakingFrom: ISO|null } or { error }.
 */
export function resolveWakings(asleep, rows, wakingFrom, now = new Date()) {
  const wakings = [];
  const minute = (d) => new Date(Math.floor(d / MS_MIN) * MS_MIN);
  let cursor = minute(asleep);
  for (const [i, row] of rows.entries()) {
    const n = rows.length > 1 ? ` ${i + 1}` : '';
    if (!row.from || !row.to) return { error: `Night waking${n}: fill in both times, or remove it.` };
    const from = atOrAfterClock(row.from, cursor);
    const to = atOrAfterClock(row.to, from);
    if (+from === +cursor) return { error: `Night waking${n} must start after she ${i ? 'went back to sleep' : 'fell asleep'}.` };
    if (+to === +from) return { error: `Night waking${n}: “Back asleep” must be after “Woke at”.` };
    if (to > now) return { error: `Night waking${n} ends in the future — check the times and their order.` };
    wakings.push({ from: from.toISOString(), to: to.toISOString(), feed: Boolean(row.feed) });
    cursor = to;
  }
  let current = null;
  if (wakingFrom) {
    current = atOrAfterClock(wakingFrom, cursor);
    if (+current === +cursor) return { error: 'She must have woken up after she last fell asleep.' };
    if (current > now) return { error: '“Awake since” is in the future — check the time.' };
  }
  return { wakings, wakingFrom: current ? current.toISOString() : null };
}

/**
 * The Now card after a sleep was added, edited or deleted in the sleep log (entry = the saved
 * entry, or null for a delete), so the log always wins:
 * - a manually started awake timer is dropped — the awake timer then runs from the logged sleeps;
 * - a sleep in progress that the logged entry covers (it started within the entry's times) is
 *   finished, so the Now card stops tracking it.
 */
export function liveAfterLogEdit(live, entry) {
  if (!live) return live;
  const started = live.asleep ?? live.settle;
  if (!started) return null; // only a manual awake timer
  const pieces = entry ? entriesToSessions([entry]) : [];
  if (pieces.length) {
    const t = new Date(started);
    const from = pieces[0].start.getTime() - MS_MIN;
    if (t >= from && t < pieces.at(-1).end) return null;
  }
  return live.awakeFrom ? { ...live, awakeFrom: null } : live;
}

/**
 * Change when she woke up for the awake timer ("awake since" edited in the Now card).
 * When the timer runs from a logged sleep, that sleep's wake-up time changes (the log wins);
 * otherwise it moves the manual awake timer. Returns { entry } (the updated entry),
 * { awakeFrom } (ISO) or { error }.
 */
export function editAwakeSince(entries, since, newTime, now = new Date()) {
  if (newTime > now) return { error: 'That time is in the future.' };
  let last = null;
  for (const e of entries) {
    const pieces = entriesToSessions([e]);
    if (!pieces.length) continue;
    const end = pieces.at(-1).end;
    if (end <= now && (!last || end > last.end)) last = { entry: e, pieces, start: pieces[0].start, end };
  }
  if (!last || !since || Math.abs(last.end - since) >= MS_MIN) {
    if (last && newTime < last.end) return { error: `A logged sleep ends at ${hhmm(last.end)} — pick a later time, or edit that sleep in the log.` };
    return { awakeFrom: newTime.toISOString() };
  }
  if (newTime <= last.start) return { error: `She fell asleep at ${hhmm(last.start)} — the wake-up time must be after that.` };
  if (newTime - last.start > MAX_SPAN) return { error: 'That would be a sleep of more than 16 hours — check the time.' };
  const woke = hhmm(newTime);
  if (woke === last.entry.asleep) return { error: 'Woke up can’t be the same time she fell asleep.' };
  // Night wakings that would now fall after the wake-up are dropped.
  // (Stretch i + 1 starts when waking i ends.)
  const wakings = (last.entry.wakings ?? []).filter((_, i) => last.pieces[i + 1]?.start < newTime);
  return { entry: { ...last.entry, woke, wakings } };
}
