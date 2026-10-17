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

describe('night wakings', () => {
  it('validates wakings and splits the night into stretches', async () => {
    const { makeEntry, entriesToSessions, entriesToRows } = await import('./entries.js');
    const base = { day: '2026-10-13', type: 'night', asleep: '19:30', woke: '06:30', settle: '19:15' };
    expect(makeEntry({ ...base, wakings: [{ from: '18:00', to: '18:30' }] }).error).toMatch(/between/);
    expect(makeEntry({ ...base, wakings: [{ from: '02:00', to: '' }] }).error).toMatch(/both/);
    expect(makeEntry({ ...base, wakings: [{ from: '01:00', to: '01:30' }, { from: '01:20', to: '01:40' }] }).error).toMatch(/overlap/);
    const { entry } = makeEntry({ ...base, wakings: [{ from: '04:00', to: '04:15' }, { from: '23:50', to: '00:20' }, { from: '', to: '' }] });
    expect(entry.wakings).toEqual([{ from: '23:50', to: '00:20', feed: false }, { from: '04:00', to: '04:15', feed: false }]);
    const pieces = entriesToSessions([entry]);
    expect(pieces.map((p) => p.minutes)).toEqual([260, 220, 135]); // 19:30–23:50, 00:20–04:00, 04:15–06:30
    expect(pieces[0].settleMinutes).toBe(15);
    expect(pieces[1].settleMinutes).toBeUndefined();
    expect(pieces.every((p) => p.day === '2026-10-13')).toBe(true);
    // Export keeps the wakings so the file can be read back.
    expect(entriesToRows([entry])[1][8]).toBe('23:50-00:20, 04:00-04:15');
    // Naps ignore wakings.
    expect(makeEntry({ ...base, type: 'nap', asleep: '09:00', woke: '10:00', wakings: [{ from: '09:30', to: '09:40' }] }).entry.wakings).toEqual([]);
  });
});

describe('lastNight', () => {
  it('summarises yesterday evening’s night with its wakings', async () => {
    const { lastNight } = await import('./insights.js');
    const { makeEntry, entriesToSessions } = await import('./entries.js');
    const { entry } = makeEntry({ day: '2026-10-13', type: 'night', asleep: '19:30', woke: '06:30', wakings: [{ from: '02:00', to: '02:40' }] });
    const now = new Date(2026, 9, 14, 9, 0);
    const n = lastNight(entriesToSessions([entry]), now);
    expect(n.sleptMinutes).toBe(11 * 60 - 40);
    expect(n.awakeMinutes).toBe(40);
    expect(n.wakings).toHaveLength(1);
    expect(n.bedtime).toEqual(new Date(2026, 9, 13, 19, 30));
    expect(n.wake).toEqual(new Date(2026, 9, 14, 6, 30));
    expect(lastNight(entriesToSessions([entry]), new Date(2026, 9, 16, 9, 0))).toBeNull();
  });
});

describe('friendsWindows', () => {
  it('finds stretches she is awake and rested on every day', async () => {
    const { friendsWindows } = await import('./insights.js');
    const rows = [['Date', 'Fell asleep', 'Woke up', 'Type']];
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-12']) {
      rows.push([d, '09:00', '10:00', 'Nap'], [d, '13:00', '14:00', 'Nap'], [d, '19:00', '07:00', 'Night']);
    }
    const { sessions } = rowsToSessions(rows);
    const w = friendsWindows(sessions, ['2026-10-10', '2026-10-11', '2026-10-12']);
    // Awake 10:00–13:00 but wind-down from 12:30; 14:00–19:00 with wind-down from 18:30.
    expect(w).toEqual([
      { from: 600, to: 750, days: 3, of: 3 },
      { from: 840, to: 1110, days: 3, of: 3 },
    ]);
    // One odd day (nap at 11:00) falls back to "most days".
    const odd = rowsToSessions([...rows, ['2026-10-12', '11:00', '11:40', 'Nap']]).sessions;
    const w2 = friendsWindows(odd, ['2026-10-10', '2026-10-11', '2026-10-12'], { minMinutes: 200 });
    expect(w2).toEqual([{ from: 840, to: 1110, days: 3, of: 3 }]);
  });
});

