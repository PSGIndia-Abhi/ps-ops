// Complaint Desk API (/api/complaint-desk): client complaints raised from the Client Portal,
// worked in the Feedback Desk by the feedback collector and the service coordinator.
// Admin does not use it (see services/complaintDesk.service.js for who can).
//
// Data: job_tickets (complaints raised by client logins), job_ticket_messages (the thread),
// ticket_attachments (photos / PDFs), job_ticket_links (linked job). No tables of its own.

const express = require("express");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const minioClient = require("../lib/minio");
const { notifyComplaintReply, notifyComplaintResolved, notifyComplaintVisit } = require("../services/clientNotify.service");
const { AUTO_REPLY_TEXT, CLIENT_USER_SQL, canUseComplaintDesk, withAutoReply } = require("../services/complaintDesk.service");

const STATUSES = ["OPEN", "IN_PROGRESS", "VISIT_SCHEDULED", "RESOLVED", "CLOSED"];
const OPEN_SQL = "t.status IN ('OPEN','IN_PROGRESS','VISIT_SCHEDULED')"; // not fixed yet
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const MAX_FILES = 10;
const ph = (list) => list.map(() => "?").join(",");
const categoryList = (value) => (value ? String(value).split(",").filter(Boolean) : ["SERVICE"]);

function sendError(res, err, label) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`complaint-desk ${label} failed:`, err);
  return res.status(500).json({ error: `Failed to ${label}` });
}

router.use(auth, (req, res, next) => {
  if (!canUseComplaintDesk(req.user)) return res.status(403).json({ error: "Complaints are handled by the feedback collector and the service coordinator" });
  next();
});

// The outlet of a complaint: its own site, else the linked job's outlet (jobs.company_id = site id).
const SITE_JOIN = `
  LEFT JOIN sites s ON s.id = COALESCE(t.site_id,
    (SELECT cj.company_id FROM job_ticket_links cl JOIN jobs cj ON cj.id = cl.job_id WHERE cl.ticket_id = t.id LIMIT 1))
  LEFT JOIN companies c ON c.id = s.company_id`;

// Last message written by a client = the desk owes an answer.
const LAST_FROM_CLIENT = `(SELECT LOWER(COALESCE(mr.name, mu.role, '')) = 'client'
   FROM job_ticket_messages m JOIN users mu ON mu.id = m.created_by_user_id LEFT JOIN roles mr ON mr.id = mu.role_id
   WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1)`;

async function loadComplaint(id) {
  const [[row]] = await pool.query(
    `SELECT t.id, t.subject, t.status, t.priority, t.category, t.visit_date, t.visit_slot, t.created_at, t.updated_at, t.created_by_user_id,
            u.name AS raised_by_name, u.email AS raised_by_email, u.phone AS raised_by_phone,
            s.id AS site_id, s.name AS site_name, s.address AS site_address, s.city AS site_city,
            c.id AS company_id, COALESCE(c.display_name, c.name) AS company_name
     FROM job_tickets t
     JOIN users u ON u.id = t.created_by_user_id
     ${SITE_JOIN}
     WHERE t.id = ? AND ${CLIENT_USER_SQL}`,
    [id]
  );
  if (!row) throw Object.assign(new Error("Complaint not found"), { status: 404 });
  return row;
}

// GET /api/complaint-desk/me -> numbers for the Feedback Desk menu
router.get("/me", async (req, res) => {
  try {
    const [[n]] = await pool.query(
      `SELECT SUM(${OPEN_SQL}) AS open_count,
              SUM(${OPEN_SQL} AND COALESCE(${LAST_FROM_CLIENT}, 1) = 1) AS needs_reply
       FROM job_tickets t JOIN users u ON u.id = t.created_by_user_id
       WHERE ${CLIENT_USER_SQL}`
    );
    res.json({ allowed: true, open: Number(n.open_count || 0), needs_reply: Number(n.needs_reply || 0) });
  } catch (err) {
    sendError(res, err, "load complaint numbers");
  }
});

