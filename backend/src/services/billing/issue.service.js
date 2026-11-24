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
const PAY = require("./payment.service");
const { nextInvoiceNumber } = require("./numbering");
const { insertInvoiceTds } = require("../Tds.service");
const { syncInvoiceStatusesSafely } = require("../InvoiceStatus.service");
const { logAudit } = require("../Audit.service");

/**
 * Weekly / daily Termite contracts can have their periods issued out of order. Once the next period is
 * issued, move next_period_start on past every period that is already issued (no gap left behind).
 */
async function skipIssuedPeriods(conn, contractId, userId) {
  for (let i = 0; i < 400; i += 1) {
    const [[row]] = await conn.query(
      `SELECT DATE_FORMAT(MAX(bi.period_end), '%Y-%m-%d') AS period_end
         FROM billing_contracts bc
         JOIN billing_invoices bi ON bi.contract_id = bc.id AND bi.period_start = bc.next_period_start AND bi.status = 'ISSUED' AND bi.is_manual = 0
        WHERE bc.id = ?`,
      [contractId]
    );
    if (!row?.period_end) return;
    await conn.query("UPDATE billing_contracts SET next_period_start = ?, updated_by = ? WHERE id = ?", [C.addDays(row.period_end, 1), userId, contractId]);
  }
}

const EPS = 0.005;

