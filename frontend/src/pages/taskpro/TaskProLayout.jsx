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
  FiList,
  FiLogOut,
  FiMenu,
  FiPlus,
  FiSearch,
  FiUsers,
  FiAlertCircle,
  FiUser,
  FiRefreshCw,
} from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import NewTaskModal from "./NewTaskModal";
import ToastProvider from "./ToastProvider";
import { countsFor } from "./selectors";
import { refreshNotifications, useIncomingRequests, useNotifications, useTaskStore } from "./tasksApi";
import { MarkAllRead, NotificationRow } from "./Notifications";
import ViewerProvider from "./ViewerProvider";
import { useViewer } from "./viewerContext";
import { Avatar } from "./ui";
import "./taskpro.css";

const NAV = [
  { label: "Dashboard", to: TASKPRO_HOME, icon: FiGrid, end: true },
  { label: "My Tasks", to: `${TASKPRO_HOME}/my-tasks`, icon: FiClipboard },
  // Only for people who manage someone (or admin) — see showNavItem below.
  { label: "Team Tasks", to: `${TASKPRO_HOME}/team-tasks`, icon: FiUsers, needsTeam: true },
  { label: "All Tasks", to: `${TASKPRO_HOME}/all-tasks`, icon: FiList },
  { label: "Overdue", to: `${TASKPRO_HOME}/overdue`, icon: FiAlertCircle, badge: "overdue" },
  { label: "Upcoming", to: `${TASKPRO_HOME}/upcoming`, icon: FiCalendar },
  { label: "Completed", to: `${TASKPRO_HOME}/completed`, icon: FiCheckCircle },
  { label: "Requests", to: `${TASKPRO_HOME}/requests`, icon: FiRefreshCw, badge: "requests" },
  { divider: true },
  { label: "Reports", to: `${TASKPRO_HOME}/reports`, icon: FiBarChart2 },
  { divider: true },
  { label: "My Profile", to: `${TASKPRO_HOME}/profile`, icon: FiUser },
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

/** "New task" button + its panel. Kept separate so opening/closing the
 *  panel only re-renders this, not the whole shell behind it. */
function NewTaskButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="tp-btn primary tp-new" onClick={() => setOpen(true)}>
        <FiPlus /> <span>New task</span>
      </button>
      {open && <NewTaskModal onClose={() => setOpen(false)} onCreated={(task) => navigate(`${TASKPRO_HOME}/tasks/${task.id}`)} />}
    </>
  );
}

function TaskProShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewer = useViewer();
  const { tasks, ready } = useTaskStore();
  const isMobile = useIsMobile();

  // The content area is the scroller (see .tp-root / .tp-main in the CSS);
  // start each page at the top.
  const mainRef = useRef(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

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

  const { incoming: requests } = useIncomingRequests();
  const counts = useMemo(() => ({ ...countsFor(tasks, viewer.id), requests: requests.length }), [tasks, viewer.id, requests.length]);

  // Notifications: what other people did that concerns me (activity feed).
  // The bell previews the latest few and counts the unread ones; opening one
  // marks it read, "Mark all read" clears the count. The page has 30 days.
  const { items: events, unread, isUnread } = useNotifications();
  const BELL_ROWS = 8;
  function toggleBell() {
    if (!bellOpen) refreshNotifications();
    setBellOpen((o) => !o);
  }
  const openAll = () => {
    setBellOpen(false);
    navigate(`${TASKPRO_HOME}/notifications`);
  };

  function submitSearch(e) {
    e.preventDefault();
    const q = query.trim();
    // A task ID (as shown on the task page, e.g. 93751632) that matches
    // exactly one task opens it straight away.
    const idLike = q.replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f-]{6,36}$/.test(idLike)) {
      const hits = tasks.filter((t) => t.id.startsWith(idLike));
      if (hits.length === 1) {
        navigate(`${TASKPRO_HOME}/tasks/${hits[0].id}`);
        setQuery("");
        setDrawer(false);
        return;
      }
    }
    navigate(`${TASKPRO_HOME}/all-tasks${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setDrawer(false);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  // Team Tasks is pointless for someone nobody reports to. Hidden until the
  // team has loaded, so it never flashes up and disappears.
  const showNavItem = (item) => !item.needsTeam || (viewer.ready && (viewer.isAdmin || viewer.team.length > 0));

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
            {NAV.filter(showNavItem).map((item, i) =>
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

          <button type="button" className="tp-nav-item tp-exit" onClick={logout} title="Log out">
            <FiLogOut className="tp-nav-icon" />
            <span className="tp-nav-label">Log out</span>
          </button>
        </aside>

        <div className="tp-main" ref={mainRef}>
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
                placeholder="Search by title, person, department or task ID…"
                aria-label="Search tasks"
              />
              <kbd>/</kbd>
            </form>

            <NewTaskButton />

            <div className="tp-pop-root" ref={bellRef}>
              <button type="button" className="tp-icon-btn tp-bell" onClick={toggleBell} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
                <FiBell />
                {unread > 0 && <span className="tp-bell-badge">{unread > 9 ? "9+" : unread}</span>}
              </button>
              {bellOpen && (
                <div className="tp-popover tp-bell-pop">
                  <div className="tp-pop-head">
                    <span>Notifications</span>
                    {unread > 0 && <em>{unread} unread</em>}
                    <MarkAllRead unread={unread} />
                  </div>

                  {events.length === 0 && (
                    <div className="tp-pop-empty">
                      <span className="tp-pop-empty-icon">
                        <FiCheckCircle />
                      </span>
                      <strong>No notifications yet</strong>
                      <small>You'll hear here when someone assigns you a task, updates one you gave out, or comments.</small>
                    </div>
                  )}

                  {events.slice(0, BELL_ROWS).map((e) => (
                    <NotificationRow key={e.id} e={e} unread={isUnread(e)} compact onOpen={() => setBellOpen(false)} />
                  ))}

                  {events.length > 0 && (
                    <button type="button" className="tp-pop-footer" onClick={openAll}>
                      View all notifications <FiArrowRight />
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
                  <button
                    type="button"
                    className="tp-pop-row"
                    onClick={() => {
                      setUserOpen(false);
                      navigate(`${TASKPRO_HOME}/profile`);
                    }}
                  >
                    <FiUser />
                    <span>My profile</span>
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
