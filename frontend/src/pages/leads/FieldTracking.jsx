// Field Tracking (sales manager / admin): a sales executive's field day, reviewed after it ends.
//   Team day       - every executive on a date: status, shift, visits, distance. Click one for:
//   Executive day  - the day on a map (route drawn along the roads, like a ride app), the
//                    summary (petrol km, GPS km, time on duty), the petrol breakdown leg by leg,
//                    every client visit with its punch-in / punch-out times and the day's log.
// Petrol km is counted from where the shift was started (no home location): each leg pays its GPS
// km, capped at the direct road km + 25%; the server applies the rules (utils/salesFieldTracking.js)
// and this page only measures the direct road km with Google, once per day.
// Data: backend/src/routes/sales-field-tracking.routes.js (GET /api/field-tracking/...).
// The map is this page's own (not components/maps/WebMap, which the technician map uses).

import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AdvancedMarker, APILoadingStatus, InfoWindow, Map as GoogleMap, useApiLoadingStatus, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  FiActivity,
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiExternalLink,
  FiFlag,
  FiMapPin,
  FiNavigation,
  FiTruck,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { LuBuilding2 } from "react-icons/lu";
import { LEADS_HOME } from "./access";
import { fieldDay, fieldExecutives, fieldTeam, saveFieldRoute } from "./leadsApi";
import { timeLabel } from "./format";
import { Avatar, Badge, Card, Empty, Kpi, SkeletonRows, Tabs } from "./ui";
import { useViewer } from "./viewer";
import "./fieldTracking.css";

/** A punch / start / end within this distance of where it should be is "at the place". */
const NEAR_M = 300;
/** Shift start and shift end closer than this share one marker. */
const SAME_PLACE_M = 80;
/** Route colour per shift on a day with more than one (a single-shift day keeps the dark line). */
const SHIFT_COLORS = ["#2563eb", "#0d9488", "#ea580c", "#db2777"];
const shiftColor = (n) => SHIFT_COLORS[(n - 1) % SHIFT_COLORS.length];
const SINGLE_LINE = "#1F2937";
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
/** A Google request that has not answered by then is treated as failed (shown, not waited on forever). */
const GOOGLE_TIMEOUT_MS = 20000;
const withTimeout = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Google did not answer")), GOOGLE_TIMEOUT_MS))]);
/** Trips all shorter than this need no road route - the straight distance is the distance. */
const SAME_SPOT_M = 50;

/** Google Maps refused to load (key not allowed on this address, billing, network) - nothing will route. */
function useMapsFailed() {
  const status = useApiLoadingStatus();
  return status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE;
}

/**
 * Road route through points: Routes API (new Maps projects) first, then the Directions service.
 * want: "path" (the line along the roads) or "legs" (the road metres between each pair of points).
 */
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
        fields: want === "path" ? ["path"] : ["legs"],
      });
      const r = routes?.[0];
      if (want === "path" && r?.path?.length > 1) return r.path.map(literal);
      if (want === "legs" && r?.legs?.length === points.length - 1) return r.legs.map((leg) => leg.distanceMeters || 0);
    } catch {
      // fall through to the Directions service
    }
  }
  const result = await new routesLib.DirectionsService().route({
    origin,
    destination,
    waypoints: middle.map((p) => ({ location: p, stopover: want === "legs" })),
    travelMode: "DRIVING",
  });
  const r = result.routes[0];
  return want === "path" ? r.overview_path.map(literal) : r.legs.map((leg) => leg.distance?.value || 0);
}

/**
 * The direct road metres of each petrol leg, per shift: for every group [start -> client 1, ...,
 * last client -> start] one list of metres (null for a shift with no visit). Asked from Google once
 * per day (session cache). null while loading; failed when Google could not route (nothing is saved
 * then, so the next view tries again).
 */
