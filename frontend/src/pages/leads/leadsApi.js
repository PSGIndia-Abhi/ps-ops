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
import { PERSONAS, ROLE_ALIASES } from "./access";
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
export async function request(endpoint, { method = "GET", body, form } = {}) {
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
    // Competitor details (optional): who serves the customer now, their price, contract end, notes.
    competitorName: row.competitor_name || "",
    competitorAmount: row.competitor_amount === null || row.competitor_amount === undefined ? "" : String(Math.round(Number(row.competitor_amount))),
    competitorEnd: row.competitor_contract_end ? String(row.competitor_contract_end).slice(0, 10) : "",
    competitorNotes: row.competitor_notes || "",
    industry: row.industry_type || "",
    services: Array.isArray(row.services_requested) ? row.services_requested : [], // Quotation Master service ids
    serviceNames: Array.isArray(row.services_requested_names) ? row.services_requested_names : [],
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

/** "2026-10-10 18:18:00" -> "10 Oct, 6:18 pm", for a date the server wrote into a history note. */
function noteDate(value) {
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}
const DATE_IN_NOTE = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)/;
/** A history note with its raw "YYYY-MM-DD HH:MM:SS" written the way people read dates. */
const readableNote = (note) => note.replace(DATE_IN_NOTE, (m) => noteDate(m));

const CALL_OUTCOME = { CONNECTED: "Call connected", NO_ANSWER: "Call not answered", CALLBACK_REQUESTED: "Customer asked for a call back", INVALID_NUMBER: "Invalid number" };
const CALL_RESULT = { GENUINE: "genuine", NEEDS_INFO: "needs more information", NOT_GENUINE: "not genuine" };

