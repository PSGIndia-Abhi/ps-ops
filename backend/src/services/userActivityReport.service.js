const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { pool } = require("../../db");
const { PLATFORMS, PLATFORM_LABELS, localDate } = require("../utils/userActivity");

// ---------------------------------------------------------------------------
// Admin User Activity report: who used the website / apps today, and the
// PDF / Excel export of that list. "Login time" is the first time the person
// used the system today (a login, or opening an app they're still signed in to).
// ---------------------------------------------------------------------------

class ReportInputError extends Error {}

function readFilters(query) {
  const platform = query.platform || "";
  if (platform && !PLATFORMS.includes(platform)) throw new ReportInputError("Unknown app filter");
  const role = typeof query.role === "string" ? query.role.trim() : "";
  // Today (default) or yesterday - the report for a day that has just ended.
  const yesterday = query.day === "yesterday";
  const d = new Date();
  if (yesterday) d.setDate(d.getDate() - 1);
  return { day: yesterday ? "yesterday" : "today", date: localDate(d), platform, role };
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
  return `${fmtDay(localDate(d))} ${fmtTime(d)}`;
}

// ---- data ------------------------------------------------------------------

async function loadRoles() {
  const [rows] = await pool.query("SELECT name FROM roles ORDER BY name");
  return rows.map((r) => r.name);
}

async function buildToday(query) {
  const f = readFilters(query);

  // Everyone who can sign in: active accounts whose invite has been accepted.
  const userParams = [];
  let userSql = `
    SELECT u.id, u.name, u.email, r.name AS role, b.name AS branch
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN branches b ON b.id = u.branch_id
    WHERE COALESCE(u.is_active, 1) = 1
      AND (u.invite_status IS NULL OR u.invite_status <> 'INVITED')`;
  if (f.role) {
    userSql += " AND r.name = ?";
    userParams.push(f.role);
  }
  const [users] = await pool.query(userSql, userParams);

  const actParams = [f.date];
  let actSql = `SELECT user_id, platform, first_seen_at FROM user_daily_activity WHERE activity_date = ?`;
  if (f.platform) {
    actSql += " AND platform = ?";
    actParams.push(f.platform);
  }
  const [activity] = await pool.query(actSql, actParams);

  const actByUser = new Map();
  for (const a of activity) {
    const key = String(a.user_id);
    if (!actByUser.has(key)) actByUser.set(key, []);
    actByUser.get(key).push(a);
  }

  const byPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, 0]));
  const rows = users.map((u) => {
    const acts = actByUser.get(String(u.id)) || [];
    const platforms = PLATFORMS.filter((p) => acts.some((a) => a.platform === p));
    platforms.forEach((p) => byPlatform[p]++);
    const loginAt = acts.length ? new Date(Math.min(...acts.map((a) => new Date(a.first_seen_at)))) : null;
    return {
      id: String(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      branch: u.branch || "",
      active: acts.length > 0,
      platforms,
      login_at: loginAt,
    };
  });

  // Active people first (earliest login first), then everyone else by name.
  rows.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.login_at && b.login_at ? a.login_at - b.login_at : 0) ||
      String(a.name).localeCompare(String(b.name))
  );

  const active = rows.filter((r) => r.active).length;
  return {
    filters: f,
    totals: { users: rows.length, active, inactive: rows.length - active, by_platform: byPlatform },
    rows,
  };
}

// ---- export ----------------------------------------------------------------
// column: { header, width (Excel chars), pdf (points, 0 = Excel only), value(row), fill?(row) }

function todayTable(data) {
  const f = data.filters;
  const t = data.totals;
  return {
    title: `User Activity - ${f.day === "yesterday" ? "Yesterday" : "Today"}`,
    lines: [
      `Date: ${fmtDay(f.date)}   |   App: ${f.platform ? PLATFORM_LABELS[f.platform] : "All"}   |   Role: ${f.role || "All"}`,
      `Total users: ${t.users}   |   Active: ${t.active}   |   Not active: ${t.inactive}   |   ` +
        PLATFORMS.map((p) => `${PLATFORM_LABELS[p]}: ${t.by_platform[p]}`).join("   |   "),
    ],
    columns: [
      { header: "Name", width: 28, pdf: 170, value: (r) => r.name },
      { header: "Email", width: 30, pdf: 0, value: (r) => r.email },
      { header: "Role", width: 18, pdf: 110, value: (r) => r.role },
      { header: "Branch", width: 22, pdf: 130, value: (r) => r.branch },
      { header: "Status", width: 12, pdf: 75, value: (r) => (r.active ? "Active" : "Not active"), fill: (r) => (r.active ? "DCFCE7" : "F1F5F9") },
      { header: "App", width: 30, pdf: 200, value: (r) => r.platforms.map((p) => PLATFORM_LABELS[p]).join(", ") },
      { header: "Login time", width: 12, pdf: 95, value: (r) => fmtTime(r.login_at) },
    ],
    rows: data.rows,
  };
}

async function renderXlsx(table) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";
  const ws = wb.addWorksheet(table.title.replace("User Activity - ", ""));
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
      const fill = c.fill?.(r);
      if (fill) row.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
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
    const drawHeader = (y) => drawCells(cols.map((c) => c.header), y, { bold: true, bg: "E0E7FF" });

    let y = doc.y;
    drawHeader(y);
    y += rowH;
    if (!table.rows.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No users for these filters.", left, y + 8);
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

async function exportToday(format, query) {
  if (format !== "pdf" && format !== "xlsx") throw new ReportInputError("format must be pdf or xlsx");
  const data = await buildToday(query);
  const table = todayTable(data);
  return {
    buffer: format === "pdf" ? await renderPdf(table) : await renderXlsx(table),
    filename: `user-activity-${data.filters.date}.${format}`,
    contentType:
      format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

module.exports = { ReportInputError, loadRoles, buildToday, exportToday };
