import { describe, expect, it } from 'vitest';
import { atTime, formatTimer, liveToEntry, resolveWakings, sleepDay, typeAt } from './live.js';
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

describe('awake timer', () => {
  it('starts from the last sleep or a manual start, whichever is later', async () => {
    const { awakeSince } = await import('./live.js');
    const at = (h, m) => new Date(2026, 9, 13, h, m);
    const sessions = [{ start: at(9, 0), end: at(10, 0) }, { start: at(12, 0), end: at(13, 30) }];
    expect(awakeSince(sessions, null, at(14, 0))).toEqual(at(13, 30));
    expect(awakeSince(sessions, { awakeFrom: at(13, 45).toISOString() }, at(14, 0))).toEqual(at(13, 45));
    expect(awakeSince(sessions, { asleep: at(13, 50).toISOString() }, at(14, 0))).toBeNull();
    // Settling still counts as awake.
    expect(awakeSince(sessions, { settle: at(13, 55).toISOString() }, at(14, 0))).toEqual(at(13, 30));
    expect(awakeSince(sessions, null, new Date(2026, 9, 14, 8, 0))).toBeNull();
  });
});

describe('live night wakings', () => {
  it('saves wakings with the night', () => {
    const iso = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
    const live = { type: 'night', asleep: iso(13, 19, 30), wakings: [{ from: iso(14, 1, 10), to: iso(14, 1, 40) }], wakingFrom: iso(14, 6, 20) };
    const { entry } = liveToEntry(live, new Date(2026, 9, 14, 6, 20));
    expect(entry).toMatchObject({ day: '2026-10-13', asleep: '19:30', woke: '06:20', wakings: [{ from: '01:10', to: '01:40' }] });
    const pieces = entriesToSessions([entry]);
    expect(pieces.map((p) => p.minutes)).toEqual([340, 280]);
  });
});

describe('editing night wakings', () => {
  const asleep = new Date(2026, 9, 13, 19, 30, 25);
  const now = new Date(2026, 9, 14, 5, 0);
  it('reads the times forward from bedtime, across midnight', () => {
    const res = resolveWakings(asleep, [{ from: '23:50', to: '00:20', feed: true }, { from: '02:00', to: '02:15' }], '04:30', now);
    expect(res.error).toBeUndefined();
    expect(res.wakings.map((w) => [new Date(w.from), new Date(w.to), w.feed])).toEqual([
      [new Date(2026, 9, 13, 23, 50), new Date(2026, 9, 14, 0, 20), true],
      [new Date(2026, 9, 14, 2, 0), new Date(2026, 9, 14, 2, 15), false],
    ]);
    expect(new Date(res.wakingFrom)).toEqual(new Date(2026, 9, 14, 4, 30));
  });
  it('rejects missing, out-of-order, empty and future times', () => {
    expect(resolveWakings(asleep, [{ from: '01:00', to: '' }], '', now).error).toMatch(/both times/);
    expect(resolveWakings(asleep, [{ from: '02:00', to: '02:30' }, { from: '01:00', to: '01:10' }], '', now).error).toMatch(/future/);
    expect(resolveWakings(asleep, [{ from: '01:00', to: '01:00' }], '', now).error).toMatch(/after/);
    expect(resolveWakings(asleep, [{ from: '19:30', to: '20:00' }], '', now).error).toMatch(/after she fell asleep/);
    expect(resolveWakings(asleep, [], '05:30', now).error).toMatch(/future/);
    expect(resolveWakings(asleep, [], '', now)).toEqual({ wakings: [], wakingFrom: null });
  });
});
