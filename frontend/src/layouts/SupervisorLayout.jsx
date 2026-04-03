import { Outlet, useNavigate, useLocation } from "react-router-dom";
import BookingSummary from "../components/BookingSummary";
import logo from "../assets/logo.png";
import useMe from "../hooks/useMe";
import { useState, useEffect } from "react";
import DashboardActions from "../components/DashboardActions";

export default function SupervisorLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();

  const isActive = (path) => location.pathname.startsWith(path);

  /* ---------------- MOBILE DETECTION ---------------- */
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* ---------------- MOBILE PANELS ---------------- */
  const [mobilePanel, setMobilePanel] = useState(null);
  // null | "summary" | "menu"

  /* ---------------- ACTION SHEET ---------------- */
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [actionsConfig, setActionsConfig] = useState(null);
  const hasActions = Boolean(actionsConfig);

  const isJobsActive = (location.pathname === "/supervisor" || location.pathname.startsWith("/supervisor/jobs"))
    && !isActionsOpen
    && mobilePanel === null;

  function openActions() {
    setMobilePanel(null);
    setIsActionsOpen(true);
  }

  function closeActions() {
    setIsActionsOpen(false);
  }

  function goJobs() {
    setMobilePanel(null);
    setIsActionsOpen(false);
    navigate("/supervisor");
  }

  function openSummary() {
    setIsActionsOpen(false);
    setMobilePanel("summary");
  }

  function openMenu() {
    setIsActionsOpen(false);
    setMobilePanel("menu");
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  /* ----- lock scroll when sheet open ----- */
  useEffect(() => {
    if (isActionsOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isActionsOpen]);

  /* ----- close panels on route change ----- */
  useEffect(() => {
    setMobilePanel(null);
    setIsActionsOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">

      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Supervisor Panel</span>
        </div>

        <div className="header-right">
          {user && (
            <div className="user-box">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          )}
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {/* BODY */}
      <div className="app-body">

        {/* SIDEBAR */}
        {!isMobile && (
          <aside className="sidebar">
            <BookingSummary />

            <nav className="nav">
              <button
                className={`nav-btn ${isActive("/supervisor") ? "active" : ""}`}
                onClick={() => navigate("/supervisor")}
              >
                Dashboard
              </button>

              <button
                className={`nav-btn ${isActive("/supervisor/bookings") ? "active" : ""}`}
                onClick={() => navigate("/supervisor/bookings")}
              >
                Bookings
              </button>

              <button
                className={`nav-btn ${isActive("/supervisor/team") ? "active" : ""}`}
                onClick={() => navigate("/supervisor/team")}
              >
                Team Monitor
              </button>

              <button
                className={`nav-btn ${isActive("/supervisor/map") ? "active" : ""}`}
                onClick={() => navigate("/supervisor/map")}
              >
                Map View
              </button>

              <button
                className={`nav-btn ${isActive("/supervisor/tickets") ? "active" : ""}`}
                onClick={() => navigate("/supervisor/tickets")}
              >
                Tickets
              </button>
            </nav>
          </aside>
        )}

        {/* MAIN */}
        <main className="main-content">
          <Outlet context={{ setActionsConfig }} />
        </main>

      </div>

      {/* ---------- MOBILE PANELS ---------- */}

      {isMobile && mobilePanel === "summary" && (
        <div className="mobile-panel mobile-panel-summary">
          <BookingSummary />
        </div>
      )}

      {isMobile && mobilePanel === "menu" && (
        <div className="mobile-panel mobile-panel-menu">
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/supervisor/bookings");
            }}
          >
            Bookings
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/supervisor/team");
            }}
          >
            Team Monitor
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/supervisor/map");
            }}
          >
            Map View
          </button>
          
          
                        <button
                className={`nav-btn ${isActive("/supervisor/tickets") ? "active" : ""}`}
                onClick={() => navigate("/supervisor/tickets")}
              >
                Tickets
              </button>
          
          
          <button
            onClick={() => {
              setMobilePanel(null);
              logout();
            }}
          >
            Logout
          </button>
        </div>
      )}

      {/* ---------- ACTIONS BOTTOM SHEET ---------- */}
      {isMobile && hasActions && isActionsOpen && (
        <DashboardActions
          onClose={closeActions}
          onCreate={actionsConfig?.onCreate}
          onAssign={actionsConfig?.onAssign}
          disableAssign={actionsConfig?.disableAssign ?? true}
        />
      )}

      {/* ---------- MOBILE TAB BAR ---------- */}
      {isMobile && (
        <div className="mobile-tabbar">
          <button
            onClick={goJobs}
            className={isJobsActive ? "active" : ""}
          >
            Jobs
          </button>
          <button
            onClick={openActions}
            disabled={!hasActions}
            className={isActionsOpen ? "active" : ""}
          >
            Actions
          </button>
          <button
            onClick={openSummary}
            className={mobilePanel === "summary" ? "active" : ""}
          >
            Summary
          </button>
          <button
            onClick={openMenu}
            className={mobilePanel === "menu" ? "active" : ""}
          >
            Menu
          </button>
        </div>
      )}
    </div>
  );
}
