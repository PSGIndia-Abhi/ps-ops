import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  FiSearch, FiRefreshCw, FiChevronRight, FiUser, FiX,
  FiClipboard, FiCalendar, FiZap, FiCheck, FiAlertCircle, FiShield, FiTool, FiDroplet, FiList, FiClock, FiMapPin,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, relativeDay, serviceLabel } from "./portalUtils";
import PortalLoader from "./PortalLoader";
import OutletPicker from "./OutletPicker";

// Coloured status tiles. `tone` picks the tile colour (see .cp-jv-tile.tone-* in clientPortal.css).
const JOB_TILES = [
  { key: "", label: "All jobs", count: "all", tone: "slate", Icon: FiClipboard },
  { key: "active", label: "Active", count: "active", tone: "blue", Icon: FiCalendar },
  { key: "in_progress", label: "In progress", count: "in_progress", tone: "violet", Icon: FiZap },
  { key: "completed", label: "Completed", count: "completed", tone: "green", Icon: FiCheck },
];

const VISIT_TILES = [
  { key: "upcoming", label: "Upcoming", tone: "blue", Icon: FiCalendar },
  { key: "in_progress", label: "In progress", tone: "violet", Icon: FiZap },
  { key: "completed", label: "Completed", tone: "green", Icon: FiCheck },
  { key: "missed", label: "Missed", tone: "red", Icon: FiAlertCircle },
  { key: "all", label: "All visits", tone: "slate", Icon: FiList },
];

