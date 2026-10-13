import { describe, expect, it } from 'vitest';
import { atTime, formatTimer, liveToEntry, sleepDay, typeAt } from './live.js';
import { entriesToSessions } from './entries.js';

describe('live tracking', () => {
  it('picks nap/night and the log date', () => {
    expect(typeAt(new Date(2026, 9, 13, 9, 30))).toBe('nap');
    expect(typeAt(new Date(2026, 9, 13, 19, 30))).toBe('night');
    expect(sleepDay('night', new Date(2026, 9, 13, 19, 30))).toBe('2026-10-13');
    expect(sleepDay('night', new Date(2026, 9, 14, 2, 10))).toBe('2026-10-13');
    expect(sleepDay('nap', new Date(2026, 9, 14, 9, 0))).toBe('2026-10-14');
  });

  it('turns a finished night into an entry that rebuilds the same times', () => {
    const live = { type: 'night', settle: new Date(2026, 9, 13, 19, 5).toISOString(), asleep: new Date(2026, 9, 13, 19, 20).toISOString(), method: 'Patting' };
    const woke = new Date(2026, 9, 14, 6, 40);
    const { entry } = liveToEntry(live, woke, { mood: 'Good' });
    expect(entry).toMatchObject({ day: '2026-10-13', type: 'night', settle: '19:05', asleep: '19:20', woke: '06:40', method: 'Patting', mood: 'Good' });
    const [s] = entriesToSessions([entry]);
    expect([s.start.getTime(), s.end.getTime(), s.settleMinutes]).toEqual([new Date(live.asleep).getTime(), woke.getTime(), 15]);
    // A stretch after a night waking also lands on the evening's date.
    const late = liveToEntry({ type: 'night', settle: null, asleep: new Date(2026, 9, 14, 2, 30).toISOString() }, woke).entry;
    expect(late).toMatchObject({ day: '2026-10-13', asleep: '02:30', settle: '' });
    expect(entriesToSessions([late])[0].start.getTime()).toBe(new Date(2026, 9, 14, 2, 30).getTime());
  });

  it('rejects impossible times and formats the timer', () => {
    const live = { type: 'nap', asleep: new Date(2026, 9, 13, 9, 0).toISOString() };
    expect(liveToEntry(live, new Date(2026, 9, 13, 8, 0)).error).toBeTruthy();
    expect(liveToEntry({ type: 'nap' }, new Date()).error).toBeTruthy();
    expect(formatTimer(65000)).toBe('1:05');
    expect(formatTimer(3725000)).toBe('1:02:05');
    // Adjusted times never land in the future.
    expect(atTime('23:50', new Date(2026, 9, 14, 0, 10))).toEqual(new Date(2026, 9, 13, 23, 50));
  });
});
