import { useEffect, useState } from 'react';
import { describeError, saveWakeTargets, watchWakeTargets } from '../lib/cloud.js';
import { loadWakeTargets, saveLocalWakeTargets, withWakeTarget } from '../lib/wakeTargets.js';

/**
 * Target wake windows: on this device when signed out; when signed in, the shared cloud copy
 * (settings/wakeTargets), mirrored to the device. The first time a family signs in, the device's
 * targets are uploaded so they aren't lost. Returns [targets, setTarget(key, minutes)].
 */
export function useWakeTargets(cloud, onError) {
  const [targets, setTargets] = useState(loadWakeTargets);
  useEffect(() => {
    if (!cloud) return undefined;
    return watchWakeTargets((remote) => {
      if (remote) {
        setTargets(remote);
        saveLocalWakeTargets(remote);
      } else {
        const local = loadWakeTargets();
        if (Object.keys(local).length) saveWakeTargets(local).catch((e) => onError(describeError(e)));
      }
    }, (e) => onError(describeError(e)));
  }, [cloud]);

  const setTarget = (key, minutes) => {
    const next = withWakeTarget(targets, key, minutes);
    setTargets(next);
    saveLocalWakeTargets(next);
    if (cloud) saveWakeTargets(Object.keys(next).length ? next : null).catch((e) => onError(describeError(e)));
  };
  return [targets, setTarget];
}
