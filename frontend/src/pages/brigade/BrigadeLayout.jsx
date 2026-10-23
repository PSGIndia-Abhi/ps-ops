import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../../assets/logo.png";
import useMe from "../../hooks/useMe";
import NotificationsMenu from "../../components/NotificationsMenu";
import UserMenu from "../../components/UserMenu";
import "./brigade.css";

// Brigade Executive panel. Same shell classes as AdminLayout; the backend
// limits every list here to Brigade Group.
// Same flat sidebar as the admin panel.
const NAV = [
  { path: "/brigade", label: "Dashboard", exact: true },
  { path: "/brigade/companies", label: "Companies" },
  { path: "/brigade/contacts", label: "Contacts" },
  { path: "/brigade/group-management", label: "Group Management" },
  { path: "/brigade/masters", label: "Prices & BHK" },
  { path: "/brigade/billing", label: "Billing" },
];

export default function BrigadeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      ? location.pathname === item.path || location.pathname.startsWith("/brigade/jobs")
      : location.pathname.startsWith(item.path);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button type="button" className="header-left header-left-btn" onClick={() => navigate("/brigade")}>
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Brigade Panel</span>
        </button>

        <div className="header-right">
          <NotificationsMenu />
          <UserMenu
            user={user}
            onLogout={logout}
            actions={[{ label: "Profile", onClick: () => navigate("/brigade/profile") }]}
          />
        </div>
      </header>

      <div className="app-body">
        {!isMobile && (
          <aside className="sidebar">
            <nav className="nav" aria-label="Brigade">
              {NAV.map((item) => (
                <button
                  key={item.path}
                  className={`nav-btn ${isActive(item) ? "active" : ""}`}
                  aria-current={isActive(item) ? "page" : undefined}
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        <main className="main-content">
          <Outlet context={{ setActionsConfig: () => {} }} />
        </main>
      </div>

      {isMobile && menuOpen && (
        <div className="mobile-panel mobile-panel-menu">
          {NAV.map((item) => (
            <button key={item.path} onClick={() => go(item.path)}>
              {item.label}
            </button>
          ))}
          <button onClick={logout}>Logout</button>
        </div>
      )}

      {isMobile && (
        <div className="mobile-tabbar">
          <button
            onClick={() => go("/brigade")}
            className={location.pathname === "/brigade" && !menuOpen ? "active" : ""}
          >
            Dashboard
          </button>
          <button
            onClick={() => go("/brigade/masters")}
            className={location.pathname.startsWith("/brigade/masters") && !menuOpen ? "active" : ""}
          >
            Prices &amp; BHK
          </button>
          <button onClick={() => setMenuOpen((open) => !open)} className={menuOpen ? "active" : ""}>
            Menu
          </button>
        </div>
      )}
    </div>
  );
}