// BILLING_ACCOUNTS_LINK=true (backend .env): every issued invoice is also added to the Accountant
// Panel (invoices table, + its TDS), so the Collection Executive can collect and record payments on it.
// Off (not set): only an invoice paid from a termite advance goes there, as before. Keep it off on live
// until billing is set up there.
const accountsLinkOn = () => /^(1|true|on|yes)$/i.test(String(process.env.BILLING_ACCOUNTS_LINK || "").trim());

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
  // Invoice line summaries: lines with the same group (typed on the contract's Services and prices)
  // print as ONE line, the summary as the item name and the total of those lines (after any service
  // shortfall) as its amount, where the group's first line was. Lines without a group print as they are.
  // The lines stay separate in the draft (services done, checks); only the print merges them.
  // A line with quantity 0 (and nothing to bill) is not printed, e.g. a service completed 0 times; a
  // summary prints only when one of its lines has a quantity. The draft still shows every line.
  const printed = [];
  const groups = new Map();
  inv.lines.forEach((l, i) => {
    if (Number(l.quantity) === 0 && Number(l.amount) === 0) return;
    const key = String(l.invoice_group || "").trim();
    if (!key) return printed.push(lines[i]);
    let g = groups.get(key);
    if (!g) {
      g = { name: key, sacs: new Set(), amount: 0 };
      groups.set(key, g);
      printed.push(g);
    }
    if (lines[i].sac_code) g.sacs.add(lines[i].sac_code);
    g.amount += Number(lines[i].amount || 0);
  });
  for (const [k, row] of printed.entries()) {
    if (!(row.sacs instanceof Set)) continue;
    const total = calc.round2(row.amount);
    printed[k] = { name: row.name, sac_code: [...row.sacs].join(", ") || null, unit: "Nos", bill_value: total, qty: 1, amount: total };
  }
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
    // Service Offered To: printed only when the customer's billing details have it ticked (its address).
    ship_to: inv.service_offered_to
      ? [{ name: "", addresses: String(inv.service_offered_to).split(/\r?\n/).map((s) => s.trim()).filter(Boolean) }]
      : [],
    // No "Service Offered To" column unless it is set; a group based contract never has one.
    hide_ship_to: inv.contract.contract_kind === "GROUP" || !inv.service_offered_to,
    // Termite invoices print Bill To + Invoice Details only (no Service Offered To) and no Bill Value column
    termite: inv.contract.billing_type === "TERMITE",
    pos: inv.pos.map((p) => ({ po_number: p.po_number, po_date: p.po_date })),
    lines: printed,
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

    // 1b. A Bill Run invoice is dated the day it is issued (the draft's date was only a preview); the
    // due date keeps the same payment terms (days after the invoice date). A manual invoice keeps the
    // date typed for it.
    if (!inv.is_manual) {
      const today = C.todayIst();
      const termsDays = inv.invoice_date && inv.due_date ? Math.max(0, C.daysBetween(inv.invoice_date, inv.due_date)) : 0;
      inv.invoice_date = today;
      inv.due_date = C.addDays(today, termsDays);
      await conn.query("UPDATE billing_invoices SET invoice_date = ?, due_date = ? WHERE id = ?", [inv.invoice_date, inv.due_date, id]);
    }

    // 2. the next number in the main series, carrying on from Vyapar's last invoice (numbering.js)
    const { fy, seq, number } = await nextInvoiceNumber(conn, inv.invoice_date);

    // 3. The Accountant Panel receivable: every invoice while BILLING_ACCOUNTS_LINK is on; otherwise
    // only an invoice paid from a termite advance - a payment that lives in the Accountant Panel - so
    // the advance is used up and never twice. Payments recorded in Billing are kept in step with it
    // (payment.service.js).
    const adv = await D.advanceFor(conn, inv.po_ids, { lock: true });
    const usesAdvance = Boolean(adv && adv.payments.some((p) => p.remaining > EPS));
    let receivableId = null;
    if (usesAdvance || accountsLinkOn()) {
      // Receivable in the existing invoices table + TDS snapshot. TDS follows the customer's TDS
      // setting (on the invoice amount or on the taxable value), so the taxable value (the subtotal,
      // before GST) is saved on the receivable and passed on: never guessed back from the total.
      const [[company]] = await conn.query("SELECT id, tds_applicable, tds_rate, tds_basis FROM companies WHERE id = ?", [inv.customer.company_id]);
      receivableId = uuid();
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
    }

    // 4. Termite advance
    let advanceAdjusted = 0;
    if (usesAdvance) {
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
    // A manual invoice is an extra bill: the contract's regular period does not move.
    const [[left]] = inv.is_manual
      ? [[{ n: 1 }]]
      : await conn.query(
        "SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status = 'DRAFT' AND is_manual = 0",
        [inv.contract.id, inv.period_start]
      );
    if (!Number(left.n)) {
      await conn.query(
        `UPDATE billing_contracts
            SET next_period_start = ?, status = IF((billing_type = 'ONE_TIME' OR (billing_type = 'TERMITE' AND frequency_months IS NULL)), 'ENDED', status), updated_by = ?
          WHERE id = ? AND next_period_start = ?`,
        [C.addDays(inv.period_end, 1), userId, inv.contract.id, inv.period_start]
      );
      // Weekly / daily Termite: later weeks may already be issued (issued out of order): move on past them.
      if (inv.contract.frequency_unit && inv.contract.frequency_unit !== "MONTH") await skipIssuedPeriods(conn, inv.contract.id, userId);
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
    if (await PAY.hasPayments(conn, id)) {
      throw C.bad(`A payment is recorded against ${inv.invoice_number}. Remove the payment on the invoice page before cancelling.`);
    }

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

    // If this was the contract's latest billed period, it can be billed again (a manual invoice never
    // moved the contract, so cancelling one leaves it alone).
    const [[other]] = inv.is_manual
      ? [[{ n: 1 }]]
      : await conn.query(
        "SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status = 'ISSUED' AND is_manual = 0",
        [inv.contract.id, inv.period_start]
      );
    if (!Number(other.n)) {
      const short = inv.contract.frequency_unit && inv.contract.frequency_unit !== "MONTH";
      // Monthly: only the latest billed period opens again. Weekly / daily Termite: any earlier week
      // or day - the Bill Run skips the ones still issued after it.
      await conn.query(
        `UPDATE billing_contracts
            SET next_period_start = ?, status = IF((billing_type = 'ONE_TIME' OR (billing_type = 'TERMITE' AND frequency_months IS NULL)) AND status = 'ENDED', 'ACTIVE', status), updated_by = ?
          WHERE id = ? AND ${short ? "next_period_start > ?" : "next_period_start = ?"}`,
        [inv.period_start, userId, inv.contract.id, short ? inv.period_start : C.addDays(inv.period_end, 1)]
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