describe('night feeds', () => {
  it('keeps feed marks through export and into the last-night summary', async () => {
    const { makeEntry, entriesToSessions, entriesToRows } = await import('./entries.js');
    const { lastNight } = await import('./insights.js');
    const { parseWakings } = await import('./sleepData.js');
    expect(parseWakings('01:10-01:45 feed, 04:30-04:40')).toEqual([
      { from: 70, to: 105, feed: true }, { from: 270, to: 280, feed: false },
    ]);
    const { entry } = makeEntry({
      day: '2026-10-13', type: 'night', asleep: '19:30', woke: '06:30',
      wakings: [{ from: '01:10', to: '01:45', feed: true }, { from: '04:30', to: '04:40' }],
    });
    expect(entriesToRows([entry])[1][8]).toBe('01:10-01:45 feed, 04:30-04:40');
    const n = lastNight(entriesToSessions([entry]), new Date(2026, 9, 14, 9, 0));
    expect(n.wakings.map((w) => [w.minutes, w.feed])).toEqual([[35, true], [10, false]]);
    expect(n.feeds).toBe(1);
    expect(n.awakeMinutes).toBe(45);
  });
});

describe('upcomingNap', () => {
  it('averages the same nap number over the last 3 days', async () => {
    const { upcomingNap } = await import('./insights.js');
    const { sessions } = rowsToSessions([
      ['Date', 'Fell asleep', 'Woke up', 'Type'],
      ['2026-10-09', '09:00', '11:00', 'Nap'], // older than 3 days: ignored
      ['2026-10-10', '09:00', '10:00', 'Nap'], ['2026-10-10', '13:00', '14:30', 'Nap'],
      ['2026-10-11', '09:00', '10:20', 'Nap'], ['2026-10-11', '13:00', '14:00', 'Nap'],
      ['2026-10-12', '09:00', '09:40', 'Nap'],
      ['2026-10-13', '09:00', '10:00', 'Nap'], // today: one nap done
    ]);
    const now = new Date(2026, 9, 13, 11, 0);
    expect(upcomingNap(sessions, now)).toEqual({ position: 2, avgMinutes: 75, samples: 2, days: 3 });
    const morning = new Date(2026, 9, 13, 7, 0); // before today's first nap ended
    expect(upcomingNap(sessions, morning).position).toBe(1);
    expect(upcomingNap(sessions, morning).avgMinutes).toBeCloseTo((60 + 80 + 40) / 3);
    const late = rowsToSessions([['Date', 'Fell asleep', 'Woke up', 'Type'], ['2026-10-12', '09:00', '10:00', 'Nap'],
      ['2026-10-13', '09:00', '10:00', 'Nap'], ['2026-10-13', '12:00', '13:00', 'Nap']]).sessions;
    expect(upcomingNap(late, new Date(2026, 9, 13, 15, 0))).toMatchObject({ position: 3, avgMinutes: null });
  });
});

describe('expectedWakeUp', () => {
  it('is bedtime + (5-day average total sleep − that day\'s naps) + time awake at night', async () => {
    const { expectedWakeUp } = await import('./insights.js');
    const { sessions } = rowsToSessions([
      ['Date', 'Fell asleep', 'Woke up', 'Type'],
      ['2026-10-13', '09:00', '10:30', 'Nap'],
      ['2026-10-13', '13:00', '14:00', 'Nap'],
      ['2026-10-12', '13:00', '14:00', 'Nap'], // another day: ignored
    ]);
    const bed = new Date(2026, 9, 13, 19, 30);
    const res = expectedWakeUp(sessions, '2026-10-13', bed, 13 * 60, 30);
    expect(res.napMinutes).toBe(150);
    expect(res.nightMinutes).toBe(13 * 60 - 150);
    expect(res.when).toEqual(new Date(2026, 9, 14, 6, 30)); // 19:30 + 10h30 + 30m awake
    expect(expectedWakeUp(sessions, '2026-10-13', bed, null)).toBeNull();
  });
});