// GET /api/complaint-desk/complaints?status=&type=&priority=&company_id=&site_id=&search=&page=
router.get("/complaints", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 25));
    const where = [CLIENT_USER_SQL];
    const params = [];

    const search = String(req.query.search || "").trim();
    if (search) {
      where.push("(t.subject LIKE ? OR s.name LIKE ? OR c.name LIKE ? OR c.display_name LIKE ? OR u.name LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    const type = String(req.query.type || "").toUpperCase();
    if (type === "ACCOUNTS") where.push("FIND_IN_SET('ACCOUNTS', t.category) > 0");
    else if (type === "SERVICE") where.push("(t.category IS NULL OR t.category = '' OR FIND_IN_SET('SERVICE', t.category) > 0)");
    const priority = String(req.query.priority || "").toUpperCase();
    if (PRIORITIES.includes(priority)) {
      where.push("t.priority = ?");
      params.push(priority);
    }
    if (req.query.company_id) {
      where.push("c.id = ?");
      params.push(String(req.query.company_id));
    }
    if (req.query.site_id) {
      where.push("s.id = ?");
      params.push(String(req.query.site_id));
    }

    const from = `FROM job_tickets t JOIN users u ON u.id = t.created_by_user_id ${SITE_JOIN}`;
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS all_count, SUM(t.status = 'OPEN') AS s_open, SUM(t.status = 'IN_PROGRESS') AS s_in_progress,
              SUM(t.status = 'VISIT_SCHEDULED') AS s_visit,
              SUM(t.status = 'RESOLVED') AS s_resolved, SUM(t.status = 'CLOSED') AS s_closed
       ${from} WHERE ${where.join(" AND ")}`,
      params
    );

    const listWhere = [...where];
    const listParams = [...params];
    const status = String(req.query.status || "").toUpperCase();
    if (STATUSES.includes(status)) {
      listWhere.push("t.status = ?");
      listParams.push(status);
    }

    const [rows] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.category, t.created_at, t.updated_at,
              u.name AS raised_by_name, s.id AS site_id, s.name AS site_name, c.id AS company_id,
              COALESCE(c.display_name, c.name) AS company_name,
              (SELECT cj.code FROM job_ticket_links cl JOIN jobs cj ON cj.id = cl.job_id WHERE cl.ticket_id = t.id LIMIT 1) AS job_code,
              (SELECT COUNT(*) FROM job_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
              (SELECT COUNT(*) FROM ticket_attachments a WHERE a.ticket_id = t.id) AS file_count,
              (SELECT MAX(m.created_at) FROM job_ticket_messages m WHERE m.ticket_id = t.id) AS last_message_at,
              COALESCE(${LAST_FROM_CLIENT}, 1) AS last_from_client
       ${from}
       WHERE ${listWhere.join(" AND ")}
       ORDER BY (${OPEN_SQL}) DESC, COALESCE((SELECT MAX(m.created_at) FROM job_ticket_messages m WHERE m.ticket_id = t.id), t.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...listParams, size, (page - 1) * size]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total ${from} WHERE ${listWhere.join(" AND ")}`,
      listParams
    );

    // Companies / outlets that have complaints, for the filters.
    const [options] = await pool.query(
      `SELECT DISTINCT c.id AS company_id, COALESCE(c.display_name, c.name) AS company_name, s.id AS site_id, s.name AS site_name
       ${from} WHERE ${CLIENT_USER_SQL} AND s.id IS NOT NULL ORDER BY company_name, site_name`
    );

    const n = (v) => Number(v || 0);
    res.json({
      page,
      page_size: size,
      total: n(total),
      counts: {
        all: n(counts.all_count), OPEN: n(counts.s_open), IN_PROGRESS: n(counts.s_in_progress), VISIT_SCHEDULED: n(counts.s_visit),
        RESOLVED: n(counts.s_resolved), CLOSED: n(counts.s_closed),
      },
      options,
      complaints: rows.map((r) => {
        const open = ["OPEN", "IN_PROGRESS", "VISIT_SCHEDULED"].includes(r.status);
        return {
          ...r,
          category: categoryList(r.category),
          message_count: n(r.message_count),
          file_count: n(r.file_count),
          last_from_client: undefined,
          // Open and the client wrote last: the desk owes an answer.
          needs_reply: open && !!Number(r.last_from_client),
          client_replied: open && !!Number(r.last_from_client) && n(r.message_count) > 1,
        };
      }),
    });
  } catch (err) {
    sendError(res, err, "load complaints");
  }
});

