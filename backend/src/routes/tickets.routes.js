const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { sendTicketCreatedEmail } = require("../utils/mailer");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const minioClient = require("../lib/minio");
const BUCKET = process.env.MINIO_BUCKET;

const isValidJobId = (jobId) => {
  if (!jobId) return false;
  const isNumeric = /^\d+$/.test(jobId);
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
  return isNumeric || isUUID;
};

const getUserBranchId = async (executor, userId) => {
  if (!userId) return null;
  const [[row]] = await executor.query(
    "SELECT branch_id FROM users WHERE id = ?",
    [userId]
  );
  return row?.branch_id || null;
};

const canAccessJob = async (executor, user, jobId) => {
  const branchId = user.role === "admin"
    ? null
    : await getUserBranchId(executor, user.id);

  if (user.role !== "admin" && !branchId) {
    return false;
  }

  if (user.role === "admin") {
    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? LIMIT 1`,
      [jobId]
    );
    return !!job;
  }

  if (user.role === "branch_admin") {
    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? AND branch_id = ? LIMIT 1`,
      [jobId, branchId]
    );
    return !!job;
  }

  if (user.role === "supervisor") {
    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? AND supervisor_id = ? AND branch_id = ? LIMIT 1`,
      [jobId, user.id, branchId]
    );
    return !!job;
  }

  if (user.role === "client") {
    const [[userRow]] = await executor.query(
      `SELECT contact_id FROM users WHERE id = ?`,
      [user.id]
    );

    if (!userRow?.contact_id) return false;

    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? AND requested_by_contact_id = ? AND branch_id = ? LIMIT 1`,
      [jobId, userRow.contact_id, branchId]
    );

    return !!job;
  }

  return false;
};

const ensureJobAccess = async (req, res, executor, jobId) => {
  if (!isValidJobId(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return false;
  }

  const allowed = await canAccessJob(executor, req.user, jobId);
  if (!allowed) {
    res.status(404).json({ error: "Job not found" });
    return false;
  }

  return true;
};

const getTicketJobIds = async (executor, ticketId) => {
  const [rows] = await executor.query(
    `SELECT job_id FROM job_ticket_links WHERE ticket_id = ?`,
    [ticketId]
  );
  return rows.map((row) => row.job_id);
};

const ensureTicketAccess = async (req, res, executor, ticketId) => {
  const jobIds = await getTicketJobIds(executor, ticketId);

  if (!jobIds.length) {
    const [[ticket]] = await executor.query(
      `SELECT created_by_user_id FROM job_tickets WHERE id = ?`,
      [ticketId]
    );

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return { allowed: false, jobIds };
    }

    if (req.user.role === "admin") {
      return { allowed: true, jobIds };
    }

    if (ticket?.created_by_user_id === req.user.id) {
      return { allowed: true, jobIds };
    }

    res.status(404).json({ error: "Ticket not found" });
    return { allowed: false, jobIds };
  }

  for (const jobId of jobIds) {
    const allowed = await canAccessJob(executor, req.user, jobId);
    if (allowed) {
      return { allowed: true, jobIds };
    }
  }

  res.status(404).json({ error: "Ticket not found" });
  return { allowed: false, jobIds };
};

async function buildTicketResponse(tickets, messages, links, attachmentMap) {
  const messageMap = new Map();
  
messages.forEach((msg) => {
  const list = messageMap.get(msg.ticket_id) || [];

  list.push({
    id: msg.id,
    ticket_id: msg.ticket_id,
    message: msg.message,
    created_at: msg.created_at,
    created_by: {
      id: msg.created_by_user_id,
      name: msg.created_by_name,
      email: msg.created_by_email,
    },
    attachments: attachmentMap.get(msg.id) || [], // 👈 ADD THIS
  });

  messageMap.set(msg.ticket_id, list);
});

  return tickets.map((t) => ({
    id: t.id,
    job_id: t.job_id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    created_at: t.created_at,
    updated_at: t.updated_at,
    created_by: {
      id: t.created_by_user_id,
      name: t.created_by_name,
      email: t.created_by_email,
    },
    jobs: links.get(t.id) || [],
    messages: messageMap.get(t.id) || [],
  }));
}

