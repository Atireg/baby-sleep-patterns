// Small toggle controls shared by the Now card and the entry form.

/** A row of toggle chips; tapping the active chip clears it (onChange('')). */
export function Chips({ options, value, onChange, label }) {
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

const YES_NO = { yes: 'Yes', no: 'No' };

/** Yes / No chips; value and onChange use 'yes' / 'no' / ''. */
export function YesNoChips({ value, onChange, label }) {
  const toKey = (text) => Object.keys(YES_NO).find((k) => YES_NO[k] === text) ?? '';
  return <Chips label={label} options={Object.values(YES_NO)} value={YES_NO[value] ?? ''} onChange={(v) => onChange(toKey(v))} />;
}

export const typeLabel = (t) => (t === 'night' ? 'Night' : 'Nap');

/** Nap / Night segmented switch. */
export function TypeSwitch({ value, onChange }) {
  return (
    <div className="segmented small" role="group" aria-label="Sleep type">
      {['nap', 'night'].map((t) => (
        <button key={t} type="button" className={value === t ? 'active' : ''} onClick={() => onChange(t)}>
          {typeLabel(t)}
        </button>
      ))}
    </div>
  );
}

/** Thin progress bar; share is 0–1. */
export function ProgressBar({ share, className = '', label }) {
  const pct = Math.min(1, Math.max(0, share)) * 100;
  return (
    <div className={`nap-progress-bar ${className}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