// GET /api/complaint-desk/complaints/:id -> complaint, client, outlet, jobs, last visit, thread
router.get("/complaints/:id", async (req, res) => {
  try {
    const t = await loadComplaint(req.params.id);
    const [jobs] = await pool.query(
      `SELECT j.id, j.code, j.service_type, j.sub_service, j.status
       FROM job_ticket_links l JOIN jobs j ON j.id = l.job_id WHERE l.ticket_id = ?`,
      [t.id]
    );
    let lastVisit = null;
    if (t.site_id) {
      const [[v]] = await pool.query(
        `SELECT v.completed_at, j.sub_service, j.code
         FROM job_visits v JOIN jobs j ON j.id = v.job_id
         WHERE j.company_id = ? AND v.status = 'COMPLETED' AND v.completed_at IS NOT NULL
         ORDER BY v.completed_at DESC LIMIT 1`,
        [t.site_id]
      );
      lastVisit = v || null;
    }
    const [messages] = await pool.query(
      `SELECT m.id, m.message, m.created_at, m.created_by_user_id, mu.name AS author,
              LOWER(COALESCE(mr.name, mu.role, '')) AS author_role, mr.name AS author_role_name
       FROM job_ticket_messages m
       JOIN users mu ON mu.id = m.created_by_user_id
       LEFT JOIN roles mr ON mr.id = mu.role_id
       WHERE m.ticket_id = ? ORDER BY m.created_at ASC`,
      [t.id]
    );
    const [files] = await pool.query("SELECT id, message_id, object_key FROM ticket_attachments WHERE ticket_id = ?", [t.id]);
    const byMessage = new Map();
    for (const f of files) {
      const name = String(f.object_key || "").split("_").slice(2).join("_") || "file";
      const list = byMessage.get(f.message_id) || [];
      list.push({ id: f.id, file_name: name, file_type: /\.pdf$/i.test(name) ? "application/pdf" : "image/*" });
      byMessage.set(f.message_id, list);
    }
    const thread = messages.map((m) => ({
      id: m.id,
      message: m.message,
      created_at: m.created_at,
      author: m.author,
      from_client: m.author_role === "client",
      role_label: m.author_role === "client" ? "Client" : m.author_role_name || "BestServe",
      mine: String(m.created_by_user_id) === String(req.user.id),
      attachments: byMessage.get(m.id) || [],
    }));

    const { created_by_user_id, ...complaint } = t;
    res.json({
      complaint: { ...complaint, category: categoryList(t.category) },
      jobs,
      last_visit: lastVisit,
      messages: withAutoReply(thread, (first) => ({
        id: `auto-${t.id}`,
        message: AUTO_REPLY_TEXT,
        created_at: first.created_at,
        author: "BestServe",
        from_client: false,
        role_label: "Automatic reply",
        auto: true,
        attachments: [],
      })),
    });
  } catch (err) {
    sendError(res, err, "load complaint");
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === "application/pdf";
    cb(ok ? null : Object.assign(new Error("Only photos and PDF files can be attached"), { status: 400 }), ok);
  },
});
function acceptFiles(req, res, next) {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "Each file must be 10 MB or smaller"
      : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? `You can attach up to ${MAX_FILES} files`
      : err.message || "Upload failed";
    res.status(400).json({ error: message });
  });
}