describe('upcomingWakeWindow', () => {
  it('averages the wake window before the next nap (or bedtime) over 5 days', async () => {
    const { upcomingWakeWindow } = await import('./insights.js');
    const rows = [['Date', 'Fell asleep', 'Woke up', 'Type']];
    // Previous days: up 06:30, nap 1 at 08:30 (2h), nap 2 two hours 30 after nap 1 ends, bedtime 4h after nap 2.
    for (const [d, n2] of [['2026-10-08', '12:00'], ['2026-10-09', '12:00'], ['2026-10-10', '12:30'], ['2026-10-11', '12:30'], ['2026-10-12', '12:00']]) {
      rows.push([d, '08:30', '09:30', 'Nap'], [d, n2, '14:00', 'Nap'], [d, '18:00', '06:30', 'Night']);
    }
    rows.push(['2026-10-13', '08:30', '09:30', 'Nap']);
    const { sessions } = rowsToSessions(rows);
    const mid = upcomingWakeWindow(sessions, new Date(2026, 9, 13, 10, 0));
    expect(mid.target).toBe(2);
    expect(mid.avgMinutes).toBe((150 * 3 + 180 * 2) / 5);
    // After the usual number of naps the next sleep is bedtime.
    const after = rowsToSessions([...rows, ['2026-10-13', '12:00', '14:00', 'Nap']]).sessions;
    expect(upcomingWakeWindow(after, new Date(2026, 9, 13, 15, 0))).toMatchObject({ target: 'bedtime', avgMinutes: 240 });
  });
});

describe('dayDetails', () => {
  it('gives the actual numbers for a day', async () => {
    const { dayDetails } = await import('./insights.js');
    const { sessions } = rowsToSessions([
      ['Date', 'Settling start', 'Fell asleep', 'Woke up', 'Type', 'How fell asleep', 'Night wakings'],
      ['2026-10-11', '', '19:00', '06:30', 'Night', '', ''],
      ['2026-10-12', '08:50', '09:00', '10:00', 'Nap', 'Independently', ''],
      ['2026-10-12', '', '13:00', '14:30', 'Nap', 'Patting', ''],
      ['2026-10-12', '19:00', '19:20', '06:40', 'Night', 'Independently', '01:00-01:30 feed'],
    ]);
    const day = dailyStats(sessions).find((d) => d.day === '2026-10-12');
    const r = dayDetails(day, sessions);
    expect(r).toMatchObject({
      naps: 2, napLengths: [60, 90], napSettle: [10, null], bedSettle: 20, settleTotal: 30,
      awakeMinutes: 150 + 180 + 290, nightWakings: 1, nightAwakeMinutes: 30, nightFeeds: 1,
      independent: 2, withMethod: 3,
    });
    expect(r.morningWake).toEqual(new Date(2026, 9, 12, 6, 30));
    expect(r.bedtime).toEqual(new Date(2026, 9, 12, 19, 20));
  });
});

describe('nap extended', () => {
  it('stores yes/no for naps, exports and reads it back', async () => {
    const { makeEntry, entriesToRows, entriesToSessions, entryToValues } = await import('./entries.js');
    const { dayDetails } = await import('./insights.js');
    const a = makeEntry({ day: '2026-10-13', type: 'nap', asleep: '09:00', woke: '10:00', extended: 'yes' }).entry;
    const b = makeEntry({ day: '2026-10-13', type: 'nap', asleep: '13:00', woke: '14:00', extended: 'no' }).entry;
    const c = makeEntry({ day: '2026-10-13', type: 'nap', asleep: '16:00', woke: '16:30' }).entry;
    const n = makeEntry({ day: '2026-10-13', type: 'night', asleep: '19:30', woke: '06:30', extended: 'yes' }).entry;
    expect([a.extended, b.extended, c.extended, n.extended]).toEqual([true, false, null, null]);
    expect(entryToValues(a).extended).toBe('yes');
    expect(entriesToRows([a, b, c]).slice(1).map((r) => r.at(-1))).toEqual(['Yes', 'No', '']);
    const sessions = entriesToSessions([a, b, c, n]);
    expect(sessions.filter((s) => s.type === 'nap').map((s) => s.extended)).toEqual([true, false, undefined]);
    const day = dailyStats(sessions)[0];
    expect(dayDetails(day, sessions)).toMatchObject({ extendedNaps: 1, napsAnswered: 2 });
  });
});

