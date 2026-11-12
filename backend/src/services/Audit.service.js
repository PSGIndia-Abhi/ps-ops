// Accountant Panel audit trail.
//
// logAudit() writes one row to audit_logs (+ the records it touched to audit_log_refs).
// Call it with the same connection as the change, before commit, so the entry is saved
// only when the change is. It never throws: if the audit tables have not been created
// yet (database/.../20261111_create_audit_logs.sql) or the write fails, the action
// itself still goes through and the problem is only logged on the server.

const { v4: uuid } = require("uuid");

const MODULES = ["INVOICE", "PAYMENT", "TDS", "IMPORT", "CONTACT", "EXPORT"];

let missingTableWarned = false;

function clip(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

// Dates as YYYY-MM-DD (DATE columns come back as local-midnight Date objects), numbers rounded.
function normalize(value) {
  if (value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const p = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Math.round(Number(value) * 100) / 100;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return value.slice(0, 10);
  return value;
}

// [{ field, from, to }] for the fields whose value changed.
function diff(before, after, fields) {
  const out = [];
  for (const field of fields) {
    const from = normalize(before?.[field]);
    const to = normalize(after?.[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field, from, to });
  }
  return out;
}

function clientIp(req) {
  const fwd = req?.headers?.["x-forwarded-for"];
  return clip((fwd ? String(fwd).split(",")[0].trim() : null) || req?.ip || req?.socket?.remoteAddress, 64);
}

/**
 * @param db   pool or the transaction's connection
 * @param req  the express request (who / IP / browser); may be null for system jobs
 * @param e    { module, action, entity_type, entity_id, entity_label, customer_id, summary,
 *               changes, details, reason, source, refs: [{ entity_type, entity_id }] }
 */
async function logAudit(db, req, e) {
  try {
    const user = req?.user || {};
    let name = null;
    let branchId = null;
    if (user.id) {
      const [[u]] = await db.query("SELECT name, branch_id FROM users WHERE id = ?", [user.id]);
      name = u?.name || null;
      branchId = u?.branch_id || null;
    } else if (user.temp_worker_name) {
      name = user.temp_worker_name;
    }

    const id = uuid();
    await db.query(
      `INSERT INTO audit_logs
       (id, user_id, user_name, user_role, branch_id, module, action, entity_type, entity_id, entity_label,
        customer_id, summary, changes, details, reason, source, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.id || null,
        clip(name, 150),
        clip(user.role, 100),
        branchId,
        clip(e.module, 30),
        clip(e.action, 50),
        clip(e.entity_type, 30),
        clip(e.entity_id, 64),
        clip(e.entity_label, 255),
        clip(e.customer_id, 64),
        clip(e.summary, 500),
        e.changes && e.changes.length ? JSON.stringify(e.changes) : null,
        e.details ? JSON.stringify(e.details) : null,
        clip(e.reason, 500),
        clip(e.source || "WEB", 20),
        req ? clientIp(req) : null,
        clip(req?.headers?.["user-agent"], 255),
      ]
    );

    // The main record plus anything else it touched, without duplicates.
    const refs = new Map();
    const add = (type, rid) => {
      if (type && rid) refs.set(`${type}|${rid}`, [id, clip(type, 30), clip(rid, 64)]);
    };
    add(e.entity_type, e.entity_id);
    if (e.customer_id) add("CUSTOMER", e.customer_id);
    for (const r of e.refs || []) add(r.entity_type, r.entity_id);
    if (refs.size) {
      await db.query("INSERT IGNORE INTO audit_log_refs (audit_id, entity_type, entity_id) VALUES ?", [[...refs.values()]]);
    }
    return id;
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      if (!missingTableWarned) {
        console.warn("Audit log tables are missing - run backend/src/data/migrations/20261111_create_audit_logs.sql. Audit entries are skipped until then.");
        missingTableWarned = true;
      }
    } else {
      console.error("Audit log write failed:", err);
    }
    return null;
  }
}

module.exports = { logAudit, diff, normalize, MODULES };
