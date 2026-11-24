// Brigade tax invoices raised from a client PO (Billing -> PO -> Generate invoice).
//
// Generating takes the completed services picked on the PO page (job_ids), at their billed amounts
// (a PO can be invoiced any number of times), adds SGST + CGST at 9% each and makes ONE INVOICE PER
// PROPERTY (services of 2 properties = 2 invoices, both on the PO), each numbered in the Brigade series
// BSBR<fy>/<n> (services/billing/numbering.js). They are stored with every other invoice:
// billing_invoices / billing_invoice_lines (source BRIGADE, each line with its job), the PO through
// billing_invoice_pos, and each one gets its receivable in the Accountant Panel (invoices + TDS) under
// its property, so Deep Clean collection works. What is printed is saved with it (content), so a
// re-download is always identical. The PO amount (incl. GST) cannot be exceeded.

const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const { loadBillingPo, loadInvoicedJobs, loadInvoicedTotals, ensureBrigadePo } = require("./brigade.controller");
const { renderInvoicePdf, taxFor, round2 } = require("../utils/brigadeInvoiceDocument");
const { nextBrigadeInvoiceNumber } = require("../services/billing/numbering");
const { insertInvoiceTds } = require("../services/Tds.service");
const { syncInvoiceStatusesSafely } = require("../services/InvoiceStatus.service");
const calc = require("../services/billing/calc");

const DEFAULT_PAYMENT_DAYS = 30; // when the property has no billing profile with payment terms

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError || err?.status) return res.status(err.status).json({ error: err.message });
  if (err?.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ error: "Invoices are not set up yet - run the billing migrations (20261204_brigade_on_billing_tables.sql)" });
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
 * The invoices this PO would make now from the picked services (completed ones on this PO): one per
 * property, [{ company_id, property, content }]. Throws a readable 400 when there is nothing (or not
 * enough) to invoice.
 */
async function buildContents(db, number, jobIds) {
  const { po, services } = await pickServices(db, number, jobIds);
  const byProperty = new Map();
  for (const sv of services) {
    const key = String(sv.company_id || "");
    if (!byProperty.has(key)) byProperty.set(key, []);
    byProperty.get(key).push(sv);
  }
  return [...byProperty.entries()].map(([companyId, list]) => ({
    company_id: companyId || null,
    property: list[0].property || "",
    content: contentFor(po, list),
  }));
}

/** The PO and the picked completed services on it (all priced). */
async function pickServices(db, number, jobIds) {
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
  return { po, services };
}

/** What one invoice prints: these services (all of one property) on the PO. */
function contentFor(po, services) {

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

/** Why an invoice may not be generated on this PO, or null: it would go over the PO amount (incl. GST). */
function overPoReason(poAmount, invoicedBefore, invoiceTotal) {
  if (poAmount === null || poAmount === undefined) return null;
  const after = round2(invoicedBefore + invoiceTotal);
  if (after <= poAmount + 0.5) return null;
  const left = round2(poAmount - invoicedBefore);
  return `This invoice (${money(invoiceTotal)} incl. GST) is more than the PO balance (${money(Math.max(left, 0))} left of ${money(poAmount)}). ` +
    "Untick some services, or get the PO amount increased first.";
}

function sendPdf(res, content, fileName, preview) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  renderInvoicePdf(content, res, { preview });
}

const pdfName = (number) => `${number.replace(/\//g, "-")}.pdf`; // the invoice number alone

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const money = (n) => inr.format(Number(n) || 0);

