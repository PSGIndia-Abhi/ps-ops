import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiCalendar, FiChevronRight, FiClock, FiFilter, FiRepeat, FiSearch, FiUserCheck, FiX } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { PRIORITY, STATUS } from "./data";
import PeopleFilters from "./Filters";
import { daysFromToday, dueInfo, fmtDateTime, todayStr } from "./format";
import { assignedByText, deptOf } from "./hierarchy";
import { FILTER_KEYS, LIST_MODES, applyPeopleFilters, availableScopes, isOverdue, readFilters, withParam } from "./selectors";
import { useTaskStore } from "./tasksApi";
import { useViewer } from "./viewerContext";
import { Avatar, EmptyState, PriorityBadge, Skeleton, StatusBadge } from "./ui";

const SORTS = {
  due: { label: "Due date", fn: (a, b) => (a.due_date || "9999") + (a.due_time || "") < (b.due_date || "9999") + (b.due_time || "") ? -1 : 1 },
  priority: { label: "Priority", fn: (a, b) => PRIORITY[b.priority].rank - PRIORITY[a.priority].rank },
  updated: { label: "Recently updated", fn: (a, b) => new Date(b.updated_at) - new Date(a.updated_at) },
};

// Which people filters each screen offers. My Tasks is already "mine", so
// only "assigned by" makes sense; Team Tasks is already scoped to the team.
const FILTERS_FOR = {
  my: ["creator"],
  team: ["dept", "assignee", "creator"],
};
const DEFAULT_FILTERS = ["scope", "dept", "assignee", "creator"];

// My Tasks opens on what is due today; these switch the time window.
const WHEN = {
  today: { label: "Today", empty: "Nothing due today", match: (t) => t.due_date === todayStr() },
  overdue: { label: "Overdue", empty: "Nothing overdue", match: (t) => isOverdue(t) },
  week: { label: "Next 7 days", empty: "Nothing due in the next 7 days", match: (t) => !!t.due_date && t.due_date >= todayStr() && t.due_date <= daysFromToday(6) },
  all: { label: "All", empty: null, match: () => true },
};

function TaskRow({ task, index, showAssignee, dept }) {
  const due = dueInfo(task.due_date, task.due_time, task.status);
  return (
    <Link to={`${TASKPRO_HOME}/tasks/${task.id}`} className="tp-task-row" style={{ "--i": Math.min(index, 12) }}>
      <span className="tp-row-stripe" style={{ background: PRIORITY[task.priority]?.color }} />
      <div className="tp-row-main">
        <div className="tp-row-top">
          <span className="tp-row-no">{task.task_type || "Task"}</span>
          <PriorityBadge priority={task.priority} />
        </div>
        <h4 className="tp-row-title">{task.title}</h4>
        <div className="tp-row-meta">
          <span className="tp-meta-item">
            <FiUserCheck /> {assignedByText(task)}
          </span>
          {task.source_module && (
            <span className="tp-meta-item">
              {task.source_module} · {task.source_id}
            </span>
          )}
          {task.series_id && (
            <span className="tp-meta-item">
              <FiRepeat /> Recurring
            </span>
          )}
        </div>
      </div>

      <div className="tp-row-due">
        <span className={`tp-due tp-tone-${due.tone}`}>
          <FiClock /> {due.text}
        </span>
        <small>
          <FiCalendar /> {fmtDateTime(task.due_date, task.due_time)}
        </small>
      </div>

      {showAssignee && (
        <div className="tp-row-who">
          <Avatar name={task.assigned_to_name} size={30} />
          <span className="tp-who-text">
            <strong>{task.assigned_to_name}</strong>
            <small>{dept || "No department"}</small>
          </span>
        </div>
      )}

      <StatusBadge status={task.status} live />
      <FiChevronRight className="tp-row-chevron" />
    </Link>
  );
}

