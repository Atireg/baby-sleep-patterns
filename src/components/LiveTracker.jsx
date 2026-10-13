import { useEffect, useState } from 'react';
import { METHODS, MOODS } from '../lib/insights.js';
import { atTime, formatTimer, hhmm, liveToEntry, typeAt } from '../lib/live.js';
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
 * live: { type, settle, asleep, method } or null; onChange persists it; onSave(entry) stores the finished sleep.
 */
export default function LiveTracker({ live, onChange, onSave, awakeSince, busy }) {
  const state = !live ? 'idle' : live.asleep ? 'asleep' : 'settling';
  const now = useTicker(true);
  const [at, setAt] = useState(''); // optional "tapped late" time
  const [finishing, setFinishing] = useState(null); // { woke, mood, notes }
  const [error, setError] = useState(null);
  const [type, setType] = useState(null); // manual override while idle

  useEffect(() => { if (!live) setFinishing(null); }, [live]);

  const when = () => (at ? atTime(at, new Date()) : new Date());
  const idleType = type ?? typeAt(now);
  const act = (fn) => { setError(null); fn(); setAt(''); };

  const startSettling = () => act(() => {
    const t = when();
    onChange({ type: idleType, settle: t.toISOString(), asleep: null, method: '' });
  });
  const fellAsleep = () => act(() => {
    const t = when();
    if (live?.settle && t < new Date(live.settle)) return setError('That’s before settling started.');
    onChange({ type: live?.type ?? idleType, settle: live?.settle ?? null, asleep: t.toISOString(), method: live?.method ?? '' });
    setType(null);
  });
  const cancel = () => {
    if (window.confirm('Discard this sleep without saving?')) { onChange(null); setError(null); setType(null); }
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
          <p className="live-status">
            {awakeSince ? <>Awake for <strong>{formatDuration((now - awakeSince) / 60000)}</strong> · since {hhmm(awakeSince)}</> : 'Ready when she is.'}
          </p>
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
            <span className="timer-label">settling since {hhmm(since(live.settle))}</span>
          </div>
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
            <span className="timer">{formatTimer(now - since(live.asleep))}</span>
            <span className="timer-label">
              asleep since {hhmm(since(live.asleep))}
              {live.settle && ` · took ${formatDuration((since(live.asleep) - since(live.settle)) / 60000)} to settle`}
            </span>
          </div>
          <Chips label="How she fell asleep" options={METHODS} value={live.method} onChange={(m) => onChange({ ...live, method: m })} />
          <div className="live-actions">
            <button type="button" className="button big primary" onClick={() => { setError(null); const t = new Date(); setFinishing({ woke: hhmm(t), tapped: t, mood: '', notes: '' }); }}>
              Woke up
            </button>
            <button type="button" className="button ghost" onClick={cancel}>Cancel</button>
          </div>
        </>
      )}

      {state === 'asleep' && finishing && (
        <div className="live-finish">
          <label>
            <span>Woke up at</span>
            <input type="time" value={finishing.woke} onChange={(e) => setFinishing({ ...finishing, woke: e.target.value })} />
          </label>
          <p className="muted">
            Slept {formatDuration(Math.max(0, (atTime(finishing.woke || hhmm(now), new Date()) - since(live.asleep)) / 60000))}
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

      {!finishing && (
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
