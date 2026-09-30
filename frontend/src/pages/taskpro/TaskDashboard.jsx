import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiBarChart2, FiCheck, FiCheckCircle, FiClock, FiInbox, FiMousePointer, FiPlayCircle, FiRefreshCw, FiSliders, FiSun, FiUsers, FiX } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { CategoryChart, ChartCard, ChartEmpty, ColumnChart, LineChart } from "./charts";
import { OVERDUE_COLOR, PRIORITY, PRIORITY_CHART_COLOR, STATUS } from "./data";
import PeopleFilters from "./Filters";
import { dateKey, fmtDate, fmtDateTime, dueInfo, firstName, timeAgo } from "./format";
import { deptOf, taskWhoLine } from "./hierarchy";
import {
  FILTER_KEYS,
  NO_DEPT,
  SCOPES,
  applyChartFilters,
  applyPeopleFilters,
  availableScopes,
  isActive,
  isOverdue,
  readFilters,
  withParam,
} from "./selectors";
import { loadPrefs, updatePrefs } from "./prefs";
import { useIncomingRequests, useTaskStore } from "./tasksApi";
import useNow from "./useNow";
import { useViewer } from "./viewerContext";
import { Avatar, CountUp, EmptyState, HelpTip, PriorityDot, Skeleton, StatusBadge } from "./ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SERIES_BLUE = STATUS.OPEN.color; // single-series charts
const WORKLOAD_ROWS = 8; // people shown before the rest fold into "Others"

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Local 'YYYY-MM-DD' for `n` days from today, and the Date itself. */
function dayAt(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return { d, key: dateKey(d) };
}

const localDay = (iso) => (iso ? dateKey(new Date(iso)) : null);
const overdueFlag = (list) => {
  const n = list.filter(isOverdue).length;
  return n ? `${n} overdue` : null;
};

