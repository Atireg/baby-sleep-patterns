import { useRef, useState } from 'react';
import { utils, writeFile } from 'xlsx';
import { entriesToRows, entryToValues, makeEntry } from '../lib/entries.js';
import { METHODS, MOODS } from '../lib/insights.js';
import { formatDay, formatDuration } from '../lib/sleepData.js';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const minutes = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const duration = (e) => (minutes(e.woke) - minutes(e.asleep) + 1440) % 1440;
const EMPTY = { settle: '', asleep: '', woke: '', method: '', mood: '', notes: '' };
const SHOW = 6;

/** Form for adding sleeps by hand, plus the list of entries with export / delete. */
export default function EntryForm({ entries, cloud, onAdd, onUpdate, onDelete, onClear, storageOk }) {
  const [values, setValues] = useState({ day: today(), type: 'nap', ...EMPTY });
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(null); // entry being edited
  const [dayFilter, setDayFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const startEdit = (entry) => {
    setEditing(entry);
    setValues(entryToValues(entry));
    setError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const stopEdit = () => {
    setEditing(null);
    setError(null);
    setValues((v) => ({ day: v.day, type: v.type, ...EMPTY }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const { entry, error: err } = makeEntry(values, editing?.id);
    if (err) return setError(err);
    if (editing) {
      setSaving(true);
      try {
        await onUpdate(editing, entry);
        stopEdit();
      } catch (ex) {
        setError(ex.message || 'Could not save the changes.');
      } finally {
        setSaving(false);
      }
      return;
    }
    onAdd(entry);
    setError(null);
    // Keep the date for the next entry of the same day; clear the times.
    setValues((v) => ({ day: v.day, type: v.type, ...EMPTY }));
  };

  const download = () => {
    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet(entriesToRows(entries));
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 11 }, { wch: 9 }, { wch: 7 }, { wch: 16 }, { wch: 12 }, { wch: 30 }];
    utils.book_append_sheet(wb, ws, 'Sleep log');
    writeFile(wb, `sleep-entries-${today()}.xlsx`);
  };

  const sorted = [...entries].sort((a, b) => (b.day + b.asleep).localeCompare(a.day + a.asleep));
  const filtered = dayFilter ? sorted.filter((e) => e.day === dayFilter) : sorted;
  const visible = showAll || dayFilter ? filtered : filtered.slice(0, SHOW);

  return (
    <section className={`card entry ${editing ? 'editing' : ''}`}>
      <div>
        <h2>{editing ? 'Edit sleep' : 'Add a sleep'}</h2>
        <p className="subtitle">
          Log naps and nights here; they appear in the charts straight away. For a night, use the evening’s date
          — the wake-up time is the next morning.
        </p>
      </div>

      <form className="entry-form" onSubmit={submit} noValidate ref={formRef}>
        <label>
          <span>Date</span>
          <input type="date" value={values.day} onChange={set('day')} required />
        </label>
        <fieldset className="segmented">
          <legend>Type</legend>
          {['nap', 'night'].map((t) => (
            <label key={t} className={values.type === t ? 'active' : ''}>
              <input type="radio" name="type" value={t} checked={values.type === t} onChange={set('type')} />
              {t === 'nap' ? 'Nap' : 'Night'}
            </label>
          ))}
        </fieldset>
        <label>
          <span>Started settling <em>optional</em></span>
          <input type="time" value={values.settle} onChange={set('settle')} />
        </label>
        <label>
          <span>Fell asleep</span>
          <input type="time" value={values.asleep} onChange={set('asleep')} required />
        </label>
        <label>
          <span>Woke up</span>
          <input type="time" value={values.woke} onChange={set('woke')} required />
        </label>
        <label>
          <span>How she fell asleep</span>
          <select value={values.method} onChange={set('method')}>
            <option value="">—</option>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>
          <span>Mood after</span>
          <select value={values.mood} onChange={set('mood')}>
            <option value="">—</option>
            {MOODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="wide">
          <span>Notes <em>optional</em></span>
          <input type="text" value={values.notes} onChange={set('notes')} placeholder="e.g. short nap in the car" />
        </label>
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={saving}>
            {editing ? (saving ? 'Saving…' : 'Save changes') : 'Add entry'}
          </button>
          {editing && <button type="button" className="button ghost" onClick={stopEdit}>Cancel edit</button>}
          {error && <span className="error" role="alert">{error}</span>}
        </div>
      </form>

      {!cloud && !storageOk && (
        <p className="error">This browser is blocking storage, so entries will be lost when you close the page. Download them to keep them.</p>
      )}

      {entries.length > 0 && (
        <div className="entries">
          <div className="entries-head">
            <h3>{cloud ? 'Shared log' : 'Your entries'} <span className="count">{entries.length}</span></h3>
            <div className="actions-inline">
              <button type="button" className="button" onClick={download}>Download as Excel</button>
              {onClear && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => window.confirm('Delete all entries saved on this device?') && onClear()}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <label className="entry-filter">
            <span>Show day</span>
            <input type="date" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} />
            {dayFilter && <button type="button" className="icon-button" aria-label="Show all days" onClick={() => setDayFilter('')}>×</button>}
          </label>
          {dayFilter && filtered.length === 0 && <p className="muted">No sleeps logged on that day.</p>}
          <ul className="entry-list">
            {visible.map((e) => (
              <li key={e.id} className={editing?.id === e.id ? 'being-edited' : ''}>
                <span className={`pill ${e.type}`}>{e.type === 'night' ? 'Night' : 'Nap'}</span>
                <span className="entry-day">{formatDay(e.day)}</span>
                <span className="entry-time">{e.asleep}–{e.woke}</span>
                <span className="entry-dur">{formatDuration(duration(e))}</span>
                <span className="entry-extra">{[e.method, e.mood, e.notes].filter(Boolean).join(' · ')}</span>
                <button type="button" className="icon-button edit" aria-label="Edit entry" title="Edit" onClick={() => startEdit(e)}>✎</button>
                <button type="button" className="icon-button" aria-label="Delete entry" onClick={() => (!cloud || window.confirm('Delete this sleep from the shared log?')) && onDelete(e.id)}>×</button>
              </li>
            ))}
          </ul>
          {!dayFilter && sorted.length > SHOW && (
            <button type="button" className="button ghost" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
          <p className="hint">
            {cloud
              ? 'Saved to your shared log — visible on every device where you sign in.'
              : 'Saved in this browser only. Sign in above to keep them in the cloud, or download them as a copy.'}
          </p>
        </div>
      )}
    </section>
  );
}
