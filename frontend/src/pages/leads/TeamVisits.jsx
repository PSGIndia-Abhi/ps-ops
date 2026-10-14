// Team Visits (sales manager): one day's visits by the team - who went where, whether each
// visit was started on time, where it started and ended (place and Map button), how long it
// took and the outcome. GET /api/crm/team-visits?date=, the same view as the Android app.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiMapPin, FiPlayCircle, FiUser, FiAlertCircle } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { teamVisits } from "./leadsApi";
import { timeLabel } from "./format";
import { Badge, Card, Empty, Kpi, SkeletonRows, Who } from "./ui";
import { useViewer } from "./viewer";
import { VisitPlaces } from "./visits";

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

export default function TeamVisits() {
  const { persona } = useViewer();
  const today = dayKey(new Date());
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState("all");
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

  // Grouped by sales person, in the order their first visit of the day comes.
  const groups = new Map();
  withState
    .filter((v) => filter === "all" || v.state === filter)
    .forEach((v) => {
      if (!groups.has(v.salesId)) groups.set(v.salesId, { id: v.salesId, name: v.salesName || "Sales person", visits: [] });
      groups.get(v.salesId).visits.push(v);
    });
  const people = [...groups.values()];

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

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
            <button type="button" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">
              <FiChevronLeft />
            </button>
            <label>
              <FiCalendar />
              <span>{dayName}</span>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a day" />
            </label>
            <button type="button" onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day">
              <FiChevronRight />
            </button>
          </div>
          {date !== today && (
            <button type="button" className="lm-btn ghost" onClick={() => setDate(today)}>
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
        <div className="lm-tools">
          <div className="lm-seg">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
                {f.label} ({f.key === "all" ? rows.length : count(f.key)})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : result.error ? (
          <Empty title="Could not load the visits" text={result.error} icon={<FiMapPin />} />
        ) : people.length === 0 ? (
          <Empty title={rows.length === 0 ? "No visits on this day" : "No visits match"} text={rows.length === 0 ? "Visits scheduled for the team appear here." : "Try another filter."} icon={<FiCalendar />} />
        ) : (
          <div className="lm-team-visits" key={`${date}:${filter}`}>
            {people.map((p) => (
              <section key={p.id} className="lm-person-visits">
                <header>
                  <Who name={p.name} sub={`${p.visits.length} visit${p.visits.length === 1 ? "" : "s"} · ${p.visits.filter((v) => v.state === "done").length} completed`} size={36} />
                </header>
                {p.visits.map((v, i) => {
                  const st = STATE[v.state];
                  const late = lateBy(v);
                  const length = lengthOf(v);
                  return (
                    <div key={v.id} className="lm-visit" style={{ "--i": i }}>
                      <div className="lm-visit-time">{timeLabel(v.scheduledAt)}</div>
                      <div className="lm-visit-body">
                        <div className="lm-visit-top">
                          <strong>{v.company}</strong>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <small className="muted">
                          {v.type === "MEETING" ? "Office meeting" : "Site visit"}
                          {v.leadNumber ? ` · ${v.leadNumber}` : ""}
                          {v.leadBy && (
                            <>
                              {" · "}
                              <FiUser /> Lead by {v.leadBy}
                            </>
                          )}
                        </small>
                        <div className="lm-pills">
                          {late !== null && (late <= ON_TIME_GRACE_MIN ? <Pill tone="success">{late < 0 ? "Started early" : "On time"}</Pill> : <Pill tone="warn">Started {minutesText(late)} late</Pill>)}
                          {length !== null && <Pill tone="info">Visit {minutesText(length)}</Pill>}
                          {v.state === "missed" && <Pill tone="danger">Time passed - visit not started</Pill>}
                        </div>
                        <VisitPlaces visit={v} />
                        {!!v.outcomeText && <p className="lm-visit-note">{v.outcomeText}</p>}
                        <Link className="lm-link" to={`${LEADS_HOME}/${v.leadId}`} style={{ fontSize: 13 }}>
                          Open lead
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
