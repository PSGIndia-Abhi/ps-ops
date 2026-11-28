import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiArchive, FiCalendar, FiCheckCircle, FiChevronRight, FiClock, FiLayers, FiPaperclip, FiSearch } from "react-icons/fi";
import { Chip, ErrorBox, Loading, PageHead, Tiles } from "../ui";
import { COMPLAINT_PRIORITY, COMPLAINT_STATUS, COMPLAINT_TYPE, complaintRef, complaintRequest } from "./complaintApi";
import "./complaints.css";

// Feedback Desk > Complaints: every complaint clients raised from the Client Portal.

function ago(value) {
  if (!value) return "—";
  const d = new Date(value);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function ComplaintList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [company, setCompany] = useState("");
  const [site, setSite] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ page_size: "100" });
        if (status) q.set("status", status);
        if (type) q.set("type", type);
        if (priority) q.set("priority", priority);
        if (company) q.set("company_id", company);
        if (site) q.set("site_id", site);
        if (search) q.set("search", search);
        const body = await complaintRequest(`/complaints?${q}`);
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, type, priority, company, site, search, reloadKey]);

  // Refresh every minute so new complaints and replies show up.
  useEffect(() => {
    const t = setInterval(() => setReloadKey((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const counts = data?.counts || {};
  const options = data?.options || [];
  const companies = [...new Map(options.map((o) => [o.company_id, o.company_name])).entries()].filter(([id]) => id);
  const sites = options.filter((o) => !company || o.company_id === company);
  const tile = (key, label, tone, icon) => ({
    label, tone, icon, value: key ? counts[key] ?? 0 : counts.all ?? 0,
    active: status === key, onClick: () => setStatus(key),
  });

  return (
    <div className="fbc-page">
      <PageHead title="Complaints" sub="Raised by clients from the Client Portal" />

      <Tiles
        items={[
          tile("", "All", "dark", FiLayers),
          tile("OPEN", "Open", "danger", FiAlertCircle),
          tile("IN_PROGRESS", "In progress", "warn", FiClock),
          tile("VISIT_SCHEDULED", "Visit scheduled", "violet", FiCalendar),
          tile("RESOLVED", "Resolved", "ok", FiCheckCircle),
          tile("CLOSED", "Closed", "muted", FiArchive),
        ]}
      />

      <section className="fb-card fbc-list">
        <div className="fbc-filters">
          <label className="fbc-search">
            <FiSearch aria-hidden="true" />
            <input className="fb-input" type="search" placeholder="Search subject, company, outlet or client" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </label>
          <select className="fb-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            <option value="SERVICE">Service</option>
            <option value="ACCOUNTS">Accounts</option>
          </select>
          <select className="fb-select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="">All priorities</option>
            {Object.entries(COMPLAINT_PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
          <select className="fb-select" value={company} onChange={(e) => { setCompany(e.target.value); setSite(""); }} aria-label="Company">
            <option value="">All companies</option>
            {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="fb-select" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Outlet">
            <option value="">All outlets</option>
            {sites.map((o) => <option key={o.site_id} value={o.site_id}>{o.site_name}</option>)}
          </select>
        </div>

        {error ? (
          <ErrorBox error={error.message} onRetry={() => setReloadKey((n) => n + 1)} />
        ) : loading && !data ? (
          <Loading text="Loading complaints…" />
        ) : !data.complaints.length ? (
          <div className="fbc-empty">
            <FiCheckCircle aria-hidden="true" />
            <strong>No complaints here</strong>
            <span>{status || type || priority || company || site || search ? "Try another filter." : "Complaints raised by clients will appear here."}</span>
          </div>
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table fbc-table">
              <thead>
                <tr><th>Complaint</th><th>Company · Outlet</th><th>Priority</th><th>Status</th><th>Last update</th><th aria-hidden="true" /></tr>
              </thead>
              <tbody>
                {data.complaints.map((c) => {
                  const st = COMPLAINT_STATUS[c.status] || { label: c.status, tone: "muted" };
                  const pr = COMPLAINT_PRIORITY[c.priority] || COMPLAINT_PRIORITY.MEDIUM;
                  return (
                    <tr key={c.id} className={c.needs_reply ? "is-new" : ""} onClick={() => navigate(c.id)} tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(c.id)}>
                      <td>
                        <div className="fbc-subject">
                          {c.needs_reply && <span className="fbc-dot" title="Waiting for our reply" />}
                          <strong>{c.subject}</strong>
                          {c.category.map((k) => <span key={k} className={`fbc-type t-${k.toLowerCase()}`}>{COMPLAINT_TYPE[k] || k}</span>)}
                        </div>
                        <small className="fbc-meta">
                          {complaintRef(c.id)}{c.job_code ? ` · Job ${c.job_code}` : ""} · {c.raised_by_name}
                          {c.file_count > 0 && <> · <FiPaperclip aria-hidden="true" /> {c.file_count}</>}
                        </small>
                      </td>
                      <td><strong className="fbc-co">{c.company_name || "—"}</strong><small className="fbc-meta">{c.site_name || "—"}</small></td>
                      <td><Chip tone={pr.tone}>{pr.label}</Chip></td>
                      <td><Chip tone={st.tone}>{st.label}</Chip></td>
                      <td>
                        {ago(c.last_message_at || c.updated_at)}
                        <small className={`fbc-meta ${c.needs_reply ? "warn" : ""}`}>
                          {c.client_replied ? "Client replied" : c.needs_reply ? "New · not replied" : c.message_count > 1 ? "Replied" : ""}
                        </small>
                      </td>
                      <td className="fbc-go"><FiChevronRight aria-hidden="true" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
