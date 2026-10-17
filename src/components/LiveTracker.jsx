import { useEffect, useState } from 'react';
import { METHODS, MOODS } from '../lib/insights.js';
import { atTime, awakeSince as findAwakeSince, liveToEntry, nightAwakeMs, typeAt } from '../lib/live.js';
import { formatDuration, formatTimer, hhmm } from '../lib/format.js';
import { MS_MIN } from '../lib/time.js';
import { useNow } from '../hooks/useNow.js';
import { Chips, TypeSwitch, YesNoChips, typeLabel } from './Chips.jsx';
import LiveEditPanel from './LiveEditPanel.jsx';
import {
  DayAwakeLine, NapForecast, NapProgress, WakeUpLine, WakeWindowLine, WindowBeforeLine, useUpcomingNap,
} from './NowForecasts.jsx';

/**
 * "Now" card for logging on the go: Start settling → Fell asleep → Woke up.
 * live: { type, settle, asleep, method, wakings: [{ from, to, feed }], wakingFrom, wakingFeed, awakeFrom } or null (ISO times);
 * onChange persists it; onSave(entry) stores the finished sleep; onEditAwake(time, since) corrects "awake since".
 */
export default function LiveTracker({ live, onChange, onSave, onEditAwake, sessions, busy, awakeAvg = null, avgTotal = null, wakeTargets = {} }) {
  // live may hold only { awakeFrom } (a manually started awake timer) — that still counts as idle.
  const state = live?.asleep ? (live.wakingFrom ? 'nightawake' : 'asleep') : live?.settle ? 'settling' : 'idle';
  const sleeping = state === 'asleep' || state === 'nightawake';
  const now = useNow(1000);
  const awakeSince = findAwakeSince(sessions, live, now);
  const nap = useUpcomingNap(sessions, now);

  const [at, setAt] = useState(''); // optional "tapped late" time
  const [finishing, setFinishing] = useState(null); // { woke, mood, notes }
  const [error, setError] = useState(null);
  const [type, setType] = useState(null); // manual override while idle
  const [editing, setEditing] = useState(false); // "Edit times or type" panel open

  useEffect(() => { if (state === 'idle') { setFinishing(null); setEditing(false); } }, [state]);

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
    onChange({ type: live?.type ?? idleType, settle: live?.settle ?? null, asleep: t.toISOString(), method: live?.method ?? '', awakeFrom: live?.awakeFrom ?? null });
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
  // Time asleep tonight up to `until` (short feeds count as sleep).
  const sleptMinutes = (until) => (until - since(live.asleep) - nightAwakeMs(live, until)) / MS_MIN;
  const since = (iso) => new Date(iso);

  return (
    <section className={`card live live-${state}`} aria-label="Track a sleep now">
      <div className="live-head">
        <h2>Now</h2>
        {state === 'idle' && (
          <TypeSwitch value={idleType} onChange={setType} />
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
          <WakeWindowLine sessions={sessions} now={now} awakeSince={awakeSince} targets={wakeTargets} />
          {idleType === 'nap' && <NapForecast nap={nap} />}
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
          {live.type === 'nap' && <NapForecast nap={nap} />}
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
              {!wakings.length && live.settle && ` · took ${formatDuration((since(live.asleep) - since(live.settle)) / MS_MIN)} to settle`}
              {wakings.length > 0 && ` · ${formatDuration(sleptMinutes(now))} asleep tonight, woke ${wakings.length}×`}
              {wakings.some((w) => w.feed) && ` (${wakings.filter((w) => w.feed).length} feed${wakings.filter((w) => w.feed).length === 1 ? '' : 's'})`}
            </span>
          </div>
          <WindowBeforeLine sessions={sessions} live={live} targets={wakeTargets} />
          {live.type === 'nap' && <NapProgress nap={nap} now={now} asleep={since(live.asleep)} />}
          {live.type === 'night' && (
            <>
              <WakeUpLine sessions={sessions} now={now} live={live} avgTotal={avgTotal} />
              <DayAwakeLine sessions={sessions} asleep={since(live.asleep)} awakeAvg={awakeAvg} />
            </>
          )}
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
              {' · '}slept {formatDuration(sleptMinutes(since(live.wakingFrom)))} so far
            </span>
          </div>
          {live.type === 'night' && (
            <>
              <WakeUpLine sessions={sessions} now={now} live={live} avgTotal={avgTotal} />
              <DayAwakeLine sessions={sessions} asleep={since(live.asleep)} awakeAvg={awakeAvg} />
            </>
          )}
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
            Slept {formatDuration(Math.max(0, sleptMinutes(atTime(finishing.woke || hhmm(now), new Date()))))}
            {wakings.length > 0 && ` with ${wakings.length} night waking${wakings.length === 1 ? '' : 's'}`}
            {' '}({hhmm(since(live.asleep))}–{finishing.woke})
          </p>
          {live.type === 'nap' && (
            <div className="live-yesno">
              <span>Was the nap extended?</span>
              <YesNoChips label="Was the nap extended?" value={finishing.extended} onChange={(v) => setFinishing({ ...finishing, extended: v })} />
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

      {state !== 'idle' && !finishing && editing && (
        <LiveEditPanel live={live} state={state} onChange={onChange} onError={setError} onDone={() => { setEditing(false); setError(null); }} />
      )}
      {state !== 'idle' && !finishing && !editing && (
        <button type="button" className="link-button" onClick={() => { setError(null); setEditing(true); }}>
          {live.type === 'night' && sleeping ? 'Edit times, type or night wakings' : 'Edit times or type'}
        </button>
      )}
      {!finishing && !editing && (
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
