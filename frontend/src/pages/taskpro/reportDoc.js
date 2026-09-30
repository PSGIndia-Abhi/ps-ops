// TaskPro reports: the numbers behind the Reports page, and the two
// downloads — a print-ready HTML document (saved as PDF from the browser's
// print dialog) and an Excel workbook (.xlsx). Pure functions, no React.

import { STATUS, PRIORITY } from "./data";
import { dateKey, fmtDate, fmtDateTime, fmtTimestamp } from "./format";
import { buildXlsx } from "./xlsx";

const localDay = (iso) => (iso ? dateKey(new Date(iso)) : null);
const isActive = (t) => t.status === "OPEN" || t.status === "IN_PROGRESS" || t.status === "PAUSED";

/** How a task ended up: "On time" / "Late" (completed), "Overdue", or "". */
export function outcome(t, today) {
  if (t.status === "COMPLETED") {
    const done = localDay(t.completed_at);
    return done && t.due_date && done > t.due_date ? "Late" : "On time";
  }
  if (isActive(t) && t.due_date && t.due_date < today) return "Overdue";
  return "";
}

/** Counts and rates for a list of tasks. Cancelled tasks don't count towards rates. */
export function statsFor(list, today) {
  const s = { total: list.length, completed: 0, onTime: 0, late: 0, inProgress: 0, paused: 0, open: 0, overdue: 0, cancelled: 0 };
  for (const t of list) {
    if (t.status === "COMPLETED") {
      s.completed += 1;
      if (outcome(t, today) === "Late") s.late += 1;
      else s.onTime += 1;
    } else if (t.status === "IN_PROGRESS") s.inProgress += 1;
    else if (t.status === "PAUSED") s.paused += 1;
    else if (t.status === "OPEN") s.open += 1;
    else if (t.status === "CANCELLED") s.cancelled += 1;
    if (outcome(t, today) === "Overdue") s.overdue += 1;
  }
  const counted = s.total - s.cancelled;
  s.completionRate = counted ? Math.round((s.completed / counted) * 100) : null;
  s.onTimeRate = s.completed ? Math.round((s.onTime / s.completed) * 100) : null;
  return s;
}

/** Tasks grouped by assignee, each with its stats, sorted by name. */
export function byEmployee(list, today, personOf) {
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.assigned_to)) {
      const card = personOf(t.assigned_to);
      groups.set(t.assigned_to, { id: t.assigned_to, name: t.assigned_to_name || card?.name || `User #${t.assigned_to}`, dept: card?.dept || "", designation: card?.designation || "", tasks: [] });
    }
    groups.get(t.assigned_to).tasks.push(t);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, stats: statsFor(g.tasks, today), tasks: [...g.tasks].sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

/* ----------------------------------------------------------- workbook */

/**
 * The Excel download: a "Summary" sheet (one row per employee) and a
 * "Tasks" sheet (one row per task). Dates are real Excel dates, so they
 * sort and filter properly.
 */
export function buildWorkbook({ groups, today }) {
  const summary = {
    name: "Summary",
    columns: [
      { label: "Employee", width: 26 }, { label: "Department", width: 18 }, { label: "Designation", width: 22 },
      { label: "Tasks", width: 8 }, { label: "Completed", width: 11 }, { label: "On time", width: 9 }, { label: "Late", width: 7 },
      { label: "In progress", width: 11 }, { label: "Paused", width: 8 }, { label: "Open", width: 7 }, { label: "Overdue", width: 9 },
      { label: "Completion", width: 11 }, { label: "On-time rate", width: 12 },
    ],
    rows: groups.map((g) => [
      { text: g.name, bold: true }, g.dept, g.designation, g.stats.total, g.stats.completed, g.stats.onTime, g.stats.late,
      g.stats.inProgress, g.stats.paused, g.stats.open, g.stats.overdue,
      { pct: g.stats.completionRate === null ? null : g.stats.completionRate / 100 },
      { pct: g.stats.onTimeRate === null ? null : g.stats.onTimeRate / 100 },
    ]),
  };
  const tasks = {
    name: "Tasks",
    columns: [
      { label: "Employee", width: 24 }, { label: "Department", width: 16 }, { label: "Task", width: 44 }, { label: "Type", width: 14 },
      { label: "Priority", width: 9 }, { label: "Assigned by", width: 24 }, { label: "Due date", width: 13 }, { label: "Due time", width: 9 },
      { label: "Status", width: 12 }, { label: "Completed on", width: 14 }, { label: "Result", width: 10 },
    ],
    rows: groups.flatMap((g) =>
      g.tasks.map((t) => [
        g.name, g.dept, t.title, t.task_type || "", PRIORITY[t.priority]?.label || t.priority,
        t.created_by === t.assigned_to ? "Self" : t.created_by_name || "",
        t.due_date ? { date: t.due_date } : "", t.due_time ? String(t.due_time).slice(0, 5) : "",
        STATUS[t.status]?.label || t.status,
        localDay(t.completed_at) ? { date: localDay(t.completed_at) } : "",
        outcome(t, today),
      ]),
    ),
  };
  return buildXlsx([summary, tasks]);
}

