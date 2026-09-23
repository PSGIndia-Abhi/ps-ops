import { Outlet, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import useMe from "../hooks/useMe";
import UserMenu from "../components/UserMenu";

// A minimal shell for the "staff" role — people placed in the org hierarchy
// (Marketing Executive, Accounts Head, Tech Lead, ...) who don't fit the
// existing admin/supervisor/technician/client panels. No jobs/shift/booking
// machinery here on purpose: just enough to log in and see where they sit.
export default function StaffLayout() {
  const navigate = useNavigate();
  const { user } = useMe();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">My Workspace</span>
        </div>
        <div className="header-right">
          <UserMenu user={user} onLogout={logout} actions={[]} />
        </div>
      </header>

      <div className="app-body">
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