// Status pill: label + colour for a job or visit status.
const STATUS_PILL = {
  NOT_STARTED: { label: "Scheduled", tone: "blue" },
  SCHEDULED: { label: "Scheduled", tone: "blue" },
  CREATED: { label: "Scheduled", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  AWAITING_APPROVAL: { label: "Under review", tone: "violet" },
  PAUSED: { label: "Paused", tone: "slate" },
  COMPLETED: { label: "Completed", tone: "green" },
  MISSED: { label: "Missed", tone: "red" },
  CANCELED: { label: "Cancelled", tone: "slate" },
};
const pillFor = (s) => STATUS_PILL[String(s || "").toUpperCase()] || { label: s || "—", tone: "slate" };
const ACTIVE_JOB = ["NOT_STARTED", "CREATED", "IN_PROGRESS", "PAUSED"];

// "OPERATION" -> "Operation"; known codes (PEST, DEEP...) keep their nice label.
function niceService(code) {
  const label = serviceLabel(code);
  return /^[A-Z_]+$/.test(label) ? label.charAt(0) + label.slice(1).toLowerCase().replace(/_/g, " ") : label;
}

// Icon + colour per service type.
function serviceIcon(code) {
  const c = String(code || "").toUpperCase();
  if (c === "PEST" || c === "BOTH") return { tone: "green", Icon: FiShield };
  if (c === "DEEP") return { tone: "violet", Icon: FiDroplet };
  return { tone: "blue", Icon: FiTool };
}

const time = (v) => (v ? new Date(v).getTime() : 0);
const short = { day: "2-digit", month: "short" };

// Group a list by calendar month (each month appears once). `dir` 1 = oldest first, -1 = newest first.
function groupByMonth(list, dateOf, dir = -1) {
  const sorted = [...list].sort((a, b) => dir * (time(dateOf(a)) - time(dateOf(b))));
  const groups = [];
  for (const item of sorted) {
    const v = dateOf(item);
    const d = v ? new Date(v) : null;
    const month = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "No date";
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}

// Small progress ring for jobs with several visits ("2/4").
function VisitRing({ done, total }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <span className="cp-jv-ring" title={`${done} of ${total} visits done`}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r={r} className="track" />
        {pct > 0 && <circle cx="16" cy="16" r={r} className={`value ${pct >= 1 ? "done" : ""}`} strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 16 16)" />}
      </svg>
      <span>{done}/{total}</span>
    </span>
  );
}

export default function PortalJobs() {
  const navigate = useNavigate();
  const { portal, outletId, setOutletId } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "visits" ? "visits" : "jobs";

  // Jobs tab opens on "All jobs"; Visits tab on "Upcoming".
  // A link can open a given status, e.g. /client/jobs?tab=visits&status=missed (dashboard "visit missed" pill).
  const [status, setStatus] = useState(() => {
    const wanted = params.get("status");
    const tiles = tab === "visits" ? VISIT_TILES : JOB_TILES;
    if (wanted !== null && tiles.some((t) => t.key === wanted)) return wanted;
    return tab === "visits" ? "upcoming" : "";
  });
  const [service, setService] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, counts: {}, services: [] });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [focusOpen, setFocusOpen] = useState(false); // "Needs scheduling" strip: false = one row of 3

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change starts again from page 1.
  const filterKey = `${tab}|${status}|${service}|${from}|${to}|${search}|${outletId}|${reloadKey}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const q = new URLSearchParams({ page: String(page), page_size: "20" });
        if (status) q.set("status", status);
        if (outletId) q.set("site_id", outletId);
        if (from) q.set("from", from);
        if (to) q.set("to", to);
        if (tab === "jobs") {
          if (service) q.set("service", service);
          if (search) q.set("search", search);
        }
        const res = await apiFetch(`/api/client-portal/${tab}?${q}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load");
        if (cancelled) return;
        const list = tab === "jobs" ? body.jobs : body.visits;
        setItems((prev) => (page === 1 ? list : [...prev, ...list]));
        setMeta((prev) => ({ total: body.total, counts: body.counts || {}, services: body.services || prev.services }));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // filterKey covers every filter; page drives "load more".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  function switchTab(next) {
    setParams(next === "visits" ? { tab: "visits" } : {}, { replace: true });
    setStatus(next === "visits" ? "upcoming" : "");
    setItems([]);
  }

  const hasDateFilter = from || to;
  const outlets = portal.outlets || [];
  const manyOutlets = outlets.length > 1;
  const tiles = tab === "jobs" ? JOB_TILES : VISIT_TILES;
  const openJob = (id) => navigate(`/client/jobs/${encodeURIComponent(id)}`);

  // Focus strip at the top:
  //  - Jobs: active jobs still waiting for a visit date ("Needs scheduling").
  //  - Visits: the next 3 upcoming visits.
  let focus = [];
  if (tab === "jobs" && (status === "" || status === "active")) {
    focus = items.filter((j) => ACTIVE_JOB.includes(String(j.status).toUpperCase()) && !j.next_visit && j.visits_done < Math.max(1, j.visits_total));
  } else if (tab === "visits" && (status === "upcoming" || status === "all")) {
    focus = items
      .filter((v) => String(v.status).toUpperCase() === "SCHEDULED" && time(v.scheduled_date) >= new Date().setHours(0, 0, 0, 0))
      .sort((a, b) => time(a.scheduled_date) - time(b.scheduled_date))
      .slice(0, 3);
  }
  const focusIds = new Set(focus.map((f) => f.id));
  const rest = items.filter((i) => !focusIds.has(i.id));
  const groups = tab === "jobs"
    ? groupByMonth(rest, (j) => j.start_date || j.created_at, -1)
    : groupByMonth(rest, (v) => v.scheduled_date, status === "upcoming" ? 1 : -1);

  return (
    <div className="cp-page cp-jv">
      <section className="cp-jv-head">
        <div>
          <h2>Jobs &amp; Visits</h2>
          <p>{tab === "jobs" ? "Every service booked for your outlets" : "Each visit by our team, by date"}</p>
        </div>
        <div className="cp-jv-switch" role="tablist" aria-label="Show">
          <button role="tab" aria-selected={tab === "jobs"} className={tab === "jobs" ? "active" : ""} onClick={() => switchTab("jobs")}>Jobs</button>
          <button role="tab" aria-selected={tab === "visits"} className={tab === "visits" ? "active" : ""} onClick={() => switchTab("visits")}>Visits</button>
        </div>
      </section>

      {/* Coloured status tiles: click to filter. */}
      <div className={`cp-jv-tiles n${tiles.length}`} role="tablist" aria-label="Status">
        {tiles.map((t) => {
          const Icon = t.Icon;
          const on = status === t.key;
          return (
            <button key={t.key || "all"} role="tab" aria-selected={on} className={`cp-jv-tile tone-${t.tone} ${on ? "active" : ""}`} onClick={() => setStatus(t.key)}>
              <span className="cp-jv-tile-icon" aria-hidden="true"><Icon /></span>
              <strong>{meta.counts[t.count || t.key] ?? 0}</strong>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="cp-toolbar cp-jv-filters">
        {tab === "jobs" && (
          <label className="cp-search">
            <FiSearch aria-hidden="true" />
            <input type="search" placeholder="Search job number, service or outlet" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </label>
        )}
        {outlets.length > 0 && (
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} align="right" className="cp-picker-box" />
        )}
        {tab === "jobs" && meta.services.length > 1 && (
          <label className="cp-select">
            Service
            <select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">All services</option>
              {meta.services.map((s) => <option key={s} value={s}>{niceService(s)}</option>)}
            </select>
          </label>
        )}
        <div className="cp-daterange cp-select">
          <span>{tab === "jobs" ? "Job date" : "Visit date"}</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span>to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {hasDateFilter && (
            <button className="cp-icon-btn cp-clear" onClick={() => { setFrom(""); setTo(""); }} aria-label="Clear dates"><FiX /></button>
          )}
        </div>
      </div>

      {error && (
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button>
        </div>
      )}

      {loading && page === 1 && items.length === 0 ? (
        <section className="cp-card cp-jv-list"><PortalLoader compact label="Loading jobs & visits…" /></section>
      ) : items.length === 0 ? (
        <section className="cp-card cp-jv-list"><div className="cp-empty">{tab === "jobs" ? "No jobs match these filters." : "No visits match these filters."}</div></section>
      ) : (
        <>
          {/* Focus strip */}
          {focus.length > 0 && (
            <section className={`cp-jv-focus ${tab === "jobs" ? "warn" : "info"}`}>
              <header>
                <span className="cp-jv-focus-icon" aria-hidden="true">{tab === "jobs" ? <FiClock /> : <FiCalendar />}</span>
                <div>
                  <h3>{tab === "jobs" ? "Needs scheduling" : "Coming up next"}</h3>
                  <small>
                    {tab === "jobs"
                      ? `${focus.length} job${focus.length === 1 ? " is" : "s are"} waiting for a visit date — our team will confirm it with you.`
                      : "Your next scheduled visits."}
                  </small>
                </div>
              </header>
              <div className={`cp-jv-focus-cards ${focusOpen ? "open" : ""} ${focus.length > 3 && !focusOpen ? "with-more" : ""}`}>
                {(focusOpen ? focus : focus.slice(0, 3)).map((item) => {
                  const isJob = tab === "jobs";
                  const svc = serviceIcon(item.service_type);
                  const Icon = svc.Icon;
                  return (
                    <button key={item.id} className="cp-jv-focus-card" onClick={() => openJob(isJob ? item.id : item.job_id)}>
                      {isJob ? (
                        <span className={`cp-jv-svc tone-${svc.tone}`} aria-hidden="true"><Icon /></span>
                      ) : (
                        <span className="cp-jv-date tone-blue">
                          <strong>{formatDate(item.scheduled_date, { day: "2-digit" })}</strong>
                          <small>{formatDate(item.scheduled_date, { month: "short" })}</small>
                        </span>
                      )}
                      <span className="cp-jv-main">
                        <strong>{niceService(item.service_type)}{item.sub_service ? <span> · {item.sub_service}</span> : null}</strong>
                        <small>
                          {isJob
                            ? `Job #${item.code || "—"} · booked ${formatDate(item.start_date || item.created_at, short)}`
                            : `${relativeDay(item.scheduled_date)} · Visit ${item.visit_number || ""} · #${item.job_code || "—"}`}
                        </small>
                      </span>
                      <span className={`cp-jv-pill tone-${isJob ? "orange" : "blue"}`}><i />{isJob ? "Awaiting date" : relativeDay(item.scheduled_date)}</span>
                    </button>
                  );
                })}
                {focus.length > 3 && !focusOpen && (
                  <button className="cp-jv-focus-more" onClick={() => setFocusOpen(true)} aria-label={`Show ${focus.length - 3} more`}>
                    <strong>+{focus.length - 3}</strong>
                    <small>more</small>
                  </button>
                )}
              </div>
              {focus.length > 3 && focusOpen && (
                <button className="cp-jv-focus-less" onClick={() => setFocusOpen(false)}>Show less ▴</button>
              )}
            </section>
          )}

          {/* Month-grouped list (each month once) */}
          {groups.length > 0 && (
            <section className="cp-card cp-jv-list">
              {groups.map((g) => (
                <div key={g.month} className="cp-jv-group">
                  <span className="cp-jv-month">{g.month} <i>{g.items.length}</i></span>
                  <ul>
                    {tab === "jobs"
                      ? g.items.map((j) => {
                          const pill = pillFor(j.status);
                          const svc = serviceIcon(j.service_type);
                          const SvcIcon = svc.Icon;
                          const total = j.visits_total || 0;
                          const doneDate = j.status === "COMPLETED" ? formatDate(j.completed_at || j.last_visit, short) : null;
                          return (
                            <li key={j.id}>
                              <button className="cp-jv-row2" onClick={() => openJob(j.id)}>
                                <span className={`cp-jv-svc tone-${svc.tone}`} aria-hidden="true"><SvcIcon /></span>
                                <span className="cp-jv-main">
                                  <strong>{niceService(j.service_type)}</strong>
                                  <small>{j.sub_service || "—"}</small>
                                </span>
                                <span className="cp-jv-chips">
                                  <span className="chip">#{j.code || "—"}</span>
                                  <span className="chip"><FiCalendar aria-hidden="true" /> {formatDate(j.start_date || j.created_at, short)}</span>
                                  {manyOutlets && j.site_name && <span className="chip"><FiMapPin aria-hidden="true" /> {j.site_name}</span>}
                                  {total > 1
                                    ? <VisitRing done={j.visits_done} total={total} />
                                    : <span className="chip soft">{total === 1 ? "1 visit" : "No visits yet"}</span>}
                                </span>
                                <span className="cp-jv-end">
                                  <span className={`cp-jv-pill tone-${pill.tone}`}><i />{pill.label}</span>
                                  <small>
                                    {doneDate ? `on ${doneDate}` : j.next_visit ? `next ${relativeDay(j.next_visit).toLowerCase()}` : "no visit date yet"}
                                  </small>
                                </span>
                                <FiChevronRight className="cp-jv-chev" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })
                      : g.items.map((v) => {
                          const pill = pillFor(v.status);
                          return (
                            <li key={v.id}>
                              <button className="cp-jv-row2" onClick={() => openJob(v.job_id)}>
                                <span className={`cp-jv-date tone-${pill.tone}`}>
                                  <strong>{formatDate(v.scheduled_date, { day: "2-digit" })}</strong>
                                  <small>{formatDate(v.scheduled_date, { month: "short" })}</small>
                                </span>
                                <span className="cp-jv-main">
                                  <strong>{niceService(v.service_type)}</strong>
                                  <small>{v.sub_service || "—"}</small>
                                </span>
                                <span className="cp-jv-chips">
                                  <span className="chip">Visit {v.visit_number || "—"}</span>
                                  <span className="chip">#{v.job_code || "—"}</span>
                                  {manyOutlets && v.site_name && <span className="chip"><FiMapPin aria-hidden="true" /> {v.site_name}</span>}
                                  <span className="chip soft"><FiUser aria-hidden="true" /> {v.technicians.length ? v.technicians.join(", ") : "Team not assigned"}</span>
                                </span>
                                <span className="cp-jv-end">
                                  <span className={`cp-jv-pill tone-${pill.tone}`}><i />{pill.label}</span>
                                  <small>{v.status === "COMPLETED" ? `done ${formatDate(v.completed_at, short)}` : relativeDay(v.scheduled_date)}</small>
                                </span>
                                <FiChevronRight className="cp-jv-chev" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {items.length > 0 && (
        <div className="cp-loadmore">
          <span className="cp-muted">Showing {items.length} of {meta.total}</span>
          {items.length < meta.total && (
            <button className="cp-btn cp-btn-ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
