import { useMemo, useState } from 'react';
import { readWorkbook } from './lib/readWorkbook.js';
import { dailyStats, summary } from './lib/sleepData.js';
import { hhmm } from './lib/format.js';
import { MS_DAY, clockSpan, dateKey, mean } from './lib/time.js';
import {
  WAKE_WINDOW_SERIES, dayDetails, napsDoneToday, friendsWindows, lastNight, hasDetails, methodsByWeek, settlingByWeek, wakeWindowsByWeek,
} from './lib/insights.js';
import { entriesToSessions, mergeNight } from './lib/entries.js';
import { entryKey, sessionsToEntries } from './lib/cloudData.js';
import { addEntries } from './lib/cloud.js';
import { sleepDay } from './lib/live.js';
import { useNapTarget, useWakeTargets } from './hooks/useWakeTargets.js';
import { useSleepLog } from './hooks/useSleepLog.js';
import LiveTracker from './components/LiveTracker.jsx';
import CloudBar from './components/CloudBar.jsx';
import DaytimeTank from './components/DaytimeTank.jsx';
import LastNightCard from './components/LastNightCard.jsx';
import FileDrop from './components/FileDrop.jsx';
import EntryForm from './components/EntryForm.jsx';
import RecentDaysTable from './components/RecentDaysTable.jsx';
import DailyTotalsChart from './components/DailyTotalsChart.jsx';
import NapCountChart from './components/NapCountChart.jsx';
import SleepTimeline from './components/SleepTimeline.jsx';
import WakeWindowsCard from './components/WakeWindowsCard.jsx';
import WeeklyLineChart from './components/WeeklyLineChart.jsx';
import MethodShareChart from './components/MethodShareChart.jsx';

