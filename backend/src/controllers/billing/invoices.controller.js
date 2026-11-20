// Bill Run, draft invoices, issuing, issued invoices, PDF and cancel.
// Payloads: docs/Invoice Generation - API Payloads.docx §9 - §11.

const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const D = require("../../services/billing/draft.service");
const I = require("../../services/billing/issue.service");
const { renderBillingInvoicePdf, renderBillingInvoicesPdf } = require("../../utils/billingInvoiceDocument");
const delivery = require("../../services/billing/delivery.service");

const TYPES = ["AMC", "ONE_TIME", "TERMITE", "CHEMICAL"];

function sendPdf(res, content, fileName, options) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  renderBillingInvoicePdf(content, res, options);
}

const pdfName = (inv) => `${inv.content?.title || "Tax Invoice"} ${String(inv.invoice_number || "draft").replace(/\//g, "-")}.pdf`;

// GET /due?month=2026-11&type=&category=&q=
const due = C.handle("Failed to load the bill run", async (req, res) => {
  const month = C.month(req.query.month || C.todayIst().slice(0, 7));
  res.json(
    await D.dueList(pool, month, {
      type: C.oneOf(req.query.type, "type", TYPES, { required: false }),
      category: C.oneOf(req.query.category, "category", ["COMMERCIAL", "RESIDENTIAL"], { required: false }),
      q: C.str(req.query.q, "q", { max: 100 }),
    })
  );
});

// POST /runs { month, contract_ids }
const run = C.handle("Failed to generate the drafts", async (req, res) => {
  const month = C.month(req.body?.month);
  const ids = Array.isArray(req.body?.contract_ids) ? [...new Set(req.body.contract_ids.map(String))] : [];
  if (!ids.length) throw C.bad("Select the contracts to bill");
  if (ids.length > 500) throw C.bad("Too many contracts in one run (max 500)");
  res.status(201).json(await D.generateDrafts(pool, month, ids, req.user.id));
});