// POST /api/brigade/billing/invoices/check { po_number, job_ids }
// What the invoice(s) would come to - one per property - and anything about the PO that doesn't match,
// shown before generating. The PO amount includes GST, so it is compared with the invoices' totals
// including GST. Invoices that would take the PO over its amount are NOT allowed (blocked: true,
// block_reason) - createInvoice refuses them too.
async function checkInvoice(req, res) {
  try {
    const number = readPoNumber(req.body?.po_number);
    const jobIds = readJobIds(req.body?.job_ids);
    const parts = await buildContents(pool, number, jobIds);
    const po = await loadBillingPo(pool, number);
    const invoiced = await loadInvoicedJobs(pool, po.po_number);
    const invoicedBefore = round2((await loadInvoicedTotals(pool, po.po_number)).get(String(po.po_number).trim().toLowerCase()) || 0);
    const sum = (k) => round2(parts.reduce((t, p) => t + Number(p.content[k] || 0), 0));
    const total = sum("total");
    const after = round2(invoicedBefore + total);
    const poAmount = po.po_amount;

    const warnings = [];
    const blockReason = overPoReason(poAmount, invoicedBefore, total);
    const again = po.services
      .filter((s) => jobIds.includes(String(s.job_id)) && (invoiced[s.job_id] || []).length)
      .map((s) => ({ job_id: s.job_id, code: s.code, sub_service: s.sub_service, flat_number: s.flat_number, invoices: invoiced[s.job_id] }));
    for (const a of again) {
      warnings.push(`${a.sub_service} (Flat ${a.flat_number}, ${a.code}) is already on invoice ${a.invoices.join(", ")} - invoicing it again bills it twice.`);
    }
    if (poAmount === null) {
      warnings.push("This PO has no amount, so the invoice cannot be checked against it. Add the PO amount in Billing.");
    }
    if (parts.length > 1) {
      warnings.push(`These services are for ${parts.length} properties, so ${parts.length} invoices will be made (one per property): ${parts.map((p) => `${p.property} ${money(p.content.total)}`).join(", ")}.`);
    }

    res.json({
      po_number: po.po_number,
      po_amount: poAmount,
      subtotal: sum("subtotal"),
      cgst: sum("cgst"),
      sgst: sum("sgst"),
      total,
      invoices: parts.map((p) => ({ company_id: p.company_id, property: p.property, subtotal: p.content.subtotal, cgst: p.content.cgst, sgst: p.content.sgst, total: p.content.total, lines: p.content.lines.length })),
      invoiced_before: invoicedBefore,
      invoiced_after: after,
      remaining_after: poAmount === null ? null : round2(poAmount - after),
      already_invoiced: again,
      blocked: Boolean(blockReason),
      block_reason: blockReason,
      warnings,
    });
  } catch (err) {
    sendError(res, err, "Failed to check the invoice");
  }
}

// POST /api/brigade/billing/invoices/preview { po_number, job_ids, company_id? } -> the PDF, stamped PREVIEW,
// nothing saved. Services of several properties make several invoices: company_id picks which one (default the first).
async function previewInvoice(req, res) {
  try {
    const parts = await buildContents(pool, readPoNumber(req.body?.po_number), readJobIds(req.body?.job_ids));
    const want = req.body?.company_id ? String(req.body.company_id) : null;
    const part = (want && parts.find((p) => String(p.company_id) === want)) || parts[0];
    sendPdf(res, { ...part.content, invoice_number: "", invoice_date: todayIst() }, "Invoice preview.pdf", true);
  } catch (err) {
    sendError(res, err, "Failed to preview the invoice");
  }
}

