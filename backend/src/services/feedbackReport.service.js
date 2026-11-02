const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { pool } = require("../../db");
const {
  HttpError, monthRange, monthLabel, csvOf, optionalDate, likeOf, isDesk,
  PRIORITIES, TICKET_STATUSES, ACTION_LABELS, PRIORITY_LABELS,
} = require("./feedback.service");

// ---------------------------------------------------------------------------
// Customer Feedback - reports (B11).
//   Customer report: one customer, all its sites, a range of months - who gave feedback, what
//   they said, and the action and status of every complaint. JSON for the screens, and PDF / Excel.
//   Tickets export: the Feedback Desk list as Excel.
// ---------------------------------------------------------------------------

const MAX_MONTHS = 12;
const STATUS_LABELS = { ACTION_PENDING: "Action pending", CLOSED: "Closed" };

function monthsBetween(from, to) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

// Satisfaction = the share of answers that are not "bad" (as marked in Masters > Questions).
const goodPct = (rows) => (rows.length ? Math.round((rows.filter((r) => !r.is_bad).length * 100) / rows.length) : null);

function monthsIn(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const ymd = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

// GET /customers/:companyId/report?from=2026-09&to=2026-10&site_id=&only=complaints
// from / to are months (default: this month, to = from). At most 12 months.
async function buildCustomerReport(companyId, query = {}) {
  const fromM = monthRange(query.from || query.to);
  const toM = monthRange(query.to || query.from);
  if (fromM.start > toM.start) throw new HttpError(400, "From must be before To");
  if (monthsBetween(fromM.month, toM.month) > MAX_MONTHS) throw new HttpError(400, `Choose at most ${MAX_MONTHS} months`);
  const complaintsOnly = query.only === "complaints";

  const [[customer]] = await pool.query("SELECT id, name FROM companies WHERE id = ?", [String(companyId)]);
  if (!customer) throw new HttpError(404, "Customer not found");
  const siteId = query.site_id ? String(query.site_id) : null;
  if (siteId) {
    const [[s]] = await pool.query("SELECT id FROM sites WHERE id = ? AND company_id = ?", [siteId, customer.id]);
    if (!s) throw new HttpError(400, "That site does not belong to this customer");
  }
  const siteSql = siteId ? "AND s.id = ?" : "";
  const siteParam = siteId ? [siteId] : [];
  const range = [fromM.start, toM.next];

  // Sites that had a service in the range - assigned visits up to today, not cancelled (jobs.company_id is the site).
  const [served] = await pool.query(
    `SELECT s.id, s.name, s.city, COUNT(DISTINCT v.id) AS visits,
            COUNT(DISTINCT DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m')) AS months
     FROM job_visits v JOIN jobs j ON j.id = v.job_id JOIN sites s ON s.id = j.company_id
     WHERE s.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED'
       AND COALESCE(v.completed_at, v.scheduled_date) < CURDATE() + INTERVAL 1 DAY
       AND COALESCE(v.completed_at, v.scheduled_date) >= ? AND COALESCE(v.completed_at, v.scheduled_date) < ? ${siteSql}
     GROUP BY s.id`,
    [customer.id, ...range, ...siteParam]
  );
  // Every service of the customer in the range (same rule), by site then date.
  const [serviceRows] = await pool.query(
    `SELECT v.id, s.id AS site_id, s.name AS site_name, s.city AS site_city, j.id AS job_id, j.code AS job_code, v.status,
            DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m-%d') AS visit_date, v.completed_at,
            COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service,
            (SELECT GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ')
             FROM visit_technicians vt JOIN users u ON u.id = vt.technician_id WHERE vt.visit_id = v.id) AS technicians
     FROM job_visits v JOIN jobs j ON j.id = v.job_id JOIN sites s ON s.id = j.company_id
     WHERE s.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED'
       AND COALESCE(v.completed_at, v.scheduled_date) < CURDATE() + INTERVAL 1 DAY
       AND COALESCE(v.completed_at, v.scheduled_date) >= ? AND COALESCE(v.completed_at, v.scheduled_date) < ? ${siteSql}
     ORDER BY s.name, COALESCE(v.completed_at, v.scheduled_date), j.code`,
    [customer.id, ...range, ...siteParam]
  );
  const services = serviceRows.map((v) => ({
    id: v.id, site_id: v.site_id, site_name: v.site_name, site_city: v.site_city, job_id: v.job_id, job_code: v.job_code,
    date: v.visit_date, completed_at: v.completed_at, service: v.service, technicians: v.technicians, status: v.status,
  }));

  const [calls] = await pool.query(
    `SELECT r.id, r.site_id, s.name AS site_name, s.city AS site_city, r.status, r.result,
            DATE_FORMAT(r.period_month, '%Y-%m') AS month, cu.name AS collector_name
     FROM feedback_requests r JOIN sites s ON s.id = r.site_id LEFT JOIN users cu ON cu.id = r.collector_user_id
     WHERE r.company_id = ? AND r.period_month >= ? AND r.period_month < ? ${siteSql}`,
    [customer.id, ...range, ...siteParam]
  );
  const callIds = calls.map((c) => c.id);
  const [submissions] = callIds.length
    ? await pool.query(
        `SELECT sb.id, sb.request_id, sb.source, sb.spoke_with_name, sb.other_feedback, sb.has_issue, sb.submitted_at,
                c.role AS contact_role, u.name AS collected_by_name
         FROM feedback_submissions sb
         LEFT JOIN contacts c ON c.id = sb.contact_id
         LEFT JOIN users u ON u.id = sb.collected_by_user_id
         WHERE sb.request_id IN (?) ORDER BY sb.submitted_at DESC`,
        [callIds]
      )
    : [[]];
  const subIds = submissions.map((s) => s.id);
  const [responses] = subIds.length
    ? await pool.query(
        "SELECT submission_id, question_id, question_text, option_label, is_bad FROM feedback_responses WHERE submission_id IN (?) ORDER BY id",
        [subIds]
      )
    : [[]];
  const [tickets] = callIds.length
    ? await pool.query(
        `SELECT t.id, t.ticket_number, t.request_id, t.submission_id, t.status, t.priority, t.action, t.issue_summary,
                t.action_due_at, t.closed_at, t.created_at, ou.name AS owner_name
         FROM feedback_tickets t LEFT JOIN users ou ON ou.id = t.action_owner_user_id
         WHERE t.request_id IN (?) ORDER BY t.seq`,
        [callIds]
      )
    : [[]];

  const callById = new Map(calls.map((c) => [c.id, c]));
  const ticketsBySub = new Map();
  for (const t of tickets) {
    const key = t.submission_id || `call:${t.request_id}`;
    if (!ticketsBySub.has(key)) ticketsBySub.set(key, []);
    ticketsBySub.get(key).push(t);
  }
  const ticketView = (t) => ({
    id: t.id, ticket_number: t.ticket_number, status: t.status, priority: t.priority, action: t.action,
    issue_summary: t.issue_summary, owner: t.owner_name, action_due_at: t.action_due_at, closed_at: t.closed_at,
  });

  // One entry per feedback, newest first, grouped by site below.
  const feedback = submissions.map((s) => {
    const call = callById.get(s.request_id);
    const answers = responses.filter((r) => r.submission_id === s.id);
    const raised = ticketsBySub.get(s.id) || [];
    return {
      id: s.id,
      site_id: call.site_id,
      month: call.month,
      date: s.submitted_at,
      given_by: s.spoke_with_name,
      given_by_role: s.contact_role,
      via: s.source,
      collected_by: s.collected_by_name,
      has_issue: Boolean(s.has_issue),
      all_good: answers.length > 0 && !answers.some((a) => a.is_bad),
      bad_answers: answers.filter((a) => a.is_bad).map((a) => ({ question: a.question_text, answer: a.option_label })),
      other_feedback: s.other_feedback,
      tickets: raised.map(ticketView),
    };
  });
  const shown = complaintsOnly ? feedback.filter((f) => f.has_issue || f.tickets.length) : feedback;

  // Sites: every site served or called in the range.
  const siteMap = new Map();
  const siteRow = (id, name, city) => {
    if (!siteMap.has(id)) {
      siteMap.set(id, { id, name, city, visits: 0, months_served: 0, calls_done: 0, not_reached: 0, feedback: 0, complaints: 0, tickets_open: 0, tickets_total: 0, last_feedback: null });
    }
    return siteMap.get(id);
  };
  for (const s of served) Object.assign(siteRow(s.id, s.name, s.city), { visits: Number(s.visits), months_served: Number(s.months) });
  const subsByCall = new Map();
  for (const s of submissions) subsByCall.set(s.request_id, (subsByCall.get(s.request_id) || 0) + 1);
  for (const c of calls) {
    const row = siteRow(c.site_id, c.site_name, c.site_city);
    if (c.status === "DONE") row.calls_done += 1;
    if (c.status === "DONE" && !subsByCall.get(c.id)) row.not_reached += 1;
  }
  for (const f of feedback) {
    const row = siteMap.get(f.site_id);
    row.feedback += 1;
    if (f.has_issue) row.complaints += 1;
    if (!row.last_feedback) row.last_feedback = { date: f.date, given_by: f.given_by };
  }
  for (const t of tickets) {
    const row = siteMap.get(callById.get(t.request_id).site_id);
    row.tickets_total += 1;
    if (t.status !== "CLOSED") row.tickets_open += 1;
  }
  const callOfSub = new Map(submissions.map((s) => [s.id, callById.get(s.request_id)]));
  for (const row of siteMap.values()) {
    row.satisfaction = goodPct(responses.filter((r) => callOfSub.get(r.submission_id)?.site_id === row.id));
  }
  const sites = [...siteMap.values()].sort((a, b) => b.tickets_open - a.tickets_open || b.complaints - a.complaints || String(a.name).localeCompare(String(b.name)));

  // How each question was answered across all the feedback.
  const answerMap = new Map();
  for (const r of responses) {
    if (!answerMap.has(r.question_id)) answerMap.set(r.question_id, { question_id: r.question_id, question: r.question_text, total: 0, options: new Map() });
    const q = answerMap.get(r.question_id);
    q.question = r.question_text;
    q.total += 1;
    const o = q.options.get(r.option_label) || { answer: r.option_label, is_bad: Boolean(r.is_bad), count: 0 };
    o.count += 1;
    q.options.set(r.option_label, o);
  }
  const answers = [...answerMap.values()]
    .sort((a, b) => a.question_id - b.question_id)
    .map((q) => ({ ...q, options: [...q.options.values()], good_pct: goodPct(responses.filter((r) => r.question_id === q.question_id)) }));

  // Month by month: sites served, calls done, feedback, satisfaction, complaints, tickets.
  const months = monthsIn(fromM.month, toM.month).map((m) => {
    const monthCalls = calls.filter((c) => c.month === m);
    const monthSubs = submissions.filter((s) => callOfSub.get(s.id)?.month === m);
    const subIdsOfMonth = new Set(monthSubs.map((s) => s.id));
    return {
      month: m,
      label: monthLabel(m),
      sites_served: new Set(services.filter((v) => v.date?.startsWith(m)).map((v) => v.site_id)).size,
      calls_done: monthCalls.filter((c) => c.status === "DONE").length,
      feedback: monthSubs.length,
      satisfaction: goodPct(responses.filter((r) => subIdsOfMonth.has(r.submission_id))),
      complaints: monthSubs.filter((s) => s.has_issue).length,
      tickets: tickets.filter((t) => callById.get(t.request_id)?.month === m).length,
    };
  });

  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, tickets.filter((t) => t.priority === p).length]));
  const doneCalls = calls.filter((c) => c.status === "DONE");
  const totals = {
    satisfaction: goodPct(responses),
    answers_total: responses.length,
    sites_served: served.length,
    services: services.length,
    services_completed: services.filter((v) => v.status === "COMPLETED").length,
    calls_to_make: served.reduce((n, s) => n + Number(s.months), 0),
    calls_done: doneCalls.length,
    calls_open: calls.length - doneCalls.length,
    feedback_received: submissions.length,
    by_call: submissions.filter((s) => s.source === "CALL").length,
    by_form: submissions.filter((s) => s.source === "FORM").length,
    not_reached: doneCalls.filter((c) => !subsByCall.get(c.id)).length,
    people: new Set(submissions.map((s) => String(s.spoke_with_name || "").trim().toLowerCase()).filter(Boolean)).size,
    complaints: submissions.filter((s) => s.has_issue).length,
    tickets: tickets.length,
    tickets_open: tickets.filter((t) => t.status !== "CLOSED").length,
    tickets_closed: tickets.filter((t) => t.status === "CLOSED").length,
    tickets_by_priority: byPriority,
  };
  // Every complaint: each ticket, plus feedback with an issue where no ticket was raised.
  const ticketed = new Set(tickets.map((t) => t.submission_id).filter(Boolean));
  const badOf = (subId) => responses.filter((r) => r.submission_id === subId && r.is_bad).map((r) => `${r.question_text} ${r.option_label}`);
  const complaints = [
    ...tickets.map((t) => {
      const c = callById.get(t.request_id);
      const sub = submissions.find((x) => x.id === t.submission_id);
      return { ...ticketView(t), site: c.site_name, month: c.month, date: t.created_at, given_by: sub?.spoke_with_name || null, bad_answers: badOf(t.submission_id) };
    }),
    ...submissions.filter((x) => x.has_issue && !ticketed.has(x.id)).map((x) => {
      const c = callById.get(x.request_id);
      return {
        id: x.id, ticket_number: null, status: "NO_TICKET", priority: null, action: null, issue_summary: x.other_feedback,
        owner: null, action_due_at: null, closed_at: null, site: c.site_name, month: c.month, date: x.submitted_at,
        given_by: x.spoke_with_name, bad_answers: badOf(x.id),
      };
    }),
  ]
    .map((c) => ({ ...c, problem: problemText(c.issue_summary, c.bad_answers) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const needsAttention = tickets
    .filter((t) => t.status !== "CLOSED")
    .sort((a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority))
    .map((t) => ({ ...ticketView(t), site: callById.get(t.request_id).site_name }));

  return {
    customer,
    filters: { from: fromM.month, to: toM.month, site_id: siteId, only: complaintsOnly ? "complaints" : "all" },
    period_label: fromM.month === toM.month ? monthLabel(fromM.month) : `${monthLabel(fromM.month)} - ${monthLabel(toM.month)}`,
    totals,
    needs_attention: needsAttention,
    sites,
    months,
    complaints,
    answers,
    feedback_by_site: sites
      .map((s) => ({ site: { id: s.id, name: s.name, city: s.city }, feedback: shown.filter((f) => f.site_id === s.id) }))
      .filter((g) => g.feedback.length),
  };
}

/* ------------------------------------------------------------ files */

const fmtDateTime = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const ticketText = (t) => `${t.ticket_number} · ${PRIORITY_LABELS[t.priority] || t.priority} · ${ACTION_LABELS[t.action] || t.action}${t.owner ? ` (${t.owner})` : ""} · ${STATUS_LABELS[t.status] || t.status}`;
const viaText = (v) => (v === "FORM" ? "Form (WhatsApp)" : "Call");
// The issue text and the bad answers in one line; a bad answer the issue text already has is not repeated.
function problemText(issue, badAnswers) {
  const text = String(issue || "").trim();
  const said = text.toLowerCase();
  const extra = (badAnswers || []).map((a) => String(a).trim()).filter((a) => a && !said.includes(a.toLowerCase()));
  return [text, ...new Set(extra)].filter(Boolean).join("; ");
}

const saidText = (f) => [f.all_good ? "All answers good" : f.bad_answers.map((a) => `${a.question} ${a.answer}`).join("; "), f.other_feedback ? `"${f.other_feedback}"` : ""].filter(Boolean).join(" - ");

// The file version of the report. With "Complaints only" it keeps just the complaints side:
// sites and months counted on complaints, the complaints table and the complaint feedback.
function reportTables(data) {
  const t = data.totals;
  const complaintsOnly = data.filters.only === "complaints";
  const lines = complaintsOnly
    ? [
        `Period: ${data.period_label}${data.filters.site_id ? ` · one site` : ""} · complaints only`,
        `Complaints: ${t.complaints} out of ${t.feedback_received} feedback · Tickets: ${t.tickets} (${t.tickets_open} open, ${t.tickets_closed} closed) · High ${t.tickets_by_priority.HIGH}, Medium ${t.tickets_by_priority.MEDIUM}, Low ${t.tickets_by_priority.LOW}`,
      ]
    : [
        `Period: ${data.period_label}${data.filters.site_id ? ` · one site` : ""}`,
        `Overall satisfaction: ${t.satisfaction === null ? "no answers yet" : `${t.satisfaction}% of ${t.answers_total} answers good`}`,
        `Sites served: ${t.sites_served} · Services: ${t.services} · Calls done: ${t.calls_done} of ${t.calls_to_make} · Feedback received: ${t.feedback_received} (${t.by_call} on call, ${t.by_form} by form) · Not reached: ${t.not_reached}`,
        `Complaints: ${t.complaints} · Tickets: ${t.tickets} (${t.tickets_open} open, ${t.tickets_closed} closed) · High ${t.tickets_by_priority.HIGH}, Medium ${t.tickets_by_priority.MEDIUM}, Low ${t.tickets_by_priority.LOW}`,
      ];
  const pct = (v) => (v === null || v === undefined ? "-" : `${v}%`);
  const lowFill = (v) => (v !== null && v !== undefined && v < 70 ? "FDECEC" : null);
  const byQuestion = {
    title: "Answers by question",
    columns: [
      { header: "Question", width: 46, pdf: 300, value: (r) => r.question },
      { header: "Answers", width: 40, pdf: 300, value: (r) => r.options.map((o) => `${o.answer} ${o.count}`).join("  ·  ") },
      { header: "Responses", width: 11, pdf: 80, value: (r) => r.total },
      { header: "Good %", width: 10, pdf: 100, value: (r) => pct(r.good_pct), fill: (r) => lowFill(r.good_pct) },
    ],
    rows: data.answers,
  };
  const sites = {
    title: "Sites",
    columns: [
      { header: "Site", width: 28, pdf: 160, value: (r) => r.name },
      { header: "Area", width: 16, pdf: 90, value: (r) => r.city || "" },
      { header: "Calls done", width: 10, pdf: 60, value: (r) => r.calls_done },
      { header: "Feedback", width: 10, pdf: 60, value: (r) => r.feedback },
      { header: "Satisfaction", width: 12, pdf: 70, value: (r) => pct(r.satisfaction), fill: (r) => lowFill(r.satisfaction) },
      { header: "Complaints", width: 11, pdf: 65, value: (r) => r.complaints },
      { header: "Open tickets", width: 12, pdf: 65, value: (r) => r.tickets_open, fill: (r) => (r.tickets_open ? "FDECEC" : null) },
      { header: "Last feedback", width: 30, pdf: 210, value: (r) => (r.last_feedback ? `${fmtDateTime(r.last_feedback.date)} · ${r.last_feedback.given_by || ""}` : "") },
    ],
    rows: data.sites,
  };
  const months = {
    title: "Month by month",
    columns: [
      { header: "Month", width: 16, pdf: 140, value: (r) => r.label },
      { header: "Sites served", width: 12, pdf: 100, value: (r) => r.sites_served },
      { header: "Calls done", width: 11, pdf: 100, value: (r) => r.calls_done },
      { header: "Feedback", width: 10, pdf: 100, value: (r) => r.feedback },
      { header: "Satisfaction", width: 12, pdf: 110, value: (r) => pct(r.satisfaction), fill: (r) => lowFill(r.satisfaction) },
      { header: "Complaints", width: 11, pdf: 110, value: (r) => r.complaints },
      { header: "Tickets", width: 10, pdf: 120, value: (r) => r.tickets },
    ],
    rows: data.months,
  };
  const complaints = {
    title: "Complaints",
    columns: [
      { header: "Ticket", width: 11, pdf: 60, value: (r) => r.ticket_number || "No ticket" },
      { header: "Site", width: 20, pdf: 100, value: (r) => r.site },
      { header: "Date", width: 16, pdf: 75, value: (r) => fmtDateTime(r.date) },
      { header: "Problem", width: 50, pdf: 250, value: (r) => r.problem },
      { header: "Priority", width: 9, pdf: 50, value: (r) => (r.priority ? PRIORITY_LABELS[r.priority] : "-") },
      { header: "Next step", width: 22, pdf: 125, value: (r) => (r.action ? `${ACTION_LABELS[r.action] || r.action}${r.owner ? ` (${r.owner})` : ""}` : "-") },
      { header: "Status", width: 14, pdf: 120, value: (r) => (r.status === "NO_TICKET" ? "No ticket needed" : STATUS_LABELS[r.status] || r.status), fill: (r) => (r.status === "ACTION_PENDING" ? "FEF3C7" : null) },
    ],
    rows: data.complaints,
  };
  const rows = data.feedback_by_site.flatMap((g) => g.feedback.map((f) => ({ ...f, site_name: g.site.name })));
  const feedback = {
    title: "All feedback",
    columns: [
      { header: "Site", width: 22, pdf: 95, value: (r) => r.site_name },
      { header: "Date", width: 18, pdf: 80, value: (r) => fmtDateTime(r.date) },
      { header: "Given by", width: 22, pdf: 95, value: (r) => `${r.given_by || ""}${r.given_by_role ? ` (${r.given_by_role})` : ""}` },
      { header: "Via", width: 14, pdf: 55, value: (r) => `${viaText(r.via)}${r.collected_by ? ` · ${r.collected_by}` : ""}` },
      { header: "What they said", width: 60, pdf: 240, value: (r) => saidText(r), fill: (r) => (r.has_issue ? "FDECEC" : null) },
      { header: "Action and status", width: 50, pdf: 215, value: (r) => (r.tickets.length ? r.tickets.map(ticketText).join("\n") : r.has_issue ? "No ticket needed" : "-") },
    ],
    rows,
  };
  if (complaintsOnly) {
    const complaintSites = {
      title: "Sites with complaints",
      columns: [
        { header: "Site", width: 28, pdf: 200, value: (r) => r.name },
        { header: "Area", width: 16, pdf: 120, value: (r) => r.city || "" },
        { header: "Feedback", width: 10, pdf: 80, value: (r) => r.feedback },
        { header: "Complaints", width: 11, pdf: 90, value: (r) => r.complaints, fill: (r) => (r.complaints ? "FDECEC" : null) },
        { header: "Tickets", width: 10, pdf: 80, value: (r) => r.tickets_total },
        { header: "Open tickets", width: 12, pdf: 90, value: (r) => r.tickets_open, fill: (r) => (r.tickets_open ? "FDECEC" : null) },
        { header: "Complaint rate", width: 13, pdf: 120, value: (r) => (r.feedback ? `${Math.round((r.complaints * 100) / r.feedback)}%` : "-") },
      ],
      rows: data.sites.filter((x) => x.complaints || x.tickets_total),
    };
    const complaintMonths = {
      title: "Complaints by month",
      columns: [
        { header: "Month", width: 16, pdf: 200, value: (r) => r.label },
        { header: "Feedback", width: 10, pdf: 140, value: (r) => r.feedback },
        { header: "Complaints", width: 11, pdf: 140, value: (r) => r.complaints, fill: (r) => (r.complaints ? "FDECEC" : null) },
        { header: "Tickets", width: 10, pdf: 140, value: (r) => r.tickets },
        { header: "Complaint rate", width: 13, pdf: 160, value: (r) => (r.feedback ? `${Math.round((r.complaints * 100) / r.feedback)}%` : "-") },
      ],
      rows: data.months,
    };
    return { title: `Customer complaints report - ${data.customer.name}`, lines, sections: [complaints, complaintSites, complaintMonths, { ...feedback, title: "Complaint feedback" }] };
  }
  return { title: `Customer feedback report - ${data.customer.name}`, lines, sections: [byQuestion, sites, months, complaints, feedback] };
}

async function renderXlsx(doc) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";
  doc.sections.forEach((section, i) => {
    const ws = wb.addWorksheet(section.title.slice(0, 31));
    ws.columns = section.columns.map((c) => ({ width: c.width }));
    if (i === 0) {
      ws.addRow([doc.title]).font = { bold: true, size: 14 };
      for (const line of doc.lines) ws.addRow([line]).font = { color: { argb: "FF475569" } };
      ws.addRow([`Generated: ${fmtDateTime(new Date())}`]).font = { italic: true, color: { argb: "FF64748B" } };
      ws.addRow([]);
    }
    const header = ws.addRow(section.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
    });
    for (const r of section.rows) {
      const row = ws.addRow(section.columns.map((c) => c.value(r)));
      row.alignment = { vertical: "top", wrapText: true };
      section.columns.forEach((c, ci) => {
        const fill = c.fill?.(r);
        if (fill) row.getCell(ci + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
      });
    }
    ws.views = [{ state: "frozen", ySplit: header.number }];
    ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: section.columns.length } };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Tables with wrapped text: each row is as tall as its tallest cell.
function renderPdf(doc) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", layout: "landscape", margin: 30, bufferPages: true });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    const left = 30;
    const bottom = () => pdf.page.height - 40;

    pdf.font("Helvetica-Bold").fontSize(15).fillColor("#0f172a").text(doc.title, left, 30);
    pdf.font("Helvetica").fontSize(8.5).fillColor("#475569");
    for (const line of doc.lines) pdf.text(line, { width: pdf.page.width - 60 });
    let y = pdf.y + 8;

    for (const section of doc.sections.filter((s) => s.columns.every((c) => c.pdf))) {
      const cols = section.columns;
      const cellH = (values, bold) =>
        Math.max(14, ...cols.map((c, i) => pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).heightOfString(String(values[i] ?? ""), { width: c.pdf - 6 }) + 7));
      const drawRow = (values, { bold = false, bg = null, fills = [] } = {}) => {
        const h = cellH(values, bold);
        if (y + h > bottom()) { pdf.addPage(); y = 30; if (!bold) drawRow(cols.map((c) => c.header), { bold: true, bg: "E0E7FF" }); }
        let x = left;
        cols.forEach((c, i) => {
          const fill = fills[i] || bg;
          if (fill) pdf.rect(x, y, c.pdf, h).fill(`#${fill}`);
          pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor("#0f172a").text(String(values[i] ?? ""), x + 3, y + 4, { width: c.pdf - 6 });
          x += c.pdf;
        });
        pdf.moveTo(left, y + h).lineTo(x, y + h).lineWidth(0.4).strokeColor("#cbd5e1").stroke();
        y += h;
      };
      if (y + 50 > bottom()) { pdf.addPage(); y = 30; }
      pdf.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(section.title, left, y);
      y = pdf.y + 4;
      drawRow(cols.map((c) => c.header), { bold: true, bg: "E0E7FF" });
      if (!section.rows.length) {
        pdf.font("Helvetica").fontSize(8.5).fillColor("#64748b").text("Nothing for these filters.", left, y + 4);
        y = pdf.y + 4;
      }
      for (const r of section.rows) drawRow(cols.map((c) => c.value(r)), { fills: cols.map((c) => c.fill?.(r) || null) });
      y += 14;
    }

    const generated = `Generated ${fmtDateTime(new Date())}`;
    const range = pdf.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      pdf.switchToPage(range.start + i);
      const margin = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      pdf.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(`BestServe - ${doc.title}   |   ${generated}   |   Page ${i + 1} of ${range.count}`, left, pdf.page.height - 25, {
        width: pdf.page.width - 60, align: "center", lineBreak: false,
      });
      pdf.page.margins.bottom = margin;
    }
    pdf.end();
  });
}

