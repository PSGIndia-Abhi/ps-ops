import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiOutlineInboxStack, HiOutlineMagnifyingGlass, HiOutlineMapPin, HiOutlineCalendarDays, HiOutlineUser,
  HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineArrowPath, HiOutlineXMark, HiOutlineChatBubbleLeftEllipsis,
} from "react-icons/hi2";
import { apiFetch, safeJson } from "../../api";
import StatusAlertModal from "../../components/StatusAlertModal";
import CompanyAvatar from "../clientAccounts/CompanyAvatar";
import CreateBookingModal from "../../components/CreateBookingModal";
import "./ServiceRequests.css";

// Admin > Service Requests: requests from the Client Portal. Assign opens the normal Create Booking
// form pre-filled from the request; Decline sends a note back to the client.

const TABS = [
  { key: "NEW", label: "New" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "REJECTED", label: "Declined" },
  { key: "CANCELLED", label: "Cancelled by client" },
  { key: "all", label: "All" },
];
const TYPE_LABEL = { PEST: "Pest Control", DEEP: "Cleaning", BOTH: "Pest Control + Cleaning" };
const SLOT_LABEL = { ANY: "Any time", MORNING: "Morning", AFTERNOON: "Afternoon", EVENING: "Evening" };

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(v) {
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function toInputDate(v) {
  const d = v ? new Date(v) : new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lets the sidebar badge refresh right after an assign/decline.
const notifyCountChanged = () => window.dispatchEvent(new Event("service-requests-changed"));

export default function ServiceRequests() {
  const [tab, setTab] = useState("NEW");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ counts: {}, requests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/service-requests?status=${tab}`);
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Failed to load requests");
      setData({ counts: body.counts || {}, requests: body.requests || [] });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.requests;
    return data.requests.filter((r) =>
      [r.company_name, r.site_name, r.requested_by_name, ...(r.sub_services || [])].some((v) => v && v.toLowerCase().includes(q))
    );
  }, [data.requests, search]);

  const assignFailed = useCallback((message) => {
    setAssigning(null);
    setStatus({ type: "error", message });
  }, []);

  function done(message) {
    setAssigning(null);
    setDeclining(null);
    setStatus({ type: "success", message });
    notifyCountChanged();
    load();
  }

  return (
    <div className="sr-page">
      <header className="sr-hero">
        <div className="sr-hero-icon"><HiOutlineInboxStack /></div>
        <div>
          <h2>Service Requests</h2>
          <p>Requests sent by clients from their portal. Assign one to create the job, or decline it with a note.</p>
        </div>
        <div className="sr-hero-stat">
          <strong>{data.counts.NEW ?? 0}</strong>
          <span>waiting</span>
        </div>
      </header>

      <div className="sr-toolbar">
        <div className="sr-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}<span>{data.counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="sr-search">
          <HiOutlineMagnifyingGlass aria-hidden="true" />
          <input type="search" placeholder="Search company, outlet, service" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button className="sr-icon-btn" onClick={load} aria-label="Refresh" title="Refresh"><HiOutlineArrowPath /></button>
      </div>

      {error && <div className="sr-error">{error}</div>}

      {loading && data.requests.length === 0 ? (
        <div className="sr-list">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="sr-card sr-skeleton" />)}</div>
      ) : shown.length === 0 ? (
        <div className="sr-empty">
          <HiOutlineCheckCircle aria-hidden="true" />
          <strong>{tab === "NEW" ? "All caught up" : "Nothing here"}</strong>
          <span>{tab === "NEW" ? "New client requests will appear here." : "No requests match this filter."}</span>
        </div>
      ) : (
        <div className="sr-list">
          {shown.map((r) => (
            <article key={r.id} className={`sr-card status-${r.status.toLowerCase()}`}>
              <div className="sr-card-head">
                <CompanyAvatar name={r.company_name} size={44} />
                <div className="sr-card-title">
                  <strong>{r.company_name || r.company_id}</strong>
                  <span><HiOutlineMapPin aria-hidden="true" /> {r.site_name}{r.branch_name ? ` · ${r.branch_name}` : ""}</span>
                </div>
                <span className={`sr-badge ${r.status.toLowerCase()}`}>{r.status === "NEW" ? "New" : r.status === "REJECTED" ? "Declined" : r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
              </div>

              <div className="sr-type">{TYPE_LABEL[r.service_type] || r.service_type}</div>
              <div className="sr-pills">{r.sub_services.map((s) => <span key={s}>{s}</span>)}</div>

              <div className="sr-meta">
                <span><HiOutlineCalendarDays aria-hidden="true" /> {r.preferred_date ? fmtDate(r.preferred_date) : "Any date"} · {SLOT_LABEL[r.preferred_slot] || "Any time"}</span>
                <span><HiOutlineUser aria-hidden="true" /> {r.requested_by_name}{r.requested_by_phone ? ` · ${r.requested_by_phone}` : ""}</span>
                <span className="sr-ago">{timeAgo(r.created_at)}</span>
              </div>

              {r.notes && <p className="sr-notes"><HiOutlineChatBubbleLeftEllipsis aria-hidden="true" /> {r.notes}</p>}
              {r.staff_note && r.status !== "NEW" && (
                <p className={`sr-staff-note ${r.status === "REJECTED" ? "bad" : ""}`}>
                  {r.status === "REJECTED" ? "Declined" : "Note to client"}: {r.staff_note}{r.handled_by_name ? ` — ${r.handled_by_name}` : ""}
                </p>
              )}
              {r.status === "ASSIGNED" && !r.staff_note && r.handled_by_name && (
                <p className="sr-staff-note">Assigned by {r.handled_by_name} on {fmtDate(r.handled_at)}</p>
              )}

              {r.status === "NEW" && (
                <div className="sr-actions">
                  <button className="sr-btn ghost" onClick={() => setDeclining(r)}><HiOutlineXCircle /> Decline</button>
                  <button className="sr-btn" onClick={() => setAssigning(r)}><HiOutlineCheckCircle /> Assign</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {assigning && <AssignWithBooking request={assigning} onClose={() => setAssigning(null)} onDone={done} onError={assignFailed} />}
      {declining && <DeclineModal request={declining} onClose={() => setDeclining(null)} onDone={done} />}
      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}

// Assign = the normal Create Booking form (same as Bookings / Feedback Desk), pre-filled from the
// request: outlet contact, service type, services, preferred date and the client's notes.
// After the booking is saved through POST /api/bookings, the request is marked assigned.
async function usersByRole(role) {
  const res = await apiFetch(`/api/users?role=${role}`);
  if (!res?.ok) return [];
  const data = await safeJson(res);
  return Array.isArray(data) ? data : [];
}

function AssignWithBooking({ request, onClose, onDone, onError }) {
  const [ready, setReady] = useState(null); // { contactId, supervisors, technicians }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [detailRes, supervisors, technicians] = await Promise.all([
          apiFetch(`/api/service-requests/${request.id}`),
          usersByRole("supervisor"),
          usersByRole("technician"),
        ]);
        const detail = await safeJson(detailRes);
        if (!detailRes?.ok) throw new Error(detail?.error || "Failed to load request");
        const primary = detail.contacts.find((c) => c.is_primary) || detail.contacts[0];
        if (live) setReady({ contactId: primary?.id || "", supervisors, technicians });
      } catch (err) {
        if (live) onError(err.message);
      }
    })();
    return () => {
      live = false;
    };
  }, [request.id, onError]);

  async function createBooking(form) {
    const res = await apiFetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        client: { contact_id: form.contact_id, serviceType: form.serviceType },
        subServices: form.subServices,
        address: form.location || null,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes,
        recurrence: form.recurrence || null,
        serviceSchedules: form.serviceSchedules,
        supervisor_id: form.supervisor_id ?? null,
        technician_ids: form.technician_ids ?? [],
      }),
    });
    if (!res.ok) {
      let message = "Create booking failed";
      try {
        const data = await res.clone().json();
        message = data.error || message;
      } catch {
        // not JSON
      }
      throw new Error(message);
    }
    const data = await res.json();
    const bookingId = data.jobs?.[0]?.booking_id;
    if (bookingId) {
      const linkRes = await apiFetch(`/api/service-requests/${request.id}/booked`, {
        method: "POST",
        body: JSON.stringify({ booking_id: bookingId }),
      });
      if (!linkRes?.ok) {
        const body = await safeJson(linkRes);
        throw new Error(body?.error || "The booking was created, but the request could not be marked as assigned.");
      }
    }
    onDone(`Booking created${data.jobs?.length ? ` · job${data.jobs.length === 1 ? "" : "s"} ${data.jobs.map((j) => j.code).join(", ")}` : ""}. The client can now see it.`);
  }

  if (!ready) {
    return (
      <div className="sr-modal-backdrop">
        <div className="sr-modal sr-modal-sm sr-loading-modal"><div className="sr-skeleton" style={{ height: 80, borderRadius: 12 }} /><p>Opening booking form…</p></div>
      </div>
    );
  }

  const preferred = request.preferred_date ? toInputDate(request.preferred_date) : "";
  const noteParts = [`Client portal request by ${request.requested_by_name || "client"}`];
  if (request.preferred_slot && request.preferred_slot !== "ANY") noteParts.push(`Preferred time: ${SLOT_LABEL[request.preferred_slot]}`);
  if (request.notes) noteParts.push(request.notes);

  return (
    <CreateBookingModal
      isOpen
      onClose={onClose}
      onCreate={createBooking}
      supervisors={ready.supervisors}
      technicians={ready.technicians}
      initialContactId={ready.contactId}
      initialSubServices={request.sub_services}
      siteId={request.site_id}
      initialServiceType={request.service_type}
      initialStartDate={preferred}
      initialNotes={noteParts.join(" · ")}
    />
  );
}

function DeclineModal({ request, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!note.trim()) return setError("Tell the client why.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/service-requests/${request.id}/reject`, { method: "POST", body: JSON.stringify({ staff_note: note }) });
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Failed to decline");
      onDone("Request declined. The client can see your note.");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="sr-modal-backdrop" onClick={() => !saving && onClose()}>
      <form className="sr-modal sr-modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="sr-modal-head">
          <div>
            <h3>Decline request</h3>
            <p>{request.company_name} · {request.site_name}</p>
          </div>
          <button type="button" className="sr-icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><HiOutlineXMark /></button>
        </header>
        {error && <div className="sr-error">{error}</div>}
        <label className="sr-field"><span>Reason (shown to the client)</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. This is already covered under your monthly contract" autoFocus />
        </label>
        <div className="sr-modal-actions">
          <button type="button" className="sr-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="sr-btn danger" disabled={saving}>{saving ? "Declining…" : "Decline request"}</button>
        </div>
      </form>
    </div>
  );
}
