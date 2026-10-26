const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { pool } = require("../../db");
const { PLATFORMS, PLATFORM_LABELS, localDate } = require("../utils/userActivity");

// ---------------------------------------------------------------------------
// Admin User Activity report: the three views (today, day-wise, login history)
// and their PDF / Excel exports. Every view is built once as a table
// ({ title, lines, columns, rows }) that both the page and the files use.
// ---------------------------------------------------------------------------

const MAX_RANGE_DAYS = 31;
const MAX_LOGIN_ROWS = 5000;

const PLATFORM_SHORT = { web: "W", android_app: "A", old_android_app: "O" };
const LEGEND = "W = Website, A = BestServe App, O = Old Android App";

const FAILURE_LABELS = {
  unknown_email: "Unknown email",
  not_activated: "Account not activated",
  inactive: "Account inactive",
  wrong_password: "Wrong password",
  error: "Server error",
};

class ReportInputError extends Error {}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function readFilters(query, { range }) {
  const today = localDate();
  const platform = query.platform || "";
  if (platform && !PLATFORMS.includes(platform)) throw new ReportInputError("Unknown app filter");
  const role = typeof query.role === "string" ? query.role.trim() : "";
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";

  if (!range) {
    const date = query.date || today;
    if (!isValidDate(date)) throw new ReportInputError("date must be a valid date (YYYY-MM-DD)");
    return { date, platform, role, search };
  }
  const to = query.to || today;
  const from = query.from || addDays(to, -6);
  if (!isValidDate(from)) throw new ReportInputError("from must be a valid date (YYYY-MM-DD)");
  if (!isValidDate(to)) throw new ReportInputError("to must be a valid date (YYYY-MM-DD)");
  if (to < from) throw new ReportInputError("to cannot be before from");
  if (addDays(from, MAX_RANGE_DAYS - 1) < to) throw new ReportInputError(`Pick at most ${MAX_RANGE_DAYS} days`);
  return { from, to, platform, role, search };
}

// ---- formatting (server local time, i.e. IST) ------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
function fmtTime(d) {
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}
function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function fmtDateTime(d) {
  return d ? `${fmtDay(localDate(d))} ${fmtTime(d)}` : "";
}
function filterLine(f) {
  const period = f.date ? fmtDay(f.date) : `${fmtDay(f.from)} to ${fmtDay(f.to)}`;
  return `${f.date ? "Date" : "Period"}: ${period}   |   App: ${f.platform ? PLATFORM_LABELS[f.platform] : "All"}   |   Role: ${f.role || "All"}`;
}

// ---- data ------------------------------------------------------------------

// Everyone who can sign in: active accounts whose invite has been accepted.
async function loadUsers(role) {
  const params = [];
  let sql = `
    SELECT u.id, u.name, u.email, r.name AS role, b.name AS branch
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN branches b ON b.id = u.branch_id
    WHERE COALESCE(u.is_active, 1) = 1
      AND (u.invite_status IS NULL OR u.invite_status <> 'INVITED')`;
  if (role) {
    sql += " AND r.name = ?";
    params.push(role);
  }
  sql += " ORDER BY u.name";
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function loadRoles() {
  const [rows] = await pool.query("SELECT name FROM roles ORDER BY name");
  return rows.map((r) => r.name);
}

async function buildToday(query) {
  const f = readFilters(query, { range: false });
  const users = await loadUsers(f.role);

  const actParams = [f.date];
  let actSql = `SELECT user_id, platform, first_seen_at, last_seen_at FROM user_daily_activity WHERE activity_date = ?`;
  if (f.platform) {
    actSql += " AND platform = ?";
    actParams.push(f.platform);
  }
  const [activity] = await pool.query(actSql, actParams);

  const loginParams = [f.date, f.date];
  let loginSql = `
    SELECT user_id, SUM(success = 1) AS logins, SUM(success = 0) AS failed
    FROM user_login_events
    WHERE user_id IS NOT NULL AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`;
  if (f.platform) {
    loginSql += " AND platform = ?";
    loginParams.push(f.platform);
  }
  loginSql += " GROUP BY user_id";
  const [logins] = await pool.query(loginSql, loginParams);

  const actByUser = new Map();
  for (const a of activity) {
    const key = String(a.user_id);
    if (!actByUser.has(key)) actByUser.set(key, []);
    actByUser.get(key).push(a);
  }
  const loginsByUser = new Map(logins.map((l) => [String(l.user_id), l]));

  const byPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, 0]));
  let totalLogins = 0;
  let totalFailed = 0;

  const rows = users.map((u) => {
    const acts = actByUser.get(String(u.id)) || [];
    const l = loginsByUser.get(String(u.id));
    const platforms = PLATFORMS.filter((p) => acts.some((a) => a.platform === p));
    platforms.forEach((p) => byPlatform[p]++);
    const first = acts.length ? new Date(Math.min(...acts.map((a) => new Date(a.first_seen_at)))) : null;
    const last = acts.length ? new Date(Math.max(...acts.map((a) => new Date(a.last_seen_at)))) : null;
    const loginCount = Number(l?.logins || 0);
    const failedCount = Number(l?.failed || 0);
    totalLogins += loginCount;
    totalFailed += failedCount;
    return {
      id: String(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      branch: u.branch || "",
      active: acts.length > 0,
      platforms,
      first_seen_at: first,
      last_seen_at: last,
      logins: loginCount,
      failed_logins: failedCount,
    };
  });

  // Active people first, then by name.
  rows.sort((a, b) => Number(b.active) - Number(a.active) || String(a.name).localeCompare(String(b.name)));

  const active = rows.filter((r) => r.active).length;
  const totals = {
    users: rows.length,
    active,
    inactive: rows.length - active,
    by_platform: byPlatform,
    logins: totalLogins,
    failed_logins: totalFailed,
  };
  return { filters: f, totals, rows };
}

