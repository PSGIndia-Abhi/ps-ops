// Field Tracking (sales manager / admin): a sales executive's field day, reviewed after it ends.
//   Team day       - every executive on a date: status, shift, visits, distance. Click one for:
//   Executive day  - the day on a map (route drawn along the roads, like a ride app), the
//                    summary (petrol km, GPS km, time on duty), every client visit with its
//                    punch-in / punch-out times and time spent, and the day's log.
//   Home locations - the sales manager (their team) or admin (everyone) sets each executive's
//                    home - the start and end point of petrol km.
// Data: backend/src/routes/sales-field-tracking.routes.js (GET /api/field-tracking/...).
// The map is this page's own (not components/maps/WebMap, which the technician map uses).

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AdvancedMarker, InfoWindow, Map as GoogleMap, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  FiActivity,
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiExternalLink,
  FiHome,
  FiMapPin,
  FiNavigation,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import PlacesSearchInput from "../../components/maps/PlacesSearchInput";
import { LEADS_HOME } from "./access";
import { clearFieldHome, fieldDay, fieldExecutives, fieldTeam, saveFieldRoute, setFieldHome } from "./leadsApi";
import { timeLabel } from "./format";
import { mapLink } from "./places";
import { Avatar, Badge, Button, Card, Empty, Kpi, Modal, SkeletonRows, Tabs } from "./ui";
import { useViewer } from "./viewer";
import { useToast } from "./hooks";
import "./fieldTracking.css";

/** A punch / start / end within this distance of where it should be is "at the place". */
const NEAR_M = 300;
/** Home, shift start and shift end closer than this share one marker. */
const SAME_PLACE_M = 80;
const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bengaluru, when the day has no point at all
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID;