/** One row of the lead's history as the timeline shows it. */
function toActivity(row) {
  const by = row.changed_by_name || "";
  const note = row.note || "";
  const who = by ? ` by ${by}` : "";
  // byId / action: who did it and the raw step, for counting (the dashboard's "My Activity").
  const base = { id: `a-${row.id}`, leadId: row.lead_id, by, byId: row.changed_by ?? null, action: row.action, at: row.changed_at, note: "" };
  switch (row.action) {
    case "CREATE":
      return { ...base, type: "CREATED", text: note.includes("provider portal") ? `Lead submitted${who} (Lead Provider)` : `Lead created${who}` };
    case "ASSIGN_TELECALLER":
      return { ...base, type: "STATUS", text: `Taken for verification${who}` };
    case "CALL_LOGGED": {
      // Saved as "OUTCOME (RESULT): comments" - read back as words, with only the comments as the note.
      const m = note.match(/^([A-Z_]+)(?: \(([A-Z_]+)\))?(?::\s*([\s\S]*))?$/);
      if (!m) return { ...base, type: "CALL", text: `Called${who}`, note };
      const result = CALL_RESULT[m[2]] ? ` - ${CALL_RESULT[m[2]]}` : "";
      return { ...base, type: "CALL", text: `${CALL_OUTCOME[m[1]] || "Call logged"}${result}${who}`, note: m[3] || "" };
    }
    case "QUALIFY":
      return /GENUINE/.test(note) && !/NEEDS_INFO/.test(note)
        ? { ...base, type: "QUALIFIED", text: "Marked as Genuine Lead" }
        : { ...base, type: "STATUS", text: "Marked as Need More Information" };
    case "REJECT":
      return { ...base, type: "REJECTED", text: `Marked as Not Genuine${note ? ` - ${note}` : ""}` };
    case "MEETING_SCHEDULED":
      return { ...base, type: "MEETING", text: note ? `${readableNote(note).replace(" for ", " on ")}` : "Meeting scheduled", note: by ? `Scheduled by ${by}` : "" };
    case "MEETING_RESCHEDULED":
      return { ...base, type: "MEETING", text: `Meeting rescheduled${who}`, note: readableNote(note) };
    case "MEETING_CANCELLED":
      return { ...base, type: "MEETING", text: "Meeting cancelled", note };
    case "VISIT_CHECK_IN":
      return { ...base, type: "VISIT", text: `Visit started${who}` };
    case "VISIT_COMPLETED":
      return { ...base, type: "VISIT", text: `Site visit completed${who}`, note };
    case "QUOTATION_CANCELLED": {
      // Saved as "QT-2026-000013 cancelled: reason".
      const [number, ...rest] = note.split(" cancelled: ");
      return { ...base, type: "QUOTATION", text: `Quotation ${number} cancelled${who}`, note: rest.join(" cancelled: ") };
    }
    case "QUOTATION_SENT":
      return { ...base, type: "QUOTATION", text: `Quotation sent${note ? ` (${note})` : ""}` };
    case "FOLLOW_UP_SCHEDULED":
      return { ...base, type: "STATUS", text: `Follow-up scheduled${who}`, note: readableNote(note) };
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
  const [data, lossReasons, leadSources] = await Promise.all([
    request("/api/crm/lead-workspace"),
    // The reason and source pickers fall back to their own lists if these cannot be read.
    request("/api/crm/lead-loss-reasons").catch(() => []),
    request("/api/crm/lead-sources").catch(() => []),
  ]);

  // Why a lead was closed, for a lead closed with a typed reason rather than one from the list.
  const closingNote = new Map();
  for (const h of data.activities) {
    if (h.action === "REJECT" || h.action === "MARK_LOST") closingNote.set(h.lead_id, h.note);
  }

  // A lead a sales executive added for themselves never goes through a telecaller.
  const salesIds = new Set(data.people.filter((p) => p.role === "sales" || ROLE_ALIASES[p.role] === "sales").map((p) => p.id));
  const leads = data.leads.map((row) => ({
    ...toLead(row, closingNote.get(row.id)),
    salesOwn: !row.provider_id && !row.assigned_telecaller_id && salesIds.has(row.created_by_user_id),
  }));
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
    leadSources,
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

/** The provider portal's journey step, as the stage the screens draw. */
const PROVIDER_PROGRESS = {
  SUBMITTED: "NEW",
  IN_VERIFICATION: "TO_CALL",
  VERIFIED: "QUALIFIED",
  MEETING_SCHEDULED: "MEETING_SCHEDULED",
  VISIT_COMPLETED: "VISIT_COMPLETED",
  QUOTATION_SENT: "QUOTATION_SENT",
  CONVERTED: "WON",
  NOT_GENUINE: "NOT_GENUINE",
  LOST: "LOST",
};
/** The older, coarser status - used only if the server does not send `progress`. */
const PROVIDER_STAGE = { under_review: "NEW", qualified: "QUALIFIED", rejected: "NOT_GENUINE", converted: "WON" };

/** When each step of the journey was reached, as dates the screens read ({ verified, meeting, visit, quotation, closed }). */
const toMilestones = (m = {}) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, wall(v)]));

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
    // Each step the lead has reached, as the provider may know it: when, never who or why.
    const ms = toMilestones(row.milestones);
    const rejected = row.progress === "NOT_GENUINE";
    const lost = row.progress === "LOST";
    const steps = [
      ["verified", rejected ? "REJECTED" : "QUALIFIED", rejected ? "Verification complete - not taken forward" : "Verified as a genuine lead"],
      ["meeting", "MEETING", "Sales meeting scheduled"],
      ["visit", "VISIT", "Site visit completed"],
      ["quotation", "QUOTATION", "Quotation sent to the customer"],
      ["closed", lost ? "LOST" : "WON", lost ? "Closed - not proceeding" : "Converted to a customer"],
    ];
    for (const [key, type, text] of steps) {
      if (ms[key]) activities.push({ id: `a-${key}-${row.id}`, leadId: row.id, type, text, by: "", at: ms[key], note: "" });
    }
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
      stage: PROVIDER_PROGRESS[row.progress] || PROVIDER_STAGE[row.status] || "NEW",
      milestones: { submitted: createdAt, ...toMilestones(row.milestones) },
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
/** A role as people read it: "sales_manager" -> "Sales Manager", "sales" -> "Sales Executive". */
export const roleLabel = (role) =>
  PERSONAS[ROLE_ALIASES[role] || role]?.label || String(role || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** Who a meeting can be given to, each with their role. */
export const salesTeam = () => state.people.filter((u) => u.can_visit).map((u) => ({ id: u.id, name: u.name, role: u.role, title: roleLabel(u.role) }));
export const telecallers = () => state.people.filter((u) => u.role === "telecaller").map((u) => ({ id: u.id, name: u.name, role: "telecaller" }));

/** GET /lead-assignees - who the sales manager can give a lead to: [{ id, name, role }]. */
export const fetchAssignees = () => request("/api/crm/lead-assignees").then((list) => (Array.isArray(list) ? list.map((p) => ({ ...p, id: String(p.id) })) : []));

/** POST /leads/{id}/assign - the sales manager gives the lead to someone; the lists reload. */
export async function assignLead(leadId, userId) {
  await request(`/api/crm/leads/${leadId}/assign`, { method: "POST", body: { user_id: Number(userId) } });
  await loadWorkspace();
}

/** "Sales Executive" / "Telecaller" / "Sales Manager" for an assignee's role. */
export const assigneeRole = (role) => (role === "telecaller" ? "Telecaller" : role === "sales_manager" ? "Sales Manager" : role || "");

/** The active sources from the lead source master - what the lead forms offer. */
export const providerSources = () => state.leadSources.map((s) => s.name);

// ---- lead source master (sales manager / admin) -------------------------------

/** GET /lead-sources?all=1 - every source, switched-off ones too, with how many leads use each. */
export async function listAllSources() {
  const rows = await request("/api/crm/lead-sources?all=1");
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.is_active !== false, leads: Number(r.lead_count) || 0 }));
}

