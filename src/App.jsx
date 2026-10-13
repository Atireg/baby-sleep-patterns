import { useMemo, useState } from 'react';
import { readWorkbook } from './lib/readWorkbook.js';
import { dailyStats, formatDuration, summary } from './lib/sleepData.js';
import {
  WAKE_WINDOW_SERIES, detailSummary, hasDetails, methodsByWeek, settlingByWeek, wakeWindowsByWeek,
} from './lib/insights.js';
import FileDrop from './components/FileDrop.jsx';
import StatTiles from './components/StatTiles.jsx';
import DailyTotalsChart from './components/DailyTotalsChart.jsx';
import SleepTimeline from './components/SleepTimeline.jsx';
import WeeklyLineChart from './components/WeeklyLineChart.jsx';
import MethodShareChart from './components/MethodShareChart.jsx';
import DailyTable from './components/DailyTable.jsx';

const WAKE_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const SETTLING_SERIES = [
  { key: 'night', label: 'Bedtime', color: 'var(--series-1)' },
  { key: 'nap', label: 'Naps', color: 'var(--series-2)' },
];

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
  const detailed = useMemo(() => (data ? hasDetails(data.sessions) : false), [data]);
  const insights = useMemo(() => detailed && {
    summary: detailSummary(data.sessions, data.days),
    settling: settlingByWeek(data.sessions),
    wakeWindows: wakeWindowsByWeek(data.sessions),
    methods: methodsByWeek(data.sessions),
  }, [data, detailed]);

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
            Showing <strong>{data.name}</strong> · {data.sessions.length} sleeps over {days.length} days
            {data.errors.length > 0 && ` · ${data.errors.length} row(s) skipped`}
          </p>
          {data.profile?.name && (
            <p className="profile">
              {data.profile.name}
              {data.profile.birth && ` · born ${data.profile.birth}`}
            </p>
          )}
          {data.errors.length > 0 && (
            <details className="warnings">
              <summary>Skipped rows</summary>
              <ul>{data.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          )}
          <StatTiles stats={stats} details={insights?.summary} />
          <DailyTotalsChart days={days} />
          {insights && (
            <>
              <WeeklyLineChart
                title="Wake windows"
                subtitle="Average time awake before each nap and before bedtime, per week"
                rows={insights.wakeWindows}
                series={WAKE_WINDOW_SERIES.map((s, i) => ({ ...s, color: WAKE_COLORS[i] }))}
                format={formatDuration}
              />
              <div className="grid-2">
                <WeeklyLineChart
                  title="Time to fall asleep"
                  subtitle="Average from starting to settle until asleep, per week"
                  rows={insights.settling}
                  series={SETTLING_SERIES}
                  format={formatDuration}
                  step={10}
                />
                <MethodShareChart weeks={insights.methods} />
              </div>
            </>
          )}
          <SleepTimeline sessions={data.sessions} />
          <DailyTable days={days} meta={data.days} />
        </>
      )}
    </main>
  );
}
