const ExcelJS = require("exceljs");
const { loadQuoteServices, quoteServiceNames } = require("../utils/crmLeadManagement");

// ---------------------------------------------------------------------------
// Lead report Excel (Team Report -> Download Excel). Commercial leads added in a period, either
// one person's (they created it, are its telecaller or its sales executive) or a whole team's.
// Sheets: Summary (leads per status), All Leads (one row per lead, current status and everything
// around it), Status History (every step each lead went through).
// Read-only: nothing is written.
// ---------------------------------------------------------------------------

const STATUS = [
  ["NEW", "New"],
  ["TO_CALL", "To Call"],
  ["NEED_MORE_INFO", "Need More Info"],
  ["QUALIFIED", "Qualified"],
  ["MEETING_SCHEDULED", "Meeting Scheduled"],
  ["VISIT_COMPLETED", "Visit Completed"],
  ["QUOTATION_SENT", "Quotation Sent"],
  ["WON", "Converted"],
  ["LOST", "Lost"],
  ["NOT_GENUINE", "Not Genuine"],
];
const STATUS_LABEL = Object.fromEntries(STATUS);
// The server keeps two "converted" and two "lost" values; the screens show one of each.
function statusKey(raw) {
  if (!raw) return "NEW";
  if (raw === "CONVERTED") return "WON";
  if (raw === "CANCELLED") return "LOST";
  return raw;
}
const statusLabel = (raw) => STATUS_LABEL[statusKey(raw)] || raw;

const INDUSTRY = { restaurant: "Restaurant", apartment: "Apartment", hospital: "Hospital", it: "IT", qsr: "QSR", builder: "Builder", other: "Other" };
const SOURCE_CODES = { google: "Google", website: "Website", referral: "Referral", social_media: "Social Media", other: "Other" };
const sourceLabel = (raw) => (raw ? SOURCE_CODES[String(raw).toLowerCase()] || raw : "");
const CONTRACT = { ONE_TIME: "One-time", AMC: "AMC" };

const HISTORY_ACTION = {
  CREATE: "Lead added",
  ASSIGN_TELECALLER: "Assigned",
  ASSIGNED: "Assigned",
  CALL_LOGGED: "Call logged",
  QUALIFY: "Qualified",
  REJECT: "Marked not genuine",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  MEETING_SCHEDULED: "Meeting scheduled",
  MEETING_RESCHEDULED: "Meeting rescheduled",
  VISIT_CHECK_IN: "Visit check-in",
  VISIT_COMPLETED: "Visit completed",
  QUOTATION_SENT: "Quotation sent",
  QUOTATION_CANCELLED: "Quotation cancelled",
  FEEDBACK_SENT: "Feedback sent",
  CONVERTED: "Converted",
  CONTRACT_TYPE_SET: "Service type set",
  AGREEMENT_CREATED: "Agreement created",
  AGREEMENT_SIGNED: "Agreement signed",
  MARK_LOST: "Marked lost",
};
const historyLabel = (a) => HISTORY_ACTION[a] || String(a || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

// "2026-11-12 14:05:00" (MySQL wall clock) -> a Date that Excel shows as exactly that time.
function xlDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
}
const dt = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * The leads in the report.
 *   people: [userId] - leads where any of them is creator, telecaller or sales executive;
 *           null = every commercial lead (a viewer who sees the whole company)
 */
async function loadLeads(db, { people, from, to }) {
  const where = ["l.lead_type = 'commercial'", "DATE(l.created_at) BETWEEN ? AND ?"];
  const params = [from, to];
  if (people) {
    where.push("(l.created_by_user_id IN (?) OR l.assigned_telecaller_id IN (?) OR l.assigned_sales_employee_id IN (?))");
    params.push(people, people, people);
  }
  const [leads] = await db.query(
    `SELECT l.id, l.lead_number, l.company_name, l.customer_name, l.contact_designation, l.phone, l.alternate_phone,
            l.customer_email, l.industry_type, l.lead_source, l.reference_by, l.services_requested, l.location, l.notes,
            l.pipeline_stage, l.amount, l.created_by_user_id, l.assigned_telecaller_id, l.assigned_sales_employee_id,
            l.competitor_name, l.competitor_amount, ${dt("l.created_at")} AS created_at, ${dt("l.updated_at")} AS updated_at,
            lr.name AS loss_reason
       FROM crm_leads l
       LEFT JOIN crm_lead_loss_reasons lr ON lr.id = l.loss_reason_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.created_at DESC`,
    params
  );
  return leads;
}