const RECENT_DAYS = 5;
// Excel upload is hidden for now (user request); flip to true to bring the upload card back.
const SHOW_FILE_UPLOAD = false;
const WAKE_COLORS = ['s1', 's2', 's3', 's4'];
const SETTLING_SERIES = [
  { key: 'night', label: 'Bedtime', color: 'night' },
  { key: 'nap', label: 'Naps', color: 'nap' },
];

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const {
    user, cloud, cloudEntries, localEntries, formEntries, storageOk, cloudError, setCloudError, notice, setNotice, busy, run,
    live, changeLive, saveLiveEntry, onSignIn, onSignOut, moveLocal,
    addEntry, changeEntry, editEntry, removeEntry, editAwake, clearLocal,
  } = useSleepLog();
  const importFile = () => run(async () => {
    const added = await addEntries(sessionsToEntries(data.sessions));
    setNotice(`Saved ${added} new sleep${added === 1 ? '' : 's'} from ${data.name} to the shared log${added < data.sessions.length ? ' (the rest were already there)' : ''}.`);
    setData(null);
  });

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
    const fromFile = (data?.sessions ?? []).filter((s) => !keys.has(`${s.day}|${s.type}|${hhmm(s.start)}`));
    return [...fromFile, ...saved].sort((a, b) => a.start - b.start);
  }, [data, formEntries]);
  // A sleep in progress counts in the daytime tank (up to now) but not in the charts until it's saved.
  const tankSessions = useMemo(() => {
    if (!live?.asleep) return sessions;
    const start = new Date(live.asleep);
    const ongoing = { day: sleepDay(live.type, start), type: live.type, start, end: new Date(Date.now() + MS_DAY), minutes: 0 };
    return [...sessions, ongoing];
  }, [sessions, live]);
  const dayMeta = data?.days ?? [];
  const days = useMemo(() => dailyStats(sessions), [sessions]);
  // The summary tiles describe the last 5 days with data before today (today is still in progress).
  const recentDays = useMemo(() => {
    const today = dateKey(new Date());
    return days.filter((d) => d.day < today).slice(-RECENT_DAYS);
  }, [days]);
  const stats = useMemo(() => summary(recentDays), [recentDays]);
  const recentKeys = useMemo(() => recentDays.map((d) => d.day), [recentDays]);
  const friends = useMemo(() => friendsWindows(sessions, recentKeys), [sessions, recentKeys]);
  const recentAvg = useMemo(
    () => (stats && recentDays.length ? { avgMinutes: stats.avgTotal, from: recentDays[0].day, to: recentDays.at(-1).day } : null),
    [stats, recentDays],
  );
  // Last night's summary for the tank card (recomputed when the date changes).
  const todayStamp = new Date().toDateString();
  const night = useMemo(() => lastNight(sessions, new Date()), [sessions, todayStamp]);
  // Last night's saved entries (usually one; several if it was saved in parts) and the first of them,
  // which holds the notes edited on the Last night card.
  const nightParts = useMemo(
    () => (night ? formEntries.filter((e) => e.type === 'night' && e.day === night.day)
      .sort((a, b) => clockSpan('12:00', a.asleep) - clockSpan('12:00', b.asleep)) : []),
    [night, formEntries],
  );
  const nightEntry = nightParts[0] ?? null;
  // Target wake windows (set in the tank card, shown in the Now card), one row per nap seen recently.
  const [wakeTargets, setWakeTarget] = useWakeTargets(cloud, setCloudError);
  const [napTarget, setNapTarget] = useNapTarget(cloud, setCloudError);
  const napRows = useMemo(() => Math.max(
    3,
    napsDoneToday(sessions) + 1,
    ...sessions.filter((s) => recentKeys.includes(s.day) && typeof s.position === 'number').map((s) => s.position),
    ...Object.keys(wakeTargets).filter((k) => k !== 'bedtime').map(Number),
  ), [sessions, recentKeys, wakeTargets]);
  // For the expected wake-up: average total sleep of the 5 days before the night being tracked
  // (after midnight that night's own day, with only its naps, must not count).
  const nightDay = live?.asleep && live.type === 'night' ? sleepDay('night', new Date(live.asleep)) : null;
  const nightAvgTotal = useMemo(
    () => (nightDay ? mean(days.filter((d) => d.day < nightDay).slice(-RECENT_DAYS).map((d) => d.totalMinutes)) : null),
    [days, nightDay],
  );
  const recentDetails = useMemo(() => recentDays.map((d) => dayDetails(d, sessions)), [recentDays, sessions]);
  const awakeAvg = useMemo(() => mean(recentDetails.map((d) => d.awakeMinutes).filter((v) => v != null)), [recentDetails]);
  const detailed = useMemo(() => hasDetails(sessions), [sessions]);
  const insights = useMemo(() => {
    if (!detailed) return null;
    return {
      settling: settlingByWeek(sessions),
      wakeWindows: wakeWindowsByWeek(sessions),
      methods: methodsByWeek(sessions),
    };
  }, [sessions, detailed]);

  return (
    <main>
      <header>
        <h1>Nap Nap Hooray</h1>
        <p className="subtitle">Every snooze, celebrated.</p>
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

      <LiveTracker live={live} onChange={changeLive} onSave={saveLiveEntry} onEditAwake={editAwake} sessions={sessions} busy={busy} awakeAvg={awakeAvg} avgTotal={nightAvgTotal} wakeTargets={wakeTargets} />
      {(sessions.length > 0 || live?.asleep) && (
        <DaytimeTank
          sessions={tankSessions}
          autoTarget={stats?.avgNap ?? 0}
          napTarget={napTarget}
          onNapTarget={setNapTarget}
          wakeTargets={wakeTargets}
          napRows={napRows}
          onWakeTarget={setWakeTarget}
        />
      )}
      {(sessions.length > 0 || live?.asleep) && (
        <LastNightCard
          night={night}
          entry={nightEntry}
          onSaveNotes={(notes) => changeEntry(nightEntry, { ...nightEntry, notes })}
          parts={nightParts.length}
          onSaveWakings={async (wakings) => {
            // Saving joins a night stored in parts into one entry holding every waking.
            const { entry, error: err } = mergeNight(nightParts, wakings);
            if (err) throw new Error(err);
            await editEntry(nightEntry, entry);
            for (const part of nightParts.slice(1)) await removeEntry(part.id);
          }}
        />
      )}
      {recentDays.length > 0 && <WakeWindowsCard sessions={sessions} dayKeys={recentKeys} details={recentDetails} />}
      {recentDays.length > 0 && <SleepTimeline sessions={sessions} dayKeys={recentKeys} friends={friends} />}

      {SHOW_FILE_UPLOAD && <FileDrop onFile={onFile} onSample={onSample} />}
      {error && <p className="error" role="alert">{error}</p>}

      {cloud && data && (
        <div className="notice">
          <p><strong>{data.name}</strong> is only open on this device. Save its {data.sessions.length} sleeps to the shared log so you don’t need the file again.</p>
          <button type="button" className="button primary" onClick={importFile} disabled={busy}>
            {busy ? 'Saving…' : 'Save to shared log'}
          </button>
        </div>
      )}
      {cloud && localEntries.length > 0 && (
        <div className="notice">
          <p><strong>{localEntries.length} entr{localEntries.length === 1 ? 'y is' : 'ies are'}</strong> saved only in this browser.</p>
          <button type="button" className="button" onClick={moveLocal} disabled={busy}>Move to shared log</button>
        </div>
      )}

      <EntryForm
        entries={formEntries}
        cloud={cloud}
        storageOk={storageOk}
        onAdd={addEntry}
        onUpdate={editEntry}
        onDelete={removeEntry}
        onClear={cloud ? null : clearLocal}
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
          {recentDays.length > 0 && (
            <RecentDaysTable
              title={`Last ${recentDays.length} day${recentDays.length === 1 ? '' : 's'} (excluding today)`}
              days={recentDetails}
            />
          )}
          <DailyTotalsChart
            days={days}
            recent={recentAvg}
          />
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
        </>
      )}
    </main>
  );
}
