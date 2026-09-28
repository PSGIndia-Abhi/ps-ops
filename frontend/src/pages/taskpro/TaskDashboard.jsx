import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiCheckCircle, FiClock, FiInbox, FiPlayCircle, FiSun } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { STATUS } from "./data";
import { dueInfo, firstName, timeAgo } from "./format";
import { isActive, isOverdue } from "./selectors";
import { useTaskStore } from "./tasksApi";
import useNow from "./useNow";
import { useViewer } from "./viewerContext";
import { Avatar, CountUp, EmptyState, PriorityDot, Skeleton, StatusBadge } from "./ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Donut({ segments, total }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const arcs = segments.reduce((acc, s) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    const len = total ? (s.value / total) * C : 0;
    acc.push({ ...s, start, len, end: start + len });
    return acc;
  }, []);
  return (
    <div className="tp-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Tasks by status">
        <circle cx="70" cy="70" r={R} className="tp-donut-track" />
        {arcs.map((a, i) => (
          <circle
            key={a.key}
            cx="70"
            cy="70"
            r={R}
            className="tp-donut-seg"
            stroke={a.color}
            strokeDasharray={`${Math.max(0, a.len - 3)} ${C}`}
            strokeDashoffset={-a.start}
            style={{ "--i": i }}
          />
        ))}
      </svg>
      <div className="tp-donut-center">
        <strong>
          <CountUp value={total} />
        </strong>
        <span>tasks</span>
      </div>
    </div>
  );
}

