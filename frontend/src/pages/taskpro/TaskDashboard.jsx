import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiCheckCircle, FiClock, FiInbox, FiPlayCircle, FiSun } from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { STATUS, userById } from "./data";
import { dueInfo, firstName, timeAgo } from "./format";
import { isActive, isOverdue } from "./selectors";
import useNow from "./useNow";
import useVisibleTasks from "./useVisibleTasks";
import { useViewer } from "./viewerContext";
import { Avatar, CountUp, EmptyState, PriorityDot, Skeleton, StatusBadge } from "./ui";

const DAY = 86400000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function greeting(now) {
  const h = new Date(now).getHours();
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
  const { tasks, ready } = useVisibleTasks();
  const now = useNow(60000);

  const stats = useMemo(() => {
    const active = tasks.filter(isActive);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * DAY;
    return {
      open: tasks.filter((t) => t.status === "OPEN").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      overdue: active.filter((t) => isOverdue(t, now)).length,
      doneWeek: tasks.filter((t) => t.status === "COMPLETED" && t.completedAt >= weekAgo).length,
      mine: active.filter((t) => t.assignedTo === viewer.id).length,
      total: tasks.length,
      startOfToday: startOfToday.getTime(),
    };
  }, [tasks, now, viewer.id]);

  const attention = useMemo(
    () =>
      tasks
        .filter((t) => isActive(t) && t.dueAt && (isOverdue(t, now) || t.dueAt - now < DAY * 1.5))
        .sort((a, b) => a.dueAt - b.dueAt)
        .slice(0, 5),
    [tasks, now],
  );

  const week = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const from = start.getTime() + i * DAY;
      const day = new Date(from);
      return {
        label: i === 0 ? "Today" : WEEKDAYS[day.getDay()],
        count: tasks.filter((t) => isActive(t) && t.dueAt >= from && t.dueAt < from + DAY).length,
      };
    });
  }, [tasks, now]);
  const weekMax = Math.max(1, ...week.map((d) => d.count));

  const segments = useMemo(
    () =>
      Object.entries(STATUS)
        .map(([key, s]) => ({ key, label: s.label, color: s.color, value: tasks.filter((t) => t.status === key).length }))
        .filter((s) => s.value > 0),
    [tasks],
  );

  const recent = useMemo(
    () =>
      tasks
        .flatMap((t) => t.activity.map((a) => ({ ...a, task: t })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 6),
    [tasks],
  );

  const name = firstName(viewer.name);
  const isEmployee = viewer.level === "employee";
  const kpis = [
    { key: "open", label: "Open", value: stats.open, icon: FiInbox, tone: "blue", to: viewer.level === "top" ? "all-tasks" : "my-tasks", hint: "Waiting to be started" },
    { key: "prog", label: "In progress", value: stats.inProgress, icon: FiPlayCircle, tone: "violet", to: isEmployee ? "my-tasks" : "team-tasks", hint: "Being worked on now" },
    { key: "late", label: "Overdue", value: stats.overdue, icon: FiAlertCircle, tone: "red", to: "overdue", hint: "Needs attention" },
    { key: "done", label: "Completed", value: stats.doneWeek, icon: FiCheckCircle, tone: "green", to: "completed", hint: "In the last 7 days" },
  ];

  return (
    <>
      <div className="tp-hero">
        <div>
          <span className="tp-hero-kicker">
            <FiSun /> {new Date(now).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1>
            {greeting(now)}, {name}
          </h1>
          <p>
            {ready ? (
              stats.mine > 0 ? (
                <>
                  You have <strong>{stats.mine} active {stats.mine === 1 ? "task" : "tasks"}</strong>
                  {stats.overdue > 0 && (
                    <>
                      , and <strong className="tp-tone-late">{stats.overdue} overdue</strong>
                      {isEmployee ? "" : " across your team"}
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
          <button
            key={k.key}
            type="button"
            className={`tp-kpi ${k.tone}`}
            style={{ "--i": i }}
            onClick={() => navigate(`${TASKPRO_HOME}/${k.to}`)}
          >
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
                const due = dueInfo(t.dueAt, now);
                return (
                  <Link key={t.id} to={`${TASKPRO_HOME}/tasks/${t.id}`} className="tp-att-row" style={{ "--i": i }}>
                    <PriorityDot priority={t.priority} />
                    <span className="tp-att-title">
                      <strong>{t.title}</strong>
                      <small>{userById(t.assignedTo)?.name}</small>
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
              <h3>Recent activity</h3>
            </div>
            {!ready && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={38} style={{ marginBottom: 10 }} />)}
            {ready &&
              recent.map((a, i) => (
                <Link key={a.id} to={`${TASKPRO_HOME}/tasks/${a.task.id}`} className="tp-feed-row" style={{ "--i": i }}>
                  <Avatar name={userById(a.task.assignedTo)?.name} size={28} />
                  <span className="tp-feed-text">
                    <strong>{a.title}</strong>
                    <small>{a.task.title}</small>
                  </span>
                  <em>{timeAgo(a.at, now)}</em>
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
