const { pool } = require("../../db");
const { logAudit, MODULES } = require("../services/Audit.service");

const NOT_SET_UP = "The audit log is not set up yet. Run backend/src/data/migrations/20261111_create_audit_logs.sql on the database.";

function isAdmin(req) {
  return req.user?.role === "admin";
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toEntry(r) {
  return {
    id: r.id,
    created_at: r.created_at,
    user_id: r.user_id,
    user_name: r.user_name,
    user_role: r.user_role,
    module: r.module,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    entity_label: r.entity_label,
    customer_id: r.customer_id,
    customer_name: r.customer_name || null,
    summary: r.summary,
    changes: parseJson(r.changes) || [],
    details: parseJson(r.details),
    reason: r.reason,
    source: r.source,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
  };
}

// WHERE clause for the Audit Log filters: from, to (YYYY-MM-DD), user_id, module, action, q.
function buildFilter(query) {
  const where = [];
  const params = [];
  const day = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (day(query.from)) {
    where.push("a.created_at >= ?");
    params.push(`${query.from} 00:00:00`);
  }
  if (day(query.to)) {
    where.push("a.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(query.to);
  }
  if (query.user_id) {
    where.push("a.user_id = ?");
    params.push(query.user_id);
  }
  if (MODULES.includes(query.module)) {
    where.push("a.module = ?");
    params.push(query.module);
  }
  if (query.action && /^[A-Z_]{3,50}$/.test(query.action)) {
    where.push("a.action = ?");
    params.push(query.action);
  }
  const q = String(query.q || "").trim();
  if (q) {
    const like = `%${q}%`;
    where.push(`(a.entity_label LIKE ? OR a.summary LIKE ? OR a.customer_id LIKE ? OR a.user_name LIKE ?
                OR COALESCE(co.display_name, co.name) LIKE ?)`);
    params.push(like, like, like, like, like);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const FROM = `FROM audit_logs a LEFT JOIN companies co ON co.id = a.customer_id`;

// GET /api/audit-logs  (admin only)
async function listAuditLogs(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "Only admin can view the audit log" });
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(req.query.page_size, 10) || 25));
  try {
    const filter = buildFilter(req.query);
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(a.action IN ('PAYMENT_RECORDED', 'PREVIOUS_TDS_RECORDED')) AS payments,
              SUM(a.module = 'TDS') AS tds_changes,
              SUM(a.action IN ('INVOICE_CANCELLED', 'PAYMENT_CANCELLED', 'PAYMENT_REVERSED')) AS cancellations
       ${FROM} ${filter.sql}`,
      filter.params
    );
    const [rows] = await pool.query(
      `SELECT a.*, COALESCE(co.display_name, co.name) AS customer_name
       ${FROM} ${filter.sql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...filter.params, pageSize, (page - 1) * pageSize]
    );
    // User filter: everyone who can work in the Accountant Panel (admin, or a role that can
    // create/edit invoices or record payments), plus anyone already in the log (e.g. a user
    // whose role has changed since). Listed even before they have any entry.
    const [users] = await pool.query(
      `SELECT id, MAX(name) AS name, MAX(role) AS role FROM (
         SELECT u.id, u.name, r.name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE COALESCE(u.is_active, 1) = 1
           AND (r.name = 'admin' OR EXISTS (
                 SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                 WHERE rp.role_id = r.id
                   AND p.name IN ('CREATE_PAYMENT', 'CREATE_INVOICE', 'UPDATE_INVOICE', 'CANCEL_INVOICE')))
         UNION ALL
         SELECT user_id, user_name, user_role FROM audit_logs WHERE user_id IS NOT NULL
       ) x
       GROUP BY id
       ORDER BY MAX(name)`
    );
    res.json({
      ready: true,
      page,
      page_size: pageSize,
      total: Number(counts.total) || 0,
      summary: {
        total: Number(counts.total) || 0,
        payments: Number(counts.payments) || 0,
        tds_changes: Number(counts.tds_changes) || 0,
        cancellations: Number(counts.cancellations) || 0,
      },
      users,
      rows: rows.map(toEntry),
    });
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      return res.json({ ready: false, message: NOT_SET_UP, page, page_size: pageSize, total: 0, summary: { total: 0, payments: 0, tds_changes: 0, cancellations: 0 }, users: [], rows: [] });
    }
    console.error("Failed to list audit logs:", err);
    res.status(500).json({ error: "Failed to load the audit log" });
  }
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/audit-logs/export  (admin only) - the filtered log as CSV (max 20,000 rows).
async function exportAuditLogs(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "Only admin can export the audit log" });
  try {
    const filter = buildFilter(req.query);
    const [rows] = await pool.query(
      `SELECT a.*, COALESCE(co.display_name, co.name) AS customer_name
       ${FROM} ${filter.sql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 20000`,
      filter.params
    );
    const head = ["Date & Time", "User", "Role", "Module", "Action", "Record", "Customer", "Invoice No(s)", "Summary", "Changes", "Reason", "Source"];
    const lines = [head.join(",")];
    const p2 = (n) => String(n).padStart(2, "0");
    for (const r of rows.map(toEntry)) {
      const changes = r.changes.map((c) => `${c.field}: ${c.from ?? "-"} -> ${c.to ?? "-"}`).join("; ");
      const t = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
      const when = Number.isNaN(t.getTime()) ? "" : `${p2(t.getDate())}/${p2(t.getMonth() + 1)}/${t.getFullYear()} ${p2(t.getHours())}:${p2(t.getMinutes())}`;
      const customer = r.customer_name || r.details?.customer_name || "";
      const record = r.entity_type === "CUSTOMER" ? customer : r.entity_label;
      const invoiceNos = [
        ...(r.entity_type === "INVOICE" && r.entity_label ? [r.entity_label] : []),
        ...(r.details?.invoices || []).map((i) => i.invoice_number),
        ...(r.details?.allocations || []).map((a) => a.invoice_number),
      ].join(", ");
      lines.push(
        [when, r.user_name, r.user_role, r.module, r.action, record, customer, invoiceNos, r.summary, changes, r.reason, r.source]
          .map(csvCell)
          .join(",")
      );
    }
    await logAudit(pool, req, {
      module: "EXPORT",
      action: "CSV_EXPORTED",
      entity_type: "REPORT",
      entity_id: "audit-log",
      entity_label: "Audit Log",
      summary: `Audit Log exported · ${rows.length} rows`,
      details: { filters: req.query, rows: rows.length },
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${lines.join("\r\n")}\r\n`);
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") return res.status(503).json({ error: NOT_SET_UP });
    console.error("Failed to export audit logs:", err);
    res.status(500).json({ error: "Failed to export the audit log" });
  }
}

// GET /api/audit-logs/invoice/:invoiceId - the invoice's Change History (anyone who may open the invoice).
async function getInvoiceHistory(req, res) {
  const { role, id: userId } = req.user;
  if (role === "client") return res.status(403).json({ error: "Forbidden" });
  const { invoiceId } = req.params;
  try {
    const [[invoice]] = await pool.query(
      `SELECT i.id, i.invoice_number, i.site_id, i.created_at, i.created_by, u.name AS created_by_name
       FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.id = ?`,
      [invoiceId]
    );
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (role !== "admin" && invoice.site_id) {
      // Same rule as the invoice page: an invoice with a site belongs to that site's branch.
      const [[me]] = await pool.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
      const [[site]] = await pool.query("SELECT branch_id FROM sites WHERE id = ?", [invoice.site_id]);
      if (!me?.branch_id || !site || site.branch_id !== me.branch_id) return res.status(404).json({ error: "Invoice not found" });
    }

    // How the invoice was created: from an import (its import row) or by hand.
    const [[importRow]] = await pool.query(
      `SELECT r.\`row_number\` AS row_no, imp.file_name, imp.id AS import_id
       FROM invoice_import_rows r JOIN invoice_imports imp ON imp.id = r.import_id
       WHERE r.created_invoice_id = ? LIMIT 1`,
      [invoiceId]
    ).catch(() => [[null]]);
    const created = {
      id: `created-${invoice.id}`,
      created_at: invoice.created_at,
      user_name: invoice.created_by_name,
      module: importRow ? "IMPORT" : "INVOICE",
      action: "INVOICE_CREATED",
      summary: importRow ? `Imported from "${importRow.file_name}" · row ${importRow.row_no}` : "Invoice created",
      changes: [],
      source: importRow ? "IMPORT" : "WEB",
    };

    let entries = [];
    let ready = true;
    try {
      const [rows] = await pool.query(
        `SELECT a.* FROM audit_log_refs r JOIN audit_logs a ON a.id = r.audit_id
         WHERE r.entity_type = 'INVOICE' AND r.entity_id = ?
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 200`,
        [invoiceId]
      );
      entries = rows.map(toEntry);
    } catch (err) {
      if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
      ready = false;
    }

    // The audit's own "created" entry (invoices made by hand after the audit started) replaces the derived one.
    const hasCreated = entries.some((e) => e.action === "INVOICE_CREATED");
    res.json({ ready, entries: hasCreated ? entries : [...entries, created] });
  } catch (err) {
    console.error("Failed to load invoice history:", err);
    res.status(500).json({ error: "Failed to load the change history" });
  }
}

// POST /api/audit-logs/export-event  { report, rows, filters } - the browser reports a CSV/PDF export.
async function recordExport(req, res) {
  const report = String(req.body?.report || "").trim().slice(0, 120);
  if (!report) return res.status(400).json({ error: "report is required" });
  const rows = Number(req.body?.rows) || 0;
  const format = String(req.body?.format || "CSV").toUpperCase().slice(0, 10);
  await logAudit(pool, req, {
    module: "EXPORT",
    action: `${format === "PDF" ? "PDF" : "CSV"}_EXPORTED`,
    entity_type: "REPORT",
    entity_id: report.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64),
    entity_label: report,
    summary: `${report} exported · ${rows} rows`,
    details: { format, rows, filters: req.body?.filters || null, file_name: req.body?.file_name || null },
  });
  res.json({ success: true });
}

module.exports = { listAuditLogs, exportAuditLogs, getInvoiceHistory, recordExport };
