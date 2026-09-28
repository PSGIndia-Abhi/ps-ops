import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowRight,
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronDown,
  FiClipboard,
  FiGrid,
  FiLayers,
  FiList,
  FiLogOut,
  FiMenu,
  FiPlus,
  FiSearch,
  FiSettings,
  FiUsers,
  FiAlertCircle,
  FiArrowLeft,
} from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import NewTaskModal from "./NewTaskModal";
import ToastProvider from "./ToastProvider";
import { countsFor, isOverdue } from "./selectors";
import { useTaskStore } from "./tasksApi";
import ViewerProvider from "./ViewerProvider";
import { useViewer } from "./viewerContext";
import { dueInfo, fmtDateTime } from "./format";
import { Avatar } from "./ui";
import "./taskpro.css";

const NAV = [
  { label: "Dashboard", to: TASKPRO_HOME, icon: FiGrid, end: true },
  { label: "My Tasks", to: `${TASKPRO_HOME}/my-tasks`, icon: FiClipboard },
  { label: "Team Tasks", to: `${TASKPRO_HOME}/team-tasks`, icon: FiUsers },
  { label: "All Tasks", to: `${TASKPRO_HOME}/all-tasks`, icon: FiList },
  { label: "Overdue", to: `${TASKPRO_HOME}/overdue`, icon: FiAlertCircle, badge: "overdue" },
  { label: "Upcoming", to: `${TASKPRO_HOME}/upcoming`, icon: FiCalendar },
  { label: "Completed", to: `${TASKPRO_HOME}/completed`, icon: FiCheckCircle },
  { divider: true },
  { label: "Task Templates", to: `${TASKPRO_HOME}/templates`, icon: FiLayers },
  { label: "Reports", to: `${TASKPRO_HOME}/reports`, icon: FiBarChart2 },
  { divider: true },
  { label: "Settings", to: `${TASKPRO_HOME}/settings`, icon: FiSettings },
];

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}

function useIsMobile(breakpoint = 900) {
  const [mobile, setMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const on = () => setMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [breakpoint]);
  return mobile;
}

function TaskProShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewer = useViewer();
  const { tasks, ready } = useTaskStore();
  const isMobile = useIsMobile();

  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [newTask, setNewTask] = useState(false);

  const searchRef = useRef(null);
  const bellRef = useRef(null);
  const userRef = useRef(null);
  useOutsideClose(bellRef, () => setBellOpen(false));
  useOutsideClose(userRef, () => setUserOpen(false));

  // "/" jumps to search, like most task tools.
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => countsFor(tasks, viewer.id), [tasks, viewer.id]);

  // Notifications = what needs attention: overdue, or due within a day.
  // Grouped into two sections so the bell reads like a real notification
  // center rather than one flat list — overdue first, then due-soon, each
  // sorted soonest-first, each capped so the popover never runs away.
  const { overdueAlerts, dueSoonAlerts, alertCount } = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const cutoff = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const byDue = (a, b) => (a.due_date + (a.due_time || "")).localeCompare(b.due_date + (b.due_time || ""));
    const relevant = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.due_date && (isOverdue(t) || t.due_date <= cutoff));
    const overdue = relevant.filter((t) => isOverdue(t)).sort(byDue);
    const dueSoon = relevant.filter((t) => !isOverdue(t)).sort(byDue);
    return { overdueAlerts: overdue.slice(0, 5), dueSoonAlerts: dueSoon.slice(0, 5), alertCount: relevant.length };
  }, [tasks]);

  function submitSearch(e) {
    e.preventDefault();
    const q = query.trim();
    navigate(`${TASKPRO_HOME}/all-tasks${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setDrawer(false);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  const toggleMenu = () => (isMobile ? setDrawer((d) => !d) : setCollapsed((c) => !c));
  const name = viewer.name;

  return (
    <div className={`tp-root ${collapsed && !isMobile ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`}>
      <ToastProvider>
        {isMobile && <div className="tp-scrim" onClick={() => setDrawer(false)} />}

        <aside className="tp-sidebar">
          <div className="tp-brand">
            <span className="tp-brand-mark">
              <FiCheckSquare />
            </span>
            <span className="tp-brand-text">
              <strong>TaskPro</strong>
              <small>Task Management</small>
            </span>
          </div>

          <nav className="tp-nav">
            {NAV.map((item, i) =>
              item.divider ? (
                <hr key={`d${i}`} className="tp-nav-divider" />
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `tp-nav-item ${isActive ? "active" : ""}`}
                  onClick={() => setDrawer(false)}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="tp-nav-icon" />
                  <span className="tp-nav-label">{item.label}</span>
                  {item.badge && ready && counts[item.badge] > 0 && <span className="tp-nav-badge">{counts[item.badge]}</span>}
                </NavLink>
              ),
            )}
          </nav>

          <button type="button" className="tp-nav-item tp-exit" onClick={() => navigate("/")} title="Back to the main app">
            <FiArrowLeft className="tp-nav-icon" />
            <span className="tp-nav-label">Back to main app</span>
          </button>
        </aside>

        <div className="tp-main">
          <header className="tp-topbar">
            <button type="button" className="tp-icon-btn" onClick={toggleMenu} aria-label="Toggle menu">
              <FiMenu />
            </button>

            <form className="tp-search" onSubmit={submitSearch} role="search">
              <FiSearch />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, customers, invoices, job cards…"
                aria-label="Search tasks"
              />
              <kbd>/</kbd>
            </form>

            <button type="button" className="tp-btn primary tp-new" onClick={() => setNewTask(true)}>
              <FiPlus /> <span>New task</span>
            </button>

            <div className="tp-pop-root" ref={bellRef}>
              <button type="button" className="tp-icon-btn tp-bell" onClick={() => setBellOpen((o) => !o)} aria-label="Notifications">
                <FiBell />
                {alertCount > 0 && <span className="tp-bell-badge">{alertCount}</span>}
              </button>
              {bellOpen && (
                <div className="tp-popover tp-bell-pop">
                  <div className="tp-pop-head">
                    <span>Notifications</span>
                    {alertCount > 0 && <em>{alertCount}</em>}
                  </div>

                  {alertCount === 0 && (
                    <div className="tp-pop-empty">
                      <span className="tp-pop-empty-icon">
                        <FiCheckCircle />
                      </span>
                      <strong>You're all caught up</strong>
                      <small>Nothing overdue or due soon.</small>
                    </div>
                  )}

                  {[
                    { key: "overdue", label: "Overdue", rows: overdueAlerts, tone: "late" },
                    { key: "soon", label: "Due soon", rows: dueSoonAlerts, tone: "soon" },
                  ].map(
                    (group) =>
                      group.rows.length > 0 && (
                        <div key={group.key}>
                          <div className={`tp-pop-section tp-tone-${group.tone}`}>
                            {group.label} · {group.rows.length}
                          </div>
                          {group.rows.map((t) => {
                            const due = dueInfo(t.due_date, t.due_time, t.status);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                className="tp-notif-row"
                                onClick={() => {
                                  setBellOpen(false);
                                  navigate(`${TASKPRO_HOME}/tasks/${t.id}`);
                                }}
                              >
                                <Avatar name={t.assigned_to_name} size={32} />
                                <span className="tp-notif-text">
                                  <strong>{t.title}</strong>
                                  <small>{t.assigned_to_name}</small>
                                </span>
                                <span className="tp-notif-when">
                                  <strong className={`tp-tone-${due.tone}`}>{due.text}</strong>
                                  <small>{fmtDateTime(t.due_date, t.due_time)}</small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ),
                  )}

                  {alertCount > 0 && (
                    <button
                      type="button"
                      className="tp-pop-footer"
                      onClick={() => {
                        setBellOpen(false);
                        navigate(`${TASKPRO_HOME}/${overdueAlerts.length > 0 ? "overdue" : "upcoming"}`);
                      }}
                    >
                      {overdueAlerts.length > 0 ? "View all overdue tasks" : "View upcoming tasks"} <FiArrowRight />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="tp-pop-root" ref={userRef}>
              <button type="button" className="tp-user" onClick={() => setUserOpen((o) => !o)} aria-expanded={userOpen}>
                <Avatar name={name} size={36} />
                <span className="tp-user-text">
                  <strong>{name}</strong>
                  <small>{viewer.role}</small>
                </span>
                <FiChevronDown className={`tp-user-caret ${userOpen ? "open" : ""}`} />
              </button>
              {userOpen && (
                <div className="tp-popover tp-user-pop">
                  <button type="button" className="tp-pop-row" onClick={() => navigate("/")}>
                    <FiArrowLeft />
                    <span>Back to main app</span>
                  </button>
                  <button type="button" className="tp-pop-row danger" onClick={logout}>
                    <FiLogOut />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="tp-content">
            <div key={location.pathname} className="tp-page">
              <Outlet />
            </div>
          </main>
        </div>

        {newTask && (
          <NewTaskModal
            onClose={() => setNewTask(false)}
            onCreated={(task) => navigate(`${TASKPRO_HOME}/tasks/${task.id}`)}
          />
        )}
      </ToastProvider>
    </div>
  );
}

export default function TaskProLayout() {
  return (
    <ViewerProvider>
      <TaskProShell />
    </ViewerProvider>
  );
}
