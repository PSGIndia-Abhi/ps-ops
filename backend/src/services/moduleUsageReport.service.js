const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { pool } = require("../../db");
const { localDate } = require("../utils/userActivity");

// ---------------------------------------------------------------------------
// Module report (admin -> User Activity -> Module report): for every part of the
// system, who can use it (accounts in its roles), how many of them actually used
// the system in the chosen days (user_daily_activity), and how much work it holds -
// assigned / open / completed. Each module's figures are independent: a table that
// is not there yet (a module not set up on this database) shows as "not set up"
// instead of failing the whole report. Downloads (PDF / Excel) carry the module
// figures only, never the list of users.
// ---------------------------------------------------------------------------

class ModuleReportInputError extends Error {}

const PERIODS = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days", all: "All time" };

// The org-hierarchy designations that work in Task Management (frontend/src/pages/taskpro/access.js).
const TASK_ROLES = [
  "branch_admin", "Managing Director", "Personal Assistant", "Technical Head", "Technical Lead", "Technical Team",
  "Marketing Head", "Marketing Executive", "Sales Head", "Operations Head", "Operations Manager",
  "Service Coordinator", "Quality Head", "Accounts Head", "Accounts Executive", "Collection Executive", "Admin Executive",
];
// Lead Management's own work lives in work_tasks too; Task Management's figures leave it out.
const LEAD_TASK_TYPES = ["LEAD_MEETING", "LEAD_FOLLOW_UP", "PERSONAL_REMINDER"];

/** A count, or null when the module's table/column is not on this database. */
async function count(sql, params = []) {
  try {
    const [[row]] = await pool.query(sql, params);
    return Number(row?.n) || 0;
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE" || err?.code === "ER_BAD_FIELD_ERROR") return null;
    throw err;
  }
}

/** "AND <col> within the chosen days" with its parameters; nothing for all time. `to` is inclusive. */
const within = (col, range) =>
  range.from
    ? { sql: ` AND ${col} >= ? AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`, params: [range.from, range.to] }
    : { sql: "", params: [] };

