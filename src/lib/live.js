// The sleep currently being tracked live ("Now" card): settling → asleep → woke up.
// Shape: { type: 'nap'|'night', settle: ISO|null, asleep: ISO|null, method: string }
import { inferType } from './sleepData.js';
import { checkWakings, toYesNo } from './entries.js';

const LOCAL_KEY = 'baby-sleep-live-v1';
const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function loadLocalLive() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveLocalLive(live) {
  try {
    if (live) localStorage.setItem(LOCAL_KEY, JSON.stringify(live));
    else localStorage.removeItem(LOCAL_KEY);
  } catch { /* storage blocked: state lasts for this visit only */ }
}

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
  const [h, m] = hhmmText.split(':').map(Number);
  const d = new Date(notAfter);
  d.setHours(h, m, 0, 0);
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
  if (hhmm(woke) === hhmm(asleep) && woke - asleep < 60000) return { error: 'That sleep was shorter than a minute — tap Cancel to discard it.' };
  if (woke - asleep > 16 * 3600000) return { error: 'That would be a sleep of more than 16 hours — check the times.' };
  const settle = live.settle ? new Date(live.settle) : null;
  // Night wakings that ended before she got up for the day.
  const wakings = (live.wakings ?? [])
    .filter((w) => new Date(w.to) < woke)
    .map((w) => ({ from: hhmm(new Date(w.from)), to: hhmm(new Date(w.to)), feed: Boolean(w.feed) }));
  const checked = live.type === 'night' ? checkWakings(hhmm(asleep), hhmm(woke), wakings) : { wakings: [] };
  if (checked.error) return { error: checked.error };
  return {
    entry: {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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

/** "1:05:09" / "12:03" style running timer. */
export function formatTimer(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
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
  return latest && now - latest < 16 * 3600000 ? latest : null;
}

/** The first moment at or after `after` whose clock reads "HH:MM". */
function atOrAfter(hhmmText, after) {
  const [h, m] = hhmmText.split(':').map(Number);
  const d = new Date(after);
  d.setHours(h, m, 0, 0);
  if (d < after) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Night wakings edited in the Now card ("HH:MM" rows) back to absolute times, read forward from
 * `asleep`. `wakingFrom` is the waking in progress ("" when she is asleep). Returns
 * { wakings: [{ from, to, feed }] (ISO), wakingFrom: ISO|null } or { error }.
 */
export function resolveWakings(asleep, rows, wakingFrom, now = new Date()) {
  const wakings = [];
  const minute = (d) => new Date(Math.floor(d / 60000) * 60000);
  let cursor = minute(asleep);
  for (const [i, row] of rows.entries()) {
    const n = rows.length > 1 ? ` ${i + 1}` : '';
    if (!row.from || !row.to) return { error: `Night waking${n}: fill in both times, or remove it.` };
    const from = atOrAfter(row.from, cursor);
    const to = atOrAfter(row.to, from);
    if (+from === +cursor) return { error: `Night waking${n} must start after she ${i ? 'went back to sleep' : 'fell asleep'}.` };
    if (+to === +from) return { error: `Night waking${n}: “Back asleep” must be after “Woke at”.` };
    if (to > now) return { error: `Night waking${n} ends in the future — check the times and their order.` };
    wakings.push({ from: from.toISOString(), to: to.toISOString(), feed: Boolean(row.feed) });
    cursor = to;
  }
  let current = null;
  if (wakingFrom) {
    current = atOrAfter(wakingFrom, cursor);
    if (+current === +cursor) return { error: 'She must have woken up after she last fell asleep.' };
    if (current > now) return { error: '“Awake since” is in the future — check the time.' };
  }
  return { wakings, wakingFrom: current ? current.toISOString() : null };
}
