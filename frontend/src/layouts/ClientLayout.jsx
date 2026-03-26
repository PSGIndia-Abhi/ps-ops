import { Outlet, useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import { useState, useEffect } from "react";

export default function ClientLayout() {

  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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

            </nav>

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
          <button onClick={() => navigate("/client")}>Dashboard</button>
          <button onClick={() => navigate("/client/jobs")}>Jobs</button>
          <button onClick={logout}>Logout</button>
        </div>
      )}

    </div>
  );
}