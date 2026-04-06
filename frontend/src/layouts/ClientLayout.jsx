import { Outlet, useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import { useState, useEffect } from "react";
import useMe from "../hooks/useMe";

export default function ClientLayout() {

  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);
  const isDashboardActive = location.pathname === "/client" || location.pathname === "/client/";

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { user: me } = useMe();

  const accountManager = me?.branch_admin || null;
  const accountManagerName = accountManager?.name || "Account Manager";
  const accountManagerEmail = accountManager?.email;
  const accountManagerPhone = accountManager?.phone;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  return (
    <div className="app-shell">

      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Client Portal</span>
        </div>

        <div className="header-right">
          <button className="logout-btn" onClick={() => navigate("/client/profile")}>Profile</button>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* BODY */}
      <div className="app-body">

        {/* SIDEBAR */}
        {!isMobile && (
<aside className="sidebar">

  <nav className="nav">
    <button
      className={`nav-btn ${isActive("/client") ? "active" : ""}`}
      onClick={() => navigate("/client")}
    >
      Dashboard
    </button>

    <button
      className={`nav-btn ${isActive("/client/jobs") ? "active" : ""}`}
      onClick={() => navigate("/client/jobs")}
    >
      My Jobs
    </button>

    <button
      className={`nav-btn ${isActive("/client/profile") ? "active" : ""}`}
      onClick={() => navigate("/client/profile")}
    >
      Profile
    </button>

    <button
      className={`nav-btn ${isActive("/client/tickets") ? "active" : ""}`}
      onClick={() => navigate("/client/tickets")}
    >
      Tickets
    </button>
  </nav>

  {/* SPOC BLOCK */}
  <div className="sidebar-spoc">
    <div className="spoc-avatar">AM</div>

    <div className="spoc-info">
      <h4>Account Manager</h4>
      <div className="name">{accountManagerName}</div>
      <div className={`role ${accountManager ? "assigned" : "unassigned"}`}>
        {accountManager ? "Assigned" : "Unassigned"}
      </div>
      {me?.branch?.name && (
        <div className="branch-name">{me.branch.name}</div>
      )}
      {accountManagerPhone && (
        <div className="spoc-contact">{accountManagerPhone}</div>
      )}
    </div>

    <div className="spoc-actions">
      <button
        onClick={() => accountManagerPhone && (window.location.href = `tel:${accountManagerPhone}`)}
        disabled={!accountManagerPhone}
      >
        Call
      </button>
      <button
        onClick={() => accountManagerEmail && (window.location.href = `mailto:${accountManagerEmail}`)}
        disabled={!accountManagerEmail}
      >
        Email
      </button>
    </div>
  </div>

</aside>

          
        )}

        

        {/* MAIN */}
        <main className="main-content">
          <Outlet />
        </main>

      </div>

      {/* MOBILE TAB BAR */}
      {isMobile && (
        <div className="mobile-tabbar">
          <button
            onClick={() => navigate("/client")}
            className={isDashboardActive ? "active" : ""}
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate("/client/jobs")}
            className={isActive("/client/jobs") ? "active" : ""}
          >
            Jobs
          </button>
          <button
            onClick={() => navigate("/client/profile")}
            className={isActive("/client/profile") ? "active" : ""}
          >
            Profile
          </button>
          <button
            onClick={() => navigate("/client/tickets")}
            className={isActive("/client/tickets") ? "active" : ""}
          >
            Tickets
          </button>
         
        </div>
      )}

    </div>
  );
}