// ---------------------------------------------------------------------------- small helpers
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (key, by) => {
  const d = new Date(`${key}T00:00`);
  d.setDate(d.getDate() + by);
  return dayKey(d);
};
const dayTitle = (date) => {
  const today = dayKey(new Date());
  if (date === today) return "Today";
  if (date === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${date}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};
const minutesText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`);
/** Time between two wall-clock values, as "48 sec" / "12 min" / "1 h 05 min". */
function spentText(from, to) {
  if (!from || !to) return null;
  const sec = Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000));
  return sec < 60 ? `${sec} sec` : minutesText(Math.round(sec / 60));
}
const metersText = (m) => (m === null || m === undefined ? "-" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const kmText = (km) => (km === null || km === undefined ? "-" : `${Number(km).toFixed(1)} km`);
const toLatLng = (p) => (p ? { lat: Number(p.latitude), lng: Number(p.longitude) } : null);
/** google.maps.LatLng (functions) or LatLngLiteral / LatLngAltitude (properties) -> literal. */
const literal = (p) => ({ lat: typeof p.lat === "function" ? p.lat() : p.lat, lng: typeof p.lng === "function" ? p.lng() : p.lng });

function haversineM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------- saved routes
// The road line is stored on the server as a Google encoded polyline (precision 5) - a compact
// text form of a list of points.
function encodePolyline(points) {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const encode = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  points.forEach((p) => {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encode(lat - prevLat) + encode(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  });
  return out;
}

function decodePolyline(text) {
  const points = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = text.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < text.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < text.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const NO_POINTS = [];
/** Days saved (or being saved) from this page, so a re-render never saves the same day twice. */
const savedDays = new Set();

// ---------------------------------------------------------------------------- Google routing
// Both results are cached for the session: one set of requests per executive-day opened.
const petrolCache = new globalThis.Map();
const roadPathCache = new globalThis.Map();
const MAX_WAYPOINTS = 23;

/** Road route through points: Routes API (new Maps projects) first, then the Directions service. */
async function routeThrough(routesLib, points, want) {
  const origin = points[0];
  const destination = points[points.length - 1];
  const middle = points.slice(1, -1);
  if (routesLib.Route?.computeRoutes) {
    try {
      const { routes } = await routesLib.Route.computeRoutes({
        origin,
        destination,
        intermediates: middle.map((p) => ({ location: p, ...(want === "path" ? { via: true } : {}) })),
        travelMode: "DRIVING",
        fields: want === "path" ? ["path"] : ["distanceMeters"],
      });
      const r = routes?.[0];
      if (want === "path" && r?.path?.length > 1) return r.path.map(literal);
      if (want === "meters" && r?.distanceMeters) return r.distanceMeters;
    } catch {
      // fall through to the Directions service
    }
  }
  const result = await new routesLib.DirectionsService().route({
    origin,
    destination,
    waypoints: middle.map((p) => ({ location: p, stopover: want === "meters" })),
    travelMode: "DRIVING",
  });
  const r = result.routes[0];
  return want === "path" ? r.overview_path.map(literal) : r.legs.reduce((s, leg) => s + (leg.distance?.value || 0), 0);
}

/** Petrol km: home -> each client (punch order) -> home, by road. Straight line when road routing is unavailable. */
function usePetrolKm(cacheKey, route) {
  const routesLib = useMapsLibrary("routes");
  const [state, setState] = useState({ key: null, km: null, source: null });
  const points = useMemo(() => (route || []).map(toLatLng), [route]);
  const straightKm = useMemo(() => {
    let m = 0;
    for (let i = 1; i < points.length; i += 1) m += haversineM(points[i - 1], points[i]);
    return m / 1000;
  }, [points]);
  const tooMany = points.length - 2 > MAX_WAYPOINTS;

  useEffect(() => {
    if (points.length < 2 || tooMany || petrolCache.has(cacheKey) || !routesLib) return undefined;
    let alive = true;
    const done = (value) => {
      petrolCache.set(cacheKey, value);
      if (alive) setState({ key: cacheKey, ...value });
    };
    routeThrough(routesLib, points, "meters")
      .then((m) => done({ km: m / 1000, source: "road" }))
      .catch(() => done({ km: straightKm, source: "straight" }));
    return () => {
      alive = false;
    };
  }, [cacheKey, points, routesLib, straightKm, tooMany]);

  if (points.length < 2) return { km: null, source: null, loading: false };
  if (tooMany) return { km: straightKm, source: "straight", loading: false };
  const cached = petrolCache.get(cacheKey) || (state.key === cacheKey ? state : null);
  if (!cached) return { km: null, source: null, loading: true };
  return { km: cached.km, source: cached.source, loading: false };
}

/**
 * GPS points thinned to what a road route needs: one about every WAYPOINT_GAP_M. Google has to pass
 * every waypoint, so a dense track (every wobble of the GPS) makes it detour to touch points a few
 * metres off the road; well-spaced points let it simply follow the road between them.
 */
const WAYPOINT_GAP_M = 350;
function thin(points, maxPoints = 96) {
  const kept = [];
  points.forEach((p) => {
    if (!kept.length || haversineM(kept[kept.length - 1], p) >= WAYPOINT_GAP_M) kept.push(p);
  });
  const last = points[points.length - 1];
  if (last && kept[kept.length - 1] !== last) kept.push(last);
  if (kept.length <= maxPoints) return kept;
  const step = (kept.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => kept[Math.round(i * step)]);
}

/**
 * Removes the dead-end spurs and small loops a routed line can still have: wherever the line leaves
 * a spot and comes back to it (within SPUR_CLOSE_M) after SPUR_MIN_M..SPUR_MAX_M of travel, the
 * excursion is cut - unless it reaches a client the executive punched in at (`keep`), because then
 * the trip there was real.
 */
/** GPS fixes less accurate than this are left out of the drawn line (still counted for GPS km). */
const LINE_ACCURACY_M = 50;
const SPUR_MIN_M = 120;
const SPUR_MAX_M = 3000;
const SPUR_CLOSE_M = 30;
const SPUR_KEEP_M = 150;
function removeSpurs(path, keep) {
  const out = [];
  let i = 0;
  while (i < path.length) {
    out.push(path[i]);
    let back = -1;
    let along = 0;
    for (let j = i + 1; j < path.length; j += 1) {
      along += haversineM(path[j - 1], path[j]);
      if (along > SPUR_MAX_M) break;
      if (along >= SPUR_MIN_M && haversineM(path[i], path[j]) <= SPUR_CLOSE_M) back = j;
    }
    if (back > 0) {
      const excursion = path.slice(i + 1, back);
      const toClient = keep.some((k) => excursion.some((p) => haversineM(p, k) <= SPUR_KEEP_M));
      if (!toClient) {
        i = back;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

// ---- Roads API "Snap to Roads": puts each GPS point on the road the vehicle was on.
// It needs points close together (Google: under ~300 m), so legs between two fixes further apart
// than SNAP_GAP_M are filled with the road route between them (Routes API) instead.
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const SNAP_CHUNK = 100; // the API's limit per request
const SNAP_GAP_M = 400;
const SNAP_MIN_MOVE_M = 20; // fixes closer than this to the last one are GPS jitter while standing
const MAX_FILL_LEGS = 40; // more sparse legs than this: use the cheaper waypoint route instead

/** Snapped points for `points`, each kept with the index of the input point it belongs to (or -1 for in-between road points). */
async function snapToRoads(points) {
  const out = [];
  for (let start = 0; start < points.length - 1; start += SNAP_CHUNK - 1) {
    const chunk = points.slice(start, start + SNAP_CHUNK);
    const path = chunk.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
    const res = await fetch(`https://roads.googleapis.com/v1/snapToRoads?interpolate=true&path=${encodeURIComponent(path)}&key=${MAPS_KEY}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "Snap to Roads failed");
    (data.snappedPoints || []).forEach((s) => {
      const idx = s.originalIndex === undefined ? -1 : start + s.originalIndex;
      // Chunks overlap by one point; skip its repeat at the start of the next chunk.
      if (start > 0 && idx === start && out.length && out[out.length - 1].idx === start) return;
      out.push({ idx, lat: s.location.latitude, lng: s.location.longitude });
    });
  }
  return out;
}

/** Snapped line where the fixes are close together; the road route between fixes where they are far apart. */
async function snappedRoadPath(routesLib, gps) {
  const pts = [];
  gps.forEach((p) => {
    if (!pts.length || haversineM(pts[pts.length - 1], p) >= SNAP_MIN_MOVE_M) pts.push(p);
  });
  if (pts.length < 2) return null;
  const sparse = [];
  for (let i = 0; i < pts.length - 1; i += 1) if (haversineM(pts[i], pts[i + 1]) > SNAP_GAP_M) sparse.push(i);
  if (sparse.length > MAX_FILL_LEGS) return null;

  const snapped = await snapToRoads(pts);
  const at = new globalThis.Map();
  snapped.forEach((s, k) => s.idx >= 0 && !at.has(s.idx) && at.set(s.idx, k));
  const fills = new globalThis.Map(
    await Promise.all(sparse.map(async (i) => [i, await routeThrough(routesLib, [pts[i], pts[i + 1]], "path")])),
  );

  const line = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const from = at.get(i);
    const to = at.get(i + 1);
    if (!fills.has(i) && from !== undefined && to !== undefined && to > from) {
      line.push(...snapped.slice(from, to + 1).map(({ lat, lng }) => ({ lat, lng })));
    } else {
      line.push(...(fills.get(i) || (await routeThrough(routesLib, [pts[i], pts[i + 1]], "path"))));
    }
  }
  return line;
}

