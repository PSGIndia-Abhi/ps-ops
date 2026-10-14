// Team Visits (sales manager): one day's visits by the team - who went where, whether each
// visit was started on time, where it started and ended (place and Map button), how long it
// took and the outcome. GET /api/crm/team-visits?date=, the same view as the Android app.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiExternalLink,
  FiMapPin,
  FiMaximize2,
  FiMinimize2,
  FiPlayCircle,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { teamVisits } from "./leadsApi";
import { timeLabel } from "./format";
import { Avatar, Badge, Card, Empty, Kpi, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";
import { mapLink, placeOf } from "./places";

/** Started within this many minutes of the planned time counts as on time (the Android app's rule). */
const ON_TIME_GRACE_MIN = 15;

const STATE = {
  done: { label: "Completed", tone: "success" },
  progress: { label: "In progress", tone: "warn" },
  missed: { label: "Not started", tone: "danger" },
  upcoming: { label: "Upcoming", tone: "info" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const FILTERS = [
  { key: "all", label: "All" },
  { key: "done", label: "Completed" },
  { key: "progress", label: "In progress" },
  { key: "missed", label: "Not started" },
  { key: "upcoming", label: "Upcoming" },
];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (key, by) => {
  const d = new Date(`${key}T00:00`);
  d.setDate(d.getDate() + by);
  return dayKey(d);
};
const minutes = (from, to) => Math.round((new Date(to) - new Date(from)) / 60000);
const minutesText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

function stateOf(v, now) {
  if (v.status === "CANCELLED") return "cancelled";
  if (v.status === "COMPLETED" || v.endedAt) return "done";
  if (v.startedAt) return "progress";
  return new Date(v.scheduledAt) < now ? "missed" : "upcoming";
}
/** Minutes after the planned time the visit was started (negative = early), or null. */
const lateBy = (v) => (v.startedAt ? minutes(v.scheduledAt, v.startedAt) : null);
/** How long the visit took, when it was both started and ended. */
const lengthOf = (v) => {
  if (!v.startedAt || !v.endedAt) return null;
  const m = minutes(v.startedAt, v.endedAt);
  return m > 0 ? m : null;
};

function Pill({ tone, children }) {
  return <span className={`lm-pill tone-${tone}`}>{children}</span>;
}

/** One end of a visit (its start or its end): the time, the place, its latitude / longitude and a Map link. */
function VisitEnd({ label, at, point, tone, missing }) {
  const [place, setPlace] = useState({ key: "", text: null });
  const key = point ? `${point.lat},${point.lng}` : "";
  useEffect(() => {
    if (!point) return undefined;
    let alive = true;
    placeOf(point).then((text) => alive && setPlace({ key: `${point.lat},${point.lng}`, text }));
    return () => {
      alive = false;
    };
  }, [point]);
  const looking = !!point && place.key !== key;

  return (
    <div className={`lm-tv-end tone-${tone}${at ? "" : " empty"}`}>
      <span className="lm-tv-end-label">
        <FiMapPin /> {label}
      </span>
      <strong className="lm-tv-end-time">{at ? timeLabel(at) : missing}</strong>
      {at &&
        (point ? (
          <>
            <span className="lm-tv-end-place">{looking ? "Finding the place..." : place.text || "Place name not found"}</span>
            <span className="lm-tv-coords">
              <span>
                Lat <b>{point.lat.toFixed(6)}</b>
              </span>
              <span>
                Lng <b>{point.lng.toFixed(6)}</b>
              </span>
            </span>
            <a className="lm-btn ghost sm lm-tv-map" href={mapLink(point)} target="_blank" rel="noreferrer">
              <FiExternalLink /> Map
            </a>
          </>
        ) : (
          <span className="lm-tv-end-place muted">No location recorded</span>
        ))}
    </div>
  );
}

export default function TeamVisits() {
  const { persona } = useViewer();
  const today = dayKey(new Date());
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState("all");
  // Narrowing the day's list: free text (company, lead number, address), one sales person, one visit type.
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("");
  const [type, setType] = useState("");
  // Every person's section starts open and every visit as one line; these hold the exceptions.
  const [closedPeople, setClosedPeople] = useState(() => new Set());
  const [openVisits, setOpenVisits] = useState(() => new Set());
  const [result, setResult] = useState({ date: null, rows: null, error: "" });

  useEffect(() => {
    if (persona !== "sales_manager") return undefined;
    let alive = true;
    teamVisits(date)
      .then((rows) => alive && setResult({ date, rows, error: "" }))
      .catch((err) => alive && setResult({ date, rows: [], error: err.message || "Could not load the team's visits." }));
    // Visits start and end through the day; read them again every minute.
    const timer = setInterval(() => teamVisits(date).then((rows) => alive && setResult({ date, rows, error: "" })).catch(() => {}), 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [date, persona]);

  const loading = result.date !== date;
  const rows = useMemo(() => (loading ? [] : result.rows || []), [loading, result.rows]);
  const now = new Date();
  const withState = rows.map((v) => ({ ...v, state: stateOf(v, now) }));
  const count = (key) => withState.filter((v) => v.state === key).length;

  const started = rows.filter((v) => v.startedAt);
  const onTime = started.filter((v) => lateBy(v) <= ON_TIME_GRACE_MIN).length;
  const lengths = rows.map(lengthOf).filter((m) => m !== null);
  const avgLength = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null;

  // Everyone with a visit on this day, for the Sales person filter.
  const team = [...new Map(withState.map((v) => [String(v.salesId), v.salesName || "Sales person"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const q = search.trim().toLowerCase();
  const shown = withState
    .filter((v) => filter === "all" || v.state === filter)
    .filter((v) => !person || String(v.salesId) === person)
    .filter((v) => !type || v.type === type)
    .filter((v) => !q || [v.company, v.leadNumber, v.address].some((x) => String(x || "").toLowerCase().includes(q)));
  const narrowed = filter !== "all" || !!person || !!type || !!q;

  // Grouped by sales person, in the order their first visit of the day comes.
  const groups = new Map();
  shown.forEach((v) => {
    if (!groups.has(v.salesId)) groups.set(v.salesId, { id: String(v.salesId), name: v.salesName || "Sales person", visits: [] });
    groups.get(v.salesId).visits.push(v);
  });
  const people = [...groups.values()];

  const toggle = (set, id) =>
    set((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => {
    setClosedPeople(new Set());
    setOpenVisits(new Set(shown.map((v) => v.id)));
  };
  const collapseAll = () => {
    setClosedPeople(new Set(people.map((p) => p.id)));
    setOpenVisits(new Set());
  };
  const clearFilters = () => {
    setFilter("all");
    setSearch("");
    setPerson("");
    setType("");
  };

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  // A new day starts with everything open again and no visit expanded.
  const changeDay = (next) => {
    setDate(next);
    setClosedPeople(new Set());
    setOpenVisits(new Set());
  };

  const dayName = date === today ? "Today" : date === shiftDay(today, -1) ? "Yesterday" : date === shiftDay(today, 1) ? "Tomorrow" : new Date(`${date}T00:00`).toLocaleDateString("en-IN", { weekday: "long" });

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Team Visits</h1>
          <p>Where your team went, when each visit started and ended, and how it went.</p>
        </div>
        <div className="lm-head-actions">
          <div className="lm-day-pick">
            <button type="button" onClick={() => changeDay(shiftDay(date, -1))} aria-label="Previous day">
              <FiChevronLeft />
            </button>
            <label>
              <FiCalendar />
              <span>{dayName}</span>
              <input type="date" value={date} onChange={(e) => e.target.value && changeDay(e.target.value)} aria-label="Pick a day" />
            </label>
            <button type="button" onClick={() => changeDay(shiftDay(date, 1))} aria-label="Next day">
              <FiChevronRight />
            </button>
          </div>
          {date !== today && (
            <button type="button" className="lm-btn ghost" onClick={() => changeDay(today)}>
              Today
            </button>
          )}
        </div>
      </div>

      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="Visits" value={rows.length} icon={<FiMapPin />} tone="info" foot={dayName} />
        <Kpi index={1} label="Completed" value={count("done")} icon={<FiCheckCircle />} tone="success" foot={`${count("progress")} in progress`} />
        <Kpi index={2} label="Not Started" value={count("missed")} icon={<FiAlertCircle />} tone="danger" foot="Planned time has passed" />
        {/* The tile counts up a number; `format` writes it as a percentage or a duration, or a dash when there is none. */}
        <Kpi index={3} label="On Time" value={started.length ? (onTime / started.length) * 100 : 0} format={(n) => (started.length ? `${Math.round(n)}%` : "-")} icon={<FiPlayCircle />} tone="violet" foot={`Started within ${ON_TIME_GRACE_MIN} min`} />
        <Kpi index={4} label="Avg Visit" value={avgLength || 0} format={(n) => (avgLength === null ? "-" : minutesText(Math.round(n)))} icon={<FiClock />} tone="teal" foot="Start to end" />
      </div>

      <Card flush index={2}>
        <div className="lm-tv-tools">
          <label className="lm-search">
            <FiSearch />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, lead no. or address..." aria-label="Search visits" />
          </label>
          <select className="lm-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by sales person">
            <option value="">All sales people</option>
            {team.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="lm-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by visit type">
            <option value="">All types</option>
            <option value="SITE_VISIT">Site visit</option>
            <option value="MEETING">Office meeting</option>
          </select>
          <div className="lm-tv-tools-end">
            {narrowed && (
              <button type="button" className="lm-tv-link" onClick={clearFilters}>
                <FiX /> Clear filters
              </button>
            )}
            <button type="button" className="lm-tv-link" onClick={expandAll} disabled={!people.length}>
              <FiMaximize2 /> Expand all
            </button>
            <button type="button" className="lm-tv-link" onClick={collapseAll} disabled={!people.length}>
              <FiMinimize2 /> Collapse all
            </button>
          </div>
        </div>
        <div className="lm-tv-status">
          <div className="lm-seg">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
                {f.label} <span className="lm-tv-count">{f.key === "all" ? rows.length : count(f.key)}</span>
              </button>
            ))}
          </div>
          {!loading && narrowed && (
            <small className="muted">
              Showing {shown.length} of {rows.length} visit{rows.length === 1 ? "" : "s"}
            </small>
          )}
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : result.error ? (
          <Empty title="Could not load the visits" text={result.error} icon={<FiMapPin />} />
        ) : people.length === 0 ? (
          <Empty
            title={rows.length === 0 ? "No visits on this day" : "No visits match"}
            text={rows.length === 0 ? "Visits scheduled for the team appear here." : "Try another search or filter."}
            icon={<FiCalendar />}
          />
        ) : (
          <div className="lm-tv-list" key={date}>
            {people.map((p) => {
              const open = !closedPeople.has(p.id);
              const done = p.visits.filter((v) => v.state === "done").length;
              const missed = p.visits.filter((v) => v.state === "missed").length;
              const startedHere = p.visits.filter((v) => v.startedAt);
              const onTimeHere = startedHere.filter((v) => lateBy(v) <= ON_TIME_GRACE_MIN).length;
              return (
                <section key={p.id} className={`lm-tv-person${open ? " open" : ""}`}>
                  <button type="button" className="lm-tv-person-head" onClick={() => toggle(setClosedPeople, p.id)} aria-expanded={open}>
                    <Avatar name={p.name} size={36} />
                    <span className="lm-tv-person-name">
                      <strong>{p.name}</strong>
                      <small>
                        {p.visits.length} visit{p.visits.length === 1 ? "" : "s"}
                      </small>
                    </span>
                    <span className="lm-tv-person-stats">
                      <Pill tone="success">{done} done</Pill>
                      {missed > 0 && <Pill tone="danger">{missed} not started</Pill>}
                      {startedHere.length > 0 && <Pill tone="info">{Math.round((onTimeHere / startedHere.length) * 100)}% on time</Pill>}
                    </span>
                    <FiChevronDown className="lm-tv-chev" />
                  </button>

                  {open && (
                    <ol className="lm-tv-visits">
                      {p.visits.map((v) => {
                        const st = STATE[v.state];
                        const late = lateBy(v);
                        const length = lengthOf(v);
                        const expanded = openVisits.has(v.id);
                        return (
                          <li key={v.id} className={`lm-tv-visit${expanded ? " open" : ""}`}>
                            <button type="button" className="lm-tv-row" onClick={() => toggle(setOpenVisits, v.id)} aria-expanded={expanded}>
                              <span className="lm-tv-time">{timeLabel(v.scheduledAt)}</span>
                              <span className="lm-tv-main">
                                <strong>{v.company || "Lead"}</strong>
                                <small>
                                  {v.type === "MEETING" ? "Office meeting" : "Site visit"}
                                  {v.leadNumber ? ` · ${v.leadNumber}` : ""}
                                </small>
                              </span>
                              <span className="lm-tv-chips">
                                {late !== null &&
                                  (late <= ON_TIME_GRACE_MIN ? (
                                    <Pill tone="success">{late < 0 ? "Early" : "On time"}</Pill>
                                  ) : (
                                    <Pill tone="warn">{minutesText(late)} late</Pill>
                                  ))}
                                {length !== null && <Pill tone="info">{minutesText(length)}</Pill>}
                              </span>
                              <Badge tone={st.tone}>{st.label}</Badge>
                              <FiChevronDown className="lm-tv-chev" />
                            </button>

                            {expanded && (
                              <div className="lm-tv-detail">
                                {v.state === "missed" && <div className="lm-tv-warn">The planned time has passed and the visit was not started.</div>}
                                <div className="lm-tv-ends">
                                  <VisitEnd label="Visit start" at={v.startedAt} point={v.startPoint} tone="success" missing="Not started" />
                                  <VisitEnd label="Visit end" at={v.endedAt} point={v.endPoint} tone="info" missing={v.startedAt ? "Not ended yet" : "Not started"} />
                                </div>
                                <p className="lm-tv-summary">
                                  Planned {timeLabel(v.scheduledAt)}
                                  {late !== null && ` · ${late <= ON_TIME_GRACE_MIN ? (late < 0 ? `started ${minutesText(-late)} early` : "started on time") : `started ${minutesText(late)} late`}`}
                                  {length !== null && ` · visit took ${minutesText(length)}`}
                                </p>
                                {!!v.outcomeText && <p className="lm-visit-note">{v.outcomeText}</p>}
                                <Link className="lm-tv-open" to={`${LEADS_HOME}/${v.leadId}`}>
                                  Open lead <FiExternalLink />
                                </Link>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
