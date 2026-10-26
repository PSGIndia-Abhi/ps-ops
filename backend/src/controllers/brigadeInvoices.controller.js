// Brigade tax invoices raised from a client PO (Billing -> PO -> Generate invoice).
//
// An invoice takes the completed services picked on the PO page (job_ids), at their
// billed amounts (a PO can be invoiced any number of times), adds SGST + CGST at 9% each, and gets the next number in the
// financial year's series (BSPMPL26-27/5000). What is printed is saved with it
// (brigade_invoices.content), so a re-download is always identical.
// Tables: database/brigade/05_brigade_invoices.sql.

const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const { loadBillingPo } = require("./brigade.controller");
const { renderInvoicePdf, taxFor, round2 } = require("../utils/brigadeInvoiceDocument");

const PREFIX = "BSPMPL";
/** The very first invoice issued here; every later financial year starts at 1. */
const FIRST_NUMBER = 5000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError || err?.status) return res.status(err.status).json({ error: err.message });
  if (err?.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ error: "Invoices are not set up yet - run database/brigade/05_brigade_invoices.sql" });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

function readPoNumber(value) {
  const number = typeof value === "string" ? value.trim() : "";
  if (!number) throw new HttpError(400, "po_number is required");
  if (number.length > 100) throw new HttpError(400, "PO number is too long");
  return number;
}

/** Today in India as "YYYY-MM-DD" (the server may run in UTC). */
function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "2026-10-26" -> "26-27"; "2027-02-10" -> "26-27" (April to March). */
function financialYear(date) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const invoiceNumber = (fy, seq) => `${PREFIX}${fy}/${String(seq).padStart(4, "0")}`;

