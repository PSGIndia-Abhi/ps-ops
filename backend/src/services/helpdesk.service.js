// Helpdesk (helpdesk_* tables, migration 20261111_helpdesk_01_tables.sql).
//
// Every signed-in user except the technical team raises tickets (web and app) and chats about them.
// The "Technical Lead" and "Technical Team" roles answer - both equal: they
// see every ticket, pick up, assign, reply, write internal notes and change status / priority.
// Admin raises like anyone else and never answers. Checked by role name on purpose: the permission
// middleware lets admin through everything, which is exactly what must not happen here.
//
// Status flow: OPEN -> IN_PROGRESS -> WAITING_USER -> RESOLVED -> CLOSED.
//   - An agent's first public reply picks the ticket up (assigns it) and moves OPEN -> IN_PROGRESS.
//   - The user replying while WAITING_USER / RESOLVED puts it back in the team's court.
//   - On RESOLVED the user either confirms (CLOSED) or reopens. RESOLVED closes itself after 7 days.
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const minioClient = require("../lib/minio");
const { notifyUsers } = require("./notifications.service");

const BUCKET = process.env.MINIO_BUCKET;
// Technical Head is NOT here on purpose: they raise tickets like everyone else.
const AGENT_ROLES = ["technical lead", "technical team"];
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const ACTIVE = ["OPEN", "IN_PROGRESS", "WAITING_USER"];
const STATUS_LABEL = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_USER: "Waiting for your reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const PRIORITY_LABEL = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
const AUTO_CLOSE_DAYS = 7;
const REOPEN_WINDOW_DAYS = 30;
const MAX_MESSAGE = 5000;
const PAGE_SIZE = 50;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Who is who
// ---------------------------------------------------------------------------

function isAgentRole(role) {
  return !!role && AGENT_ROLES.includes(String(role).toLowerCase().trim());
}

function isAgent(req) {
  return isAgentRole(req.user?.role);
}

// Temporary job workers have no user id - they cannot use the helpdesk.
function requireRealUser(req) {
  if (!req.user?.id || req.user.is_temporary_worker) throw new HttpError(403, "Helpdesk is not available for this account");
}

function requireAgent(req) {
  requireRealUser(req);
  if (!isAgent(req)) throw new HttpError(403, "Only the technical team can do this");
}

function requireRaiser(req) {
  requireRealUser(req);
  if (isAgent(req)) throw new HttpError(403, "The technical team answers tickets and cannot raise them");
}

function ticketCode(no) {
  return `HD-${String(no).padStart(5, "0")}`;
}

async function userName(executor, userId) {
  const [[row]] = await executor.query("SELECT name FROM users WHERE id = ?", [userId]);
  return row?.name || "Someone";
}

async function listAgents(executor = pool) {
  const [rows] = await executor.query(
    `SELECT u.id, u.name, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE LOWER(r.name) IN (?) AND (u.is_active IS NULL OR u.is_active = 1)
      ORDER BY FIELD(LOWER(r.name), 'technical lead', 'technical team'), u.name`,
    [AGENT_ROLES]
  );
  return rows.map((r) => ({ id: String(r.id), name: r.name, role: r.role }));
}

async function agentIds(executor = pool) {
  return (await listAgents(executor)).map((a) => a.id);
}

