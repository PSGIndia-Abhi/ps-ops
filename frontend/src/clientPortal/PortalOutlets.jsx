import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch, FiMapPin, FiCalendar, FiAlertCircle, FiRefreshCw, FiChevronRight,
  FiAlertTriangle, FiCheck, FiClipboard, FiClock, FiHome,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate } from "./portalUtils";
import PortalLoader from "./PortalLoader";

const FILTERS = [
  { key: "all", label: "All outlets" },
  { key: "attention", label: "Needs attention" },
  { key: "upcoming", label: "Visit scheduled" },
  { key: "active", label: "With active jobs" },
];

const FILTER_ICONS = { all: FiHome, attention: FiAlertTriangle, upcoming: FiCalendar, active: FiClipboard };

const SORTS = [
  { key: "name", label: "Name" },
  { key: "next", label: "Next visit" },
  { key: "last", label: "Last visit" },
  { key: "active", label: "Most active jobs" },
];

const needsAttention = (o) =>
  o.open_complaints > 0 || ["HIGH", "CRITICAL"].includes(String(o.audit_risk || "").toUpperCase());

export default function PortalOutlets() {
  const navigate = useNavigate();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch("/api/client-portal/outlets");
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load outlets");
        if (!cancelled) {
          setOutlets(body.outlets || []);
          setError(null);
        }
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
  }, [reloadKey]);

  const counts = useMemo(
    () => ({
      all: outlets.length,
      attention: outlets.filter(needsAttention).length,
      upcoming: outlets.filter((o) => o.next_visit).length,
      active: outlets.filter((o) => o.active_jobs > 0).length,
    }),
    [outlets]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = outlets.filter((o) => {
      if (filter === "attention" && !needsAttention(o)) return false;
      if (filter === "upcoming" && !o.next_visit) return false;
      if (filter === "active" && !o.active_jobs) return false;
      if (!q) return true;
      return [o.name, o.city, o.address].some((v) => v && v.toLowerCase().includes(q));
    });
    const time = (v, empty) => (v ? new Date(v).getTime() : empty);
    return [...list].sort((a, b) => {
      if (sort === "next") return time(a.next_visit, Infinity) - time(b.next_visit, Infinity);
      if (sort === "last") return time(b.last_visit, -Infinity) - time(a.last_visit, -Infinity);
      if (sort === "active") return b.active_jobs - a.active_jobs;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [outlets, search, filter, sort]);

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Outlets</h2>
          <p>{outlets.length} outlet{outlets.length === 1 ? "" : "s"} under your account</p>
        </div>
      </section>

      {/* Coloured filter tiles (All / Needs attention / Visit scheduled / With active jobs). */}
      <div className="cp-ol-filters" role="tablist" aria-label="Filter outlets">
        {FILTERS.map((f) => {
          const Icon = FILTER_ICONS[f.key];
          return (
            <button
              key={f.key} role="tab" aria-selected={filter === f.key}
              className={`cp-ol-filter tone-${f.key} ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              <span className="cp-ol-filter-icon" aria-hidden="true"><Icon /></span>
              <strong>{counts[f.key]}</strong>
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      <div className="cp-toolbar">
        <label className="cp-search">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search outlet, area or address" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="cp-select">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button>
        </div>
      )}

      {loading && outlets.length === 0 && (
        <div className="cp-card"><PortalLoader compact label="Loading outlets…" /></div>
      )}

      {!loading && !error && shown.length === 0 && (
        <div className="cp-card cp-empty">{outlets.length ? "No outlets match these filters." : "No outlets are linked to your account yet."}</div>
      )}

      {/* Compact outlet cards: 3 per row on wide screens, so long lists stay easy to scan. */}
      <div className="cp-ol-grid">
        {shown.map((o) => {
          const site = encodeURIComponent(o.id);
          const short = { day: "2-digit", month: "short" };
          return (
            <article key={o.id} className="cp-ol-card">
              <button type="button" className="cp-ol-main" onClick={() => navigate(`/client/outlets/${site}`)} aria-label={`Open ${o.name || o.id}`}>
                <span className="cp-ol-top">
                  <span className="cp-ol-pin" aria-hidden="true"><FiMapPin /></span>
                  <span className="cp-ol-name">
                    <strong>{o.name || o.id}</strong>
                    <small title={o.address || o.city || ""}>{o.address || o.city || "—"}</small>
                  </span>
                  {needsAttention(o) && <span className="cp-ol-attn">Needs attention</span>}
                </span>
                <span className="cp-ol-stats">
                  <span className="cp-ol-chip blue" title="Active jobs"><FiClipboard aria-hidden="true" /><b>{o.active_jobs}</b> job{o.active_jobs === 1 ? "" : "s"}</span>
                  <span className="cp-ol-chip violet" title="Last visit"><FiClock aria-hidden="true" />{o.last_visit ? formatDate(o.last_visit, short) : "No visit yet"}</span>
                  <span className="cp-ol-chip slate" title="Next visit"><FiCalendar aria-hidden="true" />{o.next_visit ? formatDate(o.next_visit, short) : "Not set"}</span>
                  {o.open_complaints > 0 ? (
                    <span className="cp-ol-chip orange" title="Open complaints"><FiAlertCircle aria-hidden="true" /><b>{o.open_complaints}</b> open</span>
                  ) : (
                    <span className="cp-ol-chip green" title="No open complaints"><FiCheck aria-hidden="true" />Clear</span>
                  )}
                </span>
              </button>
              <div className="cp-ol-foot">
                <button type="button" onClick={() => navigate(`/client/request-service?site=${site}`)}>Request service</button>
                <button type="button" onClick={() => navigate(`/client/complaints?site=${site}`)}>Complaint</button>
                <button type="button" className="open" onClick={() => navigate(`/client/outlets/${site}`)}>Open <FiChevronRight aria-hidden="true" /></button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