// Each module: who uses it (roles) and its work figures. A figure: { label, value, tone? }.
// Assigned / added / completed count within the chosen days; "open" / "unpaid" / "overdue" are as of now.
const MODULES = [
  {
    key: "field_service",
    name: "Field Service - Jobs & Visits",
    description: "Bookings, jobs and technician visits (supervisors and technicians).",
    roles: ["supervisor", "technician"],
    async work(range) {
      const c = within("created_at", range);
      const done = within("completed_at", range);
      return [
        { label: "Jobs assigned", value: await count(`SELECT COUNT(*) n FROM jobs WHERE status <> 'CANCELED'${c.sql}`, c.params) },
        { label: "Open now", value: await count("SELECT COUNT(*) n FROM jobs WHERE status IN ('CREATED','NOT_STARTED','IN_PROGRESS','PAUSED')"), tone: "warn" },
        { label: "Completed", value: await count(`SELECT COUNT(*) n FROM jobs WHERE status = 'COMPLETED'${done.sql}`, done.params), tone: "ok" },
        { label: "Visits scheduled", value: await count(`SELECT COUNT(*) n FROM job_visits WHERE status <> 'CANCELED'${c.sql}`, c.params) },
      ];
    },
  },
  {
    key: "lead_management",
    name: "Lead Management (Commercial)",
    description: "Commercial leads: providers, telecallers, sales executives and the sales manager.",
    roles: ["lead_provider", "telecaller", "sales_manager", "commercial_sales", "Sales Executive"],
    async work(range) {
      const c = within("created_at", range);
      return [
        { label: "Leads added", value: await count(`SELECT COUNT(*) n FROM crm_leads WHERE lead_type = 'commercial'${c.sql}`, c.params) },
        {
          label: "Open leads",
          value: await count("SELECT COUNT(*) n FROM crm_leads WHERE lead_type = 'commercial' AND COALESCE(pipeline_stage,'NEW') NOT IN ('WON','CONVERTED','LOST','NOT_GENUINE','CANCELLED')"),
          tone: "warn",
        },
        { label: "Converted", value: await count(`SELECT COUNT(*) n FROM crm_leads WHERE lead_type = 'commercial' AND pipeline_stage IN ('WON','CONVERTED')${c.sql}`, c.params), tone: "ok" },
        { label: "Meetings", value: await count(`SELECT COUNT(*) n FROM crm_lead_meetings WHERE status <> 'CANCELLED'${c.sql}`, c.params) },
        { label: "Follow-ups", value: await count(`SELECT COUNT(*) n FROM work_tasks WHERE task_type = 'LEAD_FOLLOW_UP'${c.sql}`, c.params) },
      ];
    },
  },
  {
    key: "residential_crm",
    name: "Residential CRM (Sales app)",
    description: "Residential leads and payments from the sales and marketing team.",
    roles: ["sales", "marketing"],
    async work(range) {
      const c = within("created_at", range);
      return [
        { label: "Leads added", value: await count(`SELECT COUNT(*) n FROM crm_leads WHERE COALESCE(lead_type,'residential') <> 'commercial'${c.sql}`, c.params) },
        { label: "Converted", value: await count(`SELECT COUNT(*) n FROM crm_leads WHERE COALESCE(lead_type,'residential') <> 'commercial' AND lead_status = 'converted'${c.sql}`, c.params), tone: "ok" },
      ];
    },
  },
  {
    key: "task_management",
    name: "Task Management",
    description: "Tasks given across the org hierarchy (lead follow-ups, meetings and reminders not included).",
    roles: TASK_ROLES,
    async work(range) {
      const own = "(task_type IS NULL OR task_type NOT IN (?))";
      const c = within("created_at", range);
      const done = within("completed_at", range);
      return [
        { label: "Tasks assigned", value: await count(`SELECT COUNT(*) n FROM work_tasks WHERE ${own}${c.sql}`, [LEAD_TASK_TYPES, ...c.params]) },
        { label: "Open now", value: await count(`SELECT COUNT(*) n FROM work_tasks WHERE ${own} AND status IN ('OPEN','IN_PROGRESS','PAUSED')`, [LEAD_TASK_TYPES]), tone: "warn" },
        { label: "Overdue", value: await count(`SELECT COUNT(*) n FROM work_tasks WHERE ${own} AND status IN ('OPEN','IN_PROGRESS','PAUSED') AND due_date < CURDATE()`, [LEAD_TASK_TYPES]), tone: "bad" },
        { label: "Completed", value: await count(`SELECT COUNT(*) n FROM work_tasks WHERE ${own} AND status = 'COMPLETED'${done.sql}`, [LEAD_TASK_TYPES, ...done.params]), tone: "ok" },
      ];
    },
  },
  {
    key: "accounts",
    name: "Payments & Accounts",
    description: "Invoices, payments received and payment follow-ups (accounts and collection team).",
    roles: ["accountant", "Collection Executive", "Accounts Head", "Accounts Executive"],
    async work(range) {
      const c = within("created_at", range);
      return [
        { label: "Invoices added", value: await count(`SELECT COUNT(*) n FROM invoices WHERE status <> 'CANCELLED'${c.sql}`, c.params) },
        { label: "Unpaid now", value: await count("SELECT COUNT(*) n FROM invoices WHERE status IN ('PENDING','PARTIAL','OVERDUE')"), tone: "warn" },
        { label: "Payments recorded", value: await count(`SELECT COUNT(*) n FROM payments WHERE status = 'POSTED'${c.sql}`, c.params), tone: "ok" },
        { label: "Follow-ups open", value: await count("SELECT COUNT(*) n FROM tasks WHERE status = 'OPEN'") },
      ];
    },
  },
  {
    key: "brigade",
    name: "Brigade",
    description: "Brigade Group bookings, POs and tax invoices (Brigade executives).",
    roles: ["brigade_executive"],
    async work(range) {
      const b = within("bd.created_at", range);
      const done = within("j.completed_at", range);
      const inv = within("created_at", range);
      const jobs = (status) => `SELECT COUNT(*) n FROM jobs j JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id WHERE ${status}`;
      return [
        { label: "Services booked", value: await count(`${jobs("j.status <> 'CANCELED'")}${b.sql}`, b.params) },
        { label: "Open now", value: await count(jobs("j.status IN ('CREATED','NOT_STARTED','IN_PROGRESS','PAUSED')")), tone: "warn" },
        { label: "Completed", value: await count(`${jobs("j.status = 'COMPLETED'")}${done.sql}`, done.params), tone: "ok" },
        { label: "Invoices issued", value: await count(`SELECT COUNT(*) n FROM brigade_invoices WHERE 1=1${inv.sql}`, inv.params) },
      ];
    },
  },
];

// ---- the chosen days -------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

/**
 * The days the report covers: a calendar range (?from=&to=, both inclusive) or a preset
 * (?period=7|30|90|all, default 30). Returns { key, label, from, to } - from/to null for all time.
 */
