// Admin > Service Requests: requests raised from the Client Portal ("Request a Service").
//
// Staff review a NEW request and either:
//   - Assign: opens the normal Create Booking form pre-filled from the request; once the booking is
//     saved (POST /api/bookings, unchanged) the request is marked assigned via /:id/booked.
//   - Reject: closes it with a note the client can read.
//
// Admin sees every request. Other staff see requests for outlets in their own branch.

const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function sendError(res, err, fallback) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

function parseList(value) {
  try {
    const list = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

// Branch filter for non-admin staff ('' for admin).
async function scopeFor(req) {
  if (req.user.role === "admin") return { sql: "", params: [] };
  const [[me]] = await pool.query("SELECT branch_id FROM users WHERE id = ?", [req.user.id]);
  if (!me?.branch_id) throw httpError(403, "Branch not assigned");
  return { sql: " AND s.branch_id = ?", params: [me.branch_id] };
}

const LIST_SELECT = `
  SELECT r.id, r.company_id, COALESCE(c.display_name, c.name) AS company_name, r.site_id, s.name AS site_name,
         s.address AS site_address, s.branch_id, b.name AS branch_name, r.service_type, r.sub_services,
         r.preferred_date, r.preferred_slot, r.notes, r.status, r.staff_note, r.booking_id, r.created_at, r.handled_at,
         u.name AS requested_by_name, u.email AS requested_by_email, u.phone AS requested_by_phone,
         h.name AS handled_by_name
  FROM client_service_requests r
  JOIN sites s ON s.id = r.site_id
  LEFT JOIN companies c ON c.id = r.company_id
  LEFT JOIN branches b ON b.id = s.branch_id
  LEFT JOIN users u ON u.id = r.requested_by
  LEFT JOIN users h ON h.id = r.handled_by`;

function shape(row) {
  return { ...row, sub_services: parseList(row.sub_services) };
}

// GET /api/service-requests/count -> { new: n } for the sidebar badge
router.get("/count", auth, requirePermission(PERMISSIONS.VIEW_BOOKING), async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM client_service_requests r JOIN sites s ON s.id = r.site_id
       WHERE r.status = 'NEW'${scope.sql}`,
      scope.params
    );
    res.json({ new: Number(row.n || 0) });
  } catch (err) {
    sendError(res, err, "Failed to count requests");
  }
});

// GET /api/service-requests?status=NEW|ASSIGNED|REJECTED|CANCELLED|all&search=
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_BOOKING), async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const where = [`1 = 1${scope.sql}`];
    const params = [...scope.params];
    const status = String(req.query.status || "NEW").toUpperCase();
    if (["NEW", "ASSIGNED", "REJECTED", "CANCELLED"].includes(status)) {
      where.push("r.status = ?");
      params.push(status);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      where.push("(c.name LIKE ? OR c.display_name LIKE ? OR s.name LIKE ? OR u.name LIKE ?)");
      params.push(...Array(4).fill(`%${search}%`));
    }

    const [rows] = await pool.query(
      `${LIST_SELECT} WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC LIMIT 300`,
      params
    );
    const [counts] = await pool.query(
      `SELECT r.status, COUNT(*) AS n FROM client_service_requests r JOIN sites s ON s.id = r.site_id
       WHERE 1 = 1${scope.sql} GROUP BY r.status`,
      scope.params
    );
    const byStatus = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
    res.json({
      counts: {
        NEW: byStatus.NEW || 0,
        ASSIGNED: byStatus.ASSIGNED || 0,
        REJECTED: byStatus.REJECTED || 0,
        CANCELLED: byStatus.CANCELLED || 0,
        all: Object.values(byStatus).reduce((a, b) => a + b, 0),
      },
      requests: rows.map(shape),
    });
  } catch (err) {
    sendError(res, err, "Failed to load requests");
  }
});

async function loadScopedRequest(req, id) {
  const scope = await scopeFor(req);
  const [[row]] = await pool.query(`${LIST_SELECT} WHERE r.id = ?${scope.sql}`, [id, ...scope.params]);
  if (!row) throw httpError(404, "Request not found");
  return shape(row);
}

// GET /api/service-requests/:id -> request + what the Assign form needs
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_BOOKING), async (req, res) => {
  try {
    const request = await loadScopedRequest(req, req.params.id);
    const [contacts] = await pool.query(
      `SELECT id, name, phone, role, is_primary FROM contacts
       WHERE company_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY is_primary DESC, name`,
      [request.site_id]
    );
    const [staff] = await pool.query(
      `SELECT u.id, u.name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.branch_id = ? AND u.is_active = 1 AND r.name IN ('supervisor','technician')
       ORDER BY u.name`,
      [request.branch_id]
    );
    let jobs = [];
    if (request.booking_id) {
      [jobs] = await pool.query(
        "SELECT id, code, sub_service, status FROM jobs WHERE booking_id = ? ORDER BY created_at",
        [request.booking_id]
      );
    }
    res.json({
      request,
      contacts: contacts.map((c) => ({ ...c, is_primary: !!c.is_primary })),
      supervisors: staff.filter((s) => s.role === "supervisor"),
      technicians: staff.filter((s) => s.role === "technician"),
      jobs,
    });
  } catch (err) {
    sendError(res, err, "Failed to load request");
  }
});

// POST /api/service-requests/:id/booked  body: { booking_id, staff_note? }
// Staff create the booking with the normal Create Booking form (POST /api/bookings), pre-filled from
// the request; this then marks the request as assigned and links the booking so the client sees the jobs.
router.post("/:id/booked", auth, requirePermission(PERMISSIONS.CREATE_BOOKING), async (req, res) => {
  try {
    const request = await loadScopedRequest(req, req.params.id);
    const bookingId = String(req.body?.booking_id || "").trim();
    if (!bookingId) throw httpError(400, "booking_id is required");
    const [[booking]] = await pool.query("SELECT id, company_id FROM bookings WHERE id = ?", [bookingId]);
    if (!booking) throw httpError(404, "Booking not found");

    const note = String(req.body?.staff_note || "").trim().slice(0, 500) || null;
    const [result] = await pool.query(
      `UPDATE client_service_requests
       SET status = 'ASSIGNED', booking_id = ?, staff_note = COALESCE(?, staff_note), handled_by = ?, handled_at = NOW()
       WHERE id = ? AND status = 'NEW'`,
      [booking.id, note, req.user.id, request.id]
    );
    if (!result.affectedRows) throw httpError(409, "This request has already been handled");
    res.json({ success: true, other_outlet: booking.company_id && booking.company_id !== request.site_id });
  } catch (err) {
    sendError(res, err, "Failed to update request");
  }
});

// POST /api/service-requests/:id/reject  body: { staff_note }
router.post("/:id/reject", auth, requirePermission(PERMISSIONS.CREATE_BOOKING), async (req, res) => {
  try {
    const request = await loadScopedRequest(req, req.params.id);
    const note = String(req.body?.staff_note || "").trim().slice(0, 500);
    if (!note) throw httpError(400, "Tell the client why (this note is shown to them)");
    const [result] = await pool.query(
      `UPDATE client_service_requests SET status = 'REJECTED', staff_note = ?, handled_by = ?, handled_at = NOW()
       WHERE id = ? AND status = 'NEW'`,
      [note, req.user.id, request.id]
    );
    if (!result.affectedRows) throw httpError(409, "This request has already been handled");
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to reject request");
  }
});

module.exports = router;