// POST /api/complaint-desk/complaints/:id/messages (multipart: message, files[]) -> reply to the client.
// The first answer moves an Open complaint to In progress.
router.post("/complaints/:id/messages", acceptFiles, async (req, res) => {
  try {
    const t = await loadComplaint(req.params.id);
    if (t.status === "CLOSED") return res.status(400).json({ error: "This complaint is closed. Change the status to reply." });
    const message = String(req.body?.message || "").trim();
    if (!message && !(req.files || []).length) return res.status(400).json({ error: "Write a reply or attach a file" });

    const messageId = uuid();
    await pool.query(
      "INSERT INTO job_ticket_messages (id, ticket_id, message, created_by_user_id, created_at) VALUES (?, ?, ?, ?, NOW())",
      [messageId, t.id, message || "(attachment)", req.user.id]
    );
    const moved = t.status === "OPEN";
    await pool.query(`UPDATE job_tickets SET ${moved ? "status = 'IN_PROGRESS', " : ""}updated_at = NOW() WHERE id = ?`, [t.id]);

    let warning = null;
    try {
      for (const file of req.files || []) {
        const safeName = String(file.originalname || "file").replace(/[^\w.-]+/g, "_").slice(-80);
        const objectKey = `tickets/${Date.now()}_${uuid().slice(0, 8)}_${safeName}`;
        await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, file.buffer, file.size, { "Content-Type": file.mimetype });
        await pool.query(
          "INSERT INTO ticket_attachments (id, ticket_id, message_id, object_key) VALUES (?, ?, ?, ?)",
          [uuid(), t.id, messageId, objectKey]
        );
      }
    } catch (err) {
      console.error("complaint-desk reply upload failed:", err);
      warning = "Your reply was sent, but the attachments could not be uploaded.";
    }
    res.status(201).json({ id: messageId, status: moved ? "IN_PROGRESS" : t.status, warning });
    notifyComplaintReply(t.id, message || "Sent you a file", req.user.id);
  } catch (err) {
    sendError(res, err, "send the reply");
  }
});

// PATCH /api/complaint-desk/complaints/:id  body: { status?, priority? }
router.patch("/complaints/:id", async (req, res) => {
  try {
    const t = await loadComplaint(req.params.id);
    const sets = [];
    const params = [];
    const status = req.body?.status ? String(req.body.status).toUpperCase() : null;
    const priority = req.body?.priority ? String(req.body.priority).toUpperCase() : null;
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
      sets.push("status = ?");
      params.push(status);
    }
    if (priority) {
      if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: "Invalid priority" });
      sets.push("priority = ?");
      params.push(priority);
    }
    // Visit scheduled: optional day (YYYY-MM-DD) and time text, shown to the client.
    let visitChanged = false;
    if (req.body?.visit_date !== undefined || req.body?.visit_slot !== undefined) {
      const day = String(req.body.visit_date || "").trim();
      if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: "Invalid visit date" });
      sets.push("visit_date = ?", "visit_slot = ?");
      const slot = String(req.body.visit_slot || "").trim().slice(0, 40) || null;
      const oldDay = t.visit_date ? new Date(t.visit_date).toLocaleDateString("en-CA") : null;
      visitChanged = (day || null) !== oldDay || slot !== (t.visit_slot || null);
      params.push(day || null, slot);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    await pool.query(`UPDATE job_tickets SET ${sets.join(", ")}, updated_at = NOW() WHERE id = ?`, [...params, t.id]);
    res.json({ success: true });
    if (status && status !== t.status && ["RESOLVED", "CLOSED"].includes(status)) notifyComplaintResolved(t.id, req.user.id);
    if (status === "VISIT_SCHEDULED" && (status !== t.status || visitChanged)) notifyComplaintVisit(t.id, req.user.id);
  } catch (err) {
    sendError(res, err, "update the complaint");
  }
});

// GET /api/complaint-desk/files/:id -> a complaint photo / PDF
router.get("/files/:id", async (req, res) => {
  try {
    const [[file]] = await pool.query("SELECT ticket_id, object_key FROM ticket_attachments WHERE id = ?", [req.params.id]);
    if (!file) return res.status(404).json({ error: "File not found" });
    await loadComplaint(file.ticket_id);
    const stat = await minioClient.statObject(process.env.MINIO_BUCKET, file.object_key);
    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, file.object_key);
    res.setHeader("Content-Type", stat?.metaData?.["content-type"] || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.on("error", () => (res.headersSent ? res.destroy() : res.status(500).end()));
    stream.pipe(res);
  } catch (err) {
    sendError(res, err, "load the file");
  }
});

module.exports = router;
