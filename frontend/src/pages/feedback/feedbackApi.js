// Customer Feedback module - API calls and display helpers.
// The backend (/api/feedback, src/services/feedback.service.js) is the source of truth for every
// rule; these helpers only format what it returns.
import { API_BASE, apiFetch, safeJson } from "../../api";

/** fetch + JSON + the server's error message in one place. */
export async function feedbackRequest(endpoint, options) {
  const res = await apiFetch(`/api/feedback${endpoint}`, options);
  const data = await safeJson(res);
  if (!res?.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = res?.status;
    throw err;
  }
  return data;
}

const send = (method, body) => ({ method, body: JSON.stringify(body || {}) });

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/* ---- lookups ---- */
export const getMyAccess = () => feedbackRequest("/me");
export const getPeople = () => feedbackRequest("/people");
export const getCustomers = () => feedbackRequest("/customers");

/* ---- masters ---- */
export const getQuestions = (includeInactive) => feedbackRequest(`/questions${includeInactive ? "?include_inactive=1" : ""}`);
export const saveQuestions = (questions) => feedbackRequest("/questions", send("PUT", { questions }));
export const getTemplates = () => feedbackRequest("/templates");
export const getEmailTemplates = () => feedbackRequest("/email-templates");
export const saveEmailTemplates = (templates) => feedbackRequest("/email-templates", send("PUT", { templates }));
export const saveTemplates = (templates) => feedbackRequest("/templates", send("PUT", { templates }));
export const getSettings = () => feedbackRequest("/settings");
export const saveSettings = (settings) => feedbackRequest("/settings", send("PUT", { settings }));

/* ---- monthly calls ---- */
export const listCalls = (params) => feedbackRequest(`/calls${query(params)}`);
export const takeCall = (siteId, month) => feedbackRequest("/calls", send("POST", { site_id: siteId, month }));
export const getCall = (id) => feedbackRequest(`/calls/${id}`);
export const getSiteDetails = (siteId, month) => feedbackRequest(`/sites/${encodeURIComponent(siteId)}/details${query({ month })}`);
export const recordAttempt = (id, body) => feedbackRequest(`/calls/${id}/attempts`, send("POST", body));
export const saveCallFeedback = (id, body) => feedbackRequest(`/calls/${id}/feedback`, send("POST", body));
export const raiseTicket = (id, body) => feedbackRequest(`/calls/${id}/tickets`, send("POST", body));
export const finishCall = (id, note) => feedbackRequest(`/calls/${id}/done`, send("POST", note ? { note } : {}));
export const sendFormLink = (id, contactId) => feedbackRequest(`/calls/${id}/form-link`, send("POST", { contact_id: contactId }));
export const prepareWhatsapp = (id, body) => feedbackRequest(`/calls/${id}/whatsapp`, send("POST", body));
export const giveCall = (id, collectorId) => feedbackRequest(`/calls/${id}/collector`, send("PATCH", { collector_user_id: collectorId }));

/* ---- tickets ---- */
export const listTickets = (params) => feedbackRequest(`/tickets${query(params)}`);
export const getTicket = (id) => feedbackRequest(`/tickets/${encodeURIComponent(id)}`);
export const updateTicket = (id, body) => feedbackRequest(`/tickets/${id}`, send("PATCH", body));
export const closeTicket = (id, rowVersion, note) => feedbackRequest(`/tickets/${id}/close`, send("POST", { row_version: rowVersion, close_note: note }));
export const reopenTicket = (id, rowVersion, note) => feedbackRequest(`/tickets/${id}/reopen`, send("POST", { row_version: rowVersion, note }));
export const getRevisitOptions = (id) => feedbackRequest(`/tickets/${id}/revisit-options`);

/* ---- customer report ---- */
export const getCustomerReport = (companyId, params) => feedbackRequest(`/customers/${encodeURIComponent(companyId)}/report${query(params)}`);