/* ------------------------------------------------------------ print doc */

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STATUS_INK = { OPEN: "#1d4ed8", IN_PROGRESS: "#c2410c", PAUSED: "#be185d", COMPLETED: "#15803d", CANCELLED: "#475569" };
const RESULT_INK = { "On time": "#15803d", Late: "#b45309", Overdue: "#b91c1c" };

function kpi(label, value, sub) {
  return `<div class="kpi"><div class="kpi-v">${esc(value)}</div><div class="kpi-l">${esc(label)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ""}</div>`;
}

function taskRows(tasks, today) {
  return tasks
    .map((t) => {
      const res = outcome(t, today);
      return `<tr>
        <td class="task"><strong>${esc(t.title)}</strong>${t.task_type ? `<span class="muted"> · ${esc(t.task_type)}</span>` : ""}</td>
        <td>${esc(PRIORITY[t.priority]?.label || t.priority)}</td>
        <td>${esc(t.created_by === t.assigned_to ? "Self" : t.created_by_name || "—")}</td>
        <td class="nowrap">${esc(fmtDateTime(t.due_date, t.due_time))}</td>
        <td><span class="pill" style="color:${STATUS_INK[t.status] || "#334155"}">${esc(STATUS[t.status]?.label || t.status)}</span></td>
        <td class="nowrap">${t.completed_at ? esc(fmtDate(localDay(t.completed_at))) : "—"}</td>
        <td>${res ? `<span class="pill" style="color:${RESULT_INK[res]}">${esc(res)}</span>` : "—"}</td>
      </tr>`;
    })
    .join("");
}

/**
 * The downloadable report as a complete HTML document: header, period and
 * filters, headline numbers, a per-employee summary (when there's more than
 * one person) and each employee's tasks. Laid out for A4; the browser's
 * "Save as PDF" turns it into a file. Every piece of user data is escaped.
 */
