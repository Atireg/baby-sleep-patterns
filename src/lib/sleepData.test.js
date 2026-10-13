import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyStats, parseTimeCell, rowsToSessions, summary } from './sleepData.js';
import { readWorkbook } from './readWorkbook.js';

describe('parseTimeCell', () => {
  it('reads 24h, 12h and Excel fraction times', () => {
    expect(parseTimeCell('19:30')).toBe(19 * 60 + 30);
    expect(parseTimeCell('7:30 PM')).toBe(19 * 60 + 30);
    expect(parseTimeCell('12:15 am')).toBe(15);
    expect(parseTimeCell(0.5)).toBe(12 * 60);
    expect(parseTimeCell('nope')).toBeNull();
  });
});

describe('rowsToSessions', () => {
  const header = ['Date', 'Start', 'End', 'Type'];

  it('rolls night sleep past midnight onto the next day', () => {
    const { sessions } = rowsToSessions([header, ['2026-09-01', '19:30', '06:30', 'Night']]);
    expect(sessions[0].minutes).toBe(11 * 60);
    expect(sessions[0].end.getDate()).toBe(2);
  });

  it('puts small-hours night sessions after the evening they belong to', () => {
    const { sessions } = rowsToSessions([
      header,
      ['2026-09-01', '19:30', '01:00', 'Night'],
      ['2026-09-01', '01:30', '06:30', 'Night'],
    ]);
    expect(sessions[1].start.getDate()).toBe(2);
    expect(sessions[1].start > sessions[0].end).toBe(true);
  });

  it('infers type when the column is missing and reports bad rows', () => {
    const { sessions, errors } = rowsToSessions([
      ['Date', 'Start', 'End'],
      ['2026-09-01', '09:00', '10:00'],
      ['2026-09-01', '20:00', '06:00'],
      ['2026-09-01', 'x', '06:00'],
    ]);
    expect(sessions.map((s) => s.type)).toEqual(['nap', 'night']);
    expect(errors).toHaveLength(1);
  });

  it('reports missing required columns', () => {
    expect(rowsToSessions([['Day', 'Foo']]).errors[0]).toMatch(/start/);
  });
});

describe('dailyStats / summary', () => {
  it('aggregates per day', () => {
    const { sessions } = rowsToSessions([
      ['Date', 'Start', 'End', 'Type'],
      ['2026-09-01', '09:00', '10:00', 'Nap'],
      ['2026-09-01', '13:00', '14:30', 'Nap'],
      ['2026-09-01', '19:00', '07:00', 'Night'],
    ]);
    const [day] = dailyStats(sessions);
    expect(day).toMatchObject({ naps: 2, napMinutes: 150, nightMinutes: 720, totalMinutes: 870, longestMinutes: 720 });
    expect(summary([day]).avgNaps).toBe(2);
  });
});

describe('sample workbook', () => {
  it('parses static/sample-sleep-log.xlsx without errors', () => {
    const buf = readFileSync(new URL('../../static/sample-sleep-log.xlsx', import.meta.url));
    const { sessions, errors } = readWorkbook(buf);
    expect(errors).toEqual([]);
    expect(dailyStats(sessions)).toHaveLength(21);
  });
});

describe('napCountTrend', () => {
  it('smooths single odd days and reports transitions', async () => {
    const { napCountTrend } = await import('./insights.js');
    const counts = [5, 5, 5, 4, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3];
    const days = counts.map((naps, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, naps }));
    const { points, changes } = napCountTrend(days);
    expect(points[3]).toMatchObject({ naps: 4, typical: 5 });
    expect(changes.map((c) => [c.from, c.to])).toEqual([[5, 4], [4, 3]]);
    // Each new level starts on a day that actually had that many naps.
    for (const c of changes) expect(days.find((d) => d.day === c.day).naps).toBe(c.to);
  });
});

describe('manual entries', () => {
  it('validates, converts and round-trips through the export rows', async () => {
    const { makeEntry, entriesToSessions, entriesToRows } = await import('./entries.js');
    expect(makeEntry({ day: '2026-10-13', asleep: '', woke: '10:00' }).error).toBeTruthy();
    const nap = makeEntry({ day: '2026-10-13', type: 'nap', settle: '15:05', asleep: '15:15', woke: '16:20', method: 'Independently', mood: 'Good' }).entry;
    const night = makeEntry({ day: '2026-10-13', type: 'night', settle: '19:00', asleep: '19:20', woke: '06:30', method: 'Patting' }).entry;
    const sessions = entriesToSessions([night, nap]);
    expect(sessions.map((s) => [s.type, s.minutes, s.settleMinutes, s.method])).toEqual([
      ['nap', 65, 10, 'Independently'],
      ['night', 670, 20, 'Patting'],
    ]);
    expect(sessions[1]).toMatchObject({ position: 'bedtime', wakeWindow: 180 });
    // The export uses the same simple layout, so it can be uploaded again.
    const again = rowsToSessions(entriesToRows([nap, night])).sessions;
    expect(again.map((s) => s.minutes)).toEqual([65, 670]);
  });
});

describe('series helpers', () => {
  it('breaks lines at missing days and fills missing weeks', async () => {
    const { breakGaps, allWeeks } = await import('./series.js');
    expect(breakGaps(['2026-09-01', '2026-09-02', '2026-09-10'], [1, 2, 3])).toEqual({
      x: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10'],
      y: [1, 2, null, 3],
    });
    expect(allWeeks('2026-09-07', '2026-09-28')).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });
});

describe('daytimeTank', () => {
  it('fills with today’s naps and tracks time awake', async () => {
    const { daytimeTank } = await import('./insights.js');
    const at = (h, m) => new Date(2026, 9, 13, h, m);
    const s = (day, type, a, b) => ({ day, type, start: a, end: b });
    const sessions = [
      s('2026-10-12', 'night', new Date(2026, 9, 12, 19, 30), at(6, 30)),
      s('2026-10-13', 'nap', at(9, 0), at(10, 0)),
      s('2026-10-13', 'nap', at(12, 30), at(13, 30)),
    ];
    const t = daytimeTank(sessions, at(14, 0), 150);
    expect(t).toMatchObject({ napMinutes: 120, target: 150, remaining: 30, over: 0, asleepSince: null });
    expect(t.awakeSince).toEqual(at(13, 30));
    expect(t.fill).toBeCloseTo(0.8);
    // During a nap only the part so far counts.
    const during = daytimeTank(sessions, at(13, 0), 150);
    expect(during.napMinutes).toBe(90);
    expect(during.asleepSince).toEqual(at(12, 30));
  });
});

describe('editing entries', () => {
  it('replaces by id and refuses duplicates', async () => {
    const { makeEntry, replaceEntry, entryToValues } = await import('./entries.js');
    const a = makeEntry({ day: '2026-10-13', type: 'nap', asleep: '09:00', woke: '10:00' }).entry;
    const b = makeEntry({ day: '2026-10-13', type: 'nap', asleep: '13:00', woke: '14:00' }).entry;
    const edited = makeEntry({ ...entryToValues(a), woke: '10:30', mood: 'Good' }, a.id).entry;
    const { list } = replaceEntry([a, b], edited);
    expect(list.find((e) => e.id === a.id)).toMatchObject({ woke: '10:30', mood: 'Good' });
    expect(list).toHaveLength(2);
    const clash = makeEntry({ ...entryToValues(a), asleep: '13:00' }, a.id).entry;
    expect(replaceEntry([a, b], clash).error).toMatch(/already exists/);
    expect(replaceEntry([b], edited).error).toMatch(/no longer exists/);
  });
});
