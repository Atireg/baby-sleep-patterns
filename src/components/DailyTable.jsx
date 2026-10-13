import { formatDay, formatDuration } from '../lib/sleepData.js';

export default function DailyTable({ days }) {
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
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{formatDay(d.day)}</td>
                <td className="num">{formatDuration(d.nightMinutes)}</td>
                <td className="num">{d.naps}</td>
                <td className="num">{formatDuration(d.napMinutes)}</td>
                <td className="num">{formatDuration(d.totalMinutes)}</td>
                <td className="num">{formatDuration(d.longestMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