export function buildReportHtml({ title, subtitle, filters, groups, stats, today, generatedBy }) {
  const many = groups.length > 1;
  const summary = many
    ? `<h2>Summary by employee</h2>
       <table class="summary"><thead><tr>
         <th>Employee</th><th>Department</th><th class="num">Tasks</th><th class="num">Completed</th><th class="num">On time</th>
         <th class="num">Late</th><th class="num">In progress</th><th class="num">Paused</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Completion</th><th class="num">On-time rate</th>
       </tr></thead><tbody>
       ${groups
         .map(
           (g) => `<tr><td><strong>${esc(g.name)}</strong>${g.designation ? `<div class="muted">${esc(g.designation)}</div>` : ""}</td><td>${esc(g.dept || "—")}</td>
           <td class="num">${g.stats.total}</td><td class="num">${g.stats.completed}</td><td class="num">${g.stats.onTime}</td><td class="num">${g.stats.late}</td>
           <td class="num">${g.stats.inProgress}</td><td class="num">${g.stats.paused}</td><td class="num">${g.stats.open}</td><td class="num ${g.stats.overdue ? "bad" : ""}">${g.stats.overdue}</td>
           <td class="num">${pct(g.stats.completionRate)}</td><td class="num">${pct(g.stats.onTimeRate)}</td></tr>`,
         )
         .join("")}
       </tbody></table>`
    : "";

  const details = groups
    .map(
      (g) => `<section class="person">
        <div class="person-head">
          <div><h3>${esc(g.name)}</h3><div class="muted">${esc([g.designation, g.dept].filter(Boolean).join(" · ") || "—")}</div></div>
          <div class="person-stats">${g.stats.total} tasks · ${g.stats.completed} completed · ${pct(g.stats.onTimeRate)} on time${g.stats.overdue ? ` · <span class="bad">${g.stats.overdue} overdue</span>` : ""}</div>
        </div>
        <table class="tasks"><colgroup><col style="width:33%" /><col style="width:9%" /><col style="width:16%" /><col style="width:15%" /><col style="width:11%" /><col style="width:9%" /><col style="width:7%" /></colgroup><thead><tr><th>Task</th><th>Priority</th><th>Assigned by</th><th>Due</th><th>Status</th><th>Completed</th><th>Result</th></tr></thead>
        <tbody>${taskRows(g.tasks, today)}</tbody></table>
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 12px/1.45 Inter, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 16px; }
  .brand { font-size: 13px; font-weight: 800; color: #1d4ed8; letter-spacing: .02em; }
  .brand small { display: block; font-weight: 500; color: #64748b; letter-spacing: 0; }
  .meta { text-align: right; color: #64748b; font-size: 11px; }
  h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: -.3px; }
  .sub { color: #475569; margin: 0 0 4px; }
  .filters { color: #64748b; font-size: 11px; margin: 0 0 16px; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 20px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .kpi-v { font-size: 20px; font-weight: 800; }
  .kpi-l { color: #475569; font-weight: 600; }
  .kpi-s { color: #94a3b8; font-size: 10.5px; }
  h2 { font-size: 14px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 7px 8px; }
  td { border-bottom: 1px solid #eef1f6; padding: 7px 8px; vertical-align: top; }
  tr { break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .nowrap { white-space: nowrap; }
  .muted { color: #64748b; font-size: 11px; font-weight: 400; }
  .bad { color: #b91c1c; font-weight: 700; }
  .pill { font-weight: 700; font-size: 11px; white-space: nowrap; }
  table.tasks { table-layout: fixed; }
  .task strong { font-weight: 600; }
  .person { margin-top: 18px; break-inside: auto; }
  .person-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding: 8px 0; border-bottom: 1px solid #cbd5e1; margin-bottom: 4px; break-after: avoid; }
  .person-head h3 { margin: 0; font-size: 14px; }
  .person-stats { color: #475569; font-size: 11px; text-align: right; }
  .empty { padding: 24px; text-align: center; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 8px; }
  .foot { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 10.5px; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="top">
    <div class="brand">BestServe · TaskPro<small>Task management report</small></div>
    <div class="meta">Generated ${esc(fmtTimestamp(new Date().toISOString()))}${generatedBy ? `<br />by ${esc(generatedBy)}` : ""}</div>
  </div>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(subtitle)}</p>
  ${filters.length ? `<p class="filters">Filters: ${filters.map(esc).join(" · ")}</p>` : ""}
  <div class="kpis">
    ${kpi("Tasks", stats.total)}
    ${kpi("Completed", stats.completed, `${pct(stats.completionRate)} of tasks`)}
    ${kpi("On time", stats.onTime, `${pct(stats.onTimeRate)} of completed`)}
    ${kpi("Late", stats.late)}
    ${kpi("In progress", stats.inProgress, stats.paused ? `${stats.paused} paused` : "")}
    ${kpi("Overdue", stats.overdue, "still open, past due")}
  </div>
  ${groups.length ? summary + `<h2>Tasks by employee</h2>` + details : `<div class="empty">No tasks match this report.</div>`}
  <div class="foot"><span>BestServe · internal use only</span><span>${esc(title)}</span></div>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body></html>`;
}

/** Saves a Blob as a file download. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Opens the report in a new tab and brings up Print, where "Save as PDF"
 * gives the file (the tab title becomes the file name). Returns false if
 * the browser blocked the new tab.
 */
export function openPrintable(html) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