// The ticket, if this person may see it (agents: every ticket; raisers: their own).
async function loadTicket(executor, req, ticketId, { forUpdate = false } = {}) {
  const [[ticket]] = await executor.query(
    `SELECT * FROM helpdesk_tickets WHERE id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
    [ticketId]
  );
  if (!ticket) throw new HttpError(404, "Ticket not found");
  if (!isAgent(req) && String(ticket.raised_by) !== String(req.user.id)) throw new HttpError(404, "Ticket not found");
  return ticket;
}

// ---------------------------------------------------------------------------
// Notifications (bell + push). Best effort - never fail the action that caused them.
// ---------------------------------------------------------------------------

// `recipients` is a list of user ids, or a function returning (a promise of) one.
function notify(recipients, ticket, title, message, exceptUserId) {
  setImmediate(() => {
    Promise.resolve()
      .then(() => (typeof recipients === "function" ? recipients() : recipients))
      .then((userIds) =>
        notifyUsers(
          userIds,
          { type: "HELPDESK", title, message, entityType: "helpdesk_ticket", entityId: ticket.id },
          { exceptUserId }
        )
      )
      .catch((err) => console.error("[helpdesk] notify failed:", err.message));
  });
}

// Whoever handles the ticket on the team side: the assignee, or the whole team while unassigned.
async function teamRecipients(ticket) {
  return ticket.assigned_to ? [String(ticket.assigned_to)] : agentIds();
}

function preview(text, max = 120) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/i;

function isAllowedFile(file) {
  return ALLOWED_MIME.test(file.mimetype || "");
}

function safeFileName(name) {
  const base = String(name || "file").split(/[\\/]/).pop();
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

// Uploads first (outside the transaction); returns rows ready to insert, or removes what it put.
async function uploadFiles(ticketId, files) {
  const uploaded = [];
  try {
    for (const file of files || []) {
      const name = safeFileName(file.originalname);
      const key = `helpdesk/${ticketId}/${uuid()}-${name}`;
      await minioClient.putObject(BUCKET, key, file.buffer, file.size, { "Content-Type": file.mimetype });
      uploaded.push({ key, name, mime: file.mimetype, size: file.size });
    }
    return uploaded;
  } catch (err) {
    await removeFiles(uploaded);
    throw err;
  }
}

async function removeFiles(uploaded) {
  for (const f of uploaded) await minioClient.removeObject(BUCKET, f.key).catch(() => {});
}

async function insertAttachments(conn, ticketId, messageId, userId, uploaded) {
  for (const f of uploaded) {
    await conn.query(
      `INSERT INTO helpdesk_attachments (id, ticket_id, message_id, file_key, file_name, mime_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), ticketId, messageId, f.key, f.name, f.mime, f.size, userId]
    );
  }
}

async function insertMessage(conn, ticketId, senderId, kind, body) {
  const id = uuid();
  await conn.query(
    `INSERT INTO helpdesk_messages (id, ticket_id, sender_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))`,
    [id, ticketId, senderId, kind, body]
  );
  return id;
}

async function markRead(executor, ticketId, userId) {
  await executor.query(
    `INSERT INTO helpdesk_reads (ticket_id, user_id, last_read_at) VALUES (?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE last_read_at = NOW(3)`,
    [ticketId, userId]
  );
}

// ---------------------------------------------------------------------------
// Resolved tickets close themselves after AUTO_CLOSE_DAYS. Checked lazily (at most every 10
// minutes, whenever someone opens the helpdesk) so no new cron job is needed.
// ---------------------------------------------------------------------------