/** A service's month for the description: "Oct-2026". */
function monthOf(value) {
  const d = value instanceof Date ? value : new Date(String(value || "").replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "Asia/Kolkata" })}-${d.toLocaleString("en-US", { year: "numeric", timeZone: "Asia/Kolkata" })}`;
}

const list = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** The services picked for the invoice: a non-empty list of job ids. */
function readJobIds(value) {
  const ids = Array.isArray(value) ? [...new Set(value.map((v) => String(v || "").trim()).filter(Boolean))] : [];
  if (!ids.length) throw new HttpError(400, "Select the services to put on the invoice");
  if (ids.length > 200) throw new HttpError(400, "Too many services for one invoice");
  return ids;
}

/**
 * What the invoice for this PO would print now: the picked services (completed ones on this PO).
 * Throws a readable 400 when there is nothing (or not enough) to invoice.
 */
async function buildContent(db, number, jobIds) {
  const po = await loadBillingPo(db, number); // completed services only
  if (!po.services.length) throw new HttpError(400, "This PO has no completed services yet. Services appear in Billing once they are completed.");
  const picked = new Set(jobIds);
  const services = po.services.filter((s) => picked.has(String(s.job_id)));
  if (services.length !== picked.size) {
    throw new HttpError(400, "Some selected services are no longer completed services on this PO. Reload the PO and select again.");
  }
  const unpriced = services.filter((s) => s.amount === null || s.amount === undefined);
  if (unpriced.length) {
    throw new HttpError(400, `Enter the billed amount for ${unpriced.map((s) => `${s.sub_service} (${s.flat_number})`).join(", ")} and save the PO first.`);
  }

  const flats = [...new Set(services.map((s) => s.flat_number).filter(Boolean))];
  const manyFlats = flats.length > 1;
  const itemName = (s) => {
    const base = /service$/i.test(s.sub_service) ? s.sub_service : `${s.sub_service} Service`;
    return manyFlats ? `${base} - Flat ${s.flat_number}` : base;
  };
  const lines = services.map((s) => ({ job_id: s.job_id, name: itemName(s), bill_value: round2(s.amount), qty: 1, amount: round2(s.amount) }));
  const tax = taxFor(lines.reduce((sum, l) => sum + l.amount, 0));

  const serviceNames = [...new Set(services.map((s) => s.sub_service))];
  const months = [...new Set(services.map((s) => monthOf(s.start_date)).filter(Boolean))];
  const description =
    `Towards Charges for the ${list(serviceNames)} service${serviceNames.length > 1 ? "s" : ""} carried out` +
    `${months.length ? ` for the month${months.length > 1 ? "s" : ""} of ${list(months)}` : ""}` +
    `${flats.length ? `\nfor the Flat no.${flats.join(", ")}` : ""}`;

  return {
    po_number: po.po_number,
    po_date: po.po_date,
    // Ship To: each property on the invoice with the service address(es) from its bookings.
    ship_to: [...new Set(services.map((s) => s.property || ""))].map((property) => ({
      name: property,
      addresses: [...new Set(services.filter((s) => (s.property || "") === property).map((s) => s.service_address.trim()).filter(Boolean))],
    })),
    lines,
    ...tax,
    description,
  };
}

/** Hands out the next number for the financial year, inside the caller's transaction. */
async function nextSeq(conn, fy) {
  const [[row]] = await conn.query("SELECT last_number FROM brigade_invoice_sequences WHERE fy = ? FOR UPDATE", [fy]);
  if (row) {
    const seq = row.last_number + 1;
    await conn.query("UPDATE brigade_invoice_sequences SET last_number = ? WHERE fy = ?", [seq, fy]);
    return seq;
  }
  // A new financial year: 0001 - except the very first year in this system, which carries on from 5000.
  const [[{ years }]] = await conn.query("SELECT COUNT(*) AS years FROM brigade_invoice_sequences");
  const seq = Number(years) === 0 ? FIRST_NUMBER : 1;
  await conn.query("INSERT INTO brigade_invoice_sequences (fy, last_number) VALUES (?, ?)", [fy, seq]);
  return seq;
}

function sendPdf(res, content, fileName, preview) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  renderInvoicePdf(content, res, { preview });
}

const pdfName = (number) => `Tax Invoice ${number.replace(/\//g, "-")}.pdf`;

// POST /api/brigade/billing/invoices/preview { po_number, job_ids } -> the PDF, stamped PREVIEW, nothing saved
async function previewInvoice(req, res) {
  try {
    const content = await buildContent(pool, readPoNumber(req.body?.po_number), readJobIds(req.body?.job_ids));
    sendPdf(res, { ...content, invoice_number: "", invoice_date: todayIst() }, "Invoice preview.pdf", true);
  } catch (err) {
    sendError(res, err, "Failed to preview the invoice");
  }
}

// POST /api/brigade/billing/invoices { po_number, job_ids } -> saves the invoice with the next number
async function createInvoice(req, res) {
  const conn = await pool.getConnection();
  try {
    const number = readPoNumber(req.body?.po_number);
    const jobIds = readJobIds(req.body?.job_ids);
    await conn.beginTransaction();
    const content = await buildContent(conn, number, jobIds);
    const date = todayIst();
    const fy = financialYear(date);
    const seq = await nextSeq(conn, fy);
    const invNumber = invoiceNumber(fy, seq);
    const id = uuid();
    const saved = { ...content, invoice_number: invNumber, invoice_date: date };

    await conn.query(
      `INSERT INTO brigade_invoices (id, invoice_number, fy, seq, po_number, invoice_date, subtotal, cgst, sgst, total, content, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, invNumber, fy, seq, content.po_number, date, content.subtotal, content.cgst, content.sgst, content.total, JSON.stringify(saved), req.user.id]
    );
    for (const line of content.lines) {
      await conn.query("INSERT INTO brigade_invoice_lines (id, invoice_id, job_id, amount) VALUES (?, ?, ?, ?)", [uuid(), id, line.job_id, line.amount]);
    }
    await conn.commit();
    res.status(201).json({ id, invoice_number: invNumber, invoice_date: date, po_number: content.po_number, total: content.total, lines: content.lines.length });
  } catch (err) {
    await conn.rollback().catch(() => {});
    sendError(res, err, "Failed to save the invoice");
  } finally {
    conn.release();
  }
}

// GET /api/brigade/billing/invoices?po_number= -> the PO's invoices, newest first
async function listInvoices(req, res) {
  try {
    const number = readPoNumber(req.query.po_number);
    const [rows] = await pool.query(
      `SELECT i.id, i.invoice_number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date, i.subtotal, i.cgst, i.sgst, i.total,
              i.created_at, u.name AS created_by_name,
              (SELECT COUNT(*) FROM brigade_invoice_lines l WHERE l.invoice_id = i.id) AS lines
         FROM brigade_invoices i LEFT JOIN users u ON u.id = i.created_by_user_id
        WHERE i.po_number = ?
        ORDER BY i.created_at DESC`,
      [number]
    );
    res.json(rows.map((r) => ({ ...r, subtotal: Number(r.subtotal), cgst: Number(r.cgst), sgst: Number(r.sgst), total: Number(r.total), lines: Number(r.lines) })));
  } catch (err) {
    sendError(res, err, "Failed to load invoices");
  }
}

// GET /api/brigade/billing/invoices/:id/pdf -> the issued invoice, exactly as saved
async function invoicePdf(req, res) {
  try {
    const [[row]] = await pool.query("SELECT invoice_number, content FROM brigade_invoices WHERE id = ?", [req.params.id]);
    if (!row) throw new HttpError(404, "Invoice not found");
    const content = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
    sendPdf(res, content, pdfName(row.invoice_number), false);
  } catch (err) {
    sendError(res, err, "Failed to open the invoice");
  }
}

module.exports = { previewInvoice, createInvoice, listInvoices, invoicePdf, financialYear, invoiceNumber };
