import { entryZone } from '../lib/entries.js';
import { localZone, sameZone, zoneCity } from '../lib/time.js';

/**
 * Shown when some of the recent sleeps were logged in another time zone (e.g. on a trip): times on
 * the page are this phone's clock, and the others are converted.
 */
export default function TimeZoneNote({ entries, homeZone, sinceDay }) {
  const here = localZone();
  const others = [];
  for (const z of [...entries.filter((e) => e.day >= sinceDay).map(entryZone), homeZone]) {
    if (z && !sameZone(z, here) && !others.some((o) => sameZone(o, z))) others.push(z);
  }
  if (!others.length) return null;
  return (
    <p className="zone-note" role="note">
      🌍 Times are shown in <strong>{zoneCity(here)} time</strong> (this phone).
      {' '}Sleeps logged in {others.map((z) => `${zoneCity(z)} time`).join(' or ')} are converted, so lengths and wake windows stay right.
    </p>
  );
}
