import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  FiCheck, FiRefreshCw, FiX, FiClock, FiCalendar, FiMapPin, FiSend,
  FiSun, FiSunrise, FiMoon, FiSlash,
} from "react-icons/fi";
import { MdPestControl, MdCleaningServices, MdAutoAwesome } from "react-icons/md";
import { apiFetch, safeJson } from "../api";
import { pestServices, deepCleaningServices } from "../components/CreateBookingModal";
import { formatDate, serviceLabel, ymd } from "./portalUtils";
import PortalLoader from "./PortalLoader";
import ServiceMultiSelect from "./ServiceMultiSelect";

const TYPES = [
  { key: "PEST", label: "Pest Control", hint: "Cockroach, rodent, mosquito, termite…", tone: "green", Icon: MdPestControl },
  { key: "DEEP", label: "Cleaning", hint: "Deep cleaning, floor protection…", tone: "blue", Icon: MdCleaningServices },
  { key: "BOTH", label: "Both", hint: "Pest control and cleaning together", tone: "violet", Icon: MdAutoAwesome },
];
const SLOTS = [
  { key: "ANY", label: "Any time", Icon: FiClock },
  { key: "MORNING", label: "Morning", Icon: FiSunrise },
  { key: "AFTERNOON", label: "Afternoon", Icon: FiSun },
  { key: "EVENING", label: "Evening", Icon: FiMoon },
];
const SLOT_LABEL = Object.fromEntries(SLOTS.map((s) => [s.key, s.label]));
const REQUEST_STATUS = {
  NEW: { label: "Waiting", tone: "orange", Icon: FiClock },
  ASSIGNED: { label: "Scheduled", tone: "green", Icon: FiCheck },
  REJECTED: { label: "Declined", tone: "red", Icon: FiX },
  CANCELLED: { label: "Cancelled", tone: "slate", Icon: FiSlash },
};

// Quick date picks; each sets a real date (the system saves one preferred date).
function quickDates() {
  const add = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const today = new Date();
  const toMonday = ((8 - today.getDay()) % 7) || 7;
  return [
    { key: "tomorrow", label: "Tomorrow", value: add(1) },
    { key: "in2", label: "In 2 days", value: add(2) },
    { key: "monday", label: "Next Monday", value: add(toMonday) },
  ];
}