/** POST /lead-sources - a new source, active straight away. */
export async function addSource(name) {
  await request("/api/crm/lead-sources", { method: "POST", body: { name: name.trim() } });
  await loadWorkspace(); // the lead forms pick it up
}

/** PATCH /lead-sources/{id} - rename and/or switch on or off. A rename carries over to the leads using it. */
export async function updateSource(id, { name, active }) {
  await request(`/api/crm/lead-sources/${id}`, {
    method: "PATCH",
    body: { ...(name !== undefined ? { name: name.trim() } : {}), ...(active !== undefined ? { is_active: active } : {}) },
  });
  await loadWorkspace();
}

// ---- quotation master (sales manager / admin) --------------------------------

/** GET /quote-master?all=1 - services (with treatment rows and prices), plans and clauses, switched-off ones too. */
export const getQuoteMaster = () => request("/api/crm/quote-master?all=1");

/** POST /quote-services - `{ name, description }`; returns the new service. */
export const addQuoteService = (body) => request("/api/crm/quote-services", { method: "POST", body });
/** PATCH /quote-services/{id} - any of name, description, sort_order, is_active. */
export const updateQuoteService = (id, body) => request(`/api/crm/quote-services/${id}`, { method: "PATCH", body });
/** PUT /quote-services/{id}/treatments - replaces the service's treatment rows, in this order. */
export const saveQuoteTreatments = (id, treatments) => request(`/api/crm/quote-services/${id}/treatments`, { method: "PUT", body: { treatments } });

/** PUT /quote-prices - `[{ service_id, plan_id, price }]`; a null price takes the plan off that service. */
export const saveQuotePrices = (prices) => request("/api/crm/quote-prices", { method: "PUT", body: { prices } });

/** POST /quote-plans - `{ name, billing: ONE_TIME|MONTHLY, visits_per_month }`. */
export const addQuotePlan = (body) => request("/api/crm/quote-plans", { method: "POST", body });
/** PATCH /quote-plans/{id} - any of name, billing, visits_per_month, sort_order, is_active. */
export const updateQuotePlan = (id, body) => request(`/api/crm/quote-plans/${id}`, { method: "PATCH", body });

/** POST /quote-clauses - `{ kind: VALUE_ADDED|TERMS, text, is_default }`. */
export const addQuoteClause = (body) => request("/api/crm/quote-clauses", { method: "POST", body });
/** PATCH /quote-clauses/{id} - any of text, is_default, sort_order, is_active. */
export const updateQuoteClause = (id, body) => request(`/api/crm/quote-clauses/${id}`, { method: "PATCH", body });

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

