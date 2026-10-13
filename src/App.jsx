import { useEffect, useMemo, useState } from 'react';
import { readWorkbook } from './lib/readWorkbook.js';
import { dailyStats, formatDay, summary } from './lib/sleepData.js';
import {
  WAKE_WINDOW_SERIES, detailSummary, hasDetails, methodsByWeek, settlingByWeek, wakeWindowsByWeek,
} from './lib/insights.js';
import { entriesToSessions, loadEntries, saveEntries } from './lib/entries.js';
import FileDrop from './components/FileDrop.jsx';
import EntryForm from './components/EntryForm.jsx';
import StatTiles from './components/StatTiles.jsx';
import DailyTotalsChart from './components/DailyTotalsChart.jsx';
import NapCountChart from './components/NapCountChart.jsx';
import SleepTimeline from './components/SleepTimeline.jsx';
import WeeklyLineChart from './components/WeeklyLineChart.jsx';
import MethodShareChart from './components/MethodShareChart.jsx';

const RECENT_DAYS = 5;
const WAKE_COLORS = ['s1', 's2', 's3', 's4'];
const SETTLING_SERIES = [
  { key: 'night', label: 'Bedtime', color: 'night' },
  { key: 'nap', label: 'Naps', color: 'nap' },
];

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState(loadEntries);
  const [storageOk, setStorageOk] = useState(true);
  useEffect(() => { setStorageOk(saveEntries(entries)); }, [entries]);

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

  // Charts combine the uploaded file with sleeps entered on the site.
  const sessions = useMemo(
    () => [...(data?.sessions ?? []), ...entriesToSessions(entries)].sort((a, b) => a.start - b.start),
    [data, entries],
  );
  const dayMeta = data?.days ?? [];
  const days = useMemo(() => dailyStats(sessions), [sessions]);
  // The summary tiles describe only the most recent days in the log.
  const recentDays = useMemo(() => days.slice(-RECENT_DAYS), [days]);
  const stats = useMemo(() => summary(recentDays), [recentDays]);
  const detailed = useMemo(() => hasDetails(sessions), [sessions]);
  const insights = useMemo(() => {
    if (!detailed) return null;
    const recent = new Set(recentDays.map((d) => d.day));
    return {
      summary: detailSummary(sessions.filter((x) => recent.has(x.day)), dayMeta.filter((x) => recent.has(x.day))),
      settling: settlingByWeek(sessions),
      wakeWindows: wakeWindowsByWeek(sessions),
      methods: methodsByWeek(sessions),
    };
  }, [sessions, dayMeta, detailed, recentDays]);

  return (
    <main>
      <header>
        <h1>Baby Sleep Patterns</h1>
        <p className="subtitle">Visualise and analyse your baby's sleep from an Excel log.</p>
      </header>

      <FileDrop onFile={onFile} onSample={onSample} />
      {error && <p className="error" role="alert">{error}</p>}

      <EntryForm
        entries={entries}
        storageOk={storageOk}
        onAdd={(e) => setEntries((list) => [...list, e])}
        onDelete={(id) => setEntries((list) => list.filter((e) => e.id !== id))}
        onClear={() => setEntries([])}
      />

      {sessions.length > 0 && (
        <>
          <p className="loaded">
            Showing {data && <><strong>{data.name}</strong>{entries.length > 0 && ' + '}</>}
            {entries.length > 0 && `${entries.length} entered on this site`}
            {' '}· {sessions.length} sleeps over {days.length} days
            {data?.errors.length > 0 && ` · ${data.errors.length} row(s) skipped`}
          </p>
          {data?.errors.length > 0 && (
            <details className="warnings">
              <summary>Skipped rows</summary>
              <ul>{data.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          )}
          <StatTiles
            title={`Last ${recentDays.length} days`}
            range={`${formatDay(recentDays[0].day, { day: 'numeric', month: 'short' })} – ${formatDay(recentDays.at(-1).day, { day: 'numeric', month: 'short' })}`}
            stats={stats}
            details={insights?.summary}
          />
          <DailyTotalsChart days={days} />
          <NapCountChart days={days} />
          {insights && (
            <>
              <WeeklyLineChart
                title="Wake windows"
                subtitle="Average time awake before each nap and before bedtime, per week"
                rows={insights.wakeWindows}
                series={WAKE_WINDOW_SERIES.map((s, i) => ({ ...s, color: WAKE_COLORS[i] }))}
              />
              <div className="grid-2">
                <WeeklyLineChart
                  title="Time to fall asleep"
                  subtitle="Average from starting to settle until asleep, per week"
                  rows={insights.settling}
                  series={SETTLING_SERIES}
                  step={10}
                  area
                />
                <MethodShareChart weeks={insights.methods} />
              </div>
            </>
          )}
          <SleepTimeline sessions={sessions} />
        </>
      )}
    </main>
  );
}
