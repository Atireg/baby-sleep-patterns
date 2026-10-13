import { formatDuration } from '../lib/sleepData.js';

export default function StatTiles({ stats }) {
  const tiles = [
    { label: 'Avg. total sleep / day', value: formatDuration(stats.avgTotal) },
    { label: 'Avg. night sleep', value: formatDuration(stats.avgNight) },
    { label: 'Avg. nap time', value: formatDuration(stats.avgNap) },
    { label: 'Avg. naps / day', value: stats.avgNaps.toFixed(1) },
    { label: 'Longest stretch', value: formatDuration(stats.longest) },
  ];
  return (
    <section className="tiles" aria-label="Summary">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <div className="tile-label">{t.label}</div>
          <div className="tile-value">{t.value}</div>
        </div>
      ))}
    </section>
  );
}
