import { entryZone } from '../lib/entries.js';
import { localZone, sameZone, zoneCity } from '../lib/time.js';

/** "GMT+1" for this phone's time zone right now, or '' if the browser can't say. */
function offsetLabel() {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * Always says which time zone the page's times are in (this phone's). When some recent sleeps were
 * logged in another time zone (e.g. on a trip), it also says they are converted.
 */
export default function TimeZoneNote({ entries, homeZone, sinceDay }) {
  const here = localZone();
  const others = [];
  for (const z of [...entries.filter((e) => e.day >= sinceDay).map(entryZone), homeZone]) {
    if (z && !sameZone(z, here) && !others.some((o) => sameZone(o, z))) others.push(z);
  }
  const offset = offsetLabel();
  return (
    <p className={`zone-note ${others.length ? 'converted' : ''}`} role="note">
      🌍 Times in <strong>{zoneCity(here)} time</strong>{offset && ` · ${offset}`}
      {others.length > 0 && (
        <> (this phone). Sleeps logged in {others.map((z) => `${zoneCity(z)} time`).join(' or ')} are converted, so lengths and wake windows stay right.</>
      )}
    </p>
  );
}
