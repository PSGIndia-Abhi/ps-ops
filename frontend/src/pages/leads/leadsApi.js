// The Lead Management data layer.
//
// RIGHT NOW THIS IS SAMPLE DATA: everything lives in memory (see mockData.js)
// and is reset when the page is reloaded. No request goes to the server.
//
// Screens only ever talk to the functions and the hook exported here, so when
// the lead APIs are ready this is the one file to change - each function
// below names the endpoint it stands in for. Every write is async and may
// reject with an Error whose message is shown to the user, exactly as a real
// call would.

import { useSyncExternalStore } from "react";
import { USERS, buildSampleData } from "./mockData";

export const USING_SAMPLE_DATA = true;

let state = buildSampleData();
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

/** { leads, meetings, activities, providers } - re-renders when any of them change. */
export function useLeadData() {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Stands in for network latency so loading and saving states can be seen. */
const wait = (ms = 420) => new Promise((resolve) => setTimeout(resolve, ms));
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

export const userName = (id) => USERS.find((u) => u.id === id)?.name || state.providers.find((p) => p.userId === id)?.name || "";
export const providerName = (id) => state.providers.find((p) => p.id === id)?.name || "";
export const salesTeam = () => USERS.filter((u) => u.role === "sales");
export const telecallers = () => USERS.filter((u) => u.role === "telecaller");

function log(leadId, type, text, by, extra = {}) {
  return { id: uid("a"), leadId, type, text, by, at: now(), ...extra };
}

function patchLead(id, patch, activity) {
  commit({
    leads: state.leads.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now() } : l)),
    activities: activity ? [...state.activities, ...[].concat(activity)] : state.activities,
  });
}

/** Leads that share this phone number or company name (the duplicate warning). */
export function findDuplicates({ phone, company }, exceptId) {
  const digits = String(phone || "").replace(/\D/g, "");
  const name = String(company || "").trim().toLowerCase();
  return state.leads.filter(
    (l) => l.id !== exceptId && ((digits.length === 10 && l.phone === digits) || (name.length > 2 && l.company.toLowerCase() === name)),
  );
}

// ---- writes ---------------------------------------------------------------

