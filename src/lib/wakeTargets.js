// Target wake windows chosen by the parents (Daytime sleep tank card): minutes awake before each nap
// and before bedtime, e.g. { 1: 120, 2: 150, bedtime: 210 }. Cached on the device; shared through the
// cloud log when signed in (see useWakeTargets).
import { readStored, writeStored } from './storage.js';

const KEY = 'baby-sleep-wake-targets';
export const TARGET_CHOICES = Array.from({ length: 67 }, (_, i) => 30 + i * 5); // 30m … 6h in 5-minute steps

export function loadWakeTargets() {
  const stored = readStored(KEY, {});
  return stored && typeof stored === 'object' ? stored : {};
}
export const saveLocalWakeTargets = (targets) => writeStored(KEY, targets);

/** The targets with the one for a nap number or 'bedtime' set (or cleared, with null). */
export function withWakeTarget(targets, key, minutes) {
  const next = { ...targets };
  if (minutes) next[key] = minutes;
  else delete next[key];
  return next;
}

/** The target for nap N or 'bedtime', or null. */
export const targetFor = (targets, key) => (key != null && targets?.[key] > 0 ? targets[key] : null);
