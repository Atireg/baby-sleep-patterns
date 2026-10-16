import { describe, expect, it } from 'vitest';
import { formatTimer } from './format.js';
import { atTime, editAwakeSince, liveAfterLogEdit, liveToEntry, resolveWakings, sleepDay, typeAt } from './live.js';
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

describe('Now card follows sleep-log edits', () => {
  const nap = { id: 'x', day: '2026-10-14', type: 'nap', settle: '', asleep: '13:00', woke: '14:10', method: '', mood: '', notes: '', wakings: [], extended: null };
  const iso = (h, m) => new Date(2026, 9, 14, h, m).toISOString();
  it('drops a manual awake timer', () => {
    expect(liveAfterLogEdit({ awakeFrom: iso(14, 30) }, nap)).toBeNull();
    expect(liveAfterLogEdit({ awakeFrom: iso(14, 30) }, null)).toBeNull();
    expect(liveAfterLogEdit(null, nap)).toBeNull();
  });
  it('finishes a tracked sleep the logged entry covers', () => {
    expect(liveAfterLogEdit({ type: 'nap', settle: null, asleep: iso(13, 0) }, nap)).toBeNull();
    expect(liveAfterLogEdit({ type: 'nap', settle: iso(13, 20), asleep: null }, nap)).toBeNull();
  });
  it('keeps a tracked sleep the entry does not cover', () => {
    const live = { type: 'nap', settle: null, asleep: iso(15, 0), awakeFrom: iso(14, 30) };
    expect(liveAfterLogEdit(live, nap)).toEqual({ ...live, awakeFrom: null });
    const plain = { type: 'nap', settle: null, asleep: iso(15, 0) };
    expect(liveAfterLogEdit(plain, nap)).toBe(plain);
  });
});

describe('editing "awake since"', () => {
  const at = (d, h, m) => new Date(2026, 9, d, h, m);
  const nap = { id: 'n', day: '2026-10-15', type: 'nap', settle: '', asleep: '09:00', woke: '10:00', method: '', mood: '', notes: '', wakings: [], extended: null };
  const night = { id: 'x', day: '2026-10-14', type: 'night', settle: '', asleep: '19:30', woke: '06:30', method: '', mood: '', notes: '',
    wakings: [{ from: '01:00', to: '01:30', feed: true }, { from: '06:00', to: '06:10', feed: false }], extended: null };
  const now = at(15, 11, 0);
  it('changes the wake-up time of the logged sleep the timer runs from', () => {
    expect(editAwakeSince([night, nap], at(15, 10, 0), at(15, 10, 20), now)).toEqual({ entry: { ...nap, woke: '10:20', wakings: [] } });
  });
  it('drops night wakings after the new wake-up', () => {
    const res = editAwakeSince([night], at(15, 6, 30), at(15, 6, 5), at(15, 8, 0));
    expect(res.entry).toMatchObject({ woke: '06:05', wakings: [{ from: '01:00', to: '01:30', feed: true }] });
  });
  it('rejects a time before she fell asleep or in the future', () => {
    expect(editAwakeSince([nap], at(15, 10, 0), at(15, 8, 50), now).error).toMatch(/after that/);
    expect(editAwakeSince([nap], at(15, 10, 0), at(15, 11, 30), now).error).toMatch(/future/);
  });
  it('moves a manual awake timer', () => {
    expect(editAwakeSince([nap], at(15, 10, 30), at(15, 10, 15), now)).toEqual({ awakeFrom: at(15, 10, 15).toISOString() });
    expect(editAwakeSince([], at(15, 10, 30), at(15, 10, 15), now)).toEqual({ awakeFrom: at(15, 10, 15).toISOString() });
    expect(editAwakeSince([nap], at(15, 10, 30), at(15, 9, 45), now).error).toMatch(/ends at 10:00/);
  });
});

describe('nightAwakeMs', () => {
  const at = (h, m) => new Date(2026, 9, 14, h, m);
  const live = {
    type: 'night', asleep: at(0, 0).toISOString(),
    wakings: [
      { from: at(1, 0).toISOString(), to: at(1, 10).toISOString(), feed: true }, // short feed: sleep
      { from: at(2, 0).toISOString(), to: at(2, 30).toISOString(), feed: false },
    ],
  };
  it('counts finished wakings (not short feeds) and the one in progress', async () => {
    const { nightAwakeMs } = await import('./live.js');
    expect(nightAwakeMs(live, at(3, 0)) / 60000).toBe(30);
    expect(nightAwakeMs(live, at(2, 15)) / 60000).toBe(0);
    expect(nightAwakeMs({ ...live, wakingFrom: at(4, 0).toISOString() }, at(4, 20)) / 60000).toBe(50);
  });
});

describe('mergeNight', () => {
  it('joins a night saved in parts into one entry with all its wakings', async () => {
    const { mergeNight } = await import('./entries.js');
    const base = { day: '2026-10-15', type: 'night', settle: '', method: '', mood: '', notes: '', wakings: [], extended: null };
    const parts = [
      { ...base, id: 'c', asleep: '02:30', woke: '06:30', mood: 'Good', notes: 'early' },
      { ...base, id: 'a', asleep: '19:30', woke: '23:00', settle: '19:10', notes: 'teething' },
      { ...base, id: 'b', asleep: '23:15', woke: '02:00' },
    ];
    const wakings = [{ from: '23:00', to: '23:15', feed: true }, { from: '02:00', to: '02:20', feed: false }];
    const { entry } = mergeNight(parts, wakings);
    expect(entry).toMatchObject({ id: 'a', asleep: '19:30', woke: '06:30', settle: '19:10', mood: 'Good', notes: 'teething · early' });
    expect(entry.wakings).toEqual(wakings);
    expect(mergeNight(parts, [{ from: '18:00', to: '18:10' }]).error).toBeTruthy();
  });
});

describe('wake targets', () => {
  it('sets, clears and reads target wake windows', async () => {
    const { setWakeTarget, targetFor } = await import('./wakeTargets.js');
    let t = setWakeTarget({}, 1, 120);
    t = setWakeTarget(t, 'bedtime', 210);
    expect(t).toEqual({ 1: 120, bedtime: 210 });
    expect([targetFor(t, 1), targetFor(t, 2), targetFor(t, 'bedtime'), targetFor(t, null)]).toEqual([120, null, 210, null]);
    expect(setWakeTarget(t, 1, null)).toEqual({ bedtime: 210 });
  });
});
