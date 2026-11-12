import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiCheck, FiSearch, FiRefreshCw, FiX, FiClock, FiCalendar, FiMapPin, FiSend } from "react-icons/fi";
import { MdPestControl, MdCleaningServices, MdAutoAwesome } from "react-icons/md";
import { apiFetch, safeJson } from "../api";
import { pestServices, deepCleaningServices } from "../components/CreateBookingModal";
import { formatDate, serviceLabel, statusInfo, ymd } from "./portalUtils";

const TYPES = [
  { key: "PEST", label: "Pest Control", hint: "Cockroach, rodent, mosquito, termite…", icon: <MdPestControl aria-hidden="true" /> },
  { key: "DEEP", label: "Cleaning", hint: "Deep cleaning, floor protection…", icon: <MdCleaningServices aria-hidden="true" /> },
  { key: "BOTH", label: "Both", hint: "Pest control and cleaning together", icon: <MdAutoAwesome aria-hidden="true" /> },
];
const SLOTS = [
  { key: "ANY", label: "Any time" },
  { key: "MORNING", label: "Morning" },
  { key: "AFTERNOON", label: "Afternoon" },
  { key: "EVENING", label: "Evening" },
];
const REQUEST_STATUS = {
  NEW: { label: "Waiting for our team", className: "st-amber" },
  ASSIGNED: { label: "Scheduled", className: "st-green" },
  REJECTED: { label: "Declined", className: "st-red" },
  CANCELLED: { label: "Cancelled", className: "st-slate" },
};

