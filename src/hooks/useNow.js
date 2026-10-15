import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` (no refresh when null). */
export function useNow(intervalMs) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (!intervalMs) return undefined;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
