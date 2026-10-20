// Shared helpers for the Lead Management module (commercial crm_leads +
// crm_lead_* tables). Separate concern from the consumer-lead/Razorpay code
// already in crm.routes.js, which this never touches.

const { v4: uuid } = require("uuid");
const { getTeamUserIds } = require("./hierarchy");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Appends to the lead's single audit trail. Call activities, qualify, reject,
// assignment and edits all land here, so GET /leads/:id/timeline is one
// unified, chronological feed -- not several lists the UI has to merge itself.
async function logLeadHistory(executor, leadId, action, { note = null, changedBy = null } = {}) {
  await executor.query(
    `INSERT INTO crm_lead_history (lead_id, action, note, changed_by) VALUES (?, ?, ?, ?)`,
    [leadId, action, note, changedBy]
  );
}

// Reuses the same counter-table pattern already used for job codes
// (`sequences`), locked for the duration of the caller's transaction.
async function nextSequenceNumber(conn, sequenceName, prefix) {
  const [[locked]] = await conn.query("SELECT value FROM sequences WHERE name = ? FOR UPDATE", [sequenceName]);
  const next = Number(locked.value) + 1;
  await conn.query("UPDATE sequences SET value = ? WHERE name = ?", [next, sequenceName]);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(next).padStart(6, "0")}`;
}
const nextLeadNumber = (conn) => nextSequenceNumber(conn, "crm_lead_number", "LD");
const nextQuotationNumber = (conn) => nextSequenceNumber(conn, "crm_quotation_number", "QT");

function hasPerm(req, permission) {
  return req.user.role === "admin" || Boolean(req.user.permissions?.includes(permission));
}

// Which user ids' leads the requester may see: own always; + team with
// VIEW_TEAM_LEADS/MANAGE_LEADS; or null (no filter) with VIEW_ALL_LEADS/admin.
// "Own" covers all three relationships a commercial lead can have to a user:
// who created it, who's calling it, who's visiting it.
async function resolveVisibleUserIds(executor, req) {
  if (hasPerm(req, "VIEW_ALL_LEADS")) return null;
  const ids = new Set([Number(req.user.id)]);
  if (hasPerm(req, "VIEW_TEAM_LEADS") || hasPerm(req, "MANAGE_LEADS")) {
    for (const id of await getTeamUserIds(executor, req.user.id)) ids.add(id);
  }
  return [...ids];
}

// True if `userId` is involved with this lead (creator, telecaller, or sales
// rep) -- i.e. it's "their own" regardless of any permission.
function isOwnLead(lead, userId) {
  const id = Number(userId);
  return (
    Number(lead.created_by_user_id) === id ||
    Number(lead.assigned_telecaller_id) === id ||
    Number(lead.assigned_sales_employee_id) === id
  );
}

// A commercial lead a sales executive added themselves stays with them and with whoever manages
// leads (sales manager, admin). Everyone else - a telecaller, even with VIEW_ALL_LEADS, or a lead
// provider - never sees it unless they are on the lead (creator, telecaller or sales rep).
// The commercial sales executive's role is "Sales Executive" (the org-hierarchy role, which also
// works in Task Management). "sales" is the residential CRM role, and the commercial leads it
// created earlier are not a sales executive's own.
const SALES_EXECUTIVE_ROLES = ["Sales Executive"];
const SALES_EXECUTIVE_USER_IDS_SQL =
  "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN (?)";

function seesSalesOwnLeads(req) {
  return req.user.role === "admin" || hasPerm(req, "MANAGE_LEADS");
}

// A telecaller works the leads that lead providers send in: their queue holds only those, plus any
// lead already on them (one they were assigned or took for verification). Leads added elsewhere
// (the old CRM app, an admin) go to the sales manager, who sees everything.
function isTelecaller(req) {
  return req.user.role === "telecaller" && !seesSalesOwnLeads(req);
}

// SQL for a crm_leads alias that drops what this requester must not see -> { sql, params }, or
// null when they see everything: other people's sales-own leads, and for a telecaller any lead
// that did not come from a lead provider.
function salesOwnLeadFilter(req, alias = "l") {
  if (seesSalesOwnLeads(req)) return null;
  const me = Number(req.user.id);
  const parts = [
    `(${alias}.created_by_user_id = ? OR ${alias}.assigned_telecaller_id = ? OR ${alias}.assigned_sales_employee_id = ?
      OR ${alias}.created_by_user_id NOT IN (${SALES_EXECUTIVE_USER_IDS_SQL}))`,
  ];
  const params = [me, me, me, SALES_EXECUTIVE_ROLES];
  if (isTelecaller(req)) {
    parts.push(`(${alias}.provider_id IS NOT NULL OR ${alias}.assigned_telecaller_id = ? OR ${alias}.created_by_user_id = ?)`);
    params.push(me, me);
  }
  return { sql: parts.join(" AND "), params };
}

// True if this lead is one the requester must not see: another person's sales-own lead, or for a
// telecaller a lead that did not come from a lead provider and is not on them.
async function isHiddenSalesOwnLead(executor, req, lead) {
  if (!lead || seesSalesOwnLeads(req)) return false;
  const me = Number(req.user.id);
  if (isTelecaller(req) && !lead.provider_id && Number(lead.assigned_telecaller_id) !== me && Number(lead.created_by_user_id) !== me) {
    return true;
  }
  if (isOwnLead(lead, req.user.id)) return false;
  const [[creator]] = await executor.query(
    "SELECT r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?",
    [lead.created_by_user_id]
  );
  return !!creator && SALES_EXECUTIVE_ROLES.includes(creator.role);
}

// ---------------------------------------------------------------------------
// The sales manager handing a commercial lead to someone (on the new lead form, or later with
// "Assign"): a telecaller to verify it, or a sales person (a sales executive, the manager themselves)
// to work it. Only that person - and the managers, who see everything - then see it.
// ---------------------------------------------------------------------------
const UNVERIFIED_STAGES = ["NEW", "TO_CALL", "NEED_MORE_INFO"];
// The only roles a lead (or a meeting, or a follow-up picked from a list) is given to.
const LEAD_ASSIGNEE_ROLES = ["Sales Executive", "sales_manager"];
const CLOSED_STAGES = ["WON", "CONVERTED", "NOT_GENUINE", "LOST", "CANCELLED"];

/**
 * An active user who works leads (CRM_VIEW_LEAD), with their role - or null.
 * `selfId` = the person assigning: they may always take a lead themselves, whatever their role
 * (e.g. a Managing Director / Personal Assistant working as a sales manager), without appearing in
 * anyone else's list of assignees.
 */
async function findLeadAssignee(executor, userId, selfId = null) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const self = selfId !== null && Number(selfId) === id;
  const [[user]] = await executor.query(
    `SELECT DISTINCT u.id, u.name, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
       JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = ? AND u.is_active = 1 AND p.name = 'CRM_VIEW_LEAD'${self ? "" : " AND r.name IN (?)"}`,
    self ? [id] : [id, LEAD_ASSIGNEE_ROLES]
  );
  return user || null;
}

/**
 * Where a lead goes for this assignee: { stage, telecallerId, salesId } from the lead's current
 * stage. A telecaller gets it to verify (only before it is verified). A sales person gets it to work:
 * a lead not verified yet is taken as verified - the manager vouches for it - and leaves the calling queue.
 * Returns { error } when it cannot be given to them.
 */
function assignmentFor(lead, assignee) {
  const stage = lead.pipeline_stage || "NEW";
  if (CLOSED_STAGES.includes(stage)) return { error: "This lead is closed, so it cannot be reassigned" };
  if (String(assignee.role).toLowerCase() === "telecaller") {
    if (!UNVERIFIED_STAGES.includes(stage)) return { error: "This lead is already verified - assign it to a sales person instead" };
    return { stage: stage === "NEW" ? "TO_CALL" : stage, telecallerId: assignee.id, salesId: null };
  }
  const unverified = UNVERIFIED_STAGES.includes(stage);
  return {
    stage: unverified ? "QUALIFIED" : stage,
    telecallerId: unverified ? null : lead.assigned_telecaller_id || null,
    salesId: assignee.id,
  };
}

// ---------------------------------------------------------------------------
// Competitor details on a commercial lead (all optional): who serves the customer now, their price,
// when their contract ends, and notes. -> { present, values: [name, amount, contractEnd, notes] } or { error }.
// `present` is false when the request sends none of the fields (an older app): leave them as they are.
// ---------------------------------------------------------------------------
const COMPETITOR_KEYS = ["competitor_name", "competitor_amount", "competitor_contract_end", "competitor_notes"];
function readCompetitor(body = {}) {
  const present = COMPETITOR_KEYS.some((k) => body[k] !== undefined);
  const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const name = text(body.competitor_name, 150);
  const notes = text(body.competitor_notes, 500);
  let amount = null;
  if (body.competitor_amount !== undefined && body.competitor_amount !== null && body.competitor_amount !== "") {
    amount = Number(body.competitor_amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) return { error: "Enter a valid competitor price" };
  }
  let contractEnd = null;
  if (body.competitor_contract_end) {
    contractEnd = String(body.competitor_contract_end).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contractEnd) || Number.isNaN(new Date(`${contractEnd}T00:00:00Z`).getTime())) {
      return { error: "Enter a valid contract end date" };
    }
  }
  return { present, values: [name, amount, contractEnd, notes] };
}
const COMPETITOR_SET_SQL = "competitor_name = ?, competitor_amount = ?, competitor_contract_end = ?, competitor_notes = ?";

const PIPELINE_STAGES = [
  "NEW", "TO_CALL", "QUALIFIED", "MEETING_SCHEDULED", "VISIT_COMPLETED",
  "QUOTATION_SENT", "WON", "CONVERTED", "NEED_MORE_INFO", "NOT_GENUINE", "LOST", "CANCELLED",
];

// A commercial lead's industry - the same codes as crm.routes.js (the app's form).
const INDUSTRY_TYPES = ["restaurant", "apartment", "hospital", "it", "qsr", "builder", "other"];

// ---------------------------------------------------------------------------
// The services a commercial lead asks for are the Quotation Master's services (crm_quote_services):
// crm_leads.services_requested holds their ids, comma-separated, so a quotation can start from them.
// Apps up to v1.20 still send the old fixed codes - each is taken as the master service it became.
// The names are cached for a minute (the master changes rarely) so toLead() can stay synchronous.
// ---------------------------------------------------------------------------
const LEGACY_SERVICE_NAMES = {
  gpc: "GPC",
  rodent_control: "Rat Control",
  cockroach_control: "Cockroach Control",
  ant_treatment: "Ant Treatment",
  honeybee_control: "Honey Bee Removal",
  snake_control: "Snake Control",
  fly_control: "Fly Control",
};
const SERVICE_CACHE_MS = 60 * 1000;
let serviceCache = { at: 0, byId: new Map() };

/** Loads every quote service (on or off) into the cache; reuses it for a minute unless `fresh`. */
async function loadQuoteServices(executor, { fresh = false } = {}) {
  if (!fresh && Date.now() - serviceCache.at < SERVICE_CACHE_MS) return serviceCache.byId;
  const [rows] = await executor.query("SELECT id, name, is_active FROM crm_quote_services");
  serviceCache = { at: Date.now(), byId: new Map(rows.map((r) => [String(r.id), { name: r.name, active: !!r.is_active }])) };
  return serviceCache.byId;
}

/** Drops the cache - the Quotation Master calls this after adding or renaming a service. */
function forgetQuoteServices() {
  serviceCache = { at: 0, byId: new Map() };
}

/** The names of these service ids, from the cache (an unknown id gives no name). */
function quoteServiceNames(ids) {
  return (ids || []).map((id) => serviceCache.byId.get(String(id))?.name).filter(Boolean);
}

/**
 * Checks the services sent for a lead -> { ids } or { error }. Each entry is a quote service id or
 * an old code (older apps). Services switched off in the master are still accepted, so editing an
 * older lead does not fail; the forms only offer the active ones.
 */
async function resolveLeadServices(executor, list) {
  const wanted = [...new Set((Array.isArray(list) ? list : []).map((s) => String(s || "").trim()).filter(Boolean))];
  if (!wanted.length) return { ids: [] };
  let byId = await loadQuoteServices(executor);
  if (wanted.some((s) => !byId.has(s) && !LEGACY_SERVICE_NAMES[s])) byId = await loadQuoteServices(executor, { fresh: true });
  const byName = new Map([...byId].map(([id, s]) => [s.name.toLowerCase(), id]));
  const ids = [];
  for (const s of wanted) {
    const id = byId.has(s) ? s : byName.get(String(LEGACY_SERVICE_NAMES[s] || "").toLowerCase());
    if (!id) return { error: "Invalid service requested" };
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.join(",").length > 1000) return { error: "Too many services requested" };
  return { ids };
}

module.exports = {
  INDUSTRY_TYPES, loadQuoteServices, forgetQuoteServices, quoteServiceNames, resolveLeadServices,
  uuid, isValidDate, logLeadHistory, nextLeadNumber, nextQuotationNumber, hasPerm, resolveVisibleUserIds, isOwnLead,
  SALES_EXECUTIVE_ROLES, salesOwnLeadFilter, isHiddenSalesOwnLead, PIPELINE_STAGES,
  findLeadAssignee, assignmentFor, LEAD_ASSIGNEE_ROLES, readCompetitor, COMPETITOR_SET_SQL,
};
