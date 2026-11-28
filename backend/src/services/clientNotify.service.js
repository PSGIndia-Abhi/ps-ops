// Notifications for client logins (the Client Portal / client app): staff did something about
// their outlet - replied to a complaint, booked a request, finished a visit, shared a document.
//
// Who is told: every active client login that can see the outlet - the outlet's own login(s)
// (user_scopes 'site') and the company head(s) (user_scopes 'company') - the same rule the portal
// uses to show the data (clientPortal.service getClientAccess). Saved in `notifications` and pushed
// to their phones on the client channel. Best effort: never throws into the caller.
const { pool } = require("../../db");
const { notifyUsers } = require("./notifications.service");

// The app's "BestServe updates" channel (mobile ClientPushBridge creates it).
const CLIENT_CHANNEL = "bestserve_updates";

/**
 * Client logins that see this outlet (siteId), or - for something shared with a whole company
 * (siteId empty) - every client login of that company.
 */
async function clientUsersFor({ siteId = null, companyId = null }) {
  let company = companyId;
  if (siteId && !company) {
    const [[site]] = await pool.query("SELECT company_id FROM sites WHERE id = ?", [siteId]);
    company = site?.company_id || null;
  }
  if (!siteId && !company) return [];

  const params = [];
  let scopeSql;
  if (siteId) {
    scopeSql = "(us.scope_type = 'site' AND us.scope_id = ?)";
    params.push(siteId);
  } else {
    scopeSql = "(us.scope_type = 'site' AND us.scope_id IN (SELECT id FROM sites WHERE company_id = ?))";
    params.push(company);
  }
  if (company) {
    scopeSql += " OR (us.scope_type = 'company' AND us.scope_id = ?)";
    params.push(company);
  }

  const [rows] = await pool.query(
    `SELECT DISTINCT u.id
     FROM user_scopes us
     JOIN users u ON u.id = us.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE (${scopeSql})
       AND COALESCE(u.is_active, 1) = 1
       AND LOWER(COALESCE(r.name, u.role, '')) = 'client'`,
    params
  );
  return rows.map((r) => r.id);
}

/** Tells the outlet's client logins. `exceptUserId`: the person who did it (never told about it). */
async function notifyClients(target, payload, { exceptUserId = null } = {}) {
  try {
    const userIds = await clientUsersFor(target);
    if (!userIds.length) return 0;
    return await notifyUsers(userIds, { ...payload, channelId: CLIENT_CHANNEL }, { exceptUserId });
  } catch (err) {
    console.error("[client-notify] failed:", err.message);
    return 0;
  }
}

