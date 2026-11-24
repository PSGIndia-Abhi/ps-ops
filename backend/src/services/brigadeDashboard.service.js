// Brigade dashboard (Brigade panel -> Dashboard): for every property, how far the work has got -
// booked -> completed -> on a PO -> invoiced -> paid - with counts and amounts, the totals, the chart
// series (month by month, service mix, outstanding by age) and what needs attention.
//
//   services   jobs of Brigade bookings (not canceled). A service's value is its price on its PO
//              (brigade_po_lines.amount) or else its booked price; amounts here are excl. GST.
//   invoices   Brigade invoices (billing_invoices, source BRIGADE, issued), incl. GST, with what was
//              collected on their receivable in the Accountant Panel (invoices.paid_amount).
//
// Filters (all optional, all apply to every number and chart):
//   from / to      YYYY-MM-DD: services by their date (start), invoices by invoice date
//   companyIds     properties
//   services       service names (jobs.sub_service)
//   po             "with" | "without": services on a PO / without one (invoices follow the services)
//   status         "done" | "open": completed services / not done yet

const { pool } = require("../../db");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const OPEN = new Set(["CREATED", "NOT_STARTED", "SCHEDULED", "ASSIGNED"]);

function priceOf(row) {
  if (row.line_amount !== null && row.line_amount !== undefined) return Number(row.line_amount);
  let prices = row.prices;
  if (typeof prices === "string") {
    try { prices = JSON.parse(prices); } catch { prices = {}; }
  }
  const p = prices?.[row.sub_service];
  return p === null || p === undefined ? 0 : Number(p) || 0;
}

function blank(companyId, name) {
  return {
    company_id: companyId, property: name || "—", flats: new Set(),
    booked: 0, open: 0, in_progress: 0, completed: 0, completed_value: 0,
    no_po: 0, no_po_completed: 0, no_po_completed_value: 0,
    on_po: 0, on_po_value: 0, ready: 0, ready_value: 0, invoiced_services: 0, invoiced_value: 0,
    invoices: 0, invoiced: 0, collected: 0, outstanding: 0, overdue: 0, overdue_count: 0,
    pending_flats: 0, pending_value: 0,
  };
}

const ymOf = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : String(d || "").slice(0, 7));

/** Every month from a to b ("YYYY-MM"), at most 36. */
function monthsBetween(a, b) {
  const out = [];
  if (!a || !b || a > b) return out;
  let [y, m] = a.split("-").map(Number);
  while (out.length < 36) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= b) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