async function loadDetails(db, leadIds) {
  if (!leadIds.length) return { meetings: [], calls: [], quotes: [], conversions: [], followUps: [], history: [] };
  const [[meetings], [calls], [quotes], [conversions], [followUps], [history]] = await Promise.all([
    db.query(
      `SELECT lead_id, sales_employee_id, status, ${dt("scheduled_at")} AS scheduled_at, ${dt("check_in_at")} AS check_in_at,
              ${dt("check_out_at")} AS check_out_at, outcome_notes
         FROM crm_lead_meetings WHERE lead_id IN (?) ORDER BY scheduled_at ASC`,
      [leadIds]
    ),
    db.query(
      `SELECT lead_id, outcome, comments, ${dt("created_at")} AS created_at
         FROM crm_lead_call_activities WHERE lead_id IN (?) ORDER BY created_at ASC`,
      [leadIds]
    ),
    db.query(
      `SELECT lead_id, quotation_number, total_amount, status, ${dt("COALESCE(sent_at, created_at)")} AS sent_at
         FROM crm_lead_quotations WHERE lead_id IN (?) AND status <> 'CANCELLED' ORDER BY COALESCE(sent_at, created_at) ASC`,
      [leadIds]
    ),
    db.query(
      `SELECT lead_id, contract_type, ${dt("converted_at")} AS converted_at FROM crm_lead_conversions WHERE lead_id IN (?) ORDER BY converted_at ASC`,
      [leadIds]
    ),
    // The earliest still-open follow-up is the lead's next follow-up (same rule as the leads list).
    db.query(
      `SELECT source_id AS lead_id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time
         FROM work_tasks
        WHERE source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS','PAUSED')
          AND due_date IS NOT NULL AND source_id IN (?)
        ORDER BY due_date ASC, due_time ASC`,
      [leadIds]
    ),
    db.query(
      `SELECT h.lead_id, h.action, h.note, ${dt("h.changed_at")} AS changed_at, u.name AS changed_by
         FROM crm_lead_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.lead_id IN (?) ORDER BY h.lead_id, h.id ASC`,
      [leadIds]
    ),
  ]);
  return { meetings, calls, quotes, conversions, followUps, history };
}

const groupBy = (rows) => {
  const map = new Map();
  for (const r of rows) (map.get(r.lead_id) || map.set(r.lead_id, []).get(r.lead_id)).push(r);
  return map;
};

// ---- workbook styling -------------------------------------------------------

const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
function addTable(ws, startRow, columns, rows) {
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 14 }));
  const head = ws.getRow(startRow);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEAD_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  head.height = 30;
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i);
    columns.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      cell.value = r[c.key] ?? null;
      if (c.type === "date") cell.numFmt = "dd-mmm-yyyy";
      if (c.type === "datetime") cell.numFmt = "dd-mmm-yyyy hh:mm";
      if (c.type === "money") cell.numFmt = "#,##0.00";
      if (c.wrap) cell.alignment = { wrapText: true, vertical: "top" };
    });
  });
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow + Math.max(rows.length, 1), column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: startRow, xSplit: columns[0]?.freeze ? 1 : 0 }];
}

function titleRows(ws, lines) {
  lines.forEach((text, i) => {
    const cell = ws.getRow(i + 1).getCell(1);
    cell.value = text;
    cell.font = i === 0 ? { bold: true, size: 14 } : { color: { argb: "FF555555" } };
  });
}

/**
 * Builds the workbook.
 *   subject: { title: "Ravi Kumar" | "Whole team", people: [ids] | null, perPerson: [{id, name, role}] | null }
 *   period:  { from, to, label }
 * Returns { buffer, count }.
 */
