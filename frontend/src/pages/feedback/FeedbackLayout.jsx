import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import logo from "../../assets/logo.png";
import useMe from "../../hooks/useMe";
import UserMenu from "../../components/UserMenu";
import { FEEDBACK_HOME, feedbackBackLink } from "./access";
import { getBadges, getDepartments, getMyAccess } from "./feedbackApi";
import { FeedbackContext } from "./feedbackContext";
import { ErrorBox, Loading } from "./ui";
import "./feedback.css";

// Customer Feedback desk. Same shell classes as the admin panel; the sidebar shows only the
// screens the user's FEEDBACK_* permissions allow (from GET /api/feedback/me).
const DESK = ["FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN"];
// A department member (Operations / Accounts team, FEEDBACK_DEPT only) works their tickets only.
const WORKERS = ["FEEDBACK_COLLECT", ...DESK];
const NAV = [
  { path: FEEDBACK_HOME, label: "Dashboard", exact: true, match: [`${FEEDBACK_HOME}/calls`], needs: WORKERS },
  // FEEDBACK_ASSIGNED: a supervisor / salesperson with a ticket's next step assigned to them.
  { path: `${FEEDBACK_HOME}/tickets`, label: "Tickets", needs: [...WORKERS, "FEEDBACK_DEPT", "FEEDBACK_ASSIGNED"] },
  // Wrong numbers: collectors ask, service coordinators (and desk managers) add the right number.
  { path: `${FEEDBACK_HOME}/requests`, label: "Requests", needs: [...WORKERS, "FEEDBACK_ISSUES", "FEEDBACK_SCHEDULE"], badge: "open_requests" },
  { path: `${FEEDBACK_HOME}/report`, label: "Customer report", needs: DESK },
  { group: "MASTERS", needs: ["FEEDBACK_ADMIN", "FEEDBACK_ISSUES", "FEEDBACK_SCHEDULE"] },
  // Which customers / sites get calls, and how often: admin, service coordinators, operations managers.
  { path: `${FEEDBACK_HOME}/schedule`, label: "Call schedule", needs: ["FEEDBACK_ADMIN", "FEEDBACK_SCHEDULE"] },
  { path: `${FEEDBACK_HOME}/questions`, label: "Questions", needs: ["FEEDBACK_ADMIN"] },
  { path: `${FEEDBACK_HOME}/issues`, label: "Issues", needs: ["FEEDBACK_ADMIN", "FEEDBACK_ISSUES"] },
  { path: `${FEEDBACK_HOME}/settings`, label: "Templates & settings", needs: ["FEEDBACK_ADMIN"] },
];

