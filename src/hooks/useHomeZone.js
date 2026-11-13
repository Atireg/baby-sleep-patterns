import { readStored, writeStored } from '../lib/storage.js';
import { localZone } from '../lib/time.js';
import { useSyncedSetting } from './useSyncedSetting.js';

// The family's home time zone: sleeps saved before time zones were recorded were logged there.
// The first device to run this keeps its own time zone (and, signed in, shares it with the others).
const KEY = 'baby-sleep-home-zone';
function loadHomeZone() {
  const stored = readStored(KEY);
  if (typeof stored === 'string' && stored) return stored;
  const zone = localZone();
  writeStored(KEY, zone);
  return zone;
}
const HOME_ZONE = {
  name: 'homeZone', field: 'zone', load: loadHomeZone, saveLocal: (zone) => writeStored(KEY, zone), isSet: Boolean,
};

/** The home time zone (IANA name), shared between devices when signed in. Returns [zone, setZone]. */
export const useHomeZone = (cloud, onError) => useSyncedSetting(cloud, onError, HOME_ZONE);