let lastAutoClose = 0;
async function autoCloseResolved() {
  if (Date.now() - lastAutoClose < 10 * 60 * 1000) return;
  lastAutoClose = Date.now();
  try {
    const [rows] = await pool.query(
      `SELECT id FROM helpdesk_tickets WHERE status = 'RESOLVED' AND resolved_at < NOW() - INTERVAL ? DAY`,
      [AUTO_CLOSE_DAYS]
    );
    for (const { id } of rows) {
      await inTransaction(async (conn) => {
        const [res] = await conn.query(
          `UPDATE helpdesk_tickets SET status = 'CLOSED', closed_at = NOW() WHERE id = ? AND status = 'RESOLVED'`,
          [id]
        );
        if (res.affectedRows) {
          await insertMessage(conn, id, null, "SYSTEM", `Closed automatically - no response ${AUTO_CLOSE_DAYS} days after it was resolved`);
        }
      });
    }
  } catch (err) {
    console.error("[helpdesk] auto-close failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

// Which message kinds this person sees: users never see the team's internal notes.
// Assignment shuffles (picked up / assigned / unassigned) are the team's business: the person who
// raised the ticket never sees them, and they never count as "new" for them. Status changes still do.
const TEAM_EVENT_SQL = `(m.kind = 'SYSTEM' AND (m.body LIKE '% picked up this ticket' OR m.body LIKE '% assigned this ticket to %' OR m.body LIKE '% unassigned this ticket'))`;
function hideTeamEvents(req) {
  return isAgent(req) ? "" : ` AND NOT ${TEAM_EVENT_SQL}`;
}

function visibleKinds(req) {
  return isAgent(req) ? ["MESSAGE", "NOTE", "SYSTEM"] : ["MESSAGE", "SYSTEM"];
}

function shapeTicket(row) {
  return {
    id: row.id,
    code: ticketCode(row.ticket_no),
    ticketNo: row.ticket_no,
    subject: row.subject,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    priority: row.priority,
    priorityLabel: PRIORITY_LABEL[row.priority],
    source: row.source,
    page: row.page,
    appVersion: row.app_version,
    device: row.device,
    raisedBy: { id: String(row.raised_by), name: row.raised_by_name || null, role: row.raised_by_role || null },
    assignedTo: row.assigned_to ? { id: String(row.assigned_to), name: row.assigned_to_name || null } : null,
    lastMessageAt: row.last_message_at,
    lastMessageBy: row.last_message_by,
    lastMessagePreview: row.last_preview !== undefined ? preview(row.last_preview) : undefined,
    unread: row.unread !== undefined ? !!Number(row.unread) : undefined,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    reopenCount: row.reopen_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Ticket list.
 *   Raiser scopes: open | closed | all (always their own tickets).
 *   Agent scopes:  unassigned | mine | open | closed | all.
 * Filters: q (HD-00042, 42, subject or raiser's name), priority, page (1-based).
 */
async function listTickets(req) {
  requireRealUser(req);
  await autoCloseResolved();
  const agent = isAgent(req);
  const me = req.user.id;
  const scope = String(req.query.scope || (agent ? "open" : "all")).toLowerCase();
  const where = [];
  const params = [];

  if (!agent) {
    where.push("t.raised_by = ?");
    params.push(me);
  }

  if (scope === "open") where.push(`t.status IN ('OPEN','IN_PROGRESS','WAITING_USER')`);
  else if (scope === "closed") where.push(`t.status IN ('RESOLVED','CLOSED')`);
  else if (agent && scope === "unassigned") where.push(`t.assigned_to IS NULL AND t.status IN ('OPEN','IN_PROGRESS','WAITING_USER')`);
  else if (agent && scope === "mine") {
    where.push(`t.assigned_to = ? AND t.status IN ('OPEN','IN_PROGRESS','WAITING_USER')`);
    params.push(me);
  }

  if (req.query.priority && PRIORITIES.includes(String(req.query.priority).toUpperCase())) {
    where.push("t.priority = ?");
    params.push(String(req.query.priority).toUpperCase());
  }

  const q = String(req.query.q || "").trim();
  if (q) {
    const no = q.replace(/^hd-?/i, "");
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    if (/^\d+$/.test(no)) {
      where.push("(t.ticket_no = ? OR t.subject LIKE ? OR ru.name LIKE ?)");
      params.push(Number(no), like, like);
    } else {
      where.push("(t.subject LIKE ? OR ru.name LIKE ?)");
      params.push(like, like);
    }
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const kinds = visibleKinds(req);
  const [rows] = await pool.query(
    `SELECT t.*, ru.name AS raised_by_name, au.name AS assigned_to_name,
            (SELECT m.body FROM helpdesk_messages m
              WHERE m.ticket_id = t.id AND m.kind IN (?)${hideTeamEvents(req)}
              ORDER BY m.created_at DESC LIMIT 1) AS last_preview,
            EXISTS (SELECT 1 FROM helpdesk_messages m
                     WHERE m.ticket_id = t.id AND m.kind IN (?)${hideTeamEvents(req)}
                       AND (m.sender_id IS NULL OR m.sender_id <> ?)
                       AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')) AS unread
       FROM helpdesk_tickets t
       JOIN users ru ON ru.id = t.raised_by
       LEFT JOIN users au ON au.id = t.assigned_to
       LEFT JOIN helpdesk_reads r ON r.ticket_id = t.id AND r.user_id = ?
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.last_message_at DESC
      LIMIT ? OFFSET ?`,
    [kinds, kinds, me, me, ...params, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE]
  );

  return {
    tickets: rows.slice(0, PAGE_SIZE).map(shapeTicket),
    page,
    hasMore: rows.length > PAGE_SIZE,
  };
}

// Counts for badges and queue tabs. Cheap enough to poll.
async function summary(req) {
  requireRealUser(req);
  const agent = isAgent(req);
  const me = req.user.id;
  const kinds = visibleKinds(req);

  const [[unreadRow]] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM helpdesk_tickets t
       LEFT JOIN helpdesk_reads r ON r.ticket_id = t.id AND r.user_id = ?
      WHERE ${agent ? "1 = 1" : "t.raised_by = ?"}
        AND EXISTS (SELECT 1 FROM helpdesk_messages m
                     WHERE m.ticket_id = t.id AND m.kind IN (?)${hideTeamEvents(req)}
                       AND (m.sender_id IS NULL OR m.sender_id <> ?)
                       AND m.created_at > COALESCE(r.last_read_at, '1970-01-01'))
        ${agent ? "AND (t.assigned_to = ? OR (t.assigned_to IS NULL AND t.status IN ('OPEN','IN_PROGRESS','WAITING_USER')))" : ""}`,
    agent ? [me, kinds, me, me] : [me, me, kinds, me]
  );

  if (!agent) {
    const [[row]] = await pool.query(
      `SELECT SUM(status IN ('OPEN','IN_PROGRESS','WAITING_USER')) AS open,
              SUM(status = 'WAITING_USER') AS waiting,
              SUM(status = 'RESOLVED') AS resolved
         FROM helpdesk_tickets WHERE raised_by = ?`,
      [me]
    );
    return {
      isAgent: false,
      canRaise: true,
      unread: Number(unreadRow.n) || 0,
      open: Number(row.open) || 0,
      waitingForYou: Number(row.waiting) + Number(row.resolved) || 0,
    };
  }

  const [[row]] = await pool.query(
    `SELECT SUM(assigned_to IS NULL AND status IN ('OPEN','IN_PROGRESS','WAITING_USER')) AS unassigned,
            SUM(assigned_to = ? AND status IN ('OPEN','IN_PROGRESS','WAITING_USER')) AS mine,
            SUM(status IN ('OPEN','IN_PROGRESS','WAITING_USER')) AS open,
            SUM(status IN ('OPEN','IN_PROGRESS') AND last_message_by = 'USER') AS needs_reply
       FROM helpdesk_tickets`,
    [me]
  );
  return {
    isAgent: true,
    canRaise: false,
    unread: Number(unreadRow.n) || 0,
    unassigned: Number(row.unassigned) || 0,
    mine: Number(row.mine) || 0,
    open: Number(row.open) || 0,
    needsReply: Number(row.needs_reply) || 0,
  };
}

// One ticket with its thread. Opening it marks it read for this person.
async function getTicket(req) {
  requireRealUser(req);
  await autoCloseResolved();
  const base = await loadTicket(pool, req, req.params.id);
  const [[row]] = await pool.query(
    `SELECT t.*, ru.name AS raised_by_name, au.name AS assigned_to_name
       FROM helpdesk_tickets t
       JOIN users ru ON ru.id = t.raised_by
       LEFT JOIN users au ON au.id = t.assigned_to
      WHERE t.id = ?`,
    [base.id]
  );

  const [messages] = await pool.query(
    `SELECT m.id, m.sender_id, m.kind, m.body, m.created_at, u.name AS sender_name, r.name AS sender_role
       FROM helpdesk_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE m.ticket_id = ? AND m.kind IN (?)${hideTeamEvents(req)}
      ORDER BY m.created_at ASC`,
    [base.id, visibleKinds(req)]
  );

  const [attachments] = messages.length
    ? await pool.query(
        `SELECT id, message_id, file_name, mime_type, size_bytes FROM helpdesk_attachments
          WHERE message_id IN (?) ORDER BY created_at ASC`,
        [messages.map((m) => m.id)]
      )
    : [[]];
  const filesByMessage = {};
  for (const a of attachments) {
    (filesByMessage[a.message_id] ||= []).push({
      id: a.id,
      name: a.file_name,
      mimeType: a.mime_type,
      size: a.size_bytes,
      isImage: /^image\//i.test(a.mime_type),
    });
  }

  await markRead(pool, base.id, req.user.id);

  const ticket = shapeTicket(row);
  const me = String(req.user.id);
  const agent = isAgent(req);
  const statusAge = row.closed_at ? (Date.now() - new Date(row.closed_at).getTime()) / 86400000 : 0;
  return {
    ticket,
    messages: messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      createdAt: m.created_at,
      sender: m.sender_id
        ? { id: String(m.sender_id), name: m.sender_name, role: m.sender_role }
        : null,
      // USER = the person who raised the ticket; AGENT = the technical team.
      side: m.kind === "SYSTEM" ? "SYSTEM" : String(m.sender_id) === String(row.raised_by) ? "USER" : "AGENT",
      isMine: m.sender_id !== null && String(m.sender_id) === me,
      attachments: filesByMessage[m.id] || [],
    })),
    // What this person may do now - the screens show buttons from this, the API enforces it anyway.
    actions: {
      reply: row.status !== "CLOSED",
      addNote: agent,
      changeStatus: agent,
      changePriority: agent,
      assign: agent,
      pickUp: agent && String(row.assigned_to || "") !== me,
      confirmSolved: !agent && row.status === "RESOLVED",
      reopen: !agent && (row.status === "RESOLVED" || (row.status === "CLOSED" && statusAge <= REOPEN_WINDOW_DAYS)),
    },
  };
}

// The file, if this person may see the message it belongs to.
async function getAttachment(req) {
  requireRealUser(req);
  const [[att]] = await pool.query(
    `SELECT a.*, m.kind FROM helpdesk_attachments a JOIN helpdesk_messages m ON m.id = a.message_id WHERE a.id = ?`,
    [req.params.id]
  );
  if (!att) throw new HttpError(404, "File not found");
  await loadTicket(pool, req, att.ticket_id);
  if (att.kind === "NOTE" && !isAgent(req)) throw new HttpError(404, "File not found");
  const stream = await minioClient.getObject(BUCKET, att.file_key);
  return { stream, name: att.file_name, mimeType: att.mime_type, size: att.size_bytes };
}

// ---------------------------------------------------------------------------
// Write side
// ---------------------------------------------------------------------------

function cleanText(value, max = MAX_MESSAGE) {
  const s = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (s.length > max) throw new HttpError(400, `Message is too long (max ${max} characters)`);
  return s;
}

function short(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
}

// Raise a ticket: a description (required), optional subject and up to 5 files.
async function createTicket(req) {
  requireRaiser(req);
  const message = cleanText(req.body.message ?? req.body.description);
  if (!message) throw new HttpError(400, "Please describe the problem");

  // No subject asked for? The first line of the description becomes it.
  let subject = String(req.body.subject || "").trim();
  if (!subject) subject = message.split("\n")[0];
  subject = subject.length > 100 ? `${subject.slice(0, 99)}…` : subject;

  const source = String(req.body.source || "").toUpperCase() === "APP" ? "APP" : "WEB";
  const ticketId = uuid();
  const name = await userName(pool, req.user.id);
  const uploaded = await uploadFiles(ticketId, req.files);

  let ticketNo;
  try {
    ticketNo = await inTransaction(async (conn) => {
      const [res] = await conn.query(
        `INSERT INTO helpdesk_tickets
           (id, subject, raised_by, raised_by_role, source, page, app_version, device, last_message_at, last_message_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), 'USER')`,
        [
          ticketId,
          subject,
          req.user.id,
          short(req.user.role, 100),
          source,
          short(req.body.page, 255),
          short(req.body.appVersion, 50),
          short(req.body.device || req.headers["user-agent"], 255),
        ]
      );
      const messageId = await insertMessage(conn, ticketId, req.user.id, "MESSAGE", message);
      await insertAttachments(conn, ticketId, messageId, req.user.id, uploaded);
      await markRead(conn, ticketId, req.user.id);
      return res.insertId;
    });
  } catch (err) {
    await removeFiles(uploaded);
    throw err;
  }

  notify(() => agentIds(), { id: ticketId }, `New helpdesk ticket ${ticketCode(ticketNo)}`, `${name}: ${preview(subject, 90)}`, req.user.id);
  req.params.id = ticketId;
  return getTicket(req);
}

// A chat message (or, for the team, an internal note) with optional files.
async function addMessage(req) {
  requireRealUser(req);
  const agent = isAgent(req);
  const internal = agent && ["1", "true", "yes"].includes(String(req.body.internal || "").toLowerCase());
  const body = cleanText(req.body.message);
  const files = req.files || [];
  if (!body && files.length === 0) throw new HttpError(400, "Write a message or attach a file");

  const ticket = await loadTicket(pool, req, req.params.id);
  if (ticket.status === "CLOSED") {
    throw new HttpError(409, agent ? "This ticket is closed - reopen it first" : "This ticket is closed - tap Reopen to continue");
  }

  const uploaded = await uploadFiles(ticket.id, files);
  const me = req.user.id;
  let after;
  try {
    after = await inTransaction(async (conn) => {
      const t = await loadTicket(conn, req, ticket.id, { forUpdate: true });
      if (t.status === "CLOSED") throw new HttpError(409, "This ticket is closed");
      const name = await userName(conn, me);
      const set = [];
      const vals = [];
      let systemLine = null;
      let assignedTo = t.assigned_to;
      let status = t.status;

      if (agent && !internal) {
        // First public reply picks the ticket up.
        if (!t.assigned_to) {
          assignedTo = me;
          set.push("assigned_to = ?");
          vals.push(me);
          systemLine = `${name} picked up this ticket`;
        }
        if (t.status === "OPEN") status = "IN_PROGRESS";
      } else if (!agent) {
        if (t.status === "RESOLVED") {
          status = t.assigned_to ? "IN_PROGRESS" : "OPEN";
          set.push("reopen_count = reopen_count + 1", "resolved_at = NULL");
          systemLine = `${name} replied, so the ticket was reopened`;
        } else if (t.status === "WAITING_USER") {
          status = t.assigned_to ? "IN_PROGRESS" : "OPEN";
        }
      }

      if (status !== t.status) {
        set.push("status = ?");
        vals.push(status);
      }
      if (!internal) {
        set.push("last_message_at = NOW(3)", "last_message_by = ?");
        vals.push(agent ? "AGENT" : "USER");
      }
      if (set.length) await conn.query(`UPDATE helpdesk_tickets SET ${set.join(", ")} WHERE id = ?`, [...vals, t.id]);

      if (systemLine) await insertMessage(conn, t.id, me, "SYSTEM", systemLine);
      const messageId = await insertMessage(conn, t.id, me, internal ? "NOTE" : "MESSAGE", body || "(file attached)");
      await insertAttachments(conn, t.id, messageId, me, uploaded);
      await markRead(conn, t.id, me);
      return { ...t, assigned_to: assignedTo, status, senderName: name };
    });
  } catch (err) {
    await removeFiles(uploaded);
    throw err;
  }

  const code = ticketCode(after.ticket_no);
  const text = preview(body || "Sent a file", 100);
  if (internal) {
    if (after.assigned_to && String(after.assigned_to) !== String(me)) {
      notify([after.assigned_to], after, `Internal note on ${code}`, `${after.senderName}: ${text}`, me);
    }
  } else if (agent) {
    notify([after.raised_by], after, `Reply on your ticket ${code}`, `${after.senderName}: ${text}`, me);
  } else {
    notify(() => teamRecipients(after), after, `New reply on ${code}`, `${after.senderName}: ${text}`, me);
  }

  return getTicket(req);
}

// Team only: status, priority, assignee (any mix). Each change is written into the thread.
async function updateTicket(req) {
  requireAgent(req);
  const me = req.user.id;
  const body = req.body || {};
  const wantStatus = body.status !== undefined ? String(body.status).toUpperCase() : undefined;
  const wantPriority = body.priority !== undefined ? String(body.priority).toUpperCase() : undefined;
  const hasAssign = Object.prototype.hasOwnProperty.call(body, "assignedTo");
  const wantAssign = hasAssign ? (body.assignedTo === null || body.assignedTo === "" ? null : String(body.assignedTo === "me" ? me : body.assignedTo)) : undefined;

  if (wantStatus !== undefined && !STATUSES.includes(wantStatus)) throw new HttpError(400, "Unknown status");
  if (wantPriority !== undefined && !PRIORITIES.includes(wantPriority)) throw new HttpError(400, "Unknown priority");
  if (wantStatus === undefined && wantPriority === undefined && !hasAssign) throw new HttpError(400, "Nothing to change");

  let assignee = null;
  if (wantAssign) {
    assignee = (await listAgents()).find((a) => a.id === wantAssign);
    if (!assignee) throw new HttpError(400, "Tickets can only be assigned to the technical team");
  }

  const events = await inTransaction(async (conn) => {
    const t = await loadTicket(conn, req, req.params.id, { forUpdate: true });
    const name = await userName(conn, me);
    const set = [];
    const vals = [];
    const out = { ticket: t, statusChanged: null, assignedToOther: null };

    if (hasAssign && String(t.assigned_to || "") !== String(wantAssign || "")) {
      set.push("assigned_to = ?");
      vals.push(wantAssign);
      const line = !wantAssign
        ? `${name} unassigned this ticket`
        : wantAssign === String(me)
          ? `${name} picked up this ticket`
          : `${name} assigned this ticket to ${assignee.name}`;
      await insertMessage(conn, t.id, me, "SYSTEM", line);
      if (wantAssign && wantAssign !== String(me)) out.assignedToOther = wantAssign;
    }

    if (wantPriority !== undefined && wantPriority !== t.priority) {
      set.push("priority = ?");
      vals.push(wantPriority);
      // Priority is the team's business - logged as a note the user does not see.
      await insertMessage(conn, t.id, me, "NOTE", `Priority changed from ${PRIORITY_LABEL[t.priority]} to ${PRIORITY_LABEL[wantPriority]}`);
    }

    if (wantStatus !== undefined && wantStatus !== t.status) {
      set.push("status = ?");
      vals.push(wantStatus);
      if (wantStatus === "RESOLVED") set.push("resolved_at = NOW()");
      else set.push("resolved_at = NULL");
      if (wantStatus === "CLOSED") set.push("closed_at = NOW()");
      else set.push("closed_at = NULL");
      if (!ACTIVE.includes(t.status) && ACTIVE.includes(wantStatus)) set.push("reopen_count = reopen_count + 1");
      await insertMessage(conn, t.id, me, "SYSTEM", `${name} changed the status to ${STATUS_LABEL[wantStatus]}`);
      out.statusChanged = wantStatus;
    }

    if (set.length) await conn.query(`UPDATE helpdesk_tickets SET ${set.join(", ")} WHERE id = ?`, [...vals, t.id]);
    out.name = name;
    return out;
  });

  const t = events.ticket;
  const code = ticketCode(t.ticket_no);
  if (events.statusChanged) {
    const msg = {
      WAITING_USER: "The technical team needs more information from you",
      RESOLVED: "Marked as resolved - please confirm it is solved, or reopen it",
      CLOSED: "Your ticket was closed",
      OPEN: "Your ticket was reopened",
      IN_PROGRESS: "The technical team is working on your ticket",
    }[events.statusChanged];
    notify([t.raised_by], t, `${code}: ${STATUS_LABEL[events.statusChanged]}`, msg, me);
  }
  if (events.assignedToOther) {
    notify([events.assignedToOther], t, `${code} assigned to you`, `${events.name} assigned you: ${preview(t.subject, 90)}`, me);
  }

  return getTicket(req);
}

// The user confirms a resolved ticket is solved.
async function confirmSolved(req) {
  requireRaiser(req);
  const me = req.user.id;
  const t = await inTransaction(async (conn) => {
    const ticket = await loadTicket(conn, req, req.params.id, { forUpdate: true });
    if (ticket.status !== "RESOLVED") throw new HttpError(409, "Only a resolved ticket can be confirmed");
    await conn.query(`UPDATE helpdesk_tickets SET status = 'CLOSED', closed_at = NOW() WHERE id = ?`, [ticket.id]);
    const name = await userName(conn, me);
    await insertMessage(conn, ticket.id, me, "SYSTEM", `${name} confirmed the issue is solved`);
    await markRead(conn, ticket.id, me);
    return { ...ticket, senderName: name };
  });
  if (t.assigned_to) {
    notify([t.assigned_to], t, `${ticketCode(t.ticket_no)} confirmed solved`, `${t.senderName} confirmed it is solved`, me);
  }
  return getTicket(req);
}

// The user says it is still a problem: reopens a resolved ticket, or one closed within 30 days.
async function reopenTicket(req) {
  requireRaiser(req);
  const me = req.user.id;
  const message = cleanText(req.body?.message);
  const t = await inTransaction(async (conn) => {
    const ticket = await loadTicket(conn, req, req.params.id, { forUpdate: true });
    const closedDays = ticket.closed_at ? (Date.now() - new Date(ticket.closed_at).getTime()) / 86400000 : 0;
    const ok = ticket.status === "RESOLVED" || (ticket.status === "CLOSED" && closedDays <= REOPEN_WINDOW_DAYS);
    if (!ok) {
      throw new HttpError(409, ticket.status === "CLOSED" ? `Closed more than ${REOPEN_WINDOW_DAYS} days ago - please raise a new ticket` : "This ticket is already open");
    }
    const status = ticket.assigned_to ? "IN_PROGRESS" : "OPEN";
    await conn.query(
      `UPDATE helpdesk_tickets
          SET status = ?, resolved_at = NULL, closed_at = NULL, reopen_count = reopen_count + 1,
              last_message_at = NOW(3), last_message_by = 'USER'
        WHERE id = ?`,
      [status, ticket.id]
    );
    const name = await userName(conn, me);
    await insertMessage(conn, ticket.id, me, "SYSTEM", `${name} reopened this ticket - still an issue`);
    if (message) await insertMessage(conn, ticket.id, me, "MESSAGE", message);
    await markRead(conn, ticket.id, me);
    return { ...ticket, senderName: name };
  });
  notify(() => teamRecipients(t), t, `${ticketCode(t.ticket_no)} reopened`, `${t.senderName}: ${message ? preview(message, 90) : "Still an issue"}`, me);
  return getTicket(req);
}

module.exports = {
  HttpError,
  sendError,
  isAgent,
  isAllowedFile,
  requireAgent,
  listAgents,
  listTickets,
  summary,
  getTicket,
  getAttachment,
  createTicket,
  addMessage,
  updateTicket,
  confirmSolved,
  reopenTicket,
};