// GET /api/tickets?jobId=...
router.get(
  "/",
  auth,
  allowRoles("admin", "branch_admin", "supervisor", "client"),
  async (req, res) => {
    const { jobId } = req.query;

    try {
      let branchId = null;

      if (req.user.role !== "admin") {
        branchId = await getUserBranchId(pool, req.user.id);
        if (!branchId) {
          return res.status(403).json({ error: "Branch not assigned" });
        }
      }

      if (jobId) {
        if (!(await ensureJobAccess(req, res, pool, jobId))) return;
      }

      let where = "";
      const params = [];

      if (jobId) {
        where = "WHERE l.job_id = ?";
        params.push(jobId);
      }

      if (req.user.role === "supervisor" && !jobId) {
        where = "WHERE j.supervisor_id = ?";
        params.push(req.user.id);
      }

      if (req.user.role === "client" && !jobId) {
        const [[userRow]] = await pool.query(
          `SELECT contact_id FROM users WHERE id = ?`,
          [req.user.id]
        );
        if (userRow?.contact_id) {
          where = "WHERE (j.requested_by_contact_id = ? OR t.created_by_user_id = ?)";
          params.push(userRow.contact_id, req.user.id);
        } else {
          where = "WHERE t.created_by_user_id = ?";
          params.push(req.user.id);
        }
      }

      if (branchId) {
        where = where
          ? `${where} AND (j.branch_id = ? OR t.created_by_user_id = ?)`
          : "WHERE (j.branch_id = ? OR t.created_by_user_id = ?)";
        params.push(branchId, req.user.id);
      }

      const [tickets] = await pool.query(
        `
        SELECT DISTINCT
          t.*,
          u.name AS created_by_name,
          u.email AS created_by_email
        FROM job_tickets t
        JOIN users u ON u.id = t.created_by_user_id
        LEFT JOIN job_ticket_links l ON l.ticket_id = t.id
        LEFT JOIN jobs j ON j.id = l.job_id
        ${where}
        ORDER BY t.created_at DESC
        `,
        params
      );

      if (!tickets.length) {
        return res.json([]);
      }

      const ticketIds = tickets.map((t) => t.id);
      const placeholders = ticketIds.map(() => "?").join(",");
      const [messages] = await pool.query(
        `
        SELECT
          m.*,
          u.name AS created_by_name,
          u.email AS created_by_email
        FROM job_ticket_messages m
        JOIN users u ON u.id = m.created_by_user_id
        WHERE m.ticket_id IN (${placeholders})
        ORDER BY m.created_at ASC
        `,
        ticketIds
      );

      const [attachments] = await pool.query(
        `
  SELECT id, ticket_id, message_id, object_key
  FROM ticket_attachments
  WHERE ticket_id IN (${placeholders})
  `,
        ticketIds
      );

      const attachmentMap = new Map();

attachments.forEach((att) => {
  const list = attachmentMap.get(att.message_id) || [];
  list.push({
    id: att.id,
    url: `/api/tickets/attachments?key=${encodeURIComponent(att.object_key)}`
  });
  attachmentMap.set(att.message_id, list);
});

      const [links] = await pool.query(
        `
        SELECT
          l.ticket_id,
          j.id AS job_id,
          j.code AS job_code,
          j.sub_service AS job_title
        FROM job_ticket_links l
        JOIN jobs j ON j.id = l.job_id
        WHERE l.ticket_id IN (${placeholders})
        ORDER BY j.created_at DESC
        `,
        ticketIds
      );

      const linkMap = new Map();
      links.forEach((row) => {
        const list = linkMap.get(row.ticket_id) || [];
        list.push({
          id: row.job_id,
          code: row.job_code,
          title: row.job_title,
        });
        linkMap.set(row.ticket_id, list);
      });

      const payload = await buildTicketResponse(tickets, messages, linkMap, attachmentMap);
      res.json(payload);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  }
);


// POST /api/tickets
router.post(
  "/",
  auth,
  allowRoles("admin", "branch_admin", "supervisor", "client"),
  upload.array("files", 5), // Allow up to 5 files
  async (req, res) => {

    const subject = req.body.subject;
    const message = req.body.message;
    const priority = req.body.priority;

    // handle FormData array
    let jobIds = req.body["job_ids[]"];

    if (!jobIds) {
      jobIds = [];
    } else if (!Array.isArray(jobIds)) {
      jobIds = [jobIds];
    }
    const created_by_user_id = req.user?.id;

    if (!subject?.trim()) {
      return res.status(400).json({ error: "Subject is required" });
    }

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!created_by_user_id) {
      return res.status(400).json({ error: "User is required" });
    }

    try {
      // ✅ Validate job access (only if jobs provided)
      if (jobIds.length > 0) {
        for (const jobId of jobIds) {
          if (!isValidJobId(jobId)) {
            return res.status(400).json({ error: "Invalid job_id" });
          }

          if (!(await ensureJobAccess(req, res, pool, jobId))) return;
        }
      }

      const ticketId = uuid();
      const messageId = uuid();
      let uploadedFiles = [];

      // 1. Upload files first
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const objectKey = `tickets/${Date.now()}_${file.originalname}`;

          await minioClient.putObject(
            BUCKET,
            objectKey,
            file.buffer,
            file.size,
            {
              "Content-Type": file.mimetype,
            }
          );

          uploadedFiles.push(objectKey);
        }
      }

      const normalizedPriority = (priority || "MEDIUM").toUpperCase();
      const allowedPriorities = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

      // ✅ 1. Create ticket (NO job_id)
      await pool.query(
        `
        INSERT INTO job_tickets
          (id, subject, status, priority, created_by_user_id, created_at, updated_at)
        VALUES
          (?, ?, 'OPEN', ?, ?, NOW(), NOW())
        `,
        [
          ticketId,
          subject.trim(),
          allowedPriorities.has(normalizedPriority)
            ? normalizedPriority
            : "MEDIUM",
          created_by_user_id,
        ]
      );

      // ✅ 2. Link jobs (optional)
      if (jobIds.length > 0) {
        for (const jobId of jobIds) {
          await pool.query(
            `
            INSERT INTO job_ticket_links (id, ticket_id, job_id)
            VALUES (?, ?, ?)
            `,
            [uuid(), ticketId, jobId]
          );
        }
      }

      // ✅ 3. First message
      await pool.query(
        `
        INSERT INTO job_ticket_messages
          (id, ticket_id, message, created_by_user_id, created_at)
        VALUES
          (?, ?, ?, ?, NOW())
        `,
        [messageId, ticketId, message.trim(), created_by_user_id]
      );

      if (uploadedFiles.length > 0) {
        for (const key of uploadedFiles) {
          await pool.query(
            `
      INSERT INTO ticket_attachments
        (id, ticket_id, message_id, object_key)
      VALUES (?, ?, ?, ?)
      `,
            [uuid(), ticketId, messageId, key]
          );
        }
      }

      // ✅ 3b. Add ticket comment to job history (if linked)
      if (jobIds.length > 0) {
        const visibleToClient = req.user.role === "client" ? 1 : 0;
        for (const jobId of jobIds) {
          await pool.query(
            `
            INSERT INTO job_history (
              id,
              job_id,
              action,
              message,
              visible_to_client,
              created_by_user_id,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW())
            `,
            [
              uuid(),
              jobId,
              "COMMENT",
              `Ticket raised: ${subject.trim()} - ${message.trim()}`,
              visibleToClient,
              created_by_user_id,
            ]
          );
        }
      }

      res.json({ success: true, ticket_id: ticketId });

      // ✅ 4. Notifications (safe version)
      try {
        let job = null;

        console.log("FILES:", req.files);
        if (jobIds.length > 0) {
          const [[firstJob]] = await pool.query(
            `SELECT id, code, supervisor_id FROM jobs WHERE id = ?`,
            [jobIds[0]]
          );
          job = firstJob;
        }

        const [admins] = await pool.query(
          `SELECT email FROM users WHERE role = 'admin' AND is_active = 1 AND email IS NOT NULL`
        );

        let supervisorEmail = null;
        if (job?.supervisor_id) {
          const [[supervisor]] = await pool.query(
            `SELECT email FROM users WHERE id = ?`,
            [job.supervisor_id]
          );
          supervisorEmail = supervisor?.email || null;
        }

        const recipientSet = new Set(
          admins.map((a) => a.email).filter(Boolean)
        );
        if (supervisorEmail) recipientSet.add(supervisorEmail);

        await sendTicketCreatedEmail({
          toEmails: Array.from(recipientSet),
          ticket: {
            id: ticketId,
            subject: subject.trim(),
            message: message.trim(),
            priority: normalizedPriority,
          },
          job: job
            ? { id: job.id, code: job.code }
            : { id: null, code: null },
          createdBy: { id: created_by_user_id },
        });

      } catch (notifyErr) {
        console.error("Ticket notification failed:", notifyErr);
      }

    } catch (err) {
      console.error("Failed to create ticket:", err);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  }
);

