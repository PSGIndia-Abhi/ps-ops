import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiCalendar, FiChevronRight, FiClock, FiFilter, FiSearch, FiX } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { PRIORITY, STATUS } from "./data";
import { dueInfo, fmtDateTime } from "./format";
import { LIST_MODES } from "./selectors";
import { useTaskStore } from "./tasksApi";
import { useViewer } from "./viewerContext";
import { Avatar, EmptyState, PriorityBadge, Skeleton, StatusBadge } from "./ui";

const SORTS = {
  due: { label: "Due date", fn: (a, b) => (a.due_date || "9999") + (a.due_time || "") < (b.due_date || "9999") + (b.due_time || "") ? -1 : 1 },
  priority: { label: "Priority", fn: (a, b) => PRIORITY[b.priority].rank - PRIORITY[a.priority].rank },
  updated: { label: "Recently updated", fn: (a, b) => new Date(b.updated_at) - new Date(a.updated_at) },
};

function TaskRow({ task, index, showAssignee }) {
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
          {task.source_module && (
            <span>
              {task.source_module} · {task.source_id}
            </span>
          )}
          {task.series_id && <span>Recurring</span>}
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
          <Avatar name={task.assigned_to_name} size={28} />
          <span className="tp-who-text">
            <strong>{task.assigned_to_name}</strong>
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
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [sort, setSort] = useState("due");

  const base = useMemo(() => tasks.filter((t) => cfg.match(t, viewer.id)), [tasks, cfg, viewer.id]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base
      .filter((t) => status === "ALL" || t.status === status)
      .filter((t) => priority === "ALL" || t.priority === priority)
      .filter((t) => {
        if (!needle) return true;
        const hay = [t.title, t.description, t.task_type, t.source_module, t.source_id, t.assigned_to_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .sort(SORTS[sort].fn);
  }, [base, q, status, priority, sort]);

  const statusChips = useMemo(() => {
    const present = new Set(base.map((t) => t.status));
    return ["ALL", ...Object.keys(STATUS).filter((s) => present.has(s))];
  }, [base]);

  const filtersActive = status !== "ALL" || priority !== "ALL" || q;

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>{cfg.title}</h1>
          <p>{cfg.subtitle}</p>
        </div>
        <span className="tp-count-pill">{ready ? `${rows.length} ${rows.length === 1 ? "task" : "tasks"}` : "—"}</span>
      </div>

      <div className="tp-toolbar">
        <div className="tp-chips" role="tablist" aria-label="Filter by status">
          {statusChips.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={`tp-chip ${status === s ? "on" : ""}`} onClick={() => setStatus(s)}>
              {s === "ALL" ? "All" : STATUS[s].label}
              <span>{s === "ALL" ? base.length : base.filter((t) => t.status === s).length}</span>
            </button>
          ))}
        </div>

        <div className="tp-toolbar-right">
          <label className="tp-select">
            <FiFilter />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
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

      {q && (
        <div className="tp-search-note">
          <FiSearch /> Results for <strong>“{q}”</strong>
          <button type="button" onClick={() => setParams({})} aria-label="Clear search">
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
            <TaskRow key={t.id} task={t} index={i} showAssignee={cfg.showAssignee} />
          ))}
        </div>
      )}

      {ready && rows.length === 0 && (
        <EmptyState
          icon={FiSearch}
          title={filtersActive ? "No tasks match your filters" : `Nothing in ${cfg.title.toLowerCase()}`}
          text={filtersActive ? "Try clearing a filter or searching for something else." : "You're all caught up here."}
        >
          {filtersActive && (
            <button
              type="button"
              className="tp-btn ghost"
              onClick={() => {
                setStatus("ALL");
                setPriority("ALL");
                setParams({});
              }}
            >
              Clear filters
            </button>
          )}
        </EmptyState>
      )}
    </>
  );
}
