// Field Tracking (sales manager / admin): a sales executive's field day, reviewed after it ends.
//   Team day       - every executive on a date: shift times, visits, GPS km. Click one for:
//   Executive day  - map of the GPS route with home / start / end / client markers, petrol km
//                    (home -> each client -> home by road, always from the registered home),
//                    how far each punch was from where it should be, and a timeline.
//   Home locations - admin sets each executive's home (the base point of petrol km).
// Data: backend/src/routes/sales-field-tracking.routes.js (GET /api/field-tracking/...).

import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  FiActivity,
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiHome,
  FiMapPin,
  FiNavigation,
  FiTruck,
} from "react-icons/fi";
import Map from "../../components/maps/Map";
import PlacesSearchInput from "../../components/maps/PlacesSearchInput";
import { LEADS_HOME } from "./access";
import { clearFieldHome, fieldDay, fieldExecutives, fieldTeam, setFieldHome } from "./leadsApi";
import { timeLabel } from "./format";
import { mapLink } from "./places";
import { Avatar, Badge, Button, Card, Empty, Kpi, SkeletonRows, Tabs } from "./ui";
import { useViewer } from "./viewer";
import { useToast } from "./hooks";
import "./fieldTracking.css";

/** A punch / start / end within this distance of where it should be is "at the place". */
const NEAR_M = 300;
const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bengaluru, when the day has no point at all

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (key, by) => {
  const d = new Date(`${key}T00:00`);
  d.setDate(d.getDate() + by);
  return dayKey(d);
};
const minutesText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const metersText = (m) => (m === null || m === undefined ? "-" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const kmText = (km) => (km === null || km === undefined ? "-" : `${Number(km).toFixed(1)} km`);
const toLatLng = (p) => (p ? { lat: Number(p.latitude), lng: Number(p.longitude) } : null);

function haversineM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Petrol km by road. One Google request per executive-day per session (cached).
// Tries the Routes API (what new Maps projects get), then the older Directions service; if
// neither is enabled for the key, falls back to straight-line distance and says so.
// ---------------------------------------------------------------------------
const petrolCache = new globalThis.Map();
const MAX_WAYPOINTS = 23;

async function roadMeters(routesLib, points) {
  const origin = points[0];
  const destination = points[points.length - 1];
  const middle = points.slice(1, -1);
  if (routesLib.Route?.computeRoutes) {
    try {
      const { routes } = await routesLib.Route.computeRoutes({
        origin,
        destination,
        intermediates: middle.map((p) => ({ location: p })),
        travelMode: "DRIVING",
        fields: ["distanceMeters"],
      });
      if (routes?.[0]?.distanceMeters) return routes[0].distanceMeters;
    } catch {
      // fall through to the Directions service
    }
  }
  const result = await new routesLib.DirectionsService().route({
    origin,
    destination,
    waypoints: middle.map((p) => ({ location: p, stopover: true })),
    travelMode: "DRIVING",
  });
  return result.routes[0].legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
}

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
    roadMeters(routesLib, points)
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

// ---------------------------------------------------------------------------

function DayPicker({ date, onChange }) {
  const today = dayKey(new Date());
  const name =
    date === today ? "Today" : date === shiftDay(today, -1) ? "Yesterday" : new Date(`${date}T00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="lm-head-actions">
      <div className="lm-day-pick">
        <button type="button" onClick={() => onChange(shiftDay(date, -1))} aria-label="Previous day">
          <FiChevronLeft />
        </button>
        <label>
          <FiCalendar />
          <span>{name}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Pick a day" />
        </label>
        <button type="button" onClick={() => onChange(shiftDay(date, 1))} disabled={date >= today} aria-label="Next day">
          <FiChevronRight />
        </button>
      </div>
      {date !== today && (
        <button type="button" className="lm-btn ghost" onClick={() => onChange(today)}>
          Today
        </button>
      )}
    </div>
  );
}

const STATUS = {
  ACTIVE: { label: "On shift", tone: "warn" },
  ENDED: { label: "Shift ended", tone: "success" },
  NOT_STARTED: { label: "Not started", tone: "neutral" },
};

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

  return (
    <>
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="On the field" value={started} icon={<FiActivity />} tone="info" foot={`of ${rows.length} sales executives`} />
        <Kpi index={1} label="Client visits" value={visits} icon={<FiMapPin />} tone="violet" foot="Punched in" />
        <Kpi index={2} label="GPS km" value={km} format={(n) => `${n.toFixed(1)}`} icon={<FiNavigation />} tone="teal" foot="All executives" />
      </div>
      <Card flush index={1} title="Sales executives" sub="Click a person to see their route, visits and petrol km">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : result.error ? (
          <Empty title="Could not load the team" text={result.error} icon={<FiMapPin />} />
        ) : rows.length === 0 ? (
          <Empty title="No sales executives" text="People with the Sales Executive role in your team appear here." icon={<FiMapPin />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Sales executive</th>
                  <th>Status</th>
                  <th>Shift</th>
                  <th>Visits</th>
                  <th>GPS km</th>
                  <th>Home</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.user.id} style={{ "--i": i }} onClick={() => onOpen(r.user.id)}>
                    <td>
                      <span className="ft-who">
                        <Avatar name={r.user.name} size={32} /> <strong>{r.user.name}</strong>
                      </span>
                    </td>
                    <td>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </td>
                    <td className="muted">
                      {r.firstStart ? `${timeLabel(r.firstStart)} - ${r.lastEnd ? timeLabel(r.lastEnd) : "now"}` : "-"}
                    </td>
                    <td>
                      {r.visitCount}
                      {r.unplannedVisitCount > 0 && <small className="muted"> ({r.unplannedVisitCount} unplanned)</small>}
                    </td>
                    <td>{r.status === "NOT_STARTED" ? "-" : kmText(r.gpsKm)}</td>
                    <td>{r.hasHome ? <Badge tone="success">Set</Badge> : <Badge tone="danger">Not set</Badge>}</td>
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

/** A distance check: green when within NEAR_M, amber beyond it, grey when it cannot be measured. */
function Check({ meters, missing }) {
  if (meters === null || meters === undefined) return <Badge tone="neutral">{missing}</Badge>;
  return meters <= NEAR_M ? <Badge tone="success">{metersText(meters)} ✓</Badge> : <Badge tone="warn">{metersText(meters)} away</Badge>;
}

function ExecutiveDay({ userId, date, onBack }) {
  const [result, setResult] = useState({ key: null, day: null, error: "" });
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
  const petrol = usePetrolKm(key, day?.petrolRoute);

  const map = useMemo(() => {
    if (!day) return null;
    const path = day.points.filter((p) => p.valid).map(toLatLng);
    const markers = [];
    if (day.home) markers.push({ id: "home", type: "visit", label: "H", timeLabel: "Home", title: day.home.address || "Home", ...toLatLng(day.home) });
    day.shifts.forEach((s, i) => {
      if (s.start) markers.push({ id: `start-${i}`, type: "visit", label: "S", timeLabel: `Start ${timeLabel(s.startedAt)}`, title: "Shift start", ...toLatLng(s.start) });
      if (s.end) markers.push({ id: `end-${i}`, type: "visit", label: "E", timeLabel: `End ${timeLabel(s.endedAt)}`, title: "Shift end", ...toLatLng(s.end) });
    });
    day.visits.forEach((v, i) => {
      const at = v.checkIn || v.leadLocation;
      if (at) markers.push({ id: v.meetingId, type: "visit", label: String(i + 1), timeLabel: `${v.company} ${timeLabel(v.checkInAt)}`, title: v.company, ...toLatLng(at) });
    });
    const center = path[0] || (markers[0] && { lat: markers[0].lat, lng: markers[0].lng }) || DEFAULT_CENTER;
    return { path, markers, center };
  }, [day]);

  const timeline = useMemo(() => {
    if (!day) return [];
    const events = [];
    day.shifts.forEach((s) => {
      events.push({ at: s.startedAt, icon: <FiActivity />, tone: "info", text: "Shift started", sub: s.startFromHomeM !== null ? `${metersText(s.startFromHomeM)} from home` : "" });
      if (s.endedAt) events.push({ at: s.endedAt, icon: <FiCheckCircle />, tone: "success", text: s.status === "AUTO_ENDED" ? "Shift closed by the system (End Shift was not pressed)" : "Shift ended", sub: s.endFromHomeM !== null ? `${metersText(s.endFromHomeM)} from home` : "" });
    });
    day.visits.forEach((v) => {
      events.push({ at: v.checkInAt, icon: <FiMapPin />, tone: "violet", text: `Punched in at ${v.company}${v.unplanned ? " (unplanned)" : ""}`, sub: v.distanceFromLeadM !== null ? `${metersText(v.distanceFromLeadM)} from the lead's location` : "" });
      if (v.checkOutAt) events.push({ at: v.checkOutAt, icon: <FiMapPin />, tone: "violet", text: `Punched out at ${v.company}`, sub: v.outcomeNotes || "" });
    });
    day.stops.forEach((s) => events.push({ at: s.from, icon: <FiClock />, tone: "neutral", text: `Stopped ${minutesText(s.minutes)}`, sub: `until ${timeLabel(s.to)}`, point: { lat: s.latitude, lng: s.longitude } }));
    day.gaps.forEach((g) => events.push({ at: g.from, icon: <FiAlertTriangle />, tone: "danger", text: `No GPS for ${minutesText(g.minutes)}`, sub: "Phone off, location off or app closed" }));
    return events.filter((e) => e.at).sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [day]);

  return (
    <>
      <div className="ft-back">
        <button type="button" className="lm-btn ghost" onClick={onBack}>
          <FiChevronLeft /> All executives
        </button>
        {day && <strong>{day.user.name}</strong>}
      </div>

      {!day ? (
        result.error && result.key === key ? (
          <Card>
            <Empty title="Could not load the day" text={result.error} icon={<FiMapPin />} />
          </Card>
        ) : (
          <Card>
            <SkeletonRows rows={6} />
          </Card>
        )
      ) : day.shifts.length === 0 && day.visits.length === 0 ? (
        <Card>
          <Empty title="No field day on this date" text="The shift was not started on this day." icon={<FiCalendar />} />
        </Card>
      ) : (
        <>
          <div className="lm-grid kpi" key={key}>
            <Kpi
              index={0}
              label="Petrol km"
              value={petrol.km || 0}
              format={(n) => (petrol.loading ? "..." : petrol.km === null ? "-" : `${n.toFixed(1)}`)}
              icon={<FiTruck />}
              tone="info"
              foot={!day.home ? "Home location not set" : petrol.km === null && !petrol.loading ? "No client visits" : petrol.source === "straight" ? "Straight line - road route unavailable" : "Home → clients → home, by road"}
            />
            <Kpi index={1} label="GPS km" value={day.summary.gpsKm} format={(n) => n.toFixed(1)} icon={<FiNavigation />} tone="teal" foot={`${day.summary.validPointCount} of ${day.summary.pointCount} points used`} />
            <Kpi index={2} label="Client visits" value={day.summary.visitCount} icon={<FiMapPin />} tone="violet" foot={`${day.summary.unplannedVisitCount} unplanned`} />
            <Kpi
              index={3}
              label="Shift"
              value={day.summary.durationMin}
              format={(n) => minutesText(Math.round(n))}
              icon={<FiClock />}
              tone={day.summary.gapCount ? "danger" : "success"}
              foot={`${timeLabel(day.summary.firstStart)} - ${day.summary.lastEnd ? timeLabel(day.summary.lastEnd) : "on shift"}${day.summary.gapCount ? ` · ${day.summary.gapCount} GPS gap${day.summary.gapCount > 1 ? "s" : ""}` : ""}`}
            />
          </div>

          <Card flush index={1} title="Route" sub="Blue line = GPS track. H = home, S = shift start, E = shift end, 1, 2, 3 = client punches.">
            <div className="ft-map">
              <Map key={key} center={map.center} zoom={13} markers={map.markers} polyline={map.path} />
            </div>
          </Card>

          <div className="lm-grid two">
            <Card index={2} title="Checks" sub={`Within ${NEAR_M} m counts as at the place`}>
              <table className="lm-table ft-checks">
                <tbody>
                  {day.shifts.map((s, i) => (
                    <tr key={`s${i}`}>
                      <td>Shift start ({timeLabel(s.startedAt)}) vs home</td>
                      <td>
                        <Check meters={s.startFromHomeM} missing={day.home ? "No GPS" : "Home not set"} />
                      </td>
                    </tr>
                  ))}
                  {day.visits.map((v, i) => (
                    <tr key={v.meetingId}>
                      <td>
                        {i + 1}. {v.company} ({timeLabel(v.checkInAt)}){v.unplanned && <small className="muted"> unplanned</small>}
                      </td>
                      <td>
                        <Check meters={v.distanceFromLeadM} missing={v.checkIn ? "Lead has no location" : "No GPS at punch"} />
                      </td>
                    </tr>
                  ))}
                  {day.shifts
                    .filter((s) => s.endedAt)
                    .map((s, i) => (
                      <tr key={`e${i}`}>
                        <td>Shift end ({timeLabel(s.endedAt)}) vs home</td>
                        <td>
                          <Check meters={s.endFromHomeM} missing={day.home ? "No GPS" : "Home not set"} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {day.home && (
                <p className="ft-home">
                  <FiHome /> {day.home.address || "Home"} ·{" "}
                  <a href={mapLink({ lat: day.home.latitude, lng: day.home.longitude })} target="_blank" rel="noreferrer">
                    Map
                  </a>
                </p>
              )}
            </Card>

            <Card index={3} title="Timeline">
              {timeline.length === 0 ? (
                <Empty title="Nothing recorded" icon={<FiClock />} />
              ) : (
                <ol className="ft-timeline">
                  {timeline.map((e, i) => (
                    <li key={i} className={`tone-${e.tone}`}>
                      <span className="ft-tl-time">{timeLabel(e.at)}</span>
                      <span className="ft-tl-icon">{e.icon}</span>
                      <span className="ft-tl-text">
                        <strong>{e.text}</strong>
                        {!!e.sub && <small>{e.sub}</small>}
                        {e.point && (
                          <a href={mapLink(e.point)} target="_blank" rel="noreferrer">
                            Map
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function HomeLocations() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // user id
  const [picked, setPicked] = useState(null); // { address, latitude, longitude }
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

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

  const startEdit = (row) => {
    setEditing(row.id);
    setPicked(null);
    setText(row.home?.address || "");
  };
  const save = async (row) => {
    if (!picked || picked.latitude === null) return toast("Pick the address from the suggestions.", true);
    setBusy(true);
    try {
      await setFieldHome(row.id, picked);
      toast(`Home saved for ${row.name}`);
      setEditing(null);
      await load();
    } catch (err) {
      toast(err.message || "Could not save the home location.", true);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.name}'s home location? Petrol km cannot be worked out without it.`)) return;
    setBusy(true);
    try {
      await clearFieldHome(row.id);
      toast("Home location removed");
      await load();
    } catch (err) {
      toast(err.message || "Could not remove the home location.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card flush title="Home locations" sub="Petrol km is always counted from and back to this place">
      {error ? (
        <Empty title="Could not load the sales executives" text={error} icon={<FiHome />} />
      ) : !rows ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 ? (
        <Empty title="No sales executives" text="People with the Sales Executive role appear here." icon={<FiHome />} />
      ) : (
        <div className="lm-table-wrap">
          <table className="lm-table ft-homes">
            <thead>
              <tr>
                <th>Sales executive</th>
                <th>Home location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} style={{ "--i": i }}>
                  <td>
                    <span className="ft-who">
                      <Avatar name={row.name} size={32} /> <strong>{row.name}</strong>
                    </span>
                  </td>
                  <td>
                    {editing === row.id ? (
                      <div className="ft-home-edit">
                        <PlacesSearchInput
                          value={text}
                          onInput={(v) => {
                            setText(v);
                            setPicked(null);
                          }}
                          onSelect={(place) => {
                            setText(place.address);
                            setPicked({ address: place.address, latitude: place.latitude, longitude: place.longitude });
                          }}
                          inputProps={{ className: "lm-input", placeholder: "Search the home address...", autoFocus: true }}
                        />
                        {picked && (
                          <small className="muted">
                            {picked.latitude.toFixed(6)}, {picked.longitude.toFixed(6)}
                          </small>
                        )}
                      </div>
                    ) : row.home ? (
                      <span className="ft-home-text">
                        {row.home.address || "Location set"}{" "}
                        <a href={mapLink({ lat: row.home.latitude, lng: row.home.longitude })} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          Map
                        </a>
                      </span>
                    ) : (
                      <Badge tone="danger">Not set</Badge>
                    )}
                  </td>
                  <td className="ft-actions">
                    {editing === row.id ? (
                      <>
                        <Button size="sm" busy={busy} onClick={() => save(row)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(row)} disabled={busy}>
                          {row.home ? "Change" : "Set home"}
                        </Button>
                        {row.home && (
                          <Button size="sm" variant="ghost" onClick={() => remove(row)} disabled={busy}>
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function FieldTracking() {
  const { persona } = useViewer();
  const isAdmin = localStorage.getItem("role") === "admin";
  const [params, setParams] = useSearchParams();
  const today = dayKey(new Date());
  const tab = params.get("tab") === "homes" && isAdmin ? "homes" : "day";
  const date = params.get("date") || today;
  const userId = params.get("user");

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

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Field Tracking</h1>
          <p>Where each sales executive went, which clients they visited, and the petrol km for the day.</p>
        </div>
        {tab === "day" && <DayPicker date={date} onChange={(d) => update({ date: d })} />}
      </div>

      {isAdmin && (
        <Tabs
          tabs={[
            { key: "day", label: "Team day" },
            { key: "homes", label: "Home locations" },
          ]}
          value={tab}
          onChange={(t) => update({ tab: t, user: null })}
        />
      )}

      {tab === "homes" ? (
        <HomeLocations />
      ) : userId ? (
        <ExecutiveDay userId={userId} date={date} onBack={() => update({ user: null })} />
      ) : (
        <TeamDay date={date} onOpen={(id) => update({ user: String(id) })} />
      )}
    </>
  );
}
