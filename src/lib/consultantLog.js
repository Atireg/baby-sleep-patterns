// Parser for the Bulgarian sleep-consultant log template ("Таблица сън").
// Layout: blocks of 5 days side by side, 8 columns per day, blocks repeated down the sheet.
//   row  date            28-Jun | ... (one date per day column group)
//   row  "Сутрешно събуждане:"  morning wake time
//   row  "Брой дремки за деня:" column headers
//   rows "1".."5"        naps: settling start, asleep, woke, wake window, duration, how fell asleep, mood, re-settled
//   row  "Вечерно заспиване"   bedtime: settling start, asleep, woke next morning, ...
//   rows of daily summaries and free-text questions about the night.
import { dayKey, parseDateCell, parseRanges, parseTimeCell } from './sleepData.js';

export { parseRanges };

const MS_MIN = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MIN;
const COLS_PER_DAY = 8;
const DAYS_PER_BLOCK = 5;

const LABELS = {
  name: 'име на детето',
  wake: 'сутрешно събуждане',
  bedtime: 'вечерно заспиване',
  wakings: 'брой нощни събуждания',
  feeds: 'детето буди ли се за хранене',
  awake: 'детето будува ли през нощта',
  nightNotes: 'нощни събуждания пояснения',
  dayType: 'как протича денят',
};

// Template prompts left in unfilled cells ("Например: ..." = "For example: ...").
const userText = (v) => {
  const t = String(v ?? '').trim();
  return /^например/i.test(t) ? '' : t;
};

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/[:?]+$/, '').trim();

/** True when the rows look like the consultant template. */
export function isConsultantLog(rows) {
  return rows.some((r) => norm(r?.[0]).startsWith(LABELS.wake));
}

// Free-text answers follow a prompt such as "Напишете ...: 4:04 - 5:12".
const answerText = (v) => String(v ?? '').replace(/^[^:]*:/, '').trim();

/** Absolute time for a clock time that falls at or after `after` (within 24h). */
function atOrAfter(after, minutes) {
  const base = new Date(after.getFullYear(), after.getMonth(), after.getDate()).getTime() + minutes * MS_MIN;
  return new Date(base < after.getTime() ? base + MS_DAY : base);
}

function findRow(rows, from, to, label) {
  for (let i = from; i < Math.min(to, rows.length); i++) if (norm(rows[i]?.[0]).startsWith(label)) return i;
  return -1;
}

