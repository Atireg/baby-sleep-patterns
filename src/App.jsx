import { useMemo, useState } from 'react';
import { readWorkbook } from './lib/readWorkbook.js';
import { dailyStats, summary } from './lib/sleepData.js';
import FileDrop from './components/FileDrop.jsx';
import StatTiles from './components/StatTiles.jsx';
import DailyTotalsChart from './components/DailyTotalsChart.jsx';
import SleepTimeline from './components/SleepTimeline.jsx';
import DailyTable from './components/DailyTable.jsx';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = (name, buffer) => {
    try {
      const result = readWorkbook(buffer);
      if (!result.sessions.length) {
        setData(null);
        setError(result.errors.join(' ') || 'No sleep sessions found in the file.');
        return;
      }
      setData({ name, ...result });
      setError(null);
    } catch (e) {
      setData(null);
      setError(`Could not read "${name}": ${e.message}`);
    }
  };

  const onFile = async (file) => load(file.name, await file.arrayBuffer());
  const onSample = async () => {
    const res = await fetch('sample-sleep-log.xlsx');
    load('sample-sleep-log.xlsx', await res.arrayBuffer());
  };

  const days = useMemo(() => (data ? dailyStats(data.sessions) : []), [data]);
  const stats = useMemo(() => summary(days), [days]);

  return (
    <main>
      <header>
        <h1>Baby Sleep Patterns</h1>
        <p className="subtitle">Visualise and analyse your baby's sleep from an Excel log.</p>
      </header>

      <FileDrop onFile={onFile} onSample={onSample} />
      {error && <p className="error" role="alert">{error}</p>}

      {data && (
        <>
          <p className="loaded">
            Showing <strong>{data.name}</strong> · {data.sessions.length} sessions over {days.length} days
            {data.errors.length > 0 && ` · ${data.errors.length} row(s) skipped`}
          </p>
          {data.errors.length > 0 && (
            <details className="warnings">
              <summary>Skipped rows</summary>
              <ul>{data.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          )}
          <StatTiles stats={stats} />
          <DailyTotalsChart days={days} />
          <SleepTimeline sessions={data.sessions} />
          <DailyTable days={days} />
        </>
      )}
    </main>
  );
}
