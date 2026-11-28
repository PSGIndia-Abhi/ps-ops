// Complaint Desk: the client complaints (job_tickets raised by client logins from the Client
// Portal) are handled in the Feedback Desk by the feedback collector and the service coordinator
// (not admin). Shared by routes/complaint-desk.routes.js and routes/client-portal.routes.js.
const { pool } = require("../../db");
const { notifyUsers } = require("./notifications.service");

// Real role names (users.role_id -> roles.name) that work client complaints.
const COMPLAINT_DESK_ROLES = ["feedback_collector", "Service Coordinator"];

// First answer the client sees as soon as a complaint is raised. Not stored: added when the
// thread is read, right after the client's first message.
const AUTO_REPLY_TEXT =
  "Thank you for reaching out. We have received your complaint and our team will connect with you shortly.";

// SQL condition on users u: the user is a client login.
const CLIENT_USER_SQL =
  "LOWER(COALESCE((SELECT r.name FROM roles r WHERE r.id = u.role_id), u.role, '')) = 'client'";

function canUseComplaintDesk(user) {
  return COMPLAINT_DESK_ROLES.includes(user?.role_name) || COMPLAINT_DESK_ROLES.includes(user?.role);
}

async function complaintDeskUserIds() {
  const [rows] = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name IN (${COMPLAINT_DESK_ROLES.map(() => "?").join(",")}) AND COALESCE(u.is_active, 1) = 1`,
    COMPLAINT_DESK_ROLES
  );
  return rows.map((r) => r.id);
}

// Web bell for the desk: a new complaint or a client reply. Best effort, never throws.
async function notifyComplaintDesk({ ticketId, title, message, exceptUserId = null }) {
  try {
    const ids = await complaintDeskUserIds();
    if (!ids.length) return 0;
    return await notifyUsers(
      ids,
      { type: "CLIENT_COMPLAINT", title, message: String(message || "").slice(0, 160), entityType: "desk_complaint", entityId: ticketId },
      { exceptUserId }
    );
  } catch (err) {
    console.error("[complaint-desk] notify failed:", err.message);
    return 0;
  }
}

// Puts the automatic first answer right after the client's first message.
// `messages` are in time order; `make(first)` builds the message object in the caller's shape.
function withAutoReply(messages, make) {
  if (!messages.length) return messages;
  return [messages[0], make(messages[0]), ...messages.slice(1)];
}

module.exports = {
  COMPLAINT_DESK_ROLES,
  AUTO_REPLY_TEXT,
  CLIENT_USER_SQL,
  canUseComplaintDesk,
  notifyComplaintDesk,
  withAutoReply,
};