export default function PortalRequestService() {
  const navigate = useNavigate();
  const { portal, outletId } = useOutletContext();
  const [params] = useSearchParams();
  const outlets = portal.outlets;

  const [siteId, setSiteId] = useState(() => params.get("site") || outletId || (outlets.length === 1 ? outlets[0].id : ""));
  const [type, setType] = useState("PEST");
  const [picked, setPicked] = useState([]);
  const [filter, setFilter] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("ANY");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [requests, setRequests] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const catalog = useMemo(() => {
    const list = type === "PEST" ? pestServices : type === "DEEP" ? deepCleaningServices : [...pestServices, ...deepCleaningServices];
    const q = filter.trim().toLowerCase();
    return q ? list.filter((s) => s.toLowerCase().includes(q)) : list;
  }, [type, filter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      try {
        const q = outletId ? `?site_id=${encodeURIComponent(outletId)}` : "";
        const res = await apiFetch(`/api/client-portal/service-requests${q}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load your requests");
        if (!cancelled) {
          setRequests(body.requests || []);
          setListError(null);
        }
      } catch (err) {
        if (!cancelled) setListError(err.message);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [outletId, reloadKey]);

  function changeType(next) {
    setType(next);
    // Keep only choices that still belong to the new type.
    const allowed = next === "PEST" ? pestServices : next === "DEEP" ? deepCleaningServices : [...pestServices, ...deepCleaningServices];
    setPicked((p) => p.filter((s) => allowed.includes(s)));
  }

  function toggle(service) {
    setPicked((p) => (p.includes(service) ? p.filter((s) => s !== service) : [...p, service]));
  }

  async function submit(e) {
    e.preventDefault();
    if (!siteId) return setFormError("Please choose the outlet.");
    if (!picked.length) return setFormError("Please choose at least one service.");
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch("/api/client-portal/service-requests", {
        method: "POST",
        body: JSON.stringify({ site_id: siteId, service_type: type, sub_services: picked, preferred_date: date || null, preferred_slot: slot, notes }),
      });
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Could not send your request");
      setPicked([]);
      setDate("");
      setSlot("ANY");
      setNotes("");
      setFilter("");
      setNotice("Request sent. Our team will schedule it and you’ll see the job here once it’s assigned.");
      setReloadKey((n) => n + 1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(request) {
    if (!window.confirm("Cancel this request?")) return;
    const res = await apiFetch(`/api/client-portal/service-requests/${request.id}/cancel`, { method: "PATCH" });
    const body = await safeJson(res);
    if (!res?.ok) return setListError(body?.error || "Could not cancel the request");
    setReloadKey((n) => n + 1);
  }

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Request a service</h2>
          <p>Tell us what you need and when. Our team will confirm and schedule it.</p>
        </div>
      </section>

      {notice && (
        <div className="cp-notice ok">
          <span><FiCheck aria-hidden="true" /> {notice}</span>
          <button className="cp-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><FiX /></button>
        </div>
      )}

      <div className="cp-request-layout">
        <form className="cp-card cp-request-form" onSubmit={submit}>
          {formError && <div className="cp-alert">{formError}</div>}

          <div className="cp-step-title"><span>1</span> Outlet</div>
          <label className="cp-field">
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Outlet">
              <option value="">Choose outlet</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name || o.id}{o.city ? ` · ${o.city}` : ""}</option>)}
            </select>
          </label>

          <div className="cp-step-title"><span>2</span> Type of service</div>
          <div className="cp-type-cards" role="radiogroup">
            {TYPES.map((t) => (
              <button type="button" role="radio" aria-checked={type === t.key} key={t.key} className={`cp-type-card ${type === t.key ? "active" : ""}`} onClick={() => changeType(t.key)}>
                <span className="cp-type-icon">{t.icon}</span>
                <strong>{t.label}</strong>
                <small>{t.hint}</small>
                {type === t.key && <FiCheck className="cp-type-check" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <div className="cp-step-title"><span>3</span> Services <small className="cp-muted">{picked.length ? `${picked.length} selected` : "choose one or more"}</small></div>
          <label className="cp-search cp-search-sm">
            <FiSearch aria-hidden="true" />
            <input type="search" placeholder="Find a service" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="cp-service-grid">
            {catalog.map((s) => (
              <button type="button" key={s} className={`cp-service-pill ${picked.includes(s) ? "active" : ""}`} onClick={() => toggle(s)} aria-pressed={picked.includes(s)}>
                {picked.includes(s) && <FiCheck aria-hidden="true" />} {s}
              </button>
            ))}
            {catalog.length === 0 && <span className="cp-muted">No service matches “{filter}”.</span>}
          </div>

          <div className="cp-step-title"><span>4</span> When suits you? <small className="cp-muted">optional</small></div>
          <div className="cp-when">
            <label className="cp-field">Preferred date
              <input type="date" value={date} min={ymd(new Date())} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="cp-field">Time of day
              <div className="cp-segment">
                {SLOTS.map((s) => (
                  <button type="button" key={s.key} className={slot === s.key ? "active" : ""} onClick={() => setSlot(s.key)}>{s.label}</button>
                ))}
              </div>
            </div>
          </div>

          <label className="cp-field">Anything we should know? <small className="cp-muted">optional</small>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Areas to cover, access timings, contact on site…" />
          </label>

          <div className="cp-request-submit">
            <button type="submit" className="cp-btn" disabled={saving}><FiSend /> {saving ? "Sending…" : "Send request"}</button>
          </div>
        </form>

        <section className="cp-card cp-request-list">
          <header className="cp-card-head">
            <h3>Your requests</h3>
            <button className="cp-icon-btn" onClick={() => setReloadKey((n) => n + 1)} aria-label="Refresh"><FiRefreshCw /></button>
          </header>
          {listError && <div className="cp-alert">{listError}</div>}
          {listLoading && requests.length === 0 ? (
            <div className="cp-row-skel cp-skeleton" />
          ) : requests.length === 0 ? (
            <div className="cp-empty">No requests yet.</div>
          ) : (
            <ul className="cp-request-items">
              {requests.map((r) => {
                const st = REQUEST_STATUS[r.status] || statusInfo(r.status);
                return (
                  <li key={r.id}>
                    <div className="cp-request-top">
                      <strong>{serviceLabel(r.service_type)}</strong>
                      <span className={`cp-status ${st.className}`}>{st.label}</span>
                    </div>
                    <small className="cp-request-services">{r.sub_services.join(" · ")}</small>
                    <small className="cp-request-meta">
                      <span><FiMapPin aria-hidden="true" /> {r.site_name || "—"}</span>
                      {r.preferred_date && <span><FiCalendar aria-hidden="true" /> {formatDate(r.preferred_date)}</span>}
                      <span><FiClock aria-hidden="true" /> Sent {formatDate(r.created_at)}</span>
                    </small>
                    {r.staff_note && <p className={`cp-request-note ${r.status === "REJECTED" ? "bad" : ""}`}>{r.staff_note}</p>}
                    {r.jobs.length > 0 && (
                      <div className="cp-tags">
                        {r.jobs.map((j) => (
                          <button key={j.id} className="cp-tag cp-tag-link" onClick={() => navigate(`/client/jobs/${encodeURIComponent(j.id)}`)}>
                            Job #{j.code} · {j.sub_service}
                          </button>
                        ))}
                      </div>
                    )}
                    {r.status === "NEW" && <button className="cp-link cp-request-cancel" onClick={() => cancel(r)}>Cancel request</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
