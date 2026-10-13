// Sleeps entered by hand on the website. Stored in this browser only (localStorage).
import { rowsToSessions } from './sleepData.js';

const STORAGE_KEY = 'baby-sleep-entries-v1';

export const EXPORT_HEADERS = ['Date', 'Settling start', 'Fell asleep', 'Woke up', 'Type', 'How fell asleep', 'Mood after', 'Notes'];

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
 * Values: { day: 'YYYY-MM-DD', type: 'nap'|'night', settle, asleep, woke: 'HH:MM', method, mood, notes }
 */
export function makeEntry(values) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.day ?? '')) return { error: 'Choose a date.' };
  if (!values.asleep) return { error: 'Enter when she fell asleep.' };
  if (!values.woke) return { error: 'Enter when she woke up.' };
  if (values.asleep === values.woke) return { error: 'Fell asleep and woke up can’t be the same time.' };
  return {
    entry: {
      id: newId(),
      day: values.day,
      type: values.type === 'night' ? 'night' : 'nap',
      settle: values.settle || '',
      asleep: values.asleep,
      woke: values.woke,
      method: values.method || '',
      mood: values.mood || '',
      notes: (values.notes || '').trim(),
    },
  };
}

/** Entries as spreadsheet rows (header first), in the simple layout the site can read back. */
export function entriesToRows(entries) {
  const sorted = [...entries].sort((a, b) => (a.day + a.asleep).localeCompare(b.day + b.asleep));
  return [
    EXPORT_HEADERS,
    ...sorted.map((e) => [e.day, e.settle, e.asleep, e.woke, e.type === 'night' ? 'Night' : 'Nap', e.method, e.mood, e.notes]),
  ];
}

/** Convert entries to sleep sessions using the same rules as an uploaded simple spreadsheet. */
export function entriesToSessions(entries) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => (a.day + a.asleep).localeCompare(b.day + b.asleep));
  const { sessions } = rowsToSessions(entriesToRows(sorted));
  return sessions.map((s) => ({ ...s, manual: true }));
}
