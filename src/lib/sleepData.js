// Pure helpers that turn spreadsheet rows into sleep sessions and daily stats.
// Kept free of the xlsx dependency so they are easy to unit test.

const MS_MIN = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MIN;

// Header aliases (lower-cased, punctuation stripped) -> canonical column.
const HEADER_ALIASES = {
  date: ['date', 'day'],
  start: ['start', 'sleepstart', 'fellasleep', 'asleep', 'from', 'starttime'],
  end: ['end', 'sleepend', 'wokeup', 'woke', 'awake', 'to', 'endtime', 'wake'],
  type: ['type', 'kind', 'sleeptype', 'category'],
  notes: ['notes', 'note', 'comment', 'comments'],
  settle: ['settlingstart', 'settlestart', 'startedsettling', 'settling', 'puttosleep'],
  method: ['howfellasleep', 'method', 'settlingmethod'],
  mood: ['moodafter', 'mood', 'moodafterwaking'],
};

const normalizeHeader = (h) => String(h ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function mapHeaders(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    for (const [col, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[col] === undefined && aliases.includes(key)) map[col] = i;
    }
  });
  return map;
}

// Excel stores dates as days since 1899-12-30; the fraction is the time of day.
function excelSerialToParts(serial) {
  const days = Math.floor(serial);
  const minutes = Math.round((serial - days) * 24 * 60);
  const d = new Date(Date.UTC(1899, 11, 30) + days * MS_DAY);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    minutes: minutes % (24 * 60),
  };
}

/** Parse a date cell -> {y, m, d} or null. Accepts Excel serials, Date objects and ISO / d.m.y / m/d/y strings. */
export function parseDateCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value)) {
    return { y: value.getFullYear(), m: value.getMonth(), d: value.getDate() };
  }
  if (typeof value === 'number') {
    const { y, m, d } = excelSerialToParts(value);
    return { y, m, d };
  }
  const s = String(value).trim();
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return { y: +match[1], m: +match[2] - 1, d: +match[3] };
  match = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); // 31.12.2026
  if (match) return { y: +match[3], m: +match[2] - 1, d: +match[1] };
  match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // 12/31/2026
  if (match) return { y: +match[3], m: +match[1] - 1, d: +match[2] };
  return null;
}

/** Parse a time cell -> minutes after midnight, or null. Accepts Excel fractions, Date objects, "19:30", "7:30 PM". */
export function parseTimeCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value)) return value.getHours() * 60 + value.getMinutes();
  if (typeof value === 'number') return excelSerialToParts(value).minutes;
  const match = String(value).trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!match) return null;
  let h = +match[1];
  const min = +match[2];
  const ampm = match[3]?.toLowerCase()[0];
  if (ampm === 'p' && h < 12) h += 12;
  if (ampm === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Without an explicit type, sleep starting between 18:00 and 05:59 counts as night.
export function inferType(startMinutes) {
  return startMinutes >= 18 * 60 || startMinutes < 6 * 60 ? 'night' : 'nap';
}

function parseType(value, startMinutes) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s.startsWith('night')) return 'night';
  if (s.startsWith('nap') || s.startsWith('day')) return 'nap';
  return inferType(startMinutes);
}

export const dayKey = ({ y, m, d }) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Convert a 2D array (first row = headers) into sleep sessions.
 * Returns { sessions, errors } where errors are human-readable row problems.
 */
