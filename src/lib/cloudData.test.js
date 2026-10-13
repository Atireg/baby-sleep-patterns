import { describe, expect, it } from 'vitest';
import { entryKey, groupByMonth, mergeEntries, sessionsToEntries } from './cloudData.js';
import { entriesToSessions } from './entries.js';
import { rowsToSessions } from './sleepData.js';

const e = (day, type, asleep, woke, extra = {}) => ({ id: `${day}${asleep}`, day, type, settle: '', asleep, woke, method: '', mood: '', notes: '', ...extra });

describe('cloud data helpers', () => {
  it('groups by month and skips duplicates when merging', () => {
    const a = e('2026-09-30', 'night', '19:00', '06:30');
    const b = e('2026-10-01', 'nap', '09:00', '10:00');
    expect([...groupByMonth([a, b]).keys()]).toEqual(['2026-09', '2026-10']);
    const { entries, added } = mergeEntries([a], [a, { ...a, id: 'other' }, b]);
    expect(added).toBe(1);
    expect(entries.map(entryKey)).toEqual([entryKey(a), entryKey(b)]);
  });

  it('turns uploaded sessions into entries that rebuild the same sleeps', () => {
    const { sessions } = rowsToSessions([
      ['Date', 'Settling start', 'Fell asleep', 'Woke up', 'Type', 'How fell asleep', 'Mood after'],
      ['2026-10-01', '08:50', '09:00', '10:10', 'Nap', 'на ръце', 'плаче'],
      ['2026-10-01', '19:00', '19:20', '02:00', 'Night', 'Patting', ''],
      ['2026-10-01', '', '02:30', '06:45', 'Night', '', ''],
    ]);
    const entries = sessionsToEntries(sessions);
    expect(entries.map((x) => [x.day, x.type, x.settle, x.asleep, x.woke, x.method, x.mood])).toEqual([
      ['2026-10-01', 'nap', '08:50', '09:00', '10:10', 'Held in arms', 'Crying'],
      ['2026-10-01', 'night', '19:00', '19:20', '02:00', 'Patting', ''],
      ['2026-10-01', 'night', '', '02:30', '06:45', '', ''],
    ]);
    const rebuilt = entriesToSessions(entries);
    expect(rebuilt.map((s) => [s.start.getTime(), s.end.getTime()])).toEqual(sessions.map((s) => [s.start.getTime(), s.end.getTime()]));
  });
});
