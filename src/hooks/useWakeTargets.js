import { loadWakeTargets, loadNapTarget, saveLocalNapTarget, saveLocalWakeTargets, withWakeTarget } from '../lib/wakeTargets.js';
import { useSyncedSetting } from './useSyncedSetting.js';

const WAKE_TARGETS = {
  name: 'wakeTargets', field: 'targets', load: loadWakeTargets, saveLocal: saveLocalWakeTargets,
  isSet: (t) => Object.keys(t ?? {}).length > 0,
};
const NAP_TARGET = {
  name: 'napTarget', field: 'minutes', load: loadNapTarget, saveLocal: saveLocalNapTarget, isSet: (m) => m > 0,
};

/** Target wake windows, shared between devices when signed in. Returns [targets, setTarget(key, minutes)]. */
export function useWakeTargets(cloud, onError) {
  const [targets, setTargets] = useSyncedSetting(cloud, onError, WAKE_TARGETS);
  const safe = targets ?? {};
  return [safe, (key, minutes) => setTargets(withWakeTarget(safe, key, minutes))];
}

/** The tank's nap-time target in minutes (null = Auto), shared between devices when signed in. */
export const useNapTarget = (cloud, onError) => useSyncedSetting(cloud, onError, NAP_TARGET);
