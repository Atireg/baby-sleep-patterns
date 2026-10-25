// Daylight saving changes: clock times must stay as logged on the 25-hour and 23-hour days.
process.env.TZ = 'Europe/Berlin';
import { describe, expect, it } from 'vitest';
import { entriesToSessions } from './entries.js';
import { friendsWindows } from './insights.js';
import { hhmm } from './time.js';
import { toPieces } from '../components/SleepTimeline.jsx';

const entry = (day, type, asleep, woke, wakings = []) =>
  ({ id: `${day}${asleep}`, day, type, settle: '', asleep, woke, method: '', mood: '', notes: '', wakings, extended: null });

describe('daylight saving time', () => {
  it('keeps logged clock times on the night the clocks go back (25 Oct 2026)', () => {
    const s = entriesToSessions([
      entry('2026-10-24', 'night', '19:30', '06:30', [{ from: '04:00', to: '04:30', feed: false }]),
      entry('2026-10-25', 'nap', '09:00', '10:00'),
    ]);
    expect(s.map((x) => `${hhmm(x.start)}-${hhmm(x.end)}`)).toEqual(['19:30-04:00', '04:30-06:30', '09:00-10:00']);
    // Real time asleep: the night had an extra hour.
    expect(s[0].minutes + s[1].minutes).toBe(11 * 60 + 60 - 30);
    expect(s[2].minutes).toBe(60);
  });

  it('reads a waking in the repeated hour by its clock times', () => {
    const s = entriesToSessions([entry('2026-10-24', 'night', '19:30', '06:30', [{ from: '02:30', to: '03:10', feed: false }])]);
    expect(s.map((x) => `${hhmm(x.start)}-${hhmm(x.end)}`)).toEqual(['19:30-02:30', '03:10-06:30']);
    expect(s[1].start - s[0].end).toBe(40 * 60 * 1000);
  });

  it('keeps logged clock times on the night the clocks go forward (29 Mar 2026)', () => {
    const s = entriesToSessions([entry('2026-03-28', 'night', '19:30', '06:30'), entry('2026-03-29', 'nap', '09:00', '10:00')]);
    expect(s.map((x) => `${hhmm(x.start)}-${hhmm(x.end)}`)).toEqual(['19:30-06:30', '09:00-10:00']);
    expect(s[0].minutes).toBe(10 * 60);
  });

  it('places the day after the change correctly on the timeline and in friends windows', () => {
    const s = entriesToSessions([entry('2026-10-25', 'nap', '09:00', '10:00'), entry('2026-10-25', 'nap', '13:00', '14:00')]);
    expect(toPieces(s).map((p) => [p.from, p.to])).toEqual([[9, 10], [13, 14]]);
    const w = friendsWindows(s, ['2026-10-25'], { from: 7 * 60, to: 19 * 60, max: 3 });
    expect(w.map((x) => [x.from, x.to])).toEqual([[420, 510], [600, 750], [840, 1140]]);
  });
});