export default function FeedbackLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();
  const role = localStorage.getItem("role");
  const back = feedbackBackLink(role);

  const [access, setAccess] = useState(null);
  const [departmentList, setDepartmentList] = useState([]);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(() => {
    getMyAccess()
      .then((a) => {
        setAccess(a);
        setError("");
      })
      .catch((err) => setError(err.status === 403 ? "Your account has no access to Customer Feedback. Ask an admin to give your role a FEEDBACK permission." : err.message));
  }, []);

  useEffect(load, [load]);
  const loadDepartments = useCallback(() => {
    getDepartments()
      .then((d) => setDepartmentList(d.departments || []))
      .catch(() => {});
  }, []);
  useEffect(loadDepartments, [loadDepartments]);
  // The numbers on the menu (Requests waiting), reloaded on each page and every minute.
  const [badges, setBadges] = useState({});
  const loadBadges = useCallback(() => {
    getBadges()
      .then(setBadges)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!access) return undefined;
    loadBadges();
    const timer = setInterval(loadBadges, 60000);
    return () => clearInterval(timer);
  }, [access, loadBadges, location.pathname]);

  // A department member opens straight on their tickets; a service coordinator (Issues only) on Issues.
  const deptOnly = Boolean(access) && !WORKERS.some((p) => (access.permissions || []).includes(p));
  const issuesOnly = deptOnly && !["FEEDBACK_DEPT", "FEEDBACK_ASSIGNED"].some((p) => (access.permissions || []).includes(p));
  useEffect(() => {
    if (deptOnly && location.pathname === FEEDBACK_HOME) navigate(`${FEEDBACK_HOME}/${issuesOnly ? "issues" : "tickets"}`, { replace: true });
  }, [deptOnly, issuesOnly, location.pathname, navigate]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const context = useMemo(() => {
    const permissions = access?.permissions || [];
    return {
      permissions,
      userId: access?.user_id ?? null,
      role: access?.role ?? role,
      can: (p) => permissions.includes(p),
      isDesk: DESK.some((p) => permissions.includes(p)),
      // departments: the keys of the departments this user works in (["ACCOUNTS"]); departmentList: every active one.
      departments: access?.departments || [],
      departmentList,
      reloadDepartments: loadDepartments,
      reloadBadges: loadBadges,
      deptOnly: !WORKERS.some((p) => permissions.includes(p)),
      // Where the ticket pages link to (Task Management shows them under its own path).
      ticketsBase: `${FEEDBACK_HOME}/tickets`,
    };
  }, [access, role, departmentList, loadDepartments, loadBadges]);

  const nav = NAV.filter((item) => !item.needs || item.needs.some((p) => context.permissions.includes(p)));

  function go(path) {
    setMenuOpen(false);
    navigate(path);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  const isActive = (item) =>
    item.exact
      ? location.pathname === item.path || (item.match || []).some((m) => location.pathname.startsWith(m))
      : location.pathname.startsWith(item.path);

  return (
    <div className="app-shell fb-shell">
      <header className="app-header">
        <button type="button" className="header-left header-left-btn" onClick={() => navigate(FEEDBACK_HOME)}>
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Feedback Desk</span>
        </button>

        <div className="header-right">
          <UserMenu user={user} onLogout={logout} actions={back ? [{ label: back.label, onClick: () => navigate(back.path) }] : []} />
        </div>
      </header>

      <div className="app-body">
        {!isMobile && (
          <aside className="sidebar">
            <nav className="nav" aria-label="Customer Feedback">
              {back && (
                <button type="button" className="fb-nav-back" onClick={() => navigate(back.path)}>
                  ‹ Back to {back.label}
                </button>
              )}
              {access &&
                nav.map((item) =>
                  item.group ? (
                    <div key={item.group} className="fb-nav-group">
                      {item.group}
                    </div>
                  ) : (
                    <button
                      key={item.path}
                      className={`nav-btn ${isActive(item) ? "active" : ""}`}
                      aria-current={isActive(item) ? "page" : undefined}
                      onClick={() => navigate(item.path)}
                    >
                      <span>{item.label}</span>
                      {item.badge && badges[item.badge] > 0 && <span className="fb-nav-count">{badges[item.badge]}</span>}
                    </button>
                  ),
                )}
            </nav>
          </aside>
        )}

        <main className="main-content fb-main">
          {error ? (
            <ErrorBox error={error} onRetry={load} />
          ) : !access ? (
            <Loading />
          ) : (
            <FeedbackContext.Provider value={context}>
              <Outlet />
            </FeedbackContext.Provider>
          )}
        </main>
      </div>

      {isMobile && menuOpen && (
        <div className="mobile-panel mobile-panel-menu">
          {nav
            .filter((item) => !item.group)
            .map((item) => (
              <button key={item.path} onClick={() => go(item.path)}>
                {item.label}
              </button>
            ))}
          {back && <button onClick={() => go(back.path)}>{back.label}</button>}
          <button onClick={logout}>Logout</button>
        </div>
      )}

      {isMobile && (
        <div className="mobile-tabbar three-col">
          {!deptOnly && (
            <button onClick={() => go(FEEDBACK_HOME)} className={isActive(NAV[0]) && !menuOpen ? "active" : ""}>
              Dashboard
            </button>
          )}
          <button onClick={() => go(`${FEEDBACK_HOME}/tickets`)} className={isActive(NAV[1]) && !menuOpen ? "active" : ""}>
            Tickets
          </button>
          <button onClick={() => setMenuOpen((open) => !open)} className={menuOpen ? "active" : ""}>
            Menu
          </button>
        </div>
      )}
    </div>
  );
}
