// Accounts dashboard: GET /dashboard?month=2026-11&group_id=&q=
// One call with everything the Accounts team needs for a month: SOS received, what is ready to bill,
// waiting for an SOS or blocked, drafts, issued invoices and their collection, customers billed late
// (past the bill-by day of their profile), and the last 6 months issued.

const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const D = require("../../services/billing/draft.service");
const S = require("../../services/billing/sos.service");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const dashboard = C.handle("Failed to load the dashboard", async (req, res) => {
  const month = C.month(req.query.month || C.todayIst().slice(0, 7));
  const range = C.monthRange(month);
  const groupId = C.str(req.query.group_id, "group_id", { max: 36 });
  // Customers picked in the customer filter (comma separated); none = every customer.
  const companyIds = String(req.query.company_ids || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
  const picked = companyIds.length ? new Set(companyIds) : null;
  const q = C.str(req.query.q, "q", { max: 100 });
  const today = C.todayIst();
  const thisMonth = today.slice(0, 7);
  const day = Number(today.slice(8, 10));

  // Customers (group + bill-by day) to filter and to judge lateness.
  const [customers] = await pool.query(
    `SELECT c.id, c.group_id, g.name AS group_name, bp.bill_by_day FROM companies c
       LEFT JOIN group_name g ON g.id = c.group_id LEFT JOIN billing_profiles bp ON bp.company_id = c.id`
  );
  const cust = new Map(customers.map((c) => [c.id, c]));
  const inGroup = (companyId) => (!groupId || cust.get(companyId)?.group_id === groupId) && (!picked || picked.has(companyId));

  // Bill Run for the month (what is due), with the lateness rule:
  //   a past month: anything still not issued is late
  //   this month:   late once the customer's bill-by day has passed
  const due = (await D.dueList(pool, month, { q })).rows.filter((r) => inGroup(r.company_id));
  const isLate = (r) => {
    const by = cust.get(r.company_id)?.bill_by_day;
    if (month < thisMonth) return true;
    return month === thisMonth && by !== null && by !== undefined && day > Number(by);
  };
  const rowOut = (r) => ({
    contract_id: r.contract_id, contract_code: r.contract_code, company_id: r.company_id, customer: r.customer,
    group: cust.get(r.company_id)?.group_name || null, billing_type: r.billing_type, structure: r.structure,
    period_start: r.period_start, period_end: r.period_end, estimated_total: r.estimated_total, sos: r.sos,
    already_drafted: r.already_drafted, bill_by_day: cust.get(r.company_id)?.bill_by_day ?? null,
    warnings: r.warnings.map((w) => w.message), blocking: r.blocking,
  });
  const ready = due.filter((r) => !r.blocking && !r.already_drafted);
  const waitingSos = due.filter((r) => r.sos === "PENDING");
  const blocked = due.filter((r) => r.blocking && r.sos !== "PENDING");
  const late = due.filter(isLate);

  // SOS of the month.
  const sos = await S.monthOverview(pool, month, { q, groupId, companyIds });

  // Drafts waiting to be issued (any month) and invoices issued in the month (+ their collection).
  const groupSql = `${groupId ? "AND c.group_id = ?" : ""} ${companyIds.length ? "AND bi.company_id IN (?)" : ""}`;
  const scope = [...(groupId ? [groupId] : []), ...(companyIds.length ? [companyIds] : [])];
  const qSql = q ? "AND (c.name LIKE CONCAT('%', ?, '%') OR bi.invoice_number LIKE CONCAT('%', ?, '%'))" : "";
  const extra = [...scope, ...(q ? [q, q] : [])];
  const [[drafts]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bi.total), 0) AS value FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id
      WHERE bi.status = 'DRAFT' ${groupSql} ${qSql}`,
    extra
  );
  const [[issued]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bi.total), 0) AS value,
            COALESCE(SUM(inv.paid_amount), 0) AS collected, COALESCE(SUM(inv.pending_amount), 0) AS pending,
            COALESCE(SUM(CASE WHEN inv.status = 'OVERDUE' THEN inv.pending_amount ELSE 0 END), 0) AS overdue,
            SUM(inv.status = 'PAID') AS paid_count
       FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id
       LEFT JOIN invoices inv ON inv.id = bi.receivable_invoice_id
      WHERE bi.status = 'ISSUED' AND bi.invoice_date >= ? AND bi.invoice_date < ? ${groupSql} ${qSql}`,
    [range.start, range.next, ...extra]
  );
  const [[cancelled]] = await pool.query(
    `SELECT COUNT(*) AS n FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id
      WHERE bi.status = 'CANCELLED' AND bi.invoice_date >= ? AND bi.invoice_date < ? ${groupSql} ${qSql}`,
    [range.start, range.next, ...extra]
  );
  const [recent] = await pool.query(
    `SELECT bi.id, bi.invoice_number, DATE_FORMAT(bi.invoice_date, '%Y-%m-%d') AS invoice_date, bi.total, c.name AS customer,
            inv.status AS receivable_status,
            (SELECT s.status FROM billing_invoice_shares s WHERE s.billing_invoice_id = bi.id AND s.channel = 'EMAIL' ORDER BY s.created_at DESC LIMIT 1) AS email_status
       FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id LEFT JOIN invoices inv ON inv.id = bi.receivable_invoice_id
      WHERE bi.status = 'ISSUED' AND bi.invoice_date >= ? AND bi.invoice_date < ? ${groupSql} ${qSql}
      ORDER BY bi.issued_at DESC LIMIT 8`,
    [range.start, range.next, ...extra]
  );

  // Last 6 months issued (ending with the chosen month).
  const startTrend = C.addMonths(range.start, -5);
  const [trendRows] = await pool.query(
    `SELECT DATE_FORMAT(bi.invoice_date, '%Y-%m') AS m, COUNT(*) AS n, COALESCE(SUM(bi.total), 0) AS value
       FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id
      WHERE bi.status = 'ISSUED' AND bi.invoice_date >= ? AND bi.invoice_date < ? ${groupSql}
      GROUP BY m`,
    [startTrend, range.next, ...scope]
  );
  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = C.addMonths(startTrend, i).slice(0, 7);
    const t = trendRows.find((r) => r.m === m);
    return { month: m, invoices: t ? Number(t.n) : 0, value: t ? round2(t.value) : 0 };
  });

  const [groups] = await pool.query(
    `SELECT DISTINCT g.id, g.name FROM group_name g JOIN companies c ON c.group_id = g.id
       JOIN billing_contracts bc ON bc.company_id = c.id ORDER BY g.name`
  );
  // Options for the customer filter: every customer with a contract, its group and outlets.
  const [customerOptions] = await pool.query(
    `SELECT c.id AS company_id, c.name, g.name AS group_name,
            (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ') FROM sites s WHERE s.company_id = c.id) AS outlets
       FROM companies c LEFT JOIN group_name g ON g.id = c.group_id
      WHERE EXISTS (SELECT 1 FROM billing_contracts bc WHERE bc.company_id = c.id)
      ORDER BY (g.name IS NULL), g.name, c.name`
  );

  res.json({
    month,
    as_of: today,
    groups,
    customers: customerOptions.map((c) => ({ company_id: c.company_id, name: c.name, group: c.group_name || null, outlets: c.outlets || "" })),
    kpis: {
      sos_submitted: sos.summary.submitted,
      sos_customers: sos.summary.customers,
      due: due.length,
      ready: ready.length,
      ready_value: round2(ready.reduce((t, r) => t + (r.estimated_total || 0), 0)),
      waiting_sos: waitingSos.length,
      blocked: blocked.length,
      late: late.length,
      drafts: Number(drafts.n),
      drafts_value: round2(drafts.value),
      issued: Number(issued.n),
      issued_value: round2(issued.value),
      collected: round2(issued.collected),
      pending: round2(issued.pending),
      overdue: round2(issued.overdue),
      paid_count: Number(issued.paid_count || 0),
      cancelled: Number(cancelled.n),
    },
    ready: ready.map(rowOut),
    waiting_sos: waitingSos.map(rowOut),
    blocked: blocked.map(rowOut),
    late: late.map(rowOut),
    recent: recent.map((r) => ({ ...r, total: Number(r.total) })),
    trend,
  });
});

module.exports = { dashboard };