export default function TaskDashboard() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { tasks, ready } = useTaskStore();
  const now = useNow(60000);

  const stats = useMemo(() => {
    const active = tasks.filter(isActive);
    const weekAgo = now - 7 * 86400000;
    return {
      open: tasks.filter((t) => t.status === "OPEN").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      overdue: active.filter((t) => isOverdue(t)).length,
      doneWeek: tasks.filter((t) => t.status === "COMPLETED" && t.completed_at && new Date(t.completed_at).getTime() > weekAgo).length,
      mine: active.filter((t) => t.assigned_to === viewer.id).length,
      total: tasks.length,
    };
  }, [tasks, viewer.id, now]);

  const attention = useMemo(
    () =>
      tasks
        .filter((t) => isActive(t) && t.due_date && (isOverdue(t) || t.due_date <= (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })()))
        .sort((a, b) => (a.due_date + (a.due_time || "")).localeCompare(b.due_date + (b.due_time || "")))
        .slice(0, 5),
    [tasks],
  );

  const week = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { label: i === 0 ? "Today" : WEEKDAYS[d.getDay()], count: tasks.filter((t) => isActive(t) && t.due_date === key).length };
    });
  }, [tasks]);
  const weekMax = Math.max(1, ...week.map((d) => d.count));

  const segments = useMemo(
    () =>
      Object.entries(STATUS)
        .map(([key, s]) => ({ key, label: s.label, color: s.color, value: tasks.filter((t) => t.status === key).length }))
        .filter((s) => s.value > 0),
    [tasks],
  );

  const recent = useMemo(() => [...tasks].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6), [tasks]);

  const name = firstName(viewer.name);
  const kpis = [
    { key: "open", label: "Open", value: stats.open, icon: FiInbox, tone: "blue", to: "all-tasks", hint: "Waiting to be started" },
    { key: "prog", label: "In progress", value: stats.inProgress, icon: FiPlayCircle, tone: "violet", to: "team-tasks", hint: "Being worked on now" },
    { key: "late", label: "Overdue", value: stats.overdue, icon: FiAlertCircle, tone: "red", to: "overdue", hint: "Needs attention" },
    { key: "done", label: "Completed", value: stats.doneWeek, icon: FiCheckCircle, tone: "green", to: "completed", hint: "In the last 7 days" },
  ];

  return (
    <>
      <div className="tp-hero">
        <div>
          <span className="tp-hero-kicker">
            <FiSun /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1>
            {greeting()}, {name}
          </h1>
          <p>
            {ready ? (
              stats.mine > 0 ? (
                <>
                  You have <strong>{stats.mine} active {stats.mine === 1 ? "task" : "tasks"}</strong>
                  {stats.overdue > 0 && (
                    <>
                      , and <strong className="tp-tone-late">{stats.overdue} overdue</strong> across what you can see
                    </>
                  )}
                  .
                </>
              ) : (
                "Nothing assigned to you right now."
              )
            ) : (
              <Skeleton width={260} height={14} />
            )}
          </p>
        </div>
        <Link to={`${TASKPRO_HOME}/my-tasks`} className="tp-btn primary">
          Go to my tasks <FiArrowRight />
        </Link>
      </div>

      <div className="tp-kpis">
        {kpis.map((k, i) => (
          <button key={k.key} type="button" className={`tp-kpi ${k.tone}`} style={{ "--i": i }} onClick={() => navigate(`${TASKPRO_HOME}/${k.to}`)}>
            <span className="tp-kpi-icon">
              <k.icon />
            </span>
            <span className="tp-kpi-num">{ready ? <CountUp value={k.value} /> : <Skeleton width={44} height={30} />}</span>
            <span className="tp-kpi-label">{k.label}</span>
            <small>{k.hint}</small>
          </button>
        ))}
      </div>

      <div className="tp-dash-grid">
        <div className="tp-dash-col">
          <section className="tp-card tp-attention">
            <div className="tp-card-head">
              <h3>Needs attention</h3>
              <Link to={`${TASKPRO_HOME}/overdue`}>
                View overdue <FiArrowRight />
              </Link>
            </div>
            {!ready && [0, 1, 2].map((i) => <Skeleton key={i} height={48} style={{ marginBottom: 10 }} />)}
            {ready && attention.length === 0 && <EmptyState icon={FiCheckCircle} title="All clear" text="Nothing is overdue or due soon." />}
            {ready &&
              attention.map((t, i) => {
                const due = dueInfo(t.due_date, t.due_time, t.status);
                return (
                  <Link key={t.id} to={`${TASKPRO_HOME}/tasks/${t.id}`} className="tp-att-row" style={{ "--i": i }}>
                    <PriorityDot priority={t.priority} />
                    <span className="tp-att-title">
                      <strong>{t.title}</strong>
                      <small>{t.assigned_to_name}</small>
                    </span>
                    <span className={`tp-due tp-tone-${due.tone}`}>
                      <FiClock /> {due.text}
                    </span>
                    <StatusBadge status={t.status} live />
                  </Link>
                );
              })}
          </section>

          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Recently updated</h3>
            </div>
            {!ready && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={38} style={{ marginBottom: 10 }} />)}
            {ready && recent.length === 0 && <EmptyState icon={FiInbox} title="Nothing yet" text="Tasks you can see will show up here." />}
            {ready &&
              recent.map((t, i) => (
                <Link key={t.id} to={`${TASKPRO_HOME}/tasks/${t.id}`} className="tp-feed-row" style={{ "--i": i }}>
                  <Avatar name={t.assigned_to_name} size={28} />
                  <span className="tp-feed-text">
                    <strong>{t.title}</strong>
                    <small>{t.assigned_to_name}</small>
                  </span>
                  <StatusBadge status={t.status} />
                  <em>{timeAgo(t.updated_at)}</em>
                </Link>
              ))}
          </section>
        </div>

        <div className="tp-dash-col">
          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Tasks by status</h3>
            </div>
            {!ready ? (
              <Skeleton height={150} radius={16} />
            ) : segments.length === 0 ? (
              <EmptyState icon={FiInbox} title="No tasks yet" />
            ) : (
              <div className="tp-status-card">
                <Donut segments={segments} total={stats.total} />
                <ul className="tp-legend">
                  {segments.map((s) => (
                    <li key={s.key}>
                      <span style={{ background: s.color }} />
                      {s.label}
                      <strong>{s.value}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Due this week</h3>
              <small>Active tasks by due day</small>
            </div>
            {!ready ? (
              <Skeleton height={150} radius={16} />
            ) : (
              <div className="tp-bars">
                {week.map((d, i) => (
                  <div key={i} className="tp-bar-col">
                    <span className="tp-bar-val">{d.count}</span>
                    <div className="tp-bar-track">
                      <span className={`tp-bar ${i === 0 ? "today" : ""}`} style={{ height: `${(d.count / weekMax) * 100}%`, "--i": i }} />
                    </div>
                    <span className="tp-bar-label">{d.label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
