import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiSearch, FiRefreshCw, FiChevronRight, FiUser, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, relativeDay, serviceLabel, statusInfo } from "./portalUtils";

const JOB_CHIPS = [
  { key: "", label: "All", count: "all" },
  { key: "active", label: "Active", count: "active" },
  { key: "in_progress", label: "In progress", count: "in_progress" },
  { key: "completed", label: "Completed", count: "completed" },
];

const VISIT_CHIPS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "missed", label: "Missed" },
  { key: "all", label: "All" },
];

export default function PortalJobs() {
  const navigate = useNavigate();
  const { portal, outletId } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "visits" ? "visits" : "jobs";

  const [status, setStatus] = useState(tab === "visits" ? "upcoming" : "active");
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
    setStatus(next === "visits" ? "upcoming" : "active");
    setItems([]);
  }

  const hasDateFilter = from || to;
  const outletName = outletId ? portal.outlets.find((o) => o.id === outletId)?.name : null;
  const chips = tab === "jobs" ? JOB_CHIPS : VISIT_CHIPS;

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Jobs &amp; Visits</h2>
          <p>{outletName ? `Showing ${outletName}` : "Showing all outlets"} · change outlet from the top bar</p>
        </div>
        <div className="cp-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "jobs"} className={tab === "jobs" ? "active" : ""} onClick={() => switchTab("jobs")}>Jobs</button>
          <button role="tab" aria-selected={tab === "visits"} className={tab === "visits" ? "active" : ""} onClick={() => switchTab("visits")}>Visits</button>
        </div>
      </section>

      <div className="cp-toolbar">
        {tab === "jobs" && (
          <label className="cp-search">
            <FiSearch aria-hidden="true" />
            <input type="search" placeholder="Search job number, service or outlet" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </label>
        )}
        {tab === "jobs" && meta.services.length > 1 && (
          <label className="cp-select">
            Service
            <select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">All services</option>
              {meta.services.map((s) => <option key={s} value={s}>{serviceLabel(s)}</option>)}
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

      <div className="cp-chips cp-chips-wide" role="tablist" aria-label="Status">
        {chips.map((c) => (
          <button key={c.key || "all"} role="tab" aria-selected={status === c.key} className={`cp-chip ${status === c.key ? "active" : ""}`} onClick={() => setStatus(c.key)}>
            {c.label} <span className="cp-chip-count">{meta.counts[c.count || c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button>
        </div>
      )}

      <section className="cp-card cp-card-flush">
        {loading && page === 1 && items.length === 0 ? (
          <div className="cp-rowlist">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="cp-row-skel cp-skeleton" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="cp-empty">{tab === "jobs" ? "No jobs match these filters." : "No visits match these filters."}</div>
        ) : tab === "jobs" ? (
          <div className="cp-rowlist">
            {items.map((j) => {
              const st = statusInfo(j.status);
              const pct = j.visits_total ? Math.round((j.visits_done / j.visits_total) * 100) : 0;
              return (
                <button key={j.id} className="cp-jobrow" onClick={() => navigate(`/client/jobs/${encodeURIComponent(j.id)}`)}>
                  <div className="cp-jobrow-main">
                    <strong>{serviceLabel(j.service_type)}{j.sub_service ? <span> · {j.sub_service}</span> : null}</strong>
                    <small>#{j.code || "—"} · {j.site_name || "—"} · {formatDate(j.start_date || j.created_at)}</small>
                  </div>
                  <div className="cp-jobrow-progress">
                    <div className="cp-progress"><span style={{ width: `${pct}%` }} /></div>
                    <small>{j.visits_done}/{j.visits_total} visits</small>
                  </div>
                  <div className="cp-jobrow-next">
                    {j.status === "COMPLETED"
                      ? <small>Completed {formatDate(j.completed_at || j.last_visit)}</small>
                      : j.next_visit ? <small>Next visit <strong>{relativeDay(j.next_visit)}</strong></small> : <small>No visit scheduled</small>}
                  </div>
                  <span className={`cp-status ${st.className}`}>{st.label}</span>
                  <FiChevronRight className="cp-chevron" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="cp-rowlist">
            {items.map((v) => {
              const st = statusInfo(v.status);
              return (
                <button key={v.id} className="cp-jobrow" onClick={() => navigate(`/client/jobs/${encodeURIComponent(v.job_id)}`)}>
                  <div className="cp-visit-date">
                    <strong>{formatDate(v.scheduled_date, { day: "2-digit" })}</strong>
                    <small>{formatDate(v.scheduled_date, { month: "short" })}</small>
                  </div>
                  <div className="cp-jobrow-main">
                    <strong>{serviceLabel(v.service_type)}{v.sub_service ? <span> · {v.sub_service}</span> : null}</strong>
                    <small>Visit {v.visit_number || ""} · #{v.job_code || "—"} · {v.site_name || "—"}</small>
                  </div>
                  <div className="cp-jobrow-next">
                    {v.technicians.length > 0 && <small><FiUser aria-hidden="true" /> {v.technicians.join(", ")}</small>}
                    <small>{v.status === "COMPLETED" ? `Done ${formatDate(v.completed_at)}` : relativeDay(v.scheduled_date)}</small>
                  </div>
                  <span className={`cp-status ${st.className}`}>{st.label}</span>
                  <FiChevronRight className="cp-chevron" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </section>

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
