// Targets chosen by the parents in the Daytime sleep tank card. Cached on the device; shared through
// the cloud log when signed in (see hooks/useWakeTargets.js).
// Target wake windows: minutes awake before each nap and before bedtime, e.g. { 1: 120, 2: 150, bedtime: 210 }.
import { readStored, writeStored } from './storage.js';

const KEY = 'baby-sleep-wake-targets';
export const TARGET_CHOICES = Array.from({ length: 67 }, (_, i) => 30 + i * 5); // 30m … 6h in 5-minute steps

export function loadWakeTargets() {
  const stored = readStored(KEY, {});
  return stored && typeof stored === 'object' ? stored : {};
}
export const saveLocalWakeTargets = (targets) => writeStored(KEY, targets);

// The Daytime sleep tank's nap-time target in minutes (null = Auto, the 5-day average).
const NAP_KEY = 'baby-sleep-nap-target';
export function loadNapTarget() {
  const v = Number(readStored(NAP_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}
export const saveLocalNapTarget = (minutes) => writeStored(NAP_KEY, minutes || null);

/** The targets with the one for a nap number or 'bedtime' set (or cleared, with null). */
export function withWakeTarget(targets, key, minutes) {
  const next = { ...targets };
  if (minutes) next[key] = minutes;
  else delete next[key];
  return next;
}

/** The target for nap N or 'bedtime', or null. */
export const targetFor = (targets, key) => (key != null && targets?.[key] > 0 ? targets[key] : null);

/**
 * The day's target wake windows added up: before naps 1…N and before bedtime, where N is the most of
 * `naps` (today's naps so far) and the highest nap with a target. Null unless all of them are set.
 */
export function targetsTotal(targets, naps = 0) {
  const highest = Math.max(0, ...Object.keys(targets ?? {}).map(Number).filter((n) => n > 0 && targets[n] > 0));
  const keys = [...Array.from({ length: Math.max(naps, highest) }, (_, i) => i + 1), 'bedtime'];
  return keys.every((k) => targetFor(targets, k)) ? keys.reduce((total, k) => total + targets[k], 0) : null;
}