function readRange(query) {
  const today = localDate(new Date());
  if (query.from || query.to) {
    const from = String(query.from || "");
    const to = String(query.to || query.from || "");
    if (!isDate(from) || !isDate(to)) throw new ModuleReportInputError("Choose valid From and To dates");
    if (from > to) throw new ModuleReportInputError("The From date must be on or before the To date");
    if (from > today) throw new ModuleReportInputError("The From date cannot be in the future");
    const end = to > today ? today : to;
    return { key: "custom", label: from === end ? fmtDay(from) : `${fmtDay(from)} - ${fmtDay(end)}`, from, to: end };
  }
  const key = query.period === undefined || query.period === "" ? "30" : String(query.period);
  if (!PERIODS[key]) throw new ModuleReportInputError("period must be 7, 30, 90 or all");
  if (key === "all") return { key, label: PERIODS[key], from: null, to: null };
  const d = new Date();
  d.setDate(d.getDate() - (Number(key) - 1));
  return { key, label: PERIODS[key], from: localDate(d), to: today };
}

/**
 * Everyone in these roles who can sign in: the last day they used the system, and whether they
 * used it within the chosen days.
 */
async function usersIn(roles, range) {
  const activeSql = range.from
    ? "MAX(CASE WHEN a.activity_date BETWEEN ? AND ? THEN 1 ELSE 0 END)"
    : "MAX(CASE WHEN a.activity_date IS NOT NULL THEN 1 ELSE 0 END)";
  const sql = (withActivity) => `
    SELECT u.id, u.name, u.email, r.name AS role,
           ${withActivity ? "DATE_FORMAT(MAX(a.activity_date), '%Y-%m-%d')" : "NULL"} AS last_active,
           ${withActivity ? activeSql : "0"} AS active
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ${withActivity ? "LEFT JOIN user_daily_activity a ON a.user_id = u.id" : ""}
     WHERE COALESCE(u.is_active, 1) = 1
       AND (u.invite_status IS NULL OR u.invite_status <> 'INVITED')
       AND r.name IN (?)
     GROUP BY u.id, u.name, u.email, r.name
     ORDER BY last_active IS NULL, last_active DESC, u.name ASC`;
  const toUsers = (rows) => rows.map((u) => ({ ...u, active: Number(u.active) === 1 }));
  try {
    const [rows] = await pool.query(sql(true), range.from ? [range.from, range.to, roles] : [roles]);
    return toUsers(rows);
  } catch (err) {
    // Activity not recorded on this database yet (migration 20261026 not run): list the users
    // with no activity rather than failing the whole report.
    if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
    const [rows] = await pool.query(sql(false), [roles]);
    return toUsers(rows);
  }
}

/** GET /api/user-activity/modules?period=7|30|90|all  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD */
async function buildModuleReport(query) {
  const range = readRange(query);
  const modules = [];
  for (const m of MODULES) {
    const users = await usersIn(m.roles, range);
    const work = await m.work(range);
    modules.push({
      key: m.key,
      name: m.name,
      description: m.description,
      roles: m.roles,
      set_up: work.some((w) => w.value !== null),
      users: { with_access: users.length, active: users.filter((u) => u.active).length, list: users },
      work,
    });
  }
  return {
    period: range,
    totals: {
      modules: modules.length,
      in_use: modules.filter((m) => m.users.active > 0).length,
      users: new Set(modules.flatMap((m) => m.users.list.map((u) => u.id))).size,
      active_users: new Set(modules.flatMap((m) => m.users.list.filter((u) => u.active).map((u) => u.id))).size,
    },
    modules,
  };
}

