import { useState } from 'react';
import { formatDay } from '../lib/format.js';
import { REST_KINDS, activeRest, endRest, removeRest, restKind, startRest, updateRest } from '../lib/rest.js';
import { MS_DAY, dateKey, keyToDate } from '../lib/time.js';

const dayText = (day) => formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' });
/** Days from `from` to `to`, both included. */
const daysBetween = (from, to) => Math.round((keyToDate(to) - keyToDate(from)) / MS_DAY) + 1;

/**
 * Rest mode: when she is sick, just vaccinated, travelling or anything else that disrupts sleep.
 * While it is on, sleeps are still logged and shown, but those days are left out of averages and forecasts.
 */
export default function RestMode({ periods, onChange }) {
  const today = dateKey(new Date());
  const active = activeRest(periods);
  const past = periods.filter((p) => p.to).sort((a, b) => b.from.localeCompare(a.from));
  const [showPast, setShowPast] = useState(false);

  if (!active) {
    return (
      <section className="rest-mode" aria-label="Rest mode">
        <p><strong>Sleep disrupted?</strong> Turn on rest mode — sleeps are still logged but left out of averages.</p>
        <div className="chips">
          {REST_KINDS.map((k) => (
            <button key={k.key} type="button" className="chip" onClick={() => onChange(startRest(periods, k.key, today))}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
        {past.length > 0 && <PastPeriods past={past} open={showPast} onToggle={setShowPast} onRemove={(id) => onChange(removeRest(periods, id))} />}
      </section>
    );
  }

  const kind = restKind(active.kind);
  const n = daysBetween(active.from, today);
  return (
    <section className="rest-mode on" aria-label="Rest mode">
      <p className="rest-title">
        {kind.emoji} <strong>Rest mode: {kind.label}</strong> since {dayText(active.from)}{n > 1 && ` (${n} days)`}
      </p>
      <p className="muted">Sleeps are still logged and shown, but these days don’t count towards averages, usual times or forecasts.</p>
      <div className="chips">
        {REST_KINDS.map((k) => (
          <button key={k.key} type="button" className={`chip ${k.key === active.kind ? 'active' : ''}`}
            aria-pressed={k.key === active.kind} onClick={() => onChange(updateRest(periods, active.id, { kind: k.key }))}>
            {k.emoji} {k.label}
          </button>
        ))}
      </div>
      <div className="rest-fields">
        <label>
          <span>Since</span>
          <input type="date" value={active.from} max={today}
            onChange={(e) => e.target.value && onChange(updateRest(periods, active.id, { from: e.target.value }))} />
        </label>
        <label className="rest-note">
          <span>Note</span>
          <input type="text" value={active.note ?? ''} placeholder="e.g. fever, 2nd vaccination, flight to Buenos Aires"
            onChange={(e) => onChange(updateRest(periods, active.id, { note: e.target.value }))} />
        </label>
      </div>
      <div className="rest-actions">
        <button type="button" className="button primary" onClick={() => onChange(endRest(periods, active.id, today))}>End rest mode</button>
        <button type="button" className="button ghost" onClick={() => onChange(removeRest(periods, active.id))}>Turned on by mistake</button>
      </div>
      {past.length > 0 && <PastPeriods past={past} open={showPast} onToggle={setShowPast} onRemove={(id) => onChange(removeRest(periods, id))} />}
    </section>
  );
}

function PastPeriods({ past, open, onToggle, onRemove }) {
  return (
    <details className="rest-past" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>Past rest periods ({past.length})</summary>
      <ul>
        {past.map((p) => (
          <li key={p.id}>
            <span>{restKind(p.kind).emoji} {restKind(p.kind).label}</span>
            <span>{dayText(p.from)}{p.to !== p.from && ` – ${dayText(p.to)}`}</span>
            {p.note && <span className="muted">{p.note}</span>}
            <button type="button" className="icon-button" aria-label="Delete this rest period" onClick={() => onRemove(p.id)}>×</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
