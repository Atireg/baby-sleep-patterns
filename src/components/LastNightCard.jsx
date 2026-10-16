import { useEffect, useState } from 'react';
import { formatDay, formatDuration, hhmm } from '../lib/format.js';
import { dateKey } from '../lib/time.js';
import WakingRows from './WakingRows.jsx';

/**
 * Last night at a glance: hours asleep, time awake during the night, wakings and feeds,
 * a bedtime → morning bar with the awake stretches marked, and notes about the night.
 * night: lastNight() result or null; entry: the saved night entry (for notes and edits) or null.
 * onSaveWakings(wakings) saves edited night wakings ([{ from, to, feed }], "HH:MM") for the whole night;
 * parts = how many entries the night is saved as (they are joined into one on save).
 */
export default function LastNightCard({ night, entry, parts = 1, onSaveNotes, onSaveWakings }) {
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [status, setStatus] = useState(null); // 'saving' | 'saved' | error text
  useEffect(() => { setNotes(entry?.notes ?? ''); setStatus(null); }, [entry?.id, entry?.notes]);
  const [wakingEdit, setWakingEdit] = useState(null); // { wakings, error, saving } while editing
  useEffect(() => setWakingEdit(null), [entry?.id]);

  if (!night) {
    return (
      <section className="card night-card" aria-label="Last night">
        <h2>🌙 Last night</h2>
        <p className="muted">No night logged for last night yet. Use “Fell asleep” in the Now card at bedtime, or add it in the form below.</p>
      </section>
    );
  }

  const span = night.wake - night.bedtime;
  const pct = (t) => `${((t - night.bedtime) / span) * 100}%`;
  const width = (a, b) => `${((b - a) / span) * 100}%`;
  // Every waking shown on the card (gaps between the night's stretches), however the night was saved.
  const startWakingEdit = () => setWakingEdit({
    wakings: night.wakings.map((w) => ({ from: hhmm(w.from), to: hhmm(w.to), feed: Boolean(w.feed) })), error: null, saving: false,
  });
  const saveWakings = async () => {
    setWakingEdit((x) => ({ ...x, saving: true, error: null }));
    try {
      await onSaveWakings(wakingEdit.wakings);
      setWakingEdit(null);
    } catch (e) {
      setWakingEdit((x) => ({ ...x, saving: false, error: e.message || 'Could not save the night wakings.' }));
    }
  };
  const saveNotes = async () => {
    setStatus('saving');
    try {
      await onSaveNotes(notes.trim());
      setStatus('saved');
    } catch (e) {
      setStatus(e.message || 'Could not save the notes.');
    }
  };

  return (
    <section className="card night-card" aria-label="Last night">
      <div>
        <h2>🌙 Last night</h2>
        <p className="subtitle">
          {formatDay(night.day)} → {formatDay(dateKey(night.wake))}
          {' · '}bedtime {hhmm(night.bedtime)}, up at {hhmm(night.wake)}
        </p>
      </div>

      <div className="night-stats">
        <div className="night-stat">
          <span className="label">Asleep</span>
          <strong>{formatDuration(night.sleptMinutes)}</strong>
        </div>
        <div className={`night-stat awake ${night.awakeMinutes ? 'has-awake' : ''}`}>
          <span className="label">Awake during the night</span>
          <strong>{night.awakeMinutes ? formatDuration(night.awakeMinutes) : 'None 🎉'}</strong>
        </div>
        <div className="night-stat">
          <span className="label">Wakings</span>
          <strong>{night.wakings.length}</strong>
        </div>
        <div className="night-stat">
          <span className="label">Feeds 🍼</span>
          <strong>{night.feeds}</strong>
        </div>
      </div>

      {/* Bedtime → morning: blue = asleep, amber = awake (🍼 = feed). */}
      <div className="night-bar-wrap" role="img"
        aria-label={`Night from ${hhmm(night.bedtime)} to ${hhmm(night.wake)}, awake ${night.wakings.length} times`}>
        <div className="night-bar">
          {night.wakings.map((w) => (
            <div key={w.from.getTime()} className="night-awake" style={{ left: pct(w.from), width: width(w.from, w.to) }}
              title={`Awake ${hhmm(w.from)}–${hhmm(w.to)} (${formatDuration(w.minutes)})${w.feed ? ' · feed' : ''}`}>
              {w.feed && <span className="night-feed">🍼</span>}
            </div>
          ))}
        </div>
        <div className="night-bar-labels">
          <span>{hhmm(night.bedtime)}</span>
          {/* Skip labels that would collide with the bedtime / wake-up labels at the ends. */}
          {night.wakings.filter((w) => {
            const f = (w.from - night.bedtime) / span;
            return f > 0.15 && f < 0.8;
          }).map((w) => (
            <span key={w.from.getTime()} className="night-awake-label" style={{ left: pct(w.from) }}>
              {hhmm(w.from)}
            </span>
          ))}
          <span>{hhmm(night.wake)}</span>
        </div>
        <ul className="legend">
          <li><span className="swatch" style={{ background: 'var(--series-1)' }} />Asleep</li>
          <li><span className="swatch" style={{ background: 'var(--series-4)' }} />Awake</li>
        </ul>
      </div>

      {wakingEdit ? (
        <fieldset className="wakings night-wakings-edit">
          <legend>Night wakings <em>({hhmm(night.bedtime)} → {hhmm(night.wake)})</em></legend>
          {parts > 1 && <p className="muted">Last night was saved as {parts} separate sleeps — saving joins them into one night.</p>}
          <WakingRows wakings={wakingEdit.wakings} onChange={(wakings) => setWakingEdit((x) => ({ ...x, wakings, error: null }))} />
          <div className="form-actions">
            <button type="button" className="button primary" onClick={saveWakings} disabled={wakingEdit.saving}>
              {wakingEdit.saving ? 'Saving…' : 'Save wakings'}
            </button>
            <button type="button" className="button ghost" onClick={() => setWakingEdit(null)}>Cancel</button>
            {wakingEdit.error && <span className="error" role="alert">{wakingEdit.error}</span>}
          </div>
        </fieldset>
      ) : night.wakings.length > 0 ? (
        <ul className="night-waking-list">
          {night.wakings.map((w, i) => (
            <li key={w.from.getTime()}>
              <span className="waking-no">{i + 1}</span>
              <span className="waking-time">{hhmm(w.from)}–{hhmm(w.to)}</span>
              <span className="waking-dur">{formatDuration(w.minutes)} awake</span>
              {w.feed && <span className="feed-badge">🍼 feed{w.countedAsSleep && ' · counted as sleep'}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Slept through — no night wakings logged.</p>
      )}
      {entry && onSaveWakings && !wakingEdit && (
        <button type="button" className="link-button" onClick={startWakingEdit}>
          ✎ {night.wakings.length ? 'Edit night wakings' : 'Add a night waking'}
        </button>
      )}

      <div className="night-notes">
        <label htmlFor="night-notes">Notes about last night</label>
        <textarea
          id="night-notes"
          rows={2}
          value={notes}
          disabled={!entry}
          placeholder={entry ? 'e.g. teething, extra feed, room too warm…' : 'Notes can be added once the night is saved as an entry.'}
          onChange={(e) => { setNotes(e.target.value); setStatus(null); }}
        />
        {entry && (
          <div className="form-actions">
            <button type="button" className="button" onClick={saveNotes} disabled={status === 'saving' || notes.trim() === (entry.notes ?? '')}>
              {status === 'saving' ? 'Saving…' : 'Save notes'}
            </button>
            {status === 'saved' && <span className="muted">Saved ✓</span>}
            {status && status !== 'saving' && status !== 'saved' && <span className="error">{status}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
