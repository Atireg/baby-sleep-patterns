import { formatClock, formatDay, formatDuration } from '../lib/sleepData.js';

export default function DailyTable({ days, meta = [] }) {
  const notes = new Map(meta.map((m) => [m.day, m]));
  const hasNotes = meta.some((m) => m.notes);
  return (
    <section className="card">
      <h2>Daily breakdown</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">Night</th>
              <th className="num">Naps</th>
              <th className="num">Nap time</th>
              <th className="num">Total</th>
              <th className="num">Longest stretch</th>
              <th className="num">Bedtime</th>
              {hasNotes && <th>Notes</th>}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const bed = d.sessions.find((s) => s.type === 'night');
              const note = notes.get(d.day)?.notes;
              return (
                <tr key={d.day}>
                  <td>{formatDay(d.day)}</td>
                  <td className="num">{d.nightMinutes ? formatDuration(d.nightMinutes) : '–'}</td>
                  <td className="num">{d.naps}</td>
                  <td className="num">{formatDuration(d.napMinutes)}</td>
                  <td className="num">{formatDuration(d.totalMinutes)}</td>
                  <td className="num">{formatDuration(d.longestMinutes)}</td>
                  <td className="num">{bed ? formatClock(bed.start) : '–'}</td>
                  {hasNotes && <td className="note" title={note}>{note}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
