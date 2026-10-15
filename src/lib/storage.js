// localStorage that never throws: in a private window or with storage blocked nothing is kept.

/** The stored JSON value for `key`, or `fallback` when missing or unreadable. */
export function readStored(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Stores `value` as JSON (null / undefined removes it). Returns false when storage is blocked. */
export function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