async function brigadeDashboard({ from = null, to = null, companyIds = [], services = [], po = null, status = null, month = null } = {}) {
  if (month && !from && !to) {
    from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  // ---- services ----
  const where = ["j.status <> 'CANCELED'"];
  const params = [];
  if (from) { where.push("DATE(j.start_date) >= ?"); params.push(from); }
  if (to) { where.push("DATE(j.start_date) <= ?"); params.push(to); }
  if (companyIds.length) { where.push("bd.company_id IN (?)"); params.push(companyIds); }
  if (services.length) { where.push("j.sub_service IN (?)"); params.push(services); }
  if (status === "done") where.push("j.status = 'COMPLETED'");
  if (status === "open") where.push("j.status <> 'COMPLETED'");
  if (po === "with") where.push("COALESCE(p.po_number, NULLIF(TRIM(bd.client_po_number), '')) IS NOT NULL");
  if (po === "without") where.push("COALESCE(p.po_number, NULLIF(TRIM(bd.client_po_number), '')) IS NULL");

  const [jobs] = await pool.query(
    `SELECT j.id, j.status, j.sub_service, j.start_date, bd.company_id, TRIM(co.name) AS property, bd.flat_number, bd.prices,
            l.amount AS line_amount, COALESCE(p.po_number, NULLIF(TRIM(bd.client_po_number), '')) AS po_number,
            (inv.job_id IS NOT NULL) AS invoiced
       FROM jobs j
       JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id
       LEFT JOIN companies co ON co.id = bd.company_id
       LEFT JOIN brigade_po_lines l ON l.job_id = j.id
       LEFT JOIN customer_pos p ON p.id = l.po_id
       LEFT JOIN (SELECT DISTINCT il.job_id FROM billing_invoice_lines il
                    JOIN billing_invoices bi ON bi.id = il.invoice_id AND bi.source = 'BRIGADE' AND bi.status = 'ISSUED'
                   WHERE il.job_id IS NOT NULL) inv ON inv.job_id = j.id
      WHERE ${where.join(" AND ")}`,
    params
  );

  const props = new Map();
  const get = (id, name) => {
    const key = String(id || "");
    if (!props.has(key)) props.set(key, blank(id, name));
    return props.get(key);
  };
  const byMonth = new Map(); // ym -> { completed_po, completed_no_po, completed_value, booked }
  const month0 = () => ({ booked: 0, completed_po: 0, completed_no_po: 0, completed_value: 0, invoiced: 0, collected: 0 });
  const mix = new Map(); // service -> { count, value, completed }

  for (const j of jobs) {
    const p = get(j.company_id, j.property);
    const value = priceOf(j);
    const done = j.status === "COMPLETED";
    const ym = ymOf(j.start_date);
    if (!byMonth.has(ym)) byMonth.set(ym, month0());
    const bm = byMonth.get(ym);
    bm.booked += 1;
    p.flats.add(j.flat_number);
    p.booked += 1;
    const sv = mix.get(j.sub_service) || { service: j.sub_service, count: 0, completed: 0, value: 0 };
    sv.count += 1;
    sv.value += value;
    if (done) sv.completed += 1;
    mix.set(j.sub_service, sv);
    if (done) {
      p.completed += 1;
      p.completed_value += value;
      bm.completed_value += value;
      if (j.po_number) bm.completed_po += 1; else bm.completed_no_po += 1;
    } else if (OPEN.has(j.status)) p.open += 1;
    else p.in_progress += 1;
    if (!j.po_number) {
      p.no_po += 1;
      if (done) { p.no_po_completed += 1; p.no_po_completed_value += value; }
    } else {
      p.on_po += 1;
      p.on_po_value += value;
      if (Number(j.invoiced)) { p.invoiced_services += 1; p.invoiced_value += value; }
      else if (done) { p.ready += 1; p.ready_value += value; }
    }
  }

  // ---- invoices (follow the property and date filters; "without PO" has none by definition) ----
  const iw = ["bi.source = 'BRIGADE'", "bi.status = 'ISSUED'"];
  const ip = [];
  if (from) { iw.push("bi.invoice_date >= ?"); ip.push(from); }
  if (to) { iw.push("bi.invoice_date <= ?"); ip.push(to); }
  if (companyIds.length) { iw.push("bi.company_id IN (?)"); ip.push(companyIds); }
  if (services.length) {
    iw.push("EXISTS (SELECT 1 FROM billing_invoice_lines il JOIN jobs jj ON jj.id = il.job_id WHERE il.invoice_id = bi.id AND jj.sub_service IN (?))");
    ip.push(services);
  }
  const skipInvoices = po === "without" || status === "open";
  const [invoiceRows] = skipInvoices ? [[]] : await pool.query(
    `SELECT bi.id, bi.company_id, TRIM(co.name) AS property, bi.invoice_date, bi.total,
            COALESCE(r.paid_amount, 0) AS paid, r.due_date
       FROM billing_invoices bi
       LEFT JOIN invoices r ON r.id = bi.receivable_invoice_id
       LEFT JOIN companies co ON co.id = bi.company_id
      WHERE ${iw.join(" AND ")}`,
    ip
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ageing = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const ageingCount = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const i of invoiceRows) {
    const p = get(i.company_id, i.property);
    const total = Number(i.total);
    const paid = Math.min(Number(i.paid) || 0, total);
    const left = Math.max(total - paid, 0);
    p.invoices += 1;
    p.invoiced += total;
    p.collected += paid;
    p.outstanding += left;
    const due = i.due_date ? new Date(i.due_date) : null;
    if (left > 0.5 && due && due < today) { p.overdue += left; p.overdue_count += 1; }
    const ym = ymOf(i.invoice_date);
    if (!byMonth.has(ym)) byMonth.set(ym, month0());
    byMonth.get(ym).invoiced += total;
    byMonth.get(ym).collected += paid;
    if (left > 0.5) {
      const days = Math.floor((today - new Date(i.invoice_date)) / 86400000);
      const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
      ageing[bucket] += left;
      ageingCount[bucket] += 1;
    }
  }

  // ---- pending flats (booked, not scheduled yet): property / service filters, not dates ----
  if (status !== "done" && po !== "with") {
    const pw = ["r.status = 'PENDING'"];
    const pp = [];
    if (companyIds.length) { pw.push("r.company_id IN (?)"); pp.push(companyIds); }
    if (services.length) { pw.push("EXISTS (SELECT 1 FROM brigade_flat_request_services x WHERE x.request_id = r.id AND x.sub_service IN (?))"); pp.push(services); }
    const [pending] = await pool.query(
      `SELECT r.company_id, TRIM(co.name) AS property, COUNT(DISTINCT r.id) AS n, COALESCE(SUM(s.price), 0) AS value
         FROM brigade_flat_requests r
         LEFT JOIN brigade_flat_request_services s ON s.request_id = r.id
         LEFT JOIN companies co ON co.id = r.company_id
        WHERE ${pw.join(" AND ")}
        GROUP BY r.company_id, co.name`,
      pp
    ).catch((err) => (err.code === "ER_NO_SUCH_TABLE" ? [[]] : Promise.reject(err)));
    for (const r of pending) {
      const p = get(r.company_id, r.property);
      p.pending_flats += Number(r.n);
      p.pending_value += Number(r.value);
    }
  }

  const rows = [...props.values()]
    .map((p) => {
      const out = { ...p, flats: p.flats.size };
      for (const k of ["completed_value", "no_po_completed_value", "on_po_value", "ready_value", "invoiced_value", "invoiced", "collected", "outstanding", "overdue", "pending_value"]) out[k] = round2(out[k]);
      return out;
    })
    .filter((p) => p.booked || p.invoices || p.pending_flats)
    .sort((a, b) => b.booked - a.booked || String(a.property).localeCompare(String(b.property)));

  const sum = (k) => round2(rows.reduce((t, r) => t + (Number(r[k]) || 0), 0));
  const totals = Object.fromEntries(
    ["flats", "booked", "open", "in_progress", "completed", "completed_value", "no_po", "no_po_completed", "no_po_completed_value",
      "on_po", "on_po_value", "ready", "ready_value", "invoiced_services", "invoiced_value", "invoices", "invoiced", "collected", "outstanding",
      "overdue", "overdue_count", "pending_flats", "pending_value"].map((k) => [k, sum(k)])
  );

  // month series: the chosen range, else from the first to the last month with data (at most 36)
  // never past the current month: services dated in the future are counted as a data issue instead
  const nowYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const keys = [...byMonth.keys()].filter((k) => /^\d{4}-\d{2}$/.test(k) && k <= nowYm).sort();
  const first = from ? from.slice(0, 7) : keys[0];
  const lastWanted = to ? to.slice(0, 7) : keys[keys.length - 1];
  const last = lastWanted && lastWanted > nowYm ? nowYm : lastWanted;
  const futureDated = jobs.filter((j) => j.start_date && new Date(j.start_date) > new Date(today.getTime() + 86400000 * 31)).length;
  let range = monthsBetween(first, last);
  if (range.length > 24 && !from) range = range.slice(-24);
  const months = range.map((ym) => {
    const m = byMonth.get(ym) || month0();
    return { month: ym, booked: m.booked, completed_po: m.completed_po, completed_no_po: m.completed_no_po, completed_value: round2(m.completed_value), invoiced: round2(m.invoiced), collected: round2(m.collected) };
  });

  return {
    filters: { from, to, company_ids: companyIds, services, po, status },
    totals,
    properties: rows,
    months,
    service_mix: [...mix.values()].map((s) => ({ ...s, value: round2(s.value) })).sort((a, b) => b.count - a.count),
    ageing: Object.keys(ageing).map((k) => ({ bucket: k, amount: round2(ageing[k]), count: ageingCount[k] })),
    data_issues: { future_dated: futureDated },
  };
}

/** What the filters can offer: the Brigade properties and the service names used. */
async function dashboardOptions() {
  const [properties] = await pool.query(
    `SELECT c.id AS company_id, TRIM(c.name) AS name FROM companies c JOIN group_name g ON g.id = c.group_id
      WHERE g.name = 'Brigade Group' ORDER BY c.name`
  );
  const [svc] = await pool.query(
    `SELECT DISTINCT j.sub_service AS name FROM jobs j JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id
      WHERE j.sub_service IS NOT NULL AND j.sub_service <> '' ORDER BY j.sub_service`
  );
  return { properties, services: svc.map((s) => s.name) };
}

module.exports = { brigadeDashboard, dashboardOptions };