async function buildDaywise(query) {
  const f = readFilters(query, { range: true });
  const users = await loadUsers(f.role);
  const dates = [];
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) dates.push(d);

  const params = [f.from, f.to];
  let sql = `SELECT user_id, activity_date, platform FROM user_daily_activity WHERE activity_date BETWEEN ? AND ?`;
  if (f.platform) {
    sql += " AND platform = ?";
    params.push(f.platform);
  }
  const [activity] = await pool.query(sql, params);

  const byUser = new Map(); // user -> date -> Set(platform)
  for (const a of activity) {
    const key = String(a.user_id);
    const day = a.activity_date instanceof Date ? localDate(a.activity_date) : String(a.activity_date).slice(0, 10);
    if (!byUser.has(key)) byUser.set(key, {});
    const days = byUser.get(key);
    (days[day] ||= new Set()).add(a.platform);
  }

  const activePerDay = Object.fromEntries(dates.map((d) => [d, 0]));
  const rows = users.map((u) => {
    const raw = byUser.get(String(u.id)) || {};
    const days = {};
    for (const d of dates) {
      if (raw[d]) {
        days[d] = PLATFORMS.filter((p) => raw[d].has(p));
        activePerDay[d]++;
      }
    }
    return {
      id: String(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      branch: u.branch || "",
      days,
      active_days: Object.keys(days).length,
    };
  });
  rows.sort((a, b) => b.active_days - a.active_days || String(a.name).localeCompare(String(b.name)));

  return { filters: f, dates, active_per_day: activePerDay, rows };
}

async function buildLogins(query) {
  const f = readFilters(query, { range: true });
  const status = query.status === "success" || query.status === "failed" ? query.status : "";
  const params = [f.from, f.to];
  let sql = `
    SELECT e.id, e.created_at, e.email, e.platform, e.success, e.failure_reason, e.ip_address, e.user_agent,
           u.name, r.name AS role
    FROM user_login_events e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE e.created_at >= ? AND e.created_at < DATE_ADD(?, INTERVAL 1 DAY)`;
  if (f.platform) {
    sql += " AND e.platform = ?";
    params.push(f.platform);
  }
  if (f.role) {
    sql += " AND r.name = ?";
    params.push(f.role);
  }
  if (status) sql += status === "success" ? " AND e.success = 1" : " AND e.success = 0";
  if (f.search) {
    sql += " AND (u.name LIKE ? OR e.email LIKE ?)";
    params.push(`%${f.search}%`, `%${f.search}%`);
  }
  sql += ` ORDER BY e.created_at DESC LIMIT ${MAX_LOGIN_ROWS + 1}`;
  const [rows] = await pool.query(sql, params);
  const truncated = rows.length > MAX_LOGIN_ROWS;

  return {
    filters: { ...f, status },
    truncated,
    rows: rows.slice(0, MAX_LOGIN_ROWS).map((r) => ({
      id: String(r.id),
      created_at: r.created_at,
      name: r.name || "",
      email: r.email,
      role: r.role || "",
      platform: r.platform,
      success: r.success === 1,
      failure_reason: r.failure_reason,
      ip_address: r.ip_address || "",
      user_agent: r.user_agent || "",
    })),
  };
}