// GET /invoices?status=DRAFT|ISSUED|CANCELLED (comma list)&month&company_id&type&q&page&page_size
const list = C.handle("Failed to load invoices", async (req, res) => {
  const statuses = String(req.query.status || "DRAFT")
    .split(",")
    .map((s) => C.oneOf(s, "status", ["DRAFT", "ISSUED", "CANCELLED"]));
  const month = C.month(req.query.month, "month", { required: false });
  const range = month ? C.monthRange(month) : null;
  const companyId = C.str(req.query.company_id, "company_id", { max: 20 });
  const type = C.oneOf(req.query.type, "type", TYPES, { required: false });
  const q = C.str(req.query.q, "q", { max: 100 });
  const { page, pageSize, offset } = C.paging(req.query);
  // Customer filter (checkboxes): company_ids=a,b - none = every customer.
  const companyIds = String(req.query.company_ids || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
  const where = `bi.status IN (?)
      AND (? IS NULL OR (bi.invoice_date >= ? AND bi.invoice_date < ?))
      AND (? IS NULL OR bi.company_id = ?) AND (? IS NULL OR bi.billing_type = ?)
      ${companyIds.length ? "AND bi.company_id IN (?)" : ""}
      AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR bi.invoice_number LIKE CONCAT('%', ?, '%'))`;
  const params = [statuses, month, range?.start || null, range?.next || null, companyId, companyId, type, type, ...(companyIds.length ? [companyIds] : []), q, q, q];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id WHERE ${where}`, params);
  const [rows] = await pool.query(
    `SELECT bi.id, bi.status, bi.invoice_number, DATE_FORMAT(bi.invoice_date, '%Y-%m-%d') AS invoice_date, bi.company_id, c.name AS customer,
            bc.contract_code, bi.billing_type, DATE_FORMAT(bi.period_start, '%Y-%m-%d') AS period_start, DATE_FORMAT(bi.period_end, '%Y-%m-%d') AS period_end,
            bi.subtotal, bi.total, bi.advance_adjusted, bi.print_copies, inv.status AS receivable_status,
            (SELECT COUNT(*) FROM billing_invoice_lines l WHERE l.invoice_id = bi.id AND l.pricing_basis <> 'FIXED' AND l.quantity = 0 AND l.adjustment_type <> 'MANUAL') AS lines_needing_input,
            (SELECT COALESCE(SUM(GREATEST(l.services_planned - l.services_done, 0)), 0) FROM billing_invoice_lines l
              WHERE l.invoice_id = bi.id AND l.services_planned IS NOT NULL) AS service_shortfall,
            (SELECT GROUP_CONCAT(po.po_number ORDER BY po.po_date SEPARATOR ', ') FROM billing_invoice_pos bp JOIN customer_pos po ON po.id = bp.po_id
              WHERE bp.invoice_id = bi.id) AS po_numbers,
            (SELECT JSON_OBJECT('channel', s.channel, 'at', DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%s'), 'by', u.name)
               FROM billing_invoice_shares s LEFT JOIN users u ON u.id = s.created_by
              WHERE s.billing_invoice_id = bi.id ORDER BY s.created_at DESC LIMIT 1) AS last_shared
       FROM billing_invoices bi
       JOIN companies c ON c.id = bi.company_id
       JOIN billing_contracts bc ON bc.id = bi.contract_id
       LEFT JOIN invoices inv ON inv.id = bi.receivable_invoice_id
      WHERE ${where}
      ORDER BY bi.invoice_date DESC, bi.fy DESC, bi.seq DESC, c.name
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({
    rows: rows.map((r) => ({
      ...r,
      subtotal: Number(r.subtotal),
      total: Number(r.total),
      advance_adjusted: Number(r.advance_adjusted),
      print_copies: Number(r.print_copies),
      lines_needing_input: Number(r.lines_needing_input),
      service_shortfall: Number(r.service_shortfall),
      po_numbers: r.po_numbers ? r.po_numbers.split(", ") : [],
      last_shared: C.json(r.last_shared, null),
      check: r.status !== "DRAFT" ? null : Number(r.lines_needing_input) ? "ERRORS" : Number(r.service_shortfall) ? "WARNINGS" : "OK",
    })),
    total: Number(total),
    page,
    page_size: pageSize,
  });
});

// GET /invoices/:id
const get = C.handle("Failed to load the invoice", async (req, res) => {
  const inv = await D.loadInvoice(pool, req.params.id);
  delete inv.content;
  // Collection, from the Accountant Panel: the receivable, payments received against it, and TDS.
  inv.receivable = null;
  inv.payments = [];
  inv.tds = null;
  if (inv.receivable_invoice_id) {
    const [[r]] = await pool.query(
      `SELECT invoice_amount, paid_amount, pending_amount, status, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
         FROM invoices WHERE id = ?`,
      [inv.receivable_invoice_id]
    );
    if (r) inv.receivable = { amount: Number(r.invoice_amount), paid: Number(r.paid_amount), pending: Number(r.pending_amount), status: r.status, due_date: r.due_date };
    const [pays] = await pool.query(
      `SELECT p.payment_number, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS payment_date, p.payment_mode, p.reference_number,
              pa.allocated_amount, pa.tds_amount
         FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
        WHERE pa.invoice_id = ? ORDER BY p.payment_date, p.created_at`,
      [inv.receivable_invoice_id]
    );
    inv.payments = pays.map((p) => ({ ...p, allocated_amount: Number(p.allocated_amount), tds_amount: Number(p.tds_amount) }));
    const [[t]] = await pool.query(
      "SELECT tds_applicable, tds_rate, tds_basis, expected_tds, deducted_tds, pending_tds, status FROM invoice_tds WHERE invoice_id = ?",
      [inv.receivable_invoice_id]
    );
    if (t) inv.tds = { applicable: Boolean(t.tds_applicable), rate: t.tds_rate === null ? null : Number(t.tds_rate), basis: t.tds_basis, expected: Number(t.expected_tds), deducted: Number(t.deducted_tds), pending: Number(t.pending_tds), status: t.status };
  }
  res.json(inv);
});

// PUT /invoices/:id  (draft)
const save = C.handle("Failed to save the draft", async (req, res) => {
  const inv = await D.saveDraft(pool, req.params.id, req.body || {}, req.user.id);
  delete inv.content;
  res.json(inv);
});

// DELETE /invoices/:id  (draft)
const remove = C.handle("Failed to delete the draft", async (req, res) => {
  const [result] = await pool.query("DELETE FROM billing_invoices WHERE id = ? AND status = 'DRAFT'", [req.params.id]);
  if (!result.affectedRows) {
    const [[exists]] = await pool.query("SELECT status FROM billing_invoices WHERE id = ?", [req.params.id]);
    if (!exists) throw C.notFound("Invoice not found");
    throw C.bad("Only drafts can be deleted");
  }
  res.json({ success: true });
});

// POST /invoices/:id/check
const check = C.handle("Failed to check the invoice", async (req, res) => {
  const result = await D.checkInvoice(pool, req.params.id);
  delete result.invoice;
  res.json(result);
});

// GET /invoices/:id/preview  (PDF marked PREVIEW, no number)
const preview = C.handle("Failed to preview the invoice", async (req, res) => {
  const inv = await D.loadInvoice(pool, req.params.id);
  if (inv.status !== "DRAFT") throw C.bad("Only drafts have a preview - open the issued PDF instead");
  sendPdf(res, I.buildContent(inv, ""), "Invoice preview.pdf", { preview: true });
});

// POST /invoices/issue { ids, confirm_warnings }
const issue = C.handle("Failed to issue the invoices", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))] : [];
  if (!ids.length) throw C.bad("Select the drafts to issue");
  if (ids.length > 200) throw C.bad("Too many invoices in one go (max 200)");
  const result = await I.issueMany(pool, ids, req, { confirmWarnings: C.bool(req.body?.confirm_warnings) });
  // Delivered as the customer's billing profile says: emailed to the outlet / customer addresses.
  for (const it of result.issued) it.email = await delivery.emailIssued(pool, it.id, req.user.id);
  res.json(result);
});