const shorten = (text, max = 120) => {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Staff wrote in a complaint thread. */
async function notifyComplaintReply(ticketId, message, authorId) {
  const [[t]] = await pool.query("SELECT id, subject, site_id FROM job_tickets WHERE id = ?", [ticketId]).catch(() => [[null]]);
  if (!t?.site_id) return 0;
  return notifyClients(
    { siteId: t.site_id },
    {
      type: "CLIENT_COMPLAINT_REPLY",
      title: "BestServe replied to your complaint",
      message: shorten(`${t.subject}: ${message}`),
      entityType: "client_complaint",
      entityId: t.id,
    },
    { exceptUserId: authorId }
  );
}

/** Staff marked a complaint resolved / closed. */
async function notifyComplaintResolved(ticketId, authorId) {
  const [[t]] = await pool.query("SELECT id, subject, site_id FROM job_tickets WHERE id = ?", [ticketId]).catch(() => [[null]]);
  if (!t?.site_id) return 0;
  return notifyClients(
    { siteId: t.site_id },
    {
      type: "CLIENT_COMPLAINT_RESOLVED",
      title: "Your complaint was resolved",
      message: shorten(`${t.subject} - tap to see the details.`),
      entityType: "client_complaint",
      entityId: t.id,
    },
    { exceptUserId: authorId }
  );
}

/** Staff scheduled a visit for a complaint (stage "Visit scheduled", with the day / time if given). */
async function notifyComplaintVisit(ticketId, authorId) {
  const [[t]] = await pool
    .query("SELECT id, subject, site_id, visit_date, visit_slot FROM job_tickets WHERE id = ?", [ticketId])
    .catch(() => [[null]]);
  if (!t?.site_id) return 0;
  const day = t.visit_date ? new Date(t.visit_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";
  const when = [day, t.visit_slot].filter(Boolean).join(", ");
  return notifyClients(
    { siteId: t.site_id },
    {
      type: "CLIENT_COMPLAINT_VISIT",
      title: "A visit is scheduled for your complaint",
      message: shorten(`${t.subject}${when ? ` - visit on ${when}` : ""}`),
      entityType: "client_complaint",
      entityId: t.id,
    },
    { exceptUserId: authorId }
  );
}

/** Staff booked (ASSIGNED) or rejected a client's service request. */
async function notifyServiceRequest(requestId, outcome, staffNote) {
  const [[r]] = await pool
    .query(
      `SELECT r.id, r.site_id, r.preferred_date, s.name AS site_name
       FROM client_service_requests r LEFT JOIN sites s ON s.id = r.site_id WHERE r.id = ?`,
      [requestId]
    )
    .catch(() => [[null]]);
  if (!r?.site_id) return 0;
  const outlet = r.site_name ? ` for ${r.site_name}` : "";
  const booked = outcome === "ASSIGNED";
  return notifyClients(
    { siteId: r.site_id },
    {
      type: booked ? "CLIENT_REQUEST_BOOKED" : "CLIENT_REQUEST_REJECTED",
      title: booked ? "Your service request is scheduled" : "We couldn't take your request",
      message: shorten(
        booked ? `Our team has booked your request${outlet}.${staffNote ? ` ${staffNote}` : ""}` : staffNote || `Your request${outlet} could not be booked.`
      ),
      entityType: "client_service_request",
      entityId: r.id,
    }
  );
}

/** A visit was approved as completed. */
async function notifyVisitCompleted(visitId) {
  const [[v]] = await pool
    .query(
      `SELECT v.id, v.job_id, j.company_id AS site_id, j.sub_service, s.name AS site_name
       FROM job_visits v JOIN jobs j ON j.id = v.job_id LEFT JOIN sites s ON s.id = j.company_id
       WHERE TRIM(v.id) = ?`,
      [String(visitId).trim()]
    )
    .catch(() => [[null]]);
  if (!v?.site_id) return 0;
  const service = v.sub_service ? `${v.sub_service} ` : "Service ";
  return notifyClients(
    { siteId: v.site_id },
    {
      type: "CLIENT_VISIT_COMPLETED",
      title: `Service completed${v.site_name ? ` at ${v.site_name}` : ""}`,
      message: shorten(`${service}visit is done. Tap to see the report and photos.`),
      entityType: "client_job",
      entityId: v.job_id,
    }
  );
}

/** Staff shared a document with a company (siteId empty) or one outlet. */
// Told only the logins that can see it: ALL -> every login of the company; HEAD_OFFICE -> the
// company (head-office) logins; SITES -> each ticked outlet's logins + head office.
async function notifyDocumentShared({ companyId, visibility = "ALL", siteIds = [], siteId = null, title, docId }) {
  const payload = {
    type: "CLIENT_DOCUMENT_SHARED",
    title: "New document available",
    message: shorten(title || "A new document was shared with you."),
    entityType: "client_document",
    entityId: docId,
    channelId: CLIENT_CHANNEL,
  };
  try {
    let userIds = [];
    if (visibility === "HEAD_OFFICE") {
      const [rows] = await pool.query(
        `SELECT DISTINCT u.id
         FROM user_scopes us
         JOIN users u ON u.id = us.user_id
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE us.scope_type = 'company' AND us.scope_id = ?
           AND COALESCE(u.is_active, 1) = 1
           AND LOWER(COALESCE(r.name, u.role, '')) = 'client'`,
        [companyId]
      );
      userIds = rows.map((r) => r.id);
    } else if (visibility === "SITES" || siteId) {
      const sites = siteIds.length ? siteIds : [siteId];
      const lists = await Promise.all(sites.map((s) => clientUsersFor({ siteId: s, companyId })));
      userIds = [...new Set(lists.flat())];
    } else {
      userIds = await clientUsersFor({ companyId });
    }
    if (!userIds.length) return 0;
    return await notifyUsers(userIds, payload);
  } catch (err) {
    console.error("[client-notify] document failed:", err.message);
    return 0;
  }
}

module.exports = {
  CLIENT_CHANNEL,
  clientUsersFor,
  notifyClients,
  notifyComplaintReply,
  notifyComplaintResolved,
  notifyComplaintVisit,
  notifyServiceRequest,
  notifyVisitCompleted,
  notifyDocumentShared,
};