// POST /api/tickets/:ticketId/messages
router.post(
  "/:ticketId/messages",
  auth,
  allowRoles("admin", "branch_admin", "supervisor", "client"),
  async (req, res) => {
    const { ticketId } = req.params;
    const { message } = req.body || {};
    const created_by_user_id = req.user?.id;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const [[ticket]] = await pool.query(
        `SELECT id, status FROM job_tickets WHERE id = ?`,
        [ticketId]
      );

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const access = await ensureTicketAccess(req, res, pool, ticketId);
      if (!access.allowed) return;

      const messageId = uuid();
      await pool.query(
        `
        INSERT INTO job_ticket_messages
          (id, ticket_id, message, created_by_user_id, created_at)
        VALUES
          (?, ?, ?, ?, NOW())
        `,
        [messageId, ticketId, message.trim(), created_by_user_id]
      );

      // If admin/supervisor replies and ticket is OPEN, move to IN_PROGRESS
      if (["admin", "supervisor"].includes(req.user.role) && ticket.status === "OPEN") {
        await pool.query(
          `UPDATE job_tickets SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = ?`,
          [ticketId]
        );
      } else {
        await pool.query(
          `UPDATE job_tickets SET updated_at = NOW() WHERE id = ?`,
          [ticketId]
        );
      }

      res.json({ success: true, message_id: messageId });
    } catch (err) {
      console.error("Failed to add ticket message:", err);
      res.status(500).json({ error: "Failed to add ticket message" });
    }
  }
);

