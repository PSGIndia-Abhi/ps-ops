import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import useMe from "../hooks/useMe";

export default function TechnicianLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();

  /* ---------------- MOBILE DETECTION ---------------- */
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isJobsActive = (location.pathname === "/technician" || location.pathname.startsWith("/technician/jobs"));

  function goJobs() {
    setTab("pending");
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  /* ----- close panels on route change ----- */
  const setTab = (tab) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", tab);
    navigate(`/technician?${params.toString()}`);
  };

  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Technician Panel</span>
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
        {!isMobile && (
          <aside className="sidebar">
            <nav className="nav">
              <button
                className={`nav-btn ${location.pathname.startsWith("/technician") ? "active" : ""}`}
                onClick={() => navigate("/technician")}
              >
                Jobs
              </button>
            </nav>
          </aside>
        )}

        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {/* ---------- MOBILE PANELS ---------- */}
      {/* ---------- MOBILE TAB BAR ---------- */}
      {isMobile && (
        <div className="mobile-tabbar two-col">
          <button
            onClick={goJobs}
            className={isJobsActive && (new URLSearchParams(location.search).get("tab") || "pending") === "pending" ? "active" : ""}
          >
            Pending Jobs
          </button>
          <button
            onClick={() => setTab("today")}
            className={new URLSearchParams(location.search).get("tab") === "today" ? "active" : ""}
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
