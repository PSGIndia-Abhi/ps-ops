// The Lead Management data layer.
//
// Screens only ever talk to the functions and the hook exported here. What is
// on screen is one snapshot of the server's data, kept in memory:
//
//   staff (telecaller / sales / sales manager / admin)
//       GET /api/crm/lead-workspace - leads, meetings, history, names and
//       providers the signed-in person may see, in one read
//   lead provider
//       GET /api/crm/provider/leads (+ each lead's published feedback) -
//       only their own submissions and only what they are allowed to know
//
// Every write goes to its own endpoint and then reloads the snapshot, so the
// screen always shows what the server actually saved.

import { useSyncExternalStore } from "react";
import { API_BASE, apiFetch, safeJson } from "../../api";
import { KNOWN_VISIT_OUTCOMES, PROVIDER_SOURCE, sourceLabel } from "./constants";

const EMPTY = { ready: false, error: "", me: null, leads: [], meetings: [], activities: [], providers: [], people: [], leadSources: [], lossReasons: [] };

let state = EMPTY;
const listeners = new Set();

function commit(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

/** { ready, error, me, leads, meetings, activities, providers } - re-renders when any of them change. */
export function useLeadData() {
  return useSyncExternalStore(subscribe, snapshot);
}

const isProviderLogin = () => localStorage.getItem("role") === "lead_provider";

// ---- talking to the server --------------------------------------------------

/** Calls the API and returns its JSON; a refusal becomes an Error carrying the server's own message. */
async function request(endpoint, { method = "GET", body, form } = {}) {
  const res = await apiFetch(endpoint, { method, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
  // apiFetch has already sent the browser to /login when the session has ended.
  if (!res) throw new Error("Your session has ended. Please sign in again.");
  const data = await safeJson(res);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status}).`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---- reading the server's rows ---------------------------------------------

/** A wall-clock "YYYY-MM-DD HH:MM:SS" from the server as a value `new Date()` reads in local time. */
const wall = (value) => (value ? String(value).replace(" ", "T") : null);

/** "2026-10-09T05:30:00.000Z" -> "2026-10-09T11:00" in the user's own time zone, which is what the server stores. */
function toWallClock(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The locality of an address ("12, Whitefield, Bengaluru" -> "Whitefield"), for the leads-by-location chart. */
function areaOf(address) {
  const parts = String(address || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

/** The screens know one "converted" and one "lost" stage; the server has two of each. */
function stageOf(raw) {
  if (!raw) return "NEW";
  if (raw === "CONVERTED") return "WON";
  if (raw === "CANCELLED") return "LOST";
  return raw;
}

function toLead(row, closingNote) {
  const quote = Number(row.amount) || 0;
  return {
    id: row.id,
    number: row.lead_number || "-",
    company: row.company_name || row.customer_name || "",
    contact: row.customer_name || "",
    phone: row.phone || "",
    altPhone: row.alternate_phone || "",
    email: row.email || "",
    address: row.location || "",
    area: areaOf(row.location),
    source: sourceLabel(row.lead_source),
    quote,
    requirement: row.notes || "",
    stage: stageOf(row.pipeline_stage),
    providerId: row.provider_id,
    createdBy: row.created_by_user_id,
    telecallerId: row.assigned_telecaller_id,
    salesId: row.assigned_sales_employee_id,
    priority: quote >= 500000 ? "HIGH" : "NORMAL",
    reason: row.loss_reason || closingNote || "",
    providerFeedback: row.latest_feedback || "",
    nextFollowUpAt: wall(row.next_follow_up_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    // Sent back with an edit, so the server can refuse one made over someone else's newer change.
    rowVersion: Number(row.row_version) || 0,
  };
}

function toMeeting(row) {
  // The outcome is saved as "Outcome: notes" (or just notes); pull a known outcome back out.
  const saved = row.outcome_notes || "";
  const outcome = KNOWN_VISIT_OUTCOMES.find((o) => saved === o || saved.startsWith(`${o}:`)) || "";
  const outcomeNotes = outcome ? saved.slice(outcome.length).replace(/^:\s*/, "") : saved;
  const office = row.meeting_type === "OFFICE";
  return {
    id: row.id,
    leadId: row.lead_id,
    salesId: row.sales_employee_id,
    type: office ? "MEETING" : "SITE_VISIT",
    locationType: office ? "OFFICE" : "CUSTOMER",
    address: row.meeting_address || "",
    scheduledAt: wall(row.scheduled_at),
    status: row.status === "SCHEDULED" && row.check_in_at ? "IN_PROGRESS" : row.status,
    outcome,
    notes: outcomeNotes || row.notes || "",
    checkInAt: wall(row.check_in_at),
    checkOutAt: wall(row.check_out_at),
  };
}

/** One row of the lead's history as the timeline shows it. */
function toActivity(row) {
  const by = row.changed_by_name || "";
  const note = row.note || "";
  const who = by ? ` by ${by}` : "";
  const base = { id: `a-${row.id}`, leadId: row.lead_id, by, at: row.changed_at, note: "" };
  switch (row.action) {
    case "CREATE":
      return { ...base, type: "CREATED", text: `Lead created${who}` };
    case "ASSIGN_TELECALLER":
      return { ...base, type: "STATUS", text: note || "Taken for verification" };
    case "CALL_LOGGED":
      return { ...base, type: "CALL", text: `Called${who}`, note };
    case "QUALIFY":
      return /GENUINE/.test(note) && !/NEEDS_INFO/.test(note)
        ? { ...base, type: "QUALIFIED", text: "Marked as Genuine Lead" }
        : { ...base, type: "STATUS", text: "Marked as Need More Information" };
    case "REJECT":
      return { ...base, type: "REJECTED", text: `Marked as Not Genuine${note ? ` - ${note}` : ""}` };
    case "MEETING_SCHEDULED":
      return { ...base, type: "MEETING", text: note || "Meeting scheduled" };
    case "MEETING_RESCHEDULED":
      return { ...base, type: "MEETING", text: "Meeting rescheduled", note };
    case "MEETING_CANCELLED":
      return { ...base, type: "MEETING", text: "Meeting cancelled", note };
    case "VISIT_CHECK_IN":
      return { ...base, type: "VISIT", text: `Visit started${who}` };
    case "VISIT_COMPLETED":
      return { ...base, type: "VISIT", text: `Site visit completed${who}`, note };
    case "QUOTATION_SENT":
      return { ...base, type: "QUOTATION", text: `Quotation sent${note ? ` (${note})` : ""}` };
    case "FOLLOW_UP_SCHEDULED":
      return { ...base, type: "STATUS", text: "Follow-up scheduled", note };
    case "FEEDBACK_SENT":
      return { ...base, type: "STATUS", text: "Feedback sent to the lead provider", note };
    case "MARK_LOST":
      return { ...base, type: "LOST", text: `Marked as Lost${note ? ` - ${note}` : ""}` };
    case "CONVERTED":
      return { ...base, type: "WON", text: "Lead converted to customer", note };
    default:
      return { ...base, type: "STATUS", text: String(row.action || "Updated").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), note };
  }
}

// ---- loading ----------------------------------------------------------------

async function loadStaff() {
  const [data, lossReasons] = await Promise.all([
    request("/api/crm/lead-workspace"),
    // The reason picker falls back to its own list if this one cannot be read.
    request("/api/crm/lead-loss-reasons").catch(() => []),
  ]);

  // Why a lead was closed, for a lead closed with a typed reason rather than one from the list.
  const closingNote = new Map();
  for (const h of data.activities) {
    if (h.action === "REJECT" || h.action === "MARK_LOST") closingNote.set(h.lead_id, h.note);
  }

  const leads = data.leads.map((row) => toLead(row, closingNote.get(row.id)));
  const activities = data.activities.map(toActivity);
  // A lead from before the history existed still needs a first line on its timeline.
  const started = new Set(data.activities.filter((h) => h.action === "CREATE").map((h) => h.lead_id));
  for (const lead of leads) {
    if (!started.has(lead.id)) activities.push({ id: `a-created-${lead.id}`, leadId: lead.id, type: "CREATED", text: "Lead created", by: "", at: lead.createdAt, note: "" });
  }

  return {
    me: { id: data.me.id, name: data.me.name, canManage: !!data.me.can_manage, canConvert: !!data.me.can_convert },
    leads,
    // A cancelled meeting no longer belongs on anyone's agenda; the timeline still records it.
    meetings: data.meetings.filter((m) => m.status !== "CANCELLED").map(toMeeting),
    activities,
    people: data.people,
    lossReasons,
    providers: data.providers.map((p, i) => ({
      id: p.user_id,
      userId: p.user_id,
      code: `LP-${String(i + 1).padStart(3, "0")}`,
      name: p.organization_name,
      contact: p.contact_name,
      phone: p.phone,
      email: p.email,
      active: p.is_active,
    })),
  };
}

/** The provider portal's five statuses, as the stage the screens draw. */
const PROVIDER_STAGE = { under_review: "NEW", qualified: "QUALIFIED", rejected: "NOT_GENUINE", converted: "WON" };

async function loadProvider() {
  const [meRow, rows, sources] = await Promise.all([
    request("/api/auth/me"),
    request("/api/crm/provider/leads"),
    request("/api/crm/provider/lead-sources").catch(() => []),
  ]);
  const myId = String(meRow.id);

  // Only what staff chose to publish to this provider - never internal notes.
  const feedback = await Promise.all(rows.map((row) => request(`/api/crm/provider/leads/${row.id}/feedback`).catch(() => [])));

  const activities = [];
  const leads = rows.map((row, i) => {
    const createdAt = wall(row.created_at);
    const messages = feedback[i];
    activities.push({ id: `a-created-${row.id}`, leadId: row.id, type: "CREATED", text: "Lead submitted", by: "", at: createdAt, note: "" });
    messages.forEach((f) => activities.push({ id: `a-${f.id}`, leadId: row.id, type: "STATUS", text: f.message, by: "", at: wall(f.created_at), note: "" }));
    const quote = Number(row.approx_quote_amount) || 0;
    return {
      id: row.id,
      number: row.lead_number || "-",
      company: row.company_name || row.contact_person || "",
      contact: row.contact_person || "",
      phone: row.phone_number || "",
      altPhone: row.alternate_phone || "",
      email: row.email || "",
      address: row.address || "",
      area: areaOf(row.address),
      source: row.lead_source || PROVIDER_SOURCE,
      quote,
      requirement: row.requirement || "",
      stage: PROVIDER_STAGE[row.status] || "NEW",
      providerId: myId,
      createdBy: myId,
      telecallerId: null,
      salesId: null,
      priority: quote >= 500000 ? "HIGH" : "NORMAL",
      reason: "",
      providerFeedback: messages.length ? messages[messages.length - 1].message : "",
      nextFollowUpAt: null,
      createdAt,
      updatedAt: messages.length ? wall(messages[messages.length - 1].created_at) : createdAt,
    };
  });

  return {
    me: { id: myId, name: meRow.name || "", providerId: myId },
    leads,
    meetings: [],
    activities,
    people: [],
    leadSources: sources,
    providers: [{ id: myId, userId: myId, code: "", name: meRow.name || "", contact: meRow.name || "", phone: meRow.phone || "", email: meRow.email || "", active: true }],
  };
}

// Only the newest load may write its result - an older, slower one must not overwrite it.
let loadSeq = 0;

/** Reads everything again from the server. Called when the lead area opens and after every change. */
export async function loadWorkspace() {
  const mine = ++loadSeq;
  try {
    const next = await (isProviderLogin() ? loadProvider() : loadStaff());
    if (mine === loadSeq) commit({ ...next, ready: true, error: "" });
  } catch (err) {
    if (mine === loadSeq) commit({ ready: true, error: err.message || "Could not load leads." });
  }
}

/** Forgets what was loaded, so the next person to sign in on this browser never glimpses it. */
export function resetWorkspace() {
  loadSeq += 1;
  state = EMPTY;
  listeners.forEach((fn) => fn());
}

// ---- names ------------------------------------------------------------------

export const userName = (id) => state.people.find((u) => u.id === id)?.name || state.providers.find((p) => p.userId === id)?.name || "";
/** The provider organisation; for someone who cannot see the provider list, the name of the provider's login. */
export const providerName = (id) => state.providers.find((p) => p.id === id)?.name || state.people.find((u) => u.id === id)?.name || "";
/** Who a meeting can be given to. */
export const salesTeam = () => state.people.filter((u) => u.can_visit).map((u) => ({ id: u.id, name: u.name, role: "sales" }));
export const telecallers = () => state.people.filter((u) => u.role === "telecaller").map((u) => ({ id: u.id, name: u.name, role: "telecaller" }));

/** The sources a lead provider may pick, straight from the server's list. */
export const providerSources = () => state.leadSources.map((s) => s.name);

/** The server's list of reasons a lead is closed (not genuine or lost); empty if it could not be read. */
export const lossReasons = () => state.lossReasons.map((r) => r.name);
/** The id of a reason from that list, so the server records it against the lead (and its reports count it). */
const lossReasonId = (name) => state.lossReasons.find((r) => r.name === name)?.id;

/** Leads that share this phone number or company name (the duplicate warning). */
export function findDuplicates({ phone, company }, exceptId) {
  const digits = String(phone || "").replace(/\D/g, "");
  const name = String(company || "").trim().toLowerCase();
  return state.leads.filter(
    (l) => l.id !== exceptId && ((digits.length === 10 && l.phone === digits) || (name.length > 2 && l.company.toLowerCase() === name)),
  );
}

const leadById = (id) => state.leads.find((l) => l.id === id);

// ---- writes -----------------------------------------------------------------

/** A reference the server accepts ("APP-" + 8..36 letters, digits or dashes) to recognise a retried save. */
const newClientRef = () => `APP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** POST /provider/leads (a provider) or POST /leads (staff). New leads go to the telecaller queue. */
export async function submitLead(input, actor) {
  let created;
  if (actor.providerId) {
    const body = {
      leadType: "COMMERCIAL",
      companyName: input.company.trim(),
      contactPerson: input.contact.trim(),
      phoneNumber: input.phone,
      email: input.email?.trim() || "",
      address: input.address.trim(),
      area: input.area?.trim() || "",
      leadSourceId: state.leadSources.find((s) => s.name === input.source)?.id,
      approxQuoteAmount: Number(input.quote),
      requirement: input.requirement.trim(),
    };
    try {
      created = await request("/api/crm/provider/leads", { method: "POST", body });
    } catch (err) {
      // The server found an open lead with this phone number and wants a deliberate yes.
      if (err.status !== 409 || !err.data?.possible_duplicate) throw err;
      const existing = err.data.existing_lead;
      const ok = window.confirm(
        `${existing?.company_name || "A lead"} (${existing?.lead_number || "existing lead"}) already uses this phone number.\n\nSubmit this as a separate enquiry anyway?`,
      );
      if (!ok) throw new Error("Not submitted - a lead with this phone number already exists.");
      created = await request("/api/crm/provider/leads", { method: "POST", body: { ...body, confirmDuplicate: true } });
    }
  } else {
    created = await request("/api/crm/leads", {
      method: "POST",
      body: {
        client_ref: newClientRef(),
        lead_type: "commercial",
        customer_name: input.contact.trim(),
        company_name: input.company.trim(),
        phone: input.phone,
        alternate_phone: input.altPhone || "",
        email: input.email?.trim() || "",
        location: input.address.trim(),
        lead_source: input.source,
        amount: Number(input.quote),
        notes: input.requirement?.trim() || "",
      },
    });
  }
  await loadWorkspace();
  return leadById(created.id) || { id: created.id, number: created.lead_number || "", company: input.company.trim() };
}

/**
 * The result of a verification call: logs it, then makes the decision it led to.
 * outcome: "GENUINE" | "NEED_MORE_INFO" | "NOT_GENUINE" | "CALL_BACK"
 */
export async function saveCall(leadId, { outcome, notes, reason, followUpAt, feedback }) {
  if (outcome === "NOT_GENUINE" && !reason) throw new Error("Choose a reason for marking this lead not genuine.");
  const lead = leadById(leadId);
  const base = `/api/crm/leads/${leadId}`;
  try {
    // A new lead has to be taken for verification before the server will qualify it.
    if (lead?.stage === "NEW") await request(`${base}/assign-telecaller`, { method: "POST", body: { telecaller_id: Number(state.me.id) } });

    await request(`${base}/call-activities`, {
      method: "POST",
      body: {
        outcome: outcome === "CALL_BACK" ? "CALLBACK_REQUESTED" : "CONNECTED",
        qualificationStatus: { GENUINE: "GENUINE", NEED_MORE_INFO: "NEEDS_INFO", NOT_GENUINE: "NOT_GENUINE" }[outcome],
        comments: notes?.trim() || undefined,
      },
    });

    if (outcome === "GENUINE") await request(`${base}/qualify`, { method: "POST", body: { status: "GENUINE" } });
    if (outcome === "NEED_MORE_INFO" && lead?.stage !== "NEED_MORE_INFO") await request(`${base}/qualify`, { method: "POST", body: { status: "NEEDS_INFO" } });
    if (outcome === "NOT_GENUINE") await request(`${base}/reject`, { method: "POST", body: { reason, loss_reason_id: lossReasonId(reason) } });

    if (followUpAt && (outcome === "NEED_MORE_INFO" || outcome === "CALL_BACK")) {
      const [date, time] = toWallClock(followUpAt).split("T");
      await request(`${base}/follow-ups`, { method: "POST", body: { nextActionDate: date, nextActionTime: time, note: notes?.trim() || "" } });
    }
    if (feedback?.trim() && lead?.providerId) await request(`${base}/feedback`, { method: "POST", body: { message: feedback.trim() } });
  } finally {
    // Some steps may have been saved even if a later one failed - show whatever is true now.
    await loadWorkspace();
  }
}

/** POST /leads/{id}/meetings - also creates the sales person's task in Task Management. */
export async function scheduleMeeting(leadId, { salesId, scheduledAt, locationType, address, notes }) {
  if (!salesId) throw new Error("Choose the sales person for this meeting.");
  if (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() - 60000) throw new Error("Choose a meeting time in the future.");
  const meeting = await request(`/api/crm/leads/${leadId}/meetings`, {
    method: "POST",
    body: {
      salesEmployeeId: Number(salesId),
      scheduledAt: toWallClock(scheduledAt),
      meetingType: locationType === "OFFICE" ? "OFFICE" : "SITE_VISIT",
      meetingAddress: address.trim(),
      notes: notes?.trim() || "",
    },
  });
  await loadWorkspace();
  return meeting;
}

/** POST /meetings/{id}/complete - the outcome of a visit. Only the sales person it is assigned to may do this. */
export async function completeVisit(meetingId, { outcome, notes }) {
  const extra = notes?.trim();
  await request(`/api/crm/meetings/${meetingId}/complete`, { method: "POST", body: { outcomeNotes: extra ? `${outcome}: ${extra}` : outcome } });
  await loadWorkspace();
}

/** POST /leads/{id}/convert-to-customer (won) or /leads/{id}/mark-lost (lost). */
export async function closeLead(leadId, { won, reason, notes }) {
  if (!won && !reason) throw new Error("Choose why this lead was lost.");
  const extra = notes?.trim();
  if (won) await request(`/api/crm/leads/${leadId}/convert-to-customer`, { method: "POST", body: { notes: extra || "" } });
  else {
    await request(`/api/crm/leads/${leadId}/mark-lost`, {
      method: "POST",
      body: { reason: extra ? `${reason}: ${extra}` : reason, loss_reason_id: lossReasonId(reason) },
    });
  }
  await loadWorkspace();
}

/**
 * PATCH /leads/{id} - corrects a lead's details. Sends the version last read, so an edit made
 * over someone else's newer change is refused (409) instead of silently overwriting it.
 */
export async function updateLead(leadId, input) {
  const lead = leadById(leadId);
  if (!lead) throw new Error("That lead is no longer available.");
  try {
    await request(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      body: {
        row_version: lead.rowVersion,
        company_name: input.company.trim(),
        contact_person: input.contact.trim(),
        phone_number: input.phone,
        alternate_phone: input.altPhone || "",
        email: input.email?.trim() || "",
        address: input.address.trim(),
        requirement: input.requirement.trim(),
        approx_quote_amount: Number(input.quote),
      },
    });
  } finally {
    // On a 409 this brings in the newer version, so a retry starts from what is really saved.
    await loadWorkspace();
  }
}

/** PATCH /meetings/{id}/reschedule - moves the meeting and the sales person's task with it. */
export async function rescheduleMeeting(meetingId, { scheduledAt, reason }) {
  if (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() - 60000) throw new Error("Choose a new time in the future.");
  await request(`/api/crm/meetings/${meetingId}/reschedule`, {
    method: "PATCH",
    body: { scheduledAt: toWallClock(scheduledAt), reason: reason?.trim() || undefined },
  });
  await loadWorkspace();
}

/** POST /meetings/{id}/cancel - also cancels the sales person's task. A reason is required. */
export async function cancelMeeting(meetingId, { reason }) {
  if (!reason?.trim()) throw new Error("Say why the meeting is cancelled.");
  await request(`/api/crm/meetings/${meetingId}/cancel`, { method: "POST", body: { reason: reason.trim() } });
  await loadWorkspace();
}

// ---- quotations ---------------------------------------------------------------

const toQuotation = (row) => ({
  id: row.id,
  number: row.quotation_number,
  total: Number(row.total_amount) || 0,
  status: row.status,
  sentAt: wall(row.sent_at),
  hasPdf: !!row.pdf_object_key,
});

/** GET /leads/{id}/quotations - newest first. */
export async function listQuotations(leadId) {
  const rows = await request(`/api/crm/leads/${leadId}/quotations`);
  return rows.map(toQuotation);
}

/** POST /leads/{id}/quotations with the quotation as a PDF. The lead moves to Quotation Sent. */
export async function uploadQuotation(leadId, { file, totalAmount, notes }) {
  const form = new FormData();
  form.append("file", file);
  form.append("totalAmount", String(totalAmount));
  if (notes?.trim()) form.append("notes", notes.trim().slice(0, 300));
  const row = await request(`/api/crm/leads/${leadId}/quotations`, { method: "POST", form });
  await loadWorkspace();
  return toQuotation(row);
}

/** Opens a quotation's PDF in a new tab. Fetched with the session token, since a plain link would not carry it. */
export async function openQuotationPdf(leadId, quotationId) {
  const res = await fetch(`${API_BASE}/api/crm/leads/${leadId}/quotations/${quotationId}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  });
  if (!res.ok) throw new Error((await safeJson(res))?.error || "Could not open the quotation.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  // Long enough for the new tab to load it; then the copy held in memory is released.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
