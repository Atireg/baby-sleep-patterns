import { useEffect, useMemo, useState } from 'react';
import { readWorkbook } from './lib/readWorkbook.js';
import { dailyStats, formatClock, formatDay, summary } from './lib/sleepData.js';
import {
  WAKE_WINDOW_SERIES, detailSummary, hasDetails, methodsByWeek, settlingByWeek, wakeWindowsByWeek,
} from './lib/insights.js';
import { entriesToSessions, loadEntries, saveEntries } from './lib/entries.js';
import { entryKey, sessionsToEntries } from './lib/cloudData.js';
import { addEntries, deleteEntry, describeError, signIn, signOut, watchEntries, watchUser } from './lib/cloud.js';
import CloudBar from './components/CloudBar.jsx';
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
  // Entries kept only in this browser (used when not signed in).
  const [entries, setEntries] = useState(loadEntries);
  const [storageOk, setStorageOk] = useState(true);
  useEffect(() => { setStorageOk(saveEntries(entries)); }, [entries]);

  // Shared cloud log (Firebase). user: undefined = still checking, null = signed out.
  const [user, setUser] = useState(undefined);
  const [cloudEntries, setCloudEntries] = useState([]);
  const [cloudError, setCloudError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => watchUser(setUser), []);
  useEffect(() => {
    setCloudEntries([]);
    setCloudError(null);
    if (!user) return undefined;
    return watchEntries(setCloudEntries, (e) => setCloudError(describeError(e)));
  }, [user]);
  const cloud = Boolean(user);
  const formEntries = cloud ? cloudEntries : entries;

  const report = (e) => setCloudError(describeError(e));
  const run = async (task) => {
    setBusy(true);
    setCloudError(null);
    try {
      await task();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const onSignIn = () => run(signIn);
  const onSignOut = () => run(async () => { await signOut(); setNotice(null); });
  const importFile = () => run(async () => {
    const added = await addEntries(sessionsToEntries(data.sessions));
    setNotice(`Saved ${added} new sleep${added === 1 ? '' : 's'} from ${data.name} to the shared log${added < data.sessions.length ? ' (the rest were already there)' : ''}.`);
    setData(null);
  });
  const moveLocal = () => run(async () => {
    const added = await addEntries(entries);
    setEntries([]);
    setNotice(`Moved ${added} entr${added === 1 ? 'y' : 'ies'} from this device to the shared log.`);
  });
  const addEntry = (e) => (cloud ? run(() => addEntries([e])) : setEntries((list) => [...list, e]));
  const removeEntry = (id) => (cloud
    ? run(() => deleteEntry(cloudEntries.find((e) => e.id === id)))
    : setEntries((list) => list.filter((e) => e.id !== id)));

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

  // Charts combine a loaded file with the saved entries; sleeps already saved aren't counted twice.
  const sessions = useMemo(() => {
    const saved = entriesToSessions(formEntries);
    const keys = new Set(formEntries.map(entryKey));
    const fromFile = (data?.sessions ?? []).filter((s) => !keys.has(`${s.day}|${s.type}|${formatClock(s.start)}`));
    return [...fromFile, ...saved].sort((a, b) => a.start - b.start);
  }, [data, formEntries]);
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

      <CloudBar
        user={user}
        count={cloudEntries.length}
        busy={busy}
        error={cloudError}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
      {notice && <p className="loaded" role="status">{notice}</p>}

      <FileDrop onFile={onFile} onSample={onSample} />
      {error && <p className="error" role="alert">{error}</p>}

      {cloud && data && (
        <div className="notice">
          <p><strong>{data.name}</strong> is only open on this device. Save its {data.sessions.length} sleeps to the shared log so you don’t need the file again.</p>
          <button type="button" className="button primary" onClick={importFile} disabled={busy}>
            {busy ? 'Saving…' : 'Save to shared log'}
          </button>
        </div>
      )}
      {cloud && entries.length > 0 && (
        <div className="notice">
          <p><strong>{entries.length} entr{entries.length === 1 ? 'y is' : 'ies are'}</strong> saved only in this browser.</p>
          <button type="button" className="button" onClick={moveLocal} disabled={busy}>Move to shared log</button>
        </div>
      )}

      <EntryForm
        entries={formEntries}
        cloud={cloud}
        storageOk={storageOk}
        onAdd={addEntry}
        onDelete={removeEntry}
        onClear={cloud ? null : () => setEntries([])}
      />

      {sessions.length > 0 && (
        <>
          <p className="loaded">
            Showing {data && <><strong>{data.name}</strong>{formEntries.length > 0 && ' + '}</>}
            {formEntries.length > 0 && (cloud ? `shared log (${formEntries.length})` : `${formEntries.length} entered on this site`)}
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