// GET /invoices/download?month=2026-11&status=ISSUED&copies=original|print&company_id=&ids=a,b
// All the invoices in ONE PDF: original only, or every print copy set in the profile (print all).
const download = C.handle("Failed to download the invoices", async (req, res) => {
  const month = C.month(req.query.month, "month", { required: false });
  const range = month ? C.monthRange(month) : null;
  const statuses = String(req.query.status || "ISSUED").split(",").map((s) => C.oneOf(s, "status", ["ISSUED", "CANCELLED"]));
  const companyId = C.str(req.query.company_id, "company_id", { max: 20 });
  const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  const withCopies = C.oneOf(req.query.copies, "copies", ["ORIGINAL", "PRINT"], { fallback: "ORIGINAL" }) === "PRINT";
  const [rows] = await pool.query(
    `SELECT bi.id, bi.invoice_number, bi.status, bi.print_copies, bi.content FROM billing_invoices bi
      WHERE bi.status IN (?) AND bi.content IS NOT NULL
        AND (? IS NULL OR (bi.invoice_date >= ? AND bi.invoice_date < ?))
        AND (? IS NULL OR bi.company_id = ?)
        ${ids.length ? "AND bi.id IN (?)" : ""}
      ORDER BY bi.fy, bi.seq
      LIMIT 501`,
    [statuses, month, range?.start || null, range?.next || null, companyId, companyId, ...(ids.length ? [ids] : [])]
  );
  if (!rows.length) throw C.notFound("No issued invoices to download for this selection");
  if (rows.length > 500) throw C.bad("More than 500 invoices - pick a month or a customer");
  const items = rows.map((r) => ({ content: C.json(r.content, null), copies: withCopies ? Number(r.print_copies) || 1 : 1, cancelled: r.status === "CANCELLED" }));
  const name = `Invoices ${month ? C.monthName(range.start) : "selected"}${withCopies ? " (print copies)" : ""}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader("X-Invoice-Count", String(rows.length));
  renderBillingInvoicesPdf(items, res, { title: name.replace(/\.pdf$/, "") });
});

// GET /invoices/:id/pdf  (issued: one Original copy from the frozen content)
const pdf = C.handle("Failed to open the invoice", async (req, res) => {
  const [[row]] = await pool.query("SELECT invoice_number, status, content FROM billing_invoices WHERE id = ?", [req.params.id]);
  if (!row) throw C.notFound("Invoice not found");
  if (row.status === "DRAFT") throw C.bad("This invoice is not issued yet - use the preview");
  const content = C.json(row.content, null);
  sendPdf(res, content, pdfName({ ...row, content }), { cancelled: row.status === "CANCELLED" });
});

// POST /invoices/:id/cancel { reason }
const cancel = C.handle("Failed to cancel the invoice", async (req, res) => {
  const reason = C.str(req.body?.reason, "reason", { required: true, max: 500 });
  res.json(await I.cancelIssued(pool, req.params.id, req, reason));
});

module.exports = { due, run, list, get, save, remove, check, preview, issue, download, pdf, cancel, sendPdf, pdfName };
