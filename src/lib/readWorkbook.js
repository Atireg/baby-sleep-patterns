import { read, utils } from 'xlsx';
import { rowsToSessions } from './sleepData.js';

/** Read the first sheet of an .xlsx/.xls/.csv file (as ArrayBuffer) into sleep sessions. */
export function readWorkbook(arrayBuffer) {
  const wb = read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw: true keeps Excel date/time serial numbers, which the parser understands.
  const rows = utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  return { sheetName: wb.SheetNames[0], ...rowsToSessions(rows) };
}
