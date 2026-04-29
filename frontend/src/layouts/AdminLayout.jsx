import { Outlet, useNavigate, useLocation } from "react-router-dom";
import BookingSummary from "../components/BookingSummary";
import logo from "../assets/logo.png";
import useMe from "../hooks/useMe";
import { useState, useEffect } from "react";
import DashboardActions from "../components/DashboardActions";
import NotificationsMenu from "../components/NotificationsMenu";
import UserMenu from "../components/UserMenu";

export default function AdminLayout() {

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();
  const role = localStorage.getItem("role");

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
    navigate("/admin");
  }

  function openSummary() {
    setIsActionsOpen(false);
    setMobilePanel("summary");
  }

  function openMenu() {
    setIsActionsOpen(false);
    setMobilePanel("menu");
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  const isActive = (path) => location.pathname.startsWith(path);
  const isJobsActive = (location.pathname === "/admin" || location.pathname.startsWith("/admin/jobs"))
    && !isActionsOpen
    && mobilePanel === null;



  return (
    <div className="app-shell">

      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Admin Panel</span>
        </div>

        <div className="header-right">
          <NotificationsMenu />
          <UserMenu
            user={user}
            onLogout={logout}
            actions={[
              {
                label: "Profile",
                onClick: () => navigate("/admin/profile"),
              },
            ]}
          />
        </div>
      </header>

      {/* BODY */}
      <div className="app-body">

        {/* DESKTOP SIDEBAR */}
        {!isMobile && (
          <aside className="sidebar">
            <BookingSummary />

            <nav className="nav">
              <button
                className={`nav-btn ${isActive("/admin") ? "active" : ""}`}
                onClick={() => navigate("/admin")}
              >
                Dashboard
              </button>

              <button
                className={`nav-btn ${isActive("/admin/bookings") ? "active" : ""}`}
                onClick={() => navigate("/admin/bookings")}
              >
                Bookings
              </button>

              <button
                className={`nav-btn ${isActive("/admin/companies") ? "active" : ""}`}
                onClick={() => navigate("/admin/companies")}
              >
                Companies
              </button>

              <button
                className={`nav-btn ${isActive("/admin/contacts") ? "active" : ""}`}
                onClick={() => navigate("/admin/contacts")}
              >
                Contacts
              </button>

              {role?.trim() === "admin" && (
                <button
                  className={`nav-btn ${isActive("/admin/branches") ? "active" : ""}`}
                  onClick={() => navigate("/admin/branches")}
                >
                  Branches
                </button>)}

              <button
                className={`nav-btn ${isActive("/admin/team") ? "active" : ""}`}
                onClick={() => navigate("/admin/team")}
              >
                Team Management
              </button>

              <button
                className={`nav-btn ${isActive("/admin/map") ? "active" : ""}`}
                onClick={() => navigate("/admin/map")}
              >
                Map
              </button>

              <button
                className={`nav-btn ${isActive("/admin/tickets") ? "active" : ""}`}
                onClick={() => navigate("/admin/tickets")}
              >
                Tickets
              </button>


            </nav>
          </aside>
        )}

        {/* MAIN CONTENT — ALWAYS MOUNTED */}
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
              navigate("/admin/bookings");
            }}
          >
            Bookings
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/admin/companies");
            }}
          >
            Companies
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/admin/contacts");
            }}
          >
            Contacts
          </button>
          {role?.trim() === "admin" && (
            <button
              onClick={() => {
                setMobilePanel(null);
                navigate("/admin/branches");
              }}
            >
              Branches
            </button>
          )}
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/admin/team");
            }}
          >
            Team Management
          </button>
          <button
            onClick={() => {
              setMobilePanel(null);
              navigate("/admin/map");
            }}
          >
            Map
          </button>

          <button
            className={`nav-btn ${isActive("/admin/tickets") ? "active" : ""}`}
            onClick={() => navigate("/admin/tickets")}
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