/** The competitor fields of a lead form, as the server takes them (all optional). */
const competitorBody = (input) => ({
  competitor_name: input.competitorName?.trim() || "",
  competitor_amount: input.competitorAmount ? Number(input.competitorAmount) : null,
  competitor_contract_end: input.competitorEnd || null,
  competitor_notes: input.competitorNotes?.trim() || "",
});

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
        industry_type: input.industry || null,
        services_requested: input.services || [],
        // Sales manager: who the lead goes to (a sales executive, or themselves).
        assign_to: input.assignTo || undefined,
        ...competitorBody(input),
      },
    });
  }
  await loadWorkspace();
  return leadById(created.id) || { id: created.id, number: created.lead_number || "", company: input.company.trim() };
}

/**
 * The result of a verification call: logs it, then makes the decision it led to.
 * outcome: "GENUINE" | "NEED_MORE_INFO" | "NOT_GENUINE" | "CALL_BACK" | "NO_ANSWER" | "INVALID_NUMBER"
 * The last three only log the call: the lead stays with the telecaller.
 */
// `me`: the caller - a follow-up set from the call is their own task (it shows in their Task Management).
export async function saveCall(leadId, { outcome, notes, reason, followUpAt, feedback }, me) {
  if (outcome === "NOT_GENUINE" && !reason) throw new Error("Choose a reason for marking this lead not genuine.");
  const lead = leadById(leadId);
  const base = `/api/crm/leads/${leadId}`;
  try {
    // A new lead has to be taken for verification before the server will qualify it.
    if (lead?.stage === "NEW") await request(`${base}/assign-telecaller`, { method: "POST", body: { telecaller_id: Number(state.me.id) } });

    await request(`${base}/call-activities`, {
      method: "POST",
      body: {
        outcome: { CALL_BACK: "CALLBACK_REQUESTED", NO_ANSWER: "NO_ANSWER", INVALID_NUMBER: "INVALID_NUMBER" }[outcome] || "CONNECTED",
        qualificationStatus: { GENUINE: "GENUINE", NEED_MORE_INFO: "NEEDS_INFO", NOT_GENUINE: "NOT_GENUINE" }[outcome],
        comments: notes?.trim() || undefined,
      },
    });

    if (outcome === "GENUINE") await request(`${base}/qualify`, { method: "POST", body: { status: "GENUINE" } });
    if (outcome === "NEED_MORE_INFO" && lead?.stage !== "NEED_MORE_INFO") await request(`${base}/qualify`, { method: "POST", body: { status: "NEEDS_INFO" } });
    if (outcome === "NOT_GENUINE") await request(`${base}/reject`, { method: "POST", body: { reason, loss_reason_id: lossReasonId(reason) } });

    if (followUpAt && FOLLOW_UP_OUTCOMES.includes(outcome)) {
      const [date, time] = toWallClock(followUpAt).split("T");
      await request(`${base}/follow-ups`, {
        method: "POST",
        body: { nextActionDate: date, nextActionTime: time, note: notes?.trim() || "", assignedTo: me?.id ? Number(me.id) : undefined },
      });
    }
    if (feedback?.trim() && lead?.providerId) await request(`${base}/feedback`, { method: "POST", body: { message: feedback.trim() } });
  } finally {
    // Some steps may have been saved even if a later one failed - show whatever is true now.
    await loadWorkspace();
  }
}

/** Call results that need another call, so they ask when. */
export const FOLLOW_UP_OUTCOMES = ["NEED_MORE_INFO", "CALL_BACK", "NO_ANSWER"];

/**
 * POST /leads/{id}/follow-ups - a follow-up at any time, not only from a verification call.
 * It becomes a task in Task Management for `assignedTo` (the signed-in person when not given).
 */
export async function addFollowUp(leadId, { at, note, assignedTo, remindAt, taskId }) {
  if (!at || new Date(at).getTime() < Date.now() - 60000) throw new Error("Choose a follow-up time in the future.");
  const [date, time] = toWallClock(at).split("T");
  await request(`/api/crm/leads/${leadId}/follow-ups`, {
    method: "POST",
    body: {
      nextActionDate: date,
      nextActionTime: time,
      note: note?.trim() || "",
      assignedTo: Number(assignedTo || state.me.id),
      // `taskId`: that one follow-up moves to the new time (and note) - nothing new is added.
      ...(taskId ? { taskId: String(taskId) } : {}),
      ...reminderBody(remindAt),
    },
  });
  await loadWorkspace();
}

