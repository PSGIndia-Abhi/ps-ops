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

const PIPELINE_STAGES = [
  "NEW", "TO_CALL", "QUALIFIED", "MEETING_SCHEDULED", "VISIT_COMPLETED",
  "QUOTATION_SENT", "WON", "CONVERTED", "NEED_MORE_INFO", "NOT_GENUINE", "LOST", "CANCELLED",
];

module.exports = {
  uuid, isValidDate, logLeadHistory, nextLeadNumber, nextQuotationNumber, hasPerm, resolveVisibleUserIds, isOwnLead,
  SALES_EXECUTIVE_ROLES, salesOwnLeadFilter, isHiddenSalesOwnLead, PIPELINE_STAGES,
};