function useLegRoadMeters(cacheKey, waypoints) {
  const routesLib = useMapsLibrary("routes");
  const mapsFailed = useMapsFailed();
  const [state, setState] = useState({ key: null, meters: null, failed: false });
  const groups = useMemo(() => (waypoints || []).map((g) => (g ? g.map(toLatLng) : null)), [waypoints]);
  const any = groups.some((g) => g && g.length >= 2);
  const tooMany = groups.some((g) => g && g.length - 2 > MAX_WAYPOINTS);

  useEffect(() => {
    if (!any || tooMany || petrolCache.has(cacheKey) || !routesLib) return undefined;
    let alive = true;
    const done = (value) => {
      petrolCache.set(cacheKey, value);
      if (alive) setState({ key: cacheKey, ...value });
    };
    // Every trip of a group within a few metres (a client next door, or a phone that never moved):
    // nothing to route - Google is not asked, the straight distance is used.
    const measure = (points) => {
      const straight = points.slice(1).map((p, i) => Math.round(haversineM(points.at(i), p)));
      return straight.every((m) => m < SAME_SPOT_M) ? Promise.resolve(straight) : routeThrough(routesLib, points, "legs");
    };
    withTimeout(Promise.all(groups.map((g) => (g ? measure(g) : Promise.resolve(null)))))
      .then((meters) => done({ meters, failed: false }))
      .catch(() => done({ meters: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [cacheKey, groups, any, routesLib, tooMany]);

  if (!any) return { meters: null, loading: false, failed: false };
  if (tooMany || mapsFailed) return { meters: null, loading: false, failed: true };
  const cached = petrolCache.get(cacheKey) || (state.key === cacheKey ? state : null);
  if (!cached) return { meters: null, loading: true, failed: false };
  return { meters: cached.meters, loading: false, failed: cached.failed };
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
/** One GPS track drawn along the roads (snapped, else routed in chunks); throws when Google cannot. */
async function roadLine(routesLib, gpsPath, keep) {
  const points = thin(gpsPath);
  // a shift that never moved (every fix within a few metres) has no route to draw - Google refuses
  // a route from a spot to the same spot
  if (points.length < 2 || points.every((q) => haversineM(points[0], q) < SAME_SPOT_M)) return gpsPath;
  const chunks = [];
  for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS + 1) chunks.push(points.slice(i, i + MAX_WAYPOINTS + 2));
  let line = null;
  try {
    line = await withTimeout(snappedRoadPath(routesLib, gpsPath));
  } catch {
    line = null; // Roads API unavailable - use the waypoint route below
  }
  if (!line) line = (await withTimeout(Promise.all(chunks.map((c) => routeThrough(routesLib, c, "path"))))).flat();
  return removeSpurs(line, keep);
}

/**
 * The route line of each shift (`gpsPaths`: one GPS track per shift), drawn along the roads. Shifts
 * are drawn separately - never joined across the off-duty break between them. Falls back to the
 * plain GPS tracks when Google cannot draw them.
 */
function useRoadPaths(cacheKey, gpsPaths, keep) {
  const routesLib = useMapsLibrary("routes");
  const mapsFailed = useMapsFailed();
  const [state, setState] = useState({ key: null, paths: null });
  const moving = gpsPaths.some((g) => thin(g).length >= 2);

  useEffect(() => {
    if (!moving || roadPathCache.has(cacheKey) || !routesLib) return undefined;
    let alive = true;
    (async () => {
      // each shift on its own: one Google cannot draw keeps its GPS track, the others still get theirs
      const lines = await Promise.all(
        gpsPaths.map((g) =>
          roadLine(routesLib, g, keep)
            .then((path) => ({ path, ok: true }))
            .catch(() => ({ path: g, ok: false })),
        ),
      );
      // saved (as the day's road line) only when every shift was drawn - otherwise the next view tries again
      const value = { paths: lines.map((l) => l.path), road: lines.every((l) => l.ok) };
      roadPathCache.set(cacheKey, value);
      if (alive) setState({ key: cacheKey, ...value });
    })();
    return () => {
      alive = false;
    };
  }, [cacheKey, moving, routesLib, gpsPaths, keep]);

  if (!moving || mapsFailed) return { paths: gpsPaths, road: false, loading: false };
  const cached = roadPathCache.get(cacheKey) || (state.key === cacheKey ? state : null);
  return cached ? { paths: cached.paths, road: cached.road, loading: false } : { paths: gpsPaths, road: false, loading: true };
}

/** A saved road line: a JSON list of encoded polylines (one per shift), or one polyline (older saves). */
function decodeRoadPaths(text) {
  if (!text) return null;
  try {
    if (text.startsWith("[")) return JSON.parse(text).map((t) => (t ? decodePolyline(t) : []));
  } catch {
    return null;
  }
  return [decodePolyline(text)];
}

// ---------------------------------------------------------------------------- map
/** One route line with a white casing, like a ride app. */
function RouteLine({ path, color = SINGLE_LINE }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !path || path.length < 2) return undefined;
    const casing = new window.google.maps.Polyline({ path, strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: 9, zIndex: 1 });
    const line = new window.google.maps.Polyline({ path, strokeColor: color, strokeOpacity: 1, strokeWeight: 5, zIndex: 2 });
    casing.setMap(map);
    line.setMap(map);
    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, path, color]);
  return null;
}

/** The off-duty move between two shifts: a thin grey dashed line - shown, not counted. */
function BreakLine({ from, to }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return undefined;
    const line = new window.google.maps.Polyline({
      path: [from, to],
      strokeOpacity: 0,
      zIndex: 0,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeColor: "#9ca3af", scale: 3 }, offset: "0", repeat: "14px" }],
    });
    line.setMap(map);
    return () => line.setMap(null);
  }, [map, from, to]);
  return null;
}