const CONTENT_TYPES = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
const safeName = (s) => String(s || "customer").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "customer";

// GET /customers/:companyId/report/export?format=pdf|xlsx&... (same filters as the report)
async function exportCustomerReport(companyId, query = {}) {
  const format = query.format;
  if (format !== "pdf" && format !== "xlsx") throw new HttpError(400, "format must be pdf or xlsx");
  const data = await buildCustomerReport(companyId, query);
  const doc = reportTables(data);
  return {
    buffer: format === "pdf" ? await renderPdf(doc) : await renderXlsx(doc),
    filename: `${data.filters.only === "complaints" ? "complaints" : "feedback"}-${safeName(data.customer.name)}-${data.filters.from}${data.filters.to !== data.filters.from ? `-to-${data.filters.to}` : ""}.${format}`,
    contentType: CONTENT_TYPES[format],
  };
}

// GET /tickets/export?format=xlsx&... - the desk list (same filters, no paging, up to 5000 rows).
async function exportTickets(req) {
  const query = req.query || {};
  if (query.format !== "xlsx") throw new HttpError(400, "format must be xlsx");
  const where = [];
  const params = [];
  if (!isDesk(req)) { where.push("t.raised_by = ?"); params.push(req.user.id); }
  const statuses = csvOf(query.status, [...TICKET_STATUSES, "OPEN"], "status").map((s) => (s === "OPEN" ? "ACTION_PENDING" : s));
  if (statuses.length) { where.push("t.status IN (?)"); params.push([...new Set(statuses)]); }
  const priorities = csvOf(query.priority, PRIORITIES, "priority");
  if (priorities.length) { where.push("t.priority IN (?)"); params.push(priorities); }
  if (query.company_id) { where.push("t.company_id = ?"); params.push(String(query.company_id)); }
  if (query.site_id) { where.push("t.site_id = ?"); params.push(String(query.site_id)); }
  if (query.month) { where.push("t.period_month = ?"); params.push(monthRange(query.month).start); }
  const from = optionalDate(query.from, "From");
  const to = optionalDate(query.to, "To");
  if (from) { where.push("t.created_at >= ?"); params.push(`${from} 00:00:00`); }
  if (to) { where.push("t.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(to); }
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) { where.push("(t.ticket_number LIKE ? OR co.name LIKE ? OR s.name LIKE ?)"); params.push(likeOf(q), likeOf(q), likeOf(q)); }

  const [rows] = await pool.query(
    `SELECT t.ticket_number, t.status, t.priority, t.action, t.issue_summary, t.action_due_at, t.created_at, t.closed_at, t.close_note,
            DATE_FORMAT(t.period_month, '%Y-%m') AS month, co.name AS customer, s.name AS site, t.service_label,
            ou.name AS owner, rb.name AS raised_by, tu.name AS technician,
            (SELECT GROUP_CONCAT(CONCAT(r.question_text, ' ', r.option_label) SEPARATOR '; ')
             FROM feedback_responses r WHERE r.submission_id = t.submission_id AND r.is_bad = 1) AS bad_answers,
            (SELECT sb.spoke_with_name FROM feedback_submissions sb WHERE sb.id = t.submission_id) AS given_by
     FROM feedback_tickets t
     JOIN companies co ON co.id = t.company_id JOIN sites s ON s.id = t.site_id
     LEFT JOIN users ou ON ou.id = t.action_owner_user_id
     LEFT JOIN users rb ON rb.id = t.raised_by
     LEFT JOIN users tu ON tu.id = t.technician_user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY t.created_at DESC LIMIT 5000`,
    params
  );
  const doc = {
    title: "Feedback tickets",
    lines: [`${rows.length} ticket(s)`],
    sections: [{
      title: "Tickets",
      columns: [
        { header: "Ticket", width: 11, value: (r) => r.ticket_number },
        { header: "Raised", width: 18, value: (r) => fmtDateTime(r.created_at) },
        { header: "Month", width: 9, value: (r) => r.month },
        { header: "Customer", width: 26, value: (r) => r.customer },
        { header: "Site", width: 22, value: (r) => r.site },
        { header: "Priority", width: 9, value: (r) => PRIORITY_LABELS[r.priority], fill: (r) => (r.priority === "HIGH" ? "FDECEC" : null) },
        { header: "Status", width: 14, value: (r) => STATUS_LABELS[r.status] },
        { header: "Action", width: 22, value: (r) => ACTION_LABELS[r.action] },
        { header: "Owner", width: 18, value: (r) => r.owner || "" },
        { header: "Resolve by", width: 16, value: (r) => fmtDateTime(r.action_due_at) },
        { header: "Issue", width: 40, value: (r) => problemText(r.issue_summary, r.bad_answers ? r.bad_answers.split("; ") : []) },
        { header: "Given by", width: 18, value: (r) => r.given_by || "" },
        { header: "Service", width: 26, value: (r) => r.service_label || "" },
        { header: "Technician", width: 18, value: (r) => r.technician || "" },
        { header: "Raised by", width: 18, value: (r) => r.raised_by || "" },
        { header: "Closed", width: 18, value: (r) => fmtDateTime(r.closed_at) },
        { header: "Closing note", width: 30, value: (r) => r.close_note || "" },
      ],
      rows,
    }],
  };
  return { buffer: await renderXlsx(doc), filename: `feedback-tickets-${ymd(new Date())}.xlsx`, contentType: CONTENT_TYPES.xlsx };
}

module.exports = { buildCustomerReport, exportCustomerReport, exportTickets };
