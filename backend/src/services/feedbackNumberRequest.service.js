const crypto = require("crypto");
const { pool } = require("../../db");
const { HttpError, inTransaction, addHistory, hasAnyPerm, saveSiteContact, tenDigitPhone } = require("./feedback.service");

// ---------------------------------------------------------------------------
// Customer Feedback - requests for the right number (Feedback Desk > Requests).
//
// A call reached a wrong number (status WRONG_NUMBER): its collector sends a request. The service
// coordinator (or a desk manager) finds the right number and saves it - on the wrong contact, or as
// a new contact of the site. The call goes back to TO_CALL with a call-back due now, so the
// collector calls the right number. One open request per call; the collector can cancel it.
// ---------------------------------------------------------------------------

// Who finds the right numbers: service coordinators (FEEDBACK_ISSUES / FEEDBACK_SCHEDULE), desk
// managers and admin.
const HANDLERS = ["FEEDBACK_ADMIN", "FEEDBACK_MANAGE", "FEEDBACK_ISSUES", "FEEDBACK_SCHEDULE"];
const isHandler = (req) => hasAnyPerm(req, HANDLERS);

const text = (value, label, max) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, `Invalid ${label}`);
  const t = value.trim();
  if (t.length > max) throw new HttpError(400, `The ${label} is too long (at most ${max} characters)`);
  return t || null;
};
const person = (id, name) => (id ? { id: Number(id), name: name || null } : null);

const SELECT = `
  SELECT q.*, co.name AS company_name, s.name AS site_name, s.city AS site_city,
         DATE_FORMAT(r.due_date, '%Y-%m-%d') AS due_date, r.status AS call_status,
         rb.name AS requested_by_name, xb.name AS resolved_by_name
  FROM feedback_number_requests q
  JOIN feedback_requests r ON r.id = q.request_id
  JOIN companies co ON co.id = q.company_id
  JOIN sites s ON s.id = q.site_id
  JOIN users rb ON rb.id = q.requested_by
  LEFT JOIN users xb ON xb.id = q.resolved_by`;

function row(q) {
  return {
    id: q.id,
    call_id: q.request_id,
    call_status: q.call_status,
    due_date: q.due_date,
    customer: { id: q.company_id, name: q.company_name },
    site: { id: q.site_id, name: q.site_name, city: q.site_city },
    wrong: { contact_id: q.contact_id, name: q.wrong_name, phone: q.wrong_phone },
    note: q.note,
    status: q.status,
    requested_by: person(q.requested_by, q.requested_by_name),
    requested_at: q.requested_at,
    resolved_by: person(q.resolved_by, q.resolved_by_name),
    resolved_at: q.resolved_at,
    right: q.new_phone ? { contact_id: q.new_contact_id, name: q.new_name, phone: q.new_phone } : null,
    resolve_note: q.resolve_note,
  };
}

// GET /number-requests?status=OPEN|DONE|CANCELLED (none = all) - a handler sees every request, a
// collector the ones they sent. Open first, newest first.
async function listNumberRequests(req) {
  const where = [];
  const params = [];
  if (!isHandler(req)) { where.push("q.requested_by = ?"); params.push(req.user.id); }
  const status = String(req.query?.status || "").toUpperCase();
  if (status) {
    if (!["OPEN", "DONE", "CANCELLED"].includes(status)) throw new HttpError(400, "Unknown status");
    where.push("q.status = ?");
    params.push(status);
  }
  const [rows] = await pool.query(
    `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY q.status = 'OPEN' DESC, q.requested_at DESC LIMIT 300`,
    params
  );
  const [[counts]] = await pool.query(
    `SELECT COALESCE(SUM(status = 'OPEN'), 0) AS open, COALESCE(SUM(status = 'DONE'), 0) AS done, COUNT(*) AS total
     FROM feedback_number_requests q ${isHandler(req) ? "" : "WHERE q.requested_by = ?"}`,
    isHandler(req) ? [] : [req.user.id]
  );
  // Open ones: the site's saved contacts, to help find the right number.
  const openSites = [...new Set(rows.filter((q) => q.status === "OPEN").map((q) => q.site_id))];
  const contacts = new Map();
  if (openSites.length) {
    const [list] = await pool.query(
      "SELECT id, company_id AS site_id, name, phone, role FROM contacts WHERE company_id IN (?) AND COALESCE(is_active, 1) = 1 ORDER BY is_primary DESC, name",
      [openSites]
    );
    for (const c of list) {
      if (!contacts.has(c.site_id)) contacts.set(c.site_id, []);
      contacts.get(c.site_id).push({ id: c.id, name: c.name, phone: c.phone, role: c.role });
    }
  }
  return {
    requests: rows.map((q) => ({ ...row(q), site_contacts: q.status === "OPEN" ? contacts.get(q.site_id) || [] : undefined })),
    counts: { OPEN: Number(counts.open), DONE: Number(counts.done), ALL: Number(counts.total) },
    can_resolve: isHandler(req),
  };
}

// The requests of one call (for the call page).
async function callNumberRequests(callId) {
  const [rows] = await pool.query(`${SELECT} WHERE q.request_id = ? ORDER BY q.requested_at DESC`, [callId]);
  return rows.map(row);
}

