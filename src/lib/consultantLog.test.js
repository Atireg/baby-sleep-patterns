import { describe, expect, it } from 'vitest';
import { consultantLogToSessions, isConsultantLog, parseRanges } from './consultantLog.js';
import { dailyStats } from './sleepData.js';
import { methodsByWeek, settlingByWeek, wakeWindowsByWeek } from './insights.js';

const t = (h, m) => (h * 60 + m) / 1440; // Excel time fraction
const blank = () => Array(41).fill('');

// One block with two days (28 and 29 Jun 2026; Excel serials 46201, 46202).
function sampleRows() {
  const rows = [];
  const add = (label, cells = {}) => {
    const r = blank();
    r[0] = label;
    for (const [i, v] of Object.entries(cells)) r[+i] = v;
    rows.push(r);
  };
  add('Име на детето:', { 1: 'Baby' });
  add('', { 1: 46201, 9: 46202 });
  add('Сутрешно събуждане:', { 1: t(6, 0), 9: t(6, 30) });
  add('Брой дремки за деня:', { 1: 'Час на начало на заспиване' });
  add('1', { 1: t(7, 40), 2: t(8, 0), 3: t(9, 0), 6: 'на ръце', 7: 'добро', 8: 'не',
             9: t(8, 30), 10: t(8, 35), 11: t(9, 35), 14: 'самостоятелно', 15: 'плаче', 16: 'да' });
  add('2', { 1: 'не успяхме :)' });
  add('Вечерно заспиване', { 1: t(18, 30), 2: t(19, 0), 3: t(6, 30), 9: '/', 10: t(19, 30), 11: t(7, 0) });
  add('Брой нощни събуждания ', { 1: 1 });
  add('Детето будува ли през нощта?', { 1: 'Да', 3: 'Напишете от колко до колко часа будува детето: 2:00 - 2:30' });
  add('Нощни събуждания пояснения', { 1: 'woke once', 9: 'Например: Всякаква информация' });
  return rows;
}

describe('consultant log', () => {
  it('detects the template', () => {
    expect(isConsultantLog(sampleRows())).toBe(true);
    expect(isConsultantLog([['Date', 'Start', 'End']])).toBe(false);
  });

  it('parses naps, bedtime and splits the night around awake periods', () => {
    const { sessions, days, profile } = consultantLogToSessions(sampleRows());
    expect(profile.name).toBe('Baby');
    const day1 = sessions.filter((s) => s.day === '2026-06-28');
    expect(day1.map((s) => [s.type, s.minutes])).toEqual([['nap', 60], ['night', 420], ['night', 240]]);
    expect(day1[0]).toMatchObject({ settleMinutes: 20, wakeWindow: 120, method: 'на ръце', position: 1 });
    expect(day1[1]).toMatchObject({ settleMinutes: 30, wakeWindow: 600, position: 'bedtime' });
    const night2 = sessions.find((s) => s.day === '2026-06-29' && s.type === 'night');
    expect(night2.settleMinutes).toBeNull();
    expect(days.find((d) => d.day === '2026-06-28')).toMatchObject({ nightWakings: 1, notes: 'woke once', morningWake: 360 });
    expect(days.find((d) => d.day === '2026-06-29').notes).toBe('');
  });

  it('feeds the daily and weekly aggregates', () => {
    const { sessions } = consultantLogToSessions(sampleRows());
    const [d1] = dailyStats(sessions);
    expect(d1).toMatchObject({ naps: 1, nightMinutes: 660, longestMinutes: 420 });
    expect(methodsByWeek(sessions)).toEqual([
      { key: '2026-06-22', counts: { 'Held in arms': 1 } },
      { key: '2026-06-29', counts: { Independently: 1 } },
    ]);
    expect(settlingByWeek(sessions)[0].values).toEqual({ nap: 20, night: 30 });
    expect(wakeWindowsByWeek(sessions)[0].values[1]).toBe(120);
  });

  it('reads awake ranges including 24:xx notation', () => {
    expect(parseRanges('24:08 - 24:55, 3:36 - 4:18 (note)')).toEqual([[8, 55], [216, 258]]);
  });
});
