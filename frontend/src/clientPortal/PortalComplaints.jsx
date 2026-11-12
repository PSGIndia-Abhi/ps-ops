import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiPlus, FiSearch, FiRefreshCw, FiChevronRight, FiMessageSquare, FiMapPin } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import ComplaintForm from "./ComplaintForm";
import { formatDate, relativeDay, statusInfo } from "./portalUtils";

const CHIPS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

export default function PortalComplaints() {
  const navigate = useNavigate();
  const { portal, outletId } = useOutletContext();
  const [params, setParams] = useSearchParams();

  // ?site=…&job=… (from outlet/job pages) opens the form pre-filled.
  const [form, setForm] = useState(() =>
    params.get("site") || params.get("job") || params.get("new")
      ? { site: params.get("site") || "", job: params.get("job") || "" }
      : null
  );

  const [status, setStatus] = useState("open");
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

  const filterKey = `${status}|${search}|${outletId}|${reloadKey}`;
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

      <div className="cp-toolbar">
        <label className="cp-search">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search by subject" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <div className="cp-chips" role="tablist" aria-label="Status">
          {CHIPS.map((c) => (
            <button key={c.key} role="tab" aria-selected={status === c.key} className={`cp-chip ${status === c.key ? "active" : ""}`} onClick={() => setStatus(c.key)}>
              {c.label} <span className="cp-chip-count">{meta.counts[c.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button>
        </div>
      )}

      <section className="cp-card cp-card-flush">
        {loading && page === 1 && items.length === 0 ? (
          <div className="cp-rowlist">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="cp-row-skel cp-skeleton" />)}</div>
        ) : items.length === 0 ? (
          <div className="cp-empty-state">
            <FiMessageSquare aria-hidden="true" />
            <strong>{status === "open" ? "No open complaints" : "No complaints found"}</strong>
            <span>{status === "open" ? "Everything looks fine. If something is wrong at an outlet, let us know." : "Try another filter."}</span>
            {status === "open" && <button className="cp-btn" onClick={() => setForm({ site: outletId || "", job: "" })}><FiPlus /> Raise a complaint</button>}
          </div>
        ) : (
          <div className="cp-rowlist">
            {items.map((c) => {
              const st = statusInfo(c.status);
              return (
                <button key={c.id} className="cp-complaint-row" onClick={() => navigate(`/client/complaints/${encodeURIComponent(c.id)}`)}>
                  <div className="cp-jobrow-main">
                    <strong>
                      {c.awaiting_you && c.status !== "CLOSED" && <span className="cp-new-dot" title="New reply from our team" />}
                      {c.subject}
                    </strong>
                    <small>
                      <FiMapPin aria-hidden="true" /> {c.site_name || "—"}
                      {c.job_code ? ` · Job #${c.job_code}` : ""} · Raised {formatDate(c.created_at)} by {c.raised_by_name}
                    </small>
                  </div>
                  <div className="cp-jobrow-next">
                    <small><FiMessageSquare aria-hidden="true" /> {c.message_count} message{c.message_count === 1 ? "" : "s"}</small>
                    <small>{c.awaiting_you && c.status !== "CLOSED" ? "Reply from our team" : `Updated ${relativeDay(c.last_message_at || c.updated_at).toLowerCase()}`}</small>
                  </div>
                  {["HIGH", "URGENT"].includes(c.priority) ? <span className={`cp-status ${c.priority === "URGENT" ? "st-red" : "st-amber"}`}>{c.priority === "URGENT" ? "Urgent" : "High"}</span> : <span />}
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
            <button className="cp-btn cp-btn-ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>{loading ? "Loading…" : "Load more"}</button>
          )}
        </div>
      )}

      {form && (
        <ComplaintForm
          outlets={portal.outlets}
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