/** Downloads a file the API sends (needs the login token, which a plain link can't carry). */
export async function downloadFile(endpoint, fallbackName) {
  const res = await apiFetch(`/api/feedback${endpoint}`);
  if (!res?.ok) throw new Error((await safeJson(res))?.error || "Could not create the file");
  const disposition = res.headers.get("Content-Disposition") || "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const exportTickets = (params) => downloadFile(`/tickets/export${query({ ...params, format: "xlsx" })}`, "feedback-tickets.xlsx");
export const exportCustomerReport = (companyId, params, format) =>
  downloadFile(`/customers/${encodeURIComponent(companyId)}/report/export${query({ ...params, format })}`, `customer-feedback.${format}`);

/* ---- public form (no login: the token in the link is the key) ---- */
async function publicRequest(token, options) {
  const res = await fetch(`${API_BASE}/api/public/feedback/${encodeURIComponent(token)}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    const err = new Error(data?.error || "Something went wrong. Please try again.");
    err.status = res.status;
    throw err;
  }
  return data;
}
export const getPublicForm = (token) => publicRequest(token);
export const submitPublicForm = (token, body) => publicRequest(token, { method: "POST", body: JSON.stringify(body) });

/** Opens WhatsApp (app or web) with the message ready; the person presses Send there. */
export function openWhatsapp(url) {
  if (url) window.open(url, "_blank", "noopener");
}

/* ---- labels ---- */
export const CALL_STATUS = {
  TO_CALL: { label: "To call", tone: "muted" },
  NOT_ANSWERED: { label: "Not answered", tone: "warn" },
  FORM_SENT: { label: "Form sent", tone: "info" },
  FORM_RECEIVED: { label: "Form received", tone: "violet" },
  DONE: { label: "Done", tone: "ok" },
};
// A service visit's status (job_visits.status). Cancelled visits never reach the Feedback Desk.
export const VISIT_STATUS = {
  COMPLETED: { label: "Completed", tone: "ok" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "warn" },
  MISSED: { label: "Missed", tone: "danger" },
};
export const TICKET_STATUS = {
  ACTION_PENDING: { label: "Action pending", tone: "warn" },
  CLOSED: { label: "Closed", tone: "ok" },
};
export const PRIORITY = {
  HIGH: { label: "High", tone: "danger" },
  MEDIUM: { label: "Medium", tone: "orange" },
  LOW: { label: "Low", tone: "indigo" },
};
export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
export const ACTIONS = {
  RESOLVED_ON_CALL: { label: "Resolved on the call", hint: "You sorted it out on the phone. The ticket closes immediately." },
  SCHEDULE_REVISIT: { label: "Book a re-visit", hint: "A technician goes back. The visit is booked on the ticket." },
  // Older tickets only (no longer offered on a ticket).
  ESCALATE_OPERATIONS: { label: "Escalate to operations", hint: "Needs a manager to look into it." },
  OTHER: { label: "Other", hint: "Something else - type what will be done." },
};

// Actions offered now. On a ticket, "Book a re-visit" needs the visit booked from the ticket page.
export const RAISE_ACTIONS = ["RESOLVED_ON_CALL", "ESCALATE_OPERATIONS", "OTHER"];
export const TICKET_ACTIONS = ["SCHEDULE_REVISIT", "OTHER"];

/** "Visits: 1 Nov · Job 2026-871 · Mosquito Fogging; …" (older tickets) as "Services: Mosquito Fogging, …". */
function servicesLine(line) {
  const names = line
    .slice("Visits: ".length)
    .split("; ")
    .map((v) => v.split(" · ").slice(2).join(" · ").trim())
    .filter(Boolean);
  return names.length ? `Services: ${[...new Set(names)].join(", ")}` : line;
}

/** The ticket's problem text without the bad answers in it (those are shown as red chips). */
export function problemNote(issue, responses = []) {
  const bad = new Set(responses.filter((r) => r.is_bad).map((r) => `${r.question} ${r.answer}`.trim().toLowerCase()));
  return String(issue || "")
    .split("\n")
    .map((line) =>
      (line.startsWith("Visits: ") ? servicesLine(line) : line)
        .split("; ")
        .filter((part) => !bad.has(part.trim().toLowerCase()))
        .join("; ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/** "Other: Supervisor to inspect the drains" for Other, else the action's name. */
export function actionText(t) {
  return t.action === "OTHER" && t.action_note ? `Other: ${t.action_note}` : ACTIONS[t.action]?.label || t.action;
}
export const CALL_OUTCOMES = [
  { value: "ANSWERED", label: "Answered" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BUSY", label: "Busy" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
];

/* ---- dates ---- */
export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month, by) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month) {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(" ", "T") : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function formatDay(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return "—";
  const today = new Date();
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function isPast(value) {
  const d = toDate(value);
  return Boolean(d && d.getTime() <= Date.now());
}

/** A Date/ISO value -> "2026-10-30T15:30" for <input type="datetime-local">. */
export function toLocalInput(value) {
  const d = toDate(value);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-10-30T15:30" (datetime-local) -> "2026-10-30 15:30" as the API expects; "" -> null. */
export function fromLocalInput(value) {
  return value ? value.replace("T", " ").slice(0, 16) : null;
}

/** A date input "2026-11-02" -> end of that day, the resolve-by time the API expects. */
export function endOfDay(dateValue) {
  return dateValue ? `${dateValue} 18:00` : null;
}

/** The highest priority suggested by the bad answers, or null. */
export function suggestedPriority(answers) {
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  return answers.reduce((best, a) => (a?.suggested_priority && (!best || rank[a.suggested_priority] > rank[best]) ? a.suggested_priority : best), null);
}

/* ---- history ---- */
const HISTORY = {
  OPENED: ["Call taken", "muted"],
  ASSIGNED: ["Collector set", "muted"],
  CALL_ATTEMPT: ["Call", "warn"],
  FEEDBACK_SAVED: ["Feedback saved", "ok"],
  TICKET_RAISED: ["Ticket raised", "danger"],
  DONE: ["Call done", "ok"],
  FORM_LINK_SENT: ["Form link sent", "info"],
  FORM_SUBMITTED: ["Customer sent the form", "violet"],
  FORM_EXPIRED: ["Form link expired", "muted"],
  WHATSAPP_SENT: ["WhatsApp message", "info"],
  CLOSED: ["Ticket closed", "ok"],
  REOPENED: ["Ticket reopened", "warn"],
  PRIORITY_SET: ["Priority changed", "muted"],
  ACTION_SET: ["Next step changed", "muted"],
  OWNER_CHANGED: ["Owner changed", "muted"],
  UPDATED: ["Ticket updated", "muted"],
};

const TEMPLATE_NAMES = { FEEDBACK_SUMMARY: "Feedback summary", REVISIT_BOOKED: "Re-visit booked", FORM_LINK: "Form link", THANK_YOU: "Thank-you message" };

/** 919845012345 -> +91 98450 12345 (Indian mobiles), anything else as it is. */
function prettyPhone(digits) {
  const d = String(digits || "");
  return /^91\d{10}$/.test(d) ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : d;
}

/** A history note in plain words: template names instead of codes, readable phone numbers. */
function historyNote(event, note) {
  if (!note) return "";
  if (event === "WHATSAPP_SENT") {
    const m = /^(\w+) to (\w+) \((\d+)\)$/.exec(note);
    if (m) return `${TEMPLATE_NAMES[m[1]] || m[1]} to the ${m[2].toLowerCase()} · ${prettyPhone(m[3])}`;
  }
  if (event === "TICKET_RAISED") {
    // "FB-0001 · MEDIUM · Other: … - <problem text>": the number, priority and next step only
    // (the problem and the answers are on the ticket itself).
    const [number, priority, ...rest] = note.split(" - ")[0].split(" · ");
    return [number, PRIORITY[priority] ? `${PRIORITY[priority].label} priority` : priority, rest.join(" · ")].filter(Boolean).join(" · ");
  }
  return note.replace(/\b(91\d{10})\b/g, (x) => prettyPhone(x));
}

/** History rows from the API -> items for <Timeline/>: a short title, the detail, and when / who. */
export function historyItems(history) {
  return (history || []).map((h) => {
    const [label, tone] = HISTORY[h.event] || [h.event, "muted"];
    const answered = h.event === "CALL_ATTEMPT" && /^Answered/.test(h.note || "");
    return {
      key: h.id,
      title: label,
      detail: historyNote(h.event, h.note),
      sub: [formatDateTime(h.created_at), h.changed_by?.name].filter(Boolean).join(" · "),
      tone: answered ? "ok" : tone,
    };
  });
}

/** Digits only, for a tel: link. */
export function telLink(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/**
 * Opens a tab before an API call and points it at the WhatsApp link afterwards: a tab opened only
 * after an await is often blocked as a pop-up. Returns { go(url), cancel() }.
 */
export function pendingTab() {
  // One named tab for WhatsApp: the next message reuses it instead of opening another tab.
  const tab = window.open("", WHATSAPP_TAB);
  let fresh = false;
  try {
    fresh = tab?.location.href === "about:blank";
  } catch {
    fresh = false; // already showing WhatsApp (another site) - an existing tab
  }
  return {
    go(url) {
      const target = whatsappLink(url);
      if (tab && !tab.closed) tab.location.href = target;
      else window.open(target, WHATSAPP_TAB);
    },
    cancel() {
      if (fresh && tab && !tab.closed) tab.close();
    },
  };
}

const WHATSAPP_TAB = "bestserve-whatsapp";

/**
 * The backend gives a wa.me link. On a phone that opens the WhatsApp app; on a computer wa.me only
 * shows WhatsApp's "Chat on WhatsApp" page, so there the same chat and message go to WhatsApp Web,
 * which opens the chat directly when you are logged in.
 */
export function whatsappLink(waMeUrl) {
  const phoneDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const m = /^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/.exec(waMeUrl || "");
  if (phoneDevice || !m) return waMeUrl;
  return `https://web.whatsapp.com/send?phone=${m[1]}${m[2] ? `&text=${m[2]}` : ""}`;
}

/* ---- progress bars ---- */
// A step is { key, label, sub, state }: state is "done", "current", "skipped" or "todo".
function earliest(values) {
  const times = values.filter(Boolean).map((v) => new Date(v).getTime()).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.min(...times)) : null;
}

function markCurrent(steps, finished) {
  if (!finished) {
    const next = steps.find((s) => s.state === "todo");
    if (next) next.state = "current";
  }
  return steps;
}

/**
 * The feedback call's stages. info: { status, taken_at, answered_at, form_sent_at, feedback_at,
 * done_at } (null when nobody has taken the call yet) and the call's tickets.
 */
export function callStages(info, tickets = []) {
  if (!info) {
    return markCurrent(
      [
        { key: "taken", label: "Taken", sub: "Not taken yet", state: "todo" },
        { key: "reached", label: "Customer reached", state: "todo" },
        { key: "feedback", label: "Feedback received", state: "todo" },
        { key: "ticket", label: "Ticket", sub: "Only if there's an issue", state: "todo" },
        { key: "done", label: "Done", state: "todo" },
      ],
      false,
    );
  }
  const finished = info.status === "DONE";
  const reached = info.answered_at || info.feedback_at;
  const firstTicket = tickets[0];
  const steps = [
    { key: "taken", label: "Taken", sub: formatDay(info.taken_at), state: "done" },
    reached
      ? { key: "reached", label: "Customer reached", sub: formatDay(earliest([info.answered_at, info.feedback_at])), state: "done" }
      : info.form_sent_at
        ? { key: "reached", label: "Form link sent", sub: formatDay(info.form_sent_at), state: finished ? "skipped" : "todo" }
        : { key: "reached", label: "Customer reached", sub: finished ? "Not reached" : info.status === "NOT_ANSWERED" ? "Not answered yet" : undefined, state: finished ? "skipped" : "todo" },
    info.feedback_at
      ? { key: "feedback", label: "Feedback received", sub: info.status === "FORM_RECEIVED" ? "By form · review it" : formatDay(info.feedback_at), state: info.status === "FORM_RECEIVED" ? "current" : "done" }
      : { key: "feedback", label: "Feedback received", sub: finished ? "None" : undefined, state: finished ? "skipped" : "todo" },
    firstTicket
      ? { key: "ticket", label: "Ticket raised", sub: tickets.map((t) => t.ticket_number).join(", "), state: "done" }
      : { key: "ticket", label: "Ticket", sub: finished ? "Not needed" : "Only if there's an issue", state: finished ? "skipped" : "todo" },
    { key: "done", label: "Done", sub: finished ? formatDay(info.done_at) : undefined, state: finished ? "done" : "todo" },
  ];
  // While waiting for the collector's review of a form, nothing after it is current.
  if (steps.some((s) => s.state === "current")) return steps;
  return markCurrent(steps, finished);
}

/** Call stages from a full call (GET /calls/:id). */
export function callStagesFromCall(call) {
  return callStages(
    {
      status: call.status,
      taken_at: call.created_at,
      answered_at: earliest(call.call_attempts.filter((a) => a.outcome === "ANSWERED").map((a) => a.called_at)),
      form_sent_at: earliest(call.form_links.map((l) => l.created_at)),
      feedback_at: earliest(call.submissions.map((s) => s.submitted_at)),
      done_at: call.done_at,
    },
    call.tickets,
  );
}

/**
 * A ticket's stages: Raised -> Manager / Coordinator (owner) -> Technician (the re-visit booked in
 * Jobs) -> Work done (that visit completed) -> Closed (by the manager / coordinator).
 */
export function ticketStages(t) {
  const closed = t.status === "CLOSED";
  const owner = t.action_owner;
  const visit = t.revisit;
  const due = t.action_due_at && !closed ? `due ${formatDay(t.action_due_at)}${isPast(t.action_due_at) ? " · overdue" : ""}` : null;
  const onCall = t.action === "RESOLVED_ON_CALL";

  let tech;
  let work;
  if (onCall) {
    tech = { label: "Technician", sub: "Not needed", state: "skipped" };
    work = { label: "Work done", sub: "Resolved on the call", state: "skipped" };
  } else if (visit) {
    tech = { label: "Technician", sub: [visit.technicians || "Not assigned in Jobs", visit.job_code ? `Job ${visit.job_code}` : null].filter(Boolean).join(" · "), state: visit.technicians ? "done" : "todo" };
    if (visit.status === "COMPLETED") work = { label: "Work done", sub: formatDay(visit.completed_at || visit.date), state: "done" };
    else if (visit.status === "CANCELED" || visit.status === "MISSED") work = { label: "Work done", sub: `Visit ${visit.status.toLowerCase()} · rebook it`, state: "todo", late: true };
    else work = { label: "Work done", sub: visit.status === "IN_PROGRESS" ? "Technician working" : `Visit on ${formatDay(visit.date)}`, state: "todo" };
  } else {
    tech = { label: "Technician", sub: closed ? "No visit" : ["Book a re-visit", due].filter(Boolean).join(" · "), state: closed ? "skipped" : "todo" };
    work = { label: "Work done", sub: closed ? "No visit" : undefined, state: closed ? "skipped" : "todo" };
  }
  const steps = [
    { key: "raised", label: "Raised", sub: formatDay(t.created_at), state: "done" },
    onCall
      ? { key: "owner", label: "Manager / Coordinator", sub: "Not needed", state: "skipped" }
      : { key: "owner", label: "Manager / Coordinator", sub: owner ? owner.name : "All notified", state: "done" },
    { key: "tech", ...tech },
    { key: "work", ...work },
    { key: "closed", label: "Closed", sub: closed ? formatDay(t.closed_at) : work.state === "done" ? "Ready to close" : undefined, state: closed ? "done" : "todo" },
  ];
  return markCurrent(steps, closed);
}

/* ---- customer emails (Masters › Email templates; opened in Gmail, the collector edits and sends) ---- */
export const EMAIL_KINDS = {
  THANK_YOU: "Thank you",
  ISSUE_RECEIVED: "Issue received",
  ISSUE_RESOLVED: "Issue resolved",
};
export const EMAIL_PLACEHOLDERS = ["contact", "customer", "site", "month", "ticket", "issue", "revisit_note", "action_taken", "sender"];

/** The placeholder values for a customer email. info: { name, customer, site, month (2026-09), ticketNumber, issue, revisitDate, closeNote, sender }. */
export function emailValues(info) {
  return {
    contact: info.name || `${info.customer || "Customer"} team`,
    customer: info.customer || "",
    site: info.site || "",
    month: info.month ? monthLabel(info.month) : "",
    ticket: info.ticketNumber || "",
    issue: info.issue || "",
    revisit_note: info.revisitDate ? `A re-visit has been scheduled for ${formatDate(info.revisitDate)}. ` : "",
    action_taken: info.closeNote ? `Action taken: ${info.closeNote}` : "",
    sender: info.sender || "Customer Care Team",
  };
}

/** Fills a template's {placeholders}; lines left empty by a missing value (e.g. "" or {action_taken}) are dropped. */
export function fillEmail(template, values) {
  const fill = (text) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
  const body = fill(template.body)
    .split("\n")
    .filter((line) => !/^\s*["“”']{2}\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { subject: fill(template.subject).trim(), body };
}

/** Gmail's compose window with the email filled in. tf=cm is Gmail's current compose link (the older view=cm makes some accounts download an empty file). */
export function gmailComposeUrl(to, subject, body) {
  const q = [["fs", "1"], ["tf", "cm"], ["to", to || ""], ["su", subject], ["body", body]]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://mail.google.com/mail/u/0/?${q}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The active template for an email kind, or null (switched off or not loaded). */
export function emailTemplateFor(templates, kind) {
  return (templates || []).find((t) => t.code === kind && t.is_active) || null;
}

/**
 * Opens Gmail straight away with the customer email written from its template. "To" is the first
 * site contact with an email address; empty when none is saved, so the collector types it in Gmail.
 */
export function openCustomerEmail(template, info, contacts) {
  const contact = (contacts || []).find((c) => c.email && EMAIL_RE.test(c.email.trim()));
  const { subject, body } = fillEmail(template, emailValues({ ...info, name: contact?.name || info.name }));
  window.open(gmailComposeUrl(contact ? contact.email.trim() : "", subject, body), "_blank", "noopener");
}
