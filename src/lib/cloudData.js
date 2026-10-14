// Pure helpers for the cloud log (no Firebase imports, so they are easy to test).
// Firestore layout: collection "months", one document per month ("2026-10") holding
// { entries: [entry, ...] } — one read per month keeps usage far inside the free quota.
import { methodLabel, moodLabel } from './insights.js';
import { formatClock } from './sleepData.js';

export const MONTHS = 'months';

export const monthKey = (day) => day.slice(0, 7);

/** Identity of a sleep for de-duplication: same day, type and time she fell asleep. */
export const entryKey = (e) => `${e.day}|${e.type}|${e.asleep}`;

export function groupByMonth(entries) {
  const months = new Map();
  for (const e of entries) {
    const m = monthKey(e.day);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(e);
  }
  return months;
}

/** Add incoming entries to a month's list, skipping ones already there. Returns { entries, added }. */
export function mergeEntries(existing, incoming) {
  const seen = new Set(existing.map(entryKey));
  const fresh = [];
  for (const e of incoming) {
    const k = entryKey(e);
    if (!seen.has(k)) {
      seen.add(k);
      fresh.push(e);
    }
  }
  return { entries: [...existing, ...fresh], added: fresh.length };
}

const pad = (n) => String(n).padStart(2, '0');
let counter = 0;
const importId = () => `imp-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * Convert parsed sessions (from an uploaded file) into entries for the cloud log.
 * Settling time, method and mood are kept; free-text notes are kept only for the simple layout.
 */
export function sessionsToEntries(sessions) {
  return sessions.map((s) => {
    const settleStart = s.settleMinutes != null ? new Date(s.start.getTime() - s.settleMinutes * 60000) : null;
    return {
      id: importId(),
      day: s.day,
      type: s.type,
      settle: settleStart ? `${pad(settleStart.getHours())}:${pad(settleStart.getMinutes())}` : '',
      asleep: formatClock(s.start),
      woke: formatClock(s.end),
      method: s.method ? methodLabel(s.method) : '',
      extended: s.type === 'nap' && s.extended != null ? s.extended : null,
      mood: s.mood ? moodLabel(s.mood) : '',
      notes: s.notes ?? '',
    };
  });
}
