/**
 * Editable night wakings ("Woke at" / "Back asleep at" / 🍼 feed / remove) plus "+ Add night waking".
 * wakings: [{ from, to, feed }] with "HH:MM" times; onChange gets the new list.
 * children render between the rows and the add button (e.g. the waking in progress).
 */
export default function WakingRows({ wakings, onChange, children }) {
  const update = (i, patch) => onChange(wakings.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <>
      {wakings.map((w, i) => (
        <div className="waking-row" key={i}>
          <label><span>Woke at</span><input type="time" value={w.from} onChange={(e) => update(i, { from: e.target.value })} /></label>
          <label><span>Back asleep at</span><input type="time" value={w.to} onChange={(e) => update(i, { to: e.target.value })} /></label>
          <button type="button" className={`chip ${w.feed ? 'active' : ''}`} aria-pressed={Boolean(w.feed)} onClick={() => update(i, { feed: !w.feed })}>
            {w.feed ? 'Feed ✓' : '🍼 Feed'}
          </button>
          <button type="button" className="icon-button" aria-label="Remove night waking" onClick={() => onChange(wakings.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {children}
      <button type="button" className="button ghost add-waking" onClick={() => onChange([...wakings, { from: '', to: '', feed: false }])}>
        + Add night waking
      </button>
    </>
  );
}