export default function TaskList({ mode }) {
  const cfg = LIST_MODES[mode];
  const { tasks, ready } = useTaskStore();
  const viewer = useViewer();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") || "";
  const status = params.get("status") || "ALL";
  const priority = params.get("priority") || "ALL";
  const [sort, setSort] = useState("due");

  const shown = FILTERS_FOR[mode] || DEFAULT_FILTERS;
  const hasWhen = mode === "my";
  const when = hasWhen ? (WHEN[params.get("when")] ? params.get("when") : "today") : "all";
  const scopes = availableScopes(viewer);
  const filters = readFilters(params);
  // Only honour filters this screen actually offers (a stale ?assignee= on
  // My Tasks, say, must not silently hide rows with no visible control).
  const active = Object.fromEntries(FILTER_KEYS.map((k) => [k, shown.includes(k) ? filters[k] : ""]));
  if (active.scope && !scopes.includes(active.scope)) active.scope = "";

  const setParam = (key, value) => setParams(withParam(params, key, value), { replace: true });

  // pool: this screen's tasks within the chosen scope — what the dropdowns list.
  const pool = useMemo(
    () => applyPeopleFilters(tasks.filter((t) => cfg.match(t, viewer.id)), { scope: active.scope }, viewer),
    [tasks, cfg, viewer, active.scope],
  );
  const byPeople = useMemo(
    () => applyPeopleFilters(pool, { dept: active.dept, assignee: active.assignee, creator: active.creator }, viewer),
    [pool, active.dept, active.assignee, active.creator, viewer],
  );
  const base = useMemo(() => byPeople.filter(WHEN[when].match), [byPeople, when]);
  // Overdue work hidden by the "Today" window — surfaced so it isn't missed.
  const hiddenOverdue = when === "today" ? byPeople.filter(isOverdue).length : 0;

  const rows = useMemo(() => {
    // "#93751632" and "93751632" both find the task whose ID starts with it.
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    return base
      .filter((t) => status === "ALL" || t.status === status)
      .filter((t) => priority === "ALL" || t.priority === priority)
      .filter((t) => {
        if (!needle) return true;
        const hay = [t.id, t.title, t.description, t.task_type, t.source_module, t.source_id, t.assigned_to_name, t.created_by_name, deptOf(viewer, t.assigned_to)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .sort(SORTS[sort].fn);
  }, [base, q, status, priority, sort, viewer]);

  const statusChips = useMemo(() => {
    const present = new Set(base.map((t) => t.status));
    return ["ALL", ...Object.keys(STATUS).filter((s) => present.has(s) || s === status)];
  }, [base, status]);

  const peopleActive = shown.some((k) => active[k]);
  const filtersActive = status !== "ALL" || priority !== "ALL" || q || peopleActive;

  function clearPeople() {
    let next = params;
    for (const k of FILTER_KEYS) next = withParam(next, k, "");
    setParams(next, { replace: true });
  }

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>{cfg.title}</h1>
          <p>{cfg.subtitle}</p>
        </div>
        <div className="tp-head-right-row">
          {hasWhen && (
            <div className="tp-seg tp-when" role="tablist" aria-label="Time window">
              {Object.entries(WHEN).map(([k, w]) => (
                <button key={k} type="button" role="tab" aria-selected={when === k} className={when === k ? "on" : ""} onClick={() => setParam("when", k === "today" ? "" : k)}>
                  {w.label}
                </button>
              ))}
            </div>
          )}
          <span className="tp-count-pill">{ready ? `${rows.length} ${rows.length === 1 ? "task" : "tasks"}` : "—"}</span>
        </div>
      </div>

      {ready && hiddenOverdue > 0 && (
        <button type="button" className="tp-overdue-note" onClick={() => setParam("when", "overdue")}>
          <FiAlertCircle /> You also have <strong>{hiddenOverdue} overdue</strong> {hiddenOverdue === 1 ? "task" : "tasks"} not shown here.
          <span>
            Show overdue <FiArrowRight />
          </span>
        </button>
      )}

      <div className="tp-toolbar">
        <div className="tp-chips" role="tablist" aria-label="Filter by status">
          {statusChips.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              className={`tp-chip ${status === s ? "on" : ""}`}
              onClick={() => setParam("status", s === "ALL" ? "" : s)}
            >
              {s === "ALL" ? "All" : STATUS[s].label}
              <span>{s === "ALL" ? base.length : base.filter((t) => t.status === s).length}</span>
            </button>
          ))}
        </div>

        <div className="tp-toolbar-right">
          <label className={`tp-select ${priority !== "ALL" ? "on" : ""}`}>
            <FiFilter />
            <select value={priority} onChange={(e) => setParam("priority", e.target.value === "ALL" ? "" : e.target.value)} aria-label="Filter by priority">
              <option value="ALL">All priorities</option>
              {Object.entries(PRIORITY).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="tp-select">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort tasks">
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <PeopleFilters tasks={pool} values={active} onChange={setParam} onClear={clearPeople} show={shown} scopes={scopes} />

      {q && (
        <div className="tp-search-note">
          <FiSearch /> Results for <strong>“{q}”</strong>
          <button type="button" onClick={() => setParam("q", "")} aria-label="Clear search">
            <FiX />
          </button>
        </div>
      )}

      {!ready && (
        <div className="tp-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="tp-task-row skeleton" style={{ "--i": i }}>
              <Skeleton width={4} height={54} radius={4} />
              <div style={{ flex: 1, display: "grid", gap: 8 }}>
                <Skeleton width="30%" height={11} />
                <Skeleton width="62%" height={16} />
                <Skeleton width="40%" height={11} />
              </div>
              <Skeleton width={120} height={34} />
              <Skeleton width={84} height={26} radius={20} />
            </div>
          ))}
        </div>
      )}

      {ready && rows.length > 0 && (
        <div className="tp-list">
          {rows.map((t, i) => (
            <TaskRow key={t.id} task={t} index={i} showAssignee={cfg.showAssignee} dept={deptOf(viewer, t.assigned_to)} />
          ))}
        </div>
      )}

      {ready && rows.length === 0 && (
        <EmptyState
          icon={FiSearch}
          title={filtersActive ? "No tasks match your filters" : WHEN[when].empty || `Nothing in ${cfg.title.toLowerCase()}`}
          text={filtersActive ? "Try clearing a filter or searching for something else." : "You're all caught up here."}
        >
          {filtersActive && (
            <button type="button" className="tp-btn ghost" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </button>
          )}
          {!filtersActive && when !== "all" && (
            <button type="button" className="tp-btn ghost" onClick={() => setParam("when", "all")}>
              Show all my tasks
            </button>
          )}
        </EmptyState>
      )}
    </>
  );
}
