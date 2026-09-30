import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiCheckCircle, FiClock, FiDownload, FiFileText, FiInbox, FiList, FiPlayCircle } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { PRIORITY } from "./data";
import PeopleFilters from "./Filters";
import { dateKey, fmtDate, fmtDateTime, todayStr } from "./format";
import { assignedByText, personOf } from "./hierarchy";
import { buildReportHtml, buildWorkbook, byEmployee, downloadBlob, openPrintable, outcome, statsFor } from "./reportDoc";
import { NO_DEPT, SCOPES, applyPeopleFilters, availableScopes, readFilters, withParam } from "./selectors";
import { useTaskStore } from "./tasksApi";
import { useToast } from "./toastContext";
import { useViewer } from "./viewerContext";
import { Avatar, EmptyState, PriorityBadge, Skeleton, StatusBadge } from "./ui";

/** Period presets -> [from, to] as 'YYYY-MM-DD' (local). */
function periodRange(key, from, to) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (x) => dateKey(x);
  const shift = (base, n) => {
    const x = new Date(base);
    x.setDate(x.getDate() + n);
    return x;
  };
  const monday = shift(d, -((d.getDay() + 6) % 7));
  switch (key) {
    case "this_week":
      return [day(monday), day(shift(monday, 6))];
    case "last_week":
      return [day(shift(monday, -7)), day(shift(monday, -1))];
    case "last_month":
      return [day(new Date(d.getFullYear(), d.getMonth() - 1, 1)), day(new Date(d.getFullYear(), d.getMonth(), 0))];
    case "last_30":
      return [day(shift(d, -29)), day(d)];
    case "custom":
      return [from || day(new Date(d.getFullYear(), d.getMonth(), 1)), to || day(d)];
    case "this_month":
    default:
      return [day(new Date(d.getFullYear(), d.getMonth(), 1)), day(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
}

const PERIODS = [
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["last_30", "Last 30 days"],
  ["custom", "Custom"],
];

const safeName = (s) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "report";

/**
 * Reports: tasks due in a period, for one person, a department, the team or
 * everyone the viewer can see. Shown on screen as usual; "Download PDF" and
 * "Download Excel" export exactly what is on screen.
 */
export default function TaskReports() {
  const viewer = useViewer();
  const toast = useToast();
  const { tasks, ready } = useTaskStore();
  const [params, setParams] = useSearchParams();

  const scopes = availableScopes(viewer);
  const defaultScope = scopes.includes("team") ? "team" : "my";
  const scope = scopes.includes(params.get("scope")) ? params.get("scope") : defaultScope;
  const period = PERIODS.some(([k]) => k === params.get("period")) ? params.get("period") : "this_month";
  const [from, to] = periodRange(period, params.get("from"), params.get("to"));
  const dept = params.get("dept") || "";
  const assignee = params.get("assignee") || "";
  const today = todayStr();

  const setParam = (key, value) => setParams(withParam(params, key, value), { replace: true });
  const setScope = (s) => {
    let next = withParam(params, "scope", s === defaultScope ? "" : s);
    next = withParam(withParam(next, "dept", ""), "assignee", "");
    setParams(next, { replace: true });
  };

  const scoped = useMemo(() => applyPeopleFilters(tasks, { scope }, viewer), [tasks, scope, viewer]);
  const inPeriod = useMemo(() => scoped.filter((t) => t.due_date && t.due_date >= from && t.due_date <= to), [scoped, from, to]);
  const list = useMemo(() => applyPeopleFilters(inPeriod, { dept, assignee }, viewer), [inPeriod, dept, assignee, viewer]);

  const stats = useMemo(() => statsFor(list, today), [list, today]);
  const groups = useMemo(() => byEmployee(list, today, (id) => personOf(viewer, id)), [list, today, viewer]);
  const rows = useMemo(() => [...list].sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "") || a.assigned_to_name.localeCompare(b.assigned_to_name)), [list]);

  // What the report is about, in words — used on screen and in the download.
  const person = assignee ? groups.find((g) => String(g.id) === assignee) || { name: list[0]?.assigned_to_name || "Selected person" } : null;
  const deptLabel = dept === NO_DEPT ? "No department" : dept;
  const title = person
    ? `${person.name} — Task Report`
    : dept
      ? `${deptLabel} — Team Task Report`
      : scope === "my"
        ? `${viewer.name} — Task Report`
        : scope === "team"
          ? `${viewer.name}'s Team — Task Report`
          : "All Employees — Task Report";
  const subtitle = `Tasks due ${fmtDate(from)} – ${fmtDate(to)}`;
  const filterWords = [SCOPES[scope].label, ...(dept ? [`Department: ${deptLabel}`] : []), ...(person ? [`Employee: ${person.name}`] : [])];

  function downloadPdf() {
    const html = buildReportHtml({ title, subtitle, filters: filterWords, groups, stats, today, generatedBy: viewer.name });
    if (!openPrintable(html)) {
      toast.push({ type: "error", title: "Pop-up blocked", text: "Allow pop-ups for this site, then try Download PDF again." });
      return;
    }
    toast.push({ type: "info", title: "Report opened", text: "Choose “Save as PDF” in the print dialog." });
  }

  function downloadExcel() {
    downloadBlob(buildWorkbook({ groups, today }), `${safeName(title)}_${from}_to_${to}.xlsx`);
  }

  const kpis = [
    { label: "Tasks", value: stats.total, icon: FiList, tone: "blue", hint: subtitle.replace("Tasks due ", "Due ") },
    { label: "Completed", value: stats.completed, icon: FiCheckCircle, tone: "green", hint: stats.completionRate === null ? "—" : `${stats.completionRate}% of tasks` },
    { label: "On time", value: stats.onTime, icon: FiClock, tone: "blue", hint: stats.onTimeRate === null ? "—" : `${stats.onTimeRate}% of completed · ${stats.late} late` },
    { label: "In progress", value: stats.inProgress, icon: FiPlayCircle, tone: "orange", hint: `${stats.open} not started yet` },
    { label: "Overdue", value: stats.overdue, icon: FiAlertCircle, tone: "red", hint: "Still open, past the due date" },
  ];

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>Reports</h1>
          <p>Task performance by person, team or department. Download a clean copy to share.</p>
        </div>
        <div className="tp-head-right-row">
          <button type="button" className="tp-btn ghost" onClick={downloadExcel} disabled={!ready || list.length === 0}>
            <FiDownload /> Excel
          </button>
          <button type="button" className="tp-btn primary" onClick={downloadPdf} disabled={!ready}>
            <FiFileText /> Download PDF
          </button>
        </div>
      </div>

      <div className="tp-rep-bar">
        {scopes.length > 1 && (
          <div className="tp-seg" role="tablist" aria-label="Whose tasks">
            {scopes.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scope === s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>
                {SCOPES[s].label}
              </button>
            ))}
          </div>
        )}
        <label className={`tp-select ${period !== "this_month" ? "on" : ""}`}>
          <span>Period</span>
          <select value={period} onChange={(e) => setParam("period", e.target.value === "this_month" ? "" : e.target.value)} aria-label="Period">
            {PERIODS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {period === "custom" && (
          <span className="tp-rep-range">
            <input className="tp-input" type="date" value={from} max={to} onChange={(e) => setParam("from", e.target.value)} aria-label="From" />
            <span>to</span>
            <input className="tp-input" type="date" value={to} min={from} onChange={(e) => setParam("to", e.target.value)} aria-label="To" />
          </span>
        )}
        {scope !== "my" && (
          <PeopleFilters
            tasks={inPeriod}
            values={readFilters(params)}
            onChange={setParam}
            onClear={() => setParams(withParam(withParam(params, "dept", ""), "assignee", ""), { replace: true })}
            show={["dept", "assignee"]}
          />
        )}
      </div>

      <div className="tp-rep-title">
        <h2>{title}</h2>
        <small>{subtitle}</small>
      </div>

      <div className="tp-kpis tp-rep-kpis">
        {kpis.map((k, i) => (
          <div key={k.label} className={`tp-kpi static ${k.tone}`} style={{ "--i": i }}>
            <span className="tp-kpi-icon">
              <k.icon />
            </span>
            <span className="tp-kpi-num">{ready ? k.value : <Skeleton width={40} height={28} />}</span>
            <span className="tp-kpi-label">{k.label}</span>
            <small>{k.hint}</small>
          </div>
        ))}
      </div>

      {ready && list.length === 0 && <EmptyState icon={FiInbox} title="No tasks in this report" text="Try a different period, or widen the filters." />}

      {ready && groups.length > 1 && (
        <section className="tp-card tp-rep-card">
          <div className="tp-card-head">
            <h3>By employee</h3>
            <small>Click a person to see just their report</small>
          </div>
          <div className="tp-dtable-wrap">
            <table className="tp-dtable tp-rep-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Tasks</th>
                  <th className="num">Completed</th>
                  <th className="num">On time</th>
                  <th className="num">In progress</th>
                  <th className="num">Open</th>
                  <th className="num">Overdue</th>
                  <th className="num">Completion</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="tp-rep-click" onClick={() => setParam("assignee", String(g.id))} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setParam("assignee", String(g.id))}>
                    <td>
                      <span className="tp-rep-person">
                        <Avatar name={g.name} size={28} />
                        <span>
                          <strong>{g.name}</strong>
                          <small>{[g.designation, g.dept].filter(Boolean).join(" · ") || "—"}</small>
                        </span>
                      </span>
                    </td>
                    <td className="num">{g.stats.total}</td>
                    <td className="num">{g.stats.completed}</td>
                    <td className="num">{g.stats.onTimeRate === null ? "—" : `${g.stats.onTimeRate}%`}</td>
                    <td className="num">{g.stats.inProgress}</td>
                    <td className="num">{g.stats.open}</td>
                    <td className={`num ${g.stats.overdue ? "tp-tone-late" : ""}`}>{g.stats.overdue}</td>
                    <td className="num">
                      <span className="tp-rep-rate">
                        <span className="tp-rep-rate-track">
                          <span style={{ width: `${g.stats.completionRate || 0}%` }} />
                        </span>
                        {g.stats.completionRate === null ? "—" : `${g.stats.completionRate}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ready && rows.length > 0 && (
        <section className="tp-card tp-rep-card">
          <div className="tp-card-head">
            <h3>Tasks</h3>
            <small>
              {rows.length} {rows.length === 1 ? "task" : "tasks"}
            </small>
          </div>
          <div className="tp-dtable-wrap">
            <table className="tp-dtable tp-rep-table">
              <thead>
                <tr>
                  <th>Task</th>
                  {!person && <th>Assigned to</th>}
                  <th>Assigned by</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const res = outcome(t, today);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link to={`${TASKPRO_HOME}/tasks/${t.id}`} className="tp-rep-task">
                          {t.title}
                        </Link>
                        <span className="tp-rep-sub">
                          <PriorityBadge priority={t.priority} /> {t.task_type || ""}
                        </span>
                      </td>
                      {!person && <td>{t.assigned_to_name}</td>}
                      <td>{assignedByText(t).replace(/^By /, "")}</td>
                      <td className="tp-nowrap">{fmtDateTime(t.due_date, t.due_time)}</td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>{res ? <span className={`tp-rep-result ${res === "On time" ? "ok" : res === "Late" ? "warn" : "bad"}`}>{res}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!ready && <Skeleton height={220} radius={16} />}

      <p className="tp-chart-hint">
        Priority counts: {Object.keys(PRIORITY)
          .map((k) => `${PRIORITY[k].label} ${list.filter((t) => t.priority === k).length}`)
          .join(" · ")}
        . A task counts in the period its due date falls in.
      </p>
    </>
  );
}