/**
 * The GPS track drawn along the roads, like a ride app: snapped to the roads with the Roads API
 * (sparse legs filled by the road route), then cleaned of spurs. If that cannot be done, the thinned
 * points are routed in chunks of 25 (origin + 23 waypoints + destination); if that fails too, the
 * plain GPS line. `keep`: client punch points the line must never be cut away from.
 */
function useRoadPath(cacheKey, gpsPath, keep) {
  const routesLib = useMapsLibrary("routes");
  const [state, setState] = useState({ key: null, path: null });
  const points = useMemo(() => thin(gpsPath), [gpsPath]);

  useEffect(() => {
    if (points.length < 2 || roadPathCache.has(cacheKey) || !routesLib) return undefined;
    let alive = true;
    (async () => {
      const chunks = [];
      for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS + 1) chunks.push(points.slice(i, i + MAX_WAYPOINTS + 2));
      try {
        let line = null;
        try {
          line = await snappedRoadPath(routesLib, gpsPath);
        } catch {
          line = null; // Roads API unavailable - use the waypoint route below
        }
        if (!line) line = (await Promise.all(chunks.map((c) => routeThrough(routesLib, c, "path")))).flat();
        const value = { path: removeSpurs(line, keep), road: true };
        roadPathCache.set(cacheKey, value);
        if (alive) setState({ key: cacheKey, ...value });
      } catch {
        const value = { path: gpsPath, road: false };
        roadPathCache.set(cacheKey, value);
        if (alive) setState({ key: cacheKey, ...value });
      }
    })();
    return () => {
      alive = false;
    };
  }, [cacheKey, points, routesLib, gpsPath, keep]);

  if (points.length < 2) return { path: gpsPath, road: false, loading: false };
  const cached = roadPathCache.get(cacheKey) || (state.key === cacheKey ? state : null);
  return cached ? { path: cached.path, road: cached.road, loading: false } : { path: gpsPath, road: false, loading: true };
}

