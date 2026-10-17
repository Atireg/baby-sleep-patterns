// Target wake windows chosen by the parents (Daytime sleep tank card): minutes awake before each nap
// and before bedtime, e.g. { 1: 120, 2: 150, bedtime: 210 }. Kept on this device.
import { readStored, writeStored } from './storage.js';

const KEY = 'baby-sleep-wake-targets';
export const TARGET_CHOICES = Array.from({ length: 67 }, (_, i) => 30 + i * 5); // 30m … 6h in 5-minute steps

export function loadWakeTargets() {
  const stored = readStored(KEY, {});
  return stored && typeof stored === 'object' ? stored : {};
}

/** Sets (or clears, with null) the target for a nap number or 'bedtime'; returns the new targets. */
export function setWakeTarget(targets, key, minutes) {
  const next = { ...targets };
  if (minutes) next[key] = minutes;
  else delete next[key];
  writeStored(KEY, next);
  return next;
}

/** The target for nap N or 'bedtime', or null. */
export const targetFor = (targets, key) => (key != null && targets?.[key] > 0 ? targets[key] : null);
