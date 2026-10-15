import { useEffect, useMemo, useState } from 'react';
import {
  METHODS, MOODS, dayAwakeTotal, expectedBedtime, expectedWakeUp, upcomingNap, upcomingWakeWindow,
} from '../lib/insights.js';
import { atTime, awakeSince as findAwakeSince, formatTimer, hhmm, liveToEntry, resolveWakings, sleepDay, typeAt } from '../lib/live.js';
import { countsAsSleep, formatDuration } from '../lib/sleepData.js';

/** Ticks every second while a timer is on screen. */
function useTicker(active) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (!active) return undefined;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip ${value === o ? 'active' : ''}`}
          aria-pressed={value === o}
          onClick={() => onChange(value === o ? '' : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * "Now" card for logging on the go: Start settling → Fell asleep → Woke up.
 * live: { type, settle, asleep, method, wakings: [{ from, to }], wakingFrom } or null (ISO times);
 * onChange persists it; onSave(entry) stores the finished sleep.
 */
export default function LiveTracker({ live, onChange, onSave, onEditAwake, sessions, busy, awakeAvg = null }) {
  // live may hold only { awakeFrom } (a manually started awake timer) — that still counts as idle.
  const state = live?.asleep ? (live.wakingFrom ? 'nightawake' : 'asleep') : live?.settle ? 'settling' : 'idle';
  const sleeping = state === 'asleep' || state === 'nightawake';
  const now = useTicker(true);
  const awakeSince = findAwakeSince(sessions, live, now);
  // How long the next (or current) nap usually lasts, from the last 3 days. Recomputed once a minute.
  const minuteKey = Math.floor(now.getTime() / 60000);
  const nap = useMemo(() => upcomingNap(sessions, new Date(minuteKey * 60000)), [sessions, minuteKey]);
  const bedtime = useMemo(() => {
    const at = new Date(minuteKey * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    // Once tonight's sleep has been logged, bedtime has happened.
    if (sessions.some((x) => x.type === 'night' && x.day === today)) return null;
    const exp = expectedBedtime(sessions, at);
    if (!exp) return null;
    const when = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, exp.minutes);
    return { ...exp, when };
  }, [sessions, minuteKey]);
  const bedtimeLine = bedtime && (() => {
    const diff = Math.round((bedtime.when - now) / 60000);
    return (
      <p className="nap-forecast bedtime-forecast">
        🌙 Expected bedtime <strong>~{hhmm(bedtime.when)}</strong>
        {diff > 10 && <> · in <strong>{formatDuration(diff)}</strong></>}
        {Math.abs(diff) <= 10 && <> · <strong>about now</strong></>}
        {diff < -10 && <> · {formatDuration(-diff)} past the usual time</>}
        <span className="muted"> (avg of last {bedtime.samples === 1 ? 'night' : `${bedtime.samples} nights`})</span>
      </p>
    );
  })();
  // Expected morning wake-up during a night, from when the last 3 nights ended.
  const wakeUp = useMemo(() => expectedWakeUp(sessions, new Date(minuteKey * 60000)), [sessions, minuteKey]);
  const wakeUpLine = live?.asleep && live.type === 'night' && wakeUp && (() => {
    const start = new Date(live.asleep);
    const when = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, wakeUp.minutes);
    if (when <= start) when.setDate(when.getDate() + 1);
    const left = Math.round((when - now) / 60000);
    const share = Math.min(1, Math.max(0, (now - start) / (when - start)));
    return (
      <div className="nap-progress">
        <p className="nap-forecast wake-forecast">
          ☀️ Expected wake-up <strong>~{hhmm(when)}</strong>
          {left > 10 && <> · in <strong>{formatDuration(left)}</strong></>}
          {Math.abs(left) <= 10 && <> · <strong>about now</strong></>}
          {left < -10 && <> · {formatDuration(-left)} past the usual time</>}
          <span className="muted"> (avg of last {wakeUp.samples === 1 ? 'night' : `${wakeUp.samples} nights`})</span>
        </p>
        <div className="nap-progress-bar night" role="progressbar" aria-label="Night so far"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <div style={{ width: `${share * 100}%` }} />
        </div>
      </div>
    );
  })();
  // Usual wake window before the next nap (or bedtime), from the last 5 days.
  const wakeWindow = useMemo(() => upcomingWakeWindow(sessions, new Date(minuteKey * 60000)), [sessions, minuteKey]);
  const wakeWindowLine = wakeWindow && (() => {
    const label = wakeWindow.target === 'bedtime' ? 'bedtime' : `the ${ordinal(wakeWindow.target)} nap`;
    const awakeMin = awakeSince ? (now - awakeSince) / 60000 : null;
    const share = awakeMin == null ? 0 : Math.min(1, awakeMin / wakeWindow.avgMinutes);
    const due = awakeSince ? new Date(awakeSince.getTime() + wakeWindow.avgMinutes * 60000) : null;
    return (
      <div className="nap-progress">
        <p className="nap-forecast window-forecast">
          ⏱ Wake window before {label}: usually <strong>~{formatDuration(wakeWindow.avgMinutes)}</strong>
          {due && awakeMin < wakeWindow.avgMinutes && <> · sleepy around <strong>{hhmm(due)}</strong></>}
          {due && awakeMin >= wakeWindow.avgMinutes && <> · <strong>{formatDuration(awakeMin - wakeWindow.avgMinutes)} over</strong> — time to settle?</>}
          <span className="muted"> (last {wakeWindow.samples === 1 ? 'day' : `${wakeWindow.samples} days`})</span>
        </p>
        {awakeMin != null && (
          <div className={`nap-progress-bar window ${awakeMin >= wakeWindow.avgMinutes ? 'over' : ''}`} role="progressbar"
            aria-label="Awake time against the usual wake window" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
            <div style={{ width: `${share * 100}%` }} />
          </div>
        )}
      </div>
    );
  })();
  // During the night: how long she was awake during the day that just ended (wake-up → bedtime, minus naps).
  const dayAwake = useMemo(() => {
    if (!live?.asleep || live.type !== 'night') return null;
    const bed = new Date(live.asleep);
    return dayAwakeTotal(sessions, sleepDay('night', bed), bed);
  }, [sessions, live?.asleep, live?.type]);
  const dayAwakeLine = dayAwake && (
    <p className="nap-forecast day-awake">
      🌤 Awake today: <strong>{formatDuration(dayAwake.minutes)}</strong>
      <span className="muted">
        {' '}({hhmm(dayAwake.wake)} → {hhmm(dayAwake.bedtime)}{dayAwake.napMinutes ? `, minus ${formatDuration(dayAwake.napMinutes)} of naps` : ''})
        {awakeAvg != null && ` · 5-day avg ${formatDuration(awakeAvg)}`}
      </span>
    </p>
  );
  function ordinal(n) {
    return `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
  }
  const napForecast = (
    <p className="nap-forecast">
      💤 Next: <strong>{ordinal(nap.position)} nap</strong>
      {nap.avgMinutes != null
        ? <> · usually <strong>~{formatDuration(nap.avgMinutes)}</strong> <span className="muted">(last {nap.samples === 1 ? 'day' : `${nap.samples} days`} with a {ordinal(nap.position)} nap)</span></>
        : <span className="muted"> · no {ordinal(nap.position)} nap in the last {nap.days || 3} days — maybe bedtime is next?</span>}
    </p>
  );
  const [at, setAt] = useState(''); // optional "tapped late" time
  const [finishing, setFinishing] = useState(null); // { woke, mood, notes }
  const [error, setError] = useState(null);
  const [type, setType] = useState(null); // manual override while idle
  const [editTimes, setEditTimes] = useState(null); // { type, settle, asleep, wakings, wakingFrom } as "HH:MM" while correcting

  useEffect(() => { if (state === 'idle') { setFinishing(null); setEditTimes(null); } }, [state]);

  const openEditTimes = () => {
    setError(null);
    setEditTimes({
      type: live.type,
      settle: live.settle ? hhmm(new Date(live.settle)) : '',
      asleep: live.asleep ? hhmm(new Date(live.asleep)) : '',
      wakings: (live.wakings ?? []).map((w) => ({ from: hhmm(new Date(w.from)), to: hhmm(new Date(w.to)), feed: Boolean(w.feed) })),
      wakingFrom: live.wakingFrom ? hhmm(new Date(live.wakingFrom)) : '',
    });
  };
  const setEditWaking = (i, patch) => setEditTimes((x) => ({ ...x, wakings: x.wakings.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  const saveEditTimes = () => {
    const nowDate = new Date();
    const asleep = editTimes.asleep ? atTime(editTimes.asleep, nowDate) : null;
    // Settling happens before falling asleep, so read it relative to that moment.
    const settle = editTimes.settle ? atTime(editTimes.settle, asleep ?? nowDate) : null;
    if (live.asleep && !asleep) return setError('Enter when she fell asleep.');
    if (!live.asleep && !settle) return setError('Enter when settling started.');
    if (asleep && nowDate - asleep > 16 * 3600000) return setError('That would mean she has been asleep for over 16 hours — check the time.');
    // Night wakings only exist for a night she is (or was) asleep in.
    const night = asleep && editTimes.type === 'night';
    if (night && state === 'nightawake' && !editTimes.wakingFrom) return setError('Enter when she woke up, or tap “Back asleep”.');
    const resolved = night ? resolveWakings(asleep, editTimes.wakings, editTimes.wakingFrom, nowDate) : { wakings: [], wakingFrom: null };
    if (resolved.error) return setError(resolved.error);
    onChange({
      ...live,
      type: editTimes.type,
      settle: settle ? settle.toISOString() : null,
      asleep: asleep ? asleep.toISOString() : null,
      wakings: resolved.wakings,
      wakingFrom: resolved.wakingFrom,
      wakingFeed: resolved.wakingFrom ? live.wakingFeed ?? false : false,
    });
    setEditTimes(null);
    setError(null);
  };

  const when = () => (at ? atTime(at, new Date()) : new Date());
  const idleType = type ?? typeAt(now);
  const act = (fn) => { setError(null); fn(); setAt(''); };

  const startSettling = () => act(() => {
    const t = when();
    onChange({ type: idleType, settle: t.toISOString(), asleep: null, method: '', awakeFrom: live?.awakeFrom ?? null });
  });
  const fellAsleep = () => act(() => {
    const t = when();
    if (live?.settle && t < new Date(live.settle)) return setError('That’s before settling started.');
    onChange({ type: live?.type ?? idleType, settle: live?.settle ?? null, asleep: t.toISOString(), method: live?.method ?? '' });
    setType(null);
  });
  const cancel = () => {
    if (window.confirm('Discard this sleep without saving?')) {
      onChange(live?.awakeFrom ? { awakeFrom: live.awakeFrom } : null); // keep a manually started awake timer
      setError(null);
      setType(null);
    }
  };
  const save = async () => {
    // Use the exact tap time unless the wake-up time was changed by hand.
    const woke = finishing.woke === hhmm(finishing.tapped) ? finishing.tapped : atTime(finishing.woke, new Date());
    const { entry, error: err } = liveToEntry(live, woke, finishing);
    if (err) return setError(err);
    try {
      await onSave(entry);
      onChange(null);
      setFinishing(null);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not save.');
    }
  };

  const startAwake = () => act(() => onChange({ awakeFrom: when().toISOString() }));
  // "awake since" edited by hand: changes the logged sleep's wake-up time, or the manual timer.
  const [editAwake, setEditAwake] = useState(null); // "HH:MM" while editing
  const saveAwake = async () => {
    try {
      await onEditAwake(atTime(editAwake, new Date()), awakeSince);
      setEditAwake(null);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not change the time.');
    }
  };

  // Night wakings: she wakes during the night, then either goes back to sleep or is up for the day.
  const wakings = live?.wakings ?? [];
  const lastResume = wakings.length ? new Date(wakings.at(-1).to) : live?.asleep ? new Date(live.asleep) : null;
  const nightWaking = () => act(() => {
    const t = when();
    if (t <= lastResume) return setError('That’s before she was last asleep.');
    onChange({ ...live, wakingFrom: t.toISOString(), wakingFeed: false });
  });
  const backAsleep = () => act(() => {
    const t = when();
    if (t <= new Date(live.wakingFrom)) return setError('That’s before she woke up.');
    onChange({
      ...live,
      wakings: [...wakings, { from: live.wakingFrom, to: t.toISOString(), feed: Boolean(live.wakingFeed) }],
      wakingFrom: null,
      wakingFeed: false,
    });
  });
  const upForTheDay = () => {
    setError(null);
    const t = new Date(live.wakingFrom);
    setFinishing({ woke: hhmm(t), tapped: t, mood: '', notes: '' });
  };
  // Short feeds count as sleep (they are not taken off "slept so far").
  const awakeAtNight = (until) => wakings
    .filter((w) => !countsAsSleep(w.feed, Math.round((new Date(w.to) - new Date(w.from)) / 60000)))
    .reduce((sum, w) => sum + (new Date(w.to) - new Date(w.from)), 0)
    + (live?.wakingFrom ? until - new Date(live.wakingFrom) : 0);
  const since = (iso) => new Date(iso);
  const typeLabel = (t) => (t === 'night' ? 'Night' : 'Nap');

  return (
    <section className={`card live live-${state}`} aria-label="Track a sleep now">
      <div className="live-head">
        <h2>Now</h2>
        {state === 'idle' && (
          <div className="segmented small" role="group" aria-label="Sleep type">
            {['nap', 'night'].map((t) => (
              <button key={t} type="button" className={idleType === t ? 'active' : ''} onClick={() => setType(t)}>
                {typeLabel(t)}
              </button>
            ))}
          </div>
        )}
        {state !== 'idle' && <span className={`pill ${live.type}`}>{typeLabel(live.type)}</span>}
      </div>

      {state === 'idle' && (
        <>
          {awakeSince ? (
            <div className="live-timer awake">
              <span className="timer">{formatTimer(now - awakeSince)}</span>
              {editAwake == null ? (
                <span className="timer-label">
                  awake since {hhmm(awakeSince)}
                  {' · '}
                  <button type="button" className="link-button" onClick={() => { setError(null); setEditAwake(hhmm(awakeSince)); }}>edit</button>
                  {' · '}
                  <button type="button" className="link-button" onClick={startAwake}>reset</button>
                </span>
              ) : (
                <span className="awake-edit">
                  <label>
                    <span>Awake since</span>
                    <input type="time" value={editAwake} onChange={(e) => setEditAwake(e.target.value)} />
                  </label>
                  <button type="button" className="button primary" onClick={saveAwake} disabled={busy || !editAwake}>Save</button>
                  <button type="button" className="button ghost" onClick={() => { setEditAwake(null); setError(null); }}>Cancel</button>
                </span>
              )}
            </div>
          ) : (
            <div className="live-start-awake">
              <p className="live-status">No wake-up time known yet.</p>
              <button type="button" className="button" onClick={startAwake} disabled={busy}>Start awake timer</button>
            </div>
          )}
          {wakeWindowLine}
          {idleType === 'nap' && napForecast}
          {bedtimeLine}
          <div className="live-actions">
            <button type="button" className="button big" onClick={startSettling} disabled={busy}>Start settling</button>
            <button type="button" className="button big primary" onClick={fellAsleep} disabled={busy}>Fell asleep</button>
          </div>
        </>
      )}

      {state === 'settling' && (
        <>
          <div className="live-timer settling">
            <span className="timer">{formatTimer(now - since(live.settle))}</span>
            <span className="timer-label">
              settling since {hhmm(since(live.settle))}
              {awakeSince && <> · awake {formatTimer(now - awakeSince)} in total</>}
            </span>
          </div>
          {live.type === 'nap' ? napForecast : bedtimeLine}
          <Chips label="How she's falling asleep" options={METHODS} value={live.method} onChange={(m) => onChange({ ...live, method: m })} />
          <div className="live-actions">
            <button type="button" className="button big primary" onClick={fellAsleep} disabled={busy}>Fell asleep</button>
            <button type="button" className="button ghost" onClick={cancel}>Cancel</button>
          </div>
        </>
      )}

      {state === 'asleep' && !finishing && (
        <>
          <div className="live-timer asleep">
            <span className="timer">{formatTimer(now - lastResume)}</span>
            <span className="timer-label">
              {wakings.length ? `back asleep since ${hhmm(lastResume)}` : `asleep since ${hhmm(since(live.asleep))}`}
              {!wakings.length && live.settle && ` · took ${formatDuration((since(live.asleep) - since(live.settle)) / 60000)} to settle`}
              {wakings.length > 0 && ` · ${formatDuration((now - since(live.asleep) - awakeAtNight(now)) / 60000)} asleep tonight, woke ${wakings.length}×`}
              {wakings.some((w) => w.feed) && ` (${wakings.filter((w) => w.feed).length} feed${wakings.filter((w) => w.feed).length === 1 ? '' : 's'})`}
            </span>
          </div>
          {live.type === 'nap' && nap.avgMinutes != null && (() => {
            const elapsed = (now - since(live.asleep)) / 60000;
            const share = Math.min(1, elapsed / nap.avgMinutes);
            const expected = new Date(since(live.asleep).getTime() + nap.avgMinutes * 60000);
            return (
              <div className="nap-progress">
                <p className="nap-forecast">
                  💤 {ordinal(nap.position)} nap usually lasts <strong>~{formatDuration(nap.avgMinutes)}</strong>
                  {elapsed < nap.avgMinutes
                    ? <> · she may wake around <strong>{hhmm(expected)}</strong></>
                    : <> · already {formatDuration(elapsed - nap.avgMinutes)} longer than usual 🎉</>}
                </p>
                <div className="nap-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
                  <div style={{ width: `${share * 100}%` }} />
                </div>
              </div>
            );
          })()}
          {wakeUpLine}
          {dayAwakeLine}
          <Chips label="How she fell asleep" options={METHODS} value={live.method} onChange={(m) => onChange({ ...live, method: m })} />
          <div className="live-actions">
            <button type="button" className="button big primary" onClick={() => { setError(null); const t = when(); setAt(''); setFinishing({ woke: hhmm(t), tapped: t, mood: '', notes: '' }); }}>
              {live.type === 'night' ? 'Up for the day' : 'Woke up'}
            </button>
            {live.type === 'night' && (
              <button type="button" className="button big" onClick={nightWaking} disabled={busy}>Night waking</button>
            )}
            <button type="button" className="button ghost" onClick={cancel}>Cancel</button>
          </div>
        </>
      )}

      {state === 'nightawake' && !finishing && (
        <>
          <div className="live-timer awake">
            <span className="timer">{formatTimer(now - since(live.wakingFrom))}</span>
            <span className="timer-label">
              awake during the night since {hhmm(since(live.wakingFrom))}
              {' · '}slept {formatDuration((since(live.wakingFrom) - since(live.asleep) - awakeAtNight(since(live.wakingFrom))) / 60000)} so far
            </span>
          </div>
          {wakeUpLine}
          {dayAwakeLine}
          <button
            type="button"
            className={`chip feed-toggle ${live.wakingFeed ? 'active' : ''}`}
            aria-pressed={Boolean(live.wakingFeed)}
            onClick={() => onChange({ ...live, wakingFeed: !live.wakingFeed })}
          >
            🍼 {live.wakingFeed ? 'Feed ✓' : 'Mark as a feed'}
          </button>
          <div className="live-actions">
            <button type="button" className="button big primary" onClick={backAsleep} disabled={busy}>Back asleep</button>
            <button type="button" className="button big" onClick={upForTheDay} disabled={busy}>Up for the day</button>
          </div>
        </>
      )}

      {sleeping && finishing && (
        <div className="live-finish">
          <label>
            <span>Woke up at</span>
            <input type="time" value={finishing.woke} onChange={(e) => setFinishing({ ...finishing, woke: e.target.value })} />
          </label>
          <p className="muted">
            Slept {formatDuration(Math.max(0, (() => {
              const woke = atTime(finishing.woke || hhmm(now), new Date());
              const awake = wakings.filter((w) => new Date(w.to) <= woke).reduce((sum, w) => sum + (new Date(w.to) - new Date(w.from)), 0);
              return (woke - since(live.asleep) - awake) / 60000;
            })()))}
            {wakings.length > 0 && ` with ${wakings.length} night waking${wakings.length === 1 ? '' : 's'}`}
            {' '}({hhmm(since(live.asleep))}–{finishing.woke})
          </p>
          {live.type === 'nap' && (
            <div className="live-yesno">
              <span>Was the nap extended?</span>
              <Chips
                label="Was the nap extended?"
                options={['Yes', 'No']}
                value={finishing.extended === 'yes' ? 'Yes' : finishing.extended === 'no' ? 'No' : ''}
                onChange={(v) => setFinishing({ ...finishing, extended: v === 'Yes' ? 'yes' : v === 'No' ? 'no' : '' })}
              />
            </div>
          )}
          <div className="live-yesno">
            <span>Mood after waking</span>
            <Chips label="Mood after" options={MOODS} value={finishing.mood} onChange={(m) => setFinishing({ ...finishing, mood: m })} />
          </div>
          <input
            type="text"
            className="live-notes"
            placeholder="Notes (optional)"
            value={finishing.notes}
            onChange={(e) => setFinishing({ ...finishing, notes: e.target.value })}
          />
          <div className="live-actions">
            <button type="button" className="button big primary" onClick={save} disabled={busy}>Save</button>
            <button type="button" className="button ghost" onClick={() => setFinishing(null)}>Back</button>
          </div>
        </div>
      )}


      {state !== 'idle' && !finishing && editTimes && (
        <div className="live-edit">
          <div className="segmented small" role="group" aria-label="Sleep type">
            {['nap', 'night'].map((t) => (
              <button key={t} type="button" className={editTimes.type === t ? 'active' : ''} onClick={() => setEditTimes({ ...editTimes, type: t })}>
                {typeLabel(t)}
              </button>
            ))}
          </div>
          <label>
            <span>Started settling</span>
            <input type="time" value={editTimes.settle} onChange={(e) => setEditTimes({ ...editTimes, settle: e.target.value })} />
          </label>
          {sleeping && (
            <label>
              <span>Fell asleep</span>
              <input type="time" value={editTimes.asleep} onChange={(e) => setEditTimes({ ...editTimes, asleep: e.target.value })} />
            </label>
          )}
          {sleeping && editTimes.type === 'night' && (
            <fieldset className="wakings live-wakings">
              <legend>Night wakings</legend>
              {editTimes.wakings.map((w, i) => (
                <div className="waking-row" key={i}>
                  <label><span>Woke at</span><input type="time" value={w.from} onChange={(e) => setEditWaking(i, { from: e.target.value })} /></label>
                  <label><span>Back asleep at</span><input type="time" value={w.to} onChange={(e) => setEditWaking(i, { to: e.target.value })} /></label>
                  <button
                    type="button"
                    className={`chip ${w.feed ? 'active' : ''}`}
                    aria-pressed={w.feed}
                    onClick={() => setEditWaking(i, { feed: !w.feed })}
                  >
                    {w.feed ? 'Feed ✓' : '🍼 Feed'}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove night waking"
                    onClick={() => setEditTimes((x) => ({ ...x, wakings: x.wakings.filter((_, j) => j !== i) }))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {state === 'nightawake' && (
                <label>
                  <span>Awake now — woke at</span>
                  <input type="time" value={editTimes.wakingFrom} onChange={(e) => setEditTimes({ ...editTimes, wakingFrom: e.target.value })} />
                </label>
              )}
              <button
                type="button"
                className="button ghost add-waking"
                onClick={() => setEditTimes((x) => ({ ...x, wakings: [...x.wakings, { from: '', to: '', feed: false }] }))}
              >
                + Add night waking
              </button>
            </fieldset>
          )}
          <div className="live-actions">
            <button type="button" className="button primary" onClick={saveEditTimes}>Save times</button>
            <button type="button" className="button ghost" onClick={() => { setEditTimes(null); setError(null); }}>Back</button>
          </div>
        </div>
      )}
      {state !== 'idle' && !finishing && !editTimes && (
        <button type="button" className="link-button" onClick={openEditTimes}>
          {live.type === 'night' && sleeping ? 'Edit times, type or night wakings' : 'Edit times or type'}
        </button>
      )}
      {!finishing && !editTimes && (
        <label className="live-at">
          <span>Tapped late? Use this time instead:</span>
          <input type="time" value={at} onChange={(e) => setAt(e.target.value)} />
          {at && <button type="button" className="icon-button" aria-label="Clear time" onClick={() => setAt('')}>×</button>}
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
