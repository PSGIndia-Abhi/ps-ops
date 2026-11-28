import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  FiPlus, FiSearch, FiRefreshCw, FiChevronRight, FiMessageSquare, FiMapPin, FiLayers, FiAlertCircle, FiClock, FiCheckCircle, FiArchive, FiCalendar,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import ComplaintForm from "./ComplaintForm";
import { formatDate, relativeDay, statusInfo } from "./portalUtils";
import PortalLoader from "./PortalLoader";
import OutletPicker from "./OutletPicker";

// Status cards (All / Open / In progress / Resolved / Closed) - click one to filter.
const STATUS_CARDS = [
  { key: "all", label: "All", count: "all", tone: "blue", Icon: FiLayers },
  { key: "OPEN", label: "Open", count: "OPEN", tone: "red", Icon: FiAlertCircle },
  { key: "IN_PROGRESS", label: "In progress", count: "IN_PROGRESS", tone: "amber", Icon: FiClock },
  { key: "VISIT_SCHEDULED", label: "Visit scheduled", count: "VISIT_SCHEDULED", tone: "violet", Icon: FiCalendar },
  { key: "RESOLVED", label: "Resolved", count: "RESOLVED", tone: "green", Icon: FiCheckCircle },
  { key: "CLOSED", label: "Closed", count: "CLOSED", tone: "slate", Icon: FiArchive },
];

const PRIORITIES = [
  { key: "", label: "All priorities" },
  { key: "URGENT", label: "Urgent" },
  { key: "HIGH", label: "High" },
  { key: "MEDIUM", label: "Normal" },
  { key: "LOW", label: "Low" },
];
const CATEGORY_LABEL = { SERVICE: "Service", ACCOUNTS: "Accounts" };

const PRIORITY_PILL = {
  URGENT: { label: "Urgent", className: "pr-urgent" },
  HIGH: { label: "High", className: "pr-high" },
  MEDIUM: { label: "Normal", className: "pr-normal" },
  LOW: { label: "Low", className: "pr-low" },
};

