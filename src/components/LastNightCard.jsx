import { useEffect, useState } from 'react';
import { formatClock, formatDay, formatDuration } from '../lib/sleepData.js';

/**
 * Last night at a glance: hours asleep, time awake during the night, wakings and feeds,
 * a bedtime → morning bar with the awake stretches marked, and notes about the night.
 * night: lastNight() result or null; entry: the saved night entry (for notes) or null.
 */
export default function LastNightCard({ night, entry, onSaveNotes }) {
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [status, setStatus] = useState(null); // 'saving' | 'saved' | error text
  useEffect(() => { setNotes(entry?.notes ?? ''); setStatus(null); }, [entry?.id, entry?.notes]);

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
          {formatDay(night.day)} → {formatDay(dayOf(night.wake))}
          {' · '}bedtime {formatClock(night.bedtime)}, up at {formatClock(night.wake)}
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
        aria-label={`Night from ${formatClock(night.bedtime)} to ${formatClock(night.wake)}, awake ${night.wakings.length} times`}>
        <div className="night-bar">
          {night.wakings.map((w) => (
            <div key={w.from.getTime()} className="night-awake" style={{ left: pct(w.from), width: width(w.from, w.to) }}
              title={`Awake ${formatClock(w.from)}–${formatClock(w.to)} (${formatDuration(w.minutes)})${w.feed ? ' · feed' : ''}`}>
              {w.feed && <span className="night-feed">🍼</span>}
            </div>
          ))}
        </div>
        <div className="night-bar-labels">
          <span>{formatClock(night.bedtime)}</span>
          {/* Skip labels that would collide with the bedtime / wake-up labels at the ends. */}
          {night.wakings.filter((w) => {
            const f = (w.from - night.bedtime) / span;
            return f > 0.15 && f < 0.8;
          }).map((w) => (
            <span key={w.from.getTime()} className="night-awake-label" style={{ left: pct(w.from) }}>
              {formatClock(w.from)}
            </span>
          ))}
          <span>{formatClock(night.wake)}</span>
        </div>
        <ul className="legend">
          <li><span className="swatch" style={{ background: 'var(--series-1)' }} />Asleep</li>
          <li><span className="swatch" style={{ background: 'var(--series-4)' }} />Awake</li>
        </ul>
      </div>

      {night.wakings.length > 0 ? (
        <ul className="night-waking-list">
          {night.wakings.map((w, i) => (
            <li key={w.from.getTime()}>
              <span className="waking-no">{i + 1}</span>
              <span className="waking-time">{formatClock(w.from)}–{formatClock(w.to)}</span>
              <span className="waking-dur">{formatDuration(w.minutes)} awake</span>
              {w.feed && <span className="feed-badge">🍼 feed{w.countedAsSleep && ' · counted as sleep'}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Slept through — no night wakings logged.</p>
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

function dayOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
