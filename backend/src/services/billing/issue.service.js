// Issuing and cancelling generated invoices.
//
// Issue (one transaction per invoice; lock order: invoice -> number counter -> advance payments):
//   1. re-run the checks; stop on errors, or on warnings that were not confirmed
//   2. take the next number in the main series, continued from Vyapar (numbering.js)
//   3. add the receivable to the existing `invoices` table (+ its TDS snapshot), so the invoice
//      shows in the Accountant Panel for collection
//   4. Termite advance POs: allocate the advance payments to it, oldest first
//   5. freeze what is printed (billing_invoices.content) and move the contract to its next period

const { v4: uuid } = require("uuid");
const C = require("./common");
const calc = require("./calc");
const D = require("./draft.service");
const { nextInvoiceNumber } = require("./numbering");
const { insertInvoiceTds } = require("../Tds.service");
const { syncInvoiceStatusesSafely } = require("../InvoiceStatus.service");
const { logAudit } = require("../Audit.service");

const EPS = 0.005;

/** What the PDF prints, frozen on issue. */
function buildContent(inv, number) {
  const multiSite = new Set(inv.lines.map((l) => l.site_id).filter(Boolean)).size > 1;
  const lines = inv.lines.map((l) => {
    let name = l.item_name;
    if (multiSite && l.site) name += ` - ${l.site}`;
    if (l.adjustment_type === "SERVICES" && l.services_planned) name += ` (${l.services_done} of ${l.services_planned} services)`;
    if (l.adjustment_type === "DAYS") name += ` (${l.days_worked} of ${l.days_in_period} days)`;
    if (l.adjustment_type === "PERCENT") name += ` (${l.percent}%)`;
    return { name, sac_code: l.sac_code, unit: l.unit, bill_value: l.rate, qty: l.quantity, amount: l.amount };
  });
  const address = String(inv.bill_to.address || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return {
    title: inv.customer.category === "RESIDENTIAL" ? "Invoice" : "Tax Invoice",
    invoice_number: number || "",
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    period_start: inv.period_start,
    period_end: inv.period_end,
    place_of_supply: inv.place_of_supply,
    category: inv.customer.category,
    bill_to: { name: inv.bill_to.name, lines: address, gstin: inv.bill_to.gst_number || null, state: inv.bill_to.state },
    ship_to: inv.ship_to ? [{ name: inv.ship_to.name, addresses: inv.ship_to.address ? [inv.ship_to.address] : [] }] : [],
    pos: inv.pos.map((p) => ({ po_number: p.po_number, po_date: p.po_date })),
    lines,
    tax_mode: inv.tax_mode,
    gst_rate: inv.gst_rate,
    subtotal: inv.subtotal,
    cgst: inv.cgst,
    sgst: inv.sgst,
    igst: inv.igst,
    round_off: inv.round_off,
    total: inv.total,
    amount_in_words: calc.amountInWords(inv.total),
    description: inv.description,
  };
}

/** Issues one draft inside its own transaction. Returns the issued summary. */
async function issueOne(pool, id, req, { confirmWarnings = false } = {}) {
  const userId = req.user.id;
  const result = await C.inTransaction(pool, async (conn) => {
    await conn.query("SELECT id FROM billing_invoices WHERE id = ? FOR UPDATE", [id]);
    const chk = await D.checkInvoice(conn, id);
    if (!chk.can_issue) throw C.bad(chk.errors[0] || "This invoice cannot be issued", { errors: chk.errors });
    if (chk.warnings.length && !confirmWarnings) {
      throw C.bad("Confirm the warnings before issuing (send confirm_warnings: true)", { errors: chk.warnings });
    }
    const inv = chk.invoice;

    // 2. the next number in the main series, carrying on from Vyapar's last invoice (numbering.js)
    const { fy, seq, number } = await nextInvoiceNumber(conn, inv.invoice_date);

    // 3. receivable in the existing invoices table + TDS snapshot. TDS follows the customer's TDS
    // setting (on the invoice amount or on the taxable value), so the taxable value (the subtotal,
    // before GST) is saved on the receivable and passed on: never guessed back from the total.
    const [[company]] = await conn.query("SELECT id, tds_applicable, tds_rate, tds_basis FROM companies WHERE id = ?", [inv.customer.company_id]);
    const receivableId = uuid();
    await conn.query(
      `INSERT INTO invoices
         (id, invoice_number, customer_id, site_id, invoice_date, due_date, invoice_amount, taxable_amount, paid_amount, pending_amount, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)`,
      [
        receivableId, number, inv.customer.company_id, inv.site_id || inv.ship_to_site_id || null, inv.invoice_date, inv.due_date,
        inv.total, inv.subtotal, inv.total, `Generated - ${inv.contract.contract_code} (${C.dmy(inv.period_start)} to ${C.dmy(inv.period_end)})`, userId,
      ]
    );
    await insertInvoiceTds(conn, receivableId, company, inv.total, inv.subtotal);

    // 4. Termite advance
    let advanceAdjusted = 0;
    const adv = await D.advanceFor(conn, inv.po_ids, { lock: true });
    if (adv) {
      let left = inv.total;
      for (const p of adv.payments) {
        if (left <= EPS) break;
        const take = calc.round2(Math.min(p.remaining, left));
        if (take <= EPS) continue;
        const allocationId = uuid();
        await conn.query(
          "INSERT INTO payment_allocations (id, payment_id, invoice_id, allocated_amount, tds_amount, created_by) VALUES (?, ?, ?, ?, 0, ?)",
          [allocationId, p.payment_id, receivableId, take, userId]
        );
        await conn.query(
          "INSERT INTO billing_advance_adjustments (id, invoice_id, po_id, payment_id, payment_allocation_id, amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [uuid(), id, p.po_id, p.payment_id, allocationId, take, userId]
        );
        advanceAdjusted = calc.round2(advanceAdjusted + take);
        left = calc.round2(left - take);
      }
      if (advanceAdjusted > 0) {
        const pending = Math.max(0, calc.round2(inv.total - advanceAdjusted));
        await conn.query("UPDATE invoices SET paid_amount = ?, pending_amount = ?, status = ?, updated_by = ? WHERE id = ?", [
          advanceAdjusted, pending, pending <= EPS ? "PAID" : "PARTIAL", userId, receivableId,
        ]);
      }
    }

    // 5. freeze the content and move the contract on
    const content = buildContent(inv, number);
    await conn.query(
      `UPDATE billing_invoices
          SET status = 'ISSUED', invoice_number = ?, fy = ?, seq = ?, receivable_invoice_id = ?, advance_adjusted = ?,
              content = ?, issued_by = ?, issued_at = NOW(), updated_by = ?
        WHERE id = ? AND status = 'DRAFT'`,
      [number, fy, seq, receivableId, advanceAdjusted, JSON.stringify(content), userId, userId, id]
    );
    const [[left]] = await conn.query(
      "SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status = 'DRAFT'",
      [inv.contract.id, inv.period_start]
    );
    if (!Number(left.n)) {
      await conn.query(
        `UPDATE billing_contracts
            SET next_period_start = ?, status = IF(billing_type = 'ONE_TIME', 'ENDED', status), updated_by = ?
          WHERE id = ? AND next_period_start = ?`,
        [C.addDays(inv.period_end, 1), userId, inv.contract.id, inv.period_start]
      );
    }

    await logAudit(conn, req, {
      module: "BILLING",
      action: "INVOICE_ISSUED",
      entity_type: "BILLING_INVOICE",
      entity_id: id,
      entity_label: number,
      customer_id: inv.customer.company_id,
      summary: `Invoice ${number} issued to ${inv.customer.name} for ₹${inv.total.toFixed(2)}${advanceAdjusted ? ` (₹${advanceAdjusted.toFixed(2)} from advance)` : ""}`,
      refs: [{ entity_type: "INVOICE", entity_id: receivableId }],
    });

    return {
      id,
      invoice_number: number,
      customer: inv.customer.name,
      total: inv.total,
      receivable_invoice_id: receivableId,
      advance_adjusted: advanceAdjusted,
      print_copies: inv.print_copies,
      share_options_url: `/api/billing/invoices/${id}/share-options`,
    };
  });
  syncInvoiceStatusesSafely();
  return result;
}

/** POST /invoices/issue: issues each draft in invoice-date order; one failure does not stop the rest. */
async function issueMany(pool, ids, req, options) {
  const [rows] = await pool.query("SELECT id FROM billing_invoices WHERE id IN (?) ORDER BY invoice_date, created_at", [ids]);
  const found = new Set(rows.map((r) => r.id));
  const issued = [];
  const failed = ids.filter((i) => !found.has(i)).map((i) => ({ id: i, errors: ["Invoice not found"] }));
  for (const { id } of rows) {
    try {
      issued.push(await issueOne(pool, id, req, options));
    } catch (err) {
      if (!(err instanceof C.HttpError)) throw err;
      failed.push({ id, errors: err.errors || [err.message] });
    }
  }
  return { issued, failed };
}

/** Cancels an issued invoice (and its receivable). Not allowed once the customer has paid against it. */
async function cancelIssued(pool, id, req, reason) {
  const userId = req.user.id;
  await C.inTransaction(pool, async (conn) => {
    const inv = await D.loadInvoice(conn, id, { lock: true });
    if (inv.status !== "ISSUED") throw C.bad(inv.status === "DRAFT" ? "This is a draft - delete it instead" : "This invoice is already cancelled");

    if (inv.receivable_invoice_id) {
      const [[paid]] = await conn.query(
        `SELECT COALESCE(SUM(pa.allocated_amount + pa.tds_amount), 0) AS amount
           FROM payment_allocations pa
          WHERE pa.invoice_id = ?
            AND pa.id NOT IN (SELECT payment_allocation_id FROM billing_advance_adjustments
                               WHERE invoice_id = ? AND payment_allocation_id IS NOT NULL)`,
        [inv.receivable_invoice_id, id]
      );
      if (Number(paid.amount) > 0) {
        throw C.bad(`A payment has been received against ${inv.invoice_number}. Remove the payment before cancelling.`);
      }
      await conn.query(
        `DELETE pa FROM payment_allocations pa
           JOIN billing_advance_adjustments baa ON baa.payment_allocation_id = pa.id
          WHERE baa.invoice_id = ?`,
        [id]
      );
      await conn.query("UPDATE invoices SET status = 'CANCELLED', paid_amount = 0, pending_amount = 0, updated_by = ? WHERE id = ?", [userId, inv.receivable_invoice_id]);
    }
    await conn.query("UPDATE billing_advance_adjustments SET is_reversed = 1 WHERE invoice_id = ?", [id]);
    await conn.query(
      "UPDATE billing_invoices SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?, updated_by = ? WHERE id = ?",
      [userId, reason, userId, id]
    );
    await conn.query("UPDATE billing_invoice_shares SET revoked_at = NOW() WHERE billing_invoice_id = ? AND token_hash IS NOT NULL AND revoked_at IS NULL", [id]);

    // If this was the contract's latest billed period, it can be billed again.
    const [[other]] = await conn.query(
      "SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status = 'ISSUED'",
      [inv.contract.id, inv.period_start]
    );
    if (!Number(other.n)) {
      await conn.query(
        `UPDATE billing_contracts
            SET next_period_start = ?, status = IF(billing_type = 'ONE_TIME' AND status = 'ENDED', 'ACTIVE', status), updated_by = ?
          WHERE id = ? AND next_period_start = ?`,
        [inv.period_start, userId, inv.contract.id, C.addDays(inv.period_end, 1)]
      );
    }

    await logAudit(conn, req, {
      module: "BILLING",
      action: "INVOICE_CANCELLED",
      entity_type: "BILLING_INVOICE",
      entity_id: id,
      entity_label: inv.invoice_number,
      customer_id: inv.customer.company_id,
      summary: `Invoice ${inv.invoice_number} cancelled (₹${inv.total.toFixed(2)})`,
      reason,
    });
  });
  syncInvoiceStatusesSafely();
  return { id, status: "CANCELLED" };
}

module.exports = { buildContent, issueOne, issueMany, cancelIssued };