/** "Customize" menu: tick which chart cards the dashboard shows. */
function CustomizeCharts({ charts, hidden, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const toggle = (id) => onChange(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);
  const hiddenHere = charts.filter((c) => hidden.includes(c.id)).length;

  return (
    <div className="tp-pop-root" ref={ref}>
      <button type="button" className="tp-btn ghost tp-customize" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FiSliders /> Customize{hiddenHere > 0 ? ` · ${hiddenHere} hidden` : ""}
      </button>
      {open && (
        <div className="tp-popover tp-customize-pop" role="menu">
          <div className="tp-pop-head">Show charts</div>
          {charts.map((c) => {
            const on = !hidden.includes(c.id);
            return (
              <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={on} className={`tp-check-row ${on ? "on" : ""}`} onClick={() => toggle(c.id)}>
                <span className="tp-check">{on && <FiCheck />}</span>
                <span>{c.title}</span>
              </button>
            );
          })}
          {hiddenHere > 0 && (
            <button type="button" className="tp-pop-footer" onClick={() => onChange(hidden.filter((h) => !charts.some((c) => c.id === h)))}>
              Show all charts
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskDashboard() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { tasks: allTasks, ready } = useTaskStore();
  const { incoming: requests } = useIncomingRequests();
  const now = useNow(60000);
  const [params, setParams] = useSearchParams();

  // Whose tasks the dashboard covers. Defaults to the viewer's own; a
  // manager can switch to their team, or to everything they can see.
  const scopes = availableScopes(viewer);
  const scope = scopes.includes(params.get("scope")) ? params.get("scope") : "my";
  const dept = params.get("dept") || "";
  const assignee = params.get("assignee") || "";
  const creator = params.get("creator") || "";
  const status = params.get("status") || "";
  const priority = params.get("priority") || "";
  const due = params.get("due") || "";
  const values = readFilters(params); // for the dropdowns; memos below use the plain strings

  const setFilter = (key, value) => setParams(withParam(params, key, value), { replace: true });
  // Switching scope drops every other pick — they belonged to the old pool.
  const setScope = (next) => setParams(next === "my" ? {} : { scope: next }, { replace: true });
  const clearAll = () => setScope(scope);

  // --- the task pools --------------------------------------------------
  // scoped: whose tasks. people(skip): + department/person filters, minus
  // `skip` (the workload and department charts leave out their own filter
  // so their other bars stay visible). Chart filters are applied last, again
  // minus the chart's own one.
  const scoped = useMemo(() => applyPeopleFilters(allTasks, { scope }, viewer), [allTasks, scope, viewer]);
  const people = useMemo(() => applyPeopleFilters(scoped, { dept, assignee, creator }, viewer), [scoped, dept, assignee, creator, viewer]);
  const peopleNoAssignee = useMemo(() => applyPeopleFilters(scoped, { dept, creator }, viewer), [scoped, dept, creator, viewer]);
  const peopleNoDept = useMemo(() => applyPeopleFilters(scoped, { assignee, creator }, viewer), [scoped, assignee, creator, viewer]);

  const tasks = useMemo(() => applyChartFilters(people, { status, priority, due }), [people, status, priority, due]);
  const forStatus = useMemo(() => applyChartFilters(people, { status, priority, due }, "status"), [people, status, priority, due]);
  const forPriority = useMemo(() => applyChartFilters(people, { status, priority, due }, "priority").filter(isActive), [people, status, priority, due]);
  const forDue = useMemo(() => applyChartFilters(people, { status, priority, due }, "due").filter(isActive), [people, status, priority, due]);
  const forTrend = useMemo(() => applyChartFilters(people, { status, priority, due }, ["status", "due"]), [people, status, priority, due]);
  const forWorkload = useMemo(() => applyChartFilters(peopleNoAssignee, { status, priority, due }).filter(isActive), [peopleNoAssignee, status, priority, due]);
  const forDept = useMemo(() => applyChartFilters(peopleNoDept, { status, priority, due }).filter(isActive), [peopleNoDept, status, priority, due]);

  // --- KPIs (drawn without the status filter: they ARE the status split) --
  const stats = useMemo(() => {
    const active = forStatus.filter(isActive);
    const weekAgo = now - 7 * 86400000;
    return {
      open: forStatus.filter((t) => t.status === "OPEN").length,
      inProgress: forStatus.filter((t) => t.status === "IN_PROGRESS").length,
      paused: forStatus.filter((t) => t.status === "PAUSED").length,
      overdue: active.filter(isOverdue).length,
      doneWeek: forStatus.filter((t) => t.status === "COMPLETED" && t.completed_at && new Date(t.completed_at).getTime() > weekAgo).length,
      active: tasks.filter(isActive).length,
      overdueNow: tasks.filter(isOverdue).length,
    };
  }, [forStatus, tasks, now]);

  // --- chart data -------------------------------------------------------
  const statusSegments = useMemo(
    () => Object.entries(STATUS).map(([key, s]) => ({ key, label: s.label, color: s.color, value: forStatus.filter((t) => t.status === key).length })),
    [forStatus],
  );

  const dueColumns = useMemo(() => {
    const late = forDue.filter(isOverdue).length;
    const days = Array.from({ length: 7 }, (_, i) => {
      const { d, key } = dayAt(i);
      return {
        key,
        label: i === 0 ? "Today" : WEEKDAYS[d.getDay()],
        sub: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        tipLabel: `Due ${i === 0 ? "today" : i === 1 ? "tomorrow" : `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`}`,
        value: forDue.filter((t) => t.due_date === key && !isOverdue(t)).length,
        color: SERIES_BLUE,
      };
    });
    return [{ key: "overdue", label: "Overdue", sub: "Past due", tipLabel: "Overdue", value: late, color: OVERDUE_COLOR }, ...days];
  }, [forDue]);

  const priorityRows = useMemo(
    () =>
      ["HIGH", "NORMAL", "LOW"].map((key) => {
        const list = forPriority.filter((t) => t.priority === key);
        return { key, label: PRIORITY[key].label, color: PRIORITY_CHART_COLOR[key], value: list.length, flag: overdueFlag(list) };
      }),
    [forPriority],
  );

  const trend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const { d, key } = dayAt(i - 13);
      return { key, label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, tipLabel: `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}` };
    });
    const count = (field) => {
      const byDay = new Map();
      for (const t of forTrend) {
        const k = localDay(t[field]);
        if (k) byDay.set(k, (byDay.get(k) || 0) + 1);
      }
      return days.map((d) => byDay.get(d.key) || 0);
    };
    return {
      days,
      series: [
        { key: "created", label: "Created", color: SERIES_BLUE, values: count("created_at") },
        { key: "completed", label: "Completed", color: STATUS.COMPLETED.color, values: count("completed_at") },
      ],
    };
  }, [forTrend]);

  const workload = useMemo(() => {
    const byPerson = new Map();
    for (const t of forWorkload) {
      if (!byPerson.has(t.assigned_to)) byPerson.set(t.assigned_to, { id: t.assigned_to, name: t.assigned_to_name, list: [] });
      byPerson.get(t.assigned_to).list.push(t);
    }
    const toRow = (key, label, sub, list, clickable = true) => ({
      key,
      label,
      sub,
      clickable,
      flag: overdueFlag(list),
      parts: [
        { key: "OPEN", label: "Open", color: STATUS.OPEN.color, value: list.filter((t) => t.status === "OPEN").length },
        { key: "IN_PROGRESS", label: "In progress", color: STATUS.IN_PROGRESS.color, value: list.filter((t) => t.status === "IN_PROGRESS").length },
        { key: "PAUSED", label: "Paused", color: STATUS.PAUSED.color, value: list.filter((t) => t.status === "PAUSED").length },
      ],
    });
    const ranked = [...byPerson.values()].sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));
    const rows = ranked.slice(0, WORKLOAD_ROWS).map((p) => toRow(String(p.id), p.id === viewer.id ? `${p.name} (you)` : p.name, deptOf(viewer, p.id) || "", p.list));
    const rest = ranked.slice(WORKLOAD_ROWS);
    if (rest.length) rows.push(toRow("others", `Others (${rest.length} people)`, "", rest.flatMap((p) => p.list), false));
    return rows;
  }, [forWorkload, viewer]);

  const deptRows = useMemo(() => {
    const byDept = new Map();
    for (const t of forDept) {
      const d = deptOf(viewer, t.assigned_to) || NO_DEPT;
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d).push(t);
    }
    return [...byDept]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([d, list]) => ({
        key: d,
        label: d === NO_DEPT ? "No department" : d,
        sub: `${new Set(list.map((t) => t.assigned_to)).size} people`,
        flag: overdueFlag(list),
        parts: [{ key: "a", label: "Active", color: SERIES_BLUE, value: list.length }],
      }));
  }, [forDept, viewer]);

  // The two lists under the charts are short previews: the first few, with
  // a "Showing N of M" and a link when there are more.
  const ATTENTION_ROWS = 5;
  const RECENT_ROWS = 6;
  const attentionAll = useMemo(
    () =>
      tasks
        .filter((t) => isActive(t) && t.due_date && (isOverdue(t) || t.due_date <= dayAt(1).key))
        .sort((a, b) => (a.due_date + (a.due_time || "")).localeCompare(b.due_date + (b.due_time || ""))),
    [tasks],
  );
  const attention = attentionAll.slice(0, ATTENTION_ROWS);
  const recent = useMemo(() => [...tasks].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, RECENT_ROWS), [tasks]);

  // --- links & filter chips ------------------------------------------------
  // A list page showing what the dashboard shows. The list screens don't
  // take a single due date, so "overdue" maps to the Overdue screen and a
  // specific day is dropped.
  const listLink = () => {
    const page = due === "overdue" ? "overdue" : scope === "my" ? "my-tasks" : scope === "team" ? "team-tasks" : "all-tasks";
    const p = new URLSearchParams({ scope });
    for (const k of FILTER_KEYS) if (k !== "scope" && params.get(k)) p.set(k, params.get(k));
    if (status) p.set("status", status);
    if (priority) p.set("priority", priority);
    return `${TASKPRO_HOME}/${page}?${p}`;
  };

  const chips = [
    status && { key: "status", label: STATUS[status]?.label || status },
    priority && { key: "priority", label: `${PRIORITY[priority]?.label || priority} priority` },
    due && { key: "due", label: due === "overdue" ? "Overdue" : `Due ${fmtDate(due)}` },
  ].filter(Boolean);
  const anyFilter = chips.length > 0 || FILTER_KEYS.some((k) => k !== "scope" && params.get(k));

  // The number cards open the matching list (My / Team / All Tasks, Overdue,
  // Completed) with the dashboard's scope and people filters carried over.
  // My Tasks opens on "Today" by default, so the cards ask for "All".
  const scopePage = scope === "my" ? "my-tasks" : scope === "team" ? "team-tasks" : "all-tasks";
  const kpiLink = (page, extra = {}) => {
    const q = new URLSearchParams({ scope });
    for (const k of FILTER_KEYS) if (k !== "scope" && params.get(k)) q.set(k, params.get(k));
    if (priority) q.set("priority", priority);
    if (page === "my-tasks") q.set("when", "all");
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `${TASKPRO_HOME}/${page}?${q}`;
  };
  const kpis = [
    { key: "open", label: "Open", value: stats.open, icon: FiInbox, tone: "blue", hint: "Waiting to be started", to: kpiLink(scopePage, { status: "OPEN" }) },
    { key: "prog", label: "In progress", value: stats.inProgress, icon: FiPlayCircle, tone: "orange", hint: stats.paused ? `Being worked on · ${stats.paused} paused` : "Being worked on now", to: kpiLink(scopePage, { status: "IN_PROGRESS" }) },
    { key: "late", label: "Overdue", value: stats.overdue, icon: FiAlertCircle, tone: "red", hint: "Needs attention", to: kpiLink("overdue") },
    { key: "done", label: "Completed", value: stats.doneWeek, icon: FiCheckCircle, tone: "green", hint: "In the last 7 days", to: kpiLink("completed") },
  ];

  // --- the chart cards ---------------------------------------------------
  // Each card lists the chart types that suit its data (first = default);
  // pie/donut only where a few categories add up to a whole.
  const [hidden, setHidden] = useState(() => loadPrefs().hidden || []);
  const saveHidden = (next) => {
    setHidden(next);
    updatePrefs((pr) => ({ ...pr, hidden: next }));
  };
  const pickFilter = (key) => (k) => setFilter(key, k || "");
  const workloadLegend = [
    { label: "Open", color: STATUS.OPEN.color },
    { label: "In progress", color: STATUS.IN_PROGRESS.color },
    { label: "Paused", color: STATUS.PAUSED.color },
  ];

  const table = (columns, rows) => ({ columns, rows });
  const countCols = (first) => [{ key: "label", label: first }, { key: "value", label: "Tasks", num: true }];

  const charts = [
    {
      id: "status",
      title: "Tasks by status",
      note: "Share of every task in this view",
      types: ["donut", "pie", "bar", "column"],
      empty: forStatus.length === 0,
      table: table(countCols("Status"), statusSegments.map((x) => ({ key: x.key, label: x.label, value: x.value }))),
      draw: (type) => <CategoryChart type={type} items={statusSegments} selected={status || null} onSelect={pickFilter("status")} />,
    },
    {
      id: "due",
      title: "Due soon",
      note: "Active tasks: overdue, then the next 7 days",
      types: ["column", "bar"],
      empty: false,
      table: table(countCols("When"), dueColumns.map((c) => ({ key: c.key, label: c.key === "overdue" ? "Overdue" : `${c.label}, ${c.sub}`, value: c.value }))),
      draw: (type) => <CategoryChart type={type} items={dueColumns} selected={due || null} onSelect={pickFilter("due")} />,
    },
    {
      id: "priority",
      title: "Priority",
      note: "Active tasks by priority",
      types: ["bar", "column", "donut", "pie"],
      empty: forPriority.length === 0,
      table: table([...countCols("Priority"), { key: "flag", label: "Overdue" }], priorityRows.map((r) => ({ key: r.key, label: r.label, value: r.value, flag: r.flag || "—" }))),
      draw: (type) => <CategoryChart type={type} items={priorityRows} selected={priority || null} onSelect={pickFilter("priority")} />,
    },
    {
      id: "trend",
      title: "Created vs completed",
      note: "Last 14 days",
      types: ["line", "area", "column"],
      empty: false,
      table: table(
        [{ key: "label", label: "Day" }, { key: "created", label: "Created", num: true }, { key: "completed", label: "Completed", num: true }],
        trend.days.map((d, i) => ({ key: d.key, label: d.tipLabel, created: trend.series[0].values[i], completed: trend.series[1].values[i] })),
      ),
      draw: (type) =>
        type === "column" ? (
          <ColumnChart
            layout="group"
            labelEvery={2}
            legend={trend.series.map((x) => ({ label: x.label, color: x.color, total: x.values.reduce((a, b) => a + b, 0) }))}
            columns={trend.days.map((d, i) => ({ key: d.key, label: d.label, tipLabel: d.tipLabel, parts: trend.series.map((x) => ({ key: x.key, label: x.label, color: x.color, value: x.values[i] })) }))}
          />
        ) : (
          <LineChart days={trend.days} series={trend.series} area={type === "area"} />
        ),
    },
    ...(scope === "my"
      ? []
      : [
          {
            id: "workload",
            title: "Workload by person",
            note: "Active tasks per assignee — click a person to focus on them",
            types: ["bar", "column"],
            empty: workload.length === 0,
            table: table(
              [{ key: "label", label: "Person" }, { key: "open", label: "Open", num: true }, { key: "prog", label: "In progress", num: true }, { key: "paused", label: "Paused", num: true }, { key: "flag", label: "Overdue" }],
              workload.map((r) => ({ key: r.key, label: r.label, open: r.parts[0].value, prog: r.parts[1].value, paused: r.parts[2].value, flag: r.flag || "—" })),
            ),
            draw: (type) => <CategoryChart type={type} items={workload} selected={assignee || null} onSelect={pickFilter("assignee")} legend={workloadLegend} />,
          },
          {
            id: "dept",
            title: "By department",
            note: "Active tasks per department",
            types: ["bar", "column"],
            empty: deptRows.length === 0,
            table: table([...countCols("Department"), { key: "people", label: "People" }, { key: "flag", label: "Overdue" }], deptRows.map((r) => ({ key: r.key, label: r.label, value: r.parts[0].value, people: r.sub, flag: r.flag || "—" }))),
            draw: (type) => <CategoryChart type={type} items={deptRows} selected={dept || null} onSelect={pickFilter("dept")} />,
          },
        ]),
  ];
  const shownCharts = charts.filter((c) => !hidden.includes(c.id));

  return (
    <>
      <div className="tp-hero">
        <div>
          <span className="tp-hero-kicker">
            <FiSun /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1>
            {greeting()}, {firstName(viewer.name)}
          </h1>
          <p>
            {ready ? (
              stats.active > 0 ? (
                <>
                  {scope === "my" ? "You have " : scope === "team" ? "Your team has " : "There are "}
                  <strong>
                    {stats.active} active {stats.active === 1 ? "task" : "tasks"}
                  </strong>
                  {stats.overdueNow > 0 && (
                    <>
                      , <strong className="tp-tone-late">{stats.overdueNow} overdue</strong>
                    </>
                  )}
                  {scope === "all" && " across everything you can see"}
                  {anyFilter && " in this view"}.
                </>
              ) : anyFilter ? (
                "No active tasks match this view."
              ) : scope === "my" ? (
                "Nothing assigned to you right now."
              ) : (
                "No active tasks here right now."
              )
            ) : (
              <Skeleton width={260} height={14} />
            )}
          </p>
        </div>
        <div className="tp-hero-side">
          {scopes.length > 1 && (
            <div className="tp-scope" role="tablist" aria-label="Whose tasks">
              {scopes.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={scope === s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>
                  {SCOPES[s].label}
                </button>
              ))}
            </div>
          )}
          <Link to={listLink()} className="tp-btn primary">
            Open as list <FiArrowRight />
          </Link>
        </div>
      </div>

      {requests.length > 0 && (
        <section className="tp-card tp-req-card">
          <div className="tp-card-head">
            <h3>
              <FiRefreshCw /> {requests.length} reschedule {requests.length === 1 ? "request" : "requests"} waiting for you
            </h3>
            <Link to={`${TASKPRO_HOME}/requests`}>
              Review all <FiArrowRight />
            </Link>
          </div>
          {requests.slice(0, 3).map((r) => (
            <Link key={r.id} to={`${TASKPRO_HOME}/tasks/${r.task_id}`} className="tp-att-row">
              <Avatar name={r.requested_by_name} size={28} />
              <span className="tp-att-title">
                <strong>{r.task_title}</strong>
                <small>
                  {r.requested_by_name} asks to move it to {fmtDateTime(r.to_due_date, r.to_due_time)}
                  {r.reason ? ` · “${r.reason}”` : ""}
                </small>
              </span>
              <em className="tp-req-ago">{timeAgo(r.created_at)}</em>
            </Link>
          ))}
        </section>
      )}

      {(scope !== "my" || anyFilter) && (
        <div className="tp-dash-filters">
          {scope !== "my" && <PeopleFilters tasks={scoped} values={values} onChange={setFilter} show={["dept", "assignee", "creator"]} />}
          {chips.map((c) => (
            <button key={c.key} type="button" className="tp-filter-chip" onClick={() => setFilter(c.key, "")} aria-label={`Remove filter ${c.label}`}>
              {c.label} <FiX />
            </button>
          ))}
          {anyFilter && (
            <button type="button" className="tp-filter-clear" onClick={clearAll}>
              <FiX /> Clear all
            </button>
          )}
        </div>
      )}

      <div className="tp-kpis">
        {kpis.map((k, i) => (
          <button key={k.key} type="button" className={`tp-kpi ${k.tone}`} style={{ "--i": i }} onClick={() => navigate(k.to)} title={`Open ${k.label.toLowerCase()} tasks`}>
            <span className="tp-kpi-icon">
              <k.icon />
            </span>
            <span className="tp-kpi-num">{ready ? <CountUp value={k.value} /> : <Skeleton width={44} height={30} />}</span>
            <span className="tp-kpi-label">{k.label}</span>
            <small>{k.hint}</small>
          </button>
        ))}
      </div>

      <div className="tp-chart-bar">
        <HelpTip
          label="How the dashboard works"
          title="Using the dashboard"
          items={[
            { icon: FiUsers, title: "My / Team / All", text: "Choose whose tasks the whole dashboard shows." },
            { icon: FiInbox, title: "Number cards", text: "Click one to open that list, e.g. all open tasks." },
            { icon: FiMousePointer, title: "Bars and slices", text: "Click to filter every chart by it. Click again to clear." },
            // { icon: FiBarChart2, title: "Chart icons", text: "Switch a chart between donut, pie, bars, line or a table." },
            // { icon: FiSliders, title: "Customize", text: "Show or hide charts. Your choice is remembered." },
          ]}
        />
        <CustomizeCharts charts={charts} hidden={hidden} onChange={saveHidden} />
      </div>

      {shownCharts.length === 0 ? (
        <EmptyState icon={FiSliders} title="All charts are hidden" text="Use Customize to bring some back." />
      ) : (
        <div className={`tp-chart-grid ${ready ? "" : "loading"}`}>
          {shownCharts.map((c) => (
            <ChartCard
              key={c.id}
              id={c.id}
              title={c.title}
              note={c.note}
              types={c.types}
              table={c.table}
              render={(type) => (!ready ? <Skeleton height={180} radius={16} /> : c.empty ? <ChartEmpty /> : c.draw(type))}
            />
          ))}
        </div>
      )}

      <div className="tp-dash-grid">
        <section className="tp-card tp-attention">
          <div className="tp-card-head">
            <div className="tp-chart-title">
              <h3>Needs attention</h3>
              {attentionAll.length > ATTENTION_ROWS && (
                <small>
                  Showing {ATTENTION_ROWS} of {attentionAll.length} overdue or due soon
                </small>
              )}
            </div>
            <Link to={`${TASKPRO_HOME}/overdue?scope=${scope}`}>
              View overdue <FiArrowRight />
            </Link>
          </div>
          {!ready && [0, 1, 2].map((i) => <Skeleton key={i} height={48} style={{ marginBottom: 10 }} />)}
          {ready && attention.length === 0 && <EmptyState icon={FiCheckCircle} title="All clear" text="Nothing is overdue or due soon." />}
          {ready &&
            attention.map((t, i) => {
              const info = dueInfo(t.due_date, t.due_time, t.status);
              return (
                <Link key={t.id} to={`${TASKPRO_HOME}/tasks/${t.id}`} className="tp-att-row" style={{ "--i": i }}>
                  <PriorityDot priority={t.priority} />
                  <span className="tp-att-title">
                    <strong>{t.title}</strong>
                    <small>{taskWhoLine(viewer, t)}</small>
                  </span>
                  <span className={`tp-due tp-tone-${info.tone}`}>
                    <FiClock /> {info.text}
                  </span>
                  <StatusBadge status={t.status} live />
                </Link>
              );
            })}
        </section>

        <section className="tp-card">
          <div className="tp-card-head">
            <div className="tp-chart-title">
              <h3>Recently updated</h3>
              {tasks.length > RECENT_ROWS && <small>Latest {RECENT_ROWS} changes</small>}
            </div>
            {tasks.length > RECENT_ROWS && (
              <Link to={listLink()}>
                View all <FiArrowRight />
              </Link>
            )}
          </div>
          {!ready && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={38} style={{ marginBottom: 10 }} />)}
          {ready && recent.length === 0 && <EmptyState icon={FiInbox} title="Nothing yet" text="Tasks you can see will show up here." />}
          {ready &&
            recent.map((t, i) => (
              <Link key={t.id} to={`${TASKPRO_HOME}/tasks/${t.id}`} className="tp-feed-row" style={{ "--i": i }}>
                <Avatar name={t.assigned_to_name} size={28} />
                <span className="tp-feed-text">
                  <strong>{t.title}</strong>
                  <small>{taskWhoLine(viewer, t)}</small>
                </span>
                <StatusBadge status={t.status} />
                <em>{timeAgo(t.updated_at)}</em>
              </Link>
            ))}
        </section>
      </div>
    </>
  );
}