describe('dayAwakeTotal', () => {
  it('counts morning wake-up to bedtime minus naps', async () => {
    const { dayAwakeTotal } = await import('./insights.js');
    const { sessions } = rowsToSessions([
      ['Date', 'Fell asleep', 'Woke up', 'Type'],
      ['2026-10-12', '19:30', '06:30', 'Night'],
      ['2026-10-13', '09:00', '10:15', 'Nap'],
      ['2026-10-13', '13:00', '14:15', 'Nap'],
    ]);
    const r = dayAwakeTotal(sessions, '2026-10-13', new Date(2026, 9, 13, 19, 30));
    expect(r).toMatchObject({ minutes: 13 * 60 - 150, napMinutes: 150 });
    expect(dayAwakeTotal(sessions, '2026-10-14', new Date(2026, 9, 14, 19, 30))).toBeNull();
  });
});

describe('wakeWindowGrid', () => {
  it('lists the actual wake window per nap and bedtime for each day', async () => {
    const { wakeWindowGrid } = await import('./insights.js');
    const { sessions } = rowsToSessions([
      ['Date', 'Fell asleep', 'Woke up', 'Type'],
      ['2026-10-10', '19:00', '06:30', 'Night'],
      ['2026-10-11', '08:30', '09:30', 'Nap'], ['2026-10-11', '12:00', '13:00', 'Nap'], ['2026-10-11', '19:00', '06:00', 'Night'],
      ['2026-10-12', '08:00', '09:00', 'Nap'], ['2026-10-12', '12:30', '13:30', 'Nap'], ['2026-10-12', '16:00', '16:30', 'Nap'],
      ['2026-10-12', '19:30', '06:30', 'Night'],
    ]);
    const grid = wakeWindowGrid(sessions, ['2026-10-11', '2026-10-12']);
    expect(grid).toEqual([
      { key: 1, values: [120, 120] },
      { key: 2, values: [150, 210] },
      { key: 3, values: [null, 150] },
      { key: 'bedtime', values: [360, 180] },
    ]);
  });
});

describe('short night feeds count as sleep', () => {
  it('applies to feeds under 25 minutes', async () => {
    const { countsAsSleep } = await import('./sleepData.js');
    expect([countsAsSleep(true, 24), countsAsSleep(true, 25), countsAsSleep(false, 10)]).toEqual([true, false, false]);
  });
  it('keeps short feeds in the night sleep, not in the awake time', async () => {
    const { lastNight, dayDetails } = await import('./insights.js');
    const { makeEntry, entriesToSessions } = await import('./entries.js');
    const { entry } = makeEntry({
      day: '2026-10-13', type: 'night', asleep: '19:30', woke: '06:30',
      wakings: [
        { from: '23:00', to: '23:15', feed: true }, // short feed → sleep
        { from: '02:00', to: '02:30', feed: true }, // long feed → awake
        { from: '04:00', to: '04:10', feed: false }, // short, not a feed → awake
      ],
    });
    const sessions = entriesToSessions([entry]);
    const n = lastNight(sessions, new Date(2026, 9, 14, 9, 0));
    expect(n.awakeMinutes).toBe(40);
    expect(n.sleptMinutes).toBe(11 * 60 - 40);
    expect(n.wakings.map((w) => w.countedAsSleep)).toEqual([true, false, false]);
    expect(n.feeds).toBe(2);
    const [day] = dailyStats(sessions);
    expect(day.nightMinutes).toBe(11 * 60 - 40);
    const d = dayDetails(day, sessions);
    expect(d.nightWakings).toBe(3);
    expect(d.nightAwakeMinutes).toBe(40);
  });
});

describe('nightBefore', () => {
  it('gives the night before a day: sleep and the non-feed wakings', async () => {
    const { nightBefore } = await import('./insights.js');
    const { makeEntry, entriesToSessions } = await import('./entries.js');
    const { entry } = makeEntry({ day: '2026-10-13', type: 'night', asleep: '19:30', woke: '06:30',
      wakings: [{ from: '23:00', to: '23:40', feed: true }, { from: '02:00', to: '02:30', feed: false }, { from: '04:00', to: '04:10' }] });
    const n = nightBefore(entriesToSessions([entry]), '2026-10-14');
    expect(n).toEqual({ minutes: 11 * 60 - 80, wakings: 2, awakeMinutes: 40 });
    expect(nightBefore(entriesToSessions([entry]), '2026-10-13')).toBeNull();
  });
});