/** POST /leads/{id}/feedback - an update the lead provider sees next to their lead. */
export async function sendProviderUpdate(leadId, message) {
  if (!message?.trim()) throw new Error("Write the update for the lead provider.");
  await request(`/api/crm/leads/${leadId}/feedback`, { method: "POST", body: { message: message.trim() } });
  await loadWorkspace();
}

/** A GPS point the app recorded, or null. */
const pointOf = (lat, lng) => (lat !== null && lat !== undefined && lng !== null && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : null);

/** One visit with where it started and ended, as the visit history and Team Visits show it. */
function toVisit(row) {
  return {
    ...toMeeting(row),
    salesName: row.sales_employee_name || "",
    startedAt: wall(row.check_in_at),
    endedAt: wall(row.check_out_at),
    startPoint: pointOf(row.check_in_lat, row.check_in_lng),
    endPoint: pointOf(row.check_out_lat, row.check_out_lng),
    outcomeText: row.outcome_notes || "",
  };
}

/** GET /leads/{id}/meetings - every meeting of the lead, newest first, cancelled ones included. */
export async function leadVisits(leadId) {
  const rows = await request(`/api/crm/leads/${leadId}/meetings`);
  return rows.map(toVisit);
}

/** GET /team-visits?date= - one day's visits by the team (sales managers only). */
export async function teamVisits(date) {
  const rows = await request(`/api/crm/team-visits?date=${encodeURIComponent(date)}`);
  return rows.map((row) => ({
    ...toVisit(row),
    company: row.company_name || row.customer_name || "",
    leadNumber: row.lead_number || "",
    leadBy: row.lead_created_by_name || "",
  }));
}

/** GET /leads/{id}/meetings/open - the lead's meeting still to happen, or null. A lead has at most one. */
export async function getOpenMeeting(leadId) {
  const { meeting } = await request(`/api/crm/leads/${leadId}/meetings/open`);
  if (!meeting) return null;
  return {
    id: meeting.id,
    scheduledAt: wall(meeting.scheduled_at),
    type: meeting.meeting_type === "OFFICE" ? "MEETING" : "SITE_VISIT",
    salesName: meeting.sales_employee_name || "",
    started: !!meeting.check_in_at,
  };
}

/** POST /leads/{id}/meetings - also creates the sales person's task in Task Management. 409 when one is already open. */
/**
 * The optional reminder of a meeting / follow-up ('YYYY-MM-DDTHH:MM' from the form, or empty): nothing
 * rings for a meeting or follow-up unless one is set. Checked here so the form shows the reason.
 */
function reminderBody(remindAt) {
  if (!remindAt) return {};
  const at = new Date(remindAt);
  if (Number.isNaN(at.getTime())) throw new Error("Pick the reminder date and time.");
  if (at.getTime() <= Date.now()) throw new Error("The reminder time has already passed. Pick a later time.");
  const [reminderDate, reminderTime] = toWallClock(at.toISOString()).split("T");
  return { reminderDate, reminderTime: reminderTime.slice(0, 5) };
}