/** POST /provider/leads (a provider) or POST /leads (staff). New leads go to the telecaller queue. */
export async function submitLead(input, actor) {
  await wait();
  const number = `LD-2026-${String(101 + state.leads.length).padStart(6, "0")}`;
  const lead = {
    id: uid("l"),
    number,
    company: input.company.trim(),
    contact: input.contact.trim(),
    phone: input.phone,
    altPhone: input.altPhone || "",
    email: input.email?.trim() || "",
    address: input.address.trim(),
    area: input.area?.trim() || "",
    source: input.source,
    quote: Number(input.quote) || 0,
    requirement: input.requirement?.trim() || "",
    stage: "NEW",
    providerId: actor.providerId || null,
    createdBy: actor.id,
    telecallerId: null,
    // A lead a sales person brings in is theirs to visit once the telecaller has verified it.
    salesId: actor.role === "sales" ? actor.id : null,
    priority: Number(input.quote) >= 500000 ? "HIGH" : "NORMAL",
    reason: "",
    providerFeedback: "",
    nextFollowUpAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  commit({
    leads: [lead, ...state.leads],
    activities: [...state.activities, log(lead.id, "CREATED", `Lead created by ${actor.name}${actor.providerId ? " (Lead Provider)" : ""}`, actor.name)],
  });
  return lead;
}

/**
 * POST /leads/{id}/call-activities, then /qualify or /reject.
 * outcome: "GENUINE" | "NEED_MORE_INFO" | "NOT_GENUINE" | "CALL_BACK"
 */
export async function saveCall(leadId, { outcome, notes, reason, followUpAt, feedback }, actor) {
  await wait();
  if (outcome === "NOT_GENUINE" && !reason) throw new Error("Choose a reason for marking this lead not genuine.");
  const stage = { GENUINE: "QUALIFIED", NEED_MORE_INFO: "NEED_MORE_INFO", NOT_GENUINE: "NOT_GENUINE", CALL_BACK: "TO_CALL" }[outcome];
  const label = {
    GENUINE: "Marked as Genuine Lead",
    NEED_MORE_INFO: "Marked as Need More Information",
    NOT_GENUINE: `Marked as Not Genuine - ${reason}`,
    CALL_BACK: "Call back requested",
  }[outcome];
  patchLead(
    leadId,
    {
      stage,
      telecallerId: actor.id,
      reason: outcome === "NOT_GENUINE" ? reason : "",
      nextFollowUpAt: outcome === "GENUINE" || outcome === "NOT_GENUINE" ? null : followUpAt || null,
      providerFeedback: feedback?.trim() || (outcome === "NOT_GENUINE" ? `Not genuine (${reason.toLowerCase()})` : outcome === "GENUINE" ? "Qualified" : ""),
    },
    [
      log(leadId, "CALL", `Called by ${actor.name}`, actor.name, { note: notes?.trim() || "" }),
      log(leadId, outcome === "GENUINE" ? "QUALIFIED" : outcome === "NOT_GENUINE" ? "REJECTED" : "STATUS", label, actor.name),
    ],
  );
}

/** POST /leads/{id}/meetings - also creates the sales person's task in Task Management. */
export async function scheduleMeeting(leadId, { salesId, scheduledAt, locationType, address, notes, type }, actor) {
  await wait();
  if (!salesId) throw new Error("Choose the sales person for this meeting.");
  if (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() - 60000) throw new Error("Choose a meeting time in the future.");
  const meeting = {
    id: uid("m"),
    leadId,
    salesId,
    type: type || "SITE_VISIT",
    locationType,
    address: address.trim(),
    scheduledAt,
    status: "SCHEDULED",
    outcome: "",
    notes: notes?.trim() || "",
    checkInAt: null,
    checkOutAt: null,
  };
  commit({ meetings: [...state.meetings, meeting] });
  patchLead(
    leadId,
    { stage: "MEETING_SCHEDULED", salesId, providerFeedback: "Meeting scheduled", nextFollowUpAt: null },
    log(leadId, "MEETING", `Meeting scheduled with ${userName(salesId)}`, actor.name, { note: meeting.notes }),
  );
  return meeting;
}

/** POST /meetings/{id}/complete - the outcome of a visit. */
export async function completeVisit(meetingId, { outcome, notes }, actor) {
  await wait();
  const meeting = state.meetings.find((m) => m.id === meetingId);
  if (!meeting) throw new Error("That meeting no longer exists.");
  commit({
    meetings: state.meetings.map((m) =>
      m.id === meetingId ? { ...m, status: "COMPLETED", outcome, notes: notes?.trim() || m.notes, checkInAt: m.checkInAt || now(), checkOutAt: now() } : m,
    ),
  });
  patchLead(
    meeting.leadId,
    { stage: outcome === "Quotation provided" ? "QUOTATION_SENT" : "VISIT_COMPLETED", providerFeedback: outcome === "Quotation provided" ? "Quotation shared" : "Visit completed" },
    [
      log(meeting.leadId, "VISIT", `Site visit completed by ${actor.name}`, actor.name, { note: notes?.trim() || "" }),
      ...(outcome === "Quotation provided" ? [log(meeting.leadId, "QUOTATION", "Quotation provided", actor.name)] : []),
    ],
  );
}

/** POST /leads/{id}/convert-to-customer (won) or /leads/{id}/mark-lost (lost). */
export async function closeLead(leadId, { won, reason, notes }, actor) {
  await wait();
  if (!won && !reason) throw new Error("Choose why this lead was lost.");
  patchLead(
    leadId,
    { stage: won ? "WON" : "LOST", reason: won ? "" : reason, providerFeedback: won ? "Customer created" : "Closed - not proceeding", nextFollowUpAt: null },
    log(leadId, won ? "WON" : "LOST", won ? "Lead converted to customer" : `Marked as Lost - ${reason}`, actor.name, { note: notes?.trim() || "" }),
  );
}

/** POST /lead-providers or PATCH /lead-providers/{id} - a provider company and its login. */
export async function saveProvider(input) {
  await wait();
  if (state.providers.some((p) => p.id !== input.id && p.email.toLowerCase() === input.email.trim().toLowerCase())) {
    throw new Error("Another provider already uses this email address.");
  }
  if (input.id) {
    commit({ providers: state.providers.map((p) => (p.id === input.id ? { ...p, ...input } : p)) });
    return;
  }
  const code = `LP-${String(state.providers.length + 1).padStart(3, "0")}`;
  commit({ providers: [...state.providers, { ...input, id: uid("p"), code, userId: uid("u"), active: true }] });
}

export async function setProviderActive(id, active) {
  await wait(260);
  commit({ providers: state.providers.map((p) => (p.id === id ? { ...p, active } : p)) });
}