// ---- downloads (module figures only - no list of users) -----------------------

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const value = (w) => (w.value === null ? "-" : w.value);
const fmtNow = () => {
  const d = new Date();
  return `${fmtDay(localDate(d))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const NOTE = "Used it = signed in or used the website or an app in these days. Assigned / added / completed are for these days; open, unpaid and overdue are as of now. Admins are not counted.";

async function renderXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";
  const ws = wb.addWorksheet("Module report");
  ws.columns = [{ width: 34 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 70 }];

  ws.addRow(["Module report"]).font = { bold: true, size: 14 };
  ws.addRow([`Days: ${report.period.label}`]).font = { color: { argb: "FF475569" } };
  const t = report.totals;
  ws.addRow([`Modules: ${t.modules}   |   In use: ${t.in_use}   |   Users with access: ${t.users}   |   Active users: ${t.active_users}`]).font = { color: { argb: "FF475569" } };
  ws.addRow([`Generated: ${fmtNow()}`]).font = { italic: true, color: { argb: "FF64748B" } };
  ws.addRow([]);

  const header = ws.addRow(["Module", "Users with access", "Used it", "% active", "Work"]);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
  for (const m of report.modules) {
    const row = ws.addRow([
      m.set_up ? m.name : `${m.name} (not set up)`,
      m.users.with_access,
      m.users.active,
      `${pct(m.users.active, m.users.with_access)}%`,
      m.work.map((w) => `${w.label}: ${value(w)}`).join("   |   "),
    ]);
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };
  }

  // The same figures one per row, for filtering and charts.
  const fig = wb.addWorksheet("Figures");
  fig.columns = [{ header: "Module", width: 34 }, { header: "Figure", width: 22 }, { header: "Value", width: 12 }];
  fig.getRow(1).font = { bold: true };
  for (const m of report.modules) {
    fig.addRow([m.name, "Users with access", m.users.with_access]);
    fig.addRow([m.name, "Used it", m.users.active]);
    for (const w of m.work) fig.addRow([m.name, w.label, w.value === null ? "" : w.value]);
  }

  ws.addRow([]);
  ws.addRow([NOTE]).font = { italic: true, color: { argb: "FF64748B" } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function renderPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const L = 36;
    const W = doc.page.width - 72;
    const t = report.totals;

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text("Module report", L, 36);
    doc.font("Helvetica").fontSize(9.5).fillColor("#475569").text(`Days: ${report.period.label}`, L, doc.y + 2);
    doc.text(`Modules: ${t.modules}   |   In use: ${t.in_use}   |   Users with access: ${t.users}   |   Active users: ${t.active_users}`);
    doc.moveDown(0.8);

    for (const m of report.modules) {
      const boxH = 92;
      let y = doc.y;
      if (y + boxH > doc.page.height - 60) {
        doc.addPage();
        y = 36;
      }
      doc.roundedRect(L, y, W, boxH, 6).lineWidth(0.6).strokeColor("#cbd5e1").stroke();
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(m.set_up ? m.name : `${m.name} (not set up)`, L + 12, y + 10, { width: W - 24 });
      doc.font("Helvetica").fontSize(8.5).fillColor("#64748b").text(m.description, L + 12, y + 25, { width: W - 24, lineBreak: false, ellipsis: true });
      doc.font("Helvetica").fontSize(9).fillColor("#0f172a").text(
        `Users with access: ${m.users.with_access}     Used it: ${m.users.active}  (${pct(m.users.active, m.users.with_access)}%)`,
        L + 12,
        y + 40,
        { width: W - 24 }
      );

      // The work figures as small boxes in one row.
      const n = Math.max(m.work.length, 1);
      const gap = 6;
      const bw = (W - 24 - gap * (n - 1)) / n;
      m.work.forEach((w, i) => {
        const bx = L + 12 + i * (bw + gap);
        doc.roundedRect(bx, y + 55, bw, 28, 4).fill("#f1f5f9");
        const color = w.tone === "ok" ? "#15803d" : w.tone === "warn" ? "#b45309" : w.tone === "bad" ? "#dc2626" : "#0f172a";
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(color).text(String(value(w)), bx + 6, y + 58, { width: bw - 12, lineBreak: false });
        doc.font("Helvetica").fontSize(7.2).fillColor("#64748b").text(w.label, bx + 6, y + 72, { width: bw - 12, lineBreak: false, ellipsis: true });
      });
      doc.y = y + boxH + 10;
    }

    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#64748b").text(NOTE, L, doc.y + 4, { width: W });

    const generated = `Generated ${fmtNow()}`;
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(
        `BestServe - Module report (${report.period.label})   |   ${generated}   |   Page ${i + 1} of ${pages.count}`,
        L,
        doc.page.height - 24,
        { width: W, align: "center", lineBreak: false }
      );
      doc.page.margins.bottom = margin;
    }
    doc.end();
  });
}

/** GET /api/user-activity/modules/export?format=pdf|xlsx  (+ the same days as the report) */
async function exportModuleReport(format, query) {
  if (format !== "pdf" && format !== "xlsx") throw new ModuleReportInputError("format must be pdf or xlsx");
  const report = await buildModuleReport(query);
  const days = report.period.from ? (report.period.from === report.period.to ? report.period.from : `${report.period.from}_to_${report.period.to}`) : "all-time";
  return {
    buffer: format === "pdf" ? await renderPdf(report) : await renderXlsx(report),
    filename: `module-report-${days}.${format}`,
    contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

module.exports = { ModuleReportInputError, buildModuleReport, exportModuleReport };