// POST /api/brigade/billing/invoices { po_number, job_ids } -> saves one invoice per property, each with the next
// BSBR number, and its receivable in the Accountant Panel. Returns { invoices: [...] } (and the first one's fields).
async function createInvoice(req, res) {
  const conn = await pool.getConnection();
  try {
    const number = readPoNumber(req.body?.po_number);
    const jobIds = readJobIds(req.body?.job_ids);
    await conn.beginTransaction();
    // The PO row, locked: two people generating on the same PO at once are taken one after the other.
    const poRow = await ensureBrigadePo(conn, number, req.user.id);
    const parts = await buildContents(conn, number, jobIds);
    const po = await loadBillingPo(conn, number);
    const invoicedBefore = round2((await loadInvoicedTotals(conn, po.po_number)).get(String(po.po_number).trim().toLowerCase()) || 0);
    const total = round2(parts.reduce((t, p) => t + Number(p.content.total || 0), 0));
    const blockReason = overPoReason(po.po_amount, invoicedBefore, total);
    if (blockReason) throw new HttpError(400, blockReason);

    const date = todayIst();
    const made = [];
    for (const part of parts) {
      if (!part.company_id) throw new HttpError(400, "A service has no property - check its booking");
      const [[company]] = await conn.query(
        "SELECT id, name, type, tds_applicable, tds_rate, tds_basis FROM companies WHERE id = ?",
        [part.company_id]
      );
      if (!company) throw new HttpError(400, `Property ${part.property} was not found`);
      const [[profile]] = await conn.query("SELECT payment_terms_days FROM billing_profiles WHERE company_id = ?", [part.company_id]).catch(() => [[null]]);
      const terms = profile && profile.payment_terms_days !== null ? Number(profile.payment_terms_days) : DEFAULT_PAYMENT_DAYS;
      const due = addDays(date, terms);
      const { fy, seq, number: invNumber } = await nextBrigadeInvoiceNumber(conn, date);
      const id = uuid();
      const content = { ...part.content, invoice_number: invNumber, invoice_date: date };

      // The receivable in the Accountant Panel (Deep Clean: Brigade customers), with its TDS.
      const receivableId = uuid();
      await conn.query(
        `INSERT INTO invoices
           (id, invoice_number, customer_id, site_id, invoice_date, due_date, invoice_amount, taxable_amount, paid_amount, pending_amount, status, remarks, created_by)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)`,
        [receivableId, invNumber, part.company_id, date, due, content.total, content.subtotal, content.total, `Brigade - PO ${po.po_number}`, req.user.id]
      );
      await insertInvoiceTds(conn, receivableId, company, content.total, content.subtotal);

      await conn.query(
        `INSERT INTO billing_invoices
           (id, source, is_manual, bill_kind, contract_id, company_id, site_id, billing_type, customer_category, tax_mode, gst_rate,
            place_of_supply, invoice_date, due_date, invoice_number, fy, seq, subtotal, cgst, sgst, igst, round_off, total,
            print_copies, description, status, receivable_invoice_id, content, issued_by, issued_at, created_by, updated_by)
         VALUES (?, 'BRIGADE', 0, '', NULL, ?, NULL, NULL, ?, 'CGST_SGST', 18, '29-Karnataka', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?,
                 1, ?, 'ISSUED', ?, ?, ?, NOW(), ?, ?)`,
        [id, part.company_id, calc.categoryOf(company.type) || "COMMERCIAL", date, due, invNumber, fy, seq,
          content.subtotal, content.cgst, content.sgst, content.total, String(content.description || "").slice(0, 1000),
          receivableId, JSON.stringify(content), req.user.id, req.user.id, req.user.id]
      );
      for (const [i, line] of content.lines.entries()) {
        await conn.query(
          `INSERT INTO billing_invoice_lines (id, invoice_id, job_id, item_name, sac_code, unit, pricing_basis, rate, quantity, amount, sort_order)
           VALUES (?, ?, ?, ?, '998533', 'Service', 'FIXED', ?, 1, ?, ?)`,
          [uuid(), id, line.job_id, String(line.name).slice(0, 255), line.amount, line.amount, i]
        );
      }
      await conn.query("INSERT INTO billing_invoice_pos (invoice_id, po_id) VALUES (?, ?)", [id, poRow.id]);
      made.push({ id, invoice_number: invNumber, invoice_date: date, po_number: po.po_number, property: part.property, total: content.total, lines: content.lines.length });
    }
    await conn.commit();
    syncInvoiceStatusesSafely();
    res.status(201).json({ ...made[0], invoices: made });
  } catch (err) {
    await conn.rollback().catch(() => {});
    sendError(res, err, "Failed to save the invoice");
  } finally {
    conn.release();
  }
}

/** "2026-11-24" + n days. */
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (Number(n) || 0));
  return d.toISOString().slice(0, 10);
}

// GET /api/brigade/billing/invoices?po_number= -> the PO's invoices, newest first
async function listInvoices(req, res) {
  try {
    const number = readPoNumber(req.query.po_number);
    const [rows] = await pool.query(
      `SELECT i.id, i.invoice_number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date, i.subtotal, i.cgst, i.sgst, i.total,
              i.created_at, u.name AS created_by_name, TRIM(c.name) AS property,
              (SELECT COUNT(*) FROM billing_invoice_lines l WHERE l.invoice_id = i.id) AS line_count
         FROM billing_invoices i
         JOIN billing_invoice_pos ip ON ip.invoice_id = i.id
         JOIN customer_pos p ON p.id = ip.po_id AND p.source = 'BRIGADE'
         LEFT JOIN companies c ON c.id = i.company_id
         LEFT JOIN users u ON u.id = i.created_by
        WHERE i.source = 'BRIGADE' AND i.status = 'ISSUED' AND p.brigade_po_key = LOWER(TRIM(?))
        ORDER BY i.created_at DESC`,
      [number]
    );
    // "lines" is a reserved word in MySQL 8, so the column is line_count; the response keeps "lines".
    res.json(rows.map(({ line_count: lineCount, ...r }) => ({ ...r, subtotal: Number(r.subtotal), cgst: Number(r.cgst), sgst: Number(r.sgst), total: Number(r.total), lines: Number(lineCount) })));
  } catch (err) {
    sendError(res, err, "Failed to load invoices");
  }
}

// GET /api/brigade/billing/invoices/:id/pdf -> the issued invoice, exactly as saved
async function invoicePdf(req, res) {
  try {
    const [[row]] = await pool.query("SELECT invoice_number, content FROM billing_invoices WHERE id = ? AND source = 'BRIGADE'", [req.params.id]);
    if (!row) throw new HttpError(404, "Invoice not found");
    const content = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
    sendPdf(res, content, pdfName(row.invoice_number), false);
  } catch (err) {
    sendError(res, err, "Failed to open the invoice");
  }
}

module.exports = { checkInvoice, previewInvoice, createInvoice, listInvoices, invoicePdf, financialYear };
