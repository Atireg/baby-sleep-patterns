import { useState } from 'react';
import { atTime, resolveWakings } from '../lib/live.js';
import { hhmm } from '../lib/format.js';
import { MS_HOUR } from '../lib/time.js';
import { TypeSwitch } from './Chips.jsx';
import WakingRows from './WakingRows.jsx';

const clockOf = (iso) => (iso ? hhmm(new Date(iso)) : '');

/**
 * "Edit times or type" in the Now card: corrects the type, settling / fell-asleep times and, for a
 * night, the night wakings (and the waking in progress). Errors go to onError; onDone closes it.
 */
export default function LiveEditPanel({ live, state, onChange, onDone, onError }) {
  const sleeping = state === 'asleep' || state === 'nightawake';
  const [edit, setEdit] = useState(() => ({
    type: live.type,
    settle: clockOf(live.settle),
    asleep: clockOf(live.asleep),
    wakings: (live.wakings ?? []).map((w) => ({ from: clockOf(w.from), to: clockOf(w.to), feed: Boolean(w.feed) })),
    wakingFrom: clockOf(live.wakingFrom),
  }));
  const set = (key) => (e) => setEdit((x) => ({ ...x, [key]: e.target.value }));

  const save = () => {
    const now = new Date();
    const asleep = edit.asleep ? atTime(edit.asleep, now) : null;
    // Settling happens before falling asleep, so read it relative to that moment.
    const settle = edit.settle ? atTime(edit.settle, asleep ?? now) : null;
    if (live.asleep && !asleep) return onError('Enter when she fell asleep.');
    if (!live.asleep && !settle) return onError('Enter when settling started.');
    if (asleep && now - asleep > 16 * MS_HOUR) return onError('That would mean she has been asleep for over 16 hours — check the time.');
    // Night wakings only exist for a night she is (or was) asleep in.
    const night = asleep && edit.type === 'night';
    if (night && state === 'nightawake' && !edit.wakingFrom) return onError('Enter when she woke up, or tap “Back asleep”.');
    const resolved = night ? resolveWakings(asleep, edit.wakings, edit.wakingFrom, now) : { wakings: [], wakingFrom: null };
    if (resolved.error) return onError(resolved.error);
    onChange({
      ...live,
      type: edit.type,
      settle: settle ? settle.toISOString() : null,
      asleep: asleep ? asleep.toISOString() : null,
      wakings: resolved.wakings,
      wakingFrom: resolved.wakingFrom,
      wakingFeed: resolved.wakingFrom ? live.wakingFeed ?? false : false,
    });
    onDone();
  };

  return (
    <div className="live-edit">
      <TypeSwitch value={edit.type} onChange={(type) => setEdit((x) => ({ ...x, type }))} />
      <label>
        <span>Started settling</span>
        <input type="time" value={edit.settle} onChange={set('settle')} />
      </label>
      {sleeping && (
        <label>
          <span>Fell asleep</span>
          <input type="time" value={edit.asleep} onChange={set('asleep')} />
        </label>
      )}
      {sleeping && edit.type === 'night' && (
        <fieldset className="wakings live-wakings">
          <legend>Night wakings</legend>
          <WakingRows wakings={edit.wakings} onChange={(wakings) => setEdit((x) => ({ ...x, wakings }))}>
            {state === 'nightawake' && (
              <label>
                <span>Awake now — woke at</span>
                <input type="time" value={edit.wakingFrom} onChange={set('wakingFrom')} />
              </label>
            )}
          </WakingRows>
        </fieldset>
      )}
      <div className="live-actions">
        <button type="button" className="button primary" onClick={save}>Save times</button>
        <button type="button" className="button ghost" onClick={onDone}>Back</button>
      </div>
    </div>
  );
}