export function rowsToSessions(rows) {
  const errors = [];
  if (!rows.length) return { sessions: [], errors: ['The sheet is empty.'] };
  const cols = mapHeaders(rows[0]);
  for (const required of ['date', 'start', 'end']) {
    if (cols[required] === undefined) {
      errors.push(`Missing a "${required}" column. Expected headers: Date, Start, End, Type (optional), Notes (optional).`);
    }
  }
  if (errors.length) return { sessions: [], errors };

  const sessions = [];
  let lastDate = null;
  rows.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    if (!row || row.every((c) => c === null || c === undefined || c === '')) return;
    // A blank date cell continues the date from the row above.
    const date = parseDateCell(row[cols.date]) ?? lastDate;
    const start = parseTimeCell(row[cols.start]);
    const end = parseTimeCell(row[cols.end]);
    if (!date) return errors.push(`Row ${rowNo}: could not read the date.`);
    if (start === null) return errors.push(`Row ${rowNo}: could not read the start time.`);
    if (end === null) return errors.push(`Row ${rowNo}: could not read the end time.`);
    lastDate = date;

    const type = parseType(cols.type !== undefined ? row[cols.type] : '', start);
    // A row's date is the evening the night began, so night sleep starting
    // in the small hours (e.g. 02:10 after a feed) falls on the next calendar day.
    const nextDay = type === 'night' && start < 12 * 60 ? 1 : 0;
    const base = new Date(date.y, date.m, date.d + nextDay).getTime();
    const startMs = base + start * MS_MIN;
    // End before start means the sleep ran past midnight.
    let endMs = base + end * MS_MIN;
    if (endMs <= startMs) endMs += MS_DAY;

    sessions.push({
      day: dayKey(date),
      start: new Date(startMs),
      end: new Date(endMs),
      minutes: Math.round((endMs - startMs) / MS_MIN),
      type,
      notes: cols.notes !== undefined ? String(row[cols.notes] ?? '') : '',
      ...optionalDetails(row, cols, start),
    });
  });
  annotateSessions(sessions);

  sessions.sort((a, b) => a.start - b.start);
  return { sessions, errors };
}

// Optional columns: when settling started, how the baby fell asleep, mood after waking.
function optionalDetails(row, cols, startMinutes) {
  const details = {};
  if (cols.settle !== undefined) {
    const settle = parseTimeCell(row[cols.settle]);
    if (settle !== null) {
      const diff = (startMinutes - settle + 1440) % 1440;
      if (diff <= 180) details.settleMinutes = diff;
    }
  }
  const text = (col) => (cols[col] !== undefined ? String(row[cols[col]] ?? '').trim() : '');
  if (text('method')) details.method = text('method');
  if (text('mood')) details.mood = text('mood');
  return details;
}

/**
 * Fill in nap position (1, 2, ... per day, 'bedtime' for the night) and the wake window
 * (time awake since the previous sleep ended) where a parser didn't set them. Sessions must be sorted.
 */
export function annotateSessions(sessions) {
  const napNo = new Map();
  const seenNight = new Set();
  let prevEnd = null;
  for (const s of sessions) {
    if (s.position === undefined) {
      if (s.type === 'nap') {
        napNo.set(s.day, (napNo.get(s.day) ?? 0) + 1);
        s.position = napNo.get(s.day);
      } else if (!seenNight.has(s.day)) {
        s.position = 'bedtime';
      }
    }
    if (s.type === 'night') seenNight.add(s.day);
    if (s.wakeWindow === undefined && prevEnd) {
      const gap = Math.round((s.start - prevEnd) / MS_MIN);
      // Gaps of 8h+ mean missing entries rather than a real wake window.
      s.wakeWindow = gap > 0 && gap < 8 * 60 ? gap : null;
    }
    prevEnd = s.end;
  }
  return sessions;
}

/** Aggregate sessions into one record per day, in date order. */
export function dailyStats(sessions) {
  const byDay = new Map();
  for (const s of sessions) {
    if (!byDay.has(s.day)) {
      byDay.set(s.day, { day: s.day, nightMinutes: 0, napMinutes: 0, naps: 0, longestMinutes: 0, sessions: [] });
    }
    const d = byDay.get(s.day);
    d.sessions.push(s);
    if (s.type === 'night') d.nightMinutes += s.minutes;
    else {
      d.napMinutes += s.minutes;
      d.naps += 1;
    }
    d.longestMinutes = Math.max(d.longestMinutes, s.minutes);
  }
  return [...byDay.values()]
    .map((d) => ({ ...d, totalMinutes: d.nightMinutes + d.napMinutes }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Averages across days for the headline tiles. */
export function summary(days) {
  if (!days.length) return null;
  const avg = (f) => days.reduce((sum, d) => sum + f(d), 0) / days.length;
  return {
    days: days.length,
    avgTotal: avg((d) => d.totalMinutes),
    avgNight: avg((d) => d.nightMinutes),
    avgNap: avg((d) => d.napMinutes),
    avgNaps: avg((d) => d.naps),
    longest: Math.max(...days.map((d) => d.longestMinutes)),
  };
}

export function formatDuration(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h ? `${h}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

export function formatClock(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDay(day, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