export async function scheduleMeeting(leadId, { salesId, scheduledAt, locationType, address, notes, remindAt }) {
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
      ...reminderBody(remindAt),
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

/**
 * The sales person a lead belongs to: its assigned sales person, else the sales executive / manager
 * who added it. Null when neither is a sales person (e.g. a provider's lead nobody holds yet).
 */
export function leadSalesOwner(lead) {
  const isSales = (u) => u && ["sales", "sales_manager"].includes(ROLE_ALIASES[u.role] || u.role);
  const byId = (id) => (id ? state.people.find((u) => String(u.id) === String(id)) : null);
  const assigned = byId(lead.salesId);
  if (isSales(assigned)) return assigned;
  const creator = byId(lead.createdBy);
  return isSales(creator) ? creator : null;
}

/**
 * POST /leads/{id}/convert-to-customer (won) or /leads/{id}/mark-lost (lost).
 * `creditTo`: who a conversion counts for (the sales manager converting a sales executive's lead).
 */
export async function closeLead(leadId, { won, reason, notes, creditTo }) {
  if (!won && !reason) throw new Error("Choose why this lead was lost.");
  const extra = notes?.trim();
  if (won) {
    await request(`/api/crm/leads/${leadId}/convert-to-customer`, {
      method: "POST",
      body: { notes: extra || "", ...(creditTo ? { credit_to: Number(creditTo) } : {}) },
    });
  }
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
        industry_type: input.industry || null,
        services_requested: input.services || [],
        ...competitorBody(input),
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

// ---- notifications (the shared /api/notifications, lead events only) ----------

/** The signed-in person's latest lead notifications, newest first: { items, unread }. */
export async function getNotifications() {
  const rows = await request("/api/notifications?limit=30");
  const items = rows
    .filter((n) => n.entity_type === "lead")
    .map((n) => ({ id: n.id, type: n.type, title: n.title, text: n.message, leadId: n.entity_id, at: wall(n.created_at), read: !!n.is_read }));
  return { items, unread: items.filter((n) => !n.read).length };
}

export const markNotificationRead = (id) => request(`/api/notifications/${id}/read`, { method: "PATCH" });
/**
 * Marks these lead notifications read one by one - not the server's read-all, which would also
 * clear an admin's job and invoice notifications they have not seen.
 */
export const markNotificationsRead = (ids) => Promise.all(ids.map((id) => markNotificationRead(id).catch(() => null)));

// ---- reports, conversion and today's tasks -------------------------------------
// Read on demand by the screen that shows them; they are not part of the workspace snapshot.

/**
 * GET /reports/sales-performance - one person's numbers for a period (YYYY-MM-DD, both days included).
 * No `employeeId` means the signed-in person; anyone else needs a lead-management permission.
 */
/** GET /targets?month=YYYY-MM - monthly targets: the sales manager gets the team, others themselves. */
export const getTargets = (month) => request(`/api/crm/targets${month ? `?month=${month}` : ""}`).then((rows) => (Array.isArray(rows) ? rows : []));

/** PUT /targets/{userId} - the sales manager sets a month's target (0 / empty removes it). */
export const setTarget = (userId, month, amount) => request(`/api/crm/targets/${userId}`, { method: "PUT", body: { month, target_amount: Number(amount) || 0 } });

export async function getPerformance({ from, to, employeeId }) {
  const query = new URLSearchParams({ from, to });
  if (employeeId) query.set("employeeId", String(employeeId));
  return request(`/api/crm/reports/sales-performance?${query}`);
}

/** GET /reports/sales-performance/items - the records behind one number of the report, by the same rules. */
export async function getPerformanceItems({ metric, from, to, employeeId }) {
  const query = new URLSearchParams({ metric, from, to });
  if (employeeId) query.set("employeeId", String(employeeId));
  const data = await request(`/api/crm/reports/sales-performance/items?${query}`);
  return Array.isArray(data?.items) ? data.items : [];
}

/** GET /targets/history - one sales person's last months against their targets, and their lifetime total. */
export const getTargetHistory = (userId, months = 6) =>
  request(`/api/crm/targets/history?months=${months}${userId ? `&userId=${userId}` : ""}`);

/** GET /leads/{id}/conversion - the customer a converted lead became; null when it has not been converted. */
export async function getConversion(leadId) {
  try {
    const row = await request(`/api/crm/leads/${leadId}/conversion`);
    return {
      companyId: row.company_id,
      companyName: row.company_name || "",
      convertedBy: row.converted_by_name || "",
      convertedAt: wall(row.converted_at),
      notes: row.notes || "",
    };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** GET /my-tasks/today - the signed-in person's open lead tasks (follow-up calls, visits) due today. */
export async function getTodayTasks() {
  const rows = await request("/api/crm/my-tasks/today");
  return rows.map((t) => ({
    id: t.id,
    leadId: t.lead_id,
    title: t.title,
    type: t.task_type === "LEAD_MEETING" ? "MEETING" : "FOLLOW_UP",
    status: t.status,
    // due_time is "HH:MM:SS" or empty for a task due "some time today".
    dueAt: t.due_time ? `${t.due_date}T${String(t.due_time).slice(0, 5)}` : null,
    company: t.company_name || t.customer_name || "",
    number: t.lead_number || "",
  }));
}

/** Who appears in the team report: everyone who works leads, never a lead provider. */
export const leadTeam = () => state.people.filter((u) => u.role !== "lead_provider");

// ---- quotations ---------------------------------------------------------------

/**
 * The file a quotation PDF downloads as: CLIENTNAME_PROPOSAL_YEAR.pdf, e.g. ABC_Foods_Pvt_Ltd_PROPOSAL_2026.pdf
 * (the same rule as the server's proposalFileName).
 */
export function proposalFileName(clientName, year = new Date().getFullYear()) {
  const name = String(clientName || "Customer").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Customer";
  return `${name}_PROPOSAL_${year}.pdf`;
}

const toQuotation = (row) => ({
  id: row.id,
  // Kept for the records (PDF, lead history); the screens show the client name instead.
  number: row.quotation_number,
  clientName: row.client_name || "",
  fileName: row.file_name || proposalFileName(row.client_name),
  total: Number(row.total_amount) || 0,
  status: row.status,
  sentAt: wall(row.sent_at),
  hasPdf: !!row.pdf_object_key,
  // Built with Create Quotation (its details are saved), so it can be edited or duplicated.
  hasContent: !!row.has_content,
  createdBy: row.created_by === null || row.created_by === undefined ? "" : String(row.created_by),
});

/** POST /leads/{id}/quotations/{qid}/cancel - takes a quotation back; it is kept, marked Cancelled. */
export async function cancelQuotation(leadId, quotationId, reason) {
  if (!reason?.trim()) throw new Error("Say why this quotation is cancelled.");
  await request(`/api/crm/leads/${leadId}/quotations/${quotationId}/cancel`, { method: "POST", body: { reason: reason.trim() } });
  await loadWorkspace();
}

/** GET /leads/{id}/quotations - newest first. */
export async function listQuotations(leadId) {
  const rows = await request(`/api/crm/leads/${leadId}/quotations`);
  return rows.map(toQuotation);
}

/** GET /leads/{id}/quotations/{qid}/content - what a quotation built here was made from, to edit or duplicate it. */
export const getQuotationContent = (leadId, quotationId) => request(`/api/crm/leads/${leadId}/quotations/${quotationId}/content`);

// ---- quotation builder (quotations made from the quotation master) -----------

/** GET /quote-master - the active services (with treatment rows and prices), plans and clauses. */
export const getActiveQuoteMaster = () => request("/api/crm/quote-master");

/** POST /leads/{id}/quotations/preview - the quotation as a DRAFT PDF; returns a blob URL (revoke it when done). */
export async function previewQuotation(leadId, content) {
  const res = await apiFetch(`/api/crm/leads/${leadId}/quotations/preview`, { method: "POST", body: JSON.stringify(content) });
  if (!res) throw new Error("Your session has ended. Please sign in again.");
  if (!res.ok) throw new Error((await safeJson(res))?.error || "Could not make the preview.");
  return URL.createObjectURL(await res.blob());
}

/**
 * POST /leads/{id}/quotations/generate - numbers and saves the quotation and its PDF; the lead moves to
 * Quotation Sent. replacesQuotationId (an edit): that quotation is marked Cancelled, replaced by this one.
 */
export async function generateQuotation(leadId, content, { replacesQuotationId } = {}) {
  const body = replacesQuotationId ? { ...content, replacesQuotationId } : content;
  const row = await request(`/api/crm/leads/${leadId}/quotations/generate`, { method: "POST", body });
  await loadWorkspace();
  return toQuotation(row);
}

/**
 * A quotation's PDF as a blob URL (revoke it when done), shown in the page's own viewer so its
 * Download button can save it under the proposal's name. Fetched with the session token, since a
 * plain link would not carry it.
 */
export async function fetchQuotationPdf(leadId, quotationId) {
  const res = await fetch(`${API_BASE}/api/crm/leads/${leadId}/quotations/${quotationId}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  });
  if (!res.ok) throw new Error((await safeJson(res))?.error || "Could not open the quotation.");
  return URL.createObjectURL(await res.blob());
}
