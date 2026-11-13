// Trips abroad: this file runs as if the phone were in Argentina (4 hours behind Germany in November).
process.env.TZ = 'America/Argentina/Buenos_Aires';
import { afterEach, describe, expect, it } from 'vitest';
import { entriesToSessions, entryToValues, makeEntry, setHomeZone } from './entries.js';
import { editAwakeSince, liveToEntry } from './live.js';
import { atClock, clockIn, hhmm, localZone, sameZone } from './time.js';

const BERLIN = 'Europe/Berlin';
const BA = 'America/Argentina/Buenos_Aires';
const entry = (day, type, asleep, woke, extra = {}) =>
  ({ id: `${day}${asleep}`, day, type, settle: '', asleep, woke, method: '', mood: '', notes: '', wakings: [], extended: null, ...extra });
const span = (s) => `${hhmm(s.start)}-${hhmm(s.end)}`;

afterEach(() => setHomeZone(null));

describe('time zones', () => {
  it('reads each sleep in the time zone it was logged in', () => {
    const s = entriesToSessions([
      entry('2026-11-10', 'nap', '09:30', '11:00', { tz: BERLIN }),
      entry('2026-11-21', 'nap', '09:30', '11:00', { tz: BA }),
    ]);
    // Shown on this phone's clock (Argentina): the Berlin nap was at 05:30 here.
    expect(s.map(span)).toEqual(['05:30-07:00', '09:30-11:00']);
    expect(s.map((x) => x.minutes)).toEqual([90, 90]);
  });

  it('keeps night wakings, lengths and wake windows right across the trip', () => {
    const s = entriesToSessions([
      // Last night in Germany, with a waking 02:00–02:30 Berlin time.
      entry('2026-11-19', 'night', '19:30', '06:30', { tz: BERLIN, wakings: [{ from: '02:00', to: '02:30', feed: false }] }),
      // First nap after landing, logged in Argentina time.
      entry('2026-11-20', 'nap', '08:00', '09:00', { tz: BA }),
    ]);
    expect(s.map(span)).toEqual(['15:30-22:00', '22:30-02:30', '08:00-09:00']);
    expect(s[0].minutes + s[1].minutes).toBe(10 * 60 + 30);
    // Awake from 06:30 Berlin (02:30 here) to 08:00 here.
    expect(s[2].wakeWindow).toBe(5 * 60 + 30);
  });

  it('saves a sleep tracked live across the time change with its real length', () => {
    const live = { type: 'night', asleep: atClock(2026, 10, 20, 19 * 60 + 30, BERLIN).toISOString(), method: '' };
    const { entry: e } = liveToEntry(live, new Date(2026, 10, 21, 5, 0));
    expect(e).toMatchObject({ day: '2026-11-20', asleep: '15:30', woke: '05:00', tz: localZone() });
    expect(entriesToSessions([e])[0].minutes).toBe(13 * 60 + 30);
  });

  it('reads sleeps saved without a time zone in the home time zone', () => {
    const old = entry('2026-11-10', 'nap', '09:30', '11:00');
    expect(entriesToSessions([old]).map(span)).toEqual(['09:30-11:00']); // no home zone yet: this phone's clock
    setHomeZone(BERLIN);
    expect(entriesToSessions([old]).map(span)).toEqual(['05:30-07:00']);
    // Editing it keeps (and records) the home time zone.
    expect(makeEntry({ ...entryToValues(old), notes: 'x' }, old.id).entry.tz).toBe(BERLIN);
    expect(makeEntry({ day: '2026-11-21', type: 'nap', asleep: '10:00', woke: '11:00' }).entry.tz).toBe(localZone());
  });

  it('treats other names for the same time zone as the same zone', () => {
    expect(sameZone('America/Argentina/Buenos_Aires', 'America/Buenos_Aires')).toBe(true);
    expect(sameZone(BA, BERLIN)).toBe(false);
    expect(entriesToSessions([entry('2026-11-21', 'nap', '09:30', '11:00', { tz: 'America/Buenos_Aires' })]).map(span)).toEqual(['09:30-11:00']);
  });

  it('writes edited times in the clock the entry was logged in', () => {
    const nap = entry('2026-11-10', 'nap', '09:30', '11:00', { tz: BERLIN });
    const ended = entriesToSessions([nap])[0].end; // 07:00 here
    const res = editAwakeSince([nap], ended, new Date(2026, 10, 10, 7, 20), new Date(2026, 10, 10, 8, 0));
    expect(res.entry).toMatchObject({ woke: '11:20', tz: BERLIN });
    expect(clockIn(new Date(2026, 10, 10, 7, 20), BERLIN)).toBe('11:20');
  });
});