export function consultantLogToSessions(rows) {
  const errors = [];
  const sessions = [];
  const days = [];
  // The child's name, birth date and age at the top of the sheet are never returned or shown.
  // The name is only used to blank it out of free-text notes.
  const nameRow = findRow(rows, 0, 10, LABELS.name);
  const childName = nameRow >= 0 ? String(rows[nameRow][1] ?? '').trim() : '';
  const redact = (text) => (childName ? text.split(childName).join('[name]') : text);
  const blockStarts = rows.flatMap((r, i) => (norm(r?.[0]).startsWith(LABELS.wake) ? [i] : []));
  blockStarts.forEach((wakeRow, b) => {
    const end = blockStarts[b + 1] ?? rows.length;
    const bedRow = findRow(rows, wakeRow, end, LABELS.bedtime);
    const napRows = [];
    for (let i = wakeRow + 1; i < (bedRow >= 0 ? bedRow : end); i++) {
      if (/^\d+$/.test(String(rows[i]?.[0]).trim())) napRows.push(i);
    }
    const wakingsRow = findRow(rows, wakeRow, end, LABELS.wakings);
    const awakeRow = findRow(rows, wakeRow, end, LABELS.awake);
    const notesRow = findRow(rows, wakeRow, end, LABELS.nightNotes);
    const dayTypeRow = findRow(rows, wakeRow, end, LABELS.dayType);

    for (let k = 0; k < DAYS_PER_BLOCK; k++) {
      const c = 1 + k * COLS_PER_DAY;
      const date = parseDateCell(rows[wakeRow - 1]?.[c]);
      if (!date) continue;
      const day = dayKey(date);
      const base = new Date(date.y, date.m, date.d).getTime();
      const at = (min) => new Date(base + min * MS_MIN);

      const wakeMin = parseTimeCell(rows[wakeRow][c]);
      const daySessions = [];
      let lastWake = wakeMin !== null ? at(wakeMin) : null;

      napRows.forEach((r, n) => {
        const row = rows[r];
        const asleep = parseTimeCell(row[c + 1]);
        const woke = parseTimeCell(row[c + 2]);
        if (asleep === null || woke === null) return;
        const settleFrom = parseTimeCell(row[c]);
        const start = at(asleep);
        const finish = atOrAfter(start, woke);
        daySessions.push({
          day, type: 'nap', position: n + 1, start, end: finish,
          settleMinutes: settleFrom !== null && asleep >= settleFrom ? asleep - settleFrom : null,
          wakeWindow: lastWake && start > lastWake ? Math.round((start - lastWake) / MS_MIN) : null,
          method: String(row[c + 5] ?? '').trim(),
          mood: String(row[c + 6] ?? '').trim(),
          resettled: norm(row[c + 7]) === 'да',
          extended: norm(row[c + 7]) === 'да' ? true : norm(row[c + 7]) === 'не' ? false : undefined,
          notes: '',
        });
        lastWake = finish;
      });

      if (bedRow >= 0) {
        const row = rows[bedRow];
        const asleep = parseTimeCell(row[c + 1]);
        const woke = parseTimeCell(row[c + 2]);
        if (asleep !== null && woke !== null) {
          const settleFrom = parseTimeCell(row[c]);
          // Bedtime after midnight (rare) still belongs to this evening.
          const start = at(asleep < 12 * 60 ? asleep + 24 * 60 : asleep);
          const finish = atOrAfter(start, woke);
          const night = {
            day, type: 'night', position: 'bedtime',
            settleMinutes: settleFrom !== null && asleep >= settleFrom ? asleep - settleFrom : null,
            wakeWindow: lastWake && start > lastWake ? Math.round((start - lastWake) / MS_MIN) : null,
            method: String(row[c + 5] ?? '').trim(),
            mood: String(row[c + 6] ?? '').trim(),
            resettled: norm(row[c + 7]) === 'да',
            notes: '',
          };
          // Split the night around reported awake periods so stretches are real sleep.
          const awake = awakeRow >= 0 ? parseRanges(answerText(rows[awakeRow][c + 2])) : [];
          let cursor = start;
          for (const [from, to] of awake) {
            const a = atOrAfter(start, from);
            const z = atOrAfter(a, to);
            if (a <= cursor || z > finish) continue;
            daySessions.push({ ...night, start: cursor, end: a, ...(cursor === start ? {} : { settleMinutes: null }) });
            cursor = z;
          }
          // Only the first stretch carries the bedtime settling time.
          if (finish > cursor) daySessions.push({ ...night, start: cursor, end: finish, ...(cursor === start ? {} : { settleMinutes: null }) });
        }
      }

      if (!daySessions.length) continue;
      for (const s of daySessions) s.minutes = Math.round((s.end - s.start) / MS_MIN);
      sessions.push(...daySessions);

      const wakings = wakingsRow >= 0 ? Number(rows[wakingsRow][c]) : NaN;
      days.push({
        day,
        morningWake: wakeMin,
        nightWakings: Number.isFinite(wakings) && rows[wakingsRow][c] !== '' ? wakings : null,
        dayType: dayTypeRow >= 0 ? redact(userText(rows[dayTypeRow][c])) : '',
        notes: notesRow >= 0 ? redact(userText(rows[notesRow][c])) : '',
      });
    }
  });

  if (!sessions.length) errors.push('No sleep entries found in the consultant log.');
  sessions.sort((a, b) => a.start - b.start);
  return { sessions, days, errors };
}