// PATCH /api/tickets/:ticketId/status
router.patch(
  "/:ticketId/status",
  auth,
  allowRoles("admin", "branch_admin", "supervisor"),
  async (req, res) => {
    const { ticketId } = req.params;
    const { status } = req.body || {};

    const allowed = new Set(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
    if (!allowed.has(String(status || "").toUpperCase())) {
      return res.status(400).json({ error: "Invalid status" });
    }

    try {
      const [[ticket]] = await pool.query(
        `SELECT id FROM job_tickets WHERE id = ?`,
        [ticketId]
      );

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const access = await ensureTicketAccess(req, res, pool, ticketId);
      if (!access.allowed) return;

      await pool.query(
        `UPDATE job_tickets SET status = ?, updated_at = NOW() WHERE id = ?`,
        [String(status).toUpperCase(), ticketId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to update ticket status:", err);
      res.status(500).json({ error: "Failed to update ticket status" });
    }
  }
);

// GET /api/tickets/attachments/:key

router.get('/attachments', async (req, res) => {
  const key = req.query.key;

  if (!key) {
    return res.status(400).json({ error: "Missing key" });
  }

  try {
    const stat = await minioClient.statObject(BUCKET, key);

    res.setHeader(
      'Content-Type',
      stat.metaData['content-type'] || 'application/octet-stream'
    );

    const stream = await minioClient.getObject(BUCKET, key);
    stream.pipe(res);

  } catch (err) {
    console.error('Failed to get attachment:', err);
    res.status(404).json({ error: 'Attachment not found' });
  }
});

module.exports = router;

