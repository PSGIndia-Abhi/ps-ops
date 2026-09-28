import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronDown,
  FiClipboard,
  FiClock,
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
import { USERS } from "./data";
import { LEVEL_LABEL, canCreateTasks, levelOf } from "./hierarchy";
import NewTaskModal from "./NewTaskModal";
import ToastProvider from "./ToastProvider";
import { countsFor, isOverdue } from "./selectors";
import useVisibleTasks from "./useVisibleTasks";
import ViewerProvider from "./ViewerProvider";
import { useViewer } from "./viewerContext";
import { dueInfo } from "./format";
import useNow from "./useNow";
import { Avatar } from "./ui";
import "./taskpro.css";

const NAV = [
  { label: "Dashboard", to: TASKPRO_HOME, icon: FiGrid, end: true },
  { label: "My Tasks", to: `${TASKPRO_HOME}/my-tasks`, icon: FiClipboard },
  { label: "Team Tasks", to: `${TASKPRO_HOME}/team-tasks`, icon: FiUsers, levels: ["top", "head"] },
  { label: "All Tasks", to: `${TASKPRO_HOME}/all-tasks`, icon: FiList, levels: ["top"] },
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
  const { tasks, ready } = useVisibleTasks();
  const now = useNow(60000);
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

  const counts = useMemo(() => countsFor(tasks, now, viewer.id), [tasks, now, viewer.id]);
  const nav = useMemo(() => NAV.filter((item) => !item.levels || item.levels.includes(viewer.level)), [viewer.level]);

  // Notifications = what needs attention: overdue, or due within a day.
  const alerts = useMemo(
    () =>
      tasks
        .filter((t) => isOverdue(t, now) || (t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.dueAt && t.dueAt - now < 24 * 3600 * 1000 && t.dueAt > now))
        .sort((a, b) => a.dueAt - b.dueAt)
        .slice(0, 6),
    [tasks, now],
  );

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
            {nav.map((item, i) =>
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

            <label className="tp-viewas" title="Sample data: pick a person to see the app the way they would">
              <span>Viewing as</span>
              <select
                value={viewer.id}
                onChange={(e) => {
                  viewer.setViewerId(e.target.value);
                  navigate(TASKPRO_HOME);
                }}
                aria-label="Viewing as"
              >
                {["top", "head", "employee"].map((lvl) => (
                  <optgroup key={lvl} label={LEVEL_LABEL[lvl]}>
                    {USERS.filter((u) => levelOf(u.id) === lvl).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.role}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {canCreateTasks(viewer.id) && (
              <button type="button" className="tp-btn primary tp-new" onClick={() => setNewTask(true)}>
                <FiPlus /> <span>New task</span>
              </button>
            )}

            <div className="tp-pop-root" ref={bellRef}>
              <button type="button" className="tp-icon-btn tp-bell" onClick={() => setBellOpen((o) => !o)} aria-label="Notifications">
                <FiBell />
                {alerts.length > 0 && <span className="tp-bell-badge">{alerts.length}</span>}
              </button>
              {bellOpen && (
                <div className="tp-popover tp-bell-pop">
                  <div className="tp-pop-head">Needs attention</div>
                  {alerts.length === 0 && <p className="tp-pop-empty">You're all caught up.</p>}
                  {alerts.map((t) => {
                    const due = dueInfo(t.dueAt, now);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="tp-pop-row"
                        onClick={() => {
                          setBellOpen(false);
                          navigate(`${TASKPRO_HOME}/tasks/${t.id}`);
                        }}
                      >
                        <FiClock className={`tp-tone-${due.tone}`} />
                        <span>
                          <strong>{t.title}</strong>
                          <small className={`tp-tone-${due.tone}`}>{due.text}</small>
                        </span>
                      </button>
                    );
                  })}
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
