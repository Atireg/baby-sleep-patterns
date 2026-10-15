// The sleep log and the sleep being tracked now: kept in this browser when signed out, in the shared
// Firebase log when signed in. Owns the data and every change to it; App only arranges the cards.
import { useEffect, useState } from 'react';
import { loadEntries, replaceEntry, saveEntries } from '../lib/entries.js';
import {
  addEntries, deleteEntry, describeError, setLive, signIn, signOut, updateEntry, watchEntries, watchLive, watchUser,
} from '../lib/cloud.js';
import { editAwakeSince, liveAfterLogEdit, loadLocalLive, saveLocalLive } from '../lib/live.js';

export function useSleepLog() {
  // Entries kept only in this browser (used when not signed in).
  const [entries, setEntries] = useState(loadEntries);
  const [storageOk, setStorageOk] = useState(true);
  useEffect(() => { setStorageOk(saveEntries(entries)); }, [entries]);

  // Shared cloud log (Firebase). user: undefined = still checking, null = signed out.
  const [user, setUser] = useState(undefined);
  const [cloudEntries, setCloudEntries] = useState([]);
  const [cloudError, setCloudError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => watchUser(setUser), []);
  useEffect(() => {
    setCloudEntries([]);
    setCloudError(null);
    if (!user) return undefined;
    return watchEntries(setCloudEntries, (e) => setCloudError(describeError(e)));
  }, [user]);
  const cloud = Boolean(user);
  const formEntries = cloud ? cloudEntries : entries;

  // The sleep being tracked right now: shared via the cloud when signed in, else kept on this device.
  const [localLive, setLocalLive] = useState(loadLocalLive);
  const [cloudLive, setCloudLive] = useState(null);
  useEffect(() => {
    setCloudLive(null);
    if (!user) return undefined;
    return watchLive(setCloudLive, (e) => setCloudError(describeError(e)));
  }, [user]);
  const live = cloud ? cloudLive : localLive;
  const changeLive = (next) => {
    if (cloud) {
      setCloudLive(next); // show it immediately; the listener confirms
      setLive(next).catch((e) => setCloudError(describeError(e)));
    } else {
      setLocalLive(next);
      saveLocalLive(next);
    }
  };
  const saveLiveEntry = async (entry) => {
    if (cloud) await addEntries([entry]);
    else setEntries((list) => [...list, entry]);
  };

  const report = (e) => setCloudError(describeError(e));
  const run = async (task) => {
    setBusy(true);
    setCloudError(null);
    try {
      await task();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const onSignIn = () => run(signIn);
  const onSignOut = () => run(async () => { await signOut(); setNotice(null); });
  const moveLocal = () => run(async () => {
    const added = await addEntries(entries);
    setEntries([]);
    setNotice(`Moved ${added} entr${added === 1 ? 'y' : 'ies'} from this device to the shared log.`);
  });
  // Edits in the sleep log win over the Now card (manual awake timer, a sleep still being tracked).
  const syncLive = (entry) => {
    const next = liveAfterLogEdit(live, entry);
    if (next !== live) changeLive(next);
  };
  const addEntry = (e) => {
    syncLive(e);
    return cloud ? run(() => addEntries([e])) : setEntries((list) => [...list, e]);
  };
  // Throws with a readable message so the form can show it next to the fields.
  const changeEntry = async (previous, updated) => {
    if (cloud) {
      try {
        await updateEntry(previous, updated);
      } catch (e) {
        throw new Error(describeError(e));
      }
      return;
    }
    const { list, error } = replaceEntry(entries, updated);
    if (error) throw new Error(error);
    setEntries(list);
  };
  const removeEntry = (id) => {
    syncLive(null);
    return cloud
      ? run(() => deleteEntry(cloudEntries.find((e) => e.id === id)))
      : setEntries((list) => list.filter((e) => e.id !== id));
  };
  const editEntry = async (previous, updated) => {
    await changeEntry(previous, updated);
    syncLive(updated);
  };
  // "awake since" edited in the Now card.
  const editAwake = async (time, since) => {
    const res = editAwakeSince(formEntries, since, time);
    if (res.error) throw new Error(res.error);
    if (res.entry) return editEntry(formEntries.find((e) => e.id === res.entry.id), res.entry);
    changeLive({ ...(live ?? {}), awakeFrom: res.awakeFrom });
  };

  return {
    user, cloud, cloudEntries, localEntries: entries, formEntries, storageOk, cloudError, notice, setNotice, busy, run,
    live, changeLive, saveLiveEntry, onSignIn, onSignOut, moveLocal,
    addEntry, changeEntry, editEntry, removeEntry, editAwake, clearLocal: () => setEntries([]),
  };
}