// ---------------------------------------------------------------------------- map
/** The route: a dark line with a white casing, like a ride app. Fits the map to the day once. */
function RouteLine({ path, fitTo, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !path || path.length < 2) return undefined;
    const casing = new window.google.maps.Polyline({ path, strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: 9, zIndex: 1 });
    const line = new window.google.maps.Polyline({ path, strokeColor: "#1F2937", strokeOpacity: 1, strokeWeight: 5, zIndex: 2 });
    casing.setMap(map);
    line.setMap(map);
    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, path]);
  useEffect(() => {
    if (!map || !fitTo?.length) return;
    if (fitTo.length === 1) {
      map.setCenter(fitTo[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    fitTo.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 70);
    // Only when a new day is opened, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

/** Pans to the selected place when it is picked from the side panel. */
function PanTo({ point }) {
  const map = useMap();
  useEffect(() => {
    if (map && point) map.panTo(point);
  }, [map, point]);
  return null;
}

function PlaceMarker({ place, onClick }) {
  return (
    <AdvancedMarker position={place.point} onClick={onClick} zIndex={place.kind === "visit" ? 30 : 20} title={place.title}>
      <div className={`ft-pin ft-pin-${place.kind}${place.lines.length > 1 ? " two" : ""}${place.unplanned ? " unplanned" : ""}`}>
        <span className="ft-pin-label">
          {place.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
          <FiChevronRight />
        </span>
        <span className="ft-pin-dot">{place.badge}</span>
      </div>
    </AdvancedMarker>
  );
}

/** Home / start / end merged into one marker when they are at the same place. */
function endPlaces(day) {
  const raw = [];
  if (day.home) raw.push({ id: "home", what: "Home", point: toLatLng(day.home) });
  day.shifts.forEach((s, i) => {
    if (s.start) raw.push({ id: `start-${i}`, what: `Start ${timeLabel(s.startedAt)}`, point: toLatLng(s.start), shift: s, role: "start" });
    if (s.end) raw.push({ id: `end-${i}`, what: `End ${timeLabel(s.endedAt)}`, point: toLatLng(s.end), shift: s, role: "end" });
  });
  const groups = [];
  raw.forEach((r) => {
    const g = groups.find((x) => haversineM(x.point, r.point) <= SAME_PLACE_M);
    if (g) g.items.push(r);
    else groups.push({ point: r.point, items: [r] });
  });
  return groups.map((g, i) => {
    const hasHome = g.items.some((x) => x.id === "home");
    const hasEnd = g.items.some((x) => x.role === "end");
    const hasStart = g.items.some((x) => x.role === "start");
    // "Home" on top, the shift times under it; a place without home shows its times on one line.
    const times = g.items.filter((x) => x.id !== "home").map((x) => x.what).join(" · ");
    return {
      id: `place-${i}`,
      kind: hasHome ? "home" : hasEnd && !hasStart ? "end" : "start",
      point: g.point,
      badge: hasHome ? <FiHome /> : null,
      title: hasHome ? "Home" : hasStart ? "Shift start" : "Shift end",
      lines: hasHome && times ? ["Home", times] : [hasHome ? "Home" : times],
      items: g.items,
    };
  });
}

function FieldMap({ day, roadPath, selected, onSelect, mapKey }) {
  const places = useMemo(() => endPlaces(day), [day]);
  const visits = useMemo(
    () =>
      day.visits
        .map((v, i) => ({ ...v, n: i + 1, point: toLatLng(v.checkIn || v.leadLocation) }))
        .filter((v) => v.point)
        .map((v) => ({
          id: v.meetingId,
          kind: "visit",
          point: v.point,
          badge: v.n,
          title: v.company,
          lines: [v.company, `${timeLabel(v.checkInAt)}${v.checkOutAt ? ` · ${spentText(v.checkInAt, v.checkOutAt)}` : " · on site"}`],
          unplanned: v.unplanned,
          visit: v,
        })),
    [day],
  );
  const fitTo = useMemo(() => [...roadPath, ...places.map((p) => p.point), ...visits.map((v) => v.point)], [roadPath, places, visits]);
  const chosen = [...places, ...visits].find((p) => p.id === selected) || null;
  const center = fitTo[0] || DEFAULT_CENTER;

  return (
    <GoogleMap
      mapId={MAP_ID}
      defaultCenter={center}
      defaultZoom={13}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      fullscreenControl
      className="ft-map-canvas"
    >
      <RouteLine path={roadPath} fitTo={fitTo} fitKey={mapKey} />
      <PanTo point={chosen?.point} />
      {places.map((p) => (
        <PlaceMarker key={p.id} place={p} onClick={() => onSelect(p.id)} />
      ))}
      {visits.map((p) => (
        <PlaceMarker key={p.id} place={p} onClick={() => onSelect(p.id)} />
      ))}
      {chosen && (
        <InfoWindow position={chosen.point} pixelOffset={[0, chosen.lines.length > 1 ? -82 : -66]} onCloseClick={() => onSelect(null)} headerContent={<strong className="ft-iw-title">{chosen.title}</strong>}>
          {chosen.visit ? <VisitDetails v={chosen.visit} compact /> : <PlaceDetails place={chosen} day={day} />}
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

function PlaceDetails({ place, day }) {
  return (
    <div className="ft-iw">
      {place.items.map((x) => (
        <div key={x.id} className="ft-iw-row">
          <span>{x.id === "home" ? "Home" : x.role === "start" ? "Shift start" : "Shift end"}</span>
          <strong>{x.id === "home" ? day.home?.address || "Registered home" : timeLabel(x.role === "start" ? x.shift.startedAt : x.shift.endedAt)}</strong>
        </div>
      ))}
      {place.items
        .filter((x) => x.shift)
        .map((x) => {
          const m = x.role === "start" ? x.shift.startFromHomeM : x.shift.endFromHomeM;
          return m === null ? null : (
            <div key={`${x.id}-home`} className="ft-iw-row">
              <span>{x.role === "start" ? "Start" : "End"} from home</span>
              <Check meters={m} />
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------- pieces
/** A distance check: green when within NEAR_M, amber beyond it, grey when it cannot be measured. */
function Check({ meters, missing = "-" }) {
  if (meters === null || meters === undefined) return <Badge tone="neutral">{missing}</Badge>;
  return meters <= NEAR_M ? <Badge tone="success">At the place · {metersText(meters)}</Badge> : <Badge tone="warn">{metersText(meters)} away</Badge>;
}

function VisitDetails({ v, compact = false }) {
  const spent = spentText(v.checkInAt, v.checkOutAt);
  return (
    <div className={`ft-iw${compact ? " compact" : ""}`}>
      <div className="ft-iw-tags">
        {v.unplanned ? <Badge tone="violet">Unplanned visit</Badge> : <Badge tone="info">Planned visit</Badge>}
        <Check meters={v.distanceFromLeadM} missing={v.checkIn ? "Client location not saved" : "No GPS at punch-in"} />
      </div>
      <div className="ft-iw-row">
        <span>Punch in</span>
        <strong>{timeLabel(v.checkInAt)}</strong>
      </div>
      <div className="ft-iw-row">
        <span>Punch out</span>
        <strong>{v.checkOutAt ? timeLabel(v.checkOutAt) : "Not yet"}</strong>
      </div>
      <div className="ft-iw-row">
        <span>Time spent</span>
        <strong>{spent || "On site"}</strong>
      </div>
      {!v.unplanned && v.scheduledAt && (
        <div className="ft-iw-row">
          <span>Planned for</span>
          <strong>{timeLabel(v.scheduledAt)}</strong>
        </div>
      )}
      {!!v.outcomeNotes && (
        <div className="ft-iw-row">
          <span>Outcome</span>
          <strong>{v.outcomeNotes}</strong>
        </div>
      )}
      {!compact && !!v.address && <p className="ft-iw-addr">{v.address}</p>}
      <Link className="ft-iw-link" to={`${LEADS_HOME}/${v.leadId}`}>
        Open lead {v.leadNumber ? `(${v.leadNumber})` : ""} <FiExternalLink />
      </Link>
    </div>
  );
}

function DayPicker({ date, onChange }) {
  const today = dayKey(new Date());
  return (
    <div className="ft-daypick">
      <button type="button" onClick={() => onChange(shiftDay(date, -1))} aria-label="Previous day">
        <FiChevronLeft />
      </button>
      <label>
        <FiCalendar />
        <span>{dayTitle(date)}</span>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Pick a day" />
      </label>
      <button type="button" onClick={() => onChange(shiftDay(date, 1))} disabled={date >= today} aria-label="Next day">
        <FiChevronRight />
      </button>
    </div>
  );
}

const STATUS = {
  ACTIVE: { label: "On duty", tone: "warn" },
  ENDED: { label: "Day ended", tone: "success" },
  NOT_STARTED: { label: "Not started", tone: "neutral" },
};

// ---------------------------------------------------------------------------- Team day
function TeamDay({ date, onOpen }) {
  const [result, setResult] = useState({ date: null, rows: [], error: "" });
  useEffect(() => {
    let alive = true;
    fieldTeam(date)
      .then((rows) => alive && setResult({ date, rows, error: "" }))
      .catch((err) => alive && setResult({ date, rows: [], error: err.message || "Could not load the team." }));
    return () => {
      alive = false;
    };
  }, [date]);
  const loading = result.date !== date;
  const rows = result.rows;
  const started = rows.filter((r) => r.status !== "NOT_STARTED").length;
  const km = rows.reduce((s, r) => s + (r.gpsKm || 0), 0);
  const visits = rows.reduce((s, r) => s + (r.visitCount || 0), 0);
  const noHome = rows.filter((r) => !r.hasHome).length;

  return (
    <>
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="On the field" value={started} icon={<FiUsers />} tone="info" foot={`of ${rows.length} sales executive${rows.length === 1 ? "" : "s"}`} />
        <Kpi index={1} label="Client visits" value={visits} icon={<FiMapPin />} tone="violet" foot="Punched in today" />
        <Kpi index={2} label="Distance" value={km} format={(n) => `${n.toFixed(1)} km`} icon={<FiNavigation />} tone="teal" foot="GPS, all executives" />
        <Kpi index={3} label="Home not set" value={noHome} icon={<FiHome />} tone={noHome ? "danger" : "success"} foot="Needed for petrol km" />
      </div>

      <Card flush index={1} title="Sales executives" sub="Select a person to see their route and visits">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : result.error ? (
          <Empty title="Could not load the team" text={result.error} icon={<FiMapPin />} />
        ) : rows.length === 0 ? (
          <Empty title="No sales executives" text="People with the Sales Executive role in your team appear here." icon={<FiUsers />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table ft-team">
              <thead>
                <tr>
                  <th>Sales executive</th>
                  <th>Status</th>
                  <th>On duty</th>
                  <th>Visits</th>
                  <th>Distance</th>
                  <th>Petrol km</th>
                  <th>Home</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.user.id} style={{ "--i": i }} onClick={() => onOpen(r.user.id)}>
                    <td>
                      <span className="ft-who">
                        <Avatar name={r.user.name} size={34} />
                        <strong>{r.user.name}</strong>
                      </span>
                    </td>
                    <td>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </td>
                    <td>
                      {r.firstStart ? (
                        <span className="ft-cell">
                          <strong>{minutesText(r.durationMin)}</strong>
                          <small>
                            {timeLabel(r.firstStart)} - {r.lastEnd ? timeLabel(r.lastEnd) : "now"}
                          </small>
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <span className="ft-cell">
                        <strong>{r.visitCount}</strong>
                        {r.unplannedVisitCount > 0 && <small>{r.unplannedVisitCount} unplanned</small>}
                      </span>
                    </td>
                    <td>{r.status === "NOT_STARTED" ? <span className="muted">-</span> : <strong>{kmText(r.gpsKm)}</strong>}</td>
                    <td>
                      {r.petrolKm !== null && r.petrolKm !== undefined ? (
                        <strong>{kmText(r.petrolKm)}</strong>
                      ) : (
                        <span className="muted" title="Worked out the first time the day is opened after it ends">
                          {r.status === "ACTIVE" ? "After the day ends" : r.status === "ENDED" ? "Open to work out" : "-"}
                        </span>
                      )}
                    </td>
                    <td>{r.hasHome ? <Badge tone="success">Set</Badge> : <Badge tone="danger">Not set</Badge>}</td>
                    <td className="ft-go">
                      <FiChevronRight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------- Executive day
function ExecutiveDay({ userId, date }) {
  const [result, setResult] = useState({ key: null, day: null, error: "" });
  const [selected, setSelected] = useState(null);
  const key = `${userId}|${date}`;
  useEffect(() => {
    let alive = true;
    fieldDay(userId, date)
      .then((day) => alive && setResult({ key, day, error: "" }))
      .catch((err) => alive && setResult({ key, day: null, error: err.message || "Could not load the day." }));
    return () => {
      alive = false;
    };
  }, [userId, date, key]);
  const day = result.key === key ? result.day : null;
  // The line is drawn from the accurate fixes only (GPS drift pulls a route off the road); if a
  // poor-signal day has too few of those, all valid points are used.
  const gpsPath = useMemo(() => {
    if (!day) return [];
    const valid = day.points.filter((p) => p.valid);
    const accurate = valid.filter((p) => p.accuracy === null || p.accuracy <= LINE_ACCURACY_M);
    return (accurate.length >= 2 ? accurate : valid).map(toLatLng);
  }, [day]);
  const clientPoints = useMemo(() => (day ? day.visits.map((v) => toLatLng(v.checkIn || v.leadLocation)).filter(Boolean) : []), [day]);

  // A closed day whose route was already worked out is read from the server - no Google request.
  // Otherwise Google is asked once here and, for a closed day, the result is saved for everyone.
  const saved = day?.savedRoute || null;
  const savedPath = useMemo(() => (saved?.roadPath ? decodePolyline(saved.roadPath) : null), [saved]);
  const livePetrol = usePetrolKm(key, saved ? null : day?.petrolRoute);
  const liveRoad = useRoadPath(key, saved ? NO_POINTS : gpsPath, clientPoints);
  const petrol = saved ? { km: saved.petrolKm, source: saved.petrolKm === null ? null : "road", loading: false } : livePetrol;
  const road = saved ? { path: savedPath || gpsPath, road: !!savedPath, loading: false } : liveRoad;

  useEffect(() => {
    if (!day || saved || !day.closed || savedDays.has(key) || livePetrol.loading || liveRoad.loading) return;
    // Only a real road result is kept: if Google could not route (straight-line fallback), nothing
    // is saved and the next view tries again - a straight line must never become the fixed figure.
    const petrolReady = !day.petrolRoute || livePetrol.source === "road";
    const roadReady = gpsPath.length < 2 || liveRoad.road;
    if (!petrolReady || !roadReady) return;
    savedDays.add(key);
    saveFieldRoute(userId, date, {
      fingerprint: day.fingerprint,
      petrolKm: day.petrolRoute ? Math.round(livePetrol.km * 100) / 100 : null,
      roadPath: gpsPath.length >= 2 ? encodePolyline(liveRoad.path) : null,
    }).catch(() => savedDays.delete(key));
  }, [day, saved, key, userId, date, gpsPath, livePetrol, liveRoad]);

  const log = useMemo(() => {
    if (!day) return [];
    const events = [];
    day.shifts.forEach((s) => {
      events.push({ at: s.startedAt, icon: <FiActivity />, tone: "info", text: "Shift started", sub: s.startFromHomeM !== null ? `${metersText(s.startFromHomeM)} from home` : "" });
      if (s.endedAt) {
        events.push({
          at: s.endedAt,
          icon: <FiCheckCircle />,
          tone: "success",
          text: s.status === "AUTO_ENDED" ? "Shift closed by the system" : "Shift ended",
          sub: s.status === "AUTO_ENDED" ? "End Shift was not pressed" : s.endFromHomeM !== null ? `${metersText(s.endFromHomeM)} from home` : "",
        });
      }
    });
    day.visits.forEach((v) => {
      events.push({
        at: v.checkInAt,
        icon: <FiMapPin />,
        tone: v.unplanned ? "violet" : "info",
        text: `Punched in at ${v.company}`,
        sub: [v.unplanned ? "Unplanned visit" : "Planned visit", v.distanceFromLeadM !== null ? `${metersText(v.distanceFromLeadM)} from the client's location` : null].filter(Boolean).join(" · "),
      });
      if (v.checkOutAt) {
        events.push({
          at: v.checkOutAt,
          icon: <FiMapPin />,
          tone: v.unplanned ? "violet" : "info",
          text: `Punched out at ${v.company}`,
          sub: [`Spent ${spentText(v.checkInAt, v.checkOutAt)}`, v.outcomeNotes].filter(Boolean).join(" · "),
        });
      }
    });
    day.stops.forEach((s) => events.push({ at: s.from, icon: <FiClock />, tone: "neutral", text: `Stopped for ${minutesText(s.minutes)}`, sub: `until ${timeLabel(s.to)}` }));
    day.gaps.forEach((g) => events.push({ at: g.from, icon: <FiAlertTriangle />, tone: "danger", text: `No GPS for ${minutesText(g.minutes)}`, sub: "Phone off, location off or app closed" }));
    return events.filter((e) => e.at).sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [day]);

  if (!day) {
    return result.error && result.key === key ? (
      <Card>
        <Empty title="Could not load the day" text={result.error} icon={<FiMapPin />} />
      </Card>
    ) : (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  }
  if (day.shifts.length === 0 && day.visits.length === 0) {
    return (
      <Card>
        <Empty title={`${day.user.name} did not start a shift`} text={`No field day on ${dayTitle(date).toLowerCase()}.`} icon={<FiCalendar />} />
      </Card>
    );
  }

  const s = day.summary;
  const open = day.shifts.some((x) => x.status === "ACTIVE");
  const petrolFoot = saved && petrol.km !== null
    ? "By road · final for the day"
    : !day.home
    ? "Set the home location first"
    : petrol.loading
      ? "Working out the road distance..."
      : petrol.km === null
        ? "No client visit"
        : petrol.source === "straight"
          ? "Straight line - road route unavailable"
          : "Home → clients → home, by road";

  return (
    <>
      <div className="ft-stats">
        <div className="ft-stat main">
          <span className="ft-stat-icon">
            <FiTruck />
          </span>
          <span className="ft-stat-label">Petrol km</span>
          <strong>{petrol.loading ? "..." : petrol.km === null ? "-" : `${petrol.km.toFixed(1)} km`}</strong>
          <small>{petrolFoot}</small>
        </div>
        <div className="ft-stat">
          <span className="ft-stat-icon">
            <FiNavigation />
          </span>
          <span className="ft-stat-label">GPS distance</span>
          <strong>{kmText(s.gpsKm)}</strong>
          <small>
            {s.validPointCount} location point{s.validPointCount === 1 ? "" : "s"}
          </small>
        </div>
        <div className="ft-stat">
          <span className="ft-stat-icon">
            <FiClock />
          </span>
          <span className="ft-stat-label">On duty</span>
          <strong>{minutesText(s.durationMin)}</strong>
          <small>
            {timeLabel(s.firstStart)} - {s.lastEnd && !open ? timeLabel(s.lastEnd) : "now"}
          </small>
        </div>
        <div className="ft-stat">
          <span className="ft-stat-icon">
            <FiMapPin />
          </span>
          <span className="ft-stat-label">Client visits</span>
          <strong>{s.visitCount}</strong>
          <small>{s.unplannedVisitCount ? `${s.unplannedVisitCount} unplanned` : "All planned"}</small>
        </div>
        <div className={`ft-stat${s.gapCount ? " warn" : ""}`}>
          <span className="ft-stat-icon">{s.gapCount ? <FiAlertTriangle /> : <FiCheckCircle />}</span>
          <span className="ft-stat-label">Tracking</span>
          <strong>{s.gapCount ? `${s.gapCount} gap${s.gapCount > 1 ? "s" : ""}` : "Complete"}</strong>
          <small>{s.gapCount ? "Periods with no GPS" : "No GPS gaps"}</small>
        </div>
      </div>

      <div className="ft-day">
        <section className="ft-map">
          <FieldMap day={day} roadPath={road.path} selected={selected} onSelect={setSelected} mapKey={key} />
          <div className="ft-map-legend">
            <span>
              <i className="ft-key line" /> {road.loading ? "Drawing the route..." : road.road ? "Route along roads" : "GPS track"}
            </span>
            <span>
              <i className="ft-key home" /> Home
            </span>
            <span>
              <i className="ft-key visit" /> Client visit
            </span>
            <span className="muted">Click a marker for details</span>
          </div>
        </section>

        <aside className="ft-side">
          <div className="ft-side-scroll">
          <section className="ft-side-section">
            <header className="ft-side-head">
              <h2>Client visits</h2>
              <small>{day.visits.length ? "Select one to see it on the map" : ""}</small>
            </header>
            {day.visits.length === 0 ? (
              <Empty title="No client visits" text="No punch-in at a client on this day." icon={<FiMapPin />} />
            ) : (
              <ol className="ft-visits">
                {day.visits.map((v, i) => {
                  const spent = spentText(v.checkInAt, v.checkOutAt);
                  const near = v.distanceFromLeadM !== null && v.distanceFromLeadM <= NEAR_M;
                  return (
                    <li key={v.meetingId}>
                      <button type="button" className={`ft-visit${selected === v.meetingId ? " on" : ""}`} onClick={() => setSelected(v.meetingId)}>
                        <span className={`ft-num${v.unplanned ? " unplanned" : ""}`}>{i + 1}</span>
                        <span className="ft-visit-main">
                          <strong>{v.company}</strong>
                          <small>
                            {timeLabel(v.checkInAt)} - {v.checkOutAt ? timeLabel(v.checkOutAt) : "on site"}
                            {spent ? ` · ${spent}` : ""}
                          </small>
                          <span className="ft-visit-tags">
                            {v.unplanned && <Badge tone="violet">Unplanned</Badge>}
                            {v.distanceFromLeadM === null ? (
                              <Badge tone="neutral">Location not checked</Badge>
                            ) : near ? (
                              <Badge tone="success">At client</Badge>
                            ) : (
                              <Badge tone="warn">{metersText(v.distanceFromLeadM)} away</Badge>
                            )}
                          </span>
                        </span>
                        <FiChevronRight className="ft-go" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="ft-side-section">
            <header className="ft-side-head">
              <h2>Day log</h2>
              <small>
                {log.length} event{log.length === 1 ? "" : "s"}
              </small>
            </header>
            <ol className="ft-log">
              {log.map((e, i) => (
                <li key={i} className={`tone-${e.tone}`}>
                  <span className="ft-log-time">{timeLabel(e.at)}</span>
                  <span className="ft-log-icon">{e.icon}</span>
                  <span className="ft-log-text">
                    <strong>{e.text}</strong>
                    {!!e.sub && <small>{e.sub}</small>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          </div>
          {day.home && (
            <p className="ft-home-line">
              <FiHome />
              <span>
                <strong>Home</strong> · {day.home.address || "Location set"}
              </span>
              <a href={mapLink({ lat: day.home.latitude, lng: day.home.longitude })} target="_blank" rel="noreferrer">
                Map
              </a>
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------- Home locations
function HomeEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState(row.home?.address || "");
  const [picked, setPicked] = useState(row.home ? { address: row.home.address, latitude: row.home.latitude, longitude: row.home.longitude } : null);
  const [busy, setBusy] = useState(false);
  const changed = picked && (!row.home || picked.latitude !== row.home.latitude || picked.longitude !== row.home.longitude);

  const save = async (close) => {
    if (!picked) return toast("Search the address and pick it from the list.", true);
    setBusy(true);
    try {
      await setFieldHome(row.id, picked);
      toast(`Home location saved for ${row.name}`);
      onSaved();
      close();
    } catch (err) {
      toast(err.message || "Could not save the home location.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${row.home ? "Change" : "Set"} home location`}
      sub={`${row.name} · petrol km is counted from and back to this place`}
      onClose={onClose}
      footer={(close) => (
        <div className="ft-modal-foot">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button busy={busy} onClick={() => save(close)} disabled={!changed}>
            Save home location
          </Button>
        </div>
      )}
    >
      <label className="lm-field wide">
        <span className="lm-label">
          Home address <i>*</i>
        </span>
        <PlacesSearchInput
          value={text}
          onInput={(v) => {
            setText(v);
            setPicked(null);
          }}
          onSelect={(place) => {
            setText(place.address);
            if (place.latitude !== null) setPicked({ address: place.address, latitude: place.latitude, longitude: place.longitude });
          }}
          inputProps={{ className: "lm-input", placeholder: "Search area, street or landmark...", autoFocus: true }}
        />
        <span className="lm-hint">Type at least 3 letters and pick the address from the list.</span>
      </label>
      <div className="ft-preview">
        {picked ? (
          <GoogleMap
            key={`${picked.latitude},${picked.longitude}`}
            mapId={MAP_ID}
            defaultCenter={{ lat: picked.latitude, lng: picked.longitude }}
            defaultZoom={15}
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
            className="ft-preview-map"
          >
            <AdvancedMarker position={{ lat: picked.latitude, lng: picked.longitude }}>
              <div className="ft-pin ft-pin-home">
                <span className="ft-pin-dot">
                  <FiHome />
                </span>
              </div>
            </AdvancedMarker>
          </GoogleMap>
        ) : (
          <div className="ft-preview-empty">
            <FiMapPin />
            <span>The chosen place shows here</span>
          </div>
        )}
      </div>
      {picked && (
        <p className="ft-coords">
          {picked.latitude.toFixed(6)}, {picked.longitude.toFixed(6)}
        </p>
      )}
    </Modal>
  );
}

function HomeLocations() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () =>
    fieldExecutives()
      .then((list) => {
        setRows(list);
        setError("");
      })
      .catch((err) => setError(err.message || "Could not load the sales executives."));
  useEffect(() => {
    load();
  }, []);

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.name}'s home location? Petrol km cannot be worked out without it.`)) return;
    setBusy(row.id);
    try {
      await clearFieldHome(row.id);
      toast("Home location removed");
      await load();
    } catch (err) {
      toast(err.message || "Could not remove the home location.", true);
    } finally {
      setBusy(null);
    }
  };

  const missing = rows ? rows.filter((r) => !r.home).length : 0;
  return (
    <>
      {rows && missing > 0 && (
        <div className="ft-banner">
          <FiAlertTriangle />
          <span>
            <strong>
              {missing} sales executive{missing > 1 ? "s have" : " has"} no home location.
            </strong>{" "}
            Petrol km cannot be worked out for them until it is set.
          </span>
        </div>
      )}
      <Card flush title="Home locations" sub="Where each sales executive starts and ends the day - the base point of petrol km">
        {error ? (
          <Empty title="Could not load the sales executives" text={error} icon={<FiHome />} />
        ) : !rows ? (
          <SkeletonRows rows={4} />
        ) : rows.length === 0 ? (
          <Empty title="No sales executives" text="People with the Sales Executive role in your team appear here." icon={<FiUsers />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table ft-homes">
              <thead>
                <tr>
                  <th>Sales executive</th>
                  <th>Home location</th>
                  <th>Last updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} style={{ "--i": i }}>
                    <td>
                      <span className="ft-who">
                        <Avatar name={row.name} size={34} />
                        <span className="ft-cell">
                          <strong>{row.name}</strong>
                          {!!row.phone && <small>{row.phone}</small>}
                        </span>
                      </span>
                    </td>
                    <td>
                      {row.home ? (
                        <span className="ft-home-cell">
                          <FiHome />
                          <span>{row.home.address || `${row.home.latitude.toFixed(5)}, ${row.home.longitude.toFixed(5)}`}</span>
                          <a href={mapLink({ lat: row.home.latitude, lng: row.home.longitude })} target="_blank" rel="noreferrer" aria-label="Open in Google Maps">
                            <FiExternalLink />
                          </a>
                        </span>
                      ) : (
                        <Badge tone="danger">Not set</Badge>
                      )}
                    </td>
                    <td className="muted">
                      {row.home?.updatedAt ? new Date(row.home.updatedAt.replace(" ", "T")).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                    </td>
                    <td className="ft-actions">
                      <Button size="sm" variant={row.home ? "ghost" : "primary"} onClick={() => setEditing(row)} disabled={busy === row.id}>
                        {row.home ? "Change" : "Set home"}
                      </Button>
                      {row.home && (
                        <Button size="sm" variant="danger" onClick={() => remove(row)} busy={busy === row.id}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <HomeEditor row={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

// ---------------------------------------------------------------------------- page
export default function FieldTracking() {
  const { persona } = useViewer();
  const [params, setParams] = useSearchParams();
  const today = dayKey(new Date());
  const tab = params.get("tab") === "homes" ? "homes" : "day";
  const date = params.get("date") || today;
  const userId = params.get("user");
  const [names, setNames] = useState({});

  // The person's name for the header while their day loads.
  useEffect(() => {
    if (!userId || names[userId]) return;
    fieldExecutives()
      .then((list) => setNames(Object.fromEntries(list.map((e) => [String(e.id), e.name]))))
      .catch(() => {});
  }, [userId, names]);

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  // The view lives in the URL (?tab=homes / ?date= / ?user=) so Back and a shared link both work.
  const update = (next) => {
    const merged = { tab, date, user: userId, ...next };
    const query = {};
    if (merged.tab === "homes") query.tab = "homes";
    if (merged.date && merged.date !== today) query.date = merged.date;
    if (merged.user) query.user = merged.user;
    setParams(query);
  };

  const person = userId ? names[userId] : null;
  return (
    <>
      <div className="lm-head ft-head">
        <div>
          {userId && tab === "day" ? (
            <>
              <button type="button" className="ft-crumb" onClick={() => update({ user: null })}>
                <FiChevronLeft /> All sales executives
              </button>
              <h1 className="ft-person">
                <Avatar name={person || "?"} size={38} /> {person || "Sales executive"}
              </h1>
            </>
          ) : (
            <>
              <h1>Field Tracking</h1>
              <p>Where your sales executives went, the clients they visited and their petrol km.</p>
            </>
          )}
        </div>
        {tab === "day" && <DayPicker date={date} onChange={(d) => update({ date: d })} />}
      </div>

      {!userId && (
        <div className="ft-tabs">
          <Tabs
            tabs={[
              { key: "day", label: "Team day" },
              { key: "homes", label: "Home locations" },
            ]}
            value={tab}
            onChange={(t) => update({ tab: t, user: null })}
          />
        </div>
      )}

      {tab === "homes" ? <HomeLocations /> : userId ? <ExecutiveDay userId={userId} date={date} /> : <TeamDay date={date} onOpen={(id) => update({ user: String(id) })} />}
    </>
  );
}
