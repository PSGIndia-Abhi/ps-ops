import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiMapPin, FiCalendar, FiAlertCircle, FiBriefcase, FiRefreshCw, FiChevronRight } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, relativeDay, RISK_STYLE, serviceLabel } from "./portalUtils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "upcoming", label: "Visit scheduled" },
  { key: "active", label: "Active jobs" },
];

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

      <div className="cp-toolbar">
        <label className="cp-search">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search outlet, area or address" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="cp-chips" role="tablist" aria-label="Filter outlets">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={`cp-chip ${filter === f.key ? "active" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="cp-chip-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
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
        <div className="cp-outlet-grid">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="cp-outlet-card cp-skeleton" style={{ minHeight: 200 }} />)}
        </div>
      )}

      {!loading && !error && shown.length === 0 && (
        <div className="cp-card cp-empty">{outlets.length ? "No outlets match these filters." : "No outlets are linked to your account yet."}</div>
      )}

      <div className="cp-outlet-grid">
        {shown.map((o) => {
          const risk = RISK_STYLE[String(o.audit_risk || "").toUpperCase()];
          return (
            <button key={o.id} className="cp-outlet-card" onClick={() => navigate(`/client/outlets/${encodeURIComponent(o.id)}`)}>
              <div className="cp-outlet-top">
                <span className="cp-outlet-icon"><FiMapPin aria-hidden="true" /></span>
                <div className="cp-outlet-title">
                  <strong>{o.name || o.id}</strong>
                  <small>{o.city || "—"}</small>
                </div>
                {risk ? <span className={`cp-risk ${risk.className}`}>{risk.label} risk</span> : null}
              </div>

              {o.address && <p className="cp-outlet-address">{o.address}</p>}

              <div className="cp-outlet-stats">
                <div><FiBriefcase aria-hidden="true" /><span><strong>{o.active_jobs}</strong> active job{o.active_jobs === 1 ? "" : "s"}</span></div>
                <div><FiCalendar aria-hidden="true" /><span>{o.next_visit ? <>Next visit <strong>{relativeDay(o.next_visit)}</strong></> : "No visit scheduled"}</span></div>
                <div><FiCalendar aria-hidden="true" /><span>Last visit {o.last_visit ? <strong>{formatDate(o.last_visit)}</strong> : "—"}</span></div>
                <div className={o.open_complaints ? "warn" : ""}><FiAlertCircle aria-hidden="true" /><span><strong>{o.open_complaints}</strong> open complaint{o.open_complaints === 1 ? "" : "s"}</span></div>
              </div>

              <div className="cp-outlet-foot">
                <div className="cp-tags">
                  {o.services.length ? o.services.map((s) => <span key={s} className="cp-tag">{serviceLabel(s)}</span>) : <span className="cp-muted">No services yet</span>}
                </div>
                <FiChevronRight className="cp-chevron" aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
