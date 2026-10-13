// Generates static/sample-sleep-log.xlsx: three weeks of realistic sleep data
// in the simple column layout the website reads (same layout as the entry-form export).
import { utils, writeFile } from 'xlsx';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (spread) => Math.round((rand() - 0.5) * 2 * spread);
const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const rows = [['Date', 'Settling start', 'Fell asleep', 'Woke up', 'Type', 'How fell asleep', 'Mood after', 'Notes']];
// Settling gets more independent and quicker over the three weeks.
const method = (i) => {
  const r = rand();
  if (r < 0.7 - i * 0.03) return i < 8 ? 'Held in arms' : 'Patting';
  return r < 0.95 ? 'Independently' : 'Nursing';
};
const mood = () => (rand() < 0.8 ? 'Good' : rand() < 0.5 ? 'Fussy' : 'Crying');
const settleFor = (i) => Math.max(3, 20 - Math.round(i * 0.6) + jitter(5));
const first = new Date(2026, 8, 1);
for (let i = 0; i < 21; i++) {
  const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  // Naps consolidate from 5 to 4 to 3 over the three weeks (with an odd day in between).
  const napPlans = {
    5: [8 * 60 + 30, 10 * 60 + 45, 13 * 60, 15 * 60, 17 * 60],
    4: [9 * 60, 12 * 60, 15 * 60, 17 * 60 + 15],
    3: [9 * 60 + 15, 13 * 60, 16 * 60 + 15],
  };
  const napCount = i < 6 ? (i === 4 ? 4 : 5) : i < 13 ? (i === 10 ? 3 : 4) : 3;
  for (const s of napPlans[napCount]) {
    const start = s + jitter(15);
    const len = { 5: 35, 4: 50, 3: 70 }[napCount] + jitter(15);
    rows.push([date, hhmm(start - settleFor(i)), hhmm(start), hhmm(start + len), 'Nap', method(i), mood(), '']);
  }
  // Night sleep with one or two wakings that get rarer over time.
  const bedtime = 19 * 60 + 30 + jitter(25);
  const wakings = rand() < 0.75 - i * 0.03 ? (rand() < 0.4 ? 2 : 1) : 0;
  const morning = 24 * 60 + 6 * 60 + 45 + jitter(30);
  let cursor = bedtime;
  for (let w = 0; w < wakings; w++) {
    const stretchEnd = cursor + (morning - bedtime) / (wakings + 1) + jitter(40);
    rows.push([date, w === 0 ? hhmm(cursor - settleFor(i)) : '', hhmm(cursor), hhmm(stretchEnd), 'Night', w === 0 ? method(i) : '', '', w === 0 ? 'Feed' : '']);
    cursor = stretchEnd + 15 + jitter(10);
  }
  rows.push([date, wakings ? '' : hhmm(cursor - settleFor(i)), hhmm(cursor), hhmm(morning), 'Night', wakings ? '' : method(i), '', '']);
}

const ws = utils.aoa_to_sheet(rows);
ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 11 }, { wch: 9 }, { wch: 7 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
const wb = utils.book_new();
utils.book_append_sheet(wb, ws, 'Sleep log');
writeFile(wb, new URL('../static/sample-sleep-log.xlsx', import.meta.url).pathname);
console.log(`Wrote ${rows.length - 1} sleep sessions to static/sample-sleep-log.xlsx`);