/** Fits the map to `points` whenever `fitKey` changes (a new day opened, or a shift picked). */
function FitTo({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points?.length) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 70);
    // Only when the key changes, not on every re-render.
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

const PIN_ICONS = { start: FiUser, end: FiFlag, visit: LuBuilding2 };

/**
 * A small round icon pin - no card on the map, so the route stays visible: the person where a shift
 * started, a building at each client (with its visit number), a flag where a shift ended. The name
 * and time show on hover; a click opens the details. The selected pin grows and pulses.
 */
function PlaceMarker({ place, on, onClick }) {
  const Icon = PIN_ICONS[place.kind] || FiUser;
  return (
    <AdvancedMarker position={place.point} onClick={onClick} zIndex={on ? 50 : place.kind === "visit" ? 30 : 20} title={place.lines.join(" · ")}>
      <div
        className={`ft-pin ft-pin-${place.kind}${place.unplanned ? " unplanned" : ""}${place.color ? " tinted" : ""}${place.aside ? " aside" : ""}${on ? " on" : ""}`}
        style={place.color ? { "--pin": place.color } : undefined}
      >
        <span className="ft-pin-tip">
          {place.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </span>
        <span className="ft-pin-dot">
          <Icon />
          {!!place.badge && <span className="ft-pin-badge">{place.badge}</span>}
        </span>
      </div>
    </AdvancedMarker>
  );
}

/** Shift start / end merged into one marker when they are at the same place ("S1 / S2" with more shifts). */
function endPlaces(day) {
  const raw = [];
  const tag = (i) => (day.shifts.length > 1 ? `S${i + 1} ` : "");
  day.shifts.forEach((s, i) => {
    if (s.start) raw.push({ id: `start-${i}`, what: `${tag(i)}Start ${timeLabel(s.startedAt)}`, point: toLatLng(s.start), shift: s, n: i + 1, role: "start" });
    if (s.end) raw.push({ id: `end-${i}`, what: `${tag(i)}End ${timeLabel(s.endedAt)}`, point: toLatLng(s.end), shift: s, n: i + 1, role: "end" });
  });
  const groups = [];
  raw.forEach((r) => {
    const g = groups.find((x) => haversineM(x.point, r.point) <= SAME_PLACE_M);
    if (g) g.items.push(r);
    else groups.push({ point: r.point, items: [r] });
  });
  return groups.map((g, i) => {
    const hasEnd = g.items.some((x) => x.role === "end");
    const hasStart = g.items.some((x) => x.role === "start");
    return {
      id: `place-${i}`,
      kind: hasEnd && !hasStart ? "end" : "start",
      point: g.point,
      // several starts / ends at one spot: how many; a lone one on a multi-shift day: its shift
      badge: g.items.length > 1 ? String(g.items.length) : day.shifts.length > 1 ? `S${g.items[0].n}` : null,
      title: hasStart ? "Shift start" : "Shift end",
      lines: [g.items.map((x) => x.what).join(" · ")],
      items: g.items,
    };
  });
}

/** Where each shift ended and the next one started, when they are apart (the off-duty move). */
function breaks(day, paths) {
  const out = [];
  for (let i = 1; i < day.shifts.length; i += 1) {
    const prev = day.shifts.at(i - 1);
    const from = toLatLng(prev.end) || paths.at(i - 1)?.at(-1) || toLatLng(prev.start);
    const to = toLatLng(day.shifts.at(i).start);
    if (from && to && haversineM(from, to) > SAME_PLACE_M) {
      out.push({ id: `break-${i}`, from, to, mid: { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 } });
    }
  }
  return out;
}

function FieldMap({ day, roadPaths, selected, onSelect, mapKey, focus }) {
  const multi = day.shifts.length > 1;
  const places = useMemo(() => endPlaces(day), [day]);
  const gaps = useMemo(() => (multi ? breaks(day, roadPaths) : []), [multi, day, roadPaths]);
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
          // more than one shift: each visit in its shift's colour
          color: multi ? shiftColor(v.shift) : null,
          visit: v,
        })),
    [day, multi],
  );
  const fitTo = useMemo(
    () => [...roadPaths.flat(), ...places.map((p) => p.point), ...visits.map((v) => v.point)],
    [roadPaths, places, visits],
  );
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
      {roadPaths.map((path, i) => (
        <RouteLine key={i} path={path} color={multi ? shiftColor(i + 1) : SINGLE_LINE} />
      ))}
      {gaps.map((g) => (
        <BreakLine key={g.id} from={g.from} to={g.to} />
      ))}
      {gaps.map((g) => (
        <AdvancedMarker key={`${g.id}-label`} position={g.mid} zIndex={10}>
          <span className="ft-break-label">Break · not counted</span>
        </AdvancedMarker>
      ))}
      <FitTo points={focus ? focus.points : fitTo} fitKey={focus ? `${mapKey}|${focus.key}` : mapKey} />
      <PanTo point={chosen?.point} />
      {places.map((p) => (
        // a start / end at a client's spot is set a little aside, so neither pin hides the other
        <PlaceMarker
          key={p.id}
          place={{ ...p, aside: visits.some((v) => haversineM(v.point, p.point) <= SAME_PLACE_M) }}
          on={p.id === selected}
          onClick={() => onSelect(p.id)}
        />
      ))}
      {visits.map((p) => (
        <PlaceMarker key={p.id} place={p} on={p.id === selected} onClick={() => onSelect(p.id)} />
      ))}
      {chosen && (
        <InfoWindow position={chosen.point} pixelOffset={[0, -40]} onCloseClick={() => onSelect(null)} headerContent={<strong className="ft-iw-title">{chosen.title}</strong>}>
          {chosen.visit ? <VisitDetails v={chosen.visit} compact /> : <PlaceDetails place={chosen} />}
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

function PlaceDetails({ place }) {
  return (
    <div className="ft-iw">
      {place.items.map((x) => (
        <div key={x.id} className="ft-iw-row">
          <span>{x.role === "start" ? "Shift start" : "Shift end"}</span>
          <strong>{timeLabel(x.role === "start" ? x.shift.startedAt : x.shift.endedAt)}</strong>
        </div>
      ))}
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
  const petrolKm = rows.reduce((s, r) => s + (r.petrolKm || 0), 0);
  const flagged = rows.reduce((s, r) => s + (r.flaggedLegCount || 0), 0);

  return (
    <>
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="On the field" value={started} icon={<FiUsers />} tone="info" foot={`of ${rows.length} sales executive${rows.length === 1 ? "" : "s"}`} />
        <Kpi index={1} label="Client visits" value={visits} icon={<FiMapPin />} tone="violet" foot="Punched in today" />
        <Kpi index={2} label="Distance" value={km} format={(n) => `${n.toFixed(1)} km`} icon={<FiNavigation />} tone="teal" foot="GPS, all executives" />
        <Kpi index={3} label="Petrol km" value={petrolKm} format={(n) => `${n.toFixed(1)} km`} icon={<FiTruck />} tone={flagged ? "danger" : "success"} foot={flagged ? `${flagged} trip${flagged === 1 ? "" : "s"} to check` : "Paid km, all executives"} />
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
                  <th>Check</th>
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
                        <span className="muted" title="Worked out the first time the day is opened">
                          {r.status === "ACTIVE" ? "After the day ends" : r.status === "ENDED" && r.visitCount ? "Open to work out" : "-"}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.flaggedLegCount > 0 ? (
                        <Badge tone="warn">
                          {r.flaggedLegCount} trip{r.flaggedLegCount === 1 ? "" : "s"}
                        </Badge>
                      ) : r.petrolKm !== null && r.petrolKm !== undefined ? (
                        <Badge tone="success">OK</Badge>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
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
  // One GPS track per shift - never joined across the break between shifts.
  const gpsPaths = useMemo(() => {
    if (!day) return [];
    return day.shifts.map((s) => {
      const valid = day.points.filter((p) => p.valid && p.shiftId === s.id);
      const accurate = valid.filter((p) => p.accuracy === null || p.accuracy <= LINE_ACCURACY_M);
      return (accurate.length >= 2 ? accurate : valid).map(toLatLng);
    });
  }, [day]);
  const [focus, setFocus] = useState(null);
  const [view, setView] = useState("map");
  // a break line is drawn only where a shift ended and the next started in different places
  const hasBreak = useMemo(() => (day ? breaks(day, []).length > 0 : false), [day]);
  const clientPoints = useMemo(() => (day ? day.visits.map((v) => toLatLng(v.checkIn || v.leadLocation)).filter(Boolean) : []), [day]);

  // A closed day already worked out is read from the server - no Google request. Otherwise Google is
  // asked here for the direct road km of each petrol leg; the server applies the petrol rules and,
  // for a closed day, saves the result for everyone.
  const saved = day?.savedRoute || null;
  const savedPaths = useMemo(() => decodeRoadPaths(saved?.roadPath), [saved]);
  const waypoints = day?.petrol?.waypoints || null;
  const legRoad = useLegRoadMeters(key, waypoints);
  // a saved road line is reused; a day saved without one (Google could not draw it) tries again
  const liveRoad = useRoadPaths(key, savedPaths ? NO_POINTS : gpsPaths, clientPoints);
  const road = savedPaths
    ? { paths: savedPaths && savedPaths.length === gpsPaths.length ? savedPaths : gpsPaths, road: !!savedPaths, loading: false }
    : liveRoad;
  const [worked, setWorked] = useState({ key: null, petrol: null });
  const petrol = (worked.key === key && worked.petrol) || day?.petrol || null;

  useEffect(() => {
    if (!day || savedDays.has(key)) return;
    const needLegs = !!waypoints;
    const needPath = day.closed && !savedPaths;
    if (!needLegs && !needPath) return;
    if (needLegs && (legRoad.loading || !legRoad.meters)) return;
    // Petrol never waits on the map line: once the line is worked out (or there is none - the
    // phone did not move, or Google could not draw it) the day is sent; without a road line the map
    // keeps the GPS track.
    if (needPath && liveRoad.loading) return;
    savedDays.add(key);
    saveFieldRoute(userId, date, {
      fingerprint: day.fingerprint,
      legRoadMeters: needLegs ? legRoad.meters : null,
      roadPath: needPath && liveRoad.road ? JSON.stringify(liveRoad.paths.map((p) => (p.length >= 2 ? encodePolyline(p) : null))) : null,
    })
      .then((r) => setWorked({ key, petrol: r.petrol }))
      .catch(() => savedDays.delete(key));
  }, [day, savedPaths, key, userId, date, waypoints, legRoad, liveRoad]);

  const log = useMemo(() => {
    if (!day) return [];
    const events = [];
    day.shifts.forEach((s) => {
      events.push({ at: s.startedAt, icon: <FiActivity />, tone: "info", text: "Shift started", sub: "" });
      if (s.endedAt) {
        events.push({
          at: s.endedAt,
          icon: <FiCheckCircle />,
          tone: "success",
          text: s.status === "AUTO_ENDED" ? "Shift closed by the system" : "Shift ended",
          sub: s.status === "AUTO_ENDED" ? "End Shift was not pressed" : "",
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
  const working = !!waypoints && petrol?.km === null && !legRoad.failed;
  const petrolFoot = !petrol || petrol.legs.length === 0
    ? "No client visit"
    : working
      ? "Working out the road distance..."
      : legRoad.failed && petrol.km === null
        ? "Google Maps did not load - road distance unavailable"
        : open
          ? "So far · the return counts after End Shift"
          : petrol.final
            ? "Start → clients → return · final for the day"
            : "Start → clients → return";

  return (
    <>
      <div className="ft-stats">
        <div className="ft-stat main">
          <span className="ft-stat-icon">
            <FiTruck />
          </span>
          <span className="ft-stat-label">Petrol km</span>
          <strong>{working ? "..." : petrol?.km === null || petrol?.km === undefined ? "-" : `${petrol.km.toFixed(1)} km`}</strong>
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

      <div className="ft-day-tabs">
        <Tabs
          tabs={[
            { key: "map", label: "Map & visits", count: day.visits.length },
            { key: "petrol", label: "Petrol breakdown", count: petrol?.legs.length || 0 },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "petrol" &&
        (petrol && petrol.legs.length > 0 ? (
          <PetrolLegs
            petrol={petrol}
            working={working}
            failed={legRoad.failed}
            onShift={(n) => {
              // show that shift on the map
              setFocus({ key: `${n}-${Date.now()}`, points: (road.paths.at(n - 1) || []).concat(day.visits.filter((v) => v.shift === n).map((v) => toLatLng(v.checkIn || v.leadLocation)).filter(Boolean)) });
              setView("map");
            }}
          />
        ) : (
          <Card>
            <Empty title="No petrol for this day" text="Petrol is counted for trips to clients - there was no client visit." icon={<FiTruck />} />
          </Card>
        ))}

      {view === "map" && (
      <div className="ft-day">
        <section className="ft-map">
          <FieldMap day={day} roadPaths={road.paths} selected={selected} onSelect={setSelected} mapKey={key} focus={focus} />
          <div className="ft-map-legend">
            {day.shifts.length > 1 ? (
              <>
                {day.shifts.map((sh, i) => (
                  <span key={sh.id}>
                    <i className="ft-key line" style={{ background: shiftColor(i + 1) }} /> Shift {i + 1} ({timeLabel(sh.startedAt)} - {sh.endedAt ? timeLabel(sh.endedAt) : "now"})
                  </span>
                ))}
                {hasBreak && (
                  <span>
                    <i className="ft-key break" /> Break · not counted
                  </span>
                )}
              </>
            ) : (
              <span>
                <i className="ft-key line" /> {road.loading ? "Drawing the route..." : road.road ? "Route along roads" : "GPS track"}
              </span>
            )}
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
        </aside>
      </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------- Petrol breakdown
const LEG_STATUS = {
  OK: { tone: "success", label: "OK", note: "Paid as travelled" },
  CAPPED: { tone: "warn", label: "Over the limit", note: "Paid up to the limit only" },
  NO_GPS: { tone: "warn", label: "No GPS", note: "Paid the direct road distance" },
  PENDING: { tone: "neutral", label: "Working out", note: "" },
  OPEN: { tone: "info", label: "After End Shift", note: "Counted when the shift ends" },
};
const NOT_MEASURED = { tone: "warn", label: "Not measured", note: "Google Maps did not load" };
const legKm = (n) => (n === null || n === undefined ? "-" : `${n.toFixed(1)} km`);

/**
 * Petrol leg by leg: what the GPS shows was travelled, the direct road km between the two places,
 * the most that is paid (road km + allowance) and what is paid. Worked out on the server.
 */
function PetrolLegs({ petrol, working, failed, onShift }) {
  const multi = (petrol.shifts || []).length > 1;
  const flagged = petrol.legs.filter((l) => l.status === "CAPPED" || l.status === "NO_GPS").length;
  return (
    <Card
      flush
      title="Petrol breakdown"
      sub={`Each trip pays what the GPS shows, up to the direct road distance + ${petrol.allowancePercent}%. After the last client, only up to the way back to the start point.`}
      className="ft-legs-card"
    >
      <div className="lm-table-wrap">
        <table className="lm-table ft-legs">
          <thead>
            <tr>
              <th>Trip</th>
              <th className="num">GPS travelled</th>
              <th className="num">Direct road</th>
              <th className="num">Limit</th>
              <th className="num">Paid</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {petrol.legs.map((l, i) => {
              const sh = multi && (i === 0 || petrol.legs.at(i - 1).shift !== l.shift) ? petrol.shifts.at(l.shift - 1) : null;
              const head = sh && (
                <tr key={`shift-${l.shift}`} className="ft-shift-row" onClick={() => onShift?.(l.shift)} title="Show this shift on the map">
                  <td colSpan={6}>
                    <span className="ft-shift-head">
                      <i style={{ background: shiftColor(l.shift) }} />
                      <strong>Shift {l.shift}</strong>
                      <small>
                        {timeLabel(sh.startedAt)} - {sh.endedAt ? timeLabel(sh.endedAt) : "now"} · {sh.km === null ? "working out" : legKm(sh.km)} · show on map
                      </small>
                    </span>
                  </td>
                </tr>
              );
              // Google could not be reached: the trip is not measured (nothing is saved; the next view tries again).
              const st = l.status === "PENDING" && failed ? NOT_MEASURED : LEG_STATUS[l.status] || LEG_STATUS.PENDING;
              return (
                <Fragment key={i}>
                {head}
                <tr className={l.kind === "RETURN" ? "ft-leg-return" : undefined}>
                  <td>
                    <span className="ft-cell">
                      <strong>
                        {l.kind === "RETURN" ? "Return: " : ""}
                        {l.from} → {l.to}
                      </strong>
                      <small>
                        {l.fromAt ? timeLabel(l.fromAt) : ""}
                        {l.toAt ? ` - ${timeLabel(l.toAt)}` : ""}
                        {l.kind === "RETURN" ? " · limit = way back to the shift's start point" : ""}
                      </small>
                    </span>
                  </td>
                  <td className="num">{l.status === "OPEN" ? "-" : legKm(l.gpsKm)}</td>
                  <td className="num">{working && l.roadKm === null ? "..." : legKm(l.roadKm)}</td>
                  <td className="num muted">{legKm(l.maxKm)}</td>
                  <td className="num">
                    <strong>{legKm(l.paidKm)}</strong>
                  </td>
                  <td>
                    <span className="ft-cell">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {!!st.note && st !== LEG_STATUS.OK && <small>{st.note}</small>}
                    </span>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <strong>Petrol for the day</strong>
                {flagged > 0 && <small className="ft-legs-flag"> · {flagged} trip{flagged === 1 ? "" : "s"} to check</small>}
              </td>
              <td className="num">{legKm(petrol.legs.reduce((s, l) => s + (l.gpsKm || 0), 0))}</td>
              <td className="num" />
              <td className="num" />
              <td className="num">
                <strong>{legKm(petrol.km)}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- page
export default function FieldTracking() {
  const { persona } = useViewer();
  const [params, setParams] = useSearchParams();
  const today = dayKey(new Date());
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

  // The view lives in the URL (?date= / ?user=) so Back and a shared link both work.
  const update = (next) => {
    const merged = { date, user: userId, ...next };
    const query = {};
    if (merged.date && merged.date !== today) query.date = merged.date;
    if (merged.user) query.user = merged.user;
    setParams(query);
  };

  const person = userId ? names[userId] : null;
  return (
    <>
      <div className="lm-head ft-head">
        <div>
          {userId ? (
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
        <DayPicker date={date} onChange={(d) => update({ date: d })} />
      </div>

      {userId ? <ExecutiveDay userId={userId} date={date} /> : <TeamDay date={date} onOpen={(id) => update({ user: String(id) })} />}
    </>
  );
}