async function buildLeadsReport(db, { subject, period }) {
  await loadQuoteServices(db);
  const leads = await loadLeads(db, { people: subject.people, from: period.from, to: period.to });
  const ids = leads.map((l) => l.id);
  const d = await loadDetails(db, ids);
  const meetings = groupBy(d.meetings);
  const calls = groupBy(d.calls);
  const quotes = groupBy(d.quotes);
  const conversions = groupBy(d.conversions);
  const history = groupBy(d.history);
  const nextFollowUp = new Map();
  for (const t of d.followUps) if (!nextFollowUp.has(t.lead_id)) nextFollowUp.set(t.lead_id, `${t.due_date} ${t.due_time || "09:00:00"}`);

  // Names of everyone the leads mention.
  const userIds = new Set();
  for (const l of leads) for (const k of ["created_by_user_id", "assigned_telecaller_id", "assigned_sales_employee_id"]) if (l[k]) userIds.add(Number(l[k]));
  const names = new Map();
  if (userIds.size) {
    const [users] = await db.query("SELECT id, name FROM users WHERE id IN (?)", [[...userIds]]);
    for (const u of users) names.set(Number(u.id), u.name);
  }
  const nameOf = (id) => (id ? names.get(Number(id)) || `User ${id}` : "");

  const rows = leads.map((l) => {
    const m = meetings.get(l.id) || [];
    const done = m.filter((x) => x.status === "COMPLETED");
    const lastVisit = done.at(-1);
    const upcoming = m.filter((x) => x.status === "SCHEDULED").at(0);
    const c = (calls.get(l.id) || []).at(-1);
    const q = (quotes.get(l.id) || []).at(-1);
    const conv = (conversions.get(l.id) || []).at(-1);
    const key = statusKey(l.pipeline_stage);
    const closed = key === "LOST" || key === "NOT_GENUINE";
    return {
      number: l.lead_number || "",
      added: xlDate(l.created_at),
      company: l.company_name || l.customer_name || "",
      contact: l.customer_name || "",
      designation: l.contact_designation || "",
      phone: l.phone || "",
      altPhone: l.alternate_phone || "",
      email: l.customer_email || "",
      industry: INDUSTRY[l.industry_type] || l.industry_type || "",
      source: sourceLabel(l.lead_source),
      reference: l.reference_by || "",
      services: l.services_requested ? quoteServiceNames(String(l.services_requested).split(",")).join(", ") : "",
      location: l.location || "",
      status: STATUS_LABEL[key] || key,
      telecaller: nameOf(l.assigned_telecaller_id),
      sales: nameOf(l.assigned_sales_employee_id),
      addedBy: nameOf(l.created_by_user_id),
      nextFollowUp: xlDate(nextFollowUp.get(l.id)),
      lastCall: xlDate(c?.created_at),
      lastCallOutcome: c ? [String(c.outcome || "").replace(/_/g, " ").toLowerCase(), c.comments].filter(Boolean).join(" - ") : "",
      meetings: m.length,
      visits: done.length,
      nextMeeting: xlDate(upcoming?.scheduled_at),
      lastVisit: xlDate(lastVisit?.check_out_at || lastVisit?.check_in_at || lastVisit?.scheduled_at),
      lastVisitOutcome: lastVisit?.outcome_notes || "",
      quoteNo: q?.quotation_number || "",
      quoteAmount: num(q?.total_amount),
      quoteStatus: q ? String(q.status || "").replace(/_/g, " ").toLowerCase() : "",
      closureAmount: key === "WON" ? num(l.amount) : null,
      convertedOn: xlDate(conv?.converted_at),
      contract: CONTRACT[conv?.contract_type] || "",
      reason: closed ? l.loss_reason || "" : "",
      competitor: [l.competitor_name, l.competitor_amount ? `Rs ${Number(l.competitor_amount).toLocaleString("en-IN")}` : ""].filter(Boolean).join(" - "),
      notes: l.notes || "",
      updated: xlDate(l.updated_at),
      _key: key,
      _owner: l.assigned_sales_employee_id || l.assigned_telecaller_id || l.created_by_user_id,
      _id: l.id,
    };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";
  wb.created = new Date();
  const generated = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  // ---- Summary ----
  const sum = wb.addWorksheet("Summary");
  titleRows(sum, [
    `Lead report - ${subject.title}`,
    `Leads added: ${period.label}   ·   ${rows.length} leads   ·   status as on ${generated}`,
  ]);
  const counts = (list) => Object.fromEntries(STATUS.map(([k]) => [k, list.filter((r) => r._key === k).length]));
  if (subject.perPerson) {
    // One row per person: the leads they own (sales executive, else telecaller, else who added it).
    const people = subject.perPerson.map((p) => {
      const mine = rows.filter((r) => Number(r._owner) === Number(p.id));
      return { person: p.name, role: p.role || "", total: mine.length, ...counts(mine) };
    }).filter((p) => p.total > 0);
    addTable(sum, 4, [
      { key: "person", header: "Person", width: 26 },
      { key: "role", header: "Role", width: 18 },
      ...STATUS.map(([k, label]) => ({ key: k, header: label, width: 12 })),
      { key: "total", header: "Total", width: 10 },
    ], [...people, { person: "Total", role: "", total: rows.length, ...counts(rows) }]);
    sum.getRow(4 + people.length + 1).font = { bold: true };
  } else {
    const c = counts(rows);
    addTable(sum, 4, [
      { key: "status", header: "Status", width: 24 },
      { key: "leads", header: "Leads", width: 10 },
    ], [...STATUS.map(([k, label]) => ({ status: label, leads: c[k] })), { status: "Total", leads: rows.length }]);
    sum.getRow(4 + STATUS.length + 1).font = { bold: true };
  }

  // ---- All Leads ----
  const all = wb.addWorksheet("All Leads");
  addTable(all, 1, [
    { key: "number", header: "Lead No", width: 14, freeze: true },
    { key: "added", header: "Date Added", width: 13, type: "date" },
    { key: "company", header: "Company", width: 28 },
    { key: "contact", header: "Contact Person", width: 22 },
    { key: "designation", header: "Designation", width: 16 },
    { key: "phone", header: "Phone", width: 14 },
    { key: "altPhone", header: "Alternate Phone", width: 14 },
    { key: "email", header: "Email", width: 24 },
    { key: "industry", header: "Industry", width: 13 },
    { key: "source", header: "Lead Source", width: 16 },
    { key: "reference", header: "Reference By", width: 16 },
    { key: "services", header: "Services", width: 30, wrap: true },
    { key: "location", header: "Location", width: 32, wrap: true },
    { key: "status", header: "Current Status", width: 18 },
    { key: "telecaller", header: "Telecaller", width: 20 },
    { key: "sales", header: "Sales Executive", width: 20 },
    { key: "addedBy", header: "Added By", width: 20 },
    { key: "nextFollowUp", header: "Next Follow-up", width: 17, type: "datetime" },
    { key: "lastCall", header: "Last Call", width: 17, type: "datetime" },
    { key: "lastCallOutcome", header: "Last Call Outcome", width: 30, wrap: true },
    { key: "meetings", header: "Meetings", width: 10 },
    { key: "visits", header: "Visits Done", width: 10 },
    { key: "nextMeeting", header: "Next Meeting", width: 17, type: "datetime" },
    { key: "lastVisit", header: "Last Visit", width: 17, type: "datetime" },
    { key: "lastVisitOutcome", header: "Last Visit Outcome", width: 30, wrap: true },
    { key: "quoteNo", header: "Latest Quotation", width: 16 },
    { key: "quoteAmount", header: "Quotation Amount", width: 14, type: "money" },
    { key: "quoteStatus", header: "Quotation Status", width: 14 },
    { key: "closureAmount", header: "Closure Amount", width: 14, type: "money" },
    { key: "convertedOn", header: "Converted On", width: 13, type: "date" },
    { key: "contract", header: "Contract", width: 11 },
    { key: "reason", header: "Lost / Not Genuine Reason", width: 24, wrap: true },
    { key: "competitor", header: "Competitor", width: 22 },
    { key: "notes", header: "Notes", width: 36, wrap: true },
    { key: "updated", header: "Last Updated", width: 17, type: "datetime" },
  ], rows);

  // ---- Status History ----
  const hist = wb.addWorksheet("Status History");
  const histRows = [];
  for (const r of rows) {
    for (const h of history.get(r._id) || []) {
      histRows.push({ number: r.number, company: r.company, when: xlDate(h.changed_at), action: historyLabel(h.action), note: h.note || "", by: h.changed_by || "" });
    }
  }
  addTable(hist, 1, [
    { key: "number", header: "Lead No", width: 14, freeze: true },
    { key: "company", header: "Company", width: 28 },
    { key: "when", header: "Date & Time", width: 17, type: "datetime" },
    { key: "action", header: "What Happened", width: 22 },
    { key: "note", header: "Details", width: 60, wrap: true },
    { key: "by", header: "Done By", width: 20 },
  ], histRows);

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), count: rows.length };
}

module.exports = { buildLeadsReport, statusLabel };