// ---- tables for export -----------------------------------------------------
// column: { header, width (Excel chars), pdf (points, 0 = Excel only), value(row), fill?(row) }

const GREEN = "DCFCE7";
const GREY = "F1F5F9";
const RED = "FEE2E2";

function todayTable(data) {
  const t = data.totals;
  return {
    title: "User Activity - Today",
    sheet: "Today",
    lines: [
      filterLine(data.filters),
      `Total users: ${t.users}   |   Active: ${t.active}   |   Not active: ${t.inactive}   |   ` +
        PLATFORMS.map((p) => `${PLATFORM_LABELS[p]}: ${t.by_platform[p]}`).join("   |   ") +
        `   |   Logins: ${t.logins}   |   Failed logins: ${t.failed_logins}`,
    ],
    columns: [
      { header: "Name", width: 26, pdf: 130, value: (r) => r.name },
      { header: "Email", width: 30, pdf: 0, value: (r) => r.email },
      { header: "Role", width: 18, pdf: 90, value: (r) => r.role },
      { header: "Branch", width: 20, pdf: 100, value: (r) => r.branch },
      { header: "Status", width: 12, pdf: 62, value: (r) => (r.active ? "Active" : "Not active"), fill: (r) => (r.active ? GREEN : GREY) },
      { header: "Apps used", width: 30, pdf: 160, value: (r) => r.platforms.map((p) => PLATFORM_LABELS[p]).join(", ") },
      { header: "First used", width: 11, pdf: 55, value: (r) => fmtTime(r.first_seen_at) },
      { header: "Last used", width: 11, pdf: 55, value: (r) => fmtTime(r.last_seen_at) },
      { header: "Logins", width: 9, pdf: 45, value: (r) => r.logins },
      { header: "Failed logins", width: 13, pdf: 55, value: (r) => r.failed_logins, fill: (r) => (r.failed_logins ? RED : null) },
    ],
    rows: data.rows,
  };
}

function daywiseTable(data) {
  const fixed = 120 + 80 + 50;
  const dayWidth = Math.max(16, Math.min(40, Math.floor((780 - fixed) / data.dates.length)));
  return {
    title: "User Activity - Day-wise",
    sheet: "Day-wise",
    lines: [filterLine(data.filters), `Each day shows the apps used: ${LEGEND}. Blank = not active.`],
    columns: [
      { header: "Name", width: 26, pdf: 120, value: (r) => r.name },
      { header: "Email", width: 30, pdf: 0, value: (r) => r.email },
      { header: "Role", width: 18, pdf: 80, value: (r) => r.role },
      { header: "Branch", width: 20, pdf: 0, value: (r) => r.branch },
      ...data.dates.map((d) => ({
        header: d.slice(8) + "/" + d.slice(5, 7),
        pdfHeader: String(Number(d.slice(8))), // a 31-day PDF only has room for the day number
        width: 7,
        pdf: dayWidth,
        align: "center",
        value: (r) => (r.days[d] || []).map((p) => PLATFORM_SHORT[p]).join(" "),
        fill: (r) => (r.days[d] ? GREEN : null),
      })),
      { header: "Active days", width: 12, pdf: 50, align: "center", value: (r) => `${r.active_days} / ${data.dates.length}` },
    ],
    rows: data.rows,
  };
}

function loginsTable(data) {
  const status = data.filters.status ? `   |   Result: ${data.filters.status === "success" ? "Successful" : "Failed"}` : "";
  return {
    title: "User Activity - Login History",
    sheet: "Login history",
    lines: [
      filterLine(data.filters) + status,
      `${data.rows.length} login attempts` + (data.truncated ? ` (showing the latest ${MAX_LOGIN_ROWS}; narrow the dates for the rest)` : ""),
    ],
    columns: [
      { header: "Time", width: 20, pdf: 95, value: (r) => fmtDateTime(r.created_at) },
      { header: "Name", width: 24, pdf: 115, value: (r) => r.name || "(no account)" },
      { header: "Email", width: 30, pdf: 150, value: (r) => r.email },
      { header: "Role", width: 16, pdf: 75, value: (r) => r.role },
      { header: "App", width: 18, pdf: 85, value: (r) => PLATFORM_LABELS[r.platform] || r.platform },
      { header: "Result", width: 11, pdf: 55, value: (r) => (r.success ? "Success" : "Failed"), fill: (r) => (r.success ? GREEN : RED) },
      { header: "Reason", width: 22, pdf: 100, value: (r) => (r.success ? "" : FAILURE_LABELS[r.failure_reason] || r.failure_reason || "") },
      { header: "IP address", width: 18, pdf: 105, value: (r) => r.ip_address },
      { header: "Device / browser", width: 60, pdf: 0, value: (r) => r.user_agent },
    ],
    rows: data.rows,
  };
}

