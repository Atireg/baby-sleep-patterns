import { formatDuration } from '../lib/sleepData.js';

const clock = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const pct = (x) => `${Math.round(x * 100)}%`;

export default function StatTiles({ title, range, stats, awake, settling, details }) {
  const tiles = [
    { label: 'Avg. total sleep / day', value: formatDuration(stats.avgTotal) },
    { label: 'Avg. night sleep', value: formatDuration(stats.avgNight) },
    { label: 'Avg. nap time', value: formatDuration(stats.avgNap) },
    { label: 'Avg. naps / day', value: stats.avgNaps.toFixed(1) },
  ];
  if (awake?.avgAwakePerDay != null) tiles.push({ label: 'Avg. awake time / day', value: formatDuration(awake.avgAwakePerDay) });
  if (settling?.avgPerNap != null) tiles.push({ label: 'Avg. time to fall asleep / nap', value: formatDuration(settling.avgPerNap) });
  if (settling?.avgPerDay != null) tiles.push({ label: 'Avg. time settling / day', value: formatDuration(settling.avgPerDay) });
  if (details) {
    if (details.avgMorningWake != null) tiles.push({ label: 'Avg. morning wake', value: clock(details.avgMorningWake) });
    if (details.avgBedtime != null) tiles.push({ label: 'Avg. bedtime (asleep)', value: clock(details.avgBedtime) });
    if (details.independentShare != null) tiles.push({ label: 'Fell asleep independently', value: pct(details.independentShare) });
    if (details.cryingAfterNapShare != null) tiles.push({ label: 'Naps ending crying / fussy', value: pct(details.cryingAfterNapShare) });
  }
  return (
    <section className="summary" aria-label={`Summary, ${title}`}>
      <h2>
        {title} <span className="summary-range">{range}</span>
      </h2>
      <div className="tiles">
        {tiles.map((t) => (
          <div className="tile" key={t.label}>
            <div className="tile-label">{t.label}</div>
            <div className="tile-value">{t.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
