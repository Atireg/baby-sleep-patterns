// Rest mode: periods when sleep is disrupted (illness, a vaccination, travel, …). Sleeps on those days
// are still logged and shown, but left out of every average and forecast.
// Period: { id, kind, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' | null (still on), note }.
import { dateKey, shiftDay } from './time.js';
import { readStored, writeStored } from './storage.js';

export const REST_KINDS = [
  { key: 'sick', emoji: '🤒', label: 'Sick' },
  { key: 'vaccine', emoji: '💉', label: 'Vaccination' },
  { key: 'travel', emoji: '✈️', label: 'Travel' },
  { key: 'other', emoji: '✨', label: 'Other' },
];
export const restKind = (key) => REST_KINDS.find((k) => k.key === key) ?? REST_KINDS.at(-1);

const KEY = 'baby-sleep-rest-periods';
export function loadRestPeriods() {
  const stored = readStored(KEY, []);
  return Array.isArray(stored) ? stored : [];
}
export const saveLocalRestPeriods = (periods) => writeStored(KEY, periods);

/** The period still on (no end date), or null. */
export const activeRest = (periods) => periods.find((p) => !p.to) ?? null;

/** Every rest day → its period (a period still on runs to today). */
export function restDayMap(periods, today = dateKey(new Date())) {
  const days = new Map();
  for (const p of periods) {
    const to = p.to ?? today;
    // At most a year per period, in case of a mistyped date.
    for (let day = p.from, n = 0; day <= to && n < 366; day = shiftDay(day, 1), n++) days.set(day, p);
  }
  return days;
}

/** "🤒" for a rest day (restDays: restDayMap result), else ''. */
export const restMark = (restDays, day) => (restDays?.has(day) ? restKind(restDays.get(day).kind).emoji : '');

export const startRest = (periods, kind, today = dateKey(new Date())) =>
  [...periods, { id: `${Date.now().toString(36)}`, kind, from: today, to: null, note: '' }];
export const updateRest = (periods, id, patch) => periods.map((p) => (p.id === id ? { ...p, ...patch } : p));
/** Ends a period today (rest mode covers today too). */
export const endRest = (periods, id, today = dateKey(new Date())) =>
  periods.map((p) => (p.id === id ? { ...p, to: p.from > today ? p.from : today } : p));
export const removeRest = (periods, id) => periods.filter((p) => p.id !== id);

// The rest days the averages skip, set by the app before anything is computed.
let restDays = new Set();
export const setRestDays = (days) => { restDays = new Set(days); };
export const isRestDay = (day) => restDays.has(day);