// ---- renderers -------------------------------------------------------------

async function renderXlsx(table) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";
  const ws = wb.addWorksheet(table.sheet);
  ws.columns = table.columns.map((c) => ({ width: c.width }));

  ws.addRow([table.title]).font = { bold: true, size: 14 };
  for (const line of table.lines) ws.addRow([line]).font = { color: { argb: "FF475569" } };
  ws.addRow([`Generated: ${fmtDateTime(new Date())}`]).font = { italic: true, color: { argb: "FF64748B" } };
  ws.addRow([]);

  const header = ws.addRow(table.columns.map((c) => c.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
  const headerRow = header.number;

  for (const r of table.rows) {
    const row = ws.addRow(table.columns.map((c) => c.value(r)));
    table.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.align) cell.alignment = { horizontal: c.align };
      const fill = c.fill?.(r);
      if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
    });
  }

  ws.views = [{ state: "frozen", ySplit: headerRow }];
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: table.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function renderPdf(table) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const cols = table.columns.filter((c) => c.pdf > 0);
    const left = 30;
    const rowH = 16;
    const bottom = () => doc.page.height - 40;

    doc.font("Helvetica-Bold").fontSize(15).fillColor("#0f172a").text(table.title, left, 30);
    doc.font("Helvetica").fontSize(8.5).fillColor("#475569");
    for (const line of table.lines) doc.text(line, { width: doc.page.width - 60 });
    doc.moveDown(0.6);

    const drawCells = (values, y, { bold = false, fills = [], bg = null } = {}) => {
      let x = left;
      cols.forEach((c, i) => {
        const fill = fills[i] || bg;
        if (fill) doc.rect(x, y, c.pdf, rowH).fill(`#${fill}`);
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(7.5)
          .fillColor("#0f172a")
          .text(String(values[i] ?? ""), x + 3, y + 4.5, {
            width: c.pdf - 6,
            height: rowH - 4,
            align: c.align || "left",
            lineBreak: false,
            ellipsis: true,
          });
        x += c.pdf;
      });
      doc
        .moveTo(left, y + rowH)
        .lineTo(x, y + rowH)
        .lineWidth(0.4)
        .strokeColor("#cbd5e1")
        .stroke();
    };
    const drawHeader = (y) => drawCells(cols.map((c) => c.pdfHeader || c.header), y, { bold: true, bg: "E0E7FF" });

    let y = doc.y;
    drawHeader(y);
    y += rowH;
    if (!table.rows.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No records for these filters.", left, y + 8);
    }
    for (const r of table.rows) {
      if (y + rowH > bottom()) {
        doc.addPage();
        y = 30;
        drawHeader(y);
        y += rowH;
      }
      drawCells(cols.map((c) => c.value(r)), y, { fills: cols.map((c) => c.fill?.(r) || null) });
      y += rowH;
    }

    // Footer on every page. Writing below the bottom margin would make pdfkit add a page.
    const generated = `Generated ${fmtDateTime(new Date())}`;
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#64748b")
        .text(`BestServe - ${table.title}   |   ${generated}   |   Page ${i + 1} of ${range.count}`, left, doc.page.height - 25, {
          width: doc.page.width - 60,
          align: "center",
          lineBreak: false,
        });
      doc.page.margins.bottom = margin;
    }
    doc.end();
  });
}

const VIEWS = {
  today: { build: buildToday, table: todayTable, name: (f) => `user-activity-${f.date}` },
  daywise: { build: buildDaywise, table: daywiseTable, name: (f) => `user-activity-daywise-${f.from}-to-${f.to}` },
  logins: { build: buildLogins, table: loginsTable, name: (f) => `login-history-${f.from}-to-${f.to}` },
};

async function exportReport(view, format, query) {
  const v = VIEWS[view];
  if (!v) throw new ReportInputError("view must be today, daywise or logins");
  if (format !== "pdf" && format !== "xlsx") throw new ReportInputError("format must be pdf or xlsx");
  const data = await v.build(query);
  const table = v.table(data);
  const buffer = format === "pdf" ? await renderPdf(table) : await renderXlsx(table);
  return {
    buffer,
    filename: `${v.name(data.filters)}.${format}`,
    contentType:
      format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

module.exports = {
  ReportInputError,
  loadRoles,
  buildToday,
  buildDaywise,
  buildLogins,
  exportReport,
};
