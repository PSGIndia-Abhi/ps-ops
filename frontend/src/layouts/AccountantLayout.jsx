import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  FiActivity,
  FiAlertTriangle,
  FiBell,
  FiChevronDown,
  FiCheckSquare,
  FiChevronUp,
  FiClock,
  FiCreditCard,
  FiEdit2,
  FiFileText,
  FiGrid,
  FiList,
  FiMenu,
  FiSettings,
  FiUploadCloud,
  FiUsers,
} from "react-icons/fi";
import logo from "../assets/logo.png";
import useMe from "../hooks/useMe";
import NotificationsMenu from "../components/NotificationsMenu";
import UserMenu from "../components/UserMenu";
import "./AccountantLayout.css";
import "../pages/accountant/accountant.css";

// A tab with `children` is a collapsible group; otherwise it is a direct link.
const NAV_ITEMS = [
  { label: "Dashboard", path: "/accountant", icon: FiGrid, exact: true },
  {
    label: "Invoices",
    icon: FiFileText,
    children: [
      { label: "Invoice Upload", path: "/accountant/invoices/upload", icon: FiUploadCloud },
      { label: "Review & Validate", path: "/accountant/invoices/review", icon: FiCheckSquare },
      { label: "Invoice List", path: "/accountant/invoices/list", icon: FiFileText },
      // { label: "Payment Tracking", path: "/accountant/invoices/tracking", icon: FiActivity },
      { label: "Outstanding", path: "/accountant/invoices/outstanding", icon: FiAlertTriangle },
    ],
  },
  {
    label: "Payments",
    icon: FiCreditCard,
    children: [
      { label: "Record Payment", path: "/accountant/payments/record", icon: FiEdit2 },
      { label: "Payment List", path: "/accountant/payments/list", icon: FiList },
      // { label: "Payment Pending", path: "/accountant/payments/pending", icon: FiClock },
      // { label: "Customer Outstanding", path: "/accountant/payments/customer-outstanding", icon: FiUsers },
    ],
  },
  { label: "Tasks & Reminders", path: "/accountant/tasks", icon: FiBell },
  { label: "Settings", path: "/accountant/settings", icon: FiSettings },
];

export default function AccountantLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useMe();

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});

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

  const isPathActive = (item) =>
    item.exact
      ? location.pathname === item.path
      : location.pathname.startsWith(item.path);

  const groupHasActiveChild = (group) => group.children.some(isPathActive);

  // A group is open if the user toggled it, or (by default) if it holds the current page.
  const isGroupOpen = (group) =>
    openGroups[group.label] ?? groupHasActiveChild(group);

  function toggleGroup(group) {
    setOpenGroups((prev) => ({ ...prev, [group.label]: !isGroupOpen(group) }));
  }

  const nav = (
    <nav className="acc-nav">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;

        if (!item.children) {
          return (
            <button
              key={item.label}
              className={`acc-item ${isPathActive(item) ? "active" : ""}`}
              onClick={() => go(item.path)}
            >
              <Icon className="acc-icon" />
              <span className="acc-label">{item.label}</span>
            </button>
          );
        }

        const open = isGroupOpen(item);
        return (
          <div key={item.label}>
            <button
              className={`acc-parent ${groupHasActiveChild(item) ? "active" : ""}`}
              onClick={() => toggleGroup(item)}
              aria-expanded={open}
            >
              <Icon className="acc-icon" />
              <span className="acc-label">{item.label}</span>
              {open ? (
                <FiChevronUp className="acc-chevron" />
              ) : (
                <FiChevronDown className="acc-chevron" />
              )}
            </button>

            {open && (
              <div className="acc-children">
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  return (
                    <button
                      key={child.path}
                      className={`acc-child ${isPathActive(child) ? "active" : ""}`}
                      onClick={() => go(child.path)}
                    >
                      <ChildIcon className="acc-icon" />
                      <span className="acc-label">{child.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell acc-square">
      {/* HEADER */}
      <header className="app-header">
        <button
          type="button"
          className="header-left header-left-btn"
          onClick={() => navigate("/accountant")}
        >
          <img src={logo} alt="BestServe" className="logo" />
          <span className="header-title">Accountant Panel</span>
        </button>

        <div className="header-right">
          <NotificationsMenu />
          <UserMenu user={user} onLogout={logout} actions={[]} />
        </div>
      </header>

      {/* BODY */}
      <div className="app-body">
        {!isMobile && <aside className="sidebar acc-sidebar">{nav}</aside>}

        <main className="main-content">
          {/* The sidebar is hidden on phones, so offer the same menu above the page */}
          {isMobile && (
            <>
              <button
                type="button"
                className="acc-mobile-toggle"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <FiMenu /> Menu
              </button>
              {menuOpen && <div className="acc-mobile-panel">{nav}</div>}
            </>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
