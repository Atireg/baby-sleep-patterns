import { useEffect, useState } from 'react';
import { describeError, saveSetting, watchSetting } from '../lib/cloud.js';

/**
 * A family setting kept on this device when signed out and, when signed in, in the shared cloud log
 * (settings/{name}), watched live and mirrored to the device. The first time the cloud has no value
 * yet, this device's value is uploaded so it isn't lost.
 * store: { name, field, load(), saveLocal(value), isSet(value) }. Returns [value, setValue].
 */
export function useSyncedSetting(cloud, onError, store) {
  const [value, setValue] = useState(store.load);
  const report = (e) => onError(describeError(e));
  useEffect(() => {
    if (!cloud) return undefined;
    return watchSetting(store.name, store.field, (remote) => {
      if (remote === undefined) {
        const local = store.load();
        if (store.isSet(local)) saveSetting(store.name, store.field, local).catch(report);
        return;
      }
      setValue(remote);
      store.saveLocal(remote);
    }, report);
  }, [cloud]);

  const change = (next) => {
    setValue(next);
    store.saveLocal(next);
    if (cloud) saveSetting(store.name, store.field, next).catch(report);
  };
  return [value, change];
}
