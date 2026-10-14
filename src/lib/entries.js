// Sleeps entered by hand on the website. Stored in this browser only (localStorage).
import { rowsToSessions } from './sleepData.js';

const STORAGE_KEY = 'baby-sleep-entries-v1';

export const EXPORT_HEADERS = ['Date', 'Settling start', 'Fell asleep', 'Woke up', 'Type', 'How fell asleep', 'Mood after', 'Notes', 'Night wakings', 'Nap extended'];

export function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Validate form values. Returns { entry } or { error }.
 * Values: { day: 'YYYY-MM-DD', type: 'nap'|'night', settle, asleep, woke: 'HH:MM', method, mood, notes,
 *           wakings: [{ from: 'HH:MM', to: 'HH:MM', feed }] (nights only: times she was awake; feed = woke to feed) }
 */
export function makeEntry(values, id = newId()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.day ?? '')) return { error: 'Choose a date.' };
  if (!values.asleep) return { error: 'Enter when she fell asleep.' };
  if (!values.woke) return { error: 'Enter when she woke up.' };
  if (values.asleep === values.woke) return { error: 'Fell asleep and woke up can’t be the same time.' };
  const type = values.type === 'night' ? 'night' : 'nap';
  const checked = type === 'night' ? checkWakings(values.asleep, values.woke, values.wakings ?? []) : { wakings: [] };
  if (checked.error) return { error: checked.error };
  return {
    entry: {
      id,
      day: values.day,
      type,
      settle: values.settle || '',
      asleep: values.asleep,
      woke: values.woke,
      method: values.method || '',
      mood: values.mood || '',
      notes: (values.notes || '').trim(),
      wakings: checked.wakings,
      // Naps only: was the nap extended (re-settled to sleep longer)? true / false / null = not answered.
      extended: type === 'nap' ? toYesNo(values.extended) : null,
    },
  };
}

/** 'yes' / true → true, 'no' / false → false, anything else → null. */
export const toYesNo = (v) => (v === true || v === 'yes' ? true : v === false || v === 'no' ? false : null);

const toMin = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

/** Night wakings must lie inside the night, in order, without overlapping. Blank rows are dropped. */
export function checkWakings(asleep, woke, wakings) {
  const list = wakings.filter((w) => w.from || w.to);
  if (list.some((w) => !w.from || !w.to)) return { error: 'Each night waking needs both “woke at” and “back asleep at”.' };
  // Minutes after falling asleep, so times after midnight compare correctly.
  const rel = (t) => (toMin(t) - toMin(asleep) + 1440) % 1440;
  const end = rel(woke);
  const sorted = [...list].sort((a, b) => rel(a.from) - rel(b.from));
  let last = 0;
  for (const w of sorted) {
    const a = rel(w.from);
    const b = rel(w.to);
    if (a <= last || b <= a || b >= end) {
      return { error: `Night waking ${w.from}–${w.to} must be between falling asleep (${asleep}) and waking up (${woke}), and not overlap another.` };
    }
    last = b;
  }
  return { wakings: sorted.map((w) => ({ from: w.from, to: w.to, feed: Boolean(w.feed) })) };
}

export const formatWakings = (wakings = []) => wakings.map((w) => `${w.from}-${w.to}${w.feed ? ' feed' : ''}`).join(', ');
/** Entries as spreadsheet rows (header first), in the simple layout the site can read back. */
export function entriesToRows(entries) {
  const sorted = [...entries].sort((a, b) => (a.day + a.asleep).localeCompare(b.day + b.asleep));
  return [
    EXPORT_HEADERS,
    ...sorted.map((e) => [
      e.day, e.settle, e.asleep, e.woke, e.type === 'night' ? 'Night' : 'Nap', e.method, e.mood, e.notes, formatWakings(e.wakings),
      e.type === 'nap' && e.extended != null ? (e.extended ? 'Yes' : 'No') : '',
    ]),
  ];
}

/** Convert entries to sleep sessions using the same rules as an uploaded simple spreadsheet. */
export function entriesToSessions(entries) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => (a.day + a.asleep).localeCompare(b.day + b.asleep));
  const { sessions } = rowsToSessions(entriesToRows(sorted));
  return sessions.map((s) => ({ ...s, manual: true }));
}

const sameSleep = (a, b) => a.day === b.day && a.type === b.type && a.asleep === b.asleep;

/**
 * Replace the entry with the same id. Returns { list } or { error } when the edit would
 * duplicate another sleep (same day, type and fell-asleep time).
 */
export function replaceEntry(list, updated) {
  if (!list.some((e) => e.id === updated.id)) return { error: 'That sleep no longer exists — it may have been deleted.' };
  if (list.some((e) => e.id !== updated.id && sameSleep(e, updated))) {
    return { error: 'Another sleep with the same date, type and fell-asleep time already exists.' };
  }
  return { list: list.map((e) => (e.id === updated.id ? updated : e)) };
}

/** Form values for editing an existing entry. */
export const entryToValues = (e) => ({
  day: e.day, type: e.type, settle: e.settle || '', asleep: e.asleep, woke: e.woke,
  method: e.method || '', mood: e.mood || '', notes: e.notes || '',
  wakings: (e.wakings ?? []).map((w) => ({ ...w })),
  extended: e.extended === true ? 'yes' : e.extended === false ? 'no' : '',
});