// POST /calls/:id/number-request - Body: { contact_id?, note? }. The call's collector (or a desk
// manager) asks for the right number after a wrong number. contact_id = the contact that was wrong
// (default: the last number called).
async function sendNumberRequest(req, callId, body) {
  return inTransaction(async (conn) => {
    const [[r]] = await conn.query("SELECT id, site_id, company_id, status, collector_user_id FROM feedback_requests WHERE id = ? FOR UPDATE", [callId]);
    if (!r) throw new HttpError(404, "Feedback call not found");
    if (Number(r.collector_user_id) !== Number(req.user.id) && !hasAnyPerm(req, ["FEEDBACK_MANAGE"])) {
      throw new HttpError(403, "Only the collector of this call can ask for the right number");
    }
    if (r.status !== "WRONG_NUMBER") throw new HttpError(400, "Ask for the right number after a call reaches a wrong number");
    const [[open]] = await conn.query("SELECT id FROM feedback_number_requests WHERE request_id = ? AND status = 'OPEN'", [r.id]);
    if (open) throw new HttpError(409, "A request for the right number is already waiting for the service coordinator");

    // The wrong number: the contact given, else the last number called.
    let wrong = null;
    if (body?.contact_id) {
      [[wrong]] = await conn.query("SELECT id AS contact_id, name, phone FROM contacts WHERE id = ? AND company_id = ?", [String(body.contact_id), r.site_id]);
      if (!wrong) throw new HttpError(400, "That contact does not belong to this site");
    } else {
      [[wrong]] = await conn.query(
        "SELECT contact_id, contact_name AS name, phone FROM feedback_call_attempts WHERE request_id = ? AND outcome = 'WRONG_NUMBER' ORDER BY called_at DESC, id DESC LIMIT 1",
        [r.id]
      );
    }
    const note = text(body?.note, "note", 500);
    const id = crypto.randomUUID();
    await conn.query(
      `INSERT INTO feedback_number_requests (id, request_id, company_id, site_id, contact_id, wrong_name, wrong_phone, note, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, r.id, r.company_id, r.site_id, wrong?.contact_id || null, wrong?.name || null, wrong?.phone || null, note, req.user.id]
    );
    await addHistory(conn, {
      requestId: r.id, event: "NUMBER_REQUESTED",
      note: `Asked the service coordinator for the right number${wrong?.phone ? ` (wrong: ${[wrong.name, wrong.phone].filter(Boolean).join(", ")})` : ""}${note ? ` - ${note}` : ""}`,
      userId: req.user.id,
    });
    return id;
  });
}

// POST /number-requests/:id/resolve - Body: { name, phone, note? }. A handler saves the right number
// as a new contact of the site (shown under the old one, marked New on the call); the call goes back
// to TO_CALL with a call-back due now.
async function resolveNumberRequest(req, id, body) {
  if (!isHandler(req)) throw new HttpError(403, "Only the service coordinator can add the right number");
  return inTransaction(async (conn) => {
    const [[q]] = await conn.query("SELECT * FROM feedback_number_requests WHERE id = ? FOR UPDATE", [id]);
    if (!q) throw new HttpError(404, "Request not found");
    if (q.status !== "OPEN") throw new HttpError(409, q.status === "DONE" ? "The right number is already added" : "The collector cancelled this request");
    const name = text(body?.name, "name", 150);
    if (!name) throw new HttpError(400, "Enter the name of the person at the right number");
    const phone = tenDigitPhone(body?.phone);
    const note = text(body?.note, "note", 500);

    if (q.wrong_phone && String(q.wrong_phone).replace(/\D/g, "").slice(-10) === phone) {
      throw new HttpError(400, "That is the wrong number itself - enter the right one");
    }
    const contactId = (await saveSiteContact(conn, q.site_id, name, phone)).id;
    await conn.query(
      `UPDATE feedback_number_requests SET status = 'DONE', resolved_by = ?, resolved_at = NOW(), new_contact_id = ?, new_name = ?, new_phone = ?, resolve_note = ?
       WHERE id = ?`,
      [req.user.id, contactId, name, phone, note, q.id]
    );
    // Back on the collector's list: call the right number now.
    await conn.query(
      "UPDATE feedback_requests SET status = 'TO_CALL', next_call_at = NOW(), row_version = row_version + 1 WHERE id = ? AND status = 'WRONG_NUMBER'",
      [q.request_id]
    );
    await addHistory(conn, {
      requestId: q.request_id, event: "NUMBER_ADDED", from: "WRONG_NUMBER", to: "TO_CALL",
      note: `Right number from the service coordinator: ${name}, ${phone}${note ? ` - ${note}` : ""}`,
      userId: req.user.id,
    });
    return q.id;
  });
}

// POST /number-requests/:id/cancel - the collector who sent it (e.g. found the number themselves).
async function cancelNumberRequest(req, id) {
  return inTransaction(async (conn) => {
    const [[q]] = await conn.query("SELECT id, request_id, status, requested_by FROM feedback_number_requests WHERE id = ? FOR UPDATE", [id]);
    if (!q) throw new HttpError(404, "Request not found");
    if (Number(q.requested_by) !== Number(req.user.id) && !hasAnyPerm(req, ["FEEDBACK_MANAGE"])) throw new HttpError(403, "Only the collector who sent it can cancel it");
    if (q.status !== "OPEN") throw new HttpError(409, "This request is not open");
    await conn.query("UPDATE feedback_number_requests SET status = 'CANCELLED', resolved_by = ?, resolved_at = NOW() WHERE id = ?", [req.user.id, q.id]);
    await addHistory(conn, { requestId: q.request_id, event: "NUMBER_REQUEST_CANCELLED", note: "Request for the right number cancelled", userId: req.user.id });
    return q.id;
  });
}

// Open requests: what a handler has to do (the number on Requests), or a collector's own waiting.
async function openNumberRequestCount(req) {
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS n FROM feedback_number_requests WHERE status = 'OPEN' ${isHandler(req) ? "" : "AND requested_by = ?"}`,
    isHandler(req) ? [] : [req.user.id]
  );
  return Number(c.n);
}

module.exports = {
  HANDLERS, listNumberRequests, callNumberRequests, sendNumberRequest, resolveNumberRequest, cancelNumberRequest, openNumberRequestCount,
};
