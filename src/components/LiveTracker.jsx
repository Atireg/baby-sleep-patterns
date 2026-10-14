import { useEffect, useMemo, useState } from 'react';
import { METHODS, MOODS, expectedBedtime, upcomingNap } from '../lib/insights.js';
import { atTime, awakeSince as findAwakeSince, formatTimer, hhmm, liveToEntry, typeAt } from '../lib/live.js';
import { formatDuration } from '../lib/sleepData.js';

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
export default function LiveTracker({ live, onChange, onSave, sessions, busy }) {
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
  const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
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
  const [editTimes, setEditTimes] = useState(null); // { type, settle, asleep } as "HH:MM" while correcting

  useEffect(() => { if (state === 'idle') { setFinishing(null); setEditTimes(null); } }, [state]);

  const openEditTimes = () => {
    setError(null);
    setEditTimes({
      type: live.type,
      settle: live.settle ? hhmm(new Date(live.settle)) : '',
      asleep: live.asleep ? hhmm(new Date(live.asleep)) : '',
    });
  };
  const saveEditTimes = () => {
    const nowDate = new Date();
    const asleep = editTimes.asleep ? atTime(editTimes.asleep, nowDate) : null;
    // Settling happens before falling asleep, so read it relative to that moment.
    const settle = editTimes.settle ? atTime(editTimes.settle, asleep ?? nowDate) : null;
    if (live.asleep && !asleep) return setError('Enter when she fell asleep.');
    if (!live.asleep && !settle) return setError('Enter when settling started.');
    if (asleep && nowDate - asleep > 16 * 3600000) return setError('That would mean she has been asleep for over 16 hours — check the time.');
    onChange({ ...live, type: editTimes.type, settle: settle ? settle.toISOString() : null, asleep: asleep ? asleep.toISOString() : null });
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
  const awakeAtNight = (until) => wakings.reduce((sum, w) => sum + (new Date(w.to) - new Date(w.from)), 0)
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
              <span className="timer-label">
                awake since {hhmm(awakeSince)}
                {' · '}
                <button type="button" className="link-button" onClick={startAwake}>reset</button>
              </span>
            </div>
          ) : (
            <div className="live-start-awake">
              <p className="live-status">No wake-up time known yet.</p>
              <button type="button" className="button" onClick={startAwake} disabled={busy}>Start awake timer</button>
            </div>
          )}
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
          <Chips label="Mood after" options={MOODS} value={finishing.mood} onChange={(m) => setFinishing({ ...finishing, mood: m })} />
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
          {state === 'asleep' && (
            <label>
              <span>Fell asleep</span>
              <input type="time" value={editTimes.asleep} onChange={(e) => setEditTimes({ ...editTimes, asleep: e.target.value })} />
            </label>
          )}
          <div className="live-actions">
            <button type="button" className="button primary" onClick={saveEditTimes}>Save times</button>
            <button type="button" className="button ghost" onClick={() => { setEditTimes(null); setError(null); }}>Back</button>
          </div>
        </div>
      )}
      {state !== 'idle' && !finishing && !editTimes && (
        <button type="button" className="link-button" onClick={openEditTimes}>Edit times or type</button>
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
