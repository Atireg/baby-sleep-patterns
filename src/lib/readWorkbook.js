import { read, utils } from 'xlsx';
import { rowsToSessions } from './sleepData.js';
import { consultantLogToSessions, isConsultantLog } from './consultantLog.js';

/**
 * Read the first sheet of an .xlsx/.xls/.csv file (as ArrayBuffer) into sleep sessions.
 * Supports the simple one-row-per-sleep layout and the sleep-consultant template.
 */
export function readWorkbook(arrayBuffer) {
  const wb = read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw: true keeps Excel date/time serial numbers, which the parsers understand.
  const rows = utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  if (isConsultantLog(rows)) {
    return { sheetName: wb.SheetNames[0], format: 'consultant', ...consultantLogToSessions(rows) };
  }
  return { sheetName: wb.SheetNames[0], format: 'simple', days: [], ...rowsToSessions(rows) };
}