export default function PortalComplaints() {
  const navigate = useNavigate();
  const { portal } = useOutletContext();
  // Outlet filter for this page only (the Dashboard's outlet picker affects the Dashboard alone).
  const [outletId, setOutletId] = useState("");
  const [params, setParams] = useSearchParams();

  // ?site=…&job=… (from outlet/job pages) opens the form pre-filled.
  const [form, setForm] = useState(() =>
    params.get("site") || params.get("job") || params.get("new")
      ? { site: params.get("site") || "", job: params.get("job") || "" }
      : null
  );

  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, counts: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterKey = `${status}|${priority}|${category}|${search}|${outletId}|${reloadKey}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const q = new URLSearchParams({ status, page: String(page), page_size: "20" });
        if (outletId) q.set("site_id", outletId);
        if (search) q.set("search", search);
        if (priority) q.set("priority", priority);
        if (category) q.set("category", category);
        const res = await apiFetch(`/api/client-portal/complaints?${q}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load complaints");
        if (cancelled) return;
        setItems((prev) => (page === 1 ? body.complaints : [...prev, ...body.complaints]));
        setMeta({ total: body.total, counts: body.counts || {} });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  function closeForm() {
    setForm(null);
    if (params.toString()) setParams({}, { replace: true });
  }

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Complaints</h2>
          <p>Raise an issue at any outlet and follow our team’s replies.</p>
        </div>
        <button className="cp-btn" onClick={() => setForm({ site: outletId || "", job: "" })}><FiPlus /> Raise a complaint</button>
      </section>

      {/* Status cards: count per stage; click to filter the list. */}
      <div className="cp-cs-cards" role="tablist" aria-label="Complaint status">
        {STATUS_CARDS.map((s) => {
          const on = status === s.key;
          const n = meta.counts[s.count] ?? 0;
          return (
            <button
              key={s.key} type="button" role="tab" aria-selected={on}
              className={`cp-cs-card tone-${s.tone} ${on ? "active" : ""}`}
              onClick={() => setStatus(s.key)}
            >
              <span className="cp-cs-icon" aria-hidden="true"><s.Icon /></span>
              <span className="cp-cs-text"><strong>{n}</strong><span>{s.label}</span></span>
            </button>
          );
        })}
      </div>

      <div className="cp-toolbar">
        <label className="cp-search">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search by subject" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        {portal.outlets.length > 1 && (
          <OutletPicker outlets={portal.outlets} value={outletId} onChange={setOutletId} className="cp-picker-box" />
        )}
        <label className="cp-select">
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All types</option>
            <option value="SERVICE">Service</option>
            <option value="ACCOUNTS">Accounts</option>
          </select>
        </label>
        <label className="cp-select">
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.key || "all"} value={p.key}>{p.label}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button>
        </div>
      )}

      <section className="cp-card cp-card-flush">
        {loading && page === 1 && items.length === 0 ? (
          <PortalLoader compact label="Loading complaints…" />
        ) : items.length === 0 ? (
          <div className="cp-empty-state">
            <FiMessageSquare aria-hidden="true" />
            <strong>{status === "all" && !search && !priority && !category ? "No complaints yet" : "No complaints found"}</strong>
            <span>{status === "all" && !search && !priority && !category ? "Everything looks fine. If something is wrong at an outlet, let us know." : "Try another filter."}</span>
            {status === "all" && !search && !priority && !category && <button className="cp-btn" onClick={() => setForm({ site: outletId || "", job: "" })}><FiPlus /> Raise a complaint</button>}
          </div>
        ) : (
          <div className="cp-cs-table" role="table" aria-label="Complaints">
            <div className="cp-cs-row cp-cs-headrow" role="row">
              <span role="columnheader">Complaint</span>
              <span role="columnheader">Outlet</span>
              <span role="columnheader">Priority</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Last update</span>
              <span aria-hidden="true" />
            </div>
            {items.map((c) => {
              const st = statusInfo(c.status);
              const pr = PRIORITY_PILL[c.priority] || PRIORITY_PILL.MEDIUM;
              const newReply = c.awaiting_you && c.status !== "CLOSED";
              return (
                <button
                  key={c.id} type="button" role="row"
                  className={`cp-cs-row ${newReply ? "unread" : ""}`}
                  onClick={() => navigate(`/client/complaints/${encodeURIComponent(c.id)}`)}
                >
                  <span className="cp-cs-main" role="cell">
                    <strong>
                      {newReply && <span className="cp-new-dot" title="New reply from our team" />}
                      <span className="cp-cs-subject">{c.subject}</span>
                      {(c.category || ["SERVICE"]).map((k) => (
                        <span key={k} className={`cp-cat-tag cat-${k.toLowerCase()}`}>{CATEGORY_LABEL[k] || k}</span>
                      ))}
                    </strong>
                    <small>
                      {c.job_code ? `Job #${c.job_code} · ` : ""}Raised {formatDate(c.created_at)} by {c.raised_by_name}
                      {` · ${c.message_count} message${c.message_count === 1 ? "" : "s"}`}
                    </small>
                  </span>
                  <span className="cp-cs-outlet" role="cell"><FiMapPin aria-hidden="true" /> {c.site_name || "—"}</span>
                  <span role="cell"><span className={`cp-cs-pill ${pr.className}`}>{pr.label}</span></span>
                  <span role="cell"><span className={`cp-status ${st.className}`}>{st.label}</span></span>
                  <span className="cp-cs-when" role="cell">
                    {relativeDay(c.last_message_at || c.updated_at)}
                    <small>{newReply ? "Reply from BestServe" : c.last_message_at ? "Last message" : "Raised"}</small>
                  </span>
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
            <button className="cp-btn cp-btn-ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>{loading ? "Loading…" : "Load more"}</button>
          )}
        </div>
      )}

      {form && (
        <ComplaintForm
          outlets={portal.outlets}
          headOffice={portal.access === "company"}
          initialSite={form.site}
          initialJob={form.job}
          onClose={closeForm}
          onCreated={(created) => {
            closeForm();
            navigate(`/client/complaints/${encodeURIComponent(created.id)}`, { state: { justCreated: true, warning: created.warning } });
          }}
        />
      )}
    </div>
  );
}
