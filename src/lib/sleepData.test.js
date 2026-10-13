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