export default function PortalRequestService() {
  const navigate = useNavigate();
  const { portal, outletId } = useOutletContext();
  const [params] = useSearchParams();
  const outlets = portal.outlets;

  const [siteId, setSiteId] = useState(() => params.get("site") || outletId || (outlets.length === 1 ? outlets[0].id : ""));
  const [type, setType] = useState("PEST");
  const [picked, setPicked] = useState([]);
  const [date, setDate] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [slot, setSlot] = useState("ANY");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [requests, setRequests] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Services offered for the chosen type (the dropdown has its own search box).
  const catalog = useMemo(
    () => (type === "PEST" ? pestServices : type === "DEEP" ? deepCleaningServices : [...pestServices, ...deepCleaningServices]),
    [type]
  );
  const quick = useMemo(() => quickDates(), []);

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
      setShowPicker(false);
      setSlot("ANY");
      setNotes("");
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

  const outlet = outlets.find((o) => o.id === siteId);
  const typeInfo = TYPES.find((t) => t.key === type);
  const quickPicked = quick.find((q) => q.value === date);

  // Progress steps: done when filled in; the first unfinished one is "current".
  const steps = [
    { label: "Outlet", done: !!siteId },
    { label: "Service type", done: !!type },
    { label: "Services", done: picked.length > 0 },
    { label: "Schedule", done: !!date || slot !== "ANY" },
    { label: "Send", done: false },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="cp-page cp-rq">
      <section className="cp-hero">
        <div>
          <h2>Request a service</h2>
          <p>Tell us what you need and when. Our team will confirm and schedule it.</p>
        </div>
      </section>

      <ol className="cp-rq-steps" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? "done" : i === current ? "now" : ""}>
            <span className="cp-rq-step-dot">{s.done ? <FiCheck aria-hidden="true" /> : i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {notice && (
        <div className="cp-notice ok">
          <span><FiCheck aria-hidden="true" /> {notice}</span>
          <button className="cp-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><FiX /></button>
        </div>
      )}

      <div className="cp-rq-layout">
        <form id="cp-rq-form" className="cp-card cp-rq-form" onSubmit={submit}>
          {formError && <div className="cp-alert">{formError}</div>}

          <section className="cp-rq-sec">
            <h3>1 · Outlet</h3>
            <div className={`cp-rq-outlet ${siteId ? "set" : ""}`}>
              <span className="cp-rq-outlet-pin" aria-hidden="true"><FiMapPin /></span>
              <span className="cp-rq-outlet-text">
                <strong>{outlet ? outlet.name || outlet.id : "Choose the outlet"}</strong>
                <small>{outlet ? outlet.address || outlet.city || "" : "Where should we do the work?"}</small>
              </span>
              {outlets.length > 1 && (
                <label className="cp-rq-outlet-change">
                  <span>{siteId ? "Change" : "Choose"}</span>
                  <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Outlet">
                    <option value="">Choose outlet</option>
                    {outlets.map((o) => <option key={o.id} value={o.id}>{o.name || o.id}{o.city ? ` · ${o.city}` : ""}</option>)}
                  </select>
                </label>
              )}
            </div>
          </section>

          <section className="cp-rq-sec">
            <h3>2 · Service type</h3>
            <div className="cp-rq-types" role="radiogroup" aria-label="Type of service">
              {TYPES.map((t) => {
                const on = type === t.key;
                const Icon = t.Icon;
                return (
                  <button type="button" role="radio" aria-checked={on} key={t.key} className={`cp-rq-type tone-${t.tone} ${on ? "active" : ""}`} onClick={() => changeType(t.key)}>
                    {on && <span className="cp-rq-type-check" aria-hidden="true"><FiCheck /></span>}
                    <span className="cp-rq-type-icon" aria-hidden="true"><Icon /></span>
                    <strong>{t.label}</strong>
                    <small>{t.hint}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="cp-rq-sec">
            <h3>3 · Services <small>{picked.length ? `${picked.length} selected` : "choose one or more"}</small></h3>
            <ServiceMultiSelect options={catalog} value={picked} onChange={setPicked} type={type} />
          </section>

          <section className="cp-rq-sec">
            <h3>4 · Schedule <small>optional</small></h3>
            <div className="cp-rq-when">
              <div>
                <span className="cp-rq-label">Preferred date</span>
                <div className="cp-rq-chips">
                  {quick.map((q) => {
                    const on = quickPicked?.key === q.key;
                    return (
                      <button
                        type="button" key={q.key} aria-pressed={on} className={`cp-rq-chip ${on ? "active" : ""}`}
                        onClick={() => { setDate(on ? "" : q.value); setShowPicker(false); }}
                      >
                        {on && <FiCheck aria-hidden="true" />} {q.label}
                      </button>
                    );
                  })}
                  <button
                    type="button" aria-pressed={showPicker || (!!date && !quickPicked)}
                    className={`cp-rq-chip ${showPicker || (date && !quickPicked) ? "active" : ""}`}
                    onClick={() => setShowPicker(true)}
                  >
                    <FiCalendar aria-hidden="true" /> {date && !quickPicked ? formatDate(date) : "Pick a date"}
                  </button>
                </div>
                {(showPicker || (date && !quickPicked)) && (
                  <input className="cp-rq-date" type="date" value={date} min={ymd(new Date())} onChange={(e) => setDate(e.target.value)} aria-label="Preferred date" />
                )}
              </div>
              <div>
                <span className="cp-rq-label">Time of day</span>
                <div className="cp-rq-slots" role="radiogroup" aria-label="Time of day">
                  {SLOTS.map((s) => {
                    const Icon = s.Icon;
                    const on = slot === s.key;
                    return (
                      <button type="button" role="radio" aria-checked={on} key={s.key} className={`cp-rq-slot ${on ? "active" : ""}`} onClick={() => setSlot(s.key)}>
                        <Icon aria-hidden="true" /> {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <label className="cp-field cp-rq-notes">Additional notes <small className="cp-muted">optional</small>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Areas to cover, access timings, contact on site…" />
            </label>
          </section>
        </form>

        <aside className="cp-rq-side">
          <section className="cp-card cp-rq-summary" aria-label="Your request">
            <h3>Your request</h3>
            <p>Fills in as you choose</p>
            <div className="cp-rq-kv"><span>Outlet</span><strong>{outlet ? outlet.name || outlet.id : "—"}</strong></div>
            <div className="cp-rq-kv"><span>Type</span><strong className={`tone-${typeInfo.tone}`}>{typeInfo.label}</strong></div>
            <div className="cp-rq-kv"><span>Services</span><strong>{picked.length ? picked.join(", ") : "—"}</strong></div>
            <div className="cp-rq-kv"><span>When</span><strong>{date ? formatDate(date) : "Any date"} · {SLOT_LABEL[slot]}</strong></div>
            <button type="submit" form="cp-rq-form" className="cp-rq-send" disabled={saving}>
              <FiSend aria-hidden="true" /> {saving ? "Sending…" : "Send request"}
            </button>
            <p className="cp-rq-hint">You can cancel it while it’s waiting for our team.</p>
          </section>

          <section className="cp-card cp-rq-list">
            <header>
              <h3>Your requests</h3>
              <button className="cp-icon-btn" onClick={() => setReloadKey((n) => n + 1)} aria-label="Refresh"><FiRefreshCw /></button>
            </header>
            {listError && <div className="cp-alert">{listError}</div>}
            {listLoading && requests.length === 0 ? (
              <PortalLoader compact label="Loading your requests…" />
            ) : requests.length === 0 ? (
              <div className="cp-rq-empty">No requests yet. Your requests will show here with their status.</div>
            ) : (
              <ul>
                {requests.map((r) => {
                  const st = REQUEST_STATUS[r.status] || { label: r.status, tone: "slate", Icon: FiClock };
                  const StIcon = st.Icon;
                  return (
                    <li key={r.id} className="cp-rq-item">
                      <div className="cp-rq-item-top">
                        <span className={`cp-rq-item-icon tone-${st.tone}`} aria-hidden="true"><StIcon /></span>
                        <span className="cp-rq-item-text">
                          <strong>{serviceLabel(r.service_type)} · {r.sub_services.length} service{r.sub_services.length === 1 ? "" : "s"}</strong>
                          <small>Sent {formatDate(r.created_at)} · {r.site_name || "—"}</small>
                        </span>
                        <span className={`cp-rq-pill tone-${st.tone}`}>{st.label}</span>
                      </div>
                      <small className="cp-rq-item-services">{r.sub_services.join(" · ")}</small>
                      {r.preferred_date && <small className="cp-rq-item-services"><FiCalendar aria-hidden="true" /> Preferred {formatDate(r.preferred_date)}</small>}
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
        </aside>
      </div>
    </div>
  );
}
