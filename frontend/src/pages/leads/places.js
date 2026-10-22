// Where a visit happened: a GPS point written as a place, and a Google Maps link to it. Shared by
// the lead page's visit history (visits.jsx) and Team Visits.

export const mapLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// One address lookup per point for the whole session - lists re-render, and each lookup is a request.
const placeCache = new Map();
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/** The written place for a GPS point ("4th Cross, Jayanagar, Bengaluru"), or null if it cannot be found. */
export function placeOf({ lat, lng }) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (!placeCache.has(key)) {
    const lookup = !MAPS_KEY
      ? Promise.resolve(null)
      : fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`)
          .then((r) => r.json())
          // Drop a leading Google plus code ("WHJM+8GF, ..."), as the Android app does.
          .then((d) => (d.status === "OK" && d.results?.[0]?.formatted_address ? d.results[0].formatted_address.replace(/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i, "") : null))
          .catch(() => null);
    placeCache.set(key, lookup);
  }
  return placeCache.get(key);
}
