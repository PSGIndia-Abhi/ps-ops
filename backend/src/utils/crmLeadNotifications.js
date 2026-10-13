// Notifications for the commercial lead flow, written to the shared
// `notifications` table (entity_type 'lead'). Who hears about what:
//
//   telecallers      a new lead to verify
//   sales person     a meeting given to them, moved or cancelled; a follow-up given to them
//   sales managers   verified leads, visits, quotations, conversions and losses
//   lead provider    each step their own lead reaches - in their words, never internal notes or names
//   creator (staff)  what happened to a lead they added
//
// The person whose action it was is never notified. Sending is best effort:
// call notifyLead(...) after the change is saved, and it never throws.

const { pool } = require("../../db");
const { notifyUsers } = require("../services/notifications.service");

async function activeUsersWithRole(roleName) {
  const [rows] = await pool.query(
    "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ? AND u.is_active = 1",
    [roleName]
  );
  return rows.map((r) => r.id);
}

/** Everyone who manages leads (MANAGE_LEADS) - the sales managers. */
async function leadManagers() {
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.name = 'MANAGE_LEADS' AND u.is_active = 1`
  );
  return rows.map((r) => r.id);
}

/** "2026-10-10 18:18:00" -> "10 Oct, 6:18 PM" (the wall-clock time as stored). */
function when(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = Number(m[4]);
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * event: SUBMITTED | VERIFIED | NOT_GENUINE | MEETING_SCHEDULED | MEETING_RESCHEDULED |
 *        MEETING_CANCELLED | VISIT_COMPLETED | QUOTATION_SENT | CONVERTED | LOST |
 *        FEEDBACK | FOLLOW_UP_ASSIGNED
 * extra: { scheduledAt, salesId, reason, message, assignedTo, dueAt }
 */
async function notifyLead(leadId, event, { actorId = null, extra = {} } = {}) {
  try {
    const [[lead]] = await pool.query(
      `SELECT l.id, l.lead_number, l.company_name, l.customer_name, l.provider_id, l.created_by_user_id,
              l.assigned_telecaller_id, l.assigned_sales_employee_id, pp.organization_name AS provider_org
         FROM crm_leads l LEFT JOIN crm_lead_provider_profiles pp ON pp.user_id = l.provider_id
        WHERE l.id = ?`,
      [leadId]
    );
    if (!lead) return;

    const name = lead.company_name || lead.customer_name || "A lead";
    const ref = lead.lead_number ? ` (${lead.lead_number})` : "";
    const base = { entityType: "lead", entityId: lead.id };
    const opts = { exceptUserId: actorId };
    // The creator hears about their own lead only when it is a staff lead, not a provider's.
    const staffCreator = lead.provider_id ? null : lead.created_by_user_id;
    const send = (userIds, type, title, message) => notifyUsers(userIds, { ...base, type, title, message }, opts);
    const toProvider = (title, message) => (lead.provider_id ? send([lead.provider_id], "LEAD_PROVIDER_UPDATE", title, message) : null);

    switch (event) {
      case "SUBMITTED":
        await send(await activeUsersWithRole("telecaller"), "LEAD_NEW", `New lead to verify: ${name}`,
          `${lead.lead_number || "A new lead"}${lead.provider_org ? ` from ${lead.provider_org}` : ""} is waiting for a verification call.`);
        break;
      case "VERIFIED":
        await send([...(await leadManagers()), staffCreator], "LEAD_VERIFIED", `Lead verified: ${name}`,
          `${lead.lead_number || "The lead"} was marked genuine and is ready for a sales meeting.`);
        await toProvider("Your lead was verified", `${name}${ref} was verified as genuine and has moved to our sales team.`);
        break;
      case "NOT_GENUINE":
        await send([staffCreator], "LEAD_NOT_GENUINE", `Lead not genuine: ${name}`, `${lead.lead_number || "The lead"} was marked not genuine${extra.reason ? `: ${extra.reason}` : "."}`);
        await toProvider("Update on your lead", `${name}${ref} will not be taken forward after verification.`);
        break;
      case "MEETING_SCHEDULED":
        await send([extra.salesId], "LEAD_MEETING_ASSIGNED", `New meeting: ${name}`,
          `You have a meeting with ${name}${extra.scheduledAt ? ` on ${when(extra.scheduledAt)}` : ""}.`);
        await send(await leadManagers(), "LEAD_MEETING_SCHEDULED", `Meeting scheduled: ${name}`,
          `${lead.lead_number || "The lead"}${extra.scheduledAt ? ` - ${when(extra.scheduledAt)}` : ""}.`);
        await toProvider("Meeting scheduled", `Our sales team will meet the customer for ${name}${ref}.`);
        break;
      case "MEETING_RESCHEDULED":
        await send([lead.assigned_sales_employee_id], "LEAD_MEETING_MOVED", `Meeting moved: ${name}`,
          `Your meeting is now on ${when(extra.scheduledAt)}${extra.reason ? `. Reason: ${extra.reason}` : "."}`);
        break;
      case "MEETING_CANCELLED":
        await send([lead.assigned_sales_employee_id, ...(await leadManagers())], "LEAD_MEETING_CANCELLED", `Meeting cancelled: ${name}`,
          extra.reason ? `Reason: ${extra.reason}` : "The meeting was cancelled.");
        break;
      case "VISIT_COMPLETED":
        await send([...(await leadManagers()), lead.assigned_telecaller_id, staffCreator], "LEAD_VISIT_DONE", `Site visit completed: ${name}`,
          extra.reason ? `Outcome: ${extra.reason}` : `${lead.lead_number || "The lead"} has been visited.`);
        await toProvider("Site visit completed", `Our sales team has visited the customer for ${name}${ref}.`);
        break;
      case "QUOTATION_SENT":
        await send([...(await leadManagers()), staffCreator], "LEAD_QUOTATION", `Quotation sent: ${name}`, `${extra.reason || "A quotation"} was sent to the customer.`);
        await toProvider("Quotation sent", `A quotation has been sent to the customer for ${name}${ref}.`);
        break;
      case "CONVERTED":
        await send([...(await leadManagers()), lead.assigned_telecaller_id, lead.assigned_sales_employee_id, staffCreator], "LEAD_CONVERTED",
          `Lead converted: ${name}`, `${lead.lead_number || "The lead"} is now a customer.`);
        await toProvider("Your lead converted", `${name}${ref} has become a BestServe customer. Thank you!`);
        break;
      case "LOST":
        await send([...(await leadManagers()), lead.assigned_sales_employee_id, staffCreator], "LEAD_LOST", `Lead lost: ${name}`,
          extra.reason ? `Reason: ${extra.reason}` : `${lead.lead_number || "The lead"} was closed without a deal.`);
        await toProvider("Update on your lead", `${name}${ref} has been closed without a deal.`);
        break;
      case "FEEDBACK":
        await toProvider(`New update on ${name}`, extra.message || "There is a new update on your lead.");
        break;
      case "FOLLOW_UP_ASSIGNED":
        await send([extra.assignedTo], "LEAD_FOLLOW_UP", `Follow-up for ${name}`, `A follow-up is due${extra.dueAt ? ` on ${when(extra.dueAt)}` : ""}.`);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Lead notification (${event}) failed:`, err.message);
  }
}

module.exports = { notifyLead };
